// DEV-ONLY: the Thornmaw's courtyard on its own, far off the map, for testing the Verdant mini-boss.
// Built only with ?dev in the URL; ?dev&start=hydra drops you in its entry vestibule with red, yellow
// and green.
import { buildVerdantArena } from './verdantArena.js';

export function buildVerdantBossRange(B) {
  if (!new URLSearchParams(location.search).has('dev')) return;
  const { W } = B;
  const C = [520, 0, -420];
  const arena = buildVerdantArena(B, { center: C, entry: 's', exit: 'n', colors: [0, 1, 2] });
  // a stub of ground to walk in from, and a landing beyond the exit
  const [ex, ey, ez] = arena.entryPos, [xx, xy, xz] = arena.exitPos;
  W.box(ex - 2, ey - 1, ez, ex + 2, ey, ez + 6, 'floor', 'green');
  W.box(xx - 4, xy - 1, xz - 10, xx + 4, xy, xz, 'floor', 'green');
  B.area([C[0] - 30, C[1] - 5, C[2] - 40], [C[0] + 30, C[1] + 40, C[2] + 40], { atmosphere: 'verdant', ambient: 'amb_jungle' });
  B.devStart('hydra', [ex, ey, ez + 3], 0, [0, 1, 2]);
  B.level.hydraRange = arena; // for console poking and automated tests
}
