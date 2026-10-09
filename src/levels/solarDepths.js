// SOLAR DEPTHS — the opening of the Solar world (solar.js calls buildSolarDepths): the balcony over the
// sinkhole, the broken bridge, the long fall into the quicksand, and the BURIED MATRIX: the Lumen's
// underground sun-machine round a colossal stargate, woken one node at a time by big-sun mirror puzzles
// you work with the RED blaster (no yellow yet). Every node's power runs along glowing conduits to the
// gate and lights one of its chevrons; the last mirrors bring the sun into the ring itself, it charges
// and blasts a hole through the south wall into the chasm (solarTemple.js takes it from there).
//
//   THE BALCONY (y 4, x -64…-38): the Hub's west port opens onto a sandstone balcony facing the captive
//     sun, a broken bridge reaching out over the sinkhole (its far end still stands on the gatehouse across
//     the gap). Step off the broken end: an ~84 m fall into the quicksand (the music turns the moment you go).
//   THE SINKHOLE (x -96…-64, z -130…-100, sand y -80): NODE 1 — a lens hung under the bridge's far stub
//     pours the sun onto a mirror on an island; turn it (red) onto the sun-catcher by the sealed tunnel.
//   THE GATE HALL (x -138…-102, z -130…-100, pit sand y -86, galleries y -79.6 / -64): the ring on the
//     north wall, the two final mirror pylons in the pit, a lens in the roof (shut until three nodes run).
//     Lower route west: crumbling planks, a scaffold, the cable car, the machine slab (W1).
//   THE WEST VAULT (x -160…-142): NODE 2 — a crack's sunbeam, two mirrors; one is driven by a red switch
//     in a recess you can only see from a crumbling perch. It raises the hard-light bridge to the ring.
//   THE NORTH ANNEX (x -136…-104, z -150…-134): NODE 3 — a crack, a timed mirror that creeps back, a
//     mirror riding a cart, a crumbling perch; the catcher powers the LIFT (it cycles once powered: no
//     trigger to miss) up to the upper gallery.
//   THE STARGATE (upper gallery y -64): the roof lens opens; turn the two pylon mirrors so the sun runs
//     into the crystal at the ring's heart: it charges and blows the south wall open (saved).
// Persistence: game.events solar_n1 / solar_n2 / solar_n3 / solar_gate (and a start position past a node
// counts it done, so Select Location starts show the right nodes lit).
import * as THREE from 'three';
import { RED, YELLOW, GREEN } from '../colors.js';
import { Barrier } from '../entities/barrier.js';
import { Seal } from '../entities/combat.js';
import { MovingPlatform } from '../entities/misc.js';
import { PhasePlatform, ColorSwitch } from '../entities/mechanics.js';
import { RotMirror, LightReceiver, SunBeam, LightShaft } from '../entities/sunlight.js';
import { Scarab } from '../entities/solarEnemies.js';
import { mat } from '../materials.js';
import { audio } from '../audio.js';
import { mergeBoxes } from './solarSky.js';

const SOUNDS = ['fall_wind', 'sand_sink', 'charge_up', 'energy_crackle', 'reactor_hum', 'servo_heavy', 'hydraulic_hiss', 'switch_on', 'elevator_start', 'boss_slam', 'floor_collapse', 'mortar_blast', 'shatter', 'scarab_chitter', 'scarab_crunch', 'spider_hiss', 'ring_wave', 'titan_charge', 'reactor_powerdown', 'door_open', 'gate_open'];
audio.manifest?.then(() => audio.prefetch(SOUNDS));

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const GOLD = new THREE.Color(1.0, 0.72, 0.22);
const DORMANT = new THREE.Color(0.11, 0.075, 0.04);

// ------------------------------------------------------------------ the matrix's look
// A conduit: a glowing seam laid along a polyline (floor, walls, ceiling), dark until its node wakes, then
// gold with pulses of light running along it to the gate. One draw for the seam, one for its pulses.
class Conduit {
  constructor(W, pts, { w = 0.16 } = {}) {
    this.W = W;
    this.pts = pts.map((p) => new THREE.Vector3(...p));
    this.lens = [];
    this.len = 0;
    const geos = [];
    for (let i = 0; i < this.pts.length - 1; i++) {
      const a = this.pts[i], b = this.pts[i + 1], l = a.distanceTo(b);
      this.lens.push(l);
      this.len += l;
      const d = _v.subVectors(b, a);
      const g = new THREE.BoxGeometry(Math.abs(d.x) > 0.01 ? l + w : w, Math.abs(d.y) > 0.01 ? l + w : w * 0.5, Math.abs(d.z) > 0.01 ? l + w : w);
      g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      geos.push(g);
    }
    this.mat = new THREE.MeshBasicMaterial({ color: DORMANT.clone() });
    W.scene.add(new THREE.Mesh(mergeBoxes(geos), this.mat));
    this.n = Math.max(3, Math.round(this.len / 7));
    this.pulseMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.9, 0.55).multiplyScalar(2.4) });
    this.pulses = new THREE.InstancedMesh(new THREE.BoxGeometry(w * 2.2, w * 2.2, w * 2.2), this.pulseMat, this.n);
    this.pulses.visible = false;
    this.pulses.frustumCulled = false;
    W.scene.add(this.pulses);
    this.k = 0; // 0 dormant → 1 lit
    this.on = false;
    this.t = 0;
    this.m4 = new THREE.Matrix4();
    W.add(this);
  }

  pointAt(s, out) {
    let i = 0;
    while (i < this.lens.length - 1 && s > this.lens[i]) s -= this.lens[i++];
    return out.lerpVectors(this.pts[i], this.pts[i + 1], Math.min(1, s / (this.lens[i] || 1)));
  }

  light(instant = false) {
    this.on = true;
    if (instant) this.k = 1;
    this.pulses.visible = true;
  }

  update(dt, player) {
    if (!this.on) return;
    this.t += dt;
    if (this.k < 1) this.k = Math.min(1, this.k + dt / 2.5);
    this.mat.color.copy(DORMANT).lerp(GOLD, this.k).multiplyScalar(1 + this.k * (0.7 + 0.25 * Math.sin(this.t * 3)));
    if (player.pos.distanceToSquared(this.pts[this.pts.length - 1]) > 90 * 90) return;
    // pulses running toward the gate (the head of the light runs out along the conduit as it wakes)
    const reach = this.k * this.len;
    for (let i = 0; i < this.n; i++) {
      const s = ((this.t * 6 + (i / this.n) * this.len) % this.len);
      this.pointAt(Math.min(s, reach), _w);
      this.m4.makeTranslation(_w.x, _w.y, _w.z);
      this.pulses.setMatrixAt(i, this.m4);
    }
    this.pulses.instanceMatrix.needsUpdate = true;
  }
}

// The stargate: a colossal ring on the north wall, three chevrons (one per node) and a crystal at its heart
// that takes the sun. charge(): it fills with crackling yellow electricity, then discharges into the south
// wall. All its materials are its own (it's one of a kind).
class Stargate {
  constructor(W, game, { center, radius = 7 }) {
    this.W = W;
    this.game = game;
    this.c = new THREE.Vector3(...center);
    this.r = radius;
    this.lit = 0;
    this.state = 'dormant'; // dormant → charging → fired
    this.t = 0;
    this.chargeT = 0;
    this.group = new THREE.Group();
    this.group.position.copy(this.c);
    const metal = new THREE.MeshStandardMaterial({ color: 0x2c2822, metalness: 0.85, roughness: 0.38 });
    const trim = new THREE.MeshStandardMaterial({ color: 0x6a5a40, metalness: 0.8, roughness: 0.35 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.85, 12, 64), metal);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(radius - 0.95, 0.22, 8, 64), trim);
    this.seamMat = new THREE.MeshBasicMaterial({ color: DORMANT.clone() });
    const seam = new THREE.Mesh(new THREE.TorusGeometry(radius - 0.05, 0.12, 6, 72), this.seamMat);
    seam.position.z = 0.82;
    this.group.add(ring, inner, seam);
    // glyph segments round the face (they light with the charge) and the three chevrons
    this.segMat = new THREE.MeshBasicMaterial({ color: DORMANT.clone() });
    const segGeos = [];
    for (let k = 0; k < 27; k++) {
      const a = (k / 27) * Math.PI * 2;
      segGeos.push(new THREE.BoxGeometry(0.34, 0.6, 0.1).rotateZ(a - Math.PI / 2).translate(Math.cos(a) * radius, Math.sin(a) * radius, 0.86));
    }
    this.group.add(new THREE.Mesh(mergeBoxes(segGeos), this.segMat));
    this.chevrons = [];
    for (const a of [Math.PI / 2, Math.PI / 2 + (2 * Math.PI) / 3, Math.PI / 2 + (4 * Math.PI) / 3]) {
      const m = new THREE.MeshBasicMaterial({ color: DORMANT.clone() });
      const g = new THREE.Group();
      const v1 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.9, 0.5), m);
      v1.rotation.z = 0.5;
      v1.position.x = -0.55;
      const v2 = v1.clone();
      v2.rotation.z = -0.5;
      v2.position.x = 0.55;
      const hous = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.2, 0.7), metal);
      hous.position.z = -0.2;
      g.add(hous, v1, v2);
      g.position.set(Math.cos(a) * (radius + 0.4), Math.sin(a) * (radius + 0.4), 0.55);
      g.rotation.z = a - Math.PI / 2;
      this.group.add(g);
      this.chevrons.push(m);
    }
    // the event horizon: a shimmering disc that fills the ring as it charges
    this.discMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.8, 0.3), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.disc = new THREE.Mesh(new THREE.CircleGeometry(radius - 1, 48), this.discMat);
    this.disc.position.z = 0.3;
    this.group.add(this.disc);
    // electricity: jagged arcs between points on the ring (rebuilt each frame while it charges)
    this.arcN = 10;
    this.arcPos = new Float32Array(this.arcN * 6 * 3);
    const ag = new THREE.BufferGeometry();
    ag.setAttribute('position', new THREE.BufferAttribute(this.arcPos, 3));
    this.arcMat = new THREE.LineBasicMaterial({ color: new THREE.Color(1, 0.9, 0.4).multiplyScalar(2.5), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    this.arcs = new THREE.LineSegments(ag, this.arcMat);
    this.arcs.frustumCulled = false;
    this.group.add(this.arcs);
    W.scene.add(this.group);
    this.light = W.addLight(0xffc860, 0, 26, 1.6);
    this.light.position.copy(this.c).add(new THREE.Vector3(0, 0, 3));
    this.hum = audio.createLoop('reactor_hum', { gain: 0 });
    W.add(this);
  }

  // one more node online: its chevron locks with a clunk and a flare
  chevron(i, instant = false) {
    this.lit = Math.max(this.lit, i + 1);
    const m = this.chevrons[i];
    if (!m) return;
    m.userData.on = true;
    m.userData.flash = instant ? 0 : 1;
    if (!instant) {
      const g = 0.9;
      audio.sample('servo_heavy', { gain: g, rate: 0.7 });
      setTimeout(() => audio.sample('energy_crackle', { gain: 0.8, rate: 0.8 }), 350);
      audio.sample('ring_wave', { gain: 0.5, rate: 0.6 });
    }
  }

  charge(onFire) {
    if (this.state !== 'dormant') return;
    this.state = 'charging';
    this.chargeT = 0;
    this.onFire = onFire;
    audio.sample('charge_up', { gain: 1, rate: 0.55 });
    audio.sample('titan_charge', { gain: 0.8, rate: 0.7 });
  }

  // the state after the blast (also for a restored save): the ring burns steady, its disc gone quiet
  spent() {
    this.state = 'fired';
    this.lit = 3;
    for (const m of this.chevrons) m.userData.on = true;
  }

  update(dt, player) {
    this.t += dt;
    const near = player.pos.distanceToSquared(this.c) < 80 * 80;
    // the chevrons: dark, then gold (a flare as each locks)
    for (const m of this.chevrons) {
      const f = m.userData.flash || 0;
      if (f > 0) m.userData.flash = Math.max(0, f - dt * 0.8);
      if (m.userData.on) m.color.copy(GOLD).multiplyScalar(1.6 + f * 3 + 0.3 * Math.sin(this.t * 2.5));
      else m.color.copy(DORMANT);
    }
    const k = this.lit / 3;
    let charge = this.state === 'charging' ? Math.min(1, this.chargeT / 5.2) : this.state === 'fired' ? 0.25 : 0;
    this.seamMat.color.copy(DORMANT).lerp(GOLD, Math.min(1, k * 0.8 + charge)).multiplyScalar(1 + k * 0.6 + charge * 3);
    this.segMat.color.copy(DORMANT).lerp(GOLD, Math.min(1, k * 0.5 + charge)).multiplyScalar(0.8 + charge * 2.5 + (this.state === 'fired' ? 0.6 : 0));
    this.hum.setGain(near ? Math.min(0.9, k * 0.18 + charge * 0.8) : 0);
    this.hum.setRate(0.7 + charge * 0.8);
    this.light.intensity = k * 4 + charge * 30;
    if (this.state === 'charging') {
      this.chargeT += dt;
      this.discMat.opacity = Math.min(0.75, charge * 0.85) * (0.8 + 0.2 * Math.sin(this.t * 40));
      this.disc.scale.setScalar(0.2 + charge * 0.8);
      this.arcMat.opacity = 0.35 + charge * 0.65;
      this.buildArcs(charge);
      player.shake = Math.max(player.shake || 0, charge * 0.35);
      if (Math.random() < dt * (4 + charge * 20)) {
        const a = Math.random() * Math.PI * 2;
        _v.set(this.c.x + Math.cos(a) * this.r, this.c.y + Math.sin(a) * this.r, this.c.z + 1);
        this.W.fx.sparks(_v, _w.set(-Math.cos(a), -Math.sin(a), 0.4).normalize(), 0xffd060, { count: 6, speed: 7, spread: 0.8, life: 0.4 });
        if (Math.random() < 0.3) audio.sample('energy_crackle', { gain: 0.4 + charge * 0.5, rate: 0.8 + Math.random() * 0.6, vary: 0.1 });
      }
      if (this.chargeT >= 5.4) {
        this.state = 'fired';
        this.discMat.opacity = 0;
        this.arcMat.opacity = 0;
        this.onFire?.();
      }
    }
  }

  buildArcs(charge) {
    const P = this.arcPos;
    let o = 0;
    for (let i = 0; i < this.arcN; i++) {
      const a0 = Math.random() * Math.PI * 2, a1 = a0 + (Math.random() - 0.5) * 2.4;
      const toCentre = Math.random() < charge * 0.6;
      let px = Math.cos(a0) * (this.r - 0.6), py = Math.sin(a0) * (this.r - 0.6);
      const ex = toCentre ? 0 : Math.cos(a1) * (this.r - 0.6), ey = toCentre ? 0 : Math.sin(a1) * (this.r - 0.6);
      for (let s = 1; s <= 3; s++) {
        const t = s / 3;
        const nx = px + (ex - px) * (1 / (4 - s)) + (s < 3 ? (Math.random() - 0.5) * 1.6 : 0);
        const ny = py + (ey - py) * (1 / (4 - s)) + (s < 3 ? (Math.random() - 0.5) * 1.6 : 0);
        P[o++] = px; P[o++] = py; P[o++] = 0.5;
        P[o++] = s === 3 ? ex : nx; P[o++] = s === 3 ? ey : ny; P[o++] = 0.5;
        px = s === 3 ? ex : nx;
        py = s === 3 ? ey : ny;
        void t;
      }
    }
    this.arcs.geometry.attributes.position.needsUpdate = true;
  }
}

// A yellow scarab in the pit: the red blaster can't hurt it (a hiss and a skitter, never rage), it keeps
// to its patch (a lunge when you come close, then back home) and a hit knocks you back rather than
// killing you (the shield takes the sting, if you wear one). The yellow gun makes short work of its kin.
class PitScarab extends Scarab {
  constructor(W, game, opts) {
    super(W, { burrow: false, range: 6.5, patrol: 2.5, ...opts, color: YELLOW });
    this.game = game;
    this.bumpT = 0;
    this.docile = true;
  }

  immune(hit) {
    this.immuneFlash = 1;
    if ((this.hissT || 0) <= 0) {
      this.hissT = 1.2;
      audio.sample('scarab_chitter', { gain: 0.5, rate: 1.3, vary: 0.1 }) || audio.sample('spider_hiss', { gain: 0.4 });
    }
    return 'immune';
  }

  think(dt, player) {
    this.bumpT -= dt;
    this.hissT = (this.hissT || 0) - dt;
    // its patch: past it, it loses interest and turns for home
    if (this.pos.distanceTo(this.home) > this.patrol + 4) this.aggro = false;
    this.pp ??= Object.create(player, { damage: { value: () => this.bump(player) } });
    super.think(dt, this.pp);
  }

  bump(player) {
    if (this.bumpT > 0 || player.dead || this.game.godMode) return;
    this.bumpT = 1.3;
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z, l = Math.hypot(dx, dz) || 1;
    player.vel.x += (dx / l) * 8.5;
    player.vel.z += (dz / l) * 8.5;
    player.vel.y = Math.max(player.vel.y, 5);
    player.grounded = false;
    player.shake = Math.max(player.shake || 0, 0.35);
    this.game.hud.hurt?.(14);
    if (player.armor > 0) player.damage(1, 'scarab'); // (the shield takes the sting; bare, it's only a shove)
    audio.sample('scarab_crunch', { gain: 0.7, vary: 0.1 }) || audio.hurt();
    this.aggro = false;
    this.leapCool = 2.5;
  }
}

// ================================================================ the build
export function buildSolarDepths(B, K) {
  const { W, game, level, plat, hint, devStart, blocker, light, guideStrip, glowEdge, area, zoneTitle, onRespawn } = B;
  const { R, M, F, D, G, PG, quick, lamp, pipe, cable, droop, scaffold, machinePlate, glyphs, pylon, strata, ck, mood, has, beams, lights, zone, SKY, S, amber, dglow, DZ, skyLens } = K;
  const ev = (id) => game.events.has(id);
  const doorLink = (seal) => ({ activate: () => seal.open(), deactivate: () => {} });
  const deepMood = () => {
    game.setMusic(has(YELLOW) ? 'music_yellow' : 'music_haunt');
    game.setAmbient('amb_wind');
    game.setAtmosphere('solarDeep');
  };
  const deep = (min, max) => W.trigger(min, max, deepMood, { once: false });
  const scarab = (pos, o = {}) => new PitScarab(W, game, { pos, ...o });

  // ================================================================ S0 ENTRY + THE BALCONY (y 4)
  B.corridorX({ xStart: -25, xEnd: -38, y: 4, zone, cz: -112 });
  R(-38, -24.4, -124, -32, 3, -100);
  R(-38, 3, -110, -32, 8, -100);
  R(-38, 3, -124, -32, 8, -114);
  M(-31, -6, -113, -28, 3, -111);
  area([-30, 4, -113.5], [-27, 7.2, -110.5], mood);
  devStart('solar', [-27, 4, -112], Math.PI / 2, [RED], 'Solar: the entrance');
  // the balcony: a sandstone terrace on the cliff over the sinkhole, open to the west and the sun
  R(-64, -90, -130, -38, 4, -100);
  zoneTitle([-40, 4, -114], [-38, 8, -110], 'SOLAR', 'SUNSCORCH MESA', '#ffd23a', 'music_solar');
  area([-44, 4, -117], [-38, 8, -107], mood);
  area([-64, 4, -119], [-44, 14, -105], mood);
  ck([-44, 4, -112], Math.PI / 2, [6, 3, 10]);
  devStart('solar1', [-58, 4, -112], Math.PI / 2 + 0.06, [RED], 'The balcony (the vista)');
  // balustrade: posts and a rail along the west edge (open where the bridge leaves), the south parapet
  const balus = (x1, z1, x2, z2) => {
    F(x1, 4, z1, x2, 4.25, z2);
    F(x1, 5.05, z1, x2, 5.3, z2);
    const alongZ = z2 - z1 > x2 - x1;
    const len = alongZ ? z2 - z1 : x2 - x1;
    for (let u = 0.35; u < len - 0.2; u += 0.62) {
      const cx = alongZ ? (x1 + x2) / 2 : x1 + u, cz = alongZ ? z1 + u : (z1 + z2) / 2;
      R(cx - 0.11, 4.25, cz - 0.11, cx + 0.11, 5.05, cz + 0.11);
    }
  };
  balus(-64.5, -119, -64, -113.8);
  balus(-64.5, -110.2, -64, -105);
  balus(-64, -105, -38, -104.5);
  for (const [z1, z2] of [[-119.2, -118.4], [-114.4, -113.6], [-110.4, -109.6], [-105.6, -104.8]]) R(-64.7, 4, z1, -63.9, 5.6, z2); // newel posts
  for (const x of [-56, -48, -40]) R(x - 0.5, 4, -105.2, x + 0.5, 5.9, -104.2);
  blocker([-65, 4, -119], [-64, SKY, -113.8]);
  blocker([-65, 4, -110.2], [-64, SKY, -104.5]);
  blocker([-64, 4, -105], [-38, SKY, -104.2]);
  // two low sun braziers flank the bridge (embers drifting up off them, so the way out reads at a glance)
  for (const z of [-116.8, -107.2]) {
    R(-63.4, 4, z - 0.45, -62.5, 4.7, z + 0.45);
    D(-63.6, 4.7, z - 0.65, -62.3, 4.95, z + 0.65);
  }
  light(-62.9, 6.2, -112, 0xffb860, 10, 16);
  W.add({
    t: 0,
    update(dt, player) {
      if ((this.t -= dt) > 0 || player.pos.x < -80 || player.pos.y < 0) return;
      this.t = 0.07;
      _v.set(-62.95 + (Math.random() - 0.5) * 0.7, 5, (Math.random() < 0.5 ? -116.8 : -107.2) + (Math.random() - 0.5) * 0.7);
      W.fx.ember(_v, (Math.random() - 0.5) * 0.4, 1 + Math.random() * 1.2, (Math.random() - 0.5) * 0.4, Math.random() < 0.5 ? 0xffb040 : 0xff7020, 1.2, 0.05);
    },
  });
  // the lookout (NW corner, off the path), the north wall with the GREEN Sunshade Grotto: as before
  R(-63, -14, -124, -55, 4, -119);
  R(-63, 4, -124, -62.4, 5, -119);
  R(-63, 4, -124, -55, 5, -123.4);
  G(-62.45, 4.95, -123.4, -62.35, 5.05, -119);
  D(-61.6, 4, -121.9, -60.4, 4.6, -120.7);
  blocker([-63.6, 4, -124], [-62.4, SKY, -119]);
  blocker([-63.6, 4, -124.6], [-55, SKY, -123.4]);
  blocker([-38, 8, -132], [-25, SKY, -100]);
  R(-55, -14, -132, -38, 4, -119);
  R(-55, 4, -132, -50.5, 9, -119);
  R(-43.5, 4, -132, -38, 9, -119);
  R(-50.5, 4, -132, -43.5, 9, -126);
  R(-50.5, 7.5, -126, -43.5, 9, -119.5);
  R(-50.5, 4, -119.5, -48.2, 7.5, -119);
  R(-45.8, 4, -119.5, -43.5, 7.5, -119);
  R(-48.2, 7, -119.5, -45.8, 7.5, -119);
  new Barrier(W, { min: [-48.2, 4, -119.5], max: [-45.8, 7, -119], color: GREEN, kind: 'door', zone });
  B.trophy(-47, 5, -123.5);
  G(-50.4, 7.35, -125.9, -43.6, 7.45, -119.6);
  B.secretRoom([-50.5, 4, -126], [-43.5, 7.5, -119.5], 'Sunshade Grotto');
  B.hintEvery([-50.5, 4, -120.5], [-43.5, 7, -119], 'Sealed with <b style="color:#46ff7a">GREEN</b> energy — come back later.', 25, 5, () => !has(GREEN));
  blocker([-55, 9, -132], [-38, SKY, -119]);
  guideStrip([[-38.5, 4, -112], [-63, 4, -112]], amber, { spacing: 1.6, scale: 1.2 });
  hint([-50, 4, -117], [-44, 7, -107], 'The <b>Sunward Balcony</b>. The old bridge to the temple courtyard fell in long ago — and far below, <b>quicksand</b>. It breaks a fall… any fall.', 7);

  // ---- the broken bridge: the near stub juts out over the sinkhole; its far end still stands on the
  // gatehouse across the gap; the middle lies in the sand far below
  const BZ1 = -113.75, BZ2 = -110.25;
  F(-73.5, 2.4, BZ1, -64, 4, BZ2);
  F(-73.5, 1.4, BZ1 + 0.6, -66, 2.4, BZ2 - 0.6); // the soffit
  F(-74.4, 2.5, BZ1, -73.5, 3.7, BZ2 - 1.1); // the broken end: a few voussoirs left, ragged
  F(-75.1, 2.8, BZ1 + 0.5, -74.4, 3.3, BZ1 + 1.6);
  F(-74.2, 2.2, BZ2 - 1.1, -73.5, 3.2, BZ2 - 0.2);
  F(-73.5, 4, BZ1, -66.5, 4.45, BZ1 + 0.35); // curbs (the north one snapped short)
  F(-71.2, 4, BZ2 - 0.35, -64, 4.45, BZ2);
  blocker([-74, 4, BZ1 - 0.4], [-64, SKY, BZ1 + 0.35]);
  blocker([-74, 4, BZ2 - 0.35], [-64, SKY, BZ2 + 0.4]);
  R(-66.5, -14, BZ1 + 0.4, -64, 2.4, BZ2 - 0.4); // the corbel under the stub
  // the far stub on the gatehouse
  F(-96, 2.2, BZ1, -90.5, 3.8, BZ2);
  F(-90.5, 1.7, BZ1 + 0.3, -88.6, 3.4, BZ2); // slumped and broken toward the gap
  F(-88.6, 1.5, BZ1 + 1.2, -87.6, 2.9, BZ2 - 0.4);
  F(-96, 3.8, BZ1, -91.4, 4.25, BZ1 + 0.35);
  F(-96, 3.8, BZ2 - 0.35, -89.4, 4.25, BZ2);
  R(-106, S, -118, -96, 4, -106); // the gatehouse: a squat tower on the far rim
  R(-106, 4, -118, -96, 10.5, -115.2);
  R(-106, 4, -108.8, -96, 10.5, -106);
  R(-106, 8.6, -115.2, -96, 10.5, -108.8);
  R(-106.6, 10.5, -118.6, -95.4, 11.3, -105.4);
  D(-96.05, 4, -114.6, -95.9, 8.6, -109.4, 'metal'); // the dark doorway's frame
  G(-96.1, 8.3, -115.2, -95.85, 8.5, -108.8);
  for (const z of [-120, -104]) {
    R(-104.5, S, z - 1.1, -102.3, 14, z + 1.1); // obelisks either side
    D(-104.6, 14, z - 1.2, -102.2, 14.6, z + 1.2, 'metal');
    G(-104.55, 13, z - 1.15, -102.25, 13.2, z + 1.15);
  }
  blocker([-108, S, -122], [-94, SKY, -102]);
  // fallen stones of the bridge's middle, half sunk in the sand (decor, tilted) — and a few that make
  // stepping stones toward the lip
  {
    const rock = mat('rock', zone);
    const geos = [];
    const block = (x, y, z, w, h, d, rx, ry, rz) => geos.push(new THREE.BoxGeometry(w, h, d).rotateX(rx).rotateY(ry).rotateZ(rz).translate(x, y, z));
    block(-84, -79.4, -120.5, 4.2, 1.8, 3.4, 0.35, 0.4, -0.2);
    block(-91, -79.5, -127, 3.6, 1.6, 4, -0.2, 1.1, 0.25);
    block(-70, -79.6, -125, 3, 1.4, 3.6, 0.15, -0.3, 0.3);
    block(-68.5, -79.5, -103.5, 3.4, 1.6, 2.6, -0.3, 0.6, -0.15);
    block(-80, -78.8, -101.8, 5, 2.2, 1.8, 0.5, 0.1, 0.2);
    block(-92.5, -79.7, -101.6, 2.4, 1.2, 2.6, 0.2, -0.8, -0.3);
    // a toppled arch segment leaning on the north wall
    block(-77, -74.5, -128.6, 3.4, 9, 1.8, -0.22, 0, 0.12);
    W.scene.add(new THREE.Mesh(mergeBoxes(geos), rock));
  }

  // ================================================================ S1 THE DROP + THE SINKHOLE (sand y -80)
  const SAND = -80;
  quick(-96, -130, -64, -100, SAND, -86, false);
  R(-100, -90, -134, -60, S, -130); // north
  R(-100, -90, -100, -60, S, -96); // south
  R(-102, -90, -134, -96, S, -114); // west, the tunnel to the gate hall cut in it
  R(-102, -90, -110, -96, S, -96);
  R(-102, -90, -114, -96, -79.6, -110);
  R(-102, -75.6, -114, -96, S, -110);
  strata(-96, -130, -95.7, -100, [-70, -58, -46, -34, -22]);
  strata(-96, -130, -64, -129.7, [-66, -52, -38, -24]);
  strata(-96, -100.3, -64, -100, [-62, -49, -31]);
  strata(-64.3, -130, -64, -100, [-68, -40, -18, -4]);
  // the moment you go over: the music turns, the light goes, the wind roars past
  let whooshT = -9;
  W.trigger([-90, -60, -116], [-74, 3.7, -108], () => {
    deepMood();
    if (W.time - whooshT > 4) {
      whooshT = W.time;
      audio.sample('fall_wind', { gain: 0.9, vary: 0 });
    }
  }, { once: false });
  deep([-96, -84, -130], [-64, -60, -100]);
  // (an invisible funnel: however you leave the bridge, you come down in the open sand east of the stones —
  // never on the lip or the island, which an 84 m fall onto rock would not forgive)
  blocker([-79.4, -76, -130], [-79, 24, -100]);
  // the lip on the west side, the stepping stones and the island the first mirror stands on
  F(-96, -86, -124, -90, -79.6, -104);
  glowEdge(-96, -124, -90, -104, -79.6, dglow, DZ);
  F(-82, -86, -112.5, -79.5, -79.4, -110); // stepping stones from where you land
  F(-89, -86, -110, -84, -79.4, -106); // the island
  glowEdge(-89, -110, -84, -106, -79.4, dglow, DZ);
  ck([-93, -79.6, -110], -Math.PI / 2 + 0.4, [6, 3, 8]);
  devStart('solar2', [-93, -79.6, -112], Math.PI / 2 - 0.6, [RED], 'The sinkhole (after the drop)');
  // NODE 1: a lens hung under the far stub pours the sun onto the island's mirror; turn it NW onto the
  // sun-catcher beside the sealed tunnel
  M(-87.6, 0.6, -110.6, -86.4, 2.4, -109.4);
  pipe([-87, 1.5, -110.2], [-87, 1.5, -108], 0.25);
  const lens1 = new SunBeam(W, { from: [-87, 0.4, -108], dir: [0, -1, 0], source: 'lens', width: 0.45, near: 110 });
  beams.push(lens1);
  const m1 = new RotMirror(W, { pos: [-87, -77.6, -108], yaw: 0, start: 5, tilt: Math.PI / 4, size: [2.4, 1.8], post: 1.8, color: RED });
  const door1 = new Seal(W, { min: [-96.6, -79.6, -114], max: [-96, -75.6, -110], color: null, zone, closed: true });
  const recv1 = new LightReceiver(W, { pos: [-95.85, -77.6, -117], face: '+x', accept: 'sun', size: 1.8, links: [doorLink(door1)] });
  lights.push(m1, recv1);
  lamp(-94.5, -79.6, -105.5, { h: 2.4, pool: 0, real: true });
  lamp(-91, -79.6, -123, { h: 2.2, pool: 0 });
  hint([-96, -82, -124], [-90, -76, -104], 'A <b>mirror</b> on a turntable catches the sunbeam. Shoot it <b style="color:#ff3344">red</b> to turn it: send the sun onto the <b>sun-catcher</b> by the sealed tunnel.', 8);
  hint([-84, -82, -112], [-64, -70, -100], '<b>Mash JUMP</b> to climb out of the quicksand. The stones lead west to the <b>lip</b>.', 5);

  // the tunnel into the gate hall (sealed until node 1 runs)
  for (const x of [-97, -99, -101]) {
    D(x - 0.15, -79.6, -114.4, x + 0.15, -75.6, -114);
    D(x - 0.15, -79.6, -110, x + 0.15, -75.6, -109.6);
    D(x - 0.15, -75.9, -114, x + 0.15, -75.6, -110);
  }

  // ================================================================ S2 THE GATE HALL
  const HX1 = -138, HX2 = -102, HZ1 = -130, HZ2 = -100, PIT = -86, ROOF = -30;
  quick(HX1, HZ1, HX2, HZ2, PIT, -92, false);
  R(-142, -92, -130, -138, ROOF, -114); // west, the vault door in it
  R(-142, -92, -110, -138, ROOF, -100);
  R(-142, -92, -114, -138, -78.8, -110);
  R(-142, -75.4, -114, -138, ROOF, -110);
  R(-142, ROOF, -134, -100, -10, -96); // the rock over the hall
  // the south wall (and the chasm's north wall), with the plug the gate will blow out
  R(-142, -92, -100, -125, S, -94);
  R(-115, -92, -100, -86, S, -94);
  R(-125, -92, -100, -115, -64, -94);
  R(-125, -56, -100, -115, S, -94);
  // the north wall's doorways (annex below, upper landing above): the wall boxes round them
  R(-142, -92, -134, -110, ROOF, -130);
  R(-104, -92, -134, -100, ROOF, -130);
  R(-110, -92, -134, -104, -78.8, -130);
  R(-110, -75.4, -134, -108, ROOF, -130);
  R(-108, -75.4, -134, -104, -64, -130);
  R(-108, -60.6, -134, -104, ROOF, -130);
  strata(HX1, HZ1, HX2, HZ1 + 0.3, [-50, -40]);
  strata(HX1, HZ2 - 0.3, HX2, HZ2, [-74, -50, -40]);
  deep([HX1, -92, HZ1], [HX2, ROOF, HZ2]);
  zoneTitle([-104, -80, -114], [-102, -76, -110], 'SOLAR · BELOW', 'THE BURIED GATE', '#ffd23a');
  // the entry gallery (the tunnel's end), the planks, the scaffold, the cable car, the machine slab
  F(-108, -92, -118, -102, -79.6, -106);
  glowEdge(-108, -118, -102, -106, -79.6, dglow, DZ);
  M(-108, -79.6, -118.1, -102, -78.6, -117.9); // rail
  B.crumble({ min: [-111, -79.9, -113], max: [-108, -79.6, -111], delay: 0.6, respawn: 3, zone });
  B.crumble({ min: [-114, -79.9, -113], max: [-111, -79.6, -111], delay: 0.6, respawn: 3, zone });
  plat(-118, -114, -114, -110, -79.2, zone, 0.3, 'grate');
  scaffold(-118, -114, -114, -110, -86, -79.5);
  const car = new MovingPlatform(W, { min: [-121.5, -79.6, -113.5], max: [-118.5, -79.2, -110.5], offset: [-8, 0, 0], speed: 2, pause: 1.2, zone, kind: 'grate' });
  cable([[-118, -66, -112], [-131, -66, -112]], 0.07);
  M(-118.4, -79.2, -114.3, -117.6, -66, -113.5); // the car's gantry posts
  M(-131.4, -78.8, -114.3, -130.6, -66, -113.5);
  machinePlate(-138, -118, -130, -102, -78.8, -92);
  ck([-105, -79.6, -112], Math.PI / 2, [5, 3, 8]);
  devStart('solar3', [-105, -79.6, -112], Math.PI / 2 + 0.25, [RED], 'The buried gate hall');
  // the recovery stair out of the pit (south-east corner, up to the entry gallery)
  for (let i = 0; i < 16; i++) F(-108, -92, -100 - (i + 1) * 0.375, -104, -85.6 + 0.4 * i, -100 - i * 0.375);
  G(-108, -79.65, -108.1, -104, -79.55, -108);
  // the threshold ledge under the ring, the annex door at its east end
  F(-136, -92, -130, -104, -78.8, -126);
  glowEdge(-136, -130, -104, -126, -78.8, dglow, DZ);
  const bridge2 = new PhasePlatform(W, { min: [-134, -79.2, -126], max: [-131, -78.8, -118], on: false, zone });
  // the two final pylons in the pit and the lens in the roof (shut until three nodes run)
  for (const x of [-110, -120]) {
    R(x - 0.9, -92, -108.9, x + 0.9, -68.8, -107.1);
    for (const y of [-72, -80]) D(x - 0.95, y, -108.95, x + 0.95, y + 0.3, -107.05);
  }
  const f1 = new RotMirror(W, { pos: [-110, -67, -108], yaw: 0, start: 0, tilt: Math.PI / 4, size: [2.6, 2], post: 1.8, color: RED });
  const f2 = new RotMirror(W, { pos: [-120, -67, -108], yaw: 0, start: 3, size: [2.6, 2], post: 1.8, color: RED });
  const oculus = new SunBeam(W, { from: [-110, -30.4, -108], dir: [0, -1, 0], source: 'lens', width: 0.6, enabled: false, near: 90 });
  beams.push(oculus);
  lights.push(f1, f2);
  // the gate
  const gate = new Stargate(W, game, { center: [-120, -67, -128.6], radius: 7 });
  R(-124, -92, -130, -116, -76, -128.4); // its plinth
  R(-128.6, -76, -130, -111.4, -74.8, -128.8);
  // the stargate's heart: a crystal that drinks the sun (it only fires on a full charge)
  const heart = new LightReceiver(W, { pos: [-120, -67, -127.6], face: '+z', accept: 'sun', size: 2.0 });
  lights.push(heart);
  // the upper gallery (y -64): east arm and south arm, the hole's ledge in the middle of the south arm
  F(-108, -66, -130, -102, -64, -100);
  F(-138, -66, -104, -108, -64, -100);
  glowEdge(-108, -130, -102, -104, -64, dglow, DZ);
  glowEdge(-138, -104, -108, -100, -64, dglow, DZ);
  M(-108.15, -64, -130, -107.95, -63, -104);
  M(-138, -64, -104.15, -108, -63, -103.95);
  for (let x = -136; x <= -110; x += 4) pipe([x, -66, -103], [x, -86, -103], 0.14);
  for (let z = -128; z <= -106; z += 4) pipe([-105, -66, z], [-105, -79.6, z], 0.14);
  // the plug in the south wall: cracked, seamed sandstone that the gate will blow out
  const plug = { solid: W.addSolid(new THREE.Vector3(-125, -64, -100), new THREE.Vector3(-115, -56, -94), { kind: 'rock' }) };
  {
    const m = new THREE.Mesh(new THREE.BoxGeometry(10, 8, 6), mat('rock', zone));
    m.position.set(-120, -60, -97);
    W.scene.add(m);
    plug.mesh = m;
    // the rubble round the hole once it's blown (hidden till then)
    const geos = [];
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2, r = 5.2 + Math.random() * 0.8;
      geos.push(new THREE.BoxGeometry(1.2 + Math.random(), 0.9 + Math.random(), 1 + Math.random()).rotateX(Math.random()).rotateY(Math.random()).translate(-120 + Math.cos(a) * r, -60 + Math.sin(a) * r * 0.75, -100.2 + Math.random() * 0.6));
    }
    for (let k = 0; k < 10; k++) geos.push(new THREE.BoxGeometry(0.8 + Math.random() * 1.4, 0.4 + Math.random() * 0.6, 0.8 + Math.random() * 1.2).rotateY(Math.random() * 3).translate(-124 + Math.random() * 8, -63.6, -101.5 - Math.random() * 1.6));
    plug.rubble = new THREE.Mesh(mergeBoxes(geos), mat('rock', zone));
    plug.rubble.visible = false;
    W.scene.add(plug.rubble);
    // daylight through the hole once it's open
    plug.shaft = new LightShaft(W, { top: [-120, -55, -93], bottom: [-120, -64.2, -110], r: 2.6, intensity: 0.5 });
    plug.shaft.k = 0;
    plug.shaft.mat.uniforms.uI.value = 0;
  }
  // matrix dressing: capacitor banks either side of the ring (they fill as nodes wake), lamps along
  // the galleries (they ignite), cables, glyph panels uncovered on the cut faces
  const capMat = new THREE.MeshBasicMaterial({ color: DORMANT.clone() });
  const lampGlow = new THREE.MeshBasicMaterial({ color: DORMANT.clone() });
  {
    const steel = new THREE.MeshStandardMaterial({ color: 0x3a342c, metalness: 0.8, roughness: 0.4 });
    const caps = [], bands = [];
    for (const x0 of [-136, -110]) {
      for (let i = 0; i < 4; i++) {
        const x = x0 + 0.9 + i * 1.6;
        caps.push(new THREE.CylinderGeometry(0.62, 0.62, 3.6, 12).translate(x, -76.4 + 1.8, -129.2));
        for (let j = 0; j < 3; j++) bands.push(new THREE.CylinderGeometry(0.66, 0.66, 0.16, 12).translate(x, -76.4 + 0.7 + j * 1.1, -129.2));
      }
    }
    W.scene.add(new THREE.Mesh(mergeBoxes(caps), steel));
    W.scene.add(new THREE.Mesh(mergeBoxes(bands), capMat));
    // lamp heads along the galleries (glow meshes, lit as the matrix wakes)
    const heads = [];
    for (const [x, y, z] of [[-106, -61.5, -126], [-106, -61.5, -114], [-106, -61.5, -102.5], [-116, -61.5, -101.5], [-128, -61.5, -101.5], [-104, -76.8, -108], [-104, -76.8, -116], [-134, -76.4, -104], [-134, -76.4, -116], [-126, -76, -127], [-114, -76, -127]]) heads.push(new THREE.BoxGeometry(0.42, 0.18, 0.42).translate(x, y, z));
    W.scene.add(new THREE.Mesh(mergeBoxes(heads), lampGlow));
  }
  const hallLight = light(-120, -70, -112, 0xffc070, 0, 34);
  droop([-102.2, -40, -112], [-137.8, -40, -112.5], 2.2, 12);
  droop([-102.2, -46, -128], [-137.8, -46, -127], 1.6, 12);
  glyphs('-x', HX2, -122, -70, 3.6, 1.6);
  glyphs('+x', HX1, -106, -71, 3.6, 1.6);
  glyphs('+z', HZ1, -132, -60, 3, 1.4);
  glyphs('+z', HZ1, -108, -60, 3, 1.4);
  new LightShaft(W, { top: [-128, ROOF + 0.05, -110], bottom: [-128, PIT, -110], r: 0.7, intensity: 0.22 });
  new LightShaft(W, { top: [-106, ROOF + 0.05, -124], bottom: [-106, -79.6, -124], r: 0.6, intensity: 0.2 });
  // the yellow scarabs nesting in the matrix (the red blaster can't touch them)
  scarab([-134, -78.8, -108]);
  scarab([-120, -78.8, -128.2], { patrol: 3 });
  hint([-108, -82, -118], [-102, -76, -106], 'The Lumen\'s <b>buried gate</b>. Every node of this machine you wake sends power along the conduits — into the <b>ring</b>.', 7);
  hint([-108, -82, -114], [-104, -77, -110], 'Those <b style="color:#ffd23a">yellow</b> scarabs shrug off red. Mind them: they\'ll <b>shove</b> you off a ledge.', 6);

  // ================================================================ S3 THE WEST VAULT (node 2)
  // A crack's sunbeam falls on a mirror in the north-west corner that's driven by a red switch in a recess
  // in the north wall: only the crumbling perch north of the baffle can see it. That mirror throws the sun
  // south to the second (shoot it from the perch beside it), which must turn it east onto the catcher.
  const VX1 = -160, VX2 = -142, VZ1 = -128, VZ2 = -100;
  quick(VX1, VZ1, VX2, VZ2, PIT, -92, false);
  // north, with the switch's sight-tube cut in it: a pocket 1.6 m wide and 3 m deep, so only a spot
  // straight in front (the crumbling perch) can see the switch at its back
  R(-164, -92, -132, -151.8, -40, -128);
  R(-150.2, -92, -132, -142, -40, -128);
  R(-151.8, -92, -132, -150.2, -78, -128);
  R(-151.8, -74.4, -132, -150.2, -40, -128);
  R(-151.8, -78, -132, -150.2, -74.4, -131.1);
  D(-151.8, -78, -131.1, -150.2, -77.95, -128, 'metal');
  R(-164, -92, -100, -142, -40, -96); // south
  R(-164, -92, -128, -160, -40, -100); // west
  R(-164, -40, -132, -138, -10, -96); // the rock over it
  F(-145, -92, -116, -142, -78.8, -108); // the entry ledge
  glowEdge(-145, -116, -142, -108, -78.8, dglow, DZ);
  F(-149, -92, -112, -146, -78.4, -109); // P1
  F(-153, -92, -106, -150, -78, -103); // P2, by the south mirror
  F(-146, -92, -118, -143, -78, -115); // P1b, past the baffle's end
  B.crumble({ min: [-151.5, -78.4, -121], max: [-148.5, -77.8, -118], delay: 1.6, respawn: 5, zone }); // the perch
  R(-155.2, -92, -115, -146.5, -66, -114); // the baffle (it hides the switch from the south)
  for (const [x, z] of [[-156, -124], [-156, -104]]) {
    R(x - 1, -92, z - 1, x + 1, -78, z + 1);
    blocker([x - 1, -78, z - 1], [x + 1, -72, z + 1]); // (no standing on the mirrors' pillars)
  }
  const crack2 = new SunBeam(W, { from: [-156, -40.05, -124], dir: [0, -1, 0], source: 'crack', width: 0.4, near: 70 });
  beams.push(crack2);
  const m2a = new RotMirror(W, { pos: [-156, -76.2, -124], yaw: 0, step: Math.PI / 2, count: 4, start: 0, tilt: Math.PI / 4, size: [2.2, 1.7], post: 1.8, color: RED, armored: true });
  const m2b = new RotMirror(W, { pos: [-156, -76.2, -104], yaw: 0, start: 2, size: [2.4, 1.8], post: 1.8, color: RED });
  // the switch in its recess (it turns the corner mirror a quarter turn a hit)
  const sw2 = new ColorSwitch(W, { pos: [-151, -76.2, -131.1], color: RED, face: '+z', mode: 'pulse', size: 1, zone, links: [{ activate: () => m2a.turn(1) }], light: false });
  const recv2 = new LightReceiver(W, { pos: [-142.3, -76.2, -104], face: '-x', accept: 'sun', size: 1.8 });
  lights.push(m2a, m2b, recv2);
  ck([-143.5, -78.8, -112], -Math.PI / 2, [3, 3, 6]);
  devStart('solar4', [-143.5, -78.8, -112], -Math.PI / 2, [RED], 'The west vault (node 2)');
  lamp(-143, -78.8, -115, { h: 2, pool: 0 });
  deep([VX1, -92, VZ1], [-138, -40, VZ2]);
  glyphs('+z', VZ1, -146, -70, 3, 1.4);
  glyphs('-z', VZ2, -152, -70, 3, 1.4);
  hint([-145, -80, -116], [-142, -76, -108], 'The corner mirror\'s turned by a <b style="color:#ff3344">red switch</b> in the north wall. You\'ll need a perch with a view of it — that baffle\'s in the way from here.', 8);
  hint([-151.5, -78, -121], [-148.5, -75, -118], 'This perch is <b>crumbling</b> — shoot the switch and <b>jump clear</b>!', 3);

  // ================================================================ S4 THE NORTH ANNEX (node 3: the lift)
  // A crack's beam lands on a mirror in the far west corner that creeps back if left alone; it must throw
  // the sun east along the wall to a mirror riding a cart, which must turn it south onto the catcher on
  // the south wall — only as the cart passes the catcher. Wait for the cart on a crumbling perch.
  const AX1 = -136, AX2 = -104, AZ1 = -150, AZ2 = -134;
  quick(AX1, AZ1, AX2, AZ2, PIT, -92, false);
  R(-140, -92, -154, -100, -40, -150); // north
  R(-140, -92, -150, -136, -40, -134); // west
  R(-104, -92, -150, -100, -40, -134); // east
  R(-140, -40, -154, -100, -10, -134); // the rock over it
  F(-112, -92, -138, -104, -78.8, -134); // the entry ledge
  glowEdge(-112, -138, -104, -134, -78.8, dglow, DZ);
  F(-108, -92, -142, -104, -79.2, -138); // the lift's seat
  const lift = new MovingPlatform(W, { min: [-108, -79.2, -142], max: [-104, -78.8, -138], offset: [0, 14.8, 0], speed: 2.4, pause: 2.2, active: false, zone, kind: 'grate' });
  for (const [x, z] of [[-108.3, -142.3], [-103.7, -142.3]]) M(x - 0.2, -79.2, z - 0.2, x + 0.2, -60, z + 0.2);
  F(-108, -66, -138, -104, -64, -134); // the upper landing, and the doorway onto the gallery
  glowEdge(-108, -138, -104, -134, -64, dglow, DZ);
  // the recovery stair (east wall, from the sand up to the lift's seat)
  for (let i = 0; i < 17; i++) F(-106.2, -92, -150 + i * 0.47, -104, -85.6 + 0.4 * i, -150 + (i + 1) * 0.47);
  B.crumble({ min: [-116, -78.8, -142], max: [-113, -78.4, -139], delay: 1.6, respawn: 5, zone }); // r1: wait here for the cart
  F(-127, -92, -142, -125, -78.2, -139); // r2, by the corner mirror
  R(-133, -92, -147, -131, -77.8, -145); // the corner mirror's pillar
  const cart = new MovingPlatform(W, { min: [-124, -78.6, -148], max: [-120, -78.2, -144], offset: [8, 0, 0], speed: 1.2, pause: 1, zone, kind: 'grate' });
  M(-124.5, -80, -149, -111.5, -79.6, -148.6); // its track
  M(-124.5, -80, -143.4, -111.5, -79.6, -143);
  const crack3 = new SunBeam(W, { from: [-132, -40.05, -146], dir: [0, -1, 0], source: 'crack', width: 0.4, near: 70 });
  beams.push(crack3);
  const m3a = new RotMirror(W, { pos: [-132, -76, -146], yaw: 0, start: 0, tilt: Math.PI / 4, size: [2.2, 1.7], post: 1.8, color: RED, drift: 8, home: 0 });
  const m3b = new RotMirror(W, { pos: [-122, -76, -146], yaw: 0, start: 1, size: [2.2, 1.7], post: 2.2, color: RED, follow: cart, followOffset: [2, 2.6, 2] });
  const recv3 = new LightReceiver(W, { pos: [-118, -76, -134.3], face: '-z', accept: 'sun', size: 1.8 });
  lights.push(m3a, m3b, recv3);
  ck([-108, -78.8, -136], Math.PI / 2, [4, 3, 4]);
  devStart('solar5', [-108, -78.8, -136], Math.PI / 2 + 0.3, [RED], 'The north annex (node 3, the lift)');
  lamp(-111, -78.8, -134.8, { h: 2, pool: 0 });
  deep([AX1, -92, AZ1], [AX2, -40, AZ2]);
  scarab([-126, -78.2, -140.5], { patrol: 0.8 });
  glyphs('-z', AZ2, -128, -70, 3, 1.4);
  hint([-112, -80, -138], [-104, -76, -134], 'The corner mirror <b>creeps back</b> when it\'s left alone, and the second one rides a <b>cart</b>. The catcher only sees the sun as the cart goes by.', 8);

  // ================================================================ S5 THE STARGATE (upper gallery)
  ck([-105, -64, -128], Math.PI, [4, 3, 4]);
  devStart('solar6', [-105, -64, -126], Math.PI * 0.9, [RED], 'The stargate (upper gallery)');
  hint([-108, -64, -134], [-102, -61, -126], 'The roof lens is open. Turn the <b>two pylon mirrors</b> so the sun runs <b>into the ring</b>.', 7);

  // ================================================================ the network: nodes → conduits → chevrons
  const conduits = [
    new Conduit(W, [[-95.9, -77.6, -117], [-95.9, -79.55, -117], [-95.9, -79.55, -112], [-104, -79.55, -112], [-104, -79.55, -119], [-102.25, -79.55, -119], [-102.25, -79.55, -129.75], [-102.25, -67, -129.75], [-112.4, -67, -129.75]]),
    new Conduit(W, [[-142.25, -76.2, -104], [-142.25, -78.75, -104], [-142.25, -78.75, -112], [-137.75, -78.75, -112], [-137.75, -78.75, -129.75], [-137.75, -67, -129.75], [-127.6, -67, -129.75]]),
    new Conduit(W, [[-118, -76, -134.25], [-118, -57.4, -134.25], [-118, -57.4, -129.75], [-120, -57.4, -129.75], [-120, -59.2, -129.75]]),
  ];
  const nodes = [
    { id: 'solar_n1', mirrors: [m1], correct: [1], recv: recv1, done: false },
    { id: 'solar_n2', mirrors: [m2a, m2b], correct: [2, 7], recv: recv2, done: false },
    { id: 'solar_n3', mirrors: [m3a, m3b], correct: [6, 3], recv: recv3, done: false },
  ];
  const wakeUp = () => {
    const n = nodes.filter((x) => x.done).length;
    capMat.color.copy(DORMANT).lerp(GOLD, n / 3).multiplyScalar(1 + n * 0.5);
    lampGlow.color.copy(DORMANT).lerp(new THREE.Color(1, 0.85, 0.6), Math.min(1, n / 2)).multiplyScalar(0.6 + n * 0.7);
    hallLight.intensity = n * 9;
  };
  let restoring = false;
  const solve = (i) => {
    const node = nodes[i];
    if (node.done) return;
    node.done = true;
    node.mirrors.forEach((m) => m.lock());
    conduits[i].light(restoring);
    gate.chevron(i, restoring);
    wakeUp();
    if (i === 1) bridge2.set(true, restoring);
    if (i === 2) {
      lift.active = true;
      oculus.enabled = true;
    }
    if (!game.events.has(node.id)) {
      game.events.add(node.id);
      game.save();
    }
    if (restoring) return;
    // the machine wakes: a thrum, relays clacking down the line, a rising harmonic
    audio.sample('reactor_hum', { gain: 0.6, rate: 0.6 });
    audio.sample('hydraulic_hiss', { gain: 0.5, rate: 0.8 });
    for (let k = 0; k < 4; k++) setTimeout(() => audio.sample('switch_on', { gain: 0.35, rate: 0.7 + k * 0.12 }), 300 + k * 220);
    const say = [
      'Node one wakes. Power runs into the dark — toward the <b>ring</b>.',
      'Node two: a <b>hard-light bridge</b> forms under the ring. The machine hums louder.',
      'Node three: the <b>lift</b> stirs — and high above, the roof lens irises open.',
    ][i];
    game.hud.message(say, 5);
  };
  nodes.forEach((n, i) => (n.recv.onOn = () => solve(i)));
  // the gate fires: the heart only takes the sun once all three chevrons burn
  let blown = false;
  const blow = (instant) => {
    if (blown) return;
    blown = true;
    plug.solid.enabled = false;
    plug.mesh.visible = false;
    plug.rubble.visible = true;
    plug.shaft.k = 1;
    f2.root.visible = false;
    W.removeHittable(f2.root);
    oculus.enabled = false;
    gate.spent();
    if (!game.events.has('solar_gate')) {
      game.events.add('solar_gate');
      game.save();
    }
    if (instant) return;
    // the discharge: a lance of yellow lightning down the hall, the wall bursts, the pylon mirror is gone
    const fx = W.fx, from = new THREE.Vector3(-120, -67, -127), to = new THREE.Vector3(-120, -60, -100);
    for (let s = 0; s <= 1; s += 0.04) {
      _v.lerpVectors(from, to, s);
      fx.flash(_v, 0xffd040, { size: 2.6, life: 0.35, k: 2.4, hot: 0.8 });
      fx.burst(_v, 0xffe080, { count: 6, speed: 6, life: 0.5, size: 0.3, gravity: 0 });
    }
    fx.flash(to, 0xfff0c0, { size: 9, life: 0.5, k: 2.6, hot: 0.9, end: 2 });
    fx.burst(to, 0xb08a58, { count: 140, speed: 16, life: 1.6, size: 0.7, gravity: 12, dir: new THREE.Vector3(0, 0.3, -1) });
    fx.burst(to, 0x6a5a48, { count: 60, speed: 6, life: 3, size: 1.6, gravity: -0.6, drag: 1.4, mode: 'puff' });
    fx.sparks(to, new THREE.Vector3(0, 0, -1), 0xffd070, { count: 60, speed: 22, spread: 1.6, life: 0.9, gravity: 10 });
    fx.burst(new THREE.Vector3(-120, -67, -108), 0xffe0a0, { count: 50, speed: 10, life: 0.8, size: 0.25, gravity: 8 });
    game.player.shake = Math.max(game.player.shake || 0, 1.4);
    audio.sample('boss_slam', { gain: 1.2, rate: 0.7 });
    audio.sample('mortar_blast', { gain: 1, rate: 0.6 });
    audio.sample('floor_collapse', { gain: 1, rate: 0.8 });
    setTimeout(() => audio.sample('shatter', { gain: 0.8, rate: 0.5 }), 120);
    setTimeout(() => game.hud.message('The gate\'s blast tore the south wall open — <b>daylight</b> beyond.', 5), 1400);
  };
  heart.onOn = () => {
    if (blown) return;
    if (gate.lit < 3) return void setTimeout(() => heart.reset(), 0);
    gate.charge(() => blow(false));
  };
  // the hole: its sill is the gallery's floor; a checkpoint just inside it
  ck([-120, -64, -98], Math.PI, [8, 3, 4]);

  // ================================================================ persistence and starts
  // A start position past a node counts it done (Select Location starts, a save at a later checkpoint).
  const stageAt = (p) => {
    const inBox = (x1, x2, z1, z2, y1, y2) => p.x >= x1 && p.x <= x2 && p.z >= z1 && p.z <= z2 && p.y >= y1 && p.y <= y2;
    if (p.x > -25 || inBox(-64, -25, -134, -96, -1, 40) || inBox(-102, -60, -134, -96, -95, 40)) return 0; // entry, balcony, sinkhole
    if (inBox(-138, -100, -130, -100, -95, -66) || inBox(-164, -138, -132, -96, -95, -40)) return p.z < -126 && p.y > -80 ? 2 : 1; // the hall's lower level, the west vault
    if (inBox(-140, -100, -154, -134, -95, -66)) return 2; // the annex below
    if (inBox(-140, -100, -154, -100, -66, -40)) return inBox(-126, -114, -102, -94, -66, -56) ? 4 : 3; // the upper gallery
    return 4; // anywhere past the gate
  };
  const applySaved = (stage) => {
    restoring = true;
    nodes.forEach((n, i) => {
      if (n.done || !(ev(n.id) || stage > i)) return;
      n.mirrors.forEach((m, j) => m.setIndex(n.correct[j]));
      n.recv.keep = true;
      n.recv.setOn(true, null, true);
    });
    if (ev('solar_gate') || stage >= 4) blow(true);
    restoring = false;
  };
  let first = true;
  W.add({
    update(dt, player) {
      if (first && game.state === 'playing') {
        first = false;
        applySaved(stageAt(game.checkpoint?.pos || player.pos));
      }
    },
  });
  onRespawn(() => applySaved(0));
  wakeUp();

  // the HUD objective for this stretch
  const Y = '<b style="color:#ffd23a">', E = '</b>';
  const objective = (p) => {
    const inBox = (x1, x2, z1, z2, y1 = -99, y2 = 99) => p.x >= x1 && p.x <= x2 && p.z >= z1 && p.z <= z2 && p.y >= y1 && p.y <= y2;
    if (has(YELLOW)) return null;
    if (inBox(-38, -25, -114, -110)) return 'Out onto the <b>Sunward Balcony</b>.';
    if (inBox(-64, -38, -124, -104, 1)) return 'Walk out along the <b>broken bridge</b> — and step off the end. The <b>quicksand</b> will catch you.';
    if (inBox(-76, -64, -114, -110, 1)) return 'Step off the broken end. Trust the <b>quicksand</b>.';
    if (inBox(-96, -60, -130, -100, -90, 3)) {
      if (player().pos.y > -60) return 'Falling — into the <b>quicksand</b>!';
      return nodes[0].done ? 'The tunnel is open: <b>west</b>, into the dark.' : `Turn the <b>mirror</b> (shoot it <b style="color:#ff3344">red</b>) to throw the sun onto the <b>sun-catcher</b> by the sealed tunnel.`;
    }
    if (inBox(-164, -138, -132, -96, -95, -40)) return nodes[1].done ? 'Node two runs. Back to the hall: the <b>hard-light bridge</b> under the ring.' : 'Send the sun from the corner mirror (its <b style="color:#ff3344">red switch</b> is in the north wall) to the south mirror, then <b>east</b> onto the catcher.';
    if (inBox(-140, -100, -154, -134, -95, -60)) return nodes[2].done ? 'Ride the <b>lift</b> up to the gallery.' : 'Throw the sun <b>east</b> from the corner mirror onto the mirror on the <b>cart</b>, and turn that one <b>south</b>: the catcher lights as the cart goes by.';
    if (inBox(-140, -100, -134, -100, -66, -40)) return blown ? 'Through the <b>hole</b> in the south wall.' : `Turn the two <b>pylon mirrors</b>: the roof lens's sun must run <b>west</b>, then <b>north</b> into the ring's ${Y}heart${E}.`;
    if (inBox(-140, -100, -134, -100, -95, -66)) {
      if (!nodes[1].done) return 'West: hop the <b>planks</b>, take the <b>cable car</b>, and find the vault beyond the machine slab.';
      if (!nodes[2].done) return 'Cross the <b>hard-light bridge</b> under the ring to the <b>annex door</b> in the north wall.';
      return 'The <b>lift</b> in the annex climbs to the upper gallery.';
    }
    return null;
  };
  const player = () => game.player;

  return { nodes, gate, heart, f1, f2, m1, m2a, m2b, m3a, m3b, recv1, recv2, recv3, lift, car, cart, bridge2, oculus, door1, sw2, plug, conduits, objective, get blown() { return blown; }, stageAt };
}
