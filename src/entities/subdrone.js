// Sub-drones: submersible hunters patrolling the flooded parts of the Azure station. A sleek hull on four
// ducted propellers, a glowing eye in its color and streams of bubbles behind it. It never leaves its
// water volume: it circles its post, strafes around you once it has seen you, and fires slow torpedo
// orbs that trail bubbles (shoot them down with the matching color). Like the Drone it extends, only its
// own color hurts it; hits shove it back through the water and stagger it, and shot down it floods,
// sinks spinning in a boil of bubbles and blows apart.
import * as THREE from 'three';
import { audio } from '../audio.js';
import { Drone, Orb } from './drone.js';
import { director } from '../combat/director.js';
import { barks } from '../combat/barks.js';

const _v = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _d = new THREE.Vector3();
const _a = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const AXES = ['x', 'y', 'z'];

const KNOCK_DECAY = 3.6; // water drag on a shove (per second, exponential)
const RECOVER = 1.1;
const CRUISE = 3.4; // m/s
const WALL = 0.8; // clearance kept from the water's sides and floor
const SURFACE = 0.9; // and from its surface

// A slow torpedo: a colored orb with a propeller wake of bubbles.
class Torpedo extends Orb {
  constructor(world, pos, vel, color) {
    super(world, pos, vel, color, { homing: 0.55, life: 7, radius: 0.3 });
    this.wake = 0;
  }

  update(dt, player) {
    super.update(dt, player);
    if (!this.alive) return;
    if ((this.wake -= dt) <= 0) {
      this.wake = 0.05;
      this.world.fx.bubbles(this.pos, 1);
    }
  }
}

export class SubDrone extends Drone {
  // water: the volume it lives in (found from pos when omitted). orbit: patrol circle radius around its
  // post; leash: how far it will chase from it; standoff: the distance it strafes around you at.
  constructor(world, { pos, color, water = null, hp = 2, range = 20, fireInterval = 3.2, orbit = 3.5, leash = 9, standoff = 6.5, torpedoSpeed = 5.5, onDeath = null }) {
    super(world, { pos, color, hp, range, fireInterval, orbit, onDeath });
    // restock.js rebuilds a destroyed drone from spawnOpts with its own class: keep every sub option
    this.spawnOpts = { pos, color, water, hp, range, fireInterval, orbit, leash, standoff, torpedoSpeed, onDeath };
    this.water = water || (world.waters || []).find((w) => pos[0] > w.min.x && pos[0] < w.max.x && pos[1] > w.min.y && pos[1] < w.max.y && pos[2] > w.min.z && pos[2] < w.max.z) || null;
    this.leash = leash;
    this.standoff = standoff;
    this.torpedoSpeed = torpedoSpeed;
    this.vel = new THREE.Vector3();
    this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    this.strafeT = 3 + Math.random() * 2;
    this.phi = Math.random() * Math.PI * 2;
    this.bubbleT = 0;
    this.fireTimer = 2 + Math.random() * fireInterval;
    // a deeper, throatier motor than the air drones
    this.humPitch = 0.5 + Math.random() * 0.1;
    this.barkPersona = 'azure'; // a depth unit of the drowned station (combat/barks.js)
    this.buildHull();
    this.applyColor();
  }

  // Swap the hunter drone's blades for a submersible: hull, nose eye, tail fins and four ducted props.
  // (the Drone constructor already made the materials; they're reused so dispose() frees everything)
  buildHull() {
    for (const o of [this.body, this.fins, this.ring]) {
      this.group.remove(o);
      o.traverse((c) => c.geometry?.dispose());
    }
    const shell = this.shellMat, dark = this.darkMat, glow = this.glowMat;
    this.body = new THREE.Group();
    // the hull is modelled nose-forward along +z (Object3D.lookAt points +z at its target)
    const hull = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 1.0, 4, 10), shell);
    hull.rotation.x = Math.PI / 2;
    hull.scale.set(1, 1, 0.82);
    const keel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 1.1), dark);
    keel.position.set(0, -0.32, -0.1);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.42, 0.5), dark);
    fin.position.set(0, 0.4, -0.45);
    fin.rotation.x = -0.35;
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.3), dark);
    tail.position.set(0, 0, -0.78);
    // the eye: a glowing lens in a dark bezel on the nose
    this.eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), glow);
    this.eye.position.set(0, 0.02, 0.8);
    this.eye.scale.z = 0.6;
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.045, 6, 18), dark);
    bezel.position.set(0, 0.02, 0.8);
    // glowing seams down the flanks
    const seams = [];
    for (const s of [-1, 1]) {
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.95), glow);
      seam.position.set(s * 0.335, 0.06, 0.05);
      seams.push(seam);
    }
    this.body.add(hull, keel, fin, tail, this.eye, bezel, ...seams);
    this.parts = [hull, keel, fin, tail];
    // four ducted propellers on short pylons (front pair angled down a touch), blades spinning about z
    this.props = [];
    this.nozzles = [];
    const bladeGeo = new THREE.BoxGeometry(0.06, 0.34, 0.02);
    for (const [x, y, z] of [[-0.62, -0.05, 0.35], [0.62, -0.05, 0.35], [-0.6, 0.02, -0.5], [0.6, 0.02, -0.5]]) {
      const pod = new THREE.Group();
      pod.position.set(x, y, z);
      const duct = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 6, 16), dark);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.018, 4, 16), glow);
      rim.position.z = -0.05;
      const pylon = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(x) - 0.3, 0.06, 0.12), dark);
      pylon.position.x = -Math.sign(x) * ((Math.abs(x) - 0.3) / 2 + 0.2);
      const prop = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const b = new THREE.Mesh(bladeGeo, shell);
        b.position.y = 0.09;
        const arm = new THREE.Group();
        arm.rotation.z = (i * Math.PI * 2) / 3;
        b.rotation.y = 0.5; // pitched blades
        arm.add(b);
        prop.add(arm);
      }
      const hub = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 8), dark);
      hub.rotation.x = -Math.PI / 2;
      prop.add(hub);
      pod.add(duct, rim, pylon, prop);
      this.body.add(pod);
      this.props.push(prop);
      this.nozzles.push(pod);
      this.parts.push(pod);
    }
    // a faint wake glow behind the stern
    this.thruster = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.6, 10, 1, true), this.thrustMat);
    this.thruster.rotation.x = Math.PI / 2;
    this.thruster.position.z = -0.95;
    this.body.add(this.thruster);
    this.fins = new THREE.Group(); // (unused: kept so nothing inherited trips over it)
    this.ring = new THREE.Group();
    this.group.add(this.body);
  }

  // keep a point inside the water, away from its walls and below its surface
  clampToWater(p, k = 1) {
    const w = this.water;
    if (!w) return false;
    let hit = false;
    for (const ax of AXES) {
      const lo = w.min[ax] + WALL * k, hi = w.max[ax] - (ax === 'y' ? SURFACE : WALL) * k;
      if (lo > hi) {
        p[ax] = (w.min[ax] + w.max[ax]) / 2;
        continue;
      }
      if (p[ax] < lo) {
        p[ax] = lo;
        hit = ax;
      } else if (p[ax] > hi) {
        p[ax] = hi;
        hit = ax;
      }
    }
    return hit;
  }

  update(dt, player) {
    if (this.debris) return this.updateDebris(dt);
    _eye.copy(player.pos).y += player.eye;
    this.dist = this.pos.distanceTo(_eye);
    if (this.crashing) return this.updateCrash(dt);
    if (this.dead) return;
    this.t += dt;
    if (this.dist > Math.max(60, this.range + 30)) {
      // dormant far away: a lazy bob so it never looks frozen
      this.group.position.copy(this.pos).y += Math.sin(this.t * 1.2) * 0.2;
      this.updateHum(this.humPitch);
      return;
    }
    if (this.shifter) {
      this.cycleTimer -= dt;
      if (this.cycleTimer <= 0) {
        this.cycleTimer = this.cycle;
        this.colorIdx = (this.colorIdx + 1) % this.palette.length;
        this.color = this.palette[this.colorIdx];
        this.applyColor();
      }
    }
    this.sightTimer -= dt;
    if (this.sightTimer <= 0) {
      this.sightTimer = 0.25;
      this.sees = this.dist < this.range && this.world.lineOfSight(this.pos, _eye);
      if (this.sees && !this.aggro) {
        audio.droneAlert();
        barks.say(this, 'spot'); // "Contact. Depth twelve."
      }
      this.unseenT = this.sees || !this.aggro ? 0 : (this.unseenT || 0) + 0.25;
      if (this.unseenT === 1.5) barks.say(this, 'lost');
      if (this.sees) this.aggro = true;
    }
    this.stagger = Math.max(0, this.stagger - dt);
    if (this.stagger <= 0) this.recover = Math.min(1, this.recover + dt / RECOVER);
    this.dodgeCool -= dt;
    // a lazy sidestep when you line up a shot (subs are less twitchy than the air drones)
    if (this.aggro && this.sees && this.stagger <= 0) {
      const cam = this.world.game.camera;
      const toMe = _v.subVectors(this.pos, cam.position).normalize();
      if (toMe.dot(cam.getWorldDirection(_a)) > 0.996 && Math.random() < dt * 1.4) this.startDodge(player, 5);
    }

    // where to swim: circle the post while idle; once engaged, strafe around you at a standoff distance,
    // never straying more than `leash` from the post (and never out of the water)
    const target = _d;
    if (this.aggro && this.dist < this.range + 8) {
      if ((this.strafeT -= dt) <= 0) {
        this.strafeT = 2.5 + Math.random() * 3;
        this.strafeDir *= -1;
      }
      this.phi += (this.strafeDir * 2.2 * dt) / this.standoff;
      const r = this.standoff;
      target.set(_eye.x + Math.cos(this.phi) * r, _eye.y - 0.4 + Math.sin(this.t * 0.7) * 1.2, _eye.z + Math.sin(this.phi) * r);
      _v.subVectors(target, this.home);
      if (_v.length() > this.leash) target.copy(this.home).addScaledVector(_v.setLength(1), this.leash);
    } else {
      const o = this.orbit;
      target.set(this.home.x + Math.cos(this.t * 0.45) * o, this.home.y + Math.sin(this.t * 0.9) * 0.5, this.home.z + Math.sin(this.t * 0.45) * o);
    }
    this.clampToWater(target, 1.2);
    // steer: ease the swimming velocity toward the target (slack while reeling from a hit)
    _v.subVectors(target, this.pos).multiplyScalar(1.2);
    if (_v.length() > CRUISE) _v.setLength(CRUISE);
    const steer = this.stagger > 0 ? 0.4 : 0.6 + 1.6 * this.recover;
    this.vel.lerp(_v, Math.min(1, dt * steer));
    const prev = _a.copy(this.pos);
    _v.copy(this.vel).add(this.knock).add(this.dodge).multiplyScalar(dt);
    const blocked = this.moveSafe(_v);
    const out = this.clampToWater(this.pos);
    if (out) blocked[out] = blocked.any = true;
    if (blocked.any) {
      for (const k of AXES) {
        if (!blocked[k]) continue;
        if (Math.abs(this.knock[k]) > 3) this.world.fx.bubbles(this.pos, 6);
        this.knock[k] *= -0.35;
        this.dodge[k] = 0;
        this.vel[k] *= -0.3;
        if (this.aggro) this.strafeDir *= -1;
      }
    }
    this.knock.multiplyScalar(Math.exp(-KNOCK_DECAY * dt));
    this.dodge.multiplyScalar(Math.max(0, 1 - dt * 3));
    this.group.position.copy(this.pos);
    const vel = _a.subVectors(this.pos, prev).divideScalar(Math.max(dt, 1e-3));
    this.speed = vel.length();
    // wobble from hits, a gentle roll into turns
    this.tiltV.x += (-30 * this.tilt.x - 5 * this.tiltV.x) * dt;
    this.tiltV.y += (-30 * this.tilt.y - 5 * this.tiltV.y) * dt;
    this.tilt.addScaledVector(this.tiltV, dt).clampScalar(-1.3, 1.3);
    this.group.rotation.x = this.tilt.x;
    this.group.rotation.z = this.tilt.y;
    // nose toward you when engaged, otherwise along its heading
    _q.copy(this.body.quaternion);
    if (this.aggro) this.body.lookAt(_eye);
    else if (this.speed > 0.2) {
      _v.copy(this.pos).add(vel);
      this.body.lookAt(_v);
    }
    _q2.copy(this.body.quaternion);
    this.body.quaternion.copy(_q).slerp(_q2, Math.min(1, dt * (this.stagger > 0 ? 1.5 : 4)));
    const spin = (14 + this.speed * 6) * (this.stagger > 0 ? 0.4 : 1);
    this.props.forEach((p, i) => (p.rotation.z += dt * spin * (i % 2 ? 1 : -1)));
    this.thruster.scale.y = 0.7 + Math.random() * 0.5;
    this.thruster.visible = this.stagger <= 0 || Math.random() < 0.5;
    // streams of bubbles off the props (only when you're near enough to see them)
    if (this.dist < 32 && (this.bubbleT -= dt) <= 0) {
      this.bubbleT = this.stagger > 0 ? 0.04 : 0.11;
      this.body.updateMatrixWorld(true);
      for (let i = 0; i < this.nozzles.length; i++) {
        if (this.stagger <= 0 && (i + Math.floor(this.t * 9)) % 2) continue;
        this.nozzles[i].getWorldPosition(_v);
        this.world.fx.bubbles(_v, 1);
      }
    }

    if (this.sees && this.stagger <= 0) {
      this.fireTimer -= dt;
      // (fires only while it holds one of the director's attack tokens; its first torpedo from off screen
      // is aimed wide, as a warning)
      if (this.fireTimer <= 0 && !director.request(this, 0.7)) this.fireTimer = 0.25 + Math.random() * 0.3;
      if (this.fireTimer <= 0) {
        this.fireTimer = this.fireInterval * (0.8 + Math.random() * 0.4);
        this.eye.getWorldPosition(_v);
        const dir = _a.subVectors(director.aim(this, _v, _eye), _v).normalize();
        new Torpedo(this.world, _v.addScaledVector(dir, 0.5), dir.multiplyScalar(this.torpedoSpeed), this.color);
        this.world.fx.bubbles(_v, 5);
        audio.enemyShoot();
      }
    }

    this.flash = Math.max(0, this.flash - dt * 6);
    this.immuneFlash = Math.max(0, this.immuneFlash - dt * 5);
    if (this.flash > 0) this.glowMat.color.setRGB(3, 3, 3);
    else if (this.immuneFlash > 0) this.glowMat.color.setRGB(0.7, 0.7, 0.8);
    else this.applyColor();
    this.body.scale.setScalar(1 + this.flash * 0.12);
    this.updateHum(this.humPitch * (1 + Math.min(this.speed, 10) * 0.04 + (this.aggro ? 0.05 : 0) + this.stagger * 0.5));
  }

  // shot down underwater: it floods and sinks, tumbling, in a boil of bubbles, then blows apart when it
  // hits the bottom (or after a moment)
  die() {
    super.die();
    this.crashVel.multiplyScalar(0.6);
    this.crashVel.y = Math.min(this.crashVel.y, 0.5);
    this.spin.multiplyScalar(0.45);
    this.world.fx.bubbles(this.pos, 14);
  }

  updateCrash(dt) {
    if (!this.water) return super.updateCrash(dt);
    this.crashT += dt;
    this.crashVel.y -= 5 * dt;
    this.crashVel.multiplyScalar(Math.exp(-1.6 * dt));
    _d.copy(this.crashVel).multiplyScalar(dt);
    const blocked = this.moveSafe(_d, 0.4);
    const out = this.clampToWater(this.pos, 0.5);
    this.group.position.copy(this.pos);
    const wind = 1 + this.crashT * 0.6;
    this.group.rotation.x += this.spin.x * dt * wind;
    this.group.rotation.y += this.spin.y * dt * wind;
    this.group.rotation.z += this.spin.z * dt * wind;
    this.props.forEach((p) => (p.rotation.z += dt * Math.max(0, 20 - this.crashT * 12)));
    const f = Math.random();
    if (f < 0.25) this.applyColor();
    else this.glowMat.color.setRGB(0.4 * f, 0.08, 0.06);
    this.thruster.visible = Math.random() < 0.3;
    this.world.fx.bubbles(this.pos, 2);
    if (Math.random() < dt * 10) this.world.fx.burst(this.pos, 0xffa040, { count: 3, speed: 2.5, life: 0.3, size: 0.18, gravity: 0, drag: 3 });
    this.updateHum(this.humPitch * Math.max(0.35, 1.3 - this.crashT * 0.6));
    if ((blocked.any && this.crashT > 0.25) || (out === 'y' && this.crashVel.y < 0 && this.crashT > 0.4) || this.crashT > 2.6) this.explode();
  }

  explode() {
    super.explode();
    // the blast rips a cloud of bubbles out of the water
    const p = this.pos;
    for (let i = 0; i < 10; i++) this.world.fx.bubbles(_v.set(p.x + (Math.random() - 0.5) * 1.6, p.y + (Math.random() - 0.5) * 1.2, p.z + (Math.random() - 0.5) * 1.6), 4);
    // debris sinks slowly instead of dropping like a stone (see updateDebris)
    for (const d of this.debris) d.vel.multiplyScalar(0.45);
  }

  updateDebris(dt) {
    // water drag: undo most of the inherited gravity and slow everything down
    if (this.water && this.debris) {
      for (const d of this.debris) {
        d.vel.y += 15 * dt;
        d.vel.multiplyScalar(Math.exp(-1.2 * dt));
        if (d.life > 0 && Math.random() < dt * 3) this.world.fx.bubbles(d.obj.position, 1);
      }
    }
    super.updateDebris(dt);
  }
}
