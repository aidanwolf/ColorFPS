// AZURE — THE COLD DEEP. A drowned, frozen research station clinging to the walls of a vast crystal
// chasm east of the Hub (the Hub's east windows look straight down into it). The route spirals DOWN:
//   entry skybridge (y 4) → Rim Deck → the Shelf (ice ledges, a crane) → Pump Station (vent secret)
//   → frozen Machinery (freight lift, pipes) → Cryo Lab (y -25) → three-color Gauntlet → the Well
//   (ledges over lethal cryo-brine, then a shielded spike drop) → Vault antechamber (ricochet lock off
//   azure panels) → Core Sanctum (the BLUE core, y -56) → blue lock → the station lift:
//   THE FORCED ASCENT, a 68 m ride up a glass shaft through colored spike hatches, to the Hub's east
//   balcony port (x 25, y 12, z -136).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLORS, RED, YELLOW, GREEN, BLUE } from '../colors.js';
import { Barrier } from '../entities/barrier.js';
import { Drone } from '../entities/drone.js';
import { MovingPlatform, Checkpoint } from '../entities/misc.js';
import { Glass, TargetPanel, SlidingDoor, ShotShield } from '../entities/puzzle.js';
import { Elevator } from '../entities/elevator.js';
import { boxGeo, mat } from '../materials.js';
import { audio } from '../audio.js';

// tiny seeded RNG so the crystal fields and cliffs come out the same every load
function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildAzure(B) {
  const { W, game, level, CH, room, corridor, corridorX, tunnelX, plat, pedestal, secretRoom, trophy, shieldedShaft, hint, zoneTitle, area, light, barrierWallX, devStart, onRespawn } = B;
  const zone = 'blue';
  const rng = mulberry32(0xa2e5e);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // ------------------------------------------------------------------ mood
  const AZURE = {
    fog: 0x0a1c38, fogNear: 16, fogFar: 150,
    skyTop: [0.004, 0.008, 0.025], skyMid: [0.012, 0.035, 0.09], skyHorizon: [0.04, 0.12, 0.26], aurora: 0.05, stars: 0.6,
    hemiSky: 0x86b8ff, hemiGround: 0x0c1a34, hemiIntensity: 1.05,
    sunColor: 0x8fe8ff, sunIntensity: 0.55, sunDir: [-0.35, 1, -0.25],
    exposure: 0.95, bloom: 0.65,
  };
  level.atmospheres.azure = AZURE;
  // the lower station: the fog closes in and the sky light fades
  level.atmospheres.azureDeep = { ...AZURE, fog: 0x061430, fogNear: 8, fogFar: 95, hemiIntensity: 0.95, sunIntensity: 0.3, exposure: 0.95 };
  const MOOD = { music: 'music_blue', ambient: 'amb_abyss', atmosphere: 'azure' };
  const DEEP = { ...MOOD, atmosphere: 'azureDeep' };

  // ------------------------------------------------------------------ helpers
  // Crystals: elongated octahedra merged into three meshes (frosted ice, glowing crystal, and the
  // fog-piercing deep crystal of the abyss floor).
  const geos = { ice: [], glow: [], deep: [] };
  const keepOut = []; // route volumes crystals must not grow into
  const blocked = (x, y, z, m) => keepOut.some(([a, b]) => x > a[0] - m && x < b[0] + m && y > a[1] - m && y < b[1] + m && z > a[2] - m && z < b[2] + m);
  function shard(x, y, z, h, r, tx = 0, tz = 0, kind = 'ice') {
    // skip shards whose tip (or middle) would poke into the route
    const tip = V(0, h * 0.9, 0).applyAxisAngle(V(0, 0, 1), -tx).applyAxisAngle(V(1, 0, 0), tz).add(V(x, y, z));
    if ((blocked(tip.x, tip.y, tip.z, 0.8) || blocked((x + tip.x) / 2, (y + tip.y) / 2, (z + tip.z) / 2, 0.8))) return;
    const g = new THREE.OctahedronGeometry(1, 0);
    g.scale(r, h / 2, r);
    g.translate(0, h * 0.42, 0); // bury the lower tip a little
    g.rotateY(rng() * Math.PI);
    g.rotateZ(-tx);
    g.rotateX(tz);
    g.translate(x, y, z);
    geos[kind].push(g);
  }
  // a cluster of shards of height ~s growing from (x, y, z), tilted by tx (toward +x) / tz (toward +z)
  function cluster(x, y, z, s, kind = 'ice', tx = 0, tz = 0, n = 5) {
    if (blocked(x, y, z, s * 0.4)) return;
    shard(x, y, z, s, s * 0.17, tx, tz, kind);
    for (let i = 1; i < n; i++) {
      const a = rng() * Math.PI * 2, d = s * (0.1 + rng() * 0.2);
      const k = 0.3 + rng() * 0.45;
      shard(x + Math.cos(a) * d, y, z + Math.sin(a) * d, s * k, s * (0.07 + rng() * 0.06), tx + Math.cos(a) * (0.25 + rng() * 0.4), tz + Math.sin(a) * (0.25 + rng() * 0.4), kind);
    }
  }
  const icicles = (x1, z1, x2, z2, y, n) => {
    for (let i = 0; i < n; i++) shard(x1 + rng() * (x2 - x1), y + 0.1, z1 + rng() * (z2 - z1), 0.7 + rng() * 1.8, 0.08 + rng() * 0.1, 0, Math.PI);
  };
  // an ice ledge: a neon-edged slab on a craggy ice body with icicles under it
  function ledge(x1, z1, x2, z2, top, depth = 3) {
    plat(x1, z1, x2, z2, top, zone);
    const za = Math.min(z1, z2), zb = Math.max(z1, z2);
    W.deco(x1 + 0.25, top - 0.6 - depth, za + 0.25, x2 - 0.25, top - 0.6, zb - 0.25, 'rock', zone);
    W.deco(x1 + 0.8, top - 0.6 - depth * 1.7, za + 0.8, x2 - 0.8, top - 0.6 - depth, zb - 0.8, 'rock', zone);
    icicles(x1 + 0.9, za + 0.9, x2 - 0.9, zb - 0.9, top - 0.6 - depth * 1.7, 5);
    keepOut.push([[x1, top - 1, za], [x2, top + 3, zb]]);
  }
  // spikes covering a landing (shatter with the matching color, regrow after 3 s)
  const spikes = (x1, z1, x2, z2, top, color) =>
    new Barrier(W, { min: [x1, top, Math.min(z1, z2)], max: [x2, top + 0.6, Math.max(z1, z2)], color, kind: 'spike', regen: 3, zone });
  // a wall slab x1..x2 spanning z1..z2 with rectangular holes { z1, z2, y1, y2 } at different heights
  function wallHoles(x1, x2, z1, z2, yb, yt, holes, kind = 'metal') {
    let y = yb;
    for (const h of [...holes].sort((a, b) => a.y1 - b.y1)) {
      W.box(x1, y, z1, x2, h.y1, z2, kind, zone);
      W.box(x1, h.y1, z1, x2, h.y2, h.z1, kind, zone);
      W.box(x1, h.y1, h.z2, x2, h.y2, z2, kind, zone);
      y = h.y2;
    }
    W.box(x1, y, z1, x2, yt, z2, kind, zone);
  }
  // lethal cryo-brine: a dark, glowing pool with an acid hazard box
  const brineMat = new THREE.MeshStandardMaterial({ color: 0x0a3466, emissive: 0x0c5cb8, emissiveIntensity: 0.55, roughness: 0.08, metalness: 0.4 });
  function brine(x1, z1, x2, z2, y) {
    const m = new THREE.Mesh(boxGeo(x2 - x1, 0.5, Math.abs(z2 - z1)), brineMat);
    m.position.set((x1 + x2) / 2, y - 0.25, (z1 + z2) / 2);
    W.scene.add(m);
    W.addSolid(V(x1, y - 0.5, Math.min(z1, z2)), V(x2, y, Math.max(z1, z2)), { static: true, hazard: 'acid' });
  }

  // ------------------------------------------------------------------ the chasm
  // The cliffs are custom meshes (merged into one, with a glassy-ice material); solid adds a collider.
  const cliffGeos = [];
  function cliff(x1, y1, z1, x2, y2, z2, solid = false) {
    cliffGeos.push(new THREE.BoxGeometry(x2 - x1, y2 - y1, z2 - z1).translate((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2));
    if (solid) W.addSolid(V(x1, y1, z1), V(x2, y2, z2), { static: true, kind: 'rock' });
  }
  // a column of stacked ice blocks jutting 0..2.6 m out of a cliff face: side 'S' (face z -66),
  // 'N' (face z -196) or 'E' (face x 112); a1..a2 is its span along the face. Visual only.
  function cliffColumn(a1, a2, side, top) {
    for (let y = -80; y < top; ) {
      const y2 = Math.min(top, y + 12 + rng() * 22), p = rng() * 2.6;
      if (side === 'S') cliff(a1, y, -66 - p, a2, y2, -62);
      else if (side === 'N') cliff(a1, y, -200, a2, y2, -196 + p);
      else cliff(112 - p, y, a1, 116, y2, a2);
      y = y2;
    }
  }
  // West rim: low (top y 1), so the Hub's windows look over it into the abyss. Split around the lift shaft.
  cliff(32, -80, -130.5, 36, 1, -66, true);
  cliff(32, -80, -196, 36, 1, -141.5, true);
  // South, north and east cliffs: flat colliders with fractured ice columns in front (no stray ledges)
  cliff(36, -80, -66, 112, 32, -62, true);
  cliff(36, -80, -200, 112, 32, -196, true);
  cliff(112, -80, -82, 116, 32, -62, true);
  cliff(112, -80, -200, 116, 32, -86, true);
  for (let x = 36; x < 112; ) {
    const x2 = Math.min(112, x + 4 + rng() * 7);
    cliffColumn(x, x2, 'S', 26 + rng() * 6);
    cliffColumn(x, x2, 'N', 26 + rng() * 6);
    x = x2;
  }
  for (let z = -62; z > -200; ) {
    const z2 = Math.max(-200, z - 4 - rng() * 7);
    if (z2 < -100 || z > -72) cliffColumn(z2, z, 'E', 26 + rng() * 6); // flush around the pump station
    z = z2;
  }
  // a crown of ice along the rim breaks up the skyline
  for (let x = 38; x < 112; x += 5 + rng() * 4) {
    cluster(x, 31, -63.5, 5 + rng() * 4, 'ice', (rng() - 0.5) * 0.5, -0.15, 5);
    cluster(x, 31, -198.5, 5 + rng() * 4, 'ice', (rng() - 0.5) * 0.5, 0.15, 5);
  }
  for (let z = -64; z > -198; z -= 5 + rng() * 4) cluster(114, 31, z, 5 + rng() * 4, 'ice', -0.15, (rng() - 0.5) * 0.5, 5);
  // the cliff around the secret vent's tunnel (z -82..-86 at y -4.5..-3.5)
  cliff(112, -80, -86, 116, -4.5, -82, true);
  cliff(112, -3.5, -86, 116, 32, -82, true);
  cliff(112, -4.5, -86, 116, -3.5, -84.6, true);
  cliff(112, -4.5, -83.4, 116, -3.5, -82, true);
  // the abyss floor far below the death line, frozen pipes, and a field of glowing crystals
  W.deco(36, -80, -196, 112, -78, -66, 'rock', zone);
  for (const [z, x1, x2] of [[-98, 36, 112], [-158, 36, 112], [-128, 60, 112]]) {
    W.deco(x1, -70, z - 1.6, x2, -66.8, z + 1.6, 'metal', zone);
    for (let x = x1 + 4; x < x2; x += 9) W.deco(x, -70.2, z - 1.75, x + 0.5, -66.6, z + 1.75, 'glow3', zone);
  }
  W.deco(78, -80, -150, 82, -64, -96, 'metal', zone); // a sunken spine of the old station

  // ------------------------------------------------------------------ entry skybridge (Hub east port, z -112)
  corridorX({ xStart: 25, xEnd: 44, y: 4, zone, cz: -112, n: [{ c: 38.5, w: 10, h: 2.4, y0: 0.4 }], s: [{ c: 38.5, w: 10, h: 2.4, y0: 0.4 }] });
  // glass side panes: the first look down into the deep
  new Glass(W, { min: [33.5, 4.4, -113.8], max: [43.5, 6.8, -113.6] });
  new Glass(W, { min: [33.5, 4.4, -110.4], max: [43.5, 6.8, -110.2] });
  zoneTitle([25, 4, -113.5], [29, 7, -110.5], 'AZURE', 'THE COLD DEEP', '#3a8bff', 'music_blue');
  area([25.5, 4, -113.5], [28, 7, -110.5], MOOD);
  icicles(40, -113.3, 44, -110.7, 7.2, 6);

  // ------------------------------------------------------------------ Rim Deck (y 4)
  W.box(44, 2.4, -120, 58, 4, -104, 'floor', zone);
  W.deco(48, -80, -116, 54, 2.4, -108, 'metal', zone); // the station's strut, down into the dark
  for (const y of [-6, -22, -38, -54]) W.deco(47.8, y, -116.2, 54.2, y + 0.3, -107.8, 'glow3', zone);
  W.deco(44.5, 0.6, -119.5, 57.5, 2.4, -104.5, 'metal', zone);
  icicles(45, -119, 57, -105, 0.6, 18);
  // rails (open to the east at z -109 → -104: the way down)
  for (const [x1, z1, x2, z2] of [[44, -104.3, 58, -104], [44, -120, 58, -119.7], [57.7, -119.7, 58, -109], [44, -110, 44.3, -104.3], [44, -119.7, 44.3, -114]]) {
    W.box(x1, 4, z1, x2, 5.1, z2, 'metal', zone);
    W.deco(x1, 5.1, z1, x2, 5.16, z2, 'glow3', zone);
  }
  W.box(44.6, 4, -119.4, 47.2, 5.1, -117.2, 'metal', zone); // console
  W.deco(44.7, 5.1, -119.2, 47.1, 5.14, -117.4, 'glow3', zone);
  W.box(56.6, 4, -119.4, 57.1, 12.5, -118.9, 'metal', zone); // antenna mast
  W.deco(56.5, 12.5, -119.5, 57.2, 12.9, -118.8, 'glow3', zone);
  new Checkpoint(W, game, { pos: [47, 4, -112], yaw: -Math.PI / 2, size: [3, 3, 7] });
  hint([44, 4, -116], [48, 7, -108], 'The station sinks into the abyss. <b>Hop down, ledge to ledge</b> — the dark below is bottomless.', 5);
  light(51, 9.5, -112, 0xa8dcff, 40, 34);
  new Drone(W, { pos: [64, 8, -114], color: GREEN, range: 24 });
  keepOut.push([[25, 2, -121], [59, 14, -103]]);

  // ------------------------------------------------------------------ the Shelf: ice ledges stepping down and east
  ledge(60, -101, 64, -106, 2.2);
  hint([59, 2.2, -106], [64, 5, -101], 'Ice-crusted spikes still answer to <b>their own color</b>. Clear them before you land.', 4);
  ledge(66.5, -95.5, 70.5, -99.5, 0.4);
  spikes(66.5, -95.5, 70.5, -99.5, 0.4, GREEN);
  ledge(73, -84, 82, -93, -2, 6); // the big ice shelf
  cluster(81, -2, -84.6, 2.6, 'ice', 0.3, 0.3);
  cluster(73.6, -2, -92.4, 3.2, 'glow', -0.3, -0.2);
  new Drone(W, { pos: [78, 2.5, -81], color: YELLOW, range: 22 });
  // a crane trolley runs out over the gap to the pump station
  new MovingPlatform(W, { min: [84, -3.4, -91.5], max: [87.5, -2.8, -88], offset: [9, 0, 0], speed: 2.4, pause: 0.8, zone });
  W.deco(83, 3, -90.1, 99.5, 3.5, -89.4, 'metal', zone);
  W.deco(83, 3.5, -90, 99.5, 3.56, -89.5, 'glow3', zone);
  new Drone(W, { pos: [91, 2, -96], color: RED, range: 22 });
  keepOut.push([[82, -4, -92], [99, 4, -87]]);

  // ------------------------------------------------------------------ Pump Station (y -4.5)
  W.box(99, -5.5, -96, 110, -4.5, -78, 'floor', zone);
  W.deco(102, -40, -90, 106, -5.5, -84, 'metal', zone);
  icicles(99.5, -95.5, 109.5, -78.5, -5.5, 16);
  room({ x1: 104, x2: 109.5, zS: -80, zN: -88, y: -4.5, h: 3.5, zone, floor: false, w: [{ c: -84, w: 3, h: 3 }], e: [{ c: -84, w: 1.2, h: 1.0 }] });
  new Checkpoint(W, game, { pos: [101.5, -4.5, -87], yaw: 0, size: [4, 3, 6] });
  hint([99, -4.5, -96], [104, -1.5, -91], 'A frozen freight lift below. <b>Ride it down</b> — or don\'t miss the jump.', 4);
  // vent hint: hazard stripes around the crawlspace in the hut's back wall
  W.deco(109.45, -3.5, -84.8, 109.5, -3.3, -83.2, 'hazard', zone);
  W.deco(109.45, -4.5, -84.75, 109.5, -3.5, -84.6, 'hazard', zone);
  W.deco(109.45, -4.5, -83.4, 109.5, -3.5, -83.25, 'hazard', zone);
  keepOut.push([[98, -6, -97], [123, 0, -77]]);

  // SECRET — crawl through the vent into the cliff
  tunnelX({ x1: 110, x2: 116.5, zc: -84, w: 1.2, y: -4.5, h: 1.0, zone });
  room({ x1: 117, x2: 122, zS: -81, zN: -87, y: -4.5, h: 3, zone, w: [{ c: -84, w: 1.2, h: 1.0 }] });
  trophy(119.5, -3.5, -84);
  secretRoom([117, -4.5, -87], [122, -1.5, -81], 'Frozen Locker');
  cluster(121.3, -4.5, -86.3, 1.6, 'glow', -0.3, 0.3);
  cluster(121.3, -4.5, -81.7, 1.4, 'glow', -0.3, -0.3);

  // ------------------------------------------------------------------ frozen Machinery: down the east side
  ledge(100, -99.5, 105, -103.5, -7.5);
  spikes(100, -99.5, 105, -103.5, -7.5, RED);
  // freight lift: shuttles between y -8.4 and -20.4
  new MovingPlatform(W, { min: [100, -9, -110.5], max: [104, -8.4, -106.5], offset: [0, -12, 0], speed: 2.6, pause: 1.4, zone });
  for (const [x, z] of [[99.6, -106.9], [104.2, -106.9], [99.6, -110.9], [104.2, -110.9]]) W.deco(x - 0.2, -22, z - 0.2, x + 0.2, -6, z + 0.2, 'metal', zone);
  W.deco(99.4, -6, -111.1, 104.6, -5.7, -106.3, 'glow3', zone);
  // turbine deck
  W.box(96, -22, -122, 108, -21, -113, 'floor', zone);
  icicles(96.5, -121.5, 107.5, -113.5, -22, 12);
  W.box(104, -21, -121, 107.5, -16, -116, 'metal', zone); // frozen turbine housing
  W.deco(103.9, -18.8, -121.1, 107.6, -18.5, -115.9, 'glow3', zone);
  cluster(107, -16, -120.5, 2.4, 'ice', 0.2, -0.2);
  new Drone(W, { pos: [100.5, -16.5, -119], color: [RED, YELLOW, GREEN], range: 20, cycle: 2.2 });
  // frozen pipe runs
  ledge(98, -124.5, 101, -127.5, -21.8, 1.5);
  ledge(102.5, -130, 105.5, -133, -22.6, 1.5);
  spikes(102.5, -130, 105.5, -133, -22.6, YELLOW);
  ledge(98, -135.5, 101, -138.5, -23.4, 1.5);
  new Drone(W, { pos: [94.5, -18, -131], color: GREEN, range: 22 });
  keepOut.push([[95, -23, -123], [109, -15, -98]]);

  // ------------------------------------------------------------------ Cryo Lab (y -25)
  W.box(92, -26, -152.5, 108, -25, -142, 'floor', zone); // porch
  W.deco(94, -60, -150, 106, -26, -144, 'metal', zone);
  for (const [x1, x2] of [[92, 92.3], [107.7, 108]]) W.box(x1, -25, -152.5, x2, -23.9, -142, 'metal', zone);
  new Checkpoint(W, game, { pos: [100, -25, -146], yaw: 0, size: [6, 3, 4] });
  area([92, -25, -152.5], [108, -21, -148], DEEP);
  room({ x1: 88, x2: 108, zS: -153, zN: -175, y: -25, h: 8, zone, s: [{ c: 100, w: 3, h: CH }], w: [{ c: -170, w: 3, h: CH }] });
  hint([98, -25, -156], [102, -22, -153], 'Cryo Lab. These drones <b>shift colors</b> — fire when the glow matches.', 5);
  // specimen tanks (glass: cover from drone fire)
  for (const z of [-158, -163.5, -169]) {
    W.box(103.8, -25, z - 1.5, 106.8, -24.4, z + 1.5, 'metal', zone);
    W.box(103.8, -19.6, z - 1.5, 106.8, -19, z + 1.5, 'metal', zone);
    new Glass(W, { min: [104, -24.4, z - 1.3], max: [106.6, -19.6, z + 1.3] });
    cluster(105.3, -24.4, z, 3.6, 'glow', 0, 0, 4);
  }
  W.box(93.5, -25, -161, 96, -23.5, -158.5, 'metal', zone);
  W.box(96.5, -25, -168, 99, -23.8, -165.5, 'metal', zone);
  W.deco(88, -18.4, -164.6, 108, -17.8, -163.8, 'metal', zone);
  W.deco(88, -18.4, -160.6, 108, -17.8, -159.8, 'metal', zone);
  light(97, -18.6, -164, 0x86c8ff, 34, 28);
  new Drone(W, { pos: [96, -21, -163], color: [RED, GREEN], range: 20, cycle: 2.2 });
  new Drone(W, { pos: [101.5, -20.5, -171], color: [YELLOW, RED, GREEN], range: 20, cycle: 2 });
  new Drone(W, { pos: [91, -21, -157.5], color: YELLOW, range: 20 });
  new Checkpoint(W, game, { pos: [90.5, -25, -170], yaw: Math.PI / 2, size: [3, 3, 3] });

  // ------------------------------------------------------------------ the Gauntlet: three colors, one corridor
  corridorX({ xStart: 87.5, xEnd: 66.5, y: -25, zone, cz: -170, low: [{ x1: 70.5, x2: 75, h: 1.1 }] });
  hint([85, -25, -171.5], [87.5, -22, -168.5], 'Three colors, one corridor. <b>Keep switching.</b>', 3);
  [[85, RED], [83, YELLOW], [79, GREEN], [77, RED], [75.8, YELLOW]].forEach(([x, c]) => barrierWallX(x, -25, c, zone, -170));
  barrierWallX(73.6, -25, GREEN, zone, -170, 1.1);
  barrierWallX(71.6, -25, RED, zone, -170, 1.1);
  barrierWallX(69.5, -25, YELLOW, zone, -170);
  new Drone(W, { pos: [81, -22.4, -170], color: [RED, YELLOW, GREEN], orbit: 0.4, range: 14, cycle: 1.5 });
  new Drone(W, { pos: [67.6, -22.4, -170], color: [GREEN, RED, YELLOW], orbit: 0.4, range: 14, cycle: 1.5 });

  // ------------------------------------------------------------------ the Well: ledges over cryo-brine
  room({ x1: 50, x2: 66, zS: -158, zN: -182, y: -47, h: 29, zone, floor: false, e: [{ c: -170, w: 3, h: CH, y0: 22 }] });
  // floor slab (the antechamber's ceiling) with the drop hole at x 60..64, z -164.5..-160.5
  W.box(49.5, -47.5, -182.5, 66.5, -46.5, -164.5, 'ceil', zone);
  W.box(49.5, -47.5, -160.5, 66.5, -46.5, -157.5, 'ceil', zone);
  W.box(49.5, -47.5, -164.5, 60, -46.5, -160.5, 'ceil', zone);
  W.box(64, -47.5, -164.5, 66.5, -46.5, -160.5, 'ceil', zone);
  brine(50, -182, 58, -158, -46);
  brine(58, -182, 66, -166.5, -46);
  // the pit platform around the hole
  W.box(58, -46.5, -166.5, 60, -44.2, -158, 'floor', zone);
  W.box(64, -46.5, -166.5, 66, -44.2, -158, 'floor', zone);
  W.box(60, -46.5, -166.5, 64, -44.2, -164.5, 'floor', zone);
  W.box(60, -46.5, -160.5, 64, -44.2, -158, 'floor', zone);
  W.deco(59.9, -44.2, -164.6, 64.1, -44.14, -160.4, 'glow3', zone);
  W.box(62, -26, -172, 66, -25, -168, 'floor', zone); // catwalk from the gauntlet
  new Checkpoint(W, game, { pos: [64, -25, -170], yaw: Math.PI / 2, size: [3, 3, 3] });
  area([62, -25, -172], [66, -22, -168], DEEP);
  hint([62, -25, -172], [66, -22, -168], 'Cryo-brine below — <b>one touch freezes you solid</b>. Work your way down to the hole.', 5);
  // ledges on ice pillars rising from the brine
  const pillar = (x1, z1, x2, z2, top) => {
    W.deco(x1 + 0.4, -46.5, Math.min(z1, z2) + 0.4, x2 - 0.4, top - 0.6, Math.max(z1, z2) - 0.4, 'rock', zone);
    plat(x1, z1, x2, z2, top, zone);
    keepOut.push([[x1, top - 1, Math.min(z1, z2)], [x2, top + 3, Math.max(z1, z2)]]);
  };
  pillar(60, -177, 64, -181, -28.5);
  pillar(51, -177, 55, -181, -32);
  pillar(51, -168, 54.5, -172, -35.5);
  spikes(51, -168, 54.5, -172, -35.5, GREEN);
  pillar(51, -159, 55, -163, -39);
  spikes(51, -159, 55, -163, -39, RED);
  new Drone(W, { pos: [58.5, -33, -171], color: YELLOW, range: 22 });
  keepOut.push([[58, -47, -167], [66, -40, -158], [60, -26, -173], [66, -20, -167]]);
  for (const [x, z, tx, tz] of [[50.6, -181.4, 0.3, 0.3], [65.4, -181.4, -0.3, 0.3], [50.6, -158.6, 0.3, -0.3], [56, -181.6, 0, 0.35]]) cluster(x, -46.2, z, 3 + rng() * 3, 'ice', tx, tz);
  for (let i = 0; i < 10; i++) cluster(50.3, -44 + rng() * 22, -160 - rng() * 21, 1.5 + rng() * 2, 'ice', 1.2, 0, 4);
  for (let i = 0; i < 10; i++) cluster(51 + rng() * 14, -44 + rng() * 22, -181.7, 1.5 + rng() * 2, 'ice', 0, 1.2, 4);

  // The drop: a shielded spike shaft below the hole, walled so there's no slipping past a layer.
  shieldedShaft({
    x1: 60, x2: 64, z1: -164.5, z2: -160.5, floor: -56, capY: -44.2, zone,
    cap: { x1: 59, x2: 65, z1: -165.5, z2: -159.5 },
    layers: [{ y: -47.5, color: RED }, { y: -51, color: GREEN, shieldY: -47.7 }, { y: -54.5, color: YELLOW, shieldY: -51.2 }],
  });
  W.box(59.5, -53.9, -165, 60, -47.5, -160, 'metal', zone);
  W.box(64, -53.9, -165, 64.5, -47.5, -160, 'metal', zone);
  W.box(59.5, -53.9, -165, 64.5, -47.5, -164.5, 'metal', zone);
  W.box(59.5, -53.9, -160.5, 64.5, -47.5, -160, 'metal', zone);
  hint([59, -44.2, -166], [65, -41, -159], 'Drop through. <b>Each layer only opens to its own color</b> — fire once you\'re past its shield.', 5);

  // ------------------------------------------------------------------ Vault antechamber (y -56): the ricochet lock
  room({ x1: 50, x2: 66, zS: -158, zN: -182, y: -56, h: 9, zone, ceiling: false, s: [{ c: 54, w: 3, h: CH }], w: [{ c: -172, w: 3, h: 4 }] });
  new Checkpoint(W, game, { pos: [62, -56, -167.5], yaw: Math.PI / 2, size: [4, 3, 2] });
  const vaultDoor = new SlidingDoor(W, { min: [52.5, -56, -158], max: [55.5, -52.8, -157.5], color: YELLOW, zone });
  {
    // An alcove behind glass in the west wall. Its ceiling, sides and back wall are AZURE energy panels:
    // every other color ricochets off them, so a shot over the glass ends up on the yellow floor target.
    const ay = -56, z1 = -173.5, z2 = -170.5, top = ay + 4, glassTop = ay + 2.6;
    room({ x1: 44.5, x2: 49.5, zS: z2, zN: z1, y: ay, h: 4, zone, e: [{ c: -172, w: 3, h: 4 }], trim: false });
    new Glass(W, { min: [49, ay, z1], max: [49.1, glassTop, z2] });
    W.deco(48.95, glassTop, z1, 49.15, glassTop + 0.06, z2, 'glow3', zone);
    const panel = (min, max) => new Barrier(W, { min, max, color: BLUE, kind: 'wall', regen: 2.5, zone });
    panel([44.5, top - 0.15, z1], [49.1, top, z2]);
    panel([44.7, ay, z1], [49.1, top - 0.15, z1 + 0.1]);
    panel([44.7, ay, z2 - 0.1], [49.1, top - 0.15, z2]);
    let solved = false;
    const onActivate = () => {
      if (solved) return;
      solved = true;
      vaultDoor.open();
      game.hud.message('Vault lock released.', 2.5);
    };
    const targets = [
      new TargetPanel(W, { min: [44.7, ay, z1 + 0.1], max: [49, ay + 0.12, z2 - 0.1], color: YELLOW, face: 'up', onActivate }),
      new TargetPanel(W, { min: [44.5, ay + 0.12, z1 + 0.1], max: [44.7, top - 0.15, z2 - 0.1], color: YELLOW, face: '-x', onActivate }),
    ];
    targets.forEach((tp) => (tp.group = targets));
    // the back wall faces +x (toward you); turn its bullseye around
    const decal = targets[1].mesh.children[0];
    decal.position.x = -decal.position.x;
    decal.rotation.y = Math.PI / 2;
  }
  hint([50, -56, -176], [56, -53, -168], 'The vault lock sits <b>behind the glass</b>. Azure panels deflect every other color…', 6);
  new Drone(W, { pos: [57, -51.5, -177], color: RED, range: 18 });
  corridor({ zStart: -157.5, zEnd: -150.5, y: -56, zone, cx: 54 });

  // ------------------------------------------------------------------ Core Sanctum (y -56): the BLUE core
  room({ x1: 52, x2: 80, zS: -122, zN: -150, y: -56, h: 14, zone, n: [{ c: 54, w: 3, h: CH }], w: [{ c: -136, w: 3, h: CH }] });
  area([52.5, -56, -150], [55.5, -53, -147], DEEP);
  // its roof is a bed of ice spikes (nothing lands up there and lives)
  W.box(51.5, -41.5, -150.5, 80.5, -41.1, -121.5, 'rock', zone, { hazard: 'spike' });
  for (let i = 0; i < 40; i++) shard(52.5 + rng() * 27, -41.1, -149.5 + rng() * 27, 1 + rng() * 2.5, 0.25 + rng() * 0.2, (rng() - 0.5) * 0.5, (rng() - 0.5) * 0.5, 'glow');
  W.box(64, -56, -140, 72, -55.6, -132, 'metal', zone); // dais
  W.deco(63.9, -55.66, -140.1, 72.1, -55.6, -131.9, 'glow3', zone);
  const core = pedestal(68, -55.6, -136, BLUE, zone);
  light(68, -46, -136, 0x3a8bff, 50, 32);
  keepOut.push([[52, -56, -152], [62, -52, -147], [52, -56, -138], [80, -52, -134], [62, -56, -142], [74, -50, -130]]);
  // a geode of crystals: floor clusters, wall growths, stalactites
  for (let i = 0; i < 22; i++) {
    const a = rng() * Math.PI * 2, r = 7 + rng() * 6;
    cluster(68 + Math.cos(a) * r, -56, -136 + Math.sin(a) * r * 0.9, 2 + rng() * 4.5, i % 3 ? 'ice' : 'glow', Math.cos(a) * 0.35, Math.sin(a) * 0.35);
  }
  for (let i = 0; i < 18; i++) shard(53 + rng() * 26, -42.1, -149 + rng() * 26, 1.5 + rng() * 3.5, 0.2 + rng() * 0.25, 0, Math.PI, rng() < 0.4 ? 'glow' : 'ice');
  // grabbing the core wakes two azure sentries: try out the new color
  const grant = core.onCollect;
  core.onCollect = (pk, pl) => {
    grant(pk, pl);
    for (const pos of [[57, -49, -126], [78, -49, -146]]) {
      const d = new Drone(W, { pos, color: BLUE, range: 30 });
      d.fireTimer = 2.5; // a beat to switch to the new color first
    }
  };

  // ------------------------------------------------------------------ lift lobby: the blue lock
  corridorX({ xStart: 45.5, xEnd: 51.5, y: -56, zone, cz: -136 });
  barrierWallX(50.6, -56, BLUE, zone, -136);
  hint([52, -56, -138], [56, -53, -134], 'Only <b>AZURE</b> opens the way to the station lift.', 4);
  const liftCp = new Checkpoint(W, game, { pos: [47.4, -56, -136], yaw: Math.PI / 2, size: [2.4, 3, 3] });
  area([45.5, -56, -137.5], [49.5, -53, -134.5], DEEP);

  // ------------------------------------------------------------------ THE FORCED ASCENT
  // A glass shaft (interior x 35..45, z -141..-131) from y -58 to 17, standing in the chasm: you watch the
  // abyss fall away as you ride, and from the Hub you can see the colored hatches stacked inside it.
  // The lift fills it, rises 68 m and stops level with the exit corridor (y 12) to the Hub's east balcony.
  const SX0 = 35, SX1 = 45, SZ0 = -141, SZ1 = -131, BOT = -56, TOP = 12;
  W.box(34.5, -58, -141.5, 45.5, -57, -130.5, 'floor', zone);
  W.box(34.5, 17, -141.5, 45.5, 17.5, -130.5, 'ceil', zone);
  // metal bands (the bottom one holds the door, the two vent bands hold the drone hatches, the head holds
  // the exit) with glass between them
  const BANDS = [[-58, -52.3], [-41, -40], [-22.4, -18.8], [-4, -3], [4.6, 7.6], [10, 17]];
  for (const [y1, y2] of BANDS) {
    W.box(34.5, y1, -141.5, 45.5, y2, -141, 'metal', zone);
    W.box(34.5, y1, -131, 45.5, y2, -130.5, 'metal', zone);
    if (y1 === 10) wallHoles(34.5, 35, -141, -131, y1, y2, [{ z1: -137.5, z2: -134.5, y1: TOP, y2: TOP + CH }]);
    else W.box(34.5, y1, -141, 35, y2, -131, 'metal', zone);
    if (y1 === -58) wallHoles(45, 45.5, -141, -131, y1, y2, [{ z1: -137.5, z2: -134.5, y1: BOT, y2: BOT + CH }]);
    else W.box(45, y1, -141, 45.5, y2, -131, 'metal', zone);
    for (const y of [y1 + 0.02, y2 - 0.08]) {
      if (y < -57) continue;
      W.deco(34.5, y, -141.55, 45.5, y + 0.06, -141.5, 'glow3', zone);
      W.deco(34.5, y, -130.5, 45.5, y + 0.06, -130.45, 'glow3', zone);
      W.deco(34.45, y, -141.5, 34.5, y + 0.06, -130.5, 'glow3', zone);
      W.deco(45.5, y, -141.5, 45.55, y + 0.06, -130.5, 'glow3', zone);
    }
  }
  for (const [x, z] of [[34.2, -141.8], [45, -141.8], [34.2, -131], [45, -131]]) W.box(x, -58, z, x + 0.8, 17.5, z + 0.8, 'metal', zone);
  {
    const glass = [], edges = [];
    const pane = (x1, y1, z1, x2, y2, z2) => {
      const g = new THREE.BoxGeometry(x2 - x1, y2 - y1, z2 - z1).translate((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
      glass.push(g);
      edges.push(new THREE.EdgesGeometry(g));
      W.addSolid(V(x1, y1, z1), V(x2, y2, z2), { static: true, glass: true });
    };
    for (let i = 0; i < BANDS.length - 1; i++) {
      const y1 = BANDS[i][1], y2 = BANDS[i + 1][0];
      pane(35, y1, -141.3, 45, y2, -141.2);
      pane(35, y1, -130.8, 45, y2, -130.7);
      pane(34.7, y1, -141, 34.8, y2, -131);
      pane(45.2, y1, -141, 45.3, y2, -131);
    }
    const mesh = new THREE.Mesh(mergeGeometries(glass), new THREE.MeshStandardMaterial({ color: 0xa8dcff, transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0.2, depthWrite: false }));
    mesh.renderOrder = 2;
    const lines = new THREE.LineSegments(mergeGeometries(edges), new THREE.LineBasicMaterial({ color: 0xcfeeff, transparent: true, opacity: 0.5 }));
    W.scene.add(mesh, lines);
    glass.forEach((g) => g.dispose());
    edges.forEach((g) => g.dispose());
  }
  W.deco(39, 17.5, -137, 41, 18.1, -135, 'glow3', zone); // beacon on the roof, seen from the Hub
  corridorX({ xStart: 25, xEnd: 34.5, y: TOP, zone, cz: -136 }); // to the Hub's east balcony port
  W.trigger([25, TOP, -137.5], [27.5, TOP + 3, -134.5], () => {
    game.setMusic('music_hub');
    game.setAmbient('amb_hub');
    if (level.atmospheres.hub) game.setAtmosphere('hub');
  }, { once: false });
  W.trigger([28, TOP, -137.5], [34.5, TOP + 3, -134.5], () => game.setAtmosphere('azure'), { once: false });

  // The hatches. Each piece is a spike Barrier spanning part of the shaft, flipped so the spikes point down
  // at the rider. Shoot every piece above you before the lift carries you into it. Pieces: [x1, x2, z1, z2, color].
  const HATCH_H = 0.9, XM = 40, ZM = -136;
  const full = (c) => [[SX0, SX1, SZ0, SZ1, c]];
  const HATCHES = [
    { y: -46.5, pieces: full(RED) },
    { y: -41.5, pieces: full(GREEN) },
    { y: -36.5, pieces: full(YELLOW) },
    { y: -31.5, pieces: full(BLUE) },
    // split: clear either half and stand under it
    { y: -26, pieces: [[SX0, XM, SZ0, SZ1, RED], [XM, SX1, SZ0, SZ1, YELLOW]] },
    // a hole in the north-west corner: stand in it, or shoot
    { y: -15, pieces: [[38.5, SX1, SZ0, SZ1, BLUE], [SX0, 38.5, -137.5, SZ1, BLUE]] },
    // stacked: the upper one only shows once the lower one breaks
    { y: -9.5, pieces: full(GREEN) },
    { y: -7.2, pieces: full(RED) },
    // behind shot shields: you see the color, but can only hit it once your eyes pass the film
    { y: -1.5, pieces: full(YELLOW), shield: -5 },
    { y: 4.5, pieces: [[SX0, SX1, ZM, SZ1, BLUE], [SX0, SX1, SZ0, ZM, GREEN]], shield: 1 },
    // the finale: a four-color hatch parked under the roof drops to meet you
    { y: 10, park: 14.5, pieces: [[SX0, XM, SZ0, ZM, RED], [XM, SX1, SZ0, ZM, YELLOW], [SX0, XM, ZM, SZ1, GREEN], [XM, SX1, ZM, SZ1, BLUE]] },
  ];
  const pieces = [];
  let dropHatch = null;
  for (const h of HATCHES) {
    const y0 = h.park ?? h.y;
    const group = [];
    for (const [x1, x2, z1, z2, color] of h.pieces) {
      const b = new Barrier(W, { min: [x1, y0, z1], max: [x2, y0 + HATCH_H, z2], color, kind: 'spike', regen: 0, zone });
      b.group.rotation.x = Math.PI; // spikes down, slab and rim on top
      b.group.children[2]?.material.color.multiplyScalar(0.5); // a softer rim: it shows through the glass
      b.homeY = y0;
      pieces.push(b);
      group.push(b);
      // telegraph: glowing rails on the shaft walls under each piece, in its color, at its final height
      const ry = h.y - 0.4, g = 'glow' + color;
      if (x1 === SX0) W.deco(SX0, ry, z1, SX0 + 0.06, ry + 0.07, z2, g, zone);
      if (x2 === SX1) W.deco(SX1 - 0.06, ry, z1, SX1, ry + 0.07, z2, g, zone);
      if (z1 === SZ0) W.deco(x1, ry, SZ0, x2, ry + 0.07, SZ0 + 0.06, g, zone);
      if (z2 === SZ1) W.deco(x1, ry, SZ1 - 0.06, x2, ry + 0.07, SZ1, g, zone);
    }
    if (h.shield !== undefined) new ShotShield(W, { min: [SX0, h.shield, SZ0], max: [SX1, h.shield + 0.06, SZ1] });
    if (h.park !== undefined) dropHatch = { pieces: group, from: h.park, to: h.y, y: h.park, active: false };
  }
  const setHatchY = (b, y) => {
    b.min.y = b.solid.min.y = y;
    b.max.y = b.solid.max.y = y + HATCH_H;
    b.group.position.y = y + HATCH_H / 2;
  };

  // vents the ambush drones burst out of
  const VENTS = {
    halt: [[36.6, -138.5, SX0, 'x'], [42, -139.4, SZ0, 'z'], [38, -132.6, SZ1, 'z']],
    ride: [[43.4, -133.5, SX1, 'x']],
  };
  for (const [key, vy] of [['halt', -21.5], ['ride', 5.2]]) {
    for (const [x, z, wall, axis] of VENTS[key]) {
      const s = wall === SX0 || wall === SZ0 ? 1 : -1;
      if (axis === 'x') {
        W.deco(wall, vy, z - 0.9, wall + s * 0.05, vy + 1.6, z + 0.9, 'grate', zone);
        W.deco(wall, vy - 0.08, z - 1, wall + s * 0.07, vy, z + 1, 'hazard', zone);
      } else {
        W.deco(x - 0.9, vy, wall, x + 0.9, vy + 1.6, wall + s * 0.05, 'grate', zone);
        W.deco(x - 1, vy - 0.08, wall, x + 1, vy, wall + s * 0.07, 'hazard', zone);
      }
    }
  }

  // Shutters in the shaft's doorways (x x1..x2, centered on z -136, bottom y): they roll up into the lintel.
  // The bottom one seals you in when the ride starts; the top one only opens when the lift arrives, so
  // from the Hub side the exit is a closed door, not a 70 m drop.
  function shutter(x1, x2, y, closed) {
    const mesh = new THREE.Mesh(boxGeo(x2 - x1, CH, 3), mat('metal', zone));
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(x2 - x1 + 0.04, 0.14, 3), mat('hazard', zone));
    stripe.position.y = -CH / 2 + 0.3;
    mesh.add(stripe);
    mesh.position.set((x1 + x2) / 2, y + CH / 2, -136);
    W.scene.add(mesh);
    const solid = W.addSolid(V(x1, y, -137.5), V(x2, y + CH, -134.5), { static: true });
    const s = {
      k: closed ? 1 : 0, target: closed ? 1 : 0,
      close(instant = false) {
        s.target = 1;
        solid.enabled = true;
        if (instant) s.k = 1;
        else audio.door();
        s.update(0);
      },
      open(instant = false) {
        s.target = 0;
        solid.enabled = false;
        if (instant) s.k = 0;
        else audio.doorOpen();
        s.update(0);
      },
      update(dt) {
        s.k = s.target > s.k ? Math.min(1, s.k + dt * 3) : Math.max(0, s.k - dt * 1.5);
        mesh.visible = s.k > 0.01;
        mesh.scale.y = Math.max(0.01, s.k);
        mesh.position.y = y + CH - (CH * s.k) / 2;
      },
    };
    solid.enabled = closed;
    s.update(0);
    W.add(s);
    return s;
  }
  const gate = shutter(45.05, 45.45, BOT, false);
  const exitGate = shutter(34.55, 34.95, TOP, true);

  const ascentLight = light(XM, BOT + 6, ZM, 0x9fd8ff, 26, 22);
  const spawned = [];
  let halted = false;

  // speed by distance travelled: steady at first, faster after the power failure, fastest at the top
  const lift = new Elevator(W, {
    min: [SX0 + 0.05, BOT - 1, SZ0 + 0.05], max: [SX1 - 0.05, BOT, SZ1 - 0.05], path: [[0, TOP - BOT, 0]],
    speed: (d) => (d < 33 ? 1.4 : d < 52 ? 1.6 : 1.8), accel: 0.8, decel: 1.2, delay: 3, zone,
    trigger: { min: [SX0 + 1, BOT, SZ0 + 1], max: [SX1 - 1.5, BOT + 3, SZ1 - 1] },
    onArm: () => {
      gate.close();
      audio.sample('alarm', { gain: 0.9, vary: 0 });
      game.enterZone('AZURE', 'FORCED ASCENT', '#3a8bff', 'music_ascent');
      game.setAtmosphere('azure');
      game.hud.message('<b>LOCKDOWN.</b> The lift is rising — <b>shoot every hatch</b> before it reaches you!', 4);
    },
    onArrive: () => {
      exitGate.open();
      game.setMusic('music_hub');
      game.hud.message('The lift shudders to a halt. <b>The Hub is just ahead.</b>', 4);
    },
  });
  // dress the platform: hazard edging and a glowing azure ring
  {
    const sx = lift.size.x, sz = lift.size.z, sy = lift.size.y;
    for (const [w, d, x, z] of [[sx, 0.3, sx / 2, 0.15], [sx, 0.3, sx / 2, sz - 0.15], [0.3, sz, 0.15, sz / 2], [0.3, sz, sx - 0.15, sz / 2]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), mat('hazard', zone));
      m.position.set(x, sy + 0.01, z);
      lift.mesh.add(m);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.06, 6, 40), mat('glow3', zone));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(sx / 2, sy + 0.02, sz / 2);
    lift.mesh.add(ring);
  }

  function ventDrone([x, z], offset, idx, firstShot) {
    const d = new Drone(W, { pos: [x, lift.top + offset, z], color: [BLUE, RED, GREEN, YELLOW], hp: 1, cycle: 2, fireInterval: 3.4, range: 18, orbit: 1 });
    d.fireTimer = firstShot; // a beat to read its color before it opens fire
    d.colorIdx = idx % 4;
    d.color = d.palette[d.colorIdx];
    d.applyColor();
    d.rideOffset = offset;
    d.aggro = true;
    W.fx.burst(d.pos, 0x9bf6ff, { count: 30, speed: 6, life: 0.6, size: 0.3, gravity: 2 });
    spawned.push(d);
    return d;
  }
  // scripted beats by platform height
  const EVENTS = [
    {
      at: -24, // power failure: the lift brakes and three drones burst from the vents
      fn: () => {
        lift.hold(true);
        halted = true;
        audio.sample('alarm', { gain: 0.8, vary: 0 });
        game.player.shake = Math.max(game.player.shake, 0.5);
        game.hud.message('<b>POWER FAILURE</b> — destroy the drones to restart the lift!', 3);
        VENTS.halt.forEach((v, i) => ventDrone(v, 2.6, i, 2 + i * 0.9));
      },
    },
    { at: 3, fn: () => ventDrone(VENTS.ride[0], 3, 1, 2.2) },
    {
      at: 3.5, // the finale hatch drops from the roof
      fn: () => {
        dropHatch.active = true;
        audio.sample('alarm', { gain: 0.7, vary: 0 });
        game.player.shake = Math.max(game.player.shake, 0.6);
      },
    },
  ];
  const fired = new Set();
  const tint = new THREE.Color();
  W.add({
    update(dt) {
      const top = lift.top;
      for (const d of spawned) if (!d.dead) d.home.y = top + d.rideOffset;
      if (lift.state === 'moving') {
        for (const ev of EVENTS) {
          if (!fired.has(ev) && top >= ev.at) {
            fired.add(ev);
            ev.fn();
          }
        }
      }
      if (halted && spawned.every((d) => d.dead)) {
        halted = false;
        lift.hold(false);
        audio.sample('elevator_start', { gain: 0.9, vary: 0 });
        game.hud.message('Power restored. <b>Hold on.</b>', 2);
      }
      if (dropHatch.active && dropHatch.y > dropHatch.to) {
        dropHatch.y = Math.max(dropHatch.to, dropHatch.y - dt * 3);
        for (const b of dropHatch.pieces) setHatchY(b, dropHatch.y);
      }
      // the shaft light rides above you, tinted by the next hatch coming down
      let next = null;
      for (const b of pieces) if (!b.broken && b.min.y > top + 1 && (!next || b.min.y < next.min.y)) next = b;
      if (next && next.min.y - top < 16) tint.set(COLORS[next.color].hex);
      else tint.set(0x9fd8ff);
      ascentLight.color.lerp(tint, Math.min(1, dt * 4));
      ascentLight.position.y = next ? Math.min(top + 6, next.min.y - 0.6) : top + 6;
    },
  });

  function resetAscent() {
    lift.reset();
    gate.open(true);
    exitGate.close(true);
    halted = false;
    fired.clear();
    let sound = true;
    for (const b of pieces) {
      setHatchY(b, b.homeY);
      if (!b.broken) continue;
      // restore every hatch at once, with a single reform sound
      if (sound) b.restore();
      else {
        b.broken = false;
        b.solid.enabled = true;
        b.group.visible = true;
        b.reform = 0;
      }
      sound = false;
    }
    dropHatch.y = dropHatch.from;
    dropHatch.active = false;
    for (const d of spawned) {
      W.scene.remove(d.group);
      W.remove(d);
      W.removeHittable(d.group);
    }
    spawned.length = 0;
    ascentLight.position.y = BOT + 6;
  }
  onRespawn(() => {
    const running = lift.state === 'armed' || lift.state === 'moving';
    if (running || game.checkpoint.ref === liftCp) resetAscent();
    if (running) game.setMusic('music_blue');
  });
  // walking back into the lobby after a finished ride calls the lift back down
  W.trigger([45.5, BOT, -137.5], [49.5, BOT + 3, -134.5], () => lift.state === 'arrived' && resetAscent(), { once: false });

  // ------------------------------------------------------------------ crystals of the chasm
  // keep the big structures clear of them
  keepOut.push(
    [[51, -57, -151], [81, -40, -121]], [[44, -57, -183], [67, -17, -157]], [[87, -26, -176], [109, -16, -152]],
    [[66, -26, -172.5], [88, -21, -167.5]], [[34, -58, -142], [52, 18, -130]], [[25, 11, -138], [35, 16, -134]],
  );
  // a field of glowing crystals on the abyss floor, and giant spires rising from it
  for (let i = 0; i < 30; i++) cluster(38 + rng() * 72, -78, -68 - rng() * 126, 5 + rng() * 9, i % 3 ? 'deep' : 'ice', (rng() - 0.5) * 0.6, (rng() - 0.5) * 0.6, 6);
  for (const [x, z, h] of [[44, -98, 30], [64, -100, 36], [92, -94, 28], [94, -126, 40], [40, -186, 30]]) cluster(x, -78, z, h, 'deep', 0, 0, 7);
  // growths on the cliff faces, angled up and out
  const wallGrowth = (x, y, z, tx, tz) => cluster(x, y, z, 2 + rng() * 3.5, rng() < 0.25 ? 'glow' : 'ice', tx, tz, 4);
  for (let i = 0; i < 40; i++) wallGrowth(37 + rng() * 74, -62 + rng() * 80, -66.2, (rng() - 0.5) * 0.5, -0.5 - rng() * 0.4);
  for (let i = 0; i < 40; i++) wallGrowth(37 + rng() * 74, -62 + rng() * 80, -195.8, (rng() - 0.5) * 0.5, 0.5 + rng() * 0.4);
  for (let i = 0; i < 40; i++) wallGrowth(111.8, -62 + rng() * 80, -67 - rng() * 128, -0.5 - rng() * 0.4, (rng() - 0.5) * 0.5);
  // glowing spires on the west rim's face, right under the Hub's windows
  for (let i = 0; i < 16; i++) cluster(36, -50 + rng() * 48, -68 - rng() * 126, 3 + rng() * 4, i % 2 ? 'glow' : 'ice', 0.5 + rng() * 0.4, (rng() - 0.5) * 0.5, 4);

  // merge: one mesh of cliff ice, frosted crystal, glowing crystal and fog-piercing deep crystal
  const cliffMat = new THREE.MeshStandardMaterial({ color: 0x46638f, emissive: 0x0a1e44, emissiveIntensity: 1, roughness: 0.32, metalness: 0.25, flatShading: true });
  const iceMat = new THREE.MeshStandardMaterial({ color: 0xa9d4ff, emissive: 0x2a66ff, emissiveIntensity: 0.4, roughness: 0.18, metalness: 0.15, flatShading: true });
  const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x46c8ff).multiplyScalar(1.1) });
  const deepMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x2fa8ff).multiplyScalar(0.95), fog: false });
  geos.cliff = cliffGeos;
  for (const [k, m] of [['cliff', cliffMat], ['ice', iceMat], ['glow', glowMat], ['deep', deepMat]]) {
    if (!geos[k].length) continue;
    const mesh = new THREE.Mesh(mergeGeometries(geos[k].map((g) => (g.index ? g.toNonIndexed() : g))), m);
    geos[k].forEach((g) => g.dispose());
    mesh.matrixAutoUpdate = false;
    W.scene.add(mesh);
  }

  // ------------------------------------------------------------------ cold mist: ice dust drifting around you
  {
    const N = 900, R = 22;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N * 3; i++) pos[i] = (rng() * 2 - 1) * R;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    // soft dots whose screen size is clamped, so a mote drifting past your eye never fills the screen
    const dustMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uScale: { value: 180 } },
      vertexShader: `
        uniform float uScale;
        varying float vFade;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float d = -mv.z;
          gl_PointSize = clamp(0.07 * uScale / max(d, 0.01), 1.0, 5.0);
          vFade = smoothstep(0.6, 2.0, d) * (1.0 - smoothstep(14.0, 22.0, d));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vFade;
        void main() {
          float r = length(gl_PointCoord - 0.5);
          gl_FragColor = vec4(0.82, 0.92, 1.0, (1.0 - smoothstep(0.2, 0.5, r)) * 0.75 * vFade);
        }`,
    });
    const dust = new THREE.Points(geo, dustMat);
    dust.frustumCulled = false;
    dust.userData.noCull = true; // its particles wrap around the camera
    dust.visible = false;
    W.scene.add(dust);
    const wrap = (v, c) => ((((v - c + R) % (2 * R)) + 2 * R) % (2 * R)) - R + c;
    let t = 0;
    W.add({
      update(dt, player) {
        dust.visible = player.pos.x > 30;
        if (!dust.visible) return;
        t += dt;
        dustMat.uniforms.uScale.value = game.renderer.domElement.height / 2;
        const c = game.camera.position;
        for (let i = 0; i < N; i++) {
          const k = i * 3;
          pos[k] = wrap(pos[k] + Math.sin(t * 0.5 + i) * dt * 0.4, c.x);
          pos[k + 1] = wrap(pos[k + 1] - dt * (0.35 + (i % 7) * 0.07), c.y);
          pos[k + 2] = wrap(pos[k + 2] + Math.cos(t * 0.4 + i * 1.3) * dt * 0.3, c.z);
        }
        geo.attributes.position.needsUpdate = true;
      },
    });
  }

  devStart('azure', [27, 4, -112], -Math.PI / 2, [RED, YELLOW, GREEN]);
  devStart('azurelab', [100, -25, -146], 0, [RED, YELLOW, GREEN]);
  devStart('azurewell', [64, -25, -170], Math.PI / 2, [RED, YELLOW, GREEN]);
  devStart('azure2', [54, -56, -151.5], Math.PI, [RED, YELLOW, GREEN]);
  devStart('ascent', [47.4, -56, -136], Math.PI / 2, [RED, YELLOW, GREEN, BLUE]);
}
