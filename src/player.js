// First-person controller: AABB collision against world solids, coyote time + jump buffering,
// crouching (for vents), step-up, moving-platform riding, hazards and fall recovery.
import * as THREE from 'three';
import { audio } from './audio.js';
import { ARMOR_IGNORES, ARMOR_COLOR, ShieldFx } from './entities/armor.js';

const HALF_W = 0.35;
const STAND_H = 1.75;
const CROUCH_H = 0.95;
const EYE_DROP = 0.14;
const GRAVITY = 24;
const JUMP_V = 8.6;
const RUN_SPEED = 7.6;
const SPRINT_SPEED = 10.5;
// Quake/Half-Life mouse feel: m_yaw = m_pitch = 0.022 degrees per mouse count, times sensitivity.
const DEG_PER_COUNT = 0.022 * (Math.PI / 180);
const CROUCH_SPEED = 3.6;
const GROUND_ACCEL = 70;
const AIR_ACCEL = 22;
const STEP = 0.45;
const HARD_FALL = 17; // m/s landing speed: a heavy, shaking landing (~6 m drop)
const LETHAL_FALL = 29.5; // m/s: fatal (~18 m drop)
const VOID_DROP = 30;
const SWIM_SPEED = 4.4;
export const AIR_MAX = 14; // seconds of breath
const _down = new THREE.Vector3(0, -1, 0);
const _swimF = new THREE.Vector3(), _swimT = new THREE.Vector3(); // m below the last ground: you've fallen off the world
const COYOTE = 0.12;
const BUFFER = 0.14;
const EPS = 0.001;

export class Player {
  constructor(game) {
    this.game = game;
    this.camera = game.camera;
    this.pos = new THREE.Vector3();
    this.air = AIR_MAX;
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.height = STAND_H;
    this.eye = STAND_H - EYE_DROP;
    this.crouching = false;
    this.grounded = false;
    this.ground = null;
    this.coyote = 0;
    this.buffer = 0;
    this.maxHealth = 100;
    this.health = 100;
    this.invuln = 0;
    this.armor = 0; // one-hit shields from armor pickups (entities/armor.js)
    this.dead = false;
    this.safePos = new THREE.Vector3();
    this.carry = new THREE.Vector3(); // velocity inherited from a moving platform
    this.safeTimer = 0;
    this.bob = 0;
    this.landKick = 0;
    this.shake = 0;
    this.speed2d = 0;
    this.arenaBounds = null; // set by the Bonus Round SDK during a native round
    this.floorY = null;
    this.sprinting = false;
    this.stride = 0;
    this._min = new THREE.Vector3();
    this._max = new THREE.Vector3();
  }

  spawn(p, yaw = 0) {
    this.pos.copy(p);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.safePos.copy(p);
    this.crouching = false;
    this.height = STAND_H;
    this.dead = false;
    this.ground = null;
    this.carry.set(0, 0, 0);
    this.air = AIR_MAX;
    if (this.armor) this.setArmor(0); // a respawn (or any reset) starts unarmored
  }

  bounds(h = this.height) {
    this._min.set(this.pos.x - HALF_W, this.pos.y, this.pos.z - HALF_W);
    this._max.set(this.pos.x + HALF_W, this.pos.y + h, this.pos.z + HALF_W);
    return { min: this._min, max: this._max };
  }

  get eyePos() {
    return new THREE.Vector3(this.pos.x, this.pos.y + this.eye, this.pos.z);
  }

  forward(out = new THREE.Vector3()) {
    return out.set(0, 0, -1).applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
  }

  waterAt(world) {
    const p = this.pos, cy = p.y + this.height * 0.5;
    for (const w of world.waters || []) {
      if (p.x > w.min.x && p.x < w.max.x && p.z > w.min.z && p.z < w.max.z && cy > w.min.y && cy < w.max.y) return w;
    }
    return null;
  }

  swim(dt, input, water) {
    if (this.crouching && this.fits(this.pos.x, this.pos.y, this.pos.z, STAND_H)) {
      this.crouching = false;
      this.height = STAND_H;
    }
    const fw = this.forward(_swimF);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    let f = (input.down('KeyW') || input.down('ArrowUp') ? 1 : 0) - (input.down('KeyS') || input.down('ArrowDown') ? 1 : 0);
    let r = (input.down('KeyD') || input.down('ArrowRight') ? 1 : 0) - (input.down('KeyA') || input.down('ArrowLeft') ? 1 : 0);
    if (input.stick) {
      f += input.stick.f;
      r += input.stick.r;
    }
    const up = input.down('Space') ? 1 : 0;
    const down = input.down('KeyC') || input.down('ControlLeft') || input.down('ControlRight') || input.down('TouchCrouch') ? 1 : 0;
    const speed = SWIM_SPEED * (input.down('ShiftLeft') || input.down('ShiftRight') ? 1.45 : 1);
    const t = _swimT.set(fw.x * f + rx * r, fw.y * f, fw.z * f + rz * r);
    if (t.lengthSq() > 1) t.normalize();
    t.multiplyScalar(speed);
    t.y += (up - down) * SWIM_SPEED * 0.8;
    const eyeOut = this.pos.y + this.eye - water.max.y; // > 0: head above the surface
    if (!up && !down && Math.abs(f) + Math.abs(r) < 0.01) t.y = -0.6; // idle: drift slowly down
    // float at the surface: you can't swim up out of the water, only leap out with Space at the edge
    if (eyeOut > -0.15 && t.y > 0) t.y = Math.min(t.y, (0.25 - eyeOut) * 4);
    this.vel.lerp(t, Math.min(1, dt * 3.2)); // water drag
    if (up && eyeOut > -0.3 && input.hit('Space')) {
      this.vel.y = JUMP_V * 0.85; // climb/leap out over a ledge
      audio.jump();
    }
    if (water.current) this.vel.addScaledVector(water.current, Math.min(1, dt * 2.5));
    this.sprinting = false;
    this.launched = false;
    this.fallTop = this.pos.y; // no fall damage carried through water
  }

  updateAir(dt) {
    if (this.headUnder) {
      this.air = Math.max(0, this.air - dt);
      this.bubbleT = (this.bubbleT || 0) - dt;
      if (this.bubbleT <= 0) {
        this.bubbleT = 0.5 + Math.random() * 0.6;
        this.game.world.fx.bubbles?.(_swimT.copy(this.pos).setY(this.pos.y + this.eye - 0.1), 3);
      }
      if (this.air <= 0 && !this.game.rulesPaused) this.damage(1, 'drown');
    } else {
      this.air = Math.min(AIR_MAX, this.air + dt * 5);
    }
  }

  update(dt, input, settings) {
    const world = this.game.world;
    // ---- look ----
    const sens = DEG_PER_COUNT * settings.sens;
    this.yaw -= input.dx * sens;
    this.pitch -= input.dy * sens * (settings.invertY ? -1 : 1);
    this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch));

    // ---- ride moving platforms ----
    // While standing on one, its motion carries you; jump or step off and you keep its horizontal velocity
    // until you land (as if you were moving with it), so hopping on a moving platform keeps you over it.
    const rode = !!this.ground?.delta;
    if (rode) {
      this.pos.add(this.ground.delta);
      if (dt > 0) this.carry.set(this.ground.delta.x / dt, 0, this.ground.delta.z / dt);
    } else if (this.grounded) {
      this.carry.set(0, 0, 0);
    }

    // ---- crouch ----
    const wantCrouch = !this.swimming && (input.down('KeyC') || input.down('ControlLeft') || input.down('ControlRight') || input.down('TouchCrouch'));
    if (wantCrouch && !this.crouching) {
      this.crouching = true;
      audio.crouch();
      // crouching in mid-air tucks the legs up, which helps clear ledges
      if (!this.grounded && this.fits(this.pos.x, this.pos.y + STAND_H - CROUCH_H, this.pos.z, CROUCH_H)) this.pos.y += STAND_H - CROUCH_H;
    } else if (!wantCrouch && this.crouching) {
      // stand only if there is room; in the air, un-tuck the legs downward
      const dy = this.grounded ? 0 : -(STAND_H - CROUCH_H);
      if (this.fits(this.pos.x, this.pos.y + dy, this.pos.z, STAND_H)) {
        this.pos.y += dy;
        this.crouching = false;
      } else if (!this.grounded && this.fits(this.pos.x, this.pos.y, this.pos.z, STAND_H)) {
        this.crouching = false;
      }
    }
    this.height = this.crouching ? CROUCH_H : STAND_H;
    const targetEye = this.height - EYE_DROP;
    this.eye += (targetEye - this.eye) * Math.min(1, dt * 14);

    // ---- swimming ----
    // In water you swim where you look (Space up, C/Ctrl down), sink slowly when idle, float with your
    // head out at the surface, and a current can carry you. Air only runs out with your head under.
    const water = this.waterAt(world);
    const wasSwimming = this.swimming;
    this.swimming = !!water;
    this.headUnder = !!water && this.pos.y + this.eye < water.max.y;
    if (water && !wasSwimming && this.vel.y < -5) this.game.world.fx.splash?.(this.pos.clone().setY(water.max.y), -this.vel.y);
    if (water) this.swim(dt, input, water);
    else {
    // ---- horizontal movement ----
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    let mx = 0, mz = 0;
    let f = (input.down('KeyW') || input.down('ArrowUp') ? 1 : 0) - (input.down('KeyS') || input.down('ArrowDown') ? 1 : 0);
    let r = (input.down('KeyD') || input.down('ArrowRight') ? 1 : 0) - (input.down('KeyA') || input.down('ArrowLeft') ? 1 : 0);
    // the touch stick is analog: a partial push walks slower
    if (input.stick) {
      f += input.stick.f;
      r += input.stick.r;
    }
    mx = fx * f + rx * r;
    mz = fz * f + rz * r;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) {
      mx /= ml;
      mz /= ml;
    }
    // Shift sprints (forward-ish only); a fully pushed touch stick sprints too
    const stickFull = input.stick && Math.hypot(input.stick.f, input.stick.r) > 0.97;
    this.sprinting = !this.crouching && f > 0 && (input.down('ShiftLeft') || input.down('ShiftRight') || stickFull);
    const speed = this.crouching && this.grounded ? CROUCH_SPEED : this.sprinting ? SPRINT_SPEED : RUN_SPEED;
    const tx = mx * speed, tz = mz * speed;
    // (after a jump pad, steering is weaker so holding a key can't cancel the pad's throw)
    const accel = this.grounded ? GROUND_ACCEL : AIR_ACCEL * (this.launched ? 0.3 : 1);
    const dvx = tx - this.vel.x, dvz = tz - this.vel.z;
    const dvl = Math.hypot(dvx, dvz);
    // in the air, don't brake momentum from jump pads unless the player steers
    if (dvl > 0 && (this.grounded || ml > 0)) {
      const step = Math.min(dvl, accel * dt);
      this.vel.x += (dvx / dvl) * step;
      this.vel.z += (dvz / dvl) * step;
    }

    // ---- jumping ----
    this.coyote = this.grounded ? COYOTE : this.coyote - dt;
    this.buffer = input.hit('Space') ? BUFFER : this.buffer - dt;
    if (this.buffer > 0 && this.coyote > 0) {
      this.vel.y = JUMP_V;
      this.buffer = 0;
      this.coyote = 0;
      this.grounded = false;
      this.ground = null;
      audio.jump();
    }
    // variable jump height: releasing space early cuts the rise
    if (!input.down('Space') && this.vel.y > 3 && !this.launched) this.vel.y -= GRAVITY * 1.2 * dt;
    this.vel.y -= GRAVITY * dt;
    // updraft columns slow the fall through shielded spike drops
    for (const u of world.updrafts || []) if (u.contains(this.pos) && this.vel.y < -u.cap) this.vel.y = -u.cap;
    if (this.vel.y < -40) this.vel.y = -40;
    }
    this.updateAir(dt);

    // ---- integrate with collision ----
    const wasGrounded = this.grounded;
    const fallSpeed = -this.vel.y;
    // (the frame you leave a platform its delta already moved you, so the carry starts next frame)
    const cx = rode ? 0 : this.carry.x * dt, cz = rode ? 0 : this.carry.z * dt;
    this.move(this.vel.x * dt + cx, this.vel.y * dt, this.vel.z * dt + cz);
    if (this.grounded && !this.ground?.delta) this.carry.set(0, 0, 0);
    // fall tracking: the highest point since you last stood on something
    if (this.grounded) this.fallTop = this.pos.y;
    else this.fallTop = Math.max(this.fallTop ?? this.pos.y, this.pos.y);
    this.fallSpeed = this.grounded ? 0 : Math.max(0, -this.vel.y);
    if (this.grounded && !wasGrounded) {
      if (fallSpeed > LETHAL_FALL && !this.game.rulesPaused) {
        // fall damage: a long drop (about 18 m) is fatal
        audio.sample('impact_death', { gain: 1, vary: 0.05 }) || audio.land(2);
        this.damage(1, 'impact');
        if (this.dead) return;
      } else if (fallSpeed > HARD_FALL) {
        world.fx.landDust(this.pos, 2);
        this.landKick = 0.3;
        this.shake = Math.max(this.shake, 0.35 + (fallSpeed - HARD_FALL) * 0.04);
        audio.sample('land_hard', { gain: 0.9, vary: 0.08 }) || audio.land(2);
      } else if (fallSpeed > 6) {
        this.landKick = Math.min(0.25, fallSpeed * 0.012);
        audio.land(Math.min(2, fallSpeed / 10));
        world.fx.landDust(this.pos, Math.min(2, fallSpeed / 10));
      }
      this.launched = false;
    }
    if (this.arenaBounds) this.clampToArena();
    // during a Bonus Round the arena has no colliders of ours: hold the player at the floor the SDK teleported us to
    if (this.game.rulesPaused) {
      if (this.floorY !== null && this.pos.y < this.floorY) {
        this.pos.y = this.floorY;
        this.vel.y = 0;
        this.grounded = true;
      }
      this.finishUpdate(dt);
      return;
    }

    // ---- hazards ----
    const b = this.bounds();
    for (const s of world.solids) {
      if (!s.enabled || !s.hazard) continue;
      if (b.min.x < s.max.x + 0.04 && b.max.x > s.min.x - 0.04 && b.min.y < s.max.y + 0.06 && b.max.y > s.min.y - 0.04 && b.min.z < s.max.z + 0.04 && b.max.z > s.min.z - 0.04) {
        if (s.hazard === 'acid' && this.invuln <= 0) {
          audio.acid();
          this.damage(1, 'acid');
          return;
        }
        if (s.hazard === 'spike' && this.invuln <= 0) {
          audio.spike();
          this.damage(1, 'spike');
          return;
        }
      }
    }
    // off the edge of the world: falling this far below where you last stood never ends well
    // Falling off the world: if there's nothing below to hit you're faded back to the checkpoint (no
    // death); a long fall onto something still kills you when you land (see the landing above).
    if (!this.grounded && !this.game.voidT && (this.pos.y < -95 || this.fallTop - this.pos.y > VOID_DROP)) {
      const below = this.pos.y < -95 ? null : world.raycast(this.pos, _down, 120, { meshes: false });
      if (!below) this.game.fallOutOfWorld();
    }

    this.finishUpdate(dt);
  }

  finishUpdate(dt) {
    // ---- safe position tracking for fall recovery ----
    if (this.grounded && this.ground && this.ground.static && !this.ground.hazard) {
      this.safeTimer += dt;
      if (this.safeTimer > 0.35) this.safePos.copy(this.pos);
    } else {
      this.safeTimer = 0;
    }

    this.invuln = Math.max(0, this.invuln - dt);
    this.shieldFx?.update(dt);
    this.speed2d = Math.hypot(this.vel.x, this.vel.z);
    if (this.grounded) this.bob += dt * this.speed2d * 1.25;
    // footsteps: one per stride, louder and longer-strided when sprinting, quiet when crouched
    if (this.grounded && this.speed2d > 1.2) {
      this.stride += this.speed2d * dt;
      // a brisk running cadence (~5 steps a second at run speed); the remainder carries over, so the
      // rhythm stays even whatever the frame rate
      const len = this.sprinting ? 1.9 : this.crouching ? 1.1 : 1.55;
      if (this.stride > len) {
        this.stride = Math.min(this.stride - len, len);
        if (!this.crouching) audio.footstep(this.ground, this.pos, this.sprinting);
      }
    }
    this.landKick = Math.max(0, this.landKick - dt * 1.4);
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this.updateCamera();
  }

  updateCamera() {
    const bobY = this.grounded ? Math.abs(Math.sin(this.bob * 1.0)) * 0.05 * Math.min(1, this.speed2d / RUN_SPEED) : 0;
    const sh = this.shake * this.shake;
    this.camera.position.set(
      this.pos.x + (Math.random() - 0.5) * sh * 0.4,
      this.pos.y + this.eye + bobY - this.landKick * 0.6 + (Math.random() - 0.5) * sh * 0.4,
      this.pos.z + (Math.random() - 0.5) * sh * 0.4,
    );
    this.camera.rotation.set(this.pitch - this.landKick * 0.15, this.yaw, 0, 'YXZ');
  }

  fits(x, y, z, h) {
    const min = new THREE.Vector3(x - HALF_W, y, z - HALF_W);
    const max = new THREE.Vector3(x + HALF_W, y + h, z + HALF_W);
    for (const s of this.game.world.solids) {
      if (!s.enabled || s.noCollide) continue;
      if (min.x < s.max.x && max.x > s.min.x && min.y < s.max.y && max.y > s.min.y && min.z < s.max.z && max.z > s.min.z) return false;
    }
    return true;
  }

  move(dx, dy, dz) {
    const len = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
    const steps = Math.max(1, Math.ceil(len / 0.25));
    this.grounded = false;
    let ground = null;
    for (let i = 0; i < steps; i++) {
      this.moveAxis('x', dx / steps);
      this.moveAxis('z', dz / steps);
      const g = this.moveAxis('y', dy / steps);
      if (g) ground = g;
    }
    // ground probe: stay grounded when walking down gentle steps / standing still
    if (!ground && this.vel.y <= 0) {
      const probe = this.probeGround(0.06);
      if (probe) ground = probe;
    }
    if (ground) {
      this.grounded = true;
      this.ground = ground;
    } else {
      this.ground = null;
    }
  }

  probeGround(dist) {
    const b = this.bounds();
    for (const s of this.game.world.solids) {
      if (!s.enabled || s.noCollide) continue;
      if (b.min.x < s.max.x && b.max.x > s.min.x && b.min.z < s.max.z && b.max.z > s.min.z) {
        if (s.max.y <= this.pos.y + EPS * 2 && s.max.y >= this.pos.y - dist) {
          this.pos.y = s.max.y;
          return s;
        }
      }
    }
    return null;
  }

  // Move along one axis and resolve overlaps. Returns the solid landed on (y axis only).
  moveAxis(axis, d) {
    if (d === 0) return null;
    this.pos[axis] += d;
    const solids = this.game.world.solids;
    let landed = null;
    for (const s of solids) {
      if (!s.enabled || s.noCollide) continue;
      const b = this.bounds();
      if (!(b.min.x < s.max.x && b.max.x > s.min.x && b.min.y < s.max.y && b.max.y > s.min.y && b.min.z < s.max.z && b.max.z > s.min.z)) continue;
      if (axis === 'y') {
        if (d < 0) {
          this.pos.y = s.max.y;
          this.vel.y = 0;
          landed = s;
        } else {
          this.pos.y = s.min.y - this.height - EPS;
          if (this.vel.y > 0) this.vel.y = 0;
        }
      } else {
        // step up onto low ledges
        const rise = s.max.y - this.pos.y;
        if (rise > 0 && rise <= STEP && this.vel.y <= 0.5 && this.fits(this.pos.x, s.max.y + EPS, this.pos.z, this.height)) {
          this.pos.y = s.max.y + EPS;
          continue;
        }
        if (d > 0) this.pos[axis] = s.min[axis] - HALF_W - EPS;
        else this.pos[axis] = s.max[axis] + HALF_W + EPS;
        this.vel[axis] = 0;
      }
    }
    return landed;
  }

  // Bonus Round native mode: keep the player inside the arena circle and out of its obstacles.
  clampToArena() {
    const b = this.arenaBounds;
    const dx = this.pos.x - b.center.x, dz = this.pos.z - b.center.z;
    const d = Math.hypot(dx, dz);
    if (d > b.radius) {
      this.pos.x = b.center.x + (dx / d) * b.radius;
      this.pos.z = b.center.z + (dz / d) * b.radius;
    }
    for (const o of b.obstacles || []) {
      const ox = this.pos.x - o.x, oz = this.pos.z - o.z;
      const od = Math.hypot(ox, oz);
      const r = o.r + HALF_W;
      if (od < r && od > 1e-4) {
        this.pos.x = o.x + (ox / od) * r;
        this.pos.z = o.z + (oz / od) * r;
      }
    }
    if (this.pos.y < b.center.y) {
      this.pos.y = b.center.y;
      this.vel.y = 0;
      this.grounded = true;
    }
  }

  // Called by the Bonus Round SDK at the start and end of a native round.
  teleport(v) {
    this.pos.copy(v);
    this.vel.set(0, 0, 0);
    this.ground = null;
    this.floorY = v.y;
    this.updateCamera();
  }

  launch(vy, push) {
    this.vel.y = vy;
    if (push) {
      this.vel.x = push.x;
      this.vel.z = push.z;
    }
    this.launched = true;
    this.grounded = false;
    this.ground = null;
    this.coyote = 0;
  }

  // Every hit is fatal: shots, boss attacks, spikes, acid and falls all send you back to the last checkpoint.
  // Armor pickups: the shield takes the next enemy hit instead of you (hazards still kill).
  giveArmor() {
    this.setArmor(1);
    this.game.hud.armorGain?.();
  }

  setArmor(n) {
    this.armor = n;
    this.game.hud.setArmor?.(n);
    if (n || this.shieldFx) (this.shieldFx ??= new ShieldFx(this.game.scene)).set(n > 0);
  }

  damage(amount, source) {
    if (this.dead || this.invuln > 0 || this.game.godMode || this.game.rulesPaused) return;
    if (this.armor > 0 && !ARMOR_IGNORES.has(source)) {
      this.setArmor(this.armor - 1);
      this.shieldFx?.shatter(this.game.camera);
      this.invuln = 1.2; // a moment of grace to get out of the line of fire
      this.shake = Math.max(this.shake || 0, 0.45);
      this.game.hud.armorBreak?.();
      audio.sample(audio.sfxOr('armor_break', 'shield_break'), { gain: 1.2 });
      audio.sample('shatter', { gain: 0.8, rate: 0.9 });
      // shards of the shield burst out round you, in view (just in front of the eyes) and all about
      const cam = this.game.camera, fwd = cam.getWorldDirection(new THREE.Vector3());
      const front = cam.position.clone().addScaledVector(fwd, 1.8);
      this.game.world.fx.burst(front, ARMOR_COLOR, { count: 26, speed: 6, life: 0.5, size: 0.05, gravity: 3 });
      this.game.world.fx.burst(this.pos.clone().setY(this.pos.y + 1.1), ARMOR_COLOR, { count: 90, speed: 10, life: 0.9, size: 0.3, gravity: 4 });
      return;
    }
    this.deathCause = source;
    this.health = 0;
    this.dead = true;
    this.vel.set(0, 0, 0);
    audio.hurt();
    this.game.hud.hurt(40);
    this.game.onPlayerDeath();
  }

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

}
