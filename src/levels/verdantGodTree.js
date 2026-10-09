// VERDANT, second half: THE GOD TREE. TEMPORARY STUB (the tree agent replaces this file wholesale).
// It keeps the level completable end to end until the real thing is merged: the landing at the far end of the
// rope bridge (verdantEscape.js), a temporary stair down and walkway to the old Thornmaw courtyard's west entry
// (verdantArena.js, centre [84, 12, -270]), the courtyard, and the old way home: the bridge west from the
// courtyard's south gate to the aqueduct head at (10, 12, -239) (the aqueduct itself is in verdant.js).
//
// buildGodTree(B, { landing: [x, y, z] }) → { objective(p), arena }
import * as THREE from 'three';
import { RED, YELLOW, GREEN } from '../colors.js';
import { buildVerdantArena } from './verdantArena.js';

const EAST = -Math.PI / 2, WEST = Math.PI / 2;

export function buildGodTree(B, { landing = [30, 18, -330] } = {}) {
  const { W, devStart, area, blocker } = B;
  const zone = 'green';
  const RYG = [RED, YELLOW, GREEN];
  const MOOD = { music: 'music_green', ambient: 'amb_jungle', atmosphere: 'verdant' };
  const [lx, ly, lz] = landing;

  // THE LANDING: a 6 x 6 m stone and root platform, top at y 18, the rope bridge arriving at its west edge
  W.box(lx - 3, ly - 1.2, lz - 3, lx + 3, ly, lz + 3, 'rock', zone);
  W.box(lx - 2.5, -30, lz - 2.5, lx + 2.5, ly - 1.2, lz + 2.5, 'rock', zone);
  W.box(lx - 3.05, ly - 0.05, lz - 3.05, lx + 3.05, ly + 0.02, lz + 3.05, 'grass', zone, { solid: false });
  B.glowEdge(lx - 3, lz - 3, lx + 3, lz + 3, ly, 'glow2', zone, 0.06);
  // (temporary) a stair south off the landing down to y 12, then a walkway east to the courtyard's vestibule
  const steps = 20, z0 = lz + 3, z1 = -272;
  for (let i = 0; i < steps; i++) {
    const za = z0 + ((z1 - z0) * i) / steps, zb = z0 + ((z1 - z0) * (i + 1)) / steps, top = ly - ((ly - 12) * (i + 1)) / steps;
    W.box(lx - 1.5, top - 0.6, za, lx + 1.5, top, zb, 'floor', zone);
  }
  W.box(lx - 1.5, -30, z1 - 0.5, lx + 1.5, 11.4, z1 + 1, 'rock', zone);
  W.box(lx - 1.5, 11.4, -271.5, 45, 12, -268.5, 'floor', zone);
  for (const x of [36, 42]) W.box(x - 0.8, -30, -271, x + 0.8, 11.4, -269, 'rock', zone);
  blocker([lx - 2, 12, z1 - 1], [lx - 1.5, 40, z0]);
  blocker([lx + 1.5, 12, z1 + 1.5], [lx + 2, 40, z0]);
  blocker([lx - 1.5, 12, -272], [45, 40, -271.5]);
  blocker([lx - 1.5, 12, -268.5], [45, 40, -268]);
  B.corridorX({ xStart: 45, xEnd: 52.8, y: 12, zone, cz: -270 });
  area([52.8, 12, -271.5], [55, 15, -268.5], MOOD);
  area([lx - 3, ly, lz - 3], [lx + 3, ly + 3, lz + 3], MOOD);
  B.hint([lx - 3, ly, lz - 3], [lx + 3, ly + 3, lz + 3], '(Stub) The god tree is still growing. Take the stair south to the old courtyard.', 4);

  // THE THORNMAW'S COURTYARD (verdantArena.js), as before
  const arena = buildVerdantArena(B, { center: [84, 12, -270], size: 44, entry: 'w', exit: 's', colors: RYG, reactorColor: GREEN, world: 'verdant' });
  B.armor([102.5, 16.2, -287.5]);
  B.armor([65.5, 16.2, -252.5]);
  B.armor([92.8, 12, -270], { base: false });
  W.box(54, -29, -271, 56, 11, -269, 'rock', zone);

  // THE WAY HOME, first leg: from the courtyard's south gate west across to the aqueduct head (x 10, z -239)
  const deck = (x1, z1, x2, z2) => {
    W.box(x1, 11, z1, x2, 12, z2, 'floor', zone);
    W.deco(x1, 11.7, z1 - 0.05, x2, 11.8, z1, 'glow2', zone);
  };
  deck(82.5, -246.8, 85.5, -237.5);
  deck(11.5, -240.5, 85.5, -237.5);
  W.box(82, 12, -246.8, 82.5, 13, -240.5, 'wall', zone);
  W.box(85.5, 12, -246.8, 86, 13, -237, 'wall', zone);
  W.box(11.5, 12, -241, 82.5, 13, -240.5, 'wall', zone);
  W.box(11.5, 12, -237.5, 85.5, 13, -237, 'wall', zone);
  blocker([82, 12, -246.8], [82.5, 40, -240.5]);
  blocker([85.5, 12, -246.8], [86, 40, -237]);
  blocker([11.5, 12, -241], [82.5, 40, -240.5]);
  blocker([11.5, 12, -237.5], [85.5, 40, -237]);
  for (const x of [20, 34, 48, 66]) W.box(x - 1, -2, -240, x + 1, 11, -238, 'rock', zone);

  devStart('verdant12', arena.checkpoint, EAST, RYG, 'The Thornmaw');
  devStart('verdant13', [80, 12, -239], WEST, RYG, 'The way home');

  function objective(p) {
    const boss = arena?.boss;
    if (p.x > 60.8 && p.x < 107.2 && p.z < -246.8 && p.z > -293.2) {
      if (boss?.defeated) return 'The Heart is exposed: shut it down with <b style="color:#3dff7a">green</b>.';
      return boss?.state === 'dormant' ? 'Into the courtyard.' : '';
    }
    if (p.y > 11 && p.z > -247 && p.z < -236 && p.x > 11) return 'West along the bridge to the aqueduct, and home.';
    if (Math.abs(p.x - lx) < 3.5 && p.z < lz + 3.5 && p.z > -330 - 3.5 && p.y > ly - 1) return 'Down the stair <b>south</b>, then east to the courtyard.';
    if (p.x > lx - 2 && p.x < 56 && p.z > -335 && p.z < -266 && p.y > 10) return 'On to the Thornmaw\'s courtyard, <b>east</b>.';
    return '';
  }
  return { objective, arena };
}
