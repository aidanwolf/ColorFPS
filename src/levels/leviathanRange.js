// DEV ONLY (?dev): the leviathan arena on its own, far off the map, for testing the fight.
//   ?dev&start=leviathan drops you on the alcove's shore ledge with every color.
import { buildLeviathanArena } from './leviathanArena.js';

export function buildLeviathanRange(B) {
  if (!new URLSearchParams(location.search).has('dev')) return;
  const { level, game, devStart } = B;
  const arena = buildLeviathanArena(B, {
    center: [420, -10, -480],
    door: false,
    world: 'leviathanRange', // a stand-in name, so the dev range never shuts the real Azure world down
    onDefeated: () => game.hud.message('Dev range: engine down, fight complete.', 4),
  });
  level.leviathanRange = arena; // for console poking / automated tests
  devStart('leviathan', arena.checkpoint, 0, [0, 1, 2, 3]);
}
