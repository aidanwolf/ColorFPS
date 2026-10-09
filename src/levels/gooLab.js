// DEV GOO LAB (only with ?dev; ?dev&start=goo): the green glob launcher's goo mechanics side by side, far
// off the map (x 588..652, z -678..-742, in the Verdant region). You start in the south yard facing north:
//  yard (south):   green drones hovering to practise flak bursts and charged shots (one red: no flak), green
//                  slime molds to goo up (wading in goo slows them; stepping in roots them a moment)
//  west lane:      a fast lift too quick to board: goo it at the bottom (goo.registerStickable), hop on, and it
//                  carries you up to the ledge when the goo pops
//  centre lane:    a spiked chasm 2.5 m across: goo it (goo.addGap) and walk the membrane before it bursts
//  east lane:      a Bloom Pad (entities/gooPad.js): glob it, wait out the three beats, stand on it as it
//                  blooms and it throws you up to the high ledge
import * as THREE from 'three';
import { RED, YELLOW, GREEN, BLUE } from '../colors.js';
import { MovingPlatform } from '../entities/misc.js';
import { GooPad } from '../entities/gooPad.js';

export function buildGooLab(B) {
  if (!new URLSearchParams(location.search).has('dev')) return;
  const { W, light, devStart, hint, plat } = B;
  const zone = 'green';
  const say = (min, max, html) => hint(min, max, `<b>GOO LAB</b> · ${html}`, 6);
  const X0 = 588, X1 = 652, Z0 = -678, Z1 = -742;

  // walls round the lab, open to the sky
  W.box(X0 - 1, 0, Z1 - 1, X0, 10, Z0 + 1, 'wall', zone);
  W.box(X1, 0, Z1 - 1, X1 + 1, 10, Z0 + 1, 'wall', zone);
  W.box(X0, 0, Z0, X1, 10, Z0 + 1, 'wall', zone);
  W.box(X0, 0, Z1 - 1, X1, 10, Z1, 'wall', zone);
  // the yard (south) and the lanes' approach strip
  W.box(X0, -1, -700, X1, 0, Z0, 'floor', zone);
  for (const [x, z] of [[600, -688], [620, -688], [640, -688], [598, -712], [620, -715], [642, -715]]) light(x, 9, z, 0xd8ffe0, 26, 30);
  devStart('goo', [620, 0, -682], 0, [RED, YELLOW, GREEN, BLUE], 'Goo Lab (green gun mechanics)');
  // lane dividers
  for (const x of [609, 631]) W.box(x - 0.5, 0, Z1, x + 0.5, 4, -700, 'wall', zone);

  // ---------- yard: drones and slimes ----------
  say([600, 0, -686], [640, 4, -678], 'Green drones: near misses <b>airburst</b> (flak). Hold fire to <b>charge</b> a straight shot. Goo the slimes to slow them.');
  for (const [x, y, z] of [[628, 4.5, -692], [636, 5.5, -688], [644, 4, -694]]) B.enemy('drone', [x, y, z], { color: GREEN, range: 30, fireInterval: 3 });
  B.enemy('drone', [646, 5, -684], { color: RED, range: 30, fireInterval: 3 });
  B.slime([596, 0, -690], { color: GREEN, core: RED });
  B.slime([603, 0, -694], { color: GREEN, core: BLUE, size: 0.85 });

  // ---------- west lane: a sticky lift ----------
  W.box(X0, -1, Z1, 609, 4.5, -706, 'floor', zone); // the high ledge
  W.box(X0, -1, -706, 609, 0, -700, 'floor', zone);
  const lift = new MovingPlatform(W, { min: [597, 0, -705.8], max: [600, 0.4, -702.8], offset: [0, 4.1, 0], speed: 7, pause: 0.15, zone, kind: 'plat' });
  W.goo.registerStickable(lift, { duration: 5 });
  say([590, 0, -706], [608, 4, -700], 'Too fast to board: <b>goo the lift</b> to stick it, hop on, and ride it up when the goo pops.');

  // ---------- centre lane: a goo gap ----------
  W.box(609.5, -1, -702, 630.5, 0, -700, 'floor', zone);
  W.box(616, -6, -704.5, 624, -5, -702, 'floor', zone); // the chasm's floor (spiked)
  B.spikes([616, -5, -704.5], [624, -4.4, -702]);
  W.box(609.5, -6, -704.5, 616, 0, -702, 'wall', zone);
  W.box(624, -6, -704.5, 630.5, 0, -702, 'wall', zone);
  plat(609.5, -704.5, 630.5, Z1, 0, zone, 1);
  W.goo.addGap({ min: [616, -5, -704.5], max: [624, 0, -702] }, { duration: 9 });
  say([610, 0, -702], [630, 4, -700], '<b>Goo the chasm</b> to bridge it with a walkable membrane (9 s).');

  // ---------- east lane: a bloom pad ----------
  W.box(631.5, -1, -709, X1, 0, -700, 'floor', zone);
  W.box(631.5, -1, Z1, X1, 7, -709, 'floor', zone); // the high ledge, 7 m up
  new GooPad(W, { pos: [641.5, 0, -703.5], power: 20, push: [0, 0, -5.5] });
  say([632, 0, -706], [651, 4, -700], '<b>Glob the Bloom Pad</b>: three beats, then it blooms. Be standing on it to be launched.');
}
