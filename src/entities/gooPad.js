// BLOOM PAD (GooPad): a deflated organic launch pod for the green glob launcher. Lob a glob into it (a
// direct hit, or a green burst within reach of it) and it drinks the goo, counts down — three heartbeat
// pulses, each swelling it, lighting one of the three nodes round its rim and thumping louder and higher —
// then BLOOMS: it inflates in a burst and, for `window` seconds, anyone standing on it or landing on it is
// launched high (like a JumpPad: straight up at `power` m/s, plus an optional `push`). Then it sags back
// down and, after `cooldown`, can be primed again. Shooting it with anything else does nothing.
//
// new GooPad(world, {
//   pos,                   [x, y, z]: the middle of its foot, on the floor (its low cap is solid: stand on it)
//   power = 20,            m/s straight up at launch (16 ≈ 5 m up, 20 ≈ 8 m, 24 ≈ 12 m)
//   push = [0, 0, 0],      m/s sideways at launch (a directional throw toward the next platform)
//   carry = true,          with a push: keep part of your run (false: the throw is exactly `push`)
//   window = 0.7,          s it stays inflated and launching
//   countdown = 2.2,       s from the hit to the bloom (the three beats fall at 15 %, 45 % and 75 % of it)
//   cooldown = 1.0,        s after it's sagged back before it can be primed again
//   radius = 1.3,          m: its footprint (launches you within this, catches a burst within this + its radius)
//   armed = true,          false: it ignores goo until arm() (e.g. a pad that grows in when a bulb pops)
//   onPrime(pad), onBloom(pad), onLaunch(pad, player)     callbacks
// })
// Methods: prime() (start the countdown from script), arm() / disarm(), reset() (deflated and ready).
// State: pad.state 'idle' | 'priming' | 'bloom' | 'sag'.
// e.g.  new GooPad(W, { pos: [12, 0, -30], power: 22, push: [0, 0, -6] }); // up and over to the ledge north
import * as THREE from 'three';
import { GREEN } from '../colors.js';
import { audio } from '../audio.js';
import { v3, clamp, rnd } from './mechkit.js';

const GOO = new THREE.Color(0x3dff7a);
const GOO_DARK = new THREE.Color(0x0e5a24);
const SPORE = new THREE.Color(0xd8ff9a);
const UP = new THREE.Vector3(0, 1, 0);
const CAP = 0.35; // m: the solid cap you stand on
const _v = new THREE.Vector3(), _a = new THREE.Vector3();
const near = (world, p, range = 45) => Math.max(0, 1 - world.game.camera.position.distanceTo(p) / range);

// (pad_absorb, pad_beat, pad_bloom and pad_launch are wanted samples: stock ones stand in)
audio.manifest?.then(() => audio.prefetch(['slime_squelch', 'slime_splat', 'slime_regrow', 'heartbeat', 'timer_tick', 'pod_burst', 'hydra_bloom', 'jump_pad', 'spore_burst', 'pad_absorb', 'pad_beat', 'pad_bloom', 'pad_launch']));

let K = null;
function kit() {
  if (K) return K;
  K = {
    podGeo: new THREE.IcosahedronGeometry(1, 3),
    heartGeo: new THREE.IcosahedronGeometry(1, 2),
    rootGeo: new THREE.TorusGeometry(1, 0.22, 7, 18).rotateX(Math.PI / 2),
    petalGeo: new THREE.SphereGeometry(1, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.42, 0.12, 0.9).translate(0, 0, 0.7),
    nodeGeo: new THREE.IcosahedronGeometry(0.11, 1),
    barkMat: new THREE.MeshStandardMaterial({ color: 0x3a2c1c, roughness: 0.9, flatShading: true }),
    petalMat: new THREE.MeshStandardMaterial({ color: 0x356f2e, emissive: 0x0b3a10, roughness: 0.75, flatShading: true, side: THREE.DoubleSide }),
  };
  return K;
}

export class GooPad {
  constructor(world, { pos, power = 20, push = [0, 0, 0], carry = true, window = 0.7, countdown = 2.2, cooldown = 1.0, radius = 1.3, armed = true, onPrime = null, onBloom = null, onLaunch = null } = {}) {
    const k = kit();
    this.world = world;
    this.pos = v3(pos);
    this.power = power;
    this.push = v3(push);
    this.carry = carry;
    this.window = window;
    this.countdown = countdown;
    this.cooldown = cooldown;
    this.radius = radius;
    this.armed = armed;
    this.onPrime = onPrime;
    this.onBloom = onBloom;
    this.onLaunch = onLaunch;
    this.t = Math.random() * 10;
    this.group = new THREE.Group();
    this.group.position.copy(this.pos);
    this.group.userData.hit = this;
    const R = radius;
    // the gnarled root ring it grows out of
    const root = new THREE.Mesh(k.rootGeo, k.barkMat);
    root.scale.set(R * 1.02, R * 0.9, R * 1.02);
    root.position.y = 0.12;
    this.group.add(root);
    // leaf petals round the foot that fling open as it blooms
    this.petals = [];
    for (let i = 0; i < 7; i++) {
      const p = new THREE.Group();
      p.rotation.y = (i / 7) * Math.PI * 2 + 0.2;
      const leaf = new THREE.Mesh(k.petalGeo, k.petalMat);
      leaf.scale.setScalar(R * 0.75);
      p.add(leaf);
      p.position.y = 0.16;
      this.group.add(p);
      this.petals.push(leaf);
    }
    // the pod: a glossy translucent green bladder round a glowing heart
    this.shellMat = new THREE.MeshStandardMaterial({ color: 0x168a38, emissive: 0x0a7a2a, emissiveIntensity: 0.3, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.8, envMapIntensity: 1.1 });
    this.heartMat = new THREE.MeshBasicMaterial({ color: GOO.clone().multiplyScalar(1.4) });
    this.pod = new THREE.Group();
    this.pod.position.y = 0.18;
    this.heart = new THREE.Mesh(k.heartGeo, this.heartMat);
    this.shell = new THREE.Mesh(k.podGeo, this.shellMat);
    this.pod.add(this.heart, this.shell);
    this.group.add(this.pod);
    // the three countdown nodes on the rim: each lights on its beat
    this.nodes = [];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
      const m = new THREE.MeshBasicMaterial({ color: 0x1a3a1e });
      // (dark until its beat)
      const n = new THREE.Mesh(k.nodeGeo, m);
      n.position.set(Math.cos(a) * R * 1.05, 0.3, Math.sin(a) * R * 1.05);
      n.scale.setScalar(R / 1.3);
      this.group.add(n);
      this.nodes.push(m);
    }
    world.scene.add(this.group);
    world.addHittable(this.group);
    // the low cap you stand on
    const r = R * 0.85;
    this.solid = world.addSolid(new THREE.Vector3(this.pos.x - r, this.pos.y, this.pos.z - r), new THREE.Vector3(this.pos.x + r, this.pos.y + CAP, this.pos.z + r), { static: true, kind: 'grass' });
    world.add(this);
    this.reset();
  }

  get top() {
    return this.pos.y + CAP;
  }

  reset() {
    this.state = 'idle';
    this.timer = 0;
    this.beat = 0;
    this.swell = 0; // 0 deflated → 1 inflated (drawn)
    this.kick = 0; // a beat's pulse
    this.flash = 0;
    this.launchedThis = false;
    this.nodes.forEach((m) => m.color.setHex(0x1a3a1e));
  }

  arm() {
    this.armed = true;
  }

  disarm() {
    this.armed = false;
    if (this.state === 'priming') this.reset();
  }

  // ---- goo in ----
  onHit(color, hit) {
    if (color !== GREEN) return 'world';
    this.prime(hit?.point);
    return 'hit';
  }

  onSplash(point, radius, color) {
    if (color !== GREEN) return;
    _v.copy(this.pos).setY(this.pos.y + 0.4);
    if (_v.distanceTo(point) <= radius * 0.6 + this.radius) this.prime(point);
  }

  prime(point = null) {
    if (!this.armed || this.state !== 'idle') return false;
    this.state = 'priming';
    this.timer = 0;
    this.beat = 0;
    this.kick = 1;
    this.flash = 1;
    // it drinks the goo: a ring sucked inward, droplets drawn into it
    const fx = this.world.fx, c = _a.copy(this.pos).setY(this.pos.y + 0.4);
    fx.ring(c, UP, 0x7dffa0, { size: this.radius * 2.2, end: 0.2, life: 0.3, thick: 0.2, k: 1.6 });
    for (let i = 0, n = fx.budget(18); i < n; i++) {
      _v.randomDirection().multiplyScalar(this.radius * rnd(1, 1.8)).setY(rnd(0.2, 1.4));
      const p = _v.clone().add(c);
      const j = fx.spawn(0, p, -_v.x * 3, -_v.y * 3, -_v.z * 3, GOO, 1.5, 0.3, rnd(0.05, 0.09));
      fx.drag[j] = 1;
    }
    const g = near(this.world, this.pos);
    if (!audio.sample(audio.sfxOr('pad_absorb', 'slime_regrow'), { gain: 0.8 * g, rate: audio.available?.has('pad_absorb') ? 1 : 1.4, vary: 0.04 })) audio.sample('slime_squelch', { gain: 0.8 * g, rate: 0.6 });
    this.onPrime?.(this);
    return true;
  }

  // ---- per frame ----
  update(dt, player) {
    this.t += dt;
    this.kick = Math.max(0, this.kick - dt * 3.5);
    this.flash = Math.max(0, this.flash - dt * 3);
    const fx = this.world.fx;
    let want = 0; // how swollen it should be
    if (this.state === 'priming') {
      this.timer += dt;
      // three beats, then the bloom
      const due = Math.floor((this.timer / this.countdown - 0.15) / 0.3) + 1;
      if (due > this.beat && this.beat < 3) this.beatNow(++this.beat);
      want = 0.08 + this.beat * 0.07;
      if (this.timer >= this.countdown) this.bloom(player);
    } else if (this.state === 'bloom') {
      this.timer += dt;
      want = 1;
      // anyone on it, or landing on it, goes up
      if (!this.launchedThis && this.onTop(player)) this.launch(player);
      // spores streaming up out of its crown while it's live
      if (Math.random() < dt * 30) {
        _v.set(this.pos.x + rnd(-0.5, 0.5) * this.radius, this.top + 1.1 * this.radius * 0.9, this.pos.z + rnd(-0.5, 0.5) * this.radius);
        const j = fx.spawn(0, _v, rnd(-0.4, 0.4), rnd(3, 6), rnd(-0.4, 0.4), SPORE, 1.3, rnd(0.4, 0.7), rnd(0.03, 0.06));
        fx.drag[j] = 1.5;
      }
      if (this.timer >= this.window) {
        this.state = 'sag';
        this.timer = 0;
        const g = near(this.world, this.pos);
        audio.sample('slime_squelch', { gain: 0.6 * g, rate: 0.55, vary: 0.05 });
      }
    } else if (this.state === 'sag') {
      this.timer += dt;
      want = 0;
      if (this.timer >= 0.6 + this.cooldown) {
        this.reset();
        // ready again: a soft shimmer
        fx.ring(_a.copy(this.pos).setY(this.top + 0.05), UP, 0x7dffa0, { size: 0.2, end: this.radius * 1.6, life: 0.5, thick: 0.15, k: 1.2 });
      }
    }
    // the drawn swell: snaps up on the bloom (a springy overshoot), sags down slowly
    const rate = want > this.swell ? (this.state === 'bloom' ? 22 : 6) : 3;
    this.swell += (want - this.swell) * Math.min(1, dt * rate);
    this.draw(dt);
  }

  draw(dt) {
    const R = this.radius, s = this.swell, t = this.t;
    const breathe = 1 + Math.sin(t * (this.state === 'priming' ? 6 + this.beat * 3 : 1.6)) * (this.state === 'priming' ? 0.04 + this.beat * 0.015 : 0.025);
    const k = this.kick;
    const bloomT = this.state === 'bloom' ? this.timer : 1;
    const wob = this.state === 'bloom' ? Math.sin(bloomT * 34) * 0.12 * Math.max(0, 1 - bloomT * 2.5) : 0;
    // deflated: a flat wrinkly cushion; inflated: a tall bulb
    const wx = R * (0.72 + s * 0.38 + k * 0.1) * breathe * (1 - wob * 0.5);
    const wy = (0.3 + s * 1.0 + k * 0.16) * breathe * (1 + wob);
    this.shell.scale.set(wx, wy, wx);
    this.shell.position.y = wy * 0.55;
    const hs = 0.35 + s * 0.35 + k * 0.25;
    this.heart.scale.set(wx * hs, wy * hs, wx * hs);
    this.heart.position.y = wy * 0.5;
    const prime = this.state === 'priming' ? this.timer / this.countdown : 0;
    this.shellMat.emissiveIntensity = 0.3 + prime * 0.5 + s * 0.5 + k * 0.6 + this.flash * 0.4;
    this.heartMat.color.copy(GOO).multiplyScalar(0.9 + prime * 0.7 + s * 0.6 + k * 0.9);
    this.shellMat.opacity = 0.78 + s * 0.12;
    // petals fold out flat as it blooms
    const open = this.state === 'bloom' ? 1 : s;
    for (const p of this.petals) p.rotation.x = -0.35 + open * 0.55 + Math.sin(t * 2 + p.parent.rotation.y) * 0.03;
  }

  beatNow(n) {
    this.kick = 1;
    this.nodes[n - 1].color.copy(GOO).multiplyScalar(2.6);
    const fx = this.world.fx;
    fx.ring(_a.copy(this.pos).setY(this.pos.y + 0.08), UP, 0x7dffa0, { size: 0.3, end: this.radius * (1.8 + n * 0.3), life: 0.45, thick: 0.18, k: 1.3 + n * 0.2 });
    fx.flash(_a.copy(this.pos).setY(this.pos.y + 0.5), 0x7dffa0, { size: this.radius * (0.9 + n * 0.25), life: 0.18, k: 1.5 });
    const g = near(this.world, this.pos);
    // a heartbeat thump and a rising tick: 1, 2, 3...
    if (!audio.sample(audio.sfxOr('pad_beat', 'heartbeat'), { gain: (0.7 + n * 0.12) * g, rate: audio.available?.has('pad_beat') ? 1 + (n - 1) * 0.08 : 1.15 + n * 0.1, vary: 0, cut: audio.available?.has('pad_beat') ? 0 : 0.42 })) audio.tone({ type: 'sine', f: 70, f2: 45, dur: 0.18, gain: 0.25 * g });
    audio.sample('timer_tick', { gain: 0.5 * g, rate: 1.1 + n * 0.18, vary: 0 }) || audio.tone({ type: 'square', f: 600 + n * 200, dur: 0.06, gain: 0.08 * g });
  }

  bloom(player) {
    this.state = 'bloom';
    this.timer = 0;
    this.kick = 1;
    this.flash = 1;
    this.launchedThis = false;
    const fx = this.world.fx, c = _a.copy(this.pos).setY(this.top + 0.6);
    fx.flash(c, 0xbfffcf, { size: this.radius * 2.4, life: 0.2, k: 2, hot: 0.4 });
    fx.ring(_v.copy(this.pos).setY(this.pos.y + 0.1), UP, 0xbfffcf, { size: 0.4, end: this.radius * 3.4, life: 0.4, thick: 0.2, k: 1.8 });
    for (let i = 0, n = fx.budget(36); i < n; i++) {
      _v.randomDirection().setY(Math.abs(_v.y) * 1.5 + 0.4).multiplyScalar(rnd(3, 8));
      const j = fx.spawn(0, c, _v.x, _v.y, _v.z, i & 1 ? SPORE : GOO, 1.5, rnd(0.6, 1.1), rnd(0.05, 0.1));
      fx.grav[j] = 12;
      fx.endColor(j, GOO_DARK, 1.2);
    }
    const g = near(this.world, this.pos, 55);
    if (!audio.sample(audio.sfxOr('pad_bloom', 'pod_burst'), { gain: 1.0 * g, rate: audio.available?.has('pad_bloom') ? 1 : 0.8, vary: 0.04 })) audio.explode();
    audio.sample('hydra_bloom', { gain: 0.35 * g, rate: 1.6, vary: 0.05, cut: 0.6 });
    this.onBloom?.(this);
    if (this.onTop(player)) this.launch(player);
  }

  // standing on it, or dropping onto it (within its footprint, feet at or a little above its crown)
  onTop(player) {
    if (!player || player.dead) return false;
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    if (dx * dx + dz * dz > this.radius * this.radius) return false;
    const y = player.pos.y - this.top;
    return y > -0.25 && y < 1.6 && player.vel.y < 4;
  }

  launch(player) {
    this.launchedThis = true;
    player.launch(this.power, this.push.lengthSq() ? this.push : null, this.carry);
    this.kick = 1;
    this.world.fx.padLaunch(this.pos, 0x5dff8a);
    const g = near(this.world, this.pos, 55);
    if (!audio.sample(audio.sfxOr('pad_launch', 'jump_pad'), { gain: 0.9 * g, vary: 0.04 })) audio.pad();
    audio.sample('slime_splat', { gain: 0.7 * g, rate: 0.75, vary: 0.05 });
    // the bounce squashes it flat for a beat before it rebounds
    this.swell = 0.55;
    this.onLaunch?.(this, player);
  }
}
