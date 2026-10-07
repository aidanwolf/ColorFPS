// Chroma drones (only hurt by their own color; "shifters" cycle colors) and the colored orbs
// that drones and the boss fire. Orbs can be shot down with the matching color.
import * as THREE from 'three';
import { COLORS } from '../colors.js';
import { audio } from '../audio.js';

const _v = new THREE.Vector3();
const _eye = new THREE.Vector3();

export class Orb {
  constructor(world, pos, vel, color, { damage = 10, homing = 0, life = 6, radius = 0.3, speed = null } = {}) {
    this.world = world;
    this.pos = pos.clone();
    this.vel = vel.clone();
    this.color = color;
    this.damage = damage;
    this.homing = homing;
    this.life = life;
    this.radius = radius;
    this.hitRadius = radius + 0.35;
    this.speed = speed ?? vel.length();
    this.alive = true;
    this.shootable = true;
    const c = new THREE.Color(COLORS[color].hex);
    this.mesh = new THREE.Group();
    const core = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.55, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    const shell = new THREE.Mesh(
      new THREE.IcosahedronGeometry(radius, 1),
      new THREE.MeshBasicMaterial({ color: c.multiplyScalar(2.2), transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.mesh.add(core, shell);
    this.shell = shell;
    this.mesh.position.copy(this.pos);
    world.scene.add(this.mesh);
    world.projectiles.push(this);
  }

  update(dt, player) {
    this.life -= dt;
    if (this.life <= 0) return this.pop();
    if (this.homing > 0) {
      _eye.copy(player.pos).y += player.eye * 0.8;
      _v.subVectors(_eye, this.pos).normalize().multiplyScalar(this.speed);
      this.vel.lerp(_v, Math.min(1, this.homing * dt));
      this.vel.setLength(this.speed);
    }
    this.pos.addScaledVector(this.vel, dt);
    this.mesh.position.copy(this.pos);
    this.shell.rotation.x += dt * 3;
    this.shell.rotation.y += dt * 2;
    const b = player.bounds();
    const r = this.radius;
    if (this.pos.x > b.min.x - r && this.pos.x < b.max.x + r && this.pos.y > b.min.y - r && this.pos.y < b.max.y + r && this.pos.z > b.min.z - r && this.pos.z < b.max.z + r) {
      player.damage(this.damage, 'orb');
      return this.pop();
    }
    if (this.world.pointInSolid(this.pos)) this.pop();
  }

  onHit(color) {
    if (!this.alive) return undefined;
    if (color === this.color) {
      this.pop();
      return 'kill';
    }
    return 'immune';
  }

  pop() {
    if (!this.alive) return;
    this.alive = false;
    this.world.fx.burst(this.pos, COLORS[this.color].hex, { count: 14, speed: 4, life: 0.4, size: 0.25, gravity: 2 });
  }

  dispose() {
    this.world.scene.remove(this.mesh);
    this.mesh.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose();
    });
  }
}

export class Drone {
  constructor(world, { pos, color, hp = 3, range = 26, fireInterval = 1.9, cycle = 2.4, orbit = 2, onDeath = null }) {
    this.world = world;
    this.palette = Array.isArray(color) ? color : [color];
    this.colorIdx = 0;
    this.color = this.palette[0];
    this.shifter = this.palette.length > 1;
    this.cycle = cycle;
    this.cycleTimer = cycle;
    this.hp = hp;
    this.range = range;
    this.fireInterval = fireInterval;
    this.fireTimer = 1 + Math.random() * fireInterval;
    this.home = new THREE.Vector3(...pos);
    this.pos = this.home.clone();
    this.orbit = orbit;
    this.t = Math.random() * 100;
    this.sightTimer = 0;
    this.sees = false;
    this.flash = 0;
    this.immuneFlash = 0;
    this.knock = new THREE.Vector3();
    this.dead = false;
    this.onDeath = onDeath;

    this.group = new THREE.Group();
    this.group.userData.hit = this;
    this.shellMat = new THREE.MeshStandardMaterial({ color: 0x30333f, metalness: 0.7, roughness: 0.35, flatShading: true, emissive: 0x000000 });
    this.glowMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 0), this.shellMat);
    const plates = new THREE.Mesh(new THREE.OctahedronGeometry(0.72, 0), new THREE.MeshStandardMaterial({ color: 0x1b1d24, metalness: 0.9, roughness: 0.3, flatShading: true }));
    plates.scale.set(1, 0.45, 1);
    this.eye = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), this.glowMat);
    this.eye.position.z = -0.5;
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.06, 6, 28), this.glowMat);
    this.ring.rotation.x = Math.PI / 2;
    this.body = new THREE.Group();
    this.body.add(shell, plates, this.eye);
    this.group.add(this.body, this.ring);
    this.group.position.copy(this.pos);
    world.scene.add(this.group);
    world.addHittable(this.group);
    world.add(this);
    this.applyColor();
  }

  applyColor() {
    const c = new THREE.Color(COLORS[this.color].hex);
    this.glowMat.color.copy(c).multiplyScalar(2.4);
    this.shellMat.emissive.copy(c).multiplyScalar(0.35);
  }

  update(dt, player) {
    if (this.dead) return;
    this.t += dt;
    if (this.shifter) {
      this.cycleTimer -= dt;
      if (this.cycleTimer <= 0) {
        this.cycleTimer = this.cycle;
        this.colorIdx = (this.colorIdx + 1) % this.palette.length;
        this.color = this.palette[this.colorIdx];
        this.applyColor();
      }
    }
    _eye.copy(player.pos).y += player.eye;
    const dist = this.pos.distanceTo(_eye);
    this.sightTimer -= dt;
    if (this.sightTimer <= 0) {
      this.sightTimer = 0.25;
      this.sees = dist < this.range && this.world.lineOfSight(this.pos, _eye);
      if (this.sees) this.aggro = true;
    }
    // hover around home, strafing when engaged
    const o = this.aggro ? this.orbit : this.orbit * 0.4;
    const target = _v.set(this.home.x + Math.sin(this.t * 0.8) * o, this.home.y + Math.sin(this.t * 1.7) * 0.35, this.home.z + Math.cos(this.t * 0.6) * o);
    this.pos.lerp(target, Math.min(1, dt * 2));
    this.pos.addScaledVector(this.knock, dt);
    this.knock.multiplyScalar(Math.max(0, 1 - dt * 5));
    this.group.position.copy(this.pos);
    if (this.aggro) this.body.lookAt(_eye);
    this.body.rotation.z += 0;
    this.ring.rotation.z += dt * (this.shifter ? 4 : 1.5);
    this.ring.rotation.x = Math.PI / 2 + Math.sin(this.t * 2) * 0.3;

    if (this.sees) {
      this.fireTimer -= dt;
      if (this.fireTimer <= 0) {
        this.fireTimer = this.fireInterval * (0.8 + Math.random() * 0.4);
        const dir = _v.subVectors(_eye, this.pos).normalize();
        const start = this.pos.clone().addScaledVector(dir, 0.8);
        new Orb(this.world, start, dir.multiplyScalar(11), this.color, { damage: 10 });
        audio.enemyShoot();
      }
    }

    this.flash = Math.max(0, this.flash - dt * 6);
    this.immuneFlash = Math.max(0, this.immuneFlash - dt * 5);
    if (this.flash > 0) this.glowMat.color.setRGB(3, 3, 3);
    else if (this.immuneFlash > 0) this.glowMat.color.setRGB(0.6, 0.6, 0.7);
    else this.applyColor();
    this.body.scale.setScalar(1 + this.flash * 0.15);
  }

  onHit(color, hit) {
    if (this.dead) return undefined;
    this.aggro = true;
    if (color !== this.color) {
      this.immuneFlash = 1;
      return 'immune';
    }
    this.hp--;
    this.flash = 1;
    if (hit?.point) this.knock.subVectors(this.pos, hit.point).normalize().multiplyScalar(5);
    if (this.hp <= 0) {
      this.die();
      return 'kill';
    }
    return 'hit';
  }

  die() {
    this.dead = true;
    const hex = COLORS[this.color].hex;
    this.world.fx.burst(this.pos, hex, { count: 60, speed: 9, life: 0.9, size: 0.4, gravity: 6 });
    this.world.fx.burst(this.pos, 0xffffff, { count: 20, speed: 5, life: 0.4, size: 0.5, gravity: 0 });
    audio.explode();
    this.world.scene.remove(this.group);
    this.world.removeHittable(this.group);
    this.world.remove(this);
    this.onDeath?.(this);
  }
}
