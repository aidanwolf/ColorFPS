// First-person controller: AABB collision against world solids, coyote time + jump buffering,
// crouching (for vents), step-up, moving-platform riding, hazards and fall recovery.
import * as THREE from 'three';
import { audio } from './audio.js';

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
// Enemy fire and boss attacks kill outright; spikes and falls only chip health.
const LETHAL = new Set(['orb', 'sweep', 'ring', 'charge']);
const CROUCH_SPEED = 3.6;
const GROUND_ACCEL = 70;
const AIR_ACCEL = 22;
const STEP = 0.45;
const COYOTE = 0.12;
const BUFFER = 0.14;
const EPS = 0.001;

export class Player {
  constructor(game) {
    this.game = game;
    this.camera = game.camera;
    this.pos = new THREE.Vector3();
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
    this.dead = false;
    this.safePos = new THREE.Vector3();
    this.safeTimer = 0;
    this.bob = 0;
    this.landKick = 0;
    this.shake = 0;
    this.speed2d = 0;
    this.arenaBounds = null; // set by the Bonus Round SDK during a native round
    this.floorY = null;
    this.sprinting = false;
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

  update(dt, input, settings) {
    const world = this.game.world;
    // ---- look ----
    const sens = DEG_PER_COUNT * settings.sens;
    this.yaw -= input.dx * sens;
    this.pitch -= input.dy * sens * (settings.invertY ? -1 : 1);
    this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch));

    // ---- ride moving platforms ----
    if (this.ground && this.ground.delta) this.pos.add(this.ground.delta);

    // ---- crouch ----
    const wantCrouch = input.down('KeyC') || input.down('TouchCrouch');
    if (wantCrouch && !this.crouching) {
      this.crouching = true;
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
    const accel = this.grounded ? GROUND_ACCEL : AIR_ACCEL;
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
    if (this.vel.y < -40) this.vel.y = -40;

    // ---- integrate with collision ----
    const wasGrounded = this.grounded;
    const fallSpeed = -this.vel.y;
    this.move(this.vel.x * dt, this.vel.y * dt, this.vel.z * dt);
    if (this.grounded && !wasGrounded) {
      if (fallSpeed > 6) {
        this.landKick = Math.min(0.25, fallSpeed * 0.012);
        audio.land(Math.min(2, fallSpeed / 10));
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
        if (s.hazard === 'acid') {
          this.fallRecover();
          return;
        }
        if (s.hazard === 'spike') {
          this.damage(s.damage ?? 30, 'spike');
          this.vel.y = 9;
          this.launched = true;
          this.grounded = false;
          this.ground = null;
          // knock sideways off the spikes if standing on them
          if (s.entity?.knockDir) {
            this.vel.x += s.entity.knockDir.x * 4;
            this.vel.z += s.entity.knockDir.z * 4;
          }
        }
      }
    }
    if (this.pos.y < -60) this.fallRecover();

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
    this.speed2d = Math.hypot(this.vel.x, this.vel.z);
    if (this.grounded) this.bob += dt * this.speed2d * 1.25;
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

  damage(amount, source) {
    if (this.dead || this.invuln > 0 || this.game.godMode || this.game.rulesPaused) return;
    if (LETHAL.has(source)) amount = this.health;
    this.deathCause = source;
    this.health -= amount;
    this.invuln = source === 'spike' ? 0.6 : 0.25;
    this.shake = Math.min(1, this.shake + amount / 40);
    audio.hurt();
    this.game.hud.hurt(amount);
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      this.game.onPlayerDeath();
    }
  }

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  fallRecover() {
    this.pos.copy(this.safePos);
    this.vel.set(0, 0, 0);
    this.ground = null;
    this.game.hud.flash('#000');
    this.invuln = 0;
    this.damage(15, 'fall');
    this.invuln = 1;
  }
}
