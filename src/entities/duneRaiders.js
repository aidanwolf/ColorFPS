// The attackers of Solar's Dune Sea run (levels/solarDunes.js), all made for a fight on the move: they
// live in the hover-sled's frame (craft-local stations), so they keep pace with it.
//  RaiderSkiff — a Lumen hover-skiff with a gunner, racing alongside the sled and firing laser-sighted bursts.
//  DuneScarab  — a robot scarab that bursts out of the sand, leaps onto the deck and goes for you.
//  Excavator   — the climax: a segmented sandworm of a mining machine rising out of the Maw, spitting
//                globs of molten sand; shoot out its glowing vents.
// The skiffs and scarabs are pooled (built hidden with the level, so their shaders are warmed up at
// startup, and reused every run): spawn() wakes one, death puts it back.
// `run` is the run controller: { craft, surfaceAt(x, z) } (the sand's height, quicksand included).
import * as THREE from 'three';
import { COLORS, YELLOW, RED } from '../colors.js';
import { audio } from '../audio.js';
import { director } from '../combat/director.js';
import { Orb } from './drone.js';
import { Enemy, Parts, Beam, Blast, MAT, GEO, glowMat, additive, converge, falloff, sfx } from './enemyKit.js';
import { esfx } from './enemySfx.js';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _u = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _c = new THREE.Color();
const _p2 = new THREE.Vector2();
const _x = new THREE.Vector3();
const _z = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const HEX = COLORS[YELLOW].hex;
const RED_HEX = COLORS[RED].hex;
const DUST = 0xa88758;
const SAND = 0xd9b46a;
const rnd = (a, b) => a + Math.random() * (b - a);
const smooth01 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

audio.manifest?.then(() => audio.prefetch([
  'scarab_emerge', 'scarab_pounce', 'scarab_chitter', 'scarab_crunch', 'scarab_dig', 'turret_charge', 'turret_shot', 'enemy_shot',
  'leviathan_roar', 'titan_roar', 'root_rumble', 'floor_collapse', 'boss_charge', 'charge_up', 'glob_pop', 'leviathan_spit',
  'titan_groan_big', 'drone_explode', 'boss_death', 'ring_wave', 'warp_whoosh', 'warden_shield_hit', 'warden_shield_break', 'shield_break',
]));

const sandPuff = (fx, p, spread = 1, up = 1, size = 0.5, life = 1) =>
  fx.puff(p, rnd(-spread, spread), rnd(0.3, 1) * up, rnd(-spread, spread), _c.set(DUST), 0.45, life * rnd(0.7, 1.2), size * rnd(0.7, 1.3), 3);

// a sand eruption: a column of grit and a ring of dust (an enemy breaking the surface)
const _ep = new THREE.Vector3(), _eu = new THREE.Vector3(0, 0.9, 0);
function erupt(fx, at, scale = 1) {
  const p = _ep.copy(at); // (callers often pass one of the shared temporaries)
  fx.burst(p, SAND, { count: 40 * scale, speed: 7 * Math.sqrt(scale), life: 1.1, size: 0.4 * scale, gravity: 12, mode: 'puff', dir: _eu });
  for (let i = 0; i < 8 * scale; i++) sandPuff(fx, p, 2.5 * scale, 2 * scale, 0.9 * scale, 1.6);
  p.y += 0.1;
  fx.ring(p, UP, DUST, { size: 0.5, end: 4 * scale, life: 0.6, thick: 0.25, k: 0.5 });
}

// Pooling on top of the combat kit's Enemy: remove() parks the enemy hidden instead of freeing it.
class Pooled extends Enemy {
  awaken() {
    this.hp = this.maxHp;
    this.dead = this.gone = false;
    this.flash = this.immuneFlash = 0;
    this.appear = 1;
    this.aggro = true;
    this.sightTimer = 0;
    this.group.scale.setScalar(1);
    this.group.visible = true;
    this.world.addHittable(this.group);
    this.world.add(this);
    this.applyColor();
  }

  remove() {
    if (this.gone) return;
    this.gone = this.dead = true;
    director.release(this);
    this.world.remove(this);
    this.world.removeHittable(this.group);
    this.group.visible = false;
    this.beam?.hide();
    this.hum?.setGain(0);
  }
}

// ================================================================ RAIDER SKIFF
// A low dark skiff on two fan pods with yellow seams; a Lumen gunner stands behind a swivel cannon. It
// races up from behind to a station off the sled's flank and weaves there; every few seconds (holding a
// director token) it paints you with a laser sight (the aim freezes for the last moment) and fires a
// 3-shot burst. 4 hp. Shot down, it flips and ploughs into the sand.
// A shielded skiff rides inside a RED energy bubble: yellow glances off it, red breaks it (SHIELD_HP hits),
// then it's yellow like the rest.
const SKIFF_HP = 4;
const SHIELD_HP = 3;
const AIM_T = 0.75, LOCK_T = 0.22, BURST = 3, BURST_GAP = 0.16, SHOT_SPEED = 15;

export function skiffModel(owner, glow, armor) {
  const g = new THREE.Group();
  const hull = new Parts()
    .add(armor, new THREE.BoxGeometry(1.5, 0.42, 2.6), [0, 0, 0.2])
    .add(armor, new THREE.CylinderGeometry(0.01, 0.75, 1.5, 4, 1), [0, 0, -1.8], [-Math.PI / 2, Math.PI / 4, 0], [1, 1, 0.42])
    .add(MAT.dark, new THREE.BoxGeometry(1.3, 0.25, 2.9), [0, -0.3, 0])
    .add(MAT.dark, new THREE.BoxGeometry(0.9, 0.5, 0.6), [0, 0.38, 1.0])
    // yellow seams down the flanks and across the stern
    .add(glow, new THREE.BoxGeometry(0.05, 0.06, 2.4), [0.77, 0.06, 0.2])
    .add(glow, new THREE.BoxGeometry(0.05, 0.06, 2.4), [-0.77, 0.06, 0.2])
    .add(glow, new THREE.BoxGeometry(1.2, 0.06, 0.05), [0, 0.12, 1.52]);
  // fan pods either side, glowing rings underneath
  for (const s of [-1, 1]) {
    hull.add(MAT.dark, new THREE.CylinderGeometry(0.42, 0.48, 0.38, 12), [s * 1.05, -0.12, 0.65]);
    hull.add(MAT.dark, new THREE.CylinderGeometry(0.34, 0.4, 0.34, 12), [s * 0.95, -0.12, -0.9]);
    hull.add(glow, new THREE.TorusGeometry(0.36, 0.05, 4, 16), [s * 1.05, -0.32, 0.65], [Math.PI / 2, 0, 0]);
    hull.add(glow, new THREE.TorusGeometry(0.29, 0.05, 4, 16), [s * 0.95, -0.3, -0.9], [Math.PI / 2, 0, 0]);
  }
  hull.build(g);
  // the gunner: a hunched android torso and head with a visor slit, behind a swivel cannon
  const gun = new THREE.Group();
  gun.position.set(0, 0.25, 0.15);
  new Parts()
    .add(MAT.dark, new THREE.CylinderGeometry(0.3, 0.36, 0.2, 10), [0, 0.05, 0])
    .add(armor, new THREE.BoxGeometry(0.62, 0.62, 0.42), [0, 0.5, 0.25], [0.2, 0, 0])
    .add(MAT.shell, new THREE.SphereGeometry(0.21, 10, 8), [0, 0.98, 0.18])
    .add(glow, new THREE.BoxGeometry(0.3, 0.05, 0.05), [0, 1.0, -0.02])
    .add(MAT.dark, new THREE.BoxGeometry(0.22, 0.22, 0.9), [0, 0.42, -0.4])
    .add(MAT.dark, new THREE.CylinderGeometry(0.07, 0.09, 0.8, 8), [0, 0.42, -1.1], [Math.PI / 2, 0, 0])
    .add(glow, new THREE.TorusGeometry(0.09, 0.025, 4, 10), [0, 0.42, -1.5])
    .add(MAT.dark, new THREE.BoxGeometry(0.16, 0.5, 0.16), [0.32, 0.45, -0.1], [0.9, 0, 0])
    .add(MAT.dark, new THREE.BoxGeometry(0.16, 0.5, 0.16), [-0.32, 0.45, -0.1], [0.9, 0, 0])
    .build(gun);
  g.add(gun);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.42, -1.55);
  gun.add(muzzle);
  if (owner) {
    owner.gun = gun;
    owner.muzzle = muzzle;
  }
  return g;
}

export class RaiderSkiff extends Pooled {
  constructor(world, run) {
    super(world, { pos: [0, -200, 0], color: YELLOW, hp: SKIFF_HP, range: 75, wake: 400, aggro: true });
    this.run = run;
    this.local = new THREE.Vector3(); // craft-local: x right, z forward
    this.station = new THREE.Vector3();
    this.vy = 0;
    this.body = skiffModel(this, this.glow, this.armor);
    this.group.add(this.body);
    this.group.visible = false;
    this.beam = new Beam(world.scene, HEX);
    this.charge = new THREE.Mesh(GEO.sphere, additive(new THREE.Color(HEX).multiplyScalar(2), 0));
    this.charge.scale.setScalar(0.01);
    this.muzzle.add(this.charge);
    this.mats.push(this.charge.material);
    this.aimAt = new THREE.Vector3();
    // the red shield: a bubble round the whole skiff (it takes the shots while it's up) and its emitter ring
    this.shieldMat = additive(new THREE.Color(RED_HEX).multiplyScalar(1.3), 0.3, { side: THREE.DoubleSide });
    this.shield = new THREE.Mesh(GEO.sphere, this.shieldMat);
    this.shield.scale.set(2.1, 1.5, 2.6);
    this.shield.position.y = 0.4;
    this.emitter = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 4, 18), glowMat(RED));
    this.emitter.rotation.x = Math.PI / 2;
    this.emitter.position.set(0, 0.33, 1.05);
    this.group.add(this.shield, this.emitter);
    this.mats.push(this.shieldMat);
    this.gone = this.dead = true;
    world.scene.add(this.group);
  }

  // side: -1 left, 1 right; it comes in from `fromZ` m astern; shielded: inside a red bubble
  spawn(side, fromZ = -40, shielded = false) {
    this.shieldHp = shielded ? SHIELD_HP : 0;
    this.leaving = 0;
    this.shieldFlash = 0;
    this.shield.visible = this.emitter.visible = shielded;
    const c = this.run.craft;
    this.side = side;
    this.local.set(side * rnd(16, 22), 0, fromZ);
    this.phase = Math.random() * 6.3;
    this.state = 'cool';
    this.timer = rnd(2.2, 3.2);
    this.shots = 0;
    this.crashT = 0;
    this.lastYaw = c.yaw;
    this.bank = 0;
    this.awaken();
    this.place(0, true);
  }

  place(dt, snap = false) {
    const c = this.run.craft;
    c.right(_v).multiplyScalar(this.local.x);
    c.forward(_w).multiplyScalar(this.local.z);
    this.pos.copy(c.pos).add(_v).add(_w);
    const want = this.run.surfaceAt(this.pos.x, this.pos.z) + 1.25 + Math.sin(this.t * 2.3 + this.phase) * 0.18;
    if (snap) {
      this.pos.y = want;
      this.vy = 0;
    } else {
      // a spring over the dunes, so it bounds over crests instead of snapping to them
      const y = this.lastY ?? want;
      this.vy += ((want - y) * 40 - this.vy * 9) * dt;
      this.pos.y = Math.max(want - 0.4, y + this.vy * dt);
    }
    this.lastY = this.pos.y;
  }

  // peel away astern and out of the fight (gone a few seconds later)
  retreat() {
    if (!this.leaving) this.leaving = 0.001;
    director.release(this);
    this.state = 'cool';
    this.timer = 99;
    this.beam.hide();
  }

  // a red shield takes every shot while it's up: red cracks it, anything else glances off
  onHit(color, hit) {
    if (this.dead || this.gone) return undefined;
    if (this.shieldHp <= 0) return super.onHit(color, hit);
    const fx = this.world.fx, p = hit?.point ?? this.pos;
    if (color !== RED) {
      this.shieldFlash = 0.5;
      return 'immune';
    }
    this.shieldHp--;
    this.shieldFlash = 1;
    fx.burst(p, RED_HEX, { count: 16, speed: 6, life: 0.4, size: 0.25, gravity: 2 });
    sfx('warden_shield_hit', { gain: 0.7, vary: 0.1 }, 'glass_hit', { gain: 0.6 });
    if (this.shieldHp <= 0) {
      this.shield.visible = this.emitter.visible = false;
      fx.burst(this.pos, RED_HEX, { count: 60, speed: 9, life: 0.7, size: 0.3, gravity: 3, mode: 'shard' });
      fx.ring(this.pos, null, RED_HEX, { size: 1, end: 4, life: 0.4, thick: 0.2, k: 1.5 });
      sfx('warden_shield_break', { gain: 0.9, vary: 0.05 }, 'shield_break', { gain: 0.8 });
      this.onShieldDown?.(this);
    }
    return 'hit';
  }

  update(dt, player) {
    if (this.state === 'crash') return this.updateCrash(dt);
    this.tick(dt, player);
    if (this.shieldHp > 0) {
      this.shieldFlash = Math.max(0, this.shieldFlash - dt * 4);
      this.shieldMat.opacity = 0.22 + 0.06 * Math.sin(this.t * 5) + this.shieldFlash * 0.5;
    }
    const c = this.run.craft;
    // weave about a station off the flank (racing up from astern at first)
    const t = this.t + this.phase;
    this.station.set(this.side * (9 + Math.sin(t * 0.55) * 2), 0, 2 + Math.sin(t * 0.37) * 7);
    if (this.leaving) {
      this.leaving += dt;
      this.station.set(this.side * 30, 0, -70);
      if (this.leaving > 3.5) return this.remove();
    }
    const px = this.local.x, pz = this.local.z;
    this.local.x += (this.station.x - this.local.x) * Math.min(1, dt * 1.1);
    this.local.z += (this.station.z - this.local.z) * Math.min(1, dt * 0.7);
    this.place(dt);
    // bank into its sideways drift, nose along the sled's heading (plus the drift)
    const lat = (this.local.x - px) / Math.max(dt, 1e-3), fwd = (this.local.z - pz) / Math.max(dt, 1e-3);
    this.bank += (THREE.MathUtils.clamp(-lat * 0.08, -0.5, 0.5) - this.bank) * Math.min(1, dt * 5);
    this.group.position.copy(this.pos);
    this.group.rotation.set(THREE.MathUtils.clamp(-fwd * 0.01, -0.15, 0.15), c.yaw - lat * 0.03, this.bank, 'YXZ');
    // the gunner tracks you
    this.aimPoint(player, _v);
    this.group.updateMatrixWorld();
    this.group.worldToLocal(_w.copy(this.state === 'aim' && this.timer < LOCK_T ? this.aimAt : _v));
    _w.sub(this.gun.position);
    this.gun.rotation.y = Math.atan2(-_w.x, -_w.z);
    this.glowFlash();
    // dust wake
    if (Math.random() < dt * 30) {
      _u.copy(this.pos).setY(this.run.surfaceAt(this.pos.x, this.pos.z) + 0.2);
      this.world.fx.puff(_u, rnd(-1, 1), rnd(0.5, 1.5), rnd(-1, 1), _c.set(DUST), 0.35, rnd(0.9, 1.5), rnd(0.4, 0.7), 3.2);
    }
    // fire: lock on (laser sight), burst, cool down
    this.timer -= dt;
    const fx = this.world.fx;
    if (this.state === 'cool') {
      this.beam.hide();
      this.charge.material.opacity = 0;
      if (this.timer <= 0 && this.dist < this.range && this.local.z > -12) {
        if (director.request(this, AIM_T + BURST * BURST_GAP + 0.3)) {
          this.state = 'aim';
          this.timer = AIM_T;
          sfx('turret_charge', { gain: 0.5 * falloff(this.dist, 6, 50), rate: 1.2, vary: 0.08 }, 'charge_up', { gain: 0.3, rate: 1.6 });
        } else this.timer = rnd(0.3, 0.6);
      }
    } else if (this.state === 'aim') {
      if (this.timer > LOCK_T) this.aimAt.copy(_v);
      this.muzzle.getWorldPosition(_u);
      const k = 1 - this.timer / AIM_T;
      this.beam.set(_u, this.aimAt, this.timer < LOCK_T ? 0.05 : 0.02 + 0.02 * k, this.timer < LOCK_T ? 0.95 : Math.sin(this.t * 40) > 0 ? 0.7 : 0.35, this.timer < LOCK_T ? 0xfff0b0 : HEX);
      this.charge.scale.setScalar(0.08 + 0.25 * k);
      this.charge.material.opacity = 0.4 + 0.5 * k;
      if (this.timer <= 0) {
        this.state = 'burst';
        this.shots = 0;
        this.timer = 0;
      }
    } else if (this.state === 'burst') {
      this.beam.hide();
      if (this.timer <= 0) {
        this.timer = BURST_GAP;
        this.muzzle.getWorldPosition(_u);
        // (the director's first shot from off screen goes wide, as a warning)
        const dir = _w.subVectors(director.aim(this, _u, this.aimAt), _u).normalize();
        dir.x += rnd(-0.015, 0.015);
        dir.y += rnd(-0.01, 0.01);
        new Orb(this.world, _u, dir.normalize().multiplyScalar(SHOT_SPEED), YELLOW, { radius: 0.26, life: 4 });
        fx.flash(_u, HEX, { size: 0.6 });
        sfx('turret_shot', { gain: 0.55 * Math.max(0.3, falloff(this.dist, 6, 50)), vary: 0.08 }, 'enemy_shot', { gain: 0.5, rate: 1.2 });
        if (++this.shots >= BURST) {
          this.state = 'cool';
          this.timer = rnd(2.4, 3.6);
          director.release(this);
        }
      }
      this.charge.material.opacity *= 0.8;
    }
  }

  die(hit, dir) {
    this.dead = true;
    this.state = 'crash';
    this.shield.visible = this.emitter.visible = false;
    this.crashT = 0;
    director.release(this);
    this.beam.hide();
    this.world.removeHittable(this.group);
    // it keeps the sled's speed as it goes, then digs in
    this.crashVel = this.run.craft.vel.clone().multiplyScalar(0.85).addScaledVector(dir || UP, 4).add(_v.set(0, 5, 0));
    this.spin = new THREE.Vector3(rnd(-3, 3), rnd(-2, 2), this.side * rnd(5, 8));
    new Blast(this.world, this.pos, YELLOW, { scale: 0.6, chunks: 4, shake: 0.12 });
    esfx('robot_pain_heavy', this.pos, 1, 1.1);
  }

  updateCrash(dt) {
    this.crashT += dt;
    this.crashVel.y -= 22 * dt;
    this.crashVel.x *= Math.exp(-1.2 * dt);
    this.crashVel.z *= Math.exp(-1.2 * dt);
    this.pos.addScaledVector(this.crashVel, dt);
    this.group.position.copy(this.pos);
    this.group.rotation.x += this.spin.x * dt;
    this.group.rotation.z += this.spin.z * dt;
    const fx = this.world.fx;
    fx.burst(this.pos, 0xffa040, { count: 2, speed: 3, life: 0.4, size: 0.2, gravity: 4 });
    fx.burst(this.pos, 0x3a3a44, { count: 2, speed: 0.8, life: 1.4, size: 0.7, gravity: -1.5, drag: 1 });
    const ground = this.run.surfaceAt(this.pos.x, this.pos.z);
    if (this.pos.y < ground + 0.3 || this.crashT > 2.5) {
      this.pos.y = Math.max(this.pos.y, ground + 0.2);
      erupt(fx, this.pos, 1.2);
      new Blast(this.world, this.pos, YELLOW, { scale: 1.2, chunks: 8, shake: 0.25 });
      this.onDeath?.(this);
      this.remove();
    }
  }
}

// ================================================================ DUNE SCARAB
// Breaks the surface ahead of the sled (0.6 s of spraying sand, head up: shootable from then on), leaps
// in a high arc onto the deck and clings to the rail; then it scuttles at you, rears up (0.5 s, glowing:
// the telegraph, holding a director token) and lunges at where you stood. Step aside or shoot it off. 1 hp.
const S_EMERGE = 0.7, S_REAR = 0.55, S_LUNGE = 0.22, S_LEAP = 1.05, S_REACH = 0.85;
export class DuneScarab extends Pooled {
  constructor(world, run) {
    super(world, { pos: [0, -200, 0], color: YELLOW, hp: 1, range: 60, wake: 400, aggro: true });
    this.run = run;
    this.barkPersona = null; // (a beast: no radio)
    this.painSound = null;
    this.local = new THREE.Vector2(); // on the deck: craft-local x, z
    this.lungeFrom = new THREE.Vector2();
    this.lungeTo = new THREE.Vector2();
    this.from = new THREE.Vector3();
    this.deckSpot = new THREE.Vector2();
    const gold = (this.goldMat = new THREE.MeshStandardMaterial({ color: 0xc9a040, metalness: 0.85, roughness: 0.32, flatShading: true }));
    const lapis = (this.lapisMat = new THREE.MeshStandardMaterial({ color: 0x1d3a8a, metalness: 0.5, roughness: 0.4, flatShading: true }));
    this.mats.push(gold, lapis);
    this.body = new THREE.Group();
    const p = new Parts()
      .add(gold, new THREE.SphereGeometry(0.5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), [0, 0, 0.05], [0, 0, 0], [0.9, 0.75, 1.2])
      .add(MAT.dark, new THREE.SphereGeometry(0.46, 10, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), [0, 0, 0.05], [0, 0, 0], [0.85, 0.35, 1.15])
      .add(lapis, new THREE.TorusGeometry(0.43, 0.03, 4, 16, Math.PI), [0, 0, -0.12], [0, 0, 0], [1, 0.78, 1])
      .add(lapis, new THREE.TorusGeometry(0.4, 0.03, 4, 16, Math.PI), [0, 0, 0.2], [0, 0, 0], [1, 0.75, 1])
      .add(this.glow, new THREE.TorusGeometry(0.5, 0.025, 4, 18, Math.PI), [0, 0, 0.05], [0, Math.PI / 2, 0], [1.2, 0.76, 1])
      .add(lapis, new THREE.SphereGeometry(0.3, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), [0, 0, -0.62], [0, 0, 0], [1.1, 0.7, 0.8])
      .add(gold, new THREE.ConeGeometry(0.06, 0.32, 5), [0, 0.12, -0.86], [-0.9, 0, 0]);
    for (const s of [-1, 1]) {
      p.add(this.glow, new THREE.SphereGeometry(0.05, 6, 4), [s * 0.16, 0.06, -0.84]);
      p.add(MAT.dark, new THREE.BoxGeometry(0.05, 0.05, 0.3), [s * 0.14, -0.05, -0.95], [0, s * 0.4, 0]); // mandibles
    }
    p.build(this.body);
    // six legs that paddle
    this.legs = [];
    for (const s of [-1, 1]) {
      for (const z of [-0.35, 0.05, 0.4]) {
        const leg = new THREE.Group();
        leg.position.set(s * 0.36, -0.05, z);
        const m = new THREE.Mesh(GEO.chunk, MAT.dark);
        m.scale.set(0.5, 0.05, 0.06);
        m.position.x = s * 0.25;
        m.rotation.z = s * -0.5;
        leg.add(m);
        this.body.add(leg);
        this.legs.push(leg);
      }
    }
    this.body.scale.setScalar(1.35);
    this.group.add(this.body);
    // a forgiving hit sphere
    const hb = new THREE.Mesh(GEO.ico, MAT.hidden);
    hb.scale.setScalar(0.85);
    this.group.add(hb);
    this.group.visible = false;
    this.gone = this.dead = true;
    world.scene.add(this.group);
  }

  // burst out of the sand at world point (x, z), then leap at the deck (color: yellow or red)
  spawn(x, z, color = YELLOW) {
    this.palette = [color];
    this.color = color;
    const y = this.run.surfaceAt(x, z);
    this.pos.set(x, y - 0.6, z);
    this.from.copy(this.pos);
    this.state = 'emerge';
    this.timer = S_EMERGE;
    this.awaken();
    this.group.position.copy(this.pos);
    // aim for a spot on the deck's rail on the side it came from
    const c = this.run.craft;
    _v.subVectors(this.pos, c.pos);
    const side = Math.sign(_v.dot(c.right(_w))) || 1;
    this.deckSpot.set(side * 1.05, rnd(-1.5, 0.8));
    erupt(this.world.fx, _u.set(x, y, z), 0.8);
    sfx('scarab_emerge', { gain: 0.8 * Math.max(0.35, falloff(this.dist, 5, 45)), vary: 0.1 }, 'sand_sink', { gain: 0.6 });
  }

  // where on the deck the player stands (craft-local)
  playerLocal(out) {
    return out.copy(this.run.craft.local);
  }


  update(dt, player) {
    this.tick(dt, player);
    const c = this.run.craft, fx = this.world.fx;
    this.timer -= dt;
    let lean = 0;
    if (this.state === 'emerge') {
      // rising out of a spray of sand, facing the sled
      const k = 1 - this.timer / S_EMERGE;
      const y = this.run.surfaceAt(this.from.x, this.from.z);
      this.pos.y = y - 0.6 + k * 0.8;
      this.face(c.pos, dt, 20);
      if (Math.random() < dt * 25) sandPuff(fx, _u.copy(this.pos).setY(y + 0.2), 1.5, 2, 0.6, 1);
      this.body.position.set(rnd(-0.04, 0.04), 0, rnd(-0.04, 0.04));
      if (this.timer <= 0) {
        this.state = 'leap';
        this.timer = S_LEAP;
        this.from.copy(this.pos);
        erupt(fx, this.pos, 0.6);
        sfx('scarab_pounce', { gain: 0.9 * Math.max(0.4, falloff(this.dist, 5, 40)), vary: 0.1 }, 'crab_leap', { gain: 0.7 });
      }
    } else if (this.state === 'leap') {
      // a high arc onto the moving deck (aimed where the deck will be when it lands)
      const u = 1 - Math.max(0, this.timer) / S_LEAP;
      c.toWorld(this.deckSpot.x, 0.3, this.deckSpot.y, _w).addScaledVector(c.vel, Math.max(0, this.timer));
      this.pos.lerpVectors(this.from, _w, smooth01(u * 0.85 + u * u * 0.15));
      this.pos.y += Math.sin(u * Math.PI) * 5;
      this.face(_w, dt, 8);
      this.body.rotation.x = -0.6 + u * 0.9;
      if (Math.random() < dt * 30) fx.puff(this.pos, 0, -0.5, 0, _c.set(DUST), 0.3, 0.6, 0.3, 2);
      if (this.timer <= 0) {
        this.body.rotation.x = 0;
        this.local.copy(this.deckSpot);
        this.state = 'crawl';
        this.timer = rnd(0.6, 1.0);
        c.rumble = Math.max(c.rumble, 0.25);
        esfx('hydraulic_land', this.pos, 0.7, 1.6);
        sfx('scarab_chitter', { gain: 0.9, vary: 0.1 }, 'crab_chirp', { gain: 0.6 });
        this.onLatch?.(this);
      }
    } else {
      // on the deck: carried by it, scuttling at you
      const me = this.local, you = this.playerLocal(_p2);
      const dx = you.x - me.x, dz = you.y - me.y, d = Math.hypot(dx, dz);
      if (this.state === 'crawl') {
        if (d > 1.15) {
          me.x += (dx / d) * 1.7 * dt;
          me.y += (dz / d) * 1.7 * dt;
          lean = 1;
        }
        if (this.timer <= 0 && d < 2.6) {
          if (director.request(this, S_REAR + S_LUNGE + 0.3)) {
            this.state = 'rear';
            this.timer = S_REAR;
            this.lungeFrom.copy(me);
            sfx('scarab_chitter', { gain: 1, rate: 1.3, vary: 0.1 }, 'crab_chirp', { gain: 0.7 });
          } else this.timer = 0.3;
        }
      } else if (this.state === 'rear') {
        // reared up, glowing: the lunge comes at where you are when it locks (the last moment)
        if (this.timer > 0.12) this.lungeTo.set(you.x, you.y);
        this.body.rotation.x = -0.5 * smooth01(1 - this.timer / S_REAR);
        if (this.timer <= 0) {
          this.state = 'lunge';
          this.timer = S_LUNGE;
          this.lungeFrom.copy(me);
          sfx('scarab_pounce', { gain: 1, vary: 0.1 }, 'crab_leap', { gain: 0.8 });
        }
      } else if (this.state === 'lunge') {
        const u = 1 - Math.max(0, this.timer) / S_LUNGE;
        me.lerpVectors(this.lungeFrom, this.lungeTo, u);
        this.body.rotation.x = -0.5 + u * 0.5;
        if (this.timer <= 0) {
          director.release(this);
          if (d < S_REACH && !player.dead) {
            player.damage(1, 'scarab');
            sfx('scarab_crunch', { gain: 1, vary: 0.1 }, 'hit', { gain: 0.8 });
          }
          this.state = 'crawl';
          this.timer = rnd(1.0, 1.5);
        }
      }
      me.x = THREE.MathUtils.clamp(me.x, -1.25, 1.25);
      me.y = THREE.MathUtils.clamp(me.y, -2.9, 1.5);
      c.toWorld(me.x, 0.32, me.y, this.pos);
      this.face(c.toWorld(you.x, 0.3, you.y, _w), dt, 10);
    }
    // legs paddle while it moves, glow flashes white while rearing
    for (let i = 0; i < this.legs.length; i++) this.legs[i].rotation.y = Math.sin(this.t * 22 + i * 1.7) * 0.5 * (lean || (this.state === 'leap' ? 1 : 0.2));
    this.group.position.copy(this.pos);
    if (this.state === 'rear' && Math.sin(this.t * 40) > 0) this.glow.color.setRGB(3, 2.6, 1.4);
    else this.glowFlash();
  }

  // turn the beetle toward a world point
  face(p, dt, rate) {
    const yaw = Math.atan2(-(p.x - this.pos.x), -(p.z - this.pos.z));
    const cur = this.group.rotation.y;
    let d = yaw - cur;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.group.rotation.y = cur + d * Math.min(1, dt * rate);
  }

  die(hit, dir) {
    this.dead = true;
    director.release(this);
    sfx('scarab_crunch', { gain: 0.9, vary: 0.1 }, 'crab_explode', { gain: 0.7 });
    new Blast(this.world, this.pos, YELLOW, { scale: 0.55, chunks: 4, vel: dir ? _v.copy(dir).multiplyScalar(4) : null, shake: 0.1 });
    this.onDeath?.(this);
    this.remove();
  }
}

// ================================================================ SAND GLOB
// The Excavator's spit: a blob of molten yellow sand that homes in (weakly) and bursts on you. Shootable
// with yellow. (A world projectile: world.update moves it, raycasts with projectiles: true can hit it.)
const globGeo = new THREE.IcosahedronGeometry(1, 1);
let globMats = null;
export class SandGlob {
  constructor(world, pos, vel, { homing = 1.2, life = 4.5, radius = 0.55 } = {}) {
    globMats ??= {
      core: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff2c0).multiplyScalar(1.6) }),
      shell: additive(new THREE.Color(HEX).multiplyScalar(2.2), 0.8),
    };
    this.world = world;
    this.pos = pos.clone();
    this.vel = vel.clone();
    this.speed = vel.length();
    this.homing = homing;
    this.life = life;
    this.radius = radius;
    this.hitRadius = radius + 0.5;
    this.color = YELLOW;
    this.alive = true;
    this.shootable = true;
    this.noInherit = true; // (the run leaves its velocity alone: it homes on its own)
    this.mesh = new THREE.Group();
    const core = new THREE.Mesh(globGeo, globMats.core);
    core.scale.setScalar(radius * 0.55);
    this.shell = new THREE.Mesh(globGeo, globMats.shell);
    this.shell.scale.setScalar(radius);
    this.mesh.add(core, this.shell);
    this.mesh.position.copy(this.pos);
    world.scene.add(this.mesh);
    world.projectiles.push(this);
  }

  update(dt, player) {
    this.life -= dt;
    if (this.life <= 0) return this.pop(false);
    _v.copy(player.pos).y += player.eye * 0.7;
    _w.subVectors(_v, this.pos).normalize().multiplyScalar(this.speed);
    this.vel.lerp(_w, Math.min(1, this.homing * dt)).setLength(this.speed);
    this.pos.addScaledVector(this.vel, dt);
    this.mesh.position.copy(this.pos);
    this.shell.rotation.x += dt * 4;
    this.shell.rotation.y += dt * 3;
    this.shell.scale.setScalar(this.radius * (1 + Math.sin(this.life * 20) * 0.08));
    if (Math.random() < dt * 40) this.world.fx.ember(this.pos, rnd(-1, 1), rnd(-1, 1), rnd(-1, 1), HEX, 0.4, 0.14);
    const b = player.bounds(), r = this.radius;
    if (this.pos.x > b.min.x - r && this.pos.x < b.max.x + r && this.pos.y > b.min.y - r && this.pos.y < b.max.y + r && this.pos.z > b.min.z - r && this.pos.z < b.max.z + r) {
      player.damage(1, 'orb');
      return this.pop(true);
    }
    if (this.world.pointInSolid(this.pos)) this.pop(true);
  }

  onHit(color) {
    if (!this.alive) return undefined;
    if (color !== YELLOW) return 'immune';
    audio.orbPop();
    this.pop(true);
    return 'kill';
  }

  pop(burst) {
    if (!this.alive) return;
    this.alive = false;
    const fx = this.world.fx;
    fx.orbPop(this.pos, HEX, this.radius);
    if (burst) fx.burst(this.pos, SAND, { count: 24, speed: 6, life: 0.7, size: 0.3, gravity: 10, mode: 'puff' });
  }

  dispose() {
    this.world.scene.remove(this.mesh);
  }
}

// ================================================================ EXCAVATOR
// A Lumen mining machine built like a sandworm: a chain of armored drum segments ending in a drill-maw of
// counter-rotating tooth rings round a glowing core. It erupts from the middle of the Maw (a quicksand
// whirlpool the sled circles), sways to keep its maw on you, and every few seconds charges (the jaws
// open, the core blazes and the air pulls in toward it) and spits a fan of sand globs. Its only weak spots
// are the four yellow vents along its neck (VENT_HP each), and only while they blow open after a spit
// (shuttered, like the armor, they bounce shots). Each vent starts behind a RED armor plate: red blasts it
// off (PLATE_HP), yellow bounces off it. With every vent out
// it convulses, bursts along its length and sinks back into the sand.
const SEGMENTS = 13;
const SEG_LEN = 2.6;
const VENT_HP = 6;
const PLATE_HP = 3; // the red armor plate bolted over each vent: blast it off with red first
const VENT_OPEN = 2.4; // seconds its vents stand open (blowing off heat) after each spit; shuttered otherwise
const VENT_SEGS = [2, 2, 4, 4]; // which segment (from the head) each vent sits on (on its belly, facing the sled)
const SPIT_EVERY = 3.4, SPIT_CHARGE = 1.3;
const HEAD_H = 19; // how high the maw rears over the sand
const LEAN = 10; // how far the neck arcs out over the sand toward the sled
const SEG_R = (i) => 3.5 - i * 0.12;
export class Excavator {
  constructor(world, run, { center }) {
    this.world = world;
    this.game = world.game;
    this.run = run;
    this.center = new THREE.Vector3(...center); // on the quicksand surface
    this.state = 'buried';
    this.t = 0;
    this.rise = 0;
    this.color = YELLOW;
    this.quietHits = true;
    this.head = new THREE.Vector3();
    this.headDir = new THREE.Vector3(0, 0, 1);
    this.look = new THREE.Vector3();
    this.flash = 0;
    this.group = new THREE.Group();
    this.group.visible = false;
    this.group.userData.hit = this;
    this.armorMat = new THREE.MeshStandardMaterial({ color: 0x3e342a, metalness: 0.45, roughness: 0.6, flatShading: true, emissive: 0x000000 });
    this.ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(HEX).multiplyScalar(0.55) }); // (dim: the vents are what glows)
    this.plateMat = new THREE.MeshStandardMaterial({ color: 0x24201b, metalness: 0.6, roughness: 0.6, flatShading: true });
    this.toothMat = new THREE.MeshStandardMaterial({ color: 0xb8b0a0, metalness: 0.9, roughness: 0.25, flatShading: true });
    this.glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(HEX).multiplyScalar(2.4) });
    this.coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(HEX).multiplyScalar(2) });
    this.deadVent = new THREE.MeshBasicMaterial({ color: 0x3a1408 });
    this.plateRedMat = new THREE.MeshStandardMaterial({ color: 0x5a1a14, metalness: 0.6, roughness: 0.45, flatShading: true, emissive: 0x200404 });
    this.redGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(RED_HEX).multiplyScalar(2.2) });
    // (every part moves on its own every frame: drawn as it is, not through batch.js)
    for (const m of [this.armorMat, this.plateMat, this.toothMat, this.glowMat, this.coreMat, this.ringMat, this.plateRedMat, this.redGlow]) m.userData.noBatch = true;
    // segments: drums tapering toward the tail, armor bands and a dorsal fin each
    this.segs = [];
    for (let i = 0; i < SEGMENTS; i++) {
      const r = SEG_R(i);
      const seg = new THREE.Group();
      const p = new Parts()
        .add(this.armorMat, new THREE.CylinderGeometry(r, r * 0.94, SEG_LEN * 0.78, 14), [0, 0, 0])
        .add(this.plateMat, new THREE.CylinderGeometry(r * 1.1, r * 1.1, 0.4, 14), [0, SEG_LEN * 0.42, 0])
        .add(this.plateMat, new THREE.CylinderGeometry(r * 0.88, r * 0.88, SEG_LEN * 0.3, 14), [0, -SEG_LEN * 0.48, 0]);
      // a dorsal ridge of blades and two flank plates per drum
      p.add(this.plateMat, new THREE.ConeGeometry(0.5, 1.8, 4), [0, 0.1, -r - 0.6], [-Math.PI / 2 + 0.4, 0, 0]);
      for (const sx of [-1, 1]) p.add(this.armorMat, new THREE.BoxGeometry(0.35, SEG_LEN * 0.6, r * 0.9), [sx * r * 0.98, 0, r * 0.15], [0, 0, 0]);
      if (i % 2 === 0) p.add(this.ringMat, new THREE.TorusGeometry(r * 1.1, 0.045, 4, 28), [0, SEG_LEN * 0.42 + 0.2, 0], [Math.PI / 2, 0, 0]);
      p.build(seg);
      this.group.add(seg);
      this.segs.push(seg);
    }
    // the head: a heavy drum, four jaw plates that open, three counter-rotating tooth rings, the core
    const head = (this.headObj = new THREE.Group());
    new Parts()
      .add(this.armorMat, new THREE.CylinderGeometry(3.5, 3.3, 3.6, 14), [0, 0, 0])
      .add(this.plateMat, new THREE.CylinderGeometry(3.75, 3.75, 0.6, 14), [0, -1.4, 0])
      .add(this.plateMat, new THREE.CylinderGeometry(3.6, 3.6, 0.4, 14), [0, 1.25, 0])
      .add(this.ringMat, new THREE.TorusGeometry(3.62, 0.06, 4, 28), [0, 1.5, 0], [Math.PI / 2, 0, 0])
      .add(this.plateMat, new THREE.CylinderGeometry(1.4, 1.4, 0.6, 12), [0, 1.0, 0])
      .build(head);
    this.core = new THREE.Mesh(GEO.sphere, this.coreMat);
    this.core.position.y = 1.0;
    this.core.scale.setScalar(1.1);
    head.add(this.core);
    this.rings = [];
    for (let k = 0; k < 3; k++) {
      const ring = new THREE.Group();
      const rr = 1.6 + k * 0.6, n = 10 + k * 4;
      const p = new Parts();
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        p.add(this.toothMat, new THREE.ConeGeometry(0.22, 0.9 - k * 0.1, 4), [Math.cos(a) * rr, 0, Math.sin(a) * rr], [0, -a, -0.55]);
      }
      p.add(this.plateMat, new THREE.TorusGeometry(rr, 0.12, 4, 24), [0, -0.3, 0], [Math.PI / 2, 0, 0]);
      p.build(ring);
      ring.position.y = 1.45 + k * 0.08;
      head.add(ring);
      this.rings.push(ring);
    }
    this.jaws = [];
    for (let i = 0; i < 4; i++) {
      const hinge = new THREE.Group();
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      hinge.position.set(Math.cos(a) * 3.0, 1.4, Math.sin(a) * 3.0);
      hinge.rotation.y = -a;
      const jaw = new Parts()
        .add(this.armorMat, new THREE.BoxGeometry(0.5, 3.2, 2.6), [0, 1.5, 0], [0, 0, 0.0])
        .add(this.toothMat, new THREE.ConeGeometry(0.3, 1.2, 4), [-0.4, 3.0, 0.7], [0, 0, 0.9])
        .add(this.toothMat, new THREE.ConeGeometry(0.3, 1.2, 4), [-0.4, 3.0, -0.7], [0, 0, 0.9])
        .add(this.glowMat, new THREE.BoxGeometry(0.06, 2.6, 0.08), [-0.27, 1.4, 0]);
      jaw.build(hinge);
      head.add(hinge);
      this.jaws.push(hinge);
    }
    this.group.add(head);
    // the vents: glowing grilles on the neck segments (the only place a shot hurts it)
    this.vents = [];
    for (let i = 0; i < VENT_SEGS.length; i++) {
      const seg = this.segs[VENT_SEGS[i]];
      const r = SEG_R(VENT_SEGS[i]) * 1.07;
      const phi = i % 2 ? -0.62 : 0.62; // either side of the belly (+z, which faces the sled)
      const v = new THREE.Group();
      v.position.set(Math.sin(phi) * (r + 0.05), 0.1, Math.cos(phi) * (r + 0.05));
      v.rotation.set(Math.PI / 2, phi, 0, 'YXZ'); // (its face, +y, turned out from the drum)
      const frame = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.35, 2.0), this.plateMat);
      const grille = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.4, 1.6), this.glowMat.clone());
      const slats = [];
      for (let s = 0; s < 4; s++) {
        // shutter slats over the grille (they count as the vent too, so open they never soak up a good shot)
        const slat = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 0.09), this.plateMat);
        slats.push(slat);
        slat.position.set(0, 0.3, -0.6 + s * 0.4);
        slat.userData.hit = this;
        slat.userData.part = i;
        v.add(slat);
      }
      grille.position.y = 0.05;
      grille.userData.hit = this;
      grille.userData.part = i;
      // the red plate over it: a thick slab with glowing red seams, on a hinge it's blown off of
      const plate = new THREE.Group();
      plate.position.y = 0.55;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.4, 2.3), this.plateRedMat);
      slab.userData.hit = this;
      slab.userData.part = 'plate' + i;
      const seams = new Parts();
      for (const [w, d, x, z] of [[2.5, 0.08, 0, 1.1], [2.5, 0.08, 0, -1.1], [0.08, 2.3, 1.22, 0], [0.08, 2.3, -1.22, 0], [1.8, 0.1, 0, 0], [0.1, 1.6, 0, 0]]) seams.add(this.redGlow, new THREE.BoxGeometry(w, 0.45, d), [x, 0, z]);
      seams.build(plate);
      plate.add(slab);
      v.add(frame, grille, plate);
      seg.add(v);
      this.vents.push({ group: v, grille, slats, plate, plateHp: PLATE_HP, plateFlash: 0, hp: VENT_HP, alive: true, flash: 0, smokeT: 0, shut: 1 });
    }
    world.scene.add(this.group);
    world.addHittable(this.group);
    world.add(this);
  }

  get alive() {
    return this.state !== 'buried' && this.state !== 'dead';
  }

  get ventsLeft() {
    let n = 0;
    for (const v of this.vents) if (v.alive) n++;
    return n;
  }

  // out of the sand (the run calls this as the sled enters the Maw)
  emerge() {
    if (this.state !== 'buried') return;
    this.state = 'emerge';
    this.t = 0;
    this.rise = 0;
    this.spitT = 2.4;
    this.spitAt = -99;
    this.charging = 0;
    this.deathT = 0;
    this.group.visible = true;
    this.armorMat.emissive.setHex(0x000000);
    for (const v of this.vents) {
      v.alive = true;
      v.hp = VENT_HP;
      v.plateHp = PLATE_HP;
      v.plate.visible = true;
      v.grille.material.color.copy(this.glowMat.color);
      v.grille.visible = true;
    }
    const fx = this.world.fx;
    erupt(fx, this.center, 4);
    this.game.player.shake = Math.max(this.game.player.shake, 0.6);
    audio.sample('root_rumble', { gain: 1, rate: 0.7 }) || audio.slam();
    audio.sample('leviathan_roar', { gain: 1.1, rate: 0.8 }) || audio.sample('titan_roar', { gain: 1 });
  }

  // back under, as if it never came up (a respawn mid-run)
  reset() {
    this.state = 'buried';
    this.group.visible = false;
    this.rise = 0;
    director.release(this);
  }

  update(dt, player) {
    if (this.state === 'buried' || this.state === 'dead') return;
    this.t += dt;
    const fx = this.world.fx;
    const sled = this.run.craft;
    // where the maw wants to be: reared over the middle, leaning out toward the sled, swaying
    const toward = _w.subVectors(sled.pos, this.center).setY(0);
    const dist = toward.length() || 1;
    toward.divideScalar(dist);
    let lean = LEAN, sway = 1;
    if (this.state === 'emerge') {
      this.rise = Math.min(1, this.rise + dt / 2.6);
      if (Math.random() < dt * 30) erupt(fx, _u.copy(this.center).add(_v.set(rnd(-4, 4), 0, rnd(-4, 4))), 1);
      if (this.rise >= 1) {
        this.state = 'fight';
        this.onFight?.(this);
      }
    } else if (this.state === 'dying') {
      this.deathT += dt;
      sway = 2.5;
      const k = Math.max(0, (this.deathT - 1.8) / 3);
      this.rise = 1 - smooth01(k);
      lean = LEAN + k * 8;
      if (Math.random() < dt * (this.deathT < 2 ? 6 : 2)) {
        const seg = this.segs[(Math.random() * SEGMENTS) | 0];
        seg.getWorldPosition(_u);
        new Blast(this.world, _u, YELLOW, { scale: 1.5, chunks: 6, shake: 0.25 });
      }
      if (this.deathT > 1.8 && Math.random() < dt * 20) erupt(fx, _u.copy(this.center).add(_v.set(rnd(-5, 5), 0, rnd(-5, 5))), 1.4);
      if (this.deathT > 5) {
        this.state = 'dead';
        this.group.visible = false;
        erupt(fx, this.center, 5);
        fx.ring(_u.copy(this.center).setY(this.center.y + 0.3), UP, SAND, { size: 2, end: 40, life: 1.6, thick: 1.2, k: 0.6 });
        audio.sample('floor_collapse', { gain: 1, rate: 0.6 });
        this.onDead?.(this);
        return;
      }
    }
    const rise = smooth01(this.rise);
    const swayX = Math.sin(this.t * 0.7) * 2.2 * sway + (this.state === 'dying' ? Math.sin(this.t * 9) * 0.8 : 0);
    const swayZ = Math.cos(this.t * 0.53) * 1.6 * sway;
    const side = Math.sin(this.t * 0.45) * 7 * sway; // (it weaves across your view, so you see the neck's arch)
    this.head.set(this.center.x + toward.x * lean - toward.z * side + swayX, this.center.y - 18 + (HEAD_H + 18) * rise + Math.sin(this.t * 1.1) * 0.6, this.center.z + toward.z * lean + toward.x * side + swayZ);
    // the body: a curve from deep under the sand up through the surface to the head
    // (rising straight out of the throat, then arching over toward the sled like a rearing cobra)
    const p0x = this.center.x - toward.x * 2, p0y = this.center.y - 12, p0z = this.center.z - toward.z * 2;
    const p1x = this.center.x - toward.x * 3, p1y = this.center.y - 10 + (HEAD_H + 16) * rise, p1z = this.center.z - toward.z * 3;
    for (let i = 0; i < SEGMENTS; i++) {
      const u = 1 - (i + 0.9) / (SEGMENTS + 1);
      bez(p0x, p0y, p0z, p1x, p1y, p1z, this.head, u, _u);
      bezTan(p0x, p0y, p0z, p1x, p1y, p1z, this.head, u, _v);
      const seg = this.segs[i];
      seg.position.copy(_u);
      // up its length along the curve, its belly (+z) turned toward the sled
      _v.normalize();
      _z.copy(toward).addScaledVector(_v, -toward.dot(_v)).normalize();
      _x.crossVectors(_v, _z);
      seg.quaternion.setFromRotationMatrix(_m.makeBasis(_x, _v, _z));
    }
    // the head aims its maw at you (lazily)
    _v.copy(player.pos).y += 1;
    _v.sub(this.head).normalize();
    this.headDir.lerp(_v, Math.min(1, dt * 1.6)).normalize();
    this.headObj.position.copy(this.head);
    this.headObj.quaternion.setFromUnitVectors(UP, this.headDir);
    this.rings[0].rotation.y += dt * 2.5;
    this.rings[1].rotation.y -= dt * 1.8;
    this.rings[2].rotation.y += dt * 1.2;
    // attack: charge (jaws open, core blazes, motes pour in) then a fan of globs
    let open = -0.3 + Math.sin(this.t * 2) * 0.06;
    if (this.state === 'fight') {
      this.spitT -= dt;
      if (this.charging > 0) {
        this.charging -= dt;
        const k = 1 - this.charging / SPIT_CHARGE;
        open = -0.3 + 1.15 * smooth01(k * 1.5);
        this.core.scale.setScalar(1.1 + k * 0.9 + Math.sin(this.t * 40) * 0.08 * k);
        this.coreMat.color.set(HEX).multiplyScalar(2 + k * 1.2);
        if (Math.random() < dt * 14) {
          this.core.getWorldPosition(_u);
          converge(fx, _u, HEX, { count: 6, radius: 5, time: 0.5, size: 0.08 });
        }
        if (this.charging <= 0) this.spit(player);
      } else if (this.spitT <= 0) {
        if (director.request(this, SPIT_CHARGE + 0.6)) {
          this.charging = SPIT_CHARGE;
          audio.sample('boss_charge', { gain: 0.9, rate: 0.8 }) || audio.sample('charge_up', { gain: 0.8, rate: 0.6 });
        } else this.spitT = 0.4;
      } else {
        this.core.scale.setScalar(1.1);
        this.coreMat.color.set(HEX).multiplyScalar(2);
      }
    }
    for (const j of this.jaws) j.rotation.z = -open;
    // vents: shuttered, or open and blazing (blowing off heat) for a while after each spit; flash when
    // hit, smoke once broken
    this.ventOpen = this.state === 'fight' && this.t - this.spitAt < VENT_OPEN;
    for (const v of this.vents) {
      if (v.alive) {
        v.shut += ((this.ventOpen ? 0 : 1) - v.shut) * Math.min(1, dt * 10);
        if (v.plateHp > 0) {
          v.plateFlash = Math.max(0, v.plateFlash - dt * 6);
          v.plate.position.y = 0.55 + v.plateFlash * 0.12;
        }
        for (const sl of v.slats) sl.scale.z = 1 + v.shut * 3.6;
        v.flash = Math.max(0, v.flash - dt * 6);
        if (v.flash > 0) v.grille.material.color.setRGB(3, 3, 3);
        else v.grille.material.color.copy(this.glowMat.color).multiplyScalar((0.85 + 0.35 * Math.sin(this.t * 9)) * (1 - v.shut * 0.8));
        if (Math.random() < dt * (this.ventOpen ? 30 : 4)) {
          v.grille.getWorldPosition(_u);
          if (this.ventOpen) fx.puff(_u, rnd(-1.5, 1.5), rnd(2, 4), rnd(-1.5, 1.5), _c.set(0xfff0c8), 0.35, 0.9, 0.7, 3);
          fx.ember(_u, rnd(-1, 1), rnd(1, 3), rnd(-1, 1), HEX, 0.7, 0.16);
        }
      } else if ((v.smokeT -= dt) <= 0) {
        v.smokeT = 0.08;
        v.grille.getWorldPosition(_u);
        fx.burst(_u, 0x2e2a28, { count: 2, speed: 1.5, life: 1.6, size: 1.2, gravity: -2.5, drag: 1 });
        if (Math.random() < 0.3) fx.burst(_u, 0xff7a20, { count: 3, speed: 4, life: 0.4, size: 0.25, gravity: 6 });
      }
    }
    this.flash = Math.max(0, this.flash - dt * 5);
    this.armorMat.emissive.setRGB(this.flash * 0.22, this.flash * 0.16, this.flash * 0.04);
    // the sand churns where it breaks the surface
    if (Math.random() < dt * 12) {
      _u.copy(this.center).add(_v.set(rnd(-3.5, 3.5), 0.2, rnd(-3.5, 3.5)));
      sandPuff(fx, _u, 2, 1.5, 1.4, 2);
    }
  }

  spit(player) {
    director.release(this);
    this.spitAt = this.t;
    audio.sample('hydraulic_hiss', { gain: 0.9, rate: 0.7 }); // (the vents blow open)
    this.spitT = SPIT_EVERY * (this.ventsLeft <= 2 ? 0.75 : 1);
    this.core.getWorldPosition(_u);
    const n = this.ventsLeft <= 2 ? 4 : 3;
    _w.copy(player.pos).y += 1.2;
    const base = _v.subVectors(_w, _u).normalize();
    const side = _w.crossVectors(base, UP).normalize();
    for (let i = 0; i < n; i++) {
      const a = (i - (n - 1) / 2) * 0.32;
      const dir = new THREE.Vector3().copy(base).addScaledVector(side, a).addScaledVector(UP, 0.18 + Math.abs(a) * 0.2).normalize();
      new SandGlob(this.world, _u.clone().addScaledVector(dir, 2), dir.multiplyScalar(19), { homing: 1.1 + Math.random() * 0.4 });
    }
    this.world.fx.burst(_u, HEX, { count: 40, speed: 10, life: 0.6, size: 0.5, gravity: 4 });
    audio.sample('leviathan_spit', { gain: 1, rate: 0.75 }) || audio.sample('mortar_launch', { gain: 1 });
    this.game.player.shake = Math.max(this.game.player.shake, 0.2);
  }

  onHit(color, hit) {
    if (this.state !== 'fight' && this.state !== 'emerge') return undefined;
    const i = hit?.object?.userData.part;
    const fx = this.world.fx, p = hit?.point;
    // a red armor plate: red knocks it loose, and off; anything else glances off it
    if (typeof i === 'string') {
      const pv = this.vents[+i.slice(5)];
      if (!pv || pv.plateHp <= 0) return 'immune';
      if (color !== RED) {
        this.flash = Math.max(this.flash, 0.3);
        return 'immune';
      }
      pv.plateHp--;
      pv.plateFlash = 1;
      if (p) fx.burst(p, RED_HEX, { count: 16, speed: 8, life: 0.4, size: 0.22, gravity: 8 });
      audio.droneHit(1);
      if (pv.plateHp > 0) return 'hit';
      pv.plate.visible = false;
      pv.plate.getWorldPosition(_u);
      new Blast(this.world, _u, RED, { scale: 1.1, chunks: 6, shake: 0.25 });
      audio.sample('shield_break', { gain: 1, rate: 0.8 });
      this.onPlate?.(this);
      return 'kill';
    }
    const v = typeof i === 'number' ? this.vents[i] : null;
    if (!v || !v.alive || color !== YELLOW || !this.ventOpen || v.plateHp > 0) {
      this.flash = Math.max(this.flash, 0.3);
      return 'immune';
    }
    v.hp--;
    v.flash = 1;
    this.flash = 1;
    if (p) {
      fx.burst(p, 0xffd9a0, { count: 18, speed: 9, life: 0.4, size: 0.18, gravity: 10 });
      fx.burst(p, HEX, { count: 10, speed: 5, life: 0.35, size: 0.25, gravity: 4 });
    }
    audio.droneHit(1);
    this.game.hud.bossPulse?.('crit');
    if (v.hp > 0) {
      this.onDamage?.(this);
      return 'hit';
    }
    // vent blown: a burst, it goes dark and smokes, the machine reels and roars
    v.alive = false;
    v.grille.material.color.copy(this.deadVent.color);
    v.grille.getWorldPosition(_u);
    new Blast(this.world, _u, YELLOW, { scale: 1.6, chunks: 8, shake: 0.35 });
    audio.sample('titan_groan_big', { gain: 1, rate: 1.1 }) || audio.sample('leviathan_roar', { gain: 0.9, rate: 1.2 });
    this.onDamage?.(this);
    if (!this.ventsLeft) {
      this.state = 'dying';
      this.deathT = 0;
      this.charging = 0;
      director.release(this);
      audio.sample('boss_death', { gain: 1, rate: 0.9 }) || audio.sample('leviathan_death', { gain: 1 });
      return 'kill';
    }
    return 'kill';
  }

  hpFrac() {
    let hp = 0;
    for (const v of this.vents) hp += Math.max(0, v.hp) + Math.max(0, v.plateHp);
    return hp / ((VENT_HP + PLATE_HP) * this.vents.length);
  }

  get platesLeft() {
    let n = 0;
    for (const v of this.vents) if (v.plateHp > 0) n++;
    return n;
  }
}

// quadratic bezier from p0 through control p1 to p2 (a Vector3), at u
function bez(x0, y0, z0, x1, y1, z1, p2, u, out) {
  const a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
  return out.set(a * x0 + b * x1 + c * p2.x, a * y0 + b * y1 + c * p2.y, a * z0 + b * z1 + c * p2.z);
}
function bezTan(x0, y0, z0, x1, y1, z1, p2, u, out) {
  const a = 2 * (1 - u), b = 2 * u;
  return out.set(a * (x1 - x0) + b * (p2.x - x1), a * (y1 - y0) + b * (p2.y - y1), a * (z1 - z0) + b * (p2.z - z1));
}

export { erupt, sandPuff, glowMat };
