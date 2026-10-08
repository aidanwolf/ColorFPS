// Shared toolkit for the world creatures (verdantEnemies.js, azureEnemies.js): sounds with synth
// fallbacks, distance-faded loops, wall-safe movement, ground and water probes, the "is the player
// aiming at me" test, a shootable glob projectile, ink clouds and debris.
import * as THREE from 'three';
import { COLORS } from '../colors.js';
import { audio } from '../audio.js';
import { rayBox } from '../world.js';

export const UP = new THREE.Vector3(0, 1, 0);
export const DOWN = new THREE.Vector3(0, -1, 0);
const AXES = ['x', 'y', 'z'];
const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _c = new THREE.Color();

// 1 inside `near`, fading linearly to 0 at `far`
export const falloff = (d, near, far) => THREE.MathUtils.clamp(1 - (d - near) / (far - near), 0, 1);
export const rnd = (a, b) => a + Math.random() * (b - a);

// ---------- sound ----------
// Samples these creatures ask for (public/audio/<name>.mp3). Missing files fall back to a synth blip,
// so everything works before the sounds exist.
const SFX = [
  'slime_squelch', 'slime_leap', 'slime_splat', 'slime_regrow', 'core_chirp',
  'spider_hiss', 'spider_spit', 'spider_leap', 'spider_skitter', 'spider_land',
  'fish_alert', 'fish_dart', 'fish_leap', 'squid_jet', 'squid_charge', 'squid_torpedo', 'squid_pulse',
  'glob_pop', 'critter_hit', 'critter_die',
];
audio.manifest?.then(() => audio.prefetch(SFX));

const SYNTH = {
  slime_squelch: (g) => {
    audio.tone({ type: 'sine', f: 180, f2: 420, dur: 0.35, gain: 0.18 * g, attack: 0.03 });
    audio.noise({ dur: 0.3, gain: 0.12 * g, freq: 700, q: 3, f2: 1500 });
  },
  slime_leap: (g) => {
    audio.tone({ type: 'triangle', f: 160, f2: 620, dur: 0.22, gain: 0.2 * g });
    audio.noise({ dur: 0.2, gain: 0.15 * g, freq: 900, q: 2, f2: 2400 });
  },
  slime_splat: (g) => {
    audio.noise({ dur: 0.35, gain: 0.35 * g, freq: 600, q: 0.8, f2: 180, type: 'lowpass' });
    audio.tone({ type: 'sine', f: 140, f2: 60, dur: 0.2, gain: 0.25 * g });
  },
  slime_regrow: (g) => audio.tone({ type: 'sine', f: 120, f2: 380, dur: 0.9, gain: 0.12 * g, attack: 0.3 }),
  core_chirp: (g) => {
    audio.tone({ type: 'square', f: 1400, f2: 2200, dur: 0.06, gain: 0.06 * g });
    audio.tone({ type: 'square', f: 1800, f2: 2600, dur: 0.06, gain: 0.06 * g, delay: 0.08 });
  },
  spider_hiss: (g) => audio.noise({ dur: 0.5, gain: 0.18 * g, freq: 5000, q: 1.5, f2: 3000 }),
  spider_spit: (g) => {
    audio.noise({ dur: 0.18, gain: 0.25 * g, freq: 1800, q: 1.2, f2: 600 });
    audio.tone({ type: 'sawtooth', f: 300, f2: 110, dur: 0.12, gain: 0.08 * g });
  },
  spider_leap: (g) => audio.noise({ dur: 0.25, gain: 0.18 * g, freq: 2500, q: 1, f2: 800 }),
  spider_land: (g) => audio.tone({ type: 'square', f: 220, f2: 90, dur: 0.08, gain: 0.08 * g }),
  fish_alert: (g) => audio.tone({ type: 'square', f: 900, f2: 1600, dur: 0.12, gain: 0.07 * g }),
  fish_dart: (g) => audio.noise({ dur: 0.3, gain: 0.2 * g, freq: 900, q: 1.5, f2: 300 }),
  fish_leap: (g) => {
    audio.noise({ dur: 0.4, gain: 0.25 * g, freq: 1500, q: 0.7, f2: 500 });
    audio.tone({ type: 'sine', f: 500, f2: 900, dur: 0.15, gain: 0.08 * g });
  },
  squid_jet: (g) => audio.noise({ dur: 0.5, gain: 0.3 * g, freq: 500, q: 0.8, f2: 150, type: 'lowpass' }),
  squid_charge: (g) => audio.tone({ type: 'sine', f: 140, f2: 420, dur: 0.55, gain: 0.14 * g, attack: 0.2 }),
  squid_torpedo: (g) => {
    audio.tone({ type: 'sine', f: 220, f2: 80, dur: 0.3, gain: 0.25 * g });
    audio.noise({ dur: 0.3, gain: 0.15 * g, freq: 700, q: 1, f2: 250 });
  },
  squid_pulse: (g) => audio.tone({ type: 'sine', f: 90, f2: 70, dur: 0.4, gain: 0.1 * g, attack: 0.08 }),
  glob_pop: (g) => {
    audio.noise({ dur: 0.15, gain: 0.2 * g, freq: 1200, q: 1.5, f2: 400 });
    audio.tone({ type: 'sine', f: 600, f2: 200, dur: 0.1, gain: 0.1 * g });
  },
  critter_hit: (g) => audio.droneHit(g),
  critter_die: (g) => audio.droneExplode(g),
};

// Play a creature sound at `gain` (distance falloff already applied), or its synth stand-in.
export function sfx(name, gain = 1, opts = {}) {
  if (!audio.ctx || gain <= 0.01) return;
  if (!audio.sample(name, { gain, vary: 0.1, ...opts })) SYNTH[name]?.(gain);
}

// A looping sound whose volume follows the distance to the player (drone-hum style): silent and free
// far away, and it only touches the audio graph when something changed.
export class Voice {
  constructor(name, { gain = 0.3, near = 3, far = 22, rate = 1 } = {}) {
    this.base = gain;
    this.near = near;
    this.far = far;
    this.pitch = rate;
    this.g = -1;
    this.r = -1;
    this.h = audio.createLoop(name, { rate });
  }

  update(dist, mul = 1, rate = this.pitch) {
    if (!this.h) return;
    const k = falloff(dist, this.near, this.far);
    const g = this.base * k * k * mul;
    if (Math.abs(g - this.g) > 0.004 || (!this.h.src && g > 0.001)) {
      this.g = g;
      this.h.setGain(g);
    }
    if (Math.abs(rate - this.r) > 0.01) {
      this.r = rate;
      this.h.setRate(rate);
    }
  }

  stop() {
    this.h?.stop();
    this.h = null;
  }
}

// ---------- movement and probes ----------
// Move `pos` by `d` axis by axis, so a wall only stops the blocked component; sub-stepped so a hard
// shove can't tunnel through a thin wall. Returns the blocked axes.
export function moveSafe(world, pos, d, pad = 0.4) {
  if (!Number.isFinite(d.x + d.y + d.z)) d.set(0, 0, 0);
  const steps = Math.max(1, Math.min(48, Math.ceil(d.length() / 0.2)));
  const blocked = { x: false, y: false, z: false, any: false };
  for (let s = 0; s < steps; s++) {
    for (const k of AXES) {
      const step = d[k] / steps;
      if (!step || blocked[k]) continue;
      const wasClear = !world.pointInSolid(pos, pad);
      const old = pos[k];
      pos[k] += step;
      if (world.pointInSolid(pos, wasClear ? pad : Math.min(pad, 0.15))) {
        pos[k] = old;
        blocked[k] = blocked.any = true;
      }
    }
  }
  return blocked;
}

// A short ray (a few meters) against the solids only, like world.raycast(..., { meshes: false }) but
// looking only in the collision grid cells it passes through, so creatures can probe every frame for free.
const _cand = new Set();
const _end = new THREE.Vector3();
const _corner = new THREE.Vector3();
export function shortRay(world, origin, dir, far) {
  if (far > 6) return world.raycast(origin, dir, far, { meshes: false });
  _cand.clear();
  _end.copy(origin).addScaledVector(dir, far);
  world.gridFor(origin); // (rebuilds the grid if solids were added)
  for (const c of [origin, _end, _corner.set(origin.x, 0, _end.z), _end.clone().setZ(origin.z)]) for (const s of world.gridFor(c) || []) _cand.add(s);
  for (const s of world.loose) _cand.add(s);
  let best = null;
  let bestT = far;
  for (const s of _cand) {
    if (!s.enabled || s.noShot) continue;
    const r = rayBox(origin, dir, s.min, s.max, bestT);
    if (r) {
      bestT = r.t;
      best = { t: r.t, normal: r.normal, solid: s };
    }
  }
  if (best) best.point = origin.clone().addScaledVector(dir, best.t);
  return best;
}

// The floor under p: a solid hit straight down from `up` above p, at most `down` below it (or null).
export function groundBelow(world, p, up = 0.6, down = 3) {
  _v.copy(p).y += up;
  const hit = shortRay(world, _v, DOWN, up + down);
  return hit && hit.normal.y > 0.5 ? hit : null;
}

// The swimmable water box containing p (shrunk by `margin`), or null.
export function waterAt(world, p, margin = 0) {
  for (const w of world.waters || []) {
    if (p.x > w.min.x + margin && p.x < w.max.x - margin && p.z > w.min.z + margin && p.z < w.max.z - margin && p.y > w.min.y + margin && p.y < w.max.y - margin) return w;
  }
  return null;
}

// Keep p inside water box w, `margin` from its sides and bed and `top` under the surface.
export function clampToWater(p, w, margin = 0.5, top = margin) {
  p.x = THREE.MathUtils.clamp(p.x, w.min.x + margin, w.max.x - margin);
  p.y = THREE.MathUtils.clamp(p.y, w.min.y + margin, w.max.y - top);
  p.z = THREE.MathUtils.clamp(p.z, w.min.z + margin, w.max.z - margin);
  return p;
}

// Is the player's crosshair on (or very near) the point p? cos ~0.995 is about 5.7 degrees.
export function aimedAt(world, p, cos = 0.995) {
  const cam = world.game.camera;
  _v.subVectors(p, cam.position).normalize();
  return _v.dot(cam.getWorldDirection(_a)) > cos;
}

// Does a sphere at p (radius r) touch the player?
export function touchesPlayer(player, p, r) {
  const b = player.bounds();
  const x = Math.max(b.min.x, Math.min(p.x, b.max.x));
  const y = Math.max(b.min.y, Math.min(p.y, b.max.y));
  const z = Math.max(b.min.z, Math.min(p.z, b.max.z));
  return (x - p.x) ** 2 + (y - p.y) ** 2 + (z - p.z) ** 2 < r * r;
}

// Velocity to throw something from `from` so it lands on `to` after `t` seconds under gravity g.
export function lobVelocity(from, to, t, g, out = new THREE.Vector3()) {
  out.subVectors(to, from).divideScalar(t);
  out.y += 0.5 * g * t;
  return out;
}

// ---------- shared look ----------
const matCache = new Map();
// A glowing, unlit material in a blaster color (shared: never animate it, clone it for that)
export function glowMat(color, k = 2.4) {
  const key = 'g' + color + ':' + k;
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS[color].hex).multiplyScalar(k) }));
  return matCache.get(key);
}
export function addMat(hex, opacity = 0.8) {
  const key = 'a' + hex + ':' + opacity;
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  return matCache.get(key);
}

// A soft round glow lying on the floor under a creature (one shared texture).
let glowTex = null;
export function floorGlowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

// ---------- projectiles ----------
const globGeo = {};
// A shootable glob (acid spit, ink torpedo): flies, optionally under gravity; touching the player kills,
// a hit of its own color pops it, a solid splats it. Shared geometry, one material per color and style.
export class Glob {
  constructor(world, pos, vel, color, { radius = 0.22, gravity = 0, life = 5, style = 'acid', cause = 'shot', bubbles = false } = {}) {
    this.world = world;
    this.pos = pos.clone();
    this.vel = vel.clone();
    this.color = color;
    this.radius = radius;
    this.hitRadius = radius + 0.3;
    this.gravity = gravity;
    this.life = life;
    this.style = style;
    this.cause = cause;
    this.bubbles = bubbles;
    this.alive = true;
    this.shootable = true;
    this.t = Math.random() * 10;
    globGeo.core ??= new THREE.IcosahedronGeometry(1, 1);
    globGeo.shell ??= new THREE.IcosahedronGeometry(1, 0);
    globGeo.capsule ??= new THREE.CapsuleGeometry(0.55, 1.4, 3, 8).rotateX(Math.PI / 2);
    globGeo.nose ??= new THREE.SphereGeometry(0.62, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2).translate(0, 0, -0.95);
    const hex = COLORS[color].hex;
    this.mesh = new THREE.Group();
    if (style === 'ink') {
      // an ink torpedo: a dark capsule with a glowing nose in its color
      const key = 'inkbody';
      if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color: 0x12101c, metalness: 0.6, roughness: 0.35, emissive: 0x0a0614 }));
      const body = new THREE.Mesh(globGeo.capsule, matCache.get(key));
      const nose = new THREE.Mesh(globGeo.nose, glowMat(color, 2.6));
      const halo = new THREE.Mesh(globGeo.shell, addMat(new THREE.Color(hex).multiplyScalar(1.2).getHex(), 0.35));
      halo.scale.setScalar(1.25);
      this.mesh.add(body, nose, halo);
      this.mesh.scale.setScalar(radius);
      this.spinPart = halo;
    } else {
      // acid spit: a hot core inside a jagged additive shell
      const core = new THREE.Mesh(globGeo.core, glowMat(color, 1.6));
      core.scale.setScalar(0.6);
      const shell = new THREE.Mesh(globGeo.shell, addMat(new THREE.Color(hex).multiplyScalar(2).getHex(), 0.7));
      this.mesh.add(core, shell);
      this.mesh.scale.setScalar(radius);
      this.spinPart = shell;
    }
    this.mesh.position.copy(this.pos);
    world.scene.add(this.mesh);
    world.projectiles.push(this);
  }

  update(dt, player) {
    this.life -= dt;
    if (this.life <= 0) return this.pop(false);
    this.t += dt;
    this.vel.y -= this.gravity * dt;
    this.pos.addScaledVector(this.vel, dt);
    this.mesh.position.copy(this.pos);
    if (this.style === 'ink') {
      this.mesh.lookAt(_v.copy(this.pos).sub(this.vel));
      this.spinPart.scale.setScalar(1.2 + Math.sin(this.t * 14) * 0.12);
      if (this.bubbles && Math.random() < dt * 12) this.world.fx.bubbles(this.pos, 1);
    } else {
      this.spinPart.rotation.x += dt * 7;
      this.spinPart.rotation.y += dt * 5;
      if (Math.random() < dt * 25) this.world.fx.ember(this.pos, rnd(-0.5, 0.5), rnd(-0.2, 0.6), rnd(-0.5, 0.5), COLORS[this.color].hex, 0.4, 0.05);
    }
    if (touchesPlayer(player, this.pos, this.radius)) {
      player.damage(1, this.cause);
      return this.pop(true);
    }
    if (this.world.pointInSolid(this.pos)) this.pop(true);
  }

  onHit(color) {
    if (!this.alive) return undefined;
    if (color !== this.color) return 'immune';
    this.pop(true, true);
    return 'kill';
  }

  pop(splat = true, shot = false) {
    if (!this.alive) return;
    this.alive = false;
    const fx = this.world.fx, hex = COLORS[this.color].hex;
    if (!splat) return fx.flash(this.pos, hex, { size: 0.3, life: 0.1 });
    fx.orbPop(this.pos, hex, this.radius);
    if (this.style === 'ink') new InkCloud(this.world, this.pos, { size: shot ? 1.2 : 0.9, life: 1.8 });
    const d = this.pos.distanceTo(this.world.game.camera.position);
    sfx('glob_pop', 0.6 * falloff(d, 4, 30));
  }

  dispose() {
    this.world.scene.remove(this.mesh);
  }
}

// ---------- ink cloud ----------
let inkGeo = null;
// A billowing cloud of dark ink (normal blending, so it really hides what's behind it) that grows and
// thins out over `life` seconds, then removes itself.
export class InkCloud {
  constructor(world, pos, { size = 2, life = 3, color = 0x0d0a18 } = {}) {
    this.world = world;
    this.life = this.max = life;
    this.size = size;
    inkGeo ??= new THREE.IcosahedronGeometry(1, 1);
    this.mat = new THREE.MeshLambertMaterial({ color, emissive: 0x05030a, transparent: true, opacity: 0.85, depthWrite: false, flatShading: true });
    this.group = new THREE.Group();
    this.group.position.copy(pos);
    this.blobs = [];
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(inkGeo, this.mat);
      const o = new THREE.Vector3().randomDirection().multiplyScalar(i ? size * 0.45 : 0);
      m.position.copy(o);
      this.blobs.push({ m, o, v: o.clone().normalize().multiplyScalar(rnd(0.3, 0.8)), s: rnd(0.55, 0.9) });
      this.group.add(m);
    }
    world.scene.add(this.group);
    world.add(this);
  }

  update(dt) {
    this.life -= dt;
    const k = 1 - this.life / this.max; // 0 → 1
    const grow = this.size * (0.45 + 0.9 * Math.sqrt(k));
    for (const b of this.blobs) {
      b.o.addScaledVector(b.v, dt);
      b.m.position.copy(b.o);
      b.m.scale.setScalar(grow * b.s);
    }
    this.group.position.y += dt * 0.25;
    this.mat.opacity = 0.85 * Math.min(1, (1 - k) * 2.2);
    if (this.life <= 0) this.dispose();
  }

  dispose() {
    this.world.remove(this);
    this.world.scene.remove(this.group);
    this.mat.dispose();
  }
}

// ---------- deaths ----------
// Fling a creature's parts (already in the scene, or children of a group) as debris that bounces, cools
// and shrinks away. `mats` are disposed once it's all gone (geometry is shared, so it's kept).
export class Debris {
  constructor(world, parts, { from = null, speed = 6, mats = [], water = null } = {}) {
    this.world = world;
    this.mats = mats;
    this.water = water;
    this.list = [];
    for (const part of parts) {
      part.updateMatrixWorld(true);
      world.scene.attach(part);
      const vel = new THREE.Vector3(rnd(-1, 1), rnd(0.4, 1.2), rnd(-1, 1)).normalize().multiplyScalar(speed * rnd(0.5, 1.2));
      if (from) vel.add(_v.subVectors(part.position, from).setLength(speed * 0.4));
      const life = rnd(1.2, 2.2);
      this.list.push({ obj: part, vel, life, scale: part.scale.clone(), spin: new THREE.Vector3().randomDirection().multiplyScalar(rnd(6, 14)) });
    }
    world.add(this);
  }

  update(dt) {
    let alive = 0;
    for (const d of this.list) {
      if (d.life <= 0) continue;
      d.life -= dt;
      alive++;
      const o = d.obj;
      const wet = this.water && waterAt(this.world, o.position);
      d.vel.y -= (wet ? 3 : 20) * dt;
      if (wet) d.vel.multiplyScalar(Math.exp(-2.5 * dt));
      for (const k of AXES) {
        const old = o.position[k];
        o.position[k] += d.vel[k] * dt;
        if (this.world.pointInSolid(o.position, 0.06)) {
          o.position[k] = old;
          d.vel[k] *= -0.35;
          d.vel.multiplyScalar(0.75);
          d.spin.multiplyScalar(0.6);
        }
      }
      o.rotation.x += d.spin.x * dt;
      o.rotation.y += d.spin.y * dt;
      o.rotation.z += d.spin.z * dt;
      o.scale.copy(d.scale).multiplyScalar(Math.min(1, d.life / 0.4));
      if (wet && Math.random() < dt * 4) this.world.fx.bubbles(o.position, 1);
      if (d.life <= 0) o.visible = false;
    }
    if (!alive) this.dispose();
  }

  dispose() {
    this.world.remove(this);
    for (const d of this.list) this.world.scene.remove(d.obj);
    for (const m of this.mats) m.dispose();
    this.list = [];
  }
}

// A small machine blowing apart: a white-hot flash, a ring and sparks in its color.
export function blast(world, p, color, scale = 1) {
  const fx = world.fx, hex = COLORS[color].hex;
  fx.flash(p, 0xffe0b0, { size: 1.4 * scale, life: 0.18, k: 1.8, hot: 0.8 });
  fx.ring(p, null, hex, { size: 0.3 * scale, end: 3 * scale, life: 0.35, thick: 0.2, k: 1.8 });
  fx.burst(p, hex, { count: Math.round(50 * scale), speed: 9 * scale, life: 0.8, size: 0.32, gravity: 6 });
  fx.burst(p, 0xffc070, { count: Math.round(30 * scale), speed: 6 * scale, life: 0.6, size: 0.3, gravity: 4 });
  fx.sparks(p, UP, 0xffd9a0, { count: 16, speed: 12, spread: 2.5, life: 0.5 });
}

// Correct-color hit feedback: sparks out of the impact along the shot plus a puff of its color.
export function hitSparks(world, hit, p, color) {
  const fx = world.fx;
  _a.copy(hit?.dir ?? UP).multiplyScalar(0.4);
  fx.burst(p, 0xffd9a0, { count: 16, speed: 8, life: 0.4, size: 0.15, gravity: 10, dir: _a });
  fx.burst(p, COLORS[color].hex, { count: 8, speed: 5, life: 0.35, size: 0.2, gravity: 4 });
}

// set a material's color to a blaster color times k (for per-instance glow materials)
export function tint(mat, color, k) {
  mat.color.copy(_c.set(COLORS[color].hex)).multiplyScalar(k);
}

// Every live creature (any class flagged `critter`) goes back to its post when the player respawns.
// Registered once per level by the builders (see levels/builders.js).
export function resetCritters(world) {
  for (const e of world.entities) if (e.critter && !e.dead) e.reset();
}
