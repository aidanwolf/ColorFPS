// GLOB LAUNCHER (the green blaster): lobs gooey green globs on an arc. A glob bursts on whatever it hits:
// a demolition blast that lands onHit(GREEN, hit) on everything within BLAST_R that the blast can see. Like
// every shot, a glob glances off mirrors and wrong-color surfaces (it bounces on, and bursts on the next
// thing), so the old bank-shot locks still take green.
//
// FIRING
//   Tap: a glob comes out the instant you press (one every GLOB_INTERVAL s; a press during the cooldown is
//     buffered, so fast clicking never eats a shot).
//   Hold: past HOLD_T the gun starts CHARGING the next glob (it swells and glows in the barrel, a rising
//     gloopy hum, a ring fills round the crosshair; CHARGE_T s to full). Release fires it: a partly charged
//     glob is bigger, faster and flatter; a FULL charge flies near straight (CHARGED.speed m/s, almost no
//     drop), bursts in the air after CHARGED.fuse s, and its blast is bigger (radius, power and the player
//     shove: a charged glob at your feet is a much higher rocket jump, and works from the ground too).
//     Switching color or dying drops the charge.
//   FLAK: every glob carries a proximity fuse against FLYING enemies (drones, swarmers, sub-drones, worker
//     drones: anything with `flier = true`) that its color can hurt (green body or green outer shield, or no
//     color). Passing within FLAK_R m (charged globs reach further) of one, it airbursts beside it: the
//     blast's BLAST_POWER hits kill a plain drone. Ground enemies never trip it (they take direct / splash
//     hits as before). Why every glob and not only charged ones: the drones jink as soon as you aim at
//     them and an arcing glob is the slowest shot in the game; the near-miss burst is what makes green the
//     anti-air gun. Charged globs reach further (and fly straight), so they're the long-range flak.
//
// blast(world, point, radius, color, opts) is exported for anything else that wants the same burst.
// What a blast does to each thing in range (with a clear line from the blast centre):
//   onHit(color, hit) with hit.kind = 'blast', hit.power = BLAST_POWER, hit.point (on the thing),
//     hit.normal, hit.dir (outward from the blast), hit.part / hit.object (the part the blast reached).
//     Things with hit points (a numeric `hp`: enemies, drones, bosses) take BLAST_POWER calls, about
//     what that many red shots do; everything else (switches, barriers, targets, movers) takes one call
//     and can read hit.power (a shot-pushed mover gives a blast that many kicks: shotmech.js).
//   The damage volume is a sphere, stretched upward by opts.column for a burst on a floor (the GOO COLUMN:
//     a ground impact reaches COLUMN_K × radius straight up, so a drone hovering low or an enemy on a ledge
//     just above is caught). The goo column itself is drawn by world.goo.column().
//   entity.knock (a Vector3, as drones and brutes have) is shoved outward whatever the color.
//   entity.onSplash(point, radius, color) is called on every world entity that has it (they judge the
//     distance themselves): soak a sponge, splash a pool, blow a seed pod, prime a bloom pad.
//   A green blast also gooes what it reaches (world.goo.splat: sticky patches on the surface, stickable
//     objects stuck fast, goo gaps bridged; see goo.js).
//   Enemy projectiles in range are popped (onHit). The player is pushed (no damage): a glob at your feet
//   as you jump is a small rocket jump.
import * as THREE from 'three';
import { COLORS, GREEN } from '../colors.js';
import { audio } from '../audio.js';
import { castRay } from './rays.js';

export const GLOB_INTERVAL = 0.36; // s between tapped globs (~2.8 a second; it was 0.62)
export const HOLD_T = 0.2; // s a press is held before the next glob starts charging (taps never wait)
export const CHARGE_T = 0.85; // s of charging to full
const MIN_CHARGE = 0.12; // a release short of this fires nothing extra (the tap already went)
const SPEED = 25; // m/s out of the muzzle
const GRAVITY = 15;
const FUSE = 3.5; // s before one bursts in mid-air
// a full charge (a partial charge lerps from a plain glob toward these)
export const CHARGED = { speed: 62, gravity: 2.2, fuse: 0.95, radius: 3.6, power: 5, push: 10, size: 1.9, flak: 2.6 };
const MAX_RICOCHETS = 4;
const RADIUS = 0.13;
export const BLAST_R = 2.6;
export const BLAST_POWER = 3; // red hits' worth per thing caught in a blast
export const COLUMN_K = 1.9; // a floor burst reaches this × its radius straight up
export const FLAK_R = 1.9; // m: a glob this close to a flier airbursts (charged: up to CHARGED.flak)
const FLAK_ARM = 0.05; // s of flight before the proximity fuse is live
const PUSH = 7.5; // m/s the blast gives the player at its centre
const POOL = 14;
const HEX = COLORS[GREEN].hex;
const GOO = new THREE.Color(0x3dff7a);
const GOO_DARK = new THREE.Color(0x0e5a24);
const UP = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3(), _m = new THREE.Vector3(), _step = new THREE.Vector3(), _p = new THREE.Vector3(), _v = new THREE.Vector3();
const _a = new THREE.Vector3(), _c = new THREE.Vector3(), _box = new THREE.Box3(), _s = new THREE.Sphere(), _f = new THREE.Vector3();
const rnd = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, t) => a + (b - a) * t;

// a soft round glow, drawn once
let glowTex = null;
function softTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const grad = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = grad;
  x.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

// (glob_charge, glob_charged, glob_ready and flak_burst are wanted samples: stock ones or synth stand in)
audio.manifest?.then(() => audio.prefetch(['mortar_launch', 'slime_squelch', 'glob_pop', 'slime_splat', 'crab_explode', 'shoot_green', 'charge_up', 'swarm_pop', 'energy_crackle', 'mortar_blast', 'glob_charge', 'glob_charged', 'glob_ready', 'flak_burst']));

// ---------------------------------------------------------------- fliers (the flak fuse's targets)
// Refreshed a few times a second from the hittables: anything flagged `flier` that a green burst can hurt.
const fliers = [];
let fliersAt = -1;
function flakTargets(world) {
  if (Math.abs(world.time - fliersAt) < 0.12) return fliers;
  fliersAt = world.time;
  fliers.length = 0;
  for (const root of world.hitTargets) {
    const e = root.userData.hit;
    if (!e || !e.flier || e.dead || e.crashing || e.gone || !e.pos?.isVector3) continue;
    const c = e.colorShield?.up ? e.colorShield.color : e.color;
    if (c !== GREEN && c !== null && c !== undefined) continue;
    fliers.push(e);
  }
  return fliers;
}

// ---------------------------------------------------------------- the charge hum
// A rising, gloopy hum while a glob charges: the glob_charge sample if it exists, else the stock charge_up
// (pitched to fit), else a synth (two detuned saws through a resonant low-pass that sweeps up, wobbled by
// an LFO). Its own nodes, so letting go cuts it at once.
class ChargeHum {
  constructor() {
    this.nodes = null;
  }

  start() {
    const ctx = audio.ctx;
    if (!ctx || !audio.sfxBus) return;
    this.stop(0.02);
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.32, t + 0.08);
    out.connect(audio.sfxBus);
    const srcs = [];
    const name = audio.buffers.has('glob_charge') ? 'glob_charge' : audio.buffers.has('charge_up') ? 'charge_up' : null;
    if (name) {
      const s = ctx.createBufferSource();
      s.buffer = audio.buffers.get(name);
      // the stock charge-up is ~1.25 s: squeezed onto the charge and pitched down a touch to sound wetter
      s.playbackRate.value = name === 'glob_charge' ? 1 : Math.max(0.6, s.buffer.duration / (CHARGE_T + 0.1));
      s.connect(out);
      s.start(t);
      srcs.push(s);
    }
    // the synth body (under the sample, or alone): it keeps humming at the top once the charge is full
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 6;
    lp.frequency.setValueAtTime(260, t);
    lp.frequency.exponentialRampToValueAtTime(1500, t + CHARGE_T);
    const body = ctx.createGain();
    body.gain.value = name ? 0.35 : 0.8;
    lp.connect(body).connect(out);
    for (const [type, f0, f1, g] of [['sawtooth', 62, 132, 0.4], ['sawtooth', 62.6, 133.2, 0.4], ['sine', 31, 66, 0.6]]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + CHARGE_T);
      const og = ctx.createGain();
      og.gain.value = g;
      o.connect(og).connect(lp);
      o.start(t);
      srcs.push(o);
    }
    const lfo = ctx.createOscillator();
    lfo.frequency.setValueAtTime(5, t);
    lfo.frequency.linearRampToValueAtTime(11, t + CHARGE_T);
    const lg = ctx.createGain();
    lg.gain.value = 180;
    lfo.connect(lg).connect(lp.frequency);
    lfo.start(t);
    srcs.push(lfo);
    this.nodes = { out, srcs };
  }

  stop(fade = 0.06) {
    const ctx = audio.ctx;
    if (!this.nodes || !ctx) return;
    const { out, srcs } = this.nodes;
    this.nodes = null;
    const t = ctx.currentTime;
    out.gain.cancelScheduledValues(t);
    out.gain.setValueAtTime(out.gain.value, t);
    out.gain.linearRampToValueAtTime(0.0001, t + fade);
    for (const s of srcs) {
      try {
        s.stop(t + fade + 0.05);
      } catch {}
    }
    setTimeout(() => out.disconnect(), (fade + 0.2) * 1000);
  }
}

// ---------------------------------------------------------------- the crosshair charge ring
class ChargeRing {
  constructor() {
    this.el = null;
    this.shown = -1;
  }

  build() {
    const host = document.querySelector('#crosshair');
    if (!host) return false;
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '-30 -30 60 60');
    svg.style.cssText = 'position:absolute;left:-30px;top:-30px;width:60px;height:60px;overflow:visible;pointer-events:none;opacity:0;transition:opacity 0.12s';
    const circ = (cls) => {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('r', '17');
      c.setAttribute('fill', 'none');
      c.setAttribute('class', cls);
      svg.appendChild(c);
      return c;
    };
    const track = circ('charge-track');
    track.setAttribute('stroke', 'rgba(160,255,190,0.18)');
    track.setAttribute('stroke-width', '2.4');
    const fill = circ('charge-fill');
    fill.setAttribute('stroke', '#5dff8a');
    fill.setAttribute('stroke-width', '3');
    fill.setAttribute('stroke-linecap', 'round');
    fill.setAttribute('transform', 'rotate(-90)');
    this.len = 2 * Math.PI * 17;
    fill.style.strokeDasharray = `${this.len} ${this.len}`;
    fill.style.strokeDashoffset = `${this.len}`;
    host.appendChild(svg);
    this.el = svg;
    this.fill = fill;
    return true;
  }

  // k: 0..1 charge, or null to hide; full adds a pulse
  set(k, t = 0) {
    if (k === null) {
      if (this.shown !== null && this.el) this.el.style.opacity = '0';
      this.shown = null;
      return;
    }
    if (!this.el && !this.build()) return;
    const q = Math.round(k * 60) / 60;
    const full = k >= 1;
    this.el.style.opacity = '1';
    if (q !== this.shown || full) {
      this.shown = q;
      this.fill.style.strokeDashoffset = `${this.len * (1 - Math.max(0.02, q))}`;
      const pulse = full ? 0.5 + 0.5 * Math.sin(t * 22) : 0;
      this.fill.setAttribute('stroke', full ? `rgb(${190 + pulse * 65}, 255, ${200 + pulse * 55})` : '#5dff8a');
      this.fill.setAttribute('stroke-width', full ? `${3.4 + pulse * 1.2}` : '3');
      this.el.style.transform = full ? `scale(${1 + pulse * 0.08})` : '';
    }
  }
}

export class GlobLauncher {
  constructor(blaster) {
    this.blaster = blaster;
    this.game = blaster.game;
    this.cooldown = 0;
    this.now = 0;
    this.globs = [];
    // input: the press that's waiting on the cooldown, how long the button has been held, the charge
    this.wasWant = false;
    this.pending = 0; // s left on a buffered press
    this.holdT = 0;
    this.charging = false;
    this.charge = 0;
    this.hum = new ChargeHum();
    this.ring = new ChargeRing();
    this.readyRung = false;
    // pooled globs: a glossy translucent shell round a glowing heart, a couple of drips trailing it and a
    // soft glow, made up front and kept hidden
    const shell = new THREE.MeshStandardMaterial({ color: 0x18c040, emissive: 0x0a7a2a, emissiveIntensity: 0.9, roughness: 0.06, metalness: 0.15, envMapIntensity: 1.6, transparent: true, opacity: 0.8 });
    const heart = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9dffb0).multiplyScalar(2.2) });
    const halo = new THREE.SpriteMaterial({ map: softTexture(), color: new THREE.Color(0x3dff7a).multiplyScalar(0.9), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const shellGeo = new THREE.IcosahedronGeometry(RADIUS, 3);
    const heartGeo = new THREE.IcosahedronGeometry(RADIUS * 0.55, 1);
    for (let i = 0; i < POOL; i++) {
      const g = new THREE.Group();
      const body = new THREE.Group();
      body.add(new THREE.Mesh(heartGeo, heart), new THREE.Mesh(shellGeo, shell));
      // drips trailing behind (the group's +y is its direction of flight)
      const drips = [0.62, 0.4].map((k, j) => {
        const d = new THREE.Mesh(shellGeo, shell);
        d.scale.setScalar(k);
        d.position.y = -RADIUS * (1.1 + j * 0.85);
        body.add(d);
        return d;
      });
      const glow = new THREE.Sprite(halo);
      glow.scale.setScalar(0.75);
      g.add(body, glow);
      g.visible = false;
      g.userData.noCull = true;
      g.userData.noBatch = true;
      this.game.scene.add(g);
      this.globs.push({ mesh: g, body, drips, glow, alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), off: new THREE.Vector3(), life: 0, bounces: 0, wob: 0, t: 0, charge: 0, size: 1, gravity: GRAVITY, fuse: FUSE, flak: FLAK_R });
    }
    this.light = this.game.world.addLight(0x46ff80, 0, 10, 1.5);
    this.lightT = 0;
    this.lightK = 1;
  }

  get active() {
    const b = this.blaster;
    return b.has && b.color === GREEN && !this.game.player?.dead;
  }

  update(dt, want) {
    this.now += dt;
    this.cooldown -= dt;
    const active = this.active;
    const pressed = want && !this.wasWant;
    const released = !want && this.wasWant;
    this.wasWant = want;
    if (pressed) {
      this.pending = Math.max(GLOB_INTERVAL, 0.2);
      this.holdT = 0;
    }
    // a tap: out the instant the cooldown allows
    if (this.pending > 0) {
      if (this.cooldown <= 0 && active) {
        this.fire(0);
        this.pending = 0;
      } else this.pending -= dt;
    }
    if (want) {
      this.holdT += dt;
      // held past the threshold (and the tap is out): the next glob charges
      if (!this.charging && this.holdT > HOLD_T && this.pending <= 0 && active) this.startCharge();
    }
    if (this.charging) {
      if (!active) this.cancelCharge();
      else if (released) this.releaseCharge();
      else {
        const was = this.charge;
        this.charge = Math.min(1, this.charge + dt / CHARGE_T);
        if (this.charge >= 1 && was < 1) this.chargeFull();
        this.chargeFx(dt);
      }
    }
    this.blaster.models[GREEN].charge?.(this.charging ? this.charge : 0);
    this.ring.set(this.charging ? this.charge : null, this.now);
    for (const g of this.globs) if (g.alive) this.fly(g, dt);
    // the blast's flash of light dies away
    if (this.lightT > 0) {
      this.lightT = Math.max(0, this.lightT - dt);
      this.light.intensity = 60 * this.lightK * (this.lightT / 0.3) ** 2;
    }
  }

  release() {
    for (const g of this.globs) this.kill(g);
    this.cancelCharge();
    this.light.intensity = 0;
    this.lightT = 0;
  }

  // ---------------------------------------------------------------- charging
  startCharge() {
    this.charging = true;
    this.charge = 0;
    this.readyRung = false;
    this.hum.start();
    audio.sample('slime_squelch', { gain: 0.25, rate: 0.7, vary: 0.05 });
  }

  cancelCharge() {
    if (!this.charging) return;
    this.charging = false;
    this.charge = 0;
    this.hum.stop(0.08);
    this.ring.set(null);
    this.blaster.models[GREEN].charge?.(0);
  }

  releaseCharge() {
    const k = this.charge;
    this.charging = false;
    this.charge = 0;
    this.hum.stop(0.05);
    if (k >= MIN_CHARGE) this.fire(k);
  }

  chargeFull() {
    // ready: a bright wet "plip" and a kick of light at the emitter
    if (!audio.sample(audio.sfxOr('glob_ready', 'swarm_pop'), { gain: 0.45, rate: audio.available?.has('glob_ready') ? 1 : 0.7, vary: 0 })) {
      audio.tone({ type: 'sine', f: 660, f2: 1320, dur: 0.12, gain: 0.12 });
    }
    audio.tone({ type: 'triangle', f: 990, f2: 1480, dur: 0.18, gain: 0.06, delay: 0.04 });
    this.blaster.flash = 4;
  }

  // goo seething round the muzzle while it charges (more of it, faster, as it fills)
  chargeFx(dt) {
    const b = this.blaster, fx = this.game.world.fx;
    if (Math.random() > dt * (10 + this.charge * 40)) return;
    b.muzzleWorld(_m);
    this.game.camera.getWorldDirection(_dir);
    _v.randomDirection().multiplyScalar(0.12 + this.charge * 0.1);
    _a.copy(_m).add(_v);
    // motes drawn in toward the emitter
    const k = fx.spawn(0, _a, -_v.x * 3 + this.game.player.vel.x, -_v.y * 3 + this.game.player.vel.y, -_v.z * 3 + this.game.player.vel.z, GOO, 1.4 + this.charge, rnd(0.12, 0.22), rnd(0.012, 0.022) * (1 + this.charge));
    fx.drag[k] = 2;
  }

  // ---------------------------------------------------------------- firing
  // k: the charge (0 a plain tapped glob, 1 full)
  fire(k = 0) {
    this.cooldown = GLOB_INTERVAL;
    const game = this.game, cam = game.camera, b = this.blaster;
    const full = k >= 0.999;
    b.bringUp();
    b.pose();
    cam.getWorldDirection(_dir);
    b.muzzleWorld(_m);
    const g = this.globs.find((x) => !x.alive) || this.globs.reduce((a, x) => (x.life > a.life ? x : a));
    if (g.alive) this.burst(g, g.pos, null, null);
    // it flies from the eye (so it goes where you aim) but is drawn from the muzzle, the gap closing fast
    g.charge = k;
    g.full = full;
    g.size = lerp(1, CHARGED.size, k);
    g.gravity = lerp(GRAVITY, CHARGED.gravity, k * k);
    g.fuse = full ? CHARGED.fuse : FUSE;
    g.flak = lerp(FLAK_R, CHARGED.flak, k);
    g.pos.copy(cam.position);
    g.vel.copy(_dir).multiplyScalar(lerp(SPEED, CHARGED.speed, k));
    g.vel.y += 1.2 * (1 - k); // a touch of loft (a charged one flies flat)
    g.off.subVectors(_m, cam.position);
    g.life = 0;
    g.bounces = 0;
    g.wob = 1;
    g.t = Math.random() * 10;
    g.alive = true;
    g.mesh.visible = true;
    g.mesh.position.copy(_m);
    g.mesh.scale.setScalar(g.size);
    g.glow.scale.setScalar(0.75 * (1 + k * 0.8));
    // the pump: a wet thump, a big springy kick, a splutter of goo (a charged one is a deeper, heavier slug)
    if (k > 0) {
      if (!audio.sample(audio.sfxOr('glob_charged', 'mortar_launch'), { gain: 0.55 + k * 0.35, rate: audio.available?.has('glob_charged') ? 1 : 1.2 - k * 0.35, vary: 0.04 })) audio.shoot(GREEN);
      audio.sample('slime_squelch', { gain: 0.45 + k * 0.2, rate: 1 - k * 0.3, vary: 0.08 });
      if (full) audio.sample('mortar_blast', { gain: 0.3, rate: 1.6, vary: 0.05 });
    } else {
      audio.sample('mortar_launch', { gain: 0.5, rate: 1.55, vary: 0.06 }) || audio.shoot(GREEN);
      audio.sample('slime_squelch', { gain: 0.35, rate: 1.4, vary: 0.1 });
    }
    b.kick(3.4 + k * 3);
    b.flash = 5 + k * 5;
    b.models[GREEN].fire(k);
    const fx = game.world.fx;
    fx.flash(_m, HEX, { size: 0.14 + k * 0.2, life: 0.08 + k * 0.06, k: 1.8, hot: 0.5 });
    for (let i = 0, n = 6 + Math.round(k * 10); i < n; i++) {
      _v.copy(_dir).multiplyScalar(rnd(2, 5 + k * 5)).add(_a.randomDirection().multiplyScalar(1.2 + k)).add(game.player.vel);
      const j = fx.spawn(0, _m, _v.x, _v.y, _v.z, GOO, 1.2, rnd(0.25, 0.45), rnd(0.012, 0.022) * (1 + k));
      fx.grav[j] = 9;
    }
    if (full) fx.ring(_a.copy(_m).addScaledVector(_dir, 0.15), _dir, 0xbfffcf, { size: 0.08, end: 0.7, life: 0.18, thick: 0.25, k: 1.8 });
  }

  fly(g, dt) {
    const world = this.game.world, fx = world.fx;
    g.life += dt;
    g.t += dt;
    if (g.life > g.fuse) return this.burst(g, g.pos, null, null, null, g.full);
    const wet = this.inWater(g.pos);
    g.vel.y -= g.gravity * (wet ? 0.3 : 1) * dt;
    if (wet) g.vel.multiplyScalar(Math.max(0, 1 - 1.6 * dt));
    _step.copy(g.vel).multiplyScalar(dt);
    let len = _step.length();
    if (len > 1e-5) {
      _dir.copy(_step).divideScalar(len);
      const r = RADIUS * g.size;
      const hit = castRay(world, g.pos, _dir, len + r);
      // a goo gap's open mouth catches it (it bursts on the membrane's plane and bridges it: goo.js)
      const gap = world.goo?.gapCatch(g.pos, _dir, hit ? hit.t : len + r);
      // the flak fuse: a flier within reach of this stretch of flight (short of any wall it hits)
      if (g.life > FLAK_ARM && this.flak(g, hit ? Math.max(0, hit.t - r) : len, gap)) return;
      if (gap) return this.burst(g, gap.point, gap.normal, null, null, g.full);
      if (hit) {
        if (this.contact(g, hit)) return;
        len = 0;
      }
    }
    if (len) g.pos.add(_step);
    // drawn: the muzzle offset closes within a few metres; it wobbles like jelly, stretched along its flight
    g.off.multiplyScalar(Math.exp(-dt * 14));
    g.mesh.position.copy(g.pos).add(g.off);
    g.wob = Math.max(0, g.wob - dt * 2.2);
    const sp = g.vel.length();
    if (sp > 0.1) g.mesh.quaternion.setFromUnitVectors(UP, _v.copy(g.vel).divideScalar(sp));
    const j = Math.sin(g.t * 26) * (0.08 + g.wob * 0.25);
    g.body.scale.set(1 - j * 0.5, 1 + Math.min(0.35, sp * 0.012) + j, 1 - j * 0.5);
    g.body.rotation.y += dt * 9;
    // the drips stream out further the faster it goes, and wobble on their own
    for (let i = 0; i < 2; i++) g.drips[i].position.y = -RADIUS * (0.8 + i * 0.6) * (0.85 + Math.min(0.4, sp * 0.015)) + Math.sin(g.t * 19 + i * 2) * 0.012;
    // a trail: glowing motes and drips of goo (a charged glob streams a thicker, brighter one)
    const c = g.charge;
    if (Math.random() < dt * (60 + c * 90)) {
      const k = fx.spawn(0, g.mesh.position, rnd(-0.3, 0.3), rnd(-0.3, 0.3), rnd(-0.3, 0.3), GOO, 1.1 + c * 0.6, rnd(0.2, 0.35) * (1 + c * 0.6), rnd(0.03, 0.05) * (1 + c * 0.8));
      fx.drag[k] = 3;
    }
    if (Math.random() < dt * 14) {
      const k = fx.spawn(0, g.mesh.position, g.vel.x * 0.15, g.vel.y * 0.15, g.vel.z * 0.15, GOO_DARK, 1.8, rnd(0.4, 0.7), rnd(0.02, 0.03) * g.size);
      fx.grav[k] = 12;
    }
    if (wet && Math.random() < dt * 20) fx.bubbles?.(g.mesh.position, 1);
  }

  // The proximity fuse: the nearest point of this step's path to each green flier; inside the glob's flak
  // reach (plus the flier's own `flakPad`, default 0.4 m for its body) it airbursts there. True if it went.
  flak(g, len, gap) {
    const list = flakTargets(this.game.world);
    if (!list.length) return false;
    if (gap) len = Math.min(len, gap.t);
    let best = null, bestU = Infinity;
    for (const e of list) {
      if (e.dead || e.crashing) continue;
      _v.subVectors(e.pos, g.pos);
      const u = THREE.MathUtils.clamp(_v.dot(_dir), 0, len);
      _f.copy(g.pos).addScaledVector(_dir, u);
      const d = _f.distanceTo(e.pos);
      if (d < g.flak + (e.flakPad ?? 0.4) && u < bestU) {
        bestU = u;
        best = e;
      }
    }
    if (!best) return false;
    _f.copy(g.pos).addScaledVector(_dir, bestU);
    this.burst(g, _f, null, null, null, g.full, true);
    return true;
  }

  inWater(p) {
    for (const w of this.game.world.waters || []) if (p.x > w.min.x && p.x < w.max.x && p.z > w.min.z && p.z < w.max.z && p.y > w.min.y && p.y < w.max.y) return true;
    return false;
  }

  // It touched something: mirrors and wrong colors bounce it on, anything else bursts it. True if it's gone.
  contact(g, hit) {
    const n = hit.normal, fx = this.game.world.fx;
    const e = hit.entity;
    _dir.copy(g.vel).normalize();
    hit.dir = _dir.clone();
    hit.kind = 'blast';
    hit.power = this.powerOf(g);
    hit.charge = g.charge;
    let res = hit.solid?.mirror ? 'mirror' : null;
    let direct = null;
    if (!res && e?.onHit) {
      res = e.onHit(GREEN, hit) || 'hit';
      direct = { entity: e, res, hit };
    }
    if ((res === 'mirror' || res === 'immune') && g.bounces < MAX_RICOCHETS) {
      g.bounces++;
      const keep = res === 'mirror' ? 0.9 : 0.62;
      g.pos.copy(hit.point).addScaledVector(n, RADIUS * g.size + 0.02);
      g.vel.addScaledVector(n, -2 * g.vel.dot(n)).multiplyScalar(keep);
      g.wob = 1;
      _p.copy(hit.point).addScaledVector(n, 0.02);
      const tint = typeof e?.color === 'number' ? COLORS[e.color]?.hex : null;
      fx.impact(_p, n, HEX, res === 'mirror' ? 'mirror' : 'ricochet', _dir, tint);
      if (res === 'mirror') audio.mirrorHit();
      else {
        audio.ricochet();
        this.game.hud.hitmarker(true);
      }
      audio.sample('slime_squelch', { gain: 0.3, rate: 1.7, vary: 0.15 });
      return false;
    }
    this.burst(g, hit.point, n, direct, hit, g.full);
    return true;
  }

  powerOf(g) {
    return Math.round(lerp(BLAST_POWER, CHARGED.power, g.charge));
  }

  kill(g) {
    g.alive = false;
    g.mesh.visible = false;
  }

  // full: a fully charged glob (the big blast); air: a flak airburst beside a flier
  burst(g, point, n, direct, hit = null, full = false, air = false) {
    const k = g.charge;
    this.kill(g);
    const at = point.clone();
    if (n) at.addScaledVector(n, 0.12);
    const radius = lerp(BLAST_R, CHARGED.radius, k);
    const floor = !!n && n.y > 0.6;
    const outcome = blast(this.game.world, at, radius, GREEN, {
      direct,
      normal: n,
      glass: !!hit?.solid?.glass,
      power: this.powerOf(g),
      push: lerp(PUSH, CHARGED.push, k),
      lift: full, // a full charge launches you even standing on the ground
      column: floor ? COLUMN_K : 1,
      air,
      charge: k,
    });
    if (outcome.hit) this.game.hud.hitmarker(false, outcome.crit);
    this.light.position.copy(at);
    this.lightT = 0.3;
    this.lightK = 1 + k * 0.8;
    this.light.intensity = 60 * this.lightK;
  }
}

// ---------------------------------------------------------------- the blast
const _cands = new Map();
const _wo = new THREE.Vector3();
// distance from the blast centre o to p, with the space above o squashed by k (the goo column's reach)
function wdist(o, p, k) {
  const dx = p.x - o.x, dz = p.z - o.z;
  let dy = p.y - o.y;
  if (dy > 0) dy /= k;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// The burst and what it does (see the top of this file). opts: { direct: { entity, res, hit } (what the
// glob struck, already hit once), normal (the struck surface, for the look), power, push (player shove),
// lift (shove the player up even off the ground: a charged rocket jump), column (≥ 1: the damage volume
// reaches column × radius straight up, and a goo column rises: a burst on a floor), air (a flak airburst:
// its own look and sound), goo (default: green blasts goo what they reach, goo.js), charge (0..1, the look)
// }. Returns { hit, crit, count }.
export function blast(world, at, radius, color, { direct = null, normal = null, power = BLAST_POWER, push = PUSH, glass = false, lift = false, column = 1, air = false, goo = color === GREEN, charge = 0 } = {}) {
  const game = world.game, fx = world.fx;
  const point = at.clone();
  const hex = COLORS[color].hex;
  const outcome = { hit: false, crit: false, count: 0 };
  const colK = Math.max(1, column);
  if (air) flakFx(fx, point, hex, radius);
  else explosionFx(fx, point, normal, hex, radius, glass);
  if (colK > 1) world.goo?.column(point, radius * colK, radius, charge);
  const cam = game.camera.position;
  const dist = cam.distanceTo(point);
  const g = Math.max(0.25, 1 - dist / 45);
  const big = radius > BLAST_R + 0.3;
  if (air) {
    // the flak crack: a sharp wet pop and a fizz (flak_burst once it exists)
    if (!audio.sample(audio.sfxOr('flak_burst', 'glob_pop'), { gain: 1.0 * g, rate: audio.available?.has('flak_burst') ? 1 : 1.35, vary: 0.08 })) audio.explode();
    audio.sample('energy_crackle', { gain: 0.45 * g, rate: 1.5, vary: 0.1 });
    audio.sample('swarm_pop', { gain: 0.6 * g, rate: 0.8, vary: 0.1 });
  } else {
    audio.sample('glob_pop', { gain: 0.9 * g, rate: big ? 0.7 : 0.85, vary: 0.1 }) || audio.explode();
    audio.sample('slime_splat', { gain: 0.8 * g, vary: 0.1 });
    audio.sample('crab_explode', { gain: (big ? 0.55 : 0.35) * g, rate: big ? 0.95 : 1.25, vary: 0.1 });
    if (big) audio.sample('mortar_blast', { gain: 0.45 * g, rate: 1.15, vary: 0.05 });
  }
  const pl = game.player;
  pl.shake = Math.max(pl.shake || 0, (big ? 0.5 : 0.35) * Math.max(0, 1 - dist / (big ? 18 : 14)));

  // what it reaches: a ray from the centre to each candidate must land on it first
  const done = new Set();
  const apply = (e, hit, already = 0) => {
    if (done.has(e)) return;
    done.add(e);
    hit.kind = 'blast';
    hit.power = power;
    hit.charge = charge;
    hit.dir = hit.dir || _v.subVectors(hit.point, point).normalize().clone();
    const calls = typeof e.hp === 'number' ? power : 1;
    for (let i = already; i < calls; i++) {
      const r = e.onHit(color, hit) || 'hit';
      if (r === 'hit' || r === 'kill') {
        outcome.hit = true;
        outcome.count++;
        if (hit.crit) outcome.crit = true;
      }
      if (r !== 'hit') break;
    }
  };
  if (direct) {
    const { entity: e, res, hit } = direct;
    if (res === 'hit' || res === 'kill') {
      outcome.hit = true;
      outcome.count++;
      if (hit.crit) outcome.crit = true;
    }
    if (res === 'hit') apply(e, hit, 1);
    else done.add(e);
  }
  const reachUp = radius * colK;
  // hittable meshes: their parts within reach, nearest first
  _cands.clear();
  for (const root of world.hitTargets) {
    const e = root.userData.hit;
    if (!e?.onHit || done.has(e)) continue;
    root.getWorldPosition(_p);
    if (_p.distanceTo(point) > 60) continue;
    _box.setFromObject(root);
    if (_box.isEmpty() || wdist(point, _box.clampPoint(point, _wo), colK) > radius) continue;
    const parts = [];
    root.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      _s.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld);
      const d = Math.max(0, wdist(point, _s.center, colK) - _s.radius);
      if (d <= radius) parts.push({ c: _s.center.clone(), d });
    });
    parts.sort((a, b) => a.d - b.d);
    _cands.set(e, parts.slice(0, 6));
  }
  for (const [e, parts] of _cands) {
    for (const { c } of parts) {
      const hit = rayTo(world, point, c, reachUp + 2);
      if (hit && hit.entity === e) {
        apply(e, hit);
        break;
      }
    }
  }
  // solids that belong to something shootable (barriers, target panels, switches, movers)
  for (const s of world.solids) {
    const e = s.entity;
    if (!e?.onHit || !s.enabled || s.noShot || done.has(e)) continue;
    _c.set(Math.max(s.min.x, Math.min(point.x, s.max.x)), Math.max(s.min.y, Math.min(point.y, s.max.y)), Math.max(s.min.z, Math.min(point.z, s.max.z)));
    const d = wdist(point, _c, colK);
    if (d > radius) continue;
    if (d < 0.02) {
      apply(e, { point: _c.clone(), normal: normal ? normal.clone() : UP.clone(), solid: s, entity: e, dir: (normal ? normal.clone().negate() : UP.clone().negate()) });
      continue;
    }
    // aim at the near face's closest point, nudged inside so the ray lands on the box
    _a.subVectors(_c, point).multiplyScalar(1.02).add(point);
    const hit = rayTo(world, point, _a, reachUp + 1);
    if (hit && (hit.solid === s || hit.entity === e)) apply(e, hit);
  }
  // shootable enemy projectiles in range pop
  for (const p of world.projectiles) {
    if (!p.alive || !p.shootable || wdist(point, p.pos, colK) > radius + (p.hitRadius || 0)) continue;
    p.onHit?.(color, { point: p.pos.clone(), kind: 'blast', power, dir: _v.subVectors(p.pos, point).normalize().clone() });
  }
  // shoves (drones, brutes: anything with a knock vector), whatever the color
  for (const e of world.entities) {
    if (e.knock?.isVector3 && e.pos?.isVector3 && !e.dead) {
      const d = wdist(point, e.pos, colK);
      if (d < radius * 1.3 && d > 1e-3) e.knock.addScaledVector(_v.subVectors(e.pos, point).normalize(), 9 * (1 - d / (radius * 1.3)));
    }
    if (typeof e.onSplash === 'function') e.onSplash(point, radius, color);
  }
  // the goo it leaves: patches on the surface, stickables stuck, gaps bridged (goo.js)
  if (goo) world.goo?.splat(point, normal, radius, { air, charge });
  // the player: a shove (no harm), mostly upward from below, so a glob at your feet as you jump lifts you.
  // Standing on the ground it only nudges you (globbing a riser you're riding mustn't bounce you off it),
  // unless it's a lift (a full charge): that launches you from the ground too.
  if (push > 0 && !pl.dead) {
    _p.copy(pl.pos).setY(pl.pos.y + 0.9);
    const d = _p.distanceTo(point), reach = radius * 1.35;
    if (d < reach && world.lineOfSight(point, _p)) {
      const below = point.y < pl.pos.y + 0.6;
      const ground = pl.grounded && !lift;
      const k = push * (1 - d / reach) * (ground && below ? 0.25 : 1);
      _v.subVectors(_p, point).normalize();
      if (below) _v.y = ground ? 0 : Math.max(_v.y, 0.6);
      _v.normalize();
      pl.vel.x += _v.x * k;
      pl.vel.z += _v.z * k;
      if (_v.y * k > 1) {
        // (a charged pop from standing is a launch: letting go of jump mustn't cut it short)
        if (lift && pl.grounded) pl.launched = true;
        pl.vel.y = Math.max(pl.vel.y, 0) + _v.y * k;
        pl.grounded = false;
        pl.ground = null;
        pl.coyote = 0;
      }
    }
  }
  return outcome;
}

function rayTo(world, from, to, far) {
  _a.subVectors(to, from);
  const len = _a.length();
  if (len < 1e-4) return null;
  _a.divideScalar(len);
  return castRay(world, from, _a.clone(), Math.min(far, len + 1.5));
}

// A wet green burst: a white-green flash, a shockwave on the surface and one in the air, gobs of goo
// flung out on arcs, a spray of fine droplets and a slow cloud (the goo it leaves is goo.js's splat).
function explosionFx(fx, p, n, hex, radius, glass) {
  const k = radius / 2.6;
  fx.flash(p, hex, { size: 2.2 * k, life: 0.16, k: 2, hot: 0.3 });
  fx.flash(p, 0xd8ffe0, { size: 0.7 * k, life: 0.06, k: 1.6, hot: 0.8 });
  if (n) {
    fx.ring(_a.copy(p).addScaledVector(n, -0.08), n, hex, { size: 0.3, end: radius * 1.25, life: 0.38, thick: 0.18, k: 1.8 });
    fx.flash(_a, hex, { size: radius * 0.45, life: 0.9, n, k: 0.55, hot: 0.1 });
  }
  fx.ring(p, null, 0xbfffcf, { size: 0.3, end: radius * 1.1, life: 0.25, thick: 0.12, k: 1.4 });
  const up = n || UP;
  for (let i = 0, c = fx.budget(26 * k); i < c; i++) {
    _v.randomDirection().addScaledVector(up, 0.9).normalize().multiplyScalar(rnd(3, 9) * k);
    const j = fx.spawn(0, p, _v.x, _v.y, _v.z, GOO, rnd(1.1, 1.6), rnd(0.5, 1.0), rnd(0.05, 0.12) * k);
    fx.grav[j] = 14;
    fx.drag[j] = 0.8;
    fx.endColor(j, GOO_DARK, 1.2);
  }
  fx.sparks(p, up, 0x7dffa0, { count: 22, speed: 14 * k, spread: 1.6, life: 0.4, gravity: 10, hot: 0.35 });
  for (let i = 0, c = fx.budget(7); i < c; i++) {
    _v.randomDirection().addScaledVector(up, 0.5).multiplyScalar(rnd(0.5, 1.6));
    const j = fx.puff(p, _v.x, _v.y, _v.z, GOO_DARK, 0.5, rnd(0.6, 1.1), rnd(0.35, 0.6) * k, 2.6);
    fx.grav[j] = -0.6;
  }
  if (glass) fx.impact(p, n || UP, 0xbfe8ff, 'glass');
}

// A FLAK airburst: unlike the wet ground burst it's a hard, round shell of goo: a white-hot core flash, a
// double shockwave facing you, a ball of shrapnel droplets flung out evenly in every direction (no up
// bias), crackling streaks and a hanging green smoke ring.
function flakFx(fx, p, hex, radius) {
  const k = radius / 2.6;
  fx.flash(p, 0xffffff, { size: 1.1 * k, life: 0.07, k: 2.2, hot: 1 });
  fx.flash(p, hex, { size: 2.8 * k, life: 0.22, k: 2.1, hot: 0.4 });
  fx.ring(p, null, 0xeaffef, { size: 0.2, end: radius * 1.35, life: 0.22, thick: 0.08, k: 2 });
  fx.ring(p, null, hex, { size: 0.4, end: radius * 0.95, life: 0.4, thick: 0.25, k: 1.6 });
  for (let i = 0, c = fx.budget(34 * k); i < c; i++) {
    _v.randomDirection().multiplyScalar(rnd(7, 13) * k);
    const j = fx.spawn(0, p, _v.x, _v.y, _v.z, GOO, rnd(1.3, 1.9), rnd(0.35, 0.7), rnd(0.04, 0.09) * k);
    fx.grav[j] = 9;
    fx.drag[j] = 1.6;
    fx.endColor(j, GOO_DARK, 1.1);
  }
  fx.sparks(p, UP, 0xd8ffe0, { count: 28, speed: 16 * k, spread: 3.2, life: 0.3, gravity: 4, hot: 0.7 });
  for (let i = 0, c = fx.budget(9); i < c; i++) {
    _v.randomDirection().multiplyScalar(rnd(0.8, 1.8));
    const j = fx.puff(p, _v.x, _v.y, _v.z, GOO_DARK, 0.6, rnd(0.7, 1.2), rnd(0.4, 0.7) * k, 2.8);
    fx.grav[j] = -0.3;
  }
}
