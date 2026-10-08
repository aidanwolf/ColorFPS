// Turret: a mounted gun (floor, ceiling or wall) whose head swivels to track you. It locks on, charges
// (the lens swells, a laser sight paints your position, a rising whine) and fires a 3-shot burst of colored
// orbs along the sight line, still turning slowly so strafing beats it. The back of the head is armored.
// Shot down, the head blows off and the base is left smoking.
import * as THREE from 'three';
import { Orb } from './drone.js';
import { audio } from '../audio.js';
import { Enemy, Parts, Beam, Blast, MAT, GEO, glowMat, additive, converge, falloff, hexOf, sfx } from './enemyKit.js';
import { esfx } from './enemySfx.js';
import { barks } from '../combat/barks.js';

const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _f = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const MOUNTS = { floor: [0, 1, 0], ceiling: [0, -1, 0] };
const HEAD_Y = 0.95; // head pivot height above the mount

export class Turret extends Enemy {
  // mount: 'floor' | 'ceiling' | a wall's outward normal ([1,0,0] etc). colors: a list cycles between bursts.
  constructor(world, { pos, color = 0, colors = null, mount = 'floor', hp = 4, range = 36, burst = 3, burstGap = 0.2, charge = 0.95, cooldown = 2.2, speed = 13, turn = 2.4, armored = true, cycle = 1, aggro = false, onDeath = null }) {
    super(world, { pos, color: colors || color, hp, range, aggro, onDeath, cycle });
    this.burst = burst;
    this.burstGap = burstGap;
    this.chargeTime = charge;
    this.cooldown = cooldown;
    this.shotSpeed = speed;
    this.turn = turn;
    this.armored = armored;
    this.cyclesLeft = 0;
    this.state = 'idle';
    this.sightT = 0;
    this.timer = 1 + Math.random() * 1.2; // a beat after it appears before the first lock-on
    this.yaw = Math.random() * 6.28;
    this.pitch = 0.2;
    this.kick = 0; // recoil spring (head jolts back when shot or firing)
    this.kickV = 0;
    this.normal = new THREE.Vector3(...(Array.isArray(mount) ? mount : MOUNTS[mount] || MOUNTS.floor)).normalize();
    this.group.quaternion.setFromUnitVectors(UP, this.normal);

    // base: a hex plinth with a glowing collar, bolted to the mount surface
    const base = new Parts()
      .add(MAT.dark, new THREE.CylinderGeometry(0.62, 0.78, 0.22, 6), [0, 0.11, 0])
      .add(MAT.shell, new THREE.CylinderGeometry(0.42, 0.55, 0.3, 6), [0, 0.37, 0]);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      base.add(MAT.dark, new THREE.BoxGeometry(0.12, 0.08, 0.12), [Math.cos(a) * 0.62, 0.24, Math.sin(a) * 0.62]);
    }
    base.add(glowMat(this.color, 2), new THREE.CylinderGeometry(0.565, 0.565, 0.05, 6), [0, 0.25, 0]);
    this.baseMeshes = base.build(this.group);
    // swivel and head
    this.swivel = new THREE.Group();
    this.swivel.position.y = 0.52;
    this.group.add(this.swivel);
    new Parts().add(MAT.dark, new THREE.CylinderGeometry(0.22, 0.28, 0.5, 8), [0, 0.2, 0]).build(this.swivel);
    this.head = new THREE.Group();
    this.head.position.y = HEAD_Y - 0.52;
    this.swivel.add(this.head);
    const hp_ = new Parts()
      // armored body: a wedge-faced box with cheek plates
      .add(this.armor, new THREE.BoxGeometry(0.78, 0.5, 0.7), [0, 0, -0.05])
      .add(this.armor, new THREE.BoxGeometry(0.62, 0.36, 0.25), [0, 0.02, 0.38], [-0.25, 0, 0])
      .add(MAT.dark, new THREE.BoxGeometry(0.14, 0.62, 0.8), [-0.45, 0, -0.05])
      .add(MAT.dark, new THREE.BoxGeometry(0.14, 0.62, 0.8), [0.45, 0, -0.05])
      // the armored back: a thick slab with ribs
      .add(MAT.dark, new THREE.BoxGeometry(0.9, 0.62, 0.18), [0, 0, -0.48])
      .add(MAT.dark, new THREE.BoxGeometry(0.1, 0.5, 0.12), [-0.2, 0, -0.6])
      .add(MAT.dark, new THREE.BoxGeometry(0.1, 0.5, 0.12), [0.2, 0, -0.6]);
    // twin barrels
    for (const sx of [-0.2, 0.2]) {
      hp_.add(MAT.dark, new THREE.CylinderGeometry(0.075, 0.09, 0.7, 8), [sx, -0.05, 0.62], [Math.PI / 2, 0, 0]);
      hp_.add(this.glow, new THREE.TorusGeometry(0.085, 0.02, 4, 10), [sx, -0.05, 0.96]);
    }
    // the lens (glows in its color, swells while charging) and side vents
    hp_.add(this.glow, new THREE.CylinderGeometry(0.14, 0.14, 0.06, 12), [0, 0.12, 0.5], [Math.PI / 2 - 0.25, 0, 0]);
    hp_.add(this.glow, new THREE.BoxGeometry(0.03, 0.3, 0.4), [-0.53, 0, -0.05]);
    hp_.add(this.glow, new THREE.BoxGeometry(0.03, 0.3, 0.4), [0.53, 0, -0.05]);
    this.headMeshes = hp_.build(this.head);
    // charge glow at the muzzle (additive, grows while charging)
    this.chargeMat = additive(0xffffff, 0);
    this.mats.push(this.chargeMat);
    this.orb = new THREE.Mesh(GEO.sphere, this.chargeMat);
    this.orb.position.set(0, -0.05, 1.05);
    this.orb.scale.setScalar(0.01);
    this.head.add(this.orb);
    // a generous invisible hit box around the head
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.8, 1.6), MAT.hidden);
    box.position.z = 0.15;
    this.head.add(box);
    this.hitBox = box;
    this.sight = new Beam(world.scene, hexOf(this.color));
    this.hum = audio.createLoop('drone_hum', { rate: 0.55 });
    this.register();
    this.aimHead(true);
  }

  applyColor(k = 2.4) {
    super.applyColor(k);
    if (this.baseMeshes) this.baseMeshes[this.baseMeshes.length - 1].material = glowMat(this.color, 2);
  }

  // where the head's muzzle is, and which way it points (world space)
  muzzle(out) {
    return this.orb.getWorldPosition(out);
  }

  forward(out) {
    this.head.getWorldQuaternion(_q);
    return out.set(0, 0, 1).applyQuaternion(_q);
  }

  sightFrom() {
    return this.head.getWorldPosition(_a);
  }

  // turn toward the player at `rate` (fraction of full turn speed); returns the remaining angle off target
  track(dt, rate) {
    this.group.updateMatrixWorld();
    const local = this.group.worldToLocal(_v.copy(this.eye).setY(this.eye.y - 0.25));
    local.y -= HEAD_Y;
    const wantYaw = Math.atan2(local.x, local.z);
    const wantPitch = THREE.MathUtils.clamp(Math.atan2(local.y, Math.hypot(local.x, local.z)), -0.35, 1.5);
    let dy = wantYaw - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const step = this.turn * rate * dt;
    this.yaw += THREE.MathUtils.clamp(dy, -step, step);
    this.pitch += THREE.MathUtils.clamp(wantPitch - this.pitch, -step, step);
    this.aimHead();
    return Math.abs(dy) + Math.abs(wantPitch - this.pitch);
  }

  aimHead() {
    this.swivel.rotation.y = this.yaw;
    this.head.rotation.x = -this.pitch;
    this.head.position.z = -this.kick * 0.12;
  }

  update(dt, player) {
    if (!this.tick(dt, player)) return this.updateHum(0.55);
    if (this.state === 'wreck') return this.updateWreck(dt);
    // recoil spring
    this.kickV += (-120 * this.kick - 14 * this.kickV) * dt;
    this.kick += this.kickV * dt;
    if (!this.ready) return this.aimHead();
    this.timer -= dt;
    this.sightT -= dt;
    const fx = this.world.fx;
    if (this.state === 'idle') {
      // scanning sweep until it spots you
      if (this.aggro && this.sees) {
        this.state = 'track';
        this.timer = Math.max(this.timer, 0.35);
      } else {
        this.yaw += dt * 0.5;
        this.pitch += (0.15 + Math.sin(this.t * 0.7) * 0.15 - this.pitch) * dt * 2;
        this.aimHead();
      }
    } else if (this.state === 'track') {
      const off = this.track(dt, 1);
      // the traverse motors whine while it slews round onto you
      if (off > 0.4 && (this.servoT = (this.servoT ?? 0) - dt) <= 0) {
        this.servoT = 0.45;
        esfx('turret_servo', this.pos, Math.min(1, off), 0.9 + Math.min(0.4, off * 0.3));
      }
      // colors only change while it's not winding up a burst
      if (this.cycleColor(dt)) this.sight.mat.color.set(hexOf(this.color)).multiplyScalar(2);
      if (!this.sees) {
        if (this.timer < -2.5) this.state = 'idle';
      } else if (this.timer <= 0 && off < 0.35) {
        this.state = 'charge';
        this.timer = this.chargeTime;
        barks.say(this, 'suppress'); // (turrets fire on their own clock, not the director's tokens)
        sfx('turret_charge', { gain: 0.55 * Math.max(0.35, falloff(this.dist, 6, 40)), rate: 1.15 / this.chargeTime }, 'charge_up', { gain: 0.45 * Math.max(0.35, falloff(this.dist, 6, 40)), rate: 1.3 });
      }
    } else if (this.state === 'charge') {
      // keeps tracking (a bit slower) while the laser sight paints you, then fires along it
      this.track(dt, 0.65);
      const k = 1 - Math.max(0, this.timer) / this.chargeTime;
      this.chargeMat.color.set(hexOf(this.color)).multiplyScalar(1 + 0.5 * k);
      this.chargeMat.opacity = 0.3 + 0.5 * k;
      this.orb.scale.setScalar(0.06 + 0.14 * k + Math.sin(this.t * 40) * 0.015);
      const m = this.muzzle(_v);
      if (Math.random() < dt * 30) converge(fx, m, hexOf(this.color), { count: 2, radius: 1.1, time: 0.3 });
      const end = this.sightEnd(m);
      // the sight blinks faster as it's about to fire
      const blink = k > 0.7 ? (Math.sin(this.t * 60) > 0 ? 1 : 0.35) : 0.55 + 0.25 * Math.sin(this.t * 20);
      this.sight.set(m, end, 0.025 + 0.03 * k, blink, hexOf(this.color));
      if (this.timer <= 0) {
        this.state = 'burst';
        this.shots = this.burst;
        this.timer = 0;
      }
    } else if (this.state === 'burst') {
      this.track(dt, 0.4);
      const m = this.muzzle(_v);
      this.sight.set(m, this.sightEnd(m), 0.03, 0.5, hexOf(this.color));
      if (this.timer <= 0) {
        this.fire();
        this.shots--;
        this.timer = this.burstGap;
        if (this.shots <= 0) {
          this.state = 'track';
          this.timer = this.cooldown * (0.85 + Math.random() * 0.3);
          barks.say(this, 'reload'); // "Capacitor recharging."
          this.sight.hide();
          this.chargeMat.opacity = 0;
          this.orb.scale.setScalar(0.01);
        }
      }
    }
    if (this.state !== 'charge' && this.state !== 'burst') this.sight.hide();
    this.glowFlash(this.state === 'charge' ? 3 : 2.4);
    this.updateHum(0.55 + (this.state === 'charge' ? 0.5 : 0) + Math.abs(this.kickV) * 0.01, 0.22, 3, 24);
  }

  // where the laser sight ends: the first wall along the barrel (or 60 m)
  sightEnd(m) {
    const dir = this.forward(_f);
    // the head turns slowly while it's painting you, so a ray every 0.08 s is plenty
    if (!(this.sightT > 0)) {
      this.sightT = 0.08;
      const hit = this.world.raycast(m, dir, 60, { meshes: false });
      this.sightLen = hit ? hit.t : 60;
    }
    return _a.copy(m).addScaledVector(dir, this.sightLen);
  }

  fire() {
    const m = this.muzzle(_v).clone();
    const dir = this.forward(_f).clone();
    new Orb(this.world, m, dir.multiplyScalar(this.shotSpeed), this.color, { radius: 0.26, life: 5 });
    this.world.fx.muzzle(m, _f, hexOf(this.color));
    this.world.fx.flash(m, hexOf(this.color), { size: 0.6, life: 0.08, k: 1.6 });
    this.kickV -= 9;
    const g = Math.max(0.3, falloff(this.dist, 6, 45));
    sfx('turret_shot', { gain: 0.6 * g, vary: 0.08 }, 'enemy_shot', { gain: 0.55 * g, rate: 1.25, vary: 0.08 });
  }

  // the armored back plate bounces even the right color
  deflects(hit) {
    if (!this.armored || !hit?.dir) return false;
    return this.forward(_f).dot(hit.dir) > 0.45;
  }

  onImmune(hit) {
    if (hit?.point && this.deflects(hit)) this.world.fx.sparks(hit.point, _a.copy(hit.dir).negate(), 0xffffff, { count: 10, speed: 10, spread: 0.8, life: 0.25 });
  }

  onDamage() {
    this.kickV -= 7;
    // getting shot sets the charge back, so pressing the attack pays off
    if (this.state === 'charge') this.timer = Math.min(this.chargeTime, this.timer + 0.3);
    else if (this.state === 'track') this.timer = Math.max(this.timer, 0.4);
  }

  // shot down: the head blows off, the base stays behind, smoking and sparking for a while
  die(hit, dir) {
    this.dead = true;
    this.state = 'wreck';
    this.wreckT = 0;
    this.sight.hide();
    this.hum?.stop();
    this.hum = null;
    this.world.removeHittable(this.group);
    // the flung head gets its own copy of the glow so freeing ours later doesn't touch it
    const glow = glowMat(this.color, 1.2);
    this.head.traverse((o) => {
      if (o.material === this.glow) o.material = glow;
      else if (o.material === this.armor) o.material = MAT.hot;
    });
    this.head.remove(this.orb, this.hitBox);
    this.hitBox.geometry.dispose();
    const p = this.head.getWorldPosition(new THREE.Vector3());
    const vel = (dir ? dir.clone().multiplyScalar(5) : new THREE.Vector3()).addScaledVector(this.normal, 7);
    new Blast(this.world, p, this.color, { scale: 0.9, parts: [this.head], chunks: 5, vel });
    this.baseMeshes[this.baseMeshes.length - 1].material = MAT.hot;
    this.onDeath?.(this);
  }

  updateWreck(dt) {
    this.wreckT += dt;
    const p = this.swivel.getWorldPosition(_v);
    const k = Math.max(0, 1 - this.wreckT / 5);
    if (Math.random() < dt * 14 * k) this.world.fx.burst(p, 0x3a3a44, { count: 1, speed: 0.6, life: 1.4, size: 0.5, gravity: -1.5, drag: 1 });
    if (Math.random() < dt * 4 * k) this.world.fx.sparks(p, this.normal, 0xffa040, { count: 6, speed: 6, spread: 0.9, life: 0.35 });
    // done smoking: stays as scenery, no longer updated
    if (this.wreckT > 5) this.world.remove(this);
  }

  cleanup() {
    this.sight.dispose();
  }

  // an encounter resetting: the wreck (or the live turret) vanishes
  despawn() {
    if (this.gone) return;
    if (!this.dead) this.world.fx.burst(this.pos, hexOf(this.color), { count: 16, speed: 3, life: 0.4, size: 0.3, gravity: 0 });
    this.dead = true;
    this.remove();
  }
}

