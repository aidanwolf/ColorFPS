// AZURE creatures: Robo-Fish (piranha robots in schools that dart at swimmers and leap out at people on
// the bank) and the Robo-Squid (a smart swimmer that jets away in a cloud of ink when you aim at it and
// fires slow ink torpedoes). Both live inside the swimmable water boxes (world.waters, see B.water).
import * as THREE from 'three';
import { COLORS, RED, YELLOW } from '../colors.js';
import {
  UP, falloff, rnd, sfx, Voice, moveSafe, groundBelow, waterAt, clampToWater, aimedAt, touchesPlayer, lobVelocity,
  Glob, InkCloud, Debris, blast, hitSparks, tint,
} from './critters.js';
import { director } from '../combat/director.js';

const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _d = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _sc = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _c = new THREE.Color();
const FWD = new THREE.Vector3(0, 0, -1);
const GRAVITY = 20;
const DORMANT = 65;

// the water box that holds p, or failing that the nearest one within `reach` m
function findWater(world, p, reach = 4) {
  const inside = waterAt(world, p);
  if (inside) return inside;
  let best = null, bestD = reach;
  for (const w of world.waters || []) {
    const d = _v.copy(p).clamp(w.min, w.max).distanceTo(p);
    if (d < bestD) {
      bestD = d;
      best = w;
    }
  }
  return best;
}

// is the player swimming in (or right at the surface of) water box w?
function playerIn(player, w) {
  const p = player.pos, cy = p.y + player.height * 0.5;
  return p.x > w.min.x && p.x < w.max.x && p.z > w.min.z && p.z < w.max.z && cy > w.min.y && cy < w.max.y + 0.4;
}

function mergeAll(geos) {
  const out = new THREE.BufferGeometry();
  const pos = [], nor = [], idx = [];
  let base = 0;
  for (const g of geos) {
    const p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + base);
    else for (let i = 0; i < p.count; i++) idx.push(i + base);
    base += p.count;
  }
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setIndex(idx);
  return out;
}

// ======================================================================================================
// ROBO-FISH
// Sleek robot piranhas, 1 hp each, schooling in a lazy loop through their pool. Swim in with them and one
// at a time they break off: the fish stops, turns on you and its eyes strobe (the telegraph), then it rams
// in a straight line at where you were. Stand on the bank near their water and one swims up under you,
// strobes, and leaps out at you. Trailing bubbles; a miss that lands on dry ground flops and shorts out.
// ======================================================================================================
const FISH = {
  cruise: 3.2,
  align: 0.65, // s telegraph before a dart
  dart: 12.5,
  dartTime: 1.0,
  leapAim: 0.75, // s telegraph under the surface before a leap
  radius: 0.42, // contact radius
  scale: 1.45, // model scale
};
let fishGeo = null;

function fishGeometry() {
  if (fishGeo) return fishGeo;
  // body: deep and narrow, blunt-headed, a heavy underbite jaw, a dorsal blade and pectoral fins
  const body = new THREE.SphereGeometry(1, 12, 9).scale(0.14, 0.22, 0.42);
  const back = new THREE.SphereGeometry(1, 8, 6).scale(0.1, 0.13, 0.25).translate(0, 0.09, 0.12);
  const jaw = new THREE.BoxGeometry(0.18, 0.08, 0.2).translate(0, -0.11, -0.3).rotateX(-0.22);
  const dorsal = new THREE.ConeGeometry(0.11, 0.26, 3).scale(0.25, 1, 1).rotateX(-0.6).translate(0, 0.27, 0.05);
  const pecL = new THREE.ConeGeometry(0.06, 0.2, 3).scale(1, 1, 0.25).rotateZ(2.2).translate(-0.17, -0.06, -0.08);
  const pecR = new THREE.ConeGeometry(0.06, 0.2, 3).scale(1, 1, 0.25).rotateZ(-2.2).translate(0.17, -0.06, -0.08);
  const teeth = [];
  for (let i = 0; i < 5; i++) {
    const x = -0.07 + i * 0.035;
    teeth.push(new THREE.ConeGeometry(0.014, 0.06, 3).translate(x, -0.04, -0.39));
    teeth.push(new THREE.ConeGeometry(0.014, 0.06, 3).rotateX(Math.PI).translate(x, -0.12, -0.38));
  }
  const eyes = [];
  for (const sx of [-1, 1]) eyes.push(new THREE.SphereGeometry(0.045, 8, 6).translate(sx * 0.105, 0.05, -0.24));
  // a glowing seam along each flank
  eyes.push(new THREE.BoxGeometry(0.29, 0.02, 0.42).translate(0, 0.0, 0.03));
  fishGeo = {
    body: mergeAll([body, back, jaw, dorsal, pecL, pecR]),
    teeth: mergeAll(teeth),
    glow: mergeAll(eyes),
    tail: new THREE.ConeGeometry(0.17, 0.3, 3).scale(0.22, 1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.15),
  };
  return fishGeo;
}

class Fish {
  constructor(school, i, color) {
    this.school = school;
    this.i = i;
    this.color = color;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.face = new THREE.Vector3(0, 0, -1);
    this.dir = new THREE.Vector3();
    this.state = 'school';
    this.timer = 0;
    this.wait = 0;
    this.dead = false;
    this.flash = 0;
    this.phase = Math.random() * 10;
    const G = fishGeometry();
    this.group = new THREE.Group();
    this.group.userData.hit = this;
    this.glowMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const body = new THREE.Mesh(G.body, school.metalMat);
    const teeth = new THREE.Mesh(G.teeth, school.toothMat);
    const glow = new THREE.Mesh(G.glow, this.glowMat);
    this.tail = new THREE.Mesh(G.tail, school.finMat);
    this.tail.position.z = 0.36;
    this.group.add(body, teeth, glow, this.tail);
    this.group.scale.setScalar(FISH.scale);
    this.parts = [body, teeth, this.tail];
    school.group.add(this.group);
    school.world.addHittable(this.group);
    tint(this.glowMat, color, 2.4);
  }

  onHit(color, hit) {
    if (this.dead) return undefined;
    const s = this.school;
    s.alert = true;
    if (color !== this.color) {
      this.flash = -1;
      // startled: flick away from the shot
      if (this.state === 'school') this.vel.addScaledVector(_v.copy(hit?.dir ?? FWD).cross(UP).normalize(), rnd(-6, 6));
      return 'immune';
    }
    hitSparks(s.world, hit, hit?.point ?? this.pos, this.color);
    this.die(true);
    return 'kill';
  }

  die(shot) {
    if (this.dead) return;
    const s = this.school, W = s.world;
    const last = s.fish.every((o) => o === this || o.dead);
    this.dead = true;
    W.removeHittable(this.group);
    blast(W, this.pos, this.color, 0.4);
    if (s.water && waterAt(W, this.pos)) W.fx.bubbles(this.pos, 10);
    sfx(shot ? 'critter_hit' : 'glob_pop', 0.8 * falloff(this.pos.distanceTo(W.game.camera.position), 5, 40));
    this.glowMat.color.setRGB(0.4, 0.1, 0.08);
    // (the last fish's debris frees the school's shared materials once it's gone)
    const mats = last ? [this.glowMat, s.metalMat, s.finMat, s.toothMat] : [this.glowMat];
    new Debris(W, this.parts, { from: this.pos, speed: 3.5, mats, water: s.water });
    s.group.remove(this.group);
    s.fishDied(this);
  }
}

export class FishSchool {
  constructor(world, opts) {
    const { pos, count = 4, color = RED, range = 16, leapRange = 6, patrol = 5, onDeath = null } = opts;
    this.spawnOpts = opts;
    this.critter = true;
    this.world = world;
    this.home = new THREE.Vector3(...pos);
    this.range = range;
    this.leapRange = leapRange;
    this.patrol = patrol;
    this.onDeath = onDeath;
    this.t = Math.random() * 100;
    this.dead = false;
    this.water = null;
    this.center = new THREE.Vector3();
    this.metalMat = new THREE.MeshStandardMaterial({ color: 0x8796a8, metalness: 0.85, roughness: 0.3, flatShading: true });
    this.finMat = new THREE.MeshStandardMaterial({ color: 0x1e2430, metalness: 0.7, roughness: 0.4, flatShading: true, side: THREE.DoubleSide });
    this.toothMat = new THREE.MeshStandardMaterial({ color: 0xe8eef5, metalness: 1, roughness: 0.15, emissive: 0x30343a });
    this.group = new THREE.Group(); // fish positions are in world space
    const colors = Array.isArray(color) ? color : [color];
    this.fish = [];
    for (let i = 0; i < Math.max(1, count); i++) this.fish.push(new Fish(this, i, colors[i % colors.length]));
    world.scene.add(this.group);
    world.add(this);
    this.reset();
  }

  reset() {
    if (this.dead) return;
    this.water ??= findWater(this.world, this.home);
    this.alert = false;
    this.attackCool = rnd(1, 2);
    this.sightTimer = 0;
    this.sees = false;
    this.center.copy(this.home);
    this.fish.forEach((f, k) => {
      if (f.dead) return;
      const a = (k / this.fish.length) * Math.PI * 2;
      f.pos.set(this.home.x + Math.cos(a) * 1.2, this.home.y + Math.sin(a * 2) * 0.3, this.home.z + Math.sin(a) * 1.2);
      if (this.water) clampToWater(f.pos, this.water, 0.4, 0.5);
      f.vel.set(0, 0, 0);
      f.state = 'school';
      f.flash = 0;
      this.place(f, 1);
    });
  }

  get living() {
    return this.fish.filter((f) => !f.dead);
  }

  fishDied() {
    if (this.living.length) return;
    this.dead = true;
    this.onDeath?.(this);
    this.dispose(false);
  }

  update(dt, player) {
    if (this.dead) return;
    this.water ??= findWater(this.world, this.home);
    _eye.copy(player.pos).y += player.eye;
    const dist = this.center.distanceTo(_eye);
    this.dist = dist;
    if (dist > DORMANT) return;
    this.t += dt;
    const w = this.water;
    // the school's center drifts around a loop near home
    const P = this.patrol;
    this.center.set(this.home.x + Math.sin(this.t * 0.31) * P, this.home.y + Math.sin(this.t * 0.47) * 0.6, this.home.z + Math.sin(this.t * 0.19 + 1) * P);
    if (w) clampToWater(this.center, w, 1.0, 0.8);
    // spotting the player: in our water, or on the bank close by
    this.sightTimer -= dt;
    const swimmer = w && playerIn(player, w);
    let bank = false;
    if (w && !swimmer) {
      const near = _v.copy(player.pos).clamp(w.min, w.max);
      const hd = Math.hypot(near.x - player.pos.x, near.z - player.pos.z);
      bank = hd < this.leapRange && player.pos.y > w.max.y - 0.5 && player.pos.y < w.max.y + 3.5;
    }
    if (this.sightTimer <= 0) {
      this.sightTimer = 0.3;
      this.sees = (swimmer || bank) && dist < this.range + 6 && this.world.lineOfSight(this.center, _eye);
      if (this.sees && !this.alert) sfx('fish_alert', 0.6 * falloff(dist, 4, 30));
      if (this.sees) this.alert = true;
    }
    // one fish at a time breaks off to attack
    this.attackCool -= dt;
    const living = this.living;
    if (this.sees && this.attackCool <= 0 && !living.some((f) => f.state !== 'school' && f.state !== 'return')) {
      let best = null, bd = Infinity;
      for (const f of living) {
        if (f.state !== 'school') continue;
        const d = f.pos.distanceTo(player.pos);
        if (d < bd) {
          bd = d;
          best = f;
        }
      }
      // (every dart or leap needs one of the combat director's attack tokens; without one, ask again shortly)
      if (best && swimmer && bd < this.range && !director.request(best, FISH.align + FISH.dartTime + 0.2)) this.attackCool = rnd(0.25, 0.5);
      else if (best && swimmer && bd < this.range) {
        best.state = 'align';
        this.attackCool = rnd(0.9, 1.6);
        best.timer = FISH.align;
        sfx('fish_alert', 0.7 * falloff(bd, 3, 25), { rate: 1.3 });
      } else if (best && bank) {
        best.state = 'surface';
        best.timer = 4;
        best.wait = 0;
        this.attackCool = rnd(0.9, 1.6);
      } else this.attackCool = rnd(0.25, 0.5);
    }
    for (let k = 0; k < living.length; k++) this.updateFish(living[k], dt, player, k, living);
  }

  updateFish(f, dt, player, k, living) {
    const w = this.water, W = this.world;
    f.timer -= dt;
    f.flash = Math.min(1, Math.max(-1, f.flash - Math.sign(f.flash) * dt * 5));
    let maxSpeed = FISH.cruise;
    switch (f.state) {
      case 'school':
      case 'return': {
        // hold a slot on a slowly turning ring round the school center, keeping apart from the others
        const a = (k / living.length) * Math.PI * 2 + this.t * 0.6;
        _a.set(Math.cos(a) * 1.3, Math.sin(a * 2 + f.phase) * 0.35, Math.sin(a) * 1.3).add(this.center);
        _d.subVectors(_a, f.pos).multiplyScalar(1.6);
        for (const o of living) {
          if (o === f) continue;
          _v.subVectors(f.pos, o.pos);
          const l = _v.length();
          if (l < 0.8 && l > 1e-3) _d.addScaledVector(_v, (0.8 - l) * 6 / l);
        }
        if (_d.length() > maxSpeed) _d.setLength(maxSpeed);
        f.vel.lerp(_d, Math.min(1, dt * 2.5));
        if (f.state === 'return' && f.pos.distanceTo(_a) < 1.2) f.state = 'school';
        break;
      }
      case 'align': {
        // the telegraph: brake, turn on the player, eyes strobing
        f.vel.multiplyScalar(Math.exp(-6 * dt));
        f.dir.copy(player.pos).y += player.height * 0.55;
        f.dir.sub(f.pos).normalize();
        f.face.lerp(f.dir, Math.min(1, dt * 10)).normalize();
        if (f.timer <= 0) {
          f.state = 'dart';
          f.timer = FISH.dartTime;
          // (the first dart from off screen goes wide, as a warning)
          _a.copy(player.pos).y += player.height * 0.55;
          f.dir.subVectors(director.aim(f, f.pos, _a), f.pos).normalize();
          f.face.copy(f.dir);
          f.vel.copy(f.dir).multiplyScalar(FISH.dart);
          sfx('fish_dart', 0.8 * falloff(f.pos.distanceTo(player.pos), 3, 25));
        }
        break;
      }
      case 'dart':
        maxSpeed = FISH.dart;
        if (Math.random() < dt * 30) W.fx.bubbles(f.pos, 1);
        if (f.timer <= 0) f.state = 'return';
        break;
      case 'surface': {
        // swim to just under the surface, at the edge nearest the player
        // (well out from the side, so the leap clears the lip of the pool)
        const target = clampToWater(_a.copy(player.pos), w, 1.5, 0.55);
        target.y = w.max.y - 0.55;
        _d.subVectors(target, f.pos);
        const l = _d.length();
        _d.setLength(Math.min(l * 3, FISH.cruise * 1.6));
        f.vel.lerp(_d, Math.min(1, dt * 3));
        maxSpeed = FISH.cruise * 1.6;
        f.wait -= dt;
        if (l < 0.8 && f.wait <= 0 && !director.request(f, FISH.leapAim + 1.2)) f.wait = rnd(0.25, 0.5);
        else if (l < 0.8 && f.wait <= 0) {
          f.state = 'leapAim';
          f.timer = FISH.leapAim;
          sfx('fish_alert', 0.8 * falloff(f.pos.distanceTo(player.pos), 3, 25), { rate: 1.3 });
        } else if (f.timer <= 0) f.state = 'return';
        break;
      }
      case 'leapAim': {
        f.vel.multiplyScalar(Math.exp(-6 * dt));
        f.dir.subVectors(player.pos, f.pos).setY(0).normalize();
        f.face.lerp(_v.copy(f.dir).setY(0.8).normalize(), Math.min(1, dt * 8)).normalize();
        // ripples on the surface give it away
        if (Math.random() < dt * 6) W.fx.ring(_v.set(f.pos.x, w.max.y + 0.03, f.pos.z), UP, 0xbfe8ff, { size: 0.15, end: 1.1, life: 0.5, k: 0.9 });
        if (Math.random() < dt * 10) W.fx.bubbles(f.pos, 1);
        if (f.timer <= 0) {
          const near = _v.copy(player.pos).clamp(w.min, w.max);
          const ok = Math.hypot(near.x - player.pos.x, near.z - player.pos.z) < this.leapRange + 1 && player.pos.y > w.max.y - 0.8;
          if (!ok) {
            f.state = 'return';
            director.release(f);
            break;
          }
          _a.copy(player.pos).y += player.height * 0.55;
          _a.copy(director.aim(f, f.pos, _a));
          const hd = Math.hypot(_a.x - f.pos.x, _a.z - f.pos.z);
          lobVelocity(f.pos, _a, THREE.MathUtils.clamp(hd / 6, 0.7, 1), GRAVITY, f.vel);
          f.vel.x *= 1.15;
          f.vel.z *= 1.15;
          f.state = 'leap';
          f.timer = 3;
          W.fx.splash(_v.set(f.pos.x, w.max.y, f.pos.z), 10);
          sfx('fish_leap', 0.9 * falloff(f.pos.distanceTo(player.pos), 3, 30));
          return this.updateAir(f, dt, player);
        }
        break;
      }
      case 'leap':
      case 'flop':
        return this.updateAir(f, dt, player);
    }
    if (f.state !== 'dart' && f.vel.length() > maxSpeed) f.vel.setLength(maxSpeed);
    // swim, never out of the water nor through anything in it
    _v.copy(f.vel).multiplyScalar(dt);
    const blocked = moveSafe(W, f.pos, _v, 0.25);
    if (w) {
      _b.copy(f.pos);
      clampToWater(f.pos, w, 0.3, 0.3);
      if (_b.distanceToSquared(f.pos) > 1e-8 || blocked.any) {
        if (f.state === 'dart') f.state = 'return';
        if (blocked.any) for (const ax of ['x', 'y', 'z']) if (blocked[ax]) f.vel[ax] *= -0.3;
      }
    }
    if (touchesPlayer(player, f.pos, FISH.radius)) player.damage(1, 'fish');
    if (f.state === 'school' || f.state === 'return') {
      if (f.vel.lengthSq() > 0.05) f.face.lerp(_v.copy(f.vel).normalize(), Math.min(1, dt * 5)).normalize();
      if (Math.random() < dt * 0.6 && this.dist < 30) W.fx.bubbles(f.pos, 1);
    } else if (f.state === 'dart') f.face.copy(f.vel).normalize();
    this.place(f, dt);
  }

  // out of the water: a ballistic leap; falling back in is fine, landing on dry ground is the end of it
  updateAir(f, dt, player) {
    const W = this.world, w = this.water;
    f.vel.y -= GRAVITY * dt;
    _v.copy(f.vel).multiplyScalar(dt);
    const blocked = moveSafe(W, f.pos, _v, 0.2);
    if (f.state === 'leap') {
      f.face.copy(f.vel).normalize();
      if (touchesPlayer(player, f.pos, FISH.radius + 0.05)) player.damage(1, 'fish');
      if (w && f.vel.y < 0 && waterAt(W, f.pos)) {
        W.fx.splash(_a.set(f.pos.x, w.max.y, f.pos.z), 8);
        f.vel.multiplyScalar(0.3);
        f.state = 'return';
        clampToWater(f.pos, w, 0.3, 0.3);
      } else if (blocked.any) {
        f.state = 'flop';
        f.timer = 1.4;
        f.vel.set(rnd(-1, 1), 3, rnd(-1, 1));
      }
    } else {
      // flopping on the ground, sparking, then it shorts out
      if (blocked.y && f.vel.y <= 0) f.vel.set(rnd(-1.5, 1.5), rnd(2.5, 4), rnd(-1.5, 1.5));
      if (blocked.x) f.vel.x *= -0.5;
      if (blocked.z) f.vel.z *= -0.5;
      f.face.set(Math.sin(this.t * 20), 0.2, Math.cos(this.t * 13)).normalize();
      if (Math.random() < dt * 10) W.fx.sparks(f.pos, UP, COLORS[f.color].hex, { count: 2, speed: 3 });
      if (w && waterAt(W, f.pos)) f.state = 'return';
      else if (f.timer <= 0) return f.die(false);
    }
    if (f.timer <= 0 && f.state === 'leap') return f.die(false);
    if (f.pos.y < this.home.y - 30) return f.die(false);
    this.place(f, dt);
  }

  // pose one fish: nose along its heading, a tail beat that quickens with speed, eye strobe on telegraphs
  place(f, dt) {
    f.group.position.copy(f.pos);
    if (f.face.lengthSq() > 1e-4) {
      _q.setFromUnitVectors(FWD, _v.copy(f.face).normalize());
      f.group.quaternion.slerp(_q, Math.min(1, dt * 12));
    }
    const sp = f.vel.length();
    f.phase += dt * (6 + sp * 2.2);
    f.tail.rotation.y = Math.sin(f.phase) * (f.state === 'align' || f.state === 'leapAim' ? 0.7 : 0.45);
    const tele = f.state === 'align' || f.state === 'leapAim';
    if (tele && Math.sin(this.t * 38) > 0) f.glowMat.color.setRGB(3, 3, 3);
    else if (f.flash < 0) f.glowMat.color.setRGB(0.7, 0.7, 0.8);
    else tint(f.glowMat, f.color, tele || f.state === 'dart' ? 3.2 : 2.4);
    if (tele) f.group.position.x += Math.sin(this.t * 60) * 0.015;
  }

  dispose(full = true) {
    this.dead = true;
    this.world.remove(this);
    this.world.scene.remove(this.group);
    for (const f of this.fish) {
      this.world.removeHittable(f.group);
      if (!f.dead) f.glowMat.dispose();
    }
    if (full) for (const m of [this.metalMat, this.finMat, this.toothMat]) m.dispose();
  }
}

// ======================================================================================================
// ROBO-SQUID
// A robot squid with a plated, glowing mantle and eight articulated arms whose tips glow in its color (weak
// points: a correct hit on a tip counts double). It hangs mid-water keeping 7–13 m off, firing slow ink
// torpedoes (shootable with its color) after its mantle flares and its arms splay. Aim at it and it jets
// away mantle-first behind a cloud of ink. With no water around it hovers in the air the same way.
// ======================================================================================================
const SQUID = {
  arms: 8,
  segs: 4,
  segLen: [0.3, 0.27, 0.24, 0.2],
  charge: 0.7, // s telegraph before a torpedo
  torpedo: 6.5, // m/s
  jet: 13,
  stagger: 0.35,
  scale: 1.5,
};
let squidGeo = null;

function squidGeometry() {
  if (squidGeo) return squidGeo;
  // the mantle: a faceted bullet along +y, with two fins near its tip
  const prof = [[0.0, 1.3], [0.1, 1.26], [0.22, 1.08], [0.29, 0.8], [0.31, 0.45], [0.28, 0.15], [0.24, 0.0], [0.0, 0.0]].map(([r, y]) => new THREE.Vector2(r, y));
  const mantle = new THREE.LatheGeometry(prof, 8);
  const finL = new THREE.ConeGeometry(0.22, 0.5, 3).scale(1, 1, 0.12).rotateZ(Math.PI / 2 + 0.4).translate(-0.3, 1.0, 0);
  const finR = new THREE.ConeGeometry(0.22, 0.5, 3).scale(1, 1, 0.12).rotateZ(-Math.PI / 2 - 0.4).translate(0.3, 1.0, 0);
  // the head collar under the mantle, and a siphon
  const head = new THREE.CylinderGeometry(0.24, 0.2, 0.22, 8).translate(0, -0.1, 0);
  const siphon = new THREE.CylinderGeometry(0.04, 0.06, 0.18, 6).rotateX(-1.2).translate(0, 0.05, 0.26);
  // glowing strips down the mantle and the two big eyes
  const glow = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    glow.push(new THREE.BoxGeometry(0.05, 0.75, 0.04).translate(0, 0.6, 0.3).rotateY(a));
  }
  for (const sx of [-1, 1]) glow.push(new THREE.SphereGeometry(0.075, 10, 8).translate(sx * 0.15, -0.08, -0.17));
  const pupils = [];
  for (const sx of [-1, 1]) pupils.push(new THREE.BoxGeometry(0.03, 0.09, 0.03).translate(sx * 0.165, -0.08, -0.235));
  squidGeo = {
    mantle: mergeAll([mantle.toNonIndexed(), finL, finR, head, siphon]),
    glow: mergeAll(glow),
    pupils: mergeAll(pupils),
    seg: new THREE.CylinderGeometry(0.05, 0.075, 1, 6),
    tip: new THREE.IcosahedronGeometry(0.075, 1),
  };
  squidGeo.mantle.computeVertexNormals();
  return squidGeo;
}

export class RoboSquid {
  constructor(world, opts) {
    const { pos, color = YELLOW, hp = 5, range = 26, fireInterval = 2.6, orbit = 4, onDeath = null } = opts;
    this.spawnOpts = opts;
    this.critter = true;
    this.world = world;
    this.palette = Array.isArray(color) ? color : [color];
    this.maxHp = hp;
    this.range = range;
    this.fireInterval = fireInterval;
    this.orbit = orbit;
    this.onDeath = onDeath;
    this.home = new THREE.Vector3(...pos);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.knock = new THREE.Vector3();
    this.axis = new THREE.Vector3(0, 1, 0); // where the mantle points
    this.front = new THREE.Vector3(0, 0, -1);
    this.goal = new THREE.Vector3();
    this.t = Math.random() * 100;
    this.dead = false;
    this.dist = Infinity;
    this.water = null;
    this.curl = new Float32Array(SQUID.arms); // per-arm recoil after a tip hit

    const G = squidGeometry();
    this.group = new THREE.Group();
    this.group.userData.hit = this;
    this.metalMat = new THREE.MeshStandardMaterial({ color: 0x9a86b8, metalness: 0.7, roughness: 0.35, flatShading: true, emissive: 0x000000 });
    this.armMat = new THREE.MeshStandardMaterial({ color: 0x6a6280, metalness: 0.7, roughness: 0.4, flatShading: true });
    this.glowMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.tipMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.pupilMat = new THREE.MeshBasicMaterial({ color: 0x05060a });
    this.mantle = new THREE.Mesh(G.mantle, this.metalMat);
    const glow = new THREE.Mesh(G.glow, this.glowMat);
    const pupils = new THREE.Mesh(G.pupils, this.pupilMat);
    this.body = new THREE.Group();
    this.body.add(this.mantle, glow, pupils);
    this.parts = [this.mantle, glow];
    // arm segments and the glowing tips: one instanced draw each, rebuilt every frame
    const n = SQUID.arms * SQUID.segs;
    this.arms = new THREE.InstancedMesh(G.seg, this.armMat, n);
    this.arms.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, -0.5, 0), 2);
    this.tips = new THREE.InstancedMesh(G.tip, this.tipMat, SQUID.arms);
    this.tips.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, -0.5, 0), 2);
    this.arms.frustumCulled = this.tips.frustumCulled = false;
    this.body.add(this.arms, this.tips);
    this.body.scale.setScalar(SQUID.scale);
    this.group.add(this.body);
    world.scene.add(this.group);
    world.addHittable(this.group);
    world.add(this);
    this.voice = new Voice('squid_hum', { gain: 0.3, near: 3, far: 24, rate: rnd(0.9, 1.1) });
    this.reset();
  }

  reset() {
    if (this.dead) return;
    this.water ??= findWater(this.world, this.home, 6);
    this.hp = this.maxHp;
    this.colorIdx = 0;
    this.color = this.palette[0];
    this.state = 'drift';
    this.timer = 0;
    this.aggro = false;
    this.sees = false;
    this.sightTimer = 0;
    this.lostT = 0;
    this.fireTimer = 1.5 + Math.random() * this.fireInterval;
    this.dodgeCool = 0.6;
    this.stagger = 0;
    this.flash = 0;
    this.immuneFlash = 0;
    this.pulse = 0;
    this.pulseT = rnd(0, 1);
    this.side = Math.random() < 0.5 ? -1 : 1;
    this.sideT = rnd(2, 4);
    this.curl.fill(0);
    this.pos.copy(this.home);
    if (this.water) clampToWater(this.pos, this.water, 1.2, 1);
    this.vel.set(0, 0, 0);
    this.knock.set(0, 0, 0);
    this.applyColor();
    this.pose(1, true);
  }

  applyColor() {
    const c = _c.set(COLORS[this.color].hex);
    this.glowMat.color.copy(c).multiplyScalar(2.4);
    this.tipMat.color.copy(c).multiplyScalar(1.8);
    this.metalMat.emissive.copy(c).multiplyScalar(0.12);
  }

  // keep a point inside our water (or, with none, a box of air round home)
  contain(p) {
    if (this.water) return clampToWater(p, this.water, 1.5, 1.2);
    const o = this.orbit + 4;
    p.x = THREE.MathUtils.clamp(p.x, this.home.x - o, this.home.x + o);
    p.y = THREE.MathUtils.clamp(p.y, this.home.y - 1.5, this.home.y + 2.5);
    p.z = THREE.MathUtils.clamp(p.z, this.home.z - o, this.home.z + o);
    return p;
  }

  update(dt, player) {
    if (this.dead) return;
    this.water ??= findWater(this.world, this.home, 6);
    _eye.copy(player.pos).y += player.eye;
    this.dist = this.pos.distanceTo(_eye);
    this.t += dt;
    if (this.dist > DORMANT) {
      this.voice.update(this.dist);
      return;
    }
    this.sightTimer -= dt;
    if (this.sightTimer <= 0) {
      this.sightTimer = 0.25;
      this.sees = this.dist < this.range && this.world.lineOfSight(this.pos, _eye);
      if (this.sees && !this.aggro) sfx('squid_pulse', 0.7 * falloff(this.dist, 4, 30));
      if (this.sees) this.aggro = true;
    }
    this.lostT = this.sees ? 0 : this.lostT + dt;
    if (this.aggro && this.lostT > 6) this.aggro = false;
    this.stagger = Math.max(0, this.stagger - dt);
    this.dodgeCool -= dt;
    this.timer -= dt;
    this.flash = Math.max(0, this.flash - dt * 6);
    this.immuneFlash = Math.max(0, this.immuneFlash - dt * 5);
    for (let i = 0; i < this.curl.length; i++) this.curl[i] = Math.max(0, this.curl[i] - dt * 2);

    // aimed at: jet away behind a cloud of ink
    if (this.aggro && this.sees && this.state !== 'jet' && this.stagger <= 0 && this.dodgeCool <= 0 && aimedAt(this.world, this.pos, 0.994) && Math.random() < dt * 2.5) this.startJet(player);

    // where it wants to be: a slow circuit round home, or (engaged) 7–13 m off the player, circling
    if (this.aggro) {
      this.sideT -= dt;
      if (this.sideT <= 0) {
        this.sideT = rnd(2, 4);
        this.side *= -1;
      }
      _a.subVectors(this.pos, _eye);
      const d = _a.length() || 1;
      _a.divideScalar(d);
      const want = THREE.MathUtils.clamp(d, 7, 13);
      _b.crossVectors(UP, _a).normalize().multiplyScalar(this.side * 3);
      this.goal.copy(_eye).addScaledVector(_a, want).add(_b);
      this.goal.y = Math.max(this.goal.y, _eye.y - 1);
    } else this.goal.set(this.home.x + Math.sin(this.t * 0.3) * this.orbit, this.home.y + Math.sin(this.t * 0.5) * 0.5, this.home.z + Math.cos(this.t * 0.3) * this.orbit);
    this.contain(this.goal);

    if (this.state === 'jet') {
      if (this.timer <= 0) this.state = this.aggro ? 'hunt' : 'drift';
    } else {
      // swims in pulses: the mantle squeezes, it surges, it glides
      this.pulseT -= dt;
      if (this.pulseT <= 0) {
        this.pulseT = this.aggro ? 0.9 : 1.5;
        this.pulse = 1;
        _d.subVectors(this.goal, this.pos);
        const l = _d.length();
        if (l > 0.3) this.vel.addScaledVector(_d.divideScalar(l), Math.min(4.5, 1.5 + l * 0.6));
      }
      if (this.aggro) this.state = this.state === 'charge' ? 'charge' : 'hunt';
      // the shot: mantle flares and arms splay, then a slow torpedo
      if (this.state === 'charge') {
        if (this.timer <= 0) this.fire(player);
      } else if (this.aggro && this.sees && this.stagger <= 0) {
        this.fireTimer -= dt;
        // (each torpedo needs one of the combat director's attack tokens; without one, ask again shortly)
        if (this.fireTimer <= 0 && !director.request(this, SQUID.charge + 0.4)) this.fireTimer = rnd(0.25, 0.5);
        else if (this.fireTimer <= 0) {
          this.state = 'charge';
          this.timer = SQUID.charge;
          sfx('squid_charge', 0.7 * falloff(this.dist, 4, 30));
        }
      }
    }
    this.pulse = Math.max(0, this.pulse - dt * 2.2);
    this.vel.multiplyScalar(Math.exp(-(this.state === 'jet' ? 2.2 : 1.6) * dt));
    this.knock.multiplyScalar(Math.exp(-4 * dt));
    _v.copy(this.vel).add(this.knock).multiplyScalar(dt);
    const blocked = moveSafe(this.world, this.pos, _v, 0.6);
    if (blocked.any) for (const ax of ['x', 'y', 'z']) if (blocked[ax]) this.vel[ax] *= -0.3;
    _b.copy(this.pos);
    this.contain(this.pos);
    if (_b.distanceToSquared(this.pos) > 1e-6) this.vel.multiplyScalar(0.6);
    if (touchesPlayer(player, this.pos, 1.0)) player.damage(1, 'squid');
    if (this.water && Math.random() < dt * (this.state === 'jet' ? 30 : 1.5)) this.world.fx.bubbles(_v.copy(this.pos).addScaledVector(this.axis, 0.2), this.state === 'jet' ? 2 : 1);
    this.pose(dt);
    this.voice.update(this.dist, 1, 0.9 + this.vel.length() * 0.04 + (this.state === 'charge' ? 0.3 : 0));
  }

  fire(player) {
    this.state = 'hunt';
    this.fireTimer = this.fireInterval * rnd(0.85, 1.2);
    const from = _a.copy(this.front).multiplyScalar(0.5).add(this.pos);
    from.y -= 0.3;
    _b.copy(player.pos).y += player.eye - 0.3;
    const dir = _b.copy(director.aim(this, from, _b)).sub(from).normalize(); // (first shot from off screen goes wide)
    new Glob(this.world, from, dir.multiplyScalar(SQUID.torpedo), this.color, { radius: 0.26, life: 6, style: 'ink', cause: 'ink torpedo', bubbles: !!this.water });
    this.vel.addScaledVector(dir.normalize(), -2.5); // recoil
    sfx('squid_torpedo', 0.9 * falloff(this.dist, 4, 40));
  }

  // the dodge: an ink cloud where it was and a hard jet away, sideways to the player's aim
  startJet(player) {
    if (this.dodgeCool > 0) return;
    this.dodgeCool = rnd(1.8, 2.8);
    if (this.state === 'charge') director.release(this); // (the shot is called off)
    this.state = 'jet';
    this.timer = 0.65;
    new InkCloud(this.world, this.pos, { size: 1.5, life: 3.2 });
    _a.subVectors(this.pos, this.world.game.camera.position).normalize();
    _b.crossVectors(UP, _a).normalize().multiplyScalar(Math.random() < 0.5 ? -1 : 1);
    // pick the side with room
    const probe = this.world.raycast(this.pos, _b, 4, { meshes: false });
    if (probe || (this.water && !waterAt(this.world, _d.copy(this.pos).addScaledVector(_b, 3)))) _b.negate();
    _b.multiplyScalar(0.85).addScaledVector(_a, 0.45).addScaledVector(UP, rnd(-0.1, 0.25)).normalize();
    this.vel.copy(_b).multiplyScalar(SQUID.jet);
    this.pulse = 1;
    sfx('squid_jet', 0.9 * falloff(this.dist, 4, 35));
  }

  onHit(color, hit) {
    if (this.dead) return undefined;
    this.aggro = true;
    if (color !== this.color) {
      this.immuneFlash = 1;
      if (this.state !== 'jet') this.startJet(this.world.game.player);
      return 'immune';
    }
    // a glowing arm tip is a weak point: double damage, and that arm recoils
    const tip = hit?.object === this.tips;
    if (tip && hit.instanceId !== undefined) this.curl[hit.instanceId] = 1;
    this.hp -= tip ? 2 : 1;
    this.flash = 1;
    this.stagger = SQUID.stagger;
    if (this.state === 'charge') {
      this.state = 'hunt';
      director.release(this);
    }
    this.fireTimer = Math.max(this.fireTimer, 0.7);
    if (hit?.dir) this.knock.addScaledVector(hit.dir, tip ? 6 : 4);
    const p = hit?.point ?? this.pos;
    hitSparks(this.world, hit, p, this.color);
    if (tip) this.world.fx.ring(p, null, COLORS[this.color].hex, { size: 0.1, end: 0.9, life: 0.25, k: 1.8 });
    sfx('critter_hit', Math.max(0.5, falloff(this.dist, 6, 40)), { rate: tip ? 1.25 : 1 });
    if (this.hp <= 0) {
      this.die();
      return 'kill';
    }
    return 'hit';
  }

  die() {
    this.dead = true;
    this.world.removeHittable(this.group);
    blast(this.world, this.pos, this.color, 1);
    new InkCloud(this.world, this.pos, { size: 2.2, life: 3.5 });
    if (this.water) this.world.fx.bubbles(this.pos, 16);
    sfx('critter_die', Math.max(0.3, falloff(this.dist, 6, 60)));
    const player = this.world.game.player;
    player.shake = Math.max(player.shake, 0.1 + 0.2 * falloff(this.dist, 4, 25));
    this.group.updateMatrixWorld(true);
    const G = squidGeometry(), bits = [...this.parts];
    for (let i = 0; i < 5; i++) {
      const seg = new THREE.Mesh(G.seg, this.armMat);
      seg.scale.set(1, 0.4, 1);
      seg.position.set(rnd(-0.3, 0.3), -0.4, rnd(-0.3, 0.3));
      this.body.add(seg);
      bits.push(seg);
    }
    this.metalMat.emissive.setRGB(0.4, 0.12, 0.03);
    this.glowMat.color.setRGB(0.4, 0.1, 0.08);
    new Debris(this.world, bits, { from: this.pos, speed: 4, mats: [this.metalMat, this.armMat, this.glowMat], water: this.water });
    this.onDeath?.(this);
    this.dispose(false);
  }

  // orient (mantle up and away from the player, eyes on them; mantle-first while jetting) and pose the arms
  pose(dt, snap = false) {
    const player = this.world.game.player;
    _a.copy(player.pos).y += player.eye;
    _a.sub(this.pos).normalize(); // toward the player
    if (this.state === 'jet' && this.vel.lengthSq() > 1) _v.copy(this.vel).normalize();
    else _v.set(-_a.x * 0.55, 0.85, -_a.z * 0.55).normalize();
    if (!this.aggro && this.state !== 'jet') _v.set(Math.sin(this.t * 0.3) * 0.3, 1, Math.cos(this.t * 0.3) * 0.3).normalize();
    this.axis.lerp(_v, snap ? 1 : Math.min(1, dt * (this.state === 'jet' ? 10 : 3))).normalize();
    // front: toward the player, square to the mantle axis
    _b.copy(this.aggro ? _a : _d.set(Math.cos(this.t * 0.3), 0, -Math.sin(this.t * 0.3)));
    _b.addScaledVector(this.axis, -_b.dot(this.axis));
    if (_b.lengthSq() < 1e-4) _b.set(1, 0, 0).addScaledVector(this.axis, -this.axis.x);
    _b.normalize();
    this.front.lerp(_b, snap ? 1 : Math.min(1, dt * 5)).normalize();
    _d.copy(this.front).negate(); // z axis (the model looks down -z)
    _sc.crossVectors(this.axis, _d).normalize();
    _d.crossVectors(_sc, this.axis).normalize();
    _m.makeBasis(_sc, this.axis, _d);
    this.group.quaternion.setFromRotationMatrix(_m);
    this.group.position.copy(this.pos);
    if (this.stagger > 0) this.group.position.x += Math.sin(this.t * 50) * 0.03;
    // mantle squeeze on each pulse
    const sq = this.pulse * 0.16 + (this.state === 'jet' ? 0.12 : 0);
    this.mantle.scale.set(1 - sq, 1 + sq * 0.6, 1 - sq);
    // arms: a travelling wave; splayed while charging, swept back while jetting, curled when a tip is hit
    const charge = this.state === 'charge' ? 1 - Math.max(0, this.timer) / SQUID.charge : 0;
    const jet = this.state === 'jet' ? 1 : 0;
    let k = 0;
    for (let i = 0; i < SQUID.arms; i++) {
      const a = (i / SQUID.arms) * Math.PI * 2 + Math.PI / 8;
      const ox = Math.cos(a), oz = Math.sin(a);
      const p = _a.set(ox * 0.17, -0.18, oz * 0.17);
      const spread = 0.35 + charge * 1.0 - jet * 0.3 + this.pulse * 0.4;
      const dir = _b.set(ox * spread, -1, oz * spread).normalize();
      // bend axis: tangent to the ring
      _sc.set(-oz, 0, ox);
      for (let j = 0; j < SQUID.segs; j++) {
        const bend = (Math.sin(this.t * 3.2 - j * 0.9 + i * 1.3) * 0.32 * (1 - jet * 0.8) + (charge * -0.25) + this.curl[i] * 0.7 + (jet ? 0 : 0.08 * j)) * (j ? 1 : 0.5);
        dir.applyAxisAngle(_sc, bend);
        const len = SQUID.segLen[j] * (i % 4 === 1 ? 1.25 : 1);
        _d.copy(p).addScaledVector(dir, len);
        this.setSeg(k++, p, _d, 1 - j * 0.17);
        p.copy(_d);
      }
      _m.compose(p, _q.identity(), _sc.setScalar(1 + charge * 0.25 + this.flash * 0.3));
      this.tips.setMatrixAt(i, _m);
    }
    this.arms.instanceMatrix.needsUpdate = true;
    this.tips.instanceMatrix.needsUpdate = true;
    if (this.flash > 0) {
      this.glowMat.color.setRGB(3, 3, 3);
      this.tipMat.color.setRGB(3, 3, 3);
    } else if (this.immuneFlash > 0) {
      this.glowMat.color.setRGB(0.7, 0.7, 0.8);
      this.tipMat.color.setRGB(0.7, 0.7, 0.8);
    } else {
      this.applyColor();
      this.glowMat.color.multiplyScalar(1 + charge * 0.6 + this.pulse * 0.3);
      this.tipMat.color.multiplyScalar(1 + charge * 0.4);
      this.metalMat.emissive.multiplyScalar(1 + charge * 2.5 + this.pulse);
    }
  }

  setSeg(i, a, b, thick) {
    _v.subVectors(b, a);
    const len = _v.length();
    _v.divideScalar(len || 1);
    _q.setFromUnitVectors(UP, _v);
    _m.compose(_mid.addVectors(a, b).multiplyScalar(0.5), _q, _eye.set(thick, len, thick));
    this.arms.setMatrixAt(i, _m);
  }

  dispose(full = true) {
    this.dead = true;
    this.voice.stop();
    this.world.removeHittable(this.group);
    this.world.remove(this);
    this.world.scene.remove(this.group);
    this.arms.dispose();
    this.tips.dispose();
    this.tipMat.dispose();
    this.pupilMat.dispose();
    if (full) for (const m of [this.metalMat, this.armMat, this.glowMat]) m.dispose();
  }
}
