// VERDANT — the green world, "EMERALD HOLLOW": an ancient ruin swallowed by jungle north of the Hub.
// The loop (see LAYOUT.md for the region and Hub ports):
//   Hub north port (x -10, y 4, yellow door) → ruined gate (blue-door secret) → ROOT COURT: islands over an
//   acid moat, a kiosk ricochet powers a bridge (crawl-hut secret) → hop down the GREAT HOLLOW, a sinkhole
//   around a giant tree, to the acid lake → the SUNKEN SHRINE (green core; an ambush on the way out) →
//   a green-on-red ricochet opens the tree → lifts and a jump pad up inside the hollow trunk → out along a
//   branch to the red/yellow/green shielded drop → the aqueduct (y 12) back over the court → the Hub's
//   north balcony port (x 10, y 12).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RED, YELLOW, GREEN, BLUE } from '../colors.js';
import { Barrier } from '../entities/barrier.js';
import { Drone } from '../entities/drone.js';
import { MovingPlatform, JumpPad, Checkpoint } from '../entities/misc.js';
import { Mirror, Glass, TargetPanel, SlidingDoor } from '../entities/puzzle.js';
import { boxGeo } from '../materials.js';

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

// ---- wayfinding helpers (playtest pass)
// Pulsing floor chevrons along paths of [x, y, z] points (each segment lies at its start point's y),
// pulses running toward the end of each path. One instanced draw per call; shown while active(player).
function guideTrail(W, hex, paths, active) {
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

// A soft column of light standing on a landing you should head for.
function beacon(W, x, y, z, hex, h = 7, r = 0.8) {
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(0.9), transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r, h, 20, 1, true), m);
  mesh.position.set(x, y + h / 2, z);
  W.scene.add(mesh);
  let t = Math.random() * 6;
  W.add({ update: (dt) => (t += dt, (m.opacity = 0.13 + Math.sin(t * 2.6) * 0.05)) });
  return mesh;
}

export function buildVerdant(B) {
  const { W, game, level, GLOW, wallX, wallZ, room, corridor, plat, pedestal, sideAlcove, shieldedShaft, secretRoom, trophy, hint, zoneTitle, area, light, blocker, devStart } = B;
  const zone = 'green';
  const rand = mulberry32(20261008);
  const R = (a, b) => a + (b - a) * rand();
  const MOOD = { music: 'music_green', ambient: 'amb_jungle', atmosphere: 'verdant' };

  // humid, canopy-filtered daylight: green-grey mist, soft gold sun, no stars
  level.atmospheres.verdant = {
    fog: 0x5d7356, fogNear: 22, fogFar: 185,
    skyTop: [0.03, 0.06, 0.04], skyMid: [0.07, 0.12, 0.07], skyHorizon: [0.12, 0.17, 0.09], aurora: 0.02, stars: 0,
    hemiSky: 0xd6f0b0, hemiGround: 0x18301c, hemiIntensity: 0.8,
    sunColor: 0xffe39a, sunIntensity: 1.6, sunDir: [-0.35, 1, 0.45],
    exposure: 1.0, bloom: 0.55,
  };

  // ---------------------------------------------------------------- organic dressing (custom meshes)
  // Collected here and merged into one mesh per material at the end, so the jungle costs a handful of draws.
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2a6e35, roughness: 0.95, flatShading: true });
  const leafLitMat = new THREE.MeshStandardMaterial({ color: 0x5f9432, roughness: 0.95, flatShading: true });
  const stalkMat = new THREE.MeshBasicMaterial({ color: 0x2c8a5c });
  const capMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x5dffc8).multiplyScalar(1.15) });
  const goldMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd25a).multiplyScalar(1.5) });
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
  // bark: dark furrowed wood with moss flecks, on the trunks (static boxes with their own collision)
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
  // cliff: dark, mossy stratified stone for the sinkhole walls, island flanks and the lake bed
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
  const lists = new Map([[barkMat, []], [cliffMat, []], [leafMat, []], [leafLitMat, []], [stalkMat, []], [capMat, []], [goldMat, []], [shaftMat, []], [mistMat, []]]);
  const put = (m, geo, x, y, z) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    g.translate(x, y, z);
    lists.get(m).push(g);
  };

  function bark(x1, y1, z1, x2, y2, z2) {
    const a = new THREE.Vector3(Math.min(x1, x2), Math.min(y1, y2), Math.min(z1, z2));
    const b = new THREE.Vector3(Math.max(x1, x2), Math.max(y1, y2), Math.max(z1, z2));
    if (b.x - a.x < 0.001 || b.y - a.y < 0.001 || b.z - a.z < 0.001) return;
    put(barkMat, boxGeo(b.x - a.x, b.y - a.y, b.z - a.z, 0.25), (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    W.addSolid(a, b, { static: true, kind: 'rock' });
  }
  function cliff(x1, y1, z1, x2, y2, z2, solid = true) {
    const a = new THREE.Vector3(Math.min(x1, x2), Math.min(y1, y2), Math.min(z1, z2));
    const b = new THREE.Vector3(Math.max(x1, x2), Math.max(y1, y2), Math.max(z1, z2));
    if (b.x - a.x < 0.001 || b.y - a.y < 0.001 || b.z - a.z < 0.001) return;
    put(cliffMat, boxGeo(b.x - a.x, b.y - a.y, b.z - a.z, 0.15), (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    if (solid) W.addSolid(a, b, { static: true, kind: 'rock' });
  }
  const vine = (x, yTop, z, len) => W.deco(x - 0.05, yTop - len, z - 0.05, x + 0.05, yTop, z + 0.05, 'grass', zone);
  // a curtain of vines hanging from an edge running along x (or z) at height yTop
  function vines(x1, z1, x2, z2, yTop, n, maxLen) {
    for (let i = 0; i < n; i++) vine(R(x1, x2), yTop, R(z1, z2), R(maxLen * 0.3, maxLen));
  }
  function leafBlob(x, y, z, r, lit = false) {
    const g = new THREE.IcosahedronGeometry(r, 1);
    g.scale(1, 0.55, 1);
    g.rotateY(R(0, 6));
    put(lit ? leafLitMat : leafMat, g, x, y, z);
  }
  // a canopy: one broad crown plus a ring of smaller lobes, with vines dangling underneath
  function canopy(x, y, z, r, vineCount = 10) {
    leafBlob(x, y, z, r);
    const n = 5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + R(0, 1), d = r * R(0.6, 0.9);
      leafBlob(x + Math.cos(a) * d, y + R(-r * 0.22, r * 0.15), z + Math.sin(a) * d, r * R(0.45, 0.65), i % 2 === 0);
    }
    for (let i = 0; i < vineCount; i++) {
      const a = R(0, Math.PI * 2), d = r * R(0.3, 0.95);
      vine(x + Math.cos(a) * d, y - r * 0.2, z + Math.sin(a) * d, R(3, r * 0.9));
    }
  }
  // giant tree: a square trunk with flared buttress roots, mossy collar and a broad crown
  function giantTree(x, y, z, { w = 3, h = 24, r = 8, vineCount = 10 } = {}) {
    const hw = w / 2;
    bark(x - hw, y - 1, z - hw, x + hw, y + h, z + hw);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const l = w * 0.7, t = w * 0.3, rh = Math.min(h * 0.14, 4);
      if (dx) bark(x + dx * hw, y - 1, z - t / 2, x + dx * (hw + l), y + rh, z + t / 2);
      else bark(x - t / 2, y - 1, z + dz * hw, x + t / 2, y + rh, z + dz * (hw + l));
    }
    W.deco(x - hw - 0.05, y + h * 0.45, z - hw - 0.05, x + hw + 0.05, y + h * 0.45 + 0.6, z + hw + 0.05, 'grass', zone);
    for (let i = 0; i < 6; i++) vine(x + R(-hw, hw) * 1.02, y + h, z + (i % 2 ? hw + 0.06 : -hw - 0.06), R(4, h * 0.6));
    canopy(x, y + h, z, r, vineCount);
  }
  // bioluminescent mushrooms: glowing caps on pale stalks
  function shroom(x, y, z, s = 1) {
    put(stalkMat, new THREE.CylinderGeometry(0.05 * s, 0.08 * s, 0.5 * s, 5), x, y + 0.25 * s, z);
    put(capMat, new THREE.SphereGeometry(0.3 * s, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2), x, y + 0.48 * s, z);
  }
  // glowing golden buds on tall stalks
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
  // god rays: two crossed soft planes hanging from yTop, leaning a little like low sun through leaves
  function shaft(x, yTop, z, len, w, tilt = 0.2) {
    for (const a of [0, Math.PI / 2]) {
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
    g.rotateX(-Math.PI / 2);
    put(mistMat, g, x, y, z);
  }
  const fall = (x1, z1, x2, z2, y1, y2) => W.deco(x1, y1, z1, x2, y2, z2, 'acid', zone); // glowing acid cascade (no collision)

  // ---------------------------------------------------------------- terrain helpers
  // earth: rock with a mossy turf cap (footsteps read as grass). One collision box for both layers, so
  // stepping up onto it from just below the turf line works.
  function ground(x1, z1, x2, z2, top, bottom = top - 5) {
    cliff(x1, bottom, z1, x2, top - 0.25, z2, false);
    W.box(x1, top - 0.25, z1, x2, top, z2, 'grass', zone, { solid: false });
    W.addSolid(new THREE.Vector3(Math.min(x1, x2), bottom, Math.min(z1, z2)), new THREE.Vector3(Math.max(x1, x2), top, Math.max(z1, z2)), { static: true, kind: 'grass' });
  }
  // a stepping stone: earth plus a faint bioluminescent rim so its outline reads mid-jump
  function stone(x1, z1, x2, z2, top, bottom = top - 4) {
    ground(x1, z1, x2, z2, top, bottom);
    const za = Math.min(z1, z2), zb = Math.max(z1, z2), g = GLOW[zone], y1 = top - 0.2, y2 = top - 0.12, o = 0.03;
    W.deco(x1 - o, y1, za - o, x2 + o, y2, za, g, zone);
    W.deco(x1 - o, y1, zb, x2 + o, y2, zb + o, g, zone);
    W.deco(x1 - o, y1, za, x1, y2, zb, g, zone);
    W.deco(x2, y1, za, x2 + o, y2, zb, g, zone);
  }
  // a broken ruin column with a glowing glyph band
  function column(x, z, y, h, w = 1.2) {
    W.box(x - w / 2, y, z - w / 2, x + w / 2, y + h, z + w / 2, 'wall', zone);
    W.box(x - w / 2 - 0.15, y + h - 0.3, z - w / 2 - 0.15, x + w / 2 + 0.15, y + h, z + w / 2 + 0.15, 'metal', zone);
    W.deco(x - w / 2 - 0.02, y + h * 0.4, z - w / 2 - 0.02, x + w / 2 + 0.02, y + h * 0.4 + 0.08, z + w / 2 + 0.02, GLOW[zone], zone);
  }

  // ================================================================ ENTRY GATE (z -148.5 → -158.5)
  // The Hub's yellow door opens into a short ruined gatehouse; a blue door in its west wall hides a reliquary.
  corridor({ zStart: -148.5, zEnd: -158.5, y: 4, zone, cx: -10, w: [{ c: -153.5, w: 2.4, h: 3 }] });
  zoneTitle([-11.5, 4, -152], [-8.5, 7, -149], 'VERDANT', 'EMERALD HOLLOW', '#3dff7a', 'music_green');
  area([-11.5, 4, -152], [-8.5, 7.2, -149], MOOD);
  vines(-11.4, -158.4, -8.6, -149, 7.2, 10, 1.6);
  W.deco(-11.5, 4.01, -158.5, -8.5, 4.06, -155, 'grass', zone); // moss creeping in from the court

  // SECRET — the Verdant Reliquary (blue door: come back after Azure)
  new Barrier(W, { min: [-12, 4, -154.7], max: [-11.5, 7, -152.3], color: BLUE, kind: 'door', zone });
  room({ x1: -18, x2: -12.5, zS: -150.5, zN: -156.5, y: 4, h: 3.5, zone, e: [{ c: -153.5, w: 2.4, h: 3 }], trim: false });
  trophy(-15.5, 5, -153.5);
  W.box(-16.3, 4, -154.3, -14.7, 4.15, -152.7, 'metal', zone);
  W.deco(-17.95, 6.2, -156.45, -17.9, 6.28, -150.55, 'glow3', zone);
  glowPatch(-17.8, -156.3, -16.8, -150.8, 4, 10, 0.4);
  vines(-17.9, -156.4, -12.6, -150.6, 7.5, 12, 2);
  secretRoom([-18, 4, -156.5], [-12.5, 7.5, -150.5], 'Verdant Reliquary');

  // the jungle strip between the Hub and the court: kept under y 14 so the Hub windows look over it
  ground(-30.5, -158.5, 30.5, -148.5, 3.9, -1);
  ground(-30, -158.4, -20, -150, 5.2, 3.8);
  ground(18, -158.4, 30, -151, 6, 3.8);
  ground(-4, -158.4, 6, -153, 4.8, 3.8);
  cliff(8, 3.9, -158.5, 12, 11, -148.5); // the gatehouse plinth under the return corridor
  for (const [x, z, s] of [[-25, -153, 1.2], [24, -154, 1.3], [1, -155.5, 0.9], [-20, -156, 0.8], [15, -152, 0.8]]) {
    bark(x - 0.3 * s, 4, z - 0.3 * s, x + 0.3 * s, 4 + 3 * s, z + 0.3 * s);
    canopy(x, 4 + 3.6 * s, z, 2.6 * s, 3);
  }
  for (let i = 0; i < 14; i++) leafBlob(R(-29, 29), R(4.4, 6), R(-158, -149.5), R(0.8, 1.6), rand() < 0.4);
  glowPatch(-29, -158, -14, -149, 4.6, 18);
  glowPatch(14, -158, 29, -149, 4.8, 18);
  fall(-2.5, -158.45, -1.3, -158.42, 3.9, 10.5); // a trickle down the court wall into the strip
  W.deco(-3, 3.9, -158.4, -0.8, 3.98, -148.6, 'acid', zone);
  mist(0, 4.3, -153.5, 60, 10);

  // ================================================================ ROOT COURT (z -158.5 → -208)
  // Open sky. South terrace → acid moat with islands → north bank on the lip of the Great Hollow.
  // The aqueduct you'll return along crosses overhead at y 12 the whole time.
  wallX(-159, -158.5, -30.5, 30.5, -1, 11, [{ c: -10, w: 3, y0: 4, h: 3.2 }], zone);
  W.box(-30.5, 11, -159.2, 30.5, 11.3, -158.3, 'grass', zone);
  for (let x = -29; x < 28.5; x += 4.5) if (Math.abs(x + 10) > 3 && Math.abs(x - 10) > 2.5) W.box(x, 11, -159, x + 1.6, 11 + R(0.6, 1.8), -158.5, 'wall', zone);
  vines(-30, -159.1, 30, -159.05, 11, 40, 6);
  cliff(-30.5, -1, -208, -30, 14, -159);
  cliff(30, -1, -208, 30.5, 14, -159);
  for (let z = -163; z > -206; z -= 7) {
    W.box(-30.05, 4, z - 0.8, -29.4, 14, z + 0.8, 'wall', zone);
    W.box(29.4, 4, z - 0.8, 30.05, 14, z + 0.8, 'wall', zone);
  }
  vines(-29.95, -206, -29.9, -160, 14, 30, 8);
  vines(29.9, -206, 29.95, -160, 14, 30, 8);

  // south terrace
  ground(-30, -172, 30, -159, 4, -1);
  area([-12, 4, -163], [-8, 8, -158.5], MOOD);
  new Checkpoint(W, game, { pos: [-10, 4, -162], yaw: 0, size: [6, 3, 3] });
  column(-15, -166, 4, 6.5);
  column(-4, -167, 4, 3.2);
  column(-27.5, -162, 4, 8);
  W.box(-8, 4, -170.5, -2.5, 5.1, -169.4, 'wall', zone); // a toppled column segment
  // (crowns sized to stay inside the region and out of the Hub windows' sight line)
  giantTree(-22.5, 4, -167.2, { w: 2.4, h: 20, r: 5 });
  giantTree(20.5, 4, -168.8, { w: 3, h: 24, r: 6.5 });
  glowPatch(-29, -171.5, 29, -159.5, 4, 40);
  hint([-12, 4, -166], [-8, 7, -163], 'The <b>Root Court</b>. Cross the acid by the islands — the old bridge has lost power.', 5);

  // the moat
  cliff(-30, -1, -203, 30, 1, -172);
  W.box(-30, 1, -203, 30, 1.5, -172, 'acid', zone, { hazard: 'acid' });
  mist(-8, 2.2, -186, 44, 30);
  mist(14, 2.6, -190, 30, 22);

  // stepping stone → island one
  stone(-21, -177.5, -18, -174.5, 4.5, 1);
  ground(-27, -192, -14, -180, 5, 1);
  giantTree(-24.5, 5, -182.5, { w: 1.4, h: 9, r: 4, vineCount: 6 });
  glowPatch(-26.5, -191.5, -14.5, -180.5, 5, 22);
  // PUZZLE: the bridge to island two is offline. A kiosk faces you with a glass front;
  // shoot yellow over the glass and its mirror-lined inside carries the shot to the target.
  const bridge = new MovingPlatform(W, { min: [-13.5, 4.6, -187.5], max: [-10.5, 5.2, -184.5], offset: [9, 0, 0], speed: 2.2, active: false, zone });
  {
    const x1 = -20.6, x2 = -17.4, zf = -185.5, zb = -188.5, y = 5, top = 9, gt = 7.6;
    W.box(x1 - 0.2, y, zb - 0.2, x1, top + 0.2, zf, 'wall', zone);
    W.box(x2, y, zb - 0.2, x2 + 0.2, top + 0.2, zf, 'wall', zone);
    W.box(x1 - 0.2, y, zb - 0.2, x2 + 0.2, top + 0.2, zb, 'wall', zone);
    W.box(x1 - 0.2, top, zb - 0.2, x2 + 0.2, top + 0.2, zf, 'metal', zone);
    W.box(x1 - 0.3, top + 0.2, zb - 0.3, x2 + 0.3, top + 0.45, zf + 0.1, 'grass', zone);
    vines(x1 - 0.25, zf + 0.02, x2 + 0.25, zf + 0.06, top + 0.2, 6, 1.2);
    new Glass(W, { min: [x1, y, zf - 0.1], max: [x2, gt, zf] });
    W.deco(x1, gt, zf - 0.15, x2, gt + 0.06, zf + 0.05, GLOW[zone], zone);
    new Mirror(W, { min: [x1, top - 0.15, zb], max: [x2, top, zf - 0.1] });
    new Mirror(W, { min: [x1, y, zb + 0.2], max: [x1 + 0.1, top - 0.15, zf - 0.1] });
    new Mirror(W, { min: [x2 - 0.1, y, zb + 0.2], max: [x2, top - 0.15, zf - 0.1] });
    let on = false;
    const powerBridge = () => {
      if (on) return;
      on = true;
      bridge.active = true;
      game.hud.message('Bridge online!', 2.5);
    };
    const panels = [
      new TargetPanel(W, { min: [x1 + 0.1, y, zb + 0.2], max: [x2 - 0.1, y + 0.12, zf - 0.1], color: YELLOW, face: 'up', onActivate: powerBridge }),
      new TargetPanel(W, { min: [x1 + 0.1, y + 0.12, zb], max: [x2 - 0.1, top - 0.15, zb + 0.2], color: YELLOW, face: '+z', onActivate: powerBridge }),
    ];
    panels.forEach((p) => (p.group = panels));
  }
  hint([-27, 5, -184], [-14, 8, -180], 'The bridge is offline. <b>Shoot yellow over the kiosk glass</b> to power it.', 5);
  // SECRET — the hut's only entrance is a crawl hole facing the kiosk
  room({ x1: -26.5, x2: -23, zS: -187.5, zN: -191, y: 5, h: 2.2, zone, floor: false, trim: false, e: [{ c: -189.25, w: 1.2, h: 1.0 }], wallKind: 'rock' });
  W.box(-27.2, 7.7, -191.7, -22.3, 8.1, -186.8, 'grass', zone);
  W.deco(-22.45, 6.05, -189.95, -22.4, 6.15, -188.55, GLOW[zone], zone);
  trophy(-24.75, 6, -189.25);
  secretRoom([-26.5, 5, -191], [-23, 7.2, -187.5], 'Overgrown Hut');
  new Drone(W, { pos: [-16, 9.5, -183], color: RED, range: 22 });

  // island two (checkpoint), then a red-spiked stone to the north bank
  ground(-1, -194, 7, -180, 5.6, 1);
  new Checkpoint(W, game, { pos: [3, 5.6, -184], yaw: 0, size: [8, 3, 4] });
  column(5.5, -192.5, 5.6, 4.5, 1);
  glowPatch(-0.5, -193.5, 6.5, -180.5, 5.6, 16);
  new Drone(W, { pos: [3, 10, -189], color: YELLOW, range: 22 });
  stone(1, -200, 4, -197, 5, 1);
  new Barrier(W, { min: [1, 5, -200], max: [4, 5.6, -197], color: RED, kind: 'spike', regen: 4, zone });
  new Drone(W, { pos: [-7, 10.5, -197], color: [RED, YELLOW], range: 22 });

  // the plateau (unreachable): the court's great tree, an acid stream spilling into the moat
  ground(14, -198, 30, -172, 9, 1);
  giantTree(20, 9, -186, { w: 3.5, h: 25, r: 7, vineCount: 14 });
  W.deco(14, 9, -184.2, 22, 9.06, -182.6, 'acid', zone);
  fall(13.9, -184.2, 14, -182.6, 1.5, 9.06);
  mist(13, 2, -183.4, 6, 6);
  glowPatch(14.5, -197.5, 29.5, -172.5, 9, 30);
  vines(14.05, -197.9, 14.1, -172.2, 9, 20, 5);

  // north bank: the lip of the Great Hollow
  ground(-30, -208, 30, -203, 4.5, -31);
  area([-30, 4.5, -208], [30, 9, -203], MOOD);
  new Checkpoint(W, game, { pos: [-25.5, 4.5, -205.5], yaw: 0, size: [8, 3, 5] });
  // a low ruined parapet on the drop, broken by an arch where the way down starts
  for (let x = -22; x < 29; x += 3.2) W.box(x, 4.5, -208, Math.min(x + R(2, 3), 30), 4.5 + R(0.6, 1.1), -207.6, 'wall', zone);
  W.box(-30, 4.5, -208, -29, 11, -207, 'wall', zone);
  W.box(-23, 4.5, -208, -22, 11, -207, 'wall', zone);
  W.box(-30.2, 11, -208.2, -21.8, 12, -206.8, 'metal', zone);
  W.deco(-29, 10.6, -207.6, -23, 10.7, -207.4, GLOW[zone], zone);
  vines(-30, -208.25, -22, -208.2, 11, 10, 3);
  glowPatch(-29.5, -207.5, 29.5, -203.5, 4.5, 26);
  hint([-30, 4.5, -208], [-20, 8, -203], 'The ground falls away into the <b>Great Hollow</b>. Hop down the ledges — <b>the lake is acid</b>.', 6);

  // ================================================================ THE AQUEDUCT (return path, y 12)
  // Seen from the court the whole way; you only reach it at the very end, dropping out of the canopy.
  // Its first stretch is a covered gallery still carrying a channel of acid on its roof, so nobody can
  // skip the shielded drop by leaping from the perch onto the deck beyond it.
  W.box(8.5, 11, -231.3, 11.5, 12, -158.5, 'floor', zone);
  W.deco(8.45, 11.7, -231.3, 8.5, 11.8, -158.5, GLOW[zone], zone);
  W.deco(11.5, 11.7, -231.3, 11.55, 11.8, -158.5, GLOW[zone], zone);
  const slits = [];
  for (let z = -229; z > -206; z -= 3) slits.push({ c: z, w: 0.4, y0: 13, h: 1.4 });
  wallZ(8, 8.5, -231.3, -205, 12, 15.2, slits, zone);
  wallZ(11.5, 12, -231.3, -205, 12, 15.2, slits, zone);
  W.box(8, 11, -231.3, 8.5, 12, -205, 'wall', zone);
  W.box(11.5, 11, -231.3, 12, 12, -205, 'wall', zone);
  W.box(8, 15.2, -231.3, 12, 15.7, -205, 'metal', zone);
  W.box(8, 15.7, -231.3, 12, 15.9, -205, 'acid', zone, { hazard: 'acid' });
  W.deco(8.5, 15.1, -231.3, 8.56, 15.18, -205, GLOW[zone], zone);
  W.deco(11.44, 15.1, -231.3, 11.5, 15.18, -205, GLOW[zone], zone);
  fall(12, -210.2, 12.2, -209.2, -28.4, 15.8); // the channel spills into the Hollow through a side outlet
  W.box(12, 15.2, -210.4, 12.6, 15.9, -209, 'metal', zone);
  vines(7.95, -231, 8, -205.5, 15.2, 16, 6);
  vines(12, -231, 12.05, -205.5, 15.2, 16, 6);
  new Barrier(W, { min: [8.5, 12, -224.2], max: [11.5, 15.2, -223.8], color: GREEN, kind: 'wall', zone });
  for (let z = -160; z > -204; z -= R(3, 5)) {
    const l = Math.min(R(1.5, 3.5), z + 205);
    W.box(8.2, 12, z - l, 8.5, 12 + R(0.6, 0.95), z, 'wall', zone);
    W.box(11.5, 12, z - l * R(0.6, 1), 11.8, 12 + R(0.6, 0.95), z, 'wall', zone);
  }
  vines(8.25, -204, 8.3, -159, 11, 34, 5);
  vines(11.7, -204, 11.75, -159, 11, 34, 5);
  for (const [zc, base] of [[-166, 4], [-187, 1], [-205.5, 4.5], [-221, -29]]) {
    W.box(9, base, zc - 1, 11, 11, zc + 1, 'wall', zone);
    W.box(8.4, 10.3, zc - 1.4, 11.6, 11, zc + 1.4, 'metal', zone);
    W.deco(8.98, 9.6, zc - 1.02, 11.02, 9.68, zc + 1.02, GLOW[zone], zone);
    vines(8.95, zc - 1, 9, zc + 1, 10.3, 3, 6);
  }
  // archways carrying the barriers; the posts stop anyone sneaking past along the parapet
  const gateArch = (z, color) => {
    W.box(7.6, 11, z - 0.45, 8.4, 16.2, z + 0.45, 'wall', zone);
    W.box(11.6, 11, z - 0.45, 12.4, 16.2, z + 0.45, 'wall', zone);
    W.box(7.4, 15.2, z - 0.55, 12.6, 16.2, z + 0.55, 'metal', zone);
    W.box(7.3, 16.2, z - 0.65, 12.7, 16.45, z + 0.65, 'grass', zone);
    new Barrier(W, { min: [8.4, 12, z - 0.2], max: [11.6, 15.2, z + 0.2], color, kind: 'wall', zone });
  };
  gateArch(-196, YELLOW);
  gateArch(-176, RED);
  // (its two guards only wake once you carry green; see the shrine)
  // the gatehouse into the Hub's north balcony port (x 10, y 12)
  corridor({ zStart: -148.5, zEnd: -158.5, y: 12, zone, cx: 10 });
  vines(8.6, -158.4, 11.4, -149, 15.2, 8, 1.2);
  W.box(7.5, 15.7, -158.9, 12.5, 16, -148.5, 'grass', zone);

  // ================================================================ THE GREAT HOLLOW (z -208 → -292)
  // A sinkhole open to the sky, 45 m deep, with an acid lake at the bottom and the Great Tree in the middle.
  cliff(-30.5, -31, -235, -30, 14, -208);
  cliff(30, -31, -235, 30.5, 14, -208);
  cliff(-60.5, -31, -235.5, -30, 14, -235);
  cliff(30, -31, -235.5, 60.5, 14, -235);
  cliff(-60.5, -31, -292, -60, 14, -235.5);
  cliff(60, -31, -292, 60.5, 14, -235.5);
  cliff(-60.5, -31, -292.5, -3, 14, -292); // north wall, with the shrine's mouth
  cliff(3, -31, -292.5, 60.5, 14, -292);
  cliff(-3, -31, -292.5, 3, -25, -292);
  cliff(-3, -20, -292.5, 3, 14, -292);
  cliff(-30, -31, -235, 30, -29, -208);
  cliff(-60, -31, -292, 60, -29, -235);
  W.box(-30, -29, -235, 30, -28.4, -208, 'acid', zone, { hazard: 'acid' });
  W.box(-60, -29, -292, 60, -28.4, -235, 'acid', zone, { hazard: 'acid' });
  // cavern overhangs and dripping stone around the rim, ruin facades on the walls
  cliff(-60, 2, -292, 60, 6, -281);
  cliff(-60, 0, -281, -46, 4, -235.5);
  cliff(46, 0, -281, 60, 4, -235.5);
  for (let i = 0; i < 40; i++) {
    const x = R(-58, 58), z = i < 20 ? R(-290, -282) : R(-279, -237), side = i < 20 || Math.abs(x) > 46;
    if (!side) continue;
    const top = z > -281 ? 0 : 2, s = R(0.5, 1.4);
    cliff(x - s, top - R(2, 7), z - s, x + s, top, z + s);
  }
  vines(-58, -280.8, 58, -280.7, 2, 50, 14);
  vines(-45.9, -280, -45.8, -237, 0, 20, 12);
  vines(45.8, -280, 45.9, -237, 0, 20, 12);
  for (const x of [-52, -38, -22, 22, 38, 52]) {
    W.box(x - 1.5, -28.4, -292.1, x + 1.5, 2, -291.6, 'wall', zone);
    W.deco(x - 1.5, -10, -291.65, x + 1.5, -9.9, -291.55, GLOW[zone], zone);
  }
  // acid falls pouring off the rim into the lake
  fall(-44, -291.9, -40, -291.7, -28.4, 14);
  fall(36, -291.9, 39, -291.7, -28.4, 14);
  fall(-59.9, -262, -59.7, -258, -28.4, 14);
  fall(59.7, -270, 59.9, -267, -28.4, 14);
  for (const [x, z] of [[-42, -289], [37.5, -289], [-57, -260], [57, -268.5]]) mist(x, -27.6, z, 14, 12);
  mist(-35, -27.8, -262, 40, 50);
  mist(35, -27.8, -262, 40, 50);
  mist(-10, -27.6, -222, 40, 24);
  vines(-29.95, -234, -29.9, -209, 14, 24, 14);
  vines(29.9, -234, 29.95, -209, 14, 24, 14);

  // strata, moss and fungus shelves break up the sinkhole walls (decoration only)
  const strata = (axis, c, s, a1, a2, n) => {
    for (let i = 0; i < n; i++) {
      const u = R(a1, a2), w = R(2, 7), y = R(-26, 12), h = R(0.4, 1.6), d = R(0.3, 1.2) * s;
      if (axis === 'x') {
        cliff(c, y, u, c + d, y + h, u + w, false);
        W.deco(c, y + h, u, c + d * 1.05, y + h + 0.12, u + w, 'grass', zone);
        if (rand() < 0.3) W.deco(c + d, y - 0.08, u + w * 0.3, c + d * 1.02, y, u + w * 0.6, GLOW[zone], zone);
      } else {
        cliff(u, y, c, u + w, y + h, c + d, false);
        W.deco(u, y + h, c, u + w, y + h + 0.12, c + d * 1.05, 'grass', zone);
        if (rand() < 0.3) W.deco(u + w * 0.3, y - 0.08, c + d, u + w * 0.6, y, c + d * 1.02, GLOW[zone], zone);
      }
    }
  };
  strata('x', -30, 1, -234, -209, 10);
  strata('x', 30, -1, -234, -209, 10);
  strata('x', -60, 1, -290, -237, 16);
  strata('x', 60, -1, -290, -237, 16);
  strata('z', -235.5, -1, -59, -31, 8);
  strata('z', -235.5, -1, 31, 59, 8);
  strata('z', -292, 1, -58, -6, 14);
  strata('z', -292, 1, 6, 58, 14);
  // the shrine's mouth: an old carved arch half swallowed by roots
  W.box(-5, -25, -292, -3, -17, -291, 'wall', zone);
  W.box(3, -25, -292, 5, -17, -291, 'wall', zone);
  W.box(-5.5, -18, -292, 5.5, -16.5, -290.8, 'metal', zone);
  W.deco(-3.05, -24.9, -291.05, -2.95, -18.1, -290.95, GLOW[zone], zone);
  W.deco(2.95, -24.9, -291.05, 3.05, -18.1, -290.95, GLOW[zone], zone);
  W.deco(-3, -18.1, -290.85, 3, -18, -290.75, GLOW[zone], zone);
  W.box(-5.7, -16.5, -292, 5.7, -16.2, -290.6, 'grass', zone);
  vines(-5.5, -290.75, 5.5, -290.7, -16.5, 14, 4);
  for (const [x, y, s] of [[-9, -25, 2.5], [8.5, -25, 2], [-14, -24, 1.6], [12, -23, 1.4], [-7, -15, 1.8], [7.5, -14, 1.5]]) cliff(x - s, y, -292, x + s, y + s * 1.4, -292 + s, false);

  // the way down: ledges along the west wall, a giant root, then a long drop to the tree's root island
  stone(-30, -216, -23, -211, 1, -2);
  stone(-25, -224, -18, -219, -2.5, -29);
  stone(-30, -236, -17, -227, -6, -12);
  new Checkpoint(W, game, { pos: [-23.5, -6, -231.5], yaw: Math.PI, size: [12, 3, 8] });
  stone(-27, -244, -21, -239, -9.5, -29);
  stone(-60, -251, -15, -247, -13, -15.5); // a root as thick as a wall, reaching for the tree
  for (const [a, b, c, d, t] of [[-29, -216, -24, -211, 1], [-24.5, -223.5, -18.5, -219.5, -2.5], [-29.5, -235.5, -17.5, -227.5, -6], [-26.5, -243.5, -21.5, -239.5, -9.5], [-40, -250.5, -15.5, -247.5, -13]]) glowPatch(a, b, c, d, t, 7);
  new Drone(W, { pos: [-13, 2, -220], color: RED, range: 20 });
  new Drone(W, { pos: [-12, -6, -243], color: YELLOW, range: 20 });

  // the root island around the Great Tree
  ground(-14, -278, 14, -248, -25, -31);
  area([-14, -25, -278], [14, -20, -248], MOOD);
  new Checkpoint(W, game, { pos: [-11, -25, -262], yaw: 0, size: [6, 3, 26] });
  glowPatch(-13.5, -277.5, -8, -248.5, -25, 30);
  glowPatch(8, -271, 13.5, -248.5, -25, 18);
  glowPatch(-6, -277.5, 4, -272, -25, 10);
  // roots wandering off into the lake
  ground(-44, -265, -14, -261, -26.5, -31);
  ground(14, -268, 42, -264, -26.8, -31);
  ground(-3, -248, 1, -238, -27, -31);
  ground(18, -284, 22, -268, -27.2, -31);
  mist(0, -24.6, -263, 34, 34);

  // the Great Tree: a hollow trunk you'll climb from the inside
  {
    const top = 44;
    bark(-7.5, -25, -256, 2.5, top, -254.5); // south wall, with the exit hole at y 26
    bark(5.5, -25, -256, 7.5, top, -254.5);
    bark(2.5, -25, -256, 5.5, 26, -254.5);
    bark(2.5, 29.2, -256, 5.5, top, -254.5);
    bark(-7.5, -25, -269.5, -1.5, top, -268); // north wall, with the door
    bark(1.5, -25, -269.5, 7.5, top, -268);
    bark(-1.5, -21.8, -269.5, 1.5, top, -268);
    bark(-7.5, -25, -268, -6, top, -256);
    bark(6, -25, -268, 7.5, top, -256);
    bark(-6, 31, -268, 6, 32, -256);
    // bark ridges, buttresses and a mossy collar
    for (const [x1, z1, x2, z2] of [[-7.9, -258, -7.5, -257], [-7.9, -264, -7.5, -262.5], [7.5, -260, 7.9, -258.5], [7.5, -266, 7.9, -265], [-5, -254.5, -3.8, -254.1], [-5.2, -270, -4, -269.5], [5, -270, 6, -269.5]]) {
      bark(x1, -25, z1, x2, top, z2);
    }
    for (const [x1, z1, x2, z2, h] of [[-10.5, -261, -7.5, -258, 0.4], [7.5, -264, 12.5, -261, 6], [-3, -254.5, 0, -250, 4], [-7.5, -272, -4.5, -269.5, 4.5], [3.5, -254.5, 6.5, -251, 3.5]]) {
      bark(x1, -25, z1, x2, -25 + h, z2);
    }
    W.deco(-7.6, 6, -269.6, 7.6, 7.2, -254.4, 'grass', zone);
    W.deco(-7.6, 30, -269.6, 7.6, 31, -254.4, 'grass', zone);
    vines(-7.6, -269.7, 7.6, -269.6, 14, 14, 18);
    vines(-7.6, -254.4, 7.6, -254.3, 22, 14, 18);
    vines(-7.7, -269.5, -7.6, -254.5, 30, 10, 20);
    vines(7.6, -269.5, 7.7, -254.5, 30, 10, 20);
    // the crown, high enough to be seen from the Hub
    canopy(0, 48, -262, 13, 24);
    canopy(-14, 43, -252, 8, 10);
    canopy(13, 45, -274, 9, 10);
    canopy(-10, 46, -276, 7, 8);
    canopy(12, 41, -250, 7, 8);
    // boughs reaching out to the lobes
    bark(-14, 40, -253, 0, 41.5, -251.5);
    bark(0, 41, -275, 13, 42.5, -273.5);
  }

  // the lock: a green seal in the tree's door, opened by a green-on-red ricochet in the alcove beside it
  const treeDoor = new SlidingDoor(W, { min: [-1.5, -25, -269.3], max: [1.5, -21.8, -268.2], color: GREEN, zone });
  sideAlcove({ zc: -274, y: -25, color: GREEN, zone, reflector: RED, onActivate: () => {
    treeDoor.open();
    game.hud.message('The tree opens!', 2.5);
  } });
  W.box(5.3, -20.5, -276.7, 12.2, -20.1, -271.3, 'grass', zone);
  vines(5.4, -276.6, 12.1, -271.4, -20.5, 8, 2.5);
  hint([-6, -25, -278], [4, -21, -272], 'A seal of living <b style="color:#3dff7a">green</b> — you\'ll need that color. The <b>Sunken Shrine</b> lies north, across the spiked stones.', 6);
  const greenHint = hint([-6, -25, -278], [4, -21, -270], 'Fire <b style="color:#3dff7a">green</b> over the glass and let the <b style="color:#ff3344">red panels</b> carry it to the target.', 6);
  greenHint.enabled = false;
  new Drone(W, { pos: [0, -19, -285], color: [RED, YELLOW], range: 20 });

  // stepping stones to the shrine, each crowned with spikes
  stone(-1.5, -283.5, 1.5, -280.5, -25, -30);
  new Barrier(W, { min: [-1.5, -25, -283.5], max: [1.5, -24.4, -280.5], color: YELLOW, kind: 'spike', regen: 4, zone });
  stone(-1.5, -289, 1.5, -286, -25, -30);
  new Barrier(W, { min: [-1.5, -25, -289], max: [1.5, -24.4, -286], color: RED, kind: 'spike', regen: 4, zone });

  // ================================================================ THE SUNKEN SHRINE (z -292 → -314)
  W.box(-3.5, -26, -295.5, 3.5, -25, -291.5, 'floor', zone);
  cliff(-3.5, -25, -296, -3, -20, -292.5);
  cliff(3, -25, -296, 3.5, -20, -292.5);
  cliff(-3.5, -20, -296, 3.5, -19.5, -292.5);
  vines(-3, -292.6, 3, -292.55, -20, 8, 2);
  new Barrier(W, { min: [-3, -25, -293.7], max: [3, -20, -293.3], color: RED, kind: 'wall', zone });
  new Barrier(W, { min: [-3, -25, -295.2], max: [3, -20, -294.8], color: YELLOW, kind: 'wall', zone });
  room({ x1: -10, x2: 10, zS: -296, zN: -314, y: -25, h: 10, zone, s: [{ c: 0, w: 6, h: 5 }], wallKind: 'rock' });
  new Checkpoint(W, game, { pos: [0, -25, -298], yaw: 0, size: [6, 3, 3] });
  area([-6, -25, -299], [6, -20, -296], MOOD);
  // the dais: steps up to the core between rows of old columns
  W.box(-3.5, -25, -310.5, 3.5, -24.6, -303.5, 'metal', zone);
  W.deco(-3.55, -24.68, -310.55, 3.55, -24.6, -303.45, GLOW[zone], zone);
  const core = pedestal(0, -24.6, -307, GREEN, zone);
  for (const z of [-300, -305, -310]) {
    column(-7, z, -25, 10, 1.4);
    column(7, z, -25, 10, 1.4);
  }
  W.box(-4, -25, -314, 4, -16, -313, 'wall', zone);
  W.deco(-3, -18, -312.98, 3, -17.9, -312.9, GLOW[zone], zone);
  W.deco(-0.05, -24, -312.98, 0.05, -18, -312.9, GLOW[zone], zone);
  glowPatch(-9.5, -313.5, -8, -296.5, -25, 22, 0.15);
  glowPatch(8, -313.5, 9.5, -296.5, -25, 22, 0.15);
  vines(-9.8, -313.8, 9.8, -296.2, -15, 40, 6);
  mist(0, -24.7, -305, 20, 18);
  light(0, -17.5, -305, 0x7dffb0, 30, 24);
  devStart('verdant2', [0, -25, -298.5], Math.PI, [RED, YELLOW, GREEN]);
  // taking the core wakes the hollow's guardians: green drones that would be unbeatable any earlier
  const takeCore = core.onCollect;
  core.onCollect = (pk, pl) => {
    takeCore(pk, pl);
    greenHint.enabled = true;
    new Drone(W, { pos: [-5, -19.5, -284], color: GREEN, range: 22 });
    new Drone(W, { pos: [6, -20, -279], color: GREEN, range: 22 });
    new Drone(W, { pos: [2, 15.5, -199], color: GREEN, range: 22 });
    new Drone(W, { pos: [20, 17, -207], color: [RED, YELLOW, GREEN], range: 22 });
  };

  // ================================================================ INSIDE THE GREAT TREE (y -25 → 26)
  // Lift → shelf (green barrier) → root steps → lift → jump pad → lift → out through the bark at y 26.
  new Checkpoint(W, game, { pos: [0, -25, -265.5], yaw: Math.PI, size: [3, 3, 3] });
  area([-6, -25, -268], [6, -21, -256], MOOD);
  hint([-1.5, -25, -268], [1.5, -22, -265], 'The tree is hollow. <b>Step onto the lifts</b> and ride up.', 4);
  light(0, -14, -262, 0xa8ffb8, 40, 30);
  light(0, 16, -262, 0xe2ffa8, 40, 30);
  const lift = (min, max, rise) => {
    const p = new MovingPlatform(W, { min, max, offset: [0, rise, 0], speed: 3, pause: 1.8, active: false, zone, kind: 'metal' });
    W.trigger([min[0], max[1], min[2]], [max[0], max[1] + 2, max[2]], () => (p.active = true));
    return p;
  };
  lift([2.5, -25.6, -259.5], [5.5, -25, -256.5], 13);
  plat(2, -268, 6, -260, -12, zone, 0.6, 'rock');
  new Barrier(W, { min: [0, -12.6, -263.2], max: [6, -8.6, -262.8], color: GREEN, kind: 'wall', zone });
  plat(-1.5, -268, 1.5, -265, -11, zone, 0.6, 'rock');
  lift([-6, -10.6, -268], [-3, -10, -265], 17);
  plat(-6, -264.5, -2.5, -256, 7, zone, 0.6, 'rock');
  new Checkpoint(W, game, { pos: [-4.25, 7, -262], yaw: Math.PI, size: [3.5, 3, 4] });
  new JumpPad(W, { pos: [-4.25, 7, -258], power: 22, push: [2.5, 0, 0] });
  plat(-2, -259.5, 2.5, -256, 16, zone, 0.6, 'rock');
  lift([2.5, 15.4, -259.5], [5.5, 16, -256.5], 10);
  new Drone(W, { pos: [0, -17, -262], color: [RED, YELLOW, GREEN], orbit: 1.5, range: 20 });
  new Drone(W, { pos: [-1, 12, -262], color: [GREEN, YELLOW], orbit: 1.5, range: 20 });
  glowPatch(-5.8, -267.8, 5.8, -256.2, -25, 24, 0.1);
  for (let i = 0; i < 26; i++) {
    const side = i % 4, y = R(-22, 29), l = R(2, 6);
    if (side === 0) vine(R(-5.9, 5.9), y, -267.95, l);
    else if (side === 1) vine(R(-5.9, 5.9), y, -256.05, l);
    else if (side === 2) vine(-5.95, y, R(-267.9, -256.1), l);
    else vine(5.95, y, R(-267.9, -256.1), l);
  }

  // ================================================================ THE BRANCH AND THE DROP
  bark(2.5, 24.5, -254.5, 8, 26, -243);
  bark(6, 24.5, -243, 14, 26, -239);
  for (let i = 0; i < 14; i++) {
    const x = R(2.6, 13), z = x > 7.5 ? R(-242.8, -240) : R(-254, -243.5), w = R(0.6, 1.6);
    W.deco(x, 26, z, Math.min(x + w, 13.9), 26.03, z + R(0.5, 1.5), 'grass', zone);
  }
  W.deco(6, 25.86, -239.03, 14, 25.94, -238.97, GLOW[zone], zone); // the edge you drop off
  new Checkpoint(W, game, { pos: [10, 26, -241], yaw: Math.PI, size: [8, 3, 4] });
  hint([6, 26, -243], [14, 29, -239], 'Drop through each shield, then fire: <b style="color:#ff3344">RED</b> · <b style="color:#ffd23a">YELLOW</b> · <b style="color:#3dff7a">GREEN</b>', 7);
  vines(2.6, -254.4, 13.9, -239.1, 24.5, 18, 6);
  glowPatch(3, -254, 7.5, -243.5, 26, 8);
  // the signature drop: red, yellow and green spikes stacked above the aqueduct's head
  plat(6.3, -236.2, 13.7, -231.3, 12, zone);
  W.box(8.5, -29, -235.5, 11.5, 11.4, -232.5, 'wall', zone);
  shieldedShaft({
    x1: 7, x2: 13, z1: -236, z2: -232, floor: 12, capY: 23.5, zone,
    cap: { x1: 6, x2: 14, z1: -239, z2: -231 },
    layers: [{ y: 20.2, color: RED }, { y: 16.7, color: YELLOW, shieldY: 20.0 }, { y: 13.2, color: GREEN, shieldY: 16.5 }],
  });
  // solid sides so nobody drifts around the layers; a low door (only fits under the green layer) leads out
  W.box(6.3, 12, -236.2, 6.7, 23.5, -231.7, 'wall', zone);
  W.box(13.3, 12, -236.2, 13.7, 23.5, -231.7, 'wall', zone);
  wallX(-231.7, -231.3, 6.3, 13.7, 12, 23.5, [{ c: 10, w: 3, y0: 12, h: 2 }], zone);
  W.deco(6.1, 23.5, -236.4, 6.7, 23.8, -231.1, 'grass', zone);
  W.deco(13.3, 23.5, -236.4, 13.9, 23.8, -231.1, 'grass', zone);
  W.deco(6.7, 23.5, -231.7, 13.3, 23.8, -231.1, 'grass', zone);
  vines(6.2, -231.2, 13.8, -231.15, 23.5, 8, 4);
  new Checkpoint(W, game, { pos: [10, 12, -228.5], yaw: Math.PI, size: [3, 3, 3] });
  area([8.5, 12, -231], [11.5, 15, -226], MOOD);

  // ================================================================ BACKDROP: the rim of the jungle
  ground(-110, -380, -60.5, -235, 14, 4);
  ground(60.5, -380, 110, -235, 14, 4);
  ground(-60.5, -380, 60.5, -292.5, 14, 4);
  for (const [x, z, h, r] of [[-75, -250, 30, 10], [-88, -300, 34, 12], [-68, -340, 28, 10], [72, -258, 32, 11], [86, -315, 30, 12], [66, -350, 34, 10], [-30, -322, 30, 11], [28, -330, 33, 12], [0, -360, 36, 13], [-50, -305, 26, 8], [48, -300, 27, 9]]) {
    giantTree(x, 14, z, { w: 3 + r * 0.15, h, r, vineCount: 6 });
  }
  for (let i = 0; i < 40; i++) {
    const x = rand() < 0.5 ? R(-108, -62) : R(62, 108), z = R(-378, -237);
    leafBlob(x, R(15, 18), z, R(2, 5), rand() < 0.4);
  }
  for (let i = 0; i < 24; i++) leafBlob(R(-58, 58), R(15, 18), R(-378, -295), R(2, 5), rand() < 0.4);

  // light shafts through the canopy: over the court, and down into the Hollow around the Great Tree
  shaft(-6, 42, -184, 40, 4, 0.18);
  shaft(12, 40, -174, 36, 3, 0.15);
  shaft(-20, 38, -197, 36, 3.5, 0.22);
  shaft(4, 34, -164, 26, 2.5, 0.12);
  shaft(-22, 52, -256, 76, 6, 0.16);
  shaft(22, 52, -272, 76, 7, 0.2);
  shaft(-4, 54, -238, 80, 5, 0.12);
  shaft(30, 50, -248, 70, 4, 0.18);
  shaft(-34, 50, -282, 70, 5, 0.2);

  // drifting spores catch the light everywhere
  {
    const pts = [];
    for (let i = 0; i < 900; i++) {
      if (i < 400) pts.push(R(-28, 28), R(2, 20), R(-205, -161));
      else {
        const z = R(-290, -210);
        pts.push(z < -237 ? R(-55, 55) : R(-28, 28), R(-27, 30), z);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const spores = new THREE.Points(geo, new THREE.PointsMaterial({ color: new THREE.Color(0xd8ff9a).multiplyScalar(1.4), size: 0.14, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    spores.frustumCulled = false;
    W.scene.add(spores);
    let t = 0;
    W.add({ update: (dt) => (t += dt, spores.position.set(Math.sin(t * 0.13) * 1.2, Math.sin(t * 0.21) * 0.8, Math.cos(t * 0.11) * 1.2)) });
  }

  for (const [m, geos] of lists) {
    if (!geos.length) continue;
    const mesh = new THREE.Mesh(mergeGeometries(geos, false), m);
    geos.forEach((g) => g.dispose());
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    if (m === shaftMat || m === mistMat) mesh.renderOrder = 4;
    W.scene.add(mesh);
  }

  // ================================================================ SEALS (invisible)
  // The aqueduct's parapets are knee-high: invisible walls over them keep you on the deck (off them lie the
  // plateau, the court's trees and its walls, and from those the whole jungle rim).
  blocker([7.9, 12, -205], [8.5, 40, -158.5]);
  blocker([11.5, 12, -205], [12.1, 40, -158.5]);
  // the shielded drop's open south face: no slipping down outside the spike layers onto the landing
  blocker([6.3, 12, -236.6], [13.7, 23, -236]);

  devStart('verdant', [-10, 4, -151], 0, [RED, YELLOW]);

  // ---- wayfinding (playtest pass)
  // Playtesters lost the way at the court (where do the islands start?), on the north bank (the way down is
  // an arch at its far west end), around the Great Tree (where's the shrine?), inside the trunk (which
  // platforms are lifts?) and, from the Hub, walked the aqueduct backwards into a dead end.
  level.verdant = { bridge, treeDoor }; // read by guide.js for the objective line
  const GREEN_HEX = 0x3dff7a;
  const inVerdant = (pl) => pl.pos.z < -148.5;
  guideTrail(W, 0xd2ffb8, [ // (a pale mint: pure green vanished against the turf)
    [[-10, 4, -160], [-12, 4, -168], [-19.5, 4, -171.6]], // court terrace → the first stepping stone
    [[3, 4.5, -205.2], [-21.5, 4.5, -205.2], [-26.2, 4.5, -207.6]], // north bank → the arch where the way down starts
    [[-10, -25, -250], [-11.6, -25, -258], [-11.6, -25, -273.5], [-2.5, -25, -276.6], [0, -25, -279.8]], // round the Great Tree to the shrine stones
  ], inVerdant);
  beacon(W, -19.5, 4.5, -176, GREEN_HEX, 6); // the first stepping stone
  beacon(W, -26.5, 1, -213.5, GREEN_HEX, 9); // the first ledge down into the Hollow
  // a lit lintel over the arch on the bank's lip, the start of the way down
  W.deco(-28.9, 10.95, -206.85, -23.1, 11.05, -206.75, GLOW[zone], zone);
  hint([-19, 4.5, -208], [30, 8, -203], 'The way down into the <b>Great Hollow</b> starts at the ruined arch at the <b>west</b> end of this bank.', 6);
  hint([-14, -25, -257], [-6, -21, -251.5], 'The <b>Sunken Shrine</b> lies beyond the Great Tree. Go round it to the spiked stepping stones.', 5);
  // carrying green out of the shrine: point back at the tree
  let backHint = false;
  W.trigger([-3.5, -25, -296], [3.5, -21, -291.5], () => {
    if (backHint || !game.blaster.unlocked[GREEN]) return;
    backHint = true;
    game.hud.message('Back to the <b>Great Tree</b>: open its door with <b style="color:#3dff7a">green</b>, then climb up inside the trunk.', 6);
  }, { once: false });
  // the tree's lifts: a glowing ring and a faint column on each, so they read as rides, not ledges
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(GREEN_HEX).multiplyScalar(1.6) });
  const colMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(GREEN_HEX).multiplyScalar(0.8), transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  for (const e of W.entities) {
    if (!(e instanceof MovingPlatform) || e.base.x < -7 || e.base.x > 7 || e.base.z > -255 || e.base.z < -269) continue;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(Math.min(e.size.x, e.size.z) * 0.38, 0.05, 6, 32), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(e.size.x / 2, e.size.y + 0.03, e.size.z / 2);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.2, 2.6, 16, 1, true), colMat);
    col.position.set(e.size.x / 2, e.size.y + 1.3, e.size.z / 2);
    e.mesh.add(ring, col);
  }
  // the return gatehouse is one-way: it opens as you come home along the aqueduct, and from the Hub's
  // balcony it is a sealed door that says where Verdant's entrance really is
  const homeDoor = new SlidingDoor(W, { min: [8.5, 12, -155.2], max: [11.5, 15.2, -154.8], color: GREEN, zone });
  W.trigger([8.5, 12, -175], [11.5, 15, -156], () => homeDoor.open());
  W.trigger([8.5, 12, -154.8], [11.5, 15, -148.5], () => {
    if (homeDoor.openT >= 0) return;
    game.hud.message('Sealed from this side: this is <b>Verdant\'s way out</b>. Its entrance is the <b style="color:#ffd23a">yellow gate</b> on the Nexus floor below.', 6);
  }, { once: false });
}
