// STAGE IV · THE OVERGROWTH — Verdant's echo: a sunken temple court swallowed by the jungle, its flagstones
// split by channels of toxic sludge, the Warden wound in vines behind a shield of brambles.
//   · VINE SWEEP: a giant thorned vine heaves out of the sludge at one edge and sweeps the whole court —
//     LOW (jump it) or HIGH (duck under it). Its lane glows on the floor while it rises.
//   · THORNS: rings open under your feet, one after another, chasing you — keep moving.
//   · SPORE PODS: it lobs pods of every color that ripen into lethal clouds — pop each with its color.
//   · weak points: the bramble shield (green; it regrows fast), then the green core. Its bark is immune.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SporePod, LiquidPlane } from './hazards.js';
import { audio } from '../../audio.js';

const C = { x: 940, z: -80 };
const R = 27; // the court is -R..R; sludge moat beyond, then the temple walls
const CH = [-9, 9]; // sludge channels along x = ±9 and z = ±9
const CW = 0.8; // channel half-width (1.6 m to jump)
const _v = new THREE.Vector3();

export function buildOvergrowth({ B, W, game, level, H, boss }) {
  const { light, glowEdge, blocker } = B;
  const zone = 'green';
  const X = (x) => C.x + x, Z = (z) => C.z + z;
  const rock = (x1, y1, z1, x2, y2, z2) => W.box(X(x1), y1, Z(z1), X(x2), y2, Z(z2), 'rock', zone);

  // ---------------------------------------------------------------- the court
  // flagstone slabs between the channels (3×3), the sludge under everything
  const edges = [-R, CH[0] - CW, CH[0] + CW, CH[1] - CW, CH[1] + CW, R];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const x1 = edges[i * 2], x2 = edges[i * 2 + 1], z1 = edges[j * 2], z2 = edges[j * 2 + 1];
      // old mossy stone, a worn flagstone path round the rim of each slab
      rock(x1, -4, z1, x2, 0, z2);
      for (const [a1, b1, a2, b2] of [[x1, z1, x2, z1 + 1], [x1, z2 - 1, x2, z2], [x1, z1 + 1, x1 + 1, z2 - 1], [x2 - 1, z1 + 1, x2, z2 - 1]]) W.deco(X(a1), 0, Z(b1), X(a2), 0.02, Z(b2), 'floor', zone);
      glowEdge(X(x1), Z(z1), X(x2), Z(z2), 0, 'glow2', zone, 0.05);
    }
  }
  const SLUDGE_Y = -0.7;
  const sludge = [];
  const pool = (x1, z1, x2, z2) => {
    W.box(X(x1), -4, Z(z1), X(x2), SLUDGE_Y - 0.4, Z(z2), 'rock', zone);
    new LiquidPlane(W, X(x1), Z(z1), X(x2), Z(z2), SLUDGE_Y, { zone, style: 2, glow: 0.45 });
    sludge.push({ x1: X(x1), x2: X(x2), z1: Z(z1), z2: Z(z2) });
  };
  for (const c of CH) {
    pool(c - CW, -R, c + CW, R);
    for (const [a, b] of [[-R, CH[0] - CW], [CH[0] + CW, CH[1] - CW], [CH[1] + CW, R]]) pool(a, c - CW, b, c + CW);
  }
  // ARMOR: over the far (north-west) crossing of the channels: reach it from a slab's corner, or jump it.
  B.armor([X(-9), 0, Z(-9)], { base: false, respawn: 45 });
  // a low parapet round the court, so nobody backs into the moat by accident
  for (const [x1, z1, x2, z2] of [[-R, -R, R, -R + 0.4], [-R, R - 0.4, R, R], [-R, -R, -R + 0.4, R], [R - 0.4, -R, R, R]]) W.box(X(x1), 0, Z(z1), X(x2), 0.7, Z(z2), 'rock', zone);
  glowEdge(X(-R), Z(-R), X(R), Z(R), 0.7, 'glow2', zone, 0.05);
  // old stone bridges over the channels, one per slab edge
  for (const c of CH) {
    for (const m of [-18, 0, 18]) {
      W.box(X(c - CW - 0.2), -0.3, Z(m - 1.5), X(c + CW + 0.2), 0, Z(m + 1.5), 'floor', zone);
      W.box(X(m - 1.5), -0.3, Z(c - CW - 0.2), X(m + 1.5), 0, Z(c + CW + 0.2), 'floor', zone);
      W.box(X(c - CW), -1.2, Z(m - 1.2), X(c + CW), -0.3, Z(m + 1.2), 'rock', zone);
      W.box(X(m - 1.2), -1.2, Z(c - CW), X(m + 1.2), -0.3, Z(c + CW), 'rock', zone);
    }
  }
  // the moat round the court
  const M = 4;
  pool(-R - M, -R - M, R + M, -R);
  pool(-R - M, R, R + M, R + M);
  pool(-R - M, -R, -R, R);
  pool(R, -R, R + M, R);
  // temple walls, broken arches, pillars wrapped in vines
  const WALL = R + M;
  for (const [x1, z1, x2, z2] of [[-WALL - 2, -WALL - 2, WALL + 2, -WALL], [-WALL - 2, WALL, WALL + 2, WALL + 2], [-WALL - 2, -WALL, -WALL, WALL], [WALL, -WALL, WALL + 2, WALL]]) rock(x1, -4, z1, x2, 9, z2);
  for (const [x1, z1, x2, z2] of [[-WALL, -WALL - 1, WALL, -WALL], [-WALL, WALL, WALL, WALL + 1], [-WALL - 1, -WALL, -WALL, WALL], [WALL, -WALL, WALL + 1, WALL]]) blocker([X(x1), 9, Z(z1)], [X(x2), 60, Z(z2)]);
  for (let k = 0; k < 12; k++) {
    const side = k % 4, u = -WALL + 4 + ((k * 13.1) % (2 * WALL - 10));
    const pillar = (x, z) => {
      rock(x - 0.9, -4, z - 0.9, x + 0.9, 7 + (k % 3) * 2, z + 0.9);
      W.deco(X(x - 0.95), 5.5, Z(z - 0.95), X(x + 0.95), 5.8, Z(z + 0.95), 'glow2', zone);
    };
    // pillars stand in the moat, clear of the court
    if (side === 0) pillar(u, -R - 2);
    else if (side === 1) pillar(u, R + 2);
    else if (side === 2) pillar(-R - 2, u);
    else pillar(R + 2, u);
  }
  // moss creeping down the walls
  for (const y of [8.2, 6.5]) {
    const t = 0.08;
    W.deco(X(-WALL), y - (y < 7 ? 1.4 : 0.8), Z(-WALL), X(WALL), y, Z(-WALL + t), 'grass', zone);
    W.deco(X(-WALL), y - (y < 7 ? 1.4 : 0.8), Z(WALL - t), X(WALL), y, Z(WALL), 'grass', zone);
    W.deco(X(-WALL), y - (y < 7 ? 1.4 : 0.8), Z(-WALL), X(-WALL + t), y, Z(WALL), 'grass', zone);
    W.deco(X(WALL - t), y - (y < 7 ? 1.4 : 0.8), Z(-WALL), X(WALL), y, Z(WALL), 'grass', zone);
  }
  // arches over the moat at the middle of each side
  for (const s of [-1, 1]) {
    rock(-6, 9, s * (R + 1) - 1, 6, 11, s * (R + 1) + 1);
    rock(s * (R + 1) - 1, 9, -6, s * (R + 1) + 1, 11, 6);
  }
  // the jungle beyond: big dark canopies and hanging vines (one merged mesh each)
  const canopyGeo = [], vineGeo = [];
  const ico = new THREE.IcosahedronGeometry(1, 0);
  for (let k = 0; k < 26; k++) {
    const a = (k / 26) * Math.PI * 2, d = WALL + 6 + (k % 3) * 5;
    const g = ico.clone().scale(6 + (k % 4) * 1.5, 5 + (k % 3), 6 + (k % 4) * 1.5).translate(X(Math.cos(a) * d), 14 + (k % 5) * 2, Z(Math.sin(a) * d));
    canopyGeo.push(g);
    const t = new THREE.CylinderGeometry(0.8, 1.2, 16, 6).translate(X(Math.cos(a) * d), 4, Z(Math.sin(a) * d));
    vineGeo.push(t);
  }
  for (let k = 0; k < 60; k++) {
    // vines dangling from the walls' tops into the moat
    const side = k % 4, u = -WALL + ((k * 7.7) % (2 * WALL)), len = 3 + (k % 5) * 1.3;
    const [x, z] = side === 0 ? [u, -WALL + 0.3] : side === 1 ? [u, WALL - 0.3] : side === 2 ? [-WALL + 0.3, u] : [WALL - 0.3, u];
    vineGeo.push(new THREE.CylinderGeometry(0.12, 0.05, len, 5).translate(X(x), 9 - len / 2, Z(z)));
  }
  const merge = (geos, mat) => {
    const m = new THREE.Mesh(flatMerge(geos), mat);
    W.scene.add(m);
    return m;
  };
  merge(canopyGeo, new THREE.MeshStandardMaterial({ color: 0x1f5a2a, flatShading: true, roughness: 1 }));
  merge(vineGeo, new THREE.MeshStandardMaterial({ color: 0x2c4a1c, roughness: 1 }));
  light(X(0), 9, Z(0), 0x9dff8a, 8, 30);
  light(X(-18), 6, Z(18), 0x7dff6a, 5, 20);

  level.atmospheres.finVerdant = {
    fog: 0x16301c, fogNear: 18, fogFar: 115,
    skyTop: [0.01, 0.035, 0.02], skyMid: [0.04, 0.09, 0.045], skyHorizon: [0.1, 0.18, 0.08], aurora: 0.08, stars: 0.15,
    hemiSky: 0xa8d080, hemiGround: 0x0a1c0e, hemiIntensity: 0.4,
    sunColor: 0xffe0a0, sunIntensity: 0.75, sunDir: [-0.4, 1, 0.3],
    exposure: 0.8, bloom: 0.5,
  };

  // ---------------------------------------------------------------- specials
  const vine = (high, axisX, dirSign, delay = 0, speed = 9) => {
    const along = axisX ? 'x' : 'z', c0 = axisX ? C.x : C.z, o0 = axisX ? C.z : C.x;
    H.sweep({
      axis: along, from: c0 - dirSign * (R + 1.5), to: c0 + dirSign * (R + 1.5), lo: o0 - R - 1, hi: o0 + R + 1,
      y0: high ? 1.15 : 0, y1: high ? 2.6 : 0.85, floorY: 0, speed, warn: 1.3, delay,
    });
  };
  const specials = {
    vines: {
      weight: 3,
      pose: 'raise',
      start(b, a) {
        const axisX = Math.random() < 0.5, dir = Math.random() < 0.5 ? 1 : -1, high = Math.random() < 0.5;
        vine(high, axisX, dir);
        // later: a second vine on the other band follows the first
        if (b.phase >= 3 || Math.random() < 0.4) vine(!high, axisX, dir, 1.6);
        audio.sample('vine_whip', { gain: 1 }) || audio.charge();
        game.hud.bossHint(high ? 'A vine — HIGH: crouch under it!' : 'A vine — LOW: jump it!', true);
        a.high = high;
      },
      update(b, a) {
        return a.t > 1.8;
      },
    },
    thorns: {
      weight: 2,
      pose: 'pound',
      start(b, a) {
        a.n = b.phase >= 3 ? 6 : 5;
        a.next = 0.15;
      },
      update(b, a, dt, player) {
        if (a.n > 0 && a.t >= a.next) {
          a.n--;
          a.next += 0.45;
          H.erupt(player.pos.x, 0, player.pos.z, { kind: 'vine', radius: 1.5, warn: 0.8, dur: 0.6, height: 3.2 });
        }
        return a.n <= 0 && a.t > a.next + 0.6;
      },
    },
    spores: {
      weight: 2,
      pose: 'cast',
      start(b, a) {
        a.thrown = 0;
        a.count = b.phase >= 3 ? 4 : 3;
        audio.bossOrbs();
      },
      update(b, a, dt, player) {
        if (a.thrown < a.count && a.t > 0.4 + a.thrown * 0.3) {
          a.thrown++;
          const hand = b.limbs.armL.hand.getWorldPosition(new THREE.Vector3());
          const ang = Math.random() * Math.PI * 2, r = a.thrown === 1 ? 2.5 : 4 + Math.random() * 4;
          const to = new THREE.Vector3(player.pos.x + Math.cos(ang) * r, 0, player.pos.z + Math.sin(ang) * r);
          to.x = Math.max(C.x - R + 2, Math.min(C.x + R - 2, to.x));
          to.z = Math.max(C.z - R + 2, Math.min(C.z + R - 2, to.z));
          new SporePod(W, hand, to, Math.floor(Math.random() * 4), { flight: 1.0, fuse: 2.6, cloud: 3.0, life: 3.4 });
        }
        return a.t > 0.4 + a.count * 0.3 + 0.4;
      },
    },
  };

  const stage = {
    key: 'verdant',
    name: 'THE OVERGROWN WARDEN',
    title: 'IV · THE OVERGROWTH',
    sub: 'STAGE IV',
    main: 'THE OVERGROWTH',
    color: '#3dff7a',
    hp: 1300,
    tier: 2,
    form: 'verdant',
    blade: 0x7dff6a,
    ring: 0x5dff6a,
    shield: true,
    shieldPalette: [2],
    shieldRegen: 1.0,
    shieldDown: 5,
    limbPalette: [],
    corePalette: [2],
    torsoPalette: [],
    orbPalette: [0, 1, 2, 3],
    dmg: { core: 6, hole: 3, kneel: 8 },
    attacks: { sweep: 1, slam: 1, volley: 1, charge: 1, vines: 3, thorns: 2, spores: 2 },
    specials,
    env: 0.12, // image-based light (main's default 0.35)
    intensity: 2, // combat director attack tokens
    walk: true,
    spawn: new THREE.Vector3(X(0), 0, Z(-14)),
    floorY: 0,
    yaw: 0,
    bounds: { minX: X(-22), maxX: X(22), minZ: Z(-22), maxZ: Z(22) },
    playerStart: new THREE.Vector3(X(0), 0, Z(18)),
    playerYaw: 0,
    atmosphere: 'finVerdant',
    music: 'music_finale_verdant',
    musicFallback: 'music_boss',
    introHint: 'Its bark turns every shot: tear the GREEN bramble shield down, then hit the core.',
    intro: '<b>THE OVERGROWTH.</b> The channels are <b>toxic</b> — jump them. Watch the vines: <b>jump the low ones, duck the high ones</b>.',
    tips: {
      vines: 'A giant vine sweeps the court: <b>jump</b> a low one, <b>crouch</b> under a high one!',
      thorns: 'Thorns chase you: <b>keep moving</b>!',
      spores: 'Spore pods! <b>Pop each one with its own color</b> before it bursts.',
      charge: 'It\'s charging: <b>sidestep</b>!',
    },
    // (for tests and tools: the floor that kills)
    state: () => ({ pits: sludge }),
    update(dt, player) {
      // the sludge takes anyone who falls into a channel
      const p = player.pos;
      if (p.y < SLUDGE_Y + 0.05) for (const s of sludge) if (p.x > s.x1 && p.x < s.x2 && p.z > s.z1 && p.z < s.z2) player.damage(1, 'acid');
      // (the bridges stand on the channels: their tops are at the court's level, so nobody on one is under SLUDGE_Y)
      // fireflies and drifting pollen
      if (Math.random() < dt * 10) {
        W.fx.burst(_v.set(p.x + (Math.random() - 0.5) * 30, 0.5 + Math.random() * 5, p.z + (Math.random() - 0.5) * 30), Math.random() < 0.5 ? 0xd8ff6a : 0x9dffb0, { count: 1, speed: 0.3, life: 3.5, size: 0.12, gravity: -0.1, drag: 0.3 });
      }
    },
  };
  return stage;
}

// one geometry from many (indexed ones unrolled so they all match)
const flatMerge = (geos) => mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)));
