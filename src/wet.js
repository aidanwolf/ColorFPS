// WET SURFACES (world.wet): the puddles the water cannon leaves on floors, and shock water.
//
// The blue blaster's stream calls addWater() wherever it lands on a floor; a puddle grows while you keep
// spraying it (up to PUDDLE_MAX m across), merges with the puddles it touches, and evaporates over ~25 s
// once you stop. Puddles are slick (ground enemies skid and fall over, the player keeps momentum and a
// sprint across a long slick builds speed: player.js) and they conduct: electrify() turns every puddle
// touching a spot, and every puddle touching those, into shock water for a while.
//
// API for level code (all positions world space, arrays or Vector3s where noted):
//   wet.addWater(point, normal, amount)   amount ≈ seconds of stream. Floors (normal.y > 0.6) pool, walls
//                                          just splash. Returns the puddle (or null).
//   wet.addPuddle(pos, radius)            place a puddle directly (it evaporates like any other)
//   wet.slickAt(pos) → 0..1               how slippery the floor is under pos (feet); 0 off every puddle
//   wet.shockAt(pos) → bool               standing in live shock water there?
//   wet.puddleAt(pos) → puddle | null     the puddle under pos: { pos, r, wet (1 → 0 drying), shock (s) }
//   wet.puddles, wet.count                the live puddles (count 0: every query returns at once)
//   wet.electrify(point, radius, seconds) puddles within `radius` of point (and all they touch) go live
//   wet.clear()                           dry everything (the game calls it on respawn)
//   wet.addShocker({ min, max }, { live = true, onShort = null })
//        An electrical component (a junction box, a cut cable, a generator: level code builds the look).
//        While `live`, any puddle touching its box (grown by SHOCK_REACH) is electrified, so a puddle
//        sprayed up to it carries the charge down the slick to whatever stands in it. Spraying the box
//        itself shorts it: sparks fly, the water at its foot goes live and onShort(point) runs (e.g. to
//        kill a door's power). Returns a handle: { min, max, live, zap(seconds), remove() }; set
//        handle.live = false to cut it. zap(s) electrifies what it touches for s seconds even when dead.
//
// What shock water does: every SHOCK_EVERY s each world entity with onShock(puddle) standing in it gets
// the call (ground enemies built on GroundEnemy die, brutes are stunned); the player standing in it dies
// (cause 'shock', banner ELECTROCUTED; a shield takes the first jolt). Flyers and swimmers are safe.
import * as THREE from 'three';
import { audio } from './audio.js';

const MAX_PUDDLES = 28;
const PUDDLE_MIN = 0.45; // m radius of a fresh puddle
const PUDDLE_MAX = 2.5; // m radius
const GROW = 6.5; // m² of puddle per second of stream (full size in ~3 s on one spot)
const DRY_DELAY = 1.5; // s after the last water before it starts drying
const DRY_TIME = 25; // s from soaked to gone
const MERGE_GAP = 0.4; // m: water landing this close to a puddle's edge feeds it
const SHOCK_EVERY = 0.2;
const SHOCK_REACH = 0.3; // m a shocker's box reaches out to touch a puddle
const ARCS = 18;
const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _p0 = new THREE.Vector3(), _p1 = new THREE.Vector3(), _pn = new THREE.Vector3(), _pp = new THREE.Vector3(), _j = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const v3 = (p) => (p.isVector3 ? p.clone() : new THREE.Vector3(...p));
const rnd = (a, b) => a + Math.random() * (b - a);

const vertexShader = `
  varying vec2 vUv;
  varying vec3 vWorld;
  #include <fog_pars_vertex>
  void main() {
    vUv = uv * 2.0 - 1.0;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vec4 mvPosition = viewMatrix * w;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

// Wet look: a dark film whose rim is broken up by noise, mirror-bright at grazing angles (fresnel toward
// the zone's sky), glints that drift, and rings rippling out from a few spots. Shock water adds a blue
// glow and crawling white-blue arcs.
const fragmentShader = `
  uniform float uTime, uWet, uShock, uSeed, uR;
  uniform vec3 uCenter, uSky;
  varying vec2 vUv;
  varying vec3 vWorld;
  #include <fog_pars_fragment>
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  void main() {
    float d = length(vUv);
    float a = atan(vUv.y, vUv.x);
    float rim = 0.68 + 0.2 * noise(vec2(a * 1.6 + uSeed, uSeed * 3.1)) + 0.1 * noise(vWorld.xz * 1.7 + uSeed);
    float edge = 1.0 - smoothstep(rim - 0.12, rim, d);
    if (edge < 0.01) discard;
    vec3 V = normalize(cameraPosition - vWorld);
    vec2 w = vWorld.xz;
    // ripples: rings spreading from three wandering spots
    float rip = 0.0;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float ph = fract(uTime * 0.45 + fi * 0.37 + uSeed);
      vec2 c = uCenter.xz + (vec2(hash(vec2(fi, floor(uTime * 0.45 + fi * 0.37 + uSeed))), hash(vec2(floor(uTime * 0.45 + fi * 0.37 + uSeed), fi + 7.0))) - 0.5) * uR * 1.2;
      float rr = length(w - c) - ph * 1.4;
      rip += (1.0 - smoothstep(0.0, 0.07, abs(rr))) * (1.0 - ph) * (1.0 - ph);
    }
    float ndv = clamp(V.y, 0.0, 1.0);
    float fres = pow(1.0 - ndv, 3.0);
    float glint = smoothstep(0.82, 0.98, noise(w * 7.0 + vec2(uTime * 0.3, -uTime * 0.2))) * (0.4 + fres);
    vec3 col = vec3(0.025, 0.04, 0.06) + uSky * (0.18 + 0.9 * fres) + vec3(0.7, 0.85, 1.0) * (rip * 0.35 + glint * 0.8);
    float alpha = edge * uWet * (0.5 + 0.4 * fres + rip * 0.2);
    if (uShock > 0.0) {
      // arcs: thin ridges of two drifting noise fields, flickering
      float n1 = abs(noise(w * 2.6 + vec2(uTime * 6.0, -uTime * 4.3)) - 0.5);
      float n2 = abs(noise(w * 4.1 + vec2(-uTime * 5.1, uTime * 7.7) + 3.0) - 0.5);
      float bolt = (1.0 - smoothstep(0.0, 0.035, n1)) + 0.7 * (1.0 - smoothstep(0.0, 0.025, n2));
      float flick = 0.55 + 0.45 * step(0.3, hash(vec2(floor(uTime * 24.0), uSeed)));
      col += vec3(0.25, 0.55, 1.0) * 0.5 * uShock + vec3(0.75, 0.9, 1.0) * bolt * 3.0 * flick * uShock;
      alpha = max(alpha, edge * uShock * (0.55 + bolt * 0.45));
    }
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.92));
    #include <fog_fragment>
  }`;

export class WetSurfaces {
  constructor(world) {
    this.world = world;
    this.puddles = [];
    this.shockers = [];
    this.count = 0;
    this.t = 0;
    this.shockT = 0;
    this.anyShock = false;
    // pooled decals, hidden in the scene from the start (so main.js compiles their shader up front)
    this.pool = [];
    const geo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    for (let i = 0; i < MAX_PUDDLES; i++) {
      const m = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
          uTime: { value: 0 }, uWet: { value: 1 }, uShock: { value: 0 }, uSeed: { value: Math.random() * 10 }, uR: { value: 1 },
          uCenter: { value: new THREE.Vector3() }, uSky: { value: new THREE.Color(0x6a7a9a) },
        }]),
        vertexShader, fragmentShader, transparent: true, depthWrite: false, fog: true,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
      });
      const mesh = new THREE.Mesh(geo, m);
      mesh.visible = false;
      mesh.renderOrder = 1;
      mesh.userData.noCull = true;
      mesh.userData.noBatch = true;
      world.scene.add(mesh);
      this.pool.push(mesh);
    }
    // crackling arcs over shock water: thin additive boxes, a few segments each
    this.arcs = [];
    const aGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5);
    for (let i = 0; i < ARCS; i++) {
      const m = new THREE.Mesh(aGeo, new THREE.MeshBasicMaterial({ color: 0xcfe8ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false;
      m.userData.noCull = true;
      m.userData.noBatch = true;
      m.userData.life = 0;
      world.scene.add(m);
      this.arcs.push(m);
    }
    this.arcCursor = 0;
    this.buzz = null;
  }

  // ---------- water in ----------
  addWater(point, normal, amount) {
    if (!normal || normal.y < 0.6) return null;
    let p = this.puddleNear(point, MERGE_GAP);
    if (!p) {
      p = this.spawn(point, PUDDLE_MIN);
      if (!p) return null;
    }
    // the water pools around where it lands: the puddle creeps toward it as it grows
    const area = Math.PI * p.r * p.r;
    const add = GROW * amount;
    const k = add / (area + add);
    _v.set(point.x - p.pos.x, 0, point.z - p.pos.z).multiplyScalar(k * 0.6);
    p.pos.add(_v);
    this.setArea(p, area + add);
    p.wet = 1;
    p.since = 0;
    this.mergeFrom(p);
    return p;
  }

  addPuddle(pos, radius) {
    const p = this.puddleNear(v3(pos), 0) || this.spawn(v3(pos), PUDDLE_MIN);
    if (!p) return null;
    this.setArea(p, Math.PI * radius * radius);
    p.wet = 1;
    p.since = 0;
    this.mergeFrom(p);
    return p;
  }

  spawn(point, r) {
    let mesh = this.pool.find((m) => !m.userData.puddle);
    if (!mesh) {
      // every decal in use: the driest puddle makes way
      let worst = null;
      for (const q of this.puddles) if (!worst || q.wet < worst.wet) worst = q;
      if (!worst) return null;
      this.free(worst);
      mesh = worst.mesh;
    }
    const p = { pos: point.clone(), y: point.y, r, cap: PUDDLE_MAX, wet: 1, since: 0, shock: 0, mesh, capT: 0 };
    p.pos.y = point.y;
    mesh.userData.puddle = p;
    mesh.material.uniforms.uSeed.value = Math.random() * 10;
    mesh.visible = true;
    this.puddles.push(p);
    this.count = this.puddles.length;
    this.capRadius(p, PUDDLE_MIN);
    this.place(p);
    return p;
  }

  free(p) {
    const i = this.puddles.indexOf(p);
    if (i >= 0) this.puddles.splice(i, 1);
    p.mesh.userData.puddle = null;
    p.mesh.visible = false;
    p.dead = true;
    this.count = this.puddles.length;
  }

  clear() {
    for (const p of [...this.puddles]) this.free(p);
    for (const a of this.arcs) a.visible = false;
    this.anyShock = false;
  }

  setArea(p, area) {
    const r = Math.min(PUDDLE_MAX, Math.sqrt(area / Math.PI));
    if (r > p.r + 0.05 || r > p.cap) this.capRadius(p, r);
    p.r = Math.min(r, p.cap);
  }

  // Water only pools where there's floor: look round the rim at radius r for a drop-off or a wall, and
  // cap the puddle short of the first one.
  capRadius(p, r) {
    const W = this.world;
    for (let rr = Math.max(PUDDLE_MIN, p.r); rr <= r + 1e-3; rr += 0.25) {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + 0.3;
        const x = p.pos.x + Math.cos(a) * rr * 0.85, z = p.pos.z + Math.sin(a) * rr * 0.85;
        const floor = W.pointInSolid(_v.set(x, p.y - 0.06, z));
        const wall = W.pointInSolid(_v.set(x, p.y + 0.12, z));
        if (!floor || floor.hazard || wall) {
          p.cap = Math.max(PUDDLE_MIN * 0.8, rr - 0.25);
          return;
        }
      }
    }
  }

  // two puddles that grow into each other become one
  mergeFrom(p) {
    for (const q of [...this.puddles]) {
      if (q === p || q.dead || Math.abs(q.y - p.y) > 0.3) continue;
      const d = Math.hypot(q.pos.x - p.pos.x, q.pos.z - p.pos.z);
      if (d > (p.r + q.r) * 0.7) continue;
      const a1 = Math.PI * p.r * p.r, a2 = Math.PI * q.r * q.r;
      p.pos.x = (p.pos.x * a1 + q.pos.x * a2) / (a1 + a2);
      p.pos.z = (p.pos.z * a1 + q.pos.z * a2) / (a1 + a2);
      p.wet = Math.max(p.wet, q.wet);
      p.shock = Math.max(p.shock, q.shock);
      this.free(q);
      p.cap = PUDDLE_MAX;
      this.setArea(p, a1 + a2);
    }
    this.place(p);
  }

  place(p) {
    const m = p.mesh;
    m.position.set(p.pos.x, p.y + 0.015, p.pos.z);
    const s = p.r * (0.55 + 0.45 * Math.min(1, p.wet * 1.5));
    m.scale.set(s, 1, s);
    m.material.uniforms.uR.value = s;
    m.material.uniforms.uCenter.value.copy(m.position);
  }

  // ---------- queries ----------
  puddleNear(point, gap) {
    let best = null, bd = Infinity;
    for (const p of this.puddles) {
      if (Math.abs(point.y - p.y) > 0.35) continue;
      const d = Math.hypot(point.x - p.pos.x, point.z - p.pos.z) - p.r;
      if (d < gap && d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  // the effective (drying) radius
  radius(p) {
    return p.r * (0.55 + 0.45 * Math.min(1, p.wet * 1.5));
  }

  puddleAt(pos) {
    if (!this.count) return null;
    for (const p of this.puddles) {
      if (pos.y < p.y - 0.3 || pos.y > p.y + 0.45) continue;
      if (Math.hypot(pos.x - p.pos.x, pos.z - p.pos.z) < this.radius(p) * 0.85) return p;
    }
    return null;
  }

  slickAt(pos) {
    if (!this.count) return 0;
    let s = 0;
    for (const p of this.puddles) {
      if (pos.y < p.y - 0.3 || pos.y > p.y + 0.45) continue;
      const r = this.radius(p) * 0.85;
      const d = Math.hypot(pos.x - p.pos.x, pos.z - p.pos.z);
      if (d >= r) continue;
      s = Math.max(s, Math.min(1, (r - d) / 0.35) * Math.min(1, p.wet * 4));
    }
    return s;
  }

  shockAt(pos) {
    if (!this.anyShock) return false;
    const p = this.puddleAt(pos);
    return !!p && p.shock > 0;
  }

  // ---------- shock ----------
  electrify(point, radius = 0.5, seconds = 3) {
    const at = v3(point);
    const hit = [];
    for (const p of this.puddles) {
      if (Math.abs(at.y - p.y) > radius + 0.6) continue;
      if (Math.hypot(at.x - p.pos.x, at.z - p.pos.z) < this.radius(p) + radius) hit.push(p);
    }
    for (const p of hit) this.charge(p, seconds);
    return hit.length > 0;
  }

  // a puddle goes live, and the charge runs through every puddle touching it
  charge(p, seconds) {
    const open = [p], seen = new Set([p]);
    while (open.length) {
      const q = open.pop();
      if (q.shock <= 0) this.sizzle(q);
      q.shock = Math.max(q.shock, seconds);
      for (const o of this.puddles) {
        if (seen.has(o) || Math.abs(o.y - q.y) > 0.5) continue;
        if (Math.hypot(o.pos.x - q.pos.x, o.pos.z - q.pos.z) < this.radius(o) + this.radius(q)) {
          seen.add(o);
          open.push(o);
        }
      }
    }
    this.anyShock = true;
  }

  sizzle(p) {
    const fx = this.world.fx;
    fx.flash(_v.set(p.pos.x, p.y + 0.05, p.pos.z), 0x9fd0ff, { size: this.radius(p) * 1.4, life: 0.25, n: UP, k: 1.6, hot: 0.6 });
    fx.ring(_v, UP, 0xbfe4ff, { size: 0.2, end: this.radius(p) * 1.6, life: 0.3, thick: 0.15, k: 1.6 });
    const d = _v.distanceTo(this.world.game.camera.position);
    if (d < 30) audio.sample(audio.sfxOr('energy_crackle', 'joint_sparks'), { gain: 0.9 * (1 - d / 30), vary: 0.15 });
  }

  addShocker(box, { live = true, onShort = null } = {}) {
    const s = { min: v3(box.min), max: v3(box.max), live, onShort, zapT: 0, shortT: 0 };
    s.zap = (secs = 2) => {
      s.zapT = Math.max(s.zapT, secs);
    };
    s.remove = () => {
      const i = this.shockers.indexOf(s);
      if (i >= 0) this.shockers.splice(i, 1);
    };
    this.shockers.push(s);
    return s;
  }

  // does a puddle's disc touch a shocker's box (grown by SHOCK_REACH)?
  touches(s, p) {
    const pad = SHOCK_REACH, r = this.radius(p);
    if (p.y < s.min.y - pad - 0.3 || p.y > s.max.y + pad) return false;
    const cx = Math.max(s.min.x - pad, Math.min(p.pos.x, s.max.x + pad)), cz = Math.max(s.min.z - pad, Math.min(p.pos.z, s.max.z + pad));
    return Math.hypot(cx - p.pos.x, cz - p.pos.z) < r;
  }

  // the water cannon reports where its stream lands: a stream on a shocker shorts it
  sprayed(point, dt) {
    for (const s of this.shockers) {
      const pad = 0.25;
      if (point.x < s.min.x - pad || point.x > s.max.x + pad || point.y < s.min.y - pad || point.y > s.max.y + pad || point.z < s.min.z - pad || point.z > s.max.z + pad) continue;
      s.shortT -= dt;
      if (s.shortT > 0) continue;
      s.shortT = 0.35;
      const fx = this.world.fx;
      fx.sparks(point, UP, 0x9fd0ff, { count: 16, speed: 9, spread: 1.4, life: 0.4, hot: 0.8 });
      fx.flash(point, 0xcfe8ff, { size: 0.9, life: 0.1, k: 2 });
      this.arc(point, _a.copy(point).add(_b.set(rnd(-0.6, 0.6), rnd(-0.5, 0.2), rnd(-0.6, 0.6))));
      audio.sample(audio.sfxOr('joint_sparks', 'energy_crackle'), { gain: 0.8, vary: 0.15 });
      // the water running off it goes live: a puddle at its foot (if any) and anything touching that
      this.electrify(_c.set((s.min.x + s.max.x) / 2, s.min.y, (s.min.z + s.max.z) / 2), Math.max(s.max.x - s.min.x, s.max.z - s.min.z) / 2 + 0.4, 2.5);
      s.onShort?.(point.clone(), s);
    }
  }

  // a jagged bolt between two points, from the arc pool
  arc(a, b) {
    const n = 4;
    const A = _p0.copy(a), B = _p1.copy(b);
    const prev = _pp.copy(A);
    for (let i = 1; i <= n; i++) {
      const m = this.arcs[this.arcCursor];
      this.arcCursor = (this.arcCursor + 1) % ARCS;
      const next = _pn.lerpVectors(A, B, i / n);
      if (i < n) next.add(_j.set(rnd(-0.18, 0.18), rnd(0, 0.15), rnd(-0.18, 0.18)));
      m.position.copy(prev);
      m.lookAt(next);
      const w = rnd(0.015, 0.035);
      m.scale.set(w, w, Math.max(0.01, prev.distanceTo(next)));
      m.material.color.setRGB(1.6, 2.2, 3);
      m.material.opacity = 1;
      m.userData.life = rnd(0.05, 0.11);
      m.visible = true;
      prev.copy(next);
    }
  }

  // ---------- per frame ----------
  update(dt, player) {
    for (const a of this.arcs) {
      if (!a.visible) continue;
      a.userData.life -= dt;
      a.material.opacity = Math.max(0, a.userData.life / 0.1);
      if (a.userData.life <= 0) a.visible = false;
    }
    if (!this.count && !this.shockers.length) {
      this.buzz?.set(0);
      return;
    }
    this.t += dt;
    const fx = this.world.fx;
    // live shockers charge the puddles they touch
    for (const s of this.shockers) {
      s.zapT = Math.max(0, s.zapT - dt);
      if (!s.live && s.zapT <= 0) continue;
      for (const p of this.puddles) if (p.shock < 0.3 && this.touches(s, p)) this.charge(p, 0.6);
    }
    let shock = false, near = Infinity;
    const cam = this.world.game.camera.position;
    for (let i = this.puddles.length - 1; i >= 0; i--) {
      const p = this.puddles[i];
      p.since += dt;
      if (p.since > DRY_DELAY) p.wet -= dt / DRY_TIME;
      if (p.wet <= 0) {
        this.free(p);
        continue;
      }
      if (p.shock > 0) {
        p.shock = Math.max(0, p.shock - dt);
        shock = true;
        const r = this.radius(p);
        const d = Math.hypot(cam.x - p.pos.x, cam.z - p.pos.z) - r;
        near = Math.min(near, Math.max(0, d) + Math.abs(cam.y - p.y) * 0.5);
        // crackle: bolts skitter across it, sparks spit up, a blue haze hangs over it
        if (Math.random() < dt * (6 + r * 4)) {
          const a1 = Math.random() * 6.28, a2 = a1 + rnd(1, 3), r1 = rnd(0.1, 0.8) * r, r2 = rnd(0.1, 0.8) * r;
          _a.set(p.pos.x + Math.cos(a1) * r1, p.y + 0.04, p.pos.z + Math.sin(a1) * r1);
          _b.set(p.pos.x + Math.cos(a2) * r2, p.y + 0.04, p.pos.z + Math.sin(a2) * r2);
          this.arc(_a, _b);
        }
        if (Math.random() < dt * 10) {
          const a = Math.random() * 6.28, rr = Math.random() * r * 0.8;
          _v.set(p.pos.x + Math.cos(a) * rr, p.y + 0.05, p.pos.z + Math.sin(a) * rr);
          fx.sparks(_v, UP, 0x9fd0ff, { count: 4, speed: 4, spread: 0.9, life: 0.25, hot: 0.9, gravity: 12 });
          fx.flash(_v, 0xbfe4ff, { size: 0.35, life: 0.06, k: 1.8 });
        }
      }
      const u = p.mesh.material.uniforms;
      u.uTime.value = this.t;
      u.uWet.value = Math.min(1, p.wet * 4);
      u.uShock.value = p.shock > 0 ? Math.min(1, p.shock * 2) : 0;
      this.place(p);
    }
    this.anyShock = shock;
    // the buzz of live water, louder as you get close
    if (shock || this.buzz) (this.buzz ??= new Buzz()).set(shock ? 0.22 * Math.max(0, 1 - near / 14) : 0);
    if (!shock) return;
    this.shockT -= dt;
    if (this.shockT > 0) return;
    this.shockT = SHOCK_EVERY;
    // what stands in it
    for (const e of this.world.entities) {
      if (typeof e.onShock !== 'function' || e.dead || !e.pos) continue;
      const p = this.puddleAt(e.floorY !== undefined ? _v.set(e.pos.x, e.floorY, e.pos.z) : e.pos);
      if (p && p.shock > 0 && e.grounded !== false) e.onShock(p);
    }
    if (player && !player.dead && player.grounded && !player.swimming) {
      const p = this.puddleAt(player.pos);
      if (p && p.shock > 0) {
        fx.sparks(_v.copy(player.pos).setY(player.pos.y + 0.3), UP, 0xcfe8ff, { count: 20, speed: 7, spread: 1.2, life: 0.4, hot: 0.9 });
        this.arc(_a.copy(player.pos).setY(p.y + 0.05), _b.copy(player.pos).setY(player.pos.y + 1.2));
        player.damage(1, 'shock');
      }
    }
  }
}

// The hum of live water: a mains buzz (two detuned saws through a band-pass) on the loop bus, so it hushes
// with the other loops when the game pauses.
class Buzz {
  constructor() {
    this.gain = 0;
    this.nodes = null;
  }

  set(g) {
    if (Math.abs(g - this.gain) < 0.005 && (this.nodes || g <= 0.001)) return;
    this.gain = g;
    const ctx = audio.ctx;
    if (!ctx || !audio.loopBus) return;
    if (!this.nodes) {
      if (g <= 0.001) return;
      const out = ctx.createGain();
      out.gain.value = 0;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 900;
      bp.Q.value = 0.8;
      const oscs = [118, 121.5, 240].map((f, i) => {
        const o = ctx.createOscillator();
        o.type = i === 2 ? 'square' : 'sawtooth';
        o.frequency.value = f;
        const og = ctx.createGain();
        og.gain.value = i === 2 ? 0.25 : 0.5;
        o.connect(og).connect(bp);
        o.start();
        return o;
      });
      bp.connect(out).connect(audio.loopBus);
      this.nodes = { out, oscs };
    }
    this.nodes.out.gain.setTargetAtTime(g, ctx.currentTime, 0.08);
    if (g <= 0.001) {
      // silent: let the voices go after the fade
      const { out, oscs } = this.nodes;
      this.nodes = null;
      for (const o of oscs) o.stop(ctx.currentTime + 0.5);
      setTimeout(() => out.disconnect(), 700);
    }
  }
}
