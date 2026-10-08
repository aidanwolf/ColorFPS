// Chroma drones (only hurt by their own color; "shifters" cycle colors) and the colored orbs
// that drones and the boss fire. Orbs can be shot down with the matching color.
import * as THREE from 'three';
import { COLORS } from '../colors.js';
import { audio } from '../audio.js';

const _v = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _d = new THREE.Vector3();
const _a = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const AXES = ['x', 'y', 'z'];

// knockback: every correct-color hit shoves the drone along the shot and staggers it
const KNOCK = 8.5; // m/s added per hit
const KNOCK_MAX = 16;
const KNOCK_DECAY = 3.2; // per second (exponential), so one hit carries it ~2.5 m
const STAGGER = 0.42; // seconds without firing or dodging after a hit
const RECOVER = 1.1; // seconds to ease back into the patrol weave afterwards
const PAD = 0.55; // clearance kept from walls

// ambient hum: full volume close up, silent (and free) far away
const HUM_GAIN = 0.35;
const HUM_NEAR = 4;
const HUM_FAR = 28;

// 1 inside `near`, fading linearly to 0 at `far`
const falloff = (d, near, far) => THREE.MathUtils.clamp(1 - (d - near) / (far - near), 0, 1);

let flashGeo = null;
let ringGeo = null;

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
    this.world.fx.orbPop(this.pos, COLORS[this.color].hex, this.radius);
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
  // An armored hunter drone: blade fins and eye glow in its color. It weaves in a figure-8 and jinks aside
  // when you aim at it. Correct-color hits slam it back along the shot and stagger it (no firing or dodging),
  // so you can charge it down while firing. Killed, it spins out, crashes and explodes into debris.
  constructor(world, opts) {
    const { pos, color, hp = 2, range = 26, fireInterval = 1.9, cycle = 2.4, orbit = 2, knock = KNOCK, onDeath = null } = opts;
    this.spawnOpts = opts; // so the area can restock it when you come back (see restock.js)
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
    this.knockPower = knock;
    this.t = Math.random() * 100;
    this.sightTimer = 0;
    this.sees = false;
    this.flash = 0;
    this.immuneFlash = 0;
    this.knock = new THREE.Vector3();
    this.dodge = new THREE.Vector3();
    this.dodgeCool = 0;
    this.stagger = 0;
    this.recover = 1;
    this.bank = 0;
    this.tilt = new THREE.Vector2(); // wobble around world x / z, a damped spring
    this.tiltV = new THREE.Vector2();
    this.speed = 0;
    this.dist = Infinity;
    this.dead = false;
    this.crashing = false;
    this.onDeath = onDeath;
    // per-drone pitch offset so a group of drones doesn't hum in unison
    this.humPitch = 0.92 + Math.random() * 0.16;
    this.humGain = -1;
    this.humRate = -1;
    this.hum = audio.createLoop('drone_hum', { rate: this.humPitch });

    this.group = new THREE.Group();
    this.group.userData.hit = this;
    this.shellMat = new THREE.MeshStandardMaterial({ color: 0x22242d, metalness: 0.85, roughness: 0.3, flatShading: true, emissive: 0x000000 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x101116, metalness: 0.7, roughness: 0.5, flatShading: true });
    this.darkMat = darkMat;
    this.glowMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.body = new THREE.Group();
    // armored hull: a stretched, faceted diamond with a darker spine
    const hull = new THREE.Mesh(new THREE.OctahedronGeometry(0.62, 0), this.shellMat);
    hull.scale.set(1, 0.62, 1.35);
    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.5, 1.5), darkMat);
    spine.position.y = 0.12;
    this.parts = [hull, spine]; // pieces flung as debris when it explodes
    // mandibles jutting forward
    for (const sx of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.7, 5), darkMat);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = sx * 0.25;
      m.position.set(sx * 0.26, -0.12, -0.95);
      this.body.add(m);
      this.parts.push(m);
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
      this.parts.push(fin);
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
    this.parts.push(this.ring);
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

  // jink sideways relative to the player's view (not while it's reeling from a hit)
  startDodge(player, strength = 9) {
    if (this.dodgeCool > 0 || this.stagger > 0) return;
    this.dodgeCool = 0.9 + Math.random() * 0.7;
    _v.subVectors(this.pos, player.pos);
    const side = new THREE.Vector3(-_v.z, 0, _v.x).normalize().multiplyScalar(Math.random() < 0.5 ? -1 : 1);
    this.dodge.copy(side).multiplyScalar(strength);
    this.dodge.y = (Math.random() - 0.3) * 4;
  }

  // Move by `d`, axis by axis, so a wall only stops the blocked component (the rest still slides).
  // Sub-stepped so a hard shove can't tunnel through a thin wall. Returns the blocked axes.
  moveSafe(d, pad = PAD) {
    const len = d.length();
    if (!Number.isFinite(len)) {
      // a bad knock/dodge vector must never move (or hang) the drone
      d.set(0, 0, 0);
      this.knock.set(0, 0, 0);
      this.dodge.set(0, 0, 0);
    }
    const steps = Math.max(1, Math.min(64, Math.ceil(d.length() / 0.25)));
    const blocked = { x: false, y: false, z: false, any: false };
    for (let s = 0; s < steps; s++) {
      for (const k of AXES) {
        const step = d[k] / steps;
        if (!step || blocked[k]) continue;
        // a drone placed inside the clearance margin may still move, just never into the wall itself
        const wasClear = !this.world.pointInSolid(this.pos, pad);
        const old = this.pos[k];
        this.pos[k] += step;
        if (this.world.pointInSolid(this.pos, wasClear ? pad : 0.25)) {
          this.pos[k] = old;
          blocked[k] = blocked.any = true;
        }
      }
    }
    return blocked;
  }

  update(dt, player) {
    if (this.debris) return this.updateDebris(dt);
    _eye.copy(player.pos).y += player.eye;
    this.dist = this.pos.distanceTo(_eye);
    if (this.crashing) return this.updateCrash(dt);
    if (this.dead) return;
    // dormant while the player is far off: no flight or collision work (it adds up across every world)
    if (this.dist > Math.max(60, this.range + 30)) {
      this.t += dt;
      this.group.position.copy(this.pos).y += Math.sin(this.t * 1.8) * 0.3; // a cheap hover so it never looks frozen
      this.updateHum(this.humPitch);
      return;
    }
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
    const dist = this.dist;
    this.sightTimer -= dt;
    if (this.sightTimer <= 0) {
      this.sightTimer = 0.25;
      this.sees = dist < this.range && this.world.lineOfSight(this.pos, _eye);
      if (this.sees && !this.aggro) audio.droneAlert();
      if (this.sees) this.aggro = true;
    }
    const wasStaggered = this.stagger > 0;
    this.stagger = Math.max(0, this.stagger - dt);
    if (this.stagger <= 0) this.recover = Math.min(1, this.recover + dt / RECOVER);
    // dodge when the player lines up a shot on it
    this.dodgeCool -= dt;
    if (wasStaggered && this.stagger <= 0) this.dodgeCool = Math.min(this.dodgeCool, 0.25);
    if (this.aggro && this.sees && this.stagger <= 0) {
      const cam = this.world.game.camera;
      const toMe = _v.subVectors(this.pos, cam.position).normalize();
      const look = cam.getWorldDirection(_a);
      if (toMe.dot(look) > 0.995 && Math.random() < dt * 2.2) this.startDodge(player);
    }
    // figure-8 weave around home, wider when engaged. The pull toward it goes slack while the drone
    // reels from a hit (so the shove carries) and eases back in as it recovers.
    // (idle drones still patrol a visible loop, so they never read as frozen)
    const o = this.aggro ? this.orbit + 1 : Math.max(1.2, this.orbit * 0.6);
    const target = _v.set(
      this.home.x + Math.sin(this.t * 0.9) * o,
      this.home.y + Math.sin(this.t * 1.8) * 0.45 + Math.sin(this.t * 3.1) * 0.12,
      this.home.z + Math.sin(this.t * 1.8) * o * 0.5,
    );
    const farOut = this.pos.distanceTo(this.home) > o + 6;
    if (farOut) {
      // knocked too far from its post: drop the momentum and haul back
      this.knock.multiplyScalar(0.5);
      this.dodge.multiplyScalar(0.5);
    }
    const pull = farOut ? 4 : this.stagger > 0 ? 0.3 : 0.3 + 1.7 * this.recover * this.recover;
    const prev = _a.copy(this.pos);
    _d.subVectors(target, this.pos).multiplyScalar(Math.min(1, dt * pull));
    _d.addScaledVector(this.knock, dt).addScaledVector(this.dodge, dt);
    const blocked = this.moveSafe(_d);
    if (blocked.any) {
      // bounce off walls instead of sticking to them
      for (const k of AXES) {
        if (!blocked[k]) continue;
        if (Math.abs(this.knock[k]) > 3) this.world.fx.burst(this.pos, 0xffd9a0, { count: 6, speed: 4, life: 0.3, size: 0.15, gravity: 8 });
        this.knock[k] *= -0.35;
        this.dodge[k] = 0;
      }
    }
    this.knock.multiplyScalar(Math.exp(-KNOCK_DECAY * dt));
    this.dodge.multiplyScalar(Math.max(0, 1 - dt * 3.5));
    this.group.position.copy(this.pos);
    const vel = _d.subVectors(this.pos, prev).divideScalar(Math.max(dt, 1e-3));
    this.speed = vel.length();
    // wobble: a damped spring the hits kick
    this.tiltV.x += (-40 * this.tilt.x - 6 * this.tiltV.x) * dt;
    this.tiltV.y += (-40 * this.tilt.y - 6 * this.tiltV.y) * dt;
    this.tilt.addScaledVector(this.tiltV, dt).clampScalar(-1.3, 1.3);
    // bank into the movement, nose toward the player (lazily while staggered)
    this.bank = THREE.MathUtils.lerp(this.bank, -vel.x * 0.06, Math.min(1, dt * 6));
    this.group.rotation.x = this.tilt.x;
    this.group.rotation.z = this.bank + this.tilt.y;
    if (this.aggro) {
      _q.copy(this.body.quaternion);
      this.body.lookAt(_eye);
      _q2.copy(this.body.quaternion);
      this.body.quaternion.copy(_q).slerp(_q2, Math.min(1, dt * (this.stagger > 0 ? 2.5 : 12)));
    }
    this.fins.rotation.y += dt * (this.aggro ? 7 : 3) * (1 + this.stagger * 2);
    this.ring.rotation.y -= dt * (this.shifter ? 5 : 2);
    this.thruster.scale.y = 0.8 + Math.random() * 0.5;
    // the thruster sputters while it's reeling
    this.thruster.visible = this.stagger <= 0 || Math.random() < 0.5;

    if (this.sees && this.stagger <= 0) {
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
    this.updateHum(this.humPitch * (1 + Math.min(this.speed, 16) * 0.025 + (this.aggro ? 0.05 : 0) + this.stagger * 0.6));
  }

  // hum volume from distance to the player; only touches the audio graph when something changed
  updateHum(rate) {
    if (!this.hum) return;
    const k = falloff(this.dist, HUM_NEAR, HUM_FAR);
    const g = HUM_GAIN * k * k;
    if (Math.abs(g - this.humGain) > 0.004 || (!this.hum.src && g > 0.001)) {
      this.humGain = g;
      this.hum.setGain(g);
    }
    if (Math.abs(rate - this.humRate) > 0.01) {
      this.humRate = rate;
      this.hum.setRate(rate);
    }
  }

  stopHum() {
    this.hum?.stop();
    this.hum = null;
  }

  // direction the shot that hit us was travelling
  shotDir(hit, out) {
    if (hit?.dir) out.copy(hit.dir);
    else if (hit?.point) out.subVectors(hit.point, this.world.game.camera.position);
    else out.subVectors(this.pos, this.world.game.camera.position);
    if (out.lengthSq() < 1e-6) out.set(0, 0, -1);
    out.normalize();
    // mostly horizontal, with a little lift, so shots from above don't just pin it to the floor
    out.y = out.y * 0.5 + 0.12;
    return out.normalize();
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
    // knockback along the shot, a stagger, and a tumble that springs back
    const dir = this.shotDir(hit, new THREE.Vector3());
    this.knock.addScaledVector(dir, this.knockPower);
    if (this.knock.length() > KNOCK_MAX) this.knock.setLength(KNOCK_MAX);
    this.dodge.multiplyScalar(0.25);
    this.stagger = STAGGER;
    this.recover = 0;
    this.fireTimer = Math.max(this.fireTimer, 0.5);
    const spin = 6 + Math.random() * 3;
    this.tiltV.x += dir.z * spin;
    this.tiltV.y -= dir.x * spin;
    _a.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    this.body.quaternion.premultiply(_q.setFromAxisAngle(_a, 0.5 + Math.random() * 0.3));
    const p = hit?.point ?? this.pos;
    // hit sparks, sprayed out of the impact along the shot
    this.world.fx.burst(p, 0xffd9a0, { count: 22, speed: 9, life: 0.45, size: 0.17, gravity: 10, dir: _a.copy(dir).multiplyScalar(0.4) });
    this.world.fx.burst(p, COLORS[this.color].hex, { count: 10, speed: 5, life: 0.35, size: 0.22, gravity: 4 });
    audio.droneHit(Math.max(0.5, falloff(this.dist, 6, 40)));
    if (this.hp <= 0) {
      this.die();
      return 'kill';
    }
    return 'hit';
  }

  // shot down: lose power, spin out trailing sparks and smoke, then explode on impact
  die() {
    this.dead = true;
    this.crashing = true;
    this.crashT = 0;
    this.world.removeHittable(this.group);
    // it carries the killing shot's momentum: shoot it and it flies back
    this.crashVel = this.knock.clone().multiplyScalar(0.85).addScaledVector(this.dodge, 0.4)
      .add(new THREE.Vector3((Math.random() - 0.5) * 3, 2, (Math.random() - 0.5) * 3));
    this.spin = new THREE.Vector3((Math.random() - 0.5) * 14, 10 + Math.random() * 8, (Math.random() - 0.5) * 14);
    this.world.fx.burst(this.pos, 0xffffff, { count: 18, speed: 7, life: 0.35, size: 0.4, gravity: 2 });
    this.world.fx.burst(this.pos, 0xff8a30, { count: 20, speed: 6, life: 0.6, size: 0.25, gravity: 8 });
    audio.droneCrash(Math.max(0.45, falloff(this.dist, 8, 50)));
    this.glowMat.color.setRGB(0.4, 0.1, 0.1);
    this.shellMat.emissive.setRGB(0.5, 0.15, 0.02); // overheating
  }

  updateCrash(dt) {
    this.crashT += dt;
    this.crashVel.y -= 16 * dt;
    this.crashVel.multiplyScalar(Math.exp(-0.6 * dt));
    _d.copy(this.crashVel).multiplyScalar(dt);
    const blocked = this.moveSafe(_d, 0.4);
    this.group.position.copy(this.pos);
    // the spin winds up as it falls
    const wind = 1 + this.crashT * 0.8;
    this.group.rotation.x += this.spin.x * dt * wind;
    this.group.rotation.y += this.spin.y * dt * wind;
    this.group.rotation.z += this.spin.z * dt * wind;
    // eye and thruster flicker as power fails
    const f = Math.random();
    if (f < 0.25) this.glowMat.color.copy(new THREE.Color(COLORS[this.color].hex)).multiplyScalar(2);
    else this.glowMat.color.setRGB(0.4 * f, 0.08, 0.06);
    this.thruster.visible = Math.random() < 0.3;
    // sparks, fire and smoke trail
    this.world.fx.burst(this.pos, 0xffa040, { count: 3, speed: 3.5, life: 0.4, size: 0.2, gravity: 6 });
    this.world.fx.burst(this.pos, 0xb83a10, { count: 1, speed: 1, life: 0.45, size: 0.45, gravity: -2, drag: 2 });
    this.world.fx.burst(this.pos, 0x3a3a44, { count: 2, speed: 0.6, life: 1.4, size: 0.6, gravity: -1.5, drag: 1 });
    if (Math.random() < dt * 8) this.world.fx.burst(this.pos, COLORS[this.color].hex, { count: 8, speed: 6, life: 0.3, size: 0.25, gravity: 4 });
    // the motor whines up, then dies away
    this.updateHum(this.humPitch * Math.max(0.35, 1.35 - this.crashT * 0.7));
    if (blocked.any || this.crashT > 3 || this.pos.y < this.home.y - 40) this.explode();
  }

  explode() {
    this.crashing = false;
    this.stopHum();
    const hex = COLORS[this.color].hex;
    const p = this.pos;
    const fx = this.world.fx;
    fx.burst(p, hex, { count: 110, speed: 13, life: 1.1, size: 0.5, gravity: 6 });
    fx.burst(p, 0xffc070, { count: 80, speed: 8, life: 0.8, size: 0.5, gravity: 3 });
    fx.burst(p, 0xffffff, { count: 30, speed: 5, life: 0.3, size: 0.9, gravity: 0 });
    fx.burst(p, 0xff6a20, { count: 40, speed: 4, life: 1.6, size: 0.6, gravity: -2.5, drag: 2.5 });
    fx.burst(p, 0x3a3a44, { count: 20, speed: 2, life: 2.2, size: 1.1, gravity: -1.2, drag: 1.5 });
    audio.droneExplode(Math.max(0.2, falloff(this.dist, 8, 60)));
    const player = this.world.game.player;
    player.shake = Math.max(player.shake, 0.18 + 0.3 * falloff(this.dist, 4, 30));
    this.world.removeHittable(this.group);
    this.onDeath?.(this);

    // a white-hot flash and a shockwave ring in the drone's color
    flashGeo ??= new THREE.SphereGeometry(1, 16, 12);
    ringGeo ??= new THREE.RingGeometry(0.85, 1, 48);
    const add = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };
    this.flashMesh = new THREE.Mesh(flashGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe0b0).multiplyScalar(1.4), ...add }));
    this.flashMesh.position.copy(p);
    this.wave = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(2), side: THREE.DoubleSide, ...add }));
    this.wave.position.copy(p);
    this.wave.rotation.x = -Math.PI / 2;
    this.world.scene.add(this.flashMesh, this.wave);

    // fling the hull, fins, ring and mandibles as debris
    this.group.updateMatrixWorld(true);
    this.debris = [];
    this.debrisT = 0;
    for (const part of this.parts) {
      this.world.scene.attach(part);
      const vel = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.4, Math.random() - 0.5).normalize().multiplyScalar(5 + Math.random() * 7);
      vel.addScaledVector(this.crashVel, 0.25);
      const life = 1.6 + Math.random() * 1.2;
      this.debris.push({ obj: part, vel, life, max: life, scale: part.scale.clone(), spin: new THREE.Vector3().randomDirection().multiplyScalar(8 + Math.random() * 10) });
    }
    this.world.scene.remove(this.group);
    this.shellMat.emissive.setRGB(0.9, 0.3, 0.05);
  }

  // after the blast: the flash fades, the ring expands, debris bounces and cools, then it's gone
  updateDebris(dt) {
    const t = (this.debrisT += dt);
    if (this.flashMesh) {
      const k = Math.min(1, t / 0.2);
      this.flashMesh.scale.setScalar(0.5 + 1.7 * Math.sqrt(k));
      this.flashMesh.material.opacity = (1 - k) * (1 - k);
      this.wave.scale.setScalar(1 + 6 * Math.sqrt(Math.min(1, t / 0.5)));
      this.wave.material.opacity = Math.max(0, 1 - t / 0.5);
      if (t > 0.5) {
        this.world.scene.remove(this.flashMesh, this.wave);
        this.flashMesh.material.dispose();
        this.wave.material.dispose();
        this.flashMesh = this.wave = null;
      }
    }
    // glowing edges and hot metal cool down
    const cool = Math.max(0, 1 - t / 1.8);
    this.glowMat.color.setRGB(2.2 * cool + 0.1, 0.7 * cool * cool + 0.03, 0.2 * cool * cool + 0.02);
    this.shellMat.emissive.setRGB(0.9 * cool, 0.3 * cool * cool, 0.05 * cool);
    let alive = 0;
    for (const d of this.debris) {
      if (d.life <= 0) continue;
      d.life -= dt;
      alive++;
      const o = d.obj;
      d.vel.y -= 20 * dt;
      // bounce off whatever it lands on, losing energy
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
      if (Math.random() < dt * 10 * cool) this.world.fx.burst(o.position, 0xff7a30, { count: 1, speed: 1, life: 0.5, size: 0.25, gravity: -1 });
      o.scale.copy(d.scale).multiplyScalar(Math.min(1, d.life / 0.4));
      if (d.life <= 0) o.visible = false;
    }
    if (!alive && !this.flashMesh) this.dispose();
  }

  // remove from the world for good and free the GPU resources
  dispose() {
    this.stopHum();
    this.dead = true;
    this.world.removeHittable(this.group);
    this.world.remove(this);
    this.world.scene.remove(this.group);
    for (const d of this.debris || []) this.world.scene.remove(d.obj);
    if (this.flashMesh) {
      this.world.scene.remove(this.flashMesh, this.wave);
      this.flashMesh.material.dispose();
      this.wave.material.dispose();
      this.flashMesh = this.wave = null;
    }
    const roots = [this.group, ...(this.debris || []).map((d) => d.obj)];
    for (const r of roots) r.traverse((o) => o.geometry?.dispose());
    for (const m of [this.shellMat, this.darkMat, this.glowMat, this.thrustMat]) m.dispose();
    this.debris = null;
  }
}
