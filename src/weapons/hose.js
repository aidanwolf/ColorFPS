// WATER CANNON (the blue blaster): hold the trigger for a pressurized stream of water on a slight arc
// (dense out to ~RANGE m, breaking up into spray beyond, still landing to REACH). Whatever it soaks takes
// onHit(BLUE, hit) ticks at the red blaster's rate, plus an optional per-frame
//   entity.onWater(dt, hit)   fill a tank, wash something off, short a fuse box (hit.point / hit.normal)
// Where it lands on a floor it pools (world.wet: a puddle that grows while you spray it, merges and
// dries over ~25 s; slick underfoot for enemies and the player); on walls it just splashes; on lava it
// steams. Spraying an electrical component registered with world.wet.addShocker shorts it. The stream
// glances off mirrors (twice at most); under water it's a straight jet trailing bubbles.
import * as THREE from 'three';
import { BLUE } from '../colors.js';
import { audio } from '../audio.js';
import { castRay, HitClock, TubePool, touch, solidsIn, SynthLoop, noiseVoice } from './rays.js';

const SPEED = 30; // m/s out of the nozzle
const GRAVITY = 6; // the stream's arc (it drops ~1 m over RANGE)
export const RANGE = 18; // m: the stream's dense, effective length
const REACH = 36; // m: as far as its spray still lands
const SEG_T = 0.05; // s of flight per traced segment
const MAX_SEGS = 28;
const MAX_MIRRORS = 2;
const WATER = new THREE.Color(0x9fdcff);
const FOAM = new THREE.Color(0xe8f8ff);
const STEAM = new THREE.Color(0xc8d0d8);
const _dir = new THREE.Vector3(), _m = new THREE.Vector3(), _pos = new THREE.Vector3(), _vel = new THREE.Vector3(), _next = new THREE.Vector3();
const _seg = new THREE.Vector3(), _p = new THREE.Vector3(), _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const _min = new THREE.Vector3(), _max = new THREE.Vector3(), _off = new THREE.Vector3();
const rnd = (a, b) => a + Math.random() * (b - a);

audio.manifest?.then(() => audio.prefetch(['squid_jet', 'shoot_blue', 'lava_sizzle']));

export class WaterCannon {
  constructor(blaster) {
    this.blaster = blaster;
    this.game = blaster.game;
    this.now = 0;
    this.on = 0; // pressure, 0 → 1 as the stream reaches out
    this.firing = false;
    this.clock = new HitClock();
    this.out = {};
    this.pts = Array.from({ length: MAX_SEGS + 2 }, () => new THREE.Vector3());
    this.vels = Array.from({ length: MAX_SEGS + 2 }, () => new THREE.Vector3());
    this.solids = [];
    this.ricT = 0;
    // the jet: a glassy body round a bright streaming core, and a thin hot glint down its middle
    this.body = new TubePool(this.game.scene, MAX_SEGS + 2, { additive: false, r0: 0.03, r1: 0.16, taper: 8, color: new THREE.Color(0.22, 0.5, 0.86), core: new THREE.Color(0.78, 0.92, 1.0), soft: 0.8, coreP: 5, freq: 2.4, speed: 34, noise: 0.9, wob: 0.22, alpha: 0.85, fade0: RANGE * 0.8, fade1: RANGE * 1.45 });
    this.glint = new TubePool(this.game.scene, MAX_SEGS + 2, { additive: true, r0: 0.008, r1: 0.035, taper: 6, color: 0x12305a, core: 0x6ab8ff, soft: 1.6, coreP: 7, freq: 3.1, speed: 40, noise: 0.9, wob: 0.25, alpha: 0.8, fade0: RANGE * 0.7, fade1: RANGE * 1.2 });
    this.rush = new SynthLoop(noiseVoice('bandpass', 1400, 0.6));
    this.spatter = new SynthLoop(noiseVoice('highpass', 3200, 0.5));
  }

  update(dt, want) {
    this.now += dt;
    this.ricT -= dt;
    if (want && !this.firing) {
      audio.sample('squid_jet', { gain: 0.45, rate: 1.25, vary: 0.06 }) || audio.shoot(BLUE);
      this.clock.clear();
    }
    this.firing = want;
    if (want) {
      this.on = Math.min(1, this.on + dt / 0.22);
      this.fireFrame(dt);
    } else {
      this.on = 0;
      this.hide();
      this.rush.set(0, dt);
      this.spatter.set(0, dt);
    }
    this.blaster.models[BLUE].spray?.(want ? this.on : 0);
  }

  hide() {
    if (this.body.used || this.glint.used) {
      this.body.hide();
      this.glint.hide();
    }
  }

  release() {
    this.firing = false;
    this.on = 0;
    this.hide();
    this.rush.set(0);
    this.spatter.set(0);
  }

  inWater(p) {
    for (const w of this.game.world.waters || []) if (p.x > w.min.x && p.x < w.max.x && p.z > w.min.z && p.z < w.max.z && p.y > w.min.y && p.y < w.max.y) return true;
    return false;
  }

  fireFrame(dt) {
    const game = this.game, world = game.world, fx = world.fx, cam = game.camera, b = this.blaster;
    b.bringUp();
    b.pose();
    cam.getWorldDirection(_dir);
    b.muzzleWorld(_m);
    const omega = b.models[b.shown].spring.omega;
    b.recoilVel += omega * dt * (2.2 + (Math.random() - 0.5) * 10);
    b.flash = Math.max(b.flash, 1.2);
    // trace the arc from the eye (so it lands where you aim), as far as the pressure has reached
    const under = this.inWater(cam.position);
    const flight = (REACH / SPEED) * this.on;
    _pos.copy(cam.position);
    _vel.copy(_dir).multiplyScalar(SPEED);
    // (one box round the whole arc: each segment's ray only tests the solids in it)
    const T = flight, drop = under ? 0 : 0.5 * GRAVITY * T * T;
    _a.copy(_pos).addScaledVector(_vel, T);
    _min.copy(_pos).min(_a);
    _max.copy(_pos).max(_a);
    _min.y -= drop + 0.5;
    _min.addScalar(-0.5);
    _max.addScalar(0.5);
    const solids = solidsIn(world, _min, _max, this.solids);
    const pts = this.pts;
    pts[0].copy(_pos);
    this.vels[0].copy(_vel);
    let n = 0, t = 0, mirrors = 0, hit = null, dist = 0;
    while (t < flight && n < MAX_SEGS) {
      const h = Math.min(SEG_T, flight - t);
      const wet = under || this.inWater(_pos);
      _next.copy(_pos).addScaledVector(_vel, h);
      if (!wet) _next.y -= 0.5 * GRAVITY * h * h;
      _seg.subVectors(_next, _pos);
      const len = _seg.length();
      _seg.divideScalar(len);
      const box = solids.length < world.solids.length ? solids : undefined;
      const hh = castRay(world, _pos, _seg, len, { solids: mirrors ? undefined : box });
      if (hh) {
        dist += hh.t;
        pts[++n].copy(hh.point);
        this.vels[n].copy(_vel);
        if (hh.solid?.mirror && mirrors < MAX_MIRRORS) {
          // glance off the mirror and carry on
          mirrors++;
          const nn = hh.normal;
          this.impactDir = (this.impactDir || new THREE.Vector3()).copy(_vel).normalize();
          this.splash(hh.point, nn, dt, 0.5);
          _vel.addScaledVector(nn, -2 * _vel.dot(nn));
          _pos.copy(hh.point).addScaledVector(nn, 0.03);
          t += h * (hh.t / len);
          continue;
        }
        hit = hh;
        break;
      }
      dist += len;
      _pos.copy(_next);
      if (!wet) _vel.y -= GRAVITY * h;
      pts[++n].copy(_pos);
      this.vels[n].copy(_vel);
      t += h;
    }
    this.draw(n, under, dt);
    if (hit) this.land(hit, dt, dist, under, this.vels[n]);
    else this.spatter.set(0, dt);
    this.clock.prune(this.now);
    // the nozzle: a fizz of droplets
    if (Math.random() < dt * 30) {
      _v.copy(_dir).multiplyScalar(rnd(3, 7)).add(_a.randomDirection().multiplyScalar(1.4)).add(game.player.vel);
      const k = fx.spawn(0, _m, _v.x, _v.y, _v.z, FOAM, 0.9, rnd(0.12, 0.25), rnd(0.008, 0.016));
      fx.grav[k] = 9;
    }
    // the rush of it, brighter in pitch while it's hitting something close
    this.rush.set(0.16 * this.on, dt);
    this.rush.v?.filter?.frequency.setTargetAtTime(under ? 600 : 1300 + (hit ? 500 * Math.max(0, 1 - dist / 20) : 0), audio.ctx.currentTime, 0.1);
  }

  // The stream as drawn: it leaves the muzzle (not the eye) and merges into the true arc within a few
  // metres. Spray peels off along it, thicker past its dense range.
  draw(n, under, dt) {
    const fx = this.game.world.fx, pts = this.pts;
    _off.subVectors(_m, pts[0]);
    this.body.begin();
    this.glint.begin();
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const s0 = phase, s1 = phase + pts[i].distanceTo(pts[i + 1]);
      _a.copy(pts[i]).addScaledVector(_off, Math.max(0, 1 - s0 / 3.5) ** 2);
      _b.copy(pts[i + 1]).addScaledVector(_off, Math.max(0, 1 - s1 / 3.5) ** 2);
      const u = this.body.seg(_a, _b, phase, this.now);
      if (u) u.uAlpha.value = 0.85 * Math.min(1, this.on * 1.5);
      this.glint.seg(_a, _b, phase, this.now);
      // droplets and mist breaking off the stream
      const rate = s0 > RANGE * 0.6 ? 70 : 18;
      if (Math.random() < dt * rate) {
        _p.lerpVectors(_a, _b, Math.random());
        const v = this.vels[i + 1];
        if (under) fx.bubbles?.(_p, 1);
        else {
          const k = fx.spawn(0, _p, v.x * 0.6 + rnd(-1.5, 1.5), v.y * 0.6 + rnd(-1, 1.5), v.z * 0.6 + rnd(-1.5, 1.5), WATER, 0.8, rnd(0.2, 0.45), rnd(0.012, 0.025) * (1 + s0 / 12));
          fx.grav[k] = 9;
        }
      }
      phase = s1;
    }
    this.body.end();
    this.glint.end();
  }

  land(hit, dt, dist, under, vel) {
    const game = this.game, world = game.world, n = hit.normal;
    this.impactDir = (this.impactDir || new THREE.Vector3()).copy(vel).normalize();
    hit.dir = this.impactDir.clone();
    hit.kind = 'water';
    const e = hit.entity;
    e?.onWater?.(dt, hit);
    const T = touch(hit, BLUE, this.clock, this.now, this.out);
    if (T.ticked) {
      if (T.result === 'hit' || T.result === 'kill') {
        game.hud.hitmarker(false, hit.crit);
        if (!T.quiet) audio.hit();
      } else if (T.result === 'immune') {
        game.hud.hitmarker(true);
        if (this.ricT <= 0) {
          this.ricT = 0.45;
          audio.immune();
        }
      } else if (T.result === 'shield' || T.result === 'glass') {
        if (this.ricT <= 0) {
          this.ricT = 0.3;
          audio.glassHit();
        }
      }
    }
    // the floor pools; lava steams; everything splashes
    const wetSys = world.wet;
    const lava = hit.solid?.hazard === 'acid' || hit.solid?.kind === 'acid';
    if (lava) this.steam(hit.point, n, dt);
    else if (!under && hit.solid && !e && !hit.solid.delta && !hit.solid.glass && n.y > 0.6 && dist < REACH) wetSys.addWater(hit.point, n, dt * (dist < RANGE ? 1 : 0.4));
    if (!under) wetSys.sprayed(hit.point, dt);
    this.splash(hit.point, n, dt, dist < RANGE ? 1 : 0.5, under);
    this.spatter.set((under ? 0.04 : 0.1) * this.on * Math.max(0.25, 1 - dist / 30), dt);
  }

  // where it lands: a fan of droplets thrown back off the surface, a foamy ring, mist
  splash(p, n, dt, k = 1, under = false) {
    const fx = this.game.world.fx;
    _p.copy(p).addScaledVector(n, 0.04);
    if (under) {
      if (Math.random() < dt * 25) fx.bubbles?.(_p, 2);
      return;
    }
    const r = _v.copy(this.impactDir || n).normalize();
    r.addScaledVector(n, -2 * r.dot(n)).add(n).normalize();
    for (let i = 0, c = Math.floor(dt * 160 * k + Math.random()); i < c; i++) {
      _a.copy(r).multiplyScalar(rnd(2, 6)).add(_b.randomDirection().multiplyScalar(rnd(1, 3)));
      const j = fx.spawn(0, _p, _a.x, _a.y, _a.z, Math.random() < 0.5 ? FOAM : WATER, 0.9, rnd(0.25, 0.5), rnd(0.012, 0.028));
      fx.grav[j] = 12;
    }
    if (Math.random() < dt * 9 * k) fx.ring(_p, n, 0xcfeeff, { size: 0.1, end: rnd(0.5, 0.9), life: 0.35, thick: 0.12, k: 0.9 });
    if (Math.random() < dt * 6 * k) fx.puff(_p, n.x * 0.6, n.y * 0.6 + 0.3, n.z * 0.6, FOAM, 0.16, rnd(0.4, 0.7), rnd(0.12, 0.2), 2.6);
    if (Math.random() < dt * 20 * k) fx.flash(_p, 0xbfe8ff, { size: rnd(0.15, 0.3), life: 0.06, k: 1.1, hot: 0.6 });
  }

  steam(p, n, dt) {
    const fx = this.game.world.fx;
    if (Math.random() < dt * 22) {
      const i = fx.puff(_p.copy(p).addScaledVector(n, 0.1), rnd(-0.4, 0.4), rnd(1.2, 2.2), rnd(-0.4, 0.4), STEAM, 0.3, rnd(0.8, 1.4), rnd(0.2, 0.35), 3.5);
      fx.grav[i] = -1.5;
    }
    if (Math.random() < dt * 1.5) audio.sample('lava_sizzle', { gain: 0.25, rate: 1.4, vary: 0.2 });
  }
}
