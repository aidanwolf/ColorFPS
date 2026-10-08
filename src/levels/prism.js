// PRISM CORE — a vast crystalline chamber beneath the Hub, where the Prism Warden waits.
//   The Hub's Prism elevator (hub.js SHAFT, x -2..2, z -112..-108) drops through the ceiling of the
//   antechamber grotto (x -10..10, z -95..-115, floor y -48, 18 m tall) → short corridor north →
//   the sealed arena (56×56 m, x -28..28, z -118.5..-174.5, floor y -48, ceiling y -10).
import * as THREE from 'three';
import { JumpPad, Checkpoint } from '../entities/misc.js';
import { Boss } from '../boss.js';
import { SHAFT, rectMinus } from './hub.js';
import { buildFinale } from './finale/index.js';

const Y = SHAFT.bottom; // every floor down here: -48

export function buildPrism(B) {
  const { W, game, level, CH, T, room, corridor, hint, zoneTitle, area, light, devStart } = B;
  const zone = 'boss';
  const crystals = []; // [x, y, z, radius, height, tilt] — one instanced mesh for the whole sector

  // ---------------------------------------------------------------- antechamber grotto
  const A = { x1: -10, x2: 10, zS: -95, zN: -115, h: 18 };
  room({ ...A, y: Y, zone, ceiling: false, floor: false, n: [{ c: 0, w: 3, h: CH }] });
  const hole = { u1: SHAFT.x1, u2: SHAFT.x2, v1: SHAFT.z1, v2: SHAFT.z2 };
  // floor with a pit under the elevator (its platform rests flush with the floor)
  for (const [x1, z1, x2, z2] of rectMinus(A.x1 - T, A.zN - T, A.x2 + T, A.zS + T, [hole])) W.box(x1, Y - 1, z1, x2, Y, z2, 'floor', zone);
  W.box(SHAFT.x1, Y - 1, SHAFT.z1, SHAFT.x2, Y - 0.7, SHAFT.z2, 'grate', zone);
  // ceiling with the shaft mouth (hub.js builds the shaft walls down to it)
  const mouth = { u1: SHAFT.x1 - 0.5, u2: SHAFT.x2 + 0.5, v1: SHAFT.z1 - 0.5, v2: SHAFT.z2 + 0.5 };
  for (const [x1, z1, x2, z2] of rectMinus(A.x1 - T, A.zN - T, A.x2 + T, A.zS + T, [mouth])) W.box(x1, Y + A.h, z1, x2, Y + A.h + 0.5, z2, 'ceil', zone);
  // the landing: a lit ring around the elevator pit
  const g = 'trimWhite';
  W.deco(SHAFT.x1 - 0.6, Y, SHAFT.z1 - 0.6, SHAFT.x2 + 0.6, Y + 0.03, SHAFT.z1 - 0.5, g, zone);
  W.deco(SHAFT.x1 - 0.6, Y, SHAFT.z2 + 0.5, SHAFT.x2 + 0.6, Y + 0.03, SHAFT.z2 + 0.6, g, zone);
  W.deco(SHAFT.x1 - 0.6, Y, SHAFT.z1 - 0.5, SHAFT.x1 - 0.5, Y + 0.03, SHAFT.z2 + 0.5, g, zone);
  W.deco(SHAFT.x2 + 0.5, Y, SHAFT.z1 - 0.5, SHAFT.x2 + 0.6, Y + 0.03, SHAFT.z2 + 0.5, g, zone);
  // a walkway of light from the landing to the arena door
  W.deco(-0.1, Y, A.zN, 0.1, Y + 0.03, SHAFT.z1 - 0.6, g, zone);
  new Checkpoint(W, game, { pos: [0, Y, -113.5], yaw: 0, size: [20, 4, 3] });
  zoneTitle([-3, Y, -113], [3, Y + 4, -107], 'FINAL SECTOR', 'PRISM CORE', '#d9a8ff', 'music_antechamber');
  hint([-10, Y, -115], [10, Y + 4, -112.5], 'Something enormous waits ahead. <b>You will need every color</b>, and every hit is lethal.', 6);
  light(0, Y + 7, -104, 0xc8a0ff, 26, 26);
  area([A.x1, Y, A.zN], [A.x2, Y + 6, A.zS], { music: 'music_antechamber', ambient: 'amb_core', atmosphere: 'prism' });
  corridor({ zStart: A.zN - T, zEnd: -118, y: Y, zone });
  // grotto crystals: clusters in the corners and hanging around the shaft mouth
  for (const [x, z] of [[-9, -96.5], [9, -96.5], [-9.2, -104], [9.2, -104], [-9, -113.5], [9, -113.5]]) {
    crystals.push([x, Y, z, 0.7, 4.5, 0.2], [x + Math.sign(-x) * 0.9, Y, z + 0.8, 0.45, 2.6, -0.4], [x, Y, z - 0.9, 0.4, 2.0, 0.5]);
  }
  for (let i = 0; i < 24; i++) {
    // clusters climbing the grotto walls
    const side = i % 4, k = ((i * 0.618) % 1), cy = Y + 3 + ((i * 7) % 11), r = 0.4 + (i % 3) * 0.25, h = 2 + (i % 4);
    if (side === 0) crystals.push([A.x1, cy, A.zN + 1 + k * 18, r, h, -0.7]);
    else if (side === 1) crystals.push([A.x2, cy, A.zN + 1 + k * 18, r, h, 0.7]);
    else if (side === 2) crystals.push([A.x1 + 1 + k * 18, cy, A.zS, r, h, -0.6]);
    else if (Math.abs(A.x1 + 1 + k * 18) > 3) crystals.push([A.x1 + 1 + k * 18, cy + 4, A.zN, r, h, 0.6]);
  }
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2, r = 4.5 + (i % 3) * 1.6;
    crystals.push([Math.cos(a) * r, Y + A.h, -110 + Math.sin(a) * r * 0.7, 0.5 + (i % 2) * 0.3, -(2.5 + (i % 4)), 0.15]);
  }

  // ---------------------------------------------------------------- the arena
  const zS = -118.5, zN = zS - 56, y = Y, z = (lz) => zS - lz, H = 38;
  room({ x1: -28, x2: 28, zS, zN, y, h: H, zone, ceiling: true, s: [{ c: 0, w: 3, h: CH }] });
  // pillars for cover
  for (const [x, lz] of [[-12, 18], [12, 18], [-12, 40], [12, 40]]) {
    W.box(x - 1, y, z(lz + 1), x + 1, y + 8, z(lz - 1), 'metal', zone);
    W.deco(x - 1.05, y + 7.6, z(lz + 1.05), x + 1.05, y + 7.7, z(lz - 1.05), 'trimWhite', zone);
    crystals.push([x, y + 8, z(lz), 0.9, 3.2, 0]); // each pillar is capped by a crystal
  }
  // corner ledges reached by jump pads, for high angles on the Warden
  const ledges = [
    { x1: -28, x2: -22, l1: 4, l2: 10, pad: [-19.5, 7], push: [-4.5, 0, 0] },
    { x1: 22, x2: 28, l1: 4, l2: 10, pad: [19.5, 7], push: [4.5, 0, 0] },
    { x1: -28, x2: -22, l1: 50, l2: 56, pad: [-19.5, 53], push: [-4.5, 0, 0] },
    { x1: 22, x2: 28, l1: 50, l2: 56, pad: [19.5, 53], push: [4.5, 0, 0] },
  ];
  for (const L of ledges) {
    W.box(L.x1, y, z(L.l2), L.x2, y + 5, z(L.l1), 'metal', zone);
    W.deco(L.x1, y + 5, z(L.l2), L.x2, y + 5.06, z(L.l1), 'plat', zone);
    new JumpPad(W, { pos: [L.pad[0], y, z(L.pad[1])], power: 17, push: L.push });
  }
  // floor ring
  W.deco(-10, y + 0.01, z(38), 10, y + 0.04, z(37.8), g, zone);
  W.deco(-10, y + 0.01, z(18.2), 10, y + 0.04, z(18), g, zone);
  W.deco(-10, y + 0.01, z(38), -9.8, y + 0.04, z(18), g, zone);
  W.deco(9.8, y + 0.01, z(38), 10, y + 0.04, z(18), g, zone);
  // ribs up the walls and across the ceiling so the scale of the chamber reads
  for (const lz of [14, 28, 42]) {
    W.deco(-28, y + 6, z(lz) - 0.15, -27.9, y + H, z(lz) + 0.15, g, zone);
    W.deco(27.9, y + 6, z(lz) - 0.15, 28, y + H, z(lz) + 0.15, g, zone);
    W.deco(-28, y + H - 0.1, z(lz) - 0.15, 28, y + H, z(lz) + 0.15, g, zone);
  }
  for (const [x, lz] of [[-20, 15], [20, 15], [-20, 45], [20, 45]]) light(x, y + 16, z(lz), 0xb890ff, 55, 55);
  // crystals: stalactites over the whole ceiling, clusters high on the walls (all clear of the fight)
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 46; i++) {
    const x = -25 + rnd() * 50, lz = 3 + rnd() * 50, big = rnd() < 0.25;
    crystals.push([x, y + H, z(lz), big ? 1.4 : 0.5 + rnd() * 0.6, -(big ? 10 + rnd() * 6 : 3 + rnd() * 5), (rnd() - 0.5) * 0.3]);
  }
  for (let i = 0; i < 28; i++) {
    const side = i % 4, k = rnd(), h = 3 + rnd() * 5, cy = y + 12 + rnd() * 20, r = 0.5 + rnd() * 0.7;
    if (side === 0) crystals.push([-28, cy, z(4 + k * 48), r, h, -0.6]);
    else if (side === 1) crystals.push([28, cy, z(4 + k * 48), r, h, 0.6]);
    else if (side === 2) crystals.push([-24 + k * 48, cy, zN, r, h, 0.5]);
    else crystals.push([-24 + k * 48, cy, zS, r, h, -0.5]);
  }

  // the seal slams shut behind you when the fight starts
  const sealMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xd9a8ff).multiplyScalar(1.6), transparent: true, opacity: 0.7, depthWrite: false });
  const seal = new THREE.Mesh(new THREE.BoxGeometry(3, CH, 0.5), sealMat);
  seal.position.set(0, y + CH / 2, zS + 0.25);
  seal.visible = false;
  W.scene.add(seal);
  const sealSolid = W.addSolid(new THREE.Vector3(-1.5, y, zS), new THREE.Vector3(1.5, y + CH, zS + 0.5), {});
  sealSolid.enabled = false;
  level.setSeal = (on) => {
    seal.visible = on;
    sealSolid.enabled = on;
  };

  level.boss = new Boss(W, game, { pos: [0, y, z(40)], floorY: y, bounds: { minX: -24, maxX: 24, minZ: z(52), maxZ: z(6) } });
  // The Warden is the machine's fail-safe: it only wakes once every world's engine has gone dark.
  // (A missing power API counts as "all dark"; dev starts skip the check.)
  const WORLDS = ['red', 'solar', 'verdant', 'azure'];
  const devFight = /^(boss|finale\d)$/.test(new URLSearchParams(location.search).get('start') || '') && location.search.includes('dev');
  const worldsDark = () => devFight || !game.isWorldDown || WORLDS.every((w) => game.isWorldDown(w));
  let toldDormant = -1e9;
  level.bossTrigger = W.trigger([-28, y, z(9)], [28, y + 6, z(5)], () => {
    if (level.boss.state !== 'dormant') return;
    if (worldsDark()) return game.startBoss();
    if (W.time - toldDormant < 12) return;
    toldDormant = W.time;
    const lit = WORLDS.filter((w) => !game.isWorldDown(w)).length;
    game.hud.message(`The Warden sleeps while the machine still draws power: <b>${lit} world${lit > 1 ? 's' : ''}</b> still feed${lit > 1 ? '' : 's'} it. Shut every engine down.`, 5);
  }, { once: false });
  level.bossArenaZ = zS;
  // the final battle's other stages (levels/finale); you wake back here when it's over
  buildFinale(B, level.boss, { prismReturn: [0, y, z(16), 0] });

  // ---------------------------------------------------------------- crystal field (one draw call)
  const cg = new THREE.OctahedronGeometry(1, 0);
  cg.translate(0, 1, 0); // base at the origin so a crystal grows out of its anchor (negative height hangs)
  const cm = new THREE.MeshStandardMaterial({ color: 0xb59cff, emissive: 0x6a3cff, emissiveIntensity: 0.55, metalness: 0.3, roughness: 0.12, flatShading: true });
  const field = new THREE.InstancedMesh(cg, cm, crystals.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
  crystals.forEach(([cx, cy, cz, r, h, tilt], i) => {
    e.set(h < 0 ? Math.PI + tilt * 0.5 : tilt * 0.5, i * 1.7, tilt, 'ZXY'); // spin about its own axis, then lean
    q.setFromEuler(e);
    m4.compose(p.set(cx, cy, cz), q, s.set(r, Math.abs(h) / 2, r));
    field.setMatrixAt(i, m4);
  });
  field.instanceMatrix.needsUpdate = true;
  field.computeBoundingSphere();
  W.scene.add(field);

  // deep violet, close fog: the light comes from the crystals
  level.atmospheres.prism = {
    fog: 0x150b26, fogNear: 30, fogFar: 150,
    skyTop: [0.02, 0.01, 0.05], skyMid: [0.07, 0.03, 0.13], skyHorizon: [0.18, 0.08, 0.28], aurora: 0.15, stars: 0.3,
    hemiSky: 0xcbb4ff, hemiGround: 0x1d1430, hemiIntensity: 1.05,
    sunColor: 0xe2ccff, sunIntensity: 0.8, sunDir: [0.2, 1, -0.4],
    exposure: 1.1, bloom: 0.75,
  };
  devStart('boss', [0, Y, -113.5], 0, [0, 1, 2, 3]);

  // ---- wayfinding (playtest pass)
  // The Warden is built at the origin (inside the Foundry's area), so area culling filed it under the
  // Foundry and hid it in its own arena: never cull it (it's only drawn while the fight is on).
  level.boss.root.userData.noCull = true;
  // (the first-time attack tips for every stage live in finale/index.js)
}
