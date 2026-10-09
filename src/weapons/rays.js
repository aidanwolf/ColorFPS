// Shared plumbing for the held weapons (the sun beam, the water cannon) and the glob launcher:
//  - castRay: World.raycast for many rays a frame: the hittables' matrices are refreshed once a frame and
//    each ray only tests the hittables whose bounds it passes near (and, for the stream's arc, only the
//    solids in the arc's box). Mesh hits get their true world-space face normal (normal matrix, so a
//    scaled panel reflects correctly), turned to face the ray.
//  - HitClock: continuous fire lands discrete onHit ticks, one per target every TICK s (the red blaster's
//    fire interval), so every target in the game reacts to a held beam the way it does to red's stream
//    of shots.
//  - TubePool: pooled glowing tubes (beam and stream segments), one shader material each, made up front.
//  - SynthLoop: a looping WebAudio voice (noise or oscillators) on the loop bus.
import * as THREE from 'three';
import { audio } from '../audio.js';
import { Drone } from '../entities/drone.js';

export const TICK = 0.13; // = FIRE_INTERVAL in weapon.js
const _nm = new THREE.Matrix3();
const _p = new THREE.Vector3(), _q = new THREE.Vector3(), _c3 = new THREE.Vector3(), _box = new THREE.Box3();
const radii = new WeakMap(); // hittable root -> { r, t } (its bounds' radius about its origin, when measured)
let stamp = -1;

// Refresh every hittable's world matrix once per world tick (World.raycast would on every call).
export function freshen(world) {
  if (stamp === world.time) return;
  stamp = world.time;
  for (const o of world.hitTargets) o.updateMatrixWorld(true);
}

function rootRadius(world, o) {
  let rec = radii.get(o);
  // (re-measured now and then: things grow in from spawn portals, bosses unfold)
  if (!rec || world.time - rec.t > 2) {
    _box.setFromObject(o);
    const c = _c3.setFromMatrixPosition(o.matrixWorld);
    const r = _box.isEmpty() ? 0 : Math.max(_box.min.distanceTo(c), _box.max.distanceTo(c));
    rec = { r: r * 1.25 + 0.6, t: world.time };
    radii.set(o, rec);
  }
  return rec.r;
}

const _targets = [];
// The hittables whose bounds come within reach of the segment origin → origin + dir * len.
export function targetsNear(world, origin, dir, len, out = _targets) {
  out.length = 0;
  for (const o of world.hitTargets) {
    const r = rootRadius(world, o);
    const e = o.matrixWorld.elements;
    _p.set(e[12], e[13], e[14]).sub(origin);
    const t = Math.max(0, Math.min(len, _p.dot(dir)));
    _q.copy(dir).multiplyScalar(t);
    if (_p.distanceToSquared(_q) < r * r) out.push(o);
  }
  return out;
}

// The solids touching a box (for a batch of short rays inside it, like the stream's arc).
export function solidsIn(world, min, max, out = []) {
  out.length = 0;
  for (const s of world.solids) {
    if (!s.enabled || s.noShot) continue;
    if (s.max.x < min.x || s.min.x > max.x || s.max.y < min.y || s.min.y > max.y || s.max.z < min.z || s.min.z > max.z) continue;
    out.push(s);
  }
  return out;
}

// One ray, like world.raycast(origin, dir, far, { projectiles }), with the hit's normal in world space.
export function castRay(world, origin, dir, far, { projectiles = true, solids } = {}) {
  freshen(world);
  const hit = world.raycast(origin, dir, far, { projectiles, solids: solids || world.solids, targets: targetsNear(world, origin, dir, far), fresh: true });
  if (hit) worldNormal(hit, dir);
  return hit;
}

export function worldNormal(hit, dir) {
  if (hit.object && hit.face) hit.normal = hit.face.normal.clone().applyNormalMatrix(_nm.getNormalMatrix(hit.object.matrixWorld)).normalize();
  if (!hit.normal) hit.normal = dir.clone().negate();
  else if (hit.normal.dot(dir) > 0) hit.normal.negate(); // (a double-sided panel hit from behind)
  return hit.normal;
}

// When each target last took a tick, and what it answered (a beam held on a mirror keeps reflecting
// between ticks; one held on a wrong-color barrier keeps glancing off it).
export class HitClock {
  constructor() {
    this.map = new Map();
  }

  due(entity, now) {
    const r = this.map.get(entity);
    return !r || now - r.t >= TICK - 1e-4;
  }

  last(entity) {
    return this.map.get(entity)?.res;
  }

  set(entity, now, res) {
    this.map.set(entity, { t: now, res });
  }

  // forget targets not touched for a while (and everything when the trigger is released)
  prune(now, keep = 1) {
    for (const [e, r] of this.map) if (now - r.t > keep) this.map.delete(e);
  }

  clear() {
    this.map.clear();
  }
}

// ---------------------------------------------------------------- tubes
// A strip along +z (0..1) that the vertex shader turns to face the camera (a ribbon whose width runs
// across the view, so it reads the same from the side or looking straight down it), stretched to the
// segment's length, tapered from a thin start (at the muzzle) to full width over uTaper m, shimmering.
// The fragment shader gives it a soft round profile, a hot core down the middle and noise that streams
// along it.
const STRIP_STEPS = 24;
const tubeVertex = `
  uniform float uLen, uR0, uR1, uTaper, uTime, uWob, uPhase;
  varying float vAlong;
  varying float vSide;
  void main() {
    float along = position.z * uLen;
    float s = along + uPhase; // metres from the start of the whole beam (continuous across segments)
    float k = clamp(s / max(uTaper, 0.001), 0.0, 1.0);
    float r = mix(uR0, uR1, k * (2.0 - k));
    r *= 1.0 + uWob * (0.6 * sin(uTime * 41.0 + s * 2.7) + 0.4 * sin(uTime * 23.0 - s * 5.3));
    vec4 c = modelViewMatrix * vec4(0.0, 0.0, along, 1.0);
    vec3 axis = normalize((modelViewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz);
    vec3 side = cross(axis, normalize(c.xyz));
    float sl = length(side);
    side = sl > 1e-4 ? side / sl : vec3(1.0, 0.0, 0.0);
    c.xyz += side * r * position.x;
    vAlong = s;
    vSide = position.x;
    gl_Position = projectionMatrix * c;
  }`;

const tubeFragment = `
  uniform vec3 uColor, uCore;
  uniform float uTime, uAlpha, uSoft, uCoreP, uFreq, uSpeed, uNoise, uFade0, uFade1, uAdd;
  varying float vAlong;
  varying float vSide;
  float hash(float n) { return fract(sin(n) * 43758.5453); }
  float noise(float x) { float i = floor(x), f = fract(x); return mix(hash(i), hash(i + 1.0), f * f * (3.0 - 2.0 * f)); }
  void main() {
    float f = 1.0 - abs(vSide);
    float glow = pow(f, uSoft);
    float core = pow(f, uCoreP);
    float n = noise(vAlong * uFreq - uTime * uSpeed) * 0.6 + noise(vAlong * uFreq * 2.7 - uTime * uSpeed * 1.7) * 0.4;
    float streak = mix(1.0, 0.45 + 1.1 * n, uNoise);
    // far fade (the stream breaking up past its range)
    float fade = 1.0 - smoothstep(uFade0, uFade1, vAlong);
    vec3 c = uColor * glow * streak + uCore * core * (0.8 + 0.4 * n);
    float a = clamp((glow * streak * 0.8 + core) * uAlpha * fade, 0.0, 1.0);
    // additive: light, scaled by its strength; blended: a color seen through its own alpha
    gl_FragColor = uAdd > 0.5 ? vec4(c * uAlpha * fade, a) : vec4((uColor * glow * streak + uCore * core * (0.8 + 0.4 * n)) / (glow * streak + core * (0.8 + 0.4 * n) + 0.001), a);
  }`;

function stripGeometry() {
  const pos = [], idx = [];
  for (let i = 0; i <= STRIP_STEPS; i++) {
    const z = i / STRIP_STEPS;
    pos.push(-1, 0, z, 1, 0, z);
    if (i < STRIP_STEPS) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0.5), 1e4);
  return g;
}

export class TubePool {
  // o: { additive, r0, r1, taper, color, core, soft, coreP, freq, speed, noise, wob, alpha, fade0, fade1 }
  constructor(scene, count, o) {
    this.list = [];
    this.used = 0;
    const geo = stripGeometry();
    for (let i = 0; i < count; i++) {
      const m = new THREE.ShaderMaterial({
        uniforms: {
          uLen: { value: 1 }, uR0: { value: o.r0 }, uR1: { value: o.r1 }, uTaper: { value: o.taper ?? 2 }, uTime: { value: 0 }, uWob: { value: o.wob ?? 0.1 }, uPhase: { value: 0 },
          uColor: { value: new THREE.Color(o.color) }, uCore: { value: new THREE.Color(o.core) }, uAlpha: { value: o.alpha ?? 1 }, uSoft: { value: o.soft ?? 1.5 },
          uCoreP: { value: o.coreP ?? 8 }, uFreq: { value: o.freq ?? 1.5 }, uSpeed: { value: o.speed ?? 20 }, uNoise: { value: o.noise ?? 0.5 },
          uFade0: { value: o.fade0 ?? 1e5 }, uFade1: { value: o.fade1 ?? 2e5 }, uAdd: { value: o.additive ? 1 : 0 },
        },
        vertexShader: tubeVertex,
        fragmentShader: tubeFragment,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
      const mesh = new THREE.Mesh(geo, m);
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 6;
      mesh.userData.noCull = true;
      mesh.userData.noBatch = true;
      scene.add(mesh);
      this.list.push(mesh);
    }
  }

  begin() {
    this.used = 0;
  }

  // one segment; phase: metres of tube already drawn before it (so the taper and the streaming noise
  // run on smoothly across segments). Returns its material's uniforms for per-segment tweaks.
  seg(a, b, phase, time) {
    if (this.used >= this.list.length) return null;
    const m = this.list[this.used++];
    const len = a.distanceTo(b);
    if (len < 1e-4) {
      this.used--;
      return null;
    }
    m.position.copy(a);
    m.lookAt(b);
    m.visible = true;
    const u = m.material.uniforms;
    u.uLen.value = len;
    u.uPhase.value = phase;
    u.uTime.value = time;
    return u;
  }

  end() {
    for (let i = this.used; i < this.list.length; i++) this.list[i].visible = false;
  }

  hide() {
    this.used = 0;
    this.end();
  }

  // set a uniform on every segment
  all(name, v) {
    for (const m of this.list) {
      const u = m.material.uniforms[name];
      if (u.value?.isColor) u.value.set(v);
      else u.value = v;
    }
  }
}

// ---------------------------------------------------------------- synth loops
// make(ctx, out) builds the voice into `out` and returns its sources (started); the voice is built
// when audio is up and the gain first goes above zero, and torn down after a while silent.
export class SynthLoop {
  constructor(make) {
    this.make = make;
    this.gain = 0;
    this.v = null;
    this.quiet = 0;
  }

  set(g, dt = 0) {
    const ctx = audio.ctx;
    if (!ctx || !audio.loopBus) return;
    if (!this.v) {
      if (g <= 0.001) return;
      const out = ctx.createGain();
      out.gain.value = 0;
      out.connect(audio.loopBus);
      this.v = { out, ...this.make(ctx, out) };
    }
    if (Math.abs(g - this.gain) > 0.003) {
      this.v.out.gain.setTargetAtTime(g, ctx.currentTime, 0.05);
      this.gain = g;
    }
    this.quiet = g <= 0.001 ? this.quiet + dt : 0;
    if (this.quiet > 2) this.stop();
  }

  stop() {
    if (!this.v) return;
    const ctx = audio.ctx, v = this.v;
    this.v = null;
    this.gain = 0;
    v.out.gain.setTargetAtTime(0, ctx.currentTime, 0.04);
    for (const s of v.srcs || []) s.stop(ctx.currentTime + 0.3);
    setTimeout(() => v.out.disconnect(), 500);
  }
}

// ---------------------------------------------------------------- landing ticks
// What a held weapon's beam/stream does to what it touches this frame, as Blaster.trace does per shot:
// onHit when the target's clock is due (else its last answer stands), mirror solids reflect, glass stops.
// Fills and returns out: { result, ticked, quiet }.
export function touch(hit, color, clock, now, out = {}) {
  out.result = 'world';
  out.ticked = false;
  out.quiet = false;
  const e = hit.entity;
  if (e?.onHit) {
    if (clock.due(e, now)) {
      out.result = e.onHit(color, hit) || 'hit';
      clock.set(e, now, out.result);
      out.ticked = true;
    } else out.result = clock.last(e) ?? 'hit';
  }
  // (drones, and enemies with quietHits, play their own hit sounds and sparks)
  const quiet = e instanceof Drone || e?.quietHits;
  if (quiet && (out.result === 'hit' || out.result === 'kill')) out.quiet = true;
  else if (hit.solid?.mirror) out.result = 'mirror';
  else if (hit.solid?.glass) out.result = 'glass';
  return out;
}

// filtered white noise (a hiss, a rush of water); returns the filter so callers can sweep it
export function noiseVoice(type = 'bandpass', freq = 1800, q = 0.8) {
  return (ctx, out) => {
    const src = ctx.createBufferSource();
    src.buffer = audio.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    src.connect(f).connect(out);
    src.start(ctx.currentTime, Math.random() * 0.5);
    return { srcs: [src], filter: f };
  };
}
