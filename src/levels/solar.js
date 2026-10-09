// SOLAR — SUNSCORCH MESA, the yellow world: the Lumen's sun-farm round a captive sun, the buried machine under
// it, the lost court at the bottom of a chasm where the yellow core waits, and the Sun Temple that climbs
// back out. See LAYOUT.md for its region and Hub ports. The loop, in order (devStarts in brackets; the
// opening is solarDepths.js, the chasm and the temple solarTemple.js):
//  [solar]   Hub west port (z -112, y 4) → THE SUNWARD BALCONY (y 4), facing the captive sun: a broken
//  [solar1]  sandstone bridge reaches out over the sinkhole toward its far end on the gatehouse
//            THE DROP: step off the broken end — ~84 m into the quicksand (it breaks any fall; the music
//            turns the moment you go); mash JUMP out
//  [solar2]  THE SINKHOLE (y -80): node 1 of the buried matrix — turn the mirror (RED) under the lens's
//            sunbeam onto the sun-catcher; the tunnel opens
//  [solar3]  THE BURIED GATE HALL: the stargate on the north wall; planks, the cable car (yellow scarabs the
//            red blaster can't hurt shove you about)
//  [solar4]  THE WEST VAULT (node 2): a switch-driven mirror seen only from a crumbling perch; the bridge
//  [solar5]  THE NORTH ANNEX (node 3): a creeping mirror, a mirror on a cart; the lift (it cycles once powered)
//  [solar6]  THE STARGATE (gallery y -64): the roof lens opens; its sun must be RELAYED round the high
//            balconies (y -48) into the ring — four legs, each lights a quarter (solarDepths.js S5):
//  [solar7]  the shuttle mirror (set it as it rides through the beam; it creeps back)
//  [solar8]  the corner mirror's red switch, seen only from a crumbling perch (a knee-high sweeper)
//  [solar9]  two mirrors that creep back, one hanging from the roof (a head-high sweeper)
//  [solar10] THE HEART: hold the sun on the ring's heart (the last mirror keeps creeping) under sweeping
//            sunbeams — it charges and blasts the south wall open
//  [solar11] THE SUNKEN COURT (chasm floor, y -70): silent; the YELLOW core in its ring on the dais; the
//            ambush from every side (yellow bodies, red shields)
//  [solar12] THE SUN TEMPLE DOORS: the stair is a sheer cut face — four yellow sun-disc targets raise it
//            flight by flight; the vestibule's prism beam-lock (the gun + prism puzzles start here)
//  [solar13] THE TEMPLE CLIMB: ledges over the quicksand pit, hard-light steps summoned by sun-discs, fights
//            on the landings, beam-locks (a hooded prism, a gliding prism, two rotatable prisms) each waking
//            more of the temple
//  [solar14] THE APEX: the crystal throws a pillar of light into the sky; out onto the north balcony
//  [solar15] THE HIGH CROSSING: columns over the court, a sun lance, a timed hard-light bridge, crumbling and
//            chroma stones (restored from the old Solar) to the west rim → the passage west
//  [solar16] THE PANEL COURT (light puzzle): turn three panels so the sky-lens's beam reaches the gate's
//            sun-catcher
//  [solar17] THE GLASS CANYON: aim the lens beam at the sand-glass wall (it boils away), then turn the next
//            panel onto the catcher that wakes the jump pad
//  [solar18] THE SUN BRIDGES (platforming + light): pillars over a deep quicksand chasm; turn the panel on
//            each pillar onto its catcher to raise the next hard-light bridge; time the lance
//  [solar19] THE SINKING FLATS: the only way on is down — drop into the quicksand basin and struggle to the lip
//  [solar20] THE DOCK YARD (combat + light): turn the heliostat to sweep the sunbeam through the attackers
//  [solar21] THE HOVER DOCK → the hovercraft dune run (solarDunes.js: buildDuneRun) over the dune sea →
//  [solar22] THE SUN QUAY (puzzle): two heavy sun discs block the bridge over a quicksand channel — every two
//            YELLOW hits turn one a quarter turn; turn both notches down — then the lift up the court mesa
//  [solar23] THE SUN COURT: the Sphinx (sphinxArena.js) and the sun-lens it guards: the world's POWER SOURCE.
//            Shoot it YELLOW → game.shutDownWorld('solar'): the sun is eclipsed, dusk falls, the beams die.
//  [solar24] SUNSET CAUSEWAY (y 12) → Hub west balcony port (z -136, y 12); one-way (a 4 m drop).
// Two kinds of light puzzle, never mixed: BIG MIRRORS carry the captive SUN's beams (you turn them by
// shooting them; the pit's are turned RED, the surface's YELLOW); small glass PRISMS carry your own YELLOW
// GUN's beam (the temple). Before the core: no fights (the pit's yellow scarabs only shove). From the core
// on, every enemy's body is yellow with red layered in, so fights keep you switching 1 ↔ 2.
// Color locks: GREEN grotto (balcony, secret), BLUE Eclipse Vault (causeway, secret).
// Light puzzles: src/entities/sunlight.js (RotMirror, LightReceiver, BurnWall, SunBeam, SunEmitter, Prism,
// BeamGlass).
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
import { SUN_DIR, inSolar, underground, POWER_ZONE, Sun, SunLance, hazeMat, heatHaze, hazeMeshes, CollectorArray, PowerBeam, DUSK, mergeBoxes, sandstoneTex } from './solarSky.js';
import { solarScenery, PVArray } from './solarScenery.js';
import { buildSolarDepths } from './solarDepths.js';
import { buildSolarSkyline } from './solarSkyline.js';
import { buildSolarTemple } from './solarTemple.js';

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
  const x1 = Math.min(sx, ex) - 3, x2 = Math.max(sx, ex) + 4; // (out to the world edge, where the docks would be)
  const za = Math.min(sz, ez) - 3, zb = Math.max(sz, ez) + 3, lo = Math.min(sy, ey), hi = Math.max(sy, ey);
  plat(x1, za, x2, zb, lo, 'yellow', 0.6);
  // steps up at the high end
  const up = ez < sz ? -1 : 1, n = Math.ceil((hi - lo) / 0.4);
  for (let i = 1; i <= n; i++) {
    const zEnd = (sy < ey ? ez : sz) - up * 3, z0 = zEnd - up * (n - i + 1) * 0.8;
    plat(x1, Math.min(z0, zEnd + up * 3), x2, Math.max(z0, zEnd + up * 3), Math.min(hi, lo + 0.4 * i), 'yellow', 0.4);
  }
  blocker([x1 - 0.4, lo, za], [x1, lo + 40, zb]);
  blocker([x1, lo, za - 0.4], [x2, lo + 40, za]);
  blocker([x1, lo, zb], [x2, lo + 40, zb + 0.4]);
  W.trigger([ex - 3, ey - 1, ez - 3], [ex + 3, ey + 3, ez + 3], () => onDone?.());
  W.trigger([sx - 3, sy - 1, sz - 3], [sx + 3, sy + 3, sz + 3], () => game.hud.message('(Stand-in walkway: the hovercraft dune run plugs in here.)', 3));
  return { standIn: true };
}

export function buildSolar(B) {
  const { W, game, level, GLOW, corridorX, plat, pedestal, secretRoom, trophy, hint, hintEvery, zoneTitle, area, light, barrierWallX, blocker, killZone, devStart, guideStrip, glowEdge, onRespawn } = B;
  const zone = 'yellow';
  const glow = GLOW[zone];
  const R = (x1, y1, z1, x2, y2, z2) => W.box(x1, y1, z1, x2, y2, z2, 'rock', zone);
  {
    // Solar's rock is sandstone: wavy strata in a tiling map (world-scaled UVs), warmer and a shade lighter
    const m = mat('rock', zone);
    m.map = sandstoneTex();
    m.color.set(0xcdbd9a).multiplyScalar(0.46);
    m.needsUpdate = true;
  }
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
    fog: 0x070402, fogNear: 2, fogFar: 46,
    skyTop: [0.012, 0.008, 0.005], skyMid: [0.022, 0.014, 0.008], skyHorizon: [0.035, 0.022, 0.012], aurora: 0, stars: 0,
    hemiSky: 0x9a6a40, hemiGround: 0x0c0603, hemiIntensity: 0.07,
    sunColor: 0xffc080, sunIntensity: 0.03, sunDir: [0.2, 1, 0.1],
    exposure: 0.92, bloom: 0.95,
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
  // ---- the sun-temple dressing of the yards (the old forecourt's look): broken pillars, fallen drums,
  // sun-disc reliefs, glyph strips and sun-cloth banners
  // a broken pillar: drum courses, a glowing glyph band, sometimes its capital still on
  const brokenPillar = (x, y, z, h, cap = false) => {
    R(x - 0.75, y, z - 0.75, x + 0.75, y + 0.5, z + 0.75); // plinth
    R(x - 0.6, y + 0.5, z - 0.6, x + 0.6, y + h, z + 0.6);
    for (let k = 1.6; k < h - 0.3; k += 1.4) W.deco(x - 0.63, y + k, z - 0.63, x + 0.63, y + k + 0.08, z + 0.63, 'metal', zone);
    if (h > 2.2) G(x - 0.62, y + h - 0.9, z - 0.62, x + 0.62, y + h - 0.8, z + 0.62);
    if (cap) R(x - 0.95, y + h, z - 0.95, x + 0.95, y + h + 0.5, z + 0.95);
  };
  // a fallen drum lying on the sand
  const drum = (x, y, z, alongX = true, len = 2.8) => (alongX ? R(x - len / 2, y, z - 0.6, x + len / 2, y + 1.2, z + 0.6) : R(x - 0.6, y, z - len / 2, x + 0.6, y + 1.2, z + len / 2));
  // carvings on a wall face: n = the way the face looks ('+x' '-x' '+z' '-z'), at = the face's coordinate
  const onWall = (n, at, u1, y1, u2, y2, depth, kind) => {
    const sg = n[0] === '+' ? 1 : -1, a = at, b = at + sg * depth;
    if (n[1] === 'x') W.deco(Math.min(a, b), y1, Math.min(u1, u2), Math.max(a, b), y2, Math.max(u1, u2), kind, zone);
    else W.deco(Math.min(u1, u2), y1, Math.min(a, b), Math.max(u1, u2), y2, Math.max(a, b), kind, zone);
  };
  // a sun disc relief: a ring of rays round a glowing boss, cut in the wall
  const sunRelief = (n, at, u, yc, r = 1.6) => {
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2, cu = u + Math.cos(a) * r, cy = yc + Math.sin(a) * r;
      onWall(n, at, cu - 0.18, cy - 0.18, cu + 0.18, cy + 0.18, 0.18, 'rock');
    }
    onWall(n, at, u - r * 0.55, yc - r * 0.55, u + r * 0.55, yc + r * 0.55, 0.12, 'rock');
    onWall(n, at, u - r * 0.3, yc - r * 0.3, u + r * 0.3, yc + r * 0.3, 0.16, 'glow1');
  };
  // a strip of glyphs: dashes and blocks of glow in a band along a wall
  const glyphStrip = (n, at, u1, u2, y) => {
    const end = Math.max(u1, u2);
    let u = Math.min(u1, u2), k = 0;
    while (u < end - 0.4) {
      const w = [0.3, 0.7, 0.2, 0.5, 1.1, 0.25][k % 6], h = [0.3, 0.12, 0.45, 0.12, 0.12, 0.3][k % 6];
      onWall(n, at, u, y - h / 2, Math.min(u + w, end), y + h / 2, 0.06, 'glow1');
      u += w + 0.35;
      k++;
    }
    onWall(n, at, Math.min(u1, u2), y - 0.42, end, y - 0.36, 0.08, 'metal');
    onWall(n, at, Math.min(u1, u2), y + 0.36, end, y + 0.42, 0.08, 'metal');
  };
  // banners: sun-cloth hung from the wall tops (one shared texture and mesh for the whole world)
  const bannerGeos = [];
  const banner = (n, at, u, yTop, w = 1.8, h = 5) => {
    const pg = new THREE.PlaneGeometry(w, h);
    const sg = n[0] === '+' ? 1 : -1;
    if (n[1] === 'x') pg.rotateY(sg > 0 ? Math.PI / 2 : -Math.PI / 2).translate(at + sg * 0.12, yTop - h / 2, u);
    else pg.rotateY(sg > 0 ? 0 : Math.PI).translate(u, yTop - h / 2, at + sg * 0.12);
    bannerGeos.push(pg);
    if (n[1] === 'x') M(Math.min(at, at + sg * 0.5), yTop - 0.15, u - w / 2 - 0.2, Math.max(at, at + sg * 0.5), yTop + 0.1, u + w / 2 + 0.2);
    else M(u - w / 2 - 0.2, yTop - 0.15, Math.min(at, at + sg * 0.5), u + w / 2 + 0.2, yTop + 0.1, Math.max(at, at + sg * 0.5));
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
  mat('glow1', 'solarDeep').color.multiplyScalar(0.3);
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
  // One slab over everything (it's the excavation's roof), with holes for the sinkhole, the temple chasm, the
  // Sun Bridges' chasm, the sinking flats and the stairs out of them.
  const HOLES = [
    [-96, -130, -64, -100], // the sinkhole
    [-134, -96, -36, -40], // the sun yard, the temple and the drop past the colonnade
    [-200, -152, -144, -132], // the chasm and its rims
    [-206, -132, -184, -92], // the ledge and the sinking flats
    [-184, -132, -162, -92], // the plateau
    [-200, -92, -192, -84], // the stairs up out of the flats
  ];
  for (const [x1, z1, x2, z2] of rectMinus(-212, -232, -32, -40, HOLES)) R(x1, -10, z1, x2, S, z2);
  // the void under the world's edge — except over the excavation (it goes down to y -92), which has its
  // own floor far below
  const EX = [-164, -156, -34, -40];
  killZone([-440, -40, -240], [EX[0], -30.5, -38]);
  killZone([EX[0], -40, -240], [EX[2], -30.5, EX[1]]);
  killZone([EX[2], -40, -240], [-31.5, -30.5, -38]);
  killZone([EX[0], -130, EX[1]], [EX[2], -110, -38]);

  // ================================================================ THE OPENING (solarDepths.js): the balcony and the broken bridge, the
  // drop into the sinkhole, the buried matrix and its stargate (big-sun mirror puzzles, the red blaster)
  const K = { R, M, F, D, G, PG, quick, lamp, pipe, cable, droop, scaffold, machinePlate, glyphs, pylon, strata, pillar, ck, mood, has, beams, lights, zone, glow, SKY, S, amber, dglow, DZ, skyLens, brokenPillar, drum, sunRelief, glyphStrip, banner, drift, lance, lanceRig, housing, onWall, director, seamMat };
  const depths = buildSolarDepths(B, K);
  level.solarDepths = depths;
  // ================================================================ THE CHASM (solarTemple.js): the sunken courtyard (the yellow core, the
  // ambush), the stair-targets, the Sun Temple's climb (the yellow gun's prism puzzles) and the high
  // crossing back over the chasm to the Panel Court
  const temple = buildSolarTemple(B, K, depths);
  level.solarTemple = temple;

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
  new Drone(W, { pos: [-146, -2.5, -74], color: YELLOW, shields: [RED], range: 24 });
  ck([-140, S, -64], Math.PI / 2, [4, 3, 6]);
  devStart('solar16', [-140, S, -64], Math.PI / 2, [0, YELLOW], 'Light puzzle: the Panel Court');
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
    if (!game.isWorldDown?.('solar')) game.hud.message('Jump pad online! Up onto the <b>chasm rim</b>.', 3.5);
  } });
  beams.push(lens9);
  lights.push(glass9, p9a, p9b, recv9);
  // two timed lances in the cut beyond the glass
  lanceRig(-156, -114, -153, -111, S, 6, { period: 3.6, on: 1.5, warn: 0.7 }, S);
  lanceRig(-152, -120, -149.5, -117.5, S, 6, { period: 3.6, on: 1.5, warn: 0.7, phase: 1.8 }, S);
  B.turret([-143.9, -4.5, -110], YELLOW, { shields: [RED], mount: [-1, 0, 0] });
  new Drone(W, { pos: [-151, -3, -90], color: YELLOW, range: 22 });
  new Drone(W, { pos: [-151, -2.5, -122], color: YELLOW, range: 22 });
  B.scarab([-152, S, -127], { color: YELLOW, shields: [RED], range: 12 });
  ck([-151, S, -86], 0, [6, 3, 4]);
  devStart('solar17', [-151, S, -85], 0, [0, YELLOW], 'Light puzzle: the Glass Canyon');
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
  blocker([-202, 0, -156], [-142, 8, -152]);
  blocker([-144, -4, -152], [-143.6, 8, -134]); // (no stepping off the rims into the desert)
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
  new Drone(W, { pos: [-186, 2.5, -136], color: YELLOW, shields: [RED], range: 26 });
  ck([-147, -4, -138], Math.PI / 2, [5, 3, 6]);
  devStart('solar18', [-147, -4, -138], Math.PI / 2, [0, YELLOW], 'The Sun Bridges');
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
  devStart('solar19', [-197, -4, -127], Math.PI, [0, YELLOW], 'The Sinking Flats (quicksand drop)');
  area([-200, -4.5, -132], [-194, 0, -116], mood);
  hint([-200, -4, -122], [-194, 0, -116], 'Dead end — except <b>down</b>. The quicksand will catch you; then <b>mash JUMP</b> and fight your way to the <b>lip</b> at the far end.', 7);
  B.scarab([-196, -13.6, -95.5], { color: YELLOW, shields: [RED], range: 10 });

  // ================================================================ S12 THE DOCK YARD (combat + light)
  // The hover dock's yard on the world's west edge. A lens pours onto a heliostat set low on a turntable:
  // turn it and the beam sweeps the yard at waist height, burning whatever it finds (it scorches shields
  // too). Attackers come from every side; the dock gate opens once they're down.
  R(-214, -10, -94, -200, -4, -92); // north
  R(-192, -10, -94, -160, -2, -92);
  R(-166, -10, -92, -160, -2, -40); // east (the panel court is beyond)
  R(-212, -10, -42, -160, -6.6, -40); // south: a parapet over the sun-farm
  R(-214, -10, -92, -212, -5, -61); // west, the dock opening in it (the dock's width)
  R(-214, -10, -51, -212, -5, -40);
  blocker([-212, -6.6, -42], [-160, SKY, -39.5]);
  blocker([-166, -2, -92], [-160, SKY, -40]);
  blocker([-214, -5, -92], [-212, SKY, -61]);
  blocker([-214, -5, -51], [-212, SKY, -40]);
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
  for (const [x, z, h, cap] of [[-206, -64, 4.6, true], [-172, -72, 2.6], [-198, -46, 1.8], [-180, -88, 3.2, true]]) brokenPillar(x, S, z, h, cap);
  drum(-184, S, -58, true);
  drum(-200, S, -74, false, 2.4);
  sunRelief('-x', -166, -78, -5, 1.6);
  sunRelief('-x', -166, -56, -5, 1.6);
  glyphStrip('-x', -166, -91, -43, -3);
  banner('-x', -166, -67, -2, 1.8, 4.4);
  for (const [x, z, w, d] of [[-196, -75, 6, 4], [-178, -62, 5, 6], [-200, -60, 7, 3], [-184, -48, 6, 3]]) drift(x, S, z, w, d);
  B.armor([-202, -6.4, -80.5]);
  B.armor([-176, -6.4, -52.5]);
  const dockGate = { min: [-212.6, S, -61], max: [-212, -5, -51], closed: true };
  const dock = B.encounter({
    trigger: [[-206, -8.5, -84], [-170, -4, -46]],
    seals: [dockGate],
    title: 'THE DOCK YARD', sub: 'AMBUSH', color: '#ffd23a', music: 'music_combat', zone,
    checkpoint: { pos: [-207, S, -56], yaw: Math.PI / 2 },
    waves: [
      [
        { type: 'scarab', pos: [-176, S, -84], color: YELLOW, burrow: false },
        { type: 'scarab', pos: [-202, S, -86], color: YELLOW, shields: [RED], burrow: false, delay: 0.4 },
        { type: 'scarab', pos: [-176, S, -46], color: YELLOW, burrow: false, delay: 0.8 },
        { type: 'scarab', pos: [-204, S, -46], color: YELLOW, shields: [RED], burrow: false, delay: 1.2 },
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
        { type: 'drone', pos: [-206, -2, -48], color: YELLOW, shields: [RED], delay: 1.6 },
        { type: 'turret', pos: [-165.9, -4.5, -66], color: YELLOW, shields: [RED], mount: [-1, 0, 0], delay: 2.2 },
      ],
    ],
    onClear: () => game.hud.message('The <b>hover dock</b> is open. West, across the dune sea, to the <b>Sun Court</b>.', 5),
  });
  ck([-196, S, -82], Math.PI, [8, 3, 4]);
  devStart('solar20', [-196, S, -82], Math.PI, [0, YELLOW], 'The Dock Yard (arena)');
  area([-200, -8.5, -86], [-192, -4, -82], mood);
  hint([-200, S, -84], [-192, -4, -80], 'The <b>Dock Yard</b>. That low heliostat throws the lens beam across the yard: <b>turn it</b> to sweep the sunbeam through whatever comes.', 7);

  // ================================================================ S13 THE HOVER DOCK → the dune run → S14 THE SUN QUAY
  // The dune run (solarDunes.js) boards at `start` just outside the dock gate and sets you down at `end` on
  // the Sun Quay, which a lift climbs to the Sun Court's west door. Its docks are 8 × 10 m platforms whose open
  // east edge lies 4 m east of the dock point: dock points at x -216 butt them against Solar's west edge (x -212).
  const DUNE_START = [-216, S, -56], DUNE_END = [-216, -6, -200];
  devStart('solar21', [-208, S, -56], Math.PI / 2, [0, YELLOW], 'The hover dock (dune run)');
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
  // the quay: a stone wharf under the court mesa, cut by a quicksand channel. Two great sun discs block the
  // bridge over it: every two YELLOW hits turn one a quarter turn — turn each notch down onto the bridge.
  // The lift up the mesa is beyond.
  F(-212, -30, -210, -200, -6, -190);
  F(-188, -30, -210, -184, -6, -190);
  glowEdge(-212, -210, -200, -190, -6, glow, zone);
  quick(-200, -210, -188, -190, -9, -14);
  R(-200, -14, -201.5, -188, -6, -198.5); // the bridge
  glowEdge(-200, -201.5, -188, -198.5, -6, glow, zone);
  const discParts = [[-0.3, -4.2, -4.2, 0.3, 4.2, -1.5], [-0.3, -4.2, 1.5, 0.3, 4.2, 4.2], [-0.3, -1.0, -1.5, 0.3, 4.2, 1.5]];
  const dialA = B.shotRotor({ pivot: [-196.5, -1.8, -200], parts: discParts, axis: 'x', color: YELLOW, start: 2, correct: 0, zone });
  const dialB = B.shotRotor({ pivot: [-191.5, -1.8, -200], parts: discParts, axis: 'x', color: YELLOW, start: 1, correct: 0, zone });
  // they're heavy: the first hit only rocks one on its axle, the second turns it
  for (const d of [dialA, dialB]) {
    const hitTurn = d.onHit.bind(d);
    let charge = 0;
    d.onHit = (color, hit) => {
      if (color !== d.color || d.turning) return hitTurn(color, hit);
      if (++charge < 2) {
        d.flash = 1;
        d.world.fx.sparks(hit?.point || d.pivot, hit?.normal || new THREE.Vector3(0, 1, 0), d.hex, { count: 6, speed: 6, spread: 0.8, life: 0.25 });
        d.jam = 0.5;
        return 'hit';
      }
      charge = 0;
      return hitTurn(color, hit);
    };
    onRespawn(() => (charge = 0));
  }
  blocker([-200, -6, -210], [-188, SKY, -201.5]); // no jumping round the discs over the sand
  blocker([-200, -6, -198.5], [-188, SKY, -190]);
  hint([-206, -6, -203], [-200, -3, -197], 'Two great <b>sun discs</b> block the bridge. Every <b>two</b> <b style="color:#ffd23a">yellow</b> hits turn one a quarter turn: turn each <b>notch down</b> onto the bridge.', 7);
  F(-212, -6, -210.6, -184, -5, -210);
  F(-212, -6, -190, -184, -5, -189.4);
  R(-214, -30, -195, -212, -3, -152); // the world's west edge, the quay's opening in it (the dock's width)
  R(-214, -30, -232, -212, -3, -205);
  blocker([-212, -6, -211], [-184, SKY, -210]);
  blocker([-212, -6, -190], [-184, SKY, -189]);
  blocker([-214, -3, -195], [-212, SKY, -150]);
  blocker([-214, -3, -232], [-212, SKY, -205]);
  quay.lift = new Elevator(W, { min: [-184, -6.4, -202], max: [-180, -6, -198], path: [[0, 22, 0]], speed: 3, delay: 0.6, zone, kind: 'grate', trigger: { min: [-183.6, -6, -201.6], max: [-180.4, -3, -198.4] } });
  for (const z of [-203.4, -196.6]) {
    M(-184.2, -6, z - 0.6, -183.2, 18, z + 0.6);
    M(-180.8, -6, z - 0.6, -179.8, 18, z + 0.6);
    for (let y = -4; y < 18; y += 3) PG(-184.25, y, z - 0.65, -179.75, y + 0.1, z + 0.65);
  }
  M(-184.2, 18, -203.4, -179.8, 18.8, -196.6);
  onRespawn(() => {
    const p = game.checkpoint?.pos;
    if (p && p.y < 0 && p.x < -184) quay.lift.reset();
  });
  // a ring of standing stones on the quay, shadows burned into the stone beside them — LOG NOOK 06
  {
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2, x = -206 + Math.cos(a) * 3.4, z = -193.5 + Math.sin(a) * 3.4;
      R(x - 0.4, -6, z - 0.4, x + 0.4, -4.6 + (k % 3) * 0.5, z + 0.4);
    }
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x0c0806, transparent: true, opacity: 0.72, depthWrite: false });
    const shapes = [];
    const person = (x, z, rot, s = 1) => {
      const body = new THREE.CircleGeometry(0.32 * s, 12).scale(1, 3.2, 1).translate(0, -1.1 * s, 0);
      const head = new THREE.CircleGeometry(0.22 * s, 12).translate(0, 0.2 * s, 0);
      for (const g of [body, head]) shapes.push(g.rotateZ(rot).rotateX(-Math.PI / 2).translate(x, -5.98, z));
    };
    person(-204.5, -192, -1.4);
    person(-203.6, -194.3, -1.5, 0.8);
    person(-207.6, -196.3, -1.3, 1.1);
    W.scene.add(new THREE.Mesh(mergeBoxes(shapes), shadowMat));
  }
  ck([-207, -6, -200], -Math.PI / 2, [4, 3, 6]);
  devStart('solar22', [-207, -6, -200], -Math.PI / 2, [0, YELLOW], 'The Sun Quay');
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
  devStart('solar23', court.checkpoint, court.checkpointYaw, [0, YELLOW], 'The Sun Court (the Sphinx)');
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
  devStart('solar24', [-150, 12, -165], Math.PI, [0, YELLOW], 'The Sunset Causeway');
  const gateX = (x, y, cz, w = 3, h = 4.7) => {
    M(x - 0.4, y - 3, cz - w / 2 - 1, x + 0.4, y + h + 0.8, cz - w / 2);
    M(x - 0.4, y - 3, cz + w / 2, x + 0.4, y + h + 0.8, cz + w / 2 + 1);
    M(x - 0.4, y + h, cz - w / 2, x + 0.4, y + h + 0.8, cz + w / 2);
    G(x - 0.45, y + h + 0.4, cz - w / 2 - 1, x + 0.45, y + h + 0.55, cz + w / 2 + 1);
  };
  gateX(-100, 12, -136);
  barrierWallX(-100, 12, YELLOW, zone, -136, 4.7);
  new Drone(W, { pos: [-120, 16.5, -131], color: YELLOW, range: 22 });
  new Drone(W, { pos: [-80, 16.5, -141], color: YELLOW, shields: [RED], range: 22 });
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
  new PVArray(W, { x1: -166, x2: -192, z1: -158, z2: -186, y: S, rows: 3, cols: 5, w: 4.6, h: 3.2, post: 5, tilt: 0.6 });
  new PVArray(W, { x1: -122, x2: -146, z1: -232, z2: -232, y: S, rows: 4, cols: 1, w: 4.6, h: 3.2, post: 5, tilt: 0.6, hittable: false });
  for (const [x, z, w, d] of [[-170, -170, 10, 6], [-96, -190, 12, 8], [-190, -222, 10, 6]]) drift(x, S, z, w, d);
  {
    // over the buried gate: the ring of collector mirrors round the lens that feeds the roof lens below
    const cx = -110, cz = -108;
    M(cx - 2.2, S, cz - 2.2, cx + 2.2, S + 0.6, cz + 2.2);
    PG(cx - 1.6, S + 0.6, cz - 1.6, cx + 1.6, S + 0.66, cz + 1.6);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2, x = cx + Math.cos(a) * 6.5, z = cz + Math.sin(a) * 6.5;
      M(x - 0.2, S, z - 0.2, x + 0.2, S + 2.4, z + 0.2);
      M(x - 0.9, S + 2.4, z - 0.9, x + 0.9, S + 2.6, z + 0.9);
    }
  }
  // THE EAST GATE: pylons along the mesa's eastern edge (the Hub's ports pass under them), seated colossi
  // and mirror obelisks — they hide the Atrium's glass and the Foundry from Solar's spots (solarSkyline.js)
  {
    const sk = buildSolarSkyline(B, K);
    // (56 m over the mesa: the Atrium's roof stands at y 45)
    sk.pylon(-40, -152, -32, -139, S, 56, 8); // north of the return port
    sk.pylon(-40, -133, -32, -125, S, 56, 8); // between the ports
    R(-38, 17, -139.5, -32, S + 54, -132.5); // the lintel over the return port
    for (const [z1, z2] of [[-124, -114], [-110, -100]]) sk.pylon(-38.5, z1, -32, z2, 8, 40, 6); // the entry's pylons (on its old walls)
    R(-38, 8.5, -114.5, -32, 46, -109.5); // over the entry passage
    for (const [z1, z2] of [[-124, -114], [-110, -100]]) G(-38.55, 30, z1, -38.45, 30.3, z2);
    sk.colossus(-50, S, -146, '-x', 1); // looking out over the balcony's sun
    sk.colossus(-52, -46, -49, '-x', 1.25); // beside the drop, looking down the lowland
    R(-61, -118, -57, -43, -46, -41); // (its pedestal from the lowland)
    sk.pylon(-48, -101, -34, -95, S, 48, 8); // the gatehouse's tall north tower (the Atrium stays hidden)
    // the cliff over the drop: pilasters, a cornice and glyph bands on its face
    for (const z of [-56.5, -49, -41.5]) R(-49.2, -46, z - 1, -48, 24, z + 1);
    R(-49.6, 24, -58, -47.5, 26.5, -40);
    for (const y of [-20, 0, 16]) G(-49.25, y, -58, -49.15, y + 0.25, -40);
    sk.obelisk(-41.5, 4, -106.5, 18); // on the balcony's south-east corner
    sk.obelisk(-60, S, -140, 30);
    sk.finish();
  }
  const sc = solarScenery(W, game, { visible: (p) => inSolar(p) && !underground(p) });
  sc.dunes(-100, -130, -134, -96, S, 1.2, 2);
  sc.dunes(-126, -190, -212, -156, S, 1.8, 3);
  sc.dunes(-36, -232, -126, -172, S, 1.0, 4);
  sc.dunes(-212, -152, -200, -132, S, 1.2, 5);
  // south of the mesa the land falls away to a lowland desert far below (the sun yard looks out over it)
  sc.ground(-46, -40, -700, 400, -118);
  sc.dunes(-60, -36, -300, 200, -118, 3.2, 6);
  sc.ground(-112, -236, -700, -560, -9.6);
  sc.ground(-440, -236, -700, -40, -9.6);
  sc.farm({ x1: -90, z1: 40, x2: -420, z2: 220, y: -118, rowGap: 10, colGap: 4.8 });
  sc.farm({ x1: -130, z1: -250, x2: -420, z2: -360, y: -9.6, rowGap: 10, colGap: 4.8 });
  sc.farm({ x1: -460, z1: -60, x2: -560, z2: -230, y: -9.6, rowGap: 10, colGap: 4.8 });
  sc.finish();
  // the giant windmills stand far out to either side of the balcony's view (never in front of the sun, which
  // hangs a little north of west), huge silhouettes in the haze near the fog's edge
  for (const [x, z, h, yaw, k] of [
    [-290, -520, 120, 1.5, 1.15], [-205, -545, 110, 1.4, 1.05], [-380, -490, 125, 1.6, 1.2], [-118, -540, 100, 1.3, 0.95], // north-west
    [-370, 250, 120, 1.6, 1.15], [-250, 300, 110, 1.5, 1.05], [-160, 350, 125, 1.4, 1.15], [-440, 160, 105, 1.7, 1.0], // south-west (on the lowland)
  ]) sc.turbine([x, z > 0 ? -118 : -9.6, z], { height: h, blade: h * 0.45, yaw, speed: 0.06 + Math.random() * 0.04, haze: true }).scale.setScalar(k);
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

  // the banners: one sun-cloth texture and mesh for the whole world
  if (bannerGeos.length) {
    const cv = document.createElement('canvas');
    cv.width = 64;
    cv.height = 160;
    const cx2 = cv.getContext('2d');
    cx2.fillStyle = '#b8862a';
    cx2.fillRect(0, 0, 64, 160);
    cx2.fillStyle = '#7a2a18';
    cx2.fillRect(0, 0, 64, 12);
    cx2.fillRect(0, 134, 64, 10);
    cx2.fillStyle = '#ffd86a';
    cx2.beginPath();
    cx2.arc(32, 52, 15, 0, Math.PI * 2);
    cx2.fill();
    cx2.strokeStyle = '#ffd86a';
    cx2.lineWidth = 3;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      cx2.beginPath();
      cx2.moveTo(32 + Math.cos(a) * 19, 52 + Math.sin(a) * 19);
      cx2.lineTo(32 + Math.cos(a) * 26, 52 + Math.sin(a) * 26);
      cx2.stroke();
    }
    cx2.fillStyle = '#2a3f8a';
    for (let y = 84; y < 128; y += 12) cx2.fillRect(14, y, 36, 5);
    cx2.globalCompositeOperation = 'destination-out';
    cx2.beginPath();
    cx2.moveTo(16, 160);
    cx2.lineTo(32, 146);
    cx2.lineTo(48, 160);
    cx2.fill();
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    W.scene.add(new THREE.Mesh(mergeBoxes(bannerGeos), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, side: THREE.DoubleSide, alphaTest: 0.5 })));
  }
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
    depths, temple,
    p8a, p8b, p8c, recv8, gate8, glass9, p9a, p9b, recv9, get pad9() {
      return pad9;
    },
    p10a, recv10a, bridge10a, p10b, recv10b, bridge10b, sweep, dialA, dialB, dock, quay, court,
    duneStart: DUNE_START, duneEnd: DUNE_END,
    get duneDone() {
      return duneDone || !!duneRun?.done; // (a reloaded save past the run: onDone doesn't run again)
    },
    objective(p) {
      if (game.isWorldDown?.('solar')) {
        if (inBox(p, -128, -172, -178, -222, 10)) return 'The engine is dark. Leave by the <b>south door</b> and take the causeway home.';
        return 'Solar is shut down. Follow the <b>Sunset Causeway</b> east to the Nexus balcony.';
      }
      const here = depths.objective(p) || temple.objective(p);
      if (here) return here;
      // (in from the Hub's west balcony: the causeway is Solar's way home, barred by a yellow gate)
      if (!has(YELLOW) && inBox(p, -152, -25, -171, -134, 10)) return 'The <b>Sunset Causeway</b> is Solar\'s way home, and its gate takes yellow. Back to the Nexus: in by the <b>west door</b> below.';
      if (!has(YELLOW)) return `Find the ${Y}yellow core${E}: out along the <b>broken bridge</b>, and down.`;
      if (inBox(p, -160, -134, -80, -50, -12)) return recv8.on ? 'The gate is open: <b>north</b> into the canyon.' : 'Turn the panels: carry the lens beam <b>west</b>, <b>north</b>, then <b>east</b> into the gate\'s sun-catcher.';
      if (inBox(p, -158, -144, -132, -80, -12)) {
        if (!glass9.burned) return 'Aim the lens beam at the <b>sand-glass wall</b>: turn the panel under the lens until it points <b>north</b>.';
        return pad9 ? 'Take the <b>jump pad</b> up onto the chasm rim.' : 'Turn the far panel to throw the beam <b>west</b> onto the catcher by the dead jump pad.';
      }
      if (inBox(p, -200, -144, -152, -132, -30)) return 'Cross the chasm: turn each pillar\'s panel <b>west</b> onto its catcher to raise the next <b>bridge</b>.';
      if (inBox(p, -206, -184, -132, -92, -30)) return p.y > -8 ? 'Drop into the <b>quicksand</b> — it breaks the fall.' : '<b>Mash JUMP</b> and wade to the <b>lip</b> at the south end, then up the stairs.';
      if (inBox(p, -212, -160, -92, -40, -12)) return dock.state === 'cleared' ? 'Board the <b>hovercraft</b> at the dock, west.' : 'Hold the dock yard. <b>Turn the heliostat</b> to sweep its sunbeam through them; break <b style="color:#ff3344">red</b> shields with red.';
      if (p.x < -212) return duneDone || duneRun?.done ? 'Step off the dock <b>east</b>, onto the Sun Quay.' : 'Ride the dune sea to the <b>Sun Quay</b>.';
      if (inBox(p, -212, -179, -212, -188, -8)) return dialA.orientation !== 0 || dialB.orientation !== 0 ? `Turn both ${Y}sun discs${E} (two yellow hits turn one a quarter turn) until their notches sit on the bridge.` : 'Cross the bridge and ride the <b>lift</b> up to the Sun Court.';
      if (inBox(p, -180, -126, -178, -222, 10)) return court.defeated ? `Shoot the ${Y}sun-lens${E} over the court with yellow to shut the engine down.` : 'Defeat <b>the Sphinx</b>: dodge its pounces from the pads, ride its back, blast its gems.';
      return `${Y}Yellow${E} in hand: head for the <b>Sun Court</b> on its mesa, north-west.`;
    },
  };
}
