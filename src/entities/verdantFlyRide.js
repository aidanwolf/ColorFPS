// THE FLY RIDE: a giant carrion fly you board and ride along a path through the forest (or up the god
// tree) while things come at you; you look and shoot freely, it does the flying (A/D and W/S weave it a
// little off its line). Built like Solar's hover-sled run (levels/solarDunes.js): Player.update hands its
// frame to ride.carry() while player.mount is set.
//
//   const ride = new GiantFlyRide(W, {        // or C.flyRide({...}) from creatureKit(B)
//     start: [x, y, z],   // where you stand on its back, parked: put it beside a ledge at that height (you
//                         // walk off the ledge onto it). Boarding = standing on its back.
//     yaw: 0,             // the way it faces parked (default: toward the first path point)
//     path: [[x, y, z], ...],  // the points your standing spot flies through (a smooth curve; it takes
//                         // off from `start` toward path[0]). Keep ~4 m clear round the line (its wings).
//     end: [x, y, z],     // where it sets you down (default: the last path point): beside a ledge again
//     loop: false,        // true: the path is a closed loop back to `start` (it lands where you boarded)
//     speed: 11,          // m/s (it eases off for the landing)
//     steer: { lat: 3.5, up: 2.2 },  // how far A/D and W/S can weave it off the line (m); null = none
//     spawns: [           // fired once per ride as it passes `at` metres along the path (or u: 0..1)
//       { at: 40, type: 'rotflies', rel: [0, 2, 25], count: 4, color: GREEN },    // rel: [right, up, ahead] of the fly
//       { at: 60, type: 'drone', rel: [-12, 5, 20], color: GREEN, life: 25 },      // drones / swarms ride along
//       { at: 80, type: 'borer', pos: [x, y, z], normal: [1, 0, 0] },             // bursts out of a trunk
//       { at: 95, type: 'snapjaw', pos: [x, y, z], mount: 'ceiling' },            // snaps from a branch
//       { at: 120, fn: (ride) => ... },  // anything else; return the entity / entities to clean up
//     ],                  // type: 'rotflies' | 'snapjaw' | 'borer' | any spawnEnemy type ('drone', 'swarm', 'turret', ...)
//     checkpoint: [x, y, z] | false,  // a checkpoint beacon on the boarding ledge (default 4 m behind `start`):
//                         // boarding takes it, so a death mid-ride brings you back there with the ride reset
//     shield: true,       // a free one-hit shield as you board (like the dune sled)
//     title: ['VERDANT', 'THE FLY'], music: 'music_combat', message: '...', intensity: 2,  // director tokens while riding
//     color: GREEN,       // its eyes' glow (cosmetic)
//     after: 'leave' | 'stay',  // landed and you've stepped off: it buzzes away (and is back parked at
//                         // `start` later) or waits where it landed
//     onBoard(ride), onLand(ride), onReset(ride),
//   });
//   ride.state: 'parked' | 'takeoff' | 'ride' | 'landing' | 'landed' | 'leaving'; ride.s / ride.len (m along the path)
//   ride.reset() (also on every checkpoint respawn), ride.board() (start it from code), ride.fly (GiantFly)
import * as THREE from 'three';
import { GREEN } from '../colors.js';
import { audio } from '../audio.js';
import { director } from '../combat/director.js';
import { spawnEnemy } from './combat.js';
import { Checkpoint } from './misc.js';
import { loopFor } from './enemyKit.js';
import { esfx } from './enemySfx.js';
import { flyGeometry, organic, wingMaterial, gnarl, paint, merge, Snapjaw, Borer, FlySwarm, ICHOR } from './verdantCreatures.js';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _a = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qy = new THREE.Quaternion();
const _qt = new THREE.Quaternion();
const _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ease = (k) => k * k * (3 - 2 * k);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

const SCALE = 3.4; // the mount: a rotfly this many times over (~3.8 m long, ~7 m wingspan)
const EYE = 1.61; // (the player's standing eye height)
const TILT_VIEW = 0.6; // how much of the fly's bank / pitch the view takes
const DECK = { x: 0.55, zMin: -0.45, zMax: 0.65 }; // the patch of its back you can shuffle about on (unused while steering)
const BACK = { hx: 1.0, hz: 1.35 }; // the solid of its back while parked (a box round the standing spot)
audio.manifest?.then(() => audio.prefetch(['giantfly_wings', 'swarm_buzz', 'amb_wind', 'warp_whoosh', 'land_hard', 'slime_squelch']));

// ======================================================================================================
// GIANT FLY: the mount's body. Its origin is the standing spot on its back; setPose places it.
// ======================================================================================================
// the mount's wings: the same veined membrane, fainter (they beat right beside your view)
let mountWingMat = null;
function mountWing() {
  if (!mountWingMat) {
    mountWingMat = wingMaterial().clone();
    mountWingMat.opacity = 0.2;
    mountWingMat.color.set(0x8aa898);
  }
  return mountWingMat;
}

let saddleGeo = null;
function saddleGeometry() {
  if (saddleGeo) return saddleGeo;
  // a mossy, fungus-grown hump on its back (where you stand), and two long antennae curving back over the
  // head like handlebars (they frame the view)
  const moss = gnarl(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.2, 0.05, 0.24).translate(0, 0.25, 0.02), 0.012, 3, 20);
  paint(moss, (x, y, z, c) => {
    const n = Math.sin(x * 60) * Math.cos(z * 50);
    c.setRGB(0.18 + n * 0.05, 0.3 + n * 0.08, 0.08);
  });
  const ant = [];
  for (const s of [-1, 1]) {
    let prev = new THREE.Vector3(s * 0.06, 0.15, -0.44);
    for (let i = 1; i <= 6; i++) {
      const t = i / 6;
      const p = new THREE.Vector3(s * (0.06 + 0.1 * t), 0.15 + 0.22 * Math.sin(t * 2.4), -0.44 + 0.3 * t * t);
      const d = new THREE.Vector3().subVectors(p, prev), len = d.length();
      const g = new THREE.CylinderGeometry(0.008, 0.012, len, 5).translate(0, len / 2, 0);
      g.applyQuaternion(_q.setFromUnitVectors(UP, d.normalize()));
      g.translate(prev.x, prev.y, prev.z);
      ant.push(paint(g, (x, y, z, c) => c.setRGB(0.08, 0.06, 0.04)));
      prev = p;
    }
  }
  saddleGeo = { moss: merge([moss]), ant: merge(ant) };
  return saddleGeo;
}

export class GiantFly {
  constructor(world, { color = GREEN } = {}) {
    this.world = world;
    this.t = Math.random() * 10;
    this.flap = 0;
    this.throttle = 0;
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.bank = 0;
    this.quat = new THREE.Quaternion();
    const G = flyGeometry(), SG = saddleGeometry();
    this.group = new THREE.Group();
    this.group.userData.noCull = true;
    const body = (this.body = new THREE.Group());
    body.position.y = -0.27 * SCALE; // (the thorax's top is the origin: where you stand)
    body.scale.setScalar(SCALE);
    body.add(new THREE.Mesh(G.body, organic('chitin', color)), new THREE.Mesh(G.glow, organic('eye', color)), new THREE.Mesh(SG.moss, organic('leaf', color)), new THREE.Mesh(SG.ant, organic('chitin', color)));
    this.wings = [-1, 1].map((s) => {
      const p = new THREE.Group();
      p.position.set(s * 0.1, 0.15, 0.02); // (lower and further back than a rotfly's: out of the rider's face)
      const w = new THREE.Mesh(G.wing, mountWing());
      w.scale.x = s;
      w.renderOrder = 3;
      p.add(w);
      body.add(p);
      return p;
    });
    for (const m of body.children) m.raycast = () => {}; // (shots pass by it: it's on your side)
    this.group.add(body);
    world.scene.add(this.group);
    this.wingsLoop = loopFor('giantfly_wings', 'swarm_buzz', { rate: 0.3 });
    this.wind = audio.createLoop('amb_wind', { gain: 0 });
  }

  setPose(pos, yaw, pitch, bank) {
    this.pos.copy(pos);
    this.yaw = yaw;
    this.pitch = pitch;
    this.bank = bank;
    this.quat.setFromEuler(_e.set(pitch, yaw, -bank, 'YXZ'));
  }

  // a point on its back (fly-local x right, y up, z forward) in the world
  toWorld(x, y, z, out) {
    return out.set(x, y, -z).applyQuaternion(this.quat).add(this.pos);
  }

  forward(out) {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  right(out) {
    return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  update(dt, speed, riding, camPos) {
    this.t += dt;
    const thr = this.throttle;
    this.flap += dt * (16 + thr * 14);
    this.group.position.copy(this.pos);
    this.group.quaternion.copy(this.quat);
    // the body bobs with every wingbeat (the stroke shows in the view while you ride)
    this.body.position.y = -0.27 * SCALE + Math.sin(this.flap) * 0.035 * (0.5 + thr);
    this.body.rotation.x = Math.sin(this.t * 1.3) * 0.02;
    const amp = 0.32 + 0.18 * thr;
    for (let i = 0; i < 2; i++) {
      const s = i ? 1 : -1;
      this.wings[i].rotation.set(0, s * 0.5, s * (-0.12 + Math.sin(this.flap + i * 0.2) * amp));
    }
    const d = this.pos.distanceTo(camPos);
    const near = Math.max(0, 1 - d / 45);
    this.wingsLoop?.setGain((0.18 + 0.32 * thr) * near * near);
    this.wingsLoop?.setRate(0.28 + 0.1 * thr);
    this.wind?.setGain(riding ? Math.min(0.5, speed * 0.035) : 0);
    this.wind?.setRate(0.9 + Math.min(speed, 20) * 0.015);
  }
}

// ======================================================================================================
// GIANT FLY RIDE: boarding, the flight along the path, the attack schedule, landing and resets
// ======================================================================================================
export class GiantFlyRide {
  constructor(world, opts) {
    const { path, start = null, yaw = null, end = null, loop = false, speed = 11, steer = { lat: 3.5, up: 2.2 }, spawns = [], checkpoint = null, shield = true,
      title = null, music = null, message = null, intensity = 2, color = GREEN, after = 'leave', onBoard = null, onLand = null, onReset = null } = opts;
    this.world = world;
    this.game = world.game;
    this.opts = opts;
    const pts = path.map((p) => new THREE.Vector3(...p));
    this.start = start ? new THREE.Vector3(...start) : pts[0].clone();
    const first = pts[0].distanceTo(this.start) < 0.5 ? pts[1] : pts[0];
    this.yaw0 = yaw ?? Math.atan2(-(first.x - this.start.x), -(first.z - this.start.z));
    this.loop = loop;
    const all = [this.start.clone(), ...pts.filter((p) => p.distanceTo(this.start) > 0.5)];
    if (!loop && end) all.push(new THREE.Vector3(...end));
    this.curve = new THREE.CatmullRomCurve3(all, loop, 'centripetal');
    this.curve.arcLengthDivisions = 1500;
    this.curve.updateArcLengths();
    this.len = this.curve.getLength();
    this.endPos = this.curve.getPointAt(loop ? 0 : 1);
    this.speed0 = speed;
    this.steer = steer;
    this.spawns = spawns.map((s) => ({ ...s, at: s.at ?? (s.u ?? 0) * this.len })).sort((a, b) => a.at - b.at);
    this.shield = shield;
    this.title = title;
    this.music = music;
    this.message = message ?? 'Hold on! <b>Shoot</b> anything that comes at you — <b>A / D</b> and <b>W / S</b> weave it.';
    this.intensity = intensity;
    this.after = after;
    this.onBoard = onBoard;
    this.onLand = onLand;
    this.onReset = onReset;
    this.fly = new GiantFly(world, { color });
    this.pos = new THREE.Vector3();
    this.prev = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.delta = new THREE.Vector3();
    this.tan = new THREE.Vector3();
    this.live = []; // what the spawns made: { e, kind, rel, t0, life, ph, carried }
    this.t = 0;
    this.rider = null;
    // the boarding ledge's checkpoint
    if (checkpoint !== false) {
      const cp = checkpoint ? new THREE.Vector3(...checkpoint) : this.start.clone().addScaledVector(_v.set(-Math.sin(this.yaw0), 0, -Math.cos(this.yaw0)), -4);
      this.cp = new Checkpoint(world, this.game, { pos: cp.toArray(), yaw: this.yaw0, name: opts.name ?? null });
    }
    this.back = world.addSolid(new THREE.Vector3(), new THREE.Vector3(), { creature: true, kind: 'moss' });
    world.add(this);
    // (the ride updates last of all entities, after the enemies it carries: World.update walks backwards)
    world.entities.unshift(world.entities.pop());
    this.game.level?.respawnHooks?.push(() => this.reset());
    this.reset();
  }

  // ---------------------------------------------------------------- states
  park(at, yaw) {
    this.pos.copy(at);
    this.yaw = yaw;
    this.pitch = 0;
    this.bank = 0;
    this.fly.throttle = 0;
    this.vel.set(0, 0, 0);
    this.placeBack(at, yaw);
    this.fly.setPose(at, yaw, 0, 0);
  }

  placeBack(at, yaw) {
    const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
    const ex = BACK.hx * c + BACK.hz * s, ez = BACK.hx * s + BACK.hz * c;
    this.back.min.set(at.x - ex, at.y - 0.5, at.z - ez);
    this.back.max.set(at.x + ex, at.y, at.z + ez);
    this.back.enabled = true;
  }

  reset() {
    this.unboard();
    this.clearSpawns();
    this.state = 'parked';
    this.s = 0;
    this.lat = 0;
    this.up = 0;
    this.steerIn = { x: 0, y: 0 };
    this.fired = 0;
    this.offBack = true;
    this.park(this.start, this.yaw0);
    if (this.boarded) director.setIntensity();
    this.boarded = false;
    this.onReset?.(this);
  }

  // climb aboard (standing on its back does this)
  board() {
    if (this.state !== 'parked' || this.game.player.dead) return;
    const p = this.game.player;
    this.clearSpawns();
    this.s = 0;
    this.fired = 0;
    this.lat = this.up = 0;
    this.rider = p;
    p.mount = this;
    p.vel.set(0, 0, 0);
    p.crouching = false;
    this.state = 'takeoff';
    this.timer = 1.1;
    this.boarded = true;
    this.back.enabled = false;
    if (this.shield && !p.armor) p.giveArmor();
    // the boarding ledge's beacon becomes your checkpoint: a death out there brings you back to it
    const cp = this.cp;
    if (cp && this.game.checkpoint?.ref !== cp) {
      this.game.checkpoint?.ref?.setActive?.(false);
      cp.setActive(true);
      this.world.fx.checkpoint(cp.pos);
      this.game.setCheckpoint(cp.pos, this.yaw0, cp);
    }
    director.setIntensity(this.intensity);
    if (this.title) this.game.hud.zoneTitle(this.title[0], this.title[1], '#3dff7a');
    if (this.music) this.game.setMusic(this.music);
    if (this.message) this.game.hud.message(this.message, 3.5);
    esfx('goo_stuck_buzz', this.pos, 1, 0.5);
    audio.sample('warp_whoosh', { gain: 0.5, rate: 0.6 });
    this.onBoard?.(this);
  }

  unboard() {
    const p = this.rider;
    if (!p) return;
    this.rider = null;
    if (p.mount === this) p.mount = null;
    p.vel.set(0, 0, 0);
    p.carry?.set(0, 0, 0);
    p.fallTop = p.pos.y;
    p.grounded = false;
    p.ground = null;
    p.updateCamera();
  }

  // ---------------------------------------------------------------- Player.update's mount hook
  carry(p, dt, input) {
    // steering: A/D slide it sideways, W/S up and down (read here, applied next frame)
    let f = (input.down('KeyW') || input.down('ArrowUp') ? 1 : 0) - (input.down('KeyS') || input.down('ArrowDown') ? 1 : 0);
    let r = (input.down('KeyD') || input.down('ArrowRight') ? 1 : 0) - (input.down('KeyA') || input.down('ArrowLeft') ? 1 : 0);
    if (input.stick) {
      f += input.stick.f;
      r += input.stick.r;
    }
    this.steerIn.x = clamp(r, -1, 1);
    this.steerIn.y = clamp(f, -1, 1);
    // pinned to its back, moving with it
    this.fly.toWorld(0, 0, 0, p.pos);
    p.vel.copy(this.vel);
    p.grounded = true;
    p.ground = null;
    p.crouching = false;
    p.height = 1.75;
    p.eye += (EYE - p.eye) * Math.min(1, dt * 14);
    p.fallTop = p.pos.y;
    p.fallSpeed = 0;
    p.sinkDepth = 0;
    p.inSand = false;
    p.burn = 0;
    p.launched = false;
    p.sprinting = false;
    p.safeTimer = 0;
    p.speed2d = 0;
    p.invuln = Math.max(0, p.invuln - dt);
    p.shieldFx?.update(dt);
    p.landKick = Math.max(0, p.landKick - dt * 1.4);
    p.shake = Math.max(0, p.shake - dt * 2.5);
    this.placeCamera(p);
  }

  // the view: part of the fly's tilt on top of your own look, at eye height, with the wingbeat in it
  placeCamera(p) {
    const cam = p.camera, F = this.fly;
    _qy.setFromAxisAngle(UP, F.yaw);
    _qt.setFromEuler(_e.set(F.pitch * TILT_VIEW, F.yaw, -F.bank * TILT_VIEW, 'YXZ')).multiply(_qy.invert());
    const beat = Math.sin(F.flap) * 0.04 * (0.5 + F.throttle);
    _v.set(0, p.eye + beat - p.landKick * 0.6, 0).applyQuaternion(_qt).add(p.pos);
    const sh = p.shake, s2 = sh * sh * 0.4;
    cam.position.set(_v.x + (Math.random() - 0.5) * s2, _v.y + (Math.random() - 0.5) * s2, _v.z + (Math.random() - 0.5) * s2);
    _q.setFromEuler(_e.set(p.pitch - p.landKick * 0.15, p.yaw, 0, 'YXZ'));
    cam.quaternion.copy(_qt).multiply(_q);
  }

  // ---------------------------------------------------------------- per frame
  update(dt, player) {
    this.t += dt;
    const F = this.fly;
    let speed = 0;
    switch (this.state) {
      case 'parked':
      case 'landed': {
        // hovering at its perch, wings idling; stand on its back to go
        const bob = Math.sin(this.t * 2) * 0.06;
        F.setPose(_v.copy(this.pos).setY(this.pos.y + bob), this.yaw, Math.sin(this.t * 1.3) * 0.02, Math.sin(this.t * 0.9) * 0.02);
        F.throttle = 0.1;
        const on = player.grounded && player.ground === this.back && !player.dead;
        if (this.state === 'parked' && on && this.offBack) this.board();
        if (!on) this.offBack = true;
        if (this.state === 'landed' && this.after === 'leave' && !on && player.pos.distanceTo(this.pos) > 4) {
          this.state = 'leaving';
          this.timer = 4;
          this.back.enabled = false;
          esfx('goo_stuck_buzz', this.pos, 1, 0.6);
        }
        break;
      }
      case 'takeoff': {
        const k = 1 - this.timer / 1.1;
        this.timer -= dt;
        F.throttle = 0.2 + 0.6 * k;
        this.prev.copy(this.pos);
        this.pos.copy(this.start).addScaledVector(UP, 1.2 * ease(k));
        this.delta.subVectors(this.pos, this.prev);
        this.vel.copy(this.delta).divideScalar(Math.max(dt, 1e-3));
        F.setPose(this.pos, this.yaw, -0.08 * k, 0);
        player.shake = Math.max(player.shake, 0.06);
        if (this.timer <= 0) {
          this.state = 'ride';
          this.speed = 2;
          this.s = 0;
          this.liftOff = this.pos.y - this.start.y;
        }
        break;
      }
      case 'ride':
      case 'landing':
        speed = this.flyAlong(dt, player);
        break;
      case 'leaving': {
        // it buzzes off up and away, then is quietly back at its perch for another go
        this.timer -= dt;
        this.prev.copy(this.pos);
        F.forward(_w);
        this.pos.addScaledVector(_w, dt * 9).addScaledVector(UP, dt * 5);
        F.setPose(this.pos, this.yaw, -0.2, 0);
        F.throttle = 0.8;
        if (this.timer <= 0) {
          this.state = 'parked';
          this.offBack = true;
          this.park(this.start, this.yaw0);
        }
        break;
      }
    }
    F.update(dt, speed, !!this.rider, this.game.camera.position);
  }

  // along the path: speed, the weave, heading / bank / pitch; carries the escorts; fires the schedule
  flyAlong(dt, player) {
    const F = this.fly;
    const left = this.len - this.s;
    let want = this.speed0;
    if (this.state === 'ride' && left < 10 && !this.loop) this.state = 'landing';
    if (this.loop && left < 10) this.state = 'landing';
    if (this.state === 'landing') want = Math.max(1.2, Math.sqrt(2 * 2.6 * Math.max(0, left)));
    this.speed += clamp(want - this.speed, -6 * dt, 4 * dt);
    this.s = Math.min(this.len, this.s + this.speed * dt);
    const u = this.s / this.len;
    this.curve.getPointAt(u, _v);
    this.curve.getTangentAt(u, this.tan);
    // takeoff height eases out over the first stretch, the weave eases in (and out for the landing)
    const lift = (this.liftOff ?? 0) * Math.max(0, 1 - this.s / 12);
    const weave = clamp(Math.min(this.s / 15, left / 15), 0, 1);
    if (this.steer) {
      const r = 1 - Math.exp(-dt * 3);
      this.lat += (this.steerIn.x * this.steer.lat * weave - this.lat) * r;
      this.up += (this.steerIn.y * this.steer.up * weave - this.up) * r;
    }
    const right = _w.set(-this.tan.z, 0, this.tan.x);
    if (right.lengthSq() < 1e-4) right.set(1, 0, 0);
    right.normalize();
    _a.copy(_v).addScaledVector(right, this.lat).addScaledVector(UP, this.up + lift);
    // a gentle drift of its own (it's an animal, not a rail)
    _a.y += Math.sin(this.t * 1.9) * 0.25 * weave;
    // never weave it into a wall: pull back toward the line if the spot is inside something
    if ((this.lat || this.up) && this.world.pointInSolid(_w.copy(_a).setY(_a.y + 0.9), 0.9)) {
      this.lat *= 0.8;
      this.up *= 0.8;
      _a.copy(_v).setY(_v.y + lift);
    }
    this.prev.copy(this.pos);
    this.pos.copy(_a);
    this.delta.subVectors(this.pos, this.prev);
    this.vel.copy(this.delta).divideScalar(Math.max(dt, 1e-3));
    // heading along the path, banking into turns, nosing up and down with the climb
    const heading = Math.atan2(-this.tan.x, -this.tan.z);
    const dy = wrap(heading - this.yaw);
    const oldYaw = this.yaw;
    this.yaw = wrap(this.yaw + dy * Math.min(1, dt * 4));
    const yawRate = wrap(this.yaw - oldYaw) / Math.max(dt, 1e-3);
    this.bank += (clamp(-yawRate * this.speed * 0.05 - this.steerIn.x * 0.12, -0.45, 0.45) - this.bank) * Math.min(1, dt * 3);
    const climb = Math.atan2(this.tan.y, Math.hypot(this.tan.x, this.tan.z));
    this.pitch += (clamp(climb * 0.6, -0.35, 0.35) - this.pitch) * Math.min(1, dt * 3);
    if (this.rider) this.rider.yaw += wrap(this.yaw - oldYaw); // you turn with it
    F.setPose(this.pos, this.yaw, this.pitch, this.bank);
    F.throttle = clamp(0.4 + this.speed / 18 + Math.max(0, this.tan.y) * 0.6, 0, 1);
    this.carryEscorts(dt);
    this.inherit();
    this.boostShots();
    // the schedule
    while (this.fired < this.spawns.length && this.spawns[this.fired].at <= this.s) this.spawn(this.spawns[this.fired++]);
    // touchdown
    if (this.state === 'landing' && left < 0.05) this.land();
    return this.speed;
  }

  land() {
    this.state = 'landed';
    this.speed = 0;
    this.vel.set(0, 0, 0);
    this.lat = this.up = 0;
    const at = this.loop ? this.start : this.endPos;
    this.pos.copy(at);
    this.placeBack(at, this.yaw);
    this.offBack = false;
    this.unboard();
    // stand the rider on its back (on its back solid), then they walk off
    this.game.player.pos.copy(at);
    this.game.player.vel.set(0, 0, 0);
    this.clearSpawns(true);
    director.setIntensity();
    this.boarded = false;
    audio.sample('land_hard', { gain: 0.4, rate: 1.3 });
    esfx('goo_stuck_buzz', this.pos, 0.8, 0.5);
    this.game.hud.message('Down safe. <b>Step off.</b>', 2.5);
    if (this.loop) {
      this.state = 'parked';
      this.yaw = this.yaw0;
      this.park(this.start, this.yaw0);
    }
    this.onLand?.(this);
  }

  // ---------------------------------------------------------------- the attackers
  // fly-local [right, up, ahead] -> world (level: its tilt left out)
  rel(r, out) {
    const F = this.fly;
    F.right(_w);
    F.forward(out);
    return out.multiplyScalar(r[2]).addScaledVector(_w, r[0]).add(this.pos).setY(this.pos.y + r[1]);
  }

  spawn(spec) {
    const { at, u, type, rel = null, pos = null, life = 30, fn = null, ...o } = spec;
    const W = this.world;
    const where = rel ? this.rel(rel, new THREE.Vector3()) : pos ? new THREE.Vector3(...pos) : this.rel([0, 3, 20], new THREE.Vector3());
    const track = (e, kind, carried) => {
      if (!e) return e;
      this.live.push({ e, kind, rel: rel ? rel.slice() : null, t0: this.t, life, ph: Math.random() * 6.3, carried });
      return e;
    };
    if (fn) {
      const r = fn(this);
      for (const e of [].concat(r || [])) track(e, 'other', false);
      return;
    }
    switch (type) {
      case 'rotflies': {
        const sw = new FlySwarm(W, { hive: false, respawn: 0, aggro: true, count: 4, range: 70, leash: 40, ...o, pos: where.toArray() });
        sw.carrier = this;
        for (const m of sw.members) {
          m.aggro = true;
          m.carried = true;
        }
        return track(sw, 'swarm', true);
      }
      case 'snapjaw': return track(new Snapjaw(W, { aggro: true, range: 40, ...o, pos: where.toArray() }), 'enemy', false);
      case 'borer': return track(new Borer(W, { aggro: true, ...o, pos: where.toArray() }), 'enemy', false);
      default: {
        const e = spawnEnemy(W, { type, aggro: true, range: 70, ...o, pos: where.toArray() });
        if (e) e.aggro = true;
        const flying = type === 'drone' || type === 'swarm';
        return track(e, type === 'swarm' ? 'robotswarm' : type === 'drone' ? 'drone' : 'enemy', flying);
      }
    }
  }

  // flyers keep up with the fly (they live in its frame); drones' posts drift about their offset
  carryEscorts(dt) {
    const D = this.delta;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const r = this.live[i], e = r.e;
      if (!r.carried) continue;
      if (r.kind === 'drone') {
        if (!this.world.entities.includes(e)) {
          this.live.splice(i, 1);
          continue;
        }
        if (e.debris || e.crashing) continue;
        e.pos.add(D);
        const age = this.t - r.t0;
        if (r.rel) {
          this.rel([r.rel[0] + Math.sin(age * 0.5 + r.ph) * 2.5, r.rel[1] + Math.sin(age * 0.8 + r.ph) * 0.8, r.rel[2] + Math.sin(age * 0.33 + r.ph) * 3], e.home);
        } else e.home.add(D);
      } else if (r.kind === 'swarm' || r.kind === 'robotswarm') {
        if (e.dead && !e.members?.some((m) => !m.dead)) continue;
        for (const m of e.members) {
          if (m.dead) continue;
          m.pos.add(D);
          m.goal?.add(D);
        }
        if (e.home) e.home.add(D);
      }
      if (this.t - r.t0 > r.life && !r.retired) {
        r.retired = true;
        this.despawn(r);
        this.live.splice(i, 1);
      }
    }
  }

  // enemy shots fired from the fly's frame keep its speed (aimed shots still fly true at you)
  inherit() {
    for (const p of this.world.projectiles) {
      if (p._flyRide) continue;
      p._flyRide = true;
      if (!p.noInherit && p.vel && p.pos && p.pos.distanceToSquared(this.pos) < 80 * 80) p.vel.add(this.vel);
    }
  }

  // your own green globs leave the gun with the fly's speed too (fired from a moving mount they'd lag
  // behind and miss whatever rides alongside): a glob seen fresh (just fired) gets the fly's velocity
  boostShots() {
    const L = this.game.blaster?.modes?.[2];
    if (!this.rider || !L?.globs) return;
    this.seenShots ??= new Map();
    for (const g of L.globs) {
      if (!g.alive) {
        this.seenShots.delete(g);
        continue;
      }
      const last = this.seenShots.get(g);
      if ((last === undefined || g.life < last) && g.life < 0.1) g.vel.add(this.vel);
      this.seenShots.set(g, g.life);
    }
  }

  despawn(r) {
    const e = r.e;
    if (!e) return;
    if (r.kind === 'drone') {
      if (this.world.entities.includes(e)) {
        if (!e.dead) this.world.fx.burst(e.pos, ICHOR, { count: 12, speed: 3, life: 0.4, size: 0.3, gravity: 0 });
        e.dispose?.();
      }
    } else if (!e.dead || e.members) e.despawn?.();
  }

  clearSpawns() {
    for (const r of this.live) this.despawn(r);
    this.live = [];
  }
}
