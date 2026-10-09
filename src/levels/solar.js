// SOLAR — SUNSCORCH MESA, the yellow world: the Lumen's sun-farm round a captive sun, and the excavation
// under it where the yellow core lies buried. See LAYOUT.md for its region and Hub ports. The loop, in
// order (devStarts in brackets):
//  [solar]   Hub west port (z -112, y 4) → THE SUNWARD OVERLOOK (y 4): the whole world laid out ahead — the
//            arrays, the yard, the glass canyon, the dune sea, the Sun Court and its lens, the windmills
//  [solar1]  THE DIG SHAFT: the survey gantry over the excavation gives way: a long fall into the quicksand
//            at the bottom of the shaft (it breaks the fall) — mash JUMP and wade to the tunnel
//  [solar2]  THE DIG GALLERY (underground, no combat): scaffolds, crumbling planks and the plates of a buried
//            machine over a deep quicksand pit, lamps and daylight through cracks; up to the vault door
//  [solar3]  THE CORE VAULT: the YELLOW core on its dais in a shaft of sunlight (the unlock cutscene)
//  [solar4]  THE FIRST LENS (puzzle, 1 mirror): turn the mirror so a shot off its face runs down the slot
//            to the receiver; the door opens
//  [solar5]  THE BANK (puzzle, 2 mirrors): bank a shot through the slot in the screen, across the pit, off
//            the far mirror into the receiver behind the baffle → a hard-light bridge. A daylight crack and a
//            tilting mirror burn through a sand-glass seal (the Sunken Cache, secret)
//  [solar6]  THE GRAND LENS (puzzle, 4 mirrors): shoot the prism; its sunbeam must run round all four
//            mirrors (the last one throws it up) into the sun-catcher that powers the lift to the surface
//  [solar7]  THE MIRROR YARD (combat, the first yellow arena): rotatable solar panels round the yard to bank
//            shots off, quicksand pools, three waves (all yellow)
//  [solar8]  THE PANEL COURT (light puzzle): turn three panels so the sky-lens's beam reaches the gate's
//            sun-catcher
//  [solar9]  THE GLASS CANYON: aim the lens beam at the sand-glass wall (it boils away), then turn the next
//            panel onto the catcher that wakes the jump pad
//  [solar10] THE SUN BRIDGES (platforming + light): pillars over a deep quicksand chasm; turn the panel on
//            each pillar onto its catcher to raise the next hard-light bridge; time the lance
//  [solar11] THE SINKING FLATS: the only way on is down — drop into the quicksand basin and struggle to the lip
//  [solar12] THE DOCK YARD (combat + light): turn the heliostat to sweep the sunbeam through the attackers
//  [solar13] THE HOVER DOCK → the hovercraft dune run (solarDunes.js: buildDuneRun) over the dune sea →
//  [solar14] THE SUN QUAY: the lift up the court mesa
//  [solar15] THE SUN COURT: the Sphinx (sphinxArena.js) and the sun-lens it guards: the world's POWER SOURCE.
//            Shoot it YELLOW → game.shutDownWorld('solar'): the sun is eclipsed, dusk falls, the beams die.
//  [solar16] SUNSET CAUSEWAY (y 12) → Hub west balcony port (z -136, y 12); one-way (a 4 m drop).
// Before the core: no fights. From the core on, every enemy's body is yellow, with red layered in (red shields,
// red/yellow palettes, a warden's red shell, the Sphinx's red paw gems) so fights keep you switching 1 ↔ 2.
// Color locks: GREEN grotto (overlook, secret), BLUE Eclipse Vault (causeway, secret); the Sunken Cache
// (secret) is burned open with sunlight.
// Light puzzles: src/entities/sunlight.js (RotMirror, LightReceiver, BurnWall, SunBeam, SunEmitter).
import * as THREE from 'three';
import { RED, YELLOW, GREEN, BLUE } from '../colors.js';
import { Barrier } from '../entities/barrier.js';
import { Drone } from '../entities/drone.js';
import { JumpPad, Checkpoint } from '../entities/misc.js';
import { Elevator } from '../entities/elevator.js';
import { PhasePlatform } from '../entities/mechanics.js';
import { Seal } from '../entities/combat.js';
import { RotMirror, LightReceiver, BurnWall, SunBeam, SunEmitter, LightShaft } from '../entities/sunlight.js';
import { liquidMaterial } from '../liquid.js';
import { mat } from '../materials.js';
import { audio } from '../audio.js';
import { buildSphinxArena } from './sphinxArena.js';
import { SUN_DIR, inSolar, underground, POWER_ZONE, Sun, SunLance, hazeMat, heatHaze, hazeMeshes, CollectorArray, PowerBeam, DUSK, mergeBoxes } from './solarSky.js';
import { solarScenery, PVArray } from './solarScenery.js';

// The hovercraft dune run is its own module (solarDunes.js). It's optional here: without it a stand-in
// walkway joins the two docks, so the world still builds and plays.
const duneModule = Object.values(import.meta.glob('./solarDunes.js', { eager: true }))[0] || null;

const SOUNDS = ['floor_collapse', 'sand_sink', 'land_sand', 'elevator_start', 'gate_open', 'switch_on', 'energy_crackle', 'servo_heavy', 'hydraulic_hiss'];
audio.manifest?.then(() => audio.prefetch(SOUNDS));

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

// a rectangle minus rectangular holes, as a few rectangles ([u1, v1, u2, v2])
function rectMinus(u1, v1, u2, v2, holes) {
  const cl = (x, a, b) => Math.max(a, Math.min(b, x));
  const uniq = (a) => [...new Set(a)].sort((p, q) => p - q);
  const us = uniq([u1, u2, ...holes.flatMap((h) => [cl(h[0], u1, u2), cl(h[2], u1, u2)])]);
  const vs = uniq([v1, v2, ...holes.flatMap((h) => [cl(h[1], v1, v2), cl(h[3], v1, v2)])]);
  const inHole = (u, v) => holes.some((h) => u > h[0] && u < h[2] && v > h[1] && v < h[3]);
  const out = [];
  for (let j = 0; j < vs.length - 1; j++) {
    let start = null;
    const cv = (vs[j] + vs[j + 1]) / 2;
    for (let i = 0; i < us.length - 1; i++) {
      const solid = !inHole((us[i] + us[i + 1]) / 2, cv);
      if (solid && start === null) start = us[i];
      if (!solid && start !== null) (out.push([start, vs[j], us[i], vs[j + 1]]), (start = null));
    }
    if (start !== null) out.push([start, vs[j], us[us.length - 1], vs[j + 1]]);
  }
  return out;
}

// a box geometry stretched from a to b (w × h across), for cables, braces and pipes
function beamGeo(a, b, w = 0.1, h = w) {
  const len = a.distanceTo(b);
  const g = new THREE.BoxGeometry(w, h, len);
  _m.lookAt(a, b, Math.abs(b.y - a.y) > len * 0.95 ? new THREE.Vector3(1, 0, 0) : UP);
  _q.setFromRotationMatrix(_m);
  g.applyQuaternion(_q);
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

// the hard-light glyph panels of the Lumen's buried machines: abstract geometry (circuit traces, nested
// squares, dot grids), drawn once
let glyphPanelTex = null;
function glyphPanel() {
  if (glyphPanelTex) return glyphPanelTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, 256, 128);
  g.strokeStyle = '#fff';
  g.fillStyle = '#fff';
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.lineWidth = 2;
  g.strokeRect(4, 4, 248, 120);
  for (let k = 0; k < 4; k++) {
    // nested squares
    const x = 16 + k * 60, s = 36;
    for (let r = 0; r < 3; r++) g.strokeRect(x + r * 5, 22 + r * 5, s - r * 10, s - r * 10);
    g.fillRect(x + 15, 37, 6, 6);
  }
  // circuit traces with nodes
  for (let k = 0; k < 9; k++) {
    let x = 10 + rnd() * 236, y = 74 + rnd() * 40;
    g.beginPath();
    g.moveTo(x, y);
    for (let s = 0; s < 3; s++) {
      if (s % 2) x += (rnd() - 0.5) * 60;
      else y = 70 + rnd() * 48;
      g.lineTo(x, y);
    }
    g.stroke();
    g.beginPath();
    g.arc(x, y, 3, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 24; i++) g.fillRect(12 + i * 10, 64, 3, 3);
  glyphPanelTex = new THREE.CanvasTexture(c);
  glyphPanelTex.colorSpace = THREE.SRGBColorSpace;
  return glyphPanelTex;
}

// Quicksand drags you down (player.js sinkIn), sun lances hum, and dust drifts in the heat — or, in the
// excavation, hangs in the lamplight. down: the engine is off (no hum, cold dust).
class SolarDirector {
  constructor(W, game) {
    this.world = W;
    this.game = game;
    this.slag = [];
    this.lances = [];
    this.moteT = 0;
    this.down = false;
    this.hum = audio.createLoop('sun_hum', { gain: 0 });
    W.add(this);
  }

  update(dt, player) {
    const p = player.pos;
    if (!inSolar(p) || p.x > -25) {
      this.hum.setGain(0);
      return;
    }
    const b = player.bounds();
    if (!player.dead && player.invuln <= 0 && !this.game.godMode) {
      for (const s of this.slag) {
        if (b.min.x < s.max.x + 0.04 && b.max.x > s.min.x - 0.04 && b.min.y < s.max.y + 0.06 && b.max.y > s.min.y && b.min.z < s.max.z + 0.04 && b.max.z > s.min.z - 0.04) {
          player.touchLava(); // (quicksand drags you down rather than kills on touch: player.js sinkIn)
          break;
        }
      }
    }
    let g = 0;
    for (const l of this.lances) {
      const dx = Math.max(l.min.x - p.x, 0, p.x - l.max.x), dy = Math.max(l.min.y - p.y, 0, p.y - l.max.y), dz = Math.max(l.min.z - p.z, 0, p.z - l.max.z);
      g = Math.max(g, l.I * Math.max(0, 1 - Math.hypot(dx, dy, dz) / 18));
    }
    this.hum.setGain(g * 0.55);
    hazeMat.uniforms.uTime.value += dt;
    this.moteT += dt;
    const deep = underground(p);
    if (this.moteT > (deep ? 0.08 : this.down ? 0.25 : 0.07)) {
      this.moteT = 0;
      const r = deep ? 16 : 36;
      const m = new THREE.Vector3(p.x + (Math.random() - 0.5) * r, p.y - 1 + Math.random() * (deep ? 5 : 9), p.z + (Math.random() - 0.5) * r);
      // (down here a mote right in front of the eye would bloom into a blob: keep them a few metres off)
      if (deep) m.distanceTo(this.game.camera.position) > 3 && this.world.fx.burst(m, Math.random() < 0.3 ? 0xb08040 : 0x806a50, { count: 1, speed: 0.12, life: 4, size: 0.035, gravity: -0.03, drag: 0.8, spread: 1 });
      else if (this.down) this.world.fx.burst(m, 0x9a8aa0, { count: 1, speed: 0.3, life: 3.2, size: 0.08, gravity: 0.15, drag: 0.4, spread: 1 });
      else this.world.fx.burst(m, Math.random() < 0.3 ? 0xff9a3a : 0xffd890, { count: 1, speed: 0.4, life: 3.2, size: 0.11, gravity: -0.35, drag: 0.4, spread: 1 });
    }
  }
}

// A stand-in for the hovercraft dune run (until solarDunes.js is in): a walkway between the two docks.
function standInDuneRun(B, { start, end, onDone }) {
  const { W, game, plat, blocker } = B;
  const [sx, sy, sz] = start, [ex, ey, ez] = end;
  const x1 = Math.min(sx, ex) - 2, x2 = Math.max(sx, ex) + 2;
  plat(x1, Math.min(sz, ez) - 2, x2, Math.max(sz, ez) + 2, Math.max(sy, ey), 'yellow', 0.6);
  blocker([x1 - 0.4, sy, Math.min(sz, ez) - 2], [x1, sy + 40, Math.max(sz, ez) + 2]);
  blocker([x2, sy, Math.min(sz, ez) - 2], [x2 + 0.4, sy + 40, Math.max(sz, ez) + 2]);
  W.trigger([ex - 3, ey - 1, ez - 3], [ex + 3, ey + 3, ez + 3], () => onDone?.());
  W.trigger([sx - 3, sy - 1, sz - 3], [sx + 3, sy + 3, sz + 3], () => game.hud.message('(Stand-in walkway: the hovercraft dune run plugs in here.)', 3));
  return { standIn: true };
}

export function buildSolar(B) {
  const { W, game, level, GLOW, corridorX, plat, pedestal, secretRoom, trophy, hint, hintEvery, zoneTitle, area, light, barrierWallX, blocker, killZone, devStart, guideStrip, glowEdge, onRespawn } = B;
  const zone = 'yellow';
  const glow = GLOW[zone];
  const R = (x1, y1, z1, x2, y2, z2) => W.box(x1, y1, z1, x2, y2, z2, 'rock', zone);
  const M = (x1, y1, z1, x2, y2, z2) => W.box(x1, y1, z1, x2, y2, z2, 'metal', zone);
  const F = (x1, y1, z1, x2, y2, z2) => W.box(x1, y1, z1, x2, y2, z2, 'floor', zone); // dressed stone
  const GR = (x1, y1, z1, x2, y2, z2) => W.box(x1, y1, z1, x2, y2, z2, 'grate', zone);
  const D = (x1, y1, z1, x2, y2, z2, kind = 'metal') => W.deco(x1, y1, z1, x2, y2, z2, kind, zone);
  const G = (x1, y1, z1, x2, y2, z2) => W.deco(x1, y1, z1, x2, y2, z2, glow, zone); // wayfinding glow (stays lit)
  const PG = (x1, y1, z1, x2, y2, z2) => W.deco(x1, y1, z1, x2, y2, z2, 'glow1', POWER_ZONE); // sun-powered glow (dies)
  const SKY = 60;
  const S = -8; // the surface (the desert floor)
  const amber = 0xffc23a;
  const director = new SolarDirector(W, game);
  const lances = director.lances;
  const has = (c) => game.blaster.has && game.blaster.unlocked[c];
  const mood = { music: 'music_solar', ambient: 'amb_solar', atmosphere: 'solar' };
  const ck = (pos, yaw, size = [4, 3, 4]) => new Checkpoint(W, game, { pos, yaw, size });
  // the excavation's mood: quiet, dark, dusty (and once you hold yellow, the Solar theme comes back)
  level.atmospheres.solarDeep = {
    fog: 0x140c06, fogNear: 6, fogFar: 58,
    skyTop: [0.03, 0.02, 0.015], skyMid: [0.06, 0.04, 0.025], skyHorizon: [0.1, 0.07, 0.04], aurora: 0, stars: 0,
    hemiSky: 0xc8a078, hemiGround: 0x20140c, hemiIntensity: 0.34,
    sunColor: 0xffc890, sunIntensity: 0.1, sunDir: [0.2, 1, 0.1],
    exposure: 1.1, bloom: 0.75,
  };
  const deep = (min, max) =>
    W.trigger(min, max, () => {
      game.setMusic(has(YELLOW) ? 'music_yellow' : 'music_haunt');
      game.setAmbient('amb_wind');
      game.setAtmosphere('solarDeep');
    }, { once: false });
  // quicksand: a pool whose surface (top at y) drags you down, with heat haze over it out in the sun
  const quick = (x1, z1, x2, z2, y, base = y - 6, haze = true) => {
    R(x1, base, z1, x2, y - 0.4, z2);
    director.slag.push(W.box(x1, y - 0.4, z1, x2, y, z2, 'acid', zone));
    if (haze) heatHaze(W, Math.min(x1, x2), Math.min(z1, z2), Math.max(x1, x2), Math.max(z1, z2), y);
  };
  // a pillar standing out of a pit with a trimmed slab on top
  const pillar = (x1, z1, x2, z2, top, base = -30) => {
    R(x1, base, z1, x2, top - 0.6, z2);
    plat(x1, z1, x2, z2, top, zone, 0.6);
  };
  const strata = (x1, z1, x2, z2, ys) => ys.forEach((y) => W.deco(x1, y, z1, x2, y + 0.5, z2, 'rock', zone));
  const lance = (o) => {
    const l = new SunLance(W, o);
    lances.push(l);
    return l;
  };
  const housing = (x1, z1, x2, z2, y) => {
    M(x1 - 0.3, y, z1 - 0.3, x2 + 0.3, y + 0.8, z2 + 0.3);
    const t = 0.12, b = y - 0.05;
    PG(x1, b, z1, x2, y, z1 + t);
    PG(x1, b, z2 - t, x2, y, z2);
    PG(x1, b, z1, x1 + t, y, z2);
    PG(x2 - t, b, z1, x2, y, z2);
  };
  // (mast: which side of the housing its mast stands: '+x' or '-z')
  const lanceRig = (x1, z1, x2, z2, y0, y1, o = {}, mastBase = -30, mast = '+x') => {
    housing(x1, z1, x2, z2, y1);
    if (mast === '-z') M((x1 + x2) / 2 - 0.35, mastBase, z1 - 1.0, (x1 + x2) / 2 + 0.35, y1 + 0.8, z1 - 0.3);
    else M(x2 + 0.3, mastBase, (z1 + z2) / 2 - 0.35, x2 + 1.0, y1 + 0.8, (z1 + z2) / 2 + 0.35);
    return lance({ min: [x1, y0, z1], max: [x2, y1, z2], ...o });
  };
  // merged dressing meshes in custom materials (one draw each): cables, steel pipes, lamp faces, glyphs
  const cableGeos = [], pipeGeos = [], lampGeos = [], poolGeos = [], glyphGeos = [];
  const cable = (pts, w = 0.07) => {
    for (let i = 0; i < pts.length - 1; i++) cableGeos.push(beamGeo(new THREE.Vector3(...pts[i]), new THREE.Vector3(...pts[i + 1]), w));
  };
  // a sagging cable between two points
  const droop = (a, b, sag = 0.8, n = 6) => {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t]);
    }
    cable(pts);
  };
  const pipe = (a, b, w = 0.12) => pipeGeos.push(beamGeo(new THREE.Vector3(...a), new THREE.Vector3(...b), w));
  // a work lamp: a caged head on a pole (or hung from above) throwing a pool of light on the floor
  const lamp = (x, y, z, { h = 2.6, hang = false, pool = 2.4, real = false, dir = 0 } = {}) => {
    const hy = hang ? y : y + h;
    if (!hang) {
      pipe([x, y, z], [x, hy, z], 0.08);
      for (let k = 0; k < 3; k++) {
        const a = dir + (k / 3) * Math.PI * 2;
        pipe([x, y + 0.9, z], [x + Math.cos(a) * 0.55, y, z + Math.sin(a) * 0.55], 0.05);
      }
    }
    D(x - 0.22, hy - 0.05, z - 0.22, x + 0.22, hy + 0.25, z + 0.22);
    lampGeos.push(new THREE.BoxGeometry(0.36, 0.06, 0.36).translate(x, hy - 0.08, z));
    if (pool) poolGeos.push(new THREE.CircleGeometry(pool, 18).rotateX(-Math.PI / 2).translate(x, (hang ? y - h : y) + 0.035, z));
    if (real) light(x, hy - 0.4, z, 0xffc888, 14, 13);
  };
  // a hard-light glyph panel on a wall: n = the way the face looks
  const glyphs = (n, at, u, y, w = 2.4, h = 1.2) => {
    const g = new THREE.PlaneGeometry(w, h);
    if (n === '+x') g.rotateY(Math.PI / 2).translate(at + 0.04, y, u);
    else if (n === '-x') g.rotateY(-Math.PI / 2).translate(at - 0.04, y, u);
    else if (n === '+z') g.translate(u, y, at + 0.04);
    else g.rotateY(Math.PI).translate(u, y, at - 0.04);
    glyphGeos.push(g);
  };
  // a sensor pylon: a slim mast with glowing bands and a sensor eye at the top
  const pylon = (x, y, z, h = 4.5) => {
    M(x - 0.35, y, z - 0.35, x + 0.35, y + 0.4, z + 0.35);
    D(x - 0.18, y + 0.4, z - 0.18, x + 0.18, y + h, z + 0.18);
    for (let k = 1.2; k < h - 0.4; k += 1.1) PG(x - 0.2, y + k, z - 0.2, x + 0.2, y + k + 0.07, z + 0.2);
    D(x - 0.3, y + h, z - 0.3, x + 0.3, y + h + 0.5, z + 0.3);
    PG(x - 0.31, y + h + 0.18, z - 0.31, x + 0.31, y + h + 0.32, z + 0.31);
  };
  // a scaffold: steel pipes at the corners and rails every couple of metres down to `base` (the deck itself
  // is the level's own solid)
  const scaffold = (x1, z1, x2, z2, base, top) => {
    for (const [x, z] of [[x1 + 0.1, z1 + 0.1], [x2 - 0.1, z1 + 0.1], [x1 + 0.1, z2 - 0.1], [x2 - 0.1, z2 - 0.1]]) pipe([x, base, z], [x, top, z], 0.1);
    for (let y = top - 0.1; y > base; y -= 2.2) {
      pipe([x1, y, z1 + 0.1], [x2, y, z1 + 0.1], 0.07);
      pipe([x1, y, z2 - 0.1], [x2, y, z2 - 0.1], 0.07);
      pipe([x1 + 0.1, y, z1], [x1 + 0.1, y, z2], 0.07);
      pipe([x2 - 0.1, y, z1], [x2 - 0.1, y, z2], 0.07);
      if (y - 2.2 > base) {
        pipe([x1 + 0.1, y, z1 + 0.1], [x2 - 0.1, y - 2.2, z1 + 0.1], 0.06);
        pipe([x1 + 0.1, y - 2.2, z2 - 0.1], [x2 - 0.1, y, z2 - 0.1], 0.06);
      }
    }
  };
  // a slab of the Lumen's buried machinery jutting out of the sand: a dark metal plate with glowing seams
  const machinePlate = (x1, z1, x2, z2, top, base = -30) => {
    M(x1, base, z1, x2, top, z2);
    PG(x1 - 0.02, top - 0.35, z1 - 0.02, x2 + 0.02, top - 0.27, z2 + 0.02);
    D(x1 + 0.3, top, z1 + 0.3, x2 - 0.3, top + 0.06, z2 - 0.3, 'grate');
  };
  // dress a machine vault (interior x1..x2 / z1..z2, floor y0, roof y1): metal ribs up the walls every few
  // metres carrying a beam across the roof, a conduit along the foot of each wall with sun-powered bands, a
  // glowing trim under the roof. avoid: [[x1, z1, x2, z2], ...] keeps doorways and stairs clear.
  const vault = (x1, z1, x2, z2, y0, y1, avoid = [], every = 6) => {
    const clear = (ax, az, bx, bz) => !avoid.some(([u1, v1, u2, v2]) => ax < u2 && bx > u1 && az < v2 && bz > v1);
    const t = 0.45;
    for (let x = x1 + every / 2; x < x2 - 1; x += every) {
      for (const [za, zb] of [[z1, z1 + t], [z2 - t, z2]]) if (clear(x - 0.45, za, x + 0.45, zb)) D(x - 0.45, y0, za, x + 0.45, y1, zb);
      if (clear(x - 0.3, z1, x + 0.3, z2)) D(x - 0.3, y1 - 0.7, z1, x + 0.3, y1, z2);
    }
    for (let z = z1 + every / 2; z < z2 - 1; z += every) for (const [xa, xb] of [[x1, x1 + t], [x2 - t, x2]]) if (clear(xa, z - 0.45, xb, z + 0.45)) D(xa, y0, z - 0.45, xb, y1, z + 0.45);
    // conduits at the foot of the walls, broken at doorways
    const run = (ax, az, bx, bz) => {
      if (!clear(Math.min(ax, bx) - 0.3, Math.min(az, bz) - 0.3, Math.max(ax, bx) + 0.3, Math.max(az, bz) + 0.3)) return;
      pipe([ax, y0 + 0.35, az], [bx, y0 + 0.35, bz], 0.32);
    };
    const step = 3;
    for (let x = x1; x < x2 - 0.01; x += step) {
      run(x, z1 + 0.25, Math.min(x + step, x2), z1 + 0.25);
      run(x, z2 - 0.25, Math.min(x + step, x2), z2 - 0.25);
    }
    for (let z = z1; z < z2 - 0.01; z += step) {
      run(x1 + 0.25, z, x1 + 0.25, Math.min(z + step, z2));
      run(x2 - 0.25, z, x2 - 0.25, Math.min(z + step, z2));
    }
    PG(x1, y1 - 0.95, z1, x2, y1 - 0.88, z1 + 0.05);
    PG(x1, y1 - 0.95, z2 - 0.05, x2, y1 - 0.88, z2);
  };
  // a low sand drift (decor, wade through it)
  const drift = (x, y, z, w, d) => {
    for (let k = 0; k < 3; k++) W.deco(x - w / 2 + k * w * 0.15, y, z - d / 2 + k * d * 0.15, x + w / 2 - k * w * 0.12, y + 0.12 * (k + 1), z + d / 2 - k * d * 0.12, 'plat', zone);
  };
  // a lens mast: a steel mast with an arm holding a collector lens out over `at`, which pours a sunbeam
  // straight down from height y
  const skyLens = (at, y, mast) => {
    const [mx, mz] = mast;
    M(mx - 0.4, at[1], mz - 0.4, mx + 0.4, y + 1.6, mz + 0.4);
    for (let k = at[1] + 3; k < y; k += 3) PG(mx - 0.42, k, mz - 0.42, mx + 0.42, k + 0.1, mz + 0.42);
    pipe([mx, y + 1.3, mz], [at[0], y + 1.3, at[2]], 0.35);
    pipe([mx, y - 2, mz], [at[0], y + 1.1, at[2]], 0.18);
    return new SunBeam(W, { from: [at[0], y, at[2]], dir: [0, -1, 0], source: 'lens', width: 0.5 });
  };
  const doorLink = (seal) => ({ activate: () => seal.open(), deactivate: () => {} });
  // underground the ledges' outlines glow dimmer (the lamplight carries the mood)
  mat('glow1', 'solarDeep').color.multiplyScalar(0.42);
  const dglow = 'glow1', DZ = 'solarDeep';
  const lights = []; // the light-puzzle pieces, for the shutdown and restored saves
  const seamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.62, 0.2).multiplyScalar(1.15) }); // the buried machines' seams
  const beams = [];

  const sun = new Sun(W, game);
  level.atmospheres.solar = {
    fog: 0xc8884a, fogNear: 90, fogFar: 520,
    skyTop: [0.3, 0.19, 0.1], skyMid: [0.72, 0.4, 0.15], skyHorizon: [0.92, 0.6, 0.3], aurora: 0, stars: 0,
    hemiSky: 0xffd9a8, hemiGround: 0x5a3420, hemiIntensity: 0.8,
    sunColor: 0xffd29a, sunIntensity: 2.7, sunDir: SUN_DIR,
    exposure: 0.95, bloom: 0.35,
  };

  // ================================================================ THE SURFACE FLOOR (y -8)
  // One slab over everything (it's the excavation's roof), with holes for the dig shaft, the lift hatch,
  // the yard's quicksand pools, the chasm, the sinking flats and the stairs out of them.
  const HOLES = [
    [-80, -120, -66, -104], // the dig shaft
    [-107, -61, -103, -57], // the lift hatch
    [-126, -54, -118, -48], // yard pool 1
    [-100, -78, -94, -70], // yard pool 2
    [-200, -152, -144, -132], // the chasm and its rims
    [-206, -132, -184, -92], // the ledge and the sinking flats
    [-184, -132, -162, -92], // the plateau
    [-200, -92, -192, -84], // the stairs up out of the flats
  ];
  for (const [x1, z1, x2, z2] of rectMinus(-212, -232, -32, -40, HOLES)) R(x1, -10, z1, x2, S, z2);
  killZone([-440, -40, -240], [-31.5, -30.5, -38]);

  // ================================================================ S0 ENTRY + THE SUNWARD OVERLOOK (y 4)
  // A sandstone promontory high over the desert floor. Parapets all round; the only way on is out along
  // the survey gantry over the dig shaft.
  corridorX({ xStart: -25, xEnd: -38, y: 4, zone, cz: -112 });
  R(-38, -24.4, -124, -32, 3, -100);
  R(-38, 3, -110, -32, 8, -100);
  R(-38, 3, -124, -32, 8, -114);
  M(-31, -6, -113, -28, 3, -111);
  area([-30, 4, -113.5], [-27, 7.2, -110.5], mood);
  devStart('solar', [-27, 4, -112], Math.PI / 2, [0], 'Solar: the entrance');
  R(-66, -30, -120, -38, 4, -104); // the promontory
  R(-66, -30, -124, -63, 5.2, -120);
  zoneTitle([-40, 4, -114], [-38, 8, -110], 'SOLAR', 'SUNSCORCH MESA', '#ffd23a', 'music_solar');
  area([-44, 4, -117], [-38, 8, -107], mood);
  area([-66, 4, -120], [-44, 14, -104], mood);
  ck([-44, 4, -112], Math.PI / 2, [6, 3, 10]);
  // parapets: south, and the west edge either side of the gantry
  F(-66, 4, -104.6, -38, 4.5, -104);
  F(-66.4, 4, -120, -65.6, 4.5, -113.3);
  F(-66.4, 4, -110.7, -65.6, 4.5, -104.6);
  for (const [x1, z1, x2, z2] of [[-66, -104.5, -38, -104.1], [-66.3, -120, -65.7, -113.3], [-66.3, -110.7, -65.7, -104.5]]) M(x1, 5.05, z1, x2, 5.15, z2);
  // the survey platform: a stair up to a high deck at the west end, the best view of the whole world
  const SV = 9.2;
  for (let i = 0; i < 13; i++) F(-51.5 - 0.5 * (i + 1), 4, -114, -51.5 - 0.5 * i, 4 + 0.4 * (i + 1), -110);
  F(-66, 4, -116, -58, SV, -108);
  glowEdge(-66, -116, -58, -108, SV, glow, zone);
  for (const [x1, z1, x2, z2] of [[-66, -116, -58, -115.8], [-66, -108.2, -58, -108], [-58.2, -116, -58, -114], [-58.2, -110, -58, -108], [-66, -116, -65.8, -113.2], [-66, -110.8, -65.8, -108]]) {
    M(x1, SV + 1, z1, x2, SV + 1.1, z2);
    blocker([x1, SV, z1], [x2, SV + 40, z2]);
  }
  for (const [x, z] of [[-58.1, -115.9], [-58.1, -108.1], [-65.9, -115.9], [-65.9, -108.1], [-62, -115.9], [-62, -108.1]]) M(x - 0.06, SV, z - 0.06, x + 0.06, SV + 1, z + 0.06);
  M(-58.2, 4, -114.2, -51.5, 4.1, -114); // the stair's side rails
  M(-58.2, 4, -110, -51.5, 4.1, -109.8);
  for (let x = -64; x > -40; x -= 4) M(x - 0.06, 4.5, -104.36, x + 0.06, 5.05, -104.24);
  blocker([-66, 4, -105], [-38, SKY, -103.5]);
  blocker([-67, 4, -120], [-65.6, SKY, -113.3]);
  blocker([-67, 4, -110.7], [-65.6, SKY, -104]);
  // the survey pylons framing the view, with a truss across carrying a hard-light survey board and lamps
  for (const z of [-116.6, -107.4]) {
    M(-65.6, SV, z - 0.3, -65, 20.5, z + 0.3);
    for (let y = SV + 2; y < 20; y += 2.2) PG(-65.65, y, z - 0.35, -64.95, y + 0.12, z + 0.35);
    D(-65.8, 20.5, z - 0.45, -64.8, 21.1, z + 0.45);
  }
  M(-65.5, 19.6, -116.6, -65.1, 20.1, -107.4);
  glyphs('+x', -65.1, -112, 18.5, 5.6, 1.5);
  lamp(-65.3, 19.6, -110.4, { hang: true, h: 10, pool: 0 });
  lamp(-65.3, 19.6, -113.6, { hang: true, h: 10, pool: 0 });
  light(-60, 13, -112, 0xffb860, 18, 22); // the overlook beacon
  guideStrip([[-38.5, 4, -112], [-51, 4, -112]], amber, { spacing: 1.6, scale: 1.2 });
  guideStrip([[-58.5, SV, -112], [-65.6, SV, -112]], amber, { spacing: 1.4, scale: 1.1 });
  hint([-56, 4, -118], [-48, 8, -106], 'The <b>Sunward Overlook</b>. Somewhere under all this, the Lumen buried the <b style="color:#ffd23a">yellow core</b>. The survey gantry runs out over the <b>dig shaft</b>.', 6);
  // the lookout (NW corner, off the path): the best seat for the captive sun — LOG NOOK 04
  R(-63, -14, -124, -55, 4, -119);
  R(-63, 4, -124, -62.4, 5, -119);
  R(-63, 4, -124, -55, 5, -123.4);
  G(-62.45, 4.95, -123.4, -62.35, 5.05, -119);
  D(-61.6, 4, -121.9, -60.4, 4.6, -120.7); // a brass sighting post
  // the north wall, with the GREEN Sunshade Grotto in it (come back after Verdant)
  R(-55, -14, -132, -38, 4, -119);
  R(-55, 4, -132, -50.5, 9, -119);
  R(-43.5, 4, -132, -38, 9, -119);
  R(-50.5, 4, -132, -43.5, 9, -126);
  R(-50.5, 7.5, -126, -43.5, 9, -119.5);
  R(-50.5, 4, -119.5, -48.2, 7.5, -119);
  R(-45.8, 4, -119.5, -43.5, 7.5, -119);
  R(-48.2, 7, -119.5, -45.8, 7.5, -119);
  new Barrier(W, { min: [-48.2, 4, -119.5], max: [-45.8, 7, -119], color: GREEN, kind: 'door', zone });
  trophy(-47, 5, -123.5);
  G(-50.4, 7.35, -125.9, -43.6, 7.45, -119.6);
  secretRoom([-50.5, 4, -126], [-43.5, 7.5, -119.5], 'Sunshade Grotto');
  hintEvery([-50.5, 4, -120.5], [-43.5, 7, -119], 'Sealed with <b style="color:#46ff7a">GREEN</b> energy — come back later.', 25, 5, () => !has(GREEN));
  blocker([-55, 9, -132], [-38, SKY, -119]);
  blocker([-63.6, 4, -124], [-62.4, SKY, -119]);
  blocker([-63.6, 4, -124.6], [-55, SKY, -123.4]);
  blocker([-38, 8, -132], [-25, SKY, -100]);
  strata(-66.3, -120, -66, -104, [-4, 0]);
  strata(-66, -104.3, -38, -104, [-5, -1, 2]);

  // ================================================================ S1 THE DIG SHAFT
  // A square shaft sunk through the desert floor into the excavation, open to the sky. The survey gantry
  // over it gives way under you: a long fall into the quicksand at the bottom (it swallows the fall),
  // then a struggle west to the tunnel lip. A gantry crane straddles it.
  R(-84, -30, -124, -66, S, -120); // north wall
  R(-84, -30, -104, -75, S, -102); // south wall, the tunnel mouth in it (x -75 … -71)
  R(-71, -30, -104, -66, S, -102);
  R(-75, -15.6, -104, -71, S, -102);
  R(-75, -30, -104, -71, -19.6, -102);
  R(-84, -30, -120, -80, S, -104); // west wall
  quick(-80, -120, -66, -104, -20, -26, false);
  strata(-80, -120, -66, -119.7, [-17, -14, -11.5]);
  strata(-80, -104.3, -66, -104, [-16, -12.5]);
  B.trapdoor({ min: [-75.5, SV - 0.4, -113], max: [-66, SV, -111], delay: 0.4, respawn: 4, trigger: { min: [-70, SV, -113.6], max: [-67.2, SV + 3, -110.4] }, zone, kind: 'grate' });
  // (invisible walls round the rim: a running fall can't carry you over the far side)
  blocker([-80.6, S, -120], [-80, 16, -104]);
  blocker([-80, S, -120.6], [-66, 16, -120]);
  blocker([-80, S, -104], [-66, 16, -103.4]);
  W.trigger([-76, -8, -121], [-65, 0, -103], () => {
    audio.sample('fall_wind', { gain: 0.8 });
  });
  // the gantry crane: two towers on the rims, a beam across, the trolley's cable down to a bucket
  for (const z of [-122.4, -101.6]) {
    M(-74.6, S, z - 0.9, -73.4, 19, z + 0.9);
    M(-75.4, S, z - 1.4, -72.6, S + 0.6, z + 1.4);
    for (let y = S + 2; y < 19; y += 3) PG(-74.65, y, z - 0.95, -73.35, y + 0.1, z + 0.95);
    pipe([-74, S, z - 2.4], [-74, 12, z], 0.2);
  }
  M(-74.8, 19, -123, -73.2, 20.4, -101);
  M(-75.2, 18.2, -113.4, -72.8, 19, -110.6); // the trolley
  cable([[-74, 18.2, -112], [-74, -3, -112]], 0.06);
  M(-75, -4.8, -113, -73, -3, -111); // the bucket
  D(-75.1, -3.2, -113.1, -72.9, -3, -110.9, 'hazard');
  lamp(-74, 18.2, -117, { hang: true, h: 26, pool: 0 });
  lamp(-74, 18.2, -106, { hang: true, h: 26, pool: 0 });
  // inside: a wrecked ladder and scaffold down the wall, cables hanging from the rim
  scaffold(-79.8, -103.9, -77.6, -102.6, -20, -9);
  for (const [a, b] of [[[-80, -9, -118], [-80, -16, -116]], [[-66.2, -9, -106], [-66.2, -15, -110]], [[-79.8, -9, -105], [-79.8, -17.5, -108.5]]]) droop(a, b, 1.2);
  area([-80, -26, -120], [-66, -11, -104], mood);
  // the tunnel out of the shaft's south-east corner (its lip is just above the sand: hop out), west to the dig
  R(-88, -30, -102, -70, -19.6, -98);
  R(-88, -19.6, -98, -70, -10, -96);
  R(-71, -19.6, -102, -70, -10, -98);
  R(-88, -19.6, -104, -84, -10, -102);
  R(-88, -15.6, -102, -70, -10, -98);
  for (const x of [-74, -77.5, -81, -84.5, -87.4]) {
    D(x - 0.15, -19.6, -97.95, x + 0.15, -15.6, -97.6);
    D(x - 0.15, -19.6, -102.4, x + 0.15, -15.6, -102.05);
    D(x - 0.15, -15.9, -102, x + 0.15, -15.6, -98);
  }
  G(-75, -19.65, -102.05, -71, -19.55, -101.95); // the lip
  G(-75, -15.65, -104, -71, -15.55, -103.9);
  lamp(-73, -15.7, -100, { hang: true, h: 3.9, pool: 1.6, real: true });
  lamp(-82.5, -15.7, -100, { hang: true, h: 3.9, pool: 1.4 });
  guideStrip([[-73, -19.6, -101.7], [-73, -19.6, -100], [-87.6, -19.6, -100]], amber, { spacing: 1.1 });
  zoneTitle([-88, -19.6, -102], [-85, -16, -98], 'SOLAR · BELOW', 'THE DIG SITE', '#ffd23a');
  cable([[-70.4, -16, -101.6], [-88, -16, -101.6]], 0.06);
  deep([-88, -20, -104], [-70, -15, -96]);
  devStart('solar1', [-60, SV, -112], Math.PI / 2, [0], 'The vista (survey platform)');
  hint([-70, SV, -113.6], [-67.2, SV + 3, -110.4], 'It\'s <b>giving way</b> —', 2);
  hint([-80, -21, -120], [-66, -12, -104], 'Into the <b>quicksand</b>! Mash <b>JUMP</b> to keep your head up and wade to the <b>lit tunnel</b> in the south-east corner.', 5);

  // ================================================================ S2 THE DIG GALLERY (underground)
  // The excavation's main cut: a deep pit of quicksand under scaffolds and the plates of a buried machine.
  // Walk the balcony, hop the scaffold, run the crumbling planks, climb the plates north and west to the
  // ledge by the vault door. A side plank leads to the fused-glass strata (LOG NOOK 05).
  R(-88, -30, -132, -84, -10, -102); // east wall, the tunnel's mouth in it
  R(-88, -30, -98, -84, -10, -94);
  R(-126, -30, -134, -84, -10, -130); // north
  R(-126, -30, -96, -84, -10, -94); // south
  R(-126, -30, -130, -124, -10, -114); // west, the vault opening cut in it
  R(-126, -30, -110, -124, -10, -96);
  R(-126, -30, -114, -124, -16, -110);
  R(-126, -12.8, -114, -124, -10, -110);
  quick(-124, -130, -88, -96, -27, -30, false);
  // the balcony
  F(-94, -30, -108, -88, -19.6, -96);
  glowEdge(-94, -108, -88, -96, -19.6, dglow, DZ);
  D(-88, -19.6, -107.9, -94, -18.6, -107.7); // its rail
  devStart('solar2', [-90, -19.6, -100], Math.PI / 2, [0], 'The dig site: lower galleries');
  ck([-90.5, -19.6, -100], Math.PI / 2, [5, 3, 7]);
  // a drill rig parked on it
  M(-92.5, -19.6, -106.8, -90, -18, -105.2);
  M(-91.6, -18, -106.4, -90.9, -12, -105.6);
  D(-92, -14, -106.8, -90.5, -13.6, -105.2, 'hazard');
  lamp(-89.2, -19.6, -106.6, { real: true });
  // the scaffold walkway, north to the planks
  plat(-99, -114, -96, -101, -19.6, zone, 0.3, 'grate');
  scaffold(-99, -114, -96, -101, -27, -19.9);
  // the crumbling planks
  B.crumble({ min: [-102.6, -19.9, -112.8], max: [-99, -19.6, -111.2], delay: 0.6, respawn: 3, zone });
  B.crumble({ min: [-106, -19.9, -112.8], max: [-102.6, -19.6, -111.2], delay: 0.6, respawn: 3, zone });
  // the tower
  plat(-110, -115, -106, -109, -19.6, zone, 0.3, 'grate');
  scaffold(-110, -115, -106, -109, -27, -19.9);
  lamp(-106.6, -19.6, -114.4, { h: 2.2, pool: 1.6 });
  // the side plank south to the strata wall, and the ledge there (LOG NOOK 05)
  plat(-108.6, -109, -107.4, -102, -19.6, zone, 0.25, 'plat');
  F(-110.5, -30, -102, -104.5, -19.6, -96);
  glowEdge(-110.5, -102, -104.5, -96, -19.6, dglow, DZ);
  {
    // the fused sand-glass bands in the cut: thousands of summers of burned sand
    const gm = new THREE.MeshStandardMaterial({ color: 0xd8a860, emissive: 0x6a3a10, emissiveIntensity: 0.8, metalness: 0.3, roughness: 0.08, transparent: true, opacity: 0.85 });
    const geos = [];
    let y = -19.2, k = 0;
    while (y < -12) {
      const h = 0.05 + ((k * 37) % 7) * 0.03;
      for (let x = -114; x < -100.4; x += 2.4) geos.push(new THREE.BoxGeometry(2.4, h, 0.1).translate(x + 1.2, y + Math.sin(k * 1.7 + x * 0.6) * 0.12, -95.96));
      y += 0.45 + ((k * 53) % 5) * 0.16;
      k++;
    }
    W.scene.add(new THREE.Mesh(mergeBoxes(geos), gm));
  }
  lamp(-105.2, -19.6, -96.8, { h: 2, pool: 1.8 });
  // the plates of the buried machine, stepping up north then west
  machinePlate(-114, -120, -111, -117, -18.8);
  machinePlate(-118, -124.5, -115, -121.5, -18.0);
  machinePlate(-123, -127.5, -119, -123.5, -17.2);
  // the ledge along the west wall to the vault door
  F(-124, -30, -122, -120, -16, -107);
  glowEdge(-124, -122, -120, -107, -16, dglow, DZ);
  pylon(-121, -16, -108.2, 3.6);
  lamp(-123.2, -16, -118.8, { h: 2.2, pool: 1.6, real: true });
  {
    // the buried machine: a colossal ring half sunk in the north wall and the sand, seams still glowing
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x2a2620, metalness: 0.85, roughness: 0.35 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(9, 1.5, 10, 40), ringMat);
    ring.position.set(-106, -21, -130.4);
    W.scene.add(ring);
    const seam = new THREE.Mesh(new THREE.TorusGeometry(9, 0.14, 6, 48), seamMat);
    seam.position.set(-106, -21, -129);
    W.scene.add(seam);
    const hubMat = new THREE.MeshStandardMaterial({ color: 0x1a1612, metalness: 0.7, roughness: 0.5 });
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.8, 1.6, 8), hubMat);
    hub.rotation.x = Math.PI / 2;
    hub.position.set(-106, -21, -130.6);
    W.scene.add(hub);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      M(-106 + Math.cos(a) * 9 - 0.9, -21 + Math.sin(a) * 9 - 0.9, -131.6, -106 + Math.cos(a) * 9 + 0.9, -21 + Math.sin(a) * 9 + 0.9, -128.6);
      pipe([-106 + Math.cos(a) * 3.6, -21 + Math.sin(a) * 3.6, -129.8], [-106 + Math.cos(a) * 7.6, -21 + Math.sin(a) * 7.6, -129.8], 0.5);
    }
    light(-106, -17, -126, 0xffb050, 12, 16);
  }
  // excavation dressing: cables along the walls, glyph panels uncovered on the cut faces, a sunlit crack
  droop([-88.2, -12, -116], [-124, -12, -116.5], 1.5, 10);
  droop([-88.2, -11.5, -100], [-124, -11.5, -99], 2, 10);
  cable([[-96, -10, -112], [-96, -19.4, -112]], 0.05);
  glyphs('-z', -96, -116, -14, 3.2, 1.4);
  glyphs('-x', -88, -101, -13.5, 3, 1.3);
  glyphs('+x', -124, -125, -13, 3, 1.3);
  glyphs('-x', -88, -124, -14, 3, 1.3);
  new LightShaft(W, { top: [-100, -10.05, -104], bottom: [-100, -27, -104], r: 1.1 });
  new LightShaft(W, { top: [-115.5, -10.05, -112], bottom: [-115.5, -27, -112], r: 0.8 });
  new LightShaft(W, { top: [-93, -10.05, -125], bottom: [-93, -27, -125], r: 0.7 });
  deep([-124, -30, -130], [-80, -10.5, -96]);
  guideStrip([[-93.6, -19.6, -103], [-97.5, -19.6, -103], [-97.5, -19.6, -112]], amber, { spacing: 1 });
  hint([-94, -19.6, -108], [-88, -16, -96], 'The Lumen\'s <b>dig site</b>. Don\'t fall in: that pit is <b>deep</b>. The planks won\'t hold you long — <b>keep moving</b>.', 6);

  // ================================================================ S3 THE CORE VAULT
  // A tall chamber at the bottom of the dig: a balcony at the door, a grand stair down the north wall, and
  // the YELLOW core on its dais in a shaft of daylight, cables from every wall running to it.
  F(-148, -30, -124, -126, -24, -100);
  R(-150, -30, -126, -124, -10, -124); // north
  R(-150, -30, -124, -148, -10, -97); // west
  R(-150, -30, -100, -138.5, -10, -97); // south, the door to the First Lens in it
  R(-135.5, -30, -100, -124, -10, -97);
  R(-138.5, -20.8, -100, -135.5, -10, -97);
  F(-138.5, -30, -100, -135.5, -24, -97);
  F(-130, -30, -124, -126, -16, -106); // the balcony
  glowEdge(-130, -124, -126, -106, -16, dglow, DZ);
  for (let i = 0; i < 20; i++) F(-130.8 - 0.8 * i, -30, -124, -130 - 0.8 * i, -16.4 - 0.4 * i, -120.6);
  G(-146, -23.95, -120.6, -130, -23.85, -120.5);
  devStart('solar3', [-128, -16, -110], Math.PI / 2, [0], 'The reveal chamber (yellow core)');
  ck([-128, -16, -110], Math.PI / 2, [4, 3, 6]);
  F(-142, -24, -116, -134, -23.6, -108); // the dais
  glowEdge(-142, -116, -134, -108, -23.6, dglow, DZ);
  const core = pedestal(-138, -23.6, -112, YELLOW, zone);
  new LightShaft(W, { top: [-138, -10.05, -112], bottom: [-138, -23.6, -112], r: 1.6, intensity: 0.42 });
  light(-138, -17, -112, 0xffd060, 16, 18);
  for (const [x, z] of [[-142.6, -116.6], [-133.4, -116.6], [-142.6, -107.4], [-133.4, -107.4]]) pylon(x, -24, z, 4.2);
  for (const [a, b] of [[[-148, -14, -108], [-142, -23.5, -110]], [[-148, -15, -118], [-142, -23.5, -114]], [[-138, -10.2, -124], [-138, -23.5, -116.2]], [[-126.2, -17, -101], [-134, -23.5, -109]]]) droop(a, b, 1.6);
  glyphs('+x', -148, -112, -16, 4, 1.8);
  glyphs('+z', -124, -138, -15.5, 4, 1.6);
  {
    // a great sensor ring stands over the dais
    const rm = new THREE.MeshStandardMaterial({ color: 0x302a22, metalness: 0.85, roughness: 0.35 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(6.2, 0.35, 8, 40), rm);
    ring.position.set(-138, -16.5, -112);
    ring.rotation.y = Math.PI / 2;
    W.scene.add(ring);
    const seam = new THREE.Mesh(new THREE.TorusGeometry(6.2, 0.06, 6, 48), seamMat);
    seam.position.set(-137.62, -16.5, -112);
    seam.rotation.y = Math.PI / 2;
    W.scene.add(seam);
    M(-138.6, -24, -118.6, -137.4, -22.2, -117.4);
    M(-138.6, -24, -106.6, -137.4, -22.2, -105.4);
  }
  lamp(-129, -16, -122.6, { h: 2.2, pool: 1.5 });
  const vaultDoor = new Seal(W, { min: [-138.5, -24, -99.2], max: [-135.5, -20.8, -98.2], color: null, zone, closed: true });
  // taking the core opens the way south (also on a restored save that already has yellow)
  let vaultOpen = false;
  const openVault = (say) => {
    if (vaultOpen) return;
    vaultOpen = true;
    vaultDoor.open();
    if (say) setTimeout(() => game.hud.message('The vault wakes: the <b>south door</b> grinds open. Find your way back up — the Lumen\'s lenses will need your <b style="color:#ffd23a">yellow</b>.', 6), 6400);
  };
  if (core) {
    const collect = core.onCollect;
    core.onCollect = (pk, pl) => {
      collect?.(pk, pl);
      openVault(true);
    };
  }
  W.add({ update: () => !vaultOpen && has(YELLOW) && openVault(false) });
  onRespawn(() => vaultOpen && vaultDoor.open(true));
  deep([-148, -30, -126], [-124, -10, -97]);
  vault(-148, -124, -126, -100, -24, -10, [[-140, -102, -134, -97], [-131, -125, -124, -105], [-148, -125, -128, -119.5]], 5.5);
  hint([-130, -16, -116], [-126, -12, -106], 'There it is: the <b style="color:#ffd23a">YELLOW core</b>. Take the stair down.', 5);

  // ================================================================ S4 THE FIRST LENS (puzzle: 1 mirror)
  // The door east is shut. Its receiver sits at the end of a walled slot in the south-west corner; the
  // mirror stands in the slot's mouth. Turn it (shoot its back, frame or post: any color) until a shot at
  // its face from the east runs straight down the slot.
  F(-148, -30, -97, -126, -24, -74);
  R(-150, -30, -97, -148, -10, -72); // west
  R(-150, -30, -74, -124, -10, -72); // south
  R(-126, -30, -97, -124, -10, -81.5); // east, the door in it
  R(-126, -30, -78.5, -124, -10, -72);
  R(-126, -20.8, -81.5, -124, -10, -78.5);
  F(-126, -30, -81.5, -124, -24, -78.5);
  R(-146.6, -24, -82, -146, -10, -74); // the slot's walls
  R(-142, -24, -82, -141.4, -10, -74);
  G(-146, -23.95, -82.05, -142, -23.85, -81.95);
  const lens1 = new RotMirror(W, { pos: [-144, -22.4, -83.7], yaw: 0, start: 0, size: [2.8, 2.0], post: 1.6 });
  const door1 = new Seal(W, { min: [-125.4, -24, -81.5], max: [-124.6, -20.8, -78.5], color: YELLOW, zone, closed: true });
  const recv1 = new LightReceiver(W, { pos: [-144, -22.2, -74.25], face: '-z', size: 2.2, links: [doorLink(door1)], cable: [[-142.6, -19.8, -74.2], [-126.2, -19.8, -74.2], [-126.2, -19.8, -78.2]] });
  lights.push(lens1, recv1);
  ck([-137, -24, -94], Math.PI, [6, 3, 4]);
  devStart('solar4', [-137, -24, -94], Math.PI, [0, YELLOW], 'Mirror climb 1: the First Lens');
  lamp(-128, -24, -95.6, { h: 2.4, pool: 1.6 });
  lamp(-128, -24, -75.6, { h: 2.4, pool: 1.6 });
  light(-136, -14, -86, 0xffc070, 12, 20);
  glyphs('+x', -148, -90, -17, 3.2, 1.4);
  glyphs('-x', -126, -90, -17, 3.2, 1.4);
  pylon(-133, -24, -76, 4);
  // a line on the floor from the mirror's mouth east: where to stand
  G(-141, -23.97, -83.75, -127, -23.92, -83.65);
  deep([-148, -24, -97], [-124, -10, -72]);
  vault(-148, -97, -126, -74, -24, -10, [[-140, -99, -134, -95], [-128, -83, -124, -77], [-147, -83, -141, -73]], 5.5);
  hint([-140, -24, -97], [-134, -20, -92], 'A <b>mirror</b> on a turntable. Shoot its <b>back or frame</b> (any color) to turn it; a shot on its <b>face</b> bounces off. Bounce one down the slot into the <b style="color:#ffd23a">receiver</b>.', 8);

  // ================================================================ S5 THE BANK (puzzle: 2 mirrors) + the Sunken Cache
  // A pit splits the room. The screen on the near bank has a slot in it; the first mirror stands in front of
  // the slot, the second across the pit; the receiver hides behind a baffle on the far side, by the way out.
  // Shot: up the near bank into mirror 1 → through the slot → mirror 2 → the receiver → a hard-light bridge.
  // A crack lets daylight down onto a tilting mirror on the near bank: turn it onto the sand-glass seal in
  // the south wall and the sun burns it open (the Sunken Cache).
  R(-124, -24, -82, -122, -20.8, -81.5); // the passage from the First Lens
  R(-124, -24, -78.5, -122, -20.8, -78);
  R(-124, -20.8, -82, -122, -10, -78);
  F(-124, -30, -81.5, -122, -24, -78.5);
  R(-124, -30, -94, -96, -10, -92); // north
  R(-124, -30, -92, -122, -10, -81.5); // west, round the passage
  R(-124, -30, -78.5, -122, -10, -72);
  R(-98, -30, -92, -96, -10, -72); // east
  // south: the cache seal (x -122 … -119) and the way out to the Grand Lens (x -105.2 … -102.2)
  R(-124, -30, -72, -122, -10, -70);
  R(-119, -30, -72, -105.2, -10, -70);
  R(-102.2, -30, -72, -96, -10, -70);
  R(-122, -20.8, -72, -119, -10, -70);
  R(-105.2, -20.8, -72, -102.2, -10, -70);
  F(-105.2, -30, -72, -102.2, -24, -70);
  F(-122, -30, -72, -119, -24, -70);
  F(-122, -30, -92, -113, -24, -72); // the near bank
  F(-107, -30, -92, -98, -24, -72); // the far bank
  quick(-113, -92, -107, -72, -27.5, -30, false);
  glowEdge(-113.6, -92, -113, -72, -24, dglow, DZ);
  glowEdge(-107, -92, -106.4, -72, -24, dglow, DZ);
  // the screen and its slot
  R(-114, -24, -92, -113, -10, -88.6);
  R(-114, -24, -87.4, -113, -10, -81);
  R(-114, -24, -88.6, -113, -23.4, -87.4);
  R(-114, -21.2, -88.6, -113, -10, -87.4);
  G(-114.05, -23.45, -88.6, -112.95, -23.35, -87.4);
  G(-114.05, -21.25, -88.6, -112.95, -21.15, -87.4);
  R(-106, -24, -80, -105.4, -10, -72); // the baffle
  const bankA = new RotMirror(W, { pos: [-115.4, -22.4, -88], yaw: 0, start: 2, size: [2.6, 2.0], post: 1.6 });
  const bankB = new RotMirror(W, { pos: [-100, -22.4, -88], yaw: 0, start: 6, size: [2.6, 2.0], post: 1.6 });
  const bridge2 = new PhasePlatform(W, { min: [-113, -24.4, -79.5], max: [-107, -24, -75.5], on: false, zone });
  const recv2 = new LightReceiver(W, { pos: [-100, -22.2, -72.25], face: '-z', size: 2, links: [bridge2], cable: [[-98.8, -19.4, -72.2], [-98.2, -19.4, -72.2], [-98.2, -24, -75.6]] });
  lights.push(bankA, bankB, recv2);
  onRespawn(() => recv2.on && bridge2.activate());
  // the cache: a crack, a tilting mirror, the sand-glass seal
  const crack2 = new SunBeam(W, { from: [-120.5, -10.05, -78], dir: [0, -1, 0], source: 'crack', width: 0.38, near: 60 });
  const tilt2 = new RotMirror(W, { pos: [-120.5, -22.6, -78], yaw: 0, start: 2, tilt: Math.PI / 4, size: [1.8, 1.4], post: 1.4 });
  beams.push(crack2);
  lights.push(tilt2);
  const seal2 = new BurnWall(W, { min: [-122, -24, -72], max: [-119, -20.8, -70], time: 1.2 });
  lights.push(seal2);
  F(-124, -30, -70, -119, -24, -62); // the Sunken Cache
  R(-126, -30, -72, -124, -10, -60);
  R(-124, -30, -62, -119, -10, -60);
  R(-124, -20, -70, -119, -10, -62);
  trophy(-121.5, -23, -65);
  light(-121.5, -21.5, -65.5, 0xffcc55, 6, 7);
  G(-123.9, -20.2, -69.9, -119.1, -20.1, -62.1);
  secretRoom([-124, -24, -70], [-119, -20, -62], 'Sunken Cache');
  ck([-118, -24, -80], Math.PI / 2, [5, 3, 4]);
  devStart('solar5', [-119, -24, -80], -Math.PI / 2, [0, YELLOW], 'Mirror climb 2: the Bank');
  lamp(-121, -24, -90.6, { h: 2.4, pool: 1.8 });
  lamp(-99, -24, -90.6, { h: 2.4, pool: 1.8 });
  light(-110, -13, -82, 0xffc070, 12, 20);
  glyphs('+z', -92, -103, -16, 3.6, 1.4);
  glyphs('+z', -92, -118, -16, 3.6, 1.4);
  deep([-124, -24, -92], [-96, -10, -70]);
  vault(-122, -92, -98, -72, -24, -10, [[-124, -83, -120, -77], [-123, -74, -101, -70], [-115, -93, -105, -71]], 6);
  hint([-122, -24, -82], [-119, -20, -78], 'Across the pit: a second <b>mirror</b>, and the receiver hides behind the <b>baffle</b> by the way out. Bounce a shot off the mirror by the <b>slot</b>, through it, off the far one.', 8);
  hint([-122, -24, -80], [-118, -20, -74], 'Daylight through a crack — and a mirror that <b>tilts</b> it sideways. That glassy seal in the wall looks like it would <b>burn</b>…', 6);

  // ================================================================ S6 THE GRAND LENS (puzzle: 4 mirrors) → the lift
  // The lift up to the surface is dead. Shoot the prism on the west wall YELLOW: it throws a sunbeam east.
  // The beam must run round the lift — A south, B east, C north — into D, which tips it straight up into
  // the sun-catcher in the roof. Glowing channels in the floor show the way it should run.
  F(-118, -30, -70, -96, -24, -46);
  R(-119, -30, -70, -118, -10, -46); // west
  R(-120, -30, -46, -94, -10, -44); // south
  R(-96, -30, -72, -94, -10, -44); // east
  const emitter = new SunEmitter(W, { pos: [-117.1, -21, -66], dir: [1, 0, 0], time: 3 });
  D(-118, -22.4, -67.2, -117.5, -19.6, -64.8);
  beams.push(emitter.beam);
  const grandA = new RotMirror(W, { pos: [-110, -21, -66], yaw: 0, start: 0, size: [2.2, 1.6], post: 3 });
  const grandB = new RotMirror(W, { pos: [-110, -21, -52], yaw: 0, start: 2, size: [2.2, 1.6], post: 3 });
  const grandC = new RotMirror(W, { pos: [-100, -21, -52], yaw: 0, start: 4, size: [2.2, 1.6], post: 3 });
  const grandD = new RotMirror(W, { pos: [-100, -21, -62], yaw: 0, start: 0, tilt: Math.PI / 4, size: [2.2, 1.6], post: 3 });
  // the channels: dim until the catcher wakes
  const chMat = mat('glow1', 'solarChannel');
  chMat.color.multiplyScalar(0.18);
  const ch = (x1, z1, x2, z2) => W.deco(x1, -23.98, z1, x2, -23.93, z2, 'glow1', 'solarChannel');
  ch(-117, -66.1, -110, -65.9);
  ch(-110.1, -66, -109.9, -52);
  ch(-110, -52.1, -100, -51.9);
  ch(-100.1, -62, -99.9, -52);
  let lift3Powered = false;
  const lift3 = new Elevator(W, { min: [-107, -24, -61], max: [-103, -23.6, -57], path: [[0, 15.6, 0]], speed: 2.6, zone, kind: 'grate', delay: 0.6 });
  const recv3 = new LightReceiver(W, { pos: [-100, -10.3, -62], face: 'down', accept: 'sun', size: 1.8, cable: [[-101.2, -10.3, -62], [-103.2, -10.3, -60]], onOn: () => {
    lift3Powered = true;
    chMat.color.setRGB(1, 0.8, 0.2).multiplyScalar(1.6);
    audio.sample('elevator_start', { gain: 0.7 });
    game.hud.message('Sun-catcher lit — the <b>lift</b> to the surface has power. Step on.', 4);
  } });
  lights.push(grandA, grandB, grandC, grandD, recv3);
  W.trigger([-106.8, -24, -60.8], [-103.2, -21, -57.2], () => lift3Powered && lift3.arm(), { once: false });
  onRespawn(() => {
    if (yard.state !== 'cleared') lift3.reset();
  });
  M(-107.4, -24, -61.4, -102.6, -23.95, -56.6); // the lift's well rim
  M(-107.6, -10, -61.6, -102.4, -9.6, -61); // the hatch frame in the roof
  M(-107.6, -10, -57, -102.4, -9.6, -56.4);
  ck([-103.7, -24, -68], Math.PI, [5, 3, 3]);
  devStart('solar6', [-103.7, -24, -68], Math.PI, [0, YELLOW], 'Mirror climb 3: the Grand Lens');
  lamp(-116, -24, -47.6, { h: 2.4, pool: 1.8 });
  lamp(-97.6, -24, -68.4, { h: 2.4, pool: 1.8 });
  light(-105, -14, -58, 0xffc070, 12, 20);
  glyphs('+x', -118, -55, -16, 3.6, 1.6);
  glyphs('-x', -96, -55, -16, 3.6, 1.6);
  deep([-118, -24, -70], [-96, -10.5, -46]);
  vault(-118, -70, -96, -46, -24, -10, [[-106, -72, -101, -66], [-119, -68, -115, -64], [-108, -62, -102, -56]], 5.5);
  hint([-105.2, -24, -70], [-102.2, -20, -66], 'The <b>Grand Lens</b>. Shoot the <b style="color:#ffd23a">prism</b> on the west wall and its sunbeam runs east. Turn the four mirrors to walk it round the <b>channels</b> — the last one tips it <b>up</b> into the roof.', 9);

  // ================================================================ S7 THE MIRROR YARD (combat: the first yellow arena)
  // You ride up into a walled yard. Rotatable solar panels stand round it (bank shots off their glossy faces
  // into enemies behind cover); two quicksand pools; three waves, all yellow. The west seal opens on a clear.
  R(-138, -10, -44, -88, -4, -42); // south
  R(-138, -10, -86, -88, -4, -84); // north
  R(-90, -10, -84, -88, -4, -44); // east
  R(-138, -10, -84, -134, -4, -66); // west, the way on cut in it
  R(-138, -10, -62, -134, -4, -44);
  R(-138, -4.8, -66, -134, -4, -62);
  for (const [x1, z1, x2, z2] of [[-138, -44, -88, -42], [-138, -86, -88, -84], [-90, -84, -88, -44]]) PG(x1 - 0.02, -4.4, z1 - 0.02, x2 + 0.02, -4.3, z2 + 0.02);
  blocker([-138, -4, -44], [-88, SKY, -42]);
  blocker([-138, -4, -86], [-88, SKY, -84]);
  blocker([-90, -4, -84], [-88, SKY, -44]);
  blocker([-138, -4, -84], [-134, SKY, -44]);
  quick(-126, -54, -118, -48, S, -10);
  quick(-100, -78, -94, -70, S, -10);
  // cover
  F(-124, S, -74, -120, -6.6, -71.5);
  F(-104, S, -52.5, -100, -6.6, -50);
  M(-118.5, S, -62, -116, -4.6, -59.5);
  M(-99, S, -64, -96.5, -4.6, -61.5);
  M(-114, S, -48, -112, -5.4, -46);
  glowEdge(-124, -74, -120, -71.5, -6.6, glow, zone);
  glowEdge(-104, -52.5, -100, -50, -6.6, glow, zone);
  // corner pylons and collector housings round the walls
  for (const [x, z] of [[-133, -83], [-89.5, -83], [-133, -45], [-89.5, -45]]) pylon(x, S, z, 5);
  const yardPanels = [
    [-130, -79, Math.PI * 1.75], [-112, -80.5, Math.PI], [-94, -79, Math.PI * 1.25], [-92.5, -60, Math.PI * 1.5],
    [-102, -47, Math.PI * 0.25], [-122, -47, Math.PI * 0.75], [-131, -55, Math.PI * 0.5], [-116, -66, 0],
  ].map(([x, z, yaw]) => new RotMirror(W, { pos: [x, -5, z], yaw, start: 0, size: [3.4, 2.2], look: 'pv', post: 3 }));
  lights.push(...yardPanels);
  B.armor([-131.5, S, -46]);
  B.armor([-92, S, -82]);
  B.armor([-122, -6.6, -72.7]);
  const yardSeal = { min: [-134.6, S, -66], max: [-134, -4.8, -62], closed: true };
  const yard = B.encounter({
    trigger: [[-134, -8.5, -84], [-90, -4, -44]],
    seals: [yardSeal],
    title: 'THE MIRROR YARD', sub: 'YELLOW HOSTILES', color: '#ffd23a', music: 'music_combat', zone,
    checkpoint: { pos: [-137, S, -64], yaw: Math.PI / 2 },
    waves: [
      [
        { type: 'drone', pos: [-112, -2, -72], color: YELLOW },
        { type: 'drone', pos: [-100, -2, -50], color: YELLOW, delay: 0.5 },
        { type: 'scarab', pos: [-124, S, -78], color: [YELLOW, RED], burrow: false, delay: 0.8 },
        { type: 'scarab', pos: [-96, S, -54], color: [YELLOW, RED], burrow: false, delay: 1.1 },
        { type: 'scarab', pos: [-128, S, -62], color: YELLOW, burrow: false, delay: 1.4 },
      ],
      { title: 'REINFORCEMENTS', enemies: [
        { type: 'mummy', pos: [-122, S, -51], color: YELLOW, shieldColor: RED },
        { type: 'turret', pos: [-89.9, -4.6, -66], colors: [YELLOW, RED], mount: [-1, 0, 0], delay: 0.8 },
        { type: 'brute', pos: [-128, S, -76], color: YELLOW, delay: 1.4 },
        { type: 'drone', pos: [-94, -2, -74], color: YELLOW, delay: 2.0 },
        { type: 'drone', pos: [-130, -2, -50], color: [YELLOW, RED], cycle: 2.4, delay: 2.4 },
      ] },
      [
        { type: 'warden', pos: [-112, -3.5, -58], shield: RED, core: YELLOW },
        { type: 'mortar', pos: [-96, S, -80], color: YELLOW, delay: 1.0 },
        { type: 'scarab', pos: [-130, S, -80], color: [YELLOW, RED], burrow: false, delay: 1.4 },
        { type: 'scarab', pos: [-94, S, -48], color: YELLOW, burrow: false, delay: 1.7 },
        { type: 'mummy', pos: [-98, S, -73], color: YELLOW, shieldColor: RED, delay: 2.2 },
      ],
    ],
    onClear: () => game.hud.message('Yard secured. The <b>west gate</b> is open — the sun-farm beyond runs on <b>light</b>.', 5),
  });
  area([-134, -8.5, -84], [-90, -2, -44], mood);
  devStart('solar7', [-112, S, -66.5], Math.PI, [0, YELLOW], 'The surface arena (Mirror Yard)');
  hint([-108, -9, -62], [-102, -6, -56], 'Surface! Those <b>solar panels</b> turn when you shoot their frames, and their faces <b>reflect</b>: bank shots round cover.', 6);

  // ================================================================ S8 THE PANEL COURT (light puzzle: 3 panels)
  // A walled court with a sky-lens pouring a sunbeam onto a tilted panel. Turn it to throw the beam west,
  // the next to throw it north, the third to throw it east into the sun-catcher that opens the north gate.
  R(-138, -10, -67, -134, -4.8, -66); // the passage from the yard
  R(-138, -10, -62, -134, -4.8, -61);
  R(-138, -4.8, -67, -134, -4, -61);
  R(-138, -4, -67, -136, -2, -61);
  R(-162, -10, -82, -153, -2, -80); // north, the gate in it (x -153 … -149)
  R(-149, -10, -82, -136, -2, -80);
  R(-153, -3.8, -82, -149, -2, -80);
  R(-162, -10, -50, -136, -2, -48); // south
  R(-162, -10, -80, -160, -2, -50); // west
  R(-138, -10, -80, -136, -2, -67); // east (behind it, the yard's wall)
  R(-138, -10, -61, -136, -2, -50);
  blocker([-162, -2, -82], [-136, SKY, -48]);
  const gate8 = new Seal(W, { min: [-153, S, -81.3], max: [-149, -3.8, -80.7], color: YELLOW, zone, closed: true });
  const lens8 = skyLens([-141, S, -56], 11, [-137.2, -52]);
  beams.push(lens8);
  const p8a = new RotMirror(W, { pos: [-141, -5.6, -56], yaw: 0, start: 0, tilt: Math.PI / 4, size: [2.6, 2.0], look: 'pv', post: 2.4 });
  const p8b = new RotMirror(W, { pos: [-157, -5.6, -56], yaw: 0, start: 1, size: [2.6, 2.0], look: 'pv', post: 2.4 });
  const p8c = new RotMirror(W, { pos: [-157, -5.6, -76], yaw: 0, start: 3, size: [2.6, 2.0], look: 'pv', post: 2.4 });
  const recv8 = new LightReceiver(W, { pos: [-138.25, -5.6, -76], face: '-x', accept: 'sun', size: 1.8, links: [doorLink(gate8)], cable: [[-138.2, -4.4, -77.2], [-138.2, -3, -79.8], [-148.8, -3, -79.8]] });
  lights.push(p8a, p8b, p8c, recv8);
  for (const [x, z] of [[-160.5, -50.5], [-160.5, -79.5]]) pylon(x + 0.8, S, z, 4);
  new Drone(W, { pos: [-150, -3, -64], color: YELLOW, range: 24 });
  new Drone(W, { pos: [-146, -2.5, -74], color: [YELLOW, RED], cycle: 2.6, range: 24 });
  ck([-140, S, -64], Math.PI / 2, [4, 3, 6]);
  devStart('solar8', [-140, S, -64], Math.PI / 2, [0, YELLOW], 'Light puzzle: the Panel Court');
  area([-138, -8.5, -67], [-134, -4.5, -61], mood);
  hint([-142, S, -68], [-138, -4, -60], 'A <b>sky-lens</b> pours the sun onto that tilted panel. Turn the panels to carry the beam <b>west</b>, <b>north</b>, then <b>east</b> into the gate\'s <b>sun-catcher</b>.', 8);

  // ================================================================ S9 THE GLASS CANYON (burn-through, 2 panels → a pad)
  // A cut through a sandstone ridge, choked by a wall of fused sand-glass. A lens on the rim pours onto a
  // tilted panel: aim it north and the sun boils the wall away. The beam then reaches a second panel; turn
  // it west onto the catcher that wakes the jump pad up onto the chasm rim.
  R(-162, -10, -134, -158, -1, -82); // the ridge's west half
  R(-144, -10, -134, -138, -1, -82); // east half
  R(-158, -10, -134, -144, -4, -132); // the cut's north end (the rim beyond is higher)
  R(-158, S, -102, -155, -1, -99); // buttresses either side of the glass
  R(-145, S, -102, -144, -1, -99);
  blocker([-162, -1, -134], [-158, SKY, -82]);
  blocker([-144, -1, -134], [-138, SKY, -82]);
  strata(-158.3, -132, -158, -82, [-6, -3.5]);
  strata(-144, -132, -143.7, -82, [-6.5, -3]);
  const glass9 = new BurnWall(W, { min: [-155, S, -101], max: [-145, -1, -100], time: 1.6 });
  const lens9 = skyLens([-147, S, -92], 11, [-143.4, -92]);
  const p9a = new RotMirror(W, { pos: [-147, -5.6, -92], yaw: 0, start: 6, tilt: Math.PI / 4, size: [2.4, 1.8], look: 'pv', post: 2.4 });
  const p9b = new RotMirror(W, { pos: [-147, -5.6, -124], yaw: 0, start: 4, size: [2.4, 1.8], look: 'pv', post: 2.4 });
  let pad9 = null;
  const deadPad9 = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.15, 0.2, 24), new THREE.MeshStandardMaterial({ color: 0x2a2620, metalness: 0.8, roughness: 0.4 }));
  deadPad9.position.set(-147, S + 0.1, -128);
  W.scene.add(deadPad9);
  const recv9 = new LightReceiver(W, { pos: [-157.75, -5.6, -124], face: '+x', accept: 'sun', size: 1.6, cable: [[-157.7, -6.8, -125.2], [-157.7, -7.9, -128], [-148.2, -7.9, -128]], onOn: () => {
    if (pad9) return;
    pad9 = new JumpPad(W, { pos: [-147, S, -128], power: 16, push: [0, 0, -8], color: 0xffd23a });
    deadPad9.visible = false;
    game.hud.message('Jump pad online! Up onto the <b>chasm rim</b>.', 3.5);
  } });
  beams.push(lens9);
  lights.push(glass9, p9a, p9b, recv9);
  // two timed lances in the cut beyond the glass
  lanceRig(-156, -114, -153, -111, S, 6, { period: 3.6, on: 1.5, warn: 0.7 }, S);
  lanceRig(-152, -120, -149.5, -117.5, S, 6, { period: 3.6, on: 1.5, warn: 0.7, phase: 1.8 }, S);
  B.turret([-143.9, -4.5, -110], YELLOW, { colors: [YELLOW, RED], mount: [-1, 0, 0] });
  new Drone(W, { pos: [-151, -3, -90], color: YELLOW, range: 22 });
  new Drone(W, { pos: [-151, -2.5, -122], color: YELLOW, range: 22 });
  B.scarab([-152, S, -127], { palette: [YELLOW, RED], range: 12 });
  ck([-151, S, -86], 0, [6, 3, 4]);
  devStart('solar9', [-151, S, -85], 0, [0, YELLOW], 'Light puzzle: the Glass Canyon');
  hint([-155, S, -90], [-145, -4, -84], 'A wall of fused <b>sand-glass</b>. Shots glance off — but <b>focused sunlight</b> would boil it away. Aim the lens beam at it.', 7);
  hint([-155, S, -110], [-145, -4, -104], 'Through! Time the <b>sun lances</b>, then turn the beam onto the <b>catcher</b> by the dead jump pad.', 6);

  // ================================================================ S10 THE SUN BRIDGES (platforming + light over a deep chasm)
  // Pillars across a chasm of deep quicksand. On each of two pillars a lens pours onto a tilted panel: turn
  // it west onto its catcher and the hard-light bridge ahead rises. A lance guards the gap between.
  R(-150, -30, -152, -144, -4, -132); // the east rim
  R(-200, -30, -152, -194, -4, -132); // the west rim
  R(-202, -30, -156, -142, 0, -152); // the north cliff
  R(-194, -30, -134, -158, -2, -132); // the south lip (behind it, the plateau)
  quick(-194, -152, -150, -134, -24, -30, false);
  glowEdge(-150, -152, -144, -134, -4, glow, zone);
  glowEdge(-200, -152, -194, -132, -4, glow, zone);
  blocker([-202, 0, -156], [-142, SKY, -152]);
  blocker([-144, -4, -152], [-143.6, SKY, -134]); // (no stepping off the rims into the desert)
  blocker([-200.4, -4, -152], [-200, SKY, -132]);
  pillar(-156, -142.5, -153, -139.5, -3.6);
  pillar(-163, -143, -159, -139, -3.2);
  const bridge10a = new PhasePlatform(W, { min: [-170, -3.6, -141.8], max: [-163, -3.2, -140.2], on: false, zone });
  pillar(-176, -144, -170, -137, -3.2);
  pillar(-183, -143, -179, -139, -2.8);
  const bridge10b = new PhasePlatform(W, { min: [-194, -3.2, -141.8], max: [-183, -2.8, -140.2], on: false, zone });
  const lens10a = skyLens([-161, -3.2, -142.4], 12, [-161, -153]);
  const p10a = new RotMirror(W, { pos: [-161, -0.8, -142.4], yaw: 0, start: 6, tilt: Math.PI / 4, size: [2.2, 1.6], look: 'pv', post: 2.4 });
  M(-174, -3.2, -143.4, -173.4, 0.2, -142.2);
  const recv10a = new LightReceiver(W, { pos: [-173.1, -0.8, -142.4], face: '+x', accept: 'sun', size: 1.5, links: [bridge10a] });
  const lens10b = skyLens([-181, -2.8, -142.4], 12, [-181, -153]);
  const p10b = new RotMirror(W, { pos: [-181, -0.4, -142.4], yaw: 0, start: 0, tilt: Math.PI / 4, size: [2.2, 1.6], look: 'pv', post: 2.4 });
  M(-197, -4, -143.4, -196.4, 0.6, -142.2);
  const recv10b = new LightReceiver(W, { pos: [-196.1, -0.4, -142.4], face: '+x', accept: 'sun', size: 1.5, links: [bridge10b] });
  beams.push(lens10a, lens10b);
  lights.push(p10a, recv10a, p10b, recv10b);
  onRespawn(() => {
    if (recv10a.on) bridge10a.activate();
    if (recv10b.on) bridge10b.activate();
  });
  lanceRig(-179, -143, -176, -139, -24, 8, { period: 3.4, on: 1.4, warn: 0.7 }, -30, '-z');
  new Drone(W, { pos: [-166, 2, -146], color: YELLOW, range: 26 });
  new Drone(W, { pos: [-186, 2.5, -136], color: [YELLOW, RED], cycle: 2.4, range: 26 });
  ck([-147, -4, -138], Math.PI / 2, [5, 3, 6]);
  devStart('solar10', [-147, -4, -138], Math.PI / 2, [0, YELLOW], 'The Sun Bridges');
  ck([-173, -3.2, -138.6], Math.PI / 2, [3, 3, 3]);
  area([-150, -4.5, -152], [-144, 0, -134], mood);
  hint([-150, -4, -146], [-144, 0, -134], 'The <b>Sun Bridges</b>. Each lens pours on a panel; turn it <b>west</b> onto the catcher ahead and a hard-light bridge rises. The chasm is <b>deep</b>.', 7);

  // ================================================================ S11 THE SINKING FLATS (the must-drop quicksand crossing)
  // A walled ledge south off the west rim ends over a basin of quicksand. There's no other way: drop in (it
  // breaks the fall), then mash JUMP and fight your way 16 m south to the low lip, and up the stairs.
  R(-200, -30, -132, -194, -4, -116); // the ledge
  R(-206, -30, -132, -200, -2, -116); // its walls
  R(-194, -30, -132, -184, -2, -116);
  R(-214, -30, -150, -206, -4, -92); // the basin's west wall (the dune sea beyond)
  R(-184, -30, -132, -162, -2, -92); // the plateau (its east wall)
  quick(-206, -116, -186, -98, -14, -18, true);
  R(-186, -30, -116, -184, -6, -98);
  F(-206, -30, -98, -186, -13.6, -94); // the lip and the landing
  G(-206, -13.65, -98.05, -186, -13.55, -97.95);
  R(-206, -30, -94, -200, -6, -84); // either side of the stairs
  R(-192, -30, -94, -184, -6, -84);
  for (let i = 0; i < 14; i++) F(-200, -30, -94 + i * 0.72, -192, -13.6 + 0.4 * (i + 1), -94 + (i + 1) * 0.72);
  G(-200, -8.05, -84.1, -192, -7.95, -84);
  blocker([-206, -2, -132], [-200, SKY, -116]);
  blocker([-194, -2, -132], [-184, SKY, -116]);
  blocker([-214, -4, -150], [-206, SKY, -92]);
  blocker([-184, -2, -132], [-162, SKY, -92]);
  strata(-206, -116, -205.7, -98, [-11, -8]);
  guideStrip([[-197, -4, -124], [-197, -4, -116.6]], amber, { spacing: 1.2 });
  G(-200, -4.05, -116.1, -194, -3.95, -116);
  ck([-197, -4, -127], Math.PI, [6, 3, 5]);
  devStart('solar11', [-197, -4, -127], Math.PI, [0, YELLOW], 'The Sinking Flats (quicksand drop)');
  area([-200, -4.5, -132], [-194, 0, -116], mood);
  hint([-200, -4, -122], [-194, 0, -116], 'Dead end — except <b>down</b>. The quicksand will catch you; then <b>mash JUMP</b> and fight your way to the <b>lip</b> at the far end.', 7);
  B.scarab([-196, -13.6, -95.5], { palette: [YELLOW, RED], range: 10 });

  // ================================================================ S12 THE DOCK YARD (combat + light)
  // The hover dock's yard on the world's west edge. A lens pours onto a heliostat set low on a turntable:
  // turn it and the beam sweeps the yard at waist height, burning whatever it finds (it scorches shields
  // too). Attackers come from every side; the dock gate opens once they're down.
  R(-214, -10, -94, -200, -4, -92); // north
  R(-192, -10, -94, -160, -2, -92);
  R(-166, -10, -92, -160, -2, -40); // east (the panel court is beyond)
  R(-212, -10, -42, -160, -6.6, -40); // south: a parapet over the sun-farm
  R(-214, -10, -92, -212, -5, -59); // west, the dock opening in it
  R(-214, -10, -53, -212, -5, -40);
  blocker([-212, -6.6, -42], [-160, SKY, -39.5]);
  blocker([-166, -2, -92], [-160, SKY, -40]);
  blocker([-214, -5, -92], [-212, SKY, -59]);
  blocker([-214, -5, -53], [-212, SKY, -40]);
  G(-212, -6.65, -42, -160, -6.55, -41.9);
  const lens12 = skyLens([-189, S, -67], 12, [-189, -62.6]);
  const sweep = new RotMirror(W, { pos: [-189, -6.6, -67], yaw: 0, start: 0, tilt: Math.PI / 4, size: [2.4, 1.8], look: 'pv', post: 1.4 });
  beams.push(lens12);
  lights.push(sweep);
  F(-191, S, -69, -187, -7.85, -65);
  glowEdge(-191, -69, -187, -65, -7.85, glow, zone);
  // cover, and lanes to sweep
  F(-204, S, -82, -200, -6.4, -79);
  F(-178, S, -80, -174, -6.4, -77);
  F(-204, S, -52, -200, -6.4, -49);
  F(-178, S, -54, -174, -6.4, -51);
  M(-196, S, -48, -194, -4, -46);
  M(-184, S, -88, -182, -4, -86);
  for (const [x, z] of [[-210, -90], [-210, -44], [-168, -90], [-168, -44]]) pylon(x, S, z, 5);
  for (const [x, z, w, d] of [[-196, -75, 6, 4], [-178, -62, 5, 6], [-200, -60, 7, 3], [-184, -48, 6, 3]]) drift(x, S, z, w, d);
  B.armor([-202, -6.4, -80.5]);
  B.armor([-176, -6.4, -52.5]);
  const dockGate = { min: [-212.6, S, -59], max: [-212, -5, -53], closed: true };
  const dock = B.encounter({
    trigger: [[-206, -8.5, -84], [-170, -4, -46]],
    seals: [dockGate],
    title: 'THE DOCK YARD', sub: 'AMBUSH', color: '#ffd23a', music: 'music_combat', zone,
    checkpoint: { pos: [-207, S, -56], yaw: Math.PI / 2 },
    waves: [
      [
        { type: 'scarab', pos: [-176, S, -84], color: YELLOW, burrow: false },
        { type: 'scarab', pos: [-202, S, -86], color: [YELLOW, RED], burrow: false, delay: 0.4 },
        { type: 'scarab', pos: [-176, S, -46], color: YELLOW, burrow: false, delay: 0.8 },
        { type: 'scarab', pos: [-204, S, -46], color: [YELLOW, RED], burrow: false, delay: 1.2 },
        { type: 'drone', pos: [-189, -2, -82], color: YELLOW, delay: 1.0 },
        { type: 'drone', pos: [-189, -2, -50], color: YELLOW, delay: 1.6 },
      ],
      { title: 'SHIELDS: BURN THE GOLD, BREAK THE RED', enemies: [
        { type: 'mummy', pos: [-172, S, -66], color: YELLOW, shieldColor: YELLOW },
        { type: 'mummy', pos: [-206, S, -68], color: YELLOW, shieldColor: RED, delay: 1.2 },
        { type: 'brute', pos: [-189, S, -86], color: YELLOW, delay: 2.0 },
        { type: 'scarab', pos: [-189, S, -46], color: YELLOW, burrow: false, delay: 2.6 },
      ] },
      [
        { type: 'warden', pos: [-189, -5.4, -80], shield: RED, core: YELLOW },
        { type: 'mortar', pos: [-206, S, -88], color: YELLOW, delay: 0.8 },
        { type: 'drone', pos: [-172, -2, -84], color: YELLOW, delay: 1.2 },
        { type: 'drone', pos: [-206, -2, -48], color: [YELLOW, RED], cycle: 2.2, delay: 1.6 },
        { type: 'turret', pos: [-165.9, -4.5, -66], colors: [YELLOW, RED], mount: [-1, 0, 0], delay: 2.2 },
      ],
    ],
    onClear: () => game.hud.message('The <b>hover dock</b> is open. West, across the dune sea, to the <b>Sun Court</b>.', 5),
  });
  ck([-196, S, -82], Math.PI, [8, 3, 4]);
  devStart('solar12', [-196, S, -82], Math.PI, [0, YELLOW], 'The Dock Yard (arena)');
  area([-200, -8.5, -86], [-192, -4, -82], mood);
  hint([-200, S, -84], [-192, -4, -80], 'The <b>Dock Yard</b>. That low heliostat throws the lens beam across the yard: <b>turn it</b> to sweep the sunbeam through whatever comes.', 7);

  // ================================================================ S13 THE HOVER DOCK → the dune run → S14 THE SUN QUAY
  // The dune run (solarDunes.js) boards at `start` just outside the dock gate and sets you down at `end` on
  // the Sun Quay, which a lift climbs to the Sun Court's west door.
  const DUNE_START = [-218, S, -56], DUNE_END = [-218, -6, -200];
  F(-213, -10, -59, -212, S, -53); // the dock gate's sill
  devStart('solar13', [-209, S, -56], Math.PI / 2, [0, YELLOW], 'The hover dock (dune run)');
  let duneDone = false;
  const quay = { lift: null };
  const buildRun = duneModule?.buildDuneRun || standInDuneRun;
  const duneRun = buildRun(B, {
    start: DUNE_START, startYaw: Math.PI / 2, end: DUNE_END, endYaw: -Math.PI / 2,
    onDone: () => {
      duneDone = true;
      game.hud.message('The <b>Sun Quay</b>. The lift climbs to the <b>Sun Court</b>.', 4);
    },
  });
  level.solarDunes = duneRun;
  // the quay: a stone wharf under the court mesa, the lift at its east end
  F(-212, -30, -210, -184, -6, -190);
  glowEdge(-212, -210, -184, -190, -6, glow, zone);
  F(-212, -6, -210.6, -184, -5, -210);
  F(-212, -6, -190, -184, -5, -189.4);
  R(-214, -30, -197, -212, -3, -152); // the world's west edge, the quay's opening in it
  R(-214, -30, -232, -212, -3, -203);
  F(-213, -30, -203, -212, -6, -197);
  blocker([-212, -6, -211], [-184, SKY, -210]);
  blocker([-212, -6, -190], [-184, SKY, -189]);
  blocker([-214, -3, -197], [-212, SKY, -150]);
  blocker([-214, -3, -232], [-212, SKY, -203]);
  quay.lift = new Elevator(W, { min: [-184, -6.4, -202], max: [-180, -6, -198], path: [[0, 22, 0]], speed: 3, delay: 0.6, zone, kind: 'grate', trigger: { min: [-183.6, -6, -201.6], max: [-180.4, -3, -198.4] } });
  for (const z of [-203.4, -196.6]) {
    M(-184.2, -6, z - 0.6, -183.2, 18, z + 0.6);
    M(-180.8, -6, z - 0.6, -179.8, 18, z + 0.6);
    for (let y = -4; y < 18; y += 3) PG(-184.25, y, z - 0.65, -179.75, y + 0.1, z + 0.65);
  }
  M(-184.2, 18, -203.4, -179.8, 18.8, -196.6);
  blocker([-184.4, -6, -203], [-184, 16, -197]); // (the lift's back)
  onRespawn(() => {
    const p = game.checkpoint?.pos;
    if (p && p.y < 0 && p.x < -184) quay.lift.reset();
  });
  // a ring of standing stones on the quay, shadows burned into the stone beside them — LOG NOOK 06
  {
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2, x = -198 + Math.cos(a) * 3.4, z = -194 + Math.sin(a) * 3.4;
      R(x - 0.4, -6, z - 0.4, x + 0.4, -4.6 + (k % 3) * 0.5, z + 0.4);
    }
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x0c0806, transparent: true, opacity: 0.72, depthWrite: false });
    const shapes = [];
    const person = (x, z, rot, s = 1) => {
      const body = new THREE.CircleGeometry(0.32 * s, 12).scale(1, 3.2, 1).translate(0, -1.1 * s, 0);
      const head = new THREE.CircleGeometry(0.22 * s, 12).translate(0, 0.2 * s, 0);
      for (const g of [body, head]) shapes.push(g.rotateZ(rot).rotateX(-Math.PI / 2).translate(x, -5.98, z));
    };
    person(-196.5, -192.5, -1.4);
    person(-195.6, -194.8, -1.5, 0.8);
    person(-199.6, -196.8, -1.3, 1.1);
    W.scene.add(new THREE.Mesh(mergeBoxes(shapes), shadowMat));
  }
  ck([-207, -6, -200], -Math.PI / 2, [4, 3, 6]);
  devStart('solar14', [-207, -6, -200], -Math.PI / 2, [0, YELLOW], 'The Sun Quay');
  area([-212, -6.5, -210], [-184, -2, -190], mood);
  hint([-188, -6, -203], [-184, -3, -197], 'The <b>lift</b> climbs to the <b>Sun Court</b> — the guardian and its sun-lens.', 5);

  // ================================================================ S15 THE SUN COURT — the guardian and the power source
  // The Sphinx's sandstone court (sphinxArena.js) on a mesa, entered from the west, left by the south door
  // once the sun-lens over it is shot dark. Its body and core are yellow, its paw gems red.
  const COURT = [-150, 16, -200];
  R(-174, -30, -224, -126, 13.6, -176); // the mesa
  R(-180, -30, -202, -173.5, 15, -198); // under the stubs
  R(-152, -30, -176.5, -148, 15, -170.5);
  strata(-174.3, -224, -174, -176, [-2, 4, 9]);
  strata(-174, -176.3, -126, -176, [0, 6]);
  const court = buildSphinxArena(B, { center: COURT, size: 44, entry: 'w', exit: 's', stub: 6, powerSource: true, world: 'solar', sunDir: SUN_DIR, colors: [RED, YELLOW] });
  level.solarCourt = court;
  B.armor([-150, 20.6, -220.5]);
  B.armor([-129.5, 20.6, -200]);
  area([-179.5, 16, -201.5], [-173.5, 19.2, -198.5], mood);
  area([-151.5, 16, -176.5], [-148.5, 19.2, -170.5], mood);
  devStart('solar15', court.checkpoint, court.checkpointYaw, [0, YELLOW], 'The Sun Court (the Sphinx)');
  const lensPos = [COURT[0], COURT[1] + 15, COURT[2]];
  const beam = new PowerBeam(W, lensPos, [-25.15, 27.6, -117]);
  // the collector array: one field on the terrace under the causeway, one on the north flats
  const sitesA = [], sitesB = [];
  for (const x of [-42, -50, -58, -66, -74, -88, -96]) for (const z of [-142, -150, -158, -166]) sitesA.push([x, 0, z + (Math.abs(x / 8) % 2) * 1.5]);
  for (const x of [-64, -74, -84, -94, -104, -114]) for (const z of [-184, -196, -208, -220]) sitesB.push([x, S, z]);
  R(-104, -14, -171, -36, 0, -130); // the collector terrace
  for (const [x, y, z] of [...sitesA, ...sitesB]) {
    M(x - 0.18, y, z - 0.18, x + 0.18, y + 3.4, z + 0.18);
    W.deco(x - 0.6, y, z - 0.6, x + 0.6, y + 0.3, z + 0.6, 'metal', zone);
  }
  const array = new CollectorArray(W, { target: lensPos, sites: [...sitesA, ...sitesB] });

  // ================================================================ S16 SUNSET CAUSEWAY (y 12) → Hub
  // Out of the court's south door you drop onto the causeway (one-way), walk it south over the chasm's end,
  // then east above the yard, the dig and the collector terrace, in through the Hub's west balcony port.
  plat(-151.5, -170.5, -148.5, -134.5, 12, zone, 1.0);
  plat(-148.5, -137.5, -38, -134.5, 12, zone, 1.0);
  M(-150.6, -24, -136.6, -149.4, 11, -135.4);
  M(-150.6, S, -160.6, -149.4, 11, -159.4);
  for (const x of [-138, -122, -106, -90]) M(x - 0.6, S, -136.6, x + 0.6, 11, -135.4);
  for (const x of [-74, -58, -44]) M(x - 0.6, 0, -136.6, x + 0.6, 11, -135.4);
  M(-151.7, 12, -170.5, -151.5, 13, -134.3); // rails
  M(-148.5, 12, -170.5, -148.3, 13, -137.5);
  M(-148.5, 12, -137.7, -38, 13, -137.5);
  M(-151.5, 12, -134.5, -64.2, 13, -134.3); // (a gap for the Eclipse Vault's door)
  M(-61.8, 12, -134.5, -38, 13, -134.3);
  blocker([-151.9, 12, -170.5], [-151.5, SKY, -134.3]);
  blocker([-148.5, 12, -170.5], [-148.1, SKY, -137.5]);
  blocker([-148.5, 12, -137.9], [-38, SKY, -137.5]);
  blocker([-151.9, 12, -134.5], [-64.2, SKY, -134.1]);
  blocker([-61.8, 12, -134.5], [-38, SKY, -134.1]);
  area([-151.5, 12, -170.5], [-148.5, 15, -165], mood);
  ck([-150, 12, -165], Math.PI, [3, 3, 4]);
  devStart('solar16', [-150, 12, -165], Math.PI, [0, YELLOW], 'The Sunset Causeway');
  const gateX = (x, y, cz, w = 3, h = 4.7) => {
    M(x - 0.4, y - 3, cz - w / 2 - 1, x + 0.4, y + h + 0.8, cz - w / 2);
    M(x - 0.4, y - 3, cz + w / 2, x + 0.4, y + h + 0.8, cz + w / 2 + 1);
    M(x - 0.4, y + h, cz - w / 2, x + 0.4, y + h + 0.8, cz + w / 2);
    G(x - 0.45, y + h + 0.4, cz - w / 2 - 1, x + 0.45, y + h + 0.55, cz + w / 2 + 1);
  };
  gateX(-100, 12, -136);
  barrierWallX(-100, 12, YELLOW, zone, -136, 4.7);
  new Drone(W, { pos: [-120, 16.5, -131], color: YELLOW, range: 22 });
  new Drone(W, { pos: [-80, 16.5, -141], color: [YELLOW, RED], cycle: 2.2, range: 22 });
  guideStrip([[-150, 12, -139], [-150, 12, -136], [-146, 12, -136]], amber, { spacing: 1.2 });
  // the Eclipse Vault: SECRET behind a BLUE door on the causeway's south side (come back after Azure)
  R(-67, -14, -134.3, -59, 12, -127.5);
  R(-67, 12, -134.3, -66, 16, -127.5);
  R(-60, 12, -134.3, -59, 16, -127.5);
  R(-67, 12, -128.5, -59, 16, -127.5);
  R(-67, 15.5, -134.3, -59, 16.4, -127.5);
  R(-66, 12, -134.3, -64.2, 15.5, -133.8);
  R(-61.8, 12, -134.3, -60, 15.5, -133.8);
  R(-64.2, 15, -134.3, -61.8, 15.5, -133.8);
  new Barrier(W, { min: [-64.2, 12, -134.3], max: [-61.8, 15, -133.8], color: BLUE, kind: 'door', zone });
  trophy(-63, 13, -130.8);
  G(-65.9, 15.35, -133.7, -60.1, 15.45, -128.6);
  secretRoom([-66, 12, -133.8], [-60, 15.5, -128.5], 'Eclipse Vault');
  // the return port: a short hall onto the Hub's west balcony
  corridorX({ xStart: -25, xEnd: -38, y: 12, zone, cz: -136 });
  M(-37, -24, -137, -33, 11, -135);
  M(-31, 2, -137, -28, 11, -135);
  area([-38, 12, -137.5], [-30, 15.2, -134.5], mood);

  // ================================================================ SCENERY
  // the sun-farm: massive arrays on gantries over the desert (they reflect shots), farms to the horizon on
  // every side, giant solar windmills in the haze, distant mesas
  new PVArray(W, { x1: -90, x2: -120, z1: -100, z2: -126, y: S, rows: 3, cols: 6, w: 4.6, h: 3.2, post: 4.6, tilt: 0.6 });
  new PVArray(W, { x1: -72, x2: -84, z1: -52, z2: -96, y: S, rows: 2, cols: 7, w: 6.4, h: 4.4, post: 7.5, tilt: 0.6 });
  new PVArray(W, { x1: -166, x2: -192, z1: -158, z2: -186, y: S, rows: 3, cols: 5, w: 4.6, h: 3.2, post: 5, tilt: 0.6 });
  new PVArray(W, { x1: -122, x2: -146, z1: -232, z2: -232, y: S, rows: 4, cols: 1, w: 4.6, h: 3.2, post: 5, tilt: 0.6, hittable: false });
  for (const [x, z, w, d] of [[-120, -150, 14, 8], [-170, -170, 10, 6], [-96, -190, 12, 8], [-190, -222, 10, 6], [-80, -110, 8, 6]]) drift(x, S, z, w, d);
  {
    // the receiver tower: the farm's collecting spire, straight ahead of the overlook, its crown white-hot
    const tx = -128, tz = -115;
    M(tx - 4, S, tz - 4, tx + 4, S + 3, tz + 4);
    M(tx - 2.4, S + 3, tz - 2.4, tx + 2.4, 18, tz + 2.4);
    M(tx - 1.7, 18, tz - 1.7, tx + 1.7, 30, tz + 1.7);
    for (let y = S + 6; y < 30; y += 4) PG(tx - 2.45 + (y > 18 ? 0.7 : 0), y, tz - 2.45 + (y > 18 ? 0.7 : 0), tx + 2.45 - (y > 18 ? 0.7 : 0), y + 0.2, tz + 2.45 - (y > 18 ? 0.7 : 0));
    M(tx - 3.2, 30, tz - 3.2, tx + 3.2, 31, tz + 3.2);
    W.deco(tx - 2.6, 31, tz - 2.6, tx + 2.6, 35, tz + 2.6, 'glow1', POWER_ZONE); // the crown
    M(tx - 3.2, 35, tz - 3.2, tx + 3.2, 35.8, tz + 3.2);
    M(tx - 0.3, 35.8, tz - 0.3, tx + 0.3, 41, tz + 0.3);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) pipe([tx + dx * 7, S, tz + dz * 7], [tx + dx * 2.4, 16, tz + dz * 2.4], 0.4);
  }
  const sc = solarScenery(W, game, { visible: (p) => inSolar(p) && !underground(p) });
  sc.dunes(-66, -100, -88, -44, S, 1.4, 1);
  sc.dunes(-84, -130, -124, -96, S, 1.2, 2);
  sc.dunes(-126, -190, -212, -156, S, 1.8, 3);
  sc.dunes(-36, -232, -126, -172, S, 1.0, 4);
  sc.dunes(-212, -152, -200, -132, S, 1.2, 5);
  sc.ground(-50, -40, -700, 400, -9.6);
  sc.ground(-112, -236, -700, -560, -9.6);
  sc.ground(-440, -236, -700, -40, -9.6);
  sc.farm({ x1: -60, z1: -20, x2: -420, z2: 150, y: -9.6, rowGap: 10, colGap: 4.8 });
  sc.farm({ x1: -130, z1: -250, x2: -420, z2: -360, y: -9.6, rowGap: 10, colGap: 4.8 });
  sc.farm({ x1: -460, z1: -60, x2: -560, z2: -230, y: -9.6, rowGap: 10, colGap: 4.8 });
  sc.finish();
  for (const [x, z, h, yaw] of [[-170, 110, 120, 1.4], [-310, 50, 130, 1.6], [-90, 200, 110, 1.3], [-470, -100, 140, 1.6], [-490, -215, 130, 1.5], [-260, -320, 125, 1.7], [-140, -380, 115, 1.5], [-380, -300, 120, 1.6]]) sc.turbine([x, -9.6, z], { height: h, blade: h * 0.45, yaw, speed: 0.1 + Math.random() * 0.06 });
  sc.mesa(-480, 120, -560, 200, 40);
  sc.mesa(-600, -60, -650, 40, 55);
  sc.mesa(-600, -260, -660, -150, 48);
  sc.mesa(-330, -420, -430, -380, 44);
  // distant mesas behind the court
  for (const [xa, xb, top] of [[-104, -124, 34], [-124, -152, 27], [-152, -178, 46], [-178, -199.5, 36]]) {
    R(xb, -24.4, -229.5, xa, top, -226);
    if (top > 20) R(xb + 4, top, -228.5, xa - 4, top + 6, -226.5);
  }
  for (const [xa, xb, top] of [[-36, -56, 10], [-56, -104, 24]]) R(xb, -24.4, -229.5, xa, top, -226);
  strata(-199.5, -226.3, -36, -226, [2, 14]);

  // the merged dressing
  const addMerged = (geos, material) => geos.length && W.scene.add(new THREE.Mesh(mergeBoxes(geos), material));
  addMerged(cableGeos, new THREE.MeshStandardMaterial({ color: 0x1a1612, roughness: 0.8 }));
  addMerged(pipeGeos, new THREE.MeshStandardMaterial({ color: 0x6a5a40, metalness: 0.7, roughness: 0.45 }));
  addMerged(lampGeos, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.86, 0.6).multiplyScalar(2.2) }));
  addMerged(poolGeos, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.38, 0.18), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  addMerged(glyphGeos, new THREE.MeshBasicMaterial({ map: glyphPanel(), color: new THREE.Color(1.0, 0.72, 0.25).multiplyScalar(1.3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));

  // ================================================================ THE SHUTDOWN: what changes
  // The sun is eclipsed and dusk falls, every lance and sunbeam dies, the haze and the hum stop, the
  // quicksand goes still, the sun-powered trims go dark, the mirrors stow, the beam to the Atrium flickers
  // out. Anything the sun locked opens for good (a restored save can still walk the world).
  let down = false;
  const powerDown = (instant) => {
    if (down) return;
    down = true;
    director.down = true;
    for (const l of lances) l.enabled = false;
    for (const b of beams) b.enabled = false;
    hazeMat.uniforms.uK.value = 0;
    for (const m of hazeMeshes) m.visible = false;
    for (const surface of [true, false]) {
      const m = liquidMaterial(zone, surface);
      m.uniforms.uTime = { value: m.uniforms.uTime.value };
      if (m.uniforms.uAmp) m.uniforms.uAmp.value = 0;
    }
    mat('glow1', POWER_ZONE).color.setRGB(0.12, 0.07, 0.03);
    seamMat.color.setRGB(0.1, 0.06, 0.03);
    for (const e of W.entities) if (e instanceof LightShaft) e.down();
    for (const p of lights) {
      if (p instanceof LightReceiver && p.mode === 'latch' && !p.on) {
        p.keep = true;
        p.setOn(true, null, instant);
      }
      if (p instanceof BurnWall) p.burn(true);
    }
    lift3Powered = true;
    sun.eclipse(instant);
    array.stow(instant);
    beam.kill(instant);
    Object.assign(level.atmospheres.solar, DUSK);
    if (game.atmo?.name === 'solar') game.setAtmosphere('solar', instant);
    if (!instant) setTimeout(() => game.hud.message('The captive sun goes dark. Leave by the <b>south door</b> and take the causeway home.', 6), 4500);
  };
  game.onPowerDown?.((name, info) => name === 'solar' && powerDown(!!info?.restored));
  W.add({ update: () => !down && game.isWorldDown?.('solar') && powerDown(true) });

  // ================================================================ the HUD objective (guide.js asks this)
  const inBox = (p, x1, x2, z1, z2, y1 = -99, y2 = 99) => p.x >= Math.min(x1, x2) && p.x <= Math.max(x1, x2) && p.z >= Math.min(z1, z2) && p.z <= Math.max(z1, z2) && p.y >= y1 && p.y <= y2;
  const Y = '<b style="color:#ffd23a">', E = '</b>';
  level.solar = {
    lens1, recv1, bankA, bankB, recv2, tilt2, seal2, emitter, grandA, grandB, grandC, grandD, recv3, lift3,
    p8a, p8b, p8c, recv8, gate8, glass9, p9a, p9b, recv9, get pad9() {
      return pad9;
    },
    p10a, recv10a, bridge10a, p10b, recv10b, bridge10b, sweep, yard, dock, quay, court, core, vaultDoor, door1, bridge2,
    duneStart: DUNE_START, duneEnd: DUNE_END,
    get duneDone() {
      return duneDone;
    },
    objective(p) {
      if (game.isWorldDown?.('solar')) {
        if (inBox(p, -128, -172, -178, -222, 10)) return 'The engine is dark. Leave by the <b>south door</b> and take the causeway home.';
        return 'Solar is shut down. Follow the <b>Sunset Causeway</b> east to the Nexus balcony.';
      }
      if (!has(YELLOW)) {
        if (inBox(p, -38, -25, -114, -110)) return 'Head through to the <b>Sunward Overlook</b>.';
        if (inBox(p, -66, -38, -124, -104, 3)) return 'Climb to the <b>survey platform</b> and walk out along its gantry over the dig shaft.';
        if (inBox(p, -80, -66, -120, -104, -22, 3)) return '<b>Mash JUMP</b> to keep your head above the quicksand and wade <b>west</b> to the lit tunnel.';
        if (inBox(p, -124, -80, -130, -96, -30, -10)) return 'Cross the <b>dig</b>: scaffold, planks (keep moving), the machine\'s plates, the ledge to the <b>vault door</b>.';
        if (inBox(p, -148, -124, -124, -100, -30, -10)) return `Take the ${Y}YELLOW core${E} from its dais.`;
        return `Find the ${Y}yellow core${E}: down the dig shaft from the overlook.`;
      }
      if (inBox(p, -148, -124, -124, -100, -30, -10)) return 'Through the <b>south door</b>: the way back up.';
      if (inBox(p, -148, -124, -97, -72, -30, -10)) return recv1.on ? 'The door is open: <b>east</b>.' : `Turn the <b>mirror</b> (shoot its back), then bounce a shot off its face down the slot into the ${Y}receiver${E}.`;
      if (inBox(p, -124, -96, -92, -70, -30, -10)) return recv2.on ? 'Cross the <b>hard-light bridge</b>; the way out is by the baffle.' : `Bounce a shot off the mirror by the <b>slot</b>, through it, off the far mirror into the ${Y}receiver${E} behind the baffle.`;
      if (inBox(p, -118, -96, -70, -46, -30, -10)) return lift3Powered ? 'Ride the <b>lift</b> up to the surface.' : `Shoot the ${Y}prism${E}, and turn the four mirrors to walk its beam round the channels and up into the roof.`;
      if (inBox(p, -134, -90, -84, -44, -12)) return yard.state === 'cleared' ? 'The <b>west gate</b> is open.' : `Hold the yard: ${Y}yellow${E} bodies, <b style="color:#ff3344">red</b> shields — switch <b>1</b> ↔ <b>2</b>. Bank shots off the <b>panels</b>.`;
      if (inBox(p, -160, -134, -80, -50, -12)) return recv8.on ? 'The gate is open: <b>north</b> into the canyon.' : 'Turn the panels: carry the lens beam <b>west</b>, <b>north</b>, then <b>east</b> into the gate\'s sun-catcher.';
      if (inBox(p, -158, -144, -132, -80, -12)) {
        if (!glass9.burned) return 'Aim the lens beam at the <b>sand-glass wall</b>: turn the panel under the lens until it points <b>north</b>.';
        return pad9 ? 'Take the <b>jump pad</b> up onto the chasm rim.' : 'Turn the far panel to throw the beam <b>west</b> onto the catcher by the dead jump pad.';
      }
      if (inBox(p, -200, -144, -152, -132, -30)) return 'Cross the chasm: turn each pillar\'s panel <b>west</b> onto its catcher to raise the next <b>bridge</b>.';
      if (inBox(p, -206, -184, -132, -92, -30)) return p.y > -8 ? 'Drop into the <b>quicksand</b> — it breaks the fall.' : '<b>Mash JUMP</b> and wade to the <b>lip</b> at the south end, then up the stairs.';
      if (inBox(p, -212, -160, -92, -40, -12)) return dock.state === 'cleared' ? 'Board the <b>hovercraft</b> at the dock, west.' : 'Hold the dock yard. <b>Turn the heliostat</b> to sweep its sunbeam through them; break <b style="color:#ff3344">red</b> shields with red.';
      if (p.x < -212) return 'Ride the dune sea to the <b>Sun Quay</b>.';
      if (inBox(p, -212, -179, -212, -188, -8)) return 'Ride the <b>lift</b> up to the Sun Court.';
      if (inBox(p, -180, -126, -178, -222, 10)) return court.defeated ? `Shoot the ${Y}sun-lens${E} over the court with yellow to shut the engine down.` : 'Defeat <b>the Sphinx</b>: dodge its pounces from the pads, ride its back, blast its gems.';
      return `${Y}Yellow${E} in hand: head for the <b>Sun Court</b> on its mesa, north-west.`;
    },
  };
}
