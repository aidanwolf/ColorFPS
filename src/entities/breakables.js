// BREAKABLES: a light layer for dressing that reacts to every color of shot (the Atrium's research camp,
// hubOffices.js). The props stay merged into a handful of meshes; what makes one of them break is a per-vertex
// `bid` attribute (its id) and a small state texture every patched material reads in its vertex shader:
//   state 1 intact · 0.5 wrecked (charred, screens and LEDs dark) · 0 gone (its triangles collapse)
// and a negative bid marks geometry that only shows once its prop is broken (a scorch under a blown generator,
// a toppled tripod, the planks of a splintered crate, an ID badge where a skeleton was).
// Each breakable is registered with box proxies (solids carrying `entity`: World.raycast, every weapon and the
// glob blast find them like any other target; non-solid props get noCollide proxies), a type and hit points:
//   monitor   shatters (glass, sparks, a pop) and goes dark          equipment  pops and goes dark
//   rack      showers sparks and goes dark (sputters a while)         fridge     door bursts, vials pop
//   generator explodes (flash, fire, debris, scorch, a boom, a shove; it hurts only right next to it)
//   case      bursts open (a small blast, debris, scorch)             crate      splinters (planks, straw)
//   papers    burst into a flurry                                      tripod     topples
//   skeleton  bursts into bone fragments and dust (merc: the helmet clatters off)
// The water cannon shorts anything electric instead (sparks, a hiss, dead). A blast breaks fragile things near
// it but never sets off another blast. Breakables also carry blinking status LEDs (one instanced mesh, blink
// phases in the shader) and the beeps and hums of the kit, which stop when it's broken.
import * as THREE from 'three';
import { BLUE } from '../colors.js';
import { audio } from '../audio.js';
import { regionOf } from '../levels/regions.js';

const MAXB = 1024; // ids (the state texture's width)
const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _c = new THREE.Color();
const rnd = (a, b) => a + Math.random() * (b - a);

const SOUNDS = [
  'glass_hit', 'shatter', 'orb_pop', 'joint_sparks', 'energy_crackle', 'breaker_trip', 'lava_sizzle', 'drone_explode', 'mortar_blast', 'crab_explode',
  'crumble_crack', 'crumble_break', 'scarab_crunch', 'spike_hit', 'step_metal1', 'step_metal2', 'servo_stutter',
  'crab_beep', 'seal_chirp', 'core_chirp', 'timer_tick', 'combo_tick', 'servo_tick', 'robot_idle_click', 'radio_squelch', 'engine_hum', 'robot_idle_hum',
];
audio.manifest?.then(() => audio.prefetch(SOUNDS));

// what each type is: hit points, wired, blows up, a fragile thing a nearby blast breaks too
const TYPES = {
  monitor: { hp: 1, electric: true, fragile: true },
  equipment: { hp: 1, electric: true, fragile: true },
  rack: { hp: 3, electric: true },
  fridge: { hp: 2, electric: true },
  generator: { hp: 3, electric: true },
  case: { hp: 2, fragile: true },
  crate: { hp: 2, fragile: true },
  papers: { hp: 1, fragile: true },
  tripod: { hp: 1, electric: true, fragile: true },
  skeleton: { hp: 1, fragile: true },
  merc: { hp: 1, fragile: true },
};

// ---------------------------------------------------------------- the shared state texture
const STATE = new Uint8Array(MAXB).fill(255);
const TEX = new THREE.DataTexture(STATE, MAXB, 1, THREE.RedFormat, THREE.UnsignedByteType);
TEX.minFilter = TEX.magFilter = THREE.NearestFilter;
TEX.generateMipmaps = false;
TEX.needsUpdate = true;
const TIME = { value: 0 };

// Patch a mesh material so its geometry's `bid` attribute hides / chars it by the state texture.
// lit: a screen, lamp or glow (dark as soon as it's wrecked); otherwise wrecked props are charred.
export function patchBreakable(m, lit = false) {
  const lim = lit ? '0.75' : '0.25';
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uBreak = { value: TEX };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float bid;\nuniform highp sampler2D uBreak;')
      .replace(
        '#include <color_vertex>',
        `float bst = 1.0;
        if (abs(bid) > 0.5) bst = texelFetch(uBreak, ivec2(int(abs(bid) + 0.5), 0), 0).r;
        #include <color_vertex>
        ${lit ? '' : '#ifdef USE_COLOR\n if (bid > 0.5) vColor.rgb *= mix(0.16, 1.0, step(0.75, bst));\n#endif'}`,
      )
      .replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed *= bid < -0.5 ? step(bst, 0.75) : step(${lim}, bst);`);
  };
  m.customProgramCacheKey = () => 'breakable' + (lit ? 'L' : 'S');
  return m;
}

// ---------------------------------------------------------------- LEDs: tiny emissive boxes that blink in the shader
const ledVert = `
  attribute vec3 iCol; attribute vec4 iBlink;
  uniform float uTime; uniform highp sampler2D uBreak;
  varying vec3 vC;
  float hsh(float n){ return fract(sin(n * 12.9898) * 43758.5453); }
  void main(){
    float bst = 1.0;
    if (iBlink.w > 0.5) bst = texelFetch(uBreak, ivec2(int(iBlink.w + 0.5), 0), 0).r;
    float t = uTime * iBlink.y + iBlink.x;
    float on = iBlink.z > 1.5 ? step(0.4, hsh(floor(t))) : iBlink.z > 1.05 ? 0.5 + 0.5 * sin(t * 6.2832) : step(fract(t), iBlink.z);
    vC = iCol * (0.06 + on * 2.6);
    vec3 p = position * step(0.75, bst);
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
  }`;
const ledFrag = 'varying vec3 vC; void main(){ gl_FragColor = vec4(vC, 1.0); }';
// blink modes: [rate, duty] (duty 1 steady, 1.1 a slow breathe, 2 random flicker)
const LED_MODES = { on: [0.2, 1], blink: [1, 0.5], fast: [3.2, 0.4], slow: [0.45, 0.15], pulse: [0.6, 1.1], flicker: [9, 2], beat: [0.52, 0.08] };

export class Breakables {
  // opts: floorAt(x, z) (the floor under a point, for debris), paperMaterial + paperUV (the flurry's sheets),
  // zone (the region the kit lives in: nothing runs elsewhere)
  constructor(W, { floorAt, paperMaterial, paperUV, zone = 'hub' }) {
    this.W = W;
    this.floorAt = floorAt;
    this.zone = zone;
    this.list = [null]; // id 0 = "not breakable"
    STATE.fill(255);
    TEX.needsUpdate = true;
    this.leds = [];
    this.beeps = [];
    this.hums = [];
    this.wrecks = []; // sputtering / smoking ones
    this.t = 0;
    this.buildDebris();
    this.buildFlurry(paperMaterial, paperUV);
    W.add(this);
  }

  get tex() {
    return TEX;
  }

  // ---------------------------------------------------------------- registry
  // def: { type, boxes: [{ min, max }], solid, hp, papers: [[x, y, z, ry], ...] (for the flurry), merc }
  add(def) {
    const id = this.list.length;
    if (id >= MAXB) throw new Error('too many breakables');
    const T = TYPES[def.type];
    const min = new THREE.Vector3(Infinity, Infinity, Infinity), max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (const b of def.boxes) {
      min.min(b.min);
      max.max(b.max);
    }
    const b = { id, ...T, ...def, hp: def.hp ?? T.hp, state: 1, soak: 0, min, max, center: min.clone().add(max).multiplyScalar(0.5), size: max.clone().sub(min), solids: [] };
    const entity = {
      breakable: b,
      onHit: (color, hit) => this.hit(b, color, hit),
      onWater: (dt, hit) => this.water(b, dt, hit),
    };
    for (const bx of def.boxes) {
      const s = this.W.addSolid(bx.min.clone(), bx.max.clone(), { static: true, kind: 'metal', entity, noCollide: !def.solid, breakable: true });
      b.solids.push(s);
    }
    b.kids = [];
    if (def.parent && this.list[def.parent]) this.list[def.parent].kids.push(b);
    this.list.push(b);
    return id;
  }

  get(id) {
    return this.list[id];
  }

  // set a breakable's bounds after the fact (its one proxy box too): for props whose size is only known once
  // they're built (a posed skeleton)
  fit(id, min, max) {
    const b = this.list[id];
    if (!b) return;
    b.min.copy(min);
    b.max.copy(max);
    b.center.copy(min).add(max).multiplyScalar(0.5);
    b.size.copy(max).sub(min);
    if (b.solids[0]) {
      b.solids[0].min.copy(min);
      b.solids[0].max.copy(max);
    }
  }

  setState(b, s) {
    b.state = s;
    STATE[b.id] = Math.round(s * 255);
    TEX.needsUpdate = true;
  }

  // ---- what makes noise and blinks
  led(id, x, y, z, color, mode = 'on', size = 0.022) {
    const [rate, duty] = LED_MODES[mode] || LED_MODES.on;
    this.leds.push({ id, x, y, z, color, rate: rate * rnd(0.85, 1.15), duty, phase: Math.random() * 10, size });
  }
  beep(id, x, y, z, kind, gap = [2, 6]) {
    this.beeps.push({ id, p: new THREE.Vector3(x, y, z), kind, gap, next: rnd(0, gap[1]) });
  }
  hum(id, x, y, z, name, gain = 0.3, far = 22) {
    this.hums.push({ id, p: new THREE.Vector3(x, y, z), name, gain, far, loop: null });
  }

  buildLeds() {
    const n = this.leds.length;
    if (!n) return null;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.ShaderMaterial({ vertexShader: ledVert, fragmentShader: ledFrag, uniforms: { uTime: TIME, uBreak: { value: TEX } } });
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    const col = new Float32Array(n * 3), blink = new Float32Array(n * 4);
    this.leds.forEach((L, i) => {
      _m.compose(_v.set(L.x, L.y, L.z), _q.identity(), _s.setScalar(L.size));
      mesh.setMatrixAt(i, _m);
      _c.set(L.color);
      col.set([_c.r, _c.g, _c.b], i * 3);
      blink.set([L.phase, L.rate, L.duty, L.id], i * 4);
    });
    geo.setAttribute('iCol', new THREE.InstancedBufferAttribute(col, 3));
    geo.setAttribute('iBlink', new THREE.InstancedBufferAttribute(blink, 4));
    mesh.computeBoundingSphere();
    mesh.name = 'camp_leds';
    this.W.scene.add(mesh);
    return mesh;
  }

  // ---------------------------------------------------------------- hits
  hit(b, color, hit) {
    if (b.state === 0) return 'hit';
    const water = color === BLUE && hit?.kind === 'water';
    if (water && b.electric) {
      b.soak += 0.12;
      if (b.soak > 0.3 && b.state === 1) this.short(b, hit);
      else this.spit(b, hit, 0x9fdcff);
      return 'hit';
    }
    if (b.state === 0.5) {
      // a wreck: sparks, and a shorted generator can still go up
      if (b.type === 'generator' && !b.blown) this.explode(b, hit);
      else this.spit(b, hit);
      return 'hit';
    }
    b.hp -= hit?.kind === 'blast' ? 99 : 1;
    if (b.hp > 0) {
      this.spit(b, hit);
      return 'hit';
    }
    this.destroy(b, hit, color);
    return 'hit';
  }

  water(b, dt, hit) {
    if (!b.electric || b.state !== 1) return;
    b.soak += dt;
    if (b.soak > 0.3) this.short(b, hit);
  }

  // a hit that didn't break it: a few sparks or chips
  spit(b, hit, tint = null) {
    const p = hit?.point || b.center, n = hit?.normal || UP, fx = this.W.fx;
    if (b.electric) fx.sparks(p, n, tint ?? 0xffd9a0, { count: 6, speed: 6, spread: 0.9, life: 0.3 });
    else for (let i = 0; i < 4; i++) this.chunk(p, _v.copy(n).multiplyScalar(2).add(_a.randomDirection().multiplyScalar(1.5)), 0.04, b.type === 'crate' ? 0x9a7046 : 0xc9bfa4, 2);
  }

  destroy(b, hit, color) {
    const at = hit?.point || b.center;
    switch (b.type) {
      case 'monitor':
      case 'equipment':
        this.shatter(b, at, hit);
        break;
      case 'rack':
        this.sparkOut(b, at, hit);
        break;
      case 'fridge':
        this.shatter(b, at, hit, true);
        break;
      case 'generator':
        this.explode(b, hit);
        break;
      case 'case':
        this.pop(b, hit);
        break;
      case 'crate':
        this.splinter(b, hit);
        break;
      case 'papers':
        this.flurryBurst(b, at);
        break;
      case 'tripod':
        this.topple(b, at, hit);
        break;
      case 'skeleton':
      case 'merc':
        this.bones(b, hit);
        break;
    }
  }

  // switch its proxies off (shots and walking pass through)
  clear(b) {
    for (const s of b.solids) s.enabled = false;
    // whatever sat in it or on it goes too
    if (b.state === 0) for (const k of b.kids) if (k.state === 1) this.destroy(k, { point: k.center.clone(), normal: UP, kind: 'blast' });
  }

  near(p, far = 60) {
    return Math.max(0, 1 - audio.distTo(p) / far);
  }
  at(name, p, gain, o = {}) {
    audio.at(name, p, { gain, near: 3, far: 45, gap: 0.03, key: 'brk_' + name, ...o });
  }

  // ---------------------------------------------------------------- the effects
  shatter(b, p, hit, fridge = false) {
    const fx = this.W.fx, c = b.center, n = hit?.normal || UP;
    this.setState(b, 0.5);
    if (!b.solid) this.clear(b);
    // glass: slivers out of the face, glints, a hot flash and sparks inside
    for (let i = 0, k = fx.budget(fridge ? 40 : 26); i < k; i++) {
      _a.copy(n).multiplyScalar(rnd(1, 4)).add(_v.randomDirection().multiplyScalar(rnd(0.5, 2.5)));
      _a.y += rnd(0.5, 2.5);
      const j = fx.shard(p, _a.x, _a.y, _a.z, _c.set(0xbfe8ff), rnd(0.6, 1.1), rnd(0.6, 1.2), rnd(0.03, 0.08));
      fx.grav[j] = 12;
      fx.floor[j] = this.floorAt(p.x, p.z, p.y) + 0.01;
    }
    fx.flash(p, 0xcfe8ff, { size: 0.6, life: 0.12, k: 1.6, hot: 0.7 });
    fx.sparks(p, n, 0xffd9a0, { count: 18, speed: 7, spread: 1.4, life: 0.5, gravity: 9 });
    fx.puff(c, 0, 0.6, 0, _c.set(0x3a3e48), 0.35, 1.4, 0.25, 3);
    for (let i = 0; i < 6; i++) this.chunk(p, _a.copy(n).multiplyScalar(rnd(1, 3)).add(_v.randomDirection().multiplyScalar(1.5)), rnd(0.02, 0.05), 0x2a2e36, 3);
    if (fridge) {
      // the samples: four colors of vial bursting, a cold breath
      for (const hex of [0xff3b3b, 0xffd23a, 0x40ff70, 0x3a9bff]) fx.burst(c, hex, { count: 8, speed: 3, life: 0.6, size: 0.18, gravity: 6 });
      for (let i = 0; i < 4; i++) fx.puff(c, rnd(-0.6, 0.6), rnd(0, 0.6), rnd(-0.6, 0.6), _c.set(0xbfe6ff), 0.25, 1.8, 0.4, 3);
    }
    this.at('glass_hit', p, 0.9, { rate: rnd(1.1, 1.3) });
    this.at('shatter', p, 0.55, { rate: rnd(1.2, 1.45) });
    this.at('orb_pop', p, 0.4, { rate: 0.8 });
    this.sputter(b, 2.5, 0);
  }

  sparkOut(b, p, hit) {
    const fx = this.W.fx, n = hit?.normal || UP;
    this.setState(b, 0.5);
    fx.sparks(p, n, 0xffd9a0, { count: 40, speed: 11, spread: 1.6, life: 0.7, gravity: 9 });
    fx.sparks(p, UP, 0x9fdcff, { count: 16, speed: 6, spread: 2.2, life: 0.4 });
    fx.flash(p, 0xbfe0ff, { size: 1.0, life: 0.15, k: 1.7, hot: 0.8 });
    this.at('energy_crackle', p, 0.8);
    this.at('breaker_trip', p, 0.6, { rate: 0.9 });
    this.at('joint_sparks', p, 0.7);
    this.sputter(b, 5, 2);
  }

  // the water got in: a crackle, a hiss of steam, dead
  short(b, hit) {
    if (b.state !== 1) return;
    const fx = this.W.fx, p = hit?.point || b.center;
    this.setState(b, 0.5);
    b.shorted = true;
    if (!b.solid && b.type !== 'tripod') this.clear(b);
    fx.sparks(p, hit?.normal || UP, 0xbfe6ff, { count: 30, speed: 9, spread: 1.8, life: 0.5 });
    fx.flash(p, 0x9fdcff, { size: 0.9, life: 0.14, k: 1.8, hot: 0.8 });
    for (let i = 0; i < 5; i++) fx.puff(p, rnd(-0.4, 0.4), rnd(0.5, 1.3), rnd(-0.4, 0.4), _c.set(0xdfe8f0), 0.25, 1.6, 0.3, 3);
    this.at('energy_crackle', p, 0.8, { rate: 1.15 });
    this.at('lava_sizzle', p, 0.6, { rate: 1.3 });
    this.at('breaker_trip', p, 0.5, { rate: 1.1 });
    this.sputter(b, 3, b.type === 'generator' ? 6 : 1.5);
  }

  // a big one: a ball of fire, debris, a scorch, a boom and a shove (it only hurts right next to it); it breaks
  // fragile things close by but never sets off another blast
  explode(b, hit) {
    const fx = this.W.fx, W = this.W, c = b.center.clone();
    b.blown = true;
    this.setState(b, 0.5);
    fx.flash(c, 0xffe0b0, { size: 3.2, life: 0.22, k: 2, hot: 0.8 });
    fx.ring(c, null, 0xffb060, { size: 0.4, end: 5, life: 0.4, thick: 0.25, k: 1.8 });
    _v.set(c.x, this.floorAt(c.x, c.z, c.y) + 0.05, c.z);
    fx.ring(_v, UP, 0xff8a3a, { size: 0.4, end: 6, life: 0.5, thick: 0.2, k: 1.4 });
    fx.flash(_v, 0xff7a20, { size: 2.2, life: 2.5, n: UP, k: 0.5, hot: 0.1 });
    fx.burst(c, 0xffc070, { count: 60, speed: 9, life: 0.9, size: 0.5, gravity: 3 });
    fx.burst(c, 0xff6a20, { count: 40, speed: 4, life: 1.6, size: 0.6, gravity: -2.5, drag: 2.5 });
    fx.burst(c, 0xffffff, { count: 14, speed: 4, life: 0.3, size: 0.9, gravity: 0 });
    fx.sparks(c, UP, 0xffd9a0, { count: 40, speed: 16, spread: 2.6, life: 0.7, gravity: 9 });
    for (let i = 0; i < 8; i++) fx.puff(c, rnd(-1, 1), rnd(0.8, 2), rnd(-1, 1), _c.set(0x5a5048), 0.5, 2.6, 0.7, 3.2);
    for (let i = 0; i < 26; i++) {
      _a.set(rnd(-1, 1), rnd(0.4, 1.4), rnd(-1, 1)).normalize().multiplyScalar(rnd(4, 11));
      this.chunk(c, _a, rnd(0.05, 0.16), [0x2a2c30, 0x3a3e46, 0xd9a514, 0x1c1e22][i % 4], rnd(3, 6), true);
    }
    const g = this.near(c, 80);
    this.at('drone_explode', c, 1.0, { far: 80, rate: 0.8 });
    this.at('mortar_blast', c, 0.8, { far: 80 });
    this.at('crab_explode', c, 0.5, { far: 60, rate: 0.75 });
    // the player: a shove and a shake; harm only point-blank
    const pl = W.game.player;
    _v.copy(pl.pos).setY(pl.pos.y + 0.9);
    const d = _v.distanceTo(c);
    pl.shake = Math.max(pl.shake || 0, 0.5 * Math.max(0, 1 - d / 18));
    if (d < 5 && W.lineOfSight(c, _v)) {
      _a.subVectors(_v, c).setY(0).normalize();
      const k = 7 * (1 - d / 5);
      pl.vel.x += _a.x * k;
      pl.vel.z += _a.z * k;
      if (d < 1.7) pl.damage?.(1, 'blast');
    }
    // fragile things close by go too (no chains: nothing that explodes)
    for (const o of this.list) {
      if (!o || o === b || o.state !== 1 || !o.fragile) continue;
      if (o.center.distanceTo(c) < 2.6) this.destroy(o, { point: o.center.clone(), normal: _a.subVectors(o.center, c).normalize().clone(), dir: _a.clone(), kind: 'blast' });
    }
    this.sputter(b, 0, 8);
    void g;
  }

  // a flight case bursting open: a small blast and its insides
  pop(b, hit) {
    const fx = this.W.fx, c = b.center;
    this.setState(b, 0);
    this.clear(b);
    fx.flash(c, 0xffe0b0, { size: 1.4, life: 0.16, k: 1.8, hot: 0.7 });
    fx.ring(c, null, 0xffb070, { size: 0.3, end: 2.4, life: 0.3, thick: 0.15, k: 1.5 });
    fx.burst(c, 0xffc070, { count: 26, speed: 6, life: 0.6, size: 0.35, gravity: 4 });
    fx.sparks(c, UP, 0xffd9a0, { count: 18, speed: 10, spread: 2, life: 0.5 });
    for (let i = 0; i < 4; i++) fx.puff(c, rnd(-0.6, 0.6), rnd(0.5, 1.2), rnd(-0.6, 0.6), _c.set(0x4a4642), 0.4, 1.8, 0.4, 3);
    for (let i = 0; i < 14; i++) {
      _a.set(rnd(-1, 1), rnd(0.5, 1.4), rnd(-1, 1)).normalize().multiplyScalar(rnd(3, 7));
      this.chunk(c, _a, rnd(0.04, 0.12), [0x1c1e22, 0x9aa2ac, 0x2a2e36, 0xd8dde3][i % 4], rnd(3, 5), true);
    }
    this.at('crab_explode', c, 0.8, { rate: 1.1 });
    this.at('joint_sparks', c, 0.5);
    this.shove(c, 3, 3.5);
  }

  splinter(b, hit) {
    const fx = this.W.fx, c = b.center, s = b.size;
    const dir = hit?.dir || _v.set(0, 0, 0);
    this.setState(b, 0);
    this.clear(b);
    const n = Math.min(46, 16 + Math.round(s.x * s.y * s.z * 14));
    for (let i = 0; i < n; i++) {
      const p = _v.set(b.min.x + Math.random() * s.x, b.min.y + Math.random() * s.y, b.min.z + Math.random() * s.z).clone();
      _a.subVectors(p, c).setY(0).normalize().multiplyScalar(rnd(1.5, 4)).addScaledVector(dir, rnd(1, 3));
      _a.y = rnd(1, 4.5);
      const long = rnd(0.25, 0.6);
      this.chunk(p, _a, [long, 0.025, 0.07], i % 5 === 0 ? 0x6e5032 : 0x9a7046, rnd(5, 9));
    }
    // packing straw and foam
    for (let i = 0; i < 14; i++) this.chunk(c, _a.set(rnd(-2, 2), rnd(1, 3), rnd(-2, 2)), [rnd(0.08, 0.18), 0.008, 0.012], i % 3 ? 0xd9c27a : 0x30333a, rnd(4, 8));
    for (let i = 0; i < 5; i++) fx.puff(c, rnd(-0.8, 0.8), rnd(0.3, 0.9), rnd(-0.8, 0.8), _c.set(0x9a8a70), 0.25, 1.6, 0.45, 3);
    fx.burst(c, 0xd9c27a, { count: 16, speed: 4, life: 0.8, size: 0.12, gravity: 7 });
    this.at('crumble_crack', c, 0.9, { rate: rnd(1.15, 1.35) });
    this.at('scarab_crunch', c, 0.6, { rate: 0.75 });
  }

  topple(b, p, hit) {
    const fx = this.W.fx;
    this.setState(b, 0);
    this.clear(b);
    fx.sparks(b.center.clone().setY(b.max.y - 0.2), UP, 0xffd9a0, { count: 16, speed: 6, spread: 1.6, life: 0.45 });
    fx.flash(p, 0xbfe0ff, { size: 0.5, life: 0.1, k: 1.5, hot: 0.7 });
    for (let i = 0; i < 4; i++) this.chunk(p, _a.set(rnd(-2, 2), rnd(1, 3), rnd(-2, 2)), rnd(0.03, 0.06), 0x1c1e22, 3);
    this.at('step_metal1', b.center, 0.9, { rate: 0.75 });
    this.at('step_metal2', b.center, 0.7, { rate: 0.6, delay: 0.18 });
    this.at('servo_stutter', b.center, 0.4, { rate: 1.2 });
  }

  // a skeleton: a cloud of bone chips and dust, a dry crunch; the merc's helmet clatters off
  bones(b, hit) {
    const fx = this.W.fx, c = b.center, s = b.size;
    const dir = hit?.dir || _v.set(0, 0, 0);
    this.setState(b, 0);
    this.clear(b);
    for (let i = 0; i < 44; i++) {
      const p = _v.set(b.min.x + Math.random() * s.x, b.min.y + Math.random() * s.y, b.min.z + Math.random() * s.z).clone();
      _a.subVectors(p, c).normalize().multiplyScalar(rnd(1, 3.5)).addScaledVector(dir, rnd(0.5, 2.5));
      _a.y += rnd(0.5, 3);
      const big = i < 10;
      this.chunk(p, _a, big ? [rnd(0.08, 0.2), rnd(0.025, 0.04), rnd(0.025, 0.04)] : rnd(0.02, 0.05), i % 4 ? 0xd8cfb4 : 0xa99e84, rnd(5, 9));
    }
    // the lab coat in rags
    for (let i = 0; i < 8; i++) this.chunk(c, _a.set(rnd(-2, 2), rnd(1, 3), rnd(-2, 2)), [rnd(0.12, 0.25), 0.01, rnd(0.08, 0.18)], b.type === 'merc' ? 0x1e2024 : 0xb4b9bd, rnd(4, 8));
    for (let i = 0; i < 9; i++) {
      _a.set(b.min.x + Math.random() * s.x, b.min.y + Math.random() * s.y, b.min.z + Math.random() * s.z);
      fx.puff(_a, rnd(-0.6, 0.6), rnd(0.2, 0.9), rnd(-0.6, 0.6), _c.set(0xb8ae98), 0.32, rnd(1.6, 2.6), rnd(0.3, 0.55), 3);
    }
    fx.burst(c, 0xe8e0c8, { count: 24, speed: 3, life: 0.9, size: 0.12, gravity: 5, intensity: 0.6 });
    this.at('scarab_crunch', c, 0.9, { rate: rnd(1.1, 1.3) });
    this.at('crumble_crack', c, 0.7, { rate: rnd(1.5, 1.8) });
    this.at('crumble_break', c, 0.35, { rate: 1.6, delay: 0.12 });
    if (b.type === 'merc' && b.helmet) {
      const h = b.helmet;
      _a.set(rnd(-1.5, 1.5), rnd(3, 4.5), rnd(-1.5, 1.5)).addScaledVector(dir, 2);
      this.chunk(h, _a, [0.26, 0.16, 0.28], 0x16181c, 10, false, true);
      this.at('spike_hit', h, 0.8, { rate: 0.7 });
      this.at('step_metal2', h, 0.8, { rate: 1.4, delay: 0.45 });
      this.at('step_metal1', h, 0.6, { rate: 1.6, delay: 0.7 });
    }
  }

  // papers: the sheets lift off in a flurry (the flurry pool) and drift back down
  flurryBurst(b, p) {
    this.setState(b, 0);
    this.clear(b);
    const list = b.papers || [];
    const n = Math.min(16, Math.max(6, list.length));
    for (let i = 0; i < n; i++) {
      const src = list[i % Math.max(1, list.length)] || [p.x, p.y, p.z, 0];
      _v.set(src[0], src[1] + 0.02, src[2]);
      _a.subVectors(_v, p).setY(0);
      const l = _a.length() || 1;
      _a.multiplyScalar(rnd(0.6, 1.8) / l);
      _a.y = rnd(2.5, 5.5);
      this.sheet(_v, _a);
    }
    if (audio.ctx) audio.noise({ dur: 0.45, gain: 0.18 * this.near(p, 35), freq: 3800, q: 0.5, type: 'highpass' });
    this.W.fx.puff(p, 0, 0.4, 0, _c.set(0x8a8478), 0.2, 1.2, 0.4, 3);
  }

  // a wreck keeps sparking (and smoking) for a while
  sputter(b, sparks, smoke) {
    b.sparkT = sparks;
    b.smokeT = smoke;
    if (!this.wrecks.includes(b)) this.wrecks.push(b);
  }

  // a little shove for the player near a small blast
  shove(c, reach, push) {
    const pl = this.W.game.player;
    _v.copy(pl.pos).setY(pl.pos.y + 0.9);
    const d = _v.distanceTo(c);
    if (d > reach) return;
    _a.subVectors(_v, c).setY(0).normalize();
    pl.vel.x += _a.x * push * (1 - d / reach);
    pl.vel.z += _a.z * push * (1 - d / reach);
    pl.shake = Math.max(pl.shake || 0, 0.2);
  }

  // ---------------------------------------------------------------- debris: lit chunks that bounce, settle, shrink away
  buildDebris() {
    const N = (this.DN = 260);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.1 });
    const mesh = (this.debris = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, N));
    mesh.frustumCulled = false;
    mesh.userData.noCull = true;
    mesh.visible = false;
    mesh.name = 'camp_debris';
    for (let i = 0; i < N; i++) {
      mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
      mesh.setColorAt(i, _c.set(0xffffff));
    }
    this.chunks = Array.from({ length: N }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), s: new THREE.Vector3(), rest: false, max: 1 }));
    this.dCursor = 0;
    this.dLive = 0;
    this.W.scene.add(mesh);
  }

  chunk(p, v, size, color, life = 4, hot = false, heavy = false) {
    const i = this.dCursor;
    this.dCursor = (i + 1) % this.DN;
    const c = this.chunks[i];
    if (c.life <= 0) this.dLive++;
    c.p.copy(p);
    c.v.copy(v);
    c.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    c.w.set(rnd(-12, 12), rnd(-12, 12), rnd(-12, 12)).multiplyScalar(heavy ? 0.4 : 1);
    if (Array.isArray(size)) c.s.set(size[0], size[1], size[2]);
    else c.s.set(size, size * rnd(0.6, 1.2), size * rnd(0.6, 1.2));
    c.life = c.max = life;
    c.rest = false;
    c.hot = hot ? 1 : 0;
    c.heavy = heavy;
    this.debris.setColorAt(i, _c.set(color));
    this.debris.instanceColor.needsUpdate = true;
    this.debris.visible = true;
  }

  updateDebris(dt) {
    if (!this.dLive) return;
    const W = this.W, mesh = this.debris, fx = W.fx;
    let live = 0;
    for (let i = 0; i < this.DN; i++) {
      const c = this.chunks[i];
      if (c.life <= 0) continue;
      c.life -= dt;
      if (c.life <= 0) {
        mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
        continue;
      }
      live++;
      if (!c.rest) {
        c.v.y -= 16 * dt;
        c.v.multiplyScalar(Math.exp(-0.4 * dt));
        const oy = c.p.y;
        c.p.addScaledVector(c.v, dt);
        const fl = this.floorAt(c.p.x, c.p.z, c.p.y) + c.s.y * 0.5;
        let landed = c.p.y < fl;
        if (!landed && c.v.y < 0 && W.pointInSolid(c.p)) landed = true;
        if (landed) {
          c.p.y = c.p.y < fl ? fl : oy;
          if (Math.abs(c.v.y) < 1.2) {
            c.rest = true;
            c.r.x = Math.round(c.r.x / (Math.PI / 2)) * (Math.PI / 2);
            c.r.z = Math.round(c.r.z / (Math.PI / 2)) * (Math.PI / 2);
          } else {
            c.v.y *= -0.32;
            c.v.x *= 0.6;
            c.v.z *= 0.6;
            c.w.multiplyScalar(0.5);
            if (c.heavy) this.at('step_metal1', c.p, 0.5, { rate: rnd(1.3, 1.7), key: 'brk_helmet' });
          }
        }
        c.r.x += c.w.x * dt;
        c.r.y += c.w.y * dt;
        c.r.z += c.w.z * dt;
        if (c.hot && Math.random() < dt * 6) fx.burst(c.p, 0xff7a30, { count: 1, speed: 0.6, life: 0.4, size: 0.2, gravity: -1 });
      }
      const k = Math.min(1, c.life / 0.6);
      _m.compose(c.p, _q.setFromEuler(c.r), _s.copy(c.s).multiplyScalar(k));
      mesh.setMatrixAt(i, _m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.dLive = live;
    if (!live) mesh.visible = false;
  }

  // ---------------------------------------------------------------- the paper flurry: sheets that flutter down and stay
  buildFlurry(mat, uv) {
    const N = (this.FN = 96);
    const geo = new THREE.PlaneGeometry(0.21, 0.29);
    const a = geo.attributes.uv;
    for (let i = 0; i < a.count; i++) a.setXY(i, uv[0] + a.getX(i) * (uv[2] - uv[0]), uv[1] + a.getY(i) * (uv[3] - uv[1]));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(a.count * 3).fill(0.75), 3));
    const m = mat.clone();
    m.side = THREE.DoubleSide;
    const mesh = (this.flurry = new THREE.InstancedMesh(geo, m, N));
    mesh.frustumCulled = false;
    mesh.userData.noCull = true;
    mesh.visible = false;
    mesh.name = 'camp_flurry';
    for (let i = 0; i < N; i++) mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
    this.sheets = Array.from({ length: N }, () => ({ on: false, rest: false, p: new THREE.Vector3(), v: new THREE.Vector3(), ph: 0, spin: 0, yaw: 0 }));
    this.fCursor = 0;
    this.fLive = 0;
    this.W.scene.add(mesh);
  }

  sheet(p, v) {
    const i = this.fCursor;
    this.fCursor = (i + 1) % this.FN;
    const s = this.sheets[i];
    s.on = true;
    s.rest = false;
    s.p.copy(p);
    s.v.copy(v);
    s.ph = Math.random() * 6.28;
    s.spin = rnd(-4, 4);
    s.yaw = Math.random() * 6.28;
    s.floor = this.floorAt(p.x, p.z, p.y) + 0.004 + Math.random() * 0.004;
    this.flurry.visible = true;
    this.fLive++;
  }

  updateFlurry(dt) {
    if (!this.fLive) return;
    const mesh = this.flurry;
    let moving = 0;
    for (let i = 0; i < this.FN; i++) {
      const s = this.sheets[i];
      if (!s.on || s.rest) continue;
      moving++;
      s.ph += dt;
      // heavy air drag, a gentle fall, a side-to-side flutter
      s.v.y -= 6 * dt;
      s.v.multiplyScalar(Math.exp(-2.6 * dt));
      if (s.v.y < -0.9) s.v.y = -0.9;
      s.p.addScaledVector(s.v, dt);
      s.p.x += Math.sin(s.ph * 3.1) * 0.6 * dt;
      s.p.z += Math.cos(s.ph * 2.3) * 0.6 * dt;
      s.yaw += s.spin * dt;
      let tilt = Math.sin(s.ph * 4) * 0.7;
      if (s.p.y <= s.floor) {
        s.p.y = s.floor;
        s.rest = true;
        tilt = 0;
      }
      _m.compose(s.p, _q.setFromEuler(_e.set(-Math.PI / 2 + tilt, s.yaw, Math.sin(s.ph * 3) * 0.5 * (s.rest ? 0 : 1), 'YXZ')), _s.set(1, 1, 1));
      mesh.setMatrixAt(i, _m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (!moving) this.fLive = 0; // (they all lie on the floor now: nothing to move until the next burst)
  }

  // ---------------------------------------------------------------- per frame
  update(dt, player) {
    const W = this.W;
    TIME.value += dt;
    this.updateDebris(dt);
    this.updateFlurry(dt);
    const here = regionOf(player.pos) === this.zone;
    // hums: each a loop whose gain follows the distance (silent once its kit is broken or you've left)
    if (audio.available) {
      for (const h of this.hums) {
        if (!h.loop) h.loop = audio.createLoop(h.name);
        const b = this.list[h.id];
        const g = here && b.state === 1 ? h.gain * Math.pow(Math.max(0, 1 - audio.distTo(h.p) / h.far), 2) : 0;
        h.loop.setGain(g);
      }
    }
    if (!here) return;
    this.t += dt;
    const fx = W.fx;
    // wrecks sputter
    for (let i = this.wrecks.length - 1; i >= 0; i--) {
      const b = this.wrecks[i];
      b.sparkT -= dt;
      b.smokeT -= dt;
      if (b.sparkT > 0 && Math.random() < dt * 5) {
        _v.set(b.min.x + Math.random() * b.size.x, b.min.y + Math.random() * b.size.y, b.min.z + Math.random() * b.size.z);
        fx.sparks(_v, UP, 0xffd9a0, { count: 5, speed: 4, spread: 1.6, life: 0.3 });
        if (Math.random() < 0.3) this.at('joint_sparks', _v, 0.25, { rate: rnd(0.9, 1.3), key: 'brk_sputter' });
      }
      if (b.smokeT > 0 && Math.random() < dt * 6) fx.puff(_v.copy(b.center).setY(b.max.y), rnd(-0.2, 0.2), rnd(0.6, 1.2), rnd(-0.2, 0.2), _c.set(0x3e3a38), 0.35, 2.4, 0.4, 3);
      if (b.sparkT <= 0 && b.smokeT <= 0) this.wrecks.splice(i, 1);
    }
    // beeps from the kit still running
    if (!audio.ctx) return;
    for (const s of this.beeps) {
      if (this.t < s.next) continue;
      s.next = this.t + rnd(s.gap[0], s.gap[1]);
      const b = this.list[s.id];
      if (!b || b.state !== 1) continue;
      const d = audio.distTo(s.p);
      if (d > 28) continue;
      this.play(s, d);
    }
  }

  play(s, d) {
    const p = s.p, o = { near: 2, far: 26, gap: 0.05, key: 'camp_' + s.kind + (s.p.x | 0) };
    switch (s.kind) {
      case 'beep':
        audio.at('crab_beep', p, { ...o, gain: 0.22, rate: rnd(1.5, 1.7) });
        break;
      case 'chirp':
        audio.at('seal_chirp', p, { ...o, gain: 0.16, rate: rnd(1.2, 1.4) });
        break;
      case 'core':
        audio.at('core_chirp', p, { ...o, gain: 0.14, rate: rnd(1.4, 1.6) });
        break;
      case 'tick':
        audio.at('timer_tick', p, { ...o, gain: 0.16, rate: rnd(1.0, 1.1) });
        break;
      case 'combo':
        audio.at('combo_tick', p, { ...o, gain: 0.12, rate: rnd(0.7, 0.8) });
        break;
      case 'servo':
        audio.at('servo_tick', p, { ...o, gain: 0.16, rate: rnd(1.0, 1.3) });
        break;
      case 'click':
        audio.at('robot_idle_click', p, { ...o, gain: 0.18 });
        break;
      case 'radio':
        audio.at('radio_squelch', p, { ...o, gain: 0.28, far: 32, rate: rnd(0.9, 1.05) });
        break;
      case 'ecg': {
        // a heart monitor, still counting a beat that isn't there: a clean double blip
        const g = 0.05 * Math.pow(Math.max(0, 1 - d / 24), 2);
        if (g > 0.003) {
          audio.tone({ type: 'sine', f: 988, dur: 0.07, gain: g });
          audio.tone({ type: 'sine', f: 988, dur: 0.06, gain: g * 0.7, delay: 0.16 });
        }
        break;
      }
      case 'alarm': {
        const g = 0.035 * Math.pow(Math.max(0, 1 - d / 26), 2);
        if (g > 0.003) for (let i = 0; i < 3; i++) audio.tone({ type: 'square', f: 1568, dur: 0.05, gain: g, delay: i * 0.12 });
        break;
      }
    }
  }
}
