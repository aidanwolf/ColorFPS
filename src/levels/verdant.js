// VERDANT — the green world, "EMERALD HOLLOW": the Lumen's nature engine, an overgrown bio-lab swallowed by
// jungle north of the Hub, its sinkhole flooded with toxic sludge. You come in with red + yellow and take
// GREEN from the Seed Vault halfway; from then on green does the heavy lifting.
// The loop (region and Hub ports: LAYOUT.md), one beat after another:
//   GATEHOUSE (Hub north port x -10, y 4) → SOUTH TERRACE (rain court nook; a green catapult shortcut)
//   → P1 THE SLUDGE MOAT: spike-crowned stones, a crumble run with a betrayer, a raft you push by shooting it
//   → C1 THE RUIN BANK ambush → Z1 THE ROOT BRIDGE: swing three root arms into a bridge over the Hollow
//   → P2 THE HOLLOW DESCENT: a trapdoor walkway, red/yellow timed phase stones, root steps to the dock
//   → ARENA: THE GREENHOUSE (four waves) → lab corridor → Z2 THE SEED VAULT: shoot a platform rack into a
//   staircase, bank yellow off a mirrored leaf into the core cage, take GREEN, spam the green riser
//   → P3 THE CANOPY: a jump-pad chimney through green spore membranes, green chroma vines, a crumbling bough,
//   a green/yellow phase pair you switch mid-jump, a pad onto the Great Tree's crown
//   → C2 THE CROWN NEST ambush → the spike drop → Z3 THE SLUICE: a sinker race, a green raft through rotor gates
//   → THE THORNMAW'S COURTYARD (verdantArena.js) and the VERDANT HEART → the aqueduct home over the
//   dead jungle → the Hub's north balcony port (x 10, y 12).
// Shutting the Heart down (game.onPowerDown('verdant'), also on load) kills the jungle: see aftermath().
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RED, YELLOW, GREEN, BLUE } from '../colors.js';
import { Barrier } from '../entities/barrier.js';
import { JumpPad, Checkpoint } from '../entities/misc.js';
import { Mirror, Glass, TargetPanel, SlidingDoor } from '../entities/puzzle.js';
import { boxGeo, mat } from '../materials.js';
import { liquidMaterial } from '../liquid.js';
import { regionOf } from './regions.js';
import { buildVerdantArena } from './verdantArena.js';

// deterministic scatter for plants, vines and canopies
function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function softTex(draw) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  draw(c.getContext('2d'), 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// A soft column of light standing on a landing you should head for.
function beacon(W, x, y, z, hex, h = 7, r = 0.8) {
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(0.9), transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r, h, 20, 1, true), m);
  mesh.position.set(x, y + h / 2, z);
  W.scene.add(mesh);
  let t = Math.random() * 6;
  W.add({ update: (dt) => (t += dt, (m.opacity = 0.13 + Math.sin(t * 2.6) * 0.05)) });
  return m;
}

const PI = Math.PI;
const EAST = -PI / 2, WEST = PI / 2, NORTH = 0, SOUTH = PI; // yaws

export function buildVerdant(B) {
  const { W, game, level, GLOW, wallX, wallZ, room, corridor, corridorX, plat, pedestal, shieldedShaft, secretRoom, trophy, hint, zoneTitle, area, light, blocker, devStart, guideStrip, glowEdge } = B;
  const zone = 'green';
  const rand = mulberry32(20261008);
  const R = (a, b) => a + (b - a) * rand();
  const MOOD = { music: 'music_green', ambient: 'amb_jungle', atmosphere: 'verdant' };
  const RY = [RED, YELLOW], RYG = [RED, YELLOW, GREEN];
  const tagC = (hex, t) => `<b style="color:${hex}">${t}</b>`;
  const G_ = (t) => tagC('#3dff7a', t), Y_ = (t) => tagC('#ffd23a', t), R_ = (t) => tagC('#ff3344', t);
  const cp = (pos, yaw, size = [4, 3, 4]) => new Checkpoint(W, game, { pos, yaw, size });
  const lights = []; // every B.light this world owns (the aftermath turns them cold)
  const lamp = (...a) => (lights.push(light(...a)), lights[lights.length - 1]);

  // humid, canopy-filtered daylight: green-grey mist, soft gold sun, no stars
  level.atmospheres.verdant = {
    fog: 0x5d7356, fogNear: 22, fogFar: 185,
    skyTop: [0.03, 0.06, 0.04], skyMid: [0.07, 0.12, 0.07], skyHorizon: [0.12, 0.17, 0.09], aurora: 0.02, stars: 0,
    hemiSky: 0xd6f0b0, hemiGround: 0x18301c, hemiIntensity: 0.8,
    sunColor: 0xffe39a, sunIntensity: 1.6, sunDir: [-0.35, 1, 0.45],
    exposure: 1.0, bloom: 0.55,
  };
  // ... and once the engine is dead: cold grey light, a pale sun, the bloom gone out of it
  const DEAD_ATMO = {
    fog: 0x4c565c, fogNear: 16, fogFar: 165,
    skyTop: [0.02, 0.025, 0.04], skyMid: [0.06, 0.07, 0.085], skyHorizon: [0.13, 0.14, 0.16], aurora: 0, stars: 0.15,
    hemiSky: 0xa9b8c8, hemiGround: 0x16181c, hemiIntensity: 0.62,
    sunColor: 0xc4d4e6, sunIntensity: 0.85, sunDir: [-0.5, 0.55, 0.5],
    exposure: 0.9, bloom: 0.32,
  };

  // ---------------------------------------------------------------- organic dressing (custom meshes)
  // Collected here and merged into one mesh per material at the end, so the jungle costs a handful of draws.
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2a6e35, roughness: 0.95, flatShading: true });
  const leafLitMat = new THREE.MeshStandardMaterial({ color: 0x5f9432, roughness: 0.95, flatShading: true });
  const stalkMat = new THREE.MeshBasicMaterial({ color: 0x2c8a5c });
  const capMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x5dffc8).multiplyScalar(1.15) });
  const goldMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd25a).multiplyScalar(1.5) });
  const boneMat = new THREE.MeshStandardMaterial({ color: 0xd8d0b4, roughness: 0.8, flatShading: true });
  const shaftTex = softTex((g, s) => {
    const h = g.createLinearGradient(0, 0, s, 0);
    h.addColorStop(0, 'rgba(255,255,255,0)');
    h.addColorStop(0.5, 'rgba(255,255,255,1)');
    h.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = h;
    g.fillRect(0, 0, s, s);
    g.globalCompositeOperation = 'destination-in';
    const v = g.createLinearGradient(0, 0, 0, s);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(0.2, 'rgba(0,0,0,1)');
    v.addColorStop(0.75, 'rgba(0,0,0,0.5)');
    v.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = v;
    g.fillRect(0, 0, s, s);
  });
  const blobTex = softTex((g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, s, s);
  });
  const shaftMat = new THREE.MeshBasicMaterial({ map: shaftTex, color: 0xf2ffc8, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const mistMat = new THREE.MeshBasicMaterial({ map: blobTex, color: 0x9dffc4, transparent: true, opacity: 0.045, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const barkTex = softTex((g, s) => {
    g.fillStyle = '#4a3f2e';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 26; i++) {
      const x = rand() * s, w = 1 + rand() * 3;
      g.fillStyle = `rgba(${20 + rand() * 30},${16 + rand() * 20},${10 + rand() * 12},${0.5 + rand() * 0.5})`;
      g.fillRect(x, 0, w, s);
    }
    for (let i = 0; i < 60; i++) {
      g.fillStyle = `rgba(${60 + rand() * 40},${110 + rand() * 60},${50 + rand() * 30},${0.25 + rand() * 0.35})`;
      g.fillRect(rand() * s, rand() * s, 1 + rand() * 4, 1 + rand() * 3);
    }
  });
  barkTex.wrapS = barkTex.wrapT = THREE.RepeatWrapping;
  const barkMat = new THREE.MeshStandardMaterial({ map: barkTex, color: 0xb0a090, roughness: 1, flatShading: true });
  const cliffTex = softTex((g, s) => {
    g.fillStyle = '#4a5642';
    g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 2 + rand() * 6) {
      const v = rand();
      g.fillStyle = v < 0.5 ? `rgba(20,28,20,${0.25 + rand() * 0.4})` : `rgba(120,130,105,${0.1 + rand() * 0.2})`;
      g.fillRect(0, y, s, 1 + rand() * 3);
    }
    for (let i = 0; i < 90; i++) {
      g.fillStyle = `rgba(${40 + rand() * 40},${90 + rand() * 70},${35 + rand() * 30},${0.3 + rand() * 0.4})`;
      g.fillRect(rand() * s, rand() * s, 2 + rand() * 7, 1 + rand() * 3);
    }
  });
  cliffTex.wrapS = cliffTex.wrapT = THREE.RepeatWrapping;
  const cliffMat = new THREE.MeshStandardMaterial({ map: cliffTex, color: 0x9aa890, roughness: 1, flatShading: true });
  const lists = new Map([[barkMat, []], [cliffMat, []], [leafMat, []], [leafLitMat, []], [stalkMat, []], [capMat, []], [goldMat, []], [boneMat, []], [shaftMat, []], [mistMat, []]]);
  const put = (m, geo, x, y, z) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    g.translate(x, y, z);
    lists.get(m).push(g);
  };

  function bark(x1, y1, z1, x2, y2, z2, solid = true) {
    const a = new THREE.Vector3(Math.min(x1, x2), Math.min(y1, y2), Math.min(z1, z2));
    const b = new THREE.Vector3(Math.max(x1, x2), Math.max(y1, y2), Math.max(z1, z2));
    if (b.x - a.x < 0.001 || b.y - a.y < 0.001 || b.z - a.z < 0.001) return;
    put(barkMat, boxGeo(b.x - a.x, b.y - a.y, b.z - a.z, 0.25), (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    if (solid) W.addSolid(a, b, { static: true, kind: 'rock' });
  }
  function cliff(x1, y1, z1, x2, y2, z2, solid = true) {
    const a = new THREE.Vector3(Math.min(x1, x2), Math.min(y1, y2), Math.min(z1, z2));
    const b = new THREE.Vector3(Math.max(x1, x2), Math.max(y1, y2), Math.max(z1, z2));
    if (b.x - a.x < 0.001 || b.y - a.y < 0.001 || b.z - a.z < 0.001) return;
    put(cliffMat, boxGeo(b.x - a.x, b.y - a.y, b.z - a.z, 0.15), (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    if (solid) W.addSolid(a, b, { static: true, kind: 'rock' });
  }
  const vine = (x, yTop, z, len) => W.deco(x - 0.05, yTop - len, z - 0.05, x + 0.05, yTop, z + 0.05, 'grass', zone);
  function vines(x1, z1, x2, z2, yTop, n, maxLen) {
    for (let i = 0; i < n; i++) vine(R(x1, x2), yTop, R(z1, z2), R(maxLen * 0.3, maxLen));
  }
  function leafBlob(x, y, z, r, lit = false) {
    const g = new THREE.IcosahedronGeometry(r, 1);
    g.scale(1, 0.55, 1);
    g.rotateY(R(0, 6));
    put(lit ? leafLitMat : leafMat, g, x, y, z);
  }
  function canopy(x, y, z, r, vineCount = 10) {
    leafBlob(x, y, z, r);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * PI * 2 + R(0, 1), d = r * R(0.6, 0.9);
      leafBlob(x + Math.cos(a) * d, y + R(-r * 0.22, r * 0.15), z + Math.sin(a) * d, r * R(0.45, 0.65), i % 2 === 0);
    }
    for (let i = 0; i < vineCount; i++) {
      const a = R(0, PI * 2), d = r * R(0.3, 0.95);
      vine(x + Math.cos(a) * d, y - r * 0.2, z + Math.sin(a) * d, R(3, r * 0.9));
    }
  }
  function giantTree(x, y, z, { w = 3, h = 24, r = 8, vineCount = 10, roots = true } = {}) {
    const hw = w / 2;
    bark(x - hw, y - 1, z - hw, x + hw, y + h, z + hw);
    if (roots) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const l = w * 0.7, t = w * 0.3, rh = Math.min(h * 0.14, 4);
      if (dx) bark(x + dx * hw, y - 1, z - t / 2, x + dx * (hw + l), y + rh, z + t / 2);
      else bark(x - t / 2, y - 1, z + dz * hw, x + t / 2, y + rh, z + dz * (hw + l));
    }
    W.deco(x - hw - 0.05, y + h * 0.45, z - hw - 0.05, x + hw + 0.05, y + h * 0.45 + 0.6, z + hw + 0.05, 'grass', zone);
    for (let i = 0; i < 6; i++) vine(x + R(-hw, hw) * 1.02, y + h, z + (i % 2 ? hw + 0.06 : -hw - 0.06), R(4, h * 0.6));
    canopy(x, y + h, z, r, vineCount);
  }
  function smallTree(x, y, z, s = 1) {
    bark(x - 0.3 * s, y, z - 0.3 * s, x + 0.3 * s, y + 3 * s, z + 0.3 * s);
    canopy(x, y + 3.6 * s, z, 2.6 * s, 3);
  }
  function shroom(x, y, z, s = 1) {
    put(stalkMat, new THREE.CylinderGeometry(0.05 * s, 0.08 * s, 0.5 * s, 5), x, y + 0.25 * s, z);
    put(capMat, new THREE.SphereGeometry(0.3 * s, 7, 3, 0, PI * 2, 0, PI / 2), x, y + 0.48 * s, z);
  }
  function bud(x, y, z, s = 1) {
    put(stalkMat, new THREE.CylinderGeometry(0.03 * s, 0.04 * s, 0.7 * s, 4), x, y + 0.35 * s, z);
    put(goldMat, new THREE.IcosahedronGeometry(0.12 * s, 0), x, y + 0.75 * s, z);
  }
  function glowPatch(x1, z1, x2, z2, y, n, gold = 0.25) {
    for (let i = 0; i < n; i++) {
      if (rand() < gold) bud(R(x1, x2), y, R(z1, z2), R(0.7, 1.4));
      else shroom(R(x1, x2), y, R(z1, z2), R(0.5, 1.3));
    }
  }
  function shaft(x, yTop, z, len, w, tilt = 0.2) {
    for (const a of [0, PI / 2]) {
      const g = new THREE.PlaneGeometry(w, len);
      g.translate(0, -len / 2, 0);
      g.rotateY(a);
      g.rotateX(tilt * 0.6);
      g.rotateZ(-tilt);
      put(shaftMat, g, x, yTop, z);
    }
  }
  function mist(x, y, z, w, d) {
    const g = new THREE.PlaneGeometry(w, d);
    g.rotateX(-PI / 2);
    put(mistMat, g, x, y, z);
  }
  // a skeleton slumped against roots (no collision): skull, ribs, long bones
  function remains(x, y, z, yaw = 0) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const at = (dx, dz) => [x + dx * c + dz * s, z - dx * s + dz * c];
    const [sx, sz] = at(0, -0.55);
    put(boneMat, new THREE.IcosahedronGeometry(0.13, 1), sx, y + 0.42, sz);
    for (let i = 0; i < 4; i++) {
      const g = new THREE.TorusGeometry(0.14 - i * 0.012, 0.018, 4, 10, PI);
      g.rotateY(yaw);
      const [rx, rz] = at(0, -0.25 + i * 0.09);
      put(boneMat, g, rx, y + 0.18, rz);
    }
    for (const [dx, dz, len, ry] of [[0.18, 0.3, 0.45, 0.3], [-0.16, 0.34, 0.45, -0.2], [0.32, -0.1, 0.32, 1.2], [-0.3, 0.05, 0.3, -1]]) {
      const g = new THREE.CylinderGeometry(0.025, 0.03, len, 4);
      g.rotateX(PI / 2);
      g.rotateY(yaw + ry);
      const [bx, bz] = at(dx, dz);
      put(boneMat, g, bx, y + 0.04, bz);
    }
  }
  const fall = (x1, z1, x2, z2, y1, y2) => W.deco(x1, y1, z1, x2, y2, z2, 'acid', zone); // glowing sludge cascade (no collision)

  // ---------------------------------------------------------------- terrain helpers
  // earth: rock with a mossy turf cap (footsteps read as grass), one collision box for both layers
  function ground(x1, z1, x2, z2, top, bottom = top - 5) {
    cliff(x1, bottom, z1, x2, top - 0.25, z2, false);
    W.box(x1, top - 0.25, z1, x2, top, z2, 'grass', zone, { solid: false });
    W.addSolid(new THREE.Vector3(Math.min(x1, x2), bottom, Math.min(z1, z2)), new THREE.Vector3(Math.max(x1, x2), top, Math.max(z1, z2)), { static: true, kind: 'grass' });
  }
  // a stepping stone: earth plus a faint bioluminescent rim so its outline reads mid-jump
  function stone(x1, z1, x2, z2, top, bottom = top - 4) {
    ground(x1, z1, x2, z2, top, bottom);
    glowEdge(Math.min(x1, x2) - 0.03, Math.min(z1, z2) - 0.03, Math.max(x1, x2) + 0.03, Math.max(z1, z2) + 0.03, top - 0.1, GLOW[zone], zone, 0.05);
  }
  // a bark bough/platform with a glowing rim
  function bough(x1, z1, x2, z2, top, thick = 1) {
    bark(x1, top - thick, z1, x2, top, z2);
    W.deco(Math.min(x1, x2), top - 0.02, Math.min(z1, z2), Math.max(x1, x2), top + 0.01, Math.max(z1, z2), 'grass', zone);
    glowEdge(Math.min(x1, x2) - 0.03, Math.min(z1, z2) - 0.03, Math.max(x1, x2) + 0.03, Math.max(z1, z2) + 0.03, top - 0.08, GLOW[zone], zone, 0.05);
  }
  // a broken ruin column with a glowing glyph band
  function column(x, z, y, h, w = 1.2) {
    W.box(x - w / 2, y, z - w / 2, x + w / 2, y + h, z + w / 2, 'wall', zone);
    W.box(x - w / 2 - 0.15, y + h - 0.3, z - w / 2 - 0.15, x + w / 2 + 0.15, y + h, z + w / 2 + 0.15, 'metal', zone);
    W.deco(x - w / 2 - 0.02, y + h * 0.4, z - w / 2 - 0.02, x + w / 2 + 0.02, y + h * 0.4 + 0.08, z + w / 2 + 0.02, GLOW[zone], zone);
  }
  const sw = (o) => B.colorSwitch({ zone, light: false, ...o }); // (switch lights would blow the light budget)
  const say = (min, max, html, t = 6) => hint(min, max, html, t);

  // ================================================================ GATEHOUSE (z -148.5 → -158.5)
  corridor({ zStart: -148.5, zEnd: -158.5, y: 4, zone, cx: -10, w: [{ c: -153.5, w: 2.4, h: 3 }] });
  zoneTitle([-11.5, 4, -152], [-8.5, 7, -149], 'VERDANT', 'EMERALD HOLLOW', '#3dff7a', 'music_green');
  area([-11.5, 4, -152], [-8.5, 7.2, -149], MOOD);
  vines(-11.4, -158.4, -8.6, -149, 7.2, 10, 1.6);
  W.deco(-11.5, 4.01, -158.5, -8.5, 4.06, -155, 'grass', zone);
  // SECRET — the Verdant Reliquary behind a blue door (come back after Azure)
  new Barrier(W, { min: [-12, 4, -154.7], max: [-11.5, 7, -152.3], color: BLUE, kind: 'door', zone });
  room({ x1: -18, x2: -12.5, zS: -150.5, zN: -156.5, y: 4, h: 3.5, zone, e: [{ c: -153.5, w: 2.4, h: 3 }], trim: false });
  trophy(-15.5, 5, -153.5);
  W.box(-16.3, 4, -154.3, -14.7, 4.15, -152.7, 'metal', zone);
  W.deco(-17.95, 6.2, -156.45, -17.9, 6.28, -150.55, 'glow3', zone);
  glowPatch(-17.8, -156.3, -16.8, -150.8, 4, 10, 0.4);
  vines(-17.9, -156.4, -12.6, -150.6, 7.5, 12, 2);
  secretRoom([-18, 4, -156.5], [-12.5, 7.5, -150.5], 'Verdant Reliquary');
  // the strip between the Hub and the court, kept under y 14 so the Hub's windows look out over it
  ground(-30.5, -158.5, 30.5, -148.5, 3.9, -1);
  ground(-30, -158.4, -20, -150, 5.2, 3.8);
  ground(18, -158.4, 30, -151, 6, 3.8);
  ground(-4, -158.4, 6, -153, 4.8, 3.8);
  cliff(8, 3.9, -158.5, 12, 11, -148.5); // the plinth under the return gatehouse
  for (const [x, z, s] of [[-25, -153, 1.2], [24, -154, 1.3], [1, -155.5, 0.9], [-20, -156, 0.8], [15, -152, 0.8]]) {
    bark(x - 0.3 * s, 4, z - 0.3 * s, x + 0.3 * s, 4 + 3 * s, z + 0.3 * s);
    canopy(x, 4 + 3.6 * s, z, 2.6 * s, 3);
  }
  for (let i = 0; i < 14; i++) leafBlob(R(-29, 29), R(4.4, 6), R(-158, -149.5), R(0.8, 1.6), rand() < 0.4);
  glowPatch(-29, -158, -14, -149, 4.6, 18);
  glowPatch(14, -158, 29, -149, 4.8, 18);
  fall(-2.5, -158.45, -1.3, -158.42, 3.9, 10.5);
  W.deco(-3, 3.9, -158.4, -0.8, 3.98, -148.6, 'acid', zone);
  mist(0, 4.3, -153.5, 60, 10);

  // ================================================================ THE COURT WALLS (narrow part, x ±30.5)
  wallX(-159, -158.5, -30.5, 30.5, -1, 11, [{ c: -10, w: 3, y0: 4, h: 3.2 }], zone);
  W.box(-30.5, 11, -159.2, 30.5, 11.3, -158.3, 'grass', zone);
  for (let x = -29; x < 28.5; x += 4.5) if (Math.abs(x + 10) > 3 && Math.abs(x - 10) > 2.5) W.box(x, 11, -159, x + 1.6, 11 + R(0.6, 1.8), -158.5, 'wall', zone);
  vines(-30, -159.1, 30, -159.05, 11, 40, 6);
  // (south of z -178 nothing goes below y -5: the Prism Core lies under there)
  cliff(-30.5, -1, -203, -30, 14, -159);
  cliff(30, -1, -203, 30.5, 14, -159);
  cliff(-30.5, -31, -235, -30, 14, -203);
  cliff(30, -31, -235, 30.5, 14, -203);
  for (let z = -163; z > -233; z -= 7) {
    W.box(-30.05, 4, z - 0.8, -29.4, 14, z + 0.8, 'wall', zone);
    W.box(29.4, 4, z - 0.8, 30.05, 14, z + 0.8, 'wall', zone);
  }
  vines(-29.95, -233, -29.9, -160, 14, 40, 8);
  vines(29.9, -233, 29.95, -160, 14, 40, 8);

  // ================================================================ SOUTH TERRACE (z -159 → -172): calm
  ground(-30, -172, 30, -159, 4, -1);
  area([-12, 4, -163], [-8, 8, -158.5], MOOD);
  cp([-10, 4, -162], NORTH, [6, 3, 3]);
  column(-15, -166, 4, 6.5);
  column(-4, -167, 4, 3.2);
  W.box(-8, 4, -170.5, -2.5, 5.1, -169.4, 'wall', zone); // a toppled column segment
  glowPatch(-24, -171.5, 16, -159.5, 4, 34);
  say([-12, 4, -166], [-8, 7, -163], `The <b>Root Court</b>. Cross the sludge moat — hop the stones, ${R_('break')} the ${R_('red')} and ${Y_('yellow')} spikes on them first.`, 6);
  // THE RAIN COURT (east end, off the path): a mossy ruin open to the sky, gold light and a steady drip.
  // AUDIO LOG NOOK (07 "No Birds"): [25.5, 4, -163.5]
  giantTree(20.5, 4, -168.8, { w: 3, h: 22, r: 6.5 });
  for (const [x1, z1, x2, z2, h] of [[16.5, -171.5, 17.2, -165, 1.6], [16.5, -162.5, 17.2, -159.5, 2.3], [17.2, -171.5, 29.5, -170.8, 1.2]]) W.box(x1, 4, z1, x2, 4 + h, z2, 'wall', zone);
  column(28.2, -170, 4, 5.5, 1);
  column(28.2, -160.5, 4, 3.4, 1);
  W.deco(22.5, 4.01, -166.5, 28.5, 4.03, -160, 'grass', zone);
  for (let i = 0; i < 8; i++) W.deco(R(22, 28) - 0.4, 4.02, R(-166, -160) - 0.3, R(22, 28) + 0.4, 4.035, R(-166, -160) + 0.3, 'glow3', zone); // puddles catching the sky
  glowPatch(22, -167, 29, -159.5, 4, 22, 0.55);
  shaft(25, 26, -164, 22, 3.2, 0.14);
  shaft(22, 24, -161, 20, 2, 0.1);
  mist(25, 4.2, -164, 10, 9);
  // drizzle: streaks falling through the gold light
  const rain = (() => {
    const N = 220, pos = new Float32Array(N * 3), spd = [];
    for (let i = 0; i < N; i++) {
      pos[i * 3] = R(18, 29.5);
      pos[i * 3 + 1] = R(4, 18);
      pos[i * 3 + 2] = R(-171, -159.5);
      spd.push(R(7, 11));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color: 0xd8f4ff, size: 0.07, transparent: true, opacity: 0.55, depthWrite: false });
    const pts = new THREE.Points(geo, m);
    pts.frustumCulled = false;
    W.scene.add(pts);
    W.add({
      update(dt, player) {
        if (Math.abs(player.pos.z + 165) > 45) return;
        for (let i = 0; i < N; i++) {
          pos[i * 3 + 1] -= spd[i] * dt;
          if (pos[i * 3 + 1] < 4) pos[i * 3 + 1] += 14;
        }
        geo.attributes.position.needsUpdate = true;
      },
    });
    return m;
  })();

  // SHORTCUT — the Spore Catapult: a ruined launch shrine whose green membrane hides a jump pad that throws
  // you over the whole moat onto the Ruin Bank (for anyone coming back with green).
  {
    const x1 = -29.5, x2 = -25.5, zS = -163.5, zN = -168.5;
    W.box(x1 - 0.5, 4, zS, x2 + 0.5, 7.5, zS + 0.5, 'wall', zone);
    W.box(x1 - 0.5, 4, zN, x1, 7.5, zS, 'wall', zone);
    W.box(x2, 4, zN, x2 + 0.5, 7.5, zS, 'wall', zone);
    W.box(x1 - 0.7, 7.5, zN - 0.2, x2 + 0.7, 7.8, zS + 0.7, 'grass', zone, { solid: false });
    W.deco(x1 - 0.55, 6.2, zN - 0.02, x1 - 0.45, 6.3, zS, GLOW[zone], zone);
    W.deco(x2 + 0.45, 6.2, zN - 0.02, x2 + 0.55, 6.3, zS, GLOW[zone], zone);
    new Barrier(W, { min: [x1, 4, zN - 0.4], max: [x2, 7.5, zN], color: GREEN, kind: 'wall', zone });
    new JumpPad(W, { pos: [-27.5, 4, -166], power: 20, push: [2.4, 0, -24], color: 0x7dff8a });
    vines(x1 - 0.5, zN - 0.25, x2 + 0.5, zN - 0.2, 7.5, 8, 2);
    say([-30, 4, -172], [-24, 7, -168.6], `An old ${G_('spore catapult')}, sealed by a living membrane. It would throw you clean over the moat.`, 5);
  }

  // ================================================================ P1 · THE SLUDGE MOAT (z -172 → -203)
  cliff(-30, -1, -203, 30, 1, -172);
  W.box(-30, 1, -203, 30, 1.5, -172, 'acid', zone, { hazard: 'acid' });
  mist(-8, 2.2, -186, 44, 30);
  mist(14, 2.6, -190, 30, 22);
  // two stones crowned with spikes: break each with its own color before you land on it
  stone(-21.5, -177, -18.5, -174, 4.5, 1);
  new Barrier(W, { min: [-21.5, 4.5, -177], max: [-18.5, 5.1, -174], color: RED, kind: 'spike', regen: 5, zone });
  stone(-21.5, -182, -18.5, -179, 5, 1);
  new Barrier(W, { min: [-21.5, 5, -182], max: [-18.5, 5.6, -179], color: YELLOW, kind: 'spike', regen: 5, zone });
  // island one: checkpoint, a crawl-hole hut (secret)
  ground(-28, -196, -15, -184, 5, 1);
  cp([-18, 5, -186.5], EAST, [6, 3, 5]);
  smallTree(-17.2, 5, -194.6, 1.1);
  glowPatch(-22, -191.5, -15.5, -184.5, 5, 16);
  room({ x1: -27, x2: -23.5, zS: -192, zN: -195.5, y: 5, h: 2.2, zone, floor: false, trim: false, e: [{ c: -193.75, w: 1.2, h: 1.0 }], wallKind: 'rock' });
  W.box(-27.7, 7.7, -196.2, -22.8, 8.1, -191.3, 'grass', zone);
  W.deco(-22.95, 6.05, -194.45, -22.9, 6.15, -193.05, GLOW[zone], zone);
  trophy(-25.25, 6, -193.75);
  secretRoom([-27, 5, -195.5], [-23.5, 7.2, -192], 'Overgrown Hut');
  // slime molds lurk on the islands (yellow goo, red cores: you don't carry green yet)
  B.slime([-20, 5, -190], { color: YELLOW, core: RED });
  B.slime([-16.5, 5, -192.5], { color: YELLOW, core: RED, size: 0.85 });
  // the crumble run east: two honest stones, then one that looks solid and isn't (don't stop on it)
  B.crumble({ min: [-13, 4.5, -191], max: [-10.5, 5, -188], delay: 0.6, respawn: 3, zone });
  B.crumble({ min: [-8.5, 4.5, -191], max: [-6, 5, -188], delay: 0.6, respawn: 3, zone });
  B.crumble({ min: [-4, 4.5, -191], max: [-1.5, 5, -188], delay: 0.35, respawn: 3, disguise: true, zone });
  // island two: a turret guards it; a raft you push by shooting it carries you to the bank
  ground(0.5, -194, 7, -182, 5.6, 1);
  cp([3.5, 5.6, -186], NORTH, [6, 3, 4]);
  column(6, -192.8, 5.6, 4.5, 1);
  glowPatch(1, -193.5, 6.5, -182.5, 5.6, 12);
  B.turret([6, 5.6, -183.2], YELLOW, { mount: 'floor' });
  B.slime([2.5, 5.6, -191], { color: RED, core: YELLOW });
  const raft1 = B.shotMover({ min: [2.25, 5.0, -197.3], max: [5.25, 5.6, -194.3], path: [0, 0, -6], color: RED, mode: 'push', back: 1.0, kick: 1.2, zone });
  say([0.5, 5.6, -194], [7, 9, -188], `The raft only moves while you ${R_('shoot it')}: stand on it and keep firing ${R_('red')} at it. It drifts back when you stop.`, 6);
  B.enemy('drone', [-16, 10, -180], { color: RED, range: 22 });
  B.enemy('drone', [-6, 10.5, -194], { color: YELLOW, range: 22 });
  B.enemy('drone', [-3, 11, -200.5], { color: RY, range: 22 });
  // the plateau (unreachable): the court's great tree, a sludge stream spilling into the moat
  ground(14, -198, 30, -172, 9, 1);
  giantTree(21, 9, -186, { w: 3.5, h: 25, r: 7, vineCount: 14 });
  W.deco(14, 9, -184.2, 21, 9.06, -182.6, 'acid', zone);
  fall(13.9, -184.2, 14, -182.6, 1.5, 9.06);
  mist(13, 2, -183.4, 6, 6);
  glowPatch(14.5, -197.5, 29.5, -172.5, 9, 30);
  vines(14.05, -197.9, 14.1, -172.2, 9, 20, 5);

  // ================================================================ C1 · THE RUIN BANK (z -203 → -214)
  ground(-30, -214, 30, -203, 4.5, -31);
  area([-30, 4.5, -213.5], [30, 9, -203.5], MOOD);
  cp([3.5, 4.5, -205.6], WEST, [7, 3, 3]);
  for (const [x, z, h] of [[-14, -209, 3.2], [-4, -210.5, 2], [16, -209.5, 3.6], [22, -206, 1.4]]) column(x, z, 4.5, h, 1.3);
  W.box(-9, 4.5, -207, -6, 5.6, -206, 'wall', zone); // low ruined walls for cover
  W.box(6, 4.5, -211.5, 7, 5.4, -208.5, 'wall', zone);
  glowPatch(-29.5, -213.5, 29.5, -203.5, 4.5, 30);
  B.spiderBot([-16, 4.5, -212], { color: RY, leash: 10 });
  // the gateway to the root bridge, sealed until the bank is clear
  W.box(-30, 4.5, -214, -25.5, 11, -213.5, 'wall', zone);
  W.box(-22.5, 4.5, -214, -18, 11, -213.5, 'wall', zone);
  W.box(-25.5, 7.9, -214, -22.5, 11, -213.5, 'wall', zone);
  W.box(-30.2, 11, -214.2, -17.8, 11.8, -213.3, 'metal', zone);
  W.deco(-25.5, 7.85, -213.45, -22.5, 7.95, -213.35, GLOW[zone], zone);
  vines(-30, -213.3, -18, -213.25, 11, 10, 3);
  const bankFight = B.encounter({
    trigger: [[-29, 4.5, -213.4], [29, 8, -204.2]],
    seals: [{ min: [-25.5, 4.5, -214], max: [-22.5, 7.9, -213.5], closed: true }],
    title: 'AMBUSH', sub: 'THE RUIN BANK', color: '#3dff7a', music: 'music_combat', zone,
    checkpoint: { pos: [-24, 4.5, -210.5], yaw: NORTH },
    waves: [
      [
        { type: 'drone', pos: [-20, 9, -209], color: RED },
        { type: 'drone', pos: [0, 9, -210], color: YELLOW },
        { type: 'swarm', pos: [-10, 7.5, -208], color: RY, count: 5, delay: 1.4 },
        { type: 'slime', pos: [-5, 4.5, -207], color: YELLOW, core: RED, delay: 2.2 },
      ],
      [
        { type: 'brute', pos: [-14, 4.5, -205.5], color: YELLOW },
        { type: 'turret', pos: [10, 8.2, -205.45], color: RED, mount: [0, 0, 1], delay: 0.6 },
        { type: 'drone', pos: [-24, 10, -207], color: RY, delay: 1.5 },
        { type: 'slime', pos: [8, 4.5, -210], color: RED, core: YELLOW, delay: 2.2 },
        { type: 'slime', pos: [-20, 4.5, -211], color: YELLOW, core: RED, delay: 2.6 },
        { type: 'swarm', pos: [12, 7.5, -209], color: RY, count: 4, delay: 3 },
      ],
    ],
  });
  // the east end, off the path: AUDIO LOG NOOK (08 "Roots"), a rim over the sludge lake where the roots have
  // grown through what's left of the last expedition: [27, 4.5, -212.2]
  bark(23, 2, -214, 30, 5, -213.2);
  bark(28.5, 4.5, -213.6, 29.3, 7.5, -205);
  bark(24.5, 4.5, -214.1, 25.2, 6.2, -211.5);
  remains(26.8, 4.5, -210.6, 0.4);
  remains(29, 4.5, -208.4, 1.9);
  put(boneMat, new THREE.IcosahedronGeometry(0.12, 1), 24.2, 4.6, -213.4);
  vines(23, -214.1, 30, -214, 4.5, 12, 6);
  glowPatch(23, -213, 29, -209, 4.5, 10, 0.1);

  // ================================================================ Z1 · THE ROOT BRIDGE (z -214 → -246)
  // Three root columns rise out of the Hollow, each carrying a root arm on a pivot. Shoot an arm to swing it a
  // quarter turn; swing each one round until it points back at you, then walk out along it.
  const arms = [];
  for (const [zc, color, dir, start, correct, len] of [[-224, RED, -1, 0, 1, 9.5], [-234, YELLOW, 1, 1, 3, 9], [-244, RED, 1, 0, 3, 9]]) {
    bark(-25, -29, zc - 1, -23, 3.3, zc + 1);
    W.box(-25.2, 3.3, zc - 1.2, -22.8, 3.9, zc + 1.2, 'rock', zone);
    glowEdge(-25.2, zc - 1.2, -22.8, zc + 1.2, 3.82, GLOW[zone], zone, 0.06);
    vines(-25.1, zc - 1.1, -22.9, zc + 1.1, 3.9, 6, 8);
    arms.push(B.shotRotor({ pivot: [-24, 4.5, zc], parts: [[-1, -0.6, -1, len, 0, 1]], axis: 'y', dir, color, start, correct, zone, kind: 'plat' }));
  }
  say([-26, 4.5, -213.4], [-22, 8, -210], `The <b>root arms</b> turn a quarter for every hit of their color. Swing each one round until it <b>points back at you</b>, then walk out along it.`, 7);
  B.enemy('drone', [-14, 9, -232], { color: YELLOW, range: 20 });

  // ================================================================ THE GREAT HOLLOW (shell)
  // A sinkhole open to the sky with a sludge lake at the bottom; it widens north of z -235 (x ±60) and runs
  // to z -340. The Great Tree stands in the middle.
  const HOL = { x: 60, zS: -235, zN: -340, lake: -28.4 };
  cliff(-30, -31, -235, 30, -29, -214);
  W.box(-30, -29, -235, 30, -28.4, -214, 'acid', zone, { hazard: 'acid' });
  cliff(-60, -31, -340, 60, -29, -235);
  W.box(-60, -29, -340, 60, -28.4, -235, 'acid', zone, { hazard: 'acid' });
  cliff(-60.5, -31, -235.5, -30, 14, -235);
  cliff(30, -31, -235.5, 60.5, 14, -235);
  // west wall (top 20), with the greenhouse tunnel (z -281) and the canopy door (z -329)
  cliff(-60.5, -31, -279.5, -60, 20, -235.5);
  cliff(-60.5, -31, -282.5, -60, -25, -279.5);
  cliff(-60.5, -21.8, -282.5, -60, 20, -279.5);
  cliff(-60.5, -31, -327.5, -60, 20, -282.5);
  cliff(-60.5, -31, -330.5, -60, 14, -327.5);
  cliff(-60.5, 17.2, -330.5, -60, 20, -327.5);
  cliff(-60.5, -31, -340.5, -60, 20, -330.5);
  // north wall (top 20)
  cliff(-60.5, -31, -340.5, 60.5, 20, -340);
  // east wall (top 14), cut for the arena's vestibule (z -272..-268) and the bridge home (z -241..-237)
  cliff(60, -31, -340, 60.5, 14, -272);
  cliff(60, -31, -272, 60.5, 11, -268);
  cliff(60, 15.7, -272, 60.5, 14.5, -268);
  cliff(60, -31, -268, 60.5, 14, -241);
  cliff(60, -31, -241, 60.5, 11, -237);
  cliff(60, -31, -237, 60.5, 14, -235.5);
  for (const [x, z] of [[-42, -337], [37.5, -337], [-57, -260], [57, -318]]) mist(x, -27.6, z, 14, 12);
  mist(-35, -27.8, -290, 40, 80);
  mist(35, -27.8, -290, 40, 80);
  mist(0, -27.6, -224, 50, 20);
  fall(-44, -339.9, -40, -339.7, HOL.lake, 20);
  fall(36, -339.9, 39, -339.7, HOL.lake, 20);
  fall(59.7, -322, 59.9, -318, HOL.lake, 14);
  fall(-59.9, -258, -59.7, -254, HOL.lake, 20);
  vines(-29.95, -234, -29.9, -215, 14, 20, 14);
  vines(29.9, -234, 29.95, -215, 14, 20, 14);
  vines(-59.95, -338, -59.9, -237, 20, 40, 16);
  vines(-58, -339.95, 58, -339.9, 20, 46, 16);
  vines(59.9, -338, 59.95, -237, 14, 30, 14);
  // strata, moss and fungus shelves break up the walls (decoration only)
  const strata = (axis, c, s, a1, a2, n, top = 12) => {
    for (let i = 0; i < n; i++) {
      const u = R(a1, a2), w = R(2, 7), y = R(-26, top), h = R(0.4, 1.6), d = R(0.3, 1.2) * s;
      if (axis === 'x') {
        cliff(c, y, u, c + d, y + h, u + w, false);
        W.deco(Math.min(c, c + d * 1.05), y + h, u, Math.max(c, c + d * 1.05), y + h + 0.12, u + w, 'grass', zone);
      } else {
        cliff(u, y, c, u + w, y + h, c + d, false);
        W.deco(u, y + h, Math.min(c, c + d * 1.05), u + w, y + h + 0.12, Math.max(c, c + d * 1.05), 'grass', zone);
      }
    }
  };
  strata('x', -30, 1, -234, -216, 7);
  strata('x', 30, -1, -234, -216, 7);
  strata('x', -60, 1, -338, -237, 18, 16);
  strata('x', 60, -1, -338, -237, 16);
  strata('z', -340, 1, -58, 58, 26, 16);
  strata('z', -235.5, -1, 31, 59, 6);
  strata('z', -235.5, -1, -59, -31, 6);

  // ================================================================ P2 · THE HOLLOW DESCENT (west side)
  stone(-30, -252, -20, -246, 3, -10);
  cp([-25, 3, -249], WEST, [8, 3, 5]);
  area([-30, 3, -252], [-20, 7, -246], MOOD);
  glowPatch(-29.5, -251.5, -20.5, -246.5, 3, 8);
  stone(-38, -252, -32, -246, 0, -8);
  // the walkway west: its middle is a trapdoor over a spike pit (sprint or jump it)
  bough(-50, -250.5, -46, -247.5, 0, 0.6);
  bough(-42, -250.5, -38, -247.5, 0, 0.6);
  B.trapdoor({ min: [-46, -0.5, -250.5], max: [-42, 0, -247.5], delay: 0.4, respawn: 3, spikes: -5, zone });
  bark(-46.5, -6, -251, -41.5, -5, -247); // the pit floor under it
  bough(-58, -253, -50, -245, 0, 1.2);
  say([-38, 0, -252], [-32, 3, -246], 'The walkway sags in the middle. <b>Don\'t dawdle on it.</b>', 4);
  // red/yellow timed phase stones step down east over the lake: shoot both orbs, then go
  const phaseA = [], phaseB = [];
  for (const [i, x1, z1, top] of [[0, -55, -260, -2.5], [1, -49, -264, -5], [2, -43, -268, -7.5], [3, -37, -272, -10]]) {
    const o = { min: [x1, top - 0.5, z1], max: [x1 + 3, top, z1 + 3], color: i % 2 ? YELLOW : RED, zone };
    (i % 2 ? phaseB : phaseA).push(B.phasePlatform(o));
  }
  sw({ pos: [-47, 1.5, -257], style: 'orb', color: RED, mode: 'timed', time: 7, links: phaseA, size: 1.3 });
  sw({ pos: [-41, -1.5, -262.5], style: 'orb', color: YELLOW, mode: 'timed', time: 7, links: phaseB, size: 1.3 });
  say([-58, 0, -253], [-50, 3, -245], `Each orb holds its stones for a few seconds: ${R_('red')} for one set, ${Y_('yellow')} for the other. Shoot both, then go — hit them again to refill.`, 7);
  stone(-32, -279, -24, -271, -12.5, -20);
  cp([-28, -12.5, -275], WEST, [6, 3, 6]);
  // root steps back down west to the dock
  stone(-38, -282, -35, -279, -16, -20);
  stone(-42, -284, -39, -281, -19.5, -24);
  B.enemy('drone', [-40, 5, -255], { color: RED, range: 22 });
  B.enemy('drone', [-30, -6, -266], { color: YELLOW, range: 22 });
  B.mortar([-50, -25, -287.5], YELLOW);
  // the dock under the west wall
  ground(-60, -290, -44, -272, -25, -31);
  area([-60, -25, -290], [-44, -20, -272], MOOD);
  cp([-52, -25, -281], WEST, [8, 3, 6]);
  glowPatch(-59.5, -289.5, -44.5, -272.5, -25, 24);
  column(-46, -273.5, -25, 4, 1);
  column(-58.5, -288.5, -25, 6, 1);
  guideStrip([[-48, -25, -281], [-60.2, -25, -281]], 0xd2ffb8);
  B.slime([-55, -25, -275], { color: YELLOW, core: RED });
  B.slime([-49, -25, -287], { color: RED, core: YELLOW });
  B.slime([-57, -25, -285], { color: YELLOW, core: RED, size: 0.8 });

  // ================================================================ ARENA · THE GREENHOUSE (x -98..-64, z -263..-299)
  // A glass-roofed growing hall of the bio-lab gone wild: sludge troughs, planters, catwalks reached by pads.
  const GH = { x1: -98, x2: -64, zS: -263, zN: -299, y: -25, h: 14 };
  corridorX({ xStart: -60.5, xEnd: -64, y: -25, zone, cz: -281 });
  cp([-62, -25, -281], WEST, [3, 3, 3]);
  room({ x1: GH.x1, x2: GH.x2, zS: GH.zS, zN: GH.zN, y: GH.y, h: GH.h, zone, floor: false, e: [{ c: -281, w: 3, h: 3.2 }], n: [{ c: -83, w: 3, h: 3.2 }], w: [{ c: -270, w: 2.4, h: 3 }] });
  area([-66, -25, -282.5], [-64, -21, -279.5], MOOD);
  // floor with two sludge troughs across it
  const trough = [[-269.6, -267.6], [-291.4, -289.4]];
  W.box(GH.x1 - 0.5, -26, -299.5, GH.x2 + 0.5, -25, -291.4, 'floor', zone);
  W.box(GH.x1 - 0.5, -26, -289.4, GH.x2 + 0.5, -25, -269.6, 'floor', zone);
  W.box(GH.x1 - 0.5, -26, -267.6, GH.x2 + 0.5, -25, -262.5, 'floor', zone);
  for (const [za, zb] of trough) {
    W.box(GH.x1 - 0.5, -27.5, za, -94, -25, zb, 'floor', zone);
    W.box(-70, -27.5, za, GH.x2 + 0.5, -25, zb, 'floor', zone);
    W.box(-94, -27.5, za, -70, -26.8, zb, 'metal', zone);
    W.box(-94, -26.8, za, -70, -25.5, zb, 'acid', zone, { hazard: 'acid' });
  }
  // the mother planter in the middle, four small planters, catwalks along both long walls
  W.box(-85, -25, -285, -77, -23.8, -277, 'wall', zone);
  W.box(-85.2, -23.8, -285.2, -76.8, -23.6, -276.8, 'grass', zone, { solid: false });
  giantTree(-81, -23.8, -281, { w: 1.6, h: 9, r: 4.2, vineCount: 8, roots: false });
  for (const [x, z] of [[-90, -275], [-72, -275], [-90, -285], [-72, -285], [-81, -294], [-81, -266]]) {
    W.box(x - 1.2, -25, z - 1, x + 1.2, -23.8, z + 1, 'wall', zone);
    glowPatch(x - 1, z - 0.8, x + 1, z + 0.8, -23.8, 4, 0.4);
  }
  for (const [x1, x2] of [[-98, -94], [-68, -64]]) {
    plat(x1, -296, x2, -266, -20.5, zone, 0.5, 'metal');
    for (const z of [-294, -286, -276, -268]) W.box(x1 + 1.6, -25, z - 0.3, x1 + 2.2, -21, z + 0.3, 'metal', zone);
  }
  new JumpPad(W, { pos: [-92, -25, -296.5], power: 16, push: [-3, 0, 0], color: 0x7dff8a });
  new JumpPad(W, { pos: [-70, -25, -296.5], power: 16, push: [3, 0, 0], color: 0x7dff8a });
  // the glass roof's frames and grow lamps
  for (let x = GH.x1 + 4; x < GH.x2; x += 6) W.box(x - 0.15, GH.y + GH.h - 0.6, GH.zN, x + 0.15, GH.y + GH.h, GH.zS, 'metal', zone);
  for (let z = GH.zN + 6; z < GH.zS; z += 6) W.deco(GH.x1, GH.y + GH.h - 0.8, z - 0.1, GH.x2, GH.y + GH.h - 0.7, z + 0.1, GLOW[zone], zone);
  vines(GH.x1, GH.zN, GH.x2, GH.zS, GH.y + GH.h - 0.6, 60, 6);
  glowPatch(-97.5, -298.5, -94.5, -263.5, -25, 20, 0.3);
  glowPatch(-67.5, -298.5, -64.5, -263.5, -25, 20, 0.3);
  lamp(-81, -13.5, -281, 0xc8ffb0, 45, 40);
  B.spiderBot([-83, -11.5, -296], { color: RY, ceiling: true, leash: 10 });
  const greenhouse = B.encounter({
    trigger: [[-95, -25, -297], [-67, -20, -265.5]],
    seals: [
      { min: [-64.6, -25, -282.5], max: [-63.9, -21.8, -279.5] },
      { min: [-84.5, -25, -299.6], max: [-81.5, -21.8, -298.9], color: GREEN, closed: true },
    ],
    title: 'THE GREENHOUSE', sub: 'CONTAINMENT BREACH', color: '#3dff7a', music: 'music_combat', zone, resume: true,
    checkpoint: { pos: [-83, -25, -302], yaw: NORTH },
    waves: [
      [
        { type: 'drone', pos: [-88, -19, -284], color: RED },
        { type: 'drone', pos: [-74, -19, -272], color: YELLOW },
        { type: 'swarm', pos: [-81, -20, -278], color: RY, count: 5, delay: 1.5 },
        { type: 'slime', pos: [-90, -25, -280], color: YELLOW, core: RED, delay: 2 },
        { type: 'slime', pos: [-72, -25, -280], color: RED, core: YELLOW, delay: 2.3 },
      ],
      [
        { type: 'turret', pos: [-90, -20, -298.95], color: YELLOW, mount: [0, 0, 1] },
        { type: 'turret', pos: [-72, -20, -263.05], color: RED, mount: [0, 0, -1], delay: 0.5 },
        { type: 'swarm', pos: [-81, -21, -270], color: RY, count: 6, delay: 2 },
        { type: 'drone', pos: [-81, -18, -290], color: RY, delay: 3 },
        { type: 'spider', pos: [-95, -25, -284], color: RY, delay: 3.5 },
      ],
      { title: 'HEAVIES', enemies: [
        { type: 'warden', pos: [-81, -19.5, -290], shield: YELLOW, core: RED },
        { type: 'brute', pos: [-90, -25, -272], color: RED, delay: 1 },
        { type: 'mortar', pos: [-94.9, -20.5, -281], color: YELLOW, delay: 2 },
      ] },
      [
        { type: 'brute', pos: [-72, -25, -294], color: YELLOW },
        { type: 'warden', pos: [-90, -19.5, -268], shield: RED, core: YELLOW, delay: 0.6 },
        { type: 'mortar', pos: [-67.1, -20.5, -282], color: RED, delay: 1.4 },
        { type: 'turret', pos: [-81, -23.8, -283], colors: RY, delay: 2 },
        { type: 'swarm', pos: [-81, -20, -275], color: RY, count: 8, delay: 3 },
        { type: 'spider', pos: [-67, -25, -270], color: [YELLOW, RED], delay: 3.5 },
        { type: 'slime', pos: [-81, -25, -272], color: YELLOW, core: RED, delay: 4 },
      ],
    ],
  });
  // SECRET — the Seed Bank, behind a blue door in the west wall (come back after Azure)
  new Barrier(W, { min: [-98.6, -25, -271.2], max: [-98, -22, -268.8], color: BLUE, kind: 'door', zone });
  corridorX({ xStart: -98.5, xEnd: -101, y: -25, zone, cz: -270, h: 3 });
  room({ x1: -108, x2: -101, zS: -265.5, zN: -274.5, y: -25, h: 4, zone, e: [{ c: -270, w: 3, h: 3 }], trim: false });
  for (let i = 0; i < 4; i++) W.box(-107.8, -25 + i * 0.95, -274.3, -107, -24.9 + i * 0.95, -265.7, 'metal', zone);
  glowPatch(-107.7, -274, -107.1, -266, -24.1, 14, 0.6);
  W.deco(-107.95, -22.6, -274.3, -107.9, -22.5, -265.7, 'glow3', zone);
  trophy(-104.5, -24, -270);
  secretRoom([-108, -25, -274.5], [-101, -21, -265.5], 'Seed Bank');

  // ================================================================ THE LAB CORRIDOR (interlude)
  corridor({ zStart: -299.5, zEnd: -305, y: -25, zone, cx: -83, w: [{ c: -302.25, w: 2, h: 2.6 }] });
  // AUDIO LOG NOOK (spare): a records alcove off the corridor: [-86.2, -25, -302.25]
  room({ x1: -87.5, x2: -85, zS: -300.75, zN: -303.75, y: -25, h: 2.8, zone, e: [{ c: -302.25, w: 2, h: 2.6 }], trim: false });
  W.box(-87.4, -25, -303.6, -87, -23.4, -300.9, 'metal', zone);
  W.deco(-87.45, -23.9, -303.5, -87.4, -23.8, -301, 'glow3', zone);
  area([-84.5, -25, -304], [-81.5, -21.8, -300.5], MOOD);

  // ================================================================ Z2 · THE SEED VAULT (x -100..-70, z -305..-335)
  const VA = { x1: -100, x2: -70, zS: -305, zN: -335, y: -25, h: 16 };
  room({ x1: VA.x1, x2: VA.x2, zS: VA.zS, zN: VA.zN, y: VA.y, h: VA.h, zone, s: [{ c: -83, w: 3, h: 3.2 }], e: [{ c: -329.5, w: 3, y0: 12, h: 3.2 }] });
  lamp(-85, -11, -322, 0xb8ffd0, 38, 34);
  say([-85, -25, -309], [-81, -21, -305], `The <b>Seed Vault</b>. Shoot the arrows by each ledge to move it a notch — line the four into a <b>staircase</b> up to the balcony.`, 7);
  // 1) the rack: four ledges on the west wall, scrambled
  const rack = B.platformRack({ pos: [-100, -23.6, -308], face: '+x', columns: 4, notches: 6, step: 1, spacing: 3.2, depth: 2, width: 2.4, start: [3, 5, 0, 1], colors: [RED, YELLOW, YELLOW, RED], targetGap: 0.55, zone });
  // 2) the balcony and the north walkway, the core in its glass cage, a mirrored leaf above it
  W.box(-100, -25, -335, -92, -20.5, -320, 'wall', zone);
  W.box(-92, -25, -335, -70, -20.5, -331, 'wall', zone);
  W.box(-86, -25, -331, -80, -20.5, -325, 'wall', zone);
  for (const [x1, z1, x2, z2] of [[-100, -335, -92, -320], [-92, -335, -70, -331], [-86, -331, -80, -325]]) glowEdge(x1, z1, x2, z2, -20.42, GLOW[zone], zone, 0.06);
  W.deco(-99.9, -20.5, -334.9, -70.1, -20.47, -320.1, 'grass', zone);
  const CAGE = { x1: -86, x2: -80, z1: -331, z2: -325, top: -17.1 };
  new Glass(W, { min: [CAGE.x1, -20.5, CAGE.z2 - 0.1], max: [CAGE.x2, CAGE.top, CAGE.z2] });
  new Glass(W, { min: [CAGE.x1 - 0.1, -20.5, CAGE.z1], max: [CAGE.x1, CAGE.top, CAGE.z2] });
  new Glass(W, { min: [CAGE.x2, -20.5, CAGE.z1], max: [CAGE.x2 + 0.1, CAGE.top, CAGE.z2] });
  new Glass(W, { min: [CAGE.x1, -20.5, CAGE.z1 - 0.05], max: [-84.5, CAGE.top, CAGE.z1 + 0.05] });
  new Glass(W, { min: [-81.5, -20.5, CAGE.z1 - 0.05], max: [CAGE.x2, CAGE.top, CAGE.z1 + 0.05] });
  W.box(-84.5, -17.6, CAGE.z1 - 0.05, -81.5, CAGE.top, CAGE.z1 + 0.05, 'metal', zone);
  const cageDoor = new SlidingDoor(W, { min: [-84.5, -20.5, CAGE.z1 - 0.1], max: [-81.5, -17.6, CAGE.z1 + 0.1], color: YELLOW, zone });
  W.deco(CAGE.x1 - 0.1, CAGE.top, CAGE.z1 - 0.1, CAGE.x2 + 0.1, CAGE.top + 0.06, CAGE.z1 + 0.1, GLOW[zone], zone);
  W.deco(CAGE.x1 - 0.1, CAGE.top, CAGE.z2 - 0.1, CAGE.x2 + 0.1, CAGE.top + 0.06, CAGE.z2 + 0.1, GLOW[zone], zone);
  new Mirror(W, { min: [-89, -12.6, -334.5], max: [-77, -12.4, -322.5] });
  bark(-83.3, -12.4, -328.8, -82.7, -9, -328.2, false); // the leaf's stem up into the roof
  for (const [dx, dz] of [[-6, 0], [6, 0], [0, -6], [0, 6]]) W.deco(-83 + dx * 1.02 - 0.15, -12.45, -328.5 + dz * 1.02 - 0.15, -83 + dx * 1.02 + 0.15, -12.35, -328.5 + dz * 1.02 + 0.15, GLOW[zone], zone);
  let cageOpen = false;
  const openCage = () => {
    if (cageOpen) return;
    cageOpen = true;
    cageDoor.open();
    game.hud.message('The cage unlocks.', 2.5);
  };
  const cagePanels = [new TargetPanel(W, { min: [CAGE.x1 + 0.05, -20.5, CAGE.z1 + 0.1], max: [CAGE.x2 - 0.05, -20.38, CAGE.z2 - 0.15], color: YELLOW, face: 'up', onActivate: openCage })];
  cagePanels.forEach((p) => (p.group = cagePanels));
  const core = pedestal(-83, -20.38, -327.5, GREEN, zone);
  say([-100, -20.5, -335], [-92, -16, -320], `The core sits in a glass cage. Glass stops shots — but the <b>mirrored leaf</b> above it doesn't. Bank ${Y_('yellow')} off it onto the cage floor.`, 7);
  // 3) the way out: a green riser you spam up to the chimney door in the east wall
  const riser = B.riser({ min: [-73, -25, -331], max: [-70, -20.5, -328], rise: 7.5, color: GREEN, kick: 1.4, back: 1.4, zone });
  const takeCore = core.onCollect;
  core.onCollect = (pk, pl) => {
    takeCore(pk, pl);
    setTimeout(() => game.hud.message(`${G_('GREEN')} is yours. Stand on the ${G_('green riser')} by the east wall and <b>keep firing at it</b> to climb to the door.`, 7), 600);
  };
  glowPatch(-99.5, -334.5, -92.5, -320.5, -20.5, 10, 0.3);
  cp([-96, -20.5, -327], EAST, [7, 3, 6]); // the balcony: a death after this doesn't send you back down the rack
  vines(VA.x1, VA.zN, VA.x2, VA.zS, VA.y + VA.h, 50, 7);
  W.box(-99.9, -25, -306, -98, -24, -305.1, 'metal', zone);
  B.spiderBot([-74, -25, -310], { color: RY, leash: 12 });

  // ================================================================ THE ROOT CHIMNEY (jump pads through spore membranes)
  // Three pads climb a shaft from y -13 to the canopy at y 14; a green membrane hangs over each one.
  const CH_ = { x1: -69.5, x2: -61.5, z1: -333, z2: -325 };
  cliff(-70, -14, CH_.z1 - 0.5, -60.5, -13, CH_.z2 + 0.5); // floor
  cliff(-70, -13, CH_.z1 - 0.5, -60.5, 21.5, CH_.z1); // north wall
  cliff(-70, -13, CH_.z2, -60.5, 21.5, CH_.z2 + 0.5); // south wall
  cliff(-69.5, -9.8, -331, -69.5 + 0.001, -9, -328, false);
  cliff(-61.5, -13, CH_.z1, -60.5, 14, CH_.z2); // east wall, with the canopy door at y 14
  cliff(-61.5, 14, CH_.z1, -60.5, 21.5, -330.5);
  cliff(-61.5, 14, -327.5, -60.5, 21.5, CH_.z2);
  cliff(-61.5, 17.2, -330.5, -60.5, 21.5, -327.5);
  cliff(-70, -9, CH_.z1, -69.5, 21.5, CH_.z2); // west wall above the vault's roof
  cliff(-70, 21, CH_.z1 - 0.5, -60.5, 21.5, CH_.z2 + 0.5); // lid
  bough(-65, CH_.z1, -61.5, CH_.z2, -4, 1);
  bough(-69.5, CH_.z1, -66, CH_.z2, 5, 1);
  bough(-65, CH_.z1, -61.5, CH_.z2, 14, 1);
  // (sized so a launch from anywhere on a pad clears the ledge above's edge and lands on it)
  // (pads alternate z, so you never land on the next pad before you've burst its membrane)
  for (const [x, y, z, dx] of [[-68.3, -13, -331, 3.3], [-62.6, -4, -327, -3.3], [-68.3, 5, -331, 3.3]]) new JumpPad(W, { pos: [x, y, z], power: 24, push: [dx, 0, 0], color: 0x7dff8a });
  for (const [x1, x2, y] of [[-69.5, -65.3, -7], [-65, -61.5, 2], [-69.5, -65.3, 11]]) new Barrier(W, { min: [x1, y, CH_.z1], max: [x2, y + 0.35, CH_.z2], color: GREEN, kind: 'wall', regen: 8, zone });
  vines(CH_.x1, CH_.z1, CH_.x2, CH_.z2, 21, 26, 10);
  glowPatch(-69, -332.5, -66, -325.5, -13, 8, 0.2);
  say([-70, -13, -331], [-66, -9, -328], `Spore membranes choke the chimney. Burst each one with ${G_('green')} before you ride the pad under it.`, 6);
  area([-69.5, -13, -333], [-61.5, -9, -325], MOOD);

  // ================================================================ P3 · THE CANOPY (y 14 → 26)
  bough(-60, -334, -50, -324, 14, 4);
  cp([-55, 14, -329], EAST, [8, 3, 8]);
  area([-60, 14, -334], [-50, 18, -324], MOOD);
  glowPatch(-59.5, -333.5, -50.5, -324.5, 14, 10);
  // chroma vines: solid only while your blaster is green
  for (const [x1, top] of [[-46.5, 14.5], [-40, 15], [-33.5, 15.5]]) B.chromaPlatform({ min: [x1, top - 0.4, -330.5], max: [x1 + 3, top, -327.5], color: GREEN, zone });
  say([-60, 14, -334], [-50, 18, -324], `${G_('Chroma vines')} hold only while your blaster is ${G_('green')}. Switch away mid-jump and you fall.`, 6);
  B.enemy('drone', [-38, 20.5, -320], { color: YELLOW, range: 24 });
  bough(-27, -333, -21, -325, 16, 2);
  cp([-24, 16, -329], EAST, [5, 3, 6]);
  B.slime([-22.5, 16, -326.5], { color: GREEN, core: RED });
  B.slime([-25.5, 16, -331.5], { color: GREEN, core: YELLOW, size: 0.85 });
  // the crumbling bough (the last stretch only looks sound) over a thorn net
  B.crumble({ min: [-21, 15.5, -330], max: [-16, 16, -328], delay: 0.7, respawn: 4, zone });
  B.crumble({ min: [-16, 15.5, -330], max: [-11, 16, -328], delay: 0.7, respawn: 4, zone });
  B.crumble({ min: [-11, 15.5, -330], max: [-6, 16, -328], delay: 0.25, respawn: 3, disguise: true, zone });
  bark(-17, 10.6, -332, -5, 11.2, -326);
  B.spikes([-17, 11.2, -332], [-5, 11.9, -326], { color: GREEN });
  bough(-6, -332, 2, -322, 16, 2);
  cp([-2, 16, -327], SOUTH, [6, 3, 5]);
  B.enemy('drone', [8, 22, -318], { color: GREEN, range: 22 });
  B.slime([0.5, 16, -323.5], { color: GREEN, core: RED });
  // the phase pair: green builds one stone and dissolves the other, yellow the reverse — switch mid-jump
  const A1 = B.phasePlatform({ min: [-3.5, 16.3, -319], max: [-0.5, 16.8, -316], color: GREEN, zone });
  const B1 = B.phasePlatform({ min: [-3.5, 16.9, -313], max: [-0.5, 17.4, -310], color: YELLOW, zone });
  sw({ pos: [-6.5, 19.5, -317.5], style: 'orb', color: GREEN, mode: 'pulse', size: 1.3, links: [{ activate: () => (A1.set(true), B1.set(false)) }] });
  sw({ pos: [3, 20.5, -311.5], style: 'orb', color: YELLOW, mode: 'pulse', size: 1.3, links: [{ activate: () => (B1.set(true), A1.set(false)) }] });
  say([-6, 16, -332], [2, 19, -322], `${G_('Green')} builds the near stone, ${Y_('yellow')} the far one — but each dissolves the other. Shoot yellow <b>in mid-air</b>.`, 7);
  bough(-4, -307, 0, -304, 18, 1.5);
  new JumpPad(W, { pos: [-2, 18, -305.5], power: 23, push: [0, 0, 4.5], color: 0x7dff8a });

  // ================================================================ THE GREAT TREE and C2 · THE CROWN NEST (y 26)
  const TR = { x1: -7.5, x2: 7.5, z1: -293.5, z2: -278.5 };
  bark(TR.x1, -29, TR.z1, TR.x2, 26, TR.z2);
  bark(TR.x1, 26, TR.z1, TR.x2, 30.5, TR.z1 + 1.5); // the heartwood's walls (a hollow at deck level)
  bark(TR.x1, 26, TR.z2 - 1.5, TR.x2, 30.5, TR.z2);
  bark(TR.x2 - 1.5, 26, TR.z1 + 1.5, TR.x2, 30.5, TR.z2 - 1.5);
  bark(TR.x1, 26, TR.z1 + 1.5, TR.x1 + 1.5, 30.5, -287);
  bark(TR.x1, 26, -284, TR.x1 + 1.5, 30.5, TR.z2 - 1.5);
  bark(TR.x1, 29.2, -287, TR.x1 + 1.5, 30.5, -284);
  bark(TR.x1, 30.5, TR.z1, TR.x2, 44, TR.z2);
  for (const [x1, z1, x2, z2] of [[-7.9, -282, -7.5, -280.5], [-7.9, -291, -7.5, -289.5], [7.5, -286, 7.9, -284.5], [7.5, -292, 7.9, -291], [-5, -278.5, -3.8, -278.1], [3, -294, 4.2, -293.5]]) bark(x1, -29, z1, x2, 44, z2);
  W.deco(-7.6, 6, -293.6, 7.6, 7.2, -278.4, 'grass', zone);
  W.deco(-7.6, 36, -293.6, 7.6, 37, -278.4, 'grass', zone);
  vines(-7.6, -293.7, 7.6, -293.6, 26, 14, 20);
  vines(-7.6, -278.4, 7.6, -278.3, 26, 14, 20);
  canopy(0, 48, -286, 13, 24);
  canopy(-14, 43, -276, 8, 10);
  canopy(13, 45, -298, 9, 10);
  canopy(-12, 46, -300, 7, 8);
  canopy(12, 41, -274, 7, 8);
  bark(-14, 40, -277, 0, 41.5, -275.5, false);
  bark(0, 41, -299, 13, 42.5, -297.5, false);
  ground(-14, -300, 14, -271, -25, -31); // the root island at the tree's foot, far below
  glowPatch(-13.5, -299.5, 13.5, -271.5, -25, 30);
  // the deck: a ring of boughs round the trunk, a low rail with gaps (north: the pad lands; east: the drop;
  // south: a hidden nest below)
  bough(-14, -301, 14, TR.z1, 26, 1.2);
  bough(-14, TR.z2, 14, -271, 26, 1.2);
  bough(-14, TR.z1, TR.x1, TR.z2, 26, 1.2);
  bough(TR.x2, TR.z1, 14, TR.z2, 26, 1.2);
  const rail = (x1, z1, x2, z2) => bark(x1, 26, z1, x2, 26.7, z2);
  rail(-14, -301, -5.5, -300.6);
  rail(1.5, -301, 14, -300.6);
  rail(-14, -271.4, -3, -271);
  rail(3, -271.4, 14, -271);
  rail(-14, -300.6, -13.6, -271.4);
  rail(13.6, -295, 14, -271.4);
  area([-14, 26, -301], [14, 30, -271], MOOD);
  cp([-2, 26, -298.5], SOUTH, [5, 3, 3]);
  lamp(0, 33, -286, 0xe8ffb0, 36, 34);
  glowPatch(-13.5, -300.5, 13.5, -294, 26, 14);
  glowPatch(-13.5, -278, 13.5, -271.5, 26, 14);
  const crownFight = B.encounter({
    trigger: [[-13.5, 26, -300.5], [13.5, 30, -271.5]],
    seals: [{ min: [13.6, 26, -301], max: [14.2, 29.4, -295], color: GREEN, closed: true }],
    title: 'THE CROWN NEST', sub: 'THE CANOPY STIRS', color: '#3dff7a', music: 'music_combat', zone, resume: true,
    checkpoint: { pos: [10, 26, -298], yaw: EAST },
    waves: [
      [
        { type: 'drone', pos: [-10, 31, -297], color: GREEN },
        { type: 'drone', pos: [10, 31, -275], color: [GREEN, YELLOW] },
        { type: 'swarm', pos: [0, 30, -298], color: [GREEN, RED], count: 6, delay: 1.5 },
      ],
      [
        { type: 'warden', pos: [11, 30, -286], shield: GREEN, core: YELLOW },
        { type: 'turret', pos: [0, 28.2, -293.55], color: GREEN, mount: [0, 0, -1], delay: 0.6 },
        { type: 'mortar', pos: [-11, 26, -274], color: RED, delay: 1.4 },
        { type: 'swarm', pos: [-11, 30, -286], color: RYG, count: 6, delay: 2.5 },
        { type: 'spider', pos: [10, 26, -274], color: [GREEN, RED], delay: 3 },
      ],
      { title: 'FINAL WAVE', enemies: [
        { type: 'warden', pos: [-11, 30, -296], shield: RED, core: GREEN },
        { type: 'drone', pos: [10, 32, -290], color: GREEN, delay: 0.5 },
        { type: 'drone', pos: [-10, 32, -276], color: GREEN, delay: 0.9 },
        { type: 'turret', pos: [0, 28.2, -278.45], colors: [GREEN, RED], mount: [0, 0, 1], delay: 1.2 },
        { type: 'swarm', pos: [0, 30, -274], color: [GREEN, YELLOW], count: 8, delay: 2.5 },
        { type: 'slime', pos: [-10, 26, -298], color: GREEN, core: RED, delay: 3 },
        { type: 'slime', pos: [10, 26, -296], color: GREEN, core: YELLOW, delay: 3.3 },
      ] },
    ],
  });
  // SECRET — the Heartwood: a hollow inside the trunk at deck level, behind a green seal of living wood
  new Barrier(W, { min: [TR.x1 - 0.1, 26, -287], max: [TR.x1 + 0.4, 29.2, -284], color: GREEN, kind: 'door', zone });
  trophy(0, 27, -286);
  glowPatch(-5.8, -291.8, 5.8, -280.2, 26, 18, 0.5);
  W.deco(-5.9, 26.01, -291.9, 5.9, 26.04, -280.1, 'grass', zone);
  secretRoom([-6, 26, -292], [6, 30, -280], 'Heartwood');
  // the hidden nest under the deck's south edge (drop through the gap in the rail; a pad takes you back up).
  // AUDIO LOG NOOK (09 "Something Follows"): [-2.4, 21, -268.4]
  bough(-4.5, -270.6, 4.5, -265.5, 21, 0.8);
  bark(-0.5, 21, -271, 0.5, 25, -270.4); // a stem up to the deck
  for (let i = 0; i < 12; i++) { const a = (i / 12) * PI * 2; bark(Math.cos(a) * 3.6 - 0.25, 21, -268 + Math.sin(a) * 2 - 0.25, Math.cos(a) * 3.6 + 0.25, 21.5, -268 + Math.sin(a) * 2 + 0.25, false); }
  new JumpPad(W, { pos: [2.4, 21, -268.2], power: 18, push: [0, 0, -4.5], color: 0x7dff8a });
  glowPatch(-4, -270, -1, -266, 21, 6, 0.5);
  canopy(0, 20, -268, 4.5, 4);

  // ================================================================ THE SPIKE DROP (y 26 → 12)
  const SD = { x1: 14, x2: 20, z1: -301, z2: -295 };
  shieldedShaft({ x1: SD.x1, x2: SD.x2, z1: SD.z1, z2: SD.z2, floor: 12, capY: 26, zone, cap: { x1: 12, x2: SD.x2, z1: SD.z1, z2: SD.z2 }, layers: [{ color: GREEN }, { color: YELLOW }, { color: RED }] });
  bark(SD.x1 - 0.6, 12, SD.z1 - 0.6, SD.x2 + 0.6, 31, SD.z1); // north
  bark(SD.x1 - 0.6, 12, SD.z2, SD.x2 + 0.6, 31, SD.z2 + 0.6); // south
  bark(SD.x2, 14, SD.z1, SD.x2 + 0.6, 31, SD.z2); // east, the way out at the bottom
  bark(SD.x2, 12, SD.z1, SD.x2 + 0.6, 14, -299.5);
  bark(SD.x2, 12, -296.5, SD.x2 + 0.6, 14, SD.z2);
  bark(SD.x1 - 0.6, 12, SD.z1, SD.x1, 24.8, SD.z2); // west, under the deck
  bark(SD.x1, 11, SD.z1, SD.x2 + 0.6, 12, SD.z2); // floor
  blocker([SD.x1 - 0.6, 31, SD.z1 - 0.6], [SD.x2 + 0.6, 34, SD.z2 + 0.6]);
  vines(SD.x1 - 0.6, SD.z1 - 0.65, SD.x2 + 0.6, SD.z1 - 0.6, 31, 8, 6);
  say([8, 26, -301], [14, 30, -295], `Drop through each film, then fire through its open end: ${G_('GREEN')} · ${Y_('YELLOW')} · ${R_('RED')}`, 7);

  // ================================================================ Z3 · THE SLUICE (sinker race, green raft, rotor gates)
  // A covered walkway from the drop's foot to the sluice house. Its door is a green sinker: keep it shot down
  // as you run at it (a turret in the roof would rather you didn't).
  corridorX({ xStart: SD.x2 + 0.6, xEnd: 39.4, y: 12, zone, cz: -298 });
  cp([22.5, 12, -298], EAST, [3, 3, 3]);
  area([21, 12, -299.5], [24, 15, -296.5], MOOD);
  B.turret([31, 15.2, -298], RED, { mount: 'ceiling' });
  for (const x of [26, 34]) bark(x - 0.8, -29, -299, x + 0.8, 11, -297);
  // the sinker sits in a slot in the sluice house's west wall
  bark(39.4, 6, -299.5, 40, 8.6, -296.5);
  bark(38.9, 6, -300, 39.4, 12, -296);
  bark(40, 6, -300, 40.5, 12, -296);
  const sinker = B.sinker({ min: [39.4, 12, -299.5], max: [40, 15.2, -296.5], color: GREEN, kick: 1.3, back: 1.5, hold: 0.4, zone });
  say([20.5, 12, -299.5], [24, 15, -296.5], `The sluice door is a ${G_('green sinker')}: it only stays down while you shoot it. <b>Keep firing as you run.</b>`, 6);
  // the house: north dock, a sludge channel with the raft lane and two hinged rotor gates, south dock
  const SL = { x1: 40, x2: 58, zN: -300, zS: -276, y: 12 };
  room({ x1: SL.x1, x2: SL.x2, zS: SL.zS, zN: SL.zN, y: SL.y, h: 7, zone, floor: false, w: [{ c: -298, w: 3, h: 3.2 }], s: [{ c: 46.5, w: 3, h: 3.2 }] });
  bark(SL.x1 - 0.5, 11, SL.zN - 0.5, SL.x2 + 0.5, 12, -296); // north dock
  bark(SL.x1 - 0.5, 11, -282, SL.x2 + 0.5, 12, SL.zS + 0.5); // south dock
  bark(SL.x1, 8, -296, SL.x2, 9, -282); // channel bed
  W.box(SL.x1, 9, -296, SL.x2, 11.4, -282, 'acid', zone, { hazard: 'acid' });
  for (const [x, z] of [[42, -298], [56, -298], [42, -279], [56, -279], [49, -289]]) bark(x - 0.9, -29, z - 0.9, x + 0.9, 8, z + 0.9);
  const raft2 = B.shotMover({ min: [47.5, 11.4, -296], max: [50.5, 12, -293], path: [0, 0, 11], color: GREEN, mode: 'push', back: 1.1, kick: 1.1, zone });
  const gateA = B.shotRotor({ pivot: [44, 12, -291], parts: [[0, 0, -0.3, 7.5, 3.6, 0.3]], axis: 'y', dir: 1, color: YELLOW, zone, kind: 'wall' });
  const gateB = B.shotRotor({ pivot: [44, 12, -287], parts: [[0, 0, -0.3, 7.5, 3.6, 0.3]], axis: 'y', dir: -1, color: RED, zone, kind: 'wall' });
  B.turret([57.95, 15.5, -289], YELLOW, { mount: [-1, 0, 0] });
  B.enemy('drone', [49, 17, -280], { color: RED, range: 20 });
  lamp(49, 18, -288, 0x9dffb0, 30, 28);
  B.spiderBot([56, 18.8, -279], { color: [GREEN, RED], ceiling: true, leash: 9 });
  B.slime([52, 12, -278.5], { color: GREEN, core: YELLOW });
  B.slime([42.5, 12, -279], { color: GREEN, core: RED, size: 0.85 });
  cp([44, 12, -298], EAST, [5, 3, 3]);
  cp([46.5, 12, -279], SOUTH, [6, 3, 4]);
  say([40, 12, -300], [58, 15, -296], `Ride the raft: keep it moving with ${G_('green')}. Swing the gates out of the lane with their own colors — the raft won't push you into one.`, 7);
  glowPatch(40.5, -299.5, 57.5, -296.5, 12, 10);
  glowPatch(40.5, -281.5, 57.5, -276.5, 12, 10);
  vines(SL.x1, SL.zN, SL.x2, SL.zS, 19, 30, 4);
  // to the arena's vestibule
  corridor({ zStart: -276, zEnd: -271.5, y: 12, zone, cx: 46.5 });
  corridorX({ xStart: 45, xEnd: 52.8, y: 12, zone, cz: -270, n: [{ c: 46.5, w: 3, h: 3.2 }] });
  W.box(44.5, 12, -271.5, 45, 15.2, -268.5, 'wall', zone);
  bark(48, -29, -271, 50, 11, -269);

  // ================================================================ THE THORNMAW'S COURTYARD (verdantArena.js)
  const arena = buildVerdantArena(B, { center: [84, 12, -270], size: 44, entry: 'w', exit: 's', colors: RYG, reactorColor: GREEN, world: 'verdant' });
  bark(54, -29, -271, 56, 11, -269); // a pier under the vestibule
  area([52.8, 12, -271.5], [55, 15, -268.5], MOOD);

  // ================================================================ THE WAY HOME (bridge + aqueduct, y 12)
  // From the courtyard's south gate west across the Hollow, then south along the aqueduct over the court to
  // the Hub's north balcony port. Low parapets with invisible walls over them.
  const deck = (x1, z1, x2, z2) => {
    W.box(x1, 11, z1, x2, 12, z2, 'floor', zone);
    W.deco(x1, 11.7, z1 - 0.05, x2, 11.8, z1, GLOW[zone], zone);
  };
  deck(82.5, -246.8, 85.5, -237.5);
  deck(8.5, -240.5, 85.5, -237.5);
  W.box(82, 12, -246.8, 82.5, 13, -240.5, 'wall', zone);
  W.box(85.5, 12, -246.8, 86, 13, -237, 'wall', zone);
  W.box(8, 12, -241, 82.5, 13, -240.5, 'wall', zone);
  W.box(11.5, 12, -237.5, 85.5, 13, -237, 'wall', zone);
  blocker([82, 12, -246.8], [82.5, 40, -240.5]);
  blocker([85.5, 12, -246.8], [86, 40, -237]);
  blocker([8, 12, -241], [82.5, 40, -240.5]);
  blocker([11.5, 12, -237.5], [85.5, 40, -237]);
  blocker([8, 12, -240.5], [8.5, 40, -158.5]);
  blocker([11.5, 12, -237.5], [12, 40, -158.5]);
  for (const x of [20, 34, 48]) bark(x - 1, -29, -240, x + 1, 11, -238);
  // the aqueduct south
  W.box(8.5, 11, -237.5, 11.5, 12, -158.5, 'floor', zone);
  W.deco(8.45, 11.7, -237.5, 8.5, 11.8, -158.5, GLOW[zone], zone);
  W.deco(11.5, 11.7, -237.5, 11.55, 11.8, -158.5, GLOW[zone], zone);
  for (let z = -160; z > -236; z -= R(3, 5)) {
    const l = Math.min(R(1.5, 3.5), z + 237);
    W.box(8.2, 12, z - l, 8.5, 12 + R(0.6, 0.95), z, 'wall', zone);
    W.box(11.5, 12, z - l * R(0.6, 1), 11.8, 12 + R(0.6, 0.95), z, 'wall', zone);
  }
  vines(8.25, -236, 8.3, -159, 11, 40, 5);
  vines(11.7, -236, 11.75, -159, 11, 40, 5);
  for (const [zc, base] of [[-166, 4], [-187, 1], [-206.5, 4.5], [-222, -29]]) {
    W.box(9, base, zc - 1, 11, 11, zc + 1, 'wall', zone);
    W.box(8.4, 10.3, zc - 1.4, 11.6, 11, zc + 1.4, 'metal', zone);
    W.deco(8.98, 9.6, zc - 1.02, 11.02, 9.68, zc + 1.02, GLOW[zone], zone);
    vines(8.95, zc - 1, 9, zc + 1, 10.3, 3, 6);
  }
  const gateArch = (z, color) => {
    W.box(7.6, 11, z - 0.45, 8.4, 16.2, z + 0.45, 'wall', zone);
    W.box(11.6, 11, z - 0.45, 12.4, 16.2, z + 0.45, 'wall', zone);
    W.box(7.4, 15.2, z - 0.55, 12.6, 16.2, z + 0.55, 'metal', zone);
    W.box(7.3, 16.2, z - 0.65, 12.7, 16.45, z + 0.65, 'grass', zone);
    new Barrier(W, { min: [8.4, 12, z - 0.2], max: [11.6, 15.2, z + 0.2], color, kind: 'wall', zone });
  };
  gateArch(-226, GREEN);
  gateArch(-196, YELLOW);
  gateArch(-176, RED);
  area([8.5, 12, -240.5], [11.5, 15, -236], MOOD);
  // the gatehouse into the Hub's north balcony port (x 10, y 12): one-way, it opens as you come home
  corridor({ zStart: -148.5, zEnd: -158.5, y: 12, zone, cx: 10 });
  vines(8.6, -158.4, 11.4, -149, 15.2, 8, 1.2);
  W.box(7.5, 15.7, -158.9, 12.5, 16, -148.5, 'grass', zone);
  const homeDoor = new SlidingDoor(W, { min: [8.5, 12, -155.2], max: [11.5, 15.2, -154.8], color: GREEN, zone });
  W.trigger([8.5, 12, -175], [11.5, 15, -156], () => homeDoor.open());
  W.trigger([8.5, 12, -154.8], [11.5, 15, -148.5], () => {
    if (homeDoor.openT >= 0) return;
    game.hud.message('Sealed from this side: this is <b>Verdant\'s way out</b>. Its entrance is the <b style="color:#ffd23a">yellow gate</b> on the Nexus floor below.', 6);
  }, { once: false });

  // ================================================================ BACKDROP: the jungle rim around the Hollow
  // (the side wings and the north are solid jungle at the rim's height: nobody walks up here)
  ground(-110, -380, -60.5, -235, 20, 16);
  ground(-60.5, -380, 60.5, -340.5, 20, 16);
  ground(60.5, -380, 110, -293.5, 12, 6);
  ground(60.5, -246.5, 110, -241, 12, 6);
  ground(60.5, -237, 110, -235, 12, 6);
  ground(107.5, -293.5, 110, -246.5, 12, 6);
  for (const [x, z, h, r] of [[-75, -250, 30, 10], [-88, -345, 34, 12], [-68, -365, 28, 10], [-100, -300, 30, 9], [-30, -352, 30, 11], [28, -358, 33, 12], [0, -372, 36, 13], [-50, -360, 26, 8], [48, -350, 27, 9], [80, -320, 30, 11], [100, -350, 32, 12], [72, -365, 28, 10]]) {
    giantTree(x, x > 60 ? 12 : 20, z, { w: 3 + r * 0.15, h, r, vineCount: 6 });
  }
  for (let i = 0; i < 46; i++) {
    const side = rand();
    const x = side < 0.4 ? R(-108, -62) : side < 0.7 ? R(-58, 58) : R(62, 108), z = side >= 0.4 && side < 0.7 ? R(-378, -343) : R(-378, x > 0 ? -296 : -237);
    leafBlob(x, x > 60 ? R(13, 16) : R(21, 24), z, R(2, 5), rand() < 0.4);
  }
  // keep everyone off the rim (the walls' tops and the jungle beyond)
  blocker([-60.5, 20, -340.5], [-60, 50, -235.5]);
  blocker([-60.5, 20, -340.5], [60.5, 50, -340]);
  blocker([-60.5, 14, -235.5], [-30, 50, -235]);
  blocker([30, 14, -235.5], [60.5, 50, -235]);
  blocker([60, 14, -340], [60.5, 50, -272]);
  blocker([60, 14, -268], [60.5, 50, -241]);
  // light shafts through the canopy
  shaft(-6, 42, -184, 40, 4, 0.18);
  shaft(-20, 38, -197, 36, 3.5, 0.22);
  shaft(4, 34, -164, 26, 2.5, 0.12);
  shaft(-22, 52, -262, 76, 6, 0.16);
  shaft(22, 52, -300, 76, 7, 0.2);
  shaft(-4, 54, -240, 80, 5, 0.12);
  shaft(30, 50, -262, 70, 4, 0.18);
  shaft(-34, 50, -320, 70, 5, 0.2);

  // drifting spores catch the light everywhere
  const spores = (() => {
    const pts = [];
    for (let i = 0; i < 900; i++) {
      if (i < 350) pts.push(R(-28, 28), R(2, 20), R(-205, -161));
      else {
        const z = R(-338, -214);
        pts.push(z < -237 ? R(-58, 58) : R(-28, 28), R(-27, 34), z);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const m = new THREE.PointsMaterial({ color: new THREE.Color(0xd8ff9a).multiplyScalar(1.4), size: 0.14, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    const p = new THREE.Points(geo, m);
    p.frustumCulled = false;
    W.scene.add(p);
    return { p, m };
  })();
  // fireflies: the jungle's ambient life, wandering in little clouds near the paths
  const flies = (() => {
    const spots = [[25, 5.5, -164, 5], [-10, 5.5, -168, 6], [-22, 6.5, -190, 5], [3, 7, -188, 4], [0, 6, -209, 8], [-52, -23.5, -281, 6], [-81, -22, -281, 9], [-83, -18, -320, 8], [-55, 16, -329, 4], [0, 28, -286, 10], [0, 22.5, -268, 3], [49, 14, -279, 5]];
    const N = spots.length * 22, base = new Float32Array(N * 3), pos = new Float32Array(N * 3), ph = new Float32Array(N);
    let k = 0;
    for (const [x, y, z, r] of spots)
      for (let i = 0; i < 22; i++, k++) {
        base.set([x + R(-r, r), y + R(-1.2, 2), z + R(-r, r)], k * 3);
        ph[k] = R(0, 100);
      }
    pos.set(base);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color: new THREE.Color(0xd8ff6a).multiplyScalar(2), size: 0.11, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
    const p = new THREE.Points(geo, m);
    p.frustumCulled = false;
    W.scene.add(p);
    let t = 0;
    const state = { m, alive: 1, fall: 0 };
    W.add({
      update(dt, player) {
        if (player.pos.z > -148.5 || state.alive <= 0) return;
        t += dt;
        for (let i = 0; i < N; i++) {
          const q = ph[i];
          pos[i * 3] = base[i * 3] + Math.sin(t * 0.7 + q) * 0.9;
          pos[i * 3 + 1] = base[i * 3 + 1] + Math.sin(t * 1.1 + q * 1.7) * 0.5 - state.fall;
          pos[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * 0.6 + q * 0.6) * 0.9;
        }
        geo.attributes.position.needsUpdate = true;
        m.opacity = state.alive * (0.75 + 0.25 * Math.sin(t * 9));
      },
    });
    return state;
  })();

  for (const [m, geos] of lists) {
    if (!geos.length) continue;
    const mesh = new THREE.Mesh(mergeGeometries(geos, false), m);
    geos.forEach((g) => g.dispose());
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    if (m === shaftMat || m === mistMat) mesh.renderOrder = 4;
    W.scene.add(mesh);
  }

  // ================================================================ AFTERMATH: the engine is dead
  // Bioluminescence fades out, the sludge goes grey and still, leaves and vines wilt brown, fireflies drop and
  // the spores stop, the jungle's light turns cold. Runs over a few seconds on a live shutdown, at once from a
  // save (onPowerDown replays restored shutdowns, including the save loaded after the level is built).
  const glow2 = mat(GLOW[zone], zone), grass = mat('grass', zone);
  const sludge = [liquidMaterial(zone, true), liquidMaterial(zone, false)];
  const fades = [
    [glow2.color, new THREE.Color(0x26302a)], [capMat.color, new THREE.Color(0x3a4440)], [goldMat.color, new THREE.Color(0x4a4434)],
    [grass.color, new THREE.Color(0x5b4a2e)], [leafMat.color, new THREE.Color(0x4f4426)], [leafLitMat.color, new THREE.Color(0x6b5a32)],
    [stalkMat.color, new THREE.Color(0x3a3a30)], [shaftMat.color, new THREE.Color(0x8fa4b8)], [spores.m.color, new THREE.Color(0x707a80)],
  ].map(([c, to]) => ({ c, from: c.clone(), to }));
  const lightFrom = lights.map((l) => ({ l, i: l.intensity, c: l.color.clone() }));
  const COLD = new THREE.Color(0x8a9cb0);
  let deadK = -1;
  function applyDead(k) {
    for (const f of fades) f.c.copy(f.from).lerp(f.to, k);
    mistMat.opacity = 0.045 * (1 - k);
    shaftMat.opacity = 0.16 - 0.09 * k;
    spores.m.opacity = 0.85 * (1 - k * 0.85);
    rain.opacity = 0.55 * (1 - k * 0.4);
    flies.alive = 1 - k;
    flies.fall = k * 3;
    for (const { l, i, c } of lightFrom) {
      l.intensity = i * (1 - 0.7 * k);
      l.color.copy(c).lerp(COLD, k);
    }
    for (const m of sludge) {
      m.uniforms.uLife.value = 1 - k;
      m.uniforms.uAmp.value = m.userData.amp0 * (1 - 0.88 * k);
    }
  }
  function aftermath(restored) {
    if (deadK >= 0) return;
    deadK = 0;
    // the sludge shader learns to die: its colour drains to a dull grey and its flow freezes where it stood
    for (const m of sludge) {
      m.userData.amp0 = m.uniforms.uAmp.value;
      m.uniforms.uLife = { value: 1 };
      m.uniforms.uFrozen = { value: m.uniforms.uTime.value };
      m.fragmentShader = 'uniform float uLife, uFrozen;\n' + m.fragmentShader
        .replace('float t = uTime;', 'float t = mix(uFrozen, uTime, uLife);')
        .replace('#elif STYLE == 4', '  c = mix(vec3(dot(c, vec3(0.3, 0.55, 0.15))) * vec3(0.32, 0.34, 0.3), c, uLife);\n        #elif STYLE == 4');
      m.needsUpdate = true;
    }
    // no more bubbles popping on Verdant's sludge
    if (W.liquids) W.liquids = W.liquids.filter((L) => L.zone !== zone);
    Object.assign(level.atmospheres.verdant, DEAD_ATMO);
    if (regionOf(game.player.pos) === 'verdant') game.setAtmosphere('verdant', restored);
    if (restored) return (deadK = 1), applyDead(1);
    W.add({
      update(dt) {
        if (deadK >= 1) return;
        deadK = Math.min(1, deadK + dt / 5);
        applyDead(deadK * deadK * (3 - 2 * deadK));
      },
    });
    setTimeout(() => game.hud.message('The jungle goes quiet. The light drains out of it.<br>Take the <b>bridge west</b> and the aqueduct home to the Nexus.', 7), 4500);
  }
  game.onPowerDown((name, { restored }) => name === 'verdant' && aftermath(restored));

  // ================================================================ WAYFINDING
  const GREEN_HEX = 0x3dff7a;
  guideStrip([[-10, 4, -160], [-12, 4, -168], [-19.5, 4, -171.6]], 0xd2ffb8);
  guideStrip([[2, 4.5, -205.5], [-20, 4.5, -209], [-24, 4.5, -212.8]], 0xd2ffb8);
  guideStrip([[-81, -25, -296], [-83, -25, -298.5]], 0xd2ffb8);
  beacon(W, -20, 4.5, -175.5, GREEN_HEX, 6);
  beacon(W, -25, 3, -249, GREEN_HEX, 6);
  beacon(W, -2, 18, -305.5, GREEN_HEX, 5);
  beacon(W, 46.5, 12, -279, GREEN_HEX, 4);
  // carrying green out of the cage: the way on is up
  W.trigger([-92, -20.5, -335], [-70, -16, -331], () => game.blaster.unlocked[GREEN] && riser.u < 0.5 && game.hud.message(`Ride the ${G_('green riser')} up: <b>hold fire on it</b>.`, 4), { once: false });

  // ================================================================ STATE (guide.js) and DEV STARTS
  level.verdant = { raft1, bankFight, arms, phaseA, phaseB, greenhouse, rack, cage: () => cageOpen, riser, A1, B1, crownFight, sinker, raft2, gateA, gateB, arena, homeDoor };
  devStart('verdant', [-10, 4, -151], NORTH, RY);
  devStart('verdant1', [-18, 5, -186.5], EAST, RY); // the moat: island one
  devStart('verdant2', [3.5, 5.6, -186], NORTH, RY); // island two and the raft
  devStart('verdant3', [3.5, 4.5, -205.6], WEST, RY); // the Ruin Bank (ambush)
  devStart('verdant4', [-24, 4.5, -210.5], NORTH, RY); // the root bridge
  devStart('verdant5', [-25, 3, -249], WEST, RY); // the Hollow descent
  devStart('verdant6', [-62, -25, -281], WEST, RY); // the Greenhouse door
  devStart('verdant7', [-83, -25, -302], NORTH, RY); // the Seed Vault
  devStart('verdant8', [-55, 14, -329], EAST, RYG); // the canopy
  devStart('verdant9', [-2, 16, -327], SOUTH, RYG); // the phase pair and the crown pad
  devStart('verdant10', [-2, 26, -298.5], SOUTH, RYG); // the Crown Nest
  devStart('verdant11', [22.5, 12, -298], EAST, RYG); // the sinker race and the sluice
  devStart('verdant12', arena.checkpoint, EAST, RYG); // the Thornmaw
  devStart('verdant13', [80, 12, -239], WEST, RYG); // the way home
}
