// AZURE — THE FLOODED DEPTHS. The water heart of the Cold Deep: a flooded wing of the station behind the
// chasm's east cliff, spliced into the descent between the turbine deck and the Cryo Lab (azure.js):
//   turbine deck (y -21) → entry tunnel through the cliff → THE SUMP (a sinkhole flooded to y -22.4, open
//   to the sky; a robo-squid and a school of robo-fish) → the DOWNPIPE (a slow fall down a flooded pipe on a downward current, with
//   a breather niche halfway) → THE BELL (an air pocket with a dry ledge: checkpoint) → the KELP GALLERY
//   (flooded to the ceiling; air pockets in ceiling recesses, the first with a checkpoint ledge; a
//   sub-drone) → a choice: on along the gallery (a second pocket, past the drone) or through the INTAKE
//   DUCT (a current sweeps you round a spiked corner) → the BALLAST LAB (a sub-drone; the ballast valve
//   sits under glass and only a shot banked off a mirror reaches it) → the valve floods the BALLAST SHAFT
//   and you ride the rising water 22 m up to the exit (y -25) → back through the cliff onto the Cryo Lab
//   porch.
// Water volumes (B.water): each box's max.y is the true surface above it, boxes that overlap agree on it,
// and where they overlap the first one registered wins (so a current only acts inside its own pipe).
// Swims are sized for 14 s of air: every stretch between air is well under 30 m, with the route marked by
// pulsing cyan beacons and every pocket by gold beacons, a shaft of warm light and a column of bubbles.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RED, YELLOW, GREEN } from '../colors.js';
import { Barrier } from '../entities/barrier.js';
import { Checkpoint } from '../entities/misc.js';
import { Glass, Mirror, TargetPanel } from '../entities/puzzle.js';
import { SubDrone } from '../entities/subdrone.js';
import { vortex } from '../entities/vortex.js';
import { waterSurface } from '../liquid.js';
import { audio } from '../audio.js';

// tiny seeded RNG so the kelp and crystals come out the same every load
function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildAzureFlooded(B) {
  const { W, game, CH, room, corridorX, wallX, wallZ, plat, hint, zoneTitle, area, light, devStart, water } = B;
  const zone = 'blue';
  const rng = mulberry32(0xf100d);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const DEEP = { music: 'music_blue', ambient: 'amb_abyss', atmosphere: 'azureDeep' };
  const box = (x1, y1, z1, x2, y2, z2, kind = 'wall') => W.box(x1, y1, z1, x2, y2, z2, kind, zone);
  const deco = (x1, y1, z1, x2, y2, z2, kind = 'glow3') => W.deco(x1, y1, z1, x2, y2, z2, kind, zone);
  const color = (c) => new THREE.Color(c);

  // ------------------------------------------------------------------ helpers
  // Steps: n neon-edged blocks from top a (at the x1 / z1 end) to top b, along x or z.
  function stairs(x1, z1, x2, z2, a, b, n, axis, thick = 0.5) {
    for (let i = 0; i < n; i++) {
      const top = a + ((b - a) * i) / (n - 1);
      if (axis === 'x') plat(x1 + ((x2 - x1) * i) / n, z1, x1 + ((x2 - x1) * (i + 1)) / n, z2, top, zone, thick);
      else plat(x1, z1 + ((z2 - z1) * i) / n, x2, z1 + ((z2 - z1) * (i + 1)) / n, top, zone, thick);
    }
  }

  // Wayfinding: beacons and chevrons merged into one mesh whose shader runs a pulse along the route
  // (`along` = metres along the path), so even a single dot in the murk shows which way to go.
  // Cyan leads on; gold marks air.
  const ROUTE = color(0x6fe6ff), AIR = color(0xffd98a).multiplyScalar(0.8);
  const markGeos = [];
  function mark(geo, along, tint) {
    geo.deleteAttribute('normal');
    geo.deleteAttribute('uv');
    const g = geo.index ? geo.toNonIndexed() : geo;
    const n = g.attributes.position.count;
    g.setAttribute('along', new THREE.Float32BufferAttribute(new Float32Array(n).fill(along), 1));
    const c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) tint.toArray(c, i * 3);
    g.setAttribute('tint', new THREE.Float32BufferAttribute(c, 3));
    markGeos.push(g);
  }
  const beacon = (x, y, z, along = 0, tint = ROUTE, r = 0.13) => mark(new THREE.OctahedronGeometry(r, 0).translate(x, y, z), along, tint);
  const chevShape = new THREE.Shape();
  chevShape.moveTo(-0.55, -0.25);
  chevShape.lineTo(0, 0.3);
  chevShape.lineTo(0.55, -0.25);
  chevShape.lineTo(0.55, 0.05);
  chevShape.lineTo(0, 0.6);
  chevShape.lineTo(-0.55, 0.05);
  chevShape.closePath();
  const _bx = new THREE.Vector3(), _by = new THREE.Vector3(), _bz = new THREE.Vector3(), _m4 = new THREE.Matrix4();
  // a chevron at (x, y, z) pointing along dir, its face toward `face` (both [x, y, z])
  function chevron(x, y, z, dir, face, along = 0, s = 1, tint = ROUTE) {
    _by.set(...dir).normalize();
    _bz.set(...face).normalize();
    _bx.crossVectors(_by, _bz).normalize();
    _bz.crossVectors(_bx, _by);
    const g = new THREE.ShapeGeometry(chevShape).scale(s, s, s);
    g.applyMatrix4(_m4.makeBasis(_bx, _by, _bz).setPosition(x, y, z));
    mark(g, along, tint);
  }
  // beacons every `step` m along a polyline of [x, y, z] points; returns the distance covered
  function trail(pts, { step = 2.2, along = 0, tint = ROUTE, r = 0.13 } = {}) {
    let s = along;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = V(...pts[i]), b = V(...pts[i + 1]), len = a.distanceTo(b);
      for (let d = i ? step / 2 : 0; d < len; d += step) beacon(...a.clone().lerp(b, d / len).toArray(), s + d, tint, r);
      s += len;
    }
    return s;
  }

  // Light shafts: open cones hanging from (x, yTop, z), additive, brightest at the top and soft at the
  // edges. Sky light through the sinkhole is cool; the light falling out of an air pocket is warm.
  const shaftGeos = [];
  function lightShaft(x, yTop, z, len, r0, r1, tint, tiltX = 0, tiltZ = 0) {
    const g = new THREE.CylinderGeometry(r0, r1, len, 18, 1, true).translate(0, -len / 2, 0).rotateX(tiltX).rotateZ(tiltZ).translate(x, yTop, z);
    const n = g.attributes.position.count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) tint.toArray(c, i * 3);
    g.setAttribute('tint', new THREE.Float32BufferAttribute(c, 3));
    shaftGeos.push(g.toNonIndexed());
  }
  const SKY = color(0x5fc8ff).multiplyScalar(0.9), WARM = color(0xffcf86);

  // Kelp: crossed ribbons that sway in the current (vertex shader, by height up the blade).
  const kelpGeos = [];
  function kelp(x, y, z, h) {
    const w = 0.3 + rng() * 0.25, rot = rng() * Math.PI;
    for (let k = 0; k < 2; k++) kelpGeos.push(new THREE.PlaneGeometry(w, h, 1, Math.max(3, Math.round(h * 1.4))).translate(0, h / 2, 0).rotateY(rot + (k * Math.PI) / 2).translate(x, y, z));
  }
  function kelpBed(x1, z1, x2, z2, y, n, h0 = 1.5, h1 = 4.5) {
    for (let i = 0; i < n; i++) kelp(x1 + rng() * (x2 - x1), y, z1 + rng() * (z2 - z1), h0 + rng() * (h1 - h0));
  }

  // Ice crystals (frosted and glowing), like the chasm's, merged per material.
  const iceGeos = { ice: [], glow: [] };
  function shard(x, y, z, h, r, tx, tz, kind) {
    const g = new THREE.OctahedronGeometry(1, 0);
    g.scale(r, h / 2, r);
    g.translate(0, h * 0.42, 0);
    g.rotateY(rng() * Math.PI);
    g.rotateZ(-tx);
    g.rotateX(tz);
    g.translate(x, y, z);
    iceGeos[kind].push(g);
  }
  function cluster(x, y, z, s, kind = 'ice', tx = 0, tz = 0, n = 4) {
    shard(x, y, z, s, s * 0.17, tx, tz, kind);
    for (let i = 1; i < n; i++) {
      const a = rng() * Math.PI * 2, d = s * (0.1 + rng() * 0.2);
      shard(x + Math.cos(a) * d, y, z + Math.sin(a) * d, s * (0.3 + rng() * 0.45), s * (0.07 + rng() * 0.06), tx + Math.cos(a) * (0.25 + rng() * 0.4), tz + Math.sin(a) * (0.25 + rng() * 0.4), kind);
    }
  }

  // Bubble vents (streams that rise toward air) and current motes (show which way the water flows);
  // both only run near the player.
  const vents = [], flows = [];
  const vent = (x, y, z, rate = 0.25, n = 2, r = 0.3) => vents.push({ p: V(x, y, z), rate, n, r, t: rng() * rate });
  const flow = (min, max, dir, speed, rate = 0.05) => flows.push({ min: V(...min), max: V(...max), dir: V(...dir).normalize(), speed, rate, t: 0, on: true });

  // A recess in a flooded room's ceiling (interior x1..x2, z1..z2, from the ceiling at y up to yTop):
  // the water stops at y, so it's a pocket of air. Gold beacons ring its rim, warm light falls out of it
  // and bubbles stream up into it.
  function airPocket(x1, z1, x2, z2, y, yTop, along = 0) {
    box(x1 - 0.5, y, z1 - 0.5, x2 + 0.5, yTop, z1, 'metal');
    box(x1 - 0.5, y, z2, x2 + 0.5, yTop, z2 + 0.5, 'metal');
    box(x1 - 0.5, y, z1, x1, yTop, z2, 'metal');
    box(x2, y, z1, x2 + 0.5, yTop, z2, 'metal');
    box(x1 - 0.5, yTop, z1 - 0.5, x2 + 0.5, yTop + 0.5, z2 + 0.5, 'ceil');
    waterSurface(W, x1, z1, x2, z2, y);
    // a lamp in the roof and a glowing band at head height, so it reads as a refuge
    deco((x1 + x2) / 2 - 0.6, yTop - 0.06, (z1 + z2) / 2 - 0.6, (x1 + x2) / 2 + 0.6, yTop, (z1 + z2) / 2 + 0.6, 'trimWhite');
    for (let x = x1 + 0.5; x < x2; x += 1.25) {
      beacon(x, y - 0.2, z1 + 0.15, along, AIR, 0.09);
      beacon(x, y - 0.2, z2 - 0.15, along, AIR, 0.09);
    }
    for (let z = z1 + 1.4; z < z2 - 0.8; z += 1.25) {
      beacon(x1 + 0.15, y - 0.2, z, along, AIR, 0.09);
      beacon(x2 - 0.15, y - 0.2, z, along, AIR, 0.09);
    }
    lightShaft((x1 + x2) / 2, y, (z1 + z2) / 2, 7, Math.min(x2 - x1, z2 - z1) * 0.42, Math.min(x2 - x1, z2 - z1) * 0.62, WARM.clone().multiplyScalar(0.7));
  }

  // A spike cluster bolted to a wall, spikes facing `face` ('+x' / '-x'). Barrier builds spikes pointing
  // up, so it's built lying down and turned; then its collider is set to the standing box.
  function wallSpikes(min, max, c, face, regen = 4) {
    const cx = (min[0] + max[0]) / 2, cy = (min[1] + max[1]) / 2, cz = (min[2] + max[2]) / 2;
    const sx = max[1] - min[1], sy = max[0] - min[0];
    const b = new Barrier(W, { min: [cx - sx / 2, cy - sy / 2, min[2]], max: [cx + sx / 2, cy + sy / 2, max[2]], color: c, kind: 'spike', regen, zone });
    b.group.rotation.z = face === '+x' ? -Math.PI / 2 : Math.PI / 2;
    b.min.set(...min);
    b.max.set(...max);
    b.solid.min.set(...min);
    b.solid.max.set(...max);
    return b;
  }
  // spikes hanging from a ceiling or a ledge's underside (pointing down)
  function hangingSpikes(min, max, c, regen = 4) {
    const b = new Barrier(W, { min, max, color: c, kind: 'spike', regen, zone });
    b.group.rotation.x = Math.PI;
    return b;
  }

  // ------------------------------------------------------------------ entry tunnel (from the turbine deck)
  // It leaves the turbine deck's east edge (x 108) at the deck's height and runs through the cliff.
  corridorX({ xStart: 108, xEnd: 124, y: -21, zone, cz: -114.6 });
  // a hazard-striped hatch frame on the cliff face, lit so it's seen from across the deck
  deco(108, -17.95, -116.2, 108.25, -17.7, -113, 'hazard');
  deco(108, -21, -116.25, 108.25, -17.7, -116.05, 'glow3');
  deco(108, -21, -113.15, 108.25, -17.7, -112.95, 'glow3');
  deco(107.9, -17.6, -115.6, 108.1, -17.3, -113.6, 'glow3');
  for (let x = 109.5; x < 123; x += 1.6) chevron(x, -20.96, -114.6, [1, 0, 0], [0, 1, 0], x, 0.7);
  zoneTitle([108.5, -21, -116.1], [111, -18, -113.1], 'AZURE', 'THE FLOODED DEPTHS', '#3aa8ff');
  area([108.5, -21, -116.1], [111, -18, -113.1], DEEP);
  hint([111, -21, -116.1], [114, -18, -113.1], 'The lower station is <b>flooded</b>. You can swim: look where you want to go, <b>Space</b> rises, <b>C</b> dives, <b>Shift</b> swims faster.', 6);

  // ------------------------------------------------------------------ THE SUMP: a flooded sinkhole open to the sky
  // interior x 124..146, z -104..-126; floor y -30; the water's surface at y -22.4.
  const SURF = -22.4;
  room({ x1: 124, x2: 146, zS: -104, zN: -126, y: -30, h: 36, zone, ceiling: false, floor: false, trim: false, wallKind: 'rock', w: [{ c: -114.6, w: 3, h: CH, y0: 9 }] });
  // the floor, with the Downpipe's mouth at x 139.25..142.75, z -120.75..-117.25
  const PX1 = 139.25, PX2 = 142.75, PZ1 = -120.75, PZ2 = -117.25, PCX = 141, PCZ = -119;
  box(123.5, -31, -126.5, 146.5, -30, PZ1, 'rock');
  box(123.5, -31, PZ2, 146.5, -30, -103.5, 'rock');
  box(123.5, -31, PZ1, PX1, -30, PZ2, 'rock');
  box(PX2, -31, PZ1, 146.5, -30, PZ2, 'rock');
  // hazard collar and a glowing frame round the mouth
  deco(PX1 - 0.6, -30, PZ1 - 0.6, PX2 + 0.6, -29.95, PZ1, 'hazard');
  deco(PX1 - 0.6, -30, PZ2, PX2 + 0.6, -29.95, PZ2 + 0.6, 'hazard');
  deco(PX1 - 0.6, -30, PZ1, PX1, -29.95, PZ2, 'hazard');
  deco(PX2, -30, PZ1, PX2 + 0.6, -29.95, PZ2, 'hazard');
  deco(PX1 - 0.7, -29.95, PZ1 - 0.7, PX2 + 0.7, -29.88, PZ1 - 0.6);
  deco(PX1 - 0.7, -29.95, PZ2 + 0.6, PX2 + 0.7, -29.88, PZ2 + 0.7);
  deco(PX1 - 0.7, -29.95, PZ1 - 0.6, PX1 - 0.6, -29.88, PZ2 + 0.6);
  deco(PX2 + 0.6, -29.95, PZ1 - 0.6, PX2 + 0.7, -29.88, PZ2 + 0.6);
  // an energy grate seals it (it stays open once broken, so the pipe can never trap you)
  new Barrier(W, { min: [PX1, -30.35, PZ1], max: [PX2, -30, PZ2], color: RED, kind: 'wall', zone });
  // the pier: the tunnel's floor runs on out over the water and steps down into it
  box(124, -22, -116.1, 131, -21, -113.1, 'floor');
  for (const z of [-116.1, -113.25]) {
    box(124, -21, z, 131, -20, z + 0.15, 'metal');
    deco(124, -20, z, 131, -19.94, z + 0.15);
  }
  for (const [x, z] of [[127, -116], [130.4, -116], [127, -113.6], [130.4, -113.6]]) box(x, -30, z, x + 0.4, -22, z + 0.4, 'metal');
  stairs(131, -116.1, 134, -113.1, -21.4, -23.4, 6, 'x');
  new Checkpoint(W, game, { pos: [126.5, -21, -114.6], yaw: -Math.PI / 2, size: [3, 3, 3] });
  area([124, -21, -116.1], [127, -18, -113.1], DEEP);
  hint([129, -21, -116.1], [131, -18, -113.1], 'Follow the <b>buoys</b> out to the marker, then dive. The pipe below is sealed by a <b>RED</b> grate.', 5);
  // the water (the Downpipe's box overlaps the column above its mouth, so the Sump is registered first)
  water([124, -30, -126], [146, SURF, -104]);
  // buoys from the pier to the marker over the mouth, and the marker's anchor line down to the grate
  const toMarker = trail([[134.6, SURF + 0.1, -114.6], [PCX - 0.6, SURF + 0.1, PCZ + 0.4]], { step: 1.6, r: 0.16 });
  box(PCX - 0.35, SURF - 0.3, PCZ - 0.35, PCX + 0.35, SURF + 0.5, PCZ + 0.35, 'metal'); // the marker buoy
  deco(PCX - 0.38, SURF + 0.5, PCZ - 0.38, PCX + 0.38, SURF + 0.6, PCZ + 0.38);
  const down1 = trail([[PCX, SURF - 0.4, PCZ], [PCX, -29.6, PCZ]], { step: 1.1, along: toMarker });
  chevron(PCX + 0.6, SURF + 1.2, PCZ, [0, -1, 0], [-1, 0, 0], toMarker, 0.8);
  chevron(PCX - 0.6, SURF + 1.2, PCZ, [0, -1, 0], [1, 0, 0], toMarker, 0.8);
  lightShaft(PCX, SURF + 0.4, PCZ, 8, 1.2, 1.8, color(0x6fe6ff).multiplyScalar(0.8));
  // a sub-drone patrols the sinkhole (you can always surface here to fight it)
  // a robo-squid haunts the sinkhole (meet it here, where the open sky is always overhead): it jets off in
  // a cloud of ink when you aim at it, and its slow ink torpedoes can be shot down
  B.roboSquid([134, -26.5, -109], { color: YELLOW, hp: 4, orbit: 3 });
  // and a school of robo-piranhas works the kelp on the far side (they leap at you on the pier, too)
  B.roboFish([129, -27.5, -121], { count: 4, color: [RED, YELLOW], patrol: 4 });
  // what's down there: a toppled pump housing, a sunken crane arm, crates, the old intake pipes
  box(126, -30, -109, 131.5, -27.2, -105, 'metal');
  deco(125.9, -28.8, -109.1, 131.6, -28.6, -104.9);
  box(132, -30, -110, 133.2, -29.4, -104.5, 'metal');
  box(134.5, -30, -124.5, 144, -29.3, -123.6, 'metal'); // fallen crane boom
  box(143.6, -30, -125.5, 145.5, -27.8, -122.5, 'metal');
  deco(143.5, -28, -125.6, 145.6, -27.9, -122.4, 'hazard');
  for (const [x, z, s] of [[127, -122, 1.4], [129, -124.5, 1.1], [136.5, -106, 1.2], [144, -106.5, 1.6]]) {
    box(x, -30, z, x + s, -30 + s, z + s, 'metal');
    deco(x - 0.02, -30 + s * 0.45, z - 0.02, x + s + 0.02, -30 + s * 0.55, z + s + 0.02, 'glow3');
  }
  deco(PX2 + 0.7, -30, -118.2, 146, -29.4, -117.6, 'metal'); // intake pipes run into the mouth
  deco(PX2 + 0.7, -30, -120.4, 146, -29.4, -119.8, 'metal');
  kelpBed(124.5, -125.5, 133, -118, -30, 26, 1.8, 5);
  kelpBed(135, -112, 145.5, -104.5, -30, 22, 1.8, 5.5);
  kelpBed(124.5, -112, 126.5, -104.5, -30, 8, 1.5, 4);
  for (let i = 0; i < 14; i++) {
    const side = i % 4, t = rng();
    const y = -29 + rng() * 26;
    if (side === 0) cluster(124.2, y, -105 - t * 20, 1.5 + rng() * 2.5, i % 3 ? 'ice' : 'glow', 1.1, 0);
    else if (side === 1) cluster(145.8, y, -105 - t * 20, 1.5 + rng() * 2.5, i % 3 ? 'ice' : 'glow', -1.1, 0);
    else if (side === 2) cluster(125 + t * 20, y, -125.8, 1.5 + rng() * 2.5, i % 3 ? 'ice' : 'glow', 0, 1.1);
    else cluster(125 + t * 20, y, -104.2, 1.5 + rng() * 2.5, i % 3 ? 'ice' : 'glow', 0, -1.1);
  }
  for (const [x, z, s] of [[125.5, -124.5, 4], [144.5, -124.6, 3.5], [125.5, -105.5, 3], [144.6, -105.4, 4.5]]) cluster(x, -30, z, s, 'ice', x < 135 ? 0.3 : -0.3, z < -115 ? 0.3 : -0.3, 5);
  // the sinkhole's rim far above, and daylight slanting down through the water
  for (const [x, z, tx, tz] of [[128, -108, 0.12, 0.08], [137, -121, -0.1, 0.12], [142, -109, 0.08, -0.1], [131, -119, -0.12, -0.06], [138.5, -113.5, 0.05, 0.05]]) {
    lightShaft(x, 6, z, 36, 1.1, 2.4, SKY, tx, tz);
  }
  for (let x = 125; x < 146; x += 3 + rng() * 2) {
    cluster(x, 6, -125.6, 3 + rng() * 3, 'ice', 0, 0.4);
    cluster(x, 6, -104.4, 3 + rng() * 3, 'ice', 0, -0.4);
  }

  // ------------------------------------------------------------------ the DOWNPIPE: a slow fall on a downward current
  // x 139.25..142.75, z -120.75..-117.25, from the Sump floor (y -30) down through the Bell's ceiling (y -50).
  water([PX1, -50, PZ1], [PX2, SURF, PZ2], { current: [0, -3.2, 0], surface: false });
  box(PX1 - 0.5, -49.5, PZ1 - 0.5, PX1, -31, PZ2 + 0.5, 'metal');
  box(PX1, -49.5, PZ2, PX2, -31, PZ2 + 0.5, 'metal');
  box(PX1, -49.5, PZ1 - 0.5, PX2, -31, PZ1, 'metal');
  // the east wall opens (y -41..-38) into the breather niche: an inverted cup with air trapped in its top
  box(PX2, -49.5, PZ1 - 0.5, PX2 + 0.5, -41, PZ2 + 0.5, 'metal');
  box(PX2, -38, PZ1 - 0.5, PX2 + 0.5, -31, PZ2 + 0.5, 'metal');
  const NX2 = PX2 + 2.5; // niche interior x PX2+0.5 .. NX2
  box(PX2, -41.5, PZ1 - 0.5, NX2 + 0.5, -41, PZ2 + 0.5, 'metal');
  box(PX2 + 0.5, -35.8, PZ1 - 0.5, NX2 + 0.5, -35.3, PZ2 + 0.5, 'metal');
  box(PX2 + 0.5, -41, PZ1 - 0.5, NX2 + 0.5, -35.8, PZ1, 'metal');
  box(PX2 + 0.5, -41, PZ2, NX2 + 0.5, -35.8, PZ2 + 0.5, 'metal');
  box(NX2, -41, PZ1, NX2 + 0.5, -35.8, PZ2, 'metal');
  water([PX2, -41, PZ1], [NX2, -37.6, PZ2]);
  deco(PX2 + 0.5, -36.4, PZ1, NX2, -36.32, PZ1 + 0.04, 'trimWhite');
  deco(PX2 + 0.5, -36.4, PZ2 - 0.04, NX2, -36.32, PZ2, 'trimWhite');
  deco(NX2 - 0.6, -35.86, PCZ - 0.6, NX2 - 0.2, -35.8, PCZ + 0.6, 'trimWhite');
  // gold beacons frame the niche's mouth; bubbles stream up inside it
  for (let z = PZ1 + 0.35; z < PZ2; z += 0.95) {
    beacon(PX2 - 0.12, -38.15, z, 30, AIR, 0.08);
    beacon(PX2 - 0.12, -40.85, z, 30, AIR, 0.08);
  }
  for (const y of [-40, -39]) {
    beacon(PX2 - 0.12, y, PZ1 + 0.15, 30, AIR, 0.08);
    beacon(PX2 - 0.12, y, PZ2 - 0.15, 30, AIR, 0.08);
  }
  lightShaft(PX2 + 1.5, -37.6, PCZ, 3.4, 0.7, 1.0, WARM.clone().multiplyScalar(0.35));
  vent(NX2 - 0.8, -40.9, PCZ, 0.18, 2);
  // glowing rings every 3 m and chevrons pointing down
  for (const y of [-33, -36, -43.5, -46.5]) {
    deco(PX1, y, PZ1, PX1 + 0.05, y + 0.08, PZ2);
    deco(PX2 - 0.05, y, PZ1, PX2, y + 0.08, PZ2);
    deco(PX1, y, PZ1, PX2, y + 0.08, PZ1 + 0.05);
    deco(PX1, y, PZ2 - 0.05, PX2, y + 0.08, PZ2);
  }
  for (const y of [-31.8, -34.6, -37.4, -40.2, -43, -45.8, -48.6]) {
    chevron(PX1 + 0.04, y, PCZ, [0, -1, 0], [1, 0, 0], down1 - y, 0.7);
    chevron(PCX, y, PZ1 + 0.04, [0, -1, 0], [0, 0, 1], down1 - y, 0.7);
  }
  flow([PX1 + 0.3, -49, PZ1 + 0.3], [PX2 - 0.3, -31, PZ2 - 0.3], [0, -1, 0], 3.2, 0.04);
  // where it spills into the Bell: the water's underside, hanging in the pipe's mouth
  waterSurface(W, PX1, PZ1, PX2, PZ2, -50);
  hint([PX1, -36, PZ1], [PX2, -31, PZ2], 'The current drags you down. <b>Space</b> slows the fall — the gold-lit <b>niche</b> on the way down holds air.', 5);

  // ------------------------------------------------------------------ THE BELL: an air pocket with a dry ledge
  // interior x 134..148, z -112..-126, floor y -58, ceiling y -50, water up to y -52.6.
  room({ x1: 134, x2: 148, zS: -112, zN: -126, y: -58, h: 8, zone, ceiling: false, trim: false, e: [{ c: -119, w: 3, h: 3 }] });
  box(133.5, -50, -126.5, 148.5, -49.5, PZ1, 'ceil');
  box(133.5, -50, PZ2, 148.5, -49.5, -111.5, 'ceil');
  box(133.5, -50, PZ1, PX1, -49.5, PZ2, 'ceil');
  box(PX2, -50, PZ1, 148.5, -49.5, PZ2, 'ceil');
  const BELL = -52.6;
  water([134, -58, -126], [148, BELL, -112]);
  plat(134, -126, 137.5, -112, -52.3, zone, 5.7); // the ledge
  stairs(137.5, -125.5, 139.5, -121.5, -52.65, -53.7, 4, 'x');
  new Checkpoint(W, game, { pos: [135.75, -52.3, -116], yaw: -Math.PI / 2, size: [3, 2.4, 6] });
  light(136.2, -50.7, -119, 0xffdcaa, 22, 16);
  hint([134, -58, -126], [148, -50, -112], 'An <b>air pocket</b>: your AIR refills with your head above water. The way on is <b>underwater</b> — follow the cyan lights east.', 6);
  // old diving lockers and a work lamp on the ledge, ribs along the ceiling
  for (const z of [-125.4, -124.2, -123]) {
    box(134.1, -52.3, z, 134.7, -50.6, z + 1, 'metal');
    deco(134.7, -51.2, z + 0.1, 134.74, -51.1, z + 0.9, 'glow3');
  }
  for (let x = 135; x < 148; x += 2.5) deco(x, -50.35, -126, x + 0.3, -50, -112, 'metal');
  deco(134, -50.3, -112.05, 148, -50.22, -112, 'trimWhite');
  deco(134, -50.3, -126, 148, -50.22, -125.95, 'trimWhite');
  box(144, -58, -125.5, 147.5, -55.5, -122, 'metal'); // a sunken compressor
  deco(143.9, -56.1, -125.6, 147.6, -55.9, -121.9, 'hazard');
  kelpBed(140, -125.5, 147.5, -123.5, -58, 7, 1, 2.6);
  kelpBed(142, -114.5, 147.5, -112.5, -58, 7, 1, 2.6);
  vent(146.5, -57.9, -113.5, 0.35, 1);
  // splash and spray where the pipe pours out
  vent(PCX, BELL - 0.4, PCZ, 0.12, 2, 1.2);
  // the way on: cyan beacons from under the pipe's outlet, down and east into the tunnel
  const toGallery = trail([[PCX, -54, PCZ], [146.5, -56.4, -119], [152, -56.4, -119], [155.5, -56, -121.5], [156, -54, -127]], { along: 40 });
  chevron(147.96, -54.2, -119, [0, -1, 0], [-1, 0, 0], 48, 0.9); // over the tunnel mouth, pointing at it
  deco(147.95, -55, -120.6, 148, -54.9, -117.4);

  // ------------------------------------------------------------------ tunnel to the gallery (flooded to its roof)
  box(148, -59, -121, 152, -58, -117, 'floor');
  box(148, -55, -121, 152, -54.5, -117, 'ceil');
  box(148.5, -58, -121, 151.5, -55, -120.5, 'metal');
  box(148.5, -58, -117.5, 151.5, -55, -117, 'metal');
  deco(148.5, -58, -120.5, 151.5, -57.92, -120.45);
  deco(148.5, -58, -117.55, 151.5, -57.92, -117.5);
  water([148, -58, -120.5], [152, -55, -117.5], { surface: false });

  // ------------------------------------------------------------------ the KELP GALLERY (flooded to the ceiling)
  // interior x 152..160, z -108..-152, floor y -60, ceiling y -52; air pockets G1 (z -128.5..-133.5, with
  // a checkpoint ledge) and G2 (z -142..-147) in ceiling recesses.
  const GC = -52;
  room({ x1: 152, x2: 160, zS: -108, zN: -152, y: -60, h: 8, zone, ceiling: false, trim: false, w: [{ c: -119, w: 3, h: 3, y0: 2 }, { c: -131, w: 3, h: 3 }, { c: -146, w: 3, h: 3.2 }] });
  const G1 = [153, -133.5, 159, -128.5], G2 = [153, -147, 159, -142];
  box(151.5, GC, -128.5, 160.5, GC + 0.5, -107.5, 'ceil');
  box(151.5, GC, -142, 160.5, GC + 0.5, -133.5, 'ceil');
  box(151.5, GC, -152.5, 160.5, GC + 0.5, -147, 'ceil');
  for (const [, za, , zb] of [G1, G2]) {
    box(151.5, GC, za, 153, GC + 0.5, zb, 'ceil');
    box(159, GC, za, 160.5, GC + 0.5, zb, 'ceil');
  }
  water([152, -60, -152], [160, GC, -108], { surface: false });
  airPocket(...G1, GC, -49.5, 60);
  airPocket(...G2, GC, -49.5, 80);
  vent(156, -59.9, -131, 0.16, 2, 0.6);
  vent(156, -59.9, -144.5, 0.16, 2, 0.6);
  // G1's ledge and checkpoint (steps hang down into the water so you can climb out)
  plat(153, -133.5, 155, -128.5, -51.8, zone, 0.5);
  stairs(155, -133, 156.5, -129, -52.2, -53.0, 3, 'x', 0.4);
  new Checkpoint(W, game, { pos: [154, -51.8, -131], yaw: 0, size: [2, 2.2, 5] });
  hint([153, -53.5, -133.5], [159, -49.5, -128.5], 'Two ways on: along the <b>gallery</b> to the next air pocket, past a sub-drone — or the <b>intake duct</b> (west, behind the YELLOW seal): its current sweeps you straight to the lab, if you clear the spikes in time.', 7);
  // the first barrier: GREEN, across the whole gallery
  new Barrier(W, { min: [152, -60, -124.2], max: [160, GC, -123.8], color: GREEN, kind: 'wall', zone });
  new SubDrone(W, { pos: [156, -56, -138.5], color: RED, orbit: 2.5, leash: 7, range: 18 });
  B.roboFish([156, -57.5, -114], { count: 3, color: GREEN, patrol: 3 }); // in the kelp, before the green barrier
  // vortex tubes: one shoots you up into G1 just past the barrier; from under G2 a second dives to the
  // lab doorway, where a third flings you across the lab to the Ballast Shaft
  vortex(B, { from: [157.5, -58.4, -127.4], to: [157.5, -53.2, -130.6], radius: 1, speed: 13, exitSpeed: 5.5 });
  vortex(B, { from: [156, -55.4, -144.5], to: [152.6, -58.3, -146], radius: 0.9, speed: 12, exitSpeed: 9 });
  vortex(B, { from: [151.2, -58.3, -146], to: [133, -52.6, -143.5], radius: 1.1, speed: 15, exitSpeed: 5 });
  hint([152, -60, -125.6], [160, -52, -124.6], 'A <b>vortex tube</b>: swim into its turbine and the current shoots you along — this one up into the air pocket.', 5);
  // the way on along the gallery: G1 → G2 → the lab doorway
  const toG2 = trail([[157.5, -54, -133.5], [157.5, -56, -139], [156.5, -54, -142]], { along: 62 });
  const toLab = trail([[155, -55, -147], [152.5, -58, -146], [146, -57, -146]], { along: toG2 + 2 });
  chevron(152.04, -56.1, -146, [0, -1, 0], [1, 0, 0], toLab, 0.9); // over the lab doorway
  // sunken lab benches and specimen racks along the walls, kelp in the floor silt
  for (const z of [-112, -116, -137, -150]) {
    box(158.2, -60, z - 1.2, 160, -58.6, z + 1.2, 'metal');
    deco(158.15, -59, z - 1.2, 158.2, -58.9, z + 1.2);
  }
  for (const z of [-113, -139.5]) {
    box(152, -60, z - 1.4, 153.2, -56.5, z + 1.4, 'metal');
    deco(153.2, -57.3, z - 1.3, 153.26, -57.2, z + 1.3, 'glow2');
  }
  kelpBed(152.4, -122, 159.6, -110, -60, 20, 1.5, 5);
  kelpBed(152.4, -140, 154, -134, -60, 8, 1.5, 4.5);
  kelpBed(158, -146, 159.6, -134, -60, 10, 1.5, 4.5);
  kelpBed(152.4, -151.5, 159.6, -148, -60, 10, 1.5, 4);
  for (const [x, z, tx, tz] of [[152.3, -109, 0.5, -0.3], [159.7, -127, -0.5, 0], [152.3, -151.5, 0.4, 0.4], [159.7, -151.7, -0.4, 0.4], [159.7, -109, -0.4, -0.3]]) cluster(x, -60, z, 2 + rng() * 1.5, rng() < 0.5 ? 'glow' : 'ice', tx, tz);
  for (const z of [-114, -120, -138, -150]) lightShaft(156, GC, z, 8, 0.25, 1.3, color(0x5fc8ff).multiplyScalar(0.55));
  for (const z of [-114, -120, -138, -150]) deco(155.6, GC - 0.06, z - 0.4, 156.4, GC, z + 0.4, 'trimWhite');

  // ------------------------------------------------------------------ the INTAKE DUCT: the fast way to the lab
  // From the gallery's west wall at G1 (z -131) west to x 143, then north into the lab's south wall
  // (x 140..143). A current sweeps you along; a RED spike cluster waits on the far wall of the corner.
  box(139.5, -61, -136, 151.5, -60, -129, 'floor');
  box(139.5, -57, -136, 151.5, -56.5, -129, 'ceil');
  box(139.5, -60, -129.5, 151.5, -57, -129, 'metal');
  box(143.5, -60, -133, 151.5, -57, -132.5, 'metal');
  box(143, -60, -135.5, 143.5, -57, -132.5, 'metal');
  box(139.5, -60, -135.5, 140, -57, -129.5, 'metal');
  water([143, -60, -132.5], [152, -57, -129.5], { current: [-4, 0, 0], surface: false });
  water([140, -60, -136], [143, -57, -129.5], { current: [0, 0, -4], surface: false });
  new Barrier(W, { min: [151.6, -60, -132.5], max: [151.95, -57, -129.5], color: YELLOW, kind: 'wall', zone });
  wallSpikes([140, -60, -132.5], [140.6, -57, -129.5], RED, '+x');
  flow([143.5, -59.6, -132.2], [151.5, -57.4, -129.8], [-1, 0, 0], 4, 0.03);
  flow([140.6, -59.6, -135.5], [142.7, -57.4, -130], [0, 0, -1], 4, 0.04);
  for (let x = 150.5; x > 143.5; x -= 1.4) chevron(x, -59.95, -131, [-1, 0, 0], [0, 1, 0], 100 + (151 - x), 0.7);
  for (let z = -130.5; z > -135.5; z -= 1.4) chevron(141.5, -59.95, z, [0, 0, -1], [0, 1, 0], 108 + (-130.5 - z), 0.7);
  for (let x = 144; x < 151.5; x += 2) deco(x, -57.06, -132.5, x + 0.8, -57, -129.5, 'hazard');

  // ------------------------------------------------------------------ the BALLAST LAB
  // interior x 126..151.5 (its east wall is the gallery's), z -136..-152, floor y -60, ceiling y -50,
  // flooded to the ceiling except under the Ballast Shaft (x 126..134, z -141..-151), which rises from
  // its north-west corner and holds air above y -47.8 (a ledge and checkpoint) until the valve floods it.
  box(125.5, -61, -152.5, 152, -60, -135.5, 'floor');
  box(125.5, -50, -141, 152, -49.5, -135.5, 'ceil');
  box(125.5, -50, -152.5, 152, -49.5, -151, 'ceil');
  box(134, -50, -151, 152, -49.5, -141, 'ceil');
  wallX(-136, -135.5, 125.5, 151.5, -60, -50, [{ c: 141.5, w: 3, y0: -60, h: 3 }], zone);
  box(125.5, -60, -152.5, 152, -50, -152, 'wall');
  box(125.5, -60, -152, 126, -50, -136, 'wall');
  water([134, -60, -152], [152, -50, -136], { surface: false });
  water([126, -60, -141], [134, -50, -136], { surface: false });
  water([126, -60, -152], [134, -50, -151], { surface: false });
  const LEVEL0 = -47.8, LEVEL1 = -25.6, RISE = 1.45;
  const shaftWater = water([126, -60, -151], [134, LEVEL0, -141], { surface: false });
  const shaftSurf = waterSurface(W, 126, -151, 134, -141, LEVEL0);
  new SubDrone(W, { pos: [145, -57, -139.5], color: GREEN, orbit: 2.5, leash: 8, range: 18 });
  // the intake duct's current runs on into a vortex tube that throws you up to the shaft too
  vortex(B, { from: [141.5, -58.7, -137.3], to: [133.4, -53, -142.2], radius: 1.1, speed: 14, exitSpeed: 5 });
  // lab dressing: benches, tanks, a dead console wall, kelp in the corners
  for (const x of [138, 143, 148]) {
    box(x, -60, -139, x + 2.6, -59, -137, 'metal');
    deco(x, -59, -139.05, x + 2.6, -58.94, -137);
  }
  for (const x of [139.5, 145.5]) {
    box(x, -60, -151.5, x + 2, -59.6, -149.5, 'metal');
    box(x, -54.6, -151.5, x + 2, -54.2, -149.5, 'metal');
    new Glass(W, { min: [x + 0.15, -59.6, -151.35], max: [x + 1.85, -54.6, -149.65] });
    cluster(x + 1, -59.6, -150.5, 3.6, 'glow', 0, 0, 3);
  }
  box(150, -60, -151.5, 151.5, -54, -147.5, 'metal');
  deco(149.95, -57, -151.4, 150, -55, -147.6, 'glow3');
  kelpBed(126.5, -140.5, 129, -136.5, -60, 7, 1.5, 4.5);
  kelpBed(146, -147, 151, -141, -60, 9, 1.5, 4);
  for (const x of [139, 146]) {
    lightShaft(x, -50, -144, 9, 0.25, 1.4, color(0x5fc8ff).multiplyScalar(0.5));
    deco(x - 0.4, -50.06, -144.4, x + 0.4, -50, -143.6, 'trimWhite');
  }
  // the way to the shaft, from both doorways
  const fromDuct = trail([[141.5, -58, -137], [138, -55, -142], [134.5, -52, -145]], { along: 116 });
  trail([[146, -57, -146], [138.5, -55, -146], [134.5, -52, -146]], { along: toLab });
  trail([[132, -51, -146], [132, LEVEL0 - 0.4, -146]], { along: fromDuct, tint: AIR, step: 0.9 });
  lightShaft(130.5, LEVEL0, -146, 9, 1.6, 2.4, WARM.clone().multiplyScalar(0.7));
  vent(132.5, -59.9, -143, 0.2, 2, 0.8);

  // ------------------------------------------------------------------ the BALLAST SHAFT (x 126..134, z -141..-151)
  // up to its roof at y -17.5; the exit (y -25) is in its west wall, and steps lead up to it.
  box(134, -50, -151.5, 134.5, -17.5, -140.5, 'wall');
  box(125.5, -50, -141, 134.5, -17.5, -140.5, 'wall');
  box(125.5, -50, -151.5, 134.5, -17.5, -151, 'wall');
  wallZ(125.5, 126, -151, -141, -50, -17.5, [{ c: -147, w: 3, y0: -25, h: CH }], zone);
  box(125.5, -17.5, -151.5, 134.5, -17, -140.5, 'ceil');
  // the ledge (checkpoint) just above the waterline, with steps down into the water
  plat(126, -151, 128, -141, -47.6, zone, 2.4);
  stairs(128, -145, 129.5, -141, -48.0, -48.8, 3, 'x', 0.5);
  new Checkpoint(W, game, { pos: [127.3, -47.6, -147], yaw: -Math.PI / 2, size: [2.4, 2.4, 6] });
  hint([126, -47.6, -151], [128, -44, -141], 'The <b>ballast valve</b> lies sealed under glass on the lab floor below. Dive in and drop a <b>GREEN</b> shot into the lit gap beside it: the <b>mirror</b> banks it onto the valve and floods the shaft.', 8);
  // water-level marks up the walls, and the exit lit at the top
  for (let y = -44; y < -26; y += 4) {
    deco(126, y, -151, 134, y + 0.06, -150.95);
    deco(126, y, -141.05, 134, y + 0.06, -141);
    deco(133.95, y, -151, 134, y + 0.06, -141);
  }
  stairs(126, -148.5, 128.5, -145.5, -25.4, -27, 5, 'x', 0.4);
  deco(126, -21.8, -148.6, 126.1, -21.6, -145.4, 'trimWhite');
  deco(126, -25, -148.7, 126.1, -21.6, -148.5, 'trimWhite');
  deco(126, -25, -145.5, 126.1, -21.6, -145.3, 'trimWhite');
  chevron(126.04, -21.1, -147, [0, -1, 0], [1, 0, 0], 200, 1.1, AIR); // over the exit
  // spike clusters jut from the walls on the way up: shoot them, or rise past on the other side
  hangingSpikes([130, -40, -151], [134, -39.1, -141], RED);
  hangingSpikes([126, -32.5, -151], [130, -31.6, -141], YELLOW);
  box(129.8, -39.1, -151, 130, -38.6, -141, 'metal');
  box(130, -31.6, -151, 130.2, -31.1, -141, 'metal');

  // The valve: a GREEN target on the floor of a glass case (lid, three sides) whose open east side faces
  // a mirror plate across a gap too narrow to swim into (its ends glazed too). A shot dropped into the gap
  // from above bounces off the mirror, under the lid and onto the target.
  const VX1 = 130, VX2 = 133.5, VZ1 = -149.5, VZ2 = -145.5, VY = -60;
  new Glass(W, { min: [VX1, VY + 3, VZ1], max: [VX2, VY + 3.1, VZ2] });
  new Glass(W, { min: [VX1, VY, VZ1], max: [VX1 + 0.1, VY + 3, VZ2] });
  new Glass(W, { min: [VX1 + 0.1, VY, VZ1], max: [VX2, VY + 3, VZ1 + 0.1] });
  new Glass(W, { min: [VX1 + 0.1, VY, VZ2 - 0.1], max: [VX2, VY + 3, VZ2] });
  new Glass(W, { min: [VX2, VY, VZ1], max: [134, -50, VZ1 + 0.1] });
  new Glass(W, { min: [VX2, VY, VZ2 - 0.1], max: [134, -50, VZ2] });
  new Mirror(W, { min: [134, VY, VZ1], max: [134.2, -50, VZ2] });
  deco(VX1 - 0.15, VY, VZ1 - 0.15, VX2, VY + 0.06, VZ1, 'glow2');
  deco(VX1 - 0.15, VY, VZ2, VX2, VY + 0.06, VZ2 + 0.15, 'glow2');
  deco(VX1 - 0.15, VY, VZ1, VX1, VY + 0.06, VZ2, 'glow2');
  deco(VX1, VY + 3.1, VZ1, VX2, VY + 3.16, VZ1 + 0.06, 'glow2');
  deco(VX1, VY + 3.1, VZ2 - 0.06, VX2, VY + 3.16, VZ2, 'glow2');
  deco(VX2 - 0.4, VY, VZ2 + 0.15, VX2 - 0.1, VY + 0.3, -141.2, 'metal'); // feed pipe to the shaft's intake
  for (let z = VZ1 + 0.4; z < VZ2; z += 0.7) beacon(VX2 + 0.25, -50.35, z, 0, color(0x5dff7a), 0.08); // the gap's mouth
  let flooding = false, rush = null, rushGain = 0;
  new TargetPanel(W, {
    min: [VX1 + 0.1, VY, VZ1 + 0.1], max: [VX2, VY + 0.12, VZ2 - 0.1], color: GREEN, face: 'up',
    onActivate: () => {
      if (flooding) return;
      flooding = true;
      audio.sample('elevator_start', { gain: 0.9, vary: 0 });
      audio.sample('alarm', { gain: 0.6, vary: 0 });
      game.player.shake = Math.max(game.player.shake, 0.35);
      game.hud.message('Ballast valve open — <b>the shaft is flooding</b>. Ride the water up: hold <b>Space</b> to stay at the surface.', 6);
    },
  });
  flows.push({ min: V(126.5, -59.5, -150.5), max: V(133.5, -50.5, -141.5), dir: V(0, 1, 0), speed: 3, rate: 0.03, t: 0, on: false, shaft: true });
  W.add({
    update(dt, player) {
      if (!flooding) return;
      const was = shaftWater.max.y;
      if (was < LEVEL1) {
        shaftWater.max.y = Math.min(LEVEL1, was + RISE * dt);
        shaftSurf.position.y = shaftWater.max.y - LEVEL0;
        shaftSurf.updateMatrix();
        // the inrush lifts swimmers with it (Player.swim settles a current c at v = target + 0.78 c),
        // so floating with Space held keeps your head out as the level climbs
        shaftWater.current ??= V(0, RISE / 0.78, 0);
      } else shaftWater.current = null;
      // the intake roars while it fills (quiet once it's full)
      const want = shaftWater.max.y < LEVEL1 && Math.abs(player.pos.x - 130) < 30 && Math.abs(player.pos.z + 146) < 30 ? 0.35 : 0;
      rushGain += (want - rushGain) * Math.min(1, dt * 2);
      if (!rush && rushGain > 0.01) rush = audio.createLoop('elevator_loop', { gain: 0, rate: 0.55 });
      rush?.setGain(rushGain);
      for (const f of flows) {
        if (!f.shaft) continue;
        f.on = shaftWater.max.y < LEVEL1;
        f.max.y = shaftWater.max.y - 0.5;
      }
    },
  });

  // ------------------------------------------------------------------ the exit: back through the cliff to the Cryo Lab porch
  corridorX({ xStart: 108, xEnd: 125.5, y: -25, zone, cz: -147 });
  for (let x = 124.5; x > 109; x -= 1.6) chevron(x, -24.96, -147, [-1, 0, 0], [0, 1, 0], 210 + (124.5 - x), 0.7);
  area([108, -25, -148.5], [114, -22, -145.5], DEEP);
  hint([118, -25, -148.5], [124, -22, -145.5], 'Out of the deep. <b>The Cryo Lab</b> is just ahead.', 4);

  // ------------------------------------------------------------------ meshes
  const trailMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      attribute float along;
      attribute vec3 tint;
      varying float vA;
      varying vec3 vT;
      varying float vD;
      void main() {
        vA = along;
        vT = tint;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vD = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uTime;
      varying float vA;
      varying vec3 vT;
      varying float vD;
      void main() {
        if (vD < 0.6) discard; // swimming through a beacon mustn't flash the screen
        // a pulse running along the route every 10 m (toward larger 'along')
        float p = pow(fract(vA * 0.1 - uTime * 0.5), 5.0);
        gl_FragColor = vec4(vT * (0.85 + 2.6 * p), 1.0);
      }`,
    side: THREE.DoubleSide,
  });
  const shaftMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      attribute vec3 tint;
      varying vec2 vUv;
      varying vec3 vN;
      varying vec3 vV;
      varying vec3 vT;
      varying float vDist;
      void main() {
        vUv = uv;
        vT = tint;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - w.xyz);
        vDist = distance(cameraPosition, w.xyz);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vN;
      varying vec3 vV;
      varying vec3 vT;
      varying float vDist;
      void main() {
        float edge = pow(abs(dot(normalize(vN), normalize(vV))), 2.5);
        edge *= smoothstep(2.5, 9.0, vDist); // fades out as you swim into it
        float fade = smoothstep(0.0, 0.85, vUv.y);
        float shimmer = 0.75 + 0.25 * sin(uTime * 0.9 + vUv.x * 25.0) * sin(uTime * 0.6 - vUv.x * 11.0);
        gl_FragColor = vec4(vT * edge * fade * shimmer * 0.17, 1.0);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const kelpTime = { value: 0 };
  const kelpMat = new THREE.MeshStandardMaterial({ color: 0x1d6a4c, emissive: 0x0a3d33, emissiveIntensity: 0.9, roughness: 0.85, side: THREE.DoubleSide });
  kelpMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = kelpTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float kh = uv.y * uv.y;
      transformed.x += sin(uTime * 1.1 + position.z * 0.7 + position.y * 0.45) * 0.4 * kh;
      transformed.z += cos(uTime * 0.85 + position.x * 0.6 + position.y * 0.35) * 0.32 * kh;`);
  };
  const iceMat = new THREE.MeshStandardMaterial({ color: 0xa9d4ff, emissive: 0x2a66ff, emissiveIntensity: 0.4, roughness: 0.18, metalness: 0.15, flatShading: true });
  const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x46e0ff).multiplyScalar(1.1) });
  const add = (geos, m, renderOrder = 0) => {
    if (!geos.length) return;
    const mesh = new THREE.Mesh(mergeGeometries(geos), m);
    geos.forEach((g) => g.dispose());
    mesh.matrixAutoUpdate = false;
    mesh.renderOrder = renderOrder;
    W.scene.add(mesh);
  };
  add(markGeos, trailMat);
  add(shaftGeos, shaftMat, 4);
  add(kelpGeos, kelpMat);
  add(iceGeos.ice, iceMat);
  add(iceGeos.glow, glowMat);

  // animation: the pulses, the shimmer, the kelp, bubble vents and current motes
  const _p = V(0, 0, 0);
  W.add({
    update(dt, player) {
      trailMat.uniforms.uTime.value += dt;
      shaftMat.uniforms.uTime.value += dt;
      kelpTime.value += dt;
      const pp = player.pos;
      if (pp.x < 107 || pp.z > -100 || pp.z < -156) return;
      for (const v of vents) {
        if (Math.abs(pp.x - v.p.x) > 28 || Math.abs(pp.z - v.p.z) > 28 || Math.abs(pp.y - v.p.y) > 24) continue;
        if ((v.t -= dt) > 0) continue;
        v.t = v.rate * (0.6 + Math.random() * 0.8);
        W.fx.bubbles(_p.set(v.p.x + (Math.random() - 0.5) * v.r, v.p.y, v.p.z + (Math.random() - 0.5) * v.r), v.n);
      }
      for (const f of flows) {
        if (!f.on || pp.x < f.min.x - 20 || pp.x > f.max.x + 20 || pp.z < f.min.z - 20 || pp.z > f.max.z + 20 || pp.y < f.min.y - 16 || pp.y > f.max.y + 16) continue;
        if ((f.t -= dt) > 0) continue;
        f.t = f.rate;
        _p.set(f.min.x + Math.random() * (f.max.x - f.min.x), f.min.y + Math.random() * (f.max.y - f.min.y), f.min.z + Math.random() * (f.max.z - f.min.z));
        W.fx.burst(_p, 0xbfeaff, { count: 1, speed: f.speed * 1.3, spread: 0.06, dir: f.dir, gravity: 0, drag: 0, life: 0.9, size: 0.09, mode: 'streak', stretch: 0.05 });
      }
    },
  });

  devStart('flooded', [110, -21, -114.6], -Math.PI / 2, [RED, YELLOW, GREEN]);
  devStart('flooded2', [135.75, -52.3, -116], -Math.PI / 2, [RED, YELLOW, GREEN]);
  devStart('flooded3', [127.3, -47.6, -147], -Math.PI / 2, [RED, YELLOW, GREEN]);
}
