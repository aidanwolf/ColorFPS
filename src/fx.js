// Particles and pooled shot tracers. Every particle (glow dots, velocity-stretched sparks, tumbling glass
// shards, soft puffs, and flat hot spots / shockwave rings laid on a surface or facing the camera) lives
// in one packed pool drawn as a single instanced, additive draw call. The high-level effects below
// (impacts, shatters, pickups, landings...) are all built from it.
import * as THREE from 'three';

const MAX = 3000; // live particles; when full, new ones recycle random live ones
const STRIDE = 13; // floats per instance: position 3, dir 3 (velocity or surface normal), color 3, shape 4
const DOT = 0, STREAK = 1, SHARD = 2, SPOT = 3, RING = 4, PUFF = 5;
const HOT = 3; // max per-particle color intensity: bloom runs on a half-float target, so keep values sane
const NO_FLOOR = -1e9;

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _t = new THREE.Vector3();
const _u = new THREE.Vector3();
const _w = new THREE.Color();
const _g = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const ZERO = new THREE.Vector3();
const WHITE = new THREE.Color(1, 1, 1);
const DUST = new THREE.Color(0xb8c0d0);
const CYAN = 0x9bf6ff;
const HUES = [0xff3344, 0xffd23a, 0x3dff7a, 0x3a8bff];
// ring planes tilted toward the four diagonals, so from any side most of them read as ellipses
const TILTS = [[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([x, z]) => new THREE.Vector3(x, 0.8, z).normalize());

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// random unit vector
function randDir(out) {
  const z = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - z * z);
  return out.set(r * Math.cos(a), z, r * Math.sin(a));
}

// a random direction around `n`, wider for larger `spread` (0 = exactly n, ~1 = a hemisphere)
function cone(out, n, spread) {
  randDir(out).multiplyScalar(spread * Math.random()).add(n);
  const l = out.length();
  return l > 1e-5 ? out.divideScalar(l) : out.copy(n);
}

const vertexShader = `
  attribute vec3 iPos;
  attribute vec3 iDir;
  attribute vec3 iCol;
  attribute vec4 iShape; // half size, length (streak/shard) or thickness (ring), rotation, mode
  varying vec2 vUv;
  varying vec3 vCol;
  varying float vMode;
  varying float vThick;
  void main() {
    float mode = iShape.w;
    vUv = position.xy;
    vCol = iCol;
    vMode = mode;
    vThick = clamp(iShape.y, 0.02, 1.0);
    vec4 mv;
    if (mode > 2.5 && mode < 4.5 && dot(iDir, iDir) > 1e-4) {
      // spot / ring lying on a surface
      vec3 n = normalize(iDir);
      vec3 t = normalize(cross(n, abs(n.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
      vec3 b = cross(n, t);
      mv = modelViewMatrix * vec4(iPos + (t * position.x + b * position.y) * iShape.x, 1.0);
    } else {
      mv = modelViewMatrix * vec4(iPos, 1.0);
      vec2 ax = vec2(1.0, 0.0);
      float hl = iShape.x;
      if (mode > 0.5 && mode < 1.5) {
        // streak: stretched along the on-screen direction of motion
        vec3 v = (modelViewMatrix * vec4(iDir, 0.0)).xyz;
        float z = min(mv.z, -0.05);
        vec2 s = v.xy - mv.xy * (v.z / z);
        float sl = length(s);
        if (sl > 1e-5) ax = s / sl;
        hl = max(iShape.x, iShape.y * clamp(sl / max(length(v), 1e-5), 0.0, 1.0));
      } else if (mode > 1.5 && mode < 2.5) {
        ax = vec2(cos(iShape.z), sin(iShape.z));
        hl = iShape.y;
      }
      mv.xy += ax * position.x * hl + vec2(-ax.y, ax.x) * position.y * iShape.x;
    }
    gl_Position = projectionMatrix * mv;
  }`;

const fragmentShader = `
  varying vec2 vUv;
  varying vec3 vCol;
  varying float vMode;
  varying float vThick;
  void main() {
    vec2 u = vUv;
    float d = length(u);
    float a;
    if (vMode < 0.5 || vMode > 4.5) {
      a = smoothstep(1.0, 0.0, d);
    } else if (vMode < 1.5) {
      float w = 1.0 - abs(u.y);
      a = w * w * (0.5 + 0.5 * u.x) * smoothstep(1.0, 0.75, u.x);
    } else if (vMode < 2.5) {
      // a kite-shaped sliver with a bright spine
      float hw = u.x < -0.4 ? (u.x + 1.0) / 0.6 : (1.0 - u.x) / 1.4;
      a = smoothstep(0.0, 0.12, hw - abs(u.y)) * (0.6 + 0.4 * (1.0 - abs(u.y)));
    } else if (vMode < 3.5) {
      a = smoothstep(1.0, 0.0, d);
      a *= a;
    } else {
      float r = 1.0 - vThick;
      a = (1.0 - smoothstep(0.0, vThick, abs(d - r))) + 0.12 * smoothstep(1.0, 0.0, d);
      a *= step(d, 1.0);
    }
    if (a < 0.004) discard;
    a = min(a, 1.0);
    gl_FragColor = vec4(clamp(vCol, 0.0, 3.0) * 1.6 * a, a);
  }`;

const _bp = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

export class Fx {
  constructor(scene) {
    this.scene = scene;
    // 1 = full counts; lower it (e.g. 0.6 on phones) to thin every effect out
    this.quality = 1;
    this.n = 0;
    this.p = new Float32Array(MAX * 3);
    this.v = new Float32Array(MAX * 3);
    this.c0 = new Float32Array(MAX * 3);
    this.c1 = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.max = new Float32Array(MAX);
    this.grav = new Float32Array(MAX);
    this.drag = new Float32Array(MAX);
    this.size = new Float32Array(MAX);
    this.sizeEnd = new Float32Array(MAX);
    this.len = new Float32Array(MAX); // streak: seconds of motion blur; shard: aspect; ring: thickness
    this.rot = new Float32Array(MAX);
    this.spin = new Float32Array(MAX);
    this.fadeIn = new Float32Array(MAX);
    this.fadeOut = new Float32Array(MAX);
    this.floor = new Float32Array(MAX);
    this.mode = new Uint8Array(MAX);
    this.vec3s = [this.p, this.v, this.c0, this.c1];
    this.scalars = [this.life, this.max, this.grav, this.drag, this.size, this.sizeEnd, this.len, this.rot, this.spin, this.fadeIn, this.fadeOut, this.floor, this.mode];

    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.buf = new Float32Array(MAX * STRIDE);
    this.ibuf = new THREE.InstancedInterleavedBuffer(this.buf, STRIDE, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', new THREE.InterleavedBufferAttribute(this.ibuf, 3, 0));
    geo.setAttribute('iDir', new THREE.InterleavedBufferAttribute(this.ibuf, 3, 3));
    geo.setAttribute('iCol', new THREE.InterleavedBufferAttribute(this.ibuf, 3, 6));
    geo.setAttribute('iShape', new THREE.InterleavedBufferAttribute(this.ibuf, 4, 9));
    geo.instanceCount = 0;
    const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.points = new THREE.Mesh(geo, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.points.visible = false;
    // particles go everywhere, so World's per-area culling must leave this alone
    this.points.userData.noCull = true;
    scene.add(this.points);

    this.tracers = [];
    const tGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5);
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(tGeo, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false;
      m.userData.life = 0;
      m.userData.noCull = true;
      scene.add(m);
      this.tracers.push(m);
    }
    this.tracerCursor = 0;
    this._c = new THREE.Color();
  }

  // ---------- pool ----------
  get count() {
    return this.n;
  }

  // How many of `count` to actually spawn: scaled by quality, and thinned as the pool fills up.
  budget(count) {
    const fill = this.n / MAX;
    const load = fill < 0.6 ? 1 : Math.max(0.15, (1 - fill) / 0.4);
    return Math.floor(count * this.quality * load + Math.random());
  }

  // Claim a slot (recycling a random live one when full) with neutral defaults; returns its index.
  spawn(mode, p, vx, vy, vz, c, k, life, size) {
    let i = this.n;
    if (i < MAX) this.n++;
    else i = (Math.random() * MAX) | 0;
    const i3 = i * 3;
    this.p[i3] = p.x;
    this.p[i3 + 1] = p.y;
    this.p[i3 + 2] = p.z;
    this.v[i3] = vx;
    this.v[i3 + 1] = vy;
    this.v[i3 + 2] = vz;
    const r = Math.min(c.r * k, HOT), g = Math.min(c.g * k, HOT), b = Math.min(c.b * k, HOT);
    this.c0[i3] = this.c1[i3] = r;
    this.c0[i3 + 1] = this.c1[i3 + 1] = g;
    this.c0[i3 + 2] = this.c1[i3 + 2] = b;
    this.life[i] = this.max[i] = Math.max(life, 0.01);
    this.size[i] = size;
    this.sizeEnd[i] = 1;
    this.grav[i] = 0;
    this.drag[i] = 0;
    this.len[i] = 0;
    this.rot[i] = 0;
    this.spin[i] = 0;
    this.fadeIn[i] = 0;
    this.fadeOut[i] = 1.5;
    this.floor[i] = NO_FLOOR;
    this.mode[i] = mode;
    return i;
  }

  // the color a particle fades to by the end of its life
  endColor(i, c, k) {
    const i3 = i * 3;
    this.c1[i3] = Math.min(c.r * k, HOT);
    this.c1[i3 + 1] = Math.min(c.g * k, HOT);
    this.c1[i3 + 2] = Math.min(c.b * k, HOT);
  }

  kill(i) {
    const j = --this.n;
    if (i === j) return;
    const i3 = i * 3, j3 = j * 3;
    for (const arr of this.vec3s) {
      arr[i3] = arr[j3];
      arr[i3 + 1] = arr[j3 + 1];
      arr[i3 + 2] = arr[j3 + 2];
    }
    for (const arr of this.scalars) arr[i] = arr[j];
  }

  // ---------- primitives ----------
  // The original general-purpose burst (sizes are in the old point units); extra options pick a mode
  // ('dot' | 'streak' | 'shard' | 'puff'), a color to fade to, growth, fade-in and a floor to bounce on.
  burst(p, color, { count = 20, speed = 6, life = 0.6, size = 0.25, gravity = 9, drag = 1.5, spread = 1, dir = null, mode = 'dot', colorEnd = null, sizeEnd = 1, fadeIn = 0, intensity = 1, stretch = 0.04, floor = NO_FLOOR } = {}) {
    const c = this._c.set(color);
    const m = mode === 'streak' ? STREAK : mode === 'shard' ? SHARD : mode === 'puff' ? PUFF : DOT;
    if (colorEnd !== null) _g.set(colorEnd);
    const n = this.budget(count);
    for (let k = 0; k < n; k++) {
      randDir(_a).multiplyScalar(speed * (0.3 + Math.random() * 0.7) * spread);
      if (dir) _a.addScaledVector(dir, speed);
      const i = this.spawn(m, p, _a.x, _a.y, _a.z, c, intensity * (0.75 + Math.random() * 0.5), life * (0.6 + Math.random() * 0.6), size * 0.42 * (0.6 + Math.random() * 0.8));
      this.grav[i] = gravity;
      this.drag[i] = drag;
      this.sizeEnd[i] = sizeEnd;
      this.fadeIn[i] = fadeIn;
      this.floor[i] = floor;
      if (colorEnd !== null) this.endColor(i, _g, intensity);
      if (m === STREAK) {
        this.len[i] = stretch;
        this.size[i] *= 0.25;
      } else if (m === RING) {
        cs *= env; // shockwaves fade fast, then linger faintly
      } else if (m === SHARD) {
        this.len[i] = rnd(1.6, 2.8);
        this.rot[i] = Math.random() * 6.3;
        this.spin[i] = rnd(-14, 14);
      }
    }
  }

  // velocity-stretched sparks spraying around direction n
  sparks(p, n, color, { count = 8, speed = 10, spread = 0.6, life = 0.35, size = 0.018, gravity = 9, drag = 2, stretch = 0.035, hot = 0.6, k = 1.6, inherit = null } = {}) {
    _w.set(color);
    _g.copy(_w).lerp(WHITE, hot);
    const cnt = this.budget(count);
    for (let j = 0; j < cnt; j++) {
      cone(_a, n, spread).multiplyScalar(speed * rnd(0.45, 1));
      if (inherit) _a.add(inherit);
      const i = this.spawn(STREAK, p, _a.x, _a.y, _a.z, _g, k * rnd(0.8, 1.2), life * rnd(0.6, 1.2), size * rnd(0.7, 1.3));
      this.endColor(i, _w, k * 0.7);
      this.grav[i] = gravity;
      this.drag[i] = drag;
      this.len[i] = stretch;
      this.fadeOut[i] = 1.2;
    }
  }

  // tumbling glass slivers
  shard(p, vx, vy, vz, c, k, life, size, aspect = 2.2) {
    const i = this.spawn(SHARD, p, vx, vy, vz, c, k, life, size);
    this.len[i] = aspect;
    this.rot[i] = Math.random() * 6.3;
    this.spin[i] = rnd(5, 15) * (Math.random() < 0.5 ? -1 : 1);
    this.fadeOut[i] = 3;
    return i;
  }

  // An expanding shockwave ring lying on the plane with normal n (null: facing the camera).
  ring(p, n, color, { size = 0.2, end = 2, life = 0.35, thick = 0.15, k = 1.4, fadeIn = 0 } = {}) {
    if (this.quality < 0.3 && this.n > MAX * 0.8) return;
    const d = n || ZERO;
    const i = this.spawn(RING, p, d.x, d.y, d.z, this._c.set(color), k, life, size);
    this.sizeEnd[i] = end / size;
    this.len[i] = thick;
    this.fadeOut[i] = 1;
    this.fadeIn[i] = fadeIn;
    return i;
  }

  // A brief hot glow: on a surface (normal n) or facing the camera (n null).
  flash(p, color, { size = 0.5, life = 0.12, n = null, k = 1.5, hot = 0.5, end = 1 } = {}) {
    _w.set(color).lerp(WHITE, hot);
    const d = n || ZERO;
    const i = this.spawn(SPOT, p, d.x, d.y, d.z, _w, k, life, size);
    this.fadeOut[i] = 1;
    this.sizeEnd[i] = end;
    return i;
  }

  // soft additive haze that grows as it fades (dust, steam)
  puff(p, vx, vy, vz, c, k, life, size, grow = 2.5) {
    const i = this.spawn(PUFF, p, vx, vy, vz, c, k, life, size);
    this.sizeEnd[i] = grow;
    this.drag[i] = 2.5;
    this.fadeIn[i] = 0.12;
    this.fadeOut[i] = 1.1;
    return i;
  }

  // glowing embers: hot near-white cooling to a dim version of the color as they fall
  ember(p, vx, vy, vz, color, life, size) {
    _w.set(color);
    _g.copy(_w).lerp(WHITE, 0.55);
    const i = this.spawn(DOT, p, vx, vy, vz, _g, 1.7, life, size);
    this.endColor(i, _w, 0.45);
    this.grav[i] = 5;
    this.drag[i] = 0.7;
    this.fadeOut[i] = 3;
    return i;
  }

  // rising air bubbles (underwater): wobbling dots that drift up and fade
  bubbles(p, count = 3) {
    for (let i = 0; i < count; i++) {
      const b = this.spawn(DOT, _bp.set(p.x + (Math.random() - 0.5) * 0.2, p.y, p.z + (Math.random() - 0.5) * 0.2),
        (Math.random() - 0.5) * 0.3, 1.2 + Math.random() * 0.8, (Math.random() - 0.5) * 0.3, this._c.set(0xcfefff), 0.9, 1.6 + Math.random(), 0.05 + Math.random() * 0.05);
      this.grav[b] = -1.5;
      this.drag[b] = 1.5;
      this.fadeOut[b] = 1;
    }
  }

  // hitting water: a ring on the surface and a burst of droplets, bigger the faster you came in
  splash(p, speed = 8) {
    const k = Math.min(1, speed / 20);
    this.ring(p, _up, 0xbfe8ff, { size: 0.3, end: 2 + 3 * k, life: 0.6, k: 1 });
    for (let i = 0; i < 10 + 20 * k; i++) {
      const a = Math.random() * Math.PI * 2, s = 1.5 + Math.random() * 4 * k;
      const d = this.spawn(DOT, p, Math.cos(a) * s, 3 + Math.random() * 6 * k, Math.sin(a) * s, this._c.set(0xdff4ff), 1, 0.7, 0.06);
      this.grav[d] = 14;
      this.fadeOut[d] = 1;
    }
  }

  // ---------- shots ----------
  muzzle(p, dir, color, vel = null) {
    this.flash(p, color, { size: 0.09, life: 0.06, k: 1.6, hot: 0.6 });
    this.sparks(p, dir, color, { count: 5, speed: 12, spread: 0.3, life: 0.11, size: 0.006, gravity: 0, drag: 4, stretch: 0.02, inherit: vel });
    _w.set(color);
    const n = this.budget(3);
    for (let j = 0; j < n; j++) {
      cone(_a, dir, 0.5).multiplyScalar(rnd(1, 3));
      if (vel) _a.add(vel);
      const i = this.spawn(DOT, p, _a.x, _a.y, _a.z, _w, 1.3, rnd(0.08, 0.15), rnd(0.012, 0.022));
      this.drag[i] = 6;
    }
  }

  // faint ionized motes left hanging along a beam
  beam(from, to, color) {
    const len = from.distanceTo(to);
    const n = this.budget(Math.min(10, len / 2.5));
    _w.set(color);
    for (let j = 0; j < n; j++) {
      _b.lerpVectors(from, to, Math.random());
      randDir(_a).multiplyScalar(rnd(0.1, 0.5));
      const i = this.spawn(DOT, _b, _a.x, _a.y, _a.z, _w, 0.9, rnd(0.2, 0.4), rnd(0.012, 0.025));
      this.drag[i] = 2;
      this.fadeOut[i] = 1;
    }
  }

  // Where a shot lands. kind: 'wall' (plain surface), 'ricochet' (wrong color bounced), 'mirror', 'glass',
  // 'shield' (shot shield film) or 'hit' (struck something that reacts on its own). dir is the shot's;
  // tint is the struck thing's own color (a ricochet rings in the color that turned the shot away).
  impact(p, n, color, kind = 'wall', dir = null, tint = null) {
    const r = dir ? _t.copy(dir).addScaledVector(n, -2 * dir.dot(n)) : _t.copy(n);
    _w.set(color);
    if (kind === 'wall') {
      this.flash(_b.copy(p).addScaledVector(n, 0.02), color, { size: 0.32, life: 0.5, n, k: 1.4, hot: 0.4, end: 1.5 });
      this.flash(p, color, { size: 0.3, life: 0.06, k: 1.4, hot: 0.6 });
      this.ring(_b, n, color, { size: 0.06, end: 0.4, life: 0.18, thick: 0.3, k: 1.2 });
      this.sparks(p, _u.copy(n).add(r).normalize(), color, { count: 7, speed: 11, spread: 0.75 });
      for (let j = 0, c = this.budget(3); j < c; j++) {
        cone(_a, n, 0.9).multiplyScalar(rnd(1, 3));
        this.ember(p, _a.x, _a.y, _a.z, color, rnd(0.4, 0.8), rnd(0.02, 0.035));
      }
      for (let j = 0, c = this.budget(2); j < c; j++) {
        cone(_a, n, 0.5).multiplyScalar(rnd(0.4, 1));
        const i = this.puff(p, _a.x, _a.y + 0.2, _a.z, _w.set(color), 0.18, rnd(0.4, 0.7), rnd(0.08, 0.12));
        this.grav[i] = -0.5;
      }
    } else if (kind === 'ricochet') {
      this.flash(p, tint ?? color, { size: 0.45, life: 0.1, k: 1.8, hot: 0.5 });
      this.ring(_b.copy(p).addScaledVector(n, 0.02), n, tint ?? color, { size: 0.08, end: 0.5, life: 0.2, thick: 0.25, k: 1.6 });
      this.sparks(p, r, 0xffffff, { count: 8, speed: 16, spread: 0.3, life: 0.25, size: 0.022, hot: 1, k: 1.3 });
      this.sparks(p, r, color, { count: 10, speed: 9, spread: 0.8, life: 0.4, size: 0.024 });
      for (let j = 0, c = this.budget(3); j < c; j++) {
        cone(_a, r, 0.7).multiplyScalar(rnd(2, 4));
        this.ember(p, _a.x, _a.y, _a.z, color, rnd(0.3, 0.6), rnd(0.02, 0.03));
      }
    } else if (kind === 'mirror') {
      this.ring(_b.copy(p).addScaledVector(n, 0.02), n, CYAN, { size: 0.1, end: 0.55, life: 0.25, thick: 0.2, k: 1.4 });
      this.flash(_b, color, { size: 0.25, life: 0.1, n, k: 1.6, hot: 0.5 });
      this.sparks(p, r, 0xffffff, { count: 5, speed: 12, spread: 0.25, life: 0.2, hot: 1, k: 1.2 });
      this.sparks(p, r, color, { count: 4, speed: 7, spread: 0.6, life: 0.25 });
    } else if (kind === 'glass') {
      _b.copy(p).addScaledVector(n, 0.02);
      this.ring(_b, n, 0xbfe8ff, { size: 0.05, end: 0.6, life: 0.3, thick: 0.12, k: 1.2 });
      this.ring(_b, n, 0xbfe8ff, { size: 0.05, end: 1.1, life: 0.5, thick: 0.08, k: 0.8, fadeIn: 0.3 });
      this.flash(_b, 0xdff4ff, { size: 0.18, life: 0.12, n, k: 1.3 });
      this.sparks(p, n, 0xffffff, { count: 4, speed: 6, spread: 0.7, life: 0.2, hot: 1, k: 1.1 });
      _g.set(0xcfeeff);
      for (let j = 0, c = this.budget(4); j < c; j++) {
        cone(_a, n, 0.8).multiplyScalar(rnd(1.5, 4));
        const i = this.shard(p, _a.x, _a.y, _a.z, _g, 1.1, rnd(0.4, 0.7), rnd(0.015, 0.03), 2.5);
        this.grav[i] = 10;
      }
    } else if (kind === 'shield') {
      _b.copy(p).addScaledVector(n, 0.03);
      this.ring(_b, n, CYAN, { size: 0.1, end: 1.4, life: 0.4, thick: 0.1, k: 1.3 });
      this.ring(_b, n, CYAN, { size: 0.05, end: 0.8, life: 0.45, thick: 0.15, k: 0.9, fadeIn: 0.35 });
      this.flash(_b, CYAN, { size: 0.35, life: 0.15, n, k: 1.2, hot: 0.3 });
      _w.set(CYAN);
      for (let j = 0, c = this.budget(10); j < c; j++) {
        // skitter across the film, not off it
        randDir(_a);
        _a.addScaledVector(n, -_a.dot(n)).normalize().multiplyScalar(rnd(1.5, 3));
        const i = this.spawn(DOT, _b, _a.x, _a.y, _a.z, _w, 1.3, rnd(0.25, 0.45), rnd(0.02, 0.04));
        this.drag[i] = 3;
      }
    } else {
      this.flash(p, color, { size: 0.25, life: 0.08, k: 1.5 });
      this.sparks(p, n, color, { count: 5, speed: 8, spread: 0.8, life: 0.3 });
    }
  }

  // A drone's or the boss's orb bursting.
  orbPop(p, color, radius = 0.3) {
    this.flash(p, color, { size: radius * 3, life: 0.12, k: 1.8, hot: 0.7 });
    this.ring(p, null, color, { size: radius, end: radius * 6, life: 0.25, thick: 0.18, k: 1.6 });
    this.sparks(p, UP, color, { count: 14, speed: 11, spread: 3, life: 0.35, gravity: 4 });
    _w.set(color);
    for (let j = 0, c = this.budget(8); j < c; j++) {
      randDir(_a).multiplyScalar(rnd(2, 6));
      const i = this.shard(p, _a.x, _a.y, _a.z, _w, 1.5, rnd(0.4, 0.7), radius * rnd(0.12, 0.2), 1.8);
      this.grav[i] = 8;
      this.drag[i] = 1;
    }
    for (let j = 0, c = this.budget(6); j < c; j++) {
      randDir(_a).multiplyScalar(rnd(0.5, 2));
      this.ember(p, _a.x, _a.y, _a.z, color, rnd(0.5, 0.9), rnd(0.025, 0.04));
    }
  }

  // ---------- color-locked obstacles ----------
  // A spike layer blasted apart: cone shards thrown up and out, a flash and shockwave, falling embers,
  // and a dust puff rolling off the platform. up = -1 for a layer hung spikes-down.
  shatterSpikes(min, max, color, up = 1) {
    const sx = max.x - min.x, sz = max.z - min.z, area = sx * sz;
    const cx = (min.x + max.x) / 2, cz = (min.z + max.z) / 2;
    const base = up > 0 ? min.y + 0.25 : max.y - 0.25, tip = up > 0 ? max.y : min.y;
    const reach = Math.max(sx, sz);
    _w.set(color);
    _g.copy(_w).lerp(WHITE, 0.15);
    const at = (y0, y1) => _b.set(min.x + Math.random() * sx, rnd(y0, y1), min.z + Math.random() * sz);
    const out = (s) => {
      _a.set(_b.x - cx, 0, _b.z - cz);
      const l = _a.length();
      return l > 1e-4 ? _a.multiplyScalar(s / l) : _a.set(0, 0, 0);
    };
    for (let j = 0, c = this.budget(clamp(area * 4, 16, 110)); j < c; j++) {
      at(base, tip);
      out(rnd(1.5, 5));
      const i = this.shard(_b, _a.x + rnd(-1.2, 1.2), up * rnd(5, 11), _a.z + rnd(-1.2, 1.2), _g, 1.15, rnd(0.9, 1.4), rnd(0.05, 0.09), rnd(2, 3.4));
      this.endColor(i, _w, 0.5);
      this.grav[i] = 16 * up;
      this.drag[i] = 0.8;
    }
    for (let j = 0, c = this.budget(clamp(area * 2, 10, 50)); j < c; j++) {
      at(base, tip);
      out(rnd(1, 4));
      _a.y = up * rnd(8, 16);
      const i = this.spawn(STREAK, _b, _a.x, _a.y, _a.z, _g.copy(_w).lerp(WHITE, 0.6), 1.7, rnd(0.4, 0.7), 0.02);
      this.endColor(i, _w, 1.2);
      this.grav[i] = 14 * up;
      this.drag[i] = 1.5;
      this.len[i] = 0.04;
      this.fadeOut[i] = 1.2;
    }
    for (let j = 0, c = this.budget(clamp(area * 2.5, 12, 70)); j < c; j++) {
      at(base, tip);
      out(rnd(0.5, 2.5));
      this.ember(_b, _a.x, up * rnd(2, 6), _a.z, color, rnd(1.2, 2.2), rnd(0.035, 0.06));
    }
    // dust rolling off the platform, mostly near its edges
    _g.copy(_w).lerp(DUST, 0.6);
    for (let j = 0, c = this.budget(clamp((sx + sz) * 3, 10, 40)); j < c; j++) {
      const e = Math.random() < 0.5;
      _b.set(e ? min.x + Math.random() * sx : Math.random() < 0.5 ? min.x : max.x, base, e ? (Math.random() < 0.5 ? min.z : max.z) : min.z + Math.random() * sz);
      out(rnd(1.5, 3));
      const i = this.puff(_b, _a.x, up * rnd(0.2, 0.6), _a.z, _g, 0.22, rnd(0.9, 1.3), rnd(0.18, 0.3), 2.6);
      this.grav[i] = -0.4 * up;
    }
    _b.set(cx, base, cz);
    this.flash(_b, color, { size: reach * 0.55 + 0.5, life: 0.18, k: 1.6, hot: 0.6 });
    this.ring(_b, UP, color, { size: 0.3, end: reach * 0.9 + 0.6, life: 0.35, thick: 0.12, k: 1.6 });
    this.ring(_b, UP, 0xffffff, { size: 0.2, end: reach * 0.6 + 0.4, life: 0.22, thick: 0.08, k: 1 });
  }

  // An energy wall or secret door blown out: glassy shards across the whole surface, blown along the
  // shot (if known) and away from where it hit, with a shockwave ring on the wall's plane and a flash.
  shatterWall(min, max, color, { point = null, dir = null, door = false } = {}) {
    const sx = max.x - min.x, sy = max.y - min.y, sz = max.z - min.z;
    const alongX = sx >= sz;
    const area = (alongX ? sx : sz) * sy;
    const normal = alongX ? _u.set(0, 0, 1) : _u.set(1, 0, 0);
    if (dir && dir.dot(normal) < 0) normal.negate();
    const center = new THREE.Vector3((min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2);
    const origin = point || center;
    const reach = Math.max(alongX ? sx : sz, sy);
    _w.set(color);
    _g.copy(_w).lerp(WHITE, 0.2);
    for (let j = 0, c = this.budget(clamp(area * 7, 40, 160)); j < c; j++) {
      _b.set(min.x + Math.random() * sx, min.y + Math.random() * sy, min.z + Math.random() * sz);
      // away from the impact, through the wall along the shot, plus scatter
      _a.subVectors(_b, origin);
      const l = _a.length();
      _a.multiplyScalar(l > 1e-3 ? rnd(1, 3.5) / l : 0);
      _a.addScaledVector(normal, rnd(dir ? 1.5 : -3, 6));
      _a.x += rnd(-1.5, 1.5);
      _a.y += rnd(-0.5, 2.5);
      _a.z += rnd(-1.5, 1.5);
      const i = this.shard(_b, _a.x, _a.y, _a.z, _g, rnd(0.9, 1.4), rnd(0.8, 1.5), rnd(0.07, 0.18), rnd(1.4, 2.6));
      this.endColor(i, _w, 0.4);
      this.grav[i] = 12;
      this.drag[i] = 0.6;
    }
    // glints
    for (let j = 0, c = this.budget(clamp(area * 1.5, 10, 60)); j < c; j++) {
      _b.set(min.x + Math.random() * sx, min.y + Math.random() * sy, min.z + Math.random() * sz);
      randDir(_a).multiplyScalar(rnd(1, 4)).addScaledVector(normal, 2);
      const i = this.spawn(DOT, _b, _a.x, _a.y, _a.z, _g.copy(_w).lerp(WHITE, 0.6), 1.6, rnd(0.3, 0.6), rnd(0.03, 0.06));
      this.grav[i] = 4;
      this.drag[i] = 1.5;
    }
    this.sparks(origin, normal, color, { count: 20, speed: 14, spread: 1.2, life: 0.45, gravity: 8 });
    _b.copy(origin).addScaledVector(normal, 0.05);
    this.ring(_b, normal, color, { size: 0.3, end: reach * 0.8 + 0.5, life: 0.4, thick: 0.08, k: 1.6 });
    this.ring(_b, normal, 0xffffff, { size: 0.2, end: reach * 0.5 + 0.3, life: 0.25, thick: 0.06, k: 1 });
    this.flash(center, color, { size: reach * 0.5 + 0.4, life: 0.18, k: 1.4, hot: 0.5 });
    if (door) {
      // a disguised wall panel: masonry dust slumping off the base
      for (let j = 0, c = this.budget(clamp((alongX ? sx : sz) * 5, 8, 30)); j < c; j++) {
        _b.set(min.x + Math.random() * sx, min.y + rnd(0, 0.6), min.z + Math.random() * sz);
        _a.copy(normal).multiplyScalar(rnd(-2.5, 2.5));
        const i = this.puff(_b, _a.x, rnd(0.2, 0.8), _a.z, DUST, 0.2, rnd(1, 1.6), rnd(0.25, 0.4), 2.8);
        this.grav[i] = -0.3;
      }
    }
  }

  // Generic box shatter (the original API), routed to the richer wall/spike versions.
  shatterBox(min, max, color, density = 6) {
    if (density >= 10) this.shatterSpikes(min, max, color);
    else this.shatterWall(min, max, color);
  }

  // Telegraph for a broken obstacle about to reform: motes and streaks converge on it over `time` s.
  reform(min, max, color, time = 0.7, density = 3) {
    const sx = max.x - min.x, sy = max.y - min.y, sz = max.z - min.z;
    const area = Math.max(sx * sz, sx * sy, sy * sz);
    _w.set(color);
    time = Math.max(0.15, time);
    for (let j = 0, c = this.budget(clamp(area * density, density * 5, density * 23)); j < c; j++) {
      _b.set(min.x + Math.random() * sx, min.y + Math.random() * sy, min.z + Math.random() * sz);
      randDir(_a).multiplyScalar(rnd(1.2, 2.6));
      const v = _t.copy(_a).multiplyScalar(-1 / time);
      _a.add(_b);
      const streak = j % 2 === 0;
      const i = this.spawn(streak ? STREAK : DOT, _a, v.x, v.y, v.z, _w, 0.9, time, streak ? 0.015 : rnd(0.03, 0.05));
      this.endColor(i, _w, 2);
      this.fadeIn[i] = 0.5;
      this.fadeOut[i] = 12;
      if (streak) this.len[i] = 0.08;
    }
  }

  // The reform moment itself: a shimmer across the obstacle and a soft ring.
  reformFlash(min, max, color, kind = 'wall') {
    const sx = max.x - min.x, sy = max.y - min.y, sz = max.z - min.z;
    const area = Math.max(sx * sz, sx * sy, sy * sz);
    _w.set(color);
    for (let j = 0, c = this.budget(clamp(area * 2, 10, 50)); j < c; j++) {
      _b.set(min.x + Math.random() * sx, min.y + Math.random() * sy, min.z + Math.random() * sz);
      const i = this.spawn(DOT, _b, 0, rnd(0.2, 0.8), 0, _w, 1.5, rnd(0.3, 0.6), rnd(0.03, 0.06));
      this.fadeIn[i] = 0.3;
    }
    _b.set((min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2);
    const reach = Math.max(sx, sy, sz);
    if (kind === 'spike') this.ring(_b.setY(min.y + 0.25), UP, color, { size: reach * 0.9, end: reach * 0.3, life: 0.3, thick: 0.15, k: 1.2 });
    else this.ring(_b, sx >= sz ? _a.set(0, 0, 1) : _a.set(1, 0, 0), color, { size: reach * 0.7, end: 0.2, life: 0.3, thick: 0.1, k: 1.1 });
  }

  // ---------- puzzle pieces ----------
  // A target panel lighting up: burst from the hit, a ring on its face, motes rising off the surface.
  targetActivate(point, min, max, normal, color) {
    const sx = max.x - min.x, sy = max.y - min.y, sz = max.z - min.z;
    const reach = Math.max(sx, sy, sz);
    _b.copy(point).addScaledVector(normal, 0.03);
    this.flash(_b, color, { size: 1.2, life: 0.25, n: normal, k: 1.6, hot: 0.5 });
    this.ring(_b, normal, color, { size: 0.2, end: reach * 0.7 + 0.5, life: 0.6, thick: 0.08, k: 1.6 });
    this.ring(_b, normal, 0xffffff, { size: 0.1, end: reach * 0.4 + 0.3, life: 0.35, thick: 0.1, k: 1 });
    this.sparks(point, normal, color, { count: 36, speed: 12, spread: 0.9, life: 0.5, gravity: 6 });
    _w.set(color);
    const area = Math.max(sx * sz, sx * sy, sy * sz);
    for (let j = 0, c = this.budget(clamp(area * 6, 20, 80)); j < c; j++) {
      _b.set(min.x + Math.random() * sx, min.y + Math.random() * sy, min.z + Math.random() * sz);
      _b.addScaledVector(normal, 0.08);
      const i = this.spawn(DOT, _b, normal.x * 0.4 + rnd(-0.2, 0.2), rnd(0.8, 2.2), normal.z * 0.4 + rnd(-0.2, 0.2), _w, rnd(1.1, 1.6), rnd(1.2, 2.4), rnd(0.03, 0.06));
      this.grav[i] = -0.6;
      this.drag[i] = 0.4;
      this.fadeIn[i] = 0.15;
    }
  }

  // A sliding door's seals letting go: steam jets out both faces of the bottom edge, and a few sparks.
  doorOpen(min, max, color) {
    const sx = max.x - min.x, sz = max.z - min.z;
    const alongX = sx >= sz;
    const n = alongX ? _u.set(0, 0, 1) : _u.set(1, 0, 0);
    const steam = this._c.set(0xc8d2e0);
    for (let j = 0, c = this.budget(clamp((alongX ? sx : sz) * 8, 12, 40)); j < c; j++) {
      const s = Math.random() < 0.5 ? -1 : 1;
      _b.set(min.x + Math.random() * sx, min.y + rnd(0.05, 0.3), min.z + Math.random() * sz);
      _b.addScaledVector(n, s * (alongX ? sz : sx) * 0.5);
      const i = this.puff(_b, n.x * s * rnd(1, 3), rnd(0.3, 1), n.z * s * rnd(1, 3), steam, 0.2, rnd(1, 1.6), rnd(0.15, 0.25), 3);
      this.grav[i] = -0.8;
    }
    _b.set((min.x + max.x) / 2, min.y + 0.05, (min.z + max.z) / 2);
    this.sparks(_b, UP, color, { count: 10, speed: 6, spread: 1.4, life: 0.4, gravity: 9 });
  }

  // dust shaken loose along a moving edge (a door sliding up)
  edgeDust(x0, x1, y, z0, z1) {
    const n = this.budget(1);
    for (let j = 0; j < n; j++) {
      _b.set(rnd(x0, x1), y, rnd(z0, z1));
      const i = this.puff(_b, rnd(-0.2, 0.2), rnd(-0.6, -0.2), rnd(-0.2, 0.2), DUST, 0.14, rnd(0.8, 1.2), rnd(0.06, 0.12), 3);
      this.drag[i] = 1.5;
      this.grav[i] = 0.6;
    }
  }

  // ---------- movement & pickups ----------
  padLaunch(p, color) {
    _b.copy(p).setY(p.y + 0.25);
    this.ring(_b, UP, color, { size: 0.6, end: 2.6, life: 0.4, thick: 0.15, k: 1.6 });
    this.ring(_b, UP, color, { size: 0.4, end: 1.8, life: 0.6, thick: 0.1, k: 1, fadeIn: 0.2 });
    this.flash(_b, color, { size: 1.2, life: 0.15, n: UP, k: 1.4 });
    this.sparks(_b, UP, color, { count: 16, speed: 13, spread: 0.3, life: 0.4, gravity: 6 });
    _w.set(color);
    for (let j = 0, c = this.budget(20); j < c; j++) {
      const a = Math.random() * Math.PI * 2, r = rnd(0.3, 0.8);
      _a.set(Math.cos(a) * r, 0, Math.sin(a) * r).add(_b);
      // swirl: tangential plus up
      const i = this.spawn(DOT, _a, -Math.sin(a) * 2.5, rnd(3, 7), Math.cos(a) * 2.5, _w, 1.4, rnd(0.4, 0.7), rnd(0.03, 0.05));
      this.drag[i] = 2;
      this.grav[i] = 2;
    }
  }

  checkpoint(p) {
    _b.copy(p).setY(p.y + 0.05);
    this.ring(_b, UP, CYAN, { size: 0.8, end: 3.2, life: 0.6, thick: 0.1, k: 1.6 });
    this.flash(_b, CYAN, { size: 1.4, life: 0.3, n: UP, k: 1.2 });
    _t.copy(p).setY(p.y + 2.3);
    this.flash(_t, CYAN, { size: 0.8, life: 0.2, k: 1.6, hot: 0.6 });
    this.sparks(_t, UP, CYAN, { count: 12, speed: 7, spread: 2, life: 0.4, gravity: 4 });
    _w.set(CYAN);
    for (let j = 0, c = this.budget(45); j < c; j++) {
      const a = Math.random() * Math.PI * 2, r = rnd(0.35, 0.7);
      _a.set(p.x + Math.cos(a) * r, p.y + rnd(0, 2.8), p.z + Math.sin(a) * r);
      const i = this.spawn(DOT, _a, -Math.sin(a) * 1.6, rnd(0.8, 2.5), Math.cos(a) * 1.6, _w, rnd(1.1, 1.6), rnd(1, 1.8), rnd(0.03, 0.05));
      this.drag[i] = 0.8;
      this.grav[i] = -1;
      this.fadeIn[i] = 0.1;
    }
  }

  // type: 'color' (a blaster color core), 'maxhp' (a prism trophy), 'health'
  pickup(p, color, type = 'color') {
    if (type === 'maxhp') {
      this.flash(p, 0xffffff, { size: 1.3, life: 0.22, k: 1.3, hot: 1 });
      HUES.forEach((h, k) => {
        this.ring(p, TILTS[k], h, { size: 0.3, end: 2.6 + k * 0.4, life: 0.5 + k * 0.08, thick: 0.08, k: 1.5 });
        this.sparks(p, UP, h, { count: 12, speed: 12, spread: 3, life: 0.5, gravity: 3 });
      });
      for (let j = 0, c = this.budget(50); j < c; j++) {
        randDir(_a).multiplyScalar(rnd(0.5, 2.5));
        const i = this.spawn(DOT, p, _a.x, _a.y + 1, _a.z, this._c.set(HUES[j % 4]), 1.5, rnd(1.6, 2.8), rnd(0.03, 0.06));
        this.drag[i] = 1.2;
        this.grav[i] = -0.4;
        this.fadeOut[i] = 2.5;
      }
      return;
    }
    this.flash(p, color, { size: type === 'color' ? 1.3 : 0.8, life: 0.2, k: 1.4, hot: 0.5 });
    this.ring(p, null, color, { size: 0.3, end: type === 'color' ? 3 : 1.6, life: 0.45, thick: 0.1, k: 1.6 });
    this.ring(p, UP, color, { size: 0.5, end: type === 'color' ? 3.6 : 2, life: 0.55, thick: 0.08, k: 1.3 });
    this.sparks(p, UP, color, { count: type === 'color' ? 30 : 14, speed: 12, spread: 3, life: 0.45, gravity: 4 });
    _w.set(color);
    if (type === 'color') {
      // the core's facets fly off
      for (let j = 0, c = this.budget(12); j < c; j++) {
        randDir(_a).multiplyScalar(rnd(3, 7));
        const i = this.shard(p, _a.x, _a.y, _a.z, _w, 1.6, rnd(0.6, 1), rnd(0.06, 0.1), 1.6);
        this.grav[i] = 6;
        this.drag[i] = 1.2;
      }
    }
    for (let j = 0, c = this.budget(type === 'color' ? 40 : 20); j < c; j++) {
      const a = Math.random() * Math.PI * 2, r = rnd(0.2, 0.9);
      _a.set(p.x + Math.cos(a) * r, p.y + rnd(-0.6, 0.4), p.z + Math.sin(a) * r);
      const i = this.spawn(DOT, _a, -Math.sin(a) * 2, rnd(1, 3), Math.cos(a) * 2, _w, rnd(1.2, 1.7), rnd(0.9, 1.6), rnd(0.03, 0.05));
      this.drag[i] = 1;
      this.grav[i] = -0.8;
    }
  }

  // Dust kicked up by a hard landing at the feet (pos), strength 0..2 (fall speed / 10).
  landDust(pos, strength = 1) {
    const s = clamp(strength, 0, 2);
    const n = this.budget(6 + s * 10);
    const k = 0.08 + s * 0.05;
    for (let j = 0; j < n; j++) {
      const a = (j / n) * Math.PI * 2 + rnd(-0.3, 0.3), sp = rnd(2, 4) * (0.6 + 0.4 * s);
      _b.set(pos.x + Math.cos(a) * 0.3, pos.y + 0.08, pos.z + Math.sin(a) * 0.3);
      const i = this.puff(_b, Math.cos(a) * sp, rnd(0.2, 0.6), Math.sin(a) * sp, DUST, k, rnd(0.6, 0.9), rnd(0.1, 0.16), 2.6);
      this.drag[i] = 3;
      this.grav[i] = -0.3;
      this.floor[i] = pos.y + 0.05;
    }
    if (s > 0.8) this.ring(_b.set(pos.x, pos.y + 0.04, pos.z), UP, DUST, { size: 0.2, end: 1.2 + s * 0.6, life: 0.3, thick: 0.1, k: 0.3 });
  }

  // a faint mote drifting down from a moving platform's underside
  thruster(p, color) {
    if (this.n > MAX * 0.5) return;
    const i = this.spawn(DOT, p, rnd(-0.15, 0.15), rnd(-1.2, -0.5), rnd(-0.15, 0.15), this._c.set(color), 0.8, rnd(0.4, 0.7), rnd(0.03, 0.05));
    this.fadeOut[i] = 1;
  }

  tracer(from, to, color, width = 0.06) {
    const m = this.tracers[this.tracerCursor];
    this.tracerCursor = (this.tracerCursor + 1) % this.tracers.length;
    const len = from.distanceTo(to);
    m.position.copy(from);
    m.lookAt(to);
    m.scale.set(width, width, len);
    m.material.color.set(color).multiplyScalar(2);
    m.material.opacity = 1;
    m.userData.life = 0.09;
    m.visible = true;
  }

  update(dt) {
    const { p, v, c0, c1, life, max, grav, drag, size, sizeEnd, len, rot, spin, fadeIn, fadeOut, floor, mode, buf } = this;
    let i = 0;
    while (i < this.n) {
      const l = life[i] - dt;
      if (l <= 0) {
        this.kill(i); // the last particle moved into slot i: process it next
        continue;
      }
      life[i] = l;
      const i3 = i * 3, m = mode[i];
      let vx = v[i3], vy = v[i3 + 1], vz = v[i3 + 2];
      if (m !== SPOT && m !== RING) {
        const k = drag[i] > 0 ? Math.max(0, 1 - drag[i] * dt) : 1;
        vx *= k;
        vz *= k;
        vy = vy * k - grav[i] * dt;
        p[i3] += vx * dt;
        p[i3 + 1] += vy * dt;
        p[i3 + 2] += vz * dt;
        if (p[i3 + 1] < floor[i]) {
          p[i3 + 1] = floor[i];
          if (vy < 0) vy *= -0.3;
          vx *= 0.6;
          vz *= 0.6;
        }
        v[i3] = vx;
        v[i3 + 1] = vy;
        v[i3 + 2] = vz;
      }
      const f = l / max[i], t = 1 - f;
      let env = Math.min(1, f * fadeOut[i]);
      if (fadeIn[i] > 0) env *= Math.min(1, t / fadeIn[i]);
      let s = size[i] * (1 + (sizeEnd[i] - 1) * t);
      let cs = env, w = s, ln = len[i];
      if (m === DOT) {
        s *= env;
        w = s;
        cs = 1;
      } else if (m === STREAK) {
        ln = s * 2 + Math.sqrt(vx * vx + vy * vy + vz * vz) * len[i];
      } else if (m === RING) {
        cs *= env; // shockwaves fade fast, then linger faintly
      } else if (m === SHARD) {
        // tumbling: the sliver foreshortens and glints as it turns
        rot[i] += spin[i] * dt;
        const g = Math.abs(Math.sin(rot[i] * 1.3));
        w = s * (0.3 + 0.7 * Math.abs(Math.cos(rot[i] * 0.7)));
        ln = s * len[i];
        cs *= 0.45 + 0.9 * g * g * g;
      }
      const o = i * STRIDE;
      buf[o] = p[i3];
      buf[o + 1] = p[i3 + 1];
      buf[o + 2] = p[i3 + 2];
      buf[o + 3] = vx;
      buf[o + 4] = vy;
      buf[o + 5] = vz;
      buf[o + 6] = (c0[i3] + (c1[i3] - c0[i3]) * t) * cs;
      buf[o + 7] = (c0[i3 + 1] + (c1[i3 + 1] - c0[i3 + 1]) * t) * cs;
      buf[o + 8] = (c0[i3 + 2] + (c1[i3 + 2] - c0[i3 + 2]) * t) * cs;
      buf[o + 9] = w;
      buf[o + 10] = ln;
      buf[o + 11] = rot[i];
      buf[o + 12] = m;
      i++;
    }
    const g = this.points.geometry;
    g.instanceCount = this.n;
    this.points.visible = this.n > 0;
    if (this.n > 0) {
      this.ibuf.clearUpdateRanges();
      this.ibuf.addUpdateRange(0, this.n * STRIDE);
      this.ibuf.needsUpdate = true;
    }
    for (const m of this.tracers) {
      if (!m.visible) continue;
      m.userData.life -= dt;
      m.material.opacity = Math.max(0, m.userData.life / 0.09);
      if (m.userData.life <= 0) m.visible = false;
    }
  }
}
