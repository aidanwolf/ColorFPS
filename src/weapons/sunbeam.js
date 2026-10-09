// SUN BEAM (the yellow blaster): hold the trigger and a continuous ray of sunlight pours out, hitscan
// every frame. Whatever it rests on takes onHit(YELLOW, hit) ticks at the red blaster's rate (so every
// switch, barrier, enemy and boss reacts to it as to a stream of shots), plus an optional per-frame
//   entity.onBeam(dt, hit, color)  continuous light (receivers that charge up, things that heat). Return
//                                  'mirror' to reflect the beam (that entity then gets no onHit ticks).
// The beam reflects off mirror solids and off anything whose onHit answers 'mirror', up to MAX_BOUNCES
// times, drawing every leg, so a chain of angled mirrors can carry it round corners onto a button.
// Wrong-color surfaces glance it off a few times at most (IMMUNE_BOUNCES; panels and barriers, the way a
// red shot banks off them) and wrong-color creatures just scatter it.
// It heats while held: OVERHEAT s of continuous fire and it vents (steam, a hiss, glowing vents) and
// locks out for VENT_TIME s, until it has cooled to VENT_RESUME. Off the trigger it cools.
import * as THREE from 'three';
import { COLORS, YELLOW } from '../colors.js';
import { audio } from '../audio.js';
import { castRay, HitClock, TubePool, touch } from './rays.js';

export const OVERHEAT = 3; // s of continuous fire from cold to overheated
const COOL = 0.55; // heat lost per second off the trigger (cold again in under 2 s)
export const VENT_TIME = 1.6; // s locked out once overheated
const VENT_RESUME = 0.4; // the heat it must cool to before it fires again
const MAX_BOUNCES = 8;
const IMMUNE_BOUNCES = 3;
const RANGE = 250;
const HEX = COLORS[YELLOW].hex;
const GOLD = new THREE.Color(1.0, 0.62, 0.12);
const RED_HOT = new THREE.Color(1.0, 0.28, 0.06);
const CORE = new THREE.Color(1.0, 0.95, 0.78);
const STEAM = new THREE.Color(0xd8e0e8);
const HAZE = new THREE.Color(0x6a4a20);
const _dir = new THREE.Vector3(), _o = new THREE.Vector3(), _d = new THREE.Vector3(), _from = new THREE.Vector3();
const _end = new THREE.Vector3(), _p = new THREE.Vector3(), _r = new THREE.Vector3(), _m = new THREE.Vector3(), _c = new THREE.Color();
const rnd = (a, b) => a + Math.random() * (b - a);

audio.manifest?.then(() => audio.prefetch(['sphinx_beam', 'sun_hum', 'welder_vent', 'titan_steam', 'shoot_yellow']));

export class SunBeam {
  constructor(blaster) {
    this.blaster = blaster;
    this.game = blaster.game;
    const scene = this.game.scene;
    this.heat = 0;
    this.locked = false;
    this.lockT = 0;
    this.on = 0; // 0 → 1 as the beam ignites
    this.firing = false;
    this.clock = new HitClock();
    this.out = {};
    this.now = 0;
    this.ricT = 0;
    this.warnT = 0;
    this.mirrorsWas = new Set();
    this.mirrorsNow = new Set();
    // a wide soft haze round a tight bright beam with a white-hot core
    this.haze = new TubePool(scene, MAX_BOUNCES + 2, { additive: true, r0: 0.06, r1: 0.42, taper: 7, color: new THREE.Color(0.95, 0.45, 0.06).multiplyScalar(0.7), core: 0x000000, soft: 2, coreP: 40, freq: 0.5, speed: 14, noise: 0.7, wob: 0.18, alpha: 0.6 });
    this.core = new TubePool(scene, MAX_BOUNCES + 2, { additive: true, r0: 0.024, r1: 0.11, taper: 4, color: GOLD, core: CORE.clone().multiplyScalar(1.9), soft: 1.3, coreP: 9, freq: 0.9, speed: 30, noise: 0.55, wob: 0.12, alpha: 1 });
    this.light = this.game.world.addLight(0xffb040, 0, 9, 1.4);
    this.hum = null;
    this.buzz = null;
  }

  get ready() {
    return !this.locked;
  }

  update(dt, want) {
    this.now += dt;
    this.ricT -= dt;
    const firing = want && !this.locked;
    if (firing && !this.firing) this.start();
    this.firing = firing;
    if (firing) {
      this.heat = Math.min(1, this.heat + dt / OVERHEAT);
      this.on = Math.min(1, this.on + dt / 0.08);
      this.fireFrame(dt);
      if (this.heat >= 1) this.overheat();
    } else {
      this.on = 0;
      if (this.locked) {
        // venting: cools toward the resume level over the lockout
        this.lockT -= dt;
        this.heat = Math.max(0, this.heat - dt * ((1 - VENT_RESUME) / VENT_TIME));
        this.vent(dt);
        if (this.lockT <= 0 && this.heat <= VENT_RESUME + 1e-3) {
          this.locked = false;
          audio.tone({ type: 'triangle', f: 880, f2: 1320, dur: 0.09, gain: 0.06 });
          audio.tone({ type: 'sine', f: 1760, dur: 0.12, gain: 0.03, delay: 0.07 });
        }
      } else this.heat = Math.max(0, this.heat - dt * COOL);
      this.hide();
    }
    this.sound(dt);
    this.blaster.models[YELLOW].setHeat?.(this.heat, firing, this.locked);
  }

  start() {
    audio.sample('shoot_yellow', { gain: 0.45, rate: 0.85, vary: 0.04 });
    this.clock.clear();
  }

  hide() {
    if (this.haze.used || this.core.used) {
      this.haze.hide();
      this.core.hide();
    }
    this.light.intensity = 0;
    this.mirrorsWas.clear();
  }

  release() {
    this.firing = false;
    this.on = 0;
    this.hide();
    this.hum?.setGain(0);
    this.buzz?.setGain(0);
  }

  overheat() {
    this.locked = true;
    this.lockT = VENT_TIME;
    this.heat = 1;
    this.firing = false;
    this.hide();
    audio.sample(audio.sfxOr('welder_vent', 'titan_steam'), { gain: 0.75, rate: 1.1, vary: 0.04 });
    audio.tone({ type: 'sawtooth', f: 420, f2: 120, dur: 0.35, gain: 0.05 });
    const b = this.blaster;
    b.kick(-1.4);
    b.muzzleWorld(_m);
    const fx = this.game.world.fx;
    fx.flash(_m, 0xffa040, { size: 0.5, life: 0.15, k: 1.8 });
    fx.sparks(_m, this.game.camera.getWorldDirection(_dir), 0xffb050, { count: 8, speed: 3.5, spread: 1.2, life: 0.35, gravity: 8, size: 0.01 });
    this.game.hud.message?.('<b style="color:#ff8a2a">OVERHEATED</b>', 1.1);
  }

  // steam boiling off the emitter while it's locked out
  vent(dt) {
    if (Math.random() > dt * 18) return;
    const b = this.blaster;
    b.muzzleWorld(_m);
    const cam = this.game.camera, fx = this.game.world.fx;
    _r.set(rnd(-0.4, 0.4), rnd(0.6, 1.4), rnd(-0.4, 0.4)).add(this.game.player.vel);
    fx.puff(_m.addScaledVector(cam.up, 0.04), _r.x, _r.y, _r.z, STEAM, 0.22, rnd(0.6, 1), rnd(0.05, 0.09), 3.2);
    if (Math.random() < 0.3) fx.ember(_m, rnd(-1, 1), rnd(0.5, 2), rnd(-1, 1), 0xff8a2a, 0.4, 0.02);
  }

  sound(dt) {
    const on = this.firing ? this.on : 0;
    if (on > 0 || this.hum) {
      this.hum ??= audio.createLoop('sphinx_beam', { gain: 0 });
      this.buzz ??= audio.createLoop('sun_hum', { gain: 0 });
      this.hum.setGain(on * (0.32 + this.heat * 0.18));
      this.hum.setRate(0.92 + this.heat * 0.4);
      this.buzz.setGain(on * 0.2);
      this.buzz.setRate(1.5 + this.heat * 0.7);
    }
    // near overheating: a rising warning tick
    if (this.firing && this.heat > 0.72) {
      this.warnT -= dt;
      if (this.warnT <= 0) {
        this.warnT = 0.22 - (this.heat - 0.72) * 0.45;
        audio.tone({ type: 'square', f: 1300 + this.heat * 900, dur: 0.035, gain: 0.025 });
      }
    } else this.warnT = 0;
  }

  fireFrame(dt) {
    const game = this.game, world = game.world, fx = world.fx, cam = game.camera, b = this.blaster;
    b.bringUp();
    b.pose();
    cam.getWorldDirection(_dir);
    b.muzzleWorld(_m);
    // the gun strains against it: a steady push back with a shudder that grows with the heat
    const omega = b.models[b.shown].spring.omega;
    b.recoilVel += omega * dt * (3 + (Math.random() - 0.5) * (14 + this.heat * 30));
    b.flash = Math.max(b.flash, 2.5 + Math.random() * 1.5);
    // the beam's look this frame: gold going orange-red as it heats, flickering, steadier once lit
    const flick = 0.85 + Math.random() * 0.3;
    _c.copy(GOLD).lerp(RED_HOT, Math.max(0, this.heat - 0.45) * 1.2).multiplyScalar(1.6 * flick);
    this.core.all('uColor', _c);
    this.core.all('uWob', 0.1 + this.heat * 0.12);
    const ignite = this.on * this.on;
    this.haze.begin();
    this.core.begin();
    this.mirrorsNow.clear();
    let immune = 0, phase = 0, finalHit = null, finalKind = 'none';
    _o.copy(cam.position);
    _d.copy(_dir);
    _from.copy(_m);
    for (let depth = 0; ; depth++) {
      const hit = castRay(world, _o, _d, RANGE);
      _end.copy(hit ? hit.point : _r.copy(_o).addScaledVector(_d, RANGE));
      const dim = immune ? 0.7 : 1;
      const u1 = this.core.seg(_from, _end, phase, this.now);
      if (u1) {
        u1.uAlpha.value = ignite * dim;
        u1.uR1.value = 0.11 * (0.7 + 0.3 * ignite);
      }
      const u2 = this.haze.seg(_from, _end, phase, this.now);
      if (u2) u2.uAlpha.value = 0.6 * ignite * dim * flick;
      phase += _from.distanceTo(_end);
      if (!hit) break;
      const n = hit.normal;
      hit.dir = _d.clone();
      hit.kind = 'beam';
      const e = hit.entity;
      let res;
      if (e?.onBeam?.(dt, hit, YELLOW) === 'mirror') res = 'mirror';
      else res = this.land(hit, n);
      _p.copy(hit.point).addScaledVector(n, 0.02);
      if (res === 'mirror' && depth < MAX_BOUNCES) {
        this.mirrorsNow.add(e || hit.solid);
        if (!this.mirrorsWas.has(e || hit.solid)) {
          audio.mirrorHit();
          fx.impact(_p, n, HEX, 'mirror', _d);
        }
        fx.flash(_p, HEX, { size: 0.3 + Math.random() * 0.12, life: 0.05, k: 1.8, hot: 0.7 });
        this.reflect(n, hit.point);
        continue;
      }
      // a wrong-color panel or barrier glances it off (a few times at most); creatures scatter it
      if (res === 'immune' && hit.solid && immune < IMMUNE_BOUNCES && depth < MAX_BOUNCES) {
        immune++;
        this.scatter(_p, n, dt, e);
        this.reflect(n, hit.point);
        continue;
      }
      finalHit = hit;
      finalKind = res;
      break;
    }
    this.haze.end();
    this.core.end();
    const was = this.mirrorsWas;
    this.mirrorsWas = this.mirrorsNow;
    this.mirrorsNow = was;
    this.clock.prune(this.now);
    // the emitter: a hot point of light with a crackle of sparks
    fx.flash(_m, HEX, { size: 0.1 + Math.random() * 0.05, life: 0.04, k: 2, hot: 0.7 });
    if (Math.random() < dt * 14) fx.sparks(_m, _dir, 0xffd070, { count: 2, speed: 6, spread: 0.5, life: 0.12, size: 0.006, gravity: 0, drag: 4, inherit: game.player.vel });
    if (finalHit) this.impact(finalHit, finalKind, dt, flick);
    else this.light.intensity = 0;
  }

  reflect(n, at) {
    _d.addScaledVector(n, -2 * _d.dot(n)).normalize();
    _o.copy(at).addScaledVector(n, 0.02);
    _from.copy(at);
  }

  // onHit ticks on what the beam touches, with the blaster's hit feedback
  land(hit, n) {
    const T = touch(hit, YELLOW, this.clock, this.now, this.out);
    if (!T.ticked) return T.result;
    const hud = this.game.hud;
    if (T.result === 'hit' || T.result === 'kill') {
      hud.hitmarker(false, hit.crit);
      if (!T.quiet) audio.hit();
    } else if (T.result === 'immune') {
      hud.hitmarker(true);
      if (this.ricT <= 0) {
        this.ricT = 0.4;
        audio.ricochet();
      }
    } else if (T.result === 'shield' || T.result === 'glass') {
      if (this.ricT <= 0) {
        this.ricT = 0.3;
        audio.glassHit();
      }
      if (T.result === 'shield') this.game.world.fx.impact(_p.copy(hit.point).addScaledVector(n, 0.03), n, 0x9bf6ff, 'shield', hit.dir);
    }
    return T.result;
  }

  // light splashing off a wrong-color surface
  scatter(p, n, dt, e) {
    const fx = this.game.world.fx;
    const tint = typeof e?.color === 'number' ? COLORS[e.color]?.hex ?? HEX : HEX;
    fx.flash(p, tint, { size: 0.35, life: 0.05, k: 1.6, hot: 0.5 });
    if (Math.random() < dt * 25) fx.sparks(p, n, HEX, { count: 3, speed: 8, spread: 1, life: 0.25 });
  }

  // where the beam finally lands: a white-hot spot, a scorch glow on the surface, sparks, embers and a
  // shimmer of heat rising off it, lit by a flickering light
  impact(hit, kind, dt, flick) {
    const fx = this.game.world.fx;
    const n = hit.normal;
    const p = _p.copy(hit.point).addScaledVector(n, 0.03);
    const solidSurface = kind === 'world' || kind === 'glass' || kind === 'immune';
    fx.flash(p, HEX, { size: (0.3 + Math.random() * 0.18) * (kind === 'hit' || kind === 'kill' ? 1.3 : 1), life: 0.05, k: 2.2, hot: 0.75 });
    if (solidSurface) fx.flash(p, 0xff9a30, { size: 0.42 + Math.random() * 0.1, life: 0.09, n, k: 1.3, hot: 0.25 });
    _r.copy(hit.dir).addScaledVector(n, -2 * hit.dir.dot(n));
    if (Math.random() < dt * (kind === 'immune' ? 40 : 26)) fx.sparks(p, _r.add(n).normalize(), 0xffc860, { count: kind === 'immune' ? 5 : 3, speed: 10, spread: 0.9, life: 0.32 });
    if (Math.random() < dt * 9) fx.ember(p, rnd(-1.5, 1.5) + n.x * 2, rnd(1, 3) + n.y * 2, rnd(-1.5, 1.5) + n.z * 2, 0xffa040, rnd(0.4, 0.8), rnd(0.02, 0.035));
    if (solidSurface && Math.random() < dt * 10) {
      const i = fx.puff(p, n.x * 0.4 + rnd(-0.2, 0.2), 0.7 + n.y * 0.3, n.z * 0.4 + rnd(-0.2, 0.2), HAZE, 0.35, rnd(0.6, 1), rnd(0.08, 0.14), 3.5);
      fx.grav[i] = -1.2;
    }
    if (kind === 'immune' && !hit.solid) this.scatter(p, n, dt, hit.entity);
    const L = this.light;
    L.position.copy(hit.point).addScaledVector(n, 0.4);
    L.intensity = (14 + this.heat * 8) * flick * this.on;
  }
}
