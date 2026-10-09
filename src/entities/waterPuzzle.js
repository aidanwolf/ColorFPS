// WATER PUZZLES (the Cold Deep): the pieces Azure's puzzles are built from. Everything here is driven by
// the water cannon (weapons/hose.js calls entity.onWater(dt, hit) every frame its stream lands on one)
// and by world.wet (puddles, slicks and shock water: wet.js). All of them reset() on a checkpoint
// respawn unless they've been solved (a solved puzzle stays solved).
//
// WaterTank   { pos (bottom centre), size: [w, h, d], capacity: 6, leak: 0, latch: true, face: '+z',
//               onFull, onLevel(k) }
//    A glass ballast tank (or a bucket on a chain) you fill with the stream: spray into its mouth (or the
//    top of its walls) and the water inside rises, a gauge on its face lights up, and it overflows once
//    full. capacity = seconds of stream from empty to full; leak = how much of it drains a second (0 = a
//    sealed tank). latch: once full it stays full. level 0..1, full, setY(y) moves it (buckets).
// PulleyGate  { min, max (the closed gate), rise, tanks: [WaterTank], drop: 1.2, anchors: [[x, y, z]],
//               pulley: [x, y, z], latchAt: 0.97, onOpen }
//    A heavy gate on a chain over a pulley; the chains' other ends carry the tanks as counterweights. As
//    they fill they sink `drop` m and the gate rises by rise × (the emptiest tank's level), so with two
//    tanks they must both be full together (balance them). Once it's fully up it latches open.
// RoboSeal    { water: [x, y, z] (where it floats), route: [[x, y, z], ...] (route[0] = the haul-out spot
//               on land at the water's edge, the last point = its goal; y = the floor), onArrive, carry }
//    A friendly maintenance robot that can only move on WET ground. It waits in the water by its
//    haul-out spot; spray a puddle there and it hauls out, and from then on it slides along its route
//    for as long as the floor ahead of it is wet: you paint the path, it follows. At the goal it works
//    the valve (onArrive) and flops back home. carry: it carries a power cell on its back to plug in.
//    flee(): a chaser caught it; it bolts back to the water (and its cell with it) to try again.
// ScrapCrawler { route, s, seal, color: BLUE, shields: [outer, ..., inner], hp }
//    A low, fast crawler that hunts a RoboSeal along its own route (catching it where they meet) (and bites anyone in its way: one bite
//    kills). Blue body; each shield layer pops only to its own color, the bare body only to blue; any
//    other color glances off and enrages it (a burst of speed). Slicks trip it up; shock water fries it.
// Junction   { min, max, live: false, cooldown: 8, oneShot: false, surge: 4, onShort, onRearm, kind: 'box' |
//               'breaker' | 'conduit', face: '+z', cable: [x, y, z] }
//    An electrical component: a world.wet shocker with a body. Spray it and it shorts: sparks fly and the
//    water at its foot goes live for a few seconds, and the charge runs through every puddle touching
//    that one (for `surge` s). Then it's spent for `cooldown` s (oneShot: for good, e.g. a breaker that cuts a door's
//    power). live: true makes it charge every puddle that touches it all the time (a live cable).
// LivePool   { min: [x1, y, z1], max: [x2, y, z2] (y = the floor under it), live: true }
//    A flooded floor carrying current: step in it (or let a robot walk in) while it's live and you're
//    fried. Puddles sprayed up against it go live too. pool.live = false makes it plain water.
// Forcefield { min, max, color } a crackling energy door that stops everything; on() / off().
// Gantry     { min, max (extended), from: [dx, dy, dz] (offset when stowed), speed } a bridge that slides
//               out on extend() (riders carried) and stows on retract().
// LeapHint   { from, to, short } ghost arcs over a gap: a dry sprint jump falling short (marked TOO FAR),
//               and the slick leap that makes it; hide() once it's been done.
// IcePlug    { min, max, heat, onMelt } a frozen pipe mouth the yellow sun beam thaws (onBeam).
//    (WaterTank.feed: level a second poured in from a pipe, e.g. once a plug has melted.)
import * as THREE from 'three';
import { COLORS, BLUE } from '../colors.js';
import { audio } from '../audio.js';
import { SynthLoop, noiseVoice } from '../weapons/rays.js';
import { mat } from '../materials.js';
import { ColorShield } from './colorShield.js';
import { edeath } from './enemySfx.js';

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const v3 = (p) => (p.isVector3 ? p.clone() : V(...p));
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = THREE.MathUtils.clamp;
const BLUE_HEX = COLORS[BLUE].hex;
const SOUNDS = ['seal_chirp', 'seal_alarm', 'tank_fill', 'breaker_trip', 'crab_chirp', 'critter_hit', 'fish_alert', 'switch_on', 'hydraulic_hiss', 'gate_open', 'elevator_loop', 'energy_crackle', 'joint_sparks', 'shield_break', 'shield_absorb', 'ricochet', 'crab_skitter', 'crab_explode', 'phase_in', 'phase_out', 'servo_heavy', 'mover_step'];
audio.manifest?.then(() => audio.prefetch(SOUNDS));
// how loud something at p is for the player (the camera)
function gainAt(game, p, far = 40) {
  return clamp(1.15 - p.distanceTo(game.camera.position) / far, 0, 1);
}

// ---------------------------------------------------------------- shared materials (made once)
let M = null;
function mats() {
  if (M) return M;
  M = {
    steel: new THREE.MeshStandardMaterial({ color: 0x3a465c, roughness: 0.32, metalness: 0.75 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x161b25, roughness: 0.5, metalness: 0.6 }),
    rust: new THREE.MeshStandardMaterial({ color: 0x5a4a3e, roughness: 0.55, metalness: 0.55 }),
    glass: new THREE.MeshStandardMaterial({ color: 0xa9d8ff, transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.2, depthWrite: false }),
    water: new THREE.MeshStandardMaterial({ color: 0x1a66c8, emissive: 0x0b3c8a, emissiveIntensity: 0.7, transparent: true, opacity: 0.82, roughness: 0.08, metalness: 0.1 }),
    glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(BLUE_HEX).multiplyScalar(2.2) }),
    glowDim: new THREE.MeshBasicMaterial({ color: new THREE.Color(BLUE_HEX).multiplyScalar(0.35) }),
    white: new THREE.MeshBasicMaterial({ color: 0xdfe6ff }),
    ceramic: new THREE.MeshStandardMaterial({ color: 0xd6e0ea, roughness: 0.35, metalness: 0.05 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x101217, roughness: 0.95 }),
    hazard: mat('hazard', 'blue'),
    sealHide: new THREE.MeshStandardMaterial({ color: 0x2a3a52, roughness: 0.25, metalness: 0.55 }),
    sealBelly: new THREE.MeshStandardMaterial({ color: 0xc4d2e4, roughness: 0.3, metalness: 0.3 }),
    sealEye: new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9ff4ff).multiplyScalar(1.8) }),
    cell: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd23a).multiplyScalar(2) }),
    chain: new THREE.MeshStandardMaterial({ color: 0x23272f, roughness: 0.4, metalness: 0.85 }),
  };
  return M;
}
const box = (w, h, d, m, x = 0, y = 0, z = 0) => {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z);
  return o;
};
const noRay = (o) => (o.traverse((c) => (c.raycast = () => {})), o);

// a little canvas icon (a water drop) that floats over the seal while it waits for water
let dropTex = null;
function dropTexture() {
  if (dropTex) return dropTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(10,30,60,0.55)';
  g.beginPath();
  g.arc(32, 32, 30, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#7fd8ff';
  g.beginPath();
  g.moveTo(32, 9);
  g.bezierCurveTo(44, 26, 48, 34, 48, 40);
  g.arc(32, 40, 16, 0, Math.PI);
  g.bezierCurveTo(16, 34, 20, 26, 32, 9);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.8)';
  g.beginPath();
  g.arc(26, 41, 4, 0, Math.PI * 2);
  g.fill();
  dropTex = new THREE.CanvasTexture(c);
  dropTex.colorSpace = THREE.SRGBColorSpace;
  return dropTex;
}

// ================================================================== WATER TANK
export class WaterTank {
  constructor(world, game, { pos, size = [1.6, 1.8, 1.6], capacity = 6, leak = 0, latch = true, face = '+z', onFull = null, onLevel = null }) {
    this.world = world;
    this.game = game;
    const m = mats();
    this.base = v3(pos);
    this.pos = this.base.clone();
    this.size = size;
    this.capacity = capacity;
    this.leakRate = leak;
    this.latch = latch;
    this.onFull = onFull;
    this.onLevel = onLevel;
    this.level = 0;
    this.shown = 0;
    this.full = false;
    this.latched = false;
    this.fillT = 0;
    this.feed = 0;
    this.solved = false;
    const [w, h, d] = size;
    this.group = new THREE.Group();
    // the frame: a heavy base, corner posts and a rim; glass walls; the water inside
    this.group.add(box(w + 0.1, 0.22, d + 0.1, m.steel, 0, 0.11, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.group.add(box(0.14, h, 0.14, m.steel, (sx * (w - 0.04)) / 2, h / 2, (sz * (d - 0.04)) / 2));
    for (const sz of [-1, 1]) this.group.add(box(w + 0.14, 0.14, 0.14, m.steel, 0, h - 0.07, (sz * (d - 0.04)) / 2));
    for (const sx of [-1, 1]) this.group.add(box(0.14, 0.14, d + 0.14, m.steel, (sx * (w - 0.04)) / 2, h - 0.07, 0));
    // hoop bands round the middle
    for (const y of [h * 0.36, h * 0.7]) {
      this.group.add(box(w + 0.06, 0.06, 0.06, m.dark, 0, y, d / 2));
      this.group.add(box(w + 0.06, 0.06, 0.06, m.dark, 0, y, -d / 2));
    }
    const glass = box(w - 0.08, h - 0.3, d - 0.08, m.glass, 0, 0.22 + (h - 0.3) / 2, 0);
    glass.renderOrder = 3;
    this.group.add(glass);
    this.water = box(w - 0.16, 1, d - 0.16, m.water, 0, 0, 0);
    this.water.renderOrder = 2;
    this.water.visible = false;
    this.group.add(this.water);
    // the gauge on its face: a dim channel, a lit bar rising in it, and ticks every quarter
    const fz = face === '-z' ? -1 : 1;
    this.gaugeH = h - 0.5;
    this.group.add(box(0.16, this.gaugeH + 0.06, 0.03, m.dark, 0, 0.25 + this.gaugeH / 2, fz * (d / 2 + 0.06)));
    this.gaugeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(BLUE_HEX).multiplyScalar(2.2) });
    this.gauge = box(0.1, 1, 0.03, this.gaugeMat, 0, 0, fz * (d / 2 + 0.08));
    this.group.add(this.gauge);
    for (let i = 1; i <= 4; i++) this.group.add(box(0.26, 0.025, 0.03, i === 4 ? m.white : m.glowDim, 0, 0.25 + (this.gaugeH * i) / 4, fz * (d / 2 + 0.085)));
    // a ring of light round the mouth that pulses while it wants water
    this.mouthMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(BLUE_HEX).multiplyScalar(1.6), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(Math.min(w, d) * 0.42, 0.04, 4, 24), this.mouthMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = h + 0.25;
    this.ring = ring;
    this.group.add(ring);
    noRay(this.group);
    this.group.position.copy(this.pos);
    world.scene.add(this.group);
    this.solid = world.addSolid(V(), V(), { entity: this, kind: 'metal' });
    this.placeSolid();
    this.loop = new SynthLoop(noiseVoice('bandpass', 420, 2.2));
    world.add(this);
  }

  get top() {
    return this.pos.y + this.size[1];
  }

  placeSolid() {
    const [w, h, d] = this.size;
    this.solid.min.set(this.pos.x - w / 2 - 0.05, this.pos.y, this.pos.z - d / 2 - 0.05);
    this.solid.max.set(this.pos.x + w / 2 + 0.05, this.pos.y + h, this.pos.z + d / 2 + 0.05);
  }

  setY(y) {
    if (Math.abs(y - this.pos.y) < 1e-5) return;
    this.pos.y = y;
    this.group.position.y = y;
    this.placeSolid();
  }

  // the stream: into the mouth (or over the top of the walls) it fills; lower down it just splashes
  onWater(dt, hit) {
    if (hit.normal.y < 0.5 && hit.point.y < this.top - 0.75) return;
    this.fillT = 0.12;
    if (this.latched) return;
    this.level = Math.min(1, this.level + dt / this.capacity);
  }

  update(dt, player) {
    const fx = this.world.fx;
    // a pipe pouring into it (feed: level a second) counts as filling
    if (this.feed > 0 && !this.latched) {
      this.level = Math.min(1, this.level + this.feed * dt);
      this.fillT = Math.max(this.fillT, 0.05);
    }
    const filling = this.fillT > 0;
    this.fillT -= dt;
    if (!filling && !this.latched && this.leakRate > 0 && this.level > 0) this.level = Math.max(0, this.level - this.leakRate * dt);
    if (this.level >= 1 && !this.full) {
      this.full = true;
      if (this.latch) this.latched = true;
      audio.sample('switch_on', { gain: 0.8 * gainAt(this.game, this.pos), rate: 0.8, vary: 0 });
      fx.burst(_v.set(this.pos.x, this.top + 0.1, this.pos.z), 0xcfeeff, { count: 30, speed: 3, life: 0.7, size: 0.1, gravity: 9, dir: UP });
      this.onFull?.(this);
    } else if (this.level < 0.995) this.full = false;
    this.shown += (this.level - this.shown) * Math.min(1, dt * 6);
    const [, h] = this.size;
    const wh = Math.max(0.001, this.shown * (h - 0.3));
    this.water.visible = this.shown > 0.005;
    this.water.scale.y = wh;
    this.water.position.y = 0.22 + wh / 2;
    this.gauge.scale.y = Math.max(0.001, this.shown * this.gaugeH);
    this.gauge.position.y = 0.25 + (this.shown * this.gaugeH) / 2;
    const pulse = 0.55 + 0.45 * Math.sin(this.world.time * 5);
    this.gaugeMat.color.setHex(BLUE_HEX).multiplyScalar(this.full ? 2.6 : 1.2 + 1.2 * this.shown * (filling ? pulse : 1));
    this.ring.visible = !this.latched;
    this.mouthMat.opacity = (this.full ? 0.15 : 0.35 + 0.35 * pulse) * (1 - this.shown * 0.5);
    this.ring.scale.setScalar(1 + 0.08 * pulse);
    this.onLevel?.(this.shown, this);
    // overflow: water spilling over the rim while you keep spraying a full tank
    if (filling && this.level >= 1 && Math.random() < dt * 40) {
      const [w, , d] = this.size, side = Math.random() < 0.5 ? -1 : 1;
      _v.set(this.pos.x + (Math.random() < 0.5 ? side * w * 0.5 : rnd(-w, w) * 0.5), this.top, this.pos.z + (Math.random() < 0.5 ? rnd(-d, d) * 0.5 : side * d * 0.5));
      const k = fx.spawn(0, _v, rnd(-0.6, 0.6), rnd(0.2, 1), rnd(-0.6, 0.6), new THREE.Color(0xbfe6ff), 0.9, rnd(0.4, 0.8), rnd(0.02, 0.04));
      fx.grav[k] = 9;
    }
    // the gurgle of it filling, rising in pitch with the level
    // (tank_fill once generated; a band of noise rising with the level until then)
    const g = filling && !this.latched && this.level < 1 ? 0.12 * gainAt(this.game, this.pos, 30) : 0;
    if (audio.available?.has('tank_fill')) {
      if (g > 0.01) this.fillLoop ??= audio.createLoop('tank_fill', { gain: 0 });
      this.fillLoop?.setGain(g * 4);
      this.fillLoop?.setRate(0.85 + this.level * 0.4);
    } else {
      this.loop.set(g, dt);
      this.loop.v?.filter?.frequency.setTargetAtTime(380 + this.level * 900, audio.ctx.currentTime, 0.1);
    }
  }

  reset() {
    if (this.solved) return;
    this.level = this.shown = 0;
    this.full = this.latched = false;
  }
}

// ================================================================== PULLEY GATE
export class PulleyGate {
  constructor(world, game, { min, max, rise, tanks, drop = 1.2, anchors = [], pulley = null, latchAt = 0.97, onOpen = null, zone = 'blue' }) {
    this.world = world;
    this.game = game;
    const m = mats();
    this.min0 = v3(min);
    this.max0 = v3(max);
    this.rise = rise;
    this.tanks = tanks;
    this.drop = drop;
    this.latchAt = latchAt;
    this.onOpen = onOpen;
    this.k = 0;
    this.open = false;
    this.tankY = tanks.map((t) => t.base.y);
    const sx = this.max0.x - this.min0.x, sy = this.max0.y - this.min0.y, sz = this.max0.z - this.min0.z;
    // the gate: a ribbed steel slab, hazard-striped along its foot
    this.group = new THREE.Group();
    this.group.add(box(sx, sy, sz, mat('metal', zone)));
    const alongX = sx >= sz;
    for (let i = 1; i < 5; i++) this.group.add(box(alongX ? sx + 0.04 : sx + 0.08, 0.08, alongX ? sz + 0.08 : sz + 0.04, m.dark, 0, -sy / 2 + (sy * i) / 5, 0));
    this.group.add(box(alongX ? sx + 0.02 : sx + 0.1, 0.35, alongX ? sz + 0.1 : sz + 0.02, m.hazard, 0, -sy / 2 + 0.2, 0));
    this.lipMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff4a2a).multiplyScalar(2) });
    this.group.add(box(alongX ? sx + 0.04 : sx + 0.12, 0.08, alongX ? sz + 0.12 : sz + 0.04, this.lipMat, 0, -sy / 2 + 0.04, 0));
    this.center = this.min0.clone().add(this.max0).multiplyScalar(0.5);
    this.group.position.copy(this.center);
    noRay(this.group);
    world.scene.add(this.group);
    this.solid = world.addSolid(this.min0.clone(), this.max0.clone(), { kind: 'metal' });
    // chains: from each tank's top up to its anchor wheel, and from the pulley down to the gate
    this.pulley = pulley ? v3(pulley) : this.center.clone().setY(this.max0.y + 1.5);
    this.anchors = anchors.map(v3);
    this.chains = [];
    const chainGeo = new THREE.CylinderGeometry(0.045, 0.045, 1, 6).translate(0, -0.5, 0);
    const wheelGeo = new THREE.TorusGeometry(0.36, 0.09, 6, 16);
    this.wheels = [];
    for (const a of [this.pulley, ...this.anchors]) {
      const wheel = new THREE.Mesh(wheelGeo, m.steel);
      wheel.position.copy(a);
      wheel.rotation.y = alongX ? 0 : Math.PI / 2;
      this.wheels.push(wheel);
      world.scene.add(noRay(wheel));
    }
    for (let i = 0; i < 1 + this.anchors.length; i++) {
      const c = new THREE.Mesh(chainGeo, m.chain);
      world.scene.add(noRay(c));
      this.chains.push(c);
    }
    this.place();
    world.add(this);
  }

  get frac() {
    let k = 1;
    for (const t of this.tanks) k = Math.min(k, t.shown);
    return k;
  }

  place() {
    const y = this.k * this.rise;
    this.group.position.y = this.center.y + y;
    this.solid.min.y = this.min0.y + y;
    this.solid.max.y = this.max0.y + y;
    // the gate's chain: from the pulley down to the gate's top
    const top = this.max0.y + y;
    const c0 = this.chains[0];
    c0.position.copy(this.pulley);
    c0.scale.y = Math.max(0.05, this.pulley.y - top);
    this.tanks.forEach((t, i) => {
      const a = this.anchors[i];
      if (!a) return;
      t.setY(this.tankY[i] - this.drop * t.shown);
      const c = this.chains[i + 1];
      c.position.copy(a);
      c.scale.y = Math.max(0.05, a.y - t.top - 0.25);
    });
    for (const w of this.wheels) w.rotation.z = -y * 2.5;
  }

  update(dt, player) {
    const want = this.open ? 1 : clamp(this.frac, 0, 1);
    if (!this.open && want >= this.latchAt) {
      this.open = true;
      for (const t of this.tanks) {
        t.latched = true;
        t.level = 1;
        t.solved = true;
      }
      audio.sample('gate_open', { gain: 0.9, vary: 0 }) || audio.doorOpen();
      this.lipMat.color.setHex(0x3aff7a).multiplyScalar(2);
      this.onOpen?.(this);
    }
    const prev = this.k;
    let next = prev + clamp(want - prev, -dt * 0.5, dt * 0.9);
    // never come down on the player
    if (next < prev) {
      const b = player.bounds();
      const y = next * this.rise;
      if (b.max.x > this.min0.x && b.min.x < this.max0.x && b.max.z > this.min0.z && b.min.z < this.max0.z && b.max.y > this.min0.y + y && b.min.y < this.max0.y + y) next = prev;
    }
    this.k = next;
    if (Math.abs(next - prev) > 1e-5) {
      this.place();
      this.moveT = 0.15;
    } else this.place();
    // the grind of the chain while it moves
    this.moveT = (this.moveT || 0) - dt;
    if (this.moveT > 0 && (this.grindT = (this.grindT || 0) - dt) <= 0) {
      this.grindT = 0.32;
      audio.sample('mover_step', { gain: 0.35 * gainAt(this.game, this.center, 30), rate: 0.7, vary: 0.1 });
    }
  }

  reset() {
    if (this.open) return;
    this.k = 0;
    this.place();
  }
}

// ================================================================== route helpers
// A polyline of [x, y, z] points with its length: pointAt(s, out), tangent(s, out), nearest(p).
class Route {
  constructor(points) {
    this.p = points.map(v3);
    this.cum = [0];
    for (let i = 1; i < this.p.length; i++) this.cum.push(this.cum[i - 1] + this.p[i].distanceTo(this.p[i - 1]));
    this.length = this.cum[this.cum.length - 1];
  }

  seg(s) {
    s = clamp(s, 0, this.length);
    let i = 1;
    while (i < this.p.length - 1 && this.cum[i] < s) i++;
    return i;
  }

  pointAt(s, out = new THREE.Vector3()) {
    s = clamp(s, 0, this.length);
    const i = this.seg(s);
    const a = this.p[i - 1], b = this.p[i], l = this.cum[i] - this.cum[i - 1];
    return out.lerpVectors(a, b, l > 0 ? (s - this.cum[i - 1]) / l : 0);
  }

  tangent(s, out = new THREE.Vector3()) {
    const i = this.seg(s);
    return out.subVectors(this.p[i], this.p[i - 1]).setY(0).normalize();
  }

  // the s of the point on the route nearest p (xz)
  nearest(p) {
    let best = 0, bd = Infinity;
    for (let i = 1; i < this.p.length; i++) {
      const a = this.p[i - 1], b = this.p[i];
      const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
      const t = l2 > 0 ? clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / l2, 0, 1) : 0;
      const x = a.x + dx * t, z = a.z + dz * t, d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = this.cum[i - 1] + t * Math.sqrt(l2);
      }
    }
    return best;
  }
}
export { Route };

// ================================================================== ROBO-SEAL
const SEAL_SPEED = 3.3;
export class RoboSeal {
  constructor(world, game, { water, route, onArrive = null, carry = false, name = 'seal' }) {
    this.world = world;
    this.game = game;
    this.home = v3(water);
    this.route = route instanceof Route ? route : new Route(route);
    this.onArrive = onArrive;
    this.carry = carry;
    this.name = name;
    this.state = 'swim';
    this.t = 0;
    this.s = 0;
    this.v = 0;
    this.pos = this.home.clone();
    this.yaw = 0;
    this.done = false;
    this.waitT = 0;
    this.chirpT = 2;
    this.shockT = 0;
    this.hasCell = carry;
    this.build();
    this.dir = new THREE.Vector3(0, 0, -1);
    world.add(this);
  }

  build() {
    const m = mats();
    const g = (this.group = new THREE.Group());
    const body = (this.body = new THREE.Group());
    g.add(body);
    // a sleek torpedo body (forward is -z), a pale belly, a head on a neck joint, flippers and a fluke
    const hide = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10).scale(0.42, 0.36, 0.95), m.sealHide);
    hide.position.set(0, 0.36, 0.05);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45).scale(0.4, 0.34, 0.9), m.sealBelly);
    belly.position.set(0, 0.36, 0.05);
    body.add(hide, belly);
    // a glowing stripe down its back and a maintenance lamp
    body.add(box(0.06, 0.04, 1.3, m.sealEye, 0, 0.73, 0.1));
    const head = (this.head = new THREE.Group());
    head.position.set(0, 0.5, -0.78);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10).scale(1, 0.9, 1.15), m.sealHide);
    const snout = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8).scale(1.1, 0.8, 1.2), m.sealBelly);
    snout.position.set(0, -0.06, -0.27);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), m.dark);
    nose.position.set(0, -0.01, -0.46);
    head.add(skull, snout, nose);
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), m.sealEye);
      eye.position.set(sx * 0.15, 0.07, -0.2);
      head.add(eye);
      // whisker antennae
      const wh = box(0.22, 0.01, 0.01, m.white, sx * 0.2, -0.07, -0.34);
      wh.rotation.y = sx * 0.3;
      head.add(wh);
    }
    const lamp = (this.lamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0x9ff4ff })));
    lamp.position.set(0, 0.32, 0.02);
    head.add(lamp, box(0.03, 0.18, 0.03, m.dark, 0, 0.22, 0.02));
    body.add(head);
    this.flippers = [];
    for (const sx of [-1, 1]) {
      const f = new THREE.Group();
      f.position.set(sx * 0.36, 0.18, -0.38);
      const blade = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6).scale(0.28, 0.04, 0.14), m.sealHide);
      blade.position.set(sx * 0.2, 0, 0.04);
      blade.rotation.y = sx * -0.5;
      f.add(blade);
      body.add(f);
      this.flippers.push(f);
    }
    const tail = (this.tail = new THREE.Group());
    tail.position.set(0, 0.3, 0.92);
    for (const sx of [-1, 1]) {
      const lobe = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6).scale(0.24, 0.035, 0.13), m.sealHide);
      lobe.position.set(sx * 0.17, 0, 0.12);
      lobe.rotation.y = sx * 0.5;
      tail.add(lobe);
    }
    body.add(tail);
    // the power cell it carries, strapped on its back
    this.cell = new THREE.Group();
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.42, 10), m.cell);
    can.rotation.x = Math.PI / 2;
    this.cell.add(can, box(0.34, 0.05, 0.08, m.dark, 0, -0.1, 0));
    this.cell.position.set(0, 0.8, 0.25);
    this.cell.visible = this.hasCell;
    body.add(this.cell);
    // "needs water" bubble
    this.icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: dropTexture(), transparent: true, depthWrite: false, opacity: 0 }));
    this.icon.scale.setScalar(0.55);
    this.icon.position.set(0, 1.55, 0);
    g.add(this.icon);
    g.scale.setScalar(1.25);
    noRay(g);
    g.position.copy(this.pos);
    this.world.scene.add(g);
  }

  wetAt(p) {
    return !!this.world.wet?.puddleAt(_w.set(p.x, p.y + 0.05, p.z));
  }

  get onLand() {
    return this.state === 'slide' || this.state === 'work' || this.state === 'return' || this.state === 'flee';
  }

  chirp(kind = 'happy') {
    const g = gainAt(this.game, this.pos, 35);
    if (g <= 0.02) return;
    // (seal_chirp / seal_alarm once generated; pitched crab chirps until then)
    const chirp = audio.sfxOr('seal_chirp', 'crab_chirp'), own = chirp === 'seal_chirp';
    if (kind === 'happy') audio.sample(chirp, { gain: 0.8 * g, rate: own ? rnd(1.05, 1.2) : rnd(1.5, 1.8), vary: 0.05 });
    else if (kind === 'want') audio.sample(chirp, { gain: 0.6 * g, rate: own ? rnd(0.85, 0.95) : rnd(1.1, 1.25), vary: 0.03 });
    else audio.sample(audio.sfxOr('seal_alarm', 'fish_alert'), { gain: 0.8 * g, rate: own ? 1 : 1.4, vary: 0.05 });
  }

  // a chaser caught it: it bolts back to the water to try again (dropping its cell, if it had one)
  flee() {
    if (!this.onLand || this.state === 'flee' || this.state === 'return') return;
    this.state = 'flee';
    this.t = 0;
    this.chirp('alarm');
    if (this.hasCell) {
      this.hasCell = false;
      this.cell.visible = false;
      this.world.fx.sparks(_v.copy(this.pos).setY(this.pos.y + 0.8), UP, 0xffd23a, { count: 14, speed: 4, life: 0.4 });
    }
  }

  update(dt, player) {
    this.t += dt;
    const fx = this.world.fx;
    const R = this.route;
    let face = null;
    let icon = 0;
    switch (this.state) {
      case 'swim': {
        // bobbing at the surface by its haul-out spot, peering up at you; climbs out onto a puddle there
        const a = this.t * 0.6;
        this.pos.set(this.home.x + Math.cos(a) * 0.4, this.home.y + Math.sin(this.t * 2.1) * 0.06, this.home.z + Math.sin(a) * 0.4);
        face = _a.subVectors(R.p[0], this.pos);
        if (this.done) break;
        icon = 1;
        if (this.wetAt(R.p[0]) && this.t > 0.6) {
          this.state = 'haul';
          this.t = 0;
          this.from = this.pos.clone();
          this.chirp('happy');
          fx.splash?.(this.pos.clone(), 4);
        } else if ((this.chirpT -= dt) <= 0) {
          this.chirpT = 3.5;
          this.chirp('want');
        }
        break;
      }
      case 'haul': {
        // a hop up out of the water onto the wet deck
        const k = Math.min(1, this.t / 0.7);
        this.pos.lerpVectors(this.from, R.p[0], k);
        this.pos.y += Math.sin(k * Math.PI) * 0.7;
        face = _a.subVectors(R.p[0], this.from);
        if (k >= 1) {
          this.state = 'slide';
          this.s = 0;
          this.v = 1.5;
          if (this.carry && !this.hasCell) {
            this.hasCell = true;
            this.cell.visible = true;
          }
        }
        break;
      }
      case 'slide': {
        const atEnd = this.s >= R.length - 0.7;
        const go = this.shockT <= 0 && (this.wetAt(R.pointAt(this.s + 0.7, _b)) || (atEnd && this.wetAt(this.pos)));
        this.v = go ? Math.min(SEAL_SPEED, this.v + dt * 5) : Math.max(0, this.v - dt * 9);
        this.s = Math.min(R.length, this.s + this.v * dt);
        R.pointAt(this.s, this.pos);
        face = R.tangent(this.s, _a);
        if (this.v < 0.1) {
          icon = 1;
          if ((this.chirpT -= dt) <= 0) {
            this.chirpT = 3;
            this.chirp('want');
          }
        } else this.chirpT = Math.min(this.chirpT, 0.8);
        // spray off its belly as it skims the slick
        if (this.v > 1 && Math.random() < dt * 20) fx.burst(_v.copy(this.pos).setY(this.pos.y + 0.05), 0xcfeeff, { count: 2, speed: 2, life: 0.35, size: 0.1, gravity: 9, dir: _w.set(0, 1, 0) });
        if (this.s >= R.length - 0.02) {
          this.state = 'work';
          this.t = 0;
          this.chirp('happy');
        }
        break;
      }
      case 'work': {
        R.pointAt(R.length, this.pos);
        face = R.tangent(R.length, _a);
        if (this.t > 0.8 && !this.worked) {
          this.worked = true;
          if (this.hasCell) {
            this.hasCell = false;
            this.cell.visible = false;
          }
          this.done = true;
          this.onArrive?.(this);
          this.chirp('happy');
        }
        if (this.t > 1.8) {
          this.state = 'return';
          this.t = 0;
        }
        break;
      }
      case 'return':
      case 'flee': {
        // back the way it came, flat out, wet or dry (it flops along on its flippers)
        const sp = this.state === 'flee' ? 4.6 : 2.4;
        this.s = Math.max(0, this.s - sp * dt);
        R.pointAt(this.s, this.pos);
        face = R.tangent(this.s, _a).negate();
        if (this.s <= 0) {
          this.state = 'dive';
          this.t = 0;
          this.from = this.pos.clone();
        }
        break;
      }
      case 'dive': {
        const k = Math.min(1, this.t / 0.6);
        this.pos.lerpVectors(this.from, this.home, k);
        this.pos.y += Math.sin(k * Math.PI) * 0.6;
        face = _a.subVectors(this.home, this.from);
        if (k >= 1) {
          fx.splash?.(this.pos.clone(), 5);
          this.state = 'swim';
          this.t = 0;
          this.worked = false;
          this.chirpT = 2.5;
        }
        break;
      }
    }
    // a jolt of shock water stops it a moment (it's insulated: it only squeaks)
    this.shockT -= dt;
    if (this.onLand && this.world.wet?.anyShock && this.shockT < -0.6 && this.world.wet.shockAt(_v.copy(this.pos).setY(this.pos.y + 0.05))) {
      this.shockT = 0.5;
      this.chirp('alarm');
      fx.sparks(_v.copy(this.pos).setY(this.pos.y + 0.4), UP, 0x9fd0ff, { count: 10, speed: 4, life: 0.3 });
    }
    // pose
    if (face && face.lengthSq() > 1e-6) {
      const want = Math.atan2(-face.x, -face.z);
      let d = want - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * 8);
    }
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
    const moving = this.state === 'slide' ? this.v / SEAL_SPEED : this.state === 'return' || this.state === 'flee' ? 1 : this.state === 'swim' ? 0.3 : 0;
    const w = this.t * (6 + moving * 8);
    this.body.rotation.z = Math.sin(w * 0.5) * 0.08 * moving;
    this.body.position.y = this.state === 'swim' ? -0.42 : 0;
    this.head.rotation.x = this.state === 'swim' ? -0.5 : this.state === 'work' ? Math.sin(this.t * 14) * 0.35 : Math.sin(this.t * 2) * 0.08;
    this.head.rotation.y = icon ? Math.sin(this.t * 1.3) * 0.5 : 0;
    for (const [i, f] of this.flippers.entries()) f.rotation.z = (i ? -1 : 1) * (0.2 + Math.sin(w + i * Math.PI) * 0.35 * Math.max(0.3, moving));
    this.tail.rotation.x = Math.sin(w * 0.8) * 0.3;
    this.lamp.material.color.setHex(this.state === 'flee' ? 0xff4a3a : icon && Math.sin(this.t * 6) > 0 ? 0xffffff : 0x9ff4ff);
    const im = this.icon.material;
    im.opacity += ((icon ? 0.95 : 0) - im.opacity) * Math.min(1, dt * 5);
    this.icon.visible = im.opacity > 0.02;
    this.icon.position.y = 1.55 + Math.sin(this.t * 3) * 0.08 + (this.state === 'swim' ? 0.4 : 0);
  }

  reset() {
    if (this.done) return;
    this.state = 'swim';
    this.t = 0;
    this.s = 0;
    this.v = 0;
    this.worked = false;
    this.hasCell = this.carry;
    this.cell.visible = this.hasCell;
    this.pos.copy(this.home);
  }
}

// ================================================================== SCRAP CRAWLER
let crawlerGeo = null;
function crawlerGeometry() {
  if (crawlerGeo) return crawlerGeo;
  const shell = new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.42, 0.3, 0.55);
  const legs = [];
  for (const sx of [-1, 1]) for (const z of [-0.3, 0, 0.3]) legs.push(new THREE.BoxGeometry(0.36, 0.05, 0.06).translate(sx * 0.4, 0.06, z).rotateZ(sx * -0.3));
  const jaws = [new THREE.ConeGeometry(0.06, 0.28, 4).rotateX(-Math.PI / 2).translate(-0.12, 0.08, -0.58), new THREE.ConeGeometry(0.06, 0.28, 4).rotateX(-Math.PI / 2).translate(0.12, 0.08, -0.58)];
  crawlerGeo = { shell, legs: mergeSimple(legs), jaws: mergeSimple(jaws), eye: new THREE.BoxGeometry(0.34, 0.05, 0.05).translate(0, 0.2, -0.47) };
  return crawlerGeo;
}
function mergeSimple(geos) {
  const out = new THREE.BufferGeometry();
  const pos = [], nor = [];
  for (const g0 of geos) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    pos.push(...g.attributes.position.array);
    nor.push(...g.attributes.normal.array);
  }
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}

export class ScrapCrawler {
  constructor(world, game, { route, s = 0, seal = null, color = BLUE, shields = [], hp = 2, speed = 2.6, onDeath = null }) {
    this.world = world;
    this.game = game;
    this.route = route instanceof Route ? route : new Route(route);
    this.s = s;
    this.seal = seal;
    this.color = color;
    this.shields = [...shields];
    this.hp = hp;
    this.speed = speed;
    this.onDeath = onDeath;
    this.pos = this.route.pointAt(s);
    this.floorY = this.pos.y;
    this.grounded = true;
    this.dead = false;
    this.biteT = 1;
    this.rageT = 0;
    this.lungeT = 0;
    this.t = Math.random() * 10;
    const G = crawlerGeometry(), m = mats();
    this.group = new THREE.Group();
    this.bodyMat = new THREE.MeshStandardMaterial({ color: 0x1d2a40, roughness: 0.35, metalness: 0.6, emissive: new THREE.Color(COLORS[color].hex), emissiveIntensity: 0.12 });
    this.eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS[color].hex).multiplyScalar(2.4) });
    const shell = new THREE.Mesh(G.shell, this.bodyMat);
    shell.position.y = 0.12;
    this.legs = new THREE.Mesh(G.legs, m.dark);
    this.group.add(shell, this.legs, new THREE.Mesh(G.jaws, m.steel), new THREE.Mesh(G.eye, this.eyeMat));
    // layered hard-light shells (colorShield.js), shot off outermost first
    this.colorShield = this.shields.length ? new ColorShield(this, { shields: this.shields, hp: 1 }, { parent: this.group, center: [0, 0.28, 0], size: [0.6, 0.42, 0.72] }) : null;
    this.dist = 10;
    this.group.userData.hit = this;
    this.group.position.copy(this.pos);
    world.scene.add(this.group);
    world.addHittable(this.group);
    world.add(this);
  }

  center(out = _v) {
    return out.copy(this.pos).setY(this.pos.y + 0.3);
  }

  onHit(color, hit) {
    if (this.dead) return 'kill';
    const fx = this.world.fx;
    const r = this.colorShield?.up ? this.colorShield.hit(color, hit) : color === this.color ? null : 'immune';
    if (r === 'immune') {
      // the wrong color glances off and makes it angry
      this.rageT = 2;
      fx.sparks(hit?.point || this.center(), hit?.normal || UP, COLORS[color].hex, { count: 6, speed: 6 });
      return 'immune';
    }
    if (r) return r;
    if (--this.hp <= 0) {
      this.die();
      return 'kill';
    }
    fx.sparks(this.center(), UP, COLORS[this.color].hex, { count: 8, speed: 5 });
    return 'hit';
  }

  onShock() {
    if (this.dead) return;
    this.world.wet?.arc(this.center(_a), _b.copy(this.pos).setY(this.floorY + 0.02).add(_c.set(rnd(-0.6, 0.6), 0, rnd(-0.6, 0.6))));
    this.die(true);
  }

  die(fried = false) {
    if (this.dead) return;
    this.dead = true;
    const fx = this.world.fx, p = this.center();
    fx.burst(p, fried ? 0x9fd0ff : COLORS[this.color].hex, { count: 30, speed: 6, life: 0.6, size: 0.18, gravity: 6 });
    fx.sparks(p, UP, 0xcfe8ff, { count: 18, speed: 8, life: 0.4 });
    fx.flash(p, fried ? 0xcfe8ff : COLORS[this.color].hex, { size: 1.4, life: 0.15 });
    audio.sample(fried ? 'joint_sparks' : 'crab_explode', { gain: 0.8 * gainAt(this.game, this.pos), rate: fried ? 1.2 : 1.5, vary: 0.1 });
    edeath('death_crawler', p, 1, fried ? 1.15 : 1);
    this.dispose();
    this.onDeath?.(this);
  }

  dispose() {
    this.world.scene.remove(this.group);
    this.world.removeHittable(this.group);
    this.world.remove(this);
    this.bodyMat.dispose();
    this.eyeMat.dispose();
    this.colorShield?.dispose();
  }

  despawn() {
    if (this.dead) return;
    this.dead = true;
    this.dispose();
  }

  update(dt, player) {
    if (this.dead) return;
    this.t += dt;
    this.biteT -= dt;
    this.rageT -= dt;
    const R = this.route, seal = this.seal;
    // the target: the seal while it's out on the deck, else whoever is nearest along the route
    const ps = R.nearest(player.pos);
    const playerNear = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z) < 7 && Math.abs(player.pos.y - this.pos.y) < 2.5;
    const target = seal && seal.onLand && !playerNear ? R.nearest(seal.pos) : ps;
    const slick = this.world.wet?.count ? this.world.wet.slickAt(_v.set(this.pos.x, this.floorY + 0.05, this.pos.z)) : 0;
    let sp = this.speed * (this.rageT > 0 ? 1.6 : 1) * (slick > 0.4 ? 0.45 : 1);
    if (this.lungeT > 0) sp = 0;
    const d = target - this.s;
    if (Math.abs(d) > 0.6) this.s += Math.sign(d) * Math.min(Math.abs(d) - 0.5, sp * dt);
    R.pointAt(this.s, this.pos);
    // off the route toward the player when it's right there (so it can't be dodged by stepping aside)
    if (playerNear) {
      _a.set(player.pos.x - this.pos.x, 0, player.pos.z - this.pos.z);
      const l = _a.length();
      if (l > 0.01) this.pos.addScaledVector(_a.normalize(), Math.min(l * 0.5, 1.2));
      // keep it on the floor it's walking on
      const s = this.world.pointInSolid(_v.set(this.pos.x, this.floorY - 0.05, this.pos.z));
      if (!s) R.pointAt(this.s, this.pos);
    }
    this.floorY = this.pos.y;
    // catch the seal
    if (seal && seal.onLand && seal.state !== 'flee' && Math.hypot(seal.pos.x - this.pos.x, seal.pos.z - this.pos.z) < 1.15) seal.flee();
    // bite: a short lunge telegraphed by its eye flaring
    const dp = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    if (this.lungeT > 0) {
      this.lungeT -= dt;
      if (this.lungeT <= 0 && dp < 1.5 && Math.abs(player.pos.y - this.pos.y) < 1.4 && !player.dead) player.damage(1, 'crawler');
    } else if (dp < 1.6 && this.biteT <= 0 && Math.abs(player.pos.y - this.pos.y) < 1.4) {
      this.lungeT = 0.45;
      this.biteT = 1.4;
      audio.sample('crab_skitter', { gain: 0.6 * gainAt(this.game, this.pos), rate: 1.6, vary: 0.1 });
    }
    // pose
    const tg = R.tangent(this.s, _a);
    const face = playerNear ? _b.set(player.pos.x - this.pos.x, 0, player.pos.z - this.pos.z) : d < 0 ? tg.negate() : tg;
    if (face.lengthSq() > 1e-6) this.group.rotation.y = Math.atan2(-face.x, -face.z);
    this.group.position.copy(this.pos);
    this.legs.position.y = Math.abs(Math.sin(this.t * 22)) * 0.03;
    this.group.rotation.z = slick > 0.4 ? Math.sin(this.t * 9) * 0.25 : 0;
    this.eyeMat.color.setHex(COLORS[this.color].hex).multiplyScalar(this.lungeT > 0 ? 5 : this.rageT > 0 ? 3.5 : 2.4);
    this.dist = dp;
    this.colorShield?.update(dt);
  }
}

// ================================================================== JUNCTION (an electrical component)
export class Junction {
  constructor(world, game, { min, max, live = false, cooldown = 8, oneShot = false, onShort = null, onRearm = null, kind = 'box', face = '+z', cable = null, surge = 4 }) {
    this.world = world;
    this.game = game;
    this.min = v3(min);
    this.max = v3(max);
    this.live = live;
    this.cooldown = cooldown;
    this.oneShot = oneShot;
    this.onShort = onShort;
    this.onRearm = onRearm;
    this.surge = surge;
    this.kind = kind;
    this.spent = 0;
    this.tripped = false;
    this.t = Math.random() * 10;
    const m = mats();
    const sx = this.max.x - this.min.x, sy = this.max.y - this.min.y, sz = this.max.z - this.min.z;
    this.center = this.min.clone().add(this.max).multiplyScalar(0.5);
    this.foot = this.center.clone().setY(this.min.y);
    const g = (this.group = new THREE.Group());
    const n = { '+z': V(0, 0, 1), '-z': V(0, 0, -1), '+x': V(1, 0, 0), '-x': V(-1, 0, 0) }[face] || V(0, 0, 1);
    this.n = n;
    this.lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9fd0ff).multiplyScalar(2) });
    if (kind === 'conduit') {
      // a squat transformer: a ribbed drum on a hazard plinth with a stack of insulators, a cable up
      g.add(box(sx + 0.3, 0.16, sz + 0.3, m.hazard, 0, -sy / 2 + 0.08, 0));
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(Math.min(sx, sz) * 0.45, Math.min(sx, sz) * 0.5, sy * 0.62, 12), m.steel);
      drum.position.y = -sy / 2 + 0.16 + sy * 0.31;
      g.add(drum);
      for (let i = 0; i < 4; i++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(Math.min(sx, sz) * 0.47, 0.035, 4, 14), m.dark);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = -sy / 2 + 0.3 + i * sy * 0.15;
        g.add(ring);
      }
      for (let i = 0; i < 3; i++) {
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.2 - i * 0.03, 0.2 - i * 0.03, 0.07, 10), m.ceramic);
        disc.position.y = sy * 0.18 + i * 0.13;
        g.add(disc);
      }
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), this.lampMat);
      cap.position.y = sy * 0.18 + 0.45;
      g.add(cap);
      this.cap = cap;
    } else {
      // a junction box (or a breaker panel) on legs: hazard-striped, a lamp, a fat cable out of its top
      g.add(box(sx, sy, sz, m.steel));
      g.add(box(sx + 0.02, 0.12, sz + 0.02, m.hazard, 0, -sy / 2 + 0.1, 0));
      g.add(box(sx * 0.7, sy * 0.45, 0.04, m.dark, n.x * (sx / 2 + 0.01), sy * 0.08, n.z * (sz / 2 + 0.01)).rotateY(n.x ? Math.PI / 2 : 0));
      const lamp = box(0.12, 0.12, 0.06, this.lampMat, n.x * (sx / 2 + 0.03), sy * 0.36, n.z * (sz / 2 + 0.03));
      g.add(lamp);
      if (kind === 'breaker') {
        // a big throw switch on its face
        this.lever = box(0.07, 0.42, 0.07, m.ceramic, n.x * (sx / 2 + 0.07), 0.05, n.z * (sz / 2 + 0.07));
        g.add(this.lever);
      }
      for (const sxx of [-1, 1]) g.add(box(0.07, 0.24, 0.07, m.ceramic, sxx * sx * 0.3, sy / 2 + 0.12, 0));
    }
    g.position.copy(this.center);
    noRay(g);
    world.scene.add(g);
    if (cable) {
      const top = this.center.clone().setY(this.max.y);
      const end = v3(cable);
      const len = end.distanceTo(top);
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, len, 6).translate(0, len / 2, 0), m.rubber);
      c.position.copy(top);
      c.quaternion.setFromUnitVectors(UP, _v.subVectors(end, top).normalize());
      world.scene.add(noRay(c));
    }
    // (a solid so the stream lands on it; the player can stand on it)
    this.solid = world.addSolid(this.min.clone(), this.max.clone(), { kind: 'metal' });
    this.arm();
    this.loop = new SynthLoop(noiseVoice('bandpass', 2600, 3));
    world.add(this);
  }

  arm() {
    this.shocker?.remove();
    this.shocker = this.world.wet.addShocker({ min: this.min, max: this.max }, { live: this.live, onShort: (p) => this.short(p) });
  }

  get ready() {
    return !this.tripped && this.spent <= 0;
  }

  short(point) {
    if (!this.ready) return;
    const fx = this.world.fx;
    // a big surge: the water at its foot (and every puddle that touches it) goes live
    this.world.wet.electrify(this.foot, Math.max(this.max.x - this.min.x, this.max.z - this.min.z) / 2 + 0.6, this.surge);
    fx.flash(this.center, 0xcfe8ff, { size: 2.6, life: 0.18, k: 2.2 });
    fx.sparks(_v.copy(this.center).setY(this.max.y), UP, 0x9fd0ff, { count: 40, speed: 11, spread: 1.6, life: 0.6, hot: 0.9 });
    for (let i = 0; i < 4; i++) this.world.wet.arc(_a.copy(this.center).setY(this.max.y), _b.copy(this.foot).add(_c.set(rnd(-1.4, 1.4), 0.03, rnd(-1.4, 1.4))));
    audio.sample('joint_sparks', { gain: 1.1 * gainAt(this.game, this.center, 45), rate: 0.8, vary: 0.05 });
    audio.sample('energy_crackle', { gain: 0.9 * gainAt(this.game, this.center, 45), rate: 0.7, vary: 0.05 });
    if (this.oneShot) {
      this.tripped = true;
      audio.sample(audio.sfxOr('breaker_trip', 'rotor_lock'), { gain: 1.1 * gainAt(this.game, this.center, 45), vary: 0 });
      if (this.lever) this.lever.rotation.x = 1.2;
    } else this.spent = this.cooldown;
    // spent: no longer a shocker until it re-arms
    this.shocker.remove();
    this.onShort?.(point, this);
  }

  update(dt) {
    this.t += dt;
    const fx = this.world.fx;
    if (this.spent > 0) {
      this.spent -= dt;
      if (this.spent <= 0) {
        this.arm();
        audio.sample('phase_in', { gain: 0.5 * gainAt(this.game, this.center), rate: 0.7, vary: 0 });
        this.onRearm?.(this);
      }
    }
    const ready = this.ready;
    const k = ready ? 0.75 + 0.25 * Math.sin(this.t * 7) : this.tripped ? 0.08 : 0.15 + 0.1 * Math.sin(this.t * 2);
    this.lampMat.color.setHex(this.tripped ? 0x2a3040 : 0x9fd0ff).multiplyScalar(ready ? 2.2 * k : 0.6);
    // it crackles while charged
    const near = gainAt(this.game, this.center, 18);
    if (ready && near > 0 && Math.random() < dt * (this.live ? 5 : 1.6)) {
      _a.copy(this.center).setY(this.max.y + 0.1);
      this.world.wet.arc(_a, _b.copy(_a).add(_c.set(rnd(-0.5, 0.5), rnd(-0.3, 0.4), rnd(-0.5, 0.5))));
      fx.sparks(_a, UP, 0x9fd0ff, { count: 3, speed: 3, life: 0.2, hot: 0.9 });
    }
    this.loop.set(ready ? 0.035 * near : 0, dt);
  }

  reset() {
    if (this.tripped) return;
    this.spent = 0;
    this.arm();
  }
}

// ================================================================== LIVE POOL
const POOL_V = `
  varying vec3 vW;
  #include <fog_pars_vertex>
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vec4 mvPosition = viewMatrix * w;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const POOL_F = `
  uniform float uTime, uLive;
  uniform vec3 uSky;
  varying vec3 vW;
  #include <fog_pars_fragment>
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  void main() {
    vec3 V = normalize(cameraPosition - vW);
    float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 3.0);
    vec2 w = vW.xz;
    float rip = noise(w * 3.0 + vec2(uTime * 0.6, -uTime * 0.4)) * 0.5 + noise(w * 7.0 - uTime * 0.9) * 0.5;
    vec3 col = vec3(0.008, 0.02, 0.04) + uSky * (0.05 + 0.4 * fres) + vec3(0.5, 0.7, 1.0) * pow(rip, 6.0) * 0.35;
    float a = 0.72 + 0.2 * fres;
    if (uLive > 0.0) {
      float n1 = abs(noise(w * 2.2 + vec2(uTime * 6.0, -uTime * 4.3)) - 0.5);
      float n2 = abs(noise(w * 3.7 + vec2(-uTime * 5.1, uTime * 7.7) + 3.0) - 0.5);
      float bolt = (1.0 - smoothstep(0.0, 0.02, n1)) + 0.6 * (1.0 - smoothstep(0.0, 0.014, n2));
      float flick = 0.6 + 0.4 * step(0.3, hash(vec2(floor(uTime * 24.0), 1.0)));
      col += vec3(0.05, 0.16, 0.45) * 0.35 * uLive + vec3(0.5, 0.75, 1.0) * bolt * 1.7 * flick * uLive;
      a = max(a, 0.6 + bolt * 0.4 * uLive);
    }
    gl_FragColor = vec4(col, a);
    #include <fog_fragment>
  }`;
export class LivePool {
  constructor(world, game, { min, max, live = true }) {
    this.world = world;
    this.game = game;
    this.min = v3(min);
    this.max = v3(max);
    this.y = this.min.y;
    this.live = live;
    this.k = live ? 1 : 0;
    this.shockT = 0;
    const w = this.max.x - this.min.x, d = this.max.z - this.min.z;
    this.mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uLive: { value: this.k }, uSky: { value: new THREE.Color(0x5a6e90) } }]),
      vertexShader: POOL_V, fragmentShader: POOL_F, transparent: true, depthWrite: false, fog: true,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), this.mat);
    this.mesh.position.set((this.min.x + this.max.x) / 2, this.y + 0.03, (this.min.z + this.max.z) / 2);
    this.mesh.renderOrder = 1;
    noRay(this.mesh);
    world.scene.add(this.mesh);
    this.buzz = new SynthLoop((ctx, out) => {
      const oscs = [118, 121.5].map((f) => {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 900;
        o.connect(bp).connect(out);
        o.start();
        return o;
      });
      return { srcs: oscs };
    });
    world.add(this);
  }

  inside(p, pad = 0) {
    return p.x > this.min.x - pad && p.x < this.max.x + pad && p.z > this.min.z - pad && p.z < this.max.z + pad;
  }

  update(dt, player) {
    this.k += clamp((this.live ? 1 : 0) - this.k, -dt * 2, dt * 4);
    const u = this.mat.uniforms;
    u.uTime.value += dt;
    u.uLive.value = this.k;
    const fx = this.world.fx, wet = this.world.wet;
    const cam = this.game.camera.position;
    const dx = Math.max(this.min.x - cam.x, 0, cam.x - this.max.x), dz = Math.max(this.min.z - cam.z, 0, cam.z - this.max.z);
    const dist = Math.hypot(dx, dz) + Math.abs(cam.y - this.y) * 0.5;
    this.buzz.set(this.live ? 0.06 * clamp(1 - dist / 16, 0, 1) : 0, dt);
    if (!this.live) return;
    // arcs skitter over it near you
    if (dist < 30 && Math.random() < dt * 14) {
      const x = rnd(this.min.x, this.max.x), z = rnd(this.min.z, this.max.z);
      _a.set(x, this.y + 0.05, z);
      _b.set(clamp(x + rnd(-1.4, 1.4), this.min.x, this.max.x), this.y + 0.05, clamp(z + rnd(-1.4, 1.4), this.min.z, this.max.z));
      wet.arc(_a, _b);
      if (Math.random() < 0.35) fx.sparks(_a, UP, 0x9fd0ff, { count: 3, speed: 3, life: 0.2, hot: 0.9, gravity: 12 });
    }
    // puddles sprayed up against it carry the current on
    if (wet.count) for (const p of wet.puddles) if (p.shock < 0.3 && Math.abs(p.y - this.y) < 0.35 && this.inside(p.pos, wet.radius(p))) wet.charge(p, 0.6);
    this.shockT -= dt;
    if (this.shockT > 0) return;
    this.shockT = 0.2;
    for (const e of this.world.entities) {
      if (typeof e.onShock !== 'function' || e.dead || !e.pos || e === this) continue;
      const fy = e.floorY ?? e.pos.y;
      if (e.grounded !== false && Math.abs(fy - this.y) < 0.4 && this.inside(e.pos)) e.onShock(null);
    }
    if (!player.dead && player.grounded && !player.swimming && player.pos.y < this.y + 0.3 && this.inside(player.pos, -0.1)) {
      fx.sparks(_v.copy(player.pos).setY(player.pos.y + 0.3), UP, 0xcfe8ff, { count: 20, speed: 7, spread: 1.2, life: 0.4, hot: 0.9 });
      wet.arc(_a.copy(player.pos).setY(this.y + 0.05), _b.copy(player.pos).setY(player.pos.y + 1.2));
      player.damage(1, 'shock');
    }
  }
}

// ================================================================== FORCEFIELD
export class Forcefield {
  constructor(world, game, { min, max, color = 0x9fd0ff, on = true }) {
    this.world = world;
    this.game = game;
    this.min = v3(min);
    this.max = v3(max);
    this.on = on;
    this.k = on ? 1 : 0;
    const sx = this.max.x - this.min.x, sy = this.max.y - this.min.y, sz = this.max.z - this.min.z;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uK: { value: this.k }, uColor: { value: new THREE.Color(color) } },
      vertexShader: `varying vec2 vUv; varying vec3 vW; void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `
        uniform float uTime, uK; uniform vec3 uColor; varying vec2 vUv; varying vec3 vW;
        float hash(float n) { return fract(sin(n) * 43758.5453); }
        void main() {
          float h = vW.y * 3.0 + (vW.x + vW.z) * 0.7;
          float scan = smoothstep(0.85, 1.0, sin(h * 6.2831 - uTime * 7.0) * 0.5 + 0.5);
          float bars = smoothstep(0.92, 1.0, abs(sin((vW.x + vW.z) * 9.0)));
          float edge = max(smoothstep(0.9, 1.0, abs(vUv.x * 2.0 - 1.0)), smoothstep(0.9, 1.0, abs(vUv.y * 2.0 - 1.0)));
          float flick = 0.75 + 0.25 * hash(floor(uTime * 30.0));
          float a = (0.12 + 0.5 * scan + 0.35 * bars + 0.8 * edge) * flick * uK;
          if (a < 0.01) discard;
          gl_FragColor = vec4(uColor * (1.2 + scan * 1.5), a);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), this.mat);
    this.mesh.position.copy(this.min).add(this.max).multiplyScalar(0.5);
    noRay(this.mesh);
    world.scene.add(this.mesh);
    this.solid = world.addSolid(this.min.clone(), this.max.clone(), { kind: 'metal' });
    this.solid.enabled = on;
    this.loop = new SynthLoop(noiseVoice('bandpass', 180, 6));
    world.add(this);
  }

  set(on, quiet = false) {
    if (on === this.on) return;
    this.on = on;
    this.solid.enabled = on;
    if (quiet) return;
    const c = this.mesh.position;
    this.world.fx.sparks(c, UP, 0x9fd0ff, { count: 30, speed: 8, spread: 1.6, life: 0.5 });
    audio.sample(on ? 'phase_in' : 'phase_out', { gain: 0.9 * gainAt(this.game, c), rate: 0.8, vary: 0 });
  }

  update(dt) {
    this.k += clamp((this.on ? 1 : 0) - this.k, -dt * 2.5, dt * 4);
    this.mat.uniforms.uTime.value += dt;
    this.mat.uniforms.uK.value = this.k;
    this.mesh.visible = this.k > 0.01;
    this.loop.set(this.on ? 0.05 * gainAt(this.game, this.mesh.position, 14) : 0, dt);
  }
}

// ================================================================== GANTRY (a sliding bridge)
export class Gantry {
  constructor(world, game, { min, max, from, speed = 2.2, zone = 'blue', extended = false }) {
    this.world = world;
    this.game = game;
    this.min1 = v3(min);
    this.max1 = v3(max);
    this.off = v3(from);
    this.speed = speed;
    this.len = this.off.length();
    this.k = extended ? 1 : 0;
    this.want = this.k;
    const sx = this.max1.x - this.min1.x, sy = this.max1.y - this.min1.y, sz = this.max1.z - this.min1.z;
    const m = mats();
    this.group = new THREE.Group();
    this.group.add(box(sx, sy, sz, mat('plat', zone)));
    // grating ribs and glowing edges
    const alongX = sx >= sz;
    for (const s of [-1, 1]) {
      this.group.add(box(alongX ? sx : 0.06, 0.05, alongX ? 0.06 : sz, mat('glow3', zone), alongX ? 0 : (s * sx) / 2, sy / 2 - 0.02, alongX ? (s * sz) / 2 : 0));
      this.group.add(box(alongX ? sx : 0.1, 0.9, alongX ? 0.08 : sz, m.steel, alongX ? 0 : (s * (sx - 0.1)) / 2, sy / 2 + 0.45, alongX ? (s * (sz - 0.1)) / 2 : 0));
    }
    this.group.add(box(alongX ? sx : sx * 0.6, 0.3, alongX ? sz * 0.6 : sz, m.dark, 0, -sy / 2 - 0.15, 0));
    noRay(this.group);
    world.scene.add(this.group);
    this.solid = world.addSolid(V(), V(), { kind: 'plat' });
    this.solid.delta = new THREE.Vector3();
    this.rails = [];
    for (const s of [-1, 1]) {
      // its side rails (low, so you can't fall off the bridge)
      const r = world.addSolid(V(), V(), { kind: 'metal' });
      r.side = s;
      this.rails.push(r);
    }
    this.place(0);
    world.add(this);
  }

  place(dk) {
    const o = _v.copy(this.off).multiplyScalar(1 - this.k);
    this.group.position.copy(this.min1).add(this.max1).multiplyScalar(0.5).add(o);
    this.solid.min.copy(this.min1).add(o);
    this.solid.max.copy(this.max1).add(o);
    this.solid.delta.copy(this.off).multiplyScalar(-dk);
    const alongX = this.max1.x - this.min1.x >= this.max1.z - this.min1.z;
    for (const r of this.rails) {
      r.min.copy(this.solid.min);
      r.max.copy(this.solid.max);
      r.min.y = this.solid.max.y;
      r.max.y = this.solid.max.y + 0.9;
      if (alongX) {
        if (r.side < 0) r.max.z = r.min.z + 0.1;
        else r.min.z = r.max.z - 0.1;
      } else if (r.side < 0) r.max.x = r.min.x + 0.1;
      else r.min.x = r.max.x - 0.1;
    }
    this.group.visible = this.k > 0.001;
    this.solid.enabled = this.k > 0.02;
    for (const r of this.rails) r.enabled = this.k > 0.02;
  }

  extend(instant = false) {
    this.want = 1;
    if (instant) {
      this.k = 1;
      this.place(0);
    } else if (this.k < 1) audio.sample('servo_heavy', { gain: 0.8, rate: 0.8, vary: 0 }) || audio.doorOpen();
  }

  retract(instant = false) {
    this.want = 0;
    if (instant) {
      this.k = 0;
      this.place(0);
    }
  }

  update(dt) {
    const prev = this.k;
    this.k += clamp(this.want - this.k, -(dt * this.speed) / this.len, (dt * this.speed) / this.len);
    this.place(this.k - prev);
  }
}

// ================================================================== LEAP HINT ("too far")
export class LeapHint {
  constructor(world, game, { from, to, short, label = 'TOO FAR' }) {
    this.world = world;
    this.game = game;
    this.k = 0;
    this.on = true;
    this.t = 0;
    const a = v3(from), b = v3(to), s = v3(short);
    const arc = (p0, p1, h, n = 26) => {
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const k = i / n;
        pts.push(p0.clone().lerp(p1, k).setY(p0.y + (p1.y - p0.y) * k + Math.sin(k * Math.PI) * h + 1));
      }
      return pts;
    };
    // the dry jump: up and short, then down into the dark; the slick leap: on across
    const dryPts = arc(a, s, 1.4);
    for (let i = 1; i <= 6; i++) dryPts.push(s.clone().setY(s.y + 1 - i * 0.9));
    const wetPts = arc(a, b, 1.8);
    this.dots = [];
    const dotGeo = new THREE.SphereGeometry(0.07, 6, 4);
    this.dryMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff5a3a).multiplyScalar(1.6), transparent: true, opacity: 0, depthWrite: false });
    this.wetMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6fe6ff).multiplyScalar(1.6), transparent: true, opacity: 0, depthWrite: false });
    this.group = new THREE.Group();
    for (const [pts, m] of [[dryPts, this.dryMat], [wetPts, this.wetMat]]) {
      const n = pts.length;
      const im = new THREE.InstancedMesh(dotGeo, m, n);
      const m4 = new THREE.Matrix4();
      pts.forEach((p, i) => im.setMatrixAt(i, m4.makeTranslation(p.x, p.y, p.z)));
      im.frustumCulled = false;
      this.group.add(im);
    }
    // a sign over the end of the short jump
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 96;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(40,6,4,0.6)';
    g.fillRect(0, 0, 256, 96);
    g.strokeStyle = '#ff6a4a';
    g.lineWidth = 4;
    g.strokeRect(3, 3, 250, 90);
    g.fillStyle = '#ffb09a';
    g.font = 'bold 40px sans-serif';
    g.textAlign = 'center';
    g.fillText(label, 128, 50);
    g.font = '20px sans-serif';
    g.fillStyle = '#bfe8ff';
    g.fillText('SOAK THE DECK  ·  SPRINT', 128, 80);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.signMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 });
    const sign = new THREE.Sprite(this.signMat);
    sign.scale.set(2.6, 0.97, 1);
    sign.position.copy(s).setY(s.y + 2.6);
    this.group.add(sign);
    this.group.userData.noCull = true;
    noRay(this.group);
    world.scene.add(this.group);
    world.add(this);
  }

  hide() {
    this.on = false;
  }

  update(dt) {
    this.t += dt;
    this.k += clamp((this.on ? 1 : 0) - this.k, -dt * 2, dt * 2);
    this.group.visible = this.k > 0.01;
    if (!this.group.visible) return;
    const p = 0.55 + 0.45 * Math.sin(this.t * 3);
    this.dryMat.opacity = this.k * 0.85 * p;
    this.wetMat.opacity = this.k * 0.75 * (1 - p * 0.6);
    this.signMat.opacity = this.k * 0.95;
  }
}

// ================================================================== ICE PLUG (a frozen pipe the sun beam thaws)
// IcePlug { min, max, heat: 1.6, onMelt }  a block of ice frozen in a pipe's mouth. Hold the yellow sun
// beam on it (onBeam) for `heat` s and it cracks, glows and bursts, and onMelt runs (e.g. the water
// behind it starts pouring into a tank: WaterTank.feed). Other colors chip at it to no effect.
export class IcePlug {
  constructor(world, game, { min, max, heat = 1.6, onMelt = null }) {
    this.world = world;
    this.game = game;
    this.min = v3(min);
    this.max = v3(max);
    this.need = heat;
    this.heat = 0;
    this.melted = false;
    this.onMelt = onMelt;
    this.coolT = 0;
    const sx = this.max.x - this.min.x, sy = this.max.y - this.min.y, sz = this.max.z - this.min.z;
    this.mat = new THREE.MeshStandardMaterial({ color: 0xbfe6ff, emissive: 0x2a66ff, emissiveIntensity: 0.35, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85, flatShading: true });
    this.mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), this.mat);
    this.mesh.scale.set(sx * 0.62, sy * 0.62, sz * 0.62);
    this.mesh.position.copy(this.min).add(this.max).multiplyScalar(0.5);
    this.mesh.raycast = () => {};
    world.scene.add(this.mesh);
    this.solid = world.addSolid(this.min.clone(), this.max.clone(), { entity: this, kind: 'metal' });
    world.add(this);
  }

  onBeam(dt) {
    if (this.melted) return;
    this.heat += dt;
    this.coolT = 0.3;
    const fx = this.world.fx;
    if (Math.random() < dt * 20) {
      const k = fx.puff(this.mesh.position, rnd(-0.3, 0.3), rnd(0.6, 1.2), rnd(-0.3, 0.3), new THREE.Color(0xd8e8f0), 0.3, rnd(0.6, 1), rnd(0.15, 0.3), 3);
      fx.grav[k] = -1.2;
    }
    if (this.heat >= this.need) this.melt();
  }

  onHit(color) {
    return color === 1 ? 'hit' : 'immune';
  }

  melt() {
    if (this.melted) return;
    this.melted = true;
    this.solid.enabled = false;
    this.mesh.visible = false;
    const fx = this.world.fx, p = this.mesh.position;
    fx.burst(p, 0xbfe6ff, { count: 40, speed: 5, life: 0.8, size: 0.14, gravity: 9, mode: 'shard' });
    fx.flash(p, 0xffe0a0, { size: 1.6, life: 0.15 });
    audio.sample('ice_crack', { gain: 0.9 * gainAt(this.game, p), vary: 0.05 }) || audio.sample('shatter', { gain: 0.7, rate: 1.3 });
    this.onMelt?.(this);
  }

  update(dt) {
    if (this.melted) return;
    this.coolT -= dt;
    if (this.coolT <= 0) this.heat = Math.max(0, this.heat - dt * 0.5);
    const k = this.heat / this.need;
    this.mat.emissive.setRGB(0.16 + k * 0.9, 0.4 + k * 0.25, 1 - k * 0.7);
    this.mat.emissiveIntensity = 0.35 + k * 1.2;
    this.mesh.rotation.y = Math.sin(this.world.time * 30) * 0.03 * k;
  }

  reset() {}
}
