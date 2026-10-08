// STAGE II · THE FORGE — the Foundry's echo: a caldera of basalt islands over a lake of lava, the Warden
// wading in the molten pool at its heart, armored in red-hot plates.
//   · a walkway round the pool (y 0) within reach of its blade, eight islands beyond a 1.8 m lava gap;
//     raised anvils (y 1.2) on the walkway's corners and the four edge islands
//   · LAVA SURGE (every ~25 s): the Warden raises its arms, the lake churns for 2.6 s, then rises over
//     the islands for 4 s — only the anvils stay dry. Afterwards it vents: the core opens.
//   · SLAG GEYSERS: glowing circles under you, then columns of slag (1 s warning).
//   · weak points: red limb plates (break both legs and it kneels: core open), the core while venting.
import * as THREE from 'three';
import { LiquidPlane } from './hazards.js';
import { audio } from '../../audio.js';

const C = { x: 760, z: -80 };
const LAVA_Y = -1.2; // the lake at rest
const SURGE_Y = 0.55; // over the islands (y 0), under the anvils (y 1.2)
const RIM = 17.5, POOL = 6.5, HALF = 3.6, ANVIL = 1.6, ANVIL_H = 1.2;
const WALL = 27;
const GAP = 1.5; // lava between the walkway and the outer islands

export function buildForge({ B, W, game, level, H, boss }) {
  const { light, glowEdge } = B;
  const zone = 'red';
  const X = (x) => C.x + x, Z = (z) => C.z + z;
  const rock = (x1, y1, z1, x2, y2, z2) => W.box(X(x1), y1, Z(z1), X(x2), y2, Z(z2), 'rock', zone);

  // ---------------------------------------------------------------- the caldera
  // the crucible rim: a square walkway round the Warden's pool (inside the reach of its blade), with a
  // curb on the pool side; beyond a 1.8 m lava gap, eight outer islands (out of its reach)
  const anvils = [];
  const slab = (x1, z1, x2, z2) => {
    rock(x1, -7, z1, x2, -0.35, z2);
    W.box(X(x1), -0.35, Z(z1), X(x2), 0, Z(z2), 'floor', zone);
  };
  const anvil = (x, z) => {
    // a raised anvil: the high ground when the lava comes up
    W.box(X(x - ANVIL), 0, Z(z - ANVIL), X(x + ANVIL), ANVIL_H, Z(z + ANVIL), 'metal', zone);
    glowEdge(X(x - ANVIL), Z(z - ANVIL), X(x + ANVIL), Z(z + ANVIL), ANVIL_H, 'trimWhite', zone, 0.08);
    anvils.push([x, z]);
  };
  slab(-RIM, -RIM, RIM, -POOL);
  slab(-RIM, POOL, RIM, RIM);
  slab(-RIM, -POOL, -POOL, POOL);
  slab(POOL, -POOL, RIM, POOL);
  glowEdge(X(-RIM), Z(-RIM), X(RIM), Z(RIM), 0, 'glow0', zone, 0.06);
  for (const [x1, z1, x2, z2] of [[-POOL, -POOL, POOL, -POOL + 0.4], [-POOL, POOL - 0.4, POOL, POOL], [-POOL, -POOL, -POOL + 0.4, POOL], [POOL - 0.4, -POOL, POOL, POOL]]) {
    W.box(X(x1), 0, Z(z1), X(x2), 0.6, Z(z2), 'metal', zone);
  }
  glowEdge(X(-POOL), Z(-POOL), X(POOL), Z(POOL), 0.6, 'glow0', zone, 0.05);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) anvil(sx * 12, sz * 12);
  const O = RIM + GAP + HALF; // outer islands' centres
  for (const [x, z] of [[0, -O], [0, O], [-O, 0], [O, 0], [-O, -O], [O, -O], [-O, O], [O, O]]) {
    slab(x - HALF, z - HALF, x + HALF, z + HALF);
    glowEdge(X(x - HALF), Z(z - HALF), X(x + HALF), Z(z + HALF), 0, 'glow0', zone, 0.06);
    if (!x || !z) anvil(x, z);
  }
  // ARMOR: on the far (north-west) corner island, which has no anvil: get off it before the surge.
  B.armor([X(-O), 0, Z(-O)], { respawn: 45 });
  // the lake bed and the caldera walls (cliffs with molten seams)
  rock(-WALL, -8, -WALL, WALL, -7, WALL);
  for (const [x1, z1, x2, z2] of [[-WALL - 3, -WALL - 3, WALL + 3, -WALL], [-WALL - 3, WALL, WALL + 3, WALL + 3], [-WALL - 3, -WALL, -WALL, WALL], [WALL, -WALL, WALL + 3, WALL]]) rock(x1, -8, z1, x2, 16, z2);
  // jagged crown on the cliffs
  for (let k = 0; k < 28; k++) {
    const side = k % 4, u = -WALL + ((k * 7.3) % (2 * WALL)), h = 16 + ((k * 5.1) % 9), w = 2 + (k % 3);
    if (side === 0) rock(u, 16, -WALL - 3, u + w, h, -WALL);
    else if (side === 1) rock(u, 16, WALL, u + w, h, WALL + 3);
    else if (side === 2) rock(-WALL - 3, 16, u, -WALL, h, u + w);
    else rock(WALL, 16, u, WALL + 3, h, u + w);
  }
  // molten seams down the cliff faces and two lava falls
  for (let k = 0; k < 16; k++) {
    const u = -WALL + 3 + ((k * 11.7) % (2 * WALL - 6)), side = k % 4, top = 6 + (k % 5) * 2;
    if (side === 0) W.deco(X(u), LAVA_Y, Z(-WALL), X(u + 0.25), top, Z(-WALL + 0.05), 'glow0', zone);
    else if (side === 1) W.deco(X(u), LAVA_Y, Z(WALL - 0.05), X(u + 0.25), top, Z(WALL), 'glow0', zone);
    else if (side === 2) W.deco(X(-WALL), LAVA_Y, Z(u), X(-WALL + 0.05), top, Z(u + 0.25), 'glow0', zone);
    else W.deco(X(WALL - 0.05), LAVA_Y, Z(u), X(WALL), top, Z(u + 0.25), 'glow0', zone);
  }
  const fallMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uTime; varying vec2 vUv;
      void main(){
        float s = 0.6 + 0.4 * sin(vUv.x * 30.0 + sin(vUv.y * 4.0) * 2.0) * sin(vUv.y * 14.0 + uTime * 9.0);
        float edge = smoothstep(0.0, 0.2, vUv.x) * smoothstep(1.0, 0.8, vUv.x);
        gl_FragColor = vec4(vec3(1.8, 0.55, 0.1) * s * edge, 1.0);
      }`,
  });
  for (const [x, z, ry] of [[-10, -WALL + 0.1, 0], [WALL - 0.1, 8, Math.PI / 2]]) {
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(5, 18), fallMat);
    fall.position.set(X(x), 7.5, Z(z));
    fall.rotation.y = ry;
    W.scene.add(fall);
  }
  // the Warden's pool: a ring of broken crucible teeth around it
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2, r = 5.2;
    rock(Math.cos(a) * r - 0.5, -7, Math.sin(a) * r - 0.5, Math.cos(a) * r + 0.5, -0.4 + (k % 3) * 0.5, Math.sin(a) * r + 0.5);
  }
  light(X(0), 6, Z(0), 0xff6a2a, 14, 30);
  light(X(-16), 8, Z(16), 0xff7a3a, 9, 26);
  light(X(16), 8, Z(-16), 0xff7a3a, 9, 26);

  // the lake itself: one surface the stage raises and lowers
  const lava = new LiquidPlane(W, X(-WALL), Z(-WALL), X(WALL), Z(WALL), LAVA_Y, { zone: 'red', glow: 0.55 });

  level.atmospheres.finForge = {
    fog: 0x1e0805, fogNear: 30, fogFar: 150,
    skyTop: [0.03, 0.005, 0.005], skyMid: [0.12, 0.025, 0.01], skyHorizon: [0.42, 0.09, 0.02], aurora: 0, stars: 0.1,
    hemiSky: 0xb06048, hemiGround: 0x1a0503, hemiIntensity: 0.45,
    sunColor: 0xff7a40, sunIntensity: 0.65, sunDir: [0.3, 1, 0.2],
    exposure: 0.85, bloom: 0.55,
  };

  // ---------------------------------------------------------------- the surge
  // phase: 'idle' | 'warn' | 'rise' | 'high' | 'fall'
  const surge = { phase: 'idle', t: 0, timer: 12 };
  const SURGE = { warn: 2.6, rise: 0.9, high: 4.0, fall: 1.6 };
  let fxT = 0;
  const startSurge = () => {
    surge.phase = 'warn';
    surge.t = 0;
    audio.sample('lava_surge', { gain: 1 }) || audio.bossCharge();
    game.hud.bossHint('LAVA SURGE — get up onto a raised anvil!', true);
  };
  const updateSurge = (dt, player) => {
    surge.t += dt;
    const s = surge;
    let y = LAVA_Y;
    if (s.phase === 'warn') {
      y = LAVA_Y + 0.25 * Math.sin(s.t * 9) * (s.t / SURGE.warn);
      player.shake = Math.max(player.shake, 0.15 + 0.2 * (s.t / SURGE.warn));
      if (s.t > SURGE.warn) {
        s.phase = 'rise';
        s.t = 0;
        audio.sample('lava_sizzle', { gain: 1 }) || audio.slam();
      }
    } else if (s.phase === 'rise') {
      const k = Math.min(1, s.t / SURGE.rise);
      y = LAVA_Y + (SURGE_Y - LAVA_Y) * k * k * (3 - 2 * k);
      if (k >= 1) {
        s.phase = 'high';
        s.t = 0;
      }
    } else if (s.phase === 'high') {
      y = SURGE_Y + Math.sin(s.t * 2.2) * 0.06;
      if (s.t > SURGE.high) {
        s.phase = 'fall';
        s.t = 0;
      }
    } else if (s.phase === 'fall') {
      const k = Math.min(1, s.t / SURGE.fall);
      y = SURGE_Y + (LAVA_Y - SURGE_Y) * k;
      if (k >= 1) s.phase = 'idle';
    }
    lava.setY(y);
    return y;
  };

  // ---------------------------------------------------------------- the stage
  const specials = {
    // slag geysers: rings under you and around you, then columns of slag
    geysers: {
      weight: 3,
      pose: 'pound',
      start(b, a) {
        a.waves = b.phase >= 3 ? 3 : 2;
        a.next = 0.25;
        audio.bossCharge();
      },
      update(b, a, dt, player) {
        if (a.waves > 0 && a.t >= a.next) {
          a.waves--;
          a.next += 1.1;
          const p = player.pos;
          H.erupt(p.x, 0, p.z, { kind: 'lava', radius: 1.8, warn: 1.0, dur: 1.0, height: 9 });
          for (let i = 0; i < 2; i++) {
            const ang = Math.random() * Math.PI * 2, r = 4 + Math.random() * 4;
            H.erupt(p.x + Math.cos(ang) * r, 0, p.z + Math.sin(ang) * r, { kind: 'lava', radius: 1.6, warn: 1.0, dur: 1.0, height: 9, delay: 0.15 * (i + 1) });
          }
        }
        return a.t > 1.1 * (b.phase >= 3 ? 3 : 2) + 0.9;
      },
    },
    // the lava surge: called by the stage clock, the Warden holds the lake up while you hold out
    surge: {
      weight: 0,
      pose: 'raise',
      rest: 0.5,
      start(b, a) {
        startSurge();
        a.fired = 0;
      },
      update(b, a, dt, player) {
        // a few orbs while you're pinned on an anvil: shoot them down in their colors
        if (surge.phase === 'high' && a.fired < 3 && surge.t > 1.0 + a.fired * 0.5) {
          a.fired++;
          b.shootOrb(player, a.fired, 3);
        }
        if (surge.phase === 'idle' && a.t > 1) {
          b.vent(5, 'The Warden vents its heat — the core is open, hit it with red!');
          return true;
        }
        return false;
      },
    },
  };

  const stage = {
    key: 'forge',
    name: 'THE MOLTEN WARDEN',
    title: 'II · THE FORGE',
    sub: 'STAGE II',
    main: 'THE FORGE',
    color: '#ff6a3a',
    hp: 1400,
    tier: 2,
    form: 'forge',
    blade: 0xff8a2a,
    ring: 0xff6a1a,
    shield: false,
    cover: true,
    limbPalette: [0],
    corePalette: [0],
    torsoPalette: [0],
    orbPalette: [0, 1, 2, 3],
    armor: 2.5,
    kneelTime: 4.5,
    dmg: { vent: 10, kneel: 7, limb: 4, head: 6, broken: 2, torso: 2 },
    // (while the lake is up you're pinned on an anvil: only orbs then)
    attacks: () => (surge.phase === 'idle' ? { sweep: 2, slam: 2, volley: 1, geysers: 3 } : { volley: 1 }),
    specials,
    env: 0.2, // image-based light (main's default 0.35)
    intensity: 2, // combat director attack tokens
    walk: false,
    spawn: new THREE.Vector3(X(0), LAVA_Y, Z(0)),
    floorY: LAVA_Y,
    ringY: 0,
    bounds: { minX: X(-1.5), maxX: X(1.5), minZ: Z(-1.5), maxZ: Z(1.5) },
    playerStart: new THREE.Vector3(X(0), ANVIL_H, Z(RIM + GAP + HALF)), // (on the anvil of the south island)
    playerYaw: 0,
    atmosphere: 'finForge',
    music: 'music_finale_forge',
    musicFallback: 'music_red',
    introHint: 'Red-hot armor: break its RED plates. The core opens when it kneels or vents.',
    intro: '<b>THE FORGE.</b> The lava rises when the Warden calls it: get up onto a <b>raised anvil</b>.',
    tips: {
      geysers: 'Slag geysers! <b>Step off the glowing circles</b> before they blow.',
      surge: 'LAVA SURGE — get onto a <b>raised anvil</b>, now!',
    },
    // (for tests and tools: what the arena is doing, and where the high ground is)
    state: () => ({ surge: surge.phase, lava: lava.y, anvils: anvils.map(([x, z]) => [X(x), Z(z)]) }),
    reset() {
      surge.phase = 'idle';
      surge.t = 0;
      surge.timer = 12;
      lava.setY(LAVA_Y);
    },
    update(dt, player, b) {
      fallMat.uniforms.uTime.value += dt;
      // the stage clock: a surge every ~25 s, once the Warden is free to call it
      if (surge.phase === 'idle') {
        surge.timer -= dt;
        if (surge.timer <= 0 && !b.queued && b.attack?.type !== 'surge') {
          b.queue('surge');
          surge.timer = 25;
        }
      }
      const y = updateSurge(dt, player);
      // the lava takes anyone whose feet go under (inside the caldera)
      const p = player.pos;
      if (p.y < y - 0.04 && lava.contains(p)) player.damage(1, 'acid');
      // embers off the lake, thicker while it churns
      fxT -= dt;
      if (fxT <= 0) {
        fxT = surge.phase === 'idle' ? 0.08 : 0.025;
        const e = new THREE.Vector3(p.x + (Math.random() - 0.5) * 30, y + 0.1, p.z + (Math.random() - 0.5) * 30);
        W.fx.ember(e, (Math.random() - 0.5), 1.5 + Math.random() * 3, (Math.random() - 0.5), 0xff7a1a, 1.5, 0.1);
        if (surge.phase === 'warn' && Math.random() < 0.5) W.fx.ring(e, new THREE.Vector3(0, 1, 0), 0xff7a1a, { size: 0.2, end: 1.6, life: 0.5, k: 1.3 });
      }
    },
  };
  return stage;
}
