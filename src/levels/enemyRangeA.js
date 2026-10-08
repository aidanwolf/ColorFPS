// DEV-ONLY test range for the ground enemies (built only with ?dev): two small arenas off the map at
// x 622..678. ?dev&start=enemiesA starts in the Foundry arena (blast crabs on a ledge and the floor, a
// welder among crates); a corridor north leads to the desert arena (?dev&start=enemiesAsolar): burrowed
// scarabs, one on a mesa, and a mummy in the ruins.
import * as THREE from 'three';
import { RED, YELLOW, GREEN, BLUE } from '../colors.js';

const ALL = [RED, YELLOW, GREEN, BLUE];

export function buildEnemyRangeA(B) {
  if (!new URLSearchParams(location.search).has('dev')) return;
  const { W, room, corridor, plat, light, area, devStart, blastCrab, welder, scarab, mummy } = B;

  // ================================================================ FOUNDRY ARENA (z -2 .. -36)
  const fz = 'red';
  room({ x1: 622, x2: 678, zS: -2, zN: -36, y: 0, h: 9, zone: fz, n: [{ c: 650, w: 3, h: 3.2 }] });
  // a tall divider: crabs to the west, the welder to the east
  W.box(649.5, 0, -36, 650.5, 5, -12, 'metal', fz);
  // crab ledge (1.5 m up) and a pack on it; another pack on the floor
  plat(626, -30, 637, -20, 1.5, fz, 1.5, 'metal');
  blastCrab([631.5, 1.5, -25], { count: 3, spread: 1.6, patrol: 3 });
  blastCrab([641, 0, -17], { count: 2, spread: 1.4, patrol: 2.5 });
  // the welder's yard: crates and a pillar to hide behind
  const M = (x1, y1, z1, x2, y2, z2) => W.box(x1, y1, z1, x2, y2, z2, 'metal', fz);
  M(658, 0, -19, 660.5, 2.2, -16.5);
  M(668, 0, -25, 671, 1.8, -23.5);
  M(657, 0, -31, 658.5, 2.6, -29.5);
  M(672, 0, -16, 674, 2.4, -14);
  M(664, 0, -33, 666, 4, -31);
  welder([665, 0, -26], { patrol: 3 });
  light(636, 7, -14, 0xff7050, 40, 34);
  light(636, 7, -30, 0xff5040, 40, 34);
  light(664, 7, -14, 0xff7050, 40, 34);
  light(664, 7, -30, 0xff5040, 40, 34);
  area([622, 0, -8], [678, 9, -2], { atmosphere: 'foundry' });
  area([648.5, 0, -36], [651.5, 3.2, -34], { atmosphere: 'foundry' });
  devStart('enemiesA', [650, 0, -4], 0, ALL);

  // ================================================================ CORRIDOR (z -36 .. -40.5)
  corridor({ zStart: -36, zEnd: -40.5, y: 0, zone: fz, cx: 650 });

  // ================================================================ DESERT ARENA (z -40.5 .. -118)
  const dz = 'yellow';
  const R = (x1, y1, z1, x2, y2, z2) => W.box(x1, y1, z1, x2, y2, z2, 'rock', dz);
  room({ x1: 622, x2: 678, zS: -40.5, zN: -118, y: 0, h: 10, zone: dz, s: [{ c: 650, w: 3, h: 3.2 }], ceiling: false, floor: false, wallKind: 'rock' });
  R(621.5, -1, -118.5, 678.5, 0, -40);
  // a sand sheet over the bedrock
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(56, 77.5), new THREE.MeshStandardMaterial({ color: 0xc9a26a, roughness: 1 }));
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(650, 0.01, -79.25);
  W.scene.add(sand);
  // a mesa (scarab on top) and ruins round the mummy
  R(628, 0, -72, 640, 1.6, -60);
  R(640, 0, -89, 646, 2.2, -88);
  R(654, 0, -101, 660, 2.5, -100);
  R(635.5, 0, -81, 637, 4, -79.5);
  R(663, 0, -81, 664.5, 4, -79.5);
  R(649, 0, -109, 651, 3.5, -107.5);
  R(642, 0, -104, 643.5, 1.6, -100);
  scarab([650, 0, -60], { count: 3, spread: 2.2 });
  scarab([664, 0, -68], { palette: [YELLOW, RED] });
  scarab([634, 1.6, -66], {});
  scarab([626, 0, -52], { burrow: false, patrol: 3 });
  mummy([650, 0, -98], { patrol: 3, shieldColor: RED });
  light(650, 8, -60, 0xffc080, 30, 40);
  light(650, 8, -96, 0xffc080, 30, 40);
  area([648.5, 0, -42.5], [651.5, 3.2, -40.5], { atmosphere: 'solar' });
  devStart('enemiesAsolar', [650, 0, -43], 0, ALL);
}
