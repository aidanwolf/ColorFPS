// AZURE — THE COLD DEEP. A drowned, frozen research station clinging to the walls of a vast crystal
// chasm east of the Hub, and the water engine that powers it. You come in with RED, YELLOW and GREEN and
// spiral DOWN; the AZURE core waits at the bottom, and with it in hand you climb back UP on the water.
//   FIRST HALF (this file, plus the Flooded Depths in azureFlooded.js):
//     entry skybridge (y 4) → Rim Deck (checkpoint; a BLUE hatch over a water pipe = a shortcut for later)
//     → the SHELF (platforming: a crumbling ice ledge over spikes you clear first, a crane trolley you
//       push across the gap by shooting it) → Pump Station (vent secret; a warm pump hut)
//     → the freight lift (shoot it to lower it) → TURBINE DECK (small fight; the way on is sealed until
//       it's clear) → THE FLOODED DEPTHS (swimming: sump, down-current pipe, air pockets, sub-drones, vortex
//       tubes, the ricochet ballast valve, a rising-water ride) → CRYO LAB (the ARENA: three waves; a
//       records room off it, with a BLUE-locked specimen vault) → the three-color Gauntlet → the WELL
//       (pillars over cryo-brine, the first one crumbles; then a flooded drop pipe through spike layers)
//     → Vault antechamber (the ricochet lock) → CORE SANCTUM (the AZURE core; its sentries wake).
//   SECOND HALF (azureSpillway.js): the Blue Span, the Undercroft, the Sluice, the Drowned Cistern
//     (Charybdis, the guardian, and the Azure Engine, the world's power source), and the way home: a chain
//     of jump pads up across the chasm to the Hub's east balcony port (x 25, y 12, z -136).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLORS, RED, YELLOW, GREEN, BLUE } from '../colors.js';
import { Barrier } from '../entities/barrier.js';
import { Drone } from '../entities/drone.js';
import { Checkpoint } from '../entities/misc.js';
import { Glass, TargetPanel, SlidingDoor } from '../entities/puzzle.js';
import { ShaftSpikes } from '../entities/spikeShield.js';
import { boxGeo } from '../materials.js';
import { buildAzureSpillway } from './azureSpillway.js';
import { dressAzure } from './azureDressing.js';

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

// ---- wayfinding helpers (playtest pass)
// Pulsing floor chevrons along paths of [x, y, z] points (each segment lies at its start point's y),
// pulses running toward the end of each path. One instanced draw per call; shown while active(player).
export function guideTrail(W, hex, paths, active) {
  const shape = new THREE.Shape();
  shape.moveTo(-0.45, -0.2);
  shape.lineTo(0, 0.25);
  shape.lineTo(0.45, -0.2);
  shape.lineTo(0.45, 0.05);
  shape.lineTo(0, 0.5);
  shape.lineTo(-0.45, 0.05);
  shape.closePath();
  const geo = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
  const marks = [];
  for (const pts of paths) {
    let s = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay, az] = pts[i], [bx, , bz] = pts[i + 1], len = Math.hypot(bx - ax, bz - az);
      const yaw = Math.atan2(-(bx - ax), -(bz - az));
      for (let d = i ? 0 : 0.8; d < len - 0.3; d += 1.5) marks.push({ x: ax + ((bx - ax) * d) / len, y: ay, z: az + ((bz - az) * d) / len, yaw, s: s + d });
      s += len;
    }
  }
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const mesh = new THREE.InstancedMesh(geo, mat, marks.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  const base = new THREE.Color(hex), col = new THREE.Color();
  marks.forEach((k, i) => {
    mesh.setMatrixAt(i, m4.compose(p.set(k.x, k.y + 0.04, k.z), q.setFromAxisAngle(up, k.yaw), one));
    mesh.setColorAt(i, col.copy(base).multiplyScalar(0.4));
  });
  mesh.userData.noCull = true; // spans whole areas; shown and hidden below
  mesh.renderOrder = 3;
  W.scene.add(mesh);
  let t = 0;
  W.add({
    update(dt, player) {
      mesh.visible = active(player);
      if (!mesh.visible) return;
      t += dt;
      marks.forEach((k, i) => {
        const wave = Math.pow(Math.max(0, Math.sin((k.s / 6 - t * 1.4) * Math.PI)), 6);
        mesh.setColorAt(i, col.copy(base).multiplyScalar(0.45 + 1.6 * wave));
      });
      mesh.instanceColor.needsUpdate = true;
    },
  });
  return mesh;
}

export function buildAzure(B) {
  const { W, game, level, CH, room, corridor, corridorX, tunnelX, plat, pedestal, secretRoom, trophy, hint, zoneTitle, area, light, barrierWallX, blocker, devStart, onRespawn } = B;
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
  level.azure = {}; // world state for guide.js (filled in below and by azureSpillway.js)

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
  // the craggy ice body under a ledge, with icicles under it
  function ledgeBody(x1, z1, x2, z2, top, depth = 3) {
    const za = Math.min(z1, z2), zb = Math.max(z1, z2);
    W.deco(x1 + 0.25, top - 0.6 - depth, za + 0.25, x2 - 0.25, top - 0.6, zb - 0.25, 'rock', zone);
    W.deco(x1 + 0.8, top - 0.6 - depth * 1.7, za + 0.8, x2 - 0.8, top - 0.6 - depth, zb - 0.8, 'rock', zone);
    icicles(x1 + 0.9, za + 0.9, x2 - 0.9, zb - 0.9, top - 0.6 - depth * 1.7, 5);
    keepOut.push([[x1, top - 1, za], [x2, top + 3, zb]]);
  }
  // an ice ledge: a neon-edged slab on a craggy ice body
  function ledge(x1, z1, x2, z2, top, depth = 3) {
    plat(x1, z1, x2, z2, top, zone);
    ledgeBody(x1, z1, x2, z2, top, depth);
  }
  // spikes covering a landing (shatter with the matching color, regrow after 3 s)
  const spikes = (x1, z1, x2, z2, top, color, regen = 3) =>
    new Barrier(W, { min: [x1, top, Math.min(z1, z2)], max: [x2, top + 0.6, Math.max(z1, z2)], color, kind: 'spike', regen, zone });
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
  // Doorways [y1, y2, z1, z2] cut out of every cliff box (collider and ice columns) on the east face:
  // the Flooded Depths' entry and exit tunnels, the Cryo Lab's records room and specimen vault, the Blue
  // Span's tunnel into the Undercroft, and the way home out onto the jump-pad chain.
  const CLIFF_DOORS = [[-22, -17.3, -116.6, -112.6], [-26, -21.3, -149, -145], [-25.5, -21, -171, -157], [-57, -52.3, -148, -144], [-8.7, -4, -157.6, -153.4]];
  function cliff(x1, y1, z1, x2, y2, z2, solid = false) {
    for (const [dy1, dy2, dz1, dz2] of CLIFF_DOORS) {
      if (x2 > 108 && x1 < 116 && y1 < dy2 && y2 > dy1 && z1 < dz2 && z2 > dz1) {
        if (y1 < dy1) cliff(x1, y1, z1, x2, dy1, z2, solid);
        if (y2 > dy2) cliff(x1, dy2, z1, x2, y2, z2, solid);
        const a = Math.max(y1, dy1), b = Math.min(y2, dy2);
        if (z1 < dz1) cliff(x1, a, z1, x2, b, dz1, solid);
        if (z2 > dz2) cliff(x1, a, dz2, x2, b, z2, solid);
        return;
      }
    }
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
  // West rim: low (top y 1), so the Hub's windows look over it into the abyss.
  cliff(32, -80, -196, 36, 1, -66, true);
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
  // (its floor leaves a hole over the Strut Drop's water pipe, x 53..56, z -113.5..-110.5)
  const HX1 = 53, HX2 = 56, HZ1 = -113.5, HZ2 = -110.5;
  for (const [a, b, c, d] of [[44, -120, HX1, -104], [HX2, -120, 58, -104], [HX1, -120, HX2, HZ1], [HX1, HZ2, HX2, -104]]) {
    W.box(a, 2.4, b, c, 4, d, 'floor', zone);
    W.deco(Math.max(a, 44.5), 0.6, Math.max(b, -119.5), Math.min(c, 57.5), 2.4, Math.min(d, -104.5), 'metal', zone);
  }
  icicles(45, -119, 52, -105, 0.6, 12);
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
  new Drone(W, { pos: [64, 8, -114], color: GREEN, range: 24 });
  keepOut.push([[25, 2, -121], [59, 14, -103]]);
  // (invisible) over the west, north and south rails: hop them and you'd land on the low west rim, cut
  // off from everything (the way down, east, stays open)
  blocker([43.7, 4, -120], [44.3, 30, -114]);
  blocker([43.7, 4, -110], [44.3, 30, -104]);
  blocker([44, 4, -120.3], [58.3, 30, -119.7]);
  blocker([44, 4, -104.3], [58.3, 30, -103.7]);

  // SHORTCUT (BLUE) — the STRUT DROP: the station's main strut is a flooded pipe. Break the blue hatch in
  // the deck and the current carries you 56 m straight down into the Core Sanctum (for a return trip once
  // you hold blue). Water fills it to just under the hatch; it spills out of its foot into a duct.
  new Barrier(W, { min: [HX1, 3.7, HZ1], max: [HX2, 4, HZ2], color: BLUE, kind: 'wall', zone });
  W.deco(HX1 - 0.3, 3.98, HZ1 - 0.3, HX2 + 0.3, 4.03, HZ1, 'hazard', zone);
  W.deco(HX1 - 0.3, 3.98, HZ2, HX2 + 0.3, 4.03, HZ2 + 0.3, 'hazard', zone);
  W.deco(HX1 - 0.3, 3.98, HZ1, HX1, 4.03, HZ2, 'hazard', zone);
  W.deco(HX2, 3.98, HZ1, HX2 + 0.3, 4.03, HZ2, 'hazard', zone);
  const SB = -52.8; // the pipe's foot (the duct's ceiling)
  W.box(HX1 - 0.5, SB, HZ1 - 0.5, HX1, 2.4, HZ2 + 0.5, 'metal', zone);
  W.box(HX2, SB, HZ1 - 0.5, HX2 + 0.5, 2.4, HZ2 + 0.5, 'metal', zone);
  W.box(HX1, SB, HZ1 - 0.5, HX2, 2.4, HZ1, 'metal', zone);
  W.box(HX1, SB, HZ2, HX2, 2.4, HZ2 + 0.5, 'metal', zone);
  for (const y of [-6, -22, -38]) W.deco(HX1 - 0.7, y, HZ1 - 0.7, HX2 + 0.7, y + 0.3, HZ2 + 0.7, 'glow3', zone);
  W.deco(HX1 - 0.5, -80, HZ1 - 0.5, HX2 + 0.5, -57, HZ2 + 0.5, 'metal', zone); // the strut's foot, down into the dark
  B.water([HX1, SB, HZ1], [HX2, 3.6, HZ2], { current: [0, -7.5, 0] });
  // the duct at its foot runs north into the sanctum's south wall
  W.box(HX1 - 0.5, -57, -122, HX2 + 0.5, -56, HZ2 + 0.5, 'floor', zone);
  W.box(HX1 - 0.5, -56, -122, HX1, SB, HZ2 + 0.5, 'metal', zone);
  W.box(HX2, -56, -122, HX2 + 0.5, SB, HZ2 + 0.5, 'metal', zone);
  W.box(HX1, -56, HZ2, HX2, SB, HZ2 + 0.5, 'metal', zone);
  W.box(HX1 - 0.5, SB, -122, HX2 + 0.5, SB + 0.5, HZ1 - 0.5, 'ceil', zone);
  W.deco(HX1, -55.98, -122, HX1 + 0.06, -55.9, HZ2, 'glow3', zone);
  W.deco(HX2 - 0.06, -55.98, -122, HX2, -55.9, HZ2, 'glow3', zone);
  hint([HX1 - 1, 4, HZ1 - 1], [HX2 + 1, 7, HZ2 + 1], 'A hatch of <b style="color:#3a8bff">AZURE</b> light over a flooded pipe. Something for later.', 4);
  hint([HX1, -20, HZ1], [HX2, 0, HZ2], 'The current drags you down the strut. Hold <b>C</b> to dive faster.', 4);
  keepOut.push([[HX1 - 1, -57, -123], [HX2 + 1, 6, HZ2 + 1]]);

  // ------------------------------------------------------------------ the SHELF: ice ledges stepping down and east
  // PLATFORMING 1. The first ledge crumbles under you (cracks show it), and the next is crusted with GREEN
  // spikes: clear them from the deck before you drop, then don't stop moving.
  B.crumble({ min: [60, 1.6, -106], max: [64, 2.2, -101], delay: 0.8, respawn: 3, zone });
  ledgeBody(60, -101, 64, -106, 2.2);
  hint([53, 4, -109], [58, 7, -104], 'Ice-crusted spikes still answer to <b>their own color</b>. Clear them before you land — and <b>keep moving</b>: old ice doesn\'t hold.', 5);
  ledge(66.5, -95.5, 70.5, -99.5, 0.4);
  spikes(66.5, -95.5, 70.5, -99.5, 0.4, GREEN, 4);
  ledge(73, -84, 82, -93, -2, 6); // the big ice shelf
  cluster(81, -2, -84.6, 2.6, 'ice', 0.3, 0.3);
  cluster(73.6, -2, -92.4, 3.2, 'glow', -0.3, -0.2);
  new Drone(W, { pos: [78, 2.5, -81], color: YELLOW, range: 22 });
  // a crane trolley hangs over the 17 m gap to the pump station. It only moves when shot: ride it and
  // keep shooting it (YELLOW) and it rolls east; stop and it drifts back. The red drone wants you to switch.
  B.shotMover({ min: [84, -3.4, -91.5], max: [87.5, -2.8, -88], path: [12, 0, 0], color: YELLOW, mode: 'push', kick: 1.3, speed: 6, back: 0.9, hold: 0.9, zone });
  W.deco(83, 3, -90.1, 100, 3.5, -89.4, 'metal', zone);
  W.deco(83, 3.5, -90, 100, 3.56, -89.5, 'glow3', zone);
  for (const x of [84.5, 99.2]) W.deco(x, -2.6, -89.9, x + 0.3, 3, -89.6, 'metal', zone);
  hint([73, -2, -93], [82, 1, -84], 'The crane trolley <b>moves when shot</b>. Hop on and keep firing <b style="color:#ffd23a">yellow</b> into it to ride it across.', 5);
  new Drone(W, { pos: [91, 2, -96], color: RED, range: 22 });
  keepOut.push([[82, -4, -92], [101, 4, -87]]);

  // ------------------------------------------------------------------ Pump Station (y -4.5)
  W.box(99, -5.5, -96, 110, -4.5, -78, 'floor', zone);
  W.deco(102, -40, -90, 106, -5.5, -84, 'metal', zone);
  icicles(99.5, -95.5, 109.5, -78.5, -5.5, 16);
  // the pump hut: small, warm and humming (a story nook: the recorder goes by the boiler)
  room({ x1: 104, x2: 109.5, zS: -80, zN: -88, y: -4.5, h: 3.5, zone, floor: false, w: [{ c: -84, w: 3, h: 3 }], e: [{ c: -84, w: 1.2, h: 1.0 }] });
  W.box(108.2, -4.5, -81.6, 109.5, -2.6, -80, 'metal', zone); // the boiler
  W.deco(108.15, -3.9, -81.5, 108.2, -3.1, -80.1, 'glow1', zone);
  W.deco(108.15, -3.0, -81.5, 108.2, -2.9, -80.1, 'glow0', zone);
  W.box(104.2, -4.5, -87.8, 106.6, -3.7, -86.6, 'metal', zone); // a cot
  W.deco(104.3, -3.7, -87.7, 106.5, -3.6, -86.7, 'trimWhite', zone);
  new Checkpoint(W, game, { pos: [101.5, -4.5, -87], yaw: 0, size: [4, 3, 6] });
  hint([99, -4.5, -96], [104, -1.5, -91], 'A freight lift below, frozen in its tracks. <b>Shoot it</b> to work it down.', 4);
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
  // SHOOT-TO-MOVE: the freight lift drops one notch (3 m) per GREEN hit, down to the turbine deck
  B.shotMover({ min: [100, -9, -110.5], max: [104, -8.4, -106.5], path: [0, -12, 0], color: GREEN, mode: 'step', step: 3, speed: 3.2, zone });
  for (const [x, z] of [[99.6, -106.9], [104.2, -106.9], [99.6, -110.9], [104.2, -110.9]]) W.deco(x - 0.2, -22, z - 0.2, x + 0.2, -6, z + 0.2, 'metal', zone);
  W.deco(99.4, -6, -111.1, 104.6, -5.7, -106.3, 'glow3', zone);
  // turbine deck
  W.box(96, -22, -122, 108, -21, -113, 'floor', zone);
  icicles(96.5, -121.5, 107.5, -113.5, -22, 12);
  W.box(104, -21, -121, 107.5, -16, -116, 'metal', zone); // frozen turbine housing
  W.deco(103.9, -18.8, -121.1, 107.6, -18.5, -115.9, 'glow3', zone);
  cluster(107, -16, -120.5, 2.4, 'ice', 0.2, -0.2);
  // ARMOR: in the dead-end strip behind the turbine housing (over the drop, out of the turret's sight), and
  // over the deck's west edge (lean out).
  B.armor([105.75, -21, -121.5]);
  B.armor([95.3, -21, -117.5], { base: false });
  // COMBAT (small): the deck's sentries wake as you land; the hatch into the Flooded Depths (its entry
  // tunnel leaves the deck's east edge at z -114.6) stays sealed until they're down
  B.encounter({
    trigger: [[96, -21, -122], [104, -17, -113]],
    seals: [{ min: [107.6, -21, -116.1], max: [108.2, -17.8, -113.1], closed: true }],
    title: 'TURBINE DECK', sub: 'SENTRIES WAKING', color: '#3a8bff', music: 'music_combat', zone,
    checkpoint: { pos: [102, -21, -115], yaw: -Math.PI / 2 },
    waves: [
      [
        { type: 'drone', pos: [100, -17, -119], color: RED },
        { type: 'turret', pos: [103.95, -18.2, -118.5], color: GREEN, mount: [-1, 0, 0], delay: 0.6 }, // on the turbine housing's west face
        { type: 'drone', pos: [98, -16, -116], color: YELLOW, delay: 1.2 },
      ],
      [
        { type: 'swarm', pos: [101, -16.5, -117], color: [RED, YELLOW, GREEN], count: 5 },
        { type: 'drone', pos: [97.5, -17, -120], color: [RED, GREEN], cycle: 2.2, delay: 1.4 },
      ],
    ],
  });
  hint([96, -21, -122], [104, -18, -116], 'The turbine deck\'s sentries are waking. <b>Clear them</b> to unseal the hatch east.', 4);
  keepOut.push([[95, -23, -123], [109, -15, -98]]);
  keepOut.push([[107, -23, -118], [117, -16, -111]], [[107, -27, -150.5], [117, -20, -143.5]]); // the Flooded Depths' tunnels

  // ------------------------------------------------------------------ Cryo Lab (y -25): THE ARENA
  W.box(92, -26, -152.5, 108, -25, -142, 'floor', zone); // porch
  W.deco(96, -60, -152, 104, -26, -149.5, 'metal', zone);
  // rails (the east one is open at z -148.5..-145.5, where the Flooded Depths' exit tunnel arrives)
  for (const [x1, x2, z1, z2] of [[92, 92.3, -152.5, -142], [107.7, 108, -152.5, -148.5], [107.7, 108, -145.5, -142]]) W.box(x1, -25, z1, x2, -23.9, z2, 'metal', zone);
  new Checkpoint(W, game, { pos: [100, -25, -146], yaw: 0, size: [6, 3, 4] });
  area([92, -25, -152.5], [108, -21, -148], DEEP);
  room({ x1: 88, x2: 108, zS: -153, zN: -175, y: -25, h: 8, zone, s: [{ c: 100, w: 3, h: CH }], w: [{ c: -170, w: 3, h: CH }], e: [{ c: -160.75, w: 2.2, h: 2.8 }] });
  // specimen tanks (glass: cover from drone fire)
  for (const z of [-158, -163.5, -169]) {
    W.box(103.8, -25, z - 1.5, 106.8, -24.4, z + 1.5, 'metal', zone);
    W.box(103.8, -19.6, z - 1.5, 106.8, -19, z + 1.5, 'metal', zone);
    new Glass(W, { min: [104, -24.4, z - 1.3], max: [106.6, -19.6, z + 1.3] });
    cluster(105.3, -24.4, z, 3.6, 'glow', 0, 0, 4);
  }
  W.box(93.5, -25, -161, 96, -23.5, -158.5, 'metal', zone);
  W.box(96.5, -25, -168, 99, -23.8, -165.5, 'metal', zone);
  W.box(90, -25, -165, 91.5, -22.8, -162, 'metal', zone);
  W.deco(88, -18.4, -164.6, 108, -17.8, -163.8, 'metal', zone);
  W.deco(88, -18.4, -160.6, 108, -17.8, -159.8, 'metal', zone);
  light(97, -18.6, -164, 0x86c8ff, 34, 28);
  // ARMOR: tucked behind the specimen tanks against the east wall, and up on the crate by the south-west
  // corner (where the brute comes in).
  B.armor([107.35, -25, -166.25]);
  B.armor([94.75, -23.5, -159.75]);
  new Checkpoint(W, game, { pos: [90.5, -25, -170], yaw: Math.PI / 2, size: [3, 3, 3] });
  B.encounter({
    trigger: [[89, -25, -171], [107, -20, -156]],
    seals: [
      { min: [98.5, -25, -153.2], max: [101.5, -21.8, -152.4] }, // the way in slams shut behind you
      { min: [87.4, -25, -171.5], max: [88.1, -21.8, -168.5], color: GREEN, closed: true }, // the way on (west)
    ],
    title: 'CRYO LAB', sub: 'CONTAINMENT BREACH', color: '#3a8bff', music: 'music_combat', zone, resume: true,
    checkpoint: { pos: [90.5, -25, -170], yaw: Math.PI / 2 },
    waves: [
      [
        { type: 'drone', pos: [93, -21, -160], color: RED },
        { type: 'drone', pos: [102, -20.5, -170], color: YELLOW },
        { type: 'drone', pos: [96, -20, -166], color: GREEN, delay: 1.2 },
      ],
      [
        { type: 'turret', pos: [98, -17.05, -166], colors: [RED, YELLOW, GREEN], mount: 'ceiling' },
        { type: 'swarm', pos: [95, -20, -171], color: [GREEN, YELLOW], count: 6, delay: 1.4 },
        { type: 'drone', pos: [102, -20, -158], color: [RED, GREEN], cycle: 2.2, delay: 2.4 },
      ],
      { title: 'HEAVIES', enemies: [
        { type: 'warden', pos: [97, -20, -167], shield: GREEN, core: RED },
        { type: 'brute', pos: [94, -24.5, -158], color: YELLOW, delay: 1.5 },
        { type: 'drone', pos: [104, -20, -172], color: RED, delay: 2.5 },
        { type: 'drone', pos: [91, -20, -156], color: [YELLOW, GREEN], cycle: 2, delay: 3.2 },
      ] },
    ],
  });
  // RECORDS ROOM (a story nook, off the lab's east wall, cut into the cliff): filing racks and the index
  // terminal of every sleeper the station keeps. Its back wall holds the BLUE-locked specimen vault.
  {
    const x1 = 108.5, x2 = 115, zS = -157.6, zN = -164, y = -25, h = 3.6;
    W.box(x1, y - 1, zN - 0.5, x2 + 0.5, y, zS + 0.5, 'floor', zone);
    W.box(x1, y + h, zN - 0.5, x2 + 0.5, y + h + 0.5, zS + 0.5, 'ceil', zone);
    W.box(x1, y, zS, x2 + 0.5, y + h, zS + 0.5, 'wall', zone);
    W.box(x2, y, zN, x2 + 0.5, y + h, zS, 'wall', zone);
    B.wallX(zN - 0.5, zN, x1, x2 + 0.5, y, y + h, [{ c: 113, w: 3, y0: y, h: 3 }], zone);
    for (const z of [-158.2, -162.4]) { // (the north row stands clear of the back wall: the vault door is behind it)
      for (let x = 109.4; x < 114; x += 1.5) {
        W.box(x, y, z - 0.35, x + 1.2, y + 2.4, z + 0.35, 'metal', zone);
        W.deco(x + 0.1, y + 1.6, z - 0.37, x + 1.1, y + 1.66, z + 0.37, 'glow3', zone);
      }
    }
    W.box(114.6, y, -162, 115, y + 2.8, -159.5, 'metal', zone); // the index terminal: rows of names scrolling by
    for (let k = 0; k < 7; k++) W.deco(114.55, y + 1.1 + k * 0.2, -161.7, 114.6, y + 1.16 + k * 0.2, -161.7 + 1.2 + ((k * 7) % 5) * 0.18, k % 3 ? 'glow3' : 'trimWhite', zone);
    hint([x1, y, -163], [x2, y + 3, -158], 'Station records. Every sleeper in the cryo vault, indexed.', 3);
    // SECRET (BLUE) — the specimen vault behind it
    new Barrier(W, { min: [111.5, y, zN - 0.45], max: [114.5, y + 3, zN - 0.05], color: BLUE, kind: 'wall', zone });
    const vN = -170.5;
    W.box(x1, y - 1, vN - 0.5, x2 + 0.5, y, zN - 0.5, 'floor', zone);
    W.box(x1, y + h, vN - 0.5, x2 + 0.5, y + h + 0.5, zN - 0.5, 'ceil', zone);
    W.box(x1, y, vN - 0.5, x2 + 0.5, y + h, vN, 'wall', zone);
    W.box(x2, y, vN, x2 + 0.5, y + h, zN - 0.5, 'wall', zone);
    for (const x of [109.6, 111.4]) {
      W.box(x - 0.6, y, vN + 0.1, x + 0.6, y + 0.4, vN + 1.3, 'metal', zone);
      W.box(x - 0.6, y + 2.8, vN + 0.1, x + 0.6, y + 3.1, vN + 1.3, 'metal', zone);
      new Glass(W, { min: [x - 0.5, y + 0.4, vN + 0.2], max: [x + 0.5, y + 2.8, vN + 1.2] });
      cluster(x, y + 0.4, vN + 0.7, 2, 'glow', 0, 0, 3);
    }
    trophy(113.5, y + 1, -168);
    secretRoom([x1, y, vN], [x2, y + 3, zN - 0.5], 'Specimen Vault');
  }
  keepOut.push([[107, -26, -172], [117, -20, -156]]);

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
  // PLATFORMING 2. The first pillar crumbles (move on at once); the others are crusted with spikes.
  room({ x1: 50, x2: 66, zS: -158, zN: -182, y: -47, h: 29, zone, floor: false, e: [{ c: -170, w: 3, h: CH, y0: 22 }] });
  // floor slab (the antechamber's ceiling) with the drop hole at x 60..64, z -164.5..-160.5
  W.box(49.5, -47.5, -182.5, 66.5, -46.5, -164.5, 'ceil', zone);
  W.box(49.5, -47.5, -160.5, 66.5, -46.5, -157.5, 'ceil', zone);
  W.box(49.5, -47.5, -164.5, 60, -46.5, -160.5, 'ceil', zone);
  W.box(64, -47.5, -164.5, 66.5, -46.5, -160.5, 'ceil', zone);
  brine(50, -182, 57, -158, -46);
  brine(57, -182, 66, -166.5, -46);
  // the pit platform around the hole
  W.box(57, -46.5, -166.5, 60, -44.2, -158, 'floor', zone); // (a wide west lip to land on from the last pillar)
  W.box(64, -46.5, -166.5, 66, -44.2, -158, 'floor', zone);
  W.box(60, -46.5, -166.5, 64, -44.2, -164.5, 'floor', zone);
  W.box(60, -46.5, -160.5, 64, -44.2, -158, 'floor', zone);
  // a glowing frame round the hole
  W.deco(59.85, -44.2, -164.65, 64.15, -44.14, -164.5, 'glow3', zone);
  W.deco(59.85, -44.2, -160.5, 64.15, -44.14, -160.35, 'glow3', zone);
  W.deco(59.85, -44.2, -164.5, 60, -44.14, -160.5, 'glow3', zone);
  W.deco(64, -44.2, -164.5, 64.15, -44.14, -160.5, 'glow3', zone);
  W.box(62, -26, -172, 66, -25, -168, 'floor', zone); // catwalk from the gauntlet
  new Checkpoint(W, game, { pos: [64, -25, -170], yaw: Math.PI / 2, size: [3, 3, 3] });
  area([62, -25, -172], [66, -22, -168], DEEP);
  hint([62, -25, -172], [66, -22, -168], 'Cryo-brine below — <b>one touch freezes you solid</b>. Work your way down to the hole; the first ice pillar is rotten.', 5);
  // ledges on ice pillars rising from the brine
  const pillarBody = (x1, z1, x2, z2, top) => {
    W.deco(x1 + 0.4, -46.5, Math.min(z1, z2) + 0.4, x2 - 0.4, top - 0.6, Math.max(z1, z2) - 0.4, 'rock', zone);
    keepOut.push([[x1, top - 1, Math.min(z1, z2)], [x2, top + 3, Math.max(z1, z2)]]);
  };
  const pillar = (x1, z1, x2, z2, top) => {
    pillarBody(x1, z1, x2, z2, top);
    plat(x1, z1, x2, z2, top, zone);
  };
  // the rotten one: it holds for a moment, cracking, then breaks away (it reforms in 3 s)
  pillarBody(60, -177, 64, -181, -28.5);
  B.crumble({ min: [60, -29.1, -181], max: [64, -28.5, -177], delay: 0.9, respawn: 3, zone });
  pillar(52, -177, 56, -181, -32);
  pillar(51, -168, 54.5, -172, -35.5);
  spikes(51, -168, 54.5, -172, -35.5, GREEN);
  pillar(51, -159, 55, -163, -39);
  spikes(51, -159, 55, -163, -39, RED);
  new Drone(W, { pos: [57, -27.5, -174], color: YELLOW, range: 22 }); // (level with the catwalk, where you can see it)
  keepOut.push([[57, -47, -167], [66, -40, -158], [60, -26, -173], [66, -20, -167]]);
  for (const [x, z, tx, tz] of [[50.6, -181.4, 0.3, 0.3], [65.4, -181.4, -0.3, 0.3], [50.6, -158.6, 0.3, -0.3], [56, -181.6, 0, 0.35]]) cluster(x, -46.2, z, 3 + rng() * 3, 'ice', tx, tz);
  for (let i = 0; i < 10; i++) cluster(50.3, -44 + rng() * 22, -160 - rng() * 21, 1.5 + rng() * 2, 'ice', 1.2, 0, 4);
  for (let i = 0; i < 10; i++) cluster(51 + rng() * 14, -44 + rng() * 22, -181.7, 1.5 + rng() * 2, 'ice', 0, 1.2, 4);

  // The drop: a FLOODED pipe under the hole with a downward current (a slow fall) through two spike
  // layers under a red grate: shoot each one as you sink toward it (the first can be shot from the rim,
  // down through the water). The water's underside hangs in the pipe's mouth, 2 m above the antechamber floor.
  W.box(59.5, -53.9, -165, 60, -47.5, -160, 'metal', zone);
  W.box(64, -53.9, -165, 64.5, -47.5, -160, 'metal', zone);
  W.box(59.5, -53.9, -165, 64.5, -47.5, -164.5, 'metal', zone);
  W.box(59.5, -53.9, -160.5, 64.5, -47.5, -160, 'metal', zone);
  B.water([60, -53.9, -164.5], [64, -44.6, -160.5], { current: [0, -2.6, 0] }); // (its surface just under the grate)
  // a RED grate seals the mouth (so nobody tumbles in by accident); once shot it stays open
  new Barrier(W, { min: [60, -44.55, -164.5], max: [64, -44.2, -160.5], color: RED, kind: 'wall', zone });
  // (shaft layers: a broken one won't regrow while you're still in the pipe above it)
  for (const [y, color] of [[-49.6, YELLOW], [-52.6, GREEN]]) new ShaftSpikes(W, { min: [60, y, -164.5], max: [64, y + 0.6, -160.5], color, regen: 3, zone, top: -40 });
  for (const y of [-48.4, -51.4]) {
    W.deco(60, y, -164.5, 60.05, y + 0.08, -160.5, 'glow3', zone);
    W.deco(63.95, y, -164.5, 64, y + 0.08, -160.5, 'glow3', zone);
  }
  hint([59, -44.2, -166], [65, -41, -159], 'A flooded drop pipe under a <b style="color:#ff3344">red</b> grate: the current lets you down slowly. <b>Shoot each spike layer</b> before you sink onto it — <b style="color:#ffd23a">yellow</b>, then <b style="color:#3dff7a">green</b>.', 6);

  // ------------------------------------------------------------------ Vault antechamber (y -56): the ricochet lock
  // PUZZLE: the vault door's lock sits behind glass in an alcove whose ceiling and walls are AZURE energy
  // panels; every color you hold ricochets off them, so a yellow shot over the glass lands on the target.
  room({ x1: 50, x2: 66, zS: -158, zN: -182, y: -56, h: 9, zone, ceiling: false, s: [{ c: 54, w: 3, h: CH }], w: [{ c: -172, w: 3, h: 4 }] });
  new Checkpoint(W, game, { pos: [62, -56, -163.5], yaw: Math.PI / 2, size: [5, 3, 6] }); // (where the drop pipe lets you out)
  const vaultDoor = new SlidingDoor(W, { min: [52.5, -56, -158], max: [55.5, -52.8, -157.5], color: YELLOW, zone });
  {
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
    level.azure.vaultDoor = vaultDoor;
  }
  hint([50, -56, -176], [56, -53, -168], 'The vault lock sits <b>behind the glass</b>. Azure panels deflect every other color…', 6);
  new Drone(W, { pos: [52.5, -52, -178.5], color: RED, range: 12 }); // (kept well clear of the drop pipe's mouth)
  corridor({ zStart: -157.5, zEnd: -150.5, y: -56, zone, cx: 54 });
  new Checkpoint(W, game, { pos: [54, -56, -153], yaw: Math.PI, size: [3, 3, 2] });

  // ------------------------------------------------------------------ Core Sanctum (y -56): the BLUE core
  // n: from the vault; s: the Strut Drop's duct (the shortcut from the Rim Deck); e: the BLUE door out onto
  // the Blue Span and the second half of the world (azureSpillway.js).
  room({ x1: 52, x2: 80, zS: -122, zN: -150, y: -56, h: 14, zone, n: [{ c: 54, w: 3, h: CH }], s: [{ c: 54.5, w: 3, h: CH }], e: [{ c: -146, w: 3, h: CH }] });
  area([52.5, -56, -150], [55.5, -53, -147], DEEP);
  // its roof is a bed of ice spikes (nothing lands up there and lives)
  W.box(51.5, -41.5, -150.5, 80.5, -41.1, -121.5, 'rock', zone, { hazard: 'spike' });
  for (let i = 0; i < 40; i++) shard(52.5 + rng() * 27, -41.1, -149.5 + rng() * 27, 1 + rng() * 2.5, 0.25 + rng() * 0.2, (rng() - 0.5) * 0.5, (rng() - 0.5) * 0.5, 'glow');
  W.box(64, -56, -140, 72, -55.6, -132, 'metal', zone); // dais
  W.deco(63.9, -55.66, -140.1, 72.1, -55.6, -131.9, 'glow3', zone);
  const core = pedestal(68, -55.6, -136, BLUE, zone);
  light(68, -46, -136, 0x3a8bff, 50, 32);
  keepOut.push([[52, -56, -152], [62, -52, -147], [52, -56, -138], [80, -52, -134], [62, -56, -142], [74, -50, -130], [52, -57, -126], [58, -52, -120], [72, -57, -148.5], [82, -52, -143.5]]);
  // a geode of crystals: floor clusters, wall growths, stalactites
  for (let i = 0; i < 22; i++) {
    const a = rng() * Math.PI * 2, r = 7 + rng() * 6;
    cluster(68 + Math.cos(a) * r, -56, -136 + Math.sin(a) * r * 0.9, 2 + rng() * 4.5, i % 3 ? 'ice' : 'glow', Math.cos(a) * 0.35, Math.sin(a) * 0.35);
  }
  for (let i = 0; i < 18; i++) shard(53 + rng() * 26, -42.1, -149 + rng() * 26, 1.5 + rng() * 3.5, 0.2 + rng() * 0.25, 0, Math.PI, rng() < 0.4 ? 'glow' : 'ice');
  // COMBAT (small): grabbing the core wakes the sanctum's azure sentries: try out the new color at once
  const grant = core.onCollect;
  core.onCollect = (pk, pl) => {
    grant(pk, pl);
    for (const [pos, color, t] of [[[57, -49, -126], BLUE, 2.5], [[78, -49, -146], BLUE, 3.3], [[75, -48, -126], [BLUE, RED], 4.2]]) {
      const d = new Drone(W, { pos, color, range: 30, cycle: 2.4 });
      d.fireTimer = t; // a beat to switch to the new color first
      d.aggro = true;
    }
  };
  // the door out: only AZURE opens it
  barrierWallX(80.25, -56, BLUE, zone, -146);
  hint([74, -56, -149], [80, -53, -143], 'The way on is sealed with <b style="color:#3a8bff">AZURE</b> light.', 4);

  // ------------------------------------------------------------------ the second half
  buildAzureSpillway(B, { zone, MOOD, DEEP, keepOut });

  // ------------------------------------------------------------------ crystals of the chasm
  // keep the big structures clear of them
  keepOut.push(
    [[51, -57, -151], [81, -40, -121]], [[44, -57, -183], [67, -17, -157]], [[87, -26, -176], [109, -16, -152]],
    [[66, -26, -172.5], [88, -21, -167.5]], [[24, 10, -140], [48, 17, -132]],
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
  level.azure.crystalMats = { ice: iceMat, glow: glowMat, deep: deepMat }; // dimmed when the engine stops
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

  // ---- wayfinding (playtest pass)
  // The Well's ice pillars were near-invisible in the gloom and the way off the Rim Deck wasn't marked.
  const BLUE_HEX = COLORS[BLUE].hex;
  guideTrail(W, BLUE_HEX, [
    [[47.5, 4, -112], [52, 4, -107.2], [57.6, 4, -106.5]], // Rim Deck → the gap in the rail
  ], (pl) => pl.pos.x > 25 && pl.pos.y > 0);
  // the sanctum's way out: once you hold blue, a trail from the pedestal to the blue door
  guideTrail(W, BLUE_HEX, [[[71.6, -56, -138], [76, -56, -146], [79.6, -56, -146]]], (pl) => pl.pos.y < -50 && pl.pos.x < 81 && pl.pos.z > -151 && game.blaster.unlocked[BLUE]);
  // ...and band each pillar's lip with light, so the ledges read against the gloom from the catwalk
  for (const [x1, z1, x2, z2, top] of [[60, -181, 64, -177, -28.5], [52, -181, 56, -177, -32], [51, -172, 54.5, -168, -35.5], [51, -163, 55, -159, -39], [57, -166.5, 66, -158, -44.2]]) {
    const y1 = top - 0.5, y2 = top - 0.3, o = 0.04;
    W.deco(x1 - o, y1, z1 - o, x2 + o, y2, z1, 'glow3', zone);
    W.deco(x1 - o, y1, z2, x2 + o, y2, z2 + o, 'glow3', zone);
    W.deco(x1 - o, y1, z1, x1, y2, z2, 'glow3', zone);
    W.deco(x2, y1, z1, x2 + o, y2, z2, 'glow3', zone);
  }

  // ---- set dressing: pipes, signage, windows onto the sea, caustics, mist, machine halls (azureDressing.js)
  dressAzure(B, { zone });

  const RYG = [RED, YELLOW, GREEN];
  devStart('azure', [27, 4, -112], -Math.PI / 2, RYG);
  devStart('azure1', [47, 4, -112], -Math.PI / 2, RYG); // the Rim Deck, before the Shelf
  devStart('azure2', [101.5, -4.5, -92], Math.PI, RYG); // the Pump Station, before the freight lift
  devStart('azurelab', [100, -25, -146], 0, RYG); // the Cryo Lab porch, before the arena
  devStart('azurewell', [64, -25, -170], Math.PI / 2, RYG);
  devStart('azure4', [62, -56, -167.5], Math.PI / 2, RYG); // the vault antechamber (ricochet lock)
  devStart('azure5', [54, -56, -151.5], Math.PI, RYG); // the Core Sanctum, before the core
}
