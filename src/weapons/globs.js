// GLOB LAUNCHER (the green blaster): lobs gooey green globs on an arc (hold to keep lobbing). A glob
// bursts on whatever it hits: a demolition blast that lands onHit(GREEN, hit) on everything within
// BLAST_R that the blast can see. Like every shot, a glob glances off mirrors and wrong-color surfaces
// (it bounces on, and bursts on the next thing), so the old bank-shot locks still take green.
//
// blast(world, point, radius, color, opts) is exported for anything else that wants the same burst.
// What a blast does to each thing in range (with a clear line from the blast centre):
//   onHit(color, hit) with hit.kind = 'blast', hit.power = BLAST_POWER, hit.point (on the thing),
//     hit.normal, hit.dir (outward from the blast), hit.part / hit.object (the part the blast reached).
//     Things with hit points (a numeric `hp`: enemies, drones, bosses) take BLAST_POWER calls, about
//     what that many red shots do; everything else (switches, barriers, targets, movers) takes one call
//     and can read hit.power (a shot-pushed mover gives a blast that many kicks: shotmech.js).
//   entity.knock (a Vector3, as drones and brutes have) is shoved outward whatever the color.
//   entity.onSplash(point, radius, color) is called on every world entity that has it (they judge the
//     distance themselves): soak a sponge, splash a pool, blow a seed pod.
//   Enemy projectiles in range are popped (onHit). The player is pushed (no damage): a glob at your feet
//   as you jump is a small rocket jump.
import * as THREE from 'three';
import { COLORS, GREEN } from '../colors.js';
import { audio } from '../audio.js';
import { castRay } from './rays.js';

export const GLOB_INTERVAL = 0.62; // s between globs (~1.6 a second)
const SPEED = 25; // m/s out of the muzzle
const GRAVITY = 15;
const FUSE = 3.5; // s before one bursts in mid-air
const MAX_RICOCHETS = 4;
const RADIUS = 0.13;
export const BLAST_R = 2.6;
export const BLAST_POWER = 3; // red hits' worth per thing caught in a blast
const PUSH = 7.5; // m/s the blast gives the player at its centre
const POOL = 10;
const HEX = COLORS[GREEN].hex;
const GOO = new THREE.Color(0x3dff7a);
const GOO_DARK = new THREE.Color(0x0e5a24);
const UP = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3(), _m = new THREE.Vector3(), _step = new THREE.Vector3(), _p = new THREE.Vector3(), _v = new THREE.Vector3();
const _a = new THREE.Vector3(), _c = new THREE.Vector3(), _box = new THREE.Box3(), _s = new THREE.Sphere();
const rnd = (a, b) => a + Math.random() * (b - a);

// a soft round glow, drawn once
let glowTex = null;
function softTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const grad = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = grad;
  x.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

audio.manifest?.then(() => audio.prefetch(['mortar_launch', 'slime_squelch', 'glob_pop', 'slime_splat', 'crab_explode', 'shoot_green']));

export class GlobLauncher {
  constructor(blaster) {
    this.blaster = blaster;
    this.game = blaster.game;
    this.cooldown = 0;
    this.now = 0;
    this.globs = [];
    // pooled globs: a glossy translucent shell round a glowing heart, a couple of drips trailing it and a
    // soft glow, made up front and kept hidden
    const shell = new THREE.MeshStandardMaterial({ color: 0x18c040, emissive: 0x0a7a2a, emissiveIntensity: 0.9, roughness: 0.06, metalness: 0.15, envMapIntensity: 1.6, transparent: true, opacity: 0.8 });
    const heart = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9dffb0).multiplyScalar(2.2) });
    const halo = new THREE.SpriteMaterial({ map: softTexture(), color: new THREE.Color(0x3dff7a).multiplyScalar(0.9), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const shellGeo = new THREE.IcosahedronGeometry(RADIUS, 3);
    const heartGeo = new THREE.IcosahedronGeometry(RADIUS * 0.55, 1);
    for (let i = 0; i < POOL; i++) {
      const g = new THREE.Group();
      const body = new THREE.Group();
      body.add(new THREE.Mesh(heartGeo, heart), new THREE.Mesh(shellGeo, shell));
      // drips trailing behind (the group's +y is its direction of flight)
      const drips = [0.62, 0.4].map((k, j) => {
        const d = new THREE.Mesh(shellGeo, shell);
        d.scale.setScalar(k);
        d.position.y = -RADIUS * (1.1 + j * 0.85);
        body.add(d);
        return d;
      });
      const glow = new THREE.Sprite(halo);
      glow.scale.setScalar(0.75);
      g.add(body, glow);
      g.visible = false;
      g.userData.noCull = true;
      g.userData.noBatch = true;
      this.game.scene.add(g);
      this.globs.push({ mesh: g, body, drips, alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), off: new THREE.Vector3(), life: 0, bounces: 0, wob: 0, t: 0 });
    }
    this.light = this.game.world.addLight(0x46ff80, 0, 10, 1.5);
    this.lightT = 0;
  }

  update(dt, want) {
    this.now += dt;
    this.cooldown -= dt;
    if (want && this.cooldown <= 0) this.fire();
    for (const g of this.globs) if (g.alive) this.fly(g, dt);
    // the blast's flash of light dies away
    if (this.lightT > 0) {
      this.lightT = Math.max(0, this.lightT - dt);
      this.light.intensity = 60 * (this.lightT / 0.3) ** 2;
    }
  }

  release() {
    for (const g of this.globs) this.kill(g);
    this.light.intensity = 0;
    this.lightT = 0;
  }

  fire() {
    this.cooldown = GLOB_INTERVAL;
    const game = this.game, cam = game.camera, b = this.blaster;
    b.bringUp();
    b.pose();
    cam.getWorldDirection(_dir);
    b.muzzleWorld(_m);
    const g = this.globs.find((x) => !x.alive) || this.globs.reduce((a, x) => (x.life > a.life ? x : a));
    if (g.alive) this.burst(g, g.pos, null, null);
    // it flies from the eye (so it goes where you aim) but is drawn from the muzzle, the gap closing fast
    g.pos.copy(cam.position);
    g.vel.copy(_dir).multiplyScalar(SPEED);
    g.vel.y += 1.2; // a touch of loft
    g.off.subVectors(_m, cam.position);
    g.life = 0;
    g.bounces = 0;
    g.wob = 1;
    g.t = Math.random() * 10;
    g.alive = true;
    g.mesh.visible = true;
    g.mesh.position.copy(_m);
    // the pump: a wet thump, a big springy kick, a splutter of goo
    audio.sample('mortar_launch', { gain: 0.5, rate: 1.55, vary: 0.06 }) || audio.shoot(GREEN);
    audio.sample('slime_squelch', { gain: 0.35, rate: 1.4, vary: 0.1 });
    b.kick(3.4);
    b.flash = 5;
    b.models[GREEN].fire();
    const fx = game.world.fx;
    fx.flash(_m, HEX, { size: 0.14, life: 0.08, k: 1.8, hot: 0.5 });
    for (let i = 0; i < 6; i++) {
      _v.copy(_dir).multiplyScalar(rnd(2, 5)).add(_a.randomDirection().multiplyScalar(1.2)).add(game.player.vel);
      const k = fx.spawn(0, _m, _v.x, _v.y, _v.z, GOO, 1.2, rnd(0.25, 0.45), rnd(0.012, 0.022));
      fx.grav[k] = 9;
    }
  }

  fly(g, dt) {
    const world = this.game.world, fx = world.fx;
    g.life += dt;
    g.t += dt;
    if (g.life > FUSE) return this.burst(g, g.pos, null, null);
    const wet = this.inWater(g.pos);
    g.vel.y -= GRAVITY * (wet ? 0.3 : 1) * dt;
    if (wet) g.vel.multiplyScalar(Math.max(0, 1 - 1.6 * dt));
    _step.copy(g.vel).multiplyScalar(dt);
    let len = _step.length();
    if (len > 1e-5) {
      _dir.copy(_step).divideScalar(len);
      const hit = castRay(world, g.pos, _dir, len + RADIUS);
      if (hit) {
        if (this.contact(g, hit)) return;
        len = 0;
      }
    }
    if (len) g.pos.add(_step);
    // drawn: the muzzle offset closes within a few metres; it wobbles like jelly, stretched along its flight
    g.off.multiplyScalar(Math.exp(-dt * 14));
    g.mesh.position.copy(g.pos).add(g.off);
    g.wob = Math.max(0, g.wob - dt * 2.2);
    const sp = g.vel.length();
    if (sp > 0.1) g.mesh.quaternion.setFromUnitVectors(UP, _v.copy(g.vel).divideScalar(sp));
    const j = Math.sin(g.t * 26) * (0.08 + g.wob * 0.25);
    g.body.scale.set(1 - j * 0.5, 1 + Math.min(0.35, sp * 0.012) + j, 1 - j * 0.5);
    g.body.rotation.y += dt * 9;
    // the drips stream out further the faster it goes, and wobble on their own
    for (let i = 0; i < 2; i++) g.drips[i].position.y = -RADIUS * (0.8 + i * 0.6) * (0.85 + Math.min(0.4, sp * 0.015)) + Math.sin(g.t * 19 + i * 2) * 0.012;
    // a trail: glowing motes and drips of goo
    if (Math.random() < dt * 60) {
      const k = fx.spawn(0, g.mesh.position, rnd(-0.3, 0.3), rnd(-0.3, 0.3), rnd(-0.3, 0.3), GOO, 1.1, rnd(0.2, 0.35), rnd(0.03, 0.05));
      fx.drag[k] = 3;
    }
    if (Math.random() < dt * 14) {
      const k = fx.spawn(0, g.mesh.position, g.vel.x * 0.15, g.vel.y * 0.15, g.vel.z * 0.15, GOO_DARK, 1.8, rnd(0.4, 0.7), rnd(0.02, 0.03));
      fx.grav[k] = 12;
    }
    if (wet && Math.random() < dt * 20) fx.bubbles?.(g.mesh.position, 1);
  }

  inWater(p) {
    for (const w of this.game.world.waters || []) if (p.x > w.min.x && p.x < w.max.x && p.z > w.min.z && p.z < w.max.z && p.y > w.min.y && p.y < w.max.y) return true;
    return false;
  }

  // It touched something: mirrors and wrong colors bounce it on, anything else bursts it. True if it's gone.
  contact(g, hit) {
    const n = hit.normal, fx = this.game.world.fx;
    const e = hit.entity;
    _dir.copy(g.vel).normalize();
    hit.dir = _dir.clone();
    hit.kind = 'blast';
    hit.power = BLAST_POWER;
    let res = hit.solid?.mirror ? 'mirror' : null;
    let direct = null;
    if (!res && e?.onHit) {
      res = e.onHit(GREEN, hit) || 'hit';
      direct = { entity: e, res, hit };
    }
    if ((res === 'mirror' || res === 'immune') && g.bounces < MAX_RICOCHETS) {
      g.bounces++;
      const keep = res === 'mirror' ? 0.9 : 0.62;
      g.pos.copy(hit.point).addScaledVector(n, RADIUS + 0.02);
      g.vel.addScaledVector(n, -2 * g.vel.dot(n)).multiplyScalar(keep);
      g.wob = 1;
      _p.copy(hit.point).addScaledVector(n, 0.02);
      const tint = typeof e?.color === 'number' ? COLORS[e.color]?.hex : null;
      fx.impact(_p, n, HEX, res === 'mirror' ? 'mirror' : 'ricochet', _dir, tint);
      if (res === 'mirror') audio.mirrorHit();
      else {
        audio.ricochet();
        this.game.hud.hitmarker(true);
      }
      audio.sample('slime_squelch', { gain: 0.3, rate: 1.7, vary: 0.15 });
      return false;
    }
    this.burst(g, hit.point, n, direct, hit);
    return true;
  }

  kill(g) {
    g.alive = false;
    g.mesh.visible = false;
  }

  burst(g, point, n, direct, hit = null) {
    this.kill(g);
    const at = point.clone();
    if (n) at.addScaledVector(n, 0.12);
    const outcome = blast(this.game.world, at, BLAST_R, GREEN, { direct, normal: n, glass: !!hit?.solid?.glass });
    if (outcome.hit) this.game.hud.hitmarker(false, outcome.crit);
    this.light.position.copy(at);
    this.lightT = 0.3;
    this.light.intensity = 60;
  }
}

// ---------------------------------------------------------------- the blast
const _cands = new Map();

// The burst and what it does (see the top of this file). opts: { direct: { entity, res, hit } (what the
// glob struck, already hit once), normal (the struck surface, for the look), power, push (player shove)
// }. Returns { hit, crit, count }.
export function blast(world, at, radius, color, { direct = null, normal = null, power = BLAST_POWER, push = PUSH, glass = false } = {}) {
  const game = world.game, fx = world.fx;
  const point = at.clone();
  const hex = COLORS[color].hex;
  const outcome = { hit: false, crit: false, count: 0 };
  explosionFx(fx, point, normal, hex, radius, glass);
  const cam = game.camera.position;
  const dist = cam.distanceTo(point);
  const g = Math.max(0.25, 1 - dist / 45);
  audio.sample('glob_pop', { gain: 0.9 * g, rate: 0.85, vary: 0.1 }) || audio.explode();
  audio.sample('slime_splat', { gain: 0.8 * g, vary: 0.1 });
  audio.sample('crab_explode', { gain: 0.35 * g, rate: 1.25, vary: 0.1 });
  const pl = game.player;
  pl.shake = Math.max(pl.shake || 0, 0.35 * Math.max(0, 1 - dist / 14));

  // what it reaches: a ray from the centre to each candidate must land on it first
  const done = new Set();
  const apply = (e, hit, already = 0) => {
    if (done.has(e)) return;
    done.add(e);
    hit.kind = 'blast';
    hit.power = power;
    hit.dir = hit.dir || _v.subVectors(hit.point, point).normalize().clone();
    const calls = typeof e.hp === 'number' ? power : 1;
    for (let i = already; i < calls; i++) {
      const r = e.onHit(color, hit) || 'hit';
      if (r === 'hit' || r === 'kill') {
        outcome.hit = true;
        outcome.count++;
        if (hit.crit) outcome.crit = true;
      }
      if (r !== 'hit') break;
    }
  };
  if (direct) {
    const { entity: e, res, hit } = direct;
    if (res === 'hit' || res === 'kill') {
      outcome.hit = true;
      outcome.count++;
      if (hit.crit) outcome.crit = true;
    }
    if (res === 'hit') apply(e, hit, 1);
    else done.add(e);
  }
  // hittable meshes: their parts within reach, nearest first
  _cands.clear();
  for (const root of world.hitTargets) {
    const e = root.userData.hit;
    if (!e?.onHit || done.has(e)) continue;
    root.getWorldPosition(_p);
    if (_p.distanceTo(point) > 60) continue;
    _box.setFromObject(root);
    if (_box.isEmpty() || _box.distanceToPoint(point) > radius) continue;
    const parts = [];
    root.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      _s.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld);
      const d = Math.max(0, _s.center.distanceTo(point) - _s.radius);
      if (d <= radius) parts.push({ c: _s.center.clone(), d });
    });
    parts.sort((a, b) => a.d - b.d);
    _cands.set(e, parts.slice(0, 6));
  }
  for (const [e, parts] of _cands) {
    for (const { c } of parts) {
      const hit = rayTo(world, point, c, radius + 2);
      if (hit && hit.entity === e) {
        apply(e, hit);
        break;
      }
    }
  }
  // solids that belong to something shootable (barriers, target panels, switches, movers)
  for (const s of world.solids) {
    const e = s.entity;
    if (!e?.onHit || !s.enabled || s.noShot || done.has(e)) continue;
    _c.set(Math.max(s.min.x, Math.min(point.x, s.max.x)), Math.max(s.min.y, Math.min(point.y, s.max.y)), Math.max(s.min.z, Math.min(point.z, s.max.z)));
    const d = _c.distanceTo(point);
    if (d > radius) continue;
    if (d < 0.02) {
      apply(e, { point: _c.clone(), normal: normal ? normal.clone() : UP.clone(), solid: s, entity: e, dir: (normal ? normal.clone().negate() : UP.clone().negate()) });
      continue;
    }
    // aim at the near face's closest point, nudged inside so the ray lands on the box
    _a.subVectors(_c, point).multiplyScalar(1.02).add(point);
    const hit = rayTo(world, point, _a, radius + 1);
    if (hit && (hit.solid === s || hit.entity === e)) apply(e, hit);
  }
  // shootable enemy projectiles in range pop
  for (const p of world.projectiles) {
    if (!p.alive || !p.shootable || p.pos.distanceTo(point) > radius + (p.hitRadius || 0)) continue;
    p.onHit?.(color, { point: p.pos.clone(), kind: 'blast', power, dir: _v.subVectors(p.pos, point).normalize().clone() });
  }
  // shoves (drones, brutes: anything with a knock vector), whatever the color
  for (const e of world.entities) {
    if (e.knock?.isVector3 && e.pos?.isVector3 && !e.dead) {
      const d = e.pos.distanceTo(point);
      if (d < radius * 1.3 && d > 1e-3) e.knock.addScaledVector(_v.subVectors(e.pos, point).normalize(), 9 * (1 - d / (radius * 1.3)));
    }
    if (typeof e.onSplash === 'function') e.onSplash(point, radius, color);
  }
  // the player: a shove (no harm), mostly upward from below, so a glob at your feet as you jump lifts you.
  // Standing on the ground it only nudges you (globbing a riser you're riding mustn't bounce you off it).
  if (push > 0 && !pl.dead) {
    _p.copy(pl.pos).setY(pl.pos.y + 0.9);
    const d = _p.distanceTo(point), reach = radius * 1.35;
    if (d < reach && world.lineOfSight(point, _p)) {
      const below = point.y < pl.pos.y + 0.6;
      const k = push * (1 - d / reach) * (pl.grounded && below ? 0.25 : 1);
      _v.subVectors(_p, point).normalize();
      if (below) _v.y = pl.grounded ? 0 : Math.max(_v.y, 0.6);
      _v.normalize();
      pl.vel.x += _v.x * k;
      pl.vel.z += _v.z * k;
      if (_v.y * k > 1) {
        pl.vel.y = Math.max(pl.vel.y, 0) + _v.y * k;
        pl.grounded = false;
        pl.ground = null;
        pl.coyote = 0;
      }
    }
  }
  return outcome;
}

function rayTo(world, from, to, far) {
  _a.subVectors(to, from);
  const len = _a.length();
  if (len < 1e-4) return null;
  _a.divideScalar(len);
  return castRay(world, from, _a.clone(), Math.min(far, len + 1.5));
}

// A wet green burst: a white-green flash, a shockwave on the surface and one in the air, gobs of goo
// flung out on arcs, a spray of fine droplets, a slow cloud, and a glowing splat left on the surface.
function explosionFx(fx, p, n, hex, radius, glass) {
  const k = radius / 2.6;
  fx.flash(p, hex, { size: 2.2 * k, life: 0.16, k: 2, hot: 0.3 });
  fx.flash(p, 0xd8ffe0, { size: 0.7 * k, life: 0.06, k: 1.6, hot: 0.8 });
  if (n) {
    fx.ring(_a.copy(p).addScaledVector(n, -0.08), n, hex, { size: 0.3, end: radius * 1.25, life: 0.38, thick: 0.18, k: 1.8 });
    fx.flash(_a, hex, { size: radius * 0.55, life: 2.2, n, k: 0.55, hot: 0.1 });
  }
  fx.ring(p, null, 0xbfffcf, { size: 0.3, end: radius * 1.1, life: 0.25, thick: 0.12, k: 1.4 });
  const up = n || UP;
  for (let i = 0, c = fx.budget(26); i < c; i++) {
    _v.randomDirection().addScaledVector(up, 0.9).normalize().multiplyScalar(rnd(3, 9) * k);
    const j = fx.spawn(0, p, _v.x, _v.y, _v.z, GOO, rnd(1.1, 1.6), rnd(0.5, 1.0), rnd(0.05, 0.12) * k);
    fx.grav[j] = 14;
    fx.drag[j] = 0.8;
    fx.endColor(j, GOO_DARK, 1.2);
  }
  fx.sparks(p, up, 0x7dffa0, { count: 22, speed: 14 * k, spread: 1.6, life: 0.4, gravity: 10, hot: 0.35 });
  for (let i = 0, c = fx.budget(7); i < c; i++) {
    _v.randomDirection().addScaledVector(up, 0.5).multiplyScalar(rnd(0.5, 1.6));
    const j = fx.puff(p, _v.x, _v.y, _v.z, GOO_DARK, 0.5, rnd(0.6, 1.1), rnd(0.35, 0.6) * k, 2.6);
    fx.grav[j] = -0.6;
  }
  if (glass) fx.impact(p, n || UP, 0xbfe8ff, 'glass');
}
