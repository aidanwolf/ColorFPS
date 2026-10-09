// The ghost of Dr. Wren Ashby: while one of her audio logs plays, a hologram of her materializes a few
// metres from you and acts out the moment she recorded it (vignettes.js), in time with her voice.
//
//  - one figure, built once at startup and kept hidden (holo.js: one skinned mesh, one shared hologram
//    material, a few thousand triangles, her props and the vignette's little set pieces in the same mesh);
//  - a procedural rig: keyframed poses (cumulative keys, monotone-cubic interpolation, so motion eases and
//    never overshoots), two-bone IK for the legs (feet stay planted while she kneels, crouches, sits) and
//    optionally the hands, a procedural walk / run cycle wherever her body moves across the floor, and
//    living layers on top: breathing, weight shifts, head drift, a swinging ponytail, a shiver;
//  - placement: in front of you, in view, on clear floor big enough for her vignette (and where the space is
//    tight, as close to where you look as fits);
//  - in: a scan line builds her from the floor up with a hum; out (the log ends or is stopped): she dissolves
//    into motes; farther than 40 m away she fades (the voice plays on); every few seconds the projection
//    glitches, and her voice stutters with it (recorder.js / voice.js).
// No allocations per frame: every temporary is preallocated.
import * as THREE from 'three';
import { audio } from '../audio.js';
import { buildFigure, buildBones, holoMaterial, propMask, BONE_INDEX as BI, LEN, TAIL_DIR, SET_PROPS } from './holo.js';
import { VIGNETTES, DEFAULT_VIGNETTE } from './vignettes.js';

const D2R = Math.PI / 180;
const FAR = 40; // she fades out beyond this (m)
const REVEAL_TIME = 1.7;
const DISSOLVE_TIME = 1.6;
const MOTES = 90;

// ---------------------------------------------------------------- pose channels
// name, defaults. Angles in degrees. All positions are in the body frame "B" (see `at`).
//  at: the body frame on the stage [x, y, z, yaw]: where she is and which way she faces (moving it walks her)
//  hips: pelvis offset in B; hipsR: [pitch, yaw, roll]; spine/chest/neck/head: [pitch(+ forward), yaw(+ her
//  left), roll]; l/rClav: [shrug, forward]; l/rArm: [elevation (0 down, 90 level, 170 up), azimuth (0 ahead,
//  90 out to the side, <0 across her), twist]; l/rFore: [elbow bend, twist]; l/rHand: [flex, twist, tilt];
//  l/rFoot: ankle [x, y, z, yaw, pitch(+ toe up)]; knees: outward splay of each knee; l/rIK: a hand target in
//  B [x, y, z, weight]; gait: 0 stops the walk cycle while `at` moves (jumps, climbs); swing: arm swing
//  while walking; breath: [depth, rate]; shiver: cold / fear tremble; ride: 1 while the vignette's riding set
//  pieces (its `ride` list: a swivel chair) move with her, 0 leaves them where they are.
export const CHANNELS = [
  ['at', [0, 0, 0, 0]],
  ['hips', [0, 0.95, 0]],
  ['hipsR', [0, 0, 0]],
  ['spine', [0, 0, 0]],
  ['chest', [0, 0, 0]],
  ['neck', [0, 0, 0]],
  ['head', [0, 0, 0]],
  ['lClav', [0, 0]],
  ['rClav', [0, 0]],
  ['lArm', [7, 80, 0]],
  ['rArm', [7, 80, 0]],
  ['lFore', [12, 0]],
  ['rFore', [12, 0]],
  ['lHand', [0, 0, 0]],
  ['rHand', [0, 0, 0]],
  ['lFoot', [0.1, 0.075, 0.03, 7, 0]],
  ['rFoot', [-0.1, 0.075, -0.02, -7, 0]],
  ['knees', [6, 6]],
  ['lIK', [0.2, 1.0, 0.3, 0]],
  ['rIK', [-0.2, 1.0, 0.3, 0]],
  ['gait', [1]],
  ['swing', [1]],
  ['breath', [1, 1]],
  ['shiver', [0]],
  ['ride', [1]],
];
const OFF = {};
let SIZE = 0;
for (const [n, d] of CHANNELS) {
  OFF[n] = SIZE;
  SIZE += d.length;
}
const DEFAULT = new Float32Array(SIZE);
for (const [n, d] of CHANNELS) DEFAULT.set(d, OFF[n]);

// Compile a vignette: cumulative keys → full poses, monotone cubic tangents, the walk phase table.
function compile(v) {
  const keys = [];
  const cur = Float32Array.from(DEFAULT);
  let props = v.props || [];
  const sets = Object.keys(v.set || {}); // the set pieces stay up the whole vignette
  for (const [t, pose = {}] of v.keys) {
    for (const k in pose) {
      if (k === 'props') continue;
      const o = OFF[k];
      if (o === undefined) {
        console.warn('[ghost] unknown channel', k);
        continue;
      }
      const val = pose[k];
      const arr = Array.isArray(val) ? val : [val];
      arr.forEach((x, i) => x !== null && x !== undefined && (cur[o + i] = x));
    }
    if (pose.props) props = pose.props;
    keys.push({ t, p: Float32Array.from(cur), mask: propMask([...props, ...sets]) });
  }
  if (!keys.length) keys.push({ t: 0, p: Float32Array.from(DEFAULT), mask: propMask([...props, ...sets]) });
  // Fritsch–Carlson tangents per element (zero at both ends: every vignette eases in and out)
  const n = keys.length;
  for (const k of keys) k.m = new Float32Array(SIZE);
  for (let e = 0; e < SIZE; e++) {
    const d = [];
    for (let i = 0; i < n - 1; i++) d.push((keys[i + 1].p[e] - keys[i].p[e]) / Math.max(1e-3, keys[i + 1].t - keys[i].t));
    for (let i = 1; i < n - 1; i++) keys[i].m[e] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) {
        keys[i].m[e] = 0;
        keys[i + 1].m[e] = 0;
        continue;
      }
      const a = keys[i].m[e] / d[i], b = keys[i + 1].m[e] / d[i];
      const s = a * a + b * b;
      if (s > 9) {
        const tau = 3 / Math.sqrt(s);
        keys[i].m[e] = tau * a * d[i];
        keys[i + 1].m[e] = tau * b * d[i];
      }
    }
  }
  const c = { ...v, keys, end: keys[n - 1].t };
  // walk phase: φ advances with distance over stride, sampled every 1/50 s (seeks land exactly)
  const N = Math.ceil((c.end + 1) * 50) + 2;
  c.phase = new Float32Array(N);
  c.speed = new Float32Array(N);
  const a = new Float32Array(SIZE), b = new Float32Array(SIZE);
  let ph = 0;
  for (let i = 0; i < N; i++) {
    const t = i / 50;
    sample(c, t - 0.04, a);
    sample(c, t + 0.04, b);
    const dx = b[OFF.at] - a[OFF.at], dz = b[OFF.at + 2] - a[OFF.at + 2];
    const sp = Math.hypot(dx, dz) / 0.08;
    c.speed[i] = sp;
    c.phase[i] = ph;
    ph += (sp / stride(sp)) / 50;
  }
  // footprint for placement: everywhere she goes plus every set piece
  c.foot = [];
  for (const k of keys) c.foot.push([k.p[OFF.at], k.p[OFF.at + 2]]);
  for (const [, s] of Object.entries(v.set || {})) c.foot.push([s[0], s[2]]);
  return c;
}
const stride = (v) => Math.min(2.4, Math.max(0.55, 0.5 + 0.45 * v));

// the pose at time t into out
function sample(c, t, out) {
  const K = c.keys;
  if (t <= K[0].t) return out.set(K[0].p);
  if (t >= c.end) return out.set(K[K.length - 1].p);
  let i = 0;
  while (i < K.length - 2 && K[i + 1].t <= t) i++;
  const A = K[i], B = K[i + 1], h = B.t - A.t, u = (t - A.t) / h;
  const u2 = u * u, u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
  for (let e = 0; e < SIZE; e++) out[e] = h00 * A.p[e] + h10 * h * A.m[e] + h01 * B.p[e] + h11 * h * B.m[e];
}
function maskAt(c, t) {
  let m = c.keys[0].mask;
  for (const k of c.keys) if (k.t <= t) m = k.mask;
  return m;
}
function table(arr, t) {
  const x = Math.max(0, Math.min(arr.length - 1.001, t * 50)), i = Math.floor(x), f = x - i;
  return arr[i] * (1 - f) + arr[i + 1] * f;
}

const COMPILED = new Map();
function vignette(id) {
  if (!COMPILED.has(id)) COMPILED.set(id, compile(VIGNETTES[id] || DEFAULT_VIGNETTE));
  return COMPILED.get(id);
}

// ---------------------------------------------------------------- temporaries
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _nz = new THREE.Vector3();
const _bX = new THREE.Vector3(), _bY = new THREE.Vector3(), _bZ = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _qp = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _m = new THREE.Matrix4();
const DOWN = new THREE.Vector3(0, -1, 0), UPV = new THREE.Vector3(0, 1, 0), XV = new THREE.Vector3(1, 0, 0), YV = new THREE.Vector3(0, 1, 0);
const _gq = new THREE.Quaternion(); // the stage's world rotation
const smooth = (a, b, x) => {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
};
const EMPTY = [];
const SIDES = [1, -1];
const AHEAD = [0, 14, -14, 28, -28, 40, -40]; // placement angles off the view direction (degrees)
const WIDE = [55, -55, 75, -75, 100, -100];
const DISTS = [1, 0.85, 1.2, 1.45, 0.65]; // ... and distances, times the vignette's
const LR = ['l', 'r'];
const bf = { x: 0, z: 0, y: 0, s: 0, c: 1 }; // the body frame this frame: position, sin/cos of its yaw
// a body-frame point → stage
function toStage(x, y, z, out) {
  return out.set(bf.x + x * bf.c + z * bf.s, bf.y + y, bf.z - x * bf.s + z * bf.c);
}
function angles(bone, P, o, ax, ay, az) {
  _e.set((P[o] + ax) * D2R, (P[o + 1] + ay) * D2R, (P[o + 2] + az) * D2R, 'YXZ');
  bone.quaternion.setFromEuler(_e);
}

// ---------------------------------------------------------------- mote shader (rising light off her)
const MOTE_VERT = /* glsl */ `
attribute vec4 seed;
uniform float uTime, uAmt, uBurst, uScale, uTop;
uniform vec3 uCenter;
varying float vA;
void main() {
  float speed = 0.12 + seed.x * 0.16 + uBurst * 0.5;
  float life = fract(uTime * speed + seed.y);
  float ang = seed.z * 6.2832 + uTime * (0.3 + seed.w * 0.4) * (seed.x > 0.5 ? 1.0 : -1.0);
  float r = (0.08 + seed.w * 0.26) * (1.0 + uBurst * 1.6 * life);
  float hgt = seed.z * uTop * 0.85 + life * (0.3 * uTop + uBurst * 1.2);
  vec3 p = uCenter + vec3(cos(ang) * r, hgt, sin(ang) * r);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vA = sin(3.14159 * life) * uAmt * (0.4 + 0.6 * fract(seed.y * 7.13 + uTime * 0.7));
  gl_PointSize = (0.022 + seed.x * 0.02) * (1.0 + uBurst) * uScale / max(0.2, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const MOTE_FRAG = /* glsl */ `
varying float vA;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.0, length(d)) * vA;
  gl_FragColor = vec4(vec3(0.6, 1.4, 1.7), a);
}`;

export class Ghost {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.recorder = null; // set by the recorder
    this.mat = holoMaterial();
    this.U = this.mat.uniforms;
    const geo = buildFigure();
    this.tris = geo.index.count / 3;
    this.bones = buildBones();
    this.group = new THREE.Group();
    this.group.name = 'wren-ghost';
    this.group.userData.noCull = true; // she moves around: world culling would leave her behind
    const mesh = (this.mesh = new THREE.SkinnedMesh(geo, this.mat));
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    mesh.add(this.bones[0]);
    this.group.add(mesh);
    mesh.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(this.bones));
    // her depth first (same shader, no colour), so only her nearest surface glows
    const depth = (this.depthMesh = new THREE.SkinnedMesh(geo, holoMaterial(this.mat)));
    depth.frustumCulled = false;
    depth.renderOrder = 4;
    this.group.add(depth);
    depth.bind(mesh.skeleton, mesh.bindMatrix);
    const b = (n) => this.bones[BI[n]];
    this.B = Object.fromEntries(Object.keys(BI).map((n) => [n, b(n)]));
    // per side (left, right): its bones and pose offsets, so the per-frame loops build no strings
    this.sides = LR.map((s) => ({
      Clav: b(s + 'Clav'), Arm: b(s + 'Arm'), Fore: b(s + 'Fore'), Hand: b(s + 'Hand'), Thigh: b(s + 'Thigh'), Shin: b(s + 'Shin'), Foot: b(s + 'Foot'),
      oClav: OFF[s + 'Clav'], oArm: OFF[s + 'Arm'], oFore: OFF[s + 'Fore'], oHand: OFF[s + 'Hand'], oFoot: OFF[s + 'Foot'], oIK: OFF[s + 'IK'],
    }));
    // motes
    const mg = new THREE.BufferGeometry();
    const seeds = new Float32Array(MOTES * 4);
    for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
    mg.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));
    mg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MOTES * 3), 3));
    this.moteMat = new THREE.ShaderMaterial({
      vertexShader: MOTE_VERT,
      fragmentShader: MOTE_FRAG,
      uniforms: { uTime: { value: 0 }, uAmt: { value: 0 }, uBurst: { value: 0 }, uScale: { value: 600 }, uTop: { value: 1.8 }, uCenter: { value: new THREE.Vector3() } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.motes = new THREE.Points(mg, this.moteMat);
    this.motes.frustumCulled = false;
    this.motes.renderOrder = 6;
    this.group.add(this.motes);
    this.group.visible = false;
    game.scene.add(this.group);
    this.world.add(this);

    this.pose = new Float32Array(SIZE);
    this.state = 'off'; // off | in | on | out
    this.c = null;
    this.k = 0; // time in the current state
    this.clock = 0;
    this.fade = 1; // distance fade
    this.glitchT = 0;
    this.nextGlitch = 3;
    this.flickT = 0;
    this.tailDir = new THREE.Vector3().copy(DOWN);
    this.tailVel = new THREE.Vector3();
    this.tailInit = false;
    this.forceT = null; // tests: pin the vignette clock
    this.riders = [];
  }

  // ---------------------------------------------------------------- lifecycle
  start(id) {
    const c = (this.c = vignette(id));
    this.id = id;
    this.place(c);
    for (const n of SET_PROPS) {
      const s = c.set?.[n], bone = this.B['set_' + n];
      if (s) {
        bone.position.set(s[0], s[1], s[2]);
        bone.rotation.set(0, (s[3] || 0) * D2R, 0);
      } else bone.position.set(0, -50, 0);
    }
    // set pieces that ride along with her (a swivel chair spins and rolls with her)
    this.riders.length = 0;
    for (const n of c.ride || []) this.riders.push(this.B['set_' + n]);
    this.state = 'in';
    this.k = 0;
    this.fade = 1;
    this.tailInit = false;
    this.nextGlitch = 2.2 + Math.random() * 2;
    this.lastMask = -1;
    this.group.visible = true;
    this.U.uReveal.value = 0;
    this.U.uHeight.value = c.height || 1.75;
    this.U.uDissolve.value = 0;
    this.U.uAlpha.value = 1;
    this.moteMat.uniforms.uBurst.value = 0.6;
    this.hum(true);
  }

  end() {
    if (this.state === 'off' || this.state === 'out') return;
    this.state = 'out';
    this.k = 0;
    this.hum(false);
  }

  // ---------------------------------------------------------------- placement
  groundAt(x, yTop, z) {
    const W = this.world;
    _v4.set(x, yTop, z);
    const cell = W.gridFor(_v4) || EMPTY;
    let best = -Infinity;
    for (const list of [cell, W.loose || EMPTY]) {
      for (const s of list) {
        if (!s.enabled) continue;
        if (x < s.min.x || x > s.max.x || z < s.min.z || z > s.max.z) continue;
        if (s.max.y <= yTop + 0.01 && s.max.y > best) best = s.max.y;
      }
    }
    return best;
  }

  clearAt(x, g, z) {
    const W = this.world;
    return !W.pointInSolid(_v4.set(x, g + 0.35, z), 0.12) && !W.pointInSolid(_v4.set(x, g + 1.45, z), 0.12);
  }

  // Try spots in front of the player (nearest the view direction first) until the vignette's footprint
  // fits on clear, level floor in sight of the camera.
  place(c) {
    const p = this.game.player.pos, cam = this.game.camera;
    cam.getWorldDirection(_v);
    _v.y = 0;
    if (_v.lengthSq() < 1e-4) _v.set(0, 0, -1);
    _v.normalize();
    const base = Math.atan2(_v.x, _v.z);
    const dist = (c.dist || 3.6) + 0.5; // (a little farther than the stage needs: she stands clear of the log card)
    const view = (c.view ?? 28) * D2R;
    const tryFit = (strict, wide) => {
      // the right distance a little off-centre beats dead ahead but cramped
      for (const k of DISTS) {
        for (const da of wide ? WIDE : AHEAD) {
          const a = base + da * D2R, d = dist * k;
          const cx = p.x + Math.sin(a) * d, cz = p.z + Math.cos(a) * d;
          const g = this.groundAt(cx, p.y + 0.45, cz); // (never up on a crate or a rail)
          if (!(g > p.y - 1.5)) continue;
          if (!this.clearAt(cx, g, cz)) continue;
          // the stage faces the player, turned a little so we see her three-quarters on
          const yaw = Math.atan2(p.x - cx, p.z - cz) + view;
          const sn = Math.sin(yaw), cs = Math.cos(yaw);
          let ok = true;
          if (strict) {
            for (const [fx, fz] of c.foot) {
              for (const [ox, oz] of [[0, 0], [0.35, 0], [-0.35, 0], [0, 0.35], [0, -0.35]]) {
                const lx = fx + ox, lz = fz + oz;
                const wx = cx + lx * cs + lz * sn, wz = cz - lx * sn + lz * cs;
                const gg = this.groundAt(wx, g + 0.6, wz);
                if (!(Math.abs(gg - g) < 0.3) || !this.clearAt(wx, g, wz)) {
                  ok = false;
                  break;
                }
              }
              if (!ok) break;
            }
          }
          if (!ok) continue;
          if (!this.world.lineOfSight(cam.position, _v3.set(cx, g + 1.2, cz))) continue;
          this.group.position.set(cx, g, cz);
          this.group.rotation.set(0, yaw, 0);
          return true;
        }
      }
      return false;
    };
    // in view with room for the whole vignette; else in view, just room for her; else (a tight space) right
    // where you're looking, a couple of metres out at your feet's height; else off to one side
    if (!tryFit(true, false) && !tryFit(false, false)) {
      let look = 2.4;
      while (look > 1.3 && !(this.clearAt(p.x + _v.x * look, p.y, p.z + _v.z * look) && this.world.lineOfSight(cam.position, _v3.set(p.x + _v.x * look, p.y + 1.2, p.z + _v.z * look)))) look -= 0.5;
      if (look > 1.3 || (!tryFit(true, true) && !tryFit(false, true))) {
        this.group.position.set(p.x + _v.x * Math.max(look, 1.4), p.y, p.z + _v.z * Math.max(look, 1.4));
        this.group.rotation.set(0, base + Math.PI + view, 0);
      }
    }
    this.group.updateMatrixWorld(true);
    _gq.setFromEuler(this.group.rotation);
    this.U.uBase.value = this.group.position.y;
  }

  // ---------------------------------------------------------------- per frame
  update(dt, player) {
    if (this.state === 'off') return;
    this.k += dt;
    this.clock += dt;
    const U = this.U;
    const rec = this.recorder;
    const t = this.forceT ?? (rec?.cur ? rec.time() : this.lastT ?? 0);
    this.lastT = t;
    if (this.state === 'in') {
      U.uReveal.value = smooth(0, 1, this.k / REVEAL_TIME) * 1.02;
      if (this.k >= REVEAL_TIME) {
        this.state = 'on';
        U.uReveal.value = 20; // all of her (and any tall set piece)
      }
    } else if (this.state === 'out') {
      U.uDissolve.value = Math.min(1, this.k / DISSOLVE_TIME);
      this.moteMat.uniforms.uBurst.value = Math.min(1, this.k * 2);
      if (this.k >= DISSOLVE_TIME + 0.4) {
        this.state = 'off';
        this.group.visible = false;
        return;
      }
    }
    // farther than FAR: she fades out (and back in if you return while the log still plays)
    const d = Math.hypot(player.pos.x - this.group.position.x, player.pos.z - this.group.position.z);
    const want = d > FAR ? 0 : d > FAR - 6 ? (FAR - d) / 6 : 1;
    this.fade += (want - this.fade) * Math.min(1, dt * 3);
    U.uAlpha.value = this.fade;
    if (this.fade < 0.01 && this.state !== 'out') {
      this.mesh.visible = this.depthMesh.visible = false;
      this.motes.visible = false;
      return;
    }
    this.mesh.visible = this.depthMesh.visible = true;
    this.motes.visible = true;

    U.uTime.value = this.clock;
    this.moteMat.uniforms.uTime.value = this.clock;
    this.moteMat.uniforms.uScale.value = this.game.renderer.domElement.height * 0.9;
    if (this.state !== 'out') this.moteMat.uniforms.uBurst.value = Math.max(0, this.moteMat.uniforms.uBurst.value - dt * 0.5);
    this.moteMat.uniforms.uAmt.value = this.fade * (this.state === 'out' ? Math.max(0, 1.4 - this.k * 0.6) : 0.55 + this.moteMat.uniforms.uBurst.value);
    this.flicker(dt);

    // props by the vignette's clock (a change flashes the props, as if re-projected)
    const mask = maskAt(this.c, t);
    if (mask !== this.lastMask) {
      if (this.lastMask !== -1) U.uPropFlash.value = 1;
      this.lastMask = mask;
      U.uMask.value = mask[0];
      U.uMask2.value = mask[1];
    }
    U.uPropFlash.value = Math.max(0, U.uPropFlash.value - dt * 3);
    this.animate(t, dt);
  }

  flicker(dt) {
    const U = this.U;
    // a glitch every few seconds: slices jump, the image stutters, her voice drops out with it
    this.nextGlitch -= dt;
    if (this.nextGlitch <= 0 && this.state === 'on') {
      const dur = 0.07 + Math.random() * 0.2;
      this.glitchT = dur;
      this.nextGlitch = 2.6 + Math.random() * 5.5;
      this.recorder?.ghostGlitch(dur);
      if (this.fade > 0.3) audio.noise({ dur: 0.05 + dur * 0.5, gain: 0.05, freq: 3800, q: 2.5, f2: 1200 });
    }
    const g = this.state === 'in' ? Math.max(0, 1 - this.k / REVEAL_TIME) * (Math.random() < 0.3 ? 1 : 0) : this.state === 'out' ? Math.min(1, this.k * 1.5) * (Math.random() < 0.4 ? 1 : 0) : 0;
    if (this.glitchT > 0) this.glitchT -= dt;
    const on = this.glitchT > 0 ? 1 : g;
    U.uGlitch.value = on;
    if (on > 0 && Math.random() < 0.6) U.uSeed.value = Math.random() * 100;
    // camera-right is the direction the glitch slices jump
    const e = this.game.camera.matrixWorld.elements;
    U.uGlitchDir.value.set(e[0], e[1], e[2]);
    // flicker: a soft breathing shimmer with the odd dip
    this.flickT -= dt;
    let f = 0.9 + 0.06 * Math.sin(this.clock * 13.0) + 0.04 * Math.sin(this.clock * 31.7);
    if (this.flickT <= 0 && Math.random() < dt * 0.8) this.flickT = 0.04 + Math.random() * 0.08;
    if (this.flickT > 0) f *= 0.45;
    if (on > 0) f *= 0.6 + Math.random() * 0.8;
    U.uFlick.value = f;
  }

  // ---------------------------------------------------------------- the rig
  animate(t, dt) {
    const c = this.c, P = this.pose, B = this.B;
    _gq.copy(this.group.quaternion);
    sample(c, t, P);
    const o = OFF;
    const bx = P[o.at], by = P[o.at + 1], bz = P[o.at + 2], byaw = P[o.at + 3] * D2R;
    const sb = Math.sin(byaw), cb = Math.cos(byaw);
    bf.x = bx;
    bf.y = by;
    bf.z = bz;
    bf.s = sb;
    bf.c = cb;
    // walk cycle
    const sp = table(c.speed, t), ph = table(c.phase, t);
    const gw = P[o.gait] * smooth(0.12, 0.45, sp);
    const rb = smooth(1.8, 3.4, sp);
    const idle = 1 - gw;
    const T = this.clock;
    const br = P[o.breath], brRate = P[o.breath + 1];
    const breath = Math.sin(T * (6.2832 / 3.8) * brRate) * br;
    const shiver = P[o.shiver];
    const shv = shiver * (Math.sin(T * 41) * 0.6 + Math.sin(T * 57) * 0.4);

    // hips
    const bob = 0.022 * Math.cos(ph * 12.566) * (1 - rb) + 0.03 * Math.abs(Math.sin(ph * 6.2832)) * rb;
    const hx = P[o.hips] + idle * 0.012 * Math.sin(T * 1.05);
    const hy = P[o.hips + 1] * (1 - gw) + gw * (0.935 - 0.06 * rb + bob);
    const hz = P[o.hips + 2];
    toStage(hx, hy, hz, B.hips.position);
    _e.set((P[o.hipsR] + gw * rb * 12) * D2R, byaw + (P[o.hipsR + 1] - gw * 5 * Math.cos(ph * 6.2832)) * D2R, (P[o.hipsR + 2] + idle * 1.2 * Math.sin(T * 1.05)) * D2R, 'YXZ');
    B.hips.quaternion.setFromEuler(_e);
    angles(B.spine, P, o.spine, -breath * 0.8 + shv * 0.6, gw * 2 * Math.cos(ph * 6.2832), 0);
    angles(B.chest, P, o.chest, -breath * 1.4, gw * 3 * Math.cos(ph * 6.2832) + shv, 0);
    angles(B.neck, P, o.neck, breath * 0.6, 0, 0);
    angles(B.head, P, o.head, idle * (1.8 * Math.sin(T * 0.71 + 1)) + breath * 0.5, idle * (3.2 * Math.sin(T * 0.47) + 1.6 * Math.sin(T * 1.31)), idle * 1.2 * Math.sin(T * 0.53));
    // shoulders, arms
    for (let si = 0; si < 2; si++) {
      const side = SIDES[si], S = this.sides[si];
      const clav = S.Clav;
      const raise = P[S.oClav] + breath * 1.2 + shv * 1.5, fwd = P[S.oClav + 1];
      _e.set(0, -side * fwd * D2R, side * raise * D2R, 'YXZ');
      clav.quaternion.setFromEuler(_e);
      const el = Math.min(175, P[S.oArm]) * D2R, az = P[S.oArm + 1] * D2R, tw = P[S.oArm + 2] * D2R;
      _v.set(side * Math.sin(az) * Math.sin(el), -Math.cos(el), Math.cos(az) * Math.sin(el));
      _q.setFromUnitVectors(DOWN, _v);
      _q2.setFromAxisAngle(YV, side * tw);
      _q.multiply(_q2);
      // arm swing while walking: the arm opposite the forward leg comes forward
      const swing = gw * P[o.swing] * (16 + 26 * rb) * -side * Math.cos(ph * 6.2832) * D2R;
      _q2.setFromAxisAngle(XV, -swing);
      S.Arm.quaternion.multiplyQuaternions(_q2, _q);
      _e.set(-(P[S.oFore] + gw * rb * 70) * D2R, side * P[S.oFore + 1] * D2R, 0, 'YXZ');
      S.Fore.quaternion.setFromEuler(_e);
      _e.set(P[S.oHand] * D2R, side * P[S.oHand + 1] * D2R, side * P[S.oHand + 2] * D2R, 'YXZ');
      S.Hand.quaternion.setFromEuler(_e);
    }
    // the projection pool follows her across the floor
    B.glow.position.set(bx + hx * cb + hz * sb, by + 0.03, bz - hx * sb + hz * cb);
    this.moteMat.uniforms.uCenter.value.set(B.glow.position.x, by, B.glow.position.z);
    if (P[o.ride] > 0.5) {
      for (const r of this.riders) {
        r.position.set(bx, by, bz);
        r.rotation.set(0, byaw, 0);
      }
    }
    this.moteMat.uniforms.uTop.value = Math.max(0.7, hy * 1.85);
    this.group.updateMatrixWorld(true);

    // legs: two-bone IK onto the feet (keyed, or the walk cycle's)
    for (let si = 0; si < 2; si++) {
      const side = SIDES[si], S = this.sides[si];
      const f = S.oFoot;
      let fx = P[f], fy = P[f + 1], fz = P[f + 2], fyaw = P[f + 3], fp = P[f + 4];
      if (gw > 0.001) {
        const st = 0.62 - 0.24 * rb, D = stride(sp) * st;
        const u = (ph + (side > 0 ? 0 : 0.5)) % 1;
        let z, lift = 0, pitch;
        if (u < st) {
          const w = u / st;
          z = D * (0.5 - w);
          pitch = 12 * (1 - smooth(0, 0.3, w)) - 22 * smooth(0.7, 1, w);
          lift = 0.05 * smooth(0.75, 1, w);
        } else {
          const w = (u - st) / (1 - st);
          z = D * (-0.5 + smooth(0, 1, w));
          lift = Math.sin(Math.PI * w) * (0.08 + 0.16 * rb) + 0.05 * (1 - smooth(0, 0.25, w));
          pitch = -22 + 34 * smooth(0.2, 1, w);
        }
        fx += (side * 0.095 - fx) * gw;
        fy += (0.075 + lift - fy) * gw;
        fz += (z - fz) * gw;
        fyaw += (side * 5 - fyaw) * gw;
        fp += (pitch - fp) * gw;
      }
      toStage(fx, fy, fz, _v2);
      this.group.localToWorld(_v2); // ankle target, world
      const ky = (fyaw + side * P[o.knees + (side > 0 ? 0 : 1)]) * D2R + byaw;
      _v3.set(Math.sin(ky), 0.15, Math.cos(ky)).applyQuaternion(_gq); // knee pole, world
      this.solveLimb(S.Thigh, S.Shin, LEN.thigh, LEN.shin, _v2, _v3, 1, 1);
      // the foot: its own yaw and pitch in the world, under the shin
      _e.set(-fp * D2R, byaw + fyaw * D2R, 0, 'YXZ');
      _q.setFromEuler(_e).premultiply(_gq);
      S.Foot.quaternion.copy(_qp.invert()).multiply(_q); // _qp: the shin's world rotation
    }
    // hands reaching for something (rope, wall, pipe): IK, blended over the keyed arm
    for (let si = 0; si < 2; si++) {
      const side = SIDES[si], S = this.sides[si];
      const k = S.oIK, w = P[k + 3];
      if (w < 0.01) continue;
      toStage(P[k], P[k + 1], P[k + 2], _v2);
      this.group.localToWorld(_v2);
      _v3.set(side * 0.5, -0.6, -0.6);
      _v3.applyAxisAngle(UPV, byaw).applyQuaternion(_gq);
      this.solveLimb(S.Arm, S.Fore, LEN.arm, LEN.fore, _v2, _v3, -1, Math.min(1, w));
    }
    this.group.updateMatrixWorld(true);
    this.ponytail(dt);
  }

  // Two-bone IK in world space. Sets the upper and lower bones' local rotations so the chain reaches target
  // (clamped to its length) with its middle joint toward pole; bend: +1 knees (bend side = pole side),
  // -1 elbows (bend side away from the pole). w blends from the current (keyed) rotations. Leaves the lower
  // bone's world rotation in _qp.
  solveLimb(upper, lower, l1, l2, target, pole, bend, w) {
    upper.getWorldPosition(_x);
    const root = _x;
    _y.subVectors(target, root);
    const dist = Math.min(l1 + l2 - 0.002, Math.max(0.05, _y.length()));
    _y.normalize(); // dir root → target
    const ca = Math.min(1, Math.max(-1, (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist)));
    const a = Math.acos(ca);
    // the pole, square to the reach
    _z.copy(pole).addScaledVector(_y, -pole.dot(_y));
    if (_z.lengthSq() < 1e-6) _z.set(0, 0, 1);
    _z.normalize();
    // the middle joint
    _v4.copy(root).addScaledVector(_y, Math.cos(a) * l1).addScaledVector(_z, Math.sin(a) * l1);
    // upper bone: its -Y along root→joint, its +Z toward the bend side
    _v.subVectors(_v4, root).normalize();
    this.basis(_v, bend > 0 ? _z : _nz.copy(_z).negate(), _q);
    upper.parent.getWorldQuaternion(_q2);
    _q3.copy(_q2).invert().multiply(_q);
    if (w < 1) upper.quaternion.slerp(_q3, w);
    else upper.quaternion.copy(_q3);
    // recompute the upper bone's actual world rotation (after any blend)
    _q2.multiply(upper.quaternion);
    // lower bone: its -Y along joint→target
    if (w < 1) {
      // the blended upper arm moved the joint: aim from where the joint really is
      _v4.set(0, -l1, 0).applyQuaternion(_q2).add(root);
    }
    _v.subVectors(target, _v4);
    if (_v.lengthSq() < 1e-8) _v.copy(_y);
    _v.normalize();
    _z.addScaledVector(_v, -_z.dot(_v));
    if (_z.lengthSq() < 1e-6) _z.set(0, 0, 1);
    _z.normalize();
    this.basis(_v, bend > 0 ? _z : _nz.copy(_z).negate(), _q);
    _q3.copy(_q2).invert().multiply(_q);
    if (w < 1) lower.quaternion.slerp(_q3, w);
    else lower.quaternion.copy(_q3);
    _qp.copy(_q2).multiply(lower.quaternion);
  }

  // rotation whose -Y is dir and whose +Z is (as near as square allows) fwd
  basis(dir, fwd, out) {
    const Y = _bY.copy(dir).negate();
    const Z = _bZ.copy(fwd).addScaledVector(Y, -fwd.dot(Y));
    if (Z.lengthSq() < 1e-8) Z.set(0, 0, 1).addScaledVector(Y, -Y.z);
    Z.normalize();
    const X = _bX.crossVectors(Y, Z);
    _m.makeBasis(X, Y, Z);
    out.setFromRotationMatrix(_m);
    return out;
  }

  // The ponytail: a damped spring in world space pulling it down her back, so it lags, swings and settles.
  ponytail(dt) {
    const head = this.B.head, tail = this.B.tail;
    head.getWorldQuaternion(_q);
    // where it would hang: its rest direction in the head, pulled toward straight down
    _v.copy(TAIL_DIR).applyQuaternion(_q).multiplyScalar(0.55).add(_v2.copy(DOWN).multiplyScalar(0.65)).normalize();
    if (!this.tailInit || dt > 0.25) {
      this.tailDir.copy(_v);
      this.tailVel.set(0, 0, 0);
      this.tailInit = true;
    } else {
      const k = 90, damp = 9;
      this.tailVel.addScaledVector(_v.sub(this.tailDir), k * dt).multiplyScalar(Math.max(0, 1 - damp * dt));
      this.tailDir.addScaledVector(this.tailVel, dt).normalize();
    }
    // into head space, as a rotation of the rest direction
    _v.copy(this.tailDir).applyQuaternion(_q.invert());
    tail.quaternion.setFromUnitVectors(TAIL_DIR, _v);
  }

  // ---------------------------------------------------------------- sound
  // Materializing: a low hum swelling under a rising shimmer; dissolving: the shimmer falling away.
  hum(on) {
    const ctx = audio.ctx;
    if (!ctx || !audio.sfxBus) return;
    const t0 = ctx.currentTime, out = audio.sfxBus;
    const g = ctx.createGain();
    g.connect(out);
    const len = on ? 2.4 : 1.8;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(on ? 0.22 : 0.16, t0 + (on ? 0.5 : 0.08));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
    const oscs = [];
    for (const [f, type, lvl] of [[on ? 82 : 110, 'sine', 0.8], [on ? 164.5 : 220, 'triangle', 0.25], [on ? 1318 : 1760, 'sine', 0.05], [on ? 1323 : 1754, 'sine', 0.05]]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f, t0);
      o.frequency.exponentialRampToValueAtTime(f * (on ? 1.5 : 0.5), t0 + len);
      const og = ctx.createGain();
      og.gain.value = lvl;
      o.connect(og).connect(g);
      o.start(t0);
      o.stop(t0 + len + 0.05);
      oscs.push(o);
    }
    audio.noise({ dur: on ? 1.5 : 1.2, gain: 0.07, freq: on ? 400 : 3500, f2: on ? 4200 : 300, q: 3 });
  }
}
