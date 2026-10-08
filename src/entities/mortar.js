// Mortar: a squat emplacement that lobs arcing colored bombs at where you're standing. The moment it
// aims, a target ring appears on the floor there and tightens until the bomb lands (about two seconds:
// keep moving). The blast leaves a burning pool for a moment. Bombs can be shot down with their color.
import * as THREE from 'three';
import { Orb } from './drone.js';
import { Enemy, Parts, MAT, GEO, glowMat, additive, floorBelow, converge, falloff, hexOf, sfx, Blast } from './enemyKit.js';

const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const G = 18; // bomb gravity

// Remove every mortar marker and burning pool (an encounter resetting).
export function clearBlastZones(world) {
  for (const e of [...world.entities]) if (e instanceof BlastZone) e.dispose();
}

// A target marker that becomes a burning pool once its bomb lands.
class BlastZone {
  constructor(world, pos, color, { radius = 2.4, linger = 2.2, warn = 2 } = {}) {
    this.world = world;
    this.pos = pos.clone();
    this.color = color;
    this.radius = radius;
    this.linger = linger;
    this.warn = warn;
    this.t = 0;
    this.state = 'marked';
    const hex = hexOf(color);
    this.group = new THREE.Group();
    this.group.position.copy(this.pos).y += 0.05;
    this.group.userData.noCull = true;
    this.ringMat = additive(new THREE.Color(hex).multiplyScalar(1.4), 0.8, { side: THREE.DoubleSide });
    this.ring = new THREE.Mesh(GEO.ring, this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.innerMat = additive(new THREE.Color(hex), 0.15, { side: THREE.DoubleSide });
    this.inner = new THREE.Mesh(GEO.disc, this.innerMat);
    this.inner.rotation.x = -Math.PI / 2;
    this.inner.scale.setScalar(radius);
    this.edge = new THREE.Mesh(GEO.ring, this.ringMat);
    this.edge.rotation.x = -Math.PI / 2;
    this.edge.scale.setScalar(radius);
    this.group.add(this.ring, this.inner, this.edge);
    world.scene.add(this.group);
    world.add(this);
  }

  // the bomb was shot down: the marker fades away
  cancel() {
    if (this.state === 'marked') this.state = 'fading';
  }

  detonate() {
    if (this.state !== 'marked' && this.state !== 'fading') return;
    this.state = 'burning';
    this.t = 0;
    const fx = this.world.fx;
    const hex = hexOf(this.color);
    const p = _v.copy(this.pos).setY(this.pos.y + 0.3);
    new Blast(this.world, p, this.color, { scale: 0.9, chunks: 0, shake: 0.35, sound: false });
    fx.ring(_a.copy(this.pos).setY(this.pos.y + 0.1), UP, hex, { size: 0.4, end: this.radius * 1.4, life: 0.4, thick: 0.15, k: 1.8 });
    const g = Math.max(0.3, falloff(p.distanceTo(this.world.game.camera.position), 6, 55));
    sfx('mortar_blast', { gain: g }, 'drone_explode', { gain: 0.9 * g, rate: 0.85 });
    this.hurt(1.6);
    this.ringMat.opacity = 0;
  }

  // kill the player if their feet are inside the zone
  hurt(height) {
    const pl = this.world.game.player;
    const dx = pl.pos.x - this.pos.x, dz = pl.pos.z - this.pos.z;
    if (dx * dx + dz * dz < (this.radius * 0.9) ** 2 && pl.pos.y > this.pos.y - 0.5 && pl.pos.y < this.pos.y + height) pl.damage(1, 'blast');
  }

  update(dt) {
    this.t += dt;
    const fx = this.world.fx;
    if (this.state === 'marked') {
      // the outer ring tightens onto the zone's edge as the bomb comes in
      const k = Math.min(1, this.t / this.warn);
      this.ring.scale.setScalar(this.radius * (2.2 - 1.2 * k));
      this.ringMat.opacity = 0.35 + 0.4 * Math.abs(Math.sin(this.t * (6 + k * 14)));
      this.innerMat.opacity = 0.06 + 0.14 * k;
      // its bomb never came (cleared on a respawn): let it go
      if (this.t > this.warn + 1) this.cancel();
    } else if (this.state === 'fading') {
      this.ringMat.opacity *= Math.exp(-6 * dt);
      this.innerMat.opacity *= Math.exp(-6 * dt);
      if (this.ringMat.opacity < 0.02) this.dispose();
    } else if (this.state === 'burning') {
      const left = this.linger - this.t;
      this.innerMat.color.set(hexOf(this.color)).multiplyScalar(1.2);
      this.innerMat.opacity = left < 0.5 ? (Math.sin(this.t * 40) > 0 ? 0.4 : 0.1) * (left / 0.5) : 0.4 + Math.sin(this.t * 12) * 0.08;
      this.ring.visible = false;
      if (Math.random() < dt * 30) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * this.radius * 0.9;
        fx.ember(_v.set(this.pos.x + Math.cos(a) * r, this.pos.y + 0.1, this.pos.z + Math.sin(a) * r), 0, 2 + Math.random() * 2, 0, hexOf(this.color), 0.7, 0.07);
      }
      if (left > 0.3) this.hurt(0.6);
      if (left <= 0) this.dispose();
    }
  }

  dispose() {
    if (this.gone) return;
    this.gone = true;
    this.world.remove(this);
    this.world.scene.remove(this.group);
    this.ringMat.dispose();
    this.innerMat.dispose();
  }
}

// An arcing bomb: an Orb under gravity that detonates its zone when it lands.
class Bomb extends Orb {
  constructor(world, pos, vel, color, zone, flight) {
    super(world, pos, vel, color, { radius: 0.38, life: flight + 1 });
    this.zone = zone;
    this.flight = flight;
    this.age = 0;
    this.trailT = 0;
  }

  update(dt, player) {
    this.age += dt;
    this.vel.y -= G * dt;
    this.pos.addScaledVector(this.vel, dt);
    this.mesh.position.copy(this.pos);
    this.shell.rotation.x += dt * 5;
    this.trailT -= dt;
    if (this.trailT <= 0) {
      this.trailT = 0.03;
      this.world.fx.burst(this.pos, hexOf(this.color), { count: 2, speed: 0.6, life: 0.4, size: 0.35, gravity: 0 });
    }
    // touching the player on the way down still counts
    const b = player.bounds();
    const r = this.radius;
    const hitPlayer = this.pos.x > b.min.x - r && this.pos.x < b.max.x + r && this.pos.y > b.min.y - r && this.pos.y < b.max.y + r && this.pos.z > b.min.z - r && this.pos.z < b.max.z + r;
    const landed = this.age >= this.flight || (this.vel.y < 0 && this.world.pointInSolid(this.pos));
    if (hitPlayer || landed || this.age > this.flight + 1) {
      if (!landed) this.zone.pos.copy(this.pos).setY(floorBelow(this.world, this.pos, 6) ?? this.pos.y - 1);
      this.alive = false;
      this.zone.detonate();
      if (hitPlayer) player.damage(1, 'blast');
    }
  }

  // shot down in the air: pops harmlessly and the marker fades
  onHit(color) {
    const r = super.onHit(color);
    if (r === 'kill') this.zone.cancel();
    return r;
  }
}

export class Mortar extends Enemy {
  constructor(world, { pos, color = 0, hp = 3, range = 42, interval = 3.8, flight = 1.5, radius = 2.4, linger = 2.2, aggro = false, onDeath = null }) {
    super(world, { pos, color, hp, range, aggro, onDeath });
    this.interval = interval;
    this.flight = flight;
    this.radius = radius;
    this.linger = linger;
    this.timer = 1.2 + Math.random() * 1.2;
    this.aim = 0;
    this.yaw = Math.random() * 6.28;
    this.recoil = 0;
    const base = new Parts()
      .add(MAT.dark, new THREE.CylinderGeometry(0.9, 1.05, 0.3, 8), [0, 0.15, 0])
      .add(this.armor, new THREE.CylinderGeometry(0.7, 0.85, 0.35, 8), [0, 0.45, 0])
      .add(glowMat(this.color, 2), new THREE.CylinderGeometry(0.87, 0.87, 0.06, 8), [0, 0.32, 0]);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      base.add(MAT.dark, new THREE.BoxGeometry(0.25, 0.25, 0.7), [Math.cos(a) * 0.95, 0.12, Math.sin(a) * 0.95], [0, -a + Math.PI / 2, 0]);
    }
    this.baseMeshes = base.build(this.group);
    this.turret = new THREE.Group();
    this.turret.position.y = 0.7;
    this.group.add(this.turret);
    this.tube = new THREE.Group();
    this.tube.position.y = 0.2;
    this.tube.rotation.x = -0.9; // tipped back: lobbing up and forward
    this.turret.add(this.tube);
    new Parts()
      .add(MAT.shell, new THREE.SphereGeometry(0.42, 10, 8), [0, 0, 0])
      .add(MAT.dark, new THREE.BoxGeometry(1.1, 0.25, 0.3), [0, -0.05, 0])
      .build(this.turret);
    new Parts()
      .add(this.armor, new THREE.CylinderGeometry(0.3, 0.36, 1.3, 10), [0, 0.6, 0])
      .add(MAT.dark, new THREE.CylinderGeometry(0.36, 0.36, 0.18, 10), [0, 1.2, 0])
      .add(this.glow, new THREE.TorusGeometry(0.33, 0.035, 4, 14), [0, 0.95, 0], [Math.PI / 2, 0, 0])
      .add(this.glow, new THREE.TorusGeometry(0.35, 0.035, 4, 14), [0, 0.55, 0], [Math.PI / 2, 0, 0])
      .add(this.glow, new THREE.CircleGeometry(0.24, 12), [0, 1.3, 0], [-Math.PI / 2, 0, 0])
      .build(this.tube);
    this.register();
  }

  sightFrom() {
    return _a.copy(this.pos).setY(this.pos.y + 1);
  }

  muzzle(out) {
    return out.set(0, 1.35, 0).applyMatrix4(this.tube.matrixWorld);
  }

  update(dt, player) {
    if (!this.tick(dt, player)) return;
    this.recoil = Math.max(0, this.recoil - dt * 3);
    // swing round to face the player
    const want = Math.atan2(this.eye.x - this.pos.x, this.eye.z - this.pos.z);
    let d = want - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += THREE.MathUtils.clamp(d, -2 * dt, 2 * dt);
    this.turret.rotation.y = this.yaw;
    this.tube.rotation.x = -0.9 + this.recoil * 0.3 - this.aim * 0.1;
    this.tube.position.y = 0.2 - this.recoil * 0.15;
    // lobs over cover: it only needs to have spotted you once and have you in range
    if (this.ready && this.aggro && this.dist < this.range) {
      this.timer -= dt;
      if (this.timer <= 0.6 && !this.zone) {
        // aim: mark where the player stands now
        const target = _v.copy(player.pos);
        const f = floorBelow(this.world, _a.copy(player.pos).setY(player.pos.y + 0.5), 8);
        if (f !== null) target.y = f;
        this.zone = new BlastZone(this.world, target, this.color, { radius: this.radius, linger: this.linger, warn: 0.6 + this.flight });
      }
      if (this.zone) this.aim = Math.min(1, this.aim + dt * 3);
      if (this.zone && Math.random() < dt * 25) {
        this.group.updateMatrixWorld();
        converge(this.world.fx, this.muzzle(_a), hexOf(this.color), { count: 2, radius: 0.9, time: 0.3 });
      }
      if (this.timer <= 0 && this.zone) this.fire();
    }
    this.glowFlash(this.zone ? 2.2 + this.aim * 0.6 : 2);
  }

  fire() {
    this.group.updateMatrixWorld();
    const start = this.muzzle(new THREE.Vector3());
    const T = this.flight;
    const target = this.zone.pos;
    const vel = new THREE.Vector3((target.x - start.x) / T, (target.y - start.y) / T + 0.5 * G * T, (target.z - start.z) / T);
    new Bomb(this.world, start, vel, this.color, this.zone, T);
    this.zone = null;
    this.aim = 0;
    this.recoil = 1;
    this.timer = this.interval * (0.85 + Math.random() * 0.3);
    const fx = this.world.fx;
    fx.flash(start, hexOf(this.color), { size: 1, life: 0.12 });
    fx.burst(start, 0xb8c0d0, { count: 10, speed: 3, life: 0.8, size: 0.6, gravity: -1, mode: 'puff' });
    const g = Math.max(0.35, falloff(this.dist, 6, 50));
    sfx('mortar_launch', { gain: 0.8 * g }, 'enemy_shot', { gain: 0.7 * g, rate: 0.55 });
  }

  die(hit, dir) {
    this.dead = true;
    this.zone?.cancel();
    this.zone = null;
    this.explode({ scale: 1.2, chunks: 7, vel: dir ? dir.clone().multiplyScalar(4) : null });
  }

  despawn() {
    this.zone?.cancel();
    this.zone = null;
    super.despawn();
  }
}
