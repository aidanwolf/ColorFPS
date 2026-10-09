// Layered color shields: an enemy has a fixed BODY color under one or more hard-light shells, each in a
// color of its own. While any shell is up only the OUTERMOST one's color does anything: matching hits crack
// it (its hex tiles go dark and flicker as its hp drops), any other color ricochets ('immune') and the body
// can't be touched. Each shell shatters in a burst of its color (shards, a ring, a glassy break, a stagger
// of the enemy) and reveals the next one, then the bare body, which takes its own color as before. Shields
// don't come back (unless a spec opts in with `shieldRegen`, or the enemy is enraged: see rage.js).
//
// SPEC (every enemy built on drone.js, enemyKit.js, groundKit.js, and the spider bot):
//   { color: YELLOW, shields: [RED] }               a yellow body under a red shield
//   { color: RED, shields: [GREEN, YELLOW] }        green outer shell, then yellow, then the red body
//   shields are listed OUTERMOST FIRST (the order you shoot them in). Options: shieldHp (hits per layer,
//   default per enemy type: drones 2, scarabs 2, spiders 3, turrets 3), shieldRegen (s per hp a cracked
//   layer mends after 3 s untouched; default none).
// LEGACY PALETTES (the old color-cycling "shifters") convert automatically:
//   color: [body, ...shields]  the FIRST color is the body, the LAST color is the OUTERMOST shield
//   [YELLOW, RED]              a yellow body under a red shield
//   [RED, YELLOW, GREEN]       green outer shell, then yellow, then the red body
//   (a turret's `colors: [...]` reads the same way). No enemy changes color on a timer any more.
import * as THREE from 'three';
import { COLORS } from '../colors.js';
import { audio } from '../audio.js';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _c = new THREE.Color();
const noRay = () => {};

const BREAK_T = 0.38; // s the shatter animation runs
const GAP = 0.17; // each layer out is this much larger (fraction of the base size)
const SOUNDS = ['warden_shield_hit', 'warden_shield_break', 'shield_break', 'mummy_shield_break', 'glass_hit', 'shatter'];
audio.manifest?.then(() => audio.prefetch(SOUNDS));

// { body, shields: [outer, ..., inner] } from a spawn spec's color (a number or a legacy palette) and its
// optional explicit `shields` list.
export function parseShields(color, shields = null, fallback = 0) {
  if (Array.isArray(color)) {
    const list = color.length ? color : [fallback];
    return { body: list[0], shields: shields ? shields.slice() : list.slice(1).reverse() };
  }
  return { body: color ?? fallback, shields: shields ? shields.slice() : [] };
}

// the color that can hurt this enemy right now: its outermost shell's, else its body's (or, for the Mummy,
// its own raised hard-light shield's)
export const outerColor = (e) => (e.colorShield?.up ? e.colorShield.color : e.shieldUp === true && e.shieldColor != null ? e.shieldColor : e.color);

// ---------------------------------------------------------------- the shell: hex tiles of hard light
// A Goldberg ball of hexagonal (and twelve pentagonal) tiles, each a fan from its center (aEdge 0) to its
// rim (aEdge 1, where the bright outline is drawn), inset so dark seams run between them. aTile holds the
// tile's center direction and a random number (which tiles crack first, how fast each flies on a shatter).
// cut: keep only tiles above this height (a dome).
const shellGeos = new Map();
function shellGeometry(detail = 1, cut = -2) {
  const key = detail + ':' + cut;
  if (shellGeos.has(key)) return shellGeos.get(key);
  const ico = new THREE.IcosahedronGeometry(1, detail);
  const pos = ico.attributes.position;
  const verts = [], index = new Map(), adj = [];
  const id = (i) => {
    _v.fromBufferAttribute(pos, i).normalize();
    const k = `${Math.round(_v.x * 1e4)},${Math.round(_v.y * 1e4)},${Math.round(_v.z * 1e4)}`;
    if (!index.has(k)) {
      index.set(k, verts.length);
      verts.push(_v.clone());
      adj.push([]);
    }
    return index.get(k);
  };
  for (let f = 0; f < pos.count; f += 3) {
    const a = id(f), b = id(f + 1), c = id(f + 2);
    const centroid = new THREE.Vector3().add(verts[a]).add(verts[b]).add(verts[c]).normalize();
    adj[a].push(centroid);
    adj[b].push(centroid);
    adj[c].push(centroid);
  }
  ico.dispose();
  const P = [], E = [], T = [];
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const t1 = new THREE.Vector3(), t2 = new THREE.Vector3(), corner = new THREE.Vector3(), next = new THREE.Vector3();
  verts.forEach((c, i) => {
    if (c.y < cut) return;
    // sort the corners around the tile's center
    t1.set(Math.abs(c.y) < 0.9 ? 0 : 1, Math.abs(c.y) < 0.9 ? 1 : 0, 0).cross(c).normalize();
    t2.crossVectors(c, t1);
    const ring = adj[i].map((p) => ({ p, a: Math.atan2(p.dot(t2), p.dot(t1)) })).sort((x, y) => x.a - y.a);
    const r = rand();
    for (let j = 0; j < ring.length; j++) {
      corner.lerpVectors(c, ring[j].p, 0.88).normalize();
      next.lerpVectors(c, ring[(j + 1) % ring.length].p, 0.88).normalize();
      for (const [p, e] of [[c, 0], [corner, 1], [next, 1]]) {
        P.push(p.x, p.y, p.z);
        E.push(e);
        T.push(c.x, c.y, c.z, r);
      }
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(P, 3)); // (a unit ball: normal = position)
  g.setAttribute('aEdge', new THREE.Float32BufferAttribute(E, 1));
  g.setAttribute('aTile', new THREE.Float32BufferAttribute(T, 4));
  g.computeBoundingSphere();
  g.userData.shared = true;
  shellGeos.set(key, g);
  return g;
}

// One material for every shell in the game; each mesh's own state (color, cracks, flash, the last impact,
// the shatter) is copied into the uniforms just before it draws (onBeforeRender), so a hundred shielded
// enemies cost one program and no per-instance materials.
let shellMat = null;
function shellMaterial() {
  shellMat ??= new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uColor: { value: new THREE.Color() },
      uTime: { value: 0 },
      uCrack: { value: 0 },
      uFlash: { value: 0 },
      uDim: { value: 1 },
      uHit: { value: new THREE.Vector3(0, 0, 1) },
      uHitT: { value: 9 },
      uBreak: { value: 0 },
      uSpin: { value: 0 },
    },
    vertexShader: `
      attribute float aEdge;
      attribute vec4 aTile;
      uniform float uBreak;
      uniform float uTime;
      varying float vEdge;
      varying float vRand;
      varying vec3 vN;
      varying vec3 vView;
      varying vec3 vLocal;
      void main() {
        vec3 p = position;
        vec3 c = aTile.xyz;
        // shatter: every tile shrinks toward its center and flies out along it, faster ones first
        if (uBreak > 0.0) {
          float k = uBreak;
          p = c + (p - c) * (1.0 - k * 0.75);
          p += c * k * (0.5 + aTile.w * 1.6) + vec3(0.0, -k * k * 0.6, 0.0);
        }
        vEdge = aEdge;
        vRand = aTile.w;
        vLocal = position;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vN = normalize(normalMatrix * normal);
        vView = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uTime;
      uniform float uCrack;
      uniform float uFlash;
      uniform float uDim;
      uniform vec3 uHit;
      uniform float uHitT;
      uniform float uBreak;
      varying float vEdge;
      varying float vRand;
      varying vec3 vN;
      varying vec3 vView;
      varying vec3 vLocal;
      void main() {
        float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vView))), 2.0);
        float edge = smoothstep(0.74, 0.97, vEdge);
        // cracked tiles (the first uCrack of them) lose their fill and their outlines flicker hot; the
        // worst of them (the first half) are knocked right out, leaving holes
        float cracked = step(vRand, uCrack);
        float gone = step(vRand, uCrack * 0.45);
        float flick = 0.45 + 0.55 * step(0.0, sin(uTime * 27.0 + vRand * 60.0));
        float fill = (0.035 + rim * 0.3 + vEdge * vEdge * 0.06) * (1.0 - cracked * 0.9);
        float lines = edge * (0.42 + rim * 0.4) * (1.0 - cracked) + edge * cracked * flick * 0.9;
        // a ripple ring spreading from the last impact
        float d = distance(normalize(vLocal), uHit);
        float ripple = smoothstep(0.2, 0.0, abs(d - uHitT * 2.8)) * max(0.0, 1.0 - uHitT * 2.2);
        float scan = 0.5 + 0.5 * sin(vLocal.y * 9.0 - uTime * 3.0);
        float a = ((fill + lines + scan * 0.02) * uDim + ripple * 0.8 + uFlash * (0.2 + edge * 0.5)) * (1.0 - gone);
        vec3 col = uColor * (0.55 + rim * 0.8 + edge * 0.9 + cracked * edge * 0.5) + vec3(1.0) * (edge * cracked * flick * 0.3 + uFlash * 0.7 + ripple * 0.6);
        gl_FragColor = vec4(col, clamp(a, 0.0, 1.0) * (1.0 - uBreak));
      }`,
  });
  return shellMat;
}

let clock = 0; // the shells' shared animation clock (game time)
function beforeRender(renderer, scene, camera, geometry, material) {
  const s = this.userData.shell;
  const u = material.uniforms;
  u.uColor.value.copy(s.rgb);
  u.uTime.value = clock;
  u.uCrack.value = s.crack;
  u.uFlash.value = s.flash;
  u.uDim.value = s.dim;
  u.uHit.value.copy(s.hitDir);
  u.uHitT.value = s.hitT;
  u.uBreak.value = s.brk;
  material.uniformsNeedUpdate = true;
}

// ---------------------------------------------------------------- ColorShield
// owner: the enemy (needs world, and dist / pos for sound levels). It calls owner.onShieldHit?.(hit, layer)
// on a cracking hit and owner.onShieldBreak?.(color, hit, layersLeft) when a layer shatters.
// view: { parent (the Object3D the shells hang from: must be under the enemy's hit root so they catch shots),
//   center: [x, y, z] in parent space, size: number | [x, y, z] (the innermost shell's radii), dome (keep
//   only the top: the cut height, -1..1), detail (1: 42 tiles, 2: 162), spin (rad/s; alternate layers turn
//   the other way) }
export class ColorShield {
  constructor(owner, { shields = [], hp = 3, regen = 0 } = {}, view = {}) {
    this.owner = owner;
    this.colors = shields.slice();
    this.maxHp = Array.isArray(hp) ? hp : shields.map(() => hp);
    this.regen = regen;
    this.view = view;
    this.root = new THREE.Group();
    this.root.position.set(...(view.center || [0, 0, 0]));
    view.parent.add(this.root);
    this.size = new THREE.Vector3(...(typeof view.size === 'number' || view.size === undefined ? [view.size ?? 1, view.size ?? 1, view.size ?? 1] : view.size));
    this.geo = shellGeometry(view.detail ?? 1, view.dome ?? -2);
    this.layers = [];
    this.restore();
  }

  // (re)build every layer at full strength: a fresh spawn, or the fight resetting
  restore() {
    for (const L of this.layers) this.root.remove(L.mesh);
    const n = this.colors.length;
    this.layers = this.colors.map((color, i) => {
      const mesh = new THREE.Mesh(this.geo, shellMaterial());
      const k = 1 + GAP * (n - 1 - i); // outermost biggest
      mesh.scale.copy(this.size).multiplyScalar(k);
      mesh.renderOrder = 2 + n - i;
      mesh.userData.part = 'shield';
      mesh.onBeforeRender = beforeRender;
      const L = { color, hp: this.maxHp[i] ?? 3, max: this.maxHp[i] ?? 3, mesh, rgb: new THREE.Color(COLORS[color].hex), crack: 0, flash: 0, dim: i === 0 ? 1 : 0.45, hitDir: new THREE.Vector3(0, 0, 1), hitT: 9, brk: 0, breaking: -1, quiet: 0 };
      mesh.userData.shell = L;
      this.root.add(mesh);
      return L;
    });
    this.idx = 0;
  }

  // every layer standing, unscratched
  get intact() {
    return this.idx === 0 && this.layers.every((L) => L.hp >= L.max);
  }

  get up() {
    return this.idx < this.layers.length;
  }

  // the outermost standing layer's color (null once they're all down)
  get color() {
    return this.up ? this.layers[this.idx].color : null;
  }

  get left() {
    return this.layers.length - this.idx;
  }

  // A shot (or blast) of `color`: 'hit' if it cracked (or broke) the outer layer, 'immune' if it bounced.
  hit(color, hit) {
    const L = this.layers[this.idx];
    const p = hit?.point ?? this.root.getWorldPosition(_w);
    this.localHit(L, p);
    if (color !== L.color) {
      L.flash = Math.max(L.flash, 0.25);
      return 'immune';
    }
    L.hp--;
    L.quiet = 0;
    L.flash = 1;
    L.crack = 0.85 * (1 - Math.max(0, L.hp) / L.max);
    const fx = this.owner.world.fx;
    const hex = COLORS[L.color].hex;
    fx.burst(p, hex, { count: 12, speed: 5, life: 0.4, size: 0.2, gravity: 4, mode: 'shard' });
    fx.flash(p, hex, { size: 0.5, life: 0.1, k: 1.6, hot: 0.4 });
    if (L.hp <= 0) {
      this.shatter(L, hit);
      return 'hit';
    }
    const g = this.gain(0.75);
    // a glassy tick that climbs as it cracks
    if (!audio.sample('warden_shield_hit', { gain: g, rate: 1.1 + 0.35 * (1 - L.hp / L.max), vary: 0.06 })) audio.sample('glass_hit', { gain: g, rate: 1.2 });
    this.owner.onShieldHit?.(hit, L);
    return 'hit';
  }

  gain(k) {
    const d = this.owner.dist ?? 10;
    return k * THREE.MathUtils.clamp(1 - (d - 6) / 40, 0.35, 1);
  }

  // where on the shell it was hit, for the ripple (in the mesh's own unit-ball space)
  localHit(L, p) {
    L.mesh.updateWorldMatrix(true, false);
    L.hitDir.copy(L.mesh.worldToLocal(_v.copy(p)));
    if (L.hitDir.lengthSq() < 1e-6) L.hitDir.set(0, 0, 1);
    L.hitDir.normalize();
    L.hitT = 0;
  }

  // the layer bursts: tiles fly apart (in the shader), shards, a ring and a glassy break, and the enemy staggers
  shatter(L, hit) {
    L.breaking = 0;
    L.mesh.raycast = noRay; // no longer catches shots while it flies apart
    this.idx++;
    const next = this.layers[this.idx];
    if (next) next.dim = 1;
    const fx = this.owner.world.fx;
    const hex = COLORS[L.color].hex;
    const c = this.root.getWorldPosition(new THREE.Vector3());
    const r = Math.max(this.size.x, this.size.y, this.size.z) * (1 + GAP * (this.layers.length - this.idx));
    fx.flash(c, hex, { size: r * 1.6, life: 0.16, k: 2, hot: 0.5, end: 1.5 });
    fx.ring(c, null, hex, { size: r * 0.8, end: r * 3.2, life: 0.4, thick: 0.14, k: 1.8 });
    fx.ring(c, null, 0xffffff, { size: r * 0.6, end: r * 2.2, life: 0.25, thick: 0.08, k: 1.2 });
    // glassy slivers off the whole shell, flung out from the middle
    _c.set(hex);
    for (let j = 0, n = fx.budget(26 + r * 18); j < n; j++) {
      _v.randomDirection();
      _w.copy(c).addScaledVector(_v, r);
      const s = 3 + Math.random() * 5;
      const i = fx.shard(_w, _v.x * s, _v.y * s + 1.5, _v.z * s, _c, 1.4, 0.5 + Math.random() * 0.4, 0.05 + Math.random() * 0.07, 2.2);
      fx.grav[i] = 9;
      fx.drag[i] = 1.2;
    }
    if (hit?.point) fx.sparks(hit.point, _v.copy(hit.dir ?? _w.set(0, 0, 1)).negate(), hex, { count: 14, speed: 12, spread: 1, life: 0.4 });
    const g = this.gain(1);
    if (!audio.sample('warden_shield_break', { gain: 0.8 * g, rate: 1.05 + Math.random() * 0.1 })) audio.shieldBreak();
    audio.sample('shatter', { gain: 0.35 * g, rate: 1.5, vary: 0.1 });
    // stripped bare: a pulse in the body's color says what hurts it now
    if (!this.up) fx.ring(c, null, COLORS[this.owner.color].hex, { size: r * 0.5, end: r * 1.6, life: 0.35, thick: 0.1, k: 1.6 });
    this.owner.onShieldBreak?.(L.color, hit, this.left);
  }

  update(dt) {
    clock = this.owner.world.game.stats?.time ?? performance.now() / 1000;
    const spin = this.view.spin ?? 0.35;
    for (let i = 0; i < this.layers.length; i++) {
      const L = this.layers[i];
      if (i < this.idx && L.breaking < 0) continue;
      L.flash = Math.max(0, L.flash - dt * 5);
      L.hitT += dt;
      L.mesh.rotation.y += dt * spin * (i % 2 ? -1 : 1);
      if (L.breaking >= 0) {
        L.breaking += dt;
        L.brk = Math.min(1, L.breaking / BREAK_T);
        if (L.brk >= 1) {
          L.breaking = -1;
          this.root.remove(L.mesh);
        }
        continue;
      }
      // a hit makes the shell throb
      L.mesh.scale.copy(this.size).multiplyScalar((1 + GAP * (this.layers.length - 1 - i)) * (1 + L.flash * 0.04));
    }
    // mending: a cracked outer layer slowly regains hp after a few quiet seconds (opt-in, or enraged)
    const L = this.layers[this.idx];
    const regen = this.regen || (this.owner.rage?.on ? 2.5 : 0);
    if (L && regen > 0 && L.hp < L.max) {
      L.quiet += dt;
      if (L.quiet > (this.regen ? 3 : 1) + regen) {
        L.quiet -= regen;
        L.hp++;
        L.crack = 0.85 * (1 - L.hp / L.max);
        L.flash = 0.5;
      }
    }
  }

  dispose() {
    this.root.parent?.remove(this.root);
    this.layers = [];
  }
}
