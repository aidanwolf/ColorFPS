// DEV-ONLY: Verdant's creatures (entities/verdantCreatures.js, entities/verdantFlyRide.js) on their own, in
// a walled forest clearing off the map at x 560 → 690, z -500 → -650 (the Verdant region). Built only with
// ?dev; Select Location → Test ranges lists its starts:
//   verdantCreatures   the clearing's south-west corner: the SNAPJAW GARDEN (floor, shielded, wall, hanging,
//                      swamp-emerging and uprooting flytraps, a snap-pad launcher up to a ledge)
//   verdantFlies       the FLY GROVE: a dead trunk, a passive swarm and its hive (goo the trunk: flies stick,
//                      climb them to the trunk's ledge), a hostile swarm beyond
//   verdantBorers      the BORER WALL: worms in the east wall and the floor, a bridge worm across a gap
//   verdantFlyRide     the FLY RIDE: a giant fly at a plank; stand on its back to ride a loop round the
//                      clearing (flies, drones, a borer in the trunk, a snapjaw on a branch)
import { RED, YELLOW, GREEN, BLUE } from '../colors.js';
import { creatureKit } from '../entities/verdantCreatures.js';

export function buildVerdantCreatureRange(B) {
  if (!new URLSearchParams(location.search).has('dev')) return;
  const { W, light, devStart, area, level } = B;
  const C = creatureKit(B);
  const ALL = [RED, YELLOW, GREEN, BLUE];
  const X1 = 560, X2 = 690, ZS = -500, ZN = -650, H = 16;
  const box = (x1, y1, z1, x2, y2, z2, kind = 'rock') => W.box(x1, y1, z1, x2, y2, z2, kind, 'green');

  // ---- the clearing: mossy ground with a sunken swamp pool, rock walls all round
  const P = { x1: 596, x2: 612, z1: -558, z2: -540 }; // the pool
  box(X1, -1, ZN, X2, 0, P.z1, 'grass');
  box(X1, -1, P.z2, X2, 0, ZS, 'grass');
  box(X1, -1, P.z1, P.x1, 0, P.z2, 'grass');
  box(P.x2, -1, P.z1, X2, 0, P.z2, 'grass');
  box(P.x1, -5, P.z1, P.x2, -4, P.z2, 'floor');
  box(P.x1 - 0.5, -5, P.z1, P.x1, 0, P.z2);
  box(P.x2, -5, P.z1, P.x2 + 0.5, 0, P.z2);
  box(P.x1, -5, P.z1 - 0.5, P.x2, 0, P.z1);
  box(P.x1, -5, P.z2, P.x2, 0, P.z2 + 0.5);
  B.water([P.x1, -4, P.z1], [P.x2, -0.4, P.z2]);
  box(X1 - 1, 0, ZN - 1, X1, H, ZS + 1);
  box(X2, 0, ZN - 1, X2 + 1, H, ZS + 1);
  box(X1, 0, ZS, X2, H, ZS + 1);
  box(X1, 0, ZN - 1, X2, H, ZN);
  B.blocker([X1 - 1, H, ZN - 1], [X2 + 1, H + 40, ZN]);
  B.blocker([X1 - 1, H, ZS], [X2 + 1, H + 40, ZS + 1]);
  B.blocker([X1 - 1, H, ZN], [X1, H + 40, ZS]);
  B.blocker([X2, H, ZN], [X2 + 1, H + 40, ZS]);
  area([X1, -10, ZN], [X2, 60, ZS], { atmosphere: 'verdant', ambient: 'amb_swamp', music: 'music_green' });
  for (const [x, z, c] of [[578, -530, 0x9dff9a], [604, -548, 0x7dffb0], [630, -560, 0xb0ff8a], [670, -540, 0x9dffb0], [620, -615, 0xa0ffa0]]) light(x, 7, z, c, 26, 30);

  // ---- SNAPJAW GARDEN (south-west)
  C.snapjaw([572, 0, -530], { color: GREEN });
  C.snapjaw([590, 0, -526], { color: RED, shields: [GREEN] }); // a red body under a green shield
  C.snapjaw([X1, 4, -548], { mount: [1, 0, 0], color: YELLOW, reach: 5 }); // out of the west wall
  box(576, 8, -566, 592, 9, -552); // an overhang on two pillars, a snapjaw hanging under it
  box(576, 0, -566, 577, 8, -565);
  box(591, 0, -553, 592, 8, -552);
  C.snapjaw([584, 8, -559], { mount: 'ceiling', color: GREEN, reach: 5 });
  C.snapjaw([604, -0.4, -549], { emerge: true, color: BLUE, depth: 4.5 }); // lurking in the pool
  C.snapjaw([572, 0, -585], { uproot: { speed: 0.8, leash: 10 }, color: GREEN });
  // a snap pad flings you up onto the ledge north of it
  C.snapPad([600, 0, -577], { push: [0, -8.5], power: 18.5, carry: false });
  box(594, 0, -594, 606, 6, -585);
  devStart('verdantCreatures', [575, 0, -506], 0, ALL, 'Verdant creatures: the snapjaw garden');

  // ---- FLY GROVE (middle): a dead trunk with a ledge high on its east side
  box(626, 0, -556, 634, 30, -548);
  box(634, 6.4, -556, 639, 7, -551); // the ledge (reach it on stuck flies)
  C.rotflies([618, 0, -538], { count: 5, aggro: false, attract: 26, stuckTime: 9, respawn: 4 });
  C.goo([626, 3, -553], [-1, 0, 0], { permanent: true }); // a pre-gooed spot on the trunk's west face
  C.rotflies([650, 0, -585], { count: 5, color: [GREEN, GREEN, YELLOW], aggro: true, respawn: 10 });
  devStart('verdantFlies', [620, 0, -530], -0.43, ALL, 'Verdant creatures: the fly grove');

  // ---- BORER WALL (east)
  C.borer([X2, 2.6, -520], [-1, 0, 0], { color: GREEN });
  C.borer([X2, 5.2, -536], [-1, 0, 0], { color: YELLOW });
  C.borer([X2, 2.2, -552], [-1, 0, 0], { color: BLUE });
  C.borer([668, 0, -528], [0, 1, 0], { color: GREEN, length: 16 });
  // two platforms with a gap between: a bridge worm arches out of one's side into the other's
  box(654, 0, -582, 664, 4, -566);
  box(678, 0, -582, 688, 4, -566);
  C.borer([664, 3.2, -574], [1, 0, 0], { mode: 'bridge', to: [678, 3.2, -574], toNormal: [-1, 0, 0], color: GREEN, interval: 5, holdTime: 5 });
  devStart('verdantBorers', [668, 0, -510], -0.7, ALL, 'Verdant creatures: the borer wall');

  // ---- THE FLY RIDE (south): a plank to board from, a loop round the clearing
  box(603.4, 3.6, -607.5, 609, 4, -604.5, 'floor');
  box(608, 0, -607.5, 609, 3.6, -604.5);
  box(627, 14, -548, 631, 14.6, -540); // a branch off the trunk's south side: a snapjaw hangs from it
  C.snapjaw([629, 14, -542.5], { mount: 'ceiling', color: YELLOW, reach: 7, range: 18 });
  const ride = C.flyRide({
    start: [602.4, 4, -606],
    yaw: 0,
    loop: true,
    speed: 11,
    checkpoint: [607, 4, -606],
    path: [[602, 6, -622], [590, 8, -636], [570, 10, -628], [567, 11, -600], [574, 12, -572], [592, 12, -546], [612, 11, -536], [628, 11, -537], [642, 10, -544], [654, 10, -562], [664, 9, -592], [650, 7, -628], [624, 5, -632]],
    spawns: [
      { u: 0.08, type: 'rotflies', rel: [0, 3, 22], count: 4 },
      { u: 0.3, type: 'drone', rel: [-14, 5, 16], color: GREEN, life: 22 },
      { u: 0.32, type: 'drone', rel: [14, 4, 12], color: RED, life: 22 },
      { u: 0.42, type: 'borer', pos: [630, 11.5, -548], normal: [0, 0, 1], range: 12, length: 26, color: GREEN },
      { u: 0.62, type: 'rotflies', rel: [8, 2, 20], count: 3, colors: [GREEN, BLUE] },
    ],
    title: ['VERDANT · HOLD ON', 'THE FLY'],
  });
  level.flyRide = ride; // (for console poking and the automated tests)
  devStart('verdantFlyRide', [607.5, 4, -606], Math.PI / 2, ALL, 'Verdant creatures: the fly ride');
}
