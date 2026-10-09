// Brute: a slow, armored ram that hovers just off the floor and stalks you. Every few seconds it plants
// itself, roars, opens the shutters over its glowing weak point and paints a danger lane on the floor,
// then charges down that lane: strafe or jump aside. Slamming into a wall leaves it dazed with the weak
// point still open. Body shots of its color hurt it; the open weak point takes triple damage.
// Between charges, at mid range, it plants and heats the slag cannon on its back (the mouth glows white
// hot, ~0.8 s), then lobs a spread of lava gobs at you (lavaGob.js): each marks where it will land and
// leaves a little molten puddle there. Strafe out of the pattern.
import * as THREE from 'three';
import { audio } from '../audio.js';
import { Enemy, Parts, Beam, MAT, moveSafe, floorBelow, falloff, hexOf, sfx, converge, DANGER } from './enemyKit.js';
import { Spring } from './groundKit.js';
import { esfx } from './enemySfx.js';
import { barks } from '../combat/barks.js';
import { director } from '../combat/director.js';
import { lobGob, moltenTint } from './lavaGob.js';

const _v = new THREE.Vector3();
const _d = new THREE.Vector3();
const _a = new THREE.Vector3();
const _m = new THREE.Vector3();
const _c = new THREE.Color();
const HOVER = 1.25; // body center above the floor
const PAD = 1.0;
const MUZZLE = new THREE.Vector3(0, 1.08, 0); // the slag cannon's mouth, in the cannon's frame
const rnd = (a, b) => a + Math.random() * (b - a);

export class Brute extends Enemy {
  constructor(world, { pos, color = 0, shields = null, shieldHp = 5, shieldRegen = 0, hp = 9, range = 40, speed = 2.6, chargeSpeed = 22, windup = 1.15, cooldown = 2.6, stun = 1.8, lob = true, gobs = 4, lobEvery = [2.2, 3.2], lobWindup = 0.55, aggro = false, onDeath = null }) {
    // it rolls in behind an armor shell (its own color unless the spec gives its shields), so it lives long
    // enough to get the lava going; a palette `color: [body, ..., outer]` still means body + shields
    const own = Array.isArray(color) ? null : [color];
    super(world, { pos, color, shields: shields ?? own, shieldHp, shieldRegen, hp, range, aggro, onDeath });
    this.speed = speed;
    this.chargeSpeed = chargeSpeed;
    this.windupTime = windup;
    this.cooldown = cooldown;
    this.stunTime = stun;
    // the lava-gob volley: `gobs` per volley, one volley every lobEvery[0..1] s after `lobWindup` s of heating up
    this.lob = lob;
    this.gobs = gobs;
    this.lobEvery = lobEvery;
    this.lobWindup = lobWindup;
    this.lobT = 0.5 + Math.random() * 0.6; // (the first volley comes almost at once)
    this.heat = 0; // the cannon's glow: 0 cold, 1 white hot
    this.recoil = 0;
    this.tint = moltenTint(this.pos);
    this.state = 'stalk';
    this.timer = 1.5 + Math.random();
    this.yaw = Math.random() * 6.28;
    this.open = 0; // shutters over the weak point: 0 closed, 1 open
    this.dir = new THREE.Vector3();
    this.knock = new THREE.Vector3();
    this.floorY = floorBelow(world, this.pos, 20) ?? this.pos.y - HOVER;
    this.pos.y = this.floorY + HOVER;
    this.floorT = 0;
    // body language (poseBody): pitch / roll springs for leaning into moves, rearing up, flinching
    this.pS = new Spring(60, 8);
    this.rS = new Spring(60, 8);
    this.wobble = 0;
    this.painSound = null; // (onDamage plays its own, heavier)

    this.body = new THREE.Group();
    this.group.add(this.body);
    const p = new Parts()
      // hull: a broad armored wedge
      .add(this.armor, new THREE.BoxGeometry(2.1, 1.1, 1.9), [0, 0, -0.1])
      .add(this.armor, new THREE.BoxGeometry(1.7, 0.5, 1.5), [0, 0.7, -0.25])
      .add(MAT.dark, new THREE.BoxGeometry(2.4, 0.35, 2.2), [0, -0.6, -0.1])
      // the ram: a sloped prow with horns
      .add(MAT.dark, new THREE.BoxGeometry(2.3, 1.3, 0.45), [0, 0.05, 0.95], [-0.35, 0, 0])
      .add(MAT.dark, new THREE.ConeGeometry(0.17, 0.9, 6), [-0.85, 0.35, 1.35], [Math.PI / 2 - 0.2, 0, 0])
      .add(MAT.dark, new THREE.ConeGeometry(0.17, 0.9, 6), [0.85, 0.35, 1.35], [Math.PI / 2 - 0.2, 0, 0])
      // side armor pods and rear thruster housings
      .add(this.armor, new THREE.BoxGeometry(0.45, 0.9, 1.6), [-1.25, -0.05, -0.1])
      .add(this.armor, new THREE.BoxGeometry(0.45, 0.9, 1.6), [1.25, -0.05, -0.1])
      .add(MAT.shell, new THREE.CylinderGeometry(0.32, 0.38, 0.5, 8), [-0.6, 0, -1.2], [Math.PI / 2, 0, 0])
      .add(MAT.shell, new THREE.CylinderGeometry(0.32, 0.38, 0.5, 8), [0.6, 0, -1.2], [Math.PI / 2, 0, 0])
      // the slag cannon's mounting plate on the top hull
      .add(MAT.dark, new THREE.BoxGeometry(0.9, 0.14, 0.8), [0, 0.98, -0.45])
      // color trims: brow slits, flank stripes
      .add(this.glow, new THREE.BoxGeometry(1.5, 0.08, 0.08), [0, 0.55, 0.62])
      .add(this.glow, new THREE.BoxGeometry(0.05, 0.16, 1.5), [-1.48, 0.1, -0.1])
      .add(this.glow, new THREE.BoxGeometry(0.05, 0.16, 1.5), [1.48, 0.1, -0.1])
      // a glowing band around the top hull, and eyes either side of the prow
      .add(this.glow, new THREE.BoxGeometry(1.74, 0.07, 1.54), [0, 0.5, -0.25])
      .add(this.glow, new THREE.BoxGeometry(0.22, 0.1, 0.1), [-0.75, 0.72, 0.5])
      .add(this.glow, new THREE.BoxGeometry(0.22, 0.1, 0.1), [0.75, 0.72, 0.5]);
    p.build(this.body);
    // the slag cannon: a stubby mortar on a ball mount, tipped forward to lob over the prow; its heat bands
    // and mouth glow as it heats up for a volley
    this.heatMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    this.mats.push(this.heatMat);
    this.cannon = new THREE.Group();
    this.cannon.position.set(0, 1.02, -0.45);
    this.cannon.rotation.x = 0.5;
    this.body.add(this.cannon);
    new Parts()
      .add(MAT.dark, new THREE.SphereGeometry(0.36, 10, 8), [0, 0, 0])
      .add(this.armor, new THREE.CylinderGeometry(0.27, 0.34, 0.9, 10), [0, 0.45, 0])
      .add(MAT.dark, new THREE.CylinderGeometry(0.34, 0.34, 0.16, 10), [0, 0.94, 0])
      .add(this.heatMat, new THREE.TorusGeometry(0.31, 0.035, 4, 14), [0, 0.32, 0], [Math.PI / 2, 0, 0])
      .add(this.heatMat, new THREE.TorusGeometry(0.29, 0.035, 4, 14), [0, 0.62, 0], [Math.PI / 2, 0, 0])
      .add(this.heatMat, new THREE.CircleGeometry(0.25, 12), [0, 1.03, 0], [-Math.PI / 2, 0, 0])
      .build(this.cannon);
    // rear thruster flames
    this.thrustMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false });
    this.mats.push(this.thrustMat);
    const tp = new Parts();
    for (const sx of [-0.6, 0.6]) tp.add(this.thrustMat, new THREE.ConeGeometry(0.26, 0.9, 10, 1, true), [sx, 0, -1.85], [-Math.PI / 2, 0, 0]);
    tp.add(this.thrustMat, new THREE.ConeGeometry(0.5, 0.5, 10, 1, true), [0, -0.95, 0], [Math.PI, 0, 0]);
    this.thrust = tp.build(this.body)[0];
    // the weak point: a glowing grill in the prow behind two sliding shutters
    this.weakMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.mats.push(this.weakMat);
    this.weak = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 0.12), this.weakMat);
    this.weak.position.set(0, 0.08, 1.25);
    this.weak.rotation.x = -0.35;
    this.body.add(this.weak);
    this.shutters = [];
    for (const sx of [-1, 1]) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.64, 0.1), MAT.shell);
      s.userData.x = sx * 0.3;
      s.position.set(sx * 0.3, 0.08, 1.34);
      s.rotation.x = -0.35;
      this.body.add(s);
      this.shutters.push(s);
    }
    this.lane = new Beam(world.scene, DANGER);
    this.hum = audio.createLoop('drone_hum', { rate: 0.4 });
    this.register();
    this.group.rotation.y = this.yaw;
  }

  sightFrom() {
    return _a.copy(this.pos).setY(this.pos.y + 0.6);
  }

  // turn toward the player at `rate` rad/s; returns the remaining angle
  face(dt, rate) {
    const want = Math.atan2(this.eye.x - this.pos.x, this.eye.z - this.pos.z);
    let d = want - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += THREE.MathUtils.clamp(d, -rate * dt, rate * dt);
    return Math.abs(d);
  }

  forward(out) {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  // horizontal move that won't hover off a ledge; returns true if something stopped it
  step(d) {
    const len = Math.hypot(d.x, d.z);
    if (len > 1e-5) {
      // floor must continue just ahead (a cheap grid lookup, not a ray)
      const probe = _v.set(this.pos.x + (d.x / len) * 1.3, this.floorY - 0.2, this.pos.z + (d.z / len) * 1.3);
      if (!this.world.pointInSolid(probe)) return true;
    }
    const blocked = moveSafe(this.world, this.pos, d, PAD);
    return blocked.x || blocked.z;
  }

  update(dt, player) {
    if (!this.tick(dt, player)) return this.updateHum(0.4);
    const fx = this.world.fx;
    this.timer -= dt;
    this.lobT -= dt;
    // keep hovering at a steady height over whatever floor is below
    this.floorT -= dt;
    if (this.floorT <= 0) {
      this.floorT = 0.2;
      const f = floorBelow(this.world, this.pos, HOVER + 4);
      if (f !== null) this.floorY = f;
    }
    this.pos.y += (this.floorY + HOVER + Math.sin(this.t * 2.2) * 0.08 - this.pos.y) * Math.min(1, dt * 6);
    let wantOpen = 0;
    if (!this.ready) {
      this.face(dt, 3);
    } else if (this.state === 'stalk') {
      // lumber toward the player (not too close), turning to face them
      this.face(dt, 1.8);
      if (this.aggro && this.dist > 5.5) {
        _d.subVectors(this.eye, this.pos).setY(0).normalize().multiplyScalar(this.speed * dt);
        this.step(_d);
      }
      // the lava first: a volley whenever one's due and you're in range (once the director hands it an attack
      // token), else the charge
      if (this.lob && this.lobT <= 0 && this.aggro && this.sees && this.dist > 5 && this.dist < 32) {
        if (director.request(this, this.lobWindup + this.gobs * 0.14 + 0.5)) this.startLob();
        else this.lobT = rnd(0.3, 0.6);
      } else if (this.timer <= 0 && this.sees && this.dist > 4 && this.dist < 32) {
        this.state = 'windup';
        esfx('hydraulic_hiss', this.pos, 1, 0.7); // it plants itself: the hydraulics vent
        barks.say(this, 'charge');
        this.timer = this.windupTime;
        const g = Math.max(0.4, falloff(this.dist, 6, 45));
        sfx('brute_roar', { gain: 0.8 * g }, 'boss_charge', { gain: 0.7 * g, rate: 1.3 });
      }
    } else if (this.state === 'lob') {
      this.updateLob(dt, player);
    } else if (this.state === 'windup') {
      // plant, open up, and paint the lane; the aim locks for the last 0.3 s
      wantOpen = 1;
      if (this.timer > 0.3) this.face(dt, 4);
      this.forward(this.dir);
      const from = _a.copy(this.pos).setY(this.floorY + 0.06);
      // (the lane's length only needs a fresh ray now and then)
      if ((this.laneT = (this.laneT ?? 0) - dt) <= 0) {
        this.laneT = 0.1;
        const hit = this.world.raycast(_v.copy(this.pos), this.dir, 40, { meshes: false });
        this.laneLen = hit ? hit.t : 40;
      }
      const len = this.laneLen;
      const locked = this.timer <= 0.3;
      this.lane.set(from, _v.copy(from).addScaledVector(this.dir, len), 1, locked ? 0.32 : 0.14 + 0.1 * Math.sin(this.t * 25), locked ? 0xff9a6a : DANGER);
      this.lane.mesh.scale.set(2.2, 0.02, len);
      this.body.position.set((Math.random() - 0.5) * 0.06, 0, (Math.random() - 0.5) * 0.06);
      if (Math.random() < dt * 20) fx.burst(_v.copy(this.pos).addScaledVector(this.dir, -1.9), 0xffa040, { count: 3, speed: 3, life: 0.3, size: 0.3, gravity: 0 });
      this.game.player.shake = Math.max(this.game.player.shake, 0.06 * falloff(this.dist, 4, 20));
      if (this.timer <= 0) {
        this.state = 'charge';
        esfx('robot_effort', this.pos, 1, 0.6);
        this.pS.kick(3); // it lunges forward off the mark
        this.travel = 0;
        this.body.position.set(0, 0, 0);
        this.lane.hide();
      }
    } else if (this.state === 'charge') {
      wantOpen = 1;
      const v = this.chargeSpeed * Math.min(1, 0.35 + this.travel / 3);
      _d.copy(this.dir).multiplyScalar(v * dt);
      this.travel += v * dt;
      if (Math.random() < dt * 30) fx.burst(_v.copy(this.pos).setY(this.floorY + 0.1), 0xb8c0d0, { count: 2, speed: 2, life: 0.5, size: 0.4, gravity: -0.5, mode: 'puff' });
      // a charge across a puddle (world.wet) loses it: the thrusters' wash on the water throws it into a spin
      const wet = this.world.wet;
      if (wet?.count && this.travel > 2 && wet.slickAt(_m.set(this.pos.x, this.floorY, this.pos.z)) > 0.3) this.spinOut(v);
      else if (this.step(_d)) this.slam();
      else if (this.travel > 34) {
        this.state = 'recover';
        this.timer = 0.9;
      }
      // getting rammed is fatal
      const b = player.bounds();
      const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
      if (Math.hypot(dx, dz) < 1.75 && b.max.y > this.pos.y - 1.1 && b.min.y < this.pos.y + 1) player.damage(1, 'ram');
    } else if (this.state === 'stunned' || this.state === 'recover') {
      // dazed: weak point still open, sparks crackling round it
      wantOpen = 1;
      if (this.state === 'stunned') {
        this.wobble = Math.sin(this.t * 9) * 0.06 * Math.min(1, this.timer);
        if (Math.random() < dt * 12) fx.sparks(_v.copy(this.pos).setY(this.pos.y + 1), _a.randomDirection().setY(0.8), 0xffe080, { count: 4, speed: 5, spread: 0.6, life: 0.3 });
      }
      if (this.timer <= 0) {
        this.state = 'stalk';
        this.timer = this.cooldown * (0.85 + Math.random() * 0.3) * this.rage.cool;
        this.lobT = Math.max(this.lobT, rnd(0.8, 1.4)); // (a beat to collect itself before a volley)
        this.wobble = 0;
      }
    }
    // spinning out (spinOut): it slews round, skidding on along the charge
    if (this.spin) {
      this.yaw += this.spin * dt;
      this.spin *= Math.exp(-2.2 * dt);
      if (Math.abs(this.spin) < 0.3) this.spin = 0;
      if (Math.random() < dt * 25) fx.burst(_v.copy(this.pos).setY(this.floorY + 0.1), 0xcfeeff, { count: 3, speed: 4, life: 0.5, size: 0.2, gravity: 9 });
    }
    // shoves (a light push back from hits) and the player bumping into it
    if (this.knock.lengthSq() > 0.01) {
      _d.copy(this.knock).multiplyScalar(dt);
      this.step(_d);
      this.knock.multiplyScalar(Math.exp(-5 * dt));
    }
    if (this.state !== 'charge') {
      const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.9 && d > 1e-3 && player.pos.y < this.pos.y + 1 && player.pos.y + 1.6 > this.pos.y - 1.2) {
        player.vel.x += (dx / d) * 30 * dt;
        player.vel.z += (dz / d) * 30 * dt;
      }
    }
    this.poseBody(dt);
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
    // shutters slide open; the weak point blazes while exposed
    this.open += (wantOpen - this.open) * Math.min(1, dt * (wantOpen ? 9 : 4));
    for (const s of this.shutters) s.position.x = s.userData.x + Math.sign(s.userData.x) * this.open * 0.62;
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 18);
    if (this.flash > 0) this.weakMat.color.setRGB(3, 3, 3);
    else this.weakMat.color.set(hexOf(this.color)).multiplyScalar(0.5 + this.open * (1.4 + 0.7 * pulse));
    this.glowFlash();
    // the cannon: heat glow (dull red at rest, flickering white hot about to fire) and recoil
    if (this.state !== 'lob') this.heat = Math.max(0, this.heat - dt * 1.2);
    this.recoil = Math.max(0, this.recoil - dt * 5);
    const h = this.heat;
    this.heatMat.color.set(this.tint).lerp(_c.set(0xffe2b0), h * h * 0.6).multiplyScalar(0.3 + h * (2.2 + 0.5 * Math.sin(this.t * 40)));
    this.cannon.position.set(0, 1.02 - this.recoil * 0.12, -0.45 - this.recoil * 0.07);
    this.thrustMat.color.set(hexOf(this.color)).multiplyScalar(this.state === 'charge' ? 2.4 : 1.2);
    this.thrust.scale.set(1, 1, this.state === 'charge' ? 1.8 + Math.random() * 0.5 : 0.8 + Math.random() * 0.3);
    this.updateHum(0.4 + (this.state === 'charge' ? 0.5 : this.state === 'windup' ? 0.25 : this.state === 'lob' ? 0.12 : 0), 0.45, 4, 34);
  }

  // ---- the lava-gob volley ----
  startLob() {
    this.state = 'lob';
    this.lobTimer = this.lobWindup;
    this.shots = 0;
    this.lobT = rnd(this.lobEvery[0], this.lobEvery[1]); // (counted from the start of this volley)
    // it plants with a vent of its hydraulics, and the cannon starts to rumble and boil
    esfx('hydraulic_hiss', this.pos, 0.8, 0.85);
    const g = Math.max(0.35, falloff(this.dist, 6, 45));
    sfx('lava_surge', { gain: 0.75 * g, rate: 1.25, cut: this.lobWindup + 0.1 }, 'charge_up', { gain: 0.6 * g, rate: 0.7 });
    this.pS.kick(-1.2);
  }

  muzzle(out) {
    this.group.updateMatrixWorld();
    return out.copy(MUZZLE).applyMatrix4(this.cannon.matrixWorld);
  }

  updateLob(dt, player) {
    const fx = this.world.fx;
    this.lobTimer -= dt;
    this.face(dt, 2.5);
    if (this.shots === 0) {
      // the telegraph: the cannon heats from dull red to white hot, molten motes drawn into its mouth,
      // slag spitting out of it, the hull shuddering
      this.heat = Math.max(this.heat, 1 - Math.max(0, this.lobTimer) / this.lobWindup);
      this.body.position.set((Math.random() - 0.5) * 0.04, 0, (Math.random() - 0.5) * 0.04);
      if (Math.random() < dt * 30) converge(fx, this.muzzle(_m), this.tint, { count: 2, radius: 1.1, time: 0.3, size: 0.06 });
      if (Math.random() < dt * 14 * this.heat) fx.ember(this.muzzle(_m), rnd(-1.2, 1.2), rnd(2, 4), rnd(-1.2, 1.2), this.tint, 0.6, 0.1);
      if (this.heat > 0.6 && Math.random() < dt * 18) fx.flash(this.muzzle(_m), this.tint, { size: 0.7, life: 0.08 }); // (reads from any angle)
      if (this.lobTimer > 0) return;
      this.body.position.set(0, 0, 0);
      this.aimVolley(player);
    }
    if (this.shots < this.gobs) {
      if (this.lobTimer <= 0) {
        this.fireGob(this.shots++);
        this.lobTimer = 0.14;
      }
    } else if (this.lobTimer <= 0) {
      this.state = 'stalk';
      this.timer = Math.max(this.timer, 1.0); // (no charge straight out of a volley)
      director.release(this);
    }
  }

  // Where the volley goes: a line of gobs across your path, centred a little ahead of where you're
  // heading. (The director pulls the first volley fired from off screen wide, as a warning.)
  aimVolley(player) {
    const from = this.muzzle(_m);
    const tf = this.flightFor(Math.hypot(player.pos.x - from.x, player.pos.z - from.z));
    const lead = _a.set(player.vel.x, 0, player.vel.z).multiplyScalar(tf * 0.4);
    if (lead.length() > 3) lead.setLength(3);
    this.aim = director.aim(this, from, _v.copy(player.pos).add(lead));
    this.aim.y = player.pos.y;
    this.aimFwd = new THREE.Vector3(this.aim.x - this.pos.x, 0, this.aim.z - this.pos.z).normalize();
    this.aimSide = new THREE.Vector3(this.aimFwd.z, 0, -this.aimFwd.x).multiplyScalar(Math.random() < 0.5 ? -1 : 1);
  }

  // seconds a gob spends in the air over `flat` metres (a higher, slower arc further out)
  flightFor(flat) {
    return THREE.MathUtils.clamp(0.75 + flat * 0.02, 0.85, 1.35);
  }

  fireGob(i) {
    const from = this.muzzle(new THREE.Vector3());
    // the first dead on, the others either side of it (with a little scatter)
    const across = i === 0 ? 0 : (i % 2 ? 1 : -1) * (2.2 + Math.random() * 0.5) * Math.ceil(i / 2);
    const t = _v.copy(this.aim).addScaledVector(this.aimSide, across).addScaledVector(this.aimFwd, rnd(-0.7, 0.7));
    const pl = this.game.player;
    t.y = floorBelow(this.world, _a.set(t.x, pl.pos.y + 1.2, t.z), 8) ?? pl.pos.y;
    lobGob(this.world, from, t, this.flightFor(Math.hypot(t.x - from.x, t.z - from.z)) + i * 0.05, this.tint);
    this.recoil = 1;
    this.heat = Math.max(0.55, this.heat - 0.15);
    this.pS.kick(-1.6);
    const fx = this.world.fx;
    fx.flash(from, this.tint, { size: 1.1, life: 0.12 });
    fx.sparks(from, _a.subVectors(t, from).setY(0).normalize().setY(1.6).normalize(), this.tint, { count: 10, speed: 9, spread: 0.5, life: 0.4, gravity: 12 });
    fx.puff(from, 0, 2.5, 0, _c.set(0x8a7a74), 0.4, 1.0, 0.7, 3);
    const g = Math.max(0.35, falloff(this.dist, 6, 50));
    sfx('mortar_launch', { gain: (i ? 0.45 : 0.75) * g, rate: 0.75 + i * 0.08 }, 'enemy_shot', { gain: 0.6 * g, rate: 0.5 });
  }

  // The hull's weight: it leans into its stalk and banks into turns, rears back on its thrusters through
  // the wind-up (anticipation), dips its prow for the charge, and rocks on the springs (hits, the slam).
  poseBody(dt) {
    const turn = Math.atan2(Math.sin(this.yaw - (this.lastYaw ?? this.yaw)), Math.cos(this.yaw - (this.lastYaw ?? this.yaw))) / Math.max(dt, 1e-3);
    this.lastYaw = this.yaw;
    let pitchT = 0, rollT = THREE.MathUtils.clamp(-turn * 0.08, -0.18, 0.18);
    if (this.state === 'stalk' && this.aggro && this.dist > 5.5) pitchT = 0.06 + Math.sin(this.t * 2.2) * 0.02;
    else if (this.state === 'lob') pitchT = -0.08; // it sits back on its thrusters, the cannon raised
    else if (this.state === 'windup') pitchT = -0.2 * Math.min(1, (this.windupTime - this.timer) / 0.35);
    else if (this.state === 'charge') pitchT = 0.16;
    else if (this.state === 'stunned') pitchT = 0.12;
    const p = this.pS.step(pitchT, dt), r = this.rS.step(rollT, dt);
    this.body.rotation.set(p, 0, r + this.wobble);
    // the servos whine as it hauls itself round
    if (Math.abs(turn) > 1.2 && this.state !== 'charge' && (this.servoT = (this.servoT ?? 0) - dt) <= 0) {
      this.servoT = 0.5;
      esfx('servo_heavy', this.pos, Math.min(1, Math.abs(turn) / 3), 0.6);
    }
  }

  // Charging over water: it skids on in a flat spin and ends up dazed, its weak point open.
  spinOut(v) {
    this.state = 'stunned';
    this.timer = this.stunTime * 0.8;
    this.knock.addScaledVector(this.dir, v * 0.5);
    this.spin = (Math.random() < 0.5 ? -1 : 1) * 13;
    this.rS.kick(this.spin > 0 ? -3 : 3);
    const p = _v.copy(this.pos).setY(this.floorY + 0.1);
    this.world.fx.splash?.(p, 14);
    const g = Math.max(0.3, falloff(this.dist, 6, 50));
    esfx('robot_pain_heavy', this.pos, 1, 0.75);
    sfx('slime_splat', { gain: 0.8 * g, rate: 0.7 }, 'land', { gain: 0.8 * g, rate: 0.6 });
  }

  // Shock water under it (world.wet): the hover field shorts and it drops dazed, sparking.
  onShock() {
    if (this.dead) return;
    const fx = this.world.fx;
    fx.sparks(_v.copy(this.pos).setY(this.floorY + 0.3), _a.set(0, 1, 0), 0xcfe8ff, { count: 20, speed: 8, spread: 1.4, life: 0.4, hot: 0.9 });
    if (this.state === 'stunned') return;
    this.state = 'stunned';
    this.timer = this.stunTime;
    this.lane.hide();
    director.release(this);
    esfx('robot_pain_heavy', this.pos, 1, 0.9);
  }

  slam() {
    this.state = 'stunned';
    this.pS.kick(-5); // the impact throws its prow up
    this.rS.kick((Math.random() < 0.5 ? -1 : 1) * 3);
    esfx('robot_pain_heavy', this.pos, 1, 0.65);
    this.timer = this.stunTime;
    const p = _v.copy(this.pos).addScaledVector(this.dir, 1.4);
    const fx = this.world.fx;
    fx.flash(p, 0xffe0b0, { size: 2, life: 0.15 });
    fx.ring(p, this.dir.clone().negate(), 0xffffff, { size: 0.5, end: 4, life: 0.35, thick: 0.1 });
    fx.sparks(p, _a.copy(this.dir).negate().setY(0.5), 0xffc070, { count: 30, speed: 12, spread: 1.2, life: 0.5 });
    fx.burst(p, 0xb8c0d0, { count: 14, speed: 3, life: 1, size: 0.7, gravity: -0.5, mode: 'puff' });
    const g = Math.max(0.3, falloff(this.dist, 6, 50));
    sfx('brute_slam', { gain: g }, 'boss_slam', { gain: 0.8 * g });
    const pl = this.game.player;
    pl.shake = Math.max(pl.shake, 0.5 * falloff(this.dist, 4, 30));
  }

  hitDamage(hit) {
    return hit?.object === this.weak && this.open > 0.5 ? 3 : 1;
  }

  onDamage(hit, dir, amount) {
    this.knock.addScaledVector(_a.copy(dir).setY(0), amount > 1 ? 2.5 : 0.8);
    // flinch along the shot: a hit on the prow rocks it back, one from the side tips it over
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const f = dir.x * s + dir.z * c, sd = dir.x * c - dir.z * s;
    this.pS.kick(f * (amount > 1 ? 4 : 2.2));
    this.rS.kick(-sd * (amount > 1 ? 4 : 2.2));
    esfx('robot_pain_heavy', this.pos, amount > 1 ? 1 : 0.6, 0.6 + Math.random() * 0.1);
    if (amount > 1) this.world.fx.ring(hit?.point ?? this.pos, null, 0xffffff, { size: 0.2, end: 1.5, life: 0.25, thick: 0.15 });
  }

  die(hit, dir) {
    this.dead = true;
    this.lane.hide();
    this.explode({ scale: 2, chunks: 12, vel: dir ? dir.clone().multiplyScalar(3) : null, shake: 0.55 });
  }

  cleanup() {
    this.lane.dispose();
  }
}
