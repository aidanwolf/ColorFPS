// The demo level, laid out north (-z) from the spawn room:
//  Sector 1 CRIMSON FOUNDRY  spawn room (vent secret + yellow door secret) → barrier corridor → floating-platform hall
//  Sector 2 AMBER CONDUITS   gate (unlock yellow) → switching gauntlet + crawlspace (green door secret) → open-air spike spire
//  Sector 3 OVERGROWTH YARD  gate (unlock green) → courtyard islands, jump pad, the red/yellow/green spike drop, crawl hut secret
//  Sector 4 AZURE GAUNTLET   blue door secret → gate (unlock blue) → four-color sprint with a crawlspace
//  PRISM CORE                antechamber → sealed arena with the Prism Warden
import * as THREE from 'three';
import { RED, YELLOW, GREEN, BLUE } from './colors.js';
import { Barrier } from './entities/barrier.js';
import { Drone } from './entities/drone.js';
import { Pickup, MovingPlatform, JumpPad, Checkpoint } from './entities/misc.js';
import { Boss } from './boss.js';
import { Mirror, Glass, TargetPanel, SlidingDoor } from './entities/puzzle.js';

const T = 0.5; // wall thickness
const CH = 3.2; // corridor height
const GLOW = { red: 'glow0', yellow: 'glow1', green: 'glow2', blue: 'glow3', boss: 'trimWhite' };

export function buildLevel(world, game) {
  const W = world;
  const level = { secretsTotal: 0, spawn: new THREE.Vector3(0, 0, -2), spawnYaw: 0 };

  // ------------------------------------------------------------------ builders
  // A wall along x (thickness z1..z2) with rectangular openings centered at c (x), bottom y0, height h.
  function wallX(z1, z2, x1, x2, yb, yt, openings, zone, kind = 'wall') {
    let x = x1;
    for (const o of [...openings].sort((a, b) => a.c - b.c)) {
      const a = o.c - o.w / 2, b = o.c + o.w / 2;
      W.box(x, yb, z1, a, yt, z2, kind, zone);
      if (o.y0 > yb) W.box(a, yb, z1, b, o.y0, z2, kind, zone);
      if (o.y0 + o.h < yt) W.box(a, o.y0 + o.h, z1, b, yt, z2, kind, zone);
      x = b;
    }
    W.box(x, yb, z1, x2, yt, z2, kind, zone);
  }
  // A wall along z (thickness x1..x2); opening centers c are z coordinates.
  function wallZ(x1, x2, z1, z2, yb, yt, openings, zone, kind = 'wall') {
    let z = z1;
    for (const o of [...openings].sort((a, b) => a.c - b.c)) {
      const a = o.c - o.w / 2, b = o.c + o.w / 2;
      W.box(x1, yb, z, x2, yt, a, kind, zone);
      if (o.y0 > yb) W.box(x1, yb, a, x2, o.y0, b, kind, zone);
      if (o.y0 + o.h < yt) W.box(x1, o.y0 + o.h, a, x2, yt, b, kind, zone);
      z = b;
    }
    W.box(x1, yb, z, x2, yt, z2, kind, zone);
  }
  const abs = (y, list) => (list || []).map((o) => ({ ...o, y0: y + (o.y0 || 0) }));

  // Room: interior x1..x2, z from zS (south, larger) to zN (north), floor top at y, height h.
  function room({ x1, x2, zS, zN, y, h, zone, n, s, e, w, ceiling = true, floor = true, trim = true }) {
    if (floor) W.box(x1 - T, y - 1, zN - T, x2 + T, y, zS + T, 'floor', zone);
    if (ceiling) W.box(x1 - T, y + h, zN - T, x2 + T, y + h + 0.5, zS + T, 'ceil', zone);
    wallX(zS, zS + T, x1, x2, y, y + h, abs(y, s), zone);
    wallX(zN - T, zN, x1, x2, y, y + h, abs(y, n), zone);
    wallZ(x2, x2 + T, zN - T, zS + T, y, y + h, abs(y, e), zone);
    wallZ(x1 - T, x1, zN - T, zS + T, y, y + h, abs(y, w), zone);
    if (trim && h > 3) {
      const g = GLOW[zone];
      const ty = y + Math.min(h - 0.6, 4.2);
      W.deco(x1, ty, zN, x1 + 0.05, ty + 0.08, zS, g, zone);
      W.deco(x2 - 0.05, ty, zN, x2, ty + 0.08, zS, g, zone);
    }
  }

  // North-running corridor between zStart and zEnd (zEnd < zStart), 3 m wide.
  function corridor({ zStart, zEnd, y, zone, e, w, low = [], h = CH }) {
    const x1 = -1.5, x2 = 1.5;
    W.box(x1 - T, y - 1, zEnd, x2 + T, y, zStart, 'floor', zone);
    W.box(x1 - T, y + h, zEnd, x2 + T, y + h + 0.5, zStart, 'ceil', zone);
    wallZ(x2, x2 + T, zEnd, zStart, y, y + h, abs(y, e), zone);
    wallZ(x1 - T, x1, zEnd, zStart, y, y + h, abs(y, w), zone);
    for (const l of low) W.box(x1, y + l.h, l.z2, x2, y + h, l.z1, 'metal', zone);
    // glowing base strips guide the eye down the hall
    const g = GLOW[zone];
    W.deco(x1, y + 0.02, zEnd, x1 + 0.06, y + 0.1, zStart, g, zone);
    W.deco(x2 - 0.06, y + 0.02, zEnd, x2, y + 0.1, zStart, g, zone);
  }

  function tunnelX({ x1, x2, zc, w, y, h, zone }) {
    const a = zc - w / 2, b = zc + w / 2;
    W.box(x1, y - 0.5, a - T, x2, y, b + T, 'grate', zone);
    W.box(x1, y + h, a - T, x2, y + h + 0.5, b + T, 'metal', zone);
    W.box(x1, y, a - T, x2, y + h, a, 'metal', zone);
    W.box(x1, y, b, x2, y + h, b + T, 'metal', zone);
  }

  // Floating slab with neon edge lines so its outline reads mid-jump.
  function plat(x1, z1, x2, z2, top, zone, thick = 0.6) {
    W.box(x1, top - thick, z1, x2, top, z2, 'plat', zone);
    const za = Math.min(z1, z2), zb = Math.max(z1, z2), g = GLOW[zone], y1 = top - 0.12, y2 = top - 0.04, o = 0.02;
    W.deco(x1 - o, y1, za - o, x2 + o, y2, za, g, zone);
    W.deco(x1 - o, y1, zb, x2 + o, y2, zb + o, g, zone);
    W.deco(x1 - o, y1, za, x1, y2, zb, g, zone);
    W.deco(x2, y1, za, x2 + o, y2, zb, g, zone);
  }

  function pedestal(x, y, z, color, zone) {
    W.box(x - 0.7, y, z - 0.7, x + 0.7, y + 0.9, z + 0.7, 'metal', zone);
    W.deco(x - 0.75, y + 0.9, z - 0.75, x + 0.75, y + 0.98, z + 0.75, GLOW[zone], zone);
    return new Pickup(W, { pos: [x, y + 1.8, z], type: 'color', color, onCollect: (pk) => game.unlockColor(color, pk.pos) });
  }

  function secretRoom(min, max, label) {
    level.secretsTotal++;
    W.trigger(min, max, () => game.foundSecret(label));
  }

  // A side alcove off a gate room's east wall (x = 5), centered on zc: a glass wall you can't climb, open
  // above. Behind it the ceiling and side walls reflect (mirrors, or energy panels of another color) and
  // the floor and back wall are one big target, so nearly any shot fired over the glass lands on it.
  function sideAlcove({ zc, y, color, zone, onActivate, reflector = null }) {
    const z1 = zc - 1.5, z2 = zc + 1.5, top = y + 4, glassTop = y + 2.6;
    room({ x1: 6, x2: 11.5, zS: z2, zN: z1, y, h: 4, zone, w: [{ c: zc, w: 3, h: 4 }], trim: false });
    new Glass(W, { min: [6.6, y, z1], max: [6.7, glassTop, z2] });
    W.deco(6.55, glassTop, z1, 6.75, glassTop + 0.06, z2, GLOW[zone], zone); // glowing lip marks the glass top
    const reflect = (min, max) =>
      reflector === null ? new Mirror(W, { min, max }) : new Barrier(W, { min, max, color: reflector, kind: 'wall', regen: 2.5, zone });
    reflect([6.7, top - 0.15, z1], [11.5, top, z2]);
    reflect([6.7, y, z1], [11.3, top - 0.15, z1 + 0.1]);
    reflect([6.7, y, z2 - 0.1], [11.3, top - 0.15, z2]);
    let done = false;
    const once = () => {
      if (done) return;
      done = true;
      onActivate();
    };
    const panels = [
      new TargetPanel(W, { min: [6.8, y, z1 + 0.1], max: [11.3, y + 0.12, z2 - 0.1], color, face: 'up', onActivate: once }),
      new TargetPanel(W, { min: [11.3, y + 0.12, z1 + 0.1], max: [11.5, top - 0.15, z2 - 0.1], color, face: '-x', onActivate: once }),
    ];
    panels.forEach((p) => (p.group = panels));
  }

  const hint = (min, max, html, time = 5) => W.trigger(min, max, () => game.hud.message(html, time));
  const zoneTitle = (min, max, sub, main, color) => W.trigger(min, max, () => game.enterZone(sub, main, color));
  const light = (x, y, z, color, intensity = 30, dist = 30) => {
    const l = new THREE.PointLight(color, intensity, dist, 1.5);
    l.position.set(x, y, z);
    W.scene.add(l);
  };
  const barrierWall = (z, y, color, zone, h = CH) =>
    new Barrier(W, { min: [-1.5, y, z - 0.2], max: [1.5, y + h, z + 0.2], color, kind: 'wall', zone });
  const tree = (x, y, z) => {
    W.box(x - 0.3, y, z - 0.3, x + 0.3, y + 2.8, z + 0.3, 'rock', 'green');
    const canopy = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 0), new THREE.MeshStandardMaterial({ color: 0x2f8a46, flatShading: true, roughness: 1 }));
    canopy.position.set(x, y + 3.6, z);
    canopy.scale.y = 1.2;
    W.scene.add(canopy);
  };

  // ================================================================== SECTOR 1 — CRIMSON FOUNDRY
  {
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
    new Pickup(W, { pos: [16, 1, -9], type: 'maxhp', amount: 20 });
    light(16, 2.5, -9, 0xffcc55, 8, 8);
    secretRoom([14, 0, -12], [18, 3, -6], 'Maintenance Vent');

    // SECRET 2 — yellow door in the west wall (come back after Sector 2)
    new Barrier(W, { min: [-6.5, 0, -7.2], max: [-6, 3, -4.8], color: YELLOW, kind: 'door', zone });
    room({ x1: -13, x2: -7, zS: -3, zN: -9, y: 0, h: 4, zone, e: [{ c: -6, w: 2.4, h: 3 }] });
    new Pickup(W, { pos: [-10, 1, -6], type: 'maxhp', amount: 20 });
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

    corridor({ zStart: -81.5, zEnd: -95.5, y: 4, zone });
    barrierWall(-86, 4, RED, zone);
    barrierWall(-90, 4, RED, zone);
    new Drone(W, { pos: [0, 6, -93.5], color: RED, orbit: 0.4, range: 14 });
  }

  // ================================================================== SECTOR 2 — AMBER CONDUITS
  {
    const zone = 'yellow';
    room({ x1: -5, x2: 5, zS: -96, zN: -106, y: 4, h: 5, zone, s: [{ c: 0, w: 3, h: CH }], n: [{ c: 0, w: 3, h: CH }], e: [{ c: -101, w: 3, h: 4 }] });
    pedestal(0, 4, -101, YELLOW, zone);
    // PUZZLE: the exit is sealed. A side alcove is walled off by glass you can't climb, open above it.
    // Behind the glass the ceiling and side walls are mirrors and the floor and back wall are one big
    // target, so almost any yellow shot fired over the glass ends up on it.
    const doorA = new SlidingDoor(W, { min: [-1.5, 4, -106.5], max: [1.5, 7.2, -106], color: YELLOW, zone });
    sideAlcove({ zc: -101, y: 4, color: YELLOW, zone, onActivate: () => {
      doorA.open();
      game.hud.message('Exit unsealed!', 2.5);
    } });
    hint([-5, 4, -106], [5, 7, -103.5], 'The exit is sealed. <b>Shoot over the glass</b> in the side alcove: the mirrors carry yellow to the target.', 6);
    new Checkpoint(W, game, { pos: [0, 4, -97.5], yaw: 0, size: [10, 3, 3] });
    zoneTitle([-5, 4, -98], [5, 7, -96], 'SECTOR 2', 'AMBER CONDUITS', '#ffd23a');
    light(0, 8, -101, 0xffd23a, 20, 16);

    // the switching gauntlet
    const z0 = -106.5, d = (k) => z0 - k;
    corridor({
      zStart: z0, zEnd: -140.5, y: 4, zone,
      w: [{ c: d(12), w: 2.4, h: 3 }],
      low: [{ z1: d(30), z2: -140.5, h: 1.1 }],
    });
    hint([-1.5, 4, d(3)], [1.5, 7, d(1)], 'Switch colors with <b>1-4</b>, <b>Q</b>/<b>E</b> or the <b>mouse wheel</b>. <b>F</b> swaps to your last color.');
    [[4, YELLOW], [7, RED], [10, YELLOW], [13, YELLOW], [16, RED], [22, RED], [24, YELLOW], [26, RED], [28, YELLOW]].forEach(([k, c]) => barrierWall(d(k), 4, c, zone));
    new Drone(W, { pos: [0, 6.2, d(19.5)], color: [RED, YELLOW], orbit: 0.4, range: 16, cycle: 2 });
    hint([-1.5, 4, d(26)], [1.5, 7, d(24)], 'Low passage ahead — hold <b>Ctrl</b> or <b>C</b> to crouch.');

    // SECRET 3 — green door (come back after Sector 3)
    new Barrier(W, { min: [-2, 4, d(13.2)], max: [-1.5, 7, d(10.8)], color: GREEN, kind: 'door', zone });
    room({ x1: -8.5, x2: -2.5, zS: d(9), zN: d(15), y: 4, h: 3.5, zone, e: [{ c: d(12), w: 2.4, h: 3 }] });
    new Pickup(W, { pos: [-5.5, 5, d(12)], type: 'maxhp', amount: 20 });
    light(-5.5, 7, d(12), 0x3dff7a, 8, 9);
    secretRoom([-8.5, 4, d(15)], [-2.5, 7, d(9)], 'Verdant Stash');

    // the Spike Spire — open sky
    const zS = -141, zN = -177, z = (lz) => zS - lz;
    room({
      x1: -12, x2: 12, zS, zN, y: -4, h: 28, zone, ceiling: false,
      s: [{ c: 0, w: 3, h: CH, y0: 8 }],
      n: [{ c: 0, w: 3, h: CH, y0: 7 }],
    });
    W.box(-12, -4, zN, 12, -3.6, zS, 'acid', zone, { hazard: 'acid' });
    W.box(-4, -4, z(5), 4, 4, zS, 'plat', zone);
    new Checkpoint(W, game, { pos: [0, 4, z(2.5)], yaw: 0, size: [8, 3, 5] });
    W.trigger([-4, 4, z(5)], [4, 8, zS], () => game.setAmbient('amb_wind'), { once: false });
    plat(2.5, z(7), 5.5, z(10), 5.0, zone);
    plat(6.5, z(10.5), 9.5, z(13.5), 6.2, zone);
    plat(4.5, z(15), 7.5, z(18), 7.4, zone);
    plat(-0.5, z(16.5), 2.5, z(19.5), 8.6, zone);
    plat(-6, z(16), -2, z(20), 9.8, zone); // perch
    hint([-6, 9.8, z(20)], [-2, 12, z(16)], 'Drop onto the safe platform — <b>clear each spike layer as you fall</b>!', 6);
    // safe platform below a red/yellow spike stack
    plat(-6, z(22), -2, z(26), 1.0, zone);
    new Barrier(W, { min: [-6, 6.4, z(26)], max: [-2, 7.0, z(22)], color: RED, kind: 'spike', regen: 2.2, zone });
    new Barrier(W, { min: [-6, 3.8, z(26)], max: [-2, 4.4, z(22)], color: YELLOW, kind: 'spike', regen: 2.2, zone });
    new Checkpoint(W, game, { pos: [-4, 1, z(24)], yaw: 0, size: [4, 2, 4] });
    // a return lift for backtracking, switched on once you've made the drop
    const lift = new MovingPlatform(W, { min: [-10.5, 0.4, z(25)], max: [-7.5, 1.0, z(22)], offset: [0, 8.8, 0], speed: 2.5, active: false, zone, pause: 1.2 });
    W.trigger([-6, 1, z(26)], [-2, 3, z(22)], () => (lift.active = true));
    plat(0.5, z(27), 3.5, z(30), 2.0, zone);
    W.box(-4, -4, zN, 4, 3, z(31), 'plat', zone);
    new Drone(W, { pos: [8, 10, z(21)], color: YELLOW, range: 26 });
    new Drone(W, { pos: [-8, 12, z(10)], color: RED, range: 26 });
    new Drone(W, { pos: [6, 8, z(29)], color: [RED, YELLOW], range: 22 });

    corridor({ zStart: -177.5, zEnd: -187.5, y: 3, zone });
    W.trigger([-1.5, 3, -181], [1.5, 6, -178], () => game.setAmbient('amb_foundry'), { once: false });
    barrierWall(-180.5, 3, YELLOW, zone);
    barrierWall(-183.5, 3, RED, zone);
  }

  // ================================================================== SECTOR 3 — OVERGROWTH YARD
  {
    const zone = 'green';
    room({ x1: -5, x2: 5, zS: -188, zN: -198, y: 3, h: 5, zone, s: [{ c: 0, w: 3, h: CH }], n: [{ c: 0, w: 3, h: CH }], e: [{ c: -193, w: 3, h: 4 }] });
    pedestal(0, 3, -193, GREEN, zone);
    // PUZZLE: no mirrors this time. The alcove is lined with red energy panels, and green bounces off red.
    const doorB = new SlidingDoor(W, { min: [-1.5, 3, -198.5], max: [1.5, 6.2, -198], color: GREEN, zone });
    sideAlcove({ zc: -193, y: 3, color: GREEN, zone, reflector: RED, onActivate: () => {
      doorB.open();
      game.hud.message('Exit unsealed!', 2.5);
    } });
    hint([-5, 3, -198], [5, 6, -195.5], 'Sealed again, and no mirrors. <b>Wrong colors bounce</b>: fire green over the glass and let the <b>red panels</b> carry it.', 6);
    new Checkpoint(W, game, { pos: [0, 3, -189.5], yaw: 0, size: [10, 3, 3] });
    zoneTitle([-5, 3, -190], [5, 6, -188], 'SECTOR 3', 'OVERGROWTH YARD', '#3dff7a');
    light(0, 7, -193, 0x3dff7a, 20, 16);

    corridor({ zStart: -198.5, zEnd: -210.5, y: 3, zone });
    barrierWall(-201.5, 3, GREEN, zone);
    barrierWall(-204, 3, RED, zone);
    barrierWall(-206.5, 3, GREEN, zone);
    barrierWall(-208.5, 3, YELLOW, zone);

    const zS = -211, zN = -271, z = (lz) => zS - lz;
    room({
      x1: -20, x2: 20, zS, zN, y: -6, h: 32, zone, ceiling: false,
      s: [{ c: 0, w: 3, h: CH, y0: 9 }],
      n: [{ c: 0, w: 3, h: CH, y0: 10.4 }],
    });
    W.box(-20, -6, zN, 20, -5.6, zS, 'acid', zone, { hazard: 'acid' });
    W.box(-5, -6, z(6), 5, 3, zS, 'plat', zone);
    new Checkpoint(W, game, { pos: [0, 3, z(3)], yaw: 0, size: [10, 3, 6] });
    W.trigger([-5, 3, z(6)], [5, 7, zS], () => game.setAmbient('amb_jungle'), { once: false });

    // island one, with a crawl-in hut
    W.box(-12, -1, z(20), -2, 1.9, z(10), 'rock', zone);
    W.box(-12, 1.9, z(20), -2, 2.0, z(10), 'grass', zone);
    tree(-10.5, 2, z(18.5));
    // PUZZLE: the bridge to island two is offline. A kiosk on the island faces you with a glass front;
    // shoot yellow over the glass and its mirror-lined inside carries the shot to the target.
    {
      const x1 = -6.6, x2 = -3.4, zf = z(16.5), zb = z(19.5), y = 2, top = 6, gt = 4.6;
      W.box(x1 - 0.2, y, zb - 0.2, x1, top + 0.2, zf, 'wall', zone);
      W.box(x2, y, zb - 0.2, x2 + 0.2, top + 0.2, zf, 'wall', zone);
      W.box(x1 - 0.2, y, zb - 0.2, x2 + 0.2, top + 0.2, zb, 'wall', zone);
      W.box(x1 - 0.2, top, zb - 0.2, x2 + 0.2, top + 0.2, zf, 'metal', zone);
      new Glass(W, { min: [x1, y, zf - 0.1], max: [x2, gt, zf] });
      W.deco(x1, gt, zf - 0.15, x2, gt + 0.06, zf + 0.05, GLOW[zone], zone);
      new Mirror(W, { min: [x1, top - 0.15, zb], max: [x2, top, zf - 0.1] });
      new Mirror(W, { min: [x1, y, zb + 0.2], max: [x1 + 0.1, top - 0.15, zf - 0.1] });
      new Mirror(W, { min: [x2 - 0.1, y, zb + 0.2], max: [x2, top - 0.15, zf - 0.1] });
      let on = false;
      const powerBridge = () => {
        if (on) return;
        on = true;
        bridge.active = true;
        game.hud.message('Bridge online!', 2.5);
      };
      const panels = [
        new TargetPanel(W, { min: [x1 + 0.1, y, zb + 0.2], max: [x2 - 0.1, y + 0.12, zf - 0.1], color: YELLOW, face: 'up', onActivate: powerBridge }),
        new TargetPanel(W, { min: [x1 + 0.1, y + 0.12, zb], max: [x2 - 0.1, top - 0.15, zb + 0.2], color: YELLOW, face: '+z', onActivate: powerBridge }),
      ];
      panels.forEach((p) => (p.group = panels));
    }
    hint([-12, 2, z(20)], [-2, 5, z(10)], 'The bridge is offline. <b>Shoot yellow over the kiosk glass</b> to power it.', 5);
    // SECRET 4 — the hut's only entrance is a crawl hole
    room({ x1: -11.5, x2: -8, zS: z(11), zN: z(14.5), y: 2, h: 2.2, zone, floor: false, trim: false, e: [{ c: z(12.75), w: 1.2, h: 1.0 }] });
    new Pickup(W, { pos: [-9.75, 3, z(12.75)], type: 'maxhp', amount: 20 });
    secretRoom([-11.5, 2, z(14.5)], [-8, 4, z(11)], 'Overgrown Hut');
    new Drone(W, { pos: [-7, 6.5, z(15)], color: GREEN, range: 24 });
    new Drone(W, { pos: [-15, 7, z(24)], color: YELLOW, range: 24 });

    const bridge = new MovingPlatform(W, { min: [-1.5, 1.9, z(16.5)], max: [1.5, 2.5, z(13.5)], offset: [7, 0, 0], speed: 2.2, zone, active: false });

    // island two, with the jump pad up to the drop perch
    W.box(10, -2, z(24), 18, 2.9, z(12), 'rock', zone);
    W.box(10, 2.9, z(24), 18, 3.0, z(12), 'grass', zone);
    tree(16.5, 3, z(13.5));
    new Pickup(W, { pos: [11.5, 4, z(14)], type: 'health', amount: 35, respawn: 30 });
    new Checkpoint(W, game, { pos: [14, 3, z(17)], yaw: 0, size: [8, 3, 6] });
    new JumpPad(W, { pos: [14, 3.0, z(22.5)], power: 26, push: [0, 0, -3.6] });
    hint([10, 3, z(21)], [18, 6, z(19)], 'Jump pad — ride it up, then <b>shoot your way down</b>.');
    new Drone(W, { pos: [14, 8, z(18)], color: RED, range: 24 });
    new Drone(W, { pos: [5, 7, z(27)], color: [GREEN, YELLOW], range: 24 });
    plat(10, z(26), 18, z(30), 14, zone); // perch
    hint([10, 14, z(30)], [18, 16, z(26)], '<b style="color:#ff3344">RED</b> · <b style="color:#ffd23a">YELLOW</b> · <b style="color:#3dff7a">GREEN</b> — clear the stack as you fall!', 6);

    // the signature drop: red, yellow and green spikes stacked above a safe platform
    plat(11, z(33), 17, z(37), 0, zone);
    new Barrier(W, { min: [11, 7.4, z(37)], max: [17, 8.0, z(33)], color: RED, kind: 'spike', regen: 2.2, zone });
    new Barrier(W, { min: [11, 5.0, z(37)], max: [17, 5.6, z(33)], color: YELLOW, kind: 'spike', regen: 2.2, zone });
    new Barrier(W, { min: [11, 2.6, z(37)], max: [17, 3.2, z(33)], color: GREEN, kind: 'spike', regen: 2.2, zone });
    new Checkpoint(W, game, { pos: [14, 0, z(35)], yaw: 0, size: [6, 2, 4] });
    const lift = new MovingPlatform(W, { min: [17.4, -0.6, z(36)], max: [19.9, 0, z(33)], offset: [0, 14, 0], speed: 3, active: false, zone, pause: 1.2 });
    W.trigger([11, 0, z(37)], [17, 2, z(33)], () => (lift.active = true));

    plat(7, z(39), 11, z(42), 1.1, zone);
    plat(1, z(43), 5, z(46), 2.2, zone);
    plat(-4, z(47), 0, z(50), 3.3, zone);
    W.box(-6, -6, zN, 6, 4.4, z(51.5), 'plat', zone);
    new Checkpoint(W, game, { pos: [0, 4.4, z(55)], yaw: 0, size: [12, 3, 6] });
    new Drone(W, { pos: [0, 8, z(44)], color: GREEN, range: 24 });
    new Drone(W, { pos: [-9, 9, z(50)], color: [RED, YELLOW, GREEN], range: 24 });

    const z6 = -271.5, d = (k) => z6 - k;
    corridor({ zStart: z6, zEnd: -283.5, y: 4.4, zone, w: [{ c: d(8.5), w: 2.4, h: 3 }] });
    W.trigger([-1.5, 4.4, d(3)], [1.5, 7.4, d(0)], () => game.setAmbient('amb_foundry'), { once: false });
    barrierWall(d(2), 4.4, RED, zone);
    barrierWall(d(4.5), 4.4, GREEN, zone);
    barrierWall(d(6.5), 4.4, YELLOW, zone);
    // SECRET 5 — blue door: unlock blue in the next room, then step back
    new Barrier(W, { min: [-2, 4.4, d(9.7)], max: [-1.5, 7.4, d(7.3)], color: BLUE, kind: 'door', zone });
    room({ x1: -8.5, x2: -2.5, zS: d(5.5), zN: d(11.5), y: 4.4, h: 3.5, zone, e: [{ c: d(8.5), w: 2.4, h: 3 }] });
    new Pickup(W, { pos: [-5.5, 5.4, d(8.5)], type: 'maxhp', amount: 20 });
    light(-5.5, 7.4, d(8.5), 0x3a8bff, 8, 9);
    secretRoom([-8.5, 4.4, d(11.5)], [-2.5, 7.4, d(5.5)], 'Azure Locker');
  }

  // ================================================================== SECTOR 4 — AZURE GAUNTLET
  {
    const zone = 'blue';
    room({ x1: -5, x2: 5, zS: -284, zN: -294, y: 4.4, h: 5, zone, s: [{ c: 0, w: 3, h: CH }], n: [{ c: 0, w: 3, h: CH }] });
    pedestal(0, 4.4, -289, BLUE, zone);
    new Checkpoint(W, game, { pos: [0, 4.4, -285.5], yaw: 0, size: [10, 3, 3] });
    zoneTitle([-5, 4.4, -286], [5, 7.4, -284], 'SECTOR 4', 'AZURE GAUNTLET', '#3a8bff');
    light(0, 8.4, -289, 0x3a8bff, 20, 16);

    const z0 = -294.5, d = (k) => z0 - k;
    corridor({ zStart: z0, zEnd: -338.5, y: 4.4, zone, low: [{ z1: d(27.5), z2: d(33.5), h: 1.1 }] });
    hint([-1.5, 4.4, d(2)], [1.5, 7, d(0.5)], 'Full spectrum. <b>Keep moving.</b>', 3);
    [[3, BLUE], [5.5, RED], [8, GREEN], [10.5, YELLOW], [13, BLUE], [15.5, GREEN], [18, RED], [20.5, YELLOW], [23, BLUE], [25.5, BLUE], [35.5, YELLOW], [37.5, BLUE], [39.5, GREEN], [41.5, RED]].forEach(([k, c]) =>
      barrierWall(d(k), 4.4, c, zone),
    );
    barrierWall(d(29.5), 4.4, GREEN, zone, 1.1);
    barrierWall(d(31.5), 4.4, RED, zone, 1.1);
    new Drone(W, { pos: [0, 6.6, d(16.5)], color: [BLUE, RED, GREEN, YELLOW], orbit: 0.4, range: 14, cycle: 1.6 });
    new Drone(W, { pos: [0, 6.6, d(40.5)], color: [YELLOW, BLUE, GREEN, RED], orbit: 0.4, range: 14, cycle: 1.6 });
  }

  // ================================================================== PRISM CORE — the boss
  {
    const zone = 'boss';
    room({ x1: -6, x2: 6, zS: -339, zN: -351, y: 4.4, h: 6, zone, s: [{ c: 0, w: 3, h: CH }], n: [{ c: 0, w: 3, h: CH }] });
    new Pickup(W, { pos: [-4, 5.4, -345], type: 'health', amount: 50 });
    new Pickup(W, { pos: [4, 5.4, -345], type: 'health', amount: 50 });
    new Checkpoint(W, game, { pos: [0, 4.4, -341], yaw: 0, size: [12, 3, 3] });
    zoneTitle([-6, 4.4, -341], [6, 7.4, -339], 'FINAL SECTOR', 'PRISM CORE', '#d9a8ff');
    hint([-6, 4.4, -348], [6, 7.4, -346], 'Something enormous waits ahead. <b>You will need every color.</b>', 5);
    light(0, 9, -345, 0xc8a0ff, 20, 16);
    corridor({ zStart: -351.5, zEnd: -359.5, y: 4.4, zone });
    W.trigger([-6, 4.4, -351], [6, 8, -339], () => game.setAmbient('amb_core'), { once: false });

    const zS = -360, zN = -416, y = 4.4, z = (lz) => zS - lz;
    room({ x1: -28, x2: 28, zS, zN, y, h: 24, zone, ceiling: false, s: [{ c: 0, w: 3, h: CH }] });
    // pillars for cover
    for (const [x, lz] of [[-12, 18], [12, 18], [-12, 40], [12, 40]]) {
      W.box(x - 1, y, z(lz + 1), x + 1, y + 8, z(lz - 1), 'metal', zone);
      W.deco(x - 1.05, y + 7.6, z(lz + 1.05), x + 1.05, y + 7.7, z(lz - 1.05), 'trimWhite', zone);
    }
    // corner ledges reached by jump pads, each with a respawning health pack
    const ledges = [
      { x1: -28, x2: -22, l1: 4, l2: 10, pad: [-19.5, 7], push: [-4.5, 0, 0] },
      { x1: 22, x2: 28, l1: 4, l2: 10, pad: [19.5, 7], push: [4.5, 0, 0] },
      { x1: -28, x2: -22, l1: 50, l2: 56, pad: [-19.5, 53], push: [-4.5, 0, 0] },
      { x1: 22, x2: 28, l1: 50, l2: 56, pad: [19.5, 53], push: [4.5, 0, 0] },
    ];
    for (const L of ledges) {
      W.box(L.x1, y, z(L.l2), L.x2, y + 5, z(L.l1), 'metal', zone);
      W.deco(L.x1, y + 5, z(L.l2), L.x2, y + 5.06, z(L.l1), 'plat', zone);
      new JumpPad(W, { pos: [L.pad[0], y, z(L.pad[1])], power: 17, push: L.push });
      new Pickup(W, { pos: [(L.x1 + L.x2) / 2, y + 6, z((L.l1 + L.l2) / 2)], type: 'health', amount: 30, respawn: 25 });
    }
    // floor ring
    const g = 'trimWhite';
    W.deco(-10, y + 0.01, z(38), 10, y + 0.04, z(37.8), g, zone);
    W.deco(-10, y + 0.01, z(18.2), 10, y + 0.04, z(18), g, zone);
    W.deco(-10, y + 0.01, z(38), -9.8, y + 0.04, z(18), g, zone);
    W.deco(9.8, y + 0.01, z(38), 10, y + 0.04, z(18), g, zone);
    for (const [x, lz] of [[-20, 15], [20, 15], [-20, 45], [20, 45]]) light(x, y + 12, z(lz), 0xb890ff, 40, 45);

    // the seal slams shut behind you when the fight starts
    const sealMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xd9a8ff).multiplyScalar(1.6), transparent: true, opacity: 0.7, depthWrite: false });
    const seal = new THREE.Mesh(new THREE.BoxGeometry(3, CH, 0.5), sealMat);
    seal.position.set(0, y + CH / 2, zS + 0.25);
    seal.visible = false;
    W.scene.add(seal);
    const sealSolid = W.addSolid(new THREE.Vector3(-1.5, y, zS), new THREE.Vector3(1.5, y + CH, zS + 0.5), {});
    sealSolid.enabled = false;
    level.setSeal = (on) => {
      seal.visible = on;
      sealSolid.enabled = on;
    };

    level.boss = new Boss(W, game, { pos: [0, y, z(40)], floorY: y, bounds: { minX: -24, maxX: 24, minZ: z(52), maxZ: z(6) } });
    level.bossTrigger = W.trigger([-28, y, z(9)], [28, y + 6, z(5)], () => game.startBoss(), { once: true });
    level.bossArenaZ = zS;
  }

  return level;
}
