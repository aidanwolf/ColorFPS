// CRIMSON FOUNDRY — the opening level, laid out north (-z) from the spawn room:
// spawn room (vent secret + yellow door secret) → barrier corridor → the Crucible (floating platforms
// over acid) → barrier corridor → the Hub's south door at z = -100.
import { RED, YELLOW } from '../colors.js';
import { Barrier } from '../entities/barrier.js';
import { Drone } from '../entities/drone.js';
import { MovingPlatform, Checkpoint } from '../entities/misc.js';

export function buildRed(B) {
  const { W, game, CH, room, corridor, tunnelX, plat, pedestal, secretRoom, trophy, hint, area, light, barrierWall, devStart } = B;
  const zone = 'red';
  room({
    x1: -6, x2: 6, zS: 0, zN: -12, y: 0, h: 6, zone,
    n: [{ c: 0, w: 3, h: CH }],
    e: [{ c: -9, w: 1.2, h: 1.0 }],
    w: [{ c: -6, w: 2.4, h: 3 }],
  });
  // the Chroma Blaster on its pedestal
  pedestal(0, 0, -6, RED, zone);
  light(0, 5, -6, 0xffb0a0, 25, 20);
  // vent hint: hazard stripes above the crawlspace
  W.deco(5.95, 1.0, -9.8, 6.0, 1.2, -8.2, 'hazard', zone);
  W.deco(5.95, 0, -9.75, 6.0, 1.0, -9.6, 'hazard', zone);
  W.deco(5.95, 0, -8.4, 6.0, 1.0, -8.25, 'hazard', zone);

  // SECRET 1 — crawl through the vent
  tunnelX({ x1: 6.5, x2: 13.5, zc: -9, w: 1.2, y: 0, h: 1.0, zone });
  room({ x1: 14, x2: 18, zS: -6, zN: -12, y: 0, h: 3, zone, w: [{ c: -9, w: 1.2, h: 1.0 }] });
  trophy(16, 1, -9);
  light(16, 2.5, -9, 0xffcc55, 8, 8);
  secretRoom([14, 0, -12], [18, 3, -6], 'Maintenance Vent');

  // SECRET 2 — yellow door in the west wall (come back after Sector 2)
  new Barrier(W, { min: [-6.5, 0, -7.2], max: [-6, 3, -4.8], color: YELLOW, kind: 'door', zone });
  room({ x1: -13, x2: -7, zS: -3, zN: -9, y: 0, h: 4, zone, e: [{ c: -6, w: 2.4, h: 3 }] });
  trophy(-10, 1, -6);
  light(-10, 3.5, -6, 0xffd23a, 8, 9);
  secretRoom([-13, 0, -9], [-7, 3, -3], 'Solar Cache');

  // corridor of red barriers
  corridor({ zStart: -12.5, zEnd: -34.5, y: 0, zone });
  hint([-1.5, 0, -15], [1.5, 3, -13], 'Barriers only break under <b>their own color</b>. Hold <b>LMB</b> to fire.');
  barrierWall(-17.5, 0, RED, zone);
  barrierWall(-21.5, 0, RED, zone);
  barrierWall(-25.5, 0, RED, zone);
  new Drone(W, { pos: [0, 2.2, -31], color: RED, orbit: 0.5, range: 18 });

  // the Crucible — floating platforms over molten acid
  const zS = -35, zN = -81, z = (lz) => zS - lz;
  room({
    x1: -14, x2: 14, zS, zN, y: -6, h: 20, zone,
    s: [{ c: 0, w: 3, h: CH, y0: 6 }],
    n: [{ c: 0, w: 3, h: CH, y0: 10 }],
  });
  W.box(-14, -6, zN, 14, -5.6, zS, 'acid', zone, { hazard: 'acid' });
  W.box(-5, -6, z(6), 5, 0, zS, 'plat', zone);
  new Checkpoint(W, game, { pos: [0, 0, z(3)], yaw: 0, size: [10, 3, 6] });
  hint([-5, 0, z(6)], [5, 3, z(3)], 'Platforms ahead. <b>Space</b> to jump — falling in the acid costs health.');
  plat(-1.5, z(8.5), 1.5, z(11.5), 0.5, zone);
  plat(-6.5, z(13), -3.5, z(16), 1.2, zone);
  new MovingPlatform(W, { min: [-6.5, 1.2, z(21)], max: [-3.5, 1.8, z(18)], offset: [10, 0, 0], speed: 2.2, zone });
  plat(3.25, z(22.75), 6.75, z(26.25), 2.4, zone);
  new Barrier(W, { min: [3.25, 2.4, z(26.25)], max: [6.75, 3.0, z(22.75)], color: RED, kind: 'spike', regen: 4, zone });
  hint([-6.5, 1.8, z(21)], [6.5, 4, z(18)], 'Spikes shatter under matching fire — <b>clear them before you land</b>.');
  plat(-1.5, z(28.5), 1.5, z(31.5), 3.2, zone);
  plat(-6.5, z(33.5), -3.5, z(36.5), 3.8, zone);
  W.box(-6, -6, zN, 6, 4, z(39), 'plat', zone);
  new Drone(W, { pos: [-8, 5, z(18)], color: RED, range: 24 });
  new Drone(W, { pos: [8, 6.5, z(30)], color: RED, range: 24 });
  new Drone(W, { pos: [0, 8, z(40)], color: RED, range: 24 });
  light(0, 11, z(14), 0xff5533, 60, 40);
  light(0, 11, z(36), 0xff5533, 60, 40);

  corridor({ zStart: -81.5, zEnd: -99.5, y: 4, zone }); // runs into the Hub's south door
  barrierWall(-86, 4, RED, zone);
  barrierWall(-90, 4, RED, zone);
  new Drone(W, { pos: [0, 6, -93.5], color: RED, orbit: 0.4, range: 14 });

  area([-6, 0, -12], [6, 6, 0], { ambient: 'amb_foundry', atmosphere: 'foundry' });
  area([-1.5, 4, -99.5], [1.5, 7, -95], { music: 'music_red', ambient: 'amb_foundry', atmosphere: 'foundry' });
  devStart('red', [0, 0, -2], 0, []);
  devStart('crucible', [0, 0, -38], 0, [RED]);
}
