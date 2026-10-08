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
      audio.orbPop();
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
  // An armored hunter drone: blade fins and eye glow in its color. It weaves in a figure-8, jinks aside
  // when you aim at it or hit it, throws sparks on hits, and spins out, crashes and explodes when killed.
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
    this.dodge = new THREE.Vector3();
    this.dodgeCool = 0;
    this.dead = false;
    this.crashing = false;
    this.onDeath = onDeath;

    this.group = new THREE.Group();
    this.group.userData.hit = this;
    this.shellMat = new THREE.MeshStandardMaterial({ color: 0x22242d, metalness: 0.85, roughness: 0.3, flatShading: true, emissive: 0x000000 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x101116, metalness: 0.7, roughness: 0.5, flatShading: true });
    this.glowMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.body = new THREE.Group();
    // armored hull: a stretched, faceted diamond with a darker spine
    const hull = new THREE.Mesh(new THREE.OctahedronGeometry(0.62, 0), this.shellMat);
    hull.scale.set(1, 0.62, 1.35);
    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.5, 1.5), darkMat);
    spine.position.y = 0.12;
    // mandibles jutting forward
    for (const sx of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.7, 5), darkMat);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = sx * 0.25;
      m.position.set(sx * 0.26, -0.12, -0.95);
      this.body.add(m);
    }
    // glowing slit eye
    this.eye = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.08, 0.08), this.glowMat);
    this.eye.position.set(0, 0.04, -0.8);
    // blade fins in the drone's color
    this.fins = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const fin = new THREE.Group();
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.28), darkMat);
      blade.position.x = 0.75;
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.05), this.glowMat);
      edge.position.set(0.75, 0, -0.15);
      fin.add(blade, edge);
      fin.rotation.y = (i * Math.PI) / 2 + Math.PI / 4;
      fin.rotation.z = -0.25;
      this.fins.add(fin);
    }
    // spiked ring
    this.ring = new THREE.Group();
    const torus = new THREE.Mesh(new THREE.TorusGeometry(0.98, 0.05, 6, 32), darkMat);
    torus.rotation.x = Math.PI / 2;
    this.ring.add(torus);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.32, 4), this.glowMat);
      spike.position.set(Math.cos(a) * 1.1, 0, Math.sin(a) * 1.1);
      spike.rotation.z = -Math.PI / 2;
      spike.rotation.y = -a;
      this.ring.add(spike);
    }
    // thruster glow underneath
    this.thrustMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
    this.thruster = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.7, 10, 1, true), this.thrustMat);
    this.thruster.rotation.x = Math.PI;
    this.thruster.position.y = -0.62;
    this.body.add(hull, spine, this.eye, this.thruster);
    this.group.add(this.body, this.fins, this.ring);
    this.group.position.copy(this.pos);
    world.scene.add(this.group);
    world.addHittable(this.group);
    world.add(this);
    this.applyColor();
  }

  applyColor() {
    const c = new THREE.Color(COLORS[this.color].hex);
    this.glowMat.color.copy(c).multiplyScalar(2.4);
    this.thrustMat.color.copy(c).multiplyScalar(1.6);
    this.shellMat.emissive.copy(c).multiplyScalar(0.12);
  }

  // jink sideways relative to the player's view
  startDodge(player, strength = 9) {
    if (this.dodgeCool > 0) return;
    this.dodgeCool = 0.9 + Math.random() * 0.7;
    _v.subVectors(this.pos, player.pos);
    const side = new THREE.Vector3(-_v.z, 0, _v.x).normalize().multiplyScalar(Math.random() < 0.5 ? -1 : 1);
    this.dodge.copy(side).multiplyScalar(strength);
    this.dodge.y = (Math.random() - 0.3) * 4;
  }

  update(dt, player) {
    if (this.crashing) return this.updateCrash(dt);
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
      if (this.sees && !this.aggro) audio.droneAlert();
      if (this.sees) this.aggro = true;
    }
    // dodge when the player lines up a shot on it
    this.dodgeCool -= dt;
    if (this.aggro && this.sees) {
      const cam = this.world.game.camera;
      const toMe = _v.subVectors(this.pos, cam.position).normalize();
      const look = cam.getWorldDirection(new THREE.Vector3());
      if (toMe.dot(look) > 0.995 && Math.random() < dt * 2.2) this.startDodge(player);
    }
    // figure-8 weave around home, wider when engaged
    const o = this.aggro ? this.orbit + 1 : this.orbit * 0.4;
    const target = _v.set(
      this.home.x + Math.sin(this.t * 0.9) * o,
      this.home.y + Math.sin(this.t * 1.8) * 0.45 + Math.sin(this.t * 3.1) * 0.12,
      this.home.z + Math.sin(this.t * 1.8) * o * 0.5,
    );
    const prev = this.pos.clone();
    this.pos.lerp(target, Math.min(1, dt * 2));
    this.pos.addScaledVector(this.knock, dt).addScaledVector(this.dodge, dt);
    this.knock.multiplyScalar(Math.max(0, 1 - dt * 5));
    this.dodge.multiplyScalar(Math.max(0, 1 - dt * 3.5));
    // stay out of walls and near home
    if (this.world.pointInSolid(this.pos, 0.5) || this.pos.distanceTo(this.home) > o + 4) this.pos.copy(prev);
    this.group.position.copy(this.pos);
    // bank into the movement, nose toward the player
    const vel = this.pos.clone().sub(prev).divideScalar(Math.max(dt, 1e-3));
    if (this.aggro) this.body.lookAt(_eye);
    this.group.rotation.z = THREE.MathUtils.lerp(this.group.rotation.z, -vel.x * 0.06, Math.min(1, dt * 6));
    this.fins.rotation.y += dt * (this.aggro ? 7 : 3);
    this.ring.rotation.y -= dt * (this.shifter ? 5 : 2);
    this.thruster.scale.y = 0.8 + Math.random() * 0.5;

    if (this.sees) {
      this.fireTimer -= dt;
      if (this.fireTimer <= 0) {
        this.fireTimer = this.fireInterval * (0.8 + Math.random() * 0.4);
        const dir = _v.subVectors(_eye, this.pos).normalize();
        const start = this.pos.clone().addScaledVector(dir, 1.0);
        new Orb(this.world, start, dir.multiplyScalar(11), this.color, { damage: 10 });
        audio.enemyShoot();
      }
    }

    this.flash = Math.max(0, this.flash - dt * 6);
    this.immuneFlash = Math.max(0, this.immuneFlash - dt * 5);
    if (this.flash > 0) this.glowMat.color.setRGB(3, 3, 3);
    else if (this.immuneFlash > 0) this.glowMat.color.setRGB(0.7, 0.7, 0.8);
    else this.applyColor();
    this.body.scale.setScalar(1 + this.flash * 0.12);
  }

  onHit(color, hit) {
    if (this.dead) return undefined;
    this.aggro = true;
    if (color !== this.color) {
      this.immuneFlash = 1;
      this.startDodge(this.world.game.player, 6);
      return 'immune';
    }
    this.hp--;
    this.flash = 1;
    if (hit?.point) {
      this.knock.subVectors(this.pos, hit.point).normalize().multiplyScalar(6);
      // hit sparks
      this.world.fx.burst(hit.point, 0xffd9a0, { count: 22, speed: 8, life: 0.45, size: 0.18, gravity: 10 });
      this.world.fx.burst(hit.point, COLORS[this.color].hex, { count: 10, speed: 5, life: 0.35, size: 0.22, gravity: 4 });
    }
    if (this.hp <= 0) {
      this.die();
      return 'kill';
    }
    this.dodgeCool = 0;
    this.startDodge(this.world.game.player, 7);
    return 'hit';
  }

  // shot down: lose power, spin out trailing sparks and smoke, then explode on impact
  die() {
    this.dead = true;
    this.crashing = true;
    this.crashT = 0;
    this.world.removeHittable(this.group);
    this.crashVel = this.knock.clone().add(this.dodge).multiplyScalar(0.6).add(new THREE.Vector3((Math.random() - 0.5) * 3, 1.5, (Math.random() - 0.5) * 3));
    this.spin = new THREE.Vector3((Math.random() - 0.5) * 14, 10 + Math.random() * 8, (Math.random() - 0.5) * 14);
    this.world.fx.burst(this.pos, 0xffffff, { count: 25, speed: 6, life: 0.4, size: 0.4, gravity: 2 });
    audio.shatter();
    this.glowMat.color.setRGB(0.4, 0.1, 0.1);
    this.thruster.visible = false;
  }

  updateCrash(dt) {
    this.crashT += dt;
    this.crashVel.y -= 16 * dt;
    this.pos.addScaledVector(this.crashVel, dt);
    this.group.position.copy(this.pos);
    this.group.rotation.x += this.spin.x * dt;
    this.group.rotation.y += this.spin.y * dt;
    this.group.rotation.z += this.spin.z * dt;
    // sparks and smoke trail
    this.world.fx.burst(this.pos, 0xffa040, { count: 3, speed: 3, life: 0.4, size: 0.2, gravity: 6 });
    this.world.fx.burst(this.pos, 0x3a3a44, { count: 2, speed: 0.6, life: 1.2, size: 0.55, gravity: -1.5, drag: 1 });
    if (Math.random() < dt * 6) this.world.fx.burst(this.pos, COLORS[this.color].hex, { count: 6, speed: 5, life: 0.3, size: 0.25, gravity: 4 });
    if (this.world.pointInSolid(this.pos, 0.4) || this.crashT > 3 || this.pos.y < this.home.y - 40) this.explode();
  }

  explode() {
    this.crashing = false;
    const hex = COLORS[this.color].hex;
    this.world.fx.burst(this.pos, hex, { count: 70, speed: 10, life: 1, size: 0.45, gravity: 6 });
    this.world.fx.burst(this.pos, 0xffc070, { count: 50, speed: 7, life: 0.7, size: 0.4, gravity: 3 });
    this.world.fx.burst(this.pos, 0xffffff, { count: 20, speed: 4, life: 0.35, size: 0.6, gravity: 0 });
    audio.explode();
    this.world.game.player.shake = Math.max(this.world.game.player.shake, 0.25);
    this.world.scene.remove(this.group);
    this.world.remove(this);
    this.onDeath?.(this);
  }
}
