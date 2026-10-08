// DEV-ONLY boss range (?dev): mini-bosses built far off the map so they can be tried in isolation before
// a world places them.
//  ?dev&start=sphinx   the Sphinx in its own Sun Court, with the sun-lens power source (RED + YELLOW)
//  ?dev&start=sphinx2  the Sphinx dropped into a bare arena shell, the way a world places it (shell: false)
import { placeSphinx, buildSphinxArena } from './sphinxArena.js';

export function buildBossRange(B) {
  if (!new URLSearchParams(location.search).has('dev')) return;
  const { W, area, devStart } = B;
  const R = (x1, y1, z1, x2, y2, z2) => W.box(x1, y1, z1, x2, y2, z2, 'rock', 'yellow');

  // ---- the full Sun Court
  const court = buildSphinxArena(B, { center: [420, 0, -320], size: 44, entry: 's', exit: 'n', powerSource: true });
  // cap the corridor stubs (in a real world they lead on) and give the range the Solar mood
  for (const [x, y, z] of [court.entryEnd, court.exitEnd]) R(x - 2, y - 1, z - 0.5, x + 2, y + 3.7, z + 0.5);
  area([398, -2, -342], [442, 12, -290], { ambient: 'amb_solar', atmosphere: 'solar' });
  devStart('sphinx', court.checkpoint, court.checkpointYaw, [0, 1]);

  // ---- a bare 50 × 50 m arena a world might provide: floor, walls, a 3 m doorway in the south wall
  const cx = 520, cz = -320, h = 25, y = 0;
  R(cx - h - 1, y - 1, cz - h - 1, cx + h + 1, y, cz + h + 12);
  R(cx - h - 1, y, cz - h - 1, cx + h + 1, y + 8, cz - h); // north
  R(cx - h - 1, y, cz - h, cx - h, y + 8, cz + h); // west
  R(cx + h, y, cz - h, cx + h + 1, y + 8, cz + h); // east
  R(cx - h - 1, y, cz + h, cx - 1.5, y + 8, cz + h + 1); // south, either side of the doorway
  R(cx + 1.5, y, cz + h, cx + h + 1, y + 8, cz + h + 1);
  R(cx - 1.5, y + 3.2, cz + h, cx + 1.5, y + 8, cz + h + 1);
  R(cx - 2, y, cz + h + 11, cx + 2, y + 4, cz + h + 12); // the approach's back wall
  placeSphinx(B, {
    center: [cx, y, cz],
    size: 50,
    shell: false,
    entry: 's',
    seals: [{ min: [cx - 1.5, y, cz + h + 0.2], max: [cx + 1.5, y + 3.2, cz + h + 0.8] }],
    checkpoint: { pos: [cx, y, cz + h + 6], yaw: 0 },
  });
  area([cx - h, -2, cz - h], [cx + h, 12, cz + h + 12], { ambient: 'amb_solar', atmosphere: 'solar' });
  devStart('sphinx2', [cx, y, cz + h + 6], 0, [0, 1]);
}
