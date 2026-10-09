// THE FORGE — the Crimson Foundry's mini-boss arena (~40×40 m), home of the Forge Titan (entities/
// forgeTitan.js), which guards the world's power source. Layout, in the arena's own frame (entry side
// "south", exit side "north"; the whole thing is rotated to face whatever `entry` side you pick):
//   floor: 8 m walkways along both side walls, strips at the entry and exit ends, and a 24×24 m middle made
//          of 4 m floor tiles over a lava pit (they drop away in phase 3, all but four stepping stones)
//   a lava channel along the exit wall (the Titan sleeps in it; a bridge rises out of it to the exit once
//   it's beaten), catwalks along both side walls (floor + 5.5 m) reached by jump pads, and more pads
//   hopping between the entry strip and the stones.
//   power source (optional): THE GEOTHERMAL CORE, a magma heart in a turbine cage hung over the middle,
//   drawing heat up from the channel. Shielded while the Titan lives; afterwards shoot it with red: it
//   overloads, cools to black crust, the lava crusts over, and game.shutDownWorld(world) is called.
// Walking in seals the entry and wakes the Titan; dying resets the fight (Titan, floor, seals, music).
// Beaten: the exits open. If game.isWorldDown(world) is (or becomes) true, the Titan is gone, the doors
// are open and the arena's lava crusts over.
//
// buildForgeArena(B, opts) (also exported as placeForgeTitan) → { titan, core, reset, powerDown,
//   entryPos, exitPos, bounds }. opts:
//   center: [x, y, z]  the floor's middle (floor top at y). size = 40: interior width (layout scales).
//   entry = 's', exit: wall sides ('n' -z, 's' +z, 'e' +x, 'w' -x); exit is always opposite the entry.
//   shell = true: build walls, ceiling, the door shutters and corridors. shell = false: the world provides
//     the room (walls at ±size/2 from the center, a ceiling >= height); only the floor, pit, channel,
//     catwalks, pads and lights are built, and the world's doorways are sealed with `seals` / `exitSeals`.
//   height = 18 (shell) / 16 (no shell): ceiling height above the floor (drone hatches hang under it).
//   entryLen = 8, exitLen = 4: corridor stubs beyond the entry / exit door (shell only; 0 = none).
//     The entry stub holds the checkpoint; connect your corridor to entryPos / exitPos (the stubs' far
//     ends, floor height, centered on the doorway). Each doorway is 3 m wide, B.CH tall.
//   seals: [{ min, max }] world boxes shut while the fight is on; exitSeals: shut until the Titan is beaten.
//   checkpoint: null = in the entry stub (shell) / none (no shell); false = none; { pos, yaw } = your own.
//   trigger: { min, max } that starts the fight (default: a band 4-11 m inside the entry wall).
//   colors = [0]: the colors that hurt its weak points (the Foundry has only red).
//   powerSource = true: build the Geothermal Core (false: the world builds its own power source; give
//     powerFrom: [x, y, z] so the Titan visibly draws on it). world = 'red': for shutDownWorld/isWorldDown.
//   music = 'music_miniboss' during the fight, areaMusic = 'music_red' after.
//   onStart(), onDefeated(): onDefeated runs once the Titan is beaten, or (with powerSource) once its core
//     is shut down.
import * as THREE from 'three';
import { RED } from '../colors.js';
import { audio } from '../audio.js';
import { mat } from '../materials.js';
import { liquidMaterial } from '../liquid.js';
import { JumpPad, Checkpoint } from '../entities/misc.js';
import { ForgeTitan } from '../entities/forgeTitan.js';

const CAT_Y = 5.5; // catwalk top above the floor
const TILE = 4;
const CORE_HP = 30; // red hits to overload the core
const ROT = { s: 0, e: Math.PI / 2, n: Math.PI, w: -Math.PI / 2 };
const OPPOSITE = { s: 'n', n: 's', e: 'w', w: 'e' };
const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
const rnd = (a, b) => a + Math.random() * (b - a);

// a cooled-rock skin that fades in over lava as the power dies (cracks stay see-through)
let crustTex = null;
function crustTexture() {
  if (crustTex) return crustTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#2a2220';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3000; i++) {
    const v = 20 + Math.random() * 40;
    g.fillStyle = `rgba(${v},${v * 0.85},${v * 0.8},0.5)`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 4, 2 + Math.random() * 4);
  }
  // cracks: punched out, so the dull glow under the crust shows through
  g.globalCompositeOperation = 'destination-out';
  g.lineWidth = 2.5;
  for (let i = 0; i < 26; i++) {
    let x = Math.random() * 256, y = Math.random() * 256;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += (Math.random() - 0.5) * 60;
      y += (Math.random() - 0.5) * 60;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  crustTex = new THREE.CanvasTexture(c);
  crustTex.wrapS = crustTex.wrapT = THREE.RepeatWrapping;
  crustTex.colorSpace = THREE.SRGBColorSpace;
  return crustTex;
}

// A shutter that slides up out of a doorway (into the wall above) and slams back down.
function shutter(W, min, max, open) {
  const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat('metal', 'red'));
  const glow = new THREE.Mesh(new THREE.BoxGeometry(size[0] + 0.02, 0.12, size[2] + 0.04), mat('glow0', 'red'));
  glow.position.y = -size[1] / 2 + 0.3;
  mesh.add(glow);
  W.scene.add(mesh);
  const solid = W.addSolid(new THREE.Vector3(...min), new THREE.Vector3(...max), {});
  const d = { k: open ? 1 : 0, want: open ? 1 : 0 };
  d.set = (o, instant = false) => {
    if (d.want !== (o ? 1 : 0) && !instant) (o ? audio.doorOpen() : audio.door());
    d.want = o ? 1 : 0;
    if (instant) d.k = d.want;
  };
  d.update = (dt) => {
    d.k += THREE.MathUtils.clamp(d.want - d.k, -dt * 2.2, dt * 1.2);
    mesh.position.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2 + d.k * (size[1] + 0.05), (min[2] + max[2]) / 2);
    solid.enabled = d.k < 0.7;
  };
  d.update(0);
  return d;
}

export function buildForgeArena(B, opts = {}) {
  const {
    center = [0, 0, 0], size = 40, entry = 's', shell = true, entryLen = 8, exitLen = 4, seals = [], exitSeals = [],
    checkpoint = null, trigger = null, colors = [RED], powerSource = true, powerFrom = null, world: worldName = 'red',
    music = 'music_miniboss', areaMusic = 'music_red', onStart = null, onDefeated = null,
  } = opts;
  const H = opts.height ?? (shell ? 18 : 16);
  if (opts.exit && opts.exit !== OPPOSITE[entry]) console.warn('[forge] the exit is always opposite the entry');
  const { W, game, CH, T, plat, light, onRespawn } = B;
  const zone = 'red';
  const [cx, y, cz] = center;
  const half = size / 2;
  const S = half / 20; // the layout below is drawn for 40 m; it scales with size
  const lavaY = y - 1.5; // the pit's lava surface
  const chanY = y - 1.2; // the channel's

  // ---- the arena's own frame: u across, v from the exit wall (-half) to the entry wall (+half),
  // rotated by a multiple of 90° so boxes stay axis-aligned
  const rot = ROT[entry] ?? 0;
  const cs = Math.round(Math.cos(rot)), sn = Math.round(Math.sin(rot));
  const P = (u, v) => [cx + u * cs + v * sn, cz - u * sn + v * cs];
  const pt = (u, py, v) => {
    const [x, z] = P(u, v);
    return [x, py, z];
  };
  const rect = (u1, v1, u2, v2) => {
    const [x1, z1] = P(u1, v1), [x2, z2] = P(u2, v2);
    return { minX: Math.min(x1, x2), maxX: Math.max(x1, x2), minZ: Math.min(z1, z2), maxZ: Math.max(z1, z2) };
  };
  const lbox = (u1, y1, v1, u2, y2, v2, kind, o) => {
    const r = rect(u1, v1, u2, v2);
    return W.box(r.minX, y1, r.minZ, r.maxX, y2, r.maxZ, kind, zone, o);
  };
  const ldeco = (u1, y1, v1, u2, y2, v2, kind) => lbox(u1, y1, v1, u2, y2, v2, kind, { solid: false });
  const vec = (pu, pv) => [pu * cs + pv * sn, 0, -pu * sn + pv * cs];
  const s = (n) => n * S; // scaled layout distance

  // ---------------------------------------------------------------- shell
  if (shell) {
    const wallWithDoor = (v1, v2) => {
      lbox(-half - T, y, v1, -1.5, y + H, v2, 'wall');
      lbox(1.5, y, v1, half + T, y + H, v2, 'wall');
      lbox(-1.5, y + CH, v1, 1.5, y + H, v2, 'wall');
    };
    wallWithDoor(half, half + T);
    wallWithDoor(-half - T, -half);
    lbox(-half - T, y, -half, -half, y + H, half, 'wall');
    lbox(half, y, -half, half + T, y + H, half, 'wall');
    lbox(-half - T, y + H, -half - T, half + T, y + H + 0.5, half + T, 'ceil');
    for (const su of [-1, 1]) ldeco(su * half - (su > 0 ? 0.05 : -0.05), y + 4.2, -half, su * half, y + 4.28, half, 'glow0');
    // corridor stubs beyond the doors
    const stub = (v1, v2) => {
      lbox(-1.5 - T, y - 1, v1, 1.5 + T, y, v2, 'floor');
      lbox(-1.5 - T, y + CH, v1, 1.5 + T, y + CH + 0.5, v2, 'ceil');
      lbox(-1.5 - T, y, v1, -1.5, y + CH, v2, 'wall');
      lbox(1.5, y, v1, 1.5 + T, y + CH, v2, 'wall');
      ldeco(-1.5, y + 0.02, v1, -1.44, y + 0.1, v2, 'glow0');
      ldeco(1.44, y + 0.02, v1, 1.5, y + 0.1, v2, 'glow0');
    };
    if (entryLen > 0) stub(half, half + T + entryLen);
    if (exitLen > 0) stub(-half - T - exitLen, -half);
  }
  // walls carry down past the floor where the lava channel runs along them
  lbox(-half - T, y - 3, -half - T, half + T, y, -half, 'wall');
  lbox(-half - T, y - 3, -half, -half, y, s(-16), 'wall');
  lbox(half, y - 3, -half, half + T, y, s(-16), 'wall');
  // floor: walkways along the sides, strips at both ends; the middle is tiles over the lava pit
  const P12 = s(12);
  lbox(-half, y - 3, s(-16), -P12, y, half, 'floor');
  lbox(P12, y - 3, s(-16), half, y, half, 'floor');
  lbox(-P12, y - 3, s(-16), P12, y, -P12, 'floor');
  lbox(-P12, y - 3, P12, P12, y, half, 'floor');
  lbox(-P12, y - 2.5, -P12, P12, lavaY, P12, 'acid', { hazard: 'acid' });
  // the lava channel along the exit wall, with hazard stripes on its bank
  lbox(-half, y - 2.2, -half, half, chanY, s(-16), 'acid', { hazard: 'acid' });
  ldeco(-half, y, s(-16.5), half, y + 0.02, s(-16), 'hazard');
  // glowing seams around the pit edge: a hint that the middle isn't solid ground
  ldeco(-P12 - 0.1, y + 0.005, -P12 - 0.1, P12 + 0.1, y + 0.03, -P12, 'glow0');
  ldeco(-P12 - 0.1, y + 0.005, P12, P12 + 0.1, y + 0.03, P12 + 0.1, 'glow0');
  ldeco(-P12 - 0.1, y + 0.005, -P12, -P12, y + 0.03, P12, 'glow0');
  ldeco(P12, y + 0.005, -P12, P12 + 0.1, y + 0.03, P12, 'glow0');

  // catwalks along the side walls, on posts
  const catwalks = [];
  for (const su of [-1, 1]) {
    const a = su < 0 ? -half : s(16.5), b = su < 0 ? s(-16.5) : half;
    const r = rect(a, s(-14), b, s(14));
    plat(r.minX, r.minZ, r.maxX, r.maxZ, y + CAT_Y, zone, 0.4, 'grate');
    catwalks.push({ ...r, y: y + CAT_Y });
    const wu = su < 0 ? -half : half - 0.5;
    for (const pv of [-12, -4, 4, 12]) lbox(wu, y, s(pv) - 0.25, wu + 0.5, y + CAT_Y - 0.4, s(pv) + 0.25, 'metal');
    // a rail of light along the inner edge, on steel posts
    const eu = su < 0 ? b : a;
    ldeco(eu - 0.04, y + CAT_Y + 0.9, s(-14), eu + 0.04, y + CAT_Y + 0.98, s(14), 'glow0');
    for (let pv = -14; pv <= 14; pv += 4) ldeco(eu - 0.05, y + CAT_Y, s(pv) - 0.05, eu + 0.05, y + CAT_Y + 0.95, s(pv) + 0.05, 'metal');
  }

  // jump pads: up to the catwalks, and across the pit gap between the entry strip and the stones
  for (const su of [-1, 1]) {
    for (const pv of [-6, 8]) new JumpPad(W, { pos: pt(s(su * 14), y, s(pv)), power: 18, push: vec(su * 4.5, 0), color: 0xff9a50 });
    new JumpPad(W, { pos: pt(s(su * 6), y, s(15.5)), power: 15, push: vec(0, -6.5 * S), color: 0xff9a50 });
  }

  // ---------------------------------------------------------------- the floor tiles over the pit
  const keep = new Set(['1,1', '4,1', '1,4', '4,4']); // stepping stones that survive the collapse
  const tileGroup = new THREE.Group();
  W.scene.add(tileGroup);
  const tileMat = mat('floor', zone);
  const seamMat = new THREE.MeshBasicMaterial({ color: 0xff5a14 });
  const tileGeo = new THREE.BoxGeometry(TILE * S - 0.06, 1, TILE * S - 0.06);
  const seamGeo = new THREE.BoxGeometry(TILE * S + 0.02, 0.04, TILE * S + 0.02);
  const tiles = [];
  for (let c = 0; c < 6; c++)
    for (let r = 0; r < 6; r++) {
      const [x, z] = P(-P12 + (c + 0.5) * TILE * S, -P12 + (r + 0.5) * TILE * S);
      const mesh = new THREE.Mesh(tileGeo, tileMat);
      mesh.position.set(x, y - 0.5, z);
      const seam = new THREE.Mesh(seamGeo, seamMat);
      seam.position.y = 0.47;
      mesh.add(seam);
      tileGroup.add(mesh);
      const h = (TILE * S) / 2;
      const solid = W.addSolid(new THREE.Vector3(x - h, y - 1, z - h), new THREE.Vector3(x + h, y, z + h), { delta: new THREE.Vector3(), moving: true, kind: 'floor' });
      const d = Math.hypot(x - cx, z - cz);
      tiles.push({ mesh, solid, x, z, keep: keep.has(c + ',' + r), vy: 0, delay: 0.25 + (d / (12 * S)) * 0.8, tilt: new THREE.Vector3(rnd(-0.25, 0.25), 0, rnd(-0.25, 0.25)), y: 0 });
    }
  // pads on the stones hop you back to the entry strip
  for (const su of [-1, 1]) new JumpPad(W, { pos: pt(s(su * 6), y, s(5)), power: 15, push: vec(0, 6.5 * S), color: 0xff9a50 });

  let floor = 'up'; // 'up' | 'warn' | 'drop' | 'down' | 'rise'
  let floorT = 0;
  const placeTile = (t, dy, tilt) => {
    t.y = dy;
    t.mesh.position.set(t.x, y - 0.5 + dy, t.z);
    t.mesh.rotation.set(t.tilt.x * tilt, 0, t.tilt.z * tilt);
    const old = t.solid.min.y;
    t.solid.min.y = y - 1 + dy;
    t.solid.max.y = y + dy;
    t.solid.delta.set(0, t.solid.min.y - old, 0);
  };
  const restoreFloor = () => {
    floor = 'up';
    for (const t of tiles) {
      placeTile(t, 0, 0);
      t.solid.delta.set(0, 0, 0);
      t.vy = 0;
    }
  };

  // ---------------------------------------------------------------- doors, seals and the exit bridge
  const doorBox = (v) => {
    const r = rect(-1.6, v - 0.18, 1.6, v + 0.18);
    return [[r.minX, y, r.minZ], [r.maxX, y + CH, r.maxZ]];
  };
  const entrySeals = [], exitDoors = [];
  if (shell) {
    entrySeals.push(shutter(W, ...doorBox(half + T / 2), true));
    exitDoors.push(shutter(W, ...doorBox(-half - T / 2), false));
  }
  for (const g of seals) entrySeals.push(shutter(W, g.min, g.max, true));
  for (const g of exitSeals) exitDoors.push(shutter(W, g.min, g.max, false));
  const setSeals = (list, o, instant) => list.forEach((d) => d.set(o, instant));
  const br = rect(-1.5, -half, 1.5, s(-16));
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(br.maxX - br.minX, 0.6, br.maxZ - br.minZ), mat('plat', zone));
  const [bx, bz] = P(0, (-half + s(-16)) / 2);
  bridge.position.set(bx, chanY - 1.6, bz);
  for (const su of [-1, 1]) {
    const along = (br.maxX - br.minX) > (br.maxZ - br.minZ);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(along ? br.maxX - br.minX : 0.06, 0.08, along ? 0.06 : br.maxZ - br.minZ), mat('glow0', zone));
    edge.position.set(along ? 0 : su * 1.5, 0.27, along ? su * 1.5 : 0);
    bridge.add(edge);
  }
  W.scene.add(bridge);
  const bridgeSolid = W.addSolid(new THREE.Vector3(br.minX, y - 0.6, br.minZ - 0.1), new THREE.Vector3(br.maxX, y, br.maxZ + 0.1), { kind: 'metal' });
  bridgeSolid.enabled = false;
  let bridgeK = 0, bridgeWant = 0;

  const cp = checkpoint === false ? null : checkpoint || (shell && entryLen > 0 ? { pos: pt(0, y, half + T + Math.min(entryLen - 1.5, 5)), yaw: rot } : null);
  if (cp) new Checkpoint(W, game, { pos: cp.pos, yaw: cp.yaw ?? rot, size: [3, 3, 3], name: 'THE FORGE' });

  // ---------------------------------------------------------------- set dressing
  const falls = [];
  if (shell) {
    // lavafalls pouring from wall pipes into the channel
    for (const su of [-1, 1]) {
      const fu = s(su * 9);
      lbox(fu - 1.6, y + 11, -half, fu + 1.6, y + 12.4, -half + 1.6, 'metal');
      ldeco(fu - 1.65, y + 11.2, -half + 1.6, fu + 1.65, y + 11.35, -half + 1.65, 'glow0');
      const fall = new THREE.Mesh(new THREE.BoxGeometry(2.2, y + 11 - chanY, 0.4), liquidMaterial(zone, false));
      const [fx0, fz0] = P(fu, -half + 0.9);
      fall.position.set(fx0, (y + 11 + chanY) / 2, fz0);
      fall.rotation.y = rot;
      W.scene.add(fall);
      falls.push(fall);
    }
    // pipes along the side walls, gantry beams, furnace mouths by the entry, seams up the walls
    for (const su of [-1, 1]) {
      const a = su * half, b = su * (half - 0.8);
      lbox(Math.min(a, b), y + 9.5, -half, Math.max(a, b), y + 10.3, half, 'metal');
      ldeco(Math.min(a, b) - 0.02, y + 9.85, -half, Math.max(a, b) + 0.02, y + 9.95, half, 'glow0');
      for (const pv of [-10, 0, 10]) ldeco(su > 0 ? half - 0.04 : -half, y + CAT_Y + 1.5, s(pv) - 0.08, su > 0 ? half : -half + 0.04, y + H - 2, s(pv) + 0.08, 'glow0');
      const fu = s(su * 8);
      lbox(fu - 2.2, y, half - 1.2, fu + 2.2, y + 3.6, half, 'metal');
      ldeco(fu - 1.6, y + 0.6, half - 1.23, fu + 1.6, y + 2.6, half - 1.21, 'glow0');
      for (let k = 0; k < 6; k++) ldeco(fu - 1.5 + k * 0.6, y + 0.5, half - 1.32, fu - 1.38 + k * 0.6, y + 2.7, half - 1.2, 'metal');
    }
    for (const pv of [-8, 8]) lbox(-half, y + H - 1.6, s(pv) - 0.4, half, y + H - 0.8, s(pv) + 0.4, 'metal');
  }
  light(...pt(0, y + Math.min(14, H - 3), s(-10)), 0xff5a22, 32, 46);
  light(...pt(0, y + 8, s(12)), 0xff7a3a, 18, 34);

  // ---------------------------------------------------------------- the geothermal core (optional)
  const coreY = y + Math.min(13.6, H - 4.4);
  const core = { state: powerSource ? 'shielded' : 'none', t: 0, flash: 0, color: null, pos: new THREE.Vector3(cx, coreY, cz) };
  const crustMat = new THREE.MeshStandardMaterial({ map: crustTexture(), color: 0x8a7a72, roughness: 1, metalness: 0, transparent: true, opacity: 0, depthWrite: false });
  const fallCrust = new THREE.MeshStandardMaterial({ map: crustTexture(), color: 0x6a5a52, roughness: 1 });
  let heart = null, heartCrust = null, shield = null, shieldMat = null, coreLight = null, collar = null, coreGroup = null;
  const rings = [], conduitSeams = [];
  if (powerSource) {
    coreGroup = new THREE.Group();
    coreGroup.position.copy(core.pos);
    W.scene.add(coreGroup);
    heart = new THREE.Mesh(new THREE.IcosahedronGeometry(2.1, 3), liquidMaterial(zone, false)); // rolls like the lava
    coreGroup.add(heart);
    heartCrust = new THREE.Mesh(new THREE.IcosahedronGeometry(2.16, 3), crustMat);
    coreGroup.add(heartCrust);
    const ironMat = new THREE.MeshStandardMaterial({ map: mat('metal', zone).map, color: 0x7a6a62, metalness: 0.8, roughness: 0.45 });
    // turbine: two counter-spinning finned rings
    for (let i = 0; i < 2; i++) {
      const ring = new THREE.Group();
      ring.add(new THREE.Mesh(new THREE.TorusGeometry(3.0 + i * 0.5, 0.16, 6, 40), ironMat));
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.7), ironMat);
        fin.position.set(Math.cos(a) * (3.0 + i * 0.5), Math.sin(a) * (3.0 + i * 0.5), 0);
        fin.rotation.z = a;
        fin.rotation.y = 0.5;
        ring.add(fin);
      }
      ring.rotation.x = i ? Math.PI / 2 : 0.3;
      coreGroup.add(ring);
      rings.push(ring);
    }
    // clamps from the ceiling and a glowing collar
    const up = y + H - coreY;
    for (let a = 0; a < 4; a++) {
      const ang = (a / 4) * Math.PI * 2 + Math.PI / 4;
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.35, up + 1.5, 0.35), ironMat);
      strut.position.set(Math.cos(ang) * 1.7, up / 2 + 1.0, Math.sin(ang) * 1.7);
      strut.rotation.z = Math.cos(ang) * 0.25;
      strut.rotation.x = -Math.sin(ang) * 0.25;
      coreGroup.add(strut);
    }
    collar = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.14, 6, 24), new THREE.MeshBasicMaterial({ color: 0xff7a2a }));
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 2.0;
    coreGroup.add(collar);
    // conduits drawing heat up out of the lava channel: up the exit wall, across the ceiling, into the core
    const pipeSeg = (from, to) => {
      const dir = to.clone().sub(from);
      const len = dir.length();
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, len, 12).translate(0, len / 2, 0), ironMat);
      pipe.position.copy(from);
      pipe.quaternion.setFromUnitVectors(UP, dir.clone().normalize());
      W.scene.add(pipe);
      const nBands = Math.max(2, Math.floor(len / 2.2));
      for (let k = 1; k < nBands; k++) {
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.3, 12), new THREE.MeshBasicMaterial({ color: 0xff6a1a }));
        band.position.y = (k / nBands) * len;
        pipe.add(band);
        conduitSeams.push({ m: band.material, k: (conduitSeams.length % 40) / 40 });
      }
    };
    const ceilY = y + H - 1.4;
    const V3 = (a) => new THREE.Vector3(...a);
    for (const su of [-1, 1]) {
      pipeSeg(V3(pt(su * 3.5, chanY - 0.3, -half + 0.7)), V3(pt(su * 3.5, ceilY, -half + 0.7)));
      pipeSeg(V3(pt(su * 3.5, ceilY, -half + 0.7)), V3(pt(su * 3.5, ceilY, 0)));
      pipeSeg(V3(pt(su * 3.5, ceilY, 0)), V3(pt(su * 1.0, coreY + 1.6, 0)));
    }
    // the shield: a shell of heat-shimmer that turns every shot aside while the Titan stands
    shieldMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff5a2a).multiplyScalar(1.2), transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    shield = new THREE.Mesh(new THREE.IcosahedronGeometry(4.1, 2), shieldMat);
    coreGroup.add(shield);
    coreLight = W.addLight(0xff6a20, 16, 30, 1.5);
    coreLight.position.set(cx, coreY - 1.5, cz);
    core.onHit = (color, hit) => {
      core.color = null;
      if (core.state === 'shielded' || hit.object === shield) {
        shieldMat.opacity = 0.6;
        return 'immune';
      }
      if (core.state !== 'exposed' || color !== RED) return 'immune';
      core.flash = 1;
      core.hp--;
      audio.bossCoreHit();
      W.fx.burst(hit.point, 0xffb060, { count: 14, speed: 7, life: 0.5, size: 0.3, gravity: 6 });
      if (core.hp <= 0) {
        core.state = 'overload';
        core.t = 0;
        audio.sample('alarm', { gain: 0.9 });
        game.hud.message('The core is <b>overloading</b>!', 3);
      }
      return 'hit';
    };
    core.hp = CORE_HP;
    coreGroup.userData.hit = core;
    W.addHittable(coreGroup);
  }

  // the arena's own lava crusts over when the world's power dies
  const crusts = [];
  const crustOver = (r, top) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(r.maxX - r.minX, r.maxZ - r.minZ).rotateX(-Math.PI / 2), crustMat);
    m.position.set((r.minX + r.maxX) / 2, top + 0.16, (r.minZ + r.maxZ) / 2);
    m.visible = false;
    W.scene.add(m);
    crusts.push(m);
  };
  crustOver(rect(-half, -half, half, s(-16)), chanY);
  crustOver(rect(-P12, -P12, P12, P12), lavaY);
  const all = rect(-half, -half, half, half);
  let crust = 0;
  const setCrust = (k) => {
    crust = k;
    crustMat.opacity = 0.95 * k;
    crusts.forEach((c) => (c.visible = k > 0));
    if (heartCrust) heartCrust.visible = k > 0;
    if (coreLight) coreLight.intensity = 16 * (1 - k);
    collar?.material.color.setRGB(1, 0.48, 0.16).multiplyScalar(1.8 * (1 - k) + 0.04);
    if (k >= 1) {
      falls.forEach((f) => (f.material = fallCrust));
      if (heart) heart.material = fallCrust;
      // the lava under the crust stops bubbling
      if (W.liquids) W.liquids = W.liquids.filter((L) => !(L.min.x >= all.minX - 0.1 && L.max.x <= all.maxX + 0.1 && L.min.z >= all.minZ - 0.1 && L.max.z <= all.maxZ + 0.1));
    }
  };
  setCrust(0);

  // ---------------------------------------------------------------- the Titan
  let fighting = false;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    setSeals(exitDoors, true);
    bridgeWant = 1;
    if (floor !== 'up') floor = 'rise';
    onDefeated?.();
  };
  const titan = new ForgeTitan(W, game, {
    floorY: y,
    colors,
    rise: P(0, s(-18)),
    home: P(0, s(-9)),
    yaw: rot,
    bounds: rect(s(-10), s(-12), s(10), s(10)),
    pitBounds: rect(-1, -1, 1, 0.5),
    chargeBounds: rect(s(-13.3), s(-13.2), s(13.3), half - 3.2),
    pitY: lavaY - 0.7,
    lavaY,
    poolBounds: rect(-half, s(-16), half, half),
    catwalks,
    safeSpots: [[0, 16], [-14, 0], [14, 0], [-14, 12], [14, 12], [-14, -12], [14, -12], [0, -14]].map(([a, b]) => pt(s(a), y, s(b))),
    hatches: [[-10, -6], [10, -6], [0, 10]].map(([a, b]) => pt(s(a), y + H - 2, s(b))),
    droneSpots: [[-11, 8, 4], [11, 8, 4], [0, 9, 13], [-8, 9.5, -8], [8, 9.5, -8]].map(([a, h, b]) => pt(s(a), y + h, s(b))),
    powerFrom: powerSource ? new THREE.Vector3(cx, coreY - 2, cz) : powerFrom ? new THREE.Vector3(...powerFrom) : null,
    onPhase: (p) => {
      if (p === 3) {
        floor = 'warn';
        floorT = 0;
        audio.sample('alarm', { gain: 1 });
      }
    },
    onCollapse: () => {
      floor = 'drop';
      floorT = 0;
      audio.sample('floor_collapse', { gain: 1 }) || audio.explode(true);
    },
    onDefeated: () => {
      setSeals(entrySeals, true);
      game.setMusic(areaMusic);
      if (!powerSource) return finish();
      // its guard is down: the core's shield fails
      core.state = 'exposed';
      shield.visible = false;
      W.fx.burst(core.pos, 0xff7a3a, { count: 120, speed: 12, life: 1, size: 0.4, gravity: 3 });
      W.fx.ring(core.pos, null, 0xffa050, { size: 2, end: 9, life: 0.6, k: 1.6 });
      audio.shieldBreak();
      setTimeout(() => game.hud.message('The <b>Geothermal Core</b>\'s shield is down — shoot it with <b>RED</b> to shut the Foundry\'s power off!', 7), 1600);
    },
  });

  // ---------------------------------------------------------------- the fight
  const startFight = () => {
    if (fighting || titan.state !== 'dormant' || finished) return;
    fighting = true;
    setSeals(entrySeals, false);
    titan.start();
    game.setMusic(music);
    onStart?.();
    if (titan.tries === 1) {
      game.hud.zoneTitle('THE FORGE', 'FORGE TITAN', '#ff5a22');
      setTimeout(() => game.hud.message('Jump pads fling you onto the <b>catwalks</b> — out of the shockwaves\' reach. You can even land on its back!', 6), 4500);
    }
  };
  const tr = trigger ? [trigger.min, trigger.max] : (() => {
    const r = rect(-half, s(9), half, s(16));
    return [[r.minX, y, r.minZ], [r.maxX, y + 8, r.maxZ]];
  })();
  W.trigger(tr[0], tr[1], startFight, { once: false });

  const reset = () => {
    if (!fighting || titan.defeated || finished) return; // once it's beaten it stays beaten
    titan.reset();
    restoreFloor();
    setSeals(entrySeals, true, true);
    fighting = false;
    game.setMusic(areaMusic);
  };
  onRespawn(reset);

  // the world's power is down (an earlier session, or its power source was just shut off)
  const powerDown = () => {
    if (crust >= 1) return;
    if (!titan.defeated && titan.state !== 'dead') titan.vanish();
    if (powerSource) {
      core.state = 'dead';
      shield.visible = false;
    }
    restoreFloor();
    setCrust(1);
    setSeals(entrySeals, true, true);
    setSeals(exitDoors, true, true);
    bridgeK = bridgeWant = 1;
    finished = true;
  };

  // ---------------------------------------------------------------- per-frame: doors, floor, core
  W.add({
    update(dt, player) {
      if (crust < 1 && core.state !== 'overload' && game.isWorldDown?.(worldName)) powerDown();
      for (const d of entrySeals) d.update(dt);
      for (const d of exitDoors) d.update(dt);
      bridgeK += THREE.MathUtils.clamp(bridgeWant - bridgeK, -dt, dt * 0.5);
      bridge.position.y = chanY - 1.6 + (y - 0.3 - (chanY - 1.6)) * bridgeK;
      bridgeSolid.enabled = bridgeK > 0.98;
      if (bridgeWant && bridgeK < 1 && Math.random() < dt * 20) W.fx.ember(_v.set(bx + rnd(-1.5, 1.5), bridge.position.y + 0.3, bz + rnd(-1.5, 1.5)), 0, rnd(1, 3), 0, 0xff8a2a, 0.8, 0.15);
      updateFloor(dt);
      if (powerSource) updateCore(dt, player);
    },
  });

  function updateFloor(dt) {
    floorT += dt;
    if (floor === 'warn' || floor === 'drop') {
      const fl = 0.5 + 0.5 * Math.sin(floorT * 22);
      seamMat.color.setRGB(1, 0.35, 0.08).multiplyScalar(0.6 + fl * 2);
    } else seamMat.color.setRGB(1, 0.35, 0.08).multiplyScalar((0.55 + Math.sin(W.time * 2) * 0.1) * (1 - crust) + 0.04);
    if (floor === 'warn') {
      for (const t of tiles) if (!t.keep) placeTile(t, Math.sin(floorT * 40 + t.x) * 0.03, 0.05 * Math.sin(floorT * 30 + t.z));
    } else if (floor === 'drop') {
      let moving = false;
      for (const t of tiles) {
        if (t.keep) continue;
        if (floorT < t.delay) {
          placeTile(t, Math.sin(floorT * 40 + t.x) * 0.04, 0);
          moving = true;
          continue;
        }
        if (t.y > -3.2) {
          if (t.vy === 0) {
            W.fx.burst(_v.set(t.x, y, t.z), 0xff7a2a, { count: 16, speed: 6, life: 0.7, size: 0.3, gravity: 10 });
            W.fx.burst(_v, 0x5a4a44, { count: 8, speed: 3, life: 1.2, size: 0.8, gravity: -0.5 });
          }
          t.vy += 14 * dt;
          placeTile(t, Math.max(-3.2, t.y - t.vy * dt), Math.min(1, -t.y / 2));
          moving = true;
        } else t.solid.delta.set(0, 0, 0);
      }
      if (!moving) floor = 'down';
    } else if (floor === 'rise') {
      let moving = false;
      for (const t of tiles) {
        if (t.keep || t.y >= 0) {
          t.solid.delta.set(0, 0, 0);
          continue;
        }
        placeTile(t, Math.min(0, t.y + dt * 1.5), Math.max(0, -t.y / 3.2));
        moving = true;
      }
      if (!moving) floor = 'up';
    }
  }

  function updateCore(dt, player) {
    const t = W.time;
    core.flash = Math.max(0, core.flash - dt * 5);
    shieldMat.opacity += (0.2 + Math.sin(t * 3) * 0.04 - shieldMat.opacity) * Math.min(1, dt * 4);
    if (core.state === 'dead') return;
    let spin = 1;
    if (core.state === 'overload') {
      // it shakes itself apart: faster and faster, flaring, spitting fire, then a blast and it goes black
      core.t += dt;
      const k = Math.min(1, core.t / 2.6);
      spin = 1 + k * 5;
      coreGroup.position.set(cx + rnd(-1, 1) * 0.15 * k, coreY + rnd(-1, 1) * 0.15 * k, cz + rnd(-1, 1) * 0.15 * k);
      heart.scale.setScalar(1 + k * 0.18 + Math.sin(t * 40) * 0.04 * k);
      coreLight.intensity = 16 + k * 40;
      player.shake = Math.max(player.shake, 0.2 * k);
      if (Math.random() < dt * 12) {
        _v.copy(core.pos).add(new THREE.Vector3(rnd(-2, 2), rnd(-2, 2), rnd(-2, 2)));
        W.fx.burst(_v, 0xff8a2a, { count: 30, speed: 8, life: 0.6, size: 0.4, gravity: 4 });
        audio.explode();
      }
      if (core.t > 2.6 && !core.blown) {
        core.blown = true;
        W.fx.burst(core.pos, 0xffd0a0, { count: 220, speed: 18, life: 1.5, size: 0.6, gravity: 3 });
        W.fx.burst(core.pos, 0xffffff, { count: 60, speed: 8, life: 0.4, size: 1.2, gravity: 0 });
        W.fx.ring(core.pos, null, 0xffa050, { size: 3, end: 20, life: 0.9, k: 1.8 });
        audio.sample('core_shutdown', { gain: 1, vary: 0 }) || audio.explode(true);
        player.shake = 1;
        game.hud.whiteFlash?.();
        heart.scale.setScalar(1);
        coreGroup.position.copy(core.pos);
      }
      if (core.t > 2.6) {
        // cools from orange to black crust; the lava crusts over; the turbine winds down
        const c = Math.min(1, (core.t - 2.6) / 3.5);
        setCrust(c);
        spin = 1 - c;
        if (c >= 1) {
          core.state = 'dead';
          game.hud.zoneTitle('CRIMSON FOUNDRY', 'POWER CORE OFFLINE', '#ff5a22');
          game.shutDownWorld?.(worldName);
          finish();
        }
      }
    }
    for (let i = 0; i < rings.length; i++) rings[i].rotation.z += dt * spin * (i ? -0.9 : 0.6);
    if (core.state !== 'overload') heart.scale.setScalar(1 + Math.sin(t * 2.2) * 0.03 + core.flash * 0.08);
    for (const c of conduitSeams) c.m.color.setRGB(1, 0.4, 0.1).multiplyScalar((0.4 + 1.1 * Math.max(0, Math.sin(c.k * 25 - t * 4))) * (1 - crustMat.opacity) + 0.04);
    if (core.state === 'exposed') coreLight.intensity = 18 + Math.sin(t * 8) * 5 + core.flash * 20;
  }

  if (game.isWorldDown?.(worldName)) powerDown();

  const ends = {
    entryPos: pt(0, y, shell ? half + T + entryLen : half),
    exitPos: pt(0, y, shell ? -half - T - exitLen : -half),
  };
  return { titan, core, reset, powerDown, ...ends, entry: ends.entryPos, exit: ends.exitPos, bounds: all };
}

export const placeForgeTitan = buildForgeArena;
