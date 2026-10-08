// Shared parts for the combat enemies (turrets, swarmers, wardens, brutes, mortars): a base class with
// color-matched hits, hit flashes, distance-faded loops and dormancy; merged-geometry building so each
// enemy is a handful of draw calls; telegraph beams; and the explosion/debris every enemy dies in.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLORS } from '../colors.js';
import { audio } from '../audio.js';
import { barks } from '../combat/barks.js';
import { esfx } from './enemySfx.js';

const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const AXES = ['x', 'y', 'z'];

export const DANGER = 0xff4a2a; // telegraph color for attacks that aren't colored shots (dives, rams, blasts)

// 1 inside `near`, fading linearly to 0 at `far`
export const falloff = (d, near, far) => THREE.MathUtils.clamp(1 - (d - near) / (far - near), 0, 1);
export const hexOf = (c) => COLORS[c].hex;

// ---- sounds ----
// Sounds the combat kit would like (see the report); until a file exists each falls back to a stock one.
const WANTED = [
  'turret_charge', 'turret_shot', 'swarm_dive', 'swarm_pop', 'warden_shield_hit', 'warden_shield_break', 'warden_shield_up',
  'brute_roar', 'brute_slam', 'mortar_launch', 'mortar_blast', 'arena_seal', 'arena_clear', 'spawn_portal', 'spawn_in',
];
audio.manifest?.then(() => audio.prefetch(WANTED));

// Play `name` if it's loaded, else the fallback sample, else the synth fallback (a function).
export function sfx(name, opts = {}, fallback = null, fbOpts = null, synth = null) {
  if (audio.sample(name, opts)) return true;
  if (fallback && audio.sample(fallback, fbOpts || opts)) return true;
  if (synth && audio.ctx) synth();
  return false;
}

// A loop by name, or the fallback loop until that file exists.
export function loopFor(name, fallback, opts) {
  return audio.createLoop(audio.available?.has(name) ? name : fallback, opts);
}

// ---- shared materials and geometry (never disposed) ----
export const MAT = {
  shell: new THREE.MeshStandardMaterial({ color: 0x3a3e4e, metalness: 0.8, roughness: 0.32, flatShading: true }),
  dark: new THREE.MeshStandardMaterial({ color: 0x101116, metalness: 0.7, roughness: 0.5, flatShading: true }),
  hot: new THREE.MeshStandardMaterial({ color: 0x1a1414, metalness: 0.6, roughness: 0.6, flatShading: true, emissive: 0x401004 }),
  hidden: new THREE.MeshBasicMaterial({ visible: false }), // invisible, but still caught by shots (hit boxes)
};
const SHARED_MATS = new Set(Object.values(MAT));
const glowCache = new Map();
// A shared unlit glow material in one of the blaster colors (for trims that never flash).
export function glowMat(color, k = 2.2) {
  const key = color + ':' + k;
  if (!glowCache.has(key)) {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(hexOf(color)).multiplyScalar(k) });
    glowCache.set(key, m);
    SHARED_MATS.add(m);
  }
  return glowCache.get(key);
}
const ADD = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };
export function additive(color, opacity = 1, extra = {}) {
  return new THREE.MeshBasicMaterial({ color, opacity, ...ADD, ...extra });
}
export const GEO = {
  sphere: shared(new THREE.SphereGeometry(1, 16, 12)),
  ico: shared(new THREE.IcosahedronGeometry(1, 0)),
  ring: shared(new THREE.RingGeometry(0.85, 1, 48)),
  disc: shared(new THREE.CircleGeometry(1, 32)),
  beam: shared(new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5)),
  cyl: shared(new THREE.CylinderGeometry(1, 1, 1, 12, 1, true)),
  chunk: shared(new THREE.BoxGeometry(1, 1, 1)),
  tetra: shared(new THREE.TetrahedronGeometry(1, 0)),
};
function shared(g) {
  g.userData.shared = true;
  return g;
}

// Collects primitive pieces per material and merges them, so a whole body is one mesh per material.
// add(mat, geo, [x, y, z], [rx, ry, rz], [sx, sy, sz])
export class Parts {
  constructor() {
    this.byMat = new Map();
  }

  add(material, geo, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
    // polyhedra come non-indexed and the rest indexed: make them all non-indexed so they can merge
    let g = geo;
    if (g.index) {
      g = geo.toNonIndexed();
      geo.dispose();
    }
    g.applyMatrix4(_m.compose(_v.set(...p), _q.setFromEuler(_e.set(r[0], r[1], r[2])), _s.set(...(typeof s === 'number' ? [s, s, s] : s))));
    if (!this.byMat.has(material)) this.byMat.set(material, []);
    this.byMat.get(material).push(g);
    return this;
  }

  // one mesh per material, added to `parent`; returns them in material order
  build(parent) {
    const out = [];
    for (const [m, geos] of this.byMat) {
      const merged = geos.length > 1 ? mergeGeometries(geos, false) : geos[0];
      if (geos.length > 1) geos.forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(merged, m);
      parent.add(mesh);
      out.push(mesh);
    }
    this.byMat.clear();
    return out;
  }
}

// Move `pos` by `d`, axis by axis, so a wall only stops the blocked component. Sub-stepped so a hard
// shove can't tunnel through a thin wall. Returns the blocked axes. (Same rules as the Drone's.)
const NONE = { x: false, y: false, z: false, any: false };
export function moveSafe(world, pos, d, pad = 0.55) {
  if (!Number.isFinite(d.lengthSq())) d.set(0, 0, 0);
  // out in the open (nothing within reach of this step): one lookup instead of six
  const reach = pad + d.length() + 0.05;
  if (reach <= 1 && !world.pointInSolid(pos, reach)) {
    pos.add(d);
    return NONE;
  }
  const steps = Math.max(1, Math.min(64, Math.ceil(d.length() / 0.25)));
  const blocked = { x: false, y: false, z: false, any: false };
  for (let s = 0; s < steps; s++) {
    for (const k of AXES) {
      const step = d[k] / steps;
      if (!step || blocked[k]) continue;
      const wasClear = !world.pointInSolid(pos, pad);
      const old = pos[k];
      pos[k] += step;
      if (world.pointInSolid(pos, wasClear ? pad : Math.min(pad, 0.25))) {
        pos[k] = old;
        blocked[k] = blocked.any = true;
      }
    }
  }
  return blocked;
}

// Height of the floor under p (within `down` m), or null.
const DOWN = new THREE.Vector3(0, -1, 0);
export function floorBelow(world, p, down = 12) {
  const hit = world.raycast(p, DOWN, down, { meshes: false });
  return hit ? hit.point.y : null;
}

// Motes and streaks converging on p over `time` seconds (a charge-up / materialize telegraph).
export function converge(fx, p, color, { count = 10, radius = 1.6, time = 0.6, size = 0.04 } = {}) {
  const c = new THREE.Color(color);
  for (let j = 0, n = fx.budget(count); j < n; j++) {
    _a.randomDirection().multiplyScalar(radius * (0.6 + Math.random() * 0.4));
    const t = time * (0.7 + Math.random() * 0.3);
    const streak = j % 2 === 0;
    const i = fx.spawn(streak ? 1 : 0, _v.copy(p).add(_a), -_a.x / t, -_a.y / t, -_a.z / t, c, 1.2, t, streak ? size * 0.4 : size);
    fx.fadeIn[i] = 0.5;
    fx.fadeOut[i] = 8;
    if (streak) fx.len[i] = 0.06;
  }
}

// A thin glowing line from a to b (laser sights, dive streaks, charge lanes). Hidden until set().
export class Beam {
  constructor(scene, color = DANGER) {
    this.mat = additive(new THREE.Color(color).multiplyScalar(2), 0.8);
    this.mesh = new THREE.Mesh(GEO.beam, this.mat);
    this.mesh.visible = false;
    this.mesh.userData.noCull = true;
    scene.add(this.mesh);
  }

  set(a, b, width = 0.04, opacity = 0.8, color = null) {
    const len = a.distanceTo(b);
    if (len < 1e-3) return this.hide();
    this.mesh.visible = true;
    this.mesh.position.copy(a);
    this.mesh.lookAt(b);
    this.mesh.scale.set(width, width, len);
    this.mat.opacity = opacity;
    if (color !== null) this.mat.color.set(color).multiplyScalar(2);
  }

  hide() {
    this.mesh.visible = false;
  }

  dispose() {
    this.mesh.parent?.remove(this.mesh);
    this.mat.dispose();
  }
}

// ---- the death: flash, shockwave, fire and smoke, and chunks of hull that bounce and cool ----
export class Blast {
  // parts: real meshes to fling (re-parented to the scene; their own geometry/materials are freed after,
  // shared ones kept). chunks: extra generic debris pieces in the dark hull and the enemy's color.
  constructor(world, pos, color, { scale = 1, parts = [], chunks = 6, vel = null, shake = 0.3, sound = true } = {}) {
    this.world = world;
    this.t = 0;
    const p = (this.pos = pos.clone());
    const hex = hexOf(color);
    const fx = world.fx;
    const k = scale;
    fx.burst(p, hex, { count: 70 * k, speed: 11 * Math.sqrt(k), life: 1, size: 0.45 * Math.sqrt(k), gravity: 6 });
    fx.burst(p, 0xffc070, { count: 50 * k, speed: 7 * Math.sqrt(k), life: 0.8, size: 0.45, gravity: 3 });
    fx.burst(p, 0xffffff, { count: 20 * k, speed: 4, life: 0.3, size: 0.8 * Math.sqrt(k), gravity: 0 });
    fx.burst(p, 0xff6a20, { count: 25 * k, speed: 3.5, life: 1.4, size: 0.55 * Math.sqrt(k), gravity: -2.5, drag: 2.5 });
    fx.burst(p, 0x3a3a44, { count: 14 * k, speed: 2, life: 2, size: 1 * Math.sqrt(k), gravity: -1.2, drag: 1.5 });
    fx.sparks(p, _v.set(0, 1, 0), hex, { count: 24 * k, speed: 16, spread: 3, life: 0.5, gravity: 8 });
    const dist = p.distanceTo(world.game.camera.position);
    if (sound) {
      if (k > 1.3) audio.droneExplode(Math.max(0.3, falloff(dist, 10, 70)));
      else audio.droneExplode(Math.max(0.15, falloff(dist, 8, 55)) * (k < 0.6 ? 0.6 : 1));
    }
    const player = world.game.player;
    player.shake = Math.max(player.shake, shake * falloff(dist, 4, 30 * Math.sqrt(k)));
    this.flashMat = additive(new THREE.Color(0xffe0b0).multiplyScalar(1.4));
    this.flash = new THREE.Mesh(GEO.sphere, this.flashMat);
    this.flash.position.copy(p);
    this.waveMat = additive(new THREE.Color(hex).multiplyScalar(2), 1, { side: THREE.DoubleSide });
    this.wave = new THREE.Mesh(GEO.ring, this.waveMat);
    this.wave.position.copy(p);
    this.wave.rotation.x = -Math.PI / 2;
    this.scale = k;
    world.scene.add(this.flash, this.wave);
    this.debris = [];
    for (const part of parts) {
      world.scene.attach(part);
      this.fling(part, vel, 1);
    }
    for (let i = 0; i < chunks; i++) {
      const glow = i % 3 === 0;
      const m = new THREE.Mesh(i % 2 ? GEO.tetra : GEO.chunk, glow ? glowMat(color) : i % 2 ? MAT.dark : MAT.shell);
      m.position.copy(p).add(_a.randomDirection().multiplyScalar(0.3 * k));
      m.scale.setScalar((glow ? 0.08 : 0.14 + Math.random() * 0.14) * Math.sqrt(k));
      m.userData.noCull = true;
      world.scene.add(m);
      this.fling(m, vel, 1.2);
    }
    world.add(this);
  }

  fling(obj, vel, power) {
    const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.5, Math.random() - 0.5).normalize().multiplyScalar((5 + Math.random() * 7) * power);
    if (vel) v.addScaledVector(vel, 0.3);
    const life = 1.4 + Math.random() * 1.2;
    this.debris.push({ obj, vel: v, life, scale: obj.scale.clone(), spin: new THREE.Vector3().randomDirection().multiplyScalar(8 + Math.random() * 10) });
  }

  update(dt) {
    const t = (this.t += dt);
    if (this.flash) {
      const k = Math.min(1, t / 0.2), s = this.scale;
      this.flash.scale.setScalar((0.5 + 1.7 * Math.sqrt(k)) * s);
      this.flashMat.opacity = (1 - k) * (1 - k);
      this.wave.scale.setScalar((1 + 6 * Math.sqrt(Math.min(1, t / 0.5))) * s);
      this.waveMat.opacity = Math.max(0, 1 - t / 0.5);
      if (t > 0.5) {
        this.world.scene.remove(this.flash, this.wave);
        this.flashMat.dispose();
        this.waveMat.dispose();
        this.flash = null;
      }
    }
    const cool = Math.max(0, 1 - t / 1.6);
    let alive = 0;
    for (const d of this.debris) {
      if (d.life <= 0) continue;
      d.life -= dt;
      alive++;
      const o = d.obj;
      d.vel.y -= 20 * dt;
      for (const k of AXES) {
        const old = o.position[k];
        o.position[k] += d.vel[k] * dt;
        if (this.world.pointInSolid(o.position, 0.08)) {
          o.position[k] = old;
          d.vel[k] *= -0.35;
          d.vel.multiplyScalar(0.75);
          d.spin.multiplyScalar(0.6);
        }
      }
      o.rotation.x += d.spin.x * dt;
      o.rotation.y += d.spin.y * dt;
      o.rotation.z += d.spin.z * dt;
      if (Math.random() < dt * 8 * cool) this.world.fx.burst(o.position, 0xff7a30, { count: 1, speed: 1, life: 0.5, size: 0.25, gravity: -1 });
      o.scale.copy(d.scale).multiplyScalar(Math.min(1, d.life / 0.4));
      if (d.life <= 0) o.visible = false;
    }
    if (!alive && !this.flash) this.dispose();
  }

  dispose() {
    this.world.remove(this);
    if (this.flash) {
      this.world.scene.remove(this.flash, this.wave);
      this.flashMat.dispose();
      this.waveMat.dispose();
      this.flash = null;
    }
    for (const d of this.debris) {
      this.world.scene.remove(d.obj);
      disposeTree(d.obj);
    }
    this.debris = [];
  }
}

// Free an object's own geometry and materials (shared kit ones are kept).
export function disposeTree(root, keep = null) {
  root.traverse((o) => {
    if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    const m = o.material;
    if (m && !SHARED_MATS.has(m) && m !== keep) m.dispose();
  });
}

// ---- base class ----
// Every combat enemy: colored (a list of colors cycles), only hurt by its current color (others ricochet),
// flashes white when hit and grey when immune, keeps a loop sound faded by distance, and goes dormant
// (no AI, no collision work) when the player is far off. Subclasses build `this.group` and call register().
export class Enemy {
  constructor(world, { pos, color = 0, hp = 3, cycle = 2.6, range = 34, wake = 70, aggro = false, onDeath = null }) {
    this.world = world;
    this.game = world.game;
    this.palette = Array.isArray(color) ? color : [color];
    this.colorIdx = 0;
    this.color = this.palette[0];
    this.shifter = this.palette.length > 1;
    this.cycle = cycle;
    this.cycleTimer = cycle;
    this.hp = this.maxHp = hp;
    this.pos = new THREE.Vector3(...pos);
    this.home = this.pos.clone();
    this.range = range;
    this.wake = Math.max(wake, range + 25);
    this.aggro = aggro;
    this.onDeath = onDeath;
    this.t = Math.random() * 100;
    this.flash = 0;
    this.immuneFlash = 0;
    this.sightEvery = 0.25; // seconds between line-of-sight checks (each is a ray through every solid)
    this.sightTimer = Math.random() * 0.25;
    this.sees = false;
    this.dist = Infinity;
    this.dead = false;
    this.gone = false;
    this.appear = 1; // 0 → 1 while materializing out of a spawn portal
    this.quietHits = true; // the blaster leaves the hit sound and sparks to us
    this.eye = new THREE.Vector3();
    this.group = new THREE.Group();
    this.group.userData.hit = this;
    this.glow = new THREE.MeshBasicMaterial({ color: 0xffffff }); // this enemy's own glow (flashes, charges)
    // armor plating faintly lit in the enemy's color, so it reads even in a dark room
    this.armor = new THREE.MeshStandardMaterial({ color: 0x3a3e4e, metalness: 0.75, roughness: 0.35, flatShading: true });
    this.mats = [this.glow, this.armor]; // per-enemy materials freed on removal
    this.barkPersona = 'lumen'; // the Lumen security network's voice (combat/barks.js)
    this.painSound = 'robot_pain_light'; // a glitchy electronic yelp on a hit (entities/enemySfx.js)
  }

  register() {
    this.group.position.copy(this.pos);
    this.world.scene.add(this.group);
    this.world.addHittable(this.group);
    this.world.add(this);
    this.applyColor();
  }

  // materialize: scale up from nothing (spawn portals call this)
  materialize() {
    this.appear = 0;
    this.group.scale.setScalar(0.01);
    this.aggro = true;
  }

  get ready() {
    return this.appear >= 1;
  }

  applyColor(k = 2.4) {
    this.glow.color.set(hexOf(this.color)).multiplyScalar(k);
    this.armor.emissive.set(hexOf(this.color)).multiplyScalar(0.16);
  }

  // per-frame bookkeeping; returns false while dormant (the subclass then skips its AI)
  tick(dt, player) {
    this.eye.copy(player.pos).y += player.eye;
    this.dist = this.pos.distanceTo(this.eye);
    this.t += dt;
    if (this.appear < 1) {
      this.appear = Math.min(1, this.appear + dt / 0.45);
      const e = 1 - Math.pow(1 - this.appear, 3);
      this.group.scale.setScalar(Math.max(0.01, e * (1 + 0.25 * Math.sin(this.appear * Math.PI))));
    }
    if (this.dist > this.wake) return false;
    this.flash = Math.max(0, this.flash - dt * 6);
    this.immuneFlash = Math.max(0, this.immuneFlash - dt * 5);
    this.sightTimer -= dt;
    if (this.sightTimer <= 0) {
      this.sightTimer = this.sightEvery;
      this.sees = this.dist < this.range && this.world.lineOfSight(this.sightFrom(), this.eye);
      if (this.sees && !this.aggro) {
        this.alert();
        barks.say(this, 'spot');
      }
      if (this.sees) this.aggro = true;
      // lost sight of you for a moment while hunting: "Visual lost. Recalculating."
      this.unseenT = this.sees || !this.aggro ? 0 : (this.unseenT || 0) + this.sightEvery;
      if (this.unseenT >= 1.5 && this.unseenT < 1.5 + this.sightEvery) barks.say(this, 'lost');
    }
    return true;
  }

  sightFrom() {
    return this.pos;
  }

  alert() {
    audio.droneAlert();
  }

  // advance a color cycle (call only when it's fair to switch, e.g. not mid-charge)
  cycleColor(dt) {
    if (!this.shifter) return false;
    this.cycleTimer -= dt;
    if (this.cycleTimer > 0) return false;
    this.cycleTimer = this.cycle;
    this.colorIdx = (this.colorIdx + 1) % this.palette.length;
    this.color = this.palette[this.colorIdx];
    this.applyColor();
    this.world.fx.ring(this.pos, null, hexOf(this.color), { size: 0.5, end: 2.2, life: 0.3, thick: 0.12, k: 1.4 });
    return true;
  }

  // glow color for this frame: white on a hit, grey when a wrong color bounced off, else `base`
  glowFlash(k = 2.4) {
    if (this.flash > 0) this.glow.color.setRGB(3, 3, 3);
    else if (this.immuneFlash > 0) this.glow.color.setRGB(0.7, 0.7, 0.8);
    else this.applyColor(k);
  }

  // direction the shot that hit us was travelling
  shotDir(hit, out = new THREE.Vector3()) {
    if (hit?.dir) out.copy(hit.dir);
    else if (hit?.point) out.subVectors(hit.point, this.game.camera.position);
    else out.subVectors(this.pos, this.game.camera.position);
    if (out.lengthSq() < 1e-6) out.set(0, 0, -1);
    return out.normalize();
  }

  onHit(color, hit) {
    if (this.dead || this.gone) return undefined;
    this.aggro = true;
    if (color !== this.color || this.deflects(hit)) {
      this.immuneFlash = 1;
      this.onImmune(hit);
      return 'immune';
    }
    return this.damage(hit, this.hitDamage(hit));
  }

  // armored spots: return true to bounce a right-color shot anyway
  deflects() {
    return false;
  }

  onImmune() {}

  hitDamage() {
    return 1;
  }

  damage(hit, amount = 1) {
    this.hp -= amount;
    this.flash = 1;
    const dir = this.shotDir(hit);
    const p = hit?.point ?? this.pos;
    this.hitFx(p, dir, amount);
    this.onDamage(hit, dir, amount);
    if (this.hp <= 0) {
      this.die(hit, dir);
      barks.died(this); // the nearest other unit reacts ("Unit offline.")
      return 'kill';
    }
    if (this.painSound) esfx(this.painSound, this.pos, 0.9, this.voicePitch ?? 1);
    barks.say(this, 'hit');
    return 'hit';
  }

  hitFx(p, dir, amount = 1) {
    const fx = this.world.fx;
    const k = amount > 1 ? 1.6 : 1;
    fx.burst(p, 0xffd9a0, { count: 18 * k, speed: 9, life: 0.4, size: 0.16, gravity: 10, dir: _a.copy(dir).multiplyScalar(-0.4) });
    fx.burst(p, hexOf(this.color), { count: 9 * k, speed: 5, life: 0.35, size: 0.22, gravity: 4 });
    audio.droneHit(Math.max(0.5, falloff(this.dist, 6, 40)));
  }

  onDamage() {}

  // default death: blow up on the spot
  die(hit, dir) {
    this.dead = true;
    this.explode({ vel: dir ? dir.clone().multiplyScalar(6) : null });
  }

  explode(opts = {}) {
    this.dead = true;
    new Blast(this.world, this.pos, this.color, opts);
    this.onDeath?.(this);
    this.remove();
  }

  // gone without a trace (an encounter resetting): a soft puff instead of an explosion
  despawn() {
    if (this.gone) return;
    this.world.fx.burst(this.pos, hexOf(this.color), { count: 16, speed: 3, life: 0.4, size: 0.3, gravity: 0 });
    this.dead = true;
    this.remove();
  }

  remove() {
    if (this.gone) return;
    this.gone = true;
    this.dead = true;
    this.hum?.stop();
    this.hum = null;
    this.world.remove(this);
    this.world.removeHittable(this.group);
    this.world.scene.remove(this.group);
    disposeTree(this.group);
    for (const m of this.mats) m.dispose();
    this.cleanup?.();
  }

  // loop volume from distance to the player; only touches the audio graph when something changed
  updateHum(rate, gain = 0.3, near = 4, far = 28) {
    if (!this.hum) return;
    const k = falloff(this.dist, near, far);
    const g = gain * k * k;
    if (Math.abs(g - (this.humGain ?? -1)) > 0.004 || (!this.hum.src && g > 0.001)) {
      this.humGain = g;
      this.hum.setGain(g);
    }
    if (Math.abs(rate - (this.humRate ?? -1)) > 0.01) {
      this.humRate = rate;
      this.hum.setRate(rate);
    }
  }

  // where shots aim: the player's chest
  aimPoint(player, out) {
    return out.copy(player.pos).setY(player.pos.y + player.eye * 0.72);
  }
}
