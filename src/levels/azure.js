// AZURE — THE DROWNED REACH. A harvest rig standing in a vast tropical ocean east of the Hub, and the
// drowned station under it: undersea habitats clinging to the floor and walls of a colossal trench, and
// the deep-sea engine that drinks the ocean's power. A storm rolls across a bright tropical sky up top
// (azureRain.js, azureOcean.js); down below it's caustic light, kelp, reef and the dark (azureTrench.js).
// You come in with RED, YELLOW and GREEN, and the sea takes you almost at once; from then on it's the
// rhythm of the deep: breathable spaces and the swims between them, and the water cannon (the AZURE core,
// in the Aquarium) is the key to everything: slicks, ballast, seals and shock water (entities/waterPuzzle.js).
//   THE RIG (y 4, azureRig.js): the Hub's skybridge out onto the harvest rig's deck, over open sea. The first
//     time you step out, THE ROGUE WAVE sweeps you off it; you wake on the trench floor, far below, with
//     a little air left and the Aquarium's airlock a short swim away (a bubble vent on the way).
//   THE AQUARIUM (y -60, this file; pieces from azureHabitat.js): the airlock → a glass corridor (the
//     Leviathan, far off in the blue) → the observation gallery (Log 10) → a glass tube (it passes close) →
//     THE DOME: the AZURE core on its dais; the first SLICK LEAP over the flooded channel; then the fight
//     under the glass (junction boxes to short into soaked robots). Its moon pool opens: SWIM up past an
//     air bell to THE CREW DECK (y -21; Log 11), whose hatch opens into the hull → THE FLOODED DEPTHS
//     (azureFlooded.js: the Sump's seal path, the Downpipe, the Bell (Log 12), the Kelp Gallery, the Ballast
//     Shaft) → THE ARCHIVE (the Lumen's catalogue of sleepers; two leaking counterweight tanks to fill while
//     its sentries fight you; a crusted feed pipe the sun beam bakes clear; its records room: Log 13) →
//     THE BREAKER HALL (a live floor, insulated grates, robots to lure into the water, a green-caged breaker
//     for the forcefield out) → the WELL (rock pillars over scalding brine, the flooded drop pipe) → Vault
//     antechamber (the ricochet lock) → THE GENERATOR HALL: THE DYNAMO (the mini-boss: soak the floor,
//     short its conduits).
//   SECOND HALF (azureSpillway.js): out through the hall's sea door and across the open trench to the
//     hull, the Undercroft (a fight, then the maintenance seal's chase), the Sluice, THE INTAKE (Charybdis,
//     the guardian, and the Azure Engine, the world's power source), and the way home: the rig's waterline
//     deck and a chain of jump pads up across the sea to the Hub's east balcony port (x 25, y 12, z -136).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLORS, RED, YELLOW, GREEN, BLUE } from '../colors.js';
import { Barrier } from '../entities/barrier.js';
import { Drone } from '../entities/drone.js';
import { Checkpoint } from '../entities/misc.js';
import { Glass, TargetPanel, SlidingDoor } from '../entities/puzzle.js';
import { ShaftSpikes } from '../entities/spikeShield.js';
import { boxGeo, mat } from '../materials.js';
import { buildAzureSpillway } from './azureSpillway.js';
import { dressAzure } from './azureDressing.js';
import { buildRain } from './azureRain.js';
import { buildOcean, oceanVolumes, addCaustics, SEA_Y, SUN_DIR } from './azureOcean.js';
import { makeHabitat, Airlock } from './azureHabitat.js';
import { buildTrench, FLOOR_Y } from './azureTrench.js';
import { buildRig, WAKE_AIR, WAVE_FLAG } from './azureRig.js';
import { buildTurbine } from './azureTurbine.js';
import { WaterTank, PulleyGate, Junction, LivePool, Forcefield, Gantry, LeapHint, CrustPlug } from '../entities/waterPuzzle.js';
import { Dynamo } from '../entities/dynamo.js';
import { audio } from '../audio.js';

const _pour = new THREE.Vector3(), _pourC = new THREE.Color(0xbfe6ff), _pourC2 = new THREE.Vector3();
audio.manifest?.then(() => audio.prefetch(['music_azure', 'amb_ocean_storm', 'amb_ocean_calm', 'amb_abyss', 'waves_crash']));

// tiny seeded RNG so the reef growths and cliffs come out the same every load
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
  const { W, game, level, CH, room, corridor, corridorX, plat, pedestal, secretRoom, trophy, hint, zoneTitle, area, light, barrierWallX, blocker, devStart, onRespawn, glowEdge } = B;
  const zone = 'blue';
  const rng = mulberry32(0xa2e5e);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // ------------------------------------------------------------------ mood
  const AZURE = {
    // up top: a tropical storm rolling across a big blue sky (azureOcean.js draws its clouds, sun and rainbow)
    fog: 0x86a6b8, fogNear: 40, fogFar: 430,
    skyTop: [0.09, 0.28, 0.7], skyMid: [0.27, 0.52, 0.86], skyHorizon: [0.62, 0.75, 0.84], aurora: 0, stars: 0,
    hemiSky: 0xd2e8ff, hemiGround: 0x24565e, hemiIntensity: 1.25,
    sunColor: 0xfff0d6, sunIntensity: 1.75, sunDir: SUN_DIR.toArray(),
    exposure: 1.0, bloom: 0.55,
  };
  level.atmospheres.azure = AZURE;
  // the open sea under the waves (the fog itself is set by azureOcean's level.waterFog while you swim)
  level.atmospheres.azureSea = { ...AZURE, fog: 0x0e4a5e, fogNear: 1, fogFar: 50, hemiSky: 0x7fdcea, hemiGround: 0x0a2a30, hemiIntensity: 1.05, sunColor: 0x9fe8ff, sunIntensity: 0.6, sunDir: [0.1, 1, 0.05], exposure: 1.0, bloom: 0.72 };
  // inside the habitats: the sea's blue-green dusk through the glass
  level.atmospheres.azureDeep = { ...AZURE, fog: 0x0f4a62, fogNear: 6, fogFar: 70, hemiSky: 0xa6d8ff, hemiGround: 0x10343c, hemiIntensity: 1.0, sunColor: 0x8fe0ff, sunIntensity: 0.38, sunDir: [0.2, 1, 0.1], exposure: 0.98, bloom: 0.66 };
  const MOOD = { music: 'music_azure', ambient: 'amb_ocean_storm', atmosphere: 'azure' };
  const DEEP = { music: 'music_azure', ambient: 'amb_abyss', atmosphere: 'azureDeep' };
  level.azure = {}; // world state for guide.js (filled in below and by azureSpillway.js)
  const airs = []; // every breathable space under the sea: cut out of the ocean at the end
  const hab = makeHabitat(B, { zone, airs });

  // Azure's shared box materials: sea-weathered steel and caustic light under the waves
  for (const k of ['floor', 'plat', 'metal', 'wall', 'grate', 'ceil', 'rock']) addCaustics(mat(k, zone), k === 'rock' ? 1.1 : 0.9, { weather: k === 'metal' || k === 'wall' });
  mat('rock', zone).color.setHex(0x3a4744);
  for (const k of ['wall', 'metal']) mat(k, zone).color.multiply(new THREE.Color(0.95, 1.0, 1.0));

  // ------------------------------------------------------------------ helpers
  // Reef growths: elongated octahedra merged into meshes (dark basalt spires, bioluminescent coral
  // fronds, and the deep glow of the abyss's seep vents).
  const geos = { rock: [], glow: [], deep: [] };
  const keepOut = []; // route volumes growths must not grow into
  const blocked = (x, y, z, m) => keepOut.some(([a, b]) => x > a[0] - m && x < b[0] + m && y > a[1] - m && y < b[1] + m && z > a[2] - m && z < b[2] + m);
  function shard(x, y, z, h, r, tx = 0, tz = 0, kind = 'rock') {
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
  function cluster(x, y, z, s, kind = 'rock', tx = 0, tz = 0, n = 5) {
    if (blocked(x, y, z, s * 0.4)) return;
    shard(x, y, z, s, s * 0.17, tx, tz, kind);
    for (let i = 1; i < n; i++) {
      const a = rng() * Math.PI * 2, d = s * (0.1 + rng() * 0.2);
      const k = 0.3 + rng() * 0.45;
      shard(x + Math.cos(a) * d, y, z + Math.sin(a) * d, s * k, s * (0.07 + rng() * 0.06), tx + Math.cos(a) * (0.25 + rng() * 0.4), tz + Math.sin(a) * (0.25 + rng() * 0.4), kind);
    }
  }
  // spikes covering a landing (shatter with the matching color, regrow after 3 s)
  const spikes = (x1, z1, x2, z2, top, color, regen = 3) =>
    new Barrier(W, { min: [x1, top, Math.min(z1, z2)], max: [x2, top + 0.6, Math.max(z1, z2)], color, kind: 'spike', regen, zone });
  // lethal scalding brine (the turbine's heat exchangers dump it here): a glowing pool, steaming, with an
  // acid hazard box
  const brineMat = new THREE.MeshStandardMaterial({ color: 0x0a4a5a, emissive: 0x18c8d8, emissiveIntensity: 0.6, roughness: 0.08, metalness: 0.4 });
  const steamAt = [];
  function brine(x1, z1, x2, z2, y) {
    const m = new THREE.Mesh(boxGeo(x2 - x1, 0.5, Math.abs(z2 - z1)), brineMat);
    m.position.set((x1 + x2) / 2, y - 0.25, (z1 + z2) / 2);
    W.scene.add(m);
    W.addSolid(V(x1, y - 0.5, Math.min(z1, z2)), V(x2, y, Math.max(z1, z2)), { static: true, hazard: 'acid' });
    steamAt.push([x1, z1, x2, z2, y]);
  }

  // ------------------------------------------------------------------ the trench's walls (colliders) and the hull
  // The west wall (under the Nexus, top y 1) is the trench's rock (azureTrench.js draws it); the east face is
  // the station's HULL: a wall of sea-weathered steel standing up out of the sea, buttressed, with the
  // Flooded Depths, the Undercroft, the Sluice and the Intake inside it. Doorways [y1, y2, z1, z2] cut out
  // of it: the Flooded Depths' entry and exit tunnels, the Archive's records room and specimen vault, the
  // Undercroft's tunnel, and the gallery's way out onto the Spillway.
  const hullGeos = [];
  const CLIFF_DOORS = [[-22, -17.3, -116.6, -112.6], [-26, -21.3, -149, -145], [-25.5, -21, -171, -157], [-57, -52.3, -148, -144], [-8.7, -4, -157.6, -153.4]];
  const HULL_TOP = 14;
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
    if (x1 >= 108) hullGeos.push(new THREE.BoxGeometry(x2 - x1, y2 - y1, z2 - z1).translate((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2));
    if (solid) W.addSolid(V(x1, y1, z1), V(x2, y2, z2), { static: true, kind: x1 >= 108 ? 'metal' : 'rock' });
  }
  // the hull's buttresses: plates standing 0..2.2 m proud of its face, x 112 (visual only)
  function buttress(z1, z2, top) {
    for (let y = -80; y < top; ) {
      const y2 = Math.min(top, y + 10 + rng() * 14), p = rng() * 2.2;
      cliff(112 - p, y, z1, 116, y2, z2);
      y = y2;
    }
  }
  // West wall (the trench's rock; low, so the Hub's windows look out over it to the sea)
  cliff(32, -80, -196, 36, 1, -66, true);
  // the hull
  cliff(112, -80, -82, 116, HULL_TOP, -62, true);
  cliff(112, -80, -200, 116, HULL_TOP, -86, true);
  cliff(112, -80, -86, 116, -4.5, -82, true);
  cliff(112, -3.5, -86, 116, HULL_TOP, -82, true);
  cliff(112, -4.5, -86, 116, -3.5, -84.6, true);
  cliff(112, -4.5, -83.4, 116, -3.5, -82, true);
  for (let z = -62; z > -200; ) {
    const z2 = Math.max(-200, z - 5 - rng() * 6);
    if (rng() < 0.6) buttress(z2 + 0.4, z - 0.4, HULL_TOP - rng() * 3);
    z = z2;
  }
  // the sea's edges: currents push you back long before these (azureOcean's boundary currents)
  blocker([36, -80, -41], [112, 8, -40]);
  blocker([36, -80, -232], [112, 8, -231]);

  // ------------------------------------------------------------------ entry skybridge (Hub east port, z -112)
  corridorX({ xStart: 25, xEnd: 44, y: 4, zone, cz: -112, n: [{ c: 38.5, w: 10, h: 2.4, y0: 0.4 }], s: [{ c: 38.5, w: 10, h: 2.4, y0: 0.4 }] });
  // glass side panes: the first look out over the sea
  new Glass(W, { min: [33.5, 4.4, -113.8], max: [43.5, 6.8, -113.6] });
  new Glass(W, { min: [33.5, 4.4, -110.4], max: [43.5, 6.8, -110.2] });
  zoneTitle([25, 4, -113.5], [29, 7, -110.5], 'AZURE', 'THE DROWNED REACH', '#3a8bff', 'music_azure');
  area([25.5, 4, -113.5], [28, 7, -110.5], MOOD);

  // ------------------------------------------------------------------ the RIG DECK (y 4)
  for (const [a, b, c, d] of [[44, -120, 58, -104]]) {
    W.box(a, 2.4, b, c, 4, d, 'floor', zone);
    W.deco(44.5, 0.6, -119.5, 57.5, 2.4, -104.5, 'metal', zone);
  }
  // rails (open to the east at z -109 → -104: the dive point, down to the sea)
  for (const [x1, z1, x2, z2] of [[44, -104.3, 58, -104], [44, -120, 58, -119.7], [57.7, -119.7, 58, -109], [44, -110, 44.3, -104.3], [44, -119.7, 44.3, -114]]) {
    W.box(x1, 4, z1, x2, 5.1, z2, 'metal', zone);
    W.deco(x1, 5.1, z1, x2, 5.16, z2, 'glow3', zone);
  }
  W.box(44.6, 4, -119.4, 47.2, 5.1, -117.2, 'metal', zone); // console
  W.deco(44.7, 5.1, -119.2, 47.1, 5.14, -117.4, 'glow3', zone);
  new Checkpoint(W, game, { pos: [47, 4, -112], yaw: -Math.PI / 2, size: [3, 3, 7] });
  // (invisible) over the west, north and south rails
  blocker([43.7, 4, -120], [44.3, 30, -114]);
  blocker([43.7, 4, -110], [44.3, 30, -104]);
  blocker([44, 4, -120.3], [58.3, 30, -119.7]);
  blocker([44, 4, -104.3], [58.3, 30, -103.7]);
  blocker([57.7, 5.1, -119.7], [58.3, 30, -109]);
  keepOut.push([[25, 2, -121], [59, 14, -103]]);

  // ------------------------------------------------------------------ THE AQUARIUM (y -60)
  const AY = -60;
  const WAKE = { pos: [46, FLOOR_Y - 0.4, -62], yaw: -0.12 }; // (y: set from the floor once it's built)
  // the bubble vent on the swim from the wake-up spot, and the lights leading to the airlock's door
  hab.bubbleVent(47.5, FLOOR_Y - 0.4, -73, 16);
  hab.trail([[46.2, -64.4, -64], [47.5, -63, -73], [48.6, -59.8, -80], [49, -58.6, -83.4]], { step: 1.8 });
  // the AIRLOCK: outer door south (onto the trench), inner door north into the first glass corridor
  const firstLock = new Airlock(B, {
    min: [47, AY, -88], max: [51, AY + 3.6, -84], outer: '+z', zone, airs,
    onDrained: () => {
      game.hud.message('<b>Air.</b> The airlock drains with a roar of vents and the inner door grinds open.', 5);
    },
  });
  level.azure.airlock = firstLock;
  onRespawn(() => firstLock.reset());
  new Checkpoint(W, game, { pos: [49, AY, -86], yaw: 0, size: [3.6, 3, 3.6] }); // (inside the drained lock)
  zoneTitle([47.5, AY, -91], [50.5, AY + 3, -89], 'AZURE', 'THE AQUARIUM', '#3aa8ff');
  area([47.5, AY, -92], [50.5, AY + 3, -89], DEEP);
  // G1: the first glass corridor (north), the Leviathan far off in the blue as you walk it
  hab.glassTube({ axis: 'z', a1: -88.35, a2: -98.3, c: 49, y: AY });
  // THE OBSERVATION GALLERY: glass on three sides and overhead; Log 10 at its north-west window
  hab.glassPod({ x1: 45, x2: 57, z1: -112, z2: -98, y: AY, h: 5.2, glass: ['n', 'w', 'roof'], open: { s: [{ c: 49, w: 3, h: 3.2 }], e: [{ c: -106, w: 3, h: 3.2 }] } });
  for (const [x, z] of [[47, -110], [55, -110]]) {
    W.box(x - 0.9, AY, z - 0.4, x + 0.9, AY + 0.45, z + 0.4, 'plat', zone); // benches facing the glass
  }
  hint([45, AY, -112], [57, AY + 3, -98], 'The <b>Aquarium</b>: the station\'s undersea habitat. The doors onto the sea hold the water back with a <b>pressure membrane</b>.', 5);
  // G2: a glass tube east to the dome, past the open water where the Leviathan passes close
  hab.glassTube({ axis: 'x', a1: 57.3, a2: 75.7, c: -106, y: AY });
  // THE DOME: x 76..110, z -120..-88. Glass walls 5 m high under a glass dome. A flooded channel (x 90..98.8)
  // splits it: the AZURE core's dais and the runway on the west side, the fight (and the way on) east.
  const DX1 = 76, DX2 = 110, DZ1 = -120, DZ2 = -88, CX1 = 90, CX2 = 98.8;
  // floors either side of the channel, and the channel itself (flooded 1.6 m under the floor, too high a
  // bank to climb on the east side; steps out on the west)
  W.box(DX1 - 0.3, AY - 1, DZ1 - 0.3, CX1, AY, DZ2 + 0.3, 'floor', zone);
  // (the east floor leaves the moon pool's hole open: x 103..108, z -116..-111)
  W.box(CX2, AY - 1, DZ1 - 0.3, 103, AY, DZ2 + 0.3, 'floor', zone);
  W.box(108, AY - 1, DZ1 - 0.3, DX2 + 0.3, AY, DZ2 + 0.3, 'floor', zone);
  W.box(103, AY - 1, DZ1 - 0.3, 108, AY, -116, 'floor', zone);
  W.box(103, AY - 1, -111, 108, AY, DZ2 + 0.3, 'floor', zone);
  W.box(CX1, AY - 4.6, DZ1, CX2, AY - 4, DZ2, 'grate', zone);
  W.box(CX1 - 0.3, AY - 4.6, DZ1, CX1, AY - 1, DZ2, 'metal', zone);
  W.box(CX2, AY - 4.6, DZ1, CX2 + 0.3, AY - 1, DZ2, 'metal', zone);
  const chan = B.water([CX1, AY - 4, DZ1], [CX2, AY - 1.6, DZ2]);
  chan.top = AY - 1.6;
  airs.push([[CX1 - 0.3, AY - 4.7, DZ1], [CX2 + 0.3, AY - 1, DZ2]]);
  hab.steps(CX1, -96, 1, 0, AY, 3, 5);
  W.deco(CX1 - 0.3, AY - 0.02, DZ1, CX1, AY + 0.02, DZ2, 'hazard', zone);
  W.deco(CX2, AY - 0.02, DZ1, CX2 + 0.3, AY + 0.02, DZ2, 'hazard', zone);
  // the walls (glass all round, a steel skirt at the foot) and the dome over them
  hab.glassPod({ x1: DX1, x2: DX2, z1: DZ1, z2: DZ2, y: AY, h: 5, glass: ['n', 's', 'e', 'w'], open: { w: [{ c: -106, w: 3, h: 3.2 }] }, floor: false, roof: false });
  airs.push([[DX1 - 0.3, AY - 1, DZ1 - 0.3], [DX2 + 0.3, AY + 14.5, DZ2 + 0.3]]);
  W.addSolid(V(DX1, AY + 12, DZ1), V(DX2, AY + 12.4, DZ2), { static: true, glass: true }); // (the dome: nothing gets up there)
  hab.dome({ x1: DX1, x2: DX2, z1: DZ1, z2: DZ2, y0: AY + 5, h: 9, ribs: 16, rings: 4 });
  light((DX1 + DX2) / 2, AY + 9, (DZ1 + DZ2) / 2, 0x7fe0ff, 40, 34);
  // the core on its dais (west side, south)
  W.box(78.8, AY, -99, 83.2, AY + 0.3, -94.6, 'metal', zone);
  W.deco(78.7, AY + 0.24, -99.1, 83.3, AY + 0.3, -94.5, 'glow3', zone);
  const core = pedestal(81, AY + 0.3, -96.8, BLUE, zone);
  level.azure.core = core;
  hint([77, AY, -104], [84, AY + 3, -92], 'The <b style="color:#3a8bff">AZURE</b> core. Take it.', 3);
  new Checkpoint(W, game, { pos: [79, AY, -106], yaw: -Math.PI / 2, size: [3, 3, 4] });
  // the runway painted along the west floor to the channel, and the leap's ghost arcs
  for (let x = 77.5; x < 89.5; x += 2) W.deco(x, AY + 0.005, -106.6, x + 1, AY + 0.02, -105.4, 'hazard', zone);
  const leapHint = new LeapHint(W, game, { from: [89.4, AY, -106], to: [100.4, AY, -106], short: [93.2, AY, -106] });
  leapHint.on = false;
  let tutor = 0;
  W.add({
    update(dt, player) {
      // the arcs come up once you hold blue (and go once you've made the leap)
      if (tutor === 0 && game.blaster.unlocked[BLUE]) {
        tutor = 1;
        leapHint.on = true;
      }
      if (tutor < 1) leapHint.on = false;
      if (tutor === 1 && player.pos.x > CX2 + 0.5 && player.pos.y > AY - 0.5 && player.pos.y < AY + 3 && player.pos.z > DZ1 && player.pos.z < DZ2) {
        tutor = 2;
        leapHint.hide();
      }
    },
  });
  W.trigger([84, AY, DZ1], [CX1, AY + 3, DZ2], () => {
    if (!game.blaster.unlocked[BLUE]) return;
    game.hud.message('Too far to jump dry. <b>Hose a long slick down the runway</b>, then <b>sprint</b> along it and leap at the edge: the water carries you farther.', 7);
  });
  // ---- THE DOME FIGHT (east side, x 98.8..110): the test of the water cannon. Three junction boxes stand on
  // the floor: soak it where the robots walk and spray a junction to short it, and the surge fries everything
  // standing in water connected to its foot. Raised insulated pads keep your own feet dry. Clear it and the
  // moon pool hatch opens (the way on), the gantry slides out over the channel and the crew deck's hatch
  // into the hull unlocks.
  const SX1 = CX2, SX2 = DX2, SZ1 = DZ1, SZ2 = DZ2, SY = AY;
  for (const [x, z] of [[SX1 + 0.6, SZ1 + 0.6], [SX1 + 0.6, SZ2 - 0.6], [SX2 - 0.6, SZ1 + 0.6], [SX2 - 0.6, SZ2 - 0.6]]) {
    W.box(x - 0.3, SY, z - 0.3, x + 0.3, SY + 4.6, z + 0.3, 'metal', zone);
    W.deco(x - 0.36, SY + 4.6, z - 0.36, x + 0.36, SY + 4.8, z + 0.36, 'glow3', zone);
  }
  const junctions = [
    new Junction(W, game, { min: [101.6, SY, -117.2], max: [102.8, SY + 1.3, -116.4], cooldown: 6, face: '+z', cable: [SX1 + 0.6, SY + 4.4, SZ1 + 0.6] }),
    new Junction(W, game, { min: [101.6, SY, -91.6], max: [102.8, SY + 1.3, -90.8], cooldown: 6, face: '-z', cable: [SX1 + 0.6, SY + 4.4, SZ2 - 0.6] }),
    new Junction(W, game, { min: [108.6, SY, -104.6], max: [109.4, SY + 1.3, -103.4], cooldown: 6, face: '-x', cable: [SX2 - 0.6, SY + 4.4, SZ1 + 0.6] }),
  ];
  for (const j of junctions) onRespawn(() => j.reset());
  // insulated pads (rubber-topped grates, 0.6 m up: your feet stay out of the water on them)
  for (const [x1, z1, x2, z2] of [[104, -119.4, 107, -116.6], [104, -91.4, 107, -88.6], [99.8, -106.5, 102.4, -103.5]]) {
    W.box(x1, SY, z1, x2, SY + 0.6, z2, 'plat', zone);
    W.deco(x1 - 0.02, SY + 0.6, z1 - 0.02, x2 + 0.02, SY + 0.64, z1 + 0.18, 'hazard', zone);
    W.deco(x1 - 0.02, SY + 0.6, z2 - 0.18, x2 + 0.02, SY + 0.64, z2 + 0.02, 'hazard', zone);
  }
  // cover: crates and a toppled transformer
  for (const [x, z, w, h] of [[105.5, -112, 1.6, 1.3], [101.5, -98.5, 1.4, 1.1], [106.5, -96, 1.5, 1.4], [104, -108.5, 1.2, 1]]) {
    W.box(x, SY, z, x + w, SY + h, z + w, 'metal', zone);
    W.deco(x - 0.02, SY + h * 0.45, z - 0.02, x + w + 0.02, SY + h * 0.55, z + w + 0.02, 'glow3', zone);
  }
  B.armor([108.8, SY, -90]);
  B.armor([101.1, SY + 0.6, -105]);
  hint([SX1, SY, -110], [SX1 + 3, SY + 3, -102], 'Junction boxes: <b>soak the floor</b> where the robots walk, then <b>hose a junction</b> — the surge fries everything standing in connected water. Keep your own feet <b>dry</b>.', 8);
  // the moon pool out (north-east corner), hatched shut until the dome is clear
  const MP = { x1: 103, x2: 108, z1: -116, z2: -111 };
  hab.moonPool({ x1: MP.x1, x2: MP.x2, z1: MP.z1, z2: MP.z2, floorY: AY, stepSide: '+z' });
  W.box(MP.x1 - 0.2, AY - 1, MP.z1 - 0.2, MP.x1, AY, MP.z2 + 0.2, 'metal', zone); // (the hole's sides)
  W.box(MP.x2, AY - 1, MP.z1 - 0.2, MP.x2 + 0.2, AY, MP.z2 + 0.2, 'metal', zone);
  const poolHatch = B.seal([MP.x1, AY - 0.4, MP.z1], [MP.x2, AY, MP.z2], { closed: true, zone });
  level.azure.poolHatch = poolHatch;
  const domeFight = B.encounter({
    trigger: [[SX1 + 0.8, SY, SZ1], [SX2, SY + 4, SZ2]],
    seals: [],
    title: 'THE AQUARIUM', sub: 'TEST THE WATER', color: '#3a8bff', music: 'music_combat', zone, resume: true,
    checkpoint: { pos: [100.5, SY, -110], yaw: -Math.PI / 2 },
    waves: [
      [
        { type: 'blastCrab', pos: [106, SY, -114], color: BLUE, shields: [RED], shieldHp: 1 },
        { type: 'blastCrab', pos: [107, SY, -96], color: BLUE, shields: [RED], shieldHp: 1, delay: 0.5 },
        { type: 'blastCrab', pos: [104, SY, -104], color: BLUE, delay: 1 },
        { type: 'drone', pos: [104, SY + 3.5, -102], color: BLUE, shields: [YELLOW], delay: 1.6 },
      ],
      [
        { type: 'welder', pos: [108, SY, -117], color: BLUE, shields: [GREEN] },
        { type: 'welder', pos: [108, SY, -91], color: BLUE, shields: [YELLOW], delay: 0.8 },
        { type: 'drone', pos: [104, SY + 3.5, -96], color: BLUE, shields: [RED], delay: 1.4 },
        { type: 'blastCrab', pos: [102, SY, -113], color: BLUE, shields: [GREEN], shieldHp: 1, delay: 2.2 },
      ],
      { title: 'HEAVY', enemies: [
        { type: 'brute', pos: [106, SY, -104], color: BLUE },
        { type: 'welder', pos: [108, SY, -118], color: BLUE, shields: [RED, YELLOW], delay: 1.2 },
        { type: 'drone', pos: [103, SY + 3.8, -112], color: BLUE, shields: [GREEN, RED], delay: 2 },
        { type: 'blastCrab', pos: [107, SY, -92], color: BLUE, shields: [YELLOW], shieldHp: 1, delay: 3 },
      ] },
    ],
    onClear: () => {
      gantry.extend();
      poolHatch.open();
      game.hud.message('The dome is clear: the <b>moon pool</b> hatch swings open. Dive through it and swim <b>up</b> past the air bell to the <b>crew deck</b>.', 7);
    },
  });
  level.azure.stormDeck = domeFight; // (guide.js and saves know it by its old name)
  level.azure.domeFight = domeFight;
  // the gantry back over the channel (stowed under the east floor until the dome is clear)
  const gantry = new Gantry(W, game, { min: [CX1, SY - 0.42, -107.25], max: [CX2, SY - 0.02, -104.75], from: [8.8, 0, 0], zone });
  W.add({
    update() {
      if (domeFight.state !== 'cleared') return;
      if (gantry.want === 0) gantry.extend(true); // (a save that already won it)
      if (poolHatch.state === 'closed') poolHatch.open(true);
    },
  });
  keepOut.push([[44, AY - 2, -122], [111, AY + 15, -82]]);

  // ---- SWIM: from under the dome, up the outside of its north wall, past an air bell, to the crew deck
  hab.trail([[105.5, AY - 1.8, -113.5], [105.5, AY - 2.2, -121.5], [104, -46, -123.5]], { step: 2 });
  hab.airBell(104, -40, -123.5, { yaw: 0 });
  hab.trail([[104, -44.6, -123.5], [100, -32, -118], [95.4, -23.4, -116]], { step: 2.2 });
  // ---- THE CREW DECK (y -21): the station crew's quarters, warm and humming; its hatch opens into the hull
  {
    const y = -21, x1 = 92, x2 = 108, zN = -123, zS = -112, h = 4.2;
    W.box(x1 - 0.5, y - 1, zN - 0.5, 94, y, zS + 0.5, 'floor', zone);
    W.box(99, y - 1, zN - 0.5, x2 + 0.5, y, zS + 0.5, 'floor', zone);
    W.box(94, y - 1, zN - 0.5, 99, y, -118.5, 'floor', zone);
    W.box(94, y - 1, -113.5, 99, y, zS + 0.5, 'floor', zone);
    hab.moonPool({ x1: 94, x2: 99, z1: -118.5, z2: -113.5, floorY: y, stepSide: '+x' });
    W.box(x1 - 0.5, y + h, zN - 0.5, x2 + 0.5, y + h + 0.5, zS + 0.5, 'ceil', zone);
    B.wallX(zS, zS + 0.5, x1 - 0.5, x2 + 0.5, y, y + h, [], zone);
    B.wallX(zN - 0.5, zN, x1 - 0.5, x2 + 0.5, y, y + h, [], zone);
    B.wallZ(x1 - 0.5, x1, zN, zS, y, y + h, [], zone);
    B.wallZ(x2, x2 + 0.5, zN, zS, y, y + h, [{ c: -114.6, w: 3, y0: y, h: 3.2 }], zone);
    airs.push([[x1 - 0.5, y - 1.05, zN - 0.5], [x2 + 0.5, y + h + 0.5, zS + 0.5]]);
    airs.push([[108, y - 1, -116.6], [112.2, y + 3.7, -112.6]]); // (the tunnel's stub into the hull)
    // the boiler (the recorder sits by it), bunks, a galley counter, lockers
    W.box(106.2, y, -122.6, 107.6, y + 2.2, -120.4, 'metal', zone);
    W.deco(106.15, y + 0.6, -122.4, 106.2, y + 1.4, -120.6, 'glow1', zone);
    W.deco(106.15, y + 1.5, -122.4, 106.2, y + 1.6, -120.6, 'glow0', zone);
    for (const z of [-122.6, -120.8]) {
      W.box(92.3, y, z, 94.6, y + 0.6, z + 1.2, 'metal', zone);
      W.box(92.3, y + 1.5, z, 94.6, y + 1.65, z + 1.2, 'metal', zone);
      W.deco(92.4, y + 0.6, z + 0.1, 94.5, y + 0.7, z + 1.1, 'trimWhite', zone);
    }
    W.box(100, y, -112.6, 105, y + 1, -112.1, 'metal', zone);
    W.deco(100, y + 1, -112.6, 105, y + 1.05, -112.1, 'glow1', zone);
    for (let x = 99; x < 105; x += 1.1) W.box(x, y, -122.9, x + 0.9, y + 2.4, -122.4, 'metal', zone);
    new Checkpoint(W, game, { pos: [101, y, -117.5], yaw: Math.PI / 2, size: [5, 3, 6] });
    light(105.5, y + 2.6, -120.5, 0xffb060, 22, 14); // the boiler's warm glow
    zoneTitle([98.6, y, -119], [104, y + 3, -113], 'AZURE', 'THE CREW DECK', '#ffc870');
    area([98.6, y, -123], [104, y + 3, -112], DEEP);
    hint([98.6, y, -119], [104, y + 3, -113], 'The crew\'s quarters, warm and humming. The hatch <b>east</b> leads into the hull.', 4);
  }
  // the hatch east into the hull: shut until the dome is clear
  const hatch = B.seal([107.6, -21, -116.1], [108.2, -17.8, -113.1], { closed: true, zone });
  W.add({
    update() {
      if (domeFight.state === 'cleared' && hatch.state === 'closed') hatch.open();
    },
  });
  keepOut.push([[91, -23, -124], [113, -15, -111]]);

  // ------------------------------------------------------------------ THE ARCHIVE (y -25): THE COUNTERWEIGHTS
  // PUZZLE + COMBAT. The Lumen's catalogue of the people it keeps lives here (its records room, east). The
  // way on (west) is a heavy gate on a chain over a pulley; the chain's other ends carry two empty ballast
  // tanks hanging in the middle of the lab. Fill both (they leak) and their weight hauls the gate up; it
  // latches once both are full together. The moment the first one starts to sink, the sentries wake.
  // Its porch is a glass vestibule where the Flooded Depths' exit tunnel comes out of the hull.
  W.box(92, -26, -152.5, 108, -25, -142, 'floor', zone); // porch
  hab.glassPod({ x1: 92, x2: 108, z1: -152.5, z2: -142, y: -25, h: 4.5, glass: ['w', 's', 'roof'], open: { e: [{ c: -147, w: 3, h: 3.2 }] }, floor: false, skip: ['n'] });
  new Checkpoint(W, game, { pos: [100, -25, -146], yaw: 0, size: [6, 3, 4] });
  area([92, -25, -152.5], [108, -21, -148], DEEP);
  airs.push([[107.5, -26, -149], [112.5, -21, -145]]); // (the tunnel out of the hull)
  room({ x1: 88, x2: 108, zS: -153, zN: -175, y: -25, h: 8, zone, s: [{ c: 100, w: 3, h: CH }], w: [{ c: -170, w: 3, h: CH }], e: [{ c: -160.75, w: 2.2, h: 2.8 }] });
  airs.push([[87.5, -26, -175.5], [108.5, -16.5, -152.5]]);
  // specimen tanks (glass: cover from drone fire)
  for (const z of [-158, -163.5, -169]) {
    W.box(103.8, -25, z - 1.5, 106.8, -24.4, z + 1.5, 'metal', zone);
    W.box(103.8, -19.6, z - 1.5, 106.8, -19, z + 1.5, 'metal', zone);
    new Glass(W, { min: [104, -24.4, z - 1.3], max: [106.6, -19.6, z + 1.3] });
    cluster(105.3, -24.4, z, 3.6, 'glow', 0, 0, 4);
  }
  W.box(93.5, -25, -161, 96, -23.5, -158.5, 'metal', zone);
  W.box(90, -25, -165, 91.5, -22.8, -162, 'metal', zone);
  W.deco(88, -18.4, -164.6, 108, -17.8, -163.8, 'metal', zone);
  W.deco(88, -18.4, -160.6, 108, -17.8, -159.8, 'metal', zone);
  light(97, -18.6, -164, 0x86c8ff, 34, 28);
  // the counterweights: a rail along the ceiling from the tanks' wheels over to the gate's pulley
  W.deco(88.5, -17.45, -166.8, 100.4, -17.15, -166.2, 'metal', zone);
  W.deco(88.5, -17.45, -170.3, 88.9, -17.15, -166.2, 'metal', zone);
  for (const x of [93.5, 100]) W.deco(x - 0.35, -17.3, -166.85, x + 0.35, -17.0, -166.15, 'glow3', zone);
  const tanks = [93.5, 100].map((x) => new WaterTank(W, game, { pos: [x, -24.1, -166.5], size: [1.8, 1.6, 1.8], capacity: 4.5, leak: 0.022, latch: false, face: '+z' }));
  const labGate = new PulleyGate(W, game, {
    min: [87.42, -25, -171.55], max: [88.08, -21.75, -168.45], rise: 3.3, tanks, drop: 0.9,
    anchors: [[93.5, -17.6, -166.5], [100, -17.6, -166.5]], pulley: [88.75, -17.9, -170],
    onOpen: () => game.hud.message('Both tanks full: the counterweights haul the gate up and it <b>latches</b>.', 4),
  });
  for (const t of tanks) onRespawn(() => t.reset());
  onRespawn(() => labGate.reset());
  // (a shortcut for a sharp eye: the feed pipe over the right-hand tank is choked with salt crust and
  // barnacles; bake it out with the yellow sun beam and it pours in by itself)
  W.deco(99.75, -20.5, -168.45, 100.25, -17, -167.95, 'metal', zone);
  W.deco(99.75, -20.75, -168.45, 100.25, -20.25, -167.05, 'metal', zone);
  W.deco(99.7, -20.8, -167.1, 100.3, -20.2, -167.0, 'glow1', zone);
  let pouring = false;
  const plug = new CrustPlug(W, game, {
    min: [99.62, -21.1, -167.05], max: [100.38, -20.3, -166.45],
    onMelt: () => {
      pouring = true;
      tanks[1].feed = 0.1;
      game.hud.message('The crust bursts and the pipe <b>pours into the tank</b>.', 3);
    },
  });
  W.add({
    update(dt) {
      if (!pouring || tanks[1].latched || !(W.fx && Math.random() < dt * 60)) return;
      const t = tanks[1], p = _pour.set(100 + (Math.random() - 0.5) * 0.25, -20.85, -166.75 + (Math.random() - 0.5) * 0.25);
      const k = W.fx.spawn(0, p, 0, -2 - Math.random(), 0.15, _pourC, 0.9, Math.max(0.15, (p.y - t.top) / 7), 0.03);
      W.fx.grav[k] = 9;
    },
  });
  level.azure.labPlug = plug;
  hint([97.5, -25, -169.5], [102.5, -21, -163.5], 'The feed pipe over this tank is <b>choked with salt and barnacles</b>. Bake it out with the <b style="color:#ffd23a">sun beam</b> and it\'ll fill itself.', 5);
  level.azure.labGate = labGate;
  level.azure.labTanks = tanks;
  // ARMOR: tucked behind the specimen tanks against the east wall, and up on the crate by the south-west
  // corner.
  B.armor([107.35, -25, -166.25]);
  B.armor([94.75, -23.5, -159.75]);
  new Checkpoint(W, game, { pos: [90.5, -25, -170], yaw: Math.PI / 2, size: [3, 3, 3] });
  hint([92, -25, -158], [106, -21, -153], 'The way on is a gate on a chain. Its counterweights are those two <b>empty tanks</b>: <b>fill them both</b> with the water cannon (they leak) to haul it up.', 7);
  const lab = B.encounter({
    trigger: [[99.6, -17.4, -164.4], [100, -17.2, -164]], // (out of reach: the tanks start it, below)
    seals: [
      { min: [98.5, -25, -153.2], max: [101.5, -21.8, -152.4] }, // the way in slams shut behind you
      { min: [88.15, -25, -171.5], max: [88.55, -21.8, -168.5], color: BLUE }, // (an energy seal inside the gate while they fight)
    ],
    title: 'THE ARCHIVE', sub: 'COUNTERWEIGHTS MOVING', color: '#3a8bff', music: 'music_combat', zone, resume: true,
    checkpoint: { pos: [90.5, -25, -170], yaw: Math.PI / 2 },
    waves: [
      [
        { type: 'drone', pos: [93, -21, -160], color: BLUE, shields: [RED] },
        { type: 'drone', pos: [102, -20.5, -171], color: BLUE, shields: [YELLOW], delay: 0.8 },
        { type: 'turret', pos: [97, -17.05, -157.5], color: BLUE, shields: [GREEN], mount: 'ceiling', delay: 1.6 },
      ],
      [
        { type: 'welder', pos: [94, -25, -157], color: BLUE, shields: [GREEN] },
        { type: 'blastCrab', pos: [101, -25, -171], color: BLUE, shields: [RED], shieldHp: 1, delay: 1 },
        { type: 'blastCrab', pos: [92, -25, -171], color: BLUE, shields: [YELLOW], shieldHp: 1, delay: 1.5 },
        { type: 'drone', pos: [98, -20, -157], color: BLUE, shields: [YELLOW, RED], delay: 2.4 },
      ],
      { title: 'HEAVIES', enemies: [
        { type: 'warden', pos: [97, -20, -167], shield: YELLOW, core: BLUE },
        { type: 'drone', pos: [104, -20, -172], color: BLUE, shields: [GREEN, RED], delay: 2 },
        { type: 'blastCrab', pos: [94, -25, -172], color: BLUE, shields: [GREEN], shieldHp: 1, delay: 3 },
      ] },
    ],
    onClear: () => !labGate.open && game.hud.message('Now <b>fill both tanks</b> to raise the gate.', 4),
  });
  W.add({
    // (only once you're inside: the way in slams shut behind you, never in your face from the porch)
    update(dt, player) {
      if (lab.state === 'armed' && !game.clearedEncounters?.has(lab.id) && player.pos.z < -154.5 && tanks.some((t) => t.level > 0.25)) lab.start();
    },
  });
  level.azure.lab = lab;
  // RECORDS ROOM (a story nook, off the lab's east wall, cut into the hull): filing racks and the index
  // terminal of every sleeper the Lumen keeps. Its back wall holds the BLUE-locked specimen vault.
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
    hint([x1, y, -163], [x2, y + 3, -158], 'Station records. The catalogue of every sleeper the Lumen keeps.', 3);
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
    airs.push([[108, y - 1, vN - 0.5], [115.5, y + h + 0.5, zS + 0.5]]);
  }
  keepOut.push([[107, -26, -172], [117, -20, -141]]);

  // ------------------------------------------------------------------ THE BREAKER HALL (y -25): SHOCK WATER
  // x 66.5..87.5, z -177..-163, between the Archive and the Well. Its floor is flooded and LIVE: a fat
  // feed cable keeps the water crackling, and touching it is death. Insulated grates (raised, rubber-
  // topped) cross it. The door out (into the Well) is a forcefield; its breaker is up on the far wall:
  // hose it and it shorts, and the field drops for good. Robots on the far sill come leaping at you: let
  // them land in the water. (Spray puddles out onto the sill from the pool's edge and they go live too.)
  {
    const y = -25, x1 = 66.5, x2 = 87.5, zS = -163, zN = -177, top = y + 6;
    W.box(x1, y - 1, zN - 0.5, x2, y, zS + 0.5, 'floor', zone);
    W.box(x1, top, zN - 0.5, x2, top + 0.5, zS + 0.5, 'ceil', zone);
    W.box(x1, y, zS, x2, top, zS + 0.5, 'wall', zone);
    W.box(x1, y, zN - 0.5, x2 + 0.5, top, zN, 'wall', zone);
    W.box(x2, y, zN, x2 + 0.5, top, -175.5, 'wall', zone); // (the lab's west wall closes the rest of the east side)
    W.deco(x1, y + 4.2, zN, x2, y + 4.28, zN + 0.05, 'glow3', zone);
    W.deco(x1, y + 4.2, zS - 0.05, x2, y + 4.28, zS, 'glow3', zone);
    airs.push([[x1 - 0.5, y - 1, zN - 0.5], [x2 + 0.5, top + 0.5, zS + 0.5]]);
    const PX1 = 68.2, PX2 = 84.2;
    // the pool's lip (a hazard stripe at each end) and the feed cable's junction, live, by the entrance
    W.deco(PX2, y, zN, PX2 + 0.25, y + 0.02, zS, 'hazard', zone);
    W.deco(PX1 - 0.25, y, zN, PX1, y + 0.02, zS, 'hazard', zone);
    const pool = new LivePool(W, game, { min: [PX1, y, zN], max: [PX2, y, zS], live: true });
    new Junction(W, game, { min: [84.6, y, -176.7], max: [85.8, y + 1.5, -175.9], live: true, kind: 'conduit', cable: [85.2, top, -176.3] });
    // the insulated grates across it (0.5-0.9 m up, in a zig-zag)
    const grates = [[81.2, -168.2, 83.4, -165.8, 0.6], [77.2, -173.4, 79.6, -171, 0.9], [73.2, -167.6, 75.6, -165.2, 1.2], [70, -173.6, 72.2, -171.2, 0.8]];
    for (const [a, b, c, d, h] of grates) {
      W.box(a, y, b, c, y + h, d, 'plat', zone);
      W.deco(a - 0.02, y + h, b - 0.02, c + 0.02, y + h + 0.03, d + 0.02, 'hazard', zone);
      glowEdge(a, b, c, d, y + h + 0.03, 'glow3', zone);
    }
    // the forcefield on the way out, and its breaker on the wall above the sill
    const field = new Forcefield(W, game, { min: [66, y, -171.5], max: [66.5, y + CH, -168.5] });
    const breaker = new Junction(W, game, {
      min: [66.5, y + 2.6, -175.2], max: [67.1, y + 3.8, -174], kind: 'breaker', face: '+x', oneShot: true, cable: [66.8, top, -174.6],
      onShort: () => {
        field.set(false);
        game.hud.message('The breaker trips: <b>the forcefield is down</b>.', 4);
      },
    });
    // ...caged in GREEN hard light: lob a glob over (its splash breaks the cage), then hose the breaker
    new Barrier(W, { min: [66.5, y + 2.45, -175.4], max: [67.35, y + 3.95, -173.8], color: GREEN, kind: 'wall', zone });
    level.azure.breaker = breaker;
    level.azure.hallPool = pool;
    W.deco(66.52, y + 2.4, -175.4, 66.56, y + 2.5, -173.8, 'hazard', zone);
    hint([84.5, y, zN], [x2, y + 3, zS], 'The floor is <b>live</b> — one step in it and you\'re fried. Cross on the insulated grates. The way out is a forcefield: its <b>breaker</b> is up on the far wall, caged in <b style="color:#3dff7a">green</b>.', 7);
    // the robots on the far sill wake when you're halfway over
    B.encounter({
      trigger: [[73, y + 0.9, -168], [76, y + 4, -165]],
      seals: [],
      title: null, music: null, clearTitle: '', zone,
      checkpoint: { pos: [67.3, y, -170], yaw: Math.PI / 2 },
      waves: [[
        { type: 'blastCrab', pos: [67.3, y, -165], color: BLUE, shields: [GREEN], shieldHp: 1 },
        { type: 'blastCrab', pos: [67.3, y, -175.5], color: BLUE, shields: [RED], shieldHp: 1, delay: 0.7 },
        { type: 'drone', pos: [70, y + 4, -170], color: BLUE, shields: [YELLOW], delay: 1.2 },
      ]],
    });
    area([x2 - 1, y, -171.5], [x2 + 0.5, y + 3, -168.5], DEEP);
    keepOut.push([[66, -26, -178], [88.5, -18, -162]]);
  }

  // ------------------------------------------------------------------ the Well: ledges over scalding brine
  // PLATFORMING 2. The first pillar crumbles (move on at once); the others are crusted with spikes.
  room({ x1: 50, x2: 66, zS: -158, zN: -182, y: -47, h: 29, zone, floor: false, e: [{ c: -170, w: 3, h: CH, y0: 22 }] });
  airs.push([[49.5, -57, -182.5], [66.5, -17.5, -157.5]]); // (the Well and the vault antechamber under it)
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
  hint([62, -25, -172], [66, -22, -168], 'Scalding brine below — <b>one touch and you\'re cooked</b>. Work your way down to the hole; the first pillar is rotten.', 5);
  // ledges on rock pillars rising from the brine
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
  new Drone(W, { pos: [57, -27.5, -174], color: BLUE, shields: [YELLOW], range: 22 }); // (level with the catwalk, where you can see it)
  keepOut.push([[57, -47, -167], [66, -40, -158], [60, -26, -173], [66, -20, -167]]);
  for (const [x, z, tx, tz] of [[50.6, -181.4, 0.3, 0.3], [65.4, -181.4, -0.3, 0.3], [50.6, -158.6, 0.3, -0.3], [56, -181.6, 0, 0.35]]) cluster(x, -46.2, z, 3 + rng() * 3, 'rock', tx, tz);
  for (let i = 0; i < 10; i++) cluster(50.3, -44 + rng() * 22, -160 - rng() * 21, 1.5 + rng() * 2, rng() < 0.3 ? 'glow' : 'rock', 1.2, 0, 4);
  for (let i = 0; i < 10; i++) cluster(51 + rng() * 14, -44 + rng() * 22, -181.7, 1.5 + rng() * 2, rng() < 0.3 ? 'glow' : 'rock', 0, 1.2, 4);
  // steam off the brine
  W.add({
    update(dt, player) {
      if (player.pos.x > 70 || player.pos.y < -50 || player.pos.y > -15 || player.pos.z > -150 || Math.random() > dt * 14) return;
      const [x1, z1, x2, z2, y] = steamAt[Math.floor(Math.random() * steamAt.length)];
      const k = W.fx.puff?.(_pour.set(x1 + Math.random() * (x2 - x1), y + 0.1, Math.min(z1, z2) + Math.random() * Math.abs(z2 - z1)), 0, 0.6 + Math.random() * 0.5, 0, _pourC.setHex(0xcfeaf0), 0.4, 2.2, 0.9, 3);
      if (k !== undefined) W.fx.grav[k] = -0.5;
    },
  });

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
    airs.push([[44, ay - 1, z1 - 0.5], [50, top + 0.5, z2 + 0.5]]);
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
  new Drone(W, { pos: [52.5, -52, -178.5], color: BLUE, shields: [RED], range: 12 }); // (kept well clear of the drop pipe's mouth)
  corridor({ zStart: -157.5, zEnd: -150.5, y: -56, zone, cx: 54 });
  airs.push([[52, -57, -158], [56, -52.3, -150]]);
  new Checkpoint(W, game, { pos: [54, -56, -153], yaw: Math.PI, size: [3, 3, 2] });

  // ------------------------------------------------------------------ THE GENERATOR HALL (y -56): THE DYNAMO
  // MINI-BOSS. The hall where the station's power comes together, and the machine it runs through
  // (entities/dynamo.js). Four conduits stand in the room's quarters: spray a puddle trail from a conduit's
  // foot to where the Dynamo walks, then hose the conduit to short it, and the surge overloads it. Its
  // stomp electrifies every puddle round it, so fight from the insulated pads by the walls.
  // n: from the vault; e: the BLUE door out to the sea door and the second half of the world (azureSpillway.js).
  room({ x1: 52, x2: 80, zS: -122, zN: -150, y: -56, h: 14, zone, n: [{ c: 54, w: 3, h: CH }], e: [{ c: -146, w: 3, h: CH }] });
  airs.push([[51.5, -57, -150.5], [80.5, -41, -121.5]]);
  area([52.5, -56, -150], [55.5, -53, -147], DEEP);
  // its roof bristles with spined coral grown through the plating (nothing lands up there and lives)
  W.box(51.5, -41.5, -150.5, 80.5, -41.1, -121.5, 'rock', zone, { hazard: 'spike' });
  for (let i = 0; i < 40; i++) shard(52.5 + rng() * 27, -41.1, -149.5 + rng() * 27, 1 + rng() * 2.5, 0.25 + rng() * 0.2, (rng() - 0.5) * 0.5, (rng() - 0.5) * 0.5, 'glow');
  W.box(64, -56, -140, 72, -55.6, -132, 'metal', zone); // dais
  W.deco(63.9, -55.66, -140.1, 72.1, -55.6, -131.9, 'glow3', zone);
  light(68, -46, -136, 0x3a8bff, 50, 32);
  // (the arena floor stays clear of growths: they only grow round the walls)
  keepOut.push([[54.5, -57, -147.5], [77.5, -50, -124.5]]);
  keepOut.push([[52, -56, -152], [62, -52, -147], [52, -57, -126], [58, -52, -120], [72, -57, -148.5], [82, -52, -143.5]]);
  // a garden of coral and rock round the walls, stalactites of coral overhead
  for (let i = 0; i < 26; i++) {
    const a = rng() * Math.PI * 2, r = 12 + rng() * 2.5;
    cluster(66 + Math.cos(a) * r, -56, -136 + Math.sin(a) * r, 2 + rng() * 4.5, i % 3 ? 'rock' : 'glow', Math.cos(a) * 0.35, Math.sin(a) * 0.35);
  }
  for (let i = 0; i < 18; i++) shard(53 + rng() * 26, -42.1, -149 + rng() * 26, 1.5 + rng() * 3.5, 0.2 + rng() * 0.25, 0, Math.PI, rng() < 0.4 ? 'glow' : 'rock');
  // the four conduits, each wired up into the roof
  const conduits = [[58, -144], [76, -144], [58, -128], [76, -128]].map(([x, z]) => {
    const j = new Junction(W, game, { min: [x - 0.6, -56, z - 0.6], max: [x + 0.6, -54.5, z + 0.6], kind: 'conduit', cooldown: 7, surge: 3.5, cable: [x, -41.6, z] });
    W.deco(x - 1.1, -55.99, z - 1.1, x + 1.1, -55.97, z + 1.1, 'hazard', zone);
    onRespawn(() => j.reset());
    return j;
  });
  // insulated pads along the walls (0.7 m up: out of reach of the stomp's live water)
  for (const [x1, z1, x2, z2] of [[52, -138.5, 54.6, -133.5], [77.4, -138.5, 80, -133.5], [65.5, -150, 70.5, -147.4], [60, -124.6, 65, -122]]) {
    W.box(x1, -56, z1, x2, -55.3, z2, 'plat', zone);
    W.deco(x1, -55.3, z1, x2, -55.27, z2, 'hazard', zone);
    glowEdge(x1, z1, x2, z2, -55.27, 'glow3', zone);
  }
  B.armor([53.3, -55.3, -136]);
  B.armor([78.7, -55.3, -136]);
  const sealN = B.seal([52.5, -56, -150.45], [55.5, -52.8, -149.55], { zone });
  const sealE = B.seal([79.45, -56, -147.5], [79.95, -52.8, -144.5], { zone });
  const DYN_ID = 'enc:dynamo:azure';
  const dynamo = new Dynamo(W, game, {
    pos: [70, -56, -127.5], bounds: { x1: 52.5, x2: 79.5, z1: -149.5, z2: -122.5 },
    spawns: [[60, -56, -136], [76, -56, -136], [68, -56, -146], [68, -56, -126]],
    adds: [
      { type: 'blastCrab', color: BLUE, shields: [RED], shieldHp: 1 },
      { type: 'drone', color: BLUE, shields: [YELLOW] },
      { type: 'blastCrab', color: BLUE, shields: [GREEN], shieldHp: 1 },
    ],
    onStart: () => {
      for (const s of [sealN, sealE]) s.close();
      game.setMusic('music_miniboss');
    },
    onDefeated: () => {
      for (const s of [sealN, sealE]) s.open();
      game.clearedEncounters?.add(DYN_ID);
      const beacon = new Checkpoint(W, game, { pos: [74, -56, -146], yaw: -Math.PI / 2 });
      game.checkpoint?.ref?.setActive?.(false);
      beacon.setActive(true);
      W.fx.checkpoint(beacon.pos);
      game.setCheckpoint(beacon.pos, -Math.PI / 2, beacon);
      game.setMusic('music_azure');
      game.hud.zoneTitle('', 'THE DYNAMO IS DOWN', '#9bf6ff', 2.4);
      game.hud.message('The hall\'s power is dead. The <b style="color:#3a8bff">AZURE</b> door east opens onto the sea.', 5);
    },
  });
  level.azure.dynamo = dynamo;
  level.azure.conduits = conduits;
  W.trigger([52.5, -56, -149.4], [79.5, -50, -122.6], () => {
    if (!dynamo.defeated && game.blaster.unlocked[BLUE]) dynamo.start();
  }, { once: false });
  onRespawn(() => {
    if (dynamo.defeated) return;
    dynamo.reset();
    for (const s of [sealN, sealE]) s.open(true);
  });
  // a save that already beat it: the wreck, the doors open
  W.add({
    update() {
      if (!dynamo.defeated && game.clearedEncounters?.has(DYN_ID)) {
        dynamo.setDefeated();
        dynamo.hideHud();
      }
    },
  });
  hint([52.5, -56, -157], [55.5, -53, -150.6], 'Something big is humming in the generator hall. <b>Its power runs through the floor.</b>', 4);
  // the door out: only AZURE opens it; beyond it, the membrane holds back the sea
  barrierWallX(80.25, -56, BLUE, zone, -146);
  hint([74, -56, -149], [80, -53, -143], 'The way on is sealed with <b style="color:#3a8bff">AZURE</b> light — and past it, the open sea.', 4);
  hab.membrane([80.45, -56, -147.5], [80.55, -52.8, -144.5]);

  // ---- dev starts / Select Location, registered in route order (the second half's follow, in
  // azureSpillway.js): blue is in hand from the dome on
  const RYG = [RED, YELLOW, GREEN], RYGB = [RED, YELLOW, GREEN, BLUE];
  devStart('azure', [27, 4, -112], -Math.PI / 2, RYG, 'The rig deck (the wave)');
  devStart('azure1', WAKE.pos, WAKE.yaw, RYG, 'The trench floor (after the wave)');
  devStart('azure2', [49, AY, -95], Math.PI, RYG, 'The Aquarium: the glass corridor');
  devStart('azure3', [79, AY, -106], -Math.PI / 2, RYG, 'The Aquarium dome: the blue core');
  devStart('azure4', [84, AY, -106], -Math.PI / 2, RYGB, 'The slick leap and the dome fight');
  devStart('azure5', [101, -21, -117.5], -Math.PI / 2, RYGB, 'The crew deck');
  devStart('azure6', [135.75, -52.3, -116], -Math.PI / 2, RYGB, 'The Bell (an air pocket)');
  devStart('azure7', [127.3, -47.6, -147], -Math.PI / 2, RYGB, 'The Ballast Shaft');
  devStart('azure8', [100, -25, -146], 0, RYGB, 'The Archive: the counterweights');
  devStart('azure9', [86, -25, -170], Math.PI / 2, RYGB, 'The Breaker Hall (shock water)');
  devStart('azure10', [64, -25, -170], Math.PI / 2, RYGB, 'The Brine Well');
  devStart('azure11', [62, -56, -167.5], Math.PI / 2, RYGB, 'The vault antechamber');
  devStart('azure12', [54, -56, -153], Math.PI, RYGB, 'The Dynamo (mini-boss)');
  devStart('azureMoon', [100.5, AY, -110], Math.PI / 2, RYGB, 'The Aquarium moon pool (the swim up)');

  // ------------------------------------------------------------------ the second half
  buildAzureSpillway(B, { zone, MOOD, DEEP, keepOut, hab, airs });

  // ------------------------------------------------------------------ reef growths round the station
  // keep the big structures clear of them
  keepOut.push(
    [[51, -57, -151], [81, -40, -121]], [[44, -57, -183], [67, -17, -157]], [[87, -26, -176], [109, -16, -141]],
    [[66, -26, -172.5], [88, -21, -167.5]], [[24, 10, -140], [48, 17, -132]],
  );
  // growths on the hull's feet and the west wall's face, angled up and out
  for (let i = 0; i < 40; i++) cluster(111.8, -64 + rng() * 40, -67 - rng() * 128, 1.5 + rng() * 2.5, rng() < 0.35 ? 'glow' : 'rock', -0.5 - rng() * 0.4, (rng() - 0.5) * 0.5, 4);
  for (let i = 0; i < 30; i++) cluster(36.6, -62 + rng() * 44, -68 - rng() * 126, 1.5 + rng() * 2.5, i % 2 ? 'glow' : 'rock', 0.5 + rng() * 0.4, (rng() - 0.5) * 0.5, 4);

  // merge: the hull, the basalt spires, the glowing coral and the seep glow
  const hullMat = addCaustics(new THREE.MeshStandardMaterial({ color: 0x5b6e70, metalness: 0.7, roughness: 0.5 }), 0.9, { weather: true });
  const rockMat = addCaustics(new THREE.MeshStandardMaterial({ color: 0x2e3a3a, roughness: 0.85, metalness: 0.05, flatShading: true }), 1);
  const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x46e8d8).multiplyScalar(1.05) });
  const deepMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x2fa8ff).multiplyScalar(0.95), fog: false });
  level.azure.crystalMats = { rock: rockMat, glow: glowMat, deep: deepMat }; // dimmed when the engine stops
  geos.hull = hullGeos;
  for (const [k, m] of [['hull', hullMat], ['rock', rockMat], ['glow', glowMat], ['deep', deepMat]]) {
    if (!geos[k].length) continue;
    const mesh = new THREE.Mesh(mergeGeometries(geos[k].map((g) => (g.index ? g.toNonIndexed() : g))), m);
    geos[k].forEach((g) => g.dispose());
    mesh.matrixAutoUpdate = false;
    W.scene.add(mesh);
  }

  // ------------------------------------------------------------------ the air round you: sea spray and blown rain
  // up top, drifting particulate (marine snow) under the waves
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
      uniforms: { uScale: { value: 180 }, uCol: { value: new THREE.Color(0.75, 0.9, 0.95) }, uA: { value: 0.75 } },
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
        uniform vec3 uCol; uniform float uA;
        varying float vFade;
        void main() {
          float r = length(gl_PointCoord - 0.5);
          gl_FragColor = vec4(uCol, (1.0 - smoothstep(0.2, 0.5, r)) * uA * vFade);
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
        const c = game.camera.position, under = c.y < SEA_Y;
        // under the sea: slow marine snow, sinking; up top: spray and spindrift blowing on the wind
        dustMat.uniforms.uCol.value.setRGB(under ? 0.7 : 0.92, under ? 0.92 : 0.96, under ? 0.88 : 1.0);
        dustMat.uniforms.uA.value = under ? 0.6 : 0.35;
        const fall = under ? 0.12 : 1.4, wx = under ? 0.08 : -2.2, wz = under ? 0.05 : 1.2;
        for (let i = 0; i < N; i++) {
          const k = i * 3;
          pos[k] = wrap(pos[k] + (Math.sin(t * 0.5 + i) * 0.4 + wx) * dt, c.x);
          pos[k + 1] = wrap(pos[k + 1] - dt * (fall + (i % 7) * 0.05), c.y);
          pos[k + 2] = wrap(pos[k + 2] + (Math.cos(t * 0.4 + i * 1.3) * 0.3 + wz) * dt, c.z);
        }
        geo.attributes.position.needsUpdate = true;
      },
    });
  }

  // ---- wayfinding (playtest pass)
  const BLUE_HEX = COLORS[BLUE].hex;
  guideTrail(W, BLUE_HEX, [
    [[47.5, 4, -112], [52, 4, -107.2], [57.6, 4, -106.5]], // Rim Deck → the dive point (after the wave)
  ], (pl) => pl.pos.x > 25 && pl.pos.y > 0 && level.azure.waveDone?.());
  // the hall's way out: once you hold blue, a trail from the dais to the blue door
  guideTrail(W, BLUE_HEX, [[[71.6, -56, -138], [76, -56, -146], [79.6, -56, -146]]], (pl) => pl.pos.y < -50 && pl.pos.x < 81 && pl.pos.z > -151 && pl.pos.z < -121 && game.blaster.unlocked[BLUE]);
  // ...and band each pillar's lip with light, so the ledges read against the gloom from the catwalk
  for (const [x1, z1, x2, z2, top] of [[60, -181, 64, -177, -28.5], [52, -181, 56, -177, -32], [51, -172, 54.5, -168, -35.5], [51, -163, 55, -159, -39], [57, -166.5, 66, -158, -44.2]]) {
    const y1 = top - 0.5, y2 = top - 0.3, o = 0.04;
    W.deco(x1 - o, y1, z1 - o, x2 + o, y2, z1, 'glow3', zone);
    W.deco(x1 - o, y1, z2, x2 + o, y2, z2 + o, 'glow3', zone);
    W.deco(x1 - o, y1, z1, x1, y2, z2, 'glow3', zone);
    W.deco(x2, y1, z1, x2 + o, y2, z2, 'glow3', zone);
  }

  // ---- set dressing: pipes, signage, windows onto the sea, caustics, machine halls (azureDressing.js)
  dressAzure(B, { zone });
  // ---- the sea: surface, sky, underwater light; the trench and its life; the rig and the wave
  const ocean = (level.azure.ocean = buildOcean(B, {}));
  const trench = (level.azure.trench = buildTrench(B, {
    keepOut: [[[44, 0, -123], [111, 0, -82]], [[86, 0, -176], [116, 0, -141]], [[49, 0, -183], [81, 0, -121]], [[65, 0, -178], [89, 0, -162]], [[45, 0, -90], [53, 0, -60]]],
  }));
  WAKE.pos[1] = Math.max(trench.floorAt(WAKE.pos[0], WAKE.pos[2]) + 0.1, FLOOR_Y - 0.38);
  level.devStarts.azure1.pos.y = WAKE.pos[1];
  buildRig(B, { zone, hab, ocean, wake: WAKE, trench });
  // ---- the turbine field on the crossing, and the machines of the deep (azureTurbine.js)
  const currents = [];
  level.azure.turbine = buildTurbine(B, { zone, hab, currents, trench });
  // ---- the storm: rain over the open sea, stopping under every roof (azureRain.js)
  level.azure.rain = buildRain(B, { bounds: [20, -236, 204, -36], ocean });
  hab.finalize();

  // ---- the Leviathan glides past the glass (each pass plays once, never during a fight)
  const pup = trench.puppet;
  const busy = () => [domeFight, lab].some((e) => e.state === 'intro' || e.state === 'wave' || e.state === 'gap');
  const passes = [];
  const pass = (min, max, points, opts, onStart) => passes.push({ min, max, points, opts, onStart, done: false });
  W.add({
    update(dt, player) {
      if (pup.active || busy()) return;
      const p = player.pos;
      for (const ps of passes) {
        if (ps.done || p.x < ps.min[0] || p.x > ps.max[0] || p.y < ps.min[1] || p.y > ps.max[1] || p.z < ps.min[2] || p.z > ps.max[2]) continue;
        ps.done = true;
        pup.play(ps.points, ps.opts);
        ps.onStart?.();
        break;
      }
    },
  });
  // 1: far off in the blue, crossing the trench as you walk the first glass corridor
  pass([47.5, AY, -96], [50.5, AY + 3, -90], [[112, -50, -66], [84, -46, -70], [62, -48, -74], [40, -52, -70], [20, -56, -60]], { speed: 10 }, () => {
    audio.sample('leviathan_groan', { gain: 0.5, vary: 0, rate: 0.6, delay: 1.5 });
  });
  // 2: close: it fills the glass of the tube to the dome, the panes creak, the fish scatter
  pass([58, AY, -107.5], [64, AY + 3, -104.5], [[38, -50, -128], [52, -56, -112.5], [66, -57.5, -111], [76, -50, -114], [86, -38, -108], [100, -30, -92], [90, -28, -62]], { speed: 11 }, () => {
    audio.sample('leviathan_roar', { gain: 0.45, vary: 0, rate: 0.55, delay: 0.8 });
    audio.sample(audio.sfxOr('glass_creak', 'glass_hit'), { gain: 0.7, vary: 0, rate: 0.5, delay: 1.6 });
    audio.sample(audio.sfxOr('glass_creak', 'glass_hit'), { gain: 0.5, vary: 0, rate: 0.42, delay: 2.4 });
    let t = 0;
    const shake = { update(dt) { t += dt; if (t > 1.4 && t < 3.4) game.player.shake = Math.max(game.player.shake, 0.18); if (t > 4) W.remove(shake); } };
    W.add(shake);
  });

  // 3: it rams the Archive's glass porch as you come out of the Flooded Depths: a pane cracks, the sea
  // hisses in round the crack, and it holds
  const crack = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 2;
    let seed = 7;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 14; k++) { // radial cracks, jagged
      const a = (k / 14) * Math.PI * 2 + r() * 0.3;
      g.beginPath();
      g.moveTo(128, 128);
      let x = 128, y = 128;
      for (let s = 0; s < 6; s++) {
        x += Math.cos(a + (r() - 0.5) * 0.6) * (12 + r() * 12);
        y += Math.sin(a + (r() - 0.5) * 0.6) * (12 + r() * 12);
        g.lineTo(x, y);
      }
      g.stroke();
    }
    for (const rad of [18, 38, 62]) { // rings between them
      g.beginPath();
      for (let k = 0; k <= 24; k++) {
        const a = (k / 24) * Math.PI * 2, rr = rad * (0.85 + r() * 0.3);
        k ? g.lineTo(128 + Math.cos(a) * rr, 128 + Math.sin(a) * rr) : g.moveTo(128 + Math.cos(a) * rr, 128 + Math.sin(a) * rr);
      }
      g.lineWidth = 1.2;
      g.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6).rotateY(Math.PI), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.position.set(103.2, -22.5, -142.08);
    m.raycast = () => {};
    m.renderOrder = 4;
    W.scene.add(m);
    return m;
  })();
  let rammed = 0, leak = 0;
  pass([100, -25.5, -149], [108, -21, -144], [[108, -64, -128], [106, -42, -133], [104, -26, -138.4], [96, -24, -138.6], [89, -30, -134], [86, -46, -129], [86, -64, -128]], { speed: 9 }, () => {
    audio.sample('leviathan_roar', { gain: 0.55, vary: 0, rate: 0.6, delay: 0.4 });
    rammed = 1;
  });
  W.add({
    update(dt, player) {
      if (rammed === 1 && pup.active && pup.pos.distanceTo(_pour.set(104, -26, -138.4)) < 3.5) {
        rammed = 2;
        leak = 9;
        crack.material.opacity = 1;
        player.shake = Math.max(player.shake, 0.9);
        audio.sample('glass_hit', { gain: 1, vary: 0, rate: 0.55 });
        audio.sample(audio.sfxOr('glass_creak', 'glass_hit'), { gain: 0.7, vary: 0, rate: 0.45, delay: 0.5 });
        audio.sample('hydraulic_hiss', { gain: 0.6, vary: 0, delay: 0.3 });
        game.hud.message('It <b>rammed the glass</b>. The pane is cracked — but it holds.', 4);
      }
      if (leak > 0) {
        leak -= dt;
        if (Math.random() < dt * 25) W.fx.burst(_pour.set(103.2 + (Math.random() - 0.5) * 0.8, -22.5 + (Math.random() - 0.5) * 0.6, -142.2), 0xd8f6ff, { count: 2, speed: 3 + leak * 0.3, life: 0.6, size: 0.08, gravity: 9, spread: 0.25, dir: _pourC2.set(0, 0.1, -1) });
      }
    },
  });
  // 4: it watches from the dark beyond the turbine as you set out across the trench
  pass([80.6, -60, -149], [86, -50, -143], [[58, -46, -222], [80, -40, -212], [100, -42, -206], [122, -50, -214], [140, -54, -240]], { speed: 5 }, () => {
    audio.sample('leviathan_groan', { gain: 0.6, vary: 0, rate: 0.5, delay: 2 });
  });

  // ---- the mood under the sea: open water, the habitats, the rig up top (area triggers cover the doors)
  let moodNow = null;
  W.add({
    update(dt, player) {
      if (player.pos.x < 26 || player.mount) return;
      const w = player.swimming ? player.waterAt(W) : null;
      let want = null;
      if (w && w.ocean && player.headUnder) want = 'sea';
      else if (game.camera.position.y > SEA_Y + 0.5 && player.pos.x < 113) want = 'top';
      else if (!player.swimming && player.pos.y < SEA_Y - 1 && player.pos.x < 200) want = 'deep';
      if (!want || want === moodNow) return;
      moodNow = want;
      const m = want === 'sea' ? { ...DEEP, atmosphere: 'azureSea' } : want === 'top' ? MOOD : DEEP;
      game.setAtmosphere(m.atmosphere);
      game.setAmbient(m.ambient);
    },
  });
  // ---- the wake-up spot: a respawn there gets the same little breath to make the swim on
  onRespawn(() => {
    const cp = game.checkpoint?.pos;
    if (cp && Math.abs(cp.x - WAKE.pos[0]) < 1.5 && Math.abs(cp.z - WAKE.pos[2]) < 1.5) {
      game.player.air = WAKE_AIR;
      game.hud.message('Swim for the <b>lit hatch</b> — the bubble vent on the way has air.', 4);
    }
  });
  // (a start at the trench floor counts the wave as done)
  if (new URLSearchParams(location.search).get('start') === 'azure1' || new URLSearchParams(location.search).get('jump') === 'azure1') {
    const once = { update: () => (W.remove(once), game.clearedEncounters?.add(WAVE_FLAG), (game.player.air = WAKE_AIR)) };
    W.add(once);
  }

  // ---- the ocean itself, cut round every breathable space (registered last: every habitat's air is known)
  level.azure.sea = oceanVolumes(W, [[36, FLOOR_Y - 8, -231], [112, SEA_Y, -40]], airs, [
    // soft currents at the trench's ends, gently stronger the further you go, push you back to the station
    { min: [36, FLOOR_Y - 8, -52], max: [112, SEA_Y, -46], current: [0, 0, -3.5] },
    { min: [36, FLOOR_Y - 8, -46], max: [112, SEA_Y, -40], current: [0, 0, -10] },
    { min: [36, FLOOR_Y - 8, -222], max: [112, SEA_Y, -216], current: [0, 0, 3.5] },
    { min: [36, FLOOR_Y - 8, -231], max: [112, SEA_Y, -222], current: [0, 0, 10] },
    ...currents, // (the turbine's pull and exhaust: animated by azureTurbine.js)
  ]);
}
