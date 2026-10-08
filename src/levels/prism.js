// PRISM CORE — the antechamber and the sealed arena where the Prism Warden waits.
// TODO(hub agent): relocate beneath the Hub per LAYOUT.md; it still sits at its old coordinates.
import * as THREE from 'three';
import { JumpPad, Checkpoint } from '../entities/misc.js';
import { Boss } from '../boss.js';

export function buildPrism(B) {
  const { W, game, level, CH, room, corridor, hint, zoneTitle, area, light, devStart } = B;
  const zone = 'boss';
  room({ x1: -6, x2: 6, zS: -339, zN: -351, y: 4.4, h: 6, zone, s: [{ c: 0, w: 3, h: CH }], n: [{ c: 0, w: 3, h: CH }] });
  new Checkpoint(W, game, { pos: [0, 4.4, -341], yaw: 0, size: [12, 3, 3] });
  zoneTitle([-6, 4.4, -341], [6, 7.4, -339], 'FINAL SECTOR', 'PRISM CORE', '#d9a8ff', 'music_antechamber');
  hint([-6, 4.4, -348], [6, 7.4, -346], 'Something enormous waits ahead. <b>You will need every color.</b>', 5);
  light(0, 9, -345, 0xc8a0ff, 20, 16);
  corridor({ zStart: -351.5, zEnd: -359.5, y: 4.4, zone });
  area([-6, 4.4, -351], [6, 8, -339], { ambient: 'amb_core', atmosphere: 'prism' });

  const zS = -360, zN = -416, y = 4.4, z = (lz) => zS - lz;
  room({ x1: -28, x2: 28, zS, zN, y, h: 24, zone, ceiling: false, s: [{ c: 0, w: 3, h: CH }] });
  // pillars for cover
  for (const [x, lz] of [[-12, 18], [12, 18], [-12, 40], [12, 40]]) {
    W.box(x - 1, y, z(lz + 1), x + 1, y + 8, z(lz - 1), 'metal', zone);
    W.deco(x - 1.05, y + 7.6, z(lz + 1.05), x + 1.05, y + 7.7, z(lz - 1.05), 'trimWhite', zone);
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
  const g = 'trimWhite';
  W.deco(-10, y + 0.01, z(38), 10, y + 0.04, z(37.8), g, zone);
  W.deco(-10, y + 0.01, z(18.2), 10, y + 0.04, z(18), g, zone);
  W.deco(-10, y + 0.01, z(38), -9.8, y + 0.04, z(18), g, zone);
  W.deco(9.8, y + 0.01, z(38), 10, y + 0.04, z(18), g, zone);
  for (const [x, lz] of [[-20, 15], [20, 15], [-20, 45], [20, 45]]) light(x, y + 12, z(lz), 0xb890ff, 40, 45);

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
  level.bossTrigger = W.trigger([-28, y, z(9)], [28, y + 6, z(5)], () => game.startBoss(), { once: true });
  level.bossArenaZ = zS;

  devStart('boss', [0, 4.4, -341], 0, [0, 1, 2, 3]);
}
