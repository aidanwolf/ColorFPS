// THE SUN TEMPLE, INSIDE (solarTemple.js calls buildTempleInterior once the courtyard and the stair are up).
// A tall dark hall of sandstone round THE INVERTED OBELISK: a colossal energy-storage pillar hanging point-
// down from the tower's ceiling, old stargate-network tech (conduit grooves, cable sockets, couplers) under
// centuries of devotion (prayer banners, gold leaf, offerings, candles). Its worshippers are the stilt-
// legged mummies, kneeling, bowing and raising their hands to it on the ledges, until you intrude. You are
// the light: the yellow beam through small glass prisms opens each stage, and every stage you open wakes
// more of the temple (braziers, glyph seams, the obelisk's grooves). At the top four SUPPORT JOINTS hold
// it to the walls; break them all and it tears free, falls through the temple, and the blast throws you
// up out of the oculus into the sun, onto the roof; the high crossing runs down the south flank to the
// Panel Court passage.
//
// Authored in TEMPLE COORDINATES (templeKit.js frame): origin at the doorway's threshold on the temple floor,
// +z into the temple, +y up, x across. TEMPLE_T puts it in the world (now: the door faces east onto the
// yard, local +z = world west, local +x = world south).
//
//   ENVELOPE  lower hall x -18..18, z 0..31, y -12..31.5; tower (above y 30) x -6..18, roof y 48..50 with
//             the oculus x 2..10, z 11.75..19.75; the back block z 31..34 (solid to y 18, the back terrace
//             on top, the Panel Court passage off it at x 9..15); the high crossing x 18..27, y 18..52.
//   L0 (y 0)      the vestibule (prism beam-lock 1 → the inner gate), the front terrace, the island altar
//                 under the obelisk's tip, the quicksand pit (y -7.6) and its stair, the pilgrims' lift.
//   STAGE 1       up the north wall: ledges, a cracked one, the kneeling worshipper's shrine (y 4.8), the
//                 counterweight lift (burn its rope) → L1 (y 10), the north gallery (worshippers; prism
//                 beam-lock 2, a turning prism on a column → the drawbridge)
//   STAGE 2       along the back wall: the rope bridge under a swinging censer, the pressure plate (blocks
//                 grind out of the wall), a cracked step, the tending worshipper's shrine (y 16), a timed
//                 sun-disc's hard-light steps → L2 (y 19.6), the south gallery (worshippers; beam-lock 3:
//                 a gliding prism feeds the obelisk's old cable socket → hard light to its collar)
//   STAGE 3       round the obelisk: the collar (y 22), the great ring's drums, the gong that turns it,
//                 the front-wall stones (one cracked) → L3 (y 29.2), the south gallery and the pilgrims'
//                 balcony by the obelisk (log 06b; worshippers; beam-lock 4: a turning prism into a hooded
//                 one → blocks out of the back wall)
//   STAGE 4       the back-wall blocks under a second censer, a timed sun-disc's retracting north-wall
//                 blocks → L4 (y 40), the apex gallery
//   THE APEX      the four support joints, each a crystal deep in a stone throat: the front (from the
//                 step under it), the south (from the hanging stone under it), the north (from the north
//                 perch, up the high stones) and the back (from the south-back perch, along the back wall)
//   THE COLLAPSE  the obelisk falls; you're thrown out of the oculus onto the roof (y 50) → the crossing.
// Persistence: game.events solar_t1…t5 (beam-locks / the rope), solar_j1…j4 (joints), solar_collapse.
// Starts: solar13 (L2), solar14 (L4, the joints intact), solar15 (the roof, after the collapse), temple1
// (L1), temple3 (L3, by the log).
import * as THREE from 'three';
import { RED, YELLOW } from '../colors.js';
import { Seal } from '../entities/combat.js';
import { Checkpoint } from '../entities/misc.js';
import { PhasePlatform } from '../entities/mechanics.js';
import { LightReceiver, Prism, BeamGlass, LightShaft } from '../entities/sunlight.js';
import { Drone } from '../entities/drone.js';
import { audio } from '../audio.js';
import { setLogSpot } from './logs.js';
import {
  frame, Builder, templeMats, beamGeo, bannerGeo, flagStringGeo, sagGeos, CLOTH_CLOCK, SAND_HEX,
  Brazier, brazierFlicker, Censer, SlideBlock, VLift, Drawbridge, StoneRing, Gong, BurnRope, SupportJoint, DustClouds, Debris, Launch,
} from './templeKit.js';

const SOUNDS = ['obelisk_crack', 'obelisk_fall', 'temple_rumble', 'energy_surge_stone', 'servo_heavy', 'hydraulic_land', 'floor_collapse', 'incinerator_ignite', 'sun_hum', 'energy_crackle', 'titan_charge', 'boss_slam', 'elevator_start', 'door_slam', 'rotor_turn', 'rotor_lock', 'lava_sizzle', 'crumble_break', 'shatter', 'mirror_hit', 'mummy_alert', 'phase_in', 'titan_groan_big', 'sand_sink', 'reactor_hum', 'warp_whoosh', 'land_hard', 'switch_on'];
audio.manifest?.then(() => audio.prefetch(SOUNDS));

// the temple's placement: temple coordinates → world (yaw a multiple of 90°)
export const TEMPLE_T = { x: -100, y: -26, z: -76, yaw: -Math.PI / 2 };

// levels and landmarks (temple coordinates)
const L0 = 0, L1 = 10, L2 = 19.6, L3 = 29.2, L4 = 40;
const SAND = -7.6; // the pit's quicksand
const CEIL = 48; // the tower's ceiling
const OX = 6, OZ = 15.75; // the obelisk's axis
const CAP0 = 41, CAP1 = 46; // the capital (its crown hangs on chains from the ceiling)
const TIP = 9, PYR = 16; // the pyramidion: its point and its base
const hwAt = (y) => 2.1 + ((y - PYR) / (CAP0 - PYR)) * 1.1; // the shaft's half-width at height y
const BEAM0 = 44, BEAM1 = 45.2; // the support beams

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const _smoke = new THREE.Color(0.3, 0.27, 0.24);
const _down = new THREE.Vector3(0, -1, 0);
const rnd = (a, b) => a + Math.random() * (b - a);

export function buildTempleInterior(B, K, { T = TEMPLE_T } = {}) {
  const { W, game, level, hint, devStart, area, zoneTitle, onRespawn } = B;
  const { zone, glow, has } = K;
  const F = frame(T);
  const M = templeMats();
  const Bd = new Builder(W, F);
  const P = F.P;
  const ev = (id) => game.events.has(id);
  const mark = (id) => {
    if (game.events.has(id)) return;
    game.events.add(id);
    game.save();
  };
  const V3 = (a) => new THREE.Vector3(...a);
  const blk = (k, ...a) => Bd.blk(k, ...a);
  const deco = (k, x1, y1, z1, x2, y2, z2) => Bd.blk(k, x1, y1, z1, x2, y2, z2, { solid: false });
  const glowStrip = (x1, y1, z1, x2, y2, z2) => Bd.blk('edge', x1, y1, z1, x2, y2, z2, { solid: false });
  const trigger = (x1, y1, z1, x2, y2, z2, fn, opts) => {
    const [a, b] = F.box(x1, y1, z1, x2, y2, z2);
    return W.trigger(a, b, fn, opts);
  };
  const hintL = (x1, y1, z1, x2, y2, z2, html, time = 6) => {
    const [a, b] = F.box(x1, y1, z1, x2, y2, z2);
    hint(a, b, html, time);
  };
  const ck = (x, y, z, lyaw, w = 4, h = 3, d = 4) => new Checkpoint(W, game, { pos: P(x, y, z), yaw: F.yaw(lyaw), size: F.size(w, h, d) });
  const yawTo = (x, z, tx, tz) => F.yaw(F.faceTo(x, z, tx, tz));
  const toObelisk = (x, z) => yawTo(x, z, OX, OZ);

  // ================================================================ the mood
  const TEMPLE_DARK = {
    fog: 0x0b0704, fogNear: 6, fogFar: 58,
    skyTop: [0.02, 0.015, 0.01], skyMid: [0.04, 0.03, 0.02], skyHorizon: [0.06, 0.04, 0.03], aurora: 0, stars: 0,
    hemiSky: 0xd0a070, hemiGround: 0x24160c, hemiIntensity: 0.14,
    sunColor: 0xffc890, sunIntensity: 0.06, sunDir: [0.2, 1, 0.1],
    exposure: 1.1, bloom: 0.75,
  };
  level.atmospheres.solarTemple = { ...TEMPLE_DARK };
  const templeMood = { music: 'music_temple', ambient: 'amb_wind', atmosphere: 'solarTemple' };
  {
    const [a, b] = F.box(-17, -8, 1.6, 17, 47.5, 29.9);
    area(a, b, templeMood);
  }

  // ================================================================ THE ENCLOSURE
  // (outer faces: x ±18, z 0 and 31; the shell above y 30 only x -6..18 — the sun's sightline over the north)
  blk('sand', -18, 0, 0, -3, 31.5, 1.5, { occ: true }); // the front wall, the doorway in it
  blk('sand', 3, 0, 0, 18, 31.5, 1.5, { occ: true });
  blk('sand', -3, 5, 0, 3, 31.5, 1.5);
  blk('sand', -6, 31.5, 0, 18, 50, 1.5, { occ: true });
  blk('sand', -18, -12, 0, -17, 31.5, 31, { occ: true }); // north wall (the lower hall)
  blk('sand', 17, -12, 0, 18, 50, 31, { occ: true }); // south wall
  blk('sand', -18, -12, 30, 17, 31.5, 31, { occ: true }); // back wall
  blk('sand', -6, 31.5, 30, 17, 50, 31, { occ: true });
  blk('sandDark', -18, -12, 31, 18, 18, 34, { occ: true }); // the back block (the terrace on top)
  blk('floor', -18, 17.6, 31, 18, 18, 34, { solid: false });
  blk('sand', -18, 30, 1.5, -5, 31.5, 30, { occ: true }); // the north aisle's roof (a terrace outside)
  blk('sand', -6, 31.5, 1.5, -5, 50, 30, { occ: true }); // the tower's north wall, standing on it
  // the tower's ceiling, the oculus over the obelisk
  blk('sand', -6, CEIL, 1.5, 17, 50, 11.75, { occ: true });
  blk('sand', -6, CEIL, 19.75, 17, 50, 30, { occ: true });
  blk('sand', -6, CEIL, 11.75, 2, 50, 19.75);
  blk('sand', 10, CEIL, 11.75, 17, 50, 19.75);
  // the floor under everything: L0's terrace rock, the pit's bed and its quicksand
  blk('floor', -17, -12, 1.5, 14.6, L0, 10, { occ: true });
  blk('floor', 14.6, -12, 4.2, 17, L0, 10);
  blk('sandDark', 14.6, -12, 1.5, 17, L0 - 0.6, 4.2); // (the pilgrims' lift rests in a well in the corner)
  blk('sandDark', -17, -12, 10, 17, -8, 30);
  {
    const [a, b] = F.box(-17, -8, 10, 17, SAND, 30);
    K.quick(a[0], a[2], b[0], b[2], T.y + SAND, T.y - 8.4, false);
  }
  // the lintel and its glow over the door, a threshold
  deco('gold', -3.2, 5, -0.12, 3.2, 5.25, 0.02);
  deco('floor', -3, -0.05, -0.2, 3, 0.02, 1.5);

  // ---- walls dressed: pilasters, glyph seams (they wake), the worshippers' frieze, banners
  const seamMat = M.seam;
  const seamGeos = [];
  const seam = (x1, y1, z1, x2, y2, z2) => seamGeos.push([x1, y1, z1, x2, y2, z2]);
  for (const y of [2.5, 7.5, 15, 25, 35, 45]) {
    const north = y < 30 ? -16.98 : -4.98;
    seam(north, y, 1.6, north + 0.04, y + 0.06, 29.9); // north
    seam(16.94, y, 1.6, 16.98, y + 0.06, 29.9); // south
    seam(y < 30 ? -16.9 : -4.9, y, 29.94, 16.9, y + 0.06, 29.98); // back
    seam(y < 30 ? -16.9 : -4.9, y, 1.52, 16.9, y + 0.06, 1.56); // front
  }
  // pilasters every 6 m along the walls (they frame the ledges)
  for (let z = 4; z < 30; z += 6.5) {
    deco('sandDark', -17, -8, z - 0.5, -16.6, 30, z + 0.5);
    deco('sandDark', 16.6, -8, z - 0.5, 17, CEIL, z + 0.5);
  }
  for (let x = -13; x < 17; x += 6.5) {
    if (x < -5) deco('sandDark', x - 0.5, -8, 29.6, x + 0.5, 30, 30);
    else deco('sandDark', x - 0.5, -8, 29.6, x + 0.5, CEIL, 30);
  }
  // the frieze of worshippers raising their hands to the obelisk (the gold inlay wakes with the temple)
  const frieze = (cx, cy, cz, n, w = 8, h = 4) => {
    const g = new THREE.PlaneGeometry(w, h);
    g.rotateY(Math.atan2(n[0], n[1]));
    g.translate(cx + n[0] * 0.03, cy, cz + n[1] * 0.03);
    Bd.add('relief', g);
  };
  frieze(-17, 5, 7, [1, 0]);
  frieze(-17, 20, 13, [1, 0], 10, 5);
  frieze(17, 6, 24, [-1, 0]);
  frieze(17, 34, 24, [-1, 0], 10, 5);
  frieze(-4, 20, 30, [0, -1], 12, 6);
  frieze(10, 37, 30, [0, -1], 10, 5);
  frieze(6, 34, 1.5, [0, 1], 10, 5);
  frieze(-11, 16, 1.5, [0, 1], 9, 4.5);
  // cornices: a stepped band at the aisle's roof line and under the tower's ceiling, corbels under them
  for (const [y, xn] of [[29.0, -17], [46.8, -5]]) {
    deco('sandDark', xn, y, 1.5, 17, y + 0.5, 2.1);
    deco('sandDark', xn, y, 29.4, 17, y + 0.5, 30);
    deco('sandDark', xn, y, 1.5, xn + 0.6, y + 0.5, 30);
    deco('sandDark', 16.4, y, 1.5, 17, y + 0.5, 30);
    deco('gold', xn, y - 0.12, 2.05, 17, y, 2.15);
    deco('gold', xn, y - 0.12, 29.35, 17, y, 29.45);
    for (let x = xn + 1.5; x < 16.5; x += 2.2) (deco('sandDark', x - 0.3, y - 0.9, 1.5, x + 0.3, y, 2.0), deco('sandDark', x - 0.3, y - 0.9, 29.5, x + 0.3, y, 30));
  }
  // banners hanging from the wall tops of each storey
  const wallBanner = (x, y, z, n, w = 1.6, h = 5) => {
    Bd.add('cloth', bannerGeo(x + n[0] * 0.08, y, z + n[1] * 0.08, n, w, h));
    Bd.blk('bronze', x - (n[1] ? w / 2 + 0.2 : 0) - n[0] * 0.05, y - 0.1, z - (n[0] ? w / 2 + 0.2 : 0) - n[1] * 0.05, x + (n[1] ? w / 2 + 0.2 : 0) + n[0] * 0.35, y + 0.08, z + (n[0] ? w / 2 + 0.2 : 0) + n[1] * 0.35, { solid: false });
  };
  for (const z of [5, 18.5]) wallBanner(-17, 28.5, z, [1, 0], 1.8, 7);
  for (const z of [7, 20, 27]) wallBanner(17, 46.5, z, [-1, 0], 1.8, 8);
  for (const x of [-12, 0.5, 12.5]) wallBanner(x, x < -5 ? 28.5 : 46.5, 30, [0, -1], 1.8, 8);
  for (const x of [-10, 10]) wallBanner(x, 28, 1.5, [0, 1], 1.6, 6);

  // ================================================================ THE INVERTED OBELISK
  // (a group in temple coordinates, so the whole thing can lurch and fall; its colliders are separate)
  const obelisk = new THREE.Group();
  const obRoot = new THREE.Group(); // (the frame: temple coordinates inside it)
  obRoot.position.set(T.x, T.y, T.z);
  obRoot.quaternion.copy(F.Q);
  obRoot.add(obelisk);
  W.scene.add(obRoot);
  obelisk.position.set(OX, 0, OZ); // (its parts relative to the axis)
  const obSolids = [];
  const obSolid = (x1, y1, z1, x2, y2, z2) => {
    const s = Bd.solid(x1, y1, z1, x2, y2, z2);
    obSolids.push(s);
    return s;
  };
  const obGeos = { obelisk: [], gold: [], bronze: [], darkBronze: [], capital: [], socket: [], cloth: [], candle: [], chain: [], ledge: [], flame: [] };
  const og = (k, g) => obGeos[k].push(g);
  {
    // the shaft: a square frustum (4 radial segments turned 45°)
    const h = CAP0 - PYR;
    const shaft = new THREE.CylinderGeometry(hwAt(CAP0) * Math.SQRT2, hwAt(PYR) * Math.SQRT2, h, 4, 10, true).rotateY(Math.PI / 4).translate(0, PYR + h / 2, 0);
    og('obelisk', shaft);
    // the pyramidion, pointing down
    const pyr = new THREE.ConeGeometry(hwAt(PYR) * Math.SQRT2, PYR - TIP, 4, 3, true).rotateY(Math.PI / 4).rotateX(Math.PI).translate(0, TIP + (PYR - TIP) / 2, 0);
    og('obelisk', pyr);
    // gold leaf: bands round the shaft and a sheathed point
    for (const y of [PYR + 0.4, 21, 27, 33, 38.5]) {
      const hw = hwAt(y) + 0.05;
      og('gold', new THREE.CylinderGeometry(hw * Math.SQRT2, hw * Math.SQRT2, 0.45, 4, 1, true).rotateY(Math.PI / 4).translate(0, y, 0));
    }
    og('gold', new THREE.ConeGeometry(0.9 * Math.SQRT2, 2.4, 4, 1, true).rotateY(Math.PI / 4).rotateX(Math.PI).translate(0, TIP + 1.2, 0));
    // the capital: a great block, a glyph frieze, bronze couplers on each face (where the old network's
    // cables plugged in), and the chains and coupling up into the oculus
    og('capital', new THREE.BoxGeometry(8, CAP1 - CAP0, 8).translate(0, (CAP0 + CAP1) / 2, 0));
    og('gold', new THREE.BoxGeometry(8.12, 0.3, 8.12).translate(0, CAP0 + 0.4, 0));
    og('gold', new THREE.BoxGeometry(8.12, 0.3, 8.12).translate(0, CAP1 - 0.4, 0));
    og('darkBronze', new THREE.BoxGeometry(hwAt(CAP0) * 2 + 0.6, 0.8, hwAt(CAP0) * 2 + 0.6).translate(0, CAP0 - 0.3, 0));
    for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ry = Math.atan2(nx, nz);
      og('gold', new THREE.CylinderGeometry(1.1, 1.1, 0.12, 24).rotateX(Math.PI / 2).rotateY(ry).translate(nx * 4.06, CAP0 + 2.5, nz * 4.06));
      for (let r = 0; r < 12; r++) {
        const a = (r / 12) * Math.PI * 2;
        og('gold', new THREE.BoxGeometry(0.1, 0.45, 0.06).rotateZ(a - Math.PI / 2).translate(Math.cos(a) * 1.5, Math.sin(a) * 1.5, 0).rotateY(ry).translate(nx * 4.06, CAP0 + 2.5, nz * 4.06));
      }
    }
    for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ry = Math.atan2(nx, nz);
      for (const u of [-2.2, 2.2]) {
        const cx = nx * 4 + (nz ? u : 0), cz = nz * 4 + (nx ? u : 0), cy = CAP0 + 2.5;
        og('bronze', new THREE.CylinderGeometry(0.55, 0.55, 0.5, 14).rotateX(Math.PI / 2).rotateY(ry).translate(cx + nx * 0.2, cy, cz + nz * 0.2));
        og('socket', new THREE.CylinderGeometry(0.3, 0.3, 0.52, 10).rotateX(Math.PI / 2).rotateY(ry).translate(cx + nx * 0.22, cy, cz + nz * 0.22));
      }
    }
    // chains from the capital's corners up to the ceiling, and the coupling in the middle
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      for (let y = CAP1; y < CEIL; y += 0.36) og('chain', new THREE.TorusGeometry(0.18, 0.06, 5, 8).rotateY(((y * 2.78) | 0) % 2 ? Math.PI / 2 : 0).translate(sx * 3.3, y + 0.18, sz * 3.3));
    }
    og('darkBronze', new THREE.CylinderGeometry(1.6, 2.2, CEIL - CAP1, 12).translate(0, (CAP1 + CEIL) / 2, 0));
    og('gold', new THREE.CylinderGeometry(1.7, 1.7, 0.2, 12).translate(0, CAP1 + 0.6, 0));
    // old cable sockets down the faces (dark mouths in bronze rings), broken cable stubs hanging from some
    for (const y of [36, 30, 24]) {
      const hw = hwAt(y);
      for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ry = Math.atan2(nx, nz);
        og('bronze', new THREE.TorusGeometry(0.42, 0.1, 6, 14).rotateY(ry).translate(nx * (hw + 0.05), y, nz * (hw + 0.05)));
        og('socket', new THREE.CircleGeometry(0.34, 12).rotateY(ry).translate(nx * (hw + 0.06), y, nz * (hw + 0.06)));
        if ((y + nx * 3 + nz * 5) % 4 === 0) {
          for (let k = 0; k < 3; k++) og('darkBronze', beamGeo([nx * (hw + 0.1), y - 0.1, nz * (hw + 0.1)], [nx * (hw + 0.3) + (k - 1) * 0.15, y - 1.6 - k * 0.4, nz * (hw + 0.3) + (k - 1) * 0.12], 0.05, 0.05, 5));
        }
      }
    }
    // prayer banners draped down its faces from the gold bands
    for (const y of [38.5, 33, 27]) {
      const hw = hwAt(y) + 0.1;
      for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        for (const u of [-1.2, 1.2]) og('cloth', bannerGeo(nx * hw + (nz ? u : 0), y - 0.2, nz * hw + (nx ? u : 0), [nx, nz], 0.8, y > 35 ? 4.5 : 3.6, 5));
      }
    }
  }

  // the collar (y 22): a stone ring round the shaft on bronze brackets, with offerings and candles
  const COL = 22, colIn = hwAt(COL), colOut = 4.2;
  {
    const parts = [
      [-colOut, -colOut, colOut, -colIn], [-colOut, colIn, colOut, colOut],
      [-colOut, -colIn, -colIn, colIn], [colIn, -colIn, colOut, colIn],
    ];
    for (const [x1, z1, x2, z2] of parts) {
      og('ledge', new THREE.BoxGeometry(x2 - x1, 0.6, z2 - z1).translate((x1 + x2) / 2, COL - 0.3, (z1 + z2) / 2));
      obSolid(OX + x1, COL - 0.6, OZ + z1, OX + x2, COL, OZ + z2);
    }
    og('gold', new THREE.BoxGeometry(colOut * 2 + 0.1, 0.12, colOut * 2 + 0.1).translate(0, COL - 0.65, 0));
    for (const [nx, nz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) og('darkBronze', beamGeo([nx * (colIn + 0.1), COL - 2.6, nz * (colIn + 0.1)], [nx * (colOut - 0.3), COL - 0.6, nz * (colOut - 0.3)], 0.2));
    // offerings: bronze bowls and candles round the collar (not on the walking line's inner edge)
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const r = colOut - 0.35;
      const x = Math.max(-r, Math.min(r, Math.cos(a) * 6)), z = Math.max(-r, Math.min(r, Math.sin(a) * 6));
      if (k % 3 === 0) og('bronze', new THREE.CylinderGeometry(0.28, 0.18, 0.18, 10).translate(x, COL + 0.09, z));
      else {
        const h = rnd(0.25, 0.5);
        og('candle', new THREE.CylinderGeometry(0.05, 0.05, h, 6).translate(x, COL + h / 2, z));
        og('flame', new THREE.PlaneGeometry(0.12, 0.22).translate(x, COL + h + 0.1, z));
        og('flame', new THREE.PlaneGeometry(0.12, 0.22).rotateY(Math.PI / 2).translate(x, COL + h + 0.1, z));
      }
    }
  }
  // its colliders: the shaft in steps, the pyramidion, the capital
  for (let y = PYR; y < CAP0; y += 5) {
    const hw = hwAt(Math.min(CAP0, y + 5)) - 0.05;
    obSolid(OX - hw, y, OZ - hw, OX + hw, Math.min(CAP0, y + 5), OZ + hw);
  }
  obSolid(OX - 1.4, TIP + 2, OZ - 1.4, OX + 1.4, PYR, OZ + 1.4);
  obSolid(OX - 4, CAP0, OZ - 4, OX + 4, CAP1, OZ + 4);
  // the obelisk's meshes (one per material, in its group)
  const glowEnergy = M.obelisk; // (its emissive grooves wake with the temple)
  const flameMat = M.flame;
  const obMeshes = {};
  for (const [k, geos] of Object.entries(obGeos)) {
    if (!geos.length) continue;
    const list = geos.map((g) => (g.index ? g.toNonIndexed() : g));
    const keep = k === 'cloth' ? ['position', 'normal', 'uv', 'sway'] : ['position', 'normal', 'uv'];
    for (const g of list) for (const a of Object.keys(g.attributes)) if (!keep.includes(a)) g.deleteAttribute(a);
    const merged = mergeG(list);
    const mesh = new THREE.Mesh(merged, k === 'flame' ? flameMat : k === 'capital' ? M.obelisk : M[k]); // (the capital wears the same carved, grooved skin)
    obelisk.add(mesh);
    obMeshes[k] = mesh;
  }

  // energy running down its grooves: bright beads sliding from the capital to the point on every face
  // (one instanced draw; faster and brighter as the temple wakes)
  const PULSES = 4 * 4;
  const pulses = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.9, 0.16), M.pulse, PULSES);
  pulses.frustumCulled = false;
  obelisk.add(pulses);
  const pulseU = Array.from({ length: PULSES }, (_, i) => (i % 4) / 4 + Math.random() * 0.05);
  const _pm = new THREE.Matrix4(), _pq = new THREE.Quaternion(), _ps = new THREE.Vector3(), _pp = new THREE.Vector3();
  const FACES4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const placePulses = (dt, k) => {
    const speed = 0.04 + k * 0.12;
    for (let i = 0; i < PULSES; i++) {
      pulseU[i] = (pulseU[i] + dt * speed) % 1;
      const u = pulseU[i];
      const y = CAP0 - u * (CAP0 - PYR);
      const [nx, nz] = FACES4[i >> 2];
      const hw = hwAt(y) + 0.03;
      _pp.set(nx * hw, y, nz * hw);
      const vis = k > 0.05 ? Math.sin(Math.PI * u) * Math.min(1, k * 2) : 0;
      _pm.compose(_pp, _pq, _ps.set(vis, vis * (0.6 + k), vis));
      pulses.setMatrixAt(i, _pm);
    }
    pulses.instanceMatrix.needsUpdate = true;
  };
  placePulses(0, 0);

  // ================================================================ the support beams and their joints
  // Four beams from the capital out to the walls (y 44..45.2: you can walk them). Each joint is a crystal in
  // bronze jaws deep in a stone throat; only a beam straight down the throat reaches it.
  const beamDefs = [
    { id: 'j1', name: 'north', box: [-5, BEAM0, OZ - 0.6, OX - 4, BEAM1, OZ + 0.6], core: [-4.4, 44.6, OZ + 1.0], open: [0, 0, 1], throat: 'z+', at: [-4.4, OZ + 0.6] },
    { id: 'j2', name: 'south', box: [OX + 4, BEAM0, OZ - 0.6, 17, BEAM1, OZ + 0.6], core: [13.8, 43.4, OZ], open: [0, -1, 0], throat: 'y-', at: [13.8, OZ] },
    { id: 'j3', name: 'front', box: [OX - 0.6, BEAM0, 1.5, OX + 0.6, BEAM1, OZ - 4], core: [OX, 43.4, 7], open: [0, -1, 0], throat: 'y-', at: [OX, 7] },
    { id: 'j4', name: 'back', box: [OX - 0.6, BEAM0, OZ + 4, OX + 0.6, BEAM1, 30], core: [OX + 1.0, 44.6, 29], open: [1, 0, 0], throat: 'x+', at: [OX + 0.6, 29] },
  ];
  const bg = { capital: [], bronze: [], sandDark: [] }; // (merged into three meshes in the obelisk's group)
  for (const b of beamDefs) {
    const [x1, y1, z1, x2, y2, z2] = b.box;
    const s = Bd.solid(x1, y1, z1, x2, y2, z2);
    obSolids.push(s);
    // the beam (stone with bronze straps), a wall clamp at its outer end
    const cx0 = (x1 + x2) / 2 - OX, cy0 = (y1 + y2) / 2, cz0 = (z1 + z2) / 2 - OZ;
    bg.capital.push(new THREE.BoxGeometry(x2 - x1, y2 - y1, z2 - z1).translate(cx0, cy0, cz0));
    for (let u = 0.2; u < 1; u += 0.3) {
      bg.bronze.push(new THREE.BoxGeometry(x2 - x1 > 2 ? 0.25 : x2 - x1 + 0.1, y2 - y1 + 0.1, z2 - z1 > 2 ? 0.25 : z2 - z1 + 0.1).translate(cx0 + (x2 - x1 > 2 ? (u - 0.5) * (x2 - x1) : 0), cy0, cz0 + (z2 - z1 > 2 ? (u - 0.5) * (z2 - z1) : 0)));
    }
    // the throat round the joint: four slabs leaving the core open along `open`
    const [cx, cy, cz] = b.core;
    const L = 1.2, A = 0.3, Tk = 0.25;
    const th = [];
    if (b.throat === 'y-') {
      th.push([cx - A - Tk, cy - L + 0.4, cz - A - Tk, cx - A, BEAM0, cz + A + Tk], [cx + A, cy - L + 0.4, cz - A - Tk, cx + A + Tk, BEAM0, cz + A + Tk]);
      th.push([cx - A, cy - L + 0.4, cz - A - Tk, cx + A, BEAM0, cz - A], [cx - A, cy - L + 0.4, cz + A, cx + A, BEAM0, cz + A + Tk]);
    } else if (b.throat === 'z+') {
      th.push([cx - A - Tk, cy - A - Tk, z2, cx - A, cy + A + Tk, z2 + L], [cx + A, cy - A - Tk, z2, cx + A + Tk, cy + A + Tk, z2 + L]);
      th.push([cx - A, cy - A - Tk, z2, cx + A, cy - A, z2 + L], [cx - A, cy + A, z2, cx + A, cy + A + Tk, z2 + L]);
    } else {
      th.push([x2, cy - A - Tk, cz - A - Tk, x2 + L, cy + A + Tk, cz - A], [x2, cy - A - Tk, cz + A, x2 + L, cy + A + Tk, cz + A + Tk]);
      th.push([x2, cy - A - Tk, cz - A, x2 + L, cy - A, cz + A], [x2, cy + A, cz - A, x2 + L, cy + A + Tk, cz + A]);
    }
    for (const t of th) {
      obSolids.push(Bd.solid(...t));
      bg.sandDark.push(new THREE.BoxGeometry(t[3] - t[0], t[4] - t[1], t[5] - t[2]).translate((t[0] + t[3]) / 2 - OX, (t[1] + t[4]) / 2, (t[2] + t[5]) / 2 - OZ));
    }
    // a bronze clamp at the wall end
    const wallEnd = b.name === 'north' ? [-4.8, OZ] : b.name === 'south' ? [16.8, OZ] : b.name === 'front' ? [OX, 1.7] : [OX, 29.8];
    deco('bronze', wallEnd[0] - 0.7, BEAM0 - 0.4, wallEnd[1] - 0.7, wallEnd[0] + 0.7, BEAM1 + 0.4, wallEnd[1] + 0.7);
  }
  for (const [k, geos] of Object.entries(bg)) obelisk.add(new THREE.Mesh(mergeG(geos.map((g) => g.toNonIndexed())), M[k]));
  const joints = beamDefs.map((b, i) => new SupportJoint(W, { pos: P(...b.core), open: F.D(...b.open), time: 1.8, onCrack: (j, instant) => onJoint(i, instant) }));

  // ================================================================ THE VESTIBULE (L0): beam-lock 1
  // The inner gate is a beam-lock. Its receiver stands beyond the vestibule's north wall in a glass case
  // open only at the top: the pedestal prism throws your light up, the prism hung over it throws it north
  // over the wall, the last one drops it into the case.
  blk('sand', -4.4, 0, 1.5, -4, 4, 7.4); // north wall (open above, under the roof)
  blk('sand', 4, 0, 1.5, 4.4, 6, 7.4); // south wall
  blk('sand', -4.4, 0, 7, -1.5, 6, 7.4); // the inner wall, the gate in it
  blk('sand', 1.5, 0, 7, 4.4, 6, 7.4);
  blk('sand', -1.5, 3.5, 7, 1.5, 6, 7.4);
  blk('sandDark', -7.8, 6, 1.5, 4.4, 6.5, 7.4); // its roof, reaching out over the case
  deco('gold', -1.65, 3.5, 6.95, 1.65, 3.7, 7.02);
  const gateT1 = new Seal(W, { ...(() => { const [a, b] = F.box(-1.5, 0, 7, 1.5, 3.5, 7.4); return { min: a, max: b }; })(), color: YELLOW, zone, closed: true });
  const pa = new Prism(W, { pos: P(2.2, 1.4, 4.2), out: F.D(0, 1, 0), stand: 1.4 });
  const pb = new Prism(W, { pos: P(2.2, 4.6, 4.2), out: F.D(-1, 0, 0), stand: 0, hang: true });
  const pc = new Prism(W, { pos: P(-6, 4.6, 4.2), out: F.D(0, -1, 0), stand: 0, hang: true });
  blk('floor', -7, 0, 3.2, -5, 1.1, 5.2); // the case's plinth
  const rt1 = new LightReceiver(W, { pos: P(-6, 1.15, 4.2), face: 'up', color: YELLOW, size: 1.2 });
  for (const g of [[-7.2, 1.1, 3.0, -7.0, 3.5, 5.4], [-5.0, 1.1, 3.0, -4.8, 3.5, 5.4], [-7.0, 1.1, 3.0, -5.0, 3.5, 3.2], [-7.0, 1.1, 5.2, -5.0, 3.5, 5.4]]) {
    const [a, b] = F.box(...g);
    new BeamGlass(W, { min: a, max: b });
  }
  K.lights.push(rt1);
  // incense and offerings in the vestibule, a frieze over the gate
  frieze(0, 4.8, 6.98, [0, -1], 5.5, 2.4);
  ck(0, L0, 2.8, Math.PI, 5, 3, 2.4);
  zoneTitle(...F.box(-3, 0, 0, 3, 4, 2), 'SOLAR · THE SUN TEMPLE', 'THE INVERTED OBELISK', '#ffd23a');
  hintL(-3, 0, 1, 3, 3, 6.5, 'Dark in here — the sun never reaches inside. <b>You</b> are the light now. Those glass <b>prisms</b> bend your beam: hold it on one.', 7);

  // ================================================================ L0: the terrace, the island altar, the pit
  for (const [x1, x2] of [[-17, -4.4], [4.4, 17]]) glowStrip(x1, L0 - 0.1, 9.92, x2, L0 + 0.02, 10);
  glowStrip(-4.4, L0 - 0.1, 9.92, 4.4, L0 + 0.02, 10);
  // the island under the tip, its causeway, the sun-disc altar and its two kneeling worshippers
  blk('floor', 2, -12, 12, 10, L0, 19.5);
  blk('floor', 5, -12, 10, 7, L0 - 0.1, 12);
  glowStrip(2, L0 - 0.1, 19.42, 10, L0 + 0.02, 19.5);
  blk('ledge', 4.6, L0, 14.6, 7.4, L0 + 1.0, 16.9); // the altar table
  deco('gold', 4.5, L0 + 0.95, 14.5, 7.5, L0 + 1.05, 17);
  {
    // the sun disc on it, facing the door, and twelve rays
    const disc = new THREE.CylinderGeometry(1.0, 1.0, 0.12, 28).rotateX(Math.PI / 2).translate(OX, L0 + 2.2, 15.6);
    Bd.add('gold', disc);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      Bd.add('gold', new THREE.BoxGeometry(0.12, 0.5, 0.06).rotateZ(a - Math.PI / 2).translate(OX + Math.cos(a) * 1.35, L0 + 2.2 + Math.sin(a) * 1.35, 15.62));
    }
    Bd.add('bronze', new THREE.BoxGeometry(0.2, 1.3, 0.2).translate(OX, L0 + 1.55, 15.7));
  }
  const candles = (cx, cy, cz, n = 6, r = 0.8) => {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + 0.3;
      const x = cx + Math.cos(a) * r * rnd(0.6, 1), z = cz + Math.sin(a) * r * rnd(0.6, 1), h = rnd(0.2, 0.55);
      Bd.add('candle', new THREE.CylinderGeometry(0.05, 0.06, h, 6).translate(x, cy + h / 2, z));
      Bd.add('flame', new THREE.PlaneGeometry(0.13, 0.24).translate(x, cy + h + 0.11, z));
      Bd.add('flame', new THREE.PlaneGeometry(0.13, 0.24).rotateY(Math.PI / 2).translate(x, cy + h + 0.11, z));
    }
  };
  const bowl = (x, y, z, r = 0.32) => {
    Bd.add('bronze', new THREE.CylinderGeometry(r, r * 0.6, r * 0.55, 10).translate(x, y + r * 0.27, z));
    Bd.add('gold', new THREE.TorusGeometry(r, 0.03, 4, 12).rotateX(Math.PI / 2).translate(x, y + r * 0.55, z));
  };
  candles(OX, L0 + 1.0, 15.75, 8, 1.1);
  for (const [x, z] of [[3, 13], [9, 13], [3, 18.6], [9, 18.6]]) bowl(x, L0, z);
  candles(OX, L0, 12.6, 5, 0.6);
  B.armor(P(OX, L0, 18.6));
  // braziers on the terrace (lit when the gate opens)
  const brz = (x, y, z, o = {}) => new Brazier(W, P(x, y, z), { bd: Bd, at: [x, y, z], onLit: (b, byPlayer) => byPlayer && rouseNear(b.pos, 14), ...o });
  const braziers = [[], [], [], [], [], []];
  braziers[1].push(brz(-9, L0, 8.6, { real: true }), brz(9, L0, 8.6, { real: true }));
  // the pit's stair (along the south wall) back up to the terrace
  for (let i = 0; i < 19; i++) blk('floor', 14.6, -12, 10 + 0.5 * (18 - i), 17, SAND + 0.4 * (i + 1), 10 + 0.5 * (19 - i));
  glowStrip(14.6, L0 - 0.1, 10, 14.68, L0 + 0.02, 10.5);
  hintL(-17, SAND - 1, 10, 17, SAND + 2, 30, 'The pit. Mash <b>JUMP</b> to the <b>stair</b> by the south wall; the <b>pilgrims\' lift</b> in the corner takes you back up to the highest landing you\'ve reached.', 7);

  // ================================================================ STAGE 1: up the north wall (y 0 → 10)
  // ledges with carved brackets under them, a cracked one, the shrine and its kneeling worshipper, the
  // counterweight lift: burn the rope that holds its counterweight up and the lift starts to ride
  const ledge = (x1, z1, x2, z2, top, { wall = null, banner = false, look = 'ledge' } = {}) => {
    blk(look, x1, top - 0.55, z1, x2, top, z2);
    glowStrip(x1, top - 0.08, z1, x2, top + 0.015, z1 + 0.06);
    glowStrip(x1, top - 0.08, z2 - 0.06, x2, top + 0.015, z2);
    // brackets under it on the wall side
    if (wall === '-x' || wall === '+x') {
      const wx = wall === '-x' ? x1 : x2, s = wall === '-x' ? 1 : -1;
      for (const z of [z1 + 0.5, z2 - 0.5]) {
        deco('sandDark', Math.min(wx, wx + s * 1.2), top - 1.1, z - 0.25, Math.max(wx, wx + s * 1.2), top - 0.55, z + 0.25);
        deco('sandDark', Math.min(wx, wx + s * 0.6), top - 1.7, z - 0.22, Math.max(wx, wx + s * 0.6), top - 1.1, z + 0.22);
      }
      if (banner) Bd.add('cloth', bannerGeo(wall === '-x' ? x2 + 0.05 : x1 - 0.05, top - 0.15, (z1 + z2) / 2, [s, 0], Math.min(1.6, z2 - z1 - 0.6), 3.4, 5));
    } else if (wall === '-z' || wall === '+z') {
      const wz = wall === '-z' ? z1 : z2, s = wall === '-z' ? 1 : -1;
      for (const x of [x1 + 0.5, x2 - 0.5]) {
        deco('sandDark', x - 0.25, top - 1.1, Math.min(wz, wz + s * 1.2), x + 0.25, top - 0.55, Math.max(wz, wz + s * 1.2));
        deco('sandDark', x - 0.22, top - 1.7, Math.min(wz, wz + s * 0.6), x + 0.22, top - 1.1, Math.max(wz, wz + s * 0.6));
      }
      if (banner) Bd.add('cloth', bannerGeo((x1 + x2) / 2, top - 0.15, wall === '-z' ? z2 + 0.05 : z1 - 0.05, [0, s], Math.min(1.6, x2 - x1 - 0.6), 3.4, 5));
    }
  };
  const crumble = (x1, z1, x2, z2, top, o = {}) => {
    const [a, b] = F.box(x1, top - 0.45, z1, x2, top, z2);
    return B.crumble({ min: a, max: b, delay: 0.7, respawn: 3, zone, ...o });
  };
  ledge(-17, 11, -14.4, 13.4, 1.2, { wall: '-x', banner: true });
  ledge(-17, 15.4, -14.4, 17.8, 2.4, { wall: '-x' });
  crumble(-17, 19.8, -14.4, 22.2, 3.6);
  // the shrine (y 4.8): a kneeling worshipper before a brazier, offerings, banners
  ledge(-17, 24.2, -11, 30, 4.8, { wall: '-x', banner: true });
  braziers[2].push(brz(-15.8, 4.8, 28.8));
  candles(-12.2, 4.8, 29.2, 4, 0.5);
  bowl(-16.2, 4.8, 25);
  // the counterweight lift: up to L1
  const cwLift = new VLift(W, {
    ...(() => { const [a, b] = F.box(-10.6, 4.25, 25.6, -8, 4.8, 28.2); return { min: a, max: b }; })(),
    rise: 5.2, mode: 'cycle', speed: 1.7, pause: 2.2, active: false, pulley: P(-9.3, 15.5, 26.9), cw: { pos: P(-6.6, 13.2, 26.9), size: F.size(1.3, 1.8, 1.3) },
  });
  deco('bronze', -11, 15.6, 26.6, -5.8, 16.0, 27.2); // the pulley beam, from the north gallery's edge
  deco('sandDark', -11.4, 15.2, 26.2, -10.6, 16.6, 27.6); // its anchor block
  deco('bronze', -6.9, 15.3, 26.6, -6.3, 15.6, 27.2); // the hook the counterweight hangs from
  const rope2 = new BurnRope(W, { a: P(-6.6, 13.25, 26.9), b: P(-6.6, 15.3, 26.9), time: 0.8, onBurn: (r, instant) => locks.rope.fire(instant || restoring) });
  hintL(-17, 4.8, 24.2, -11, 7.5, 30, 'A lift on ropes, held down by a <b>counterweight</b> — and the counterweight held up by one <b>rope</b>. Burn it with the beam.', 6);
  // ---- L1 (y 10): the north gallery
  ledge(-17, 14, -11, 30, L1, { wall: '-x', banner: true });
  deco('bronze', -11.1, L1, 14, -10.9, L1 + 1.0, 21); // a low bronze rail along part of its edge
  braziers[2].push(brz(-15.8, L1, 15.5, { real: true }), brz(-15.8, L1, 28.6));
  candles(-16.2, L1, 22, 5, 0.5);
  bowl(-15.9, L1, 19.6);
  ck(-12.6, L1, 28.2, 0, 3.6, 3, 3.4);
  // beam-lock 2: a turning prism on a column in the pit; the receiver at the end of a tube in the back wall
  const P2Y = 13.4; // (high enough that the rope bridge passes under the tube)
  blk('sandDark', 0.5, -8, 20.5, 1.5, P2Y - 0.7, 21.5);
  deco('gold', 0.4, P2Y - 1.0, 20.4, 1.6, P2Y - 0.7, 21.6);
  const pRot2 = new Prism(W, { pos: P(1, P2Y, 21), rotatable: true, yaw: F.yaw(0), step: Math.PI / 4, count: 8, start: 2, stand: 0.7 });
  const rt2 = new LightReceiver(W, { pos: P(1, P2Y, 29.95), face: F.face('-z'), color: YELLOW, size: 0.9 });
  for (const t of [[0.1, P2Y - 1.0, 27, 1.9, P2Y - 0.75, 30], [0.1, P2Y + 0.75, 27, 1.9, P2Y + 1.0, 30], [0.1, P2Y - 0.75, 27, 0.25, P2Y + 0.75, 30], [1.75, P2Y - 0.75, 27, 1.9, P2Y + 0.75, 30]]) blk('sandDark', ...t);
  K.lights.push(rt2);
  // the drawbridge from the gallery across to the back wall's ledges (raised until the lock opens)
  const bridge2 = new Drawbridge(W, { ...(() => { const [a, b] = F.box(-11, L1 - 0.3, 27.2, -6, L1, 29.6); return { min: a, max: b }; })(), hinge: F.face('+x') });
  hintL(-17, L1, 14, -11, L1 + 3, 30, 'A drawbridge stands raised across the gap. In the back wall, a receiver at the end of a <b>tube</b>; the prism on the column could reach it — <b>turn it</b> (shoot its base) to face the tube, then hold the beam on it.', 8);

  // ================================================================ STAGE 2: along the back wall (y 10 → 19.6)
  ledge(-6, 27, -2.6, 30, L1, { wall: '+z' });
  // the rope bridge, and the censer that sweeps across it
  blk('wood', -2.6, L1 - 0.15, 27.6, 3, L1, 29.4);
  for (const z of [27.65, 29.35]) for (const g of sagGeos(P(-2.6, L1 + 1.0, z), P(3, L1 + 1.0, z), 0.25, 0.035, 6)) Bd.add('rope', g.applyMatrix4(new THREE.Matrix4().copy(F.M).invert()));
  for (let x = -2.4; x < 3; x += 1.1) deco('wood', x - 0.04, L1, 27.6, x + 0.04, L1 + 1.0, 27.68), deco('wood', x - 0.04, L1, 29.32, x + 0.04, L1 + 1.0, 29.4);
  new Censer(W, { pivot: P(0.2, 17.6, 28.5), length: 6.7, axis: F.D(0, 0, 1), amp: 0.95, period: 4.6 });
  deco('bronze', -0.4, 17.5, 26.2, 0.8, 17.9, 30); // its arm out of the back wall
  ledge(3, 27, 7, 30, L1, { wall: '+z', banner: true });
  // the pressure plate: blocks grind out of the back wall, a stair up to the corner
  const plateMesh = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 1.6), M.bronze);
  plateMesh.position.copy(F.V(5, L1 + 0.03, 28.7));
  W.scene.add(plateMesh);
  const steps2 = [[8.2, 10.4, 11.2], [11.4, 13.6, 12.4], [14.6, 17, 13.6]].map(([x1, x2, top], i) => {
    const [a, b] = F.box(x1, top - 0.6, 27.4, x2, top, 30);
    return new SlideBlock(W, { min: a, max: b, out: F.D(0, 0, -1), delay: i * 0.35 });
  });
  let plateDown = false;
  const pressPlate = (instant = false) => {
    if (plateDown) return;
    plateDown = true;
    plateMesh.position.y -= 0.07;
    steps2.forEach((s) => s.activate(null, instant));
    if (!instant) audio.sample('switch_on', { gain: 0.7, rate: 0.6 });
  };
  trigger(4.2, L1, 27.9, 5.8, L1 + 1.5, 29.5, () => pressPlate(false), { once: false });
  hintL(3, L1, 27, 7, L1 + 3, 30, 'A <b>pressure plate</b> in the floor…', 3);
  crumble(14.6, 23.4, 17, 25.8, 14.8);
  // the second shrine (y 16): a worshipper tending a brazier
  ledge(12.6, 18.6, 17, 22.4, 16, { wall: '+x', banner: true });
  braziers[3].push(brz(15.9, 16, 21.4));
  candles(13.2, 16, 22, 4, 0.4);
  // a timed sun-disc on the back wall: hard-light steps up to L2
  const hl2 = [
    new PhasePlatform(W, { ...(() => { const [a, b] = F.box(9.6, 16.8, 18.6, 12, 17.2, 21); return { min: a, max: b }; })(), on: false, zone, color: YELLOW }),
    new PhasePlatform(W, { ...(() => { const [a, b] = F.box(9.6, 18.0, 14.6, 12, 18.4, 17); return { min: a, max: b }; })(), on: false, zone, color: YELLOW }),
  ];
  const act2 = new LightReceiver(W, { pos: P(11, 18.4, 29.9), face: F.face('-z'), color: YELLOW, size: 1.2, look: 'disc', mode: 'timed', time: 6, fill: 0.35, links: hl2 });
  K.lights.push(act2);
  hintL(12.6, 16, 18.6, 17, 19, 22.4, 'A <b style="color:#ffd23a">sun-disc</b> on the back wall: it calls <b>hard-light steps</b> up to the gallery — for a few seconds.', 5);
  // ---- L2 (y 19.6): the south gallery
  ledge(13, 4.2, 17, 17, L2, { wall: '+x', banner: true });
  braziers[3].push(brz(16, L2, 5.4, { real: true }), brz(16, L2, 15.8));
  candles(16.2, L2, 10.5, 5, 0.45);
  bowl(16.1, L2, 13);
  ck(15, L2, 15.4, Math.PI / 2, 4, 3, 3);
  // beam-lock 3: a prism gliding on a rail behind the obelisk; the obelisk's old cable socket at the end of
  // a short throat on its back face: only the gliding prism, paused at the rail's end, lines up with it
  const SOCK = 25.2, sockZ = OZ + hwAt(SOCK);
  deco('bronze', -3.4, SOCK + 1.2, 24.8, 7.4, SOCK + 1.45, 25.2); // the rail
  deco('bronze', -3.6, SOCK + 1.2, 24.8, -3.2, SOCK + 1.45, 30);
  deco('bronze', 7.2, SOCK + 1.2, 24.8, 7.6, SOCK + 1.45, 30);
  const pMove = new Prism(W, { pos: P(-2, SOCK, 25), out: F.D(0, 0, -1), stand: 0, hang: true, path: F.D(8, 0, 0), speed: 2.0, pause: 1.6 });
  const rt3 = new LightReceiver(W, { pos: P(OX, SOCK, sockZ + 0.05), face: F.face('+z'), color: YELLOW, size: 0.9 });
  const sockThroat = [[OX - 0.75, SOCK - 0.75, sockZ, OX + 0.75, SOCK - 0.5, sockZ + 1.5], [OX - 0.75, SOCK + 0.5, sockZ, OX + 0.75, SOCK + 0.75, sockZ + 1.5], [OX - 0.75, SOCK - 0.5, sockZ, OX - 0.5, SOCK + 0.5, sockZ + 1.5], [OX + 0.5, SOCK - 0.5, sockZ, OX + 0.75, SOCK + 0.5, sockZ + 1.5]];
  for (const t of sockThroat) obSolids.push(Bd.solid(...t));
  obelisk.add(new THREE.Mesh(mergeG(sockThroat.map((t) => new THREE.BoxGeometry(t[3] - t[0], t[4] - t[1], t[5] - t[2]).translate((t[0] + t[3]) / 2 - OX, (t[1] + t[4]) / 2, (t[2] + t[5]) / 2 - OZ).toNonIndexed())), M.bronze));
  K.lights.push(rt3);
  // its reward: hard light up onto the obelisk's collar
  const hl3 = [new PhasePlatform(W, { ...(() => { const [a, b] = F.box(10.4, 20.4, 11, 12.6, 20.8, 13.6); return { min: a, max: b }; })(), on: false, zone, color: YELLOW })];
  hintL(13, L2, 4.2, 17, L2 + 3, 17, 'Behind the obelisk a prism glides on a rail. On its back, an old <b>cable socket</b>: the gliding prism lines up with it only at the <b>end of its run</b> — hold the beam on it as it pauses there.', 8);

  // ================================================================ STAGE 3: round the obelisk (y 22 → 29.2)
  // the collar (built with the obelisk), the great ring's drums and the gong that turns it a quarter
  const ring = new StoneRing(W, { center: P(OX, 0, OZ), y: T.y + 23.2, r: 7.5, n: 4, drum: 1.15, angle: worldAngleOf(Math.PI), time: 3.6 });
  const gong = new Gong(W, { pos: P(OX - hwAt(24.6) - 0.35, 24.6, OZ), n: F.D(-1, 0, 0), r: 0.85, onRing: () => ring.turn(ringDir) });
  const ringDir = 1; // (a quarter turn that carries the north drum to the front: angles turn the same way in any frame)
  // the front-wall stones up to L3 (one cracked)
  ledge(4.8, 4.4, 7.2, 6.4, 24.4, { wall: '-z' });
  deco('sandDark', 5.6, 23.6, 1.5, 6.4, 24.0, 4.4); // its arm
  ledge(8.8, 2, 11.2, 4.4, 25.6, { wall: '-z', banner: true });
  ledge(11.6, 1.6, 14, 4.0, 26.8, { wall: '-z' });
  crumble(11.4, 6, 13.8, 8.4, 28.0);
  hintL(1.8, COL, 11.5, 10.2, COL + 3, 20, 'A great <b>ring</b> circles the obelisk, its stone drums out of reach of everything — ride one. The <b>gong</b> turns the ring.', 6);
  // ---- L3 (y 29.2): the south gallery and the pilgrims' balcony by the obelisk
  ledge(14, 4.2, 17, 17, L3, { wall: '+x', banner: true });
  ledge(10, 17, 17, 24, L3, { wall: '+x' });
  deco('bronze', 9.95, L3, 17, 10.05, L3 + 1.0, 21); // a rail on the balcony's edge, short of the prism
  braziers[4].push(brz(16, L3, 5.4, { real: true }), brz(16.1, L3, 18));
  candles(16.2, L3, 12, 5, 0.45);
  ck(15.5, L3, 6, Math.PI / 2, 3, 3, 3.4);
  // log 06b on the balcony (its 4 x 4 patch for the ghost: x 11..15, z 18..22)
  setLogSpot('06b', P(16.2, L3, 23.1), F.yaw(Math.PI / 2));
  // beam-lock 4: the balcony's turning prism must send your light west, behind the obelisk, into a prism
  // whose hood is a long throat open only toward it; that one drops it into the receiver's tube in the back wall
  const pA = new Prism(W, { pos: P(10.3, L3 + 1.4, 23.4), rotatable: true, yaw: F.yaw(0), step: Math.PI / 4, count: 8, start: 0, stand: 1.4 });
  const pB = new Prism(W, { pos: P(3, L3 + 1.4, 23.4), out: F.D(0, 0, 1), stand: 0, hang: true });
  deco('bronze', 2.8, L3 + 2.6, 23.2, 3.2, L3 + 2.9, 30); // pB's bracket from the back wall
  const PBY = L3 + 1.4;
  for (const t of [[3.6, PBY - 0.6, 23.0, 7.2, PBY - 0.35, 23.8], [3.6, PBY + 0.35, 23.0, 7.2, PBY + 0.6, 23.8], [3.6, PBY - 0.35, 22.75, 7.2, PBY + 0.35, 23.05], [3.6, PBY - 0.35, 23.75, 7.2, PBY + 0.35, 24.05], [2.4, PBY - 0.6, 22.75, 3.6, PBY - 0.35, 24.05], [2.4, PBY + 0.35, 22.75, 3.6, PBY + 0.6, 24.05], [2.4, PBY - 0.35, 22.75, 3.6, PBY + 0.35, 23.0]]) blk('sandDark', ...t);
  const rt4 = new LightReceiver(W, { pos: P(3, PBY, 29.95), face: F.face('-z'), color: YELLOW, size: 0.9 });
  for (const t of [[2.2, PBY - 0.8, 27, 3.8, PBY - 0.55, 30], [2.2, PBY + 0.55, 27, 3.8, PBY + 0.8, 30], [2.2, PBY - 0.55, 27, 2.45, PBY + 0.55, 30], [3.55, PBY - 0.55, 27, 3.8, PBY + 0.55, 30]]) blk('sandDark', ...t);
  K.lights.push(rt4);
  hintL(10, L3, 17, 17, L3 + 3, 24, 'Behind the obelisk, a <b>hooded prism</b> takes light only from <b>this</b> one — turn it (shoot its base) to face it, then hold the beam on it.', 7);

  // ================================================================ STAGE 4: the back wall, then the north wall (y 29.2 → 40)
  const stairs4 = [[13, 15.4, 30.4], [9.4, 11.8, 31.6], [5.8, 8.2, 32.8], [2.2, 4.6, 34.0], [-1.4, 1.0, 35.2], [-5, -2.6, 36.4]].map(([x1, x2, top], i) => {
    const [a, b] = F.box(x1, top - 0.6, 25.4, x2, top, 30);
    return new SlideBlock(W, { min: a, max: b, out: F.D(0, 0, -1), delay: i * 0.3, time: 1.3 });
  });
  new Censer(W, { pivot: P(8.8, 40, 27.7), length: 7.6, axis: F.D(0, 0, 1), amp: 0.8, period: 5.0, phase: 0.3 });
  deco('bronze', 8.2, 39.9, 26, 9.4, 40.3, 30);
  // the north wall's retracting blocks (a timed sun-disc on the front wall far across holds them out)
  const tier = [[20.8, 23.2, 37.6], [16.4, 18.8, 38.8]].map(([z1, z2, top]) => {
    const [a, b] = F.box(-5, top - 0.6, z1, -2.6, top, z2);
    return new SlideBlock(W, { min: a, max: b, out: F.D(1, 0, 0), time: 0.6 });
  });
  const act4 = new LightReceiver(W, { pos: P(-1.5, 39.4, 1.62), face: F.face('+z'), color: YELLOW, size: 1.3, look: 'disc', mode: 'timed', time: 7, fill: 0.35, links: tier });
  K.lights.push(act4);
  for (const [z1, z2, top] of [[20.8, 23.2, 37.6], [16.4, 18.8, 38.8]]) deco('socket', -5.02, top - 0.62, z1 - 0.05, -4.97, top + 0.02, z2 + 0.05);
  hintL(-5, 36.4, 25.4, -2.6, 39, 30, 'Dark slots in the north wall… a <b style="color:#ffd23a">sun-disc</b> far across on the front wall. Light it and <b>run</b>.', 6);
  // ---- L4 (y 40): the apex gallery — the front, the north arm, the south walkway
  ledge(-5, 1.5, 17, 4.5, L4, { wall: '-z', banner: true });
  ledge(-5, 4.5, -2.4, 14.4, L4, { wall: '-x' });
  ledge(14.3, 4.5, 17, 12, L4, { wall: '+x' });
  braziers[5].push(brz(-3.8, L4, 2.6, { real: true }), brz(12.8, L4, 2.6));
  candles(4, L4, 2.4, 6, 0.5);
  ck(-3.7, L4, 11, -Math.PI / 2, 2.6, 3, 5);
  // the joints' perches: the front step under the front beam, the stone hung under the south beam, the
  // high stones up to the north perch, the back wall's stones to the south-back perch, a ledge down from it
  ledge(5, 6, 7, 8.5, 40.2);
  ledge(12.6, 14.6, 15, 17, 40.4);
  ledge(-1.8, 6.5, 0.6, 8.9, 41.0);
  ledge(-1.8, 10.6, 0.6, 13, 41.6);
  crumble(-1.8, 14.4, 0.6, 17.2, 42.2, { delay: 0.9 });
  ledge(-1.8, 19.2, 0.6, 21.6, 42.8);
  ledge(-5, 23, -1.5, 27, 42.8, { wall: '-x', banner: true });
  ledge(0, 27.6, 2.4, 30, 42.0, { wall: '+z' });
  ledge(3.8, 27.6, 8.2, 30, 40.6, { wall: '+z' }); // (low: it passes under the back beam's throat)
  ledge(9.6, 27.6, 12, 30, 41.6, { wall: '+z' });
  ledge(13.4, 25.5, 17, 30, 42.8, { wall: '+x', banner: true });
  ledge(14.3, 18, 17, 24, L4, { wall: '+x' });
  // hanging stones' chains up to the beams / ceiling
  for (const [x, z, top] of [[13.8, 15.8, 40.4], [-0.6, 7.7, 41.0], [-0.6, 11.8, 41.6], [-0.6, 20.4, 42.8]]) {
    for (const dx of [-0.9, 0.9]) Bd.add('chain', beamGeo([x + dx, top, z], [x + dx, CEIL, z], 0.06, 0.06, 5));
  }
  // the apex worshippers' prayer lines: flags strung from the beams to the walls
  for (const [a, b] of [[[-5, 47.4, 4], [OX - 4, 46, OZ - 2]], [[17, 47.4, 4], [OX + 4, 46, OZ - 2]], [[-5, 47.4, 28], [OX - 4, 46, OZ + 2]], [[17, 47.4, 28], [OX + 4, 46, OZ + 2]]]) {
    Bd.add('flags', flagStringGeo(a, b, { sag: 1.6, n: 16 }));
    for (const g of sagGeos(a, b, 1.6, 0.02, 8)) Bd.add('rope', g);
  }
  // prayer lines lower down, across the hall
  for (const [a, b, s] of [[[-17, 20, 6], [17, 24, 8], 2.4], [[-17, 13, 24], [17, 16, 22], 2], [[-5, 36, 8], [17, 38, 10], 2.2], [[-17, 27, 12], [-5, 34, 22], 1.6]]) {
    Bd.add('flags', flagStringGeo(a, b, { sag: s, n: 24, size: 0.5 }));
    for (const g of sagGeos(a, b, s, 0.02, 10)) Bd.add('rope', g);
  }
  hintL(-5, L4, 1.5, 14.3, L4 + 3, 4.5, 'The obelisk hangs from four <b>support joints</b> — glowing crystals deep in stone throats. Find the angle down each throat and hold the beam on them.', 8);

  // ================================================================ the worshippers
  // (dormant, at their posts in prayer; close up, shot, or roused by a light lit near them, they turn)
  const mummies = [];
  const worshipper = (x, y, z, pose, { face = null, shield = RED, notice = 8 } = {}) => {
    const m = B.mummy(P(x, y, z), { color: YELLOW, shieldColor: shield, range: 22, patrol: 0, worship: { pose, face: face ?? toObelisk(x, z), notice } });
    m.level = y;
    mummies.push(m);
    return m;
  };
  worshipper(3.4, L0, 13.4, 'kneel', { face: yawTo(3.4, 13.4, OX, 15.75), notice: 7 });
  worshipper(8.7, L0, 18.2, 'kneel', { face: yawTo(8.7, 18.2, OX, 15.75), shield: null, notice: 7 });
  worshipper(-13, 4.8, 27, 'kneel', { face: yawTo(-13, 27, -15.8, 28.8) });
  worshipper(-13.6, L1, 15.6, 'bow');
  worshipper(-13, L1, 19.4, 'raise', { shield: null });
  worshipper(14.2, 16, 20.6, 'tend', { face: yawTo(14.2, 20.6, 15.9, 21.4), shield: null });
  worshipper(15.4, L2, 7.5, 'raise', { notice: 6 });
  worshipper(15.6, L3, 14.4, 'kneel', { notice: 6 });
  worshipper(10.5, L4, 3, 'raise');
  // scarabs nest in the galleries' corners
  for (const [x, y, z, sh] of [[-15.5, L1, 21, null], [16, L2, 4.8, RED], [15.6, L4, 4, null]]) B.scarab(P(x, y, z), { color: YELLOW, shields: sh ? [sh] : undefined, range: 9, burrow: false });
  // two drones keep the apex
  new Drone(W, { pos: P(10, 37, 10), color: YELLOW, range: 20 });
  new Drone(W, { pos: P(0, 38, 24), color: YELLOW, shields: [RED], range: 20 });
  function rouseNear(p, r) {
    for (const m of mummies) if (!m.dead && m.pos.distanceTo(p) < r) m.rouse();
  }
  // a chant broken is broken for every worshipper on that storey; and the fight music while any are up
  let calmT = 0;
  W.add({
    update(dt, player) {
      let any = false;
      for (const m of mummies) {
        if (m.dead || !m.aggro) continue;
        any = true;
        for (const o of mummies) if (!o.dead && !o.aggro && Math.abs(o.level - m.level) < 3 && o.pos.distanceTo(m.pos) < 16) o.rouse();
      }
      const inside = inTemple(player.pos);
      if (any && inside) {
        calmT = 0;
        if (game.musicTrack !== 'music_combat') game.setMusic('music_combat');
      } else if (game.musicTrack === 'music_combat' && inside && (calmT += dt) > 3) game.setMusic('music_temple');
    },
  });

  // ================================================================ the pilgrims' lift (the pit's way back up)
  // In the front-south corner: once you've reached L2 it takes you up to the highest landing you've seen.
  let reached = 0; // 0 L0/L1 · 2 L2 · 3 L3 · 4 L4
  const stops = [0, 0, L2, L3, L3]; // (the apex gallery covers the shaft: from the pit it's L3 at best)
  const pilgrimLift = new VLift(W, {
    ...(() => { const [a, b] = F.box(14.6, -0.55, 1.6, 17, 0, 4.2); return { min: a, max: b }; })(),
    rise: L3, mode: 'call', speed: 6, pause: 2.5, wait: 0.7, active: true, pulley: P(15.8, L4 - 0.7, 2.9), look: 'floor',
    stop: () => stops[reached] || 0,
  });
  // (fall down its shaft while it's away and you're faded back to your checkpoint, not killed)
  W.add({
    update(dt, player) {
      if (game.voidT || game.state !== 'playing' || player.vel.y > -13 || player.mount || player.dead) return;
      const l = F.local(player.pos, _w);
      if (l.x > 14.6 && l.x < 17 && l.z > 1.5 && l.z < 4.2 && l.y > 1 && l.y < L3) return game.fallOutOfWorld();
      // a long fall anywhere in the hall: into the quicksand it's caught (struggle out, the stair, the lift);
      // onto stone that would kill you, you're faded back to your checkpoint instead
      if (player.vel.y < -20 && inTemple(player.pos)) {
        const h = W.raycast(player.pos, _down, 8, { meshes: false });
        if (h && h.solid?.kind !== 'acid' && player.vel.y ** 2 + 2 * 24 * h.t > 29 ** 2) game.fallOutOfWorld();
      }
    },
  });
  W.add({
    update(dt, player) {
      const p = game.checkpoint?.pos;
      if (!p) return;
      const s = stageAt(p);
      const lvl = s >= 6 ? 0 : s === 5 ? 4 : s === 4 ? 3 : s === 3 ? 2 : 0;
      if (lvl > reached) reached = lvl;
    },
  });

  // ================================================================ the awakening
  // braziers by storey, the seams, the frieze's gold, the obelisk's grooves, the darkness lifting
  // shafts of sunlight let in through slits in the roof as the temple wakes
  const shafts = [
    { at: 1, s: new LightShaft(W, { top: P(-11, 29.9, 6), bottom: P(-11, L0 + 0.05, 6), r: 1.1, intensity: 0.17 }) },
    { at: 2, s: new LightShaft(W, { top: P(12, CEIL - 0.1, 21), bottom: P(12, L3 + 0.05, 21), r: 1.3, intensity: 0.2 }) },
    { at: 3, s: new LightShaft(W, { top: P(-11, 29.9, 25), bottom: P(-11, L1 + 0.05, 25), r: 0.9, intensity: 0.16 }) },
  ];
  for (const sh of shafts) {
    sh.s.k = 0;
    sh.s.mat.uniforms.uI.value = 0;
  }
  // incense rising from the offerings
  const incense = [[OX, 1.6, 15.75], [-16.2, 5.4, 25], [-15.9, 10.6, 19.6], [16.1, 20.2, 13], [16.2, 29.8, 12], [4, 40.6, 2.4]].map((a) => F.V(...a));
  W.add({
    update(dt, player) {
      for (const p of incense) {
        if (Math.random() > dt * 3 || p.distanceToSquared(player.pos) > 28 * 28) continue;
        W.fx.puff(p, rnd(-0.08, 0.08), rnd(0.35, 0.6), rnd(-0.08, 0.08), _smoke, 0.12, rnd(3, 5), 0.16, 4);
      }
    },
  });
  let wakeLevel = 0;
  const wake = (n, instant = false) => {
    if (n <= wakeLevel) return;
    wakeLevel = n;
    for (const sh of shafts) if (n >= sh.at) sh.s.k = 1;
    for (let i = 0; i <= n + 1 && i < braziers.length; i++) braziers[i].forEach((b) => b.ignite(instant));
    const A = level.atmospheres.solarTemple;
    A.hemiIntensity = TEMPLE_DARK.hemiIntensity + n * 0.07;
    A.fogFar = TEMPLE_DARK.fogFar + n * 18;
    A.fog = new THREE.Color(0x0b0704).lerp(new THREE.Color(0x4a3018), n / 6).getHex();
    A.exposure = TEMPLE_DARK.exposure + n * 0.03;
    if (game.atmo?.name === 'solarTemple') game.setAtmosphere('solarTemple', instant);
    if (!instant) {
      audio.sample('energy_surge_stone', { gain: 0.9 }) || audio.sample('energy_crackle', { gain: 0.6, rate: 0.7 });
      audio.sample('sun_hum', { gain: 0.5, rate: 0.6 });
      surge = 1;
    }
  };
  // (the chant's track fetched as you come near the temple, so it's ready at the door)
  let musicWarm = false;
  W.add({
    update(dt, player) {
      if (musicWarm || player.pos.distanceTo(F.V(0, 0, 0, _v)) > 90) return;
      musicWarm = true;
      audio.musicFile?.('music_temple');
    },
  });
  // the obelisk's energy stirring: its grooves pulse brighter with every awakening, a deep hum near it
  const hum = audio.createLoop('reactor_hum', { gain: 0, rate: 0.5 });
  let surge = 0, clock = 0, envOwned = false;
  const ENV0 = game.scene.environmentIntensity; // (the world's usual ambient, put back as you leave)
  const reliefMat = M.relief, goldMat = M.gold;
  W.add({
    update(dt, player) {
      clock += dt;
      CLOTH_CLOCK.value = clock;
      surge = Math.max(0, surge - dt * 0.6);
      const k = wakeLevel / 5;
      const pulse = 0.5 + 0.5 * Math.sin(clock * (1.2 + k * 2.5));
      glowEnergy.emissiveIntensity = collapsed ? 0.05 : 0.1 + k * 0.5 + pulse * (0.05 + k * 0.25) + surge * 1.5;
      if (!collapsed && inTemple(player.pos)) placePulses(dt, Math.min(1, k + surge * 0.5));
      M.edge.color.setRGB(1, 0.7, 0.3).multiplyScalar(0.45 + k * 0.6);
      seamMat.color.setRGB(1, 0.55, 0.15).multiplyScalar(0.05 + k * 0.9 + pulse * 0.12 * k + surge * 0.8);
      reliefMat.emissiveIntensity = 0.04 + k * 0.7 + surge * 0.8;
      goldMat.emissiveIntensity = 0.3 + k * 0.5;
      flameMat.opacity = 0.75 + 0.25 * Math.sin(clock * 13) * Math.sin(clock * 5.3);
      brazierFlicker(clock);
      const lp = F.local(player.pos, _v);
      const inside = inTemple(player.pos);
      // the sky's ambient light (the scene's environment map) doesn't reach in here: dark until it wakes
      const sc = game.scene;
      if (inside || envOwned) {
        const want = inside ? 0.05 + k * 0.17 : ENV0;
        sc.environmentIntensity += (want - sc.environmentIntensity) * Math.min(1, dt * 1.5);
        envOwned = inside || Math.abs(sc.environmentIntensity - ENV0) > 0.005;
        if (!envOwned) sc.environmentIntensity = ENV0;
      }
      const d = Math.hypot(lp.x - OX, lp.z - OZ) + Math.max(0, Math.abs(lp.y - 28) - 18);
      hum.setGain(inside && !collapsed ? (0.08 + k * 0.25) * Math.max(0, 1 - d / 30) + surge * 0.3 : 0);
    },
  });

  // ================================================================ the beam-locks
  const locks = {
    t1: { id: 'solar_t1', recv: rt1, wake: 1, on: (q) => gateT1.open(q), say: 'The beam-lock opens. Braziers kindle beyond the gate — and in the dark, something <b>enormous</b> hangs.' },
    rope: { id: 'solar_t2', wake: 0, on: (q) => (rope2.burned || rope2.burn(true), cwLift.start(q)), say: 'The counterweight drops; the lift begins to ride.' },
    t3: { id: 'solar_t3', recv: rt2, prisms: [pRot2], set: [4], wake: 2, on: (q) => bridge2.activate(null, q), say: 'The drawbridge swings down. Light runs up the glyph seams.' },
    t4: { id: 'solar_t4', recv: rt3, wake: 3, on: (q) => hl3.forEach((p) => p.set(true, q)), say: 'The obelisk <b>stirs</b>: light pulses down its grooves, and hard light reaches out to its collar.' },
    t5: { id: 'solar_t5', recv: rt4, prisms: [pA], set: [2], wake: 4, on: (q) => stairs4.forEach((s) => s.activate(null, q)), say: 'Stone grinds: blocks slide out of the back wall, a stair toward the top.' },
  };
  let restoring = false;
  for (const L of Object.values(locks)) {
    const fire = (instant) => {
      if (L.done) return;
      L.done = true;
      L.on(instant);
      wake(L.wake, instant);
      (L.prisms || []).forEach((p) => (p.rotatable = false));
      mark(L.id);
      if (!instant && L.say) game.hud.message(L.say, 5);
      if (!instant) rouseNear(L.recv ? L.recv.pos : F.V(-8, 10, 26), 18);
    };
    L.fire = fire;
    if (L.recv) L.recv.onOn = () => fire(restoring);
  }
  // the respawn: hard light that a timer drives goes; latched things stay
  onRespawn(() => {
    if (locks.t4.done) hl3.forEach((p) => p.set(true, true));
  });

  // ================================================================ THE COLLAPSE
  // Each joint that cracks lurches the obelisk; the last tears it free. It falls through the temple (dust,
  // sand jets, debris, the lower platforms shattering) and the blast throws you up out of the oculus,
  // through the sky, onto the roof.
  const _fv = new THREE.Vector3();
  const FV = (x, y, z) => F.V(x, y, z, _fv); // (a scratch point: puff/drop/jet copy it at once)
  const dust = new DustClouds(W, 180);
  const debris = new Debris(W, 70, (x, z) => {
    const l = F.local(_w.set(x, 0, z), _w);
    return T.y + (l.z > 10 ? SAND : L0);
  });
  let jointsBroken = 0, collapsed = false, falling = null;
  const lurch = { v: 0, a: 0, tilt: new THREE.Vector2() };
  const rumble = audio.createLoop('temple_rumble', { gain: 0 });
  let rumbleGain = 0;
  function onJoint(i, instant) {
    jointsBroken++;
    mark('solar_' + beamDefs[i].id);
    const b = beamDefs[i];
    if (instant) {
      lurch.tilt.x += b.open[0] * 0.006;
      return;
    }
    audio.sample('obelisk_crack', { gain: 1.2, vary: 0.05 }) || audio.sample('boss_slam', { gain: 1, rate: 0.6 });
    audio.sample('titan_groan_big', { gain: 0.6, rate: 0.7 });
    game.player.shake = Math.max(game.player.shake || 0, 0.7);
    lurch.v += 0.06;
    lurch.tilt.x += (b.name === 'south' ? 1 : b.name === 'north' ? -1 : 0) * 0.008;
    lurch.tilt.y += (b.name === 'back' ? 1 : b.name === 'front' ? -1 : 0) * 0.008;
    rumbleGain = Math.max(rumbleGain, 0.25 + jointsBroken * 0.12);
    // dust from the ceiling and the wall clamp
    const c = F.V(...b.core);
    for (let k = 0; k < 10; k++) dust.puff(c, _v.set(rnd(-1.5, 1.5), rnd(-0.5, 1), rnd(-1.5, 1.5)), rnd(1, 2), rnd(2, 3.5), 0xb08a5a, 3);
    for (let k = 0; k < 8; k++) {
      F.V(rnd(-4, 16), CEIL - 0.3, rnd(3, 28), _v);
      dust.puff(_v, _w.set(0, -1.5, 0), rnd(0.8, 1.6), 2.5, 0xa88458, 3, { grav: 1 });
      if (k < 4) debris.drop(_v, _w.set(rnd(-1, 1), -2, rnd(-1, 1)), rnd(0.3, 0.6));
    }
    const left = 4 - jointsBroken;
    rouseNear(c, 20);
    if (left > 0) game.hud.message(['', 'The last joint groans. <b>One more.</b>', 'Two joints left. The whole temple shudders.', 'A joint cracks — the obelisk <b>lurches</b>. Three to go.'][left], 4);
    else collapse();
  }
  // the roof's capstone (the plug in the oculus): blown away in the collapse
  const capstone = new THREE.Group();
  {
    const g = new THREE.Mesh(new THREE.BoxGeometry(8, 2, 8), M.capital);
    const rim = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.3, 8.2), M.gold);
    rim.position.y = 1.05;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(4.2, 3.2, 4).rotateY(Math.PI / 4), M.sand);
    cone.position.y = 2.6;
    capstone.add(g, rim, cone);
    capstone.position.copy(F.V(OX, CEIL + 1, OZ));
    capstone.quaternion.copy(F.Q);
    W.scene.add(capstone);
  }
  const capSolid = Bd.solid(2, CEIL, 11.75, 10, 50, 19.75);
  // the light through the oculus once the cap is gone, and the plume of dust out of it
  const oculusShaft = new LightShaft(W, { top: P(OX, CEIL + 1.9, OZ), bottom: P(OX, SAND + 0.2, OZ), r: 3.2, intensity: 0.4 });
  oculusShaft.k = 0;
  oculusShaft.mat.uniforms.uI.value = 0;
  const plumeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.72, 0.56, 0.36), transparent: true, opacity: 0, depthWrite: false });
  const plume = new THREE.Mesh(new THREE.CylinderGeometry(9, 3.6, 120, 16, 1, true).translate(0, 60, 0), plumeMat);
  plume.position.copy(F.V(OX, 50, OZ));
  plume.userData.noCull = true;
  plume.visible = false;
  W.scene.add(plume);
  // the rubble that chokes the vestibule afterwards (no way back in)
  const rubble = new THREE.Group();
  for (let k = 0; k < 14; k++) {
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(rnd(0.6, 1.3), 0), M.sandDark);
    r.position.set(rnd(-3.6, 3.6), rnd(0.4, 3.6), rnd(2, 6.6));
    r.rotation.set(rnd(0, 6), rnd(0, 6), 0);
    rubble.add(r);
  }
  rubble.position.set(T.x, T.y, T.z);
  rubble.quaternion.copy(F.Q);
  rubble.visible = false;
  W.scene.add(rubble);
  const rubbleSolid = Bd.solid(-4, 0, 1.6, 4, 6, 7);
  rubbleSolid.enabled = false;
  // the roof landing and where the crossing starts
  const ROOF = 50;
  const landing = [13.5, ROOF, 6];
  function setRuin() {
    collapsed = true;
    obRoot.visible = false;
    for (const s of obSolids) s.enabled = false;
    ring.drums.forEach((d) => (d.s.enabled = false));
    ring.group.visible = false;
    gong.group.visible = false;
    W.removeHittable(gong.group);
    joints.forEach((j) => (j.group.visible = false));
    capstone.visible = false;
    capSolid.enabled = false;
    rubble.visible = true;
    rubbleSolid.enabled = true;
    gateT1.open(true);
    oculusShaft.k = 1;
    plume.visible = true;
    hl3.forEach((p) => p.set(false, true));
    ruinObelisk.visible = true;
  }
  // the fallen obelisk: sunk in the pit, leaning, its broken capital up near L2
  const ruinObelisk = new THREE.Group();
  {
    const m = new THREE.Mesh(obMeshes.obelisk.geometry, M.obelisk);
    const g = new THREE.Mesh(obMeshes.gold.geometry, M.gold);
    const c = new THREE.Mesh(obMeshes.capital.geometry, M.capital);
    ruinObelisk.add(m, g, c);
    ruinObelisk.position.set(OX, -24, OZ);
    ruinObelisk.rotation.set(0.12, 0.3, -0.16);
    obRoot.parent === W.scene && 0;
    const holder = new THREE.Group();
    holder.position.set(T.x, T.y, T.z);
    holder.quaternion.copy(F.Q);
    holder.add(ruinObelisk);
    W.scene.add(holder);
    ruinObelisk.visible = false;
  }
  function collapse() {
    if (collapsed || falling) return;
    mark('solar_collapse');
    // (a reload from here on puts you on the roof)
    game.setCheckpoint(V3(P(...landing)), F.yaw(-Math.PI / 2), null);
    falling = { t: 0, y: 0, v: 0, impact: false, blast: false, launched: false };
    audio.sample('obelisk_fall', { gain: 1.4, vary: 0 }) || audio.sample('boss_slam', { gain: 1.2, rate: 0.5 });
    audio.sample('energy_surge_stone', { gain: 1.2, rate: 0.8 });
    audio.slam?.(0.25, 0.6, 2.5);
    rumbleGain = 1;
    game.player.invuln = Math.max(game.player.invuln, 10);
    game.hud.message('The last joint <b>shatters</b> — the obelisk tears free!', 4);
    for (const m of mummies) if (!m.dead) m.rouse();
  }
  // the scripted throw: from wherever you are, up through the oculus into the sky and down onto the roof
  const _lk = new THREE.Vector3();
  let outside = false;
  function launchPlayer() {
    const p = game.player;
    const start = p.pos.clone();
    const L = (x, y, z) => F.V(x, y, z);
    const up = start.clone().setY(start.y + 2.5);
    const pts = [start, up, L(OX, CEIL - 2.5, OZ), L(OX, CEIL + 6, OZ), L(OX + 1.5, 72, OZ - 2), L(11, 70, 9), L(landing[0], 58, landing[2] + 0.5), L(...landing).setY(T.y + ROOF + 0.02)];
    audio.sample('warp_whoosh', { gain: 0.8, rate: 0.6 });
    new Launch(game, pts, {
      time: 5.2,
      ease: (u) => (u < 0.55 ? 0.62 * (1 - Math.pow(1 - u / 0.55, 2.2)) : 0.62 + 0.38 * Math.pow((u - 0.55) / 0.45, 1.3)),
      shake: (u) => (u < 0.35 ? 0.9 - u : 0.15),
      // the view: down the shaft at the falling obelisk as you rise, then out over the roof to land
      look: (u) => {
        if (u > 0.2 && !outside) {
          outside = true;
          game.setAtmosphere('solar');
          game.setMusic('music_solar');
        }
        if (u < 0.08) return null;
        if (u < 0.5) return [F.V(OX, Math.max(SAND, TIP - (falling?.y || 0) + 8), OZ, _lk), Math.min(1, (u - 0.08) * 6) * 0.8];
        return [F.V(landing[0] + 12, ROOF - 4, landing[2] + 6, _lk), Math.min(1, (u - 0.5) * 3) * 0.6]; // (toward the crossing down the south flank)
      },
      onDone: () => {
        p.grounded = true;
        audio.sample('land_hard', { gain: 0.9 }) || audio.land(2);
        game.world.fx.landDust(p.pos, 2);
        p.landKick = 0.3;
        game.setAmbient('amb_solar');
        game.hud.message('Out into the sun. Behind you the temple <b>breathes dust</b> into the sky. The way on: down the <b>south flank</b>.', 7);
      },
    });
  }
  // the fall itself
  W.add({
    update(dt, player) {
      // the rumble, the lurch spring
      rumbleGain = Math.max(collapsed && !falling ? 0 : jointsBroken ? 0.12 + jointsBroken * 0.06 : 0, rumbleGain - dt * 0.3);
      rumble.setGain(inTemple(player.pos) || falling ? rumbleGain : rumbleGain * 0.3);
      lurch.v += (-lurch.a * 40 - lurch.v * 4) * dt;
      lurch.a += lurch.v * dt;
      if (!falling) {
        obelisk.rotation.set(lurch.tilt.y + lurch.a * 0.3, 0, -lurch.tilt.x + lurch.a * 0.2);
        obelisk.position.y = -lurch.a * 2;
        if (jointsBroken && Math.random() < dt * jointsBroken * 2) {
          F.V(rnd(-5, 17), CEIL - 0.4, rnd(2, 29), _v);
          dust.puff(_v, _w.set(0, -2, 0), rnd(0.4, 0.9), 2, 0xa88458, 2.5, { grav: 2 });
        }
        return;
      }
      const f = falling;
      f.t += dt;
      // a beat as it lets go, then it drops (slowed, for the drama)
      if (f.t > 0.5 && !f.impact) {
        f.v += 15 * dt;
        f.y += f.v * dt;
        obelisk.position.y = -f.y;
        obelisk.rotation.z += dt * 0.04;
        // the great ring and its gong go down with it
        f.ringY ??= ring.group.position.y;
        f.gongY ??= gong.group.position.y;
        ring.group.position.y = f.ringY - f.y;
        gong.group.position.y = f.gongY - f.y;
        if (f.y > 0.5) ring.drums.forEach((d) => (d.s.enabled = false));
        if (!f.launched && f.t > 0.75) {
          f.launched = true;
          launchPlayer();
        }
        // the blast up the shaft: the capstone goes, light floods in
        if (!f.blast && f.t > 0.6) {
          f.blast = true;
          capSolid.enabled = false;
          f.cap = { v: new THREE.Vector3(...F.D(-9, 24, -7)), s: new THREE.Vector3(rnd(-2, 2), rnd(-1, 1), rnd(-2, 2)) }; // (flung away to the north-east, clear of your way out)
          oculusShaft.k = 1;
          plume.visible = true;
          audio.sample('boss_slam', { gain: 1, rate: 0.5 });
          for (let k = 0; k < 24; k++) dust.puff(FV(OX + rnd(-3, 3), CEIL, OZ + rnd(-3, 3)), _v.set(rnd(-3, 3), rnd(12, 24), rnd(-3, 3)), rnd(1.5, 3), rnd(2, 4), 0xc0a070, 3.5, { drag: 0.8 });
          for (let k = 0; k < 6; k++) dust.jet(FV(OX + rnd(-3, 3), CEIL + 1, OZ + rnd(-3, 3)), [rnd(-0.25, 0.25), 1, rnd(-0.25, 0.25)], 5, rnd(24, 36), 1.2, 0xd0b080);
        }
        // platforms it passes shatter: dust bursts off the walls at its height
        if (Math.random() < dt * 30) {
          const y = TIP - f.y + rnd(0, 30);
          dust.puff(FV(OX + rnd(-6, 6), y, OZ + rnd(-6, 6)), _v.set(rnd(-4, 4), rnd(-1, 3), rnd(-4, 4)), rnd(1.5, 3), rnd(2.5, 4), 0xb08a5a, 3);
          if (Math.random() < 0.5) debris.drop(FV(OX + rnd(-7, 7), y, OZ + rnd(-7, 7)), _v.set(rnd(-3, 3), rnd(0, 3), rnd(-3, 3)), rnd(0.4, 1.0));
        }
        // the tip strikes the island/pit
        if (TIP - f.y <= SAND + 1) {
          f.impact = true;
          f.it = f.t;
          audio.sample('boss_slam', { gain: 1.4, rate: 0.4 });
          audio.sample('floor_collapse', { gain: 1.2, rate: 0.6 });
          audio.sample('sand_sink', { gain: 1, rate: 0.5 });
          player.shake = Math.max(player.shake, 1.2);
          for (let k = 0; k < 14; k++) dust.jet(FV(OX + rnd(-12, 12), SAND + 0.3, OZ + rnd(-8, 8)), [rnd(-0.3, 0.3), 1, rnd(-0.3, 0.3)], 4, rnd(16, 30), 1.6);
          for (let k = 0; k < 40; k++) dust.puff(FV(OX + rnd(-14, 14), SAND + rnd(0, 6), OZ + rnd(-10, 10)), _v.set(rnd(-6, 6), rnd(2, 9), rnd(-6, 6)), rnd(2, 4), rnd(3, 6), 0xb89462, 4);
          for (let k = 0; k < 24; k++) debris.drop(FV(OX + rnd(-6, 6), rnd(0, 20), OZ + rnd(-6, 6)), _v.set(rnd(-8, 8), rnd(4, 14), rnd(-8, 8)), rnd(0.4, 1.2));
          hl3.forEach((p) => p.set(false, true));
          ring.drums.forEach((d) => (d.s.enabled = false));
        }
      } else if (f.impact) {
        // it sinks into the quicksand, leaning, while the dust rolls up the shaft
        const u = Math.min(1, (f.t - f.it) / 3.5);
        obelisk.position.y = -f.y - u * 6;
        obelisk.rotation.set(0.1 * u, 0.2 * u, obelisk.rotation.z + dt * 0.03 * (1 - u));
        if (Math.random() < dt * 20 * (1 - u)) dust.puff(FV(OX + rnd(-12, 12), SAND + rnd(0, 4), OZ + rnd(-9, 9)), _v.set(rnd(-2, 2), rnd(3, 8), rnd(-2, 2)), rnd(2, 3.5), rnd(3, 5), 0xb89462, 3.5);
        if (u >= 1 && !player.mount) {
          falling = null;
          setRuin();
        }
      }
      // the capstone, flung up and away
      if (f.cap) {
        f.cap.v.y -= 22 * dt;
        capstone.position.addScaledVector(f.cap.v, dt);
        capstone.rotation.x += f.cap.s.x * dt;
        capstone.rotation.z += f.cap.s.z * dt;
        if (capstone.position.y < T.y - 30) {
          capstone.visible = false;
          f.cap = null;
        }
      }
    },
  });
  // the plume after: dust pouring up out of the oculus, thinning
  W.add({
    update(dt, player) {
      if (!plume.visible) return;
      plumeMat.opacity = Math.max(0.05, Math.min(0.32, plumeMat.opacity + dt * (falling ? 0.2 : -0.004)));
      plume.rotation.y += dt * 0.05;
      if (player.pos.distanceTo(plume.position) < 90 && Math.random() < dt * (falling ? 12 : 3)) dust.puff(FV(OX + rnd(-3, 3), CEIL + 1, OZ + rnd(-3, 3)), _v.set(rnd(-1, 1), rnd(4, 9), rnd(-1, 1)), rnd(2, 3), rnd(4, 7), 0xc8a878, 4, { drag: 0.3 });
    },
  });
  // light: the dust clouds take the temple's light
  W.add({
    update() {
      const k = inTemple(game.player.pos) ? 0.25 + (wakeLevel / 5) * 0.45 : 1;
      M.dust.uniforms.uLight.value.setRGB(k, k * 0.92, k * 0.82);
    },
  });

  // ================================================================ THE HIGH CROSSING (down the south flank)
  // From the roof, columns and stones step down the temple's sunlit south flank, over a long drop: a sun
  // lance, a timed hard-light bridge, cracked stones (the last only LOOKS solid), red/yellow chroma stones,
  // to the back terrace and the Panel Court passage.
  const crossing = buildCrossing();
  function buildCrossing() {
    const col = (x1, z1, x2, z2, top, base = -60) => {
      blk('sandDark', x1 + 0.35, base, z1 + 0.35, x2 - 0.35, top - 0.7, z2 - 0.35);
      ledge(x1, z1, x2, z2, top);
      deco('gold', x1 + 0.3, top - 1.2, z1 + 0.3, x2 - 0.3, top - 1.0, z2 - 0.3);
    };
    // the roof terrace: a low parapet round the south half, the oculus rimmed
    blk('sand', 17.5, ROOF, 1.5, 18, ROOF + 0.9, 3);
    blk('sand', 17.5, ROOF, 6.5, 18, ROOF + 0.9, 30);
    blk('sand', -6, ROOF, 0, 18, ROOF + 0.9, 0.5);
    blk('sand', -6, ROOF, 30.5, 18, ROOF + 0.9, 31);
    for (const [x1, z1, x2, z2] of [[1.5, 11.25, 10.5, 11.75], [1.5, 19.75, 10.5, 20.25], [1.5, 11.75, 2, 19.75], [10, 11.75, 10.5, 19.75]]) deco('gold', x1, ROOF, z1, x2, ROOF + 0.35, z2);
    const ckRoof = ck(landing[0], ROOF, landing[2], -Math.PI / 2, 5, 3, 5);
    void ckRoof;
    // UP HIGH: ledges built out of the tower's south face on carved brackets (no pillars under them, so the
    // lower pass can run beneath), one column out in the void, a sun lance, the timed hard-light bridge,
    // cracked ledges and a slab hung on chains that only looks solid
    const wallLedge = (z1, z2, top, x2 = 21) => ledge(18, z1, x2, z2, top, { wall: '-x', banner: true });
    wallLedge(2.8, 5.8, 47.6);
    col(23.4, 7.6, 26.4, 10.6, 46.4);
    // the sun lance: its housing hangs from an arm off the roof (no mast in the way), burning down past the gap
    {
      const [a, b] = F.box(21.4, 40, 11.2, 25.6, 49, 12.6);
      K.housing(a[0], a[2], b[0], b[2], b[1]);
      K.lance({ min: a, max: b, period: 3.4, on: 1.2, warn: 0.7 });
      deco('bronze', 17.5, ROOF + 0.3, 11.6, 23.6, ROOF + 0.7, 12.2);
      deco('bronze', 23.3, 49.8, 11.6, 23.9, ROOF + 0.7, 12.2);
    }
    wallLedge(13, 16, 45.2);
    const bridgeC = new PhasePlatform(W, { ...(() => { const [a, b] = F.box(18.8, 44.8, 16, 20.6, 45.2, 24); return { min: a, max: b }; })(), on: false, zone, color: YELLOW });
    // its sun-disc hangs from an arm off the roof, over the bridge's far end
    deco('bronze', 17.5, ROOF + 0.4, 19.2, 21.4, ROOF + 0.8, 19.8);
    deco('bronze', 21.0, 48.6, 19.3, 21.3, ROOF + 0.4, 19.7);
    const actC = new LightReceiver(W, { pos: P(21.15, 47.9, 19.45), face: F.face('-z'), color: YELLOW, size: 1.2, look: 'disc', mode: 'timed', time: 5, fill: 0.35, links: [bridgeC] });
    K.lights.push(actC);
    wallLedge(24, 27.4, 45.2);
    ck(19.6, 45.2, 25.7, Math.PI, 3, 3, 3);
    crumble(18, 28.2, 20.6, 30.6, 44.0, { delay: 0.6 });
    crumble(22.6, 30.6, 25, 33, 42.8, { delay: 0.3, disguise: true });
    for (const [x, z] of [[22.9, 31.8], [24.7, 31.8]]) Bd.add('chain', beamGeo([x, 42.8, z], [x, ROOF + 0.6, z], 0.06, 0.06, 5));
    deco('bronze', 17.5, ROOF + 0.3, 31.5, 25.2, ROOF + 0.7, 32.1);
    // THE DESCENT: out on columns along the outer edge, the chroma stones (red, then yellow: switch in the
    // air), then back along under the high ledges, down to the back terrace
    col(23.6, 27, 26.6, 30, 38.4);
    for (const [z1, z2, c, top] of [[22.8, 25.4, RED, 37.6], [18.6, 21.2, YELLOW, 36.8]]) {
      const [a, b] = F.box(23.6, top - 0.4, z1, 26.2, top, z2);
      B.chromaPlatform({ min: a, max: b, color: c, zone });
    }
    col(23.6, 13.2, 26.6, 16.2, 33.6);
    col(19.2, 12.6, 22.2, 15.6, 29.8);
    col(19.2, 18.6, 22.2, 21.6, 26.2);
    col(19.2, 24.4, 22.2, 27.4, 22.6);
    ck(20.7, 22.6, 25.9, Math.PI, 3, 3, 3);
    col(19.2, 29.6, 22.4, 32.6, 19.4);
    // the back terrace to the passage
    glowStrip(0, 17.92, 31, 18, 18.02, 31.08);
    for (const x of [1, 6, 16.5]) wallBanner(x, 30.5, 31, [0, 1], 1.4, 5);
    // falling off the crossing fades you back to its last checkpoint (it's a long way down)
    trigger(17.6, -60, -4, 30, 15, 38, () => !game.voidT && game.state === 'playing' && game.player.vel.y < -8 && !game.player.mount && game.fallOutOfWorld(), { once: false });
    for (const [a, b] of [[P(19.2, 44, 3.5), P(25, 44, 3.5)]]) void a, void b;
    new Drone(W, { pos: P(24, 40, 18), color: YELLOW, range: 24 });
    new Drone(W, { pos: P(23, 30, 28), color: YELLOW, shields: [RED], range: 22 });
    hintL(10, ROOF, 2, 17.5, ROOF + 3, 30, 'Down the temple\'s <b>south flank</b> to the back terrace and the passage west.', 6);
    hintL(18, 45.2, 13, 21, 48, 16, 'A <b style="color:#ffd23a">sun-disc</b> on the tower wall wakes a <b>hard-light bridge</b> — for a few seconds.', 5);
    hintL(23.6, 38.4, 27, 26.6, 41, 30, 'Stones that are solid only while your blaster is <b>their color</b> (<b>1</b>/<b>2</b>).', 6);
    const [pa1, pb1] = F.box(-18, 16, 31, 18, 24, 34);
    area(pa1, pb1, { music: 'music_solar', ambient: 'amb_solar', atmosphere: 'solar' });
    return { bridgeC, actC };
  }

  // ================================================================ starts
  devStart('temple0', P(0, L0, 2.8), F.yaw(Math.PI), [RED, YELLOW], 'The Sun Temple: the vestibule');
  devStart('temple1', P(-12.6, L1, 28.2), F.yaw(0), [RED, YELLOW], 'The Sun Temple: the north gallery');
  devStart('solar13', P(15, L2, 15.4), F.yaw(Math.PI / 2), [RED, YELLOW], 'The Sun Temple climb (halfway)');
  devStart('temple3', P(15.5, L3, 6), F.yaw(Math.PI / 2), [RED, YELLOW], 'The Sun Temple: the pilgrims\' balcony');
  devStart('solar14', P(-3.7, L4, 11), F.yaw(-Math.PI / 2), [RED, YELLOW], 'The Sun Temple apex (the support joints)');
  devStart('solar15', P(...landing), F.yaw(-Math.PI / 2), [RED, YELLOW], 'The temple roof and the high crossing');

  // ================================================================ persistence
  // which stage a point is in: 1 the vestibule and L0, 2 stage 1/L1, 3 stage 2/L2, 4 stage 3/L3, 5 stage
  // 4/L4 and the apex, 6 past the temple (the roof, the crossing); null: not the temple at all
  function inTemple(p) {
    const l = F.local(p, _w);
    return l.x > -17.2 && l.x < 17.2 && l.z > 1.2 && l.z < 30.2 && l.y > -12 && l.y < CEIL;
  }
  function stageAt(p) {
    const l = F.local(p, _w);
    if (l.z > -3 && l.z < 0 && l.x > -4 && l.x < 4 && l.y > -0.5 && l.y < 5) return 1; // the stair's head at the door
    if (l.x > -18.5 && l.x < 30 && l.z > -1 && l.z < 34.5 && l.y > -12 && l.y < 60) {
      if (l.y >= CEIL || l.x >= 17.5 || l.z >= 30.5) return 6; // the roof, the flank, the back terrace
      if (l.y < 5 && !(l.x < -11 && l.z > 14)) return 1;
      if (l.y < 15) return 2;
      if (l.y < 25) return 3;
      if (l.y < 35) return 4;
      return 5;
    }
    return null;
  }
  function applySaved(stage) {
    const past = (id, s) => ev(id) || stage >= s;
    restoring = true;
    const latch = (L, s) => {
      if (L.done || !past(L.id, s)) return;
      (L.prisms || []).forEach((p, j) => p.setIndex(L.set[j]));
      if (L.recv) {
        L.recv.keep = true;
        L.recv.setOn(true, null, true);
      } else L.fire(true);
    };
    latch(locks.t1, 2);
    latch(locks.rope, 3);
    latch(locks.t3, 3);
    if (stage >= 3 || ev('solar_t4')) pressPlate(true);
    latch(locks.t4, 4);
    latch(locks.t5, 5);
    restoring = false;
    beamDefs.forEach((b, i) => ev('solar_' + b.id) && !joints[i].broken && joints[i].crack(true));
    if (ev('solar_collapse') || ev('solar_apex') || stage >= 6) {
      joints.forEach((j) => j.broken || j.crack(true));
      wake(5, true);
      setRuin();
      // (a checkpoint left inside the ruin: out onto the roof)
      if (game.checkpoint && inTemple(game.checkpoint.pos)) {
        game.checkpoint = { pos: V3(P(...landing)), yaw: F.yaw(-Math.PI / 2), ref: null };
        if (inTemple(game.player.pos)) game.player.spawn(game.checkpoint.pos, game.checkpoint.yaw);
      }
    }
    // braziers lit by the wakes that came before
    reached = Math.max(reached, stage >= 6 ? 0 : stage === 5 ? 4 : stage === 4 ? 3 : stage === 3 ? 2 : 0);
  }

  // ================================================================ the HUD objective
  const Y = '<b style="color:#ffd23a">', E = '</b>';
  function objective(p) {
    const s = stageAt(p);
    if (s === null) return null;
    if (falling) return 'Hold on!';
    if (s === 6) {
      const l = F.local(p, _w);
      return l.z > 30.5 && l.y < 22 ? 'West, through the <b>passage</b> to the Panel Court.' : 'Down the <b>south flank</b>: columns, a sun lance, the hard-light bridge, cracked stones, the chroma stones — to the <b>back terrace</b>.';
    }
    if (collapsed) return 'Out — the temple is falling.';
    const l = F.local(p, _w);
    if (l.y < SAND + 2.5 && l.z > 10) return 'Out of the quicksand: mash <b>JUMP</b>. The <b>stair</b> by the south wall; the <b>pilgrims\' lift</b> in the corner.';
    if (!rt1.on) return `Hold the ${Y}beam${E} on a <b>prism</b>: the light must find the receiver in the <b>glass case</b> beyond the wall.`;
    if (s === 1) return locks.rope.done ? 'Up the <b>north wall</b> to the gallery.' : 'Up the <b>north wall</b>: ledges, a cracked one, the shrine.';
    if (s === 2) {
      if (!locks.rope.done) return `Burn the <b>rope</b> that holds the counterweight up (hold the ${Y}beam${E} on it).`;
      if (l.y < L1 - 1) return 'Ride the <b>counterweight lift</b> up to the north gallery.';
      return rt2.on ? 'Across the <b>drawbridge</b> and along the back wall.' : 'Turn the <b>column prism</b> (shoot its base) to face the <b>tube</b> in the back wall, then hold the beam on it.';
    }
    if (s === 3) {
      if (l.z > 26 && l.x < 8 && !plateDown) return 'Over the rope bridge — mind the <b>censer</b> — and onto the <b>pressure plate</b>.';
      if (l.y < L2 - 1) return `Up the corner to the shrine; the ${Y}sun-disc${E} calls the steps to the south gallery.`;
      return rt3.on ? 'Up the <b>hard light</b> onto the obelisk\'s collar.' : 'Hold the beam on the <b>gliding prism</b> as it pauses at the <b>end of its rail</b>: the obelisk\'s socket.';
    }
    if (s === 4) {
      if (l.y < L3 - 1) return 'From the collar onto a <b>drum</b> of the great ring; ring the <b>gong</b> to turn it to the front wall\'s stones.';
      return rt4.on ? 'Up the <b>blocks</b> along the back wall — mind the censer.' : 'Turn the <b>balcony prism</b> to face the <b>hooded prism</b> behind the obelisk, then hold the beam on it.';
    }
    if (s === 5) {
      if (l.y < L4 - 1) return `Light the ${Y}sun-disc${E} on the front wall and climb the <b>north wall's blocks</b> before they slide back.`;
      return `Break the <b>support joints</b> (${jointsBroken}/4): find the angle down each stone throat and hold the ${Y}beam${E} on its crystal.`;
    }
    return null;
  }

  // the hall's dressing is all in: merge it
  Bd.finish(M);
  // seams in their own (waking) material
  {
    const geos = seamGeos.map(([x1, y1, z1, x2, y2, z2]) => new THREE.BoxGeometry(x2 - x1, y2 - y1, z2 - z1).translate((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2).toNonIndexed());
    const g = mergeG(geos);
    g.applyMatrix4(F.M);
    W.scene.add(new THREE.Mesh(g, seamMat));
  }

  return {
    objective, stageAt, applySaved, inTemple, F, T, locks, joints, ring, gong, mummies, rt1, rt2, rt3, rt4, pa, pb, pc, pRot2, pMove, pA, pB, act2, act4, cwLift, rope2, bridge2, steps2, stairs4, tier, pilgrimLift, crossing, hl2, hl3, gateT1,
    get collapsed() { return collapsed; },
    get falling() { return !!falling; },
    get jointsBroken() { return jointsBroken; },
    get wakeLevel() { return wakeLevel; },
    get apexLit() { return collapsed; },
    landing: P(...landing),
  };

  // a quarter-turn ring angle: the world angle of a temple-space angle (about +y, from +x toward +z)
  function worldAngleOf(a) {
    const d = F.D(Math.cos(a), 0, Math.sin(a));
    return Math.atan2(d[2], d[0]);
  }
}

// merge non-indexed geometries with the same attributes (position/normal/uv[/sway])
function mergeG(list) {
  const names = Object.keys(list[0].attributes);
  const out = new THREE.BufferGeometry();
  const total = list.reduce((n, g) => n + g.attributes.position.count, 0);
  for (const name of names) {
    const size = list[0].attributes[name].itemSize;
    const arr = new Float32Array(total * size);
    let o = 0;
    for (const g of list) {
      const a = g.attributes[name];
      if (a) arr.set(a.array, o);
      o += g.attributes.position.count * size;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  out.computeBoundingSphere();
  return out;
}
