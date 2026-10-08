// DEV ONLY (?dev): the Forge Titan's arena on its own, far off the map, for testing the fight.
// ?dev&start=forge drops you in its vestibule with red only (&forgeEntry=e|n|w turns the arena around;
// &forgeShell=0 builds it the way it sits inside a world's own room: no walls, seals or power source).
import { buildForgeArena } from './forgeArena.js';

export function buildForgeRange(B) {
  const params = new URLSearchParams(location.search);
  if (!params.has('dev')) return;
  const { W, level, devStart } = B;
  const center = [520, 0, -320];
  const entry = params.get('forgeEntry') || 's';
  const shell = params.get('forgeShell') !== '0';
  const arena = buildForgeArena(B, { center, entry, shell, powerSource: shell, checkpoint: shell ? null : { pos: [center[0], center[1], center[2] + 16] } });
  // cap the open corridor ends so nobody walks off into the void
  for (const [x, y, z] of shell ? [arena.entryPos, arena.exitPos] : []) {
    const alongZ = Math.abs(z - center[2]) > Math.abs(x - center[0]);
    const o = Math.sign(alongZ ? z - center[2] : x - center[0]) * 0.5;
    if (alongZ) W.box(x - 2, y - 1, Math.min(z, z + o), x + 2, y + 4, Math.max(z, z + o), 'wall', 'red');
    else W.box(Math.min(x, x + o), y - 1, z - 2, Math.max(x, x + o), y + 4, z + 2, 'wall', 'red');
  }
  level.forgeRange = arena;
  const [ex, ey, ez] = arena.entryPos;
  const inward = [Math.sign(center[0] - ex) * 1.5, Math.sign(center[2] - ez) * 1.5];
  const yaw = { s: 0, e: Math.PI / 2, n: Math.PI, w: -Math.PI / 2 }[entry];
  devStart('forge', [ex + (Math.abs(ex - center[0]) > 1 ? inward[0] : 0), ey, ez + (Math.abs(ez - center[2]) > 1 ? inward[1] : 0)], yaw, [0]);
}
