// DEV-ONLY test range for the world creatures (only built with ?dev), off the map at x 628–684:
//  JUNGLE RUIN (z -240 → -284, in the Verdant region): a slime pit and, through a doorway, a pillared hall
//    with a ceiling low enough for the spider bots to crawl over and drop from. ?dev&start=enemiesB
//  FLOODED HALL (z -168 → -228, in the Azure region): a deep pool (swimmable water, air at the surface)
//    with two fish schools and a robo-squid; you start on the deck at the water's edge. ?dev&start=enemiesB2
import { RED, YELLOW, GREEN, BLUE } from '../colors.js';

export function buildEnemyRangeB(B) {
  if (!new URLSearchParams(location.search).has('dev')) return;
  const { W, room, light, devStart, glowEdge } = B;
  const ALL = [RED, YELLOW, GREEN, BLUE];

  // ---------------- JUNGLE RUIN ----------------
  room({ x1: 628, x2: 684, zS: -240, zN: -284, y: 0, h: 8, zone: 'green' });
  // the dividing wall, with a doorway
  B.wallZ(652, 652.5, -284, -240, 0, 8, [{ c: -262, w: 4, h: 4, y0: 0 }], 'green');
  // slime pit: a low step, a raised ruin platform and broken columns
  W.box(632, 0, -262, 640, 0.35, -254, 'rock', 'green');
  W.box(642, 0, -280, 650, 1.6, -272, 'rock', 'green');
  glowEdge(642, -280, 650, -272, 1.6, 'glow2', 'green');
  W.box(633, 0, -276, 634.5, 3, -274.5, 'rock', 'green');
  W.box(645, 0, -252, 646.2, 2.2, -250.8, 'rock', 'green');
  B.slime([637, 0, -268], { color: GREEN, core: RED });
  B.slime([646, 1.6, -276], { color: YELLOW, core: BLUE });
  B.slime([644, 0, -260], { color: GREEN, core: BLUE, size: 0.85 });
  // spider hall: columns to the ceiling, a broken low wall, mossy lumps
  for (const [x, z] of [[660, -252], [676, -252], [660, -274], [676, -274]]) {
    W.box(x - 0.8, 0, z - 0.8, x + 0.8, 8, z + 0.8, 'rock', 'green');
    W.deco(x - 0.85, 4.2, z - 0.85, x + 0.85, 4.3, z + 0.85, 'glow2', 'green');
  }
  W.box(664, 0, -264, 672, 1.2, -263, 'rock', 'green');
  B.spiderBot([668, 0, -270]);
  B.spiderBot([668, 0, -256], { color: RED, ceiling: true });
  light(640, 6, -262, 0x7dffa0, 30, 26);
  light(668, 6, -262, 0xa0ffb0, 30, 26);
  devStart('enemiesB', [640, 0, -243], 0, ALL);
  devStart('enemiesBspider', [668, 0, -243], 0, ALL);

  // ---------------- FLOODED HALL ----------------
  room({ x1: 628, x2: 684, zS: -168, zN: -228, y: 0, h: 12, zone: 'blue', floor: false });
  // deck round the pool (top y 0), basin walls and bed
  W.box(628, -1, -176, 684, 0, -168, 'floor', 'blue');
  W.box(628, -1, -228, 684, 0, -220, 'floor', 'blue');
  W.box(628, -1, -220, 636, 0, -176, 'floor', 'blue');
  W.box(676, -1, -220, 684, 0, -176, 'floor', 'blue');
  W.box(635.5, -10, -220.5, 636, 0, -175.5, 'wall', 'blue');
  W.box(676, -10, -220.5, 676.5, 0, -175.5, 'wall', 'blue');
  W.box(636, -10, -220.5, 676, 0, -220, 'wall', 'blue');
  W.box(636, -10, -176, 676, 0, -175.5, 'wall', 'blue');
  W.box(635.5, -11, -220.5, 676.5, -10, -175.5, 'floor', 'blue');
  glowEdge(636, -220, 676, -176, 0.02, 'glow3', 'blue');
  // a column breaking the surface and a sunken block for the fish to swim round
  W.box(650, -10, -200, 652, 3, -198, 'rock', 'blue');
  W.box(662, -10, -190, 664, -4, -188, 'rock', 'blue');
  B.water([636, -10, -220], [676, -0.6, -176]);
  B.roboFish([646, -4, -190], { count: 4, color: RED });
  B.roboFish([665, -5, -208], { count: 5, color: [YELLOW, GREEN] });
  B.roboSquid([656, -5, -212], { color: YELLOW });
  light(646, 5, -190, 0x80c0ff, 30, 30);
  light(666, 5, -210, 0x80c0ff, 30, 30);
  light(656, -6, -198, 0x3a8bff, 20, 20);
  devStart('enemiesB2', [656, 0, -173.5], 0, ALL);
}
