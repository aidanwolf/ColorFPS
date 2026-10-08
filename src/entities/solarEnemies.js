// Solar ground enemies: the Scarab (a robot beetle that burrows, tunnels at you as a moving sand mound
// and bursts out in a pounce) and the Mummy (a bandaged android that hurls curving sand bolts, sidesteps
// and rolls, and raises a sand shield of another color). Both are restockable (see groundKit.js).
import * as THREE from 'three';
import { COLORS, YELLOW, RED } from '../colors.js';
import { audio } from '../audio.js';
import { director } from '../combat/director.js';
import { GroundEnemy, Trooper, RigDef, Bolt, sfx, falloff, rnd } from './groundKit.js';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _u = new THREE.Vector3();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const SAND = 0xc9a26a;
const DUST = 0xa88758;

const glowHex = (color, k = 2.4) => new THREE.Color(COLORS[color].hex).multiplyScalar(k);
const sandPuff = (fx, p, spread = 1, up = 1, size = 0.5, life = 1) =>
  fx.puff(p, rnd(-spread, spread), rnd(0.3, 1) * up, rnd(-spread, spread), _c.set(DUST), 0.45, life * rnd(0.7, 1.2), size * rnd(0.7, 1.3), 3);

// ================================================================ SCARAB
// A robot scarab: a gold shell banded with lapis, a glowing seam down its back in its color. It lies
// buried as a small mound; when it notices you the mound ploughs toward you through the sand, stops,
// swells and sprays (0.6 s: its head breaks the surface, and it can be shot from then on) and the beetle
// bursts out in a pounce. On the surface it scuttles in, rears up (0.5 s) and pounces again, then digs
// back in. A wrong-color hit while it's on the ground flips it onto its back for a moment. 1 hp.
// A palette (e.g. [YELLOW, RED]) changes its color each time it surfaces.
const EMERGE_T = 0.6;
const SCARAB_SCALE = 1.3;
const CROUCH_T = 0.5;
const DIG_T = 0.7;
const SCARAB_LEGS = [
  [0.22, 0.24, 0.75], [0.27, 0.02, 0.05], [0.24, -0.2, -0.6],
  [-0.22, 0.24, 0.75], [-0.27, 0.02, 0.05], [-0.24, -0.2, -0.6],
];

const SCARAB = new RigDef((r) => {
  r.node('body', null, [0, 0.3, 0]);
  // the domed shell, with lapis bands and the glowing seam
  r.add('body', 'gold', new THREE.SphereGeometry(0.42, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), [0, -0.05, -0.12], [0, 0, 0], [0.85, 0.75, 1.2]);
  for (const dz of [-0.2, 0.08]) {
    const rr = 0.42 * Math.sqrt(1 - (dz / 0.504) ** 2);
    r.add('body', 'lapis', new THREE.TorusGeometry(rr, 0.028, 4, 18, Math.PI), [0, -0.05, -0.12 + dz], [0, 0, 0], [0.86, 0.76, 1]);
  }
  r.add('body', 'glow', new THREE.TorusGeometry(0.42, 0.022, 4, 20, Math.PI), [0, -0.05, -0.12], [0, Math.PI / 2, 0], [1.2, 0.76, 1]);
  r.add('body', 'dark', new THREE.SphereGeometry(0.4, 12, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), [0, -0.05, -0.1], [0, 0, 0], [0.8, 0.35, 1.15]);
  // thorax shield and head (a toothed clypeus with a horn)
  r.add('body', 'lapis', new THREE.SphereGeometry(0.25, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), [0, -0.03, 0.33], [0, 0, 0], [1.1, 0.7, 0.8]);
  r.add('body', 'gold', new THREE.TorusGeometry(0.25, 0.02, 4, 16, Math.PI), [0, -0.03, 0.33], [0, 0, 0], [1.1, 0.7, 1]);
  r.add('body', 'gold', new THREE.CylinderGeometry(0.2, 0.2, 0.05, 12, 1, false, -Math.PI / 2, Math.PI), [0, -0.04, 0.46]);
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + ((i + 0.5) / 5) * Math.PI;
    r.add('body', 'gold', new THREE.ConeGeometry(0.035, 0.1, 4), [Math.sin(a) * 0.2, -0.04, 0.46 + Math.cos(a) * 0.2], [Math.PI / 2, 0, -a * 0]);
  }
  r.add('body', 'gold', new THREE.ConeGeometry(0.045, 0.24, 5), [0, 0.07, 0.52], [0.9, 0, 0]);
  for (const s of [-1, 1]) r.add('body', 'glow', new THREE.SphereGeometry(0.045, 8, 6), [s * 0.14, 0.02, 0.5]);
  // wings, folded under the shell until it flies
  for (const [name, s] of [['wingL', 1], ['wingR', -1]]) {
    r.node(name, 'body', [s * 0.08, 0.12, 0.05]);
    r.box(name, 'wing', [0.6, 0.012, 0.22], [s * 0.3, 0, -0.08]);
  }
  // six legs; the front pair are toothed digging spades
  SCARAB_LEGS.forEach(([x, z, splay], i) => {
    const s = x > 0 ? 1 : -1;
    r.node('leg' + i, 'body', [x, -0.08, z], { rot: [0, (s > 0 ? 0 : Math.PI) - s * splay, 0] });
    r.box('leg' + i, 'dark', [0.26, 0.05, 0.06], [0.12, 0.06, 0], [0, 0, 0.45]);
    r.box('leg' + i, 'dark', [0.36, 0.045, 0.05], [0.34, -0.06, 0], [0, 0, -1.0]);
    if (i % 3 === 0) r.box('leg' + i, 'gold', [0.16, 0.03, 0.1], [0.44, -0.2, 0], [0, 0, -1.0]);
    else r.add('leg' + i, 'gold', new THREE.ConeGeometry(0.03, 0.08, 4), [0.45, -0.21, 0], [0, 0, Math.PI]);
  });
});

let moundGeo = null;
let moundMat = null;
let scarabProxyGeo = null;
let proxyMat = null;

export class Scarab extends GroundEnemy {
  constructor(world, opts) {
    super(world, opts, { radius: 0.6, height: 0.7, hp: 1, range: 18, color: YELLOW, patrol: 4, accel: 35 });
    this.burrows = opts.burrow ?? true;
    this.legPhase = Math.random() * 10;
    this.pounces = 0;
    this.leapCool = 0;
    this.waitT = rnd(0.5, 2);
    this.target = null;
    this.pulse = 0;
    this.m = {
      gold: this.mat(new THREE.MeshStandardMaterial({ color: 0xc08a1c, metalness: 0.95, roughness: 0.32, flatShading: true })),
      lapis: this.mat(new THREE.MeshStandardMaterial({ color: 0x1d3f9a, metalness: 0.35, roughness: 0.4, flatShading: true })),
      dark: this.mat(new THREE.MeshStandardMaterial({ color: 0x1a1612, metalness: 0.7, roughness: 0.5, flatShading: true })),
      glow: this.mat(new THREE.MeshBasicMaterial({ color: 0xffffff })),
      wing: this.mat(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })),
    };
    // the beetle (shootable) and its sand mound (not) are separate children of the group
    const rig = SCARAB.build(this.m);
    this.n = rig.n;
    this.legs = SCARAB_LEGS.map((_, i) => rig.n['leg' + i]);
    this.beetle = rig.root;
    rig.root.scale.setScalar(SCARAB_SCALE);
    scarabProxyGeo ??= new THREE.SphereGeometry(0.55, 8, 6).scale(0.9, 0.7, 1.15);
    proxyMat ??= new THREE.MeshBasicMaterial({ visible: false });
    const proxy = new THREE.Mesh(scarabProxyGeo, proxyMat);
    proxy.position.set(0, 0.3, 0.05);
    this.beetle.add(proxy);
    moundGeo ??= new THREE.SphereGeometry(0.6, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    moundMat ??= new THREE.MeshStandardMaterial({ color: SAND, roughness: 1, flatShading: true });
    this.mound = new THREE.Mesh(moundGeo, moundMat);
    this.mound.scale.set(1, 0.32, 1.25);
    this.group.add(this.beetle, this.mound);
    this.applyColor();
    this.attach(this.beetle);
    this.setState(this.burrows ? 'buried' : 'surface');
    this.showBuried(this.burrows);
  }

  applyColor() {
    this.m.glow.color.copy(glowHex(this.color));
    this.m.wing.color.copy(glowHex(this.color, 0.8));
    this.m.gold.emissive.copy(glowHex(this.color, 0.03));
  }

  showBuried(buried) {
    this.beetle.visible = !buried;
    this.mound.visible = buried;
  }

  onAlert() {
    if (this.state === 'buried') this.setState('tunnel');
    else if (this.state === 'surface') this.setState('scuttle');
  }

  onCalm() {
    if (this.state === 'tunnel') this.setState('buried');
  }

  think(dt, player) {
    const s = this.state;
    const buried = s === 'buried' || s === 'tunnel';
    this.leapCool -= dt;
    this.move.set(0, 0, 0);
    if (!buried && s !== 'dig' && this.touches(player, 0.15)) player.damage(1, 'scarab');
    const d = this.toPlayer(player, _v);
    const faceYaw = Math.atan2(_v.x, _v.z);
    if (s === 'buried') {
      if (this.aggro) this.setState('tunnel');
    } else if (s === 'tunnel') {
      // plough toward you under the sand
      this.move.copy(_v).multiplyScalar(4.2);
      this.turnToward(faceYaw, 5, dt);
      this.digT = (this.digT || 0) - dt;
      if (this.digT <= 0 && this.dist < 25) {
        this.digT = 0.16;
        this.world.fx.puff(this.pos, rnd(-0.6, 0.6), rnd(0.6, 1.4), rnd(-0.6, 0.6), _c.set(DUST), 0.45, 1, 0.45, 3);
        const g = 0.3 * falloff(this.dist, 3, 20);
        sfx('scarab_dig', g, { synth: (gg) => audio.noise({ dur: 0.18, gain: 0.25 * gg, freq: 380, q: 0.7, type: 'lowpass' }) });
      }
      const stuck = this.blockedBy?.ledge || this.blockedBy?.x || this.blockedBy?.z;
      this.stuckT = stuck ? (this.stuckT || 0) + dt : 0;
      this.attackWait = Math.max(0, (this.attackWait || 0) - dt);
      const ready = (d < 4.5 && Math.abs(player.pos.y - this.pos.y) < 2.5) || (this.stuckT > 1.2 && this.dist < 8) || this.stateT > 6;
      if (ready && d < 4.5) this.move.set(0, 0, 0); // close enough: lurk until it may strike
      // (bursting out and the pounce happen only while it holds one of the director's attack tokens)
      if (ready && this.attackWait <= 0 && this.mayAttack(EMERGE_T + 0.9)) this.startEmerge();
      else if (this.stuckT > 3) this.stuckT = 0; // keep pacing the edge
    } else if (s === 'emerge') {
      this.turnToward(faceYaw, 6, dt);
      if (Math.random() < dt * 30) {
        _w.copy(this.pos).y += 0.1;
        sandPuff(this.world.fx, _w, 1.2, 2.5, 0.4, 0.8);
        this.world.fx.burst(_w, SAND, { count: 2, speed: 4, life: 0.6, size: 0.15, gravity: 12, dir: UP });
      }
      if (this.stateT >= EMERGE_T) this.pounce(player, true);
    } else if (s === 'leap') {
      return;
    } else if (s === 'land') {
      if (this.stateT > 0.35) this.setState('scuttle');
    } else if (s === 'flipped') {
      if (this.stateT > 1.3) {
        this.setState('scuttle');
        this.world.fx.burst(this.pos, DUST, { count: 6, speed: 2, life: 0.4, size: 0.3, gravity: 3 });
      }
    } else if (s === 'surface') {
      // a surface scarab with nothing to chase pokes about its patch
      this.patrolStep(dt);
      if (this.aggro) this.setState('scuttle');
    } else if (s === 'scuttle') {
      this.turnToward(faceYaw, 7, dt);
      this.move.copy(_v).multiplyScalar(d > 2 ? 3.2 : 0);
      this.lostSight = this.sees ? 0 : (this.lostSight || 0) + dt;
      if (this.burrows && (this.pounces >= 2 || this.lostSight > 2) && this.stateT > 0.6) this.setState('dig');
      else if (!this.aggro && !this.burrows) this.setState('surface');
      else if (this.sees && this.dist < 7.5 && this.leapCool <= 0 && this.stateT > 0.5) {
        if (this.mayAttack(CROUCH_T + 0.9)) this.setState('crouch');
        else this.leapCool = this.attackWait;
      }
    } else if (s === 'crouch') {
      this.turnToward(faceYaw, 9, dt);
      if (this.stateT < dt * 1.5) this.chitter();
      if (this.stateT >= CROUCH_T) {
        if (this.sees) this.pounce(player, false);
        else {
          director.release(this);
          this.setState('scuttle');
        }
      }
    } else if (s === 'dig') {
      if (Math.random() < dt * 25) sandPuff(this.world.fx, this.pos, 1, 1.5, 0.45, 0.9);
      if (this.stateT >= DIG_T) {
        this.pounces = 0;
        this.showBuried(true);
        this.setState(this.aggro ? 'tunnel' : 'buried');
      }
    }
  }

  patrolStep(dt) {
    if (!this.target) {
      this.waitT -= dt;
      if (this.waitT <= 0) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * this.patrol;
        const x = this.home.x + Math.cos(a) * r, z = this.home.z + Math.sin(a) * r;
        if (this.pathClear(x, z, 0.4)) this.target = new THREE.Vector3(x, 0, z);
        this.waitT = rnd(0.6, 2);
      }
      return;
    }
    _w.set(this.target.x - this.pos.x, 0, this.target.z - this.pos.z);
    const len = _w.length();
    if (len < 0.3 || this.blockedBy?.ledge || this.blockedBy?.x || this.blockedBy?.z) {
      this.target = null;
      return;
    }
    _w.divideScalar(len);
    this.move.copy(_w).multiplyScalar(1.6);
    this.turnToward(Math.atan2(_w.x, _w.z), 5, dt);
  }

  chitter() {
    const g = 0.4 * falloff(this.dist, 3, 24);
    sfx('scarab_chitter', g, { synth: (gg) => {
      for (let i = 0; i < 6; i++) audio.noise({ dur: 0.025, gain: 0.14 * gg, freq: 3200 + i * 300, q: 4, delay: i * 0.045 });
    } });
  }

  startEmerge() {
    // a palette scarab shows its new color as it breaks the surface
    if (this.palette.length > 1) this.setColorIdx(this.colorIdx + 1);
    this.setState('emerge');
    this.beetle.visible = true;
    this.chitter();
    const g = 0.5 * falloff(this.dist, 3, 26);
    sfx('scarab_emerge', g, { synth: (gg) => audio.noise({ dur: 0.6, gain: 0.25 * gg, freq: 500, f2: 2500, q: 0.8 }) });
  }

  pounce(player, fromSand) {
    const T = THREE.MathUtils.clamp(0.3 + this.dist * 0.05, 0.38, 0.7);
    _w.copy(player.pos);
    _w.y += player.eye * 0.55 - 0.3;
    _w.x += player.vel.x * T * 0.5;
    _w.z += player.vel.z * T * 0.5;
    const v = this.leapVelocity(this.aimAt(this.center(new THREE.Vector3()), _w), T, new THREE.Vector3());
    if (v.length() > 16) v.setLength(16);
    this.vel.copy(v);
    this.grounded = false;
    this.ground = null;
    this.pounces++;
    this.leapCool = rnd(1, 1.6);
    this.showBuried(false);
    this.setState('leap');
    const fx = this.world.fx;
    if (fromSand) {
      // bursting out of the sand
      for (let i = 0; i < 10; i++) sandPuff(fx, this.pos, 2, 2, 0.6, 1.2);
      fx.burst(this.pos, SAND, { count: 30, speed: 6, life: 0.8, size: 0.2, gravity: 14, dir: UP });
      fx.ring(_w.copy(this.pos).setY(this.pos.y + 0.05), UP, DUST, { size: 0.3, end: 2.5, life: 0.4, thick: 0.25, k: 0.6 });
    }
    const g = 0.45 * falloff(this.dist, 3, 24);
    sfx('scarab_pounce', g, { alt: 'crab_leap', synth: (gg) => audio.noise({ dur: 0.3, gain: 0.2 * gg, freq: 1500, f2: 4500, q: 1 }) });
  }

  onLand() {
    if (this.state !== 'leap') return;
    this.setState('land');
    sandPuff(this.world.fx, this.pos, 1, 0.8, 0.4, 0.7);
  }

  animate(dt) {
    const n = this.n;
    const s = this.state;
    if (s === 'buried' || s === 'tunnel') {
      // the mound: breathing at rest, rolling along when it moves
      const moving = s === 'tunnel';
      this.mound.scale.set(1 + Math.sin(this.t * 9) * 0.05 * (moving ? 1 : 0.3), 0.3 + Math.sin(this.t * 2.3) * 0.02 + (moving ? Math.abs(Math.sin(this.t * 12)) * 0.06 : 0), 1.25);
      this.mound.position.y = 0;
      return;
    }
    if (s === 'emerge') {
      // the mound swells and shakes; the beetle's head breaks the surface
      const k = this.stateT / EMERGE_T;
      this.mound.visible = true;
      this.mound.scale.set(1.1 + k * 0.4, 0.35 + k * 0.35 + Math.sin(this.t * 60) * 0.04, 1.35 + k * 0.3);
      this.mound.position.x = Math.sin(this.t * 47) * 0.04;
      this.beetle.position.y = -0.75 + 0.6 * k * (2 - k);
      n.body.rotation.x = -0.5;
    } else if (s === 'dig') {
      const k = this.stateT / DIG_T;
      this.beetle.position.y = -0.8 * k * k;
      n.body.rotation.x = 0.4 * Math.min(1, k * 3);
      this.mound.visible = k > 0.5;
      this.mound.scale.set(k, 0.3 * k, 1.25 * k);
    } else {
      this.beetle.position.y = 0;
      this.mound.visible = false;
    }
    if (s === 'dig' && this.stateT > DIG_T * 0.55) this.beetle.visible = false; // under: no longer shootable
    const speed = Math.hypot(this.vel.x, this.vel.z);
    const air = this.grounded ? 0 : 1;
    const crouch = s === 'crouch' ? Math.min(1, this.stateT / 0.2) : 0;
    const flipped = s === 'flipped';
    const k = Math.min(1, speed / 2) * (1 - air);
    this.legPhase += dt * (5 + speed * 7) * (k > 0.05 || flipped ? 1 : 0) * (flipped ? 3 : 1);
    this.legs.forEach((leg, i) => {
      const tri = (i % 3 + (i < 3 ? 0 : 1)) % 2;
      const ph = this.legPhase + tri * Math.PI;
      const base = (leg.userData.baseY ??= leg.rotation.y);
      leg.rotation.y = base + Math.sin(ph) * (flipped ? 0.6 : 0.35 * k);
      leg.rotation.z = Math.max(0, Math.cos(ph)) * 0.4 * (flipped ? 1 : k) + air * 0.5 + crouch * 0.3 + (flipped ? 0.5 : 0);
    });
    // body: rears up to pounce, pitches along the arc, flips on its back when stunned
    const pitch = air ? -Math.atan2(this.vel.y, Math.hypot(this.vel.x, this.vel.z) + 0.01) * 0.6 : s === 'emerge' ? -0.5 : s === 'dig' ? n.body.rotation.x : -crouch * 0.45;
    n.body.rotation.x = THREE.MathUtils.lerp(n.body.rotation.x, pitch, Math.min(1, dt * 12));
    const roll = flipped ? Math.PI : 0;
    n.body.rotation.z = THREE.MathUtils.lerp(n.body.rotation.z, roll + (crouch ? Math.sin(this.t * 50) * 0.04 : 0), Math.min(1, dt * 14));
    n.body.position.y = 0.3 + (flipped ? 0.12 : 0) - crouch * 0.06 + Math.abs(Math.sin(this.legPhase * 2)) * 0.015 * k;
    // wings snap open and buzz in flight; twitch while it rears
    const open = air ? 1 : crouch * 0.25;
    for (const [w, sgn] of [[n.wingL, 1], [n.wingR, -1]]) {
      w.rotation.y = sgn * (1 - open) * 1.35;
      w.rotation.z = sgn * (open * (0.3 + Math.sin(this.t * 90) * 0.35));
      w.visible = open > 0.02;
    }
    this.pulse = Math.max(0, this.pulse - dt * 4);
    if (this.immuneFlash > 0) this.m.glow.color.setRGB(0.7, 0.7, 0.8);
    else this.m.glow.color.copy(glowHex(this.color, 2.4 + crouch * 1.5 + (s === 'emerge' ? 1.5 : 0)));
  }

  onHit(color, hit) {
    if (this.dead) return undefined;
    if (!this.aggro) {
      this.aggro = true;
      this.onAlert();
    }
    if (color !== this.color) {
      // knocked onto its back while it's on the ground
      if (this.grounded && ['scuttle', 'crouch', 'land', 'surface'].includes(this.state)) {
        if (this.state === 'crouch') director.release(this);
        this.setState('flipped');
        this.world.fx.burst(this.pos, DUST, { count: 8, speed: 3, life: 0.4, size: 0.3, gravity: 4 });
      }
      return this.immune();
    }
    this.hp--;
    this.hitSparks(hit);
    audio.droneHit(Math.max(0.5, falloff(this.dist, 6, 40)));
    if (this.hp > 0) {
      this.flash = 1;
      return 'hit';
    }
    this.die(hit);
    return 'kill';
  }

  // cracked open: the shell halves and legs fly, gold shards and a puff of sand
  die(hit) {
    this.dead = true;
    director.release(this);
    const c = this.center(new THREE.Vector3());
    const fx = this.world.fx;
    const hex = COLORS[this.color].hex;
    fx.flash(c, hex, { size: 1.2, life: 0.15, k: 1.8, hot: 0.6 });
    fx.burst(c, hex, { count: 30, speed: 7, life: 0.6, size: 0.3, gravity: 8 });
    fx.burst(c, 0xffd070, { count: 20, speed: 6, life: 0.7, size: 0.2, gravity: 12, mode: 'shard' });
    fx.sparks(c, UP, 0xffd9a0, { count: 14, speed: 9, spread: 2, life: 0.4 });
    for (let i = 0; i < 5; i++) sandPuff(fx, c, 1.5, 1.2, 0.5, 1);
    const g = Math.max(0.3, falloff(this.dist, 5, 45));
    sfx('scarab_crunch', 0.7 * g, { alt: 'shatter', altRate: 1.5, altGain: 0.6, synth: () => audio.shatter() });
    this.onDeath?.(this);
    const push = hit?.dir ? hit.dir.clone().multiplyScalar(3) : null;
    this.scatter([...this.legs, this.n.wingL, this.n.wingR, this.n.body], push, { speed: 5, up: 0.9, life: 1.3 });
  }

  cool(t) {
    const k = Math.max(0, 1 - t / 0.8);
    this.m.glow.color.copy(glowHex(this.color, 2.4 * k + 0.05));
  }

  resetExtra() {
    this.pounces = 0;
    this.leapCool = 0;
    this.beetle.position.y = 0;
    if (this.burrows) {
      this.showBuried(true);
      this.setState('buried');
    } else {
      this.showBuried(false);
      this.setState('surface');
    }
    if (this.palette.length > 1) this.setColorIdx(0);
  }

  idleFar() {}
}

// ================================================================ MUMMY
// A bandaged android: wrapped limbs over a dark frame, a gold-and-lapis headdress and a glowing eye slit,
// bandage ribbons streaming from its arms, waist and head. It keeps its distance, hurls fans of three
// sand bolts that curve in toward you (arms raised, sand swirling into its hands for 0.65 s first; the
// bolts are shootable in its color), sidesteps and rolls when you aim, and when hurt may raise a sand
// shield (arms crossed and a swirl at its feet for 0.5 s first) of ANOTHER color: while it's up, only
// that color does anything (three hits shatter it and stagger the mummy); it drops after ~2.4 s. 5 hp.
const CAST_T = 0.65;
const WARD_T = 0.5;
const SHIELD_T = 2.4;

const MUMMY = new RigDef((r) => {
  r.node('body', null, [0, 1.02, 0]);
  r.node('pelvis', 'body', [0, 0, 0]);
  r.box('pelvis', 'wrap', [0.4, 0.22, 0.26], [0, 0, 0]);
  r.box('pelvis', 'gold', [0.44, 0.06, 0.3], [0, 0.08, 0]);
  r.box('pelvis', 'wrap2', [0.36, 0.36, 0.05], [0, -0.2, 0.14], [0.1, 0, 0]);
  r.box('pelvis', 'lapis', [0.1, 0.36, 0.055], [0, -0.2, 0.15], [0.1, 0, 0]);
  r.node('torso', 'body', [0, 0.1, 0], { rot: [0.08, 0, 0] });
  r.box('torso', 'wrap', [0.42, 0.62, 0.26], [0, 0.36, 0]);
  [0.12, 0.24, 0.36, 0.5].forEach((y, i) => r.box('torso', 'wrap2', [0.45, 0.06, 0.29], [0, y, 0], [0, 0, (i % 2 ? 1 : -1) * 0.16]));
  r.box('torso', 'dark', [0.24, 0.05, 0.02], [0.04, 0.2, 0.135], [0, 0, 0.2]); // the frame showing through a tear
  r.box('torso', 'dark', [0.16, 0.04, 0.02], [-0.06, 0.3, 0.135], [0, 0, -0.1]);
  // the broad collar, gold banded with lapis, with a glowing scarab on the chest
  r.add('torso', 'gold', new THREE.CylinderGeometry(0.24, 0.33, 0.08, 16), [0, 0.64, 0.01]);
  r.add('torso', 'lapis', new THREE.CylinderGeometry(0.335, 0.36, 0.05, 16), [0, 0.585, 0.01]);
  r.box('torso', 'glow', [0.12, 0.09, 0.03], [0, 0.46, 0.145]);
  r.box('torso', 'glow', [0.2, 0.025, 0.03], [0, 0.46, 0.145]);
  // head: wrapped skull, dark face plate with the eye slit, nemes headdress
  r.node('head', 'torso', [0, 0.7, 0.02]);
  r.box('head', 'wrap', [0.25, 0.3, 0.27], [0, 0.15, 0]);
  r.box('head', 'dark', [0.21, 0.17, 0.04], [0, 0.14, 0.14]);
  r.box('head', 'glow', [0.17, 0.032, 0.03], [0, 0.17, 0.162]);
  r.box('head', 'gold', [0.05, 0.12, 0.05], [0, -0.02, 0.12]);
  r.box('head', 'gold', [0.34, 0.08, 0.32], [0, 0.32, -0.01]);
  r.box('head', 'lapis', [0.3, 0.34, 0.06], [0, 0.1, -0.16]);
  for (const s of [-1, 1]) {
    r.box('head', 'lapis', [0.09, 0.42, 0.07], [s * 0.17, 0.06, 0.06]);
    for (const y of [-0.08, 0.04, 0.16, 0.26]) r.box('head', 'gold', [0.095, 0.035, 0.075], [s * 0.17, y, 0.06]);
  }
  for (const y of [0.0, 0.1, 0.2]) r.box('head', 'gold', [0.31, 0.03, 0.065], [0, y, -0.16]);
  // long wrapped arms with glowing palms
  for (const [arm, fore, hand, s] of [['armL', 'foreL', 'handL', 1], ['armR', 'foreR', 'handR', -1]]) {
    r.node(arm, 'torso', [s * 0.29, 0.56, 0]);
    r.box(arm, 'wrap', [0.13, 0.44, 0.13], [0, -0.2, 0]);
    r.box(arm, 'wrap2', [0.15, 0.05, 0.15], [0, -0.12, 0], [0, 0, 0.3 * s]);
    r.box(arm, 'wrap2', [0.15, 0.05, 0.15], [0, -0.3, 0], [0, 0, -0.3 * s]);
    r.node(fore, arm, [0, -0.44, 0]);
    r.box(fore, 'wrap', [0.115, 0.4, 0.115], [0, -0.2, 0]);
    r.add(fore, 'gold', new THREE.CylinderGeometry(0.075, 0.075, 0.07, 8), [0, -0.05, 0]);
    r.box(fore, 'wrap2', [0.13, 0.045, 0.13], [0, -0.26, 0], [0, 0, 0.35 * s]);
    r.box(fore, 'dark', [0.1, 0.13, 0.06], [0, -0.46, 0.01]);
    r.box(fore, 'glow', [0.06, 0.06, 0.02], [0, -0.46, 0.045]);
    r.node(hand, fore, [0, -0.5, 0.06]);
  }
  // legs
  for (const [leg, shin, s] of [['legL', 'shinL', 1], ['legR', 'shinR', -1]]) {
    r.node(leg, 'body', [s * 0.12, -0.06, 0]);
    r.box(leg, 'wrap', [0.15, 0.48, 0.16], [0, -0.24, 0]);
    r.box(leg, 'wrap2', [0.17, 0.05, 0.18], [0, -0.15, 0], [0, 0, 0.3 * s]);
    r.box(leg, 'wrap2', [0.17, 0.05, 0.18], [0, -0.36, 0], [0, 0, -0.3 * s]);
    r.node(shin, leg, [0, -0.48, 0]);
    r.box(shin, 'wrap', [0.13, 0.44, 0.14], [0, -0.22, 0]);
    r.box(shin, 'wrap2', [0.15, 0.05, 0.16], [0, -0.18, 0], [0, 0, 0.3 * s]);
    r.box(shin, 'dark', [0.14, 0.06, 0.26], [0, -0.45, 0.05]);
  }
});

// bandage ribbons: a few short verlet chains in world space, drawn as one strip mesh per mummy
const RIB_N = 7;
const RIB_SEG = 0.15;
const RIB_W = 0.07;
class Ribbons {
  constructor(scene, anchors, mat) {
    this.anchors = anchors; // Object3Ds the ribbons hang from
    this.pts = anchors.map(() => Array.from({ length: RIB_N }, () => ({ p: new THREE.Vector3(), o: new THREE.Vector3() })));
    const verts = anchors.length * RIB_N * 2;
    this.pos = new Float32Array(verts * 3);
    const idx = [];
    for (let r = 0; r < anchors.length; r++)
      for (let i = 0; i < RIB_N - 1; i++) {
        const a = (r * RIB_N + i) * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setIndex(idx);
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.userData.noCull = true;
    scene.add(this.mesh);
    this.placed = false;
  }

  update(dt, t) {
    dt = Math.min(dt, 1 / 30);
    this.anchors.forEach((a, r) => {
      const chain = this.pts[r];
      a.getWorldPosition(chain[0].p);
      if (!this.placed) for (const q of chain) q.p.copy(chain[0].p), q.o.copy(chain[0].p);
      chain[0].o.copy(chain[0].p);
      // a desert breeze that gusts and swirls
      const wind = _u.set(Math.sin(t * 0.7 + r) * 1.2 + 0.8, 0.3 + Math.sin(t * 2.3 + r * 2) * 0.4, Math.cos(t * 0.9 + r * 1.7) * 1.0);
      for (let i = 1; i < RIB_N; i++) {
        const q = chain[i];
        _v.subVectors(q.p, q.o).multiplyScalar(0.9); // velocity with drag
        q.o.copy(q.p);
        q.p.add(_v).addScaledVector(wind, dt * dt * (1 + i * 0.4)).y -= 3 * dt * dt;
      }
      for (let it = 0; it < 2; it++)
        for (let i = 1; i < RIB_N; i++) {
          const a0 = chain[i - 1].p, b0 = chain[i].p;
          _v.subVectors(b0, a0);
          const len = _v.length() || 1e-4;
          b0.copy(a0).addScaledVector(_v, RIB_SEG / len);
        }
      // the strip: width across the chain, perpendicular to it and to up
      for (let i = 0; i < RIB_N; i++) {
        const p = chain[i].p, q = chain[Math.min(RIB_N - 1, i + 1)].p, o = chain[Math.max(0, i - 1)].p;
        _v.subVectors(q, o);
        _w.crossVectors(_v, UP);
        if (_w.lengthSq() < 1e-6) _w.set(1, 0, 0);
        _w.normalize().multiplyScalar(RIB_W * (1 - i / RIB_N * 0.4));
        const k = (r * RIB_N + i) * 6;
        this.pos[k] = p.x - _w.x;
        this.pos[k + 1] = p.y - _w.y;
        this.pos[k + 2] = p.z - _w.z;
        this.pos[k + 3] = p.x + _w.x;
        this.pos[k + 4] = p.y + _w.y;
        this.pos[k + 5] = p.z + _w.z;
      }
    });
    this.placed = true;
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
  }

  dispose(scene) {
    scene.remove(this.mesh);
    this.geo.dispose();
  }
}

let shieldGeo = null;
let plateGeo = null;

export class Mummy extends Trooper {
  constructor(world, opts) {
    super(world, opts, { radius: 0.45, height: 2.1, hp: 5, range: 28, color: YELLOW, patrol: 4, speed: 2.4, prefer: [9, 17], dodge: 2.6, accel: 22 });
    this.shieldColor = opts.shieldColor === undefined ? (this.color === RED ? YELLOW : RED) : opts.shieldColor;
    this.castCool = rnd(1, 2);
    this.shieldCool = 0.5;
    this.shieldUp = false;
    this.stride = 0.55;
    this.crouchDrop = 0.3;
    this.m = {
      wrap: this.mat(new THREE.MeshStandardMaterial({ color: 0xbfae86, roughness: 0.95, metalness: 0, flatShading: true })),
      wrap2: this.mat(new THREE.MeshStandardMaterial({ color: 0x9a8a66, roughness: 1, metalness: 0, flatShading: true })),
      gold: this.mat(new THREE.MeshStandardMaterial({ color: 0xd4a133, metalness: 0.9, roughness: 0.3, flatShading: true })),
      lapis: this.mat(new THREE.MeshStandardMaterial({ color: 0x1d3f9a, metalness: 0.35, roughness: 0.4, flatShading: true })),
      dark: this.mat(new THREE.MeshStandardMaterial({ color: 0x15130f, metalness: 0.7, roughness: 0.5, flatShading: true })),
      glow: this.mat(new THREE.MeshBasicMaterial({ color: 0xffffff })),
    };
    const rig = MUMMY.build(this.m);
    this.n = rig.n;
    for (const a of [this.n.armL, this.n.armR]) a.rotation.order = 'YXZ';
    this.group.add(rig.root);
    // ribbon anchors: the forearms, the waist and the back of the headdress
    const anchor = (parent, x, y, z) => {
      const o = new THREE.Object3D();
      o.position.set(x, y, z);
      parent.add(o);
      return o;
    };
    this.ribbonMat = this.mat(new THREE.MeshStandardMaterial({ color: 0xb3a27c, roughness: 1, side: THREE.DoubleSide }));
    this.ribbons = new Ribbons(world.scene, [
      anchor(this.n.foreL, 0.06, -0.25, -0.02), anchor(this.n.foreR, -0.06, -0.2, -0.02),
      anchor(this.n.pelvis, 0.15, -0.02, -0.12), anchor(this.n.head, 0, 0.05, -0.2),
    ], this.ribbonMat);
    // the sand shield: a translucent shell (it takes the hits) and orbiting plates
    shieldGeo ??= new THREE.IcosahedronGeometry(1, 1);
    plateGeo ??= new THREE.BoxGeometry(0.36, 0.5, 0.05);
    this.shieldMat = this.mat(new THREE.MeshStandardMaterial({ color: SAND, roughness: 1, flatShading: true, transparent: true, opacity: 0.32, depthWrite: false, emissive: 0x000000 }));
    this.plateMat = this.mat(new THREE.MeshStandardMaterial({ color: 0xc9a26a, roughness: 0.9, flatShading: true, emissive: 0x000000 }));
    this.shield = new THREE.Group();
    this.shield.position.y = 1.05;
    const shell = new THREE.Mesh(shieldGeo, this.shieldMat);
    shell.scale.set(0.95, 1.2, 0.95);
    shell.userData.part = 'shield';
    this.shield.add(shell);
    this.plates = [];
    for (let i = 0; i < 9; i++) {
      const p = new THREE.Mesh(plateGeo, this.plateMat);
      p.userData.part = 'shield';
      p.userData.a = (i / 9) * Math.PI * 2;
      p.userData.y = ((i % 3) - 1) * 0.55;
      this.shield.add(p);
      this.plates.push(p);
    }
    this.shield.visible = false;
    this.group.add(this.shield);
    this.applyColor();
    this.attach();
  }

  applyColor() {
    this.m.glow.color.copy(glowHex(this.color));
    const sc = this.shieldColor ?? this.color;
    this.shieldMat.emissive.copy(glowHex(sc, 0.35));
    this.plateMat.emissive.copy(glowHex(sc, 0.25));
  }

  onAlert() {
    this.setState('engage');
    sfx('mummy_alert', 0.6 * falloff(this.dist, 5, 35), { synth: (g) => {
      audio.noise({ dur: 0.7, gain: 0.16 * g, freq: 900, f2: 400, q: 2 });
      audio.tone({ type: 'sawtooth', f: 110, f2: 80, dur: 0.6, gain: 0.05 * g });
    } });
  }

  onStep() {
    if (this.dist < 14 && Math.random() < 0.6) sandPuff(this.world.fx, this.pos, 0.3, 0.3, 0.25, 0.6);
  }

  onRoll(kind) {
    sandPuff(this.world.fx, this.pos, 0.6, 0.5, 0.4, 0.8);
    const g = 0.35 * falloff(this.dist, 3, 26);
    sfx('mummy_dodge', g, { synth: (gg) => audio.noise({ dur: kind === 'step' ? 0.15 : 0.35, gain: 0.18 * gg, freq: 1800, f2: 700, q: 0.8 }) });
  }

  // three in five dodges are quick sidesteps, the rest rolls
  tryRoll(player, kind = Math.random() < 0.6 ? 'step' : 'roll') {
    return super.tryRoll(player, kind);
  }

  canDodge() {
    return this.state === 'engage' || this.state === 'cover';
  }

  engage(dt, player, d) {
    this.castCool -= dt;
    this.shieldCool -= dt;
    if (this.stagger > 0) return;
    if (this.wardNext && this.shieldCool <= 0) {
      this.wardNext = false;
      return this.setState('ward');
    }
    if (!this.sees) return;
    // you're drawing a bead and it can't dodge right now: shield up
    if (this.shieldCool <= 0 && this.rollCool > 0 && this.aimedAt(0.2) && Math.random() < dt * 0.9) return this.setState('ward');
    if (this.castCool <= 0 && d > 3 && this.attackWait <= 0 && this.mayAttack(CAST_T + 0.5)) this.setState('cast');
  }

  act(dt, player, d) {
    const s = this.state;
    if (s === 'cast') {
      this.move.multiplyScalar(0);
      // sand streams into its hands
      if (this.dist < 40 && Math.random() < dt * 40) {
        this.group.updateMatrixWorld(true);
        const hand = (Math.random() < 0.5 ? this.n.handL : this.n.handR).getWorldPosition(_w);
        const a = Math.random() * Math.PI * 2;
        _u.set(Math.cos(a) * 0.9, rnd(-0.4, 0.4), Math.sin(a) * 0.9);
        this.world.fx.puff(_v.copy(hand).add(_u), -_u.x * 2.4, -_u.y * 2.4, -_u.z * 2.4, _c.set(0xd9b070), 0.6, 0.35, 0.18, 0.6);
      }
      if (this.stateT < dt * 1.5) sfx('mummy_cast', 0.5 * falloff(this.dist, 4, 34), { alt: 'charge_up', altRate: 1.5, altGain: 0.6, synth: (g) => audio.tone({ type: 'triangle', f: 300, f2: 900, dur: 0.6, gain: 0.06 * g }) });
      if (this.stateT >= CAST_T) {
        this.castVolley(player);
        director.release(this);
        this.castCool = rnd(2.4, 3.4);
        this.setState('release');
      }
    } else if (s === 'release') {
      this.move.set(0, 0, 0);
      if (this.stateT > 0.3) this.setState('engage');
    } else if (s === 'ward') {
      this.move.set(0, 0, 0);
      if (this.stateT < dt * 1.5) {
        this.world.fx.ring(_w.copy(this.pos).setY(this.pos.y + 0.1), UP, COLORS[this.shieldColor ?? this.color].hex, { size: 1.6, end: 0.4, life: WARD_T, thick: 0.2, k: 1.2 });
        sfx('mummy_shield', 0.5 * falloff(this.dist, 4, 30), { alt: 'barrier_reform', altRate: 1.2, synth: (g) => audio.noise({ dur: 0.5, gain: 0.2 * g, freq: 400, f2: 1600, q: 1 }) });
      }
      if (Math.random() < dt * 40) {
        const a = Math.random() * Math.PI * 2;
        _w.set(this.pos.x + Math.cos(a) * 1.1, this.pos.y + rnd(0, 0.4), this.pos.z + Math.sin(a) * 1.1);
        this.world.fx.puff(_w, -Math.sin(a) * 2, rnd(1.5, 3), Math.cos(a) * 2, _c.set(0xd9b070), 0.5, 0.6, 0.3, 2);
      }
      if (this.stateT >= WARD_T) this.raiseShield();
    } else if (s === 'shield') {
      // shuffle sideways behind the shield, no attacks
      this.toPlayer(player, _v);
      this.strafeT -= dt;
      if (this.strafeT <= 0 || this.blockedBy?.x || this.blockedBy?.z) {
        this.strafeDir *= -1;
        this.strafeT = rnd(0.8, 1.6);
      }
      this.move.set(-_v.z * this.strafeDir, 0, _v.x * this.strafeDir).multiplyScalar(this.speed * 0.5);
      if (this.stateT >= SHIELD_T) this.dropShield(false);
    }
  }

  castVolley(player) {
    this.group.updateMatrixWorld(true);
    _w.copy(player.pos).y += player.eye * 0.7;
    const aimed = this.aimAt(this.center(_u), _w);
    const warning = aimed.distanceTo(_w) > 0.5; // the director's off-screen miss: don't let the bolts home in
    _w.copy(aimed);
    const hands = [this.n.handL, this.n.handR, this.n.handL];
    [-0.38, 0, 0.38].forEach((a, i) => {
      const from = hands[i].getWorldPosition(new THREE.Vector3());
      const dir = _v.subVectors(_w, from).normalize();
      dir.applyAxisAngle(UP, a);
      dir.y += 0.08;
      // the outer bolts bend in toward you; the middle one flies true
      new Bolt(this.world, from, dir.normalize().multiplyScalar(9.5), this.color, { radius: 0.24, style: 'sand', turn: a ? 1.5 : 0.4, turnTime: warning ? 0 : 1.1, life: 5 });
      this.world.fx.flash(from, COLORS[this.color].hex, { size: 0.5, life: 0.1, k: 1.6 });
    });
    sfx('mummy_bolt', 0.6 * falloff(this.dist, 4, 40), { alt: 'enemy_shot', altRate: 1.25, synth: () => audio.enemyShoot() });
  }

  raiseShield() {
    this.shieldUp = true;
    this.shieldHp = 3;
    this.shield.visible = true;
    this.setState('shield');
    this.world.fx.burst(this.center(_w), SAND, { count: 30, speed: 4, life: 0.6, size: 0.3, gravity: 2 });
  }

  dropShield(broken) {
    if (!this.shieldUp) return;
    this.shieldUp = false;
    this.shield.visible = false;
    this.shieldCool = rnd(6, 8);
    const c = this.center(new THREE.Vector3());
    const fx = this.world.fx;
    for (let i = 0; i < (broken ? 14 : 6); i++) sandPuff(fx, c, 2, 1, 0.6, 1.2);
    if (broken) {
      fx.burst(c, COLORS[this.shieldColor].hex, { count: 40, speed: 8, life: 0.7, size: 0.35, gravity: 6, mode: 'shard' });
      fx.ring(c, null, COLORS[this.shieldColor].hex, { size: 0.5, end: 3, life: 0.35, thick: 0.15, k: 1.5 });
      sfx('mummy_shield_break', 0.8 * Math.max(0.4, falloff(this.dist, 4, 40)), { alt: 'shield_break', altRate: 1.3, synth: () => audio.shieldBreak() });
      this.stagger = 0.8;
      this.lean = 1;
      this.castCool = Math.max(this.castCool, 1.2);
    }
    if (this.state === 'shield') this.setState('engage');
  }

  interrupt() {
    director.release(this);
    this.castCool = Math.max(this.castCool, 1);
    this.setState('engage');
  }

  animate(dt, player) {
    this.poseBase(dt);
    const n = this.n;
    const s = this.state;
    const d = Math.max(1, Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z));
    const pitch = Math.atan2(player.pos.y + player.eye * 0.6 - (this.pos.y + 1.7), d);
    // arms: raised forward to cast, crossed over the chest to ward, thrown out while shielded
    let lx = this.armSwing * 0.7 - 0.1, rx = -this.armSwing * 0.7 - 0.1, ly = 0, ry = 0, lz = 0.12, rz = -0.12, fl = -0.25, fr = -0.25;
    if (s === 'cast') {
      const k = Math.min(1, this.stateT / 0.25);
      const shake = Math.sin(this.t * 40) * 0.03;
      lx = rx = THREE.MathUtils.lerp(lx, -Math.PI / 2 - pitch - 0.35, k) + shake;
      ly = -0.2 * k;
      ry = 0.2 * k;
      fl = fr = -0.15 * k;
    } else if (s === 'release') {
      lx = rx = -Math.PI / 2 - pitch + 0.2;
      ly = -0.35;
      ry = 0.35;
      fl = fr = 0;
    } else if (s === 'ward') {
      lx = rx = -1.3;
      ly = -0.9;
      ry = 0.9;
      fl = fr = -1.4;
    } else if (s === 'shield') {
      lx = rx = -1.0;
      lz = 0.9;
      rz = -0.9;
      fl = fr = -0.3;
    }
    const sm = Math.min(1, dt * 14);
    n.armL.rotation.set(THREE.MathUtils.lerp(n.armL.rotation.x, lx - this.tuck * 1.2, sm), THREE.MathUtils.lerp(n.armL.rotation.y, ly, sm), THREE.MathUtils.lerp(n.armL.rotation.z, lz, sm));
    n.armR.rotation.set(THREE.MathUtils.lerp(n.armR.rotation.x, rx - this.tuck * 1.2, sm), THREE.MathUtils.lerp(n.armR.rotation.y, ry, sm), THREE.MathUtils.lerp(n.armR.rotation.z, rz, sm));
    n.foreL.rotation.x = THREE.MathUtils.lerp(n.foreL.rotation.x, fl - this.tuck * 1.4, sm);
    n.foreR.rotation.x = THREE.MathUtils.lerp(n.foreR.rotation.x, fr - this.tuck * 1.4, sm);
    n.head.rotation.x = -pitch * 0.5 * (this.aggro ? 1 : 0);
    n.head.rotation.z = Math.sin(this.t * 0.8) * 0.06; // an eerie tilt
    // the eye and palms burn brighter as it casts
    const charge = s === 'cast' ? this.stateT / CAST_T : 0;
    if (this.flash > 0) this.m.glow.color.setRGB(3, 3, 3);
    else if (this.immuneFlash > 0) this.m.glow.color.setRGB(0.7, 0.7, 0.8);
    else this.m.glow.color.copy(glowHex(this.color, 2.4 + charge * 2));
    // shield plates orbit
    if (this.shieldUp) {
      const k = Math.min(1, this.stateT / 0.2);
      const fade = this.stateT > SHIELD_T - 0.4 ? (Math.sin(this.t * 40) > 0 ? 1 : 0.4) : 1; // flickers before it drops
      this.plates.forEach((p, i) => {
        const a = p.userData.a + this.t * (i % 2 ? 2.2 : -1.7);
        p.position.set(Math.cos(a) * 1.0 * k, p.userData.y + Math.sin(this.t * 3 + i) * 0.08, Math.sin(a) * 1.0 * k);
        p.rotation.set(0, -a + Math.PI / 2, 0);
      });
      this.shieldMat.opacity = 0.3 * fade;
      const sc = this.shieldColor ?? this.color;
      this.plateMat.emissive.copy(glowHex(sc, (0.25 + (this.shieldFlash || 0) * 2) * fade));
      this.shieldFlash = Math.max(0, (this.shieldFlash || 0) - dt * 6);
      if (Math.random() < dt * 12) sandPuff(this.world.fx, _w.copy(this.pos).setY(this.pos.y + rnd(0.2, 2)), 1, 0.3, 0.35, 0.6);
    }
    this.ribbons.mesh.visible = true;
    if (this.dist < 45) this.ribbons.update(dt, this.t);
  }

  idleFar() {
    this.ribbons.mesh.visible = false;
  }

  onHit(color, hit) {
    if (this.dead) return undefined;
    if (!this.aggro) this.onAlert();
    if (this.shieldUp) {
      // only the shield's color does anything to it
      if (this.shieldColor !== null && color === this.shieldColor) {
        this.shieldHp--;
        this.shieldFlash = 1;
        this.world.fx.burst(hit?.point ?? this.center(_w), SAND, { count: 12, speed: 5, life: 0.4, size: 0.25, gravity: 6 });
        audio.droneHit(0.6 * Math.max(0.5, falloff(this.dist, 6, 40)));
        if (this.shieldHp <= 0) this.dropShield(true);
        return 'hit';
      }
      this.world.fx.burst(hit?.point ?? this.center(_w), SAND, { count: 6, speed: 3, life: 0.3, size: 0.2, gravity: 6 });
      return this.immune();
    }
    if (color !== this.color) {
      if (this.rollCool <= 0 && this.canDodge() && Math.random() < 0.4) this.tryRoll(this.world.game.player);
      return this.immune();
    }
    const r = this.takeHit(hit, { stagger: 0.28, knock: 1.8, keep: this.state === 'ward' });
    if (r === 'hit' && this.hp >= 2 && this.shieldCool <= 0 && Math.random() < 0.55) this.wardNext = true;
    return r;
  }

  onDie() {
    this.dropShield(false);
    sfx('mummy_death', 0.7 * Math.max(0.3, falloff(this.dist, 5, 45)), { synth: (g) => {
      audio.noise({ dur: 1.2, gain: 0.25 * g, freq: 700, f2: 150, q: 0.6, type: 'lowpass' });
      audio.tone({ type: 'sawtooth', f: 140, f2: 50, dur: 0.9, gain: 0.06 * g });
    } });
  }

  dyingFx(dt, k) {
    // sand pours from the joints; the eye gutters out
    if (Math.random() < dt * 30) sandPuff(this.world.fx, this.center(_w).setY(this.pos.y + rnd(0.4, 1.8)), 0.6, 0.2, 0.4, 0.9);
    this.m.glow.color.copy(glowHex(this.color, Math.random() < 0.3 ? 2 : 0.3 * (1 - k)));
    this.ribbons.update(dt, this.t);
  }

  // it crumbles into a slump of sand and loose wrappings
  finishDeath() {
    const c = this.center(new THREE.Vector3());
    const fx = this.world.fx;
    for (let i = 0; i < 18; i++) sandPuff(fx, _w.copy(c).setY(this.pos.y + rnd(0.2, 1.6)), 1.8, 0.8, 0.7, 1.6);
    fx.burst(c, SAND, { count: 50, speed: 5, life: 1, size: 0.3, gravity: 10 });
    fx.burst(c, COLORS[this.color].hex, { count: 20, speed: 4, life: 0.6, size: 0.3, gravity: 4 });
    fx.flash(c, COLORS[this.color].hex, { size: 1.6, life: 0.2, k: 1.6 });
    this.ribbons.mesh.visible = false;
    const n = this.n;
    this.scatter([n.head, n.armL, n.armR, n.legL, n.legR, n.torso, n.pelvis], this.deathDir.clone().multiplyScalar(1), { speed: 2.5, up: 0.4, life: 1.4, spin: 5 });
  }

  cool(t) {
    this.m.glow.color.copy(glowHex(this.color, Math.max(0, 1 - t) * 0.5));
  }

  resetExtra() {
    this.dropShield(false);
    this.shieldCool = 0.5;
    this.castCool = rnd(1, 2);
    this.wardNext = false;
    this.stagger = 0;
    this.ribbons.placed = false;
  }

  disposeExtra() {
    this.ribbons.dispose(this.world.scene);
  }
}
