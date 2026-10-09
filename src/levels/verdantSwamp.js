// VERDANT · EMERALD HOLLOW, first half: THE DROWNED WOOD (the swamp from the Verdant gate), THE SWAMP RIVER, the
// TRAPDOOR ISLAND, and below it the granite ruin (verdantRuin.js) and the boulder escape out of the monkey's mouth
// onto the rope bridge (verdantEscape.js). The god tree beyond the bridge is verdantGodTree.js.
//
// A heavy world of decay and humidity, claustrophobic after Solar's open sun: you hop hummocks, logs, roots,
// stepping stones and the harvest machine's own pipelines across black swamp water (shallows slow you, deep mire
// drags you under: mash jump to haul yourself out), under a low canopy of vine-hung giants, fog swallowing
// everything past twenty metres, glowing fungi the only lamps. The forest is a farm: green pipelines, algae
// reactors, sap taps and pump stations everywhere (verdantKit.js). You have red + yellow; the creatures come one
// at a time (a lone slime, a fly cloud, a spider dropping out of the trees, a snapjaw at the path's edge, slimes
// bursting from the water, a borer out of a log), then all at once in the Drowned Grove; then the river ends at a
// little island with an old altar, and the floor gives way.
//
// Route (y up, -z north): gate corridor (-10, 4, -148.5..-158.5) → THE MOSS LANDING (log 07 on the walking line)
// → shallows → hummocks and a log east → the first slime → a pipeline north-east under the aqueduct → the pump
// island → a fallen log west → stepping stones → the bank (the spider) → [z < -232: wide] the reactor catwalk west
// → the river bank (the snapjaw) → a giant log across the river → the west bank (slimes from the water; log 08)
// → hummocks north (the borer) → a pipeline back east over the river → THE DROWNED GROVE (ambush) → stones to the
// TRAPDOOR ISLAND (-50, 3, -297) → the cistern under it (y -8) → the ruin.
import * as THREE from 'three';
import { RED, YELLOW, GREEN } from '../colors.js';
import { audio } from '../audio.js';
import { Checkpoint } from '../entities/misc.js';
import { boxGeo } from '../materials.js';
import { makeVerdantKit } from './verdantKit.js';
import { makeFlora } from './verdantFlora.js';
import { buildVerdantRuin } from './verdantRuin.js';
import { SwampAmbush } from './verdantAmbush.js';
import { creatureKit } from '../entities/verdantCreatures.js';

const PI = Math.PI;
const NORTH = 0, SOUTH = PI, EAST = -PI / 2, WEST = PI / 2;
export const WATER_Y = 1.6; // the swamp's surface
export const MIRE_TOP = 1.2; // what you stand on (sinking) in deep water
export const WADE_TOP = 1.4; // the floor of the shallows (knee deep)
export const TRAP_ID = 'verdant:trapdoor'; // in game.clearedEncounters once you've fallen into the ruin
const ISLAND = [-50, 3, -297];

// ======================================================================================================
export function buildVerdantSwamp(B, ctx = {}) {
  const { W, game, level, hint, area, devStart, onRespawn } = B;
  const K = makeVerdantKit(B, { seed: 11 });
  const F = makeFlora(K);
  const C = creatureKit(B);
  const { mats, R, rand } = K;
  const WM = { deep: mats.swampDeep, shallow: mats.swampShallow };
  const RY = [RED, YELLOW];
  const tag = (hex, t) => `<b style="color:${hex}">${t}</b>`;
  const R_ = (t) => tag('#ff3344', t), Y_ = (t) => tag('#ffd23a', t), G_ = (t) => tag('#3dff7a', t);
  const say = (min, max, html, t = 6) => hint(min, max, html, t);
  const cp = (pos, yaw, size = [4, 3, 4]) => new Checkpoint(W, game, { pos, yaw, size });
  const mood = (min, max, music, atmosphere = 'verdant', ambient = 'amb_swamp') =>
    W.trigger(min, max, () => {
      game.setMusic(audio.musicOr(music, 'music_green'));
      game.setAmbient(audio.sfxOr(ambient, 'amb_jungle'));
      game.setAtmosphere(atmosphere);
    }, { once: false });
  audio.manifest?.then(() => audio.prefetch(['amb_swamp', 'trapdoor_fall', 'trapdoor_drop', 'temple_rumble', 'crumble_crack', 'crumble_break', 'leviathan_splash', 'vine_whip', 'slime_splat', 'root_rumble', 'swamp_burst', 'leaf_rustle', 'mire_suck', 'sand_sink']));

  const mud = new THREE.MeshStandardMaterial({ color: 0x2a2316, roughness: 1, flatShading: true });
  // the swamp's stone: the kit's granite, wet and mossy-dark out here
  const wetStone = mats.granite.clone(), wetGlyph = mats.glyph.clone();
  wetStone.color.set(0x7c8676);
  wetGlyph.color.set(0x76806e);
  const mudWet = new THREE.MeshStandardMaterial({ color: 0x1c1a10, roughness: 0.35, metalness: 0.1, flatShading: true });
  const trees = [], brush = [], A = [], Bm = []; // (A / Bm: the meshes of each half, shown only near it)
  const paths = []; // polylines the scatter keeps clear: [[x, z], ...] with a clearance
  const holes = []; // rects nothing tall grows in: [x1, z1, x2, z2]
  const solid = (x1, y1, z1, x2, y2, z2, kind = 'grass', extra = {}) =>
    Object.assign(W.addSolid(new THREE.Vector3(Math.min(x1, x2), Math.min(y1, y2), Math.min(z1, z2)), new THREE.Vector3(Math.max(x1, x2), Math.max(y1, y2), Math.max(z1, z2)), { static: true, kind }), extra);

  // ---------------------------------------------------------------- terrain pieces
  // a mossy hummock: a mound of mud and roots, flat-topped at `top` (collision: the square inside it)
  function mound(x, z, r, top, { ferns = 3, roots = 3, shrooms = 1 } = {}) {
    const h = top + 1;
    const g = new THREE.CylinderGeometry(r * 0.95, r * 1.3, h, 11, 2);
    const p = g.attributes.position, ph = R(0, 6);
    for (let i = 0; i < p.count; i++) {
      const a = Math.atan2(p.getZ(i), p.getX(i)), y = p.getY(i);
      const k = 1 + 0.12 * Math.sin(a * 3 + ph) + 0.07 * Math.sin(a * 5 + ph * 2);
      p.setXYZ(i, p.getX(i) * k, y + (y > h / 2 - 0.01 ? R(-0.04, 0.03) : R(-0.15, 0.15)), p.getZ(i) * k);
    }
    K.put(mud, g, x, top - h / 2, z);
    const cap = new THREE.CircleGeometry(r * 0.97, 11).rotateX(-PI / 2);
    const cp2 = cap.attributes.position;
    for (let i = 0; i < cp2.count; i++) {
      const a = Math.atan2(cp2.getZ(i), cp2.getX(i));
      const k = 1 + 0.12 * Math.sin(a * 3 + ph) + 0.07 * Math.sin(a * 5 + ph * 2);
      cp2.setXYZ(i, cp2.getX(i) * k, cp2.getY(i), cp2.getZ(i) * k);
    }
    K.put(mats.moss, cap, x, top + 0.02, z);
    const hs = r * 0.8;
    solid(x - hs, -1.5, z - hs, x + hs, top, z + hs, 'grass');
    for (let i = 0; i < roots; i++) {
      const a = R(0, PI * 2);
      K.limb([[x + Math.cos(a) * r * 0.5, top + 0.05, z + Math.sin(a) * r * 0.5], [x + Math.cos(a) * r * 1.05, top - 0.2, z + Math.sin(a) * r * 1.05], [x + Math.cos(a) * r * 1.5, WATER_Y - 0.5, z + Math.sin(a) * r * 1.5]], R(0.1, 0.18), 0.05, mats.bark, 5);
    }
    for (let i = 0; i < ferns; i++) {
      const a = R(0, PI * 2), d = R(r * 0.5, r * 0.85);
      brush.push({ kind: rand() < 0.7 ? 'fern' : 'reed', x: x + Math.cos(a) * d, y: top, z: z + Math.sin(a) * d, s: R(0.5, 0.9) });
    }
    for (let i = 0; i < shrooms; i++) {
      const a = R(0, PI * 2), d = R(r * 0.4, r * 0.8);
      brush.push({ kind: 'shroom', x: x + Math.cos(a) * d, y: top, z: z + Math.sin(a) * d, s: R(0.5, 0.8) });
    }
  }
  // a bank: an irregular slab of solid ground (lumpy edges, a moss carpet, brush)
  function bank(x1, z1, x2, z2, top, { edge = true, brushN = 0.12 } = {}) {
    K.put(mud, boxGeo(x2 - x1, top + 1.5, z2 - z1, 0.3), (x1 + x2) / 2, (top - 1.5) / 2, (z1 + z2) / 2);
    K.put(mats.moss, boxGeo(x2 - x1 - 0.2, 0.06, z2 - z1 - 0.2, 0.3), (x1 + x2) / 2, top + 0.02, (z1 + z2) / 2);
    solid(x1, -1.5, z1, x2, top, z2, 'grass');
    if (edge) {
      const per = (a, b, f) => {
        for (let u = a; u < b; u += R(1.6, 2.6)) f(u);
      };
      const lump = (x, z) => {
        const r = R(0.7, 1.3);
        K.put(mud, new THREE.IcosahedronGeometry(r, 1).scale(1, 0.45, 1), x, top - 0.25, z);
        K.put(mats.moss, new THREE.IcosahedronGeometry(r * 0.85, 1).scale(1, 0.3, 1), x, top - 0.08, z);
      };
      per(x1, x2, (u) => (lump(u, z1), lump(u, z2)));
      per(z1, z2, (u) => (lump(x1, u), lump(x2, u)));
    }
    const n = Math.round((x2 - x1) * (z2 - z1) * brushN);
    for (let i = 0; i < n; i++) brush.push({ kind: rand() < 0.5 ? 'fern' : rand() < 0.6 ? 'bush' : 'shroom', x: R(x1 + 0.6, x2 - 0.6), y: top, z: R(z1 + 0.6, z2 - 0.6), s: R(0.5, 1) });
  }
  // a fallen mossy log from a to b ([x, z]) whose top is at `top`; walkable along its length
  function log(a, b, top, r = 0.65, { fungi = 4 } = {}) {
    const cy = top - r * 0.85;
    K.rod(mats.bark, [a[0], cy, a[1]], [b[0], cy, b[1]], r, r * 0.85, 9);
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let u = R(0.3, 1); u < L - 0.3; u += R(0.8, 1.8)) {
      const k = u / L, x = a[0] + (b[0] - a[0]) * k, z = a[1] + (b[1] - a[1]) * k;
      K.put(mats.moss, new THREE.IcosahedronGeometry(r * R(0.55, 0.85), 1).scale(1.2, 0.3, 1.2), x, top - 0.04, z);
      if (rand() < 0.35) K.hangMoss(x + R(-0.3, 0.3), cy, z + R(-0.3, 0.3), R(0.4, 1.2), 0.3);
    }
    for (let i = 0; i < fungi; i++) {
      const k = R(0.1, 0.9), x = a[0] + (b[0] - a[0]) * k, z = a[1] + (b[1] - a[1]) * k, s = rand() < 0.5 ? 1 : -1;
      const nx = -(b[1] - a[1]) / L * s, nz = (b[0] - a[0]) / L * s;
      F.shelf(x + nx * r * 0.95, cy + R(-0.2, 0.3), z + nz * r * 0.95, Math.atan2(nz, nx), R(0.18, 0.3), rand() < 0.3);
    }
    // a broken branch stub or two
    for (let i = 0; i < 2; i++) {
      const k = R(0.2, 0.8), x = a[0] + (b[0] - a[0]) * k, z = a[1] + (b[1] - a[1]) * k;
      K.rod(mats.bark, [x, cy, z], [x + R(-0.6, 0.6), cy + R(0.8, 1.4), z + R(-0.6, 0.6)], 0.14, 0.06, 5);
    }
    const n = Math.ceil(L / 0.5), hw = r * 0.72;
    for (let i = 0; i <= n; i++) {
      const k = i / n, x = a[0] + (b[0] - a[0]) * k, z = a[1] + (b[1] - a[1]) * k;
      solid(x - hw, cy - r, z - hw, x + hw, top, z + hw, 'grass');
    }
  }
  // a granite stepping stone: an old carved block, tipped and half sunk, moss on top
  function stone(x, z, w, top, { d = w, glyph = false } = {}) {
    const tilt = R(-0.04, 0.04);
    K.put(glyph ? wetGlyph : wetStone, boxGeo(w, top + 1.2, d, 0.5).rotateZ(tilt).rotateY(R(-0.1, 0.1)), x, (top - 1.2) / 2, z);
    K.put(mats.moss, new THREE.IcosahedronGeometry(w * 0.4, 1).scale(1, 0.18, d / w), x + R(-0.2, 0.2), top + 0.01, z + R(-0.2, 0.2));
    solid(x - w / 2, -1.5, z - d / 2, x + w / 2, top, z + d / 2, 'stone');
  }
  // the shallows: a knee-deep floor you slog through (slowed), weedy water over it
  function shallows(x1, z1, x2, z2) {
    solid(x1, -1.5, z1, x2, WADE_TOP, z2, 'grass');
    K.put(WM.shallow, new THREE.PlaneGeometry(x2 - x1, z2 - z1, Math.max(1, Math.round((x2 - x1) / 2)), Math.max(1, Math.round((z2 - z1) / 2))).rotateX(-PI / 2), (x1 + x2) / 2, WATER_Y + 0.01, (z1 + z2) / 2);
    (W.wades ??= []).push({ min: new THREE.Vector3(x1, WADE_TOP - 0.2, z1), max: new THREE.Vector3(x2, WADE_TOP + 0.4, z2) });
    for (let i = 0; i < (x2 - x1) * (z2 - z1) * 0.08; i++) brush.push({ kind: rand() < 0.5 ? 'reed' : 'lily', x: R(x1 + 0.3, x2 - 0.3), y: rand() < 0.5 ? WATER_Y - 0.2 : WATER_Y + 0.02, z: R(z1 + 0.3, z2 - 0.3), s: R(0.5, 1) });
    holes.push([x1, z1, x2, z2]);
  }
  // deep water over a rect: the black surface and the mire under it (it holds you, and pulls you down)
  function deep(x1, z1, x2, z2, list) {
    const g = new THREE.PlaneGeometry(x2 - x1, z2 - z1, Math.max(1, Math.round((x2 - x1) / 3)), Math.max(1, Math.round((z2 - z1) / 3))).rotateX(-PI / 2).translate((x1 + x2) / 2, WATER_Y, (z1 + z2) / 2);
    const mesh = new THREE.Mesh(g, WM.deep);
    mesh.matrixAutoUpdate = false;
    W.scene.add(mesh);
    list.push(mesh);
    // (the mire round any hole: the trapdoor's shaft goes straight through it)
    const cut = holesIn.find(([a, b, c, d]) => a > x1 && c < x2 && b > z1 && d < z2);
    const mire = (a, b, c, d) => c - a > 0.01 && d - b > 0.01 && solid(a, -1.5, b, c, MIRE_TOP, d, 'mud', { hazard: 'acid', mire: true });
    if (!cut) return mire(x1, z1, x2, z2);
    const [hx1, hz1, hx2, hz2] = cut;
    mire(x1, z1, x2, hz1);
    mire(x1, hz2, x2, z2);
    mire(x1, hz1, hx1, hz2);
    mire(hx2, hz1, x2, hz2);
  }
  const holesIn = [[ISLAND[0] - 2.5, ISLAND[2] - 2.5, ISLAND[0] + 2.5, ISLAND[2] + 2.5]];
  // a tree, kept off the path (scatter adds the rest)
  const tree = (x, z, kind = 'giant', s = 1, y = null) => trees.push({ x, z, kind, s, y: y ?? (kind === 'mangrove' ? MIRE_TOP : MIRE_TOP - 0.2) });
  // keep the scatter clear of the route
  const route = (pts, clear = 4) => paths.push({ pts, clear });
  const clearOf = (x, z, pad) => {
    for (const { pts, clear } of paths)
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
        const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
        const k = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
        if (Math.hypot(x - ax - dx * k, z - az - dz * k) < clear + pad) return false;
      }
    for (const [x1, z1, x2, z2] of holes) if (x > x1 - pad && x < x2 + pad && z > z1 - pad && z < z2 + pad) return false;
    return true;
  };

  // ================================================================ THE MOSS LANDING (z -158.5 → -170)
  // The first space you step into: a broken granite landing at the forest's edge, open to a drizzle and a shaft of
  // gold through a gap in the canopy, the recorder hovering on the walking line (log 07, the ghost's stage on the
  // open stone ahead of it), the swamp opening out below in the fog.
  {
    const top = 4;
    K.put(wetStone, boxGeo(14, 5.5, 12, 0.5), -10, top - 2.75, -164.5);
    solid(-17, -1.5, -170.5, -3, top, -158.5, 'stone');
    K.put(wetGlyph, boxGeo(14.2, 0.5, 0.4, 0.5), -10, top - 0.3, -170.6);
    for (let i = 0; i < 26; i++) {
      // cracked paving: tipped slabs, moss in the joints
      const x = R(-16.4, -3.6), z = R(-170, -159);
      if (Math.abs(x + 10) < 2.6 && z > -168) continue; // (the walking line stays clear)
      K.put(rand() < 0.6 ? mats.moss : wetStone, boxGeo(R(0.6, 1.5), 0.08, R(0.6, 1.5), 0.5).rotateX(R(-0.08, 0.08)).rotateZ(R(-0.08, 0.08)), x, top + 0.04, z);
    }
    // broken pillars and a fallen lintel framing the view north
    for (const [x, z, h] of [[-16, -169.5, 4.8], [-4, -169.5, 3.1], [-16, -159.5, 2.2]]) {
      K.put(wetStone, boxGeo(1.2, h, 1.2, 0.5), x, top + h / 2, z);
      K.put(wetGlyph, boxGeo(1.25, 0.6, 1.25, 0.5), x, top + h * 0.55, z);
      K.mossCap(x, top + h, z, 0.8, 0.35);
      solid(x - 0.6, top, z - 0.6, x + 0.6, top + h, z + 0.6, 'stone');
      for (let k = 0; k < 3; k++) K.hangMoss(x + R(-0.6, 0.6), top + h, z + R(-0.6, 0.6), R(0.8, 2));
    }
    K.put(wetStone, boxGeo(5.5, 0.9, 1.1, 0.5).rotateZ(0.25), -6.5, top + 0.7, -167.5);
    solid(-9.2, top, -168.05, -3.8, top + 1.0, -166.95, 'stone');
    // steps down off the north edge into the shallows
    for (let i = 0; i < 4; i++) {
      const y = top - 0.6 * (i + 1);
      K.put(wetStone, boxGeo(6, 0.6, 1.1, 0.5), -10, y + 0.3 - 0.6 + 0.3, -171.1 - i * 1.1);
      solid(-13, -1.5, -171.65 - i * 1.1, -7, y + 0.3, -170.55 - i * 1.1, 'stone');
    }
    // the drizzle and the gold light, mist on the water below
    F.drips([[-10, 13, -164, 4, 6, 120], [-7, 12, -160, 4, 3, 40]], { color: 0xd8f4ff, size: 0.06, near: 30 });
    F.shaft(-10.5, 14, -163.5, 12, 3.2, 0.08);
    F.shaft(-8.5, 13, -165.5, 10, 1.6, 0.05);
    F.mist(-10, 4.25, -164, 12, 10);
    // the landing's one lamp: warm, low, through the rain
    B.light(-10, 8, -164, 0xffe2a0, 18, 18);
    // overgrowth round the edges (non-solid brush walls), ferns crowding the paving
    for (let i = 0; i < 22; i++) {
      const side = i % 2 ? -16.5 + R(0, 1.5) : -3.5 - R(0, 1.5);
      brush.push({ kind: rand() < 0.6 ? 'fern' : 'bush', x: side, y: top, z: R(-170, -159), s: R(0.6, 1.1) });
    }
    for (let i = 0; i < 6; i++) brush.push({ kind: 'shroom', x: R(-16, -4), y: top, z: R(-170, -166), s: R(0.5, 0.9) });
    mood([-11.5, 4, -160], [-8.5, 8, -158.5], 'music_swamp');
    say([-13, 4, -163], [-7, 7, -160], 'Emerald Hollow. <b>Breathe.</b> The forest is listening.', 4);
  }
  // the strip between the Hub and the landing (kept under y 14: the Hub's windows look out over it)
  {
    K.put(mud, boxGeo(61, 4, 10, 0.3), 0, 1.5, -153.5);
    solid(-30.5, -1.5, -158.5, 30.5, 3.5, -148.5, 'grass');
    K.put(mats.moss, boxGeo(60, 0.05, 9.8, 0.3), 0, 3.52, -153.5);
    for (let i = 0; i < 40; i++) {
      const x = R(-30, 30);
      if (Math.abs(x + 10) < 2.5 || (x > 7.5 && x < 12.5)) continue;
      brush.push({ kind: rand() < 0.4 ? 'fern' : rand() < 0.7 ? 'bush' : 'shroom', x, y: 3.5, z: R(-158, -149), s: R(0.6, 1.2) });
    }
    for (const [x, z, k, s] of [[-24, -154, 'mangrove', 0.7], [-19, -156.5, 'snag', 0.6], [20, -155, 'mangrove', 0.7], [26, -152, 'snag', 0.7], [-28, -151, 'mangrove', 0.65], [2, -156, 'snag', 0.55], [15, -157, 'mangrove', 0.6]]) trees.push({ x, z, kind: k, s, y: 3.5 });
  }

  // ================================================================ THE DROWNED WOOD (narrow: x ±30, z -170 → -232)
  route([[-10, -158], [-10, -173], [-9, -183], [-3, -185], [4, -186], [5, -189], [14, -199], [17, -203], [15, -209], [5, -209], [2, -212], [-2, -215], [-6, -218], [-12, -224], [-16, -232], [-18, -240]], 3.2);
  route([[-2, -194], [4, -186]], 2.6); // (the first slime's hummock in view)
  deep(-30.5, -232, 30.5, -158.5, A);
  shallows(-15, -181, -5, -172.2); // knee-deep at the foot of the steps: a slow, safe first wade
  mound(-9, -183.5, 2.4, 2.2);
  log([-6.8, -185], [1.4, -185], 2.35);
  mound(4, -186.5, 3, 2.5, { ferns: 4, shrooms: 2 });
  // the first slime: alone on its hummock across the water, oozing about (it'll come; take it at range)
  mound(-2, -194, 2.8, 2.4, { ferns: 2 });
  B.slime([-2, 2.4, -194], { color: RED, core: YELLOW, wander: 1.2, range: 13, leapRange: 8 });
  say([1.5, 2.5, -189], [7, 6, -184], `A <b>slime mold</b> on the next hummock. Burst its ${R_('red')} goo with ${R_('red')}, then finish the ${Y_('yellow')} core before it grows back.`, 7);
  // the pipeline north-east, under the aqueduct (walk its back)
  K.pipe([[4.5, 2.95, -188.5], [9, 2.95, -193.5], [14.5, 2.95, -199.5]], { r: 0.55, walk: true, leak: [0.62], ground: WATER_Y, supports: 4 });
  K.pipe([[14.5, 2.95, -199.5], [16, 2.95, -201.5], [22, 1.2, -203.5], [30.6, 1.0, -204]], { r: 0.55, ground: WATER_Y, supports: 5 });
  K.pipe([[4.5, 2.95, -188.5], [0, 1.1, -186.6], [-6, 0.9, -186.3], [-30.6, 0.6, -186]], { r: 0.55, moss: true });
  say([2.5, 2.5, -190], [6.5, 6, -186], 'The harvest pipe runs north-east. <b>Walk its back</b> over the water.', 4);
  // the pump island: a pump house drinking the swamp, a giant with sap taps drilled into it
  bank(14, -207, 21.5, -200.5, 2.4);
  K.pumpStation([19.5, 2.4, -203.5], { yaw: EAST, intake: 1.5 });
  tree(24, -198, 'giant', 0.8, 1);
  for (const [y, a] of [[3.2, 2.6], [4.4, 3.4], [2.8, 4.2]]) K.sapTap([24 + Math.cos(a) * 1.0, y, -198 + Math.sin(a) * 1.0], { yaw: -a - PI / 2, hose: [[24 + Math.cos(a) * 2, 2.4, -198 + Math.sin(a) * 2], [19.5, 2.6, -201.8]] });
  cp([17.5, 2.4, -204], WEST, [6, 3, 5]);
  // a fallen log west, stepping stones north-west (old carved blocks), the bank
  log([14.4, -209], [3.6, -209], 2.5);
  stone(2, -212, 2.2, 2.3, { glyph: true });
  stone(-2, -215.2, 2, 2.5);
  stone(-6, -218.6, 2.2, 2.7, { glyph: true });
  // the fly cloud (first of its kind): it rises out of the reeds west of the pump island as you land on it
  // (PLACEHOLDER until verdantCreatures.js lands: a 'rotfly' swarm → for now a robot swarm in red and yellow)
  let fliesDone = false;
  W.trigger([14, 2, -207], [21.5, 6, -200.5], () => {
    if (fliesDone) return;
    fliesDone = true;
    setTimeout(() => {
      C.rotflies([8.5, 2.2, -205.5], { count: 3, colors: RY, respawn: 0, hive: true, aggro: true });
      game.hud.message(`<b>Rotflies</b> rise out of the reeds. They dart in and out of the fog: track them, ${R_('red')} and ${Y_('yellow')}.`, 5);
    }, 900);
  });
  // the bank under the giants: the spider waits under a bough above the path and drops when you pass
  bank(-24, -232, -8, -221, 2.7, { brushN: 0.08 });
  bough(-19, -226.5, -11, -225.3, 9.4);
  const spider = { e: null };
  W.trigger([-17, 2.5, -228], [-9, 7, -221], () => {
    if (spider.e) return;
    spider.e = B.spiderBot([-15, 3, -226], { color: YELLOW, shields: [RED], ceiling: true, leash: 9, range: 22 });
    W.fx.burst(new THREE.Vector3(-15, 9, -226), 0x3a6a2a, { count: 40, speed: 4, life: 1.6, size: 0.2, gravity: 2, drag: 2 });
    audio.sample(audio.sfxOr('leaf_rustle', 'vine_whip'), { gain: 0.9, vary: 0.1 });
    setTimeout(() => game.hud.message(`Something in the boughs — a <b>spider bot</b>. Strip its ${R_('red')} shell, then ${Y_('yellow')}. It rolls when you aim: lead it.`, 6), 500);
  });
  cp([-14, 2.7, -229.5], NORTH, [6, 3, 4]);
  // the dressing: giants crowding the route, mangroves on stilts, snags, reeds and ferns as walls
  tree(-17, -177, 'giant', 0.85);
  tree(-3, -177.5, 'mangrove', 1);
  tree(6.5, -180, 'snag', 0.6);
  tree(-14, -190, 'giant', 0.75);
  tree(11.5, -184, 'snag', 0.55);
  tree(-6, -201, 'giant', 0.8);
  tree(18, -192, 'mangrove', 0.9);
  tree(25, -212, 'giant', 0.8);
  tree(9, -216, 'snag', 0.6);
  tree(-26, -205, 'giant', 0.9);
  tree(-2, -226, 'giant', 0.75);
  tree(-26, -226, 'giant', 0.8, 2.7);
  // reactor tanks among the trees (east of the route, glowing through the fog)
  K.reactorTank([24, 0.6, -186], 9, { r: 1.5 });
  K.reactorTank([27, 0.6, -191], 7.5, { r: 1.2 });
  K.reactorTank([-24, 0.6, -214], 8.5, { r: 1.4 });
  K.harvestTower([-22, 0.8, -196], 9, { r: 2 });
  K.catwalk([[-24, -219], [-24, -209], [-20, -199]], 5.4, { ground: WATER_Y, solid: true });
  hint([-24.8, 5.2, -219.8], [-19, 7, -198], 'An old catwalk. It hums faintly, though nothing has walked it in a long time.', 4);
  K.pipe([[-30.6, 0.8, -213], [-25.4, 1, -213.5], [-24, 1.2, -214]], { r: 0.45 });
  K.pipe([[-24, 9.2, -214], [-24, 11, -219], [-19, 11.5, -225], [-12, 10.5, -232], [-4, 9, -246]], { r: 0.35, moss: true, flanges: true });
  F.fireflies([[-10, 3, -176, 4, 16], [4, 3.6, -186, 3, 14], [17, 3.6, -204, 4, 16], [-2, 3.5, -213, 4, 14], [-16, 3.8, -227, 5, 18], [-24, 6.5, -205, 4, 12]]);

  // ================================================================ THE SWAMP RIVER (wide: z -232 → -300, x -100 → 0)
  route([[-18, -240], [-20, -241], [-40, -241], [-44, -246], [-48, -251], [-52, -262], [-60, -264], [-63, -274], [-59, -279], [-57, -282], [-43, -282], [-38, -286], [-40, -293], [-44, -296], [-50, -297]], 3.4);
  deep(-100, -300, 30.5, -232, Bm);
  bank(-24, -241.8, -11, -232, 2.7, { brushN: 0.06 });
  // the reactor catwalk west: the farm's spine, tanks either side of it in the water
  K.catwalk([[-23, -241], [-41, -241]], 3.3, { ground: WATER_Y, w: 2 });
  for (const [x, z, h, r] of [[-28, -245.5, 10, 1.5], [-34, -245.8, 12, 1.6], [-30, -236.2, 8, 1.3], [-37.5, -236, 9.5, 1.4]]) K.reactorTank([x, 0.6, z], h, { r });
  K.pipe([[-28, 9.6, -245.5], [-31, 10.6, -245.6], [-34, 11.6, -245.8]], { r: 0.3, moss: false });
  K.pipe([[-24, 2.2, -242.8], [-41, 2.2, -242.8]], { r: 0.35, moss: true, flanges: true });
  K.pipe([[-24, 2.2, -239.2], [-30, 2.2, -239.2], [-37.5, 1.6, -237.5]], { r: 0.3 });
  say([-24, 2.7, -242], [-20, 6, -238], 'Algae tanks, catwalks, pipes. <b>Someone farmed this swamp</b> — and something still does.', 5);
  // the river bank: the snapjaw (first of its kind) rooted at the path's edge
  bank(-48, -252, -38.5, -238, 2.7, { brushN: 0.08 });
  K.harvestTower([-45, 2.7, -240.5], 10, { r: 1.8 });
  C.snapjaw([-46.4, 2.7, -250.4], { color: RED, yaw: -2.5, reach: 5.5 });
  let snapDone = false;
  W.trigger([-41, 2.5, -246], [-38, 6, -238], () => {
    if (snapDone) return;
    snapDone = true;
    game.hud.message(`A <b>snapjaw</b> rooted at the water's edge. It can't follow you, but it snaps at anything in reach and spits: kill it from range with ${R_('red')}. (Hit its open mouth to stun it.)`, 6);
  });
  // ... and its cousins under the water by the log, waiting (they rear out as you cross)
  C.snapjaw([-51.5, WATER_Y, -255.2], { color: YELLOW, emerge: true, yaw: -1.2, reach: 5 });
  cp([-40, 2.7, -244], WEST, [4, 3, 5]);
  // a giant fallen log across the river, a pipeline drowned beside it
  log([-46.5, -251.5], [-53.5, -263], 2.7, 0.8);
  K.pipe([[-44, 0.9, -255], [-50, 1.0, -258], [-58, 0.9, -258.5]], { r: 0.5, moss: true });
  // the west bank: slimes burst out of the water (they've been waiting under it); log 08 among the roots
  bank(-67, -271, -54.5, -260.5, 2.6, { brushN: 0.07 });
  tree(-64, -262.5, 'giant', 0.8, 2.6);
  remains(-61.5, 2.6, -268.6, 0.6);
  remains(-59.2, 2.6, -269.8, 2.1);
  const waterAmbush = new SwampAmbush(W, game, {
    trigger: [[-58, 2.4, -266], [-54.5, 6, -260.5]],
    title: null, sub: '', music: null, startDelay: 0.3, gap: 0.6, clearTitle: null, zone: 'green',
    waves: [[
      { type: 'slime', from: 'water', pos: [-52, 2.6, -268], to: [-57, 2.6, -266], color: YELLOW, core: RED, delay: 0 },
      { type: 'slime', from: 'water', pos: [-66, 2.6, -274], to: [-62, 2.6, -269], color: RED, core: YELLOW, delay: 0.9, size: 0.85 },
    ]],
    onStart: () => setTimeout(() => game.hud.message('Out of the <b>water</b>! Slimes bursting from the swamp.', 3), 200),
  });
  onRespawn(() => waterAmbush.reset());
  cp([-60, 2.6, -263.5], NORTH, [5, 3, 4]);
  // hummocks north up the west bank; the borer bursts out of a rotten log beside them (first of its kind)
  mound(-63, -275, 2.4, 2.4);
  mound(-59.5, -279.5, 2.2, 2.5);
  log([-70, -273], [-68, -283], 2.1, 0.9, { fungi: 6 });
  C.borer([-68.15, 1.5, -278], [1, 0, 0], { color: YELLOW, range: 12 });
  let borerDone = false;
  W.trigger([-65, 2.2, -277], [-57, 6, -272], () => {
    if (borerDone) return;
    borerDone = true;
    game.hud.message(`Something in the rotten log: a <b>borer</b>. It bursts out to bite and hangs there a moment: hit its head with ${Y_('yellow')}.`, 5);
  });
  // the pipeline back east over the river (walk it)
  K.pipe([[-58, 3.0, -282], [-50, 3.0, -282], [-42.5, 3.0, -282]], { r: 0.6, walk: true, leak: [0.3, 0.7], ground: WATER_Y, supports: 4 });
  K.pipe([[-58, 3.0, -282], [-64, 2.0, -283], [-80, 1.5, -284], [-100.5, 1.2, -284]], { r: 0.6, ground: WATER_Y, supports: 6 });
  // THE DROWNED GROVE: the far bank under the biggest trees, a pump house, and everything at once
  bank(-43, -291, -31, -277, 2.6, { brushN: 0.06 });
  K.pumpStation([-35, 2.6, -280], { yaw: NORTH, intake: 1.5 });
  bough(-41, -285.6, -33, -284.4, 9.6);
  bough(-39.6, -290, -38.4, -279, 10.4);
  tree(-30, -286, 'giant', 0.95, 1);
  tree(-46.5, -276.5, 'giant', 0.85, 1);
  const grove = new SwampAmbush(W, game, {
    trigger: [[-42, 2.4, -288], [-34, 6, -280]],
    title: 'THE DROWNED GROVE', sub: 'FROM THE TREES AND THE WATER', color: '#9adf6a', music: 'music_combat', zone: 'green', resume: true,
    startDelay: 0.8, gap: 1.2,
    checkpoint: { pos: [-37, 2.6, -289.5], yaw: WEST },
    waves: [
      { title: 'FROM THE WATER', enemies: [
        { type: 'slime', from: 'water', pos: [-45, 2.6, -283], to: [-41.5, 2.6, -283], color: RED, core: YELLOW, delay: 0 },
        { type: 'slime', from: 'water', pos: [-29, 2.6, -282], to: [-32.5, 2.6, -283], color: YELLOW, core: RED, delay: 0.5 },
        { type: 'slime', from: 'water', pos: [-37, 2.6, -275], to: [-37, 2.6, -278.5], color: RED, core: YELLOW, size: 0.85, delay: 1.2 },
      ] },
      { title: 'FROM THE TREES', enemies: [
        { type: 'spider', from: 'tree', pos: [-37, 3, -285], color: RED, shields: [YELLOW], ceiling: true, leash: 8, range: 26, delay: 0 },
        { type: 'slime', from: 'tree', pos: [-35, 2.6, -288], drop: 8, color: YELLOW, core: RED, delay: 0.6 },
        { type: 'slime', from: 'tree', pos: [-40, 2.6, -280], drop: 8, color: RED, core: YELLOW, size: 0.85, delay: 1.1 },
        { type: 'spider', from: 'tree', pos: [-39, 3, -282], color: YELLOW, shields: [RED], ceiling: true, leash: 8, range: 26, delay: 1.6 },
      ] },
      { title: 'ALL OF THEM', enemies: [
        ...creatureSpecs('rotfly', [-36, 5.5, -284], { count: 4 }),
        { type: 'slime', from: 'water', pos: [-45, 2.6, -289], to: [-41.5, 2.6, -288], color: YELLOW, core: RED, delay: 0.4 },
        { type: 'slime', from: 'water', pos: [-29, 2.6, -288], to: [-32.5, 2.6, -287], color: RED, core: YELLOW, delay: 0.8 },
        { type: 'spider', from: 'tree', pos: [-35, 3, -284.9], color: RED, shields: [YELLOW, RED], ceiling: true, leash: 8, range: 26, delay: 1.4 },
        ...creatureSpecs('snapjaw', [-29.6, WATER_Y, -279.4], { color: YELLOW, emerge: true, yaw: 1.6, delay: 1.8 }),
      ] },
    ],
    onClear: () => setTimeout(() => game.hud.message('Quiet again. The stones lead <b>west</b>, out to the little island where the river ends.', 6), 2400),
  });
  onRespawn(() => grove.reset());
  cp([-40, 2.6, -279], WEST, [8, 3, 2.4]); // (clear of the pump station: at -36, -278.5 a respawn stood you on its roof)
  B.armor([-42, 2.6, -290]);
  B.armor([-62.5, 2.6, -261.5]);
  // stepping stones out to the island
  stone(-39.8, -293.2, 2, 2.7);
  stone(-43.8, -296.4, 2, 2.9, { glyph: true });
  // dressing the river: big trees all down the banks, mangroves in the water, reactors and a tower in the fog
  for (const [x, z, k, s, y] of [[-52, -246, 'giant', 0.9], [-36, -253, 'giant', 0.8], [-58, -252, 'mangrove', 1], [-70, -258, 'giant', 0.9], [-47, -270, 'mangrove', 1.1], [-54, -276, 'giant', 0.8], [-72, -290, 'giant', 0.9], [-26, -270, 'giant', 0.85], [-20, -254, 'giant', 0.8], [-30, -296, 'giant', 0.8], [-58, -292, 'giant', 0.85], [-62, -298, 'mangrove', 0.9], [-42, -300, 'mangrove', 0.9]]) tree(x, z, k, s, y);
  K.reactorTank([-72, 0.6, -266], 11, { r: 1.6 });
  K.reactorTank([-76, 0.6, -271], 8.5, { r: 1.3 });
  K.reactorTank([-26, 0.6, -262], 10, { r: 1.5 });
  K.harvestTower([-82, 0.8, -250], 13, { r: 2.4 });
  K.harvestTower([-20, 0.8, -284], 11, { r: 2 });
  K.catwalk([[-26, -258], [-26, -266], [-22, -275]], 4.2, { ground: WATER_Y, solid: true });
  F.fireflies([[-31, 3.8, -241, 5, 16], [-43, 3.8, -246, 4, 14], [-60, 3.6, -266, 5, 18], [-61, 3.6, -277, 4, 14], [-50, 3.8, -282, 4, 12], [-37, 3.8, -284, 6, 20], [-48, 4, -297, 4, 20]]);

  // ================================================================ THE TRAPDOOR ISLAND (-50, 3, -297)
  // A little island where the river ends, surrounded by black water and trees, an old stone marker half
  // swallowed by roots in the middle of it. Step up to it and the paving shudders, cracks, and drops you.
  const trap = buildTrapdoorIsland();

  // ================================================================ THE MOUNTAIN behind it (the ruin's outside)
  // A wall of mossy cliff rises out of the swamp north of the river (z -302), the monkey's head carved in its
  // east face (verdantEscape.js), vines down its face, fog over its top. Nobody climbs it.
  {
    const cliff = (x1, y1, z1, x2, y2, z2) => {
      K.put(wetStone, boxGeo(x2 - x1, y2 - y1, z2 - z1, 0.12), (x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
      solid(x1, y1, z1, x2, y2, z2, 'rock');
    };
    cliff(-100.5, -1.5, -306, 0, 44, -302);
    for (let x = -98; x < -2; x += R(4, 8)) {
      const w = R(3, 7), h = R(8, 30);
      K.put(wetStone, boxGeo(w, h, R(1, 3), 0.12), x, h / 2 - 1, -301.4 + R(-0.3, 0.3));
      K.mossCap(x, h - 1, -301.2, w * 0.5, 0.3);
      for (let k = 0; k < 5; k++) F.vineStrand(x + R(-w / 2, w / 2), h - 1, -300.4, R(3, h * 0.8), 0.16);
    }
    for (let i = 0; i < 40; i++) F.vineStrand(R(-100, 0), R(20, 44), -301.95, R(6, 20), 0.18);
    W.addSolid(new THREE.Vector3(-100.5, 2, -302.5), new THREE.Vector3(0, 80, -301.8), { noShot: true });
  }
  // the edges of the swamp: invisible walls behind the trees (the fog hides how close they are)
  for (const [a, b] of [[[-30.8, -1, -232], [-30.5, 40, -158.5]], [[30.5, -1, -232], [30.8, 40, -158.5]], [[-100.8, -1, -302], [-100.5, 40, -232]], [[-100.5, -1, -232.3], [-30.5, 40, -232]], [[0, -1, -302], [27, 40, -300]], [[2, -1, -300], [2.3, 10, -232.3]], [[2, -1, -232.3], [30.5, 10, -232]]]) B.blocker(a, b);

  // ================================================================ scatter: the forest fills in round the route
  for (let x = -29; x <= 29; x += 5.7)
    for (let z = -173; z >= -231; z -= 5.7) {
      const px = x + R(-2, 2), pz = z + R(-2, 2);
      const under = px > 3.5 && px < 16.5; // (under the aqueduct: nothing tall)
      const k = under ? 'snag' : rand() < 0.45 ? 'giant' : rand() < 0.6 ? 'mangrove' : 'snag';
      if (!clearOf(px, pz, k === 'giant' ? 3.5 : 2)) continue;
      trees.push({ x: px, z: pz, kind: k, s: under ? R(0.4, 0.55) : R(0.65, 0.95), y: k === 'mangrove' ? MIRE_TOP : MIRE_TOP - 0.2 });
    }
  for (let x = -98; x <= -2; x += 6.1)
    for (let z = -234; z >= -299; z -= 6.1) {
      const px = x + R(-2, 2), pz = z + R(-2, 2);
      const k = rand() < 0.45 ? 'giant' : rand() < 0.6 ? 'mangrove' : 'snag';
      if (px > -8 && k === 'giant' && pz > -262) continue; // (keep the zip line's corridor open)
      if (!clearOf(px, pz, k === 'giant' ? 3.5 : 2)) continue;
      trees.push({ x: px, z: pz, kind: k, s: R(0.65, 1), y: k === 'mangrove' ? MIRE_TOP : MIRE_TOP - 0.2 });
    }
  // brush walls: reeds and ferns crowding the water's edge all along the route (visual, never solid)
  for (const { pts } of paths)
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az);
      for (let u = 0; u < L; u += R(0.8, 1.6)) {
        const k = u / L, s = rand() < 0.5 ? 1 : -1, off = R(3.8, 6.5);
        const x = ax + (bx - ax) * k + (-(bz - az) / L) * off * s, z = az + (bz - az) * k + ((bx - ax) / L) * off * s;
        if (!clearOf(x, z, 0.4)) continue;
        brush.push({ kind: rand() < 0.55 ? 'reed' : rand() < 0.5 ? 'lily' : 'bush', x, y: rand() < 0.5 ? WATER_Y - 0.3 : WATER_Y - 0.1, z, s: R(0.8, 1.4) });
      }
    }
  for (let i = 0; i < 260; i++) {
    const narrow = i < 110, x = narrow ? R(-30, 30) : R(-99, -1), z = narrow ? R(-231, -171) : R(-299, -233);
    if (!clearOf(x, z, 1.2)) continue;
    brush.push({ kind: rand() < 0.45 ? 'reed' : rand() < 0.5 ? 'lily' : rand() < 0.5 ? 'bush' : 'shroom', x, y: WATER_Y - 0.15, z, s: R(0.8, 1.6) });
  }

  // ================================================================ the air: fog motes, gnats, spores, god-rays, mist
  const sporesA = F.motes([-30, 2, -232, 30, 14, -158], 500, { color: 0xc8ff8a, size: 0.07, speed: 0.25 });
  const sporesB = F.motes([-100, 2, -300, 0, 16, -232], 700, { color: 0xc8ff8a, size: 0.07, speed: 0.25 });
  const gnats = [[-9, 3, -186], [6, 3.5, -192], [-4, 3.5, -214], [-50, 3.5, -256], [-61, 3.5, -276], [-37, 3.5, -287]].map(([x, y, z]) => F.motes([x - 1.5, y, z - 1.5, x + 1.5, y + 2, z + 1.5], 40, { color: 0x202418, size: 0.05, speed: 1.2, jitter: 6, opacity: 0.9 }));
  for (const [x, y, z, l, w] of [[-3, 16, -186, 15, 2.6], [17, 16, -205, 14, 2.4], [-14, 17, -225, 15, 3], [-31, 18, -241, 16, 2.6], [-50, 17, -256, 15, 2.4], [-61, 17, -269, 15, 3], [-37, 18, -283, 16, 3.4], [-50, 18, -297, 16, 2.8]]) F.shaft(x, y, z, l, w, 0.1);
  for (let i = 0; i < 26; i++) F.mist(R(-29, 29), WATER_Y + R(0.3, 1.2), R(-230, -172), R(10, 18), R(10, 18));
  for (let i = 0; i < 34; i++) F.mist(R(-98, -2), WATER_Y + R(0.3, 1.2), R(-298, -234), R(12, 20), R(12, 20));

  // ================================================================ build the meshes, cull by half
  // (static dressing: one merged mesh per material for the whole swamp, plus the instanced forest per half)
  const staticMeshes = K.flush();
  const treesA = F.trees(trees.filter((t) => t.z > -232.5));
  const treesB = F.trees(trees.filter((t) => t.z <= -232.5));
  const brushA = F.brush(brush.filter((t) => t.z > -232.5));
  const brushB = F.brush(brush.filter((t) => t.z <= -232.5));
  const above = (p) => p.y > -4 && p.z > -301.5; // (in the ruin, the mountain or out over the gorge, none of the swamp is drawn)
  F.groupVisible([...A, ...treesA, ...brushA, sporesA.p], (p) => above(p) && p.z > -262);
  F.groupVisible([...Bm, ...treesB, ...brushB, sporesB.p, ...gnats.map((g) => g.p)], (p) => above(p) && p.z < -205);
  F.groupVisible(staticMeshes, above);

  // ================================================================ the ruin below (and everything after it)
  const ruin = buildVerdantRuin(B, { K, F, trap, ...ctx });

  // ================================================================ OBJECTIVES (verdant.js asks)
  function objective(p) {
    const r = ruin.objective?.(p);
    if (r) return r;
    if (p.y < -2 || p.z < -301.5 || p.x > 31) return '';
    if (p.z > -158.5) return '';
    if (p.z > -172) return 'Into the swamp: <b>down the steps</b>, into the shallows.';
    if (p.z > -232) {
      if (p.z > -188 && p.x < 3) return 'Hop the hummocks and the fallen log <b>east</b>. Shallows slow you; <b>deep water drags you under</b>.';
      if (p.z > -200 && p.x < 13) return 'Walk the <b>harvest pipe</b> north-east, under the aqueduct.';
      if (p.x > 12) return 'From the pump island, cross the fallen log <b>west</b>.';
      if (p.z > -220) return 'Hop the old stepping stones <b>north-west</b> to the bank.';
      return 'North off the bank, into the river country.';
    }
    if (p.x > -42 && p.z > -247) return 'Follow the reactor catwalk <b>west</b>.';
    if (p.z > -258 && p.x > -54) return 'Cross the river on the <b>giant fallen log</b>.';
    if (p.x < -54 && p.z > -272) return 'North up the <b>west bank</b>.';
    if (p.x < -54) return 'Hop the hummocks north, then walk the pipeline <b>east</b> over the river.';
    if (grove.state !== 'armed' && grove.state !== 'cleared') return 'Survive the <b>Drowned Grove</b>.';
    if (p.x > -44.5 && p.z > -292) return 'The stones lead <b>west</b> to the little island where the river ends.';
    return 'Step up to the old stone marker on the island.';
  }

  // ================================================================ STARTS
  devStart('verdant', [-10, 4, -151], NORTH, RY, 'The Verdant gate');
  devStart('verdant1', [-9, 2.2, -183.5], NORTH, RY, 'The Drowned Wood: the first slime');
  devStart('verdant2', [17.5, 2.4, -204], WEST, RY, 'The pump island');
  devStart('verdant3', [-14, 2.7, -229.5], NORTH, RY, 'The bank under the giants (the spider)');
  devStart('verdant4', [-40, 2.7, -244], WEST, RY, 'The swamp river: the snapjaw and the fallen log');
  devStart('verdant5', [-60, 2.6, -263.5], NORTH, RY, 'The west bank (slimes from the water)');
  devStart('verdant6', [-40, 2.6, -279], WEST, RY, 'The Drowned Grove (ambush)');
  devStart('verdant7', [-39.8, 2.7, -293.2], WEST, RY, 'The trapdoor island'); // (on the first stepping stone, not the mire beside it)

  return { objective, grove, waterAmbush, trap, ruin, kit: K, flora: F, waterMats: WM };

  // ---------------------------------------------------------------- helpers that need the scope above
  // a bough over the path (solid: a spider clings under it), mossy, hung with vines
  function bough(x1, z1, x2, z2, y) {
    const along = Math.abs(x2 - x1) > Math.abs(z2 - z1);
    const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
    K.rod(mats.bark, along ? [x1, y, cz] : [cx, y, z1], along ? [x2, y + 0.4, cz] : [cx, y + 0.4, z2], 0.6, 0.45, 8);
    solid(Math.min(x1, x2), y - 0.6, Math.min(z1, z2), Math.max(x1, x2), y + 0.5, Math.max(z1, z2), 'rock');
    for (let u = 0; u < 1; u += 0.12) {
      const x = along ? x1 + (x2 - x1) * u : cx + R(-0.3, 0.3), z = along ? cz + R(-0.3, 0.3) : z1 + (z2 - z1) * u;
      if (rand() < 0.6) F.vineStrand(x, y - 0.4, z, R(1.5, 4.5));
      else K.hangMoss(x, y - 0.4, z, R(1, 3), 0.45);
    }
    K.mossCap(cx, y + 0.5, cz, 1.2, 0.35);
  }
  // a skeleton slumped in the roots (no collision): skull, ribs, long bones, a scrap of jacket
  function remains(x, y, z, yaw = 0) {
    const bone = boneMat;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const at = (dx, dz) => [x + dx * c + dz * s, z - dx * s + dz * c];
    const [sx, sz] = at(0, -0.55);
    K.put(bone, new THREE.IcosahedronGeometry(0.13, 1), sx, y + 0.42, sz);
    for (let i = 0; i < 4; i++) {
      const [rx, rz] = at(0, -0.25 + i * 0.09);
      K.put(bone, new THREE.TorusGeometry(0.14 - i * 0.012, 0.018, 4, 10, PI).rotateY(yaw), rx, y + 0.18, rz);
    }
    for (const [dx, dz, len, ry] of [[0.18, 0.3, 0.45, 0.3], [-0.16, 0.34, 0.45, -0.2], [0.32, -0.1, 0.32, 1.2], [-0.3, 0.05, 0.3, -1]]) {
      const [bx, bz] = at(dx, dz);
      K.put(bone, new THREE.CylinderGeometry(0.025, 0.03, len, 4).rotateX(PI / 2).rotateY(yaw + ry), bx, y + 0.04, bz);
    }
    const [jx, jz] = at(0.1, -0.15);
    K.put(jacketMat, boxGeo(0.5, 0.05, 0.6, 0.5).rotateY(yaw + 0.3).rotateX(0.2), jx, y + 0.12, jz);
    for (let i = 0; i < 3; i++) K.limb([[x + R(-1, 1), y - 0.3, z + R(-1, 1)], [x + R(-0.3, 0.3), y + 0.35, z + R(-0.3, 0.3)], [x + R(-1, 1), y - 0.2, z + R(-1, 1)]], 0.1, 0.05, mats.bark, 5);
  }

  // ---------------------------------------------------------------- the creatures (entities/verdantCreatures.js)
  // red / yellow ones only before the gun; as encounter data: { type: 'rotflies' | 'snapjaw' | 'borer', ... }
  function creatureSpecs(kind, pos, o = {}) {
    if (kind === 'rotfly') return [{ type: 'rotflies', pos, colors: RY, count: o.count ?? 4, respawn: 0, hive: false, delay: o.delay }];
    if (kind === 'snapjaw') return [{ type: 'snapjaw', pos, color: o.color ?? RED, shields: o.shields, emerge: !!o.emerge, yaw: o.yaw ?? 0, delay: o.delay }];
    return [];
  }
  // ---------------------------------------------------------------- the trapdoor island
  function buildTrapdoorIsland() {
    const [ix, iy, iz] = ISLAND;
    // the island: mud and roots, a ring of solid ground round a 4 x 4 m hole that's paving until it isn't
    const H = { x1: ix - 2, x2: ix + 2, z1: iz - 2, z2: iz + 2 }; // the trap
    K.put(mud, new THREE.CylinderGeometry(5.2, 6.4, iy + 1.5, 13, 1).translate(0, (iy - 1.5) / 2, 0), ix, 0, iz);
    for (const [x1, z1, x2, z2] of [[ix - 4.6, iz - 4.6, ix + 4.6, H.z1], [ix - 4.6, H.z2, ix + 4.6, iz + 4.6], [ix - 4.6, H.z1, H.x1, H.z2], [H.x2, H.z1, ix + 4.6, H.z2]]) solid(x1, -1.5, z1, x2, iy, z2, 'grass');
    // the moss ring (round the paving), roots heaving out of the mud, the old marker at the north edge
    const ring = new THREE.RingGeometry(2.9, 5.4, 16, 1).rotateX(-PI / 2);
    K.put(mats.moss, ring, ix, iy + 0.02, iz);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * PI * 2 + R(-0.2, 0.2);
      K.limb([[ix + Math.cos(a) * 2.9, iy + 0.05, iz + Math.sin(a) * 2.9], [ix + Math.cos(a) * 4.4, iy + R(0.2, 0.6), iz + Math.sin(a) * 4.4], [ix + Math.cos(a) * 6.5, WATER_Y - 0.6, iz + Math.sin(a) * 6.5]], R(0.2, 0.32), 0.08, mats.bark, 6);
    }
    // the paving over the trap: granite tiles round a carved disc (it drops away as one piece, in tiles)
    const trapGroup = new THREE.Group();
    trapGroup.position.set(ix, iy, iz);
    const tiles = [];
    for (let gx = 0; gx < 4; gx++)
      for (let gz = 0; gz < 4; gz++) {
        const m = new THREE.Mesh(boxGeo(0.96, 0.4, 0.96, 0.5), (gx + gz) % 3 ? wetStone : wetGlyph);
        m.position.set(-1.5 + gx, -0.2, -1.5 + gz);
        m.rotation.set(R(-0.02, 0.02), R(-0.05, 0.05), R(-0.02, 0.02));
        trapGroup.add(m);
        tiles.push({ m, home: m.position.clone(), rot: m.rotation.clone(), v: new THREE.Vector3(), spin: new THREE.Vector3() });
      }
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.06, 20), mats.jade);
    disc.position.y = 0.02;
    trapGroup.add(disc);
    W.scene.add(trapGroup);
    const trapSolid = solid(H.x1, iy - 0.4, H.z1, H.x2, iy, H.z2, 'stone');
    // the marker: a squat granite stele, glyph-banded, a jade eye, strangled in roots, at the trap's north edge
    K.put(wetStone, boxGeo(1.6, 2.2, 1.0, 0.5), ix, iy + 1.1, iz - 3.3);
    K.put(wetGlyph, boxGeo(1.65, 0.7, 1.05, 0.5), ix, iy + 1.3, iz - 3.3);
    K.put(mats.jade, new THREE.SphereGeometry(0.22, 10, 8), ix, iy + 1.75, iz - 2.75);
    K.put(wetStone, boxGeo(2.2, 0.4, 1.4, 0.5), ix, iy + 2.4, iz - 3.3);
    solid(ix - 0.8, iy, iz - 3.8, ix + 0.8, iy + 2.6, iz - 2.8, 'stone');
    for (let i = 0; i < 5; i++) K.limb([[ix + R(-1.5, 1.5), iy - 0.2, iz - 3.3 + R(-1.2, 1.2)], [ix + R(-0.9, 0.9), iy + R(1.2, 2.2), iz - 3.3 + R(-0.6, 0.6)], [ix + R(-0.7, 0.7), iy + R(2.4, 3.2), iz - 3.3 + R(-0.4, 0.4)]], R(0.12, 0.2), 0.05, mats.bark, 5);
    K.mossCap(ix, iy + 2.65, iz - 3.3, 1, 0.3);
    for (let i = 0; i < 4; i++) K.hangMoss(ix + R(-1, 1), iy + 2.5, iz - 3.3 + R(-0.6, 0.6), R(0.6, 1.6));
    for (let i = 0; i < 12; i++) {
      const a = R(0, PI * 2), d = R(3.2, 4.8);
      brush.push({ kind: rand() < 0.5 ? 'fern' : rand() < 0.5 ? 'shroom' : 'bush', x: ix + Math.cos(a) * d, y: iy, z: iz + Math.sin(a) * d, s: R(0.5, 0.9) });
    }
    holes.push([ix - 6.5, iz - 6.5, ix + 6.5, iz + 6.5]);
    F.shaft(ix, 17, iz, 14, 2.4, 0.05);
    B.light(ix, iy + 3.5, iz - 2, 0x9dffb0, 8, 9);
    // the shaft down through the swamp bed to the cistern (granite, dark), its sides seen as you fall
    for (const [x1, z1, x2, z2] of [[H.x1 - 0.5, H.z1 - 0.5, H.x2 + 0.5, H.z1], [H.x1 - 0.5, H.z2, H.x2 + 0.5, H.z2 + 0.5], [H.x1 - 0.5, H.z1, H.x1, H.z2], [H.x2, H.z1, H.x2 + 0.5, H.z2]]) {
      K.put(wetStone, boxGeo(x2 - x1, iy - 0.4 + 2, z2 - z1, 0.5), (x1 + x2) / 2, (iy - 0.4 - 2) / 2, (z1 + z2) / 2);
      solid(x1, -2, z1, x2, iy - 0.4, z2, 'stone');
    }

    const st = { state: 'set', t: 0, dropped: !!game.clearedEncounters?.has(TRAP_ID), fell: false };
    const restore = () => {
      for (const t of tiles) {
        t.m.position.copy(t.home);
        t.m.rotation.copy(t.rot);
        t.m.visible = true;
      }
      disc.visible = true;
      trapGroup.position.set(ix, iy, iz);
    };
    const open = (instant) => {
      trapSolid.enabled = false;
      if (instant) {
        for (const t of tiles) t.m.visible = false;
        disc.visible = false;
      }
    };
    if (st.dropped) open(true), (st.state = 'open');
    // step up to the marker
    W.trigger([H.x1 + 0.3, iy - 0.1, H.z1 - 0.6], [H.x2 - 0.3, iy + 3, H.z2 - 0.3], () => {
      if (st.state !== 'set') return;
      st.state = 'cracking';
      st.t = 0;
      audio.sample(audio.sfxOr('temple_rumble', 'root_rumble'), { gain: 1, vary: 0 });
      audio.sample('crumble_crack', { gain: 1, rate: 0.7, vary: 0 });
      game.player.shake = Math.max(game.player.shake, 0.35);
    }, { once: false });
    const UP = new THREE.Vector3(0, 1, 0);
    W.add({
      update(dt, player) {
        if (st.state === 'cracking') {
          st.t += dt;
          player.shake = Math.max(player.shake, 0.2 + st.t * 0.3);
          for (const t of tiles) t.m.position.y = t.home.y + Math.sin(W.time * 60 + t.home.x * 7 + t.home.z * 3) * 0.02 * st.t;
          if (Math.random() < dt * 25) W.fx.edgeDust?.(H.x1, H.x2, iy + 0.02, H.z1, H.z2);
          if (st.t > 0.85) {
            st.state = 'falling';
            st.t = 0;
            open(false);
            audio.sample(audio.sfxOr('trapdoor_fall', 'trapdoor_drop'), { gain: 1.1, vary: 0 });
            audio.sample('crumble_break', { gain: 1, rate: 0.7, vary: 0 });
            W.fx.burst(new THREE.Vector3(ix, iy + 0.3, iz), 0x6a6a52, { count: 50, speed: 4, life: 1.2, size: 0.4, gravity: 3, mode: 'puff' });
            for (const t of tiles) {
              t.v.set(R(-1, 1), R(-2, 0), R(-1, 1));
              t.spin.set(R(-4, 4), R(-2, 2), R(-4, 4));
            }
          }
        } else if (st.state === 'falling') {
          st.t += dt;
          for (const t of tiles) {
            t.v.y -= 20 * dt;
            t.m.position.addScaledVector(t.v, dt);
            t.m.rotation.x += t.spin.x * dt;
            t.m.rotation.z += t.spin.z * dt;
            if (t.m.position.y < -12) t.m.visible = false;
          }
          disc.position.y -= 9 * dt * st.t * 3;
          if (disc.position.y < -12) disc.visible = false;
          // falling through the dark: the screen goes black, a crash of stone, the cold water
          if (!st.fell && player.pos.y < iy - 1.5) {
            st.fell = true;
            game.hud.fade(1, 0.6);
          }
          if (st.fell && (player.swimming || player.grounded) && player.pos.y < -4) {
            st.state = 'open';
            st.dropped = true;
            game.clearedEncounters?.add(TRAP_ID);
            audio.sample('leviathan_splash', { gain: 0.9, rate: 1.3, vary: 0 });
            setTimeout(() => game.hud.fade(0, 1.6), 450);
            setTimeout(() => game.hud.message('Darkness, and cold water. Swim up (<b>Space</b>) to the ledge on the <b>north</b> side, and press <b>Space</b> at its edge to climb out.', 6), 1600);
            ruin.onFall?.();
          }
          if (st.t > 4 && player.pos.y > iy - 1) st.state = 'open'; // (jumped clear: the hole stays open)
        }
      },
    });
    onRespawn(() => {
      // a death before the drop puts the paving back (and after it, the hole stays)
      if (st.dropped) return;
      if (st.state !== 'set') {
        st.state = 'set';
        st.fell = false;
        trapSolid.enabled = true;
        restore();
      }
    });
    return { st, center: new THREE.Vector3(ix, iy, iz), hole: H };
  }
}

// (materials only remains() uses)
const boneMat = new THREE.MeshStandardMaterial({ color: 0xcfc6a8, roughness: 0.8, flatShading: true });
const jacketMat = new THREE.MeshStandardMaterial({ color: 0x3a4a6a, roughness: 0.9, flatShading: true });
