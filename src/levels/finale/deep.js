// STAGE V · THE DEEP — Azure's echo: a drowned reactor basin, floes of ice-capped stone over black water,
// the Warden standing waist-deep in the middle, grown over with ice.
//   · Between floods: floes over open water (falling in is safe: swim to an edge and press Space to climb
//     out). Frost shockwaves to jump, ice spikes erupting in a line toward you, its blade and orbs.
//   · THE FLOOD (every ~28 s): it raises its arms, the basin churns, and the water rises over everything
//     for ~9 s. Hold your breath — or swim into one of the four AIR POCKETS (columns of air held over the
//     corner floes, glowing). Meanwhile it becomes a MAELSTROM: a current drags you toward it (stay out
//     of the vortex round its body) — and its core is open the whole time: hit it with blue.
//   · weak points: blue limb plates; the core during the maelstrom or while it kneels.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rectMinus } from '../hub.js';
import { LiquidPlane } from './hazards.js';
import { audio } from '../../audio.js';

const C = { x: 940, z: -260 };
const R = 26; // basin interior -R..R
const BED = -7;
const LOW = -0.3; // the water between floods (floe tops are y 0)
const HIGH = 5.2;
const POCKET = 2.3; // half-size of an air pocket's column
const POCKETS = [[-18, -18], [18, -18], [-18, 18], [18, 18]];
const VORTEX = 4.6; // lethal radius round the Warden while it spins
const _v = new THREE.Vector3();

export function buildDeep({ B, W, game, level, H, boss }) {
  const { light, glowEdge, blocker, water } = B;
  const zone = 'blue';
  const X = (x) => C.x + x, Z = (z) => C.z + z;
  const rock = (x1, y1, z1, x2, y2, z2) => W.box(X(x1), y1, Z(z1), X(x2), y2, Z(z2), 'rock', zone);

  // ---------------------------------------------------------------- the basin
  rock(-R - 3, BED - 1, -R - 3, R + 3, BED, R + 3);
  for (const [x1, z1, x2, z2] of [[-R - 3, -R - 3, R + 3, -R], [-R - 3, R, R + 3, R + 3], [-R - 3, -R, -R, R], [R, -R, R + 3, R]]) rock(x1, BED, z1, x2, 12, z2);
  for (const [x1, z1, x2, z2] of [[-R, -R - 1, R, -R], [-R, R, R, R + 1], [-R - 1, -R, -R, R], [R, -R, R + 1, R]]) blocker([X(x1), 12, Z(z1)], [X(x2), 60, Z(z2)]);
  // floes: stone pillars from the bed, capped with ice (y 0). An inner ring round the Warden, the four
  // pocket floes in the corners, and a ledge along each wall.
  const floes = [];
  const floe = (x, z, hw, hd = hw) => {
    rock(x - hw, BED, z - hd, x + hw, -0.35, z + hd);
    W.box(X(x - hw), -0.35, Z(z - hd), X(x + hw), 0, Z(z + hd), 'floor', zone);
    glowEdge(X(x - hw), Z(z - hd), X(x + hw), Z(z + hd), 0, 'glow3', zone, 0.06);
    floes.push([x, z, hw, hd]);
  };
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8, r = 12.5;
    floe(Math.round(Math.cos(a) * r * 2) / 2, Math.round(Math.sin(a) * r * 2) / 2, 3.4);
  }
  for (const [x, z] of POCKETS) floe(x, z, 3.2);
  // ARMOR: on the far (north-west) pocket floe, out at its corner.
  B.armor([X(-19.5), 0, Z(-19.5)], { respawn: 45 });
  // stepping floes out to the walls, and a ledge along each wall (gaps of ~2 m: jump them, or swim)
  for (const s of [-1, 1]) {
    floe(0, s * 19, 2.2);
    floe(s * 19, 0, 2.2);
    floe(0, s * (R - 1.6), 12.5, 1.6);
    floe(s * (R - 1.6), 0, 1.6, 12.5);
  }
  // the Warden's dais under the water
  rock(-3.5, BED, -3.5, 3.5, -3, 3.5);
  // ice crystals on the walls (one merged mesh)
  const ice = [];
  const oct = new THREE.OctahedronGeometry(1, 0);
  for (let k = 0; k < 40; k++) {
    const side = k % 4, u = -R + 2 + ((k * 9.1) % (2 * R - 4)), y = 2 + ((k * 3.7) % 9), s = 0.6 + (k % 3) * 0.4;
    const [x, z, rz, rx] = side === 0 ? [u, -R, 0, 0.6] : side === 1 ? [u, R, 0, -0.6] : side === 2 ? [-R, u, -0.6, 0] : [R, u, 0.6, 0];
    const g = oct.clone().scale(s * 0.4, s * 2, s * 0.4).rotateX(rx).rotateZ(rz).translate(X(x), y, Z(z));
    ice.push(g);
  }
  const iceMesh = new THREE.Mesh(flatMerge(ice), new THREE.MeshStandardMaterial({ color: 0xbfe8ff, emissive: 0x2a7aff, emissiveIntensity: 0.6, roughness: 0.1, metalness: 0.2, flatShading: true }));
  W.scene.add(iceMesh);
  light(X(0), 8, Z(0), 0x6ab8ff, 12, 34);
  for (const [x, z] of POCKETS) light(X(x), 4, Z(z), 0x9be8ff, 10, 14);

  // the water: every column of the basin except the pockets' (their air stays put when the flood comes)
  const holes = POCKETS.map(([x, z]) => ({ u1: x - POCKET, v1: z - POCKET, u2: x + POCKET, v2: z + POCKET }));
  const vols = rectMinus(-R, -R, R, R, holes).map(([x1, z1, x2, z2]) => water([X(x1), BED, Z(z1)], [X(x2), LOW, Z(z2)], { current: [0, 0, 0], surface: false }));
  const surface = new LiquidPlane(W, X(-R), Z(-R), X(R), Z(R), LOW, { zone: 'blue', style: 4 });
  // the air pockets: shimmering columns of air over the corner floes, with a ring of light at the base
  const airMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uH: { value: 0 } },
    vertexShader: 'varying vec2 vUv; varying vec3 vW; varying vec3 vN; void main(){ vUv = uv; vN = mat3(modelMatrix) * normal; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform float uTime, uH; varying vec2 vUv; varying vec3 vW; varying vec3 vN;
      void main(){
        float rim = 0.5 + 0.5 * sin(vUv.x * 50.0 + vUv.y * 8.0 - uTime * 3.0);
        float up = smoothstep(uH + 0.3, uH - 0.6, vW.y);
        // brighter seen edge-on (its outline reads from across the basin), faint face-on and from inside
        float edge = pow(1.0 - abs(dot(normalize(vN), normalize(cameraPosition - vW))), 2.0);
        gl_FragColor = vec4(vec3(0.5, 0.9, 1.2) * (0.03 + 0.25 * edge) * (0.6 + 0.4 * rim) * up, 1.0);
      }`,
  });
  const airs = POCKETS.map(([x, z]) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(POCKET * 1.05, POCKET * 1.05, 7, 32, 1, true).translate(0, 3.5, 0), airMat);
    m.position.set(X(x), 0, Z(z));
    W.scene.add(m);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(POCKET * 1.05, 0.08, 6, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9be8ff).multiplyScalar(2) }));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(X(x), 0.08, Z(z));
    W.scene.add(ring);
    return m;
  });
  // the vortex round the Warden while it spins: a swirling funnel
  const vortexMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uI: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uTime, uI; varying vec2 vUv;
      void main(){
        float s = pow(0.5 + 0.5 * sin(vUv.x * 37.7 + vUv.y * 9.0 - uTime * 9.0), 4.0);
        gl_FragColor = vec4(vec3(0.4, 0.8, 1.4) * s * uI * smoothstep(1.0, 0.7, vUv.y), 1.0);
      }`,
  });
  const vortex = new THREE.Mesh(new THREE.CylinderGeometry(VORTEX, VORTEX * 0.6, 9, 40, 1, true).translate(0, 4.5 + BED + 4, 0), vortexMat);
  vortex.position.set(X(0), 0, Z(0));
  vortex.visible = false;
  W.scene.add(vortex);

  level.atmospheres.finDeep = {
    fog: 0x082038, fogNear: 18, fogFar: 120,
    skyTop: [0.004, 0.01, 0.03], skyMid: [0.01, 0.04, 0.1], skyHorizon: [0.03, 0.12, 0.25], aurora: 0.25, stars: 0.5,
    hemiSky: 0x86b8ff, hemiGround: 0x0c1a34, hemiIntensity: 1.05,
    sunColor: 0x8fe8ff, sunIntensity: 0.7, sunDir: [-0.3, 1, -0.2],
    exposure: 1.0, bloom: 0.7,
  };

  // ---------------------------------------------------------------- the flood
  const tide = { phase: 'idle', t: 0, timer: 14, y: LOW };
  const T = { warn: 2.5, rise: 2.5, high: 9, fall: 2.5 };
  const setLevel = (y) => {
    tide.y = y;
    for (const v of vols) v.max.y = y;
    surface.setY(y);
    airMat.uniforms.uH.value = y;
  };
  const startTide = () => {
    tide.phase = 'warn';
    tide.t = 0;
    audio.sample('tide_rise', { gain: 1 }) || audio.bossCharge();
    game.hud.bossHint('THE DEEP RISES — swim to an AIR POCKET in a corner, or hold your breath!', true);
  };
  const updateTide = (dt, player) => {
    tide.t += dt;
    const t = tide.t;
    if (tide.phase === 'warn') {
      setLevel(LOW + 0.15 * Math.sin(t * 7) * (t / T.warn));
      player.shake = Math.max(player.shake, 0.1 + 0.15 * (t / T.warn));
      if (t > T.warn) {
        tide.phase = 'rise';
        tide.t = 0;
      }
    } else if (tide.phase === 'rise') {
      const k = Math.min(1, t / T.rise);
      setLevel(LOW + (HIGH - LOW) * k * k * (3 - 2 * k));
      if (k >= 1) {
        tide.phase = 'high';
        tide.t = 0;
      }
    } else if (tide.phase === 'high') {
      setLevel(HIGH + Math.sin(t * 1.3) * 0.1);
      if (t > T.high) {
        tide.phase = 'fall';
        tide.t = 0;
      }
    } else if (tide.phase === 'fall') {
      const k = Math.min(1, t / T.fall);
      setLevel(HIGH + (LOW - HIGH) * k * k * (3 - 2 * k));
      if (k >= 1) {
        tide.phase = 'idle';
        setLevel(LOW);
      }
    }
  };
  const flooded = () => tide.phase === 'rise' || tide.phase === 'high' || tide.phase === 'fall';

  // ---------------------------------------------------------------- specials
  const specials = {
    // the flood and the maelstrom: one long event the stage clock calls
    tide: {
      weight: 0,
      pose: (b, a) => (tide.phase === 'high' || (tide.phase === 'rise' && tide.t > 1) ? 'spin' : 'raise'),
      start(b, a) {
        startTide();
        a.orbs = 0;
      },
      update(b, a, dt, player) {
        const spinning = tide.phase === 'high';
        a.openCore = spinning || (tide.phase === 'rise' && tide.t > 1.5);
        vortex.visible = spinning || tide.phase === 'rise';
        // bursts of orbs while it spins: shoot them down (in their color) or swim clear
        if (spinning && tide.t > 1.5 + a.orbs * 2.6 && a.orbs < 3) {
          a.orbs++;
          for (let i = 1; i <= 3; i++) b.shootOrb(player, i, 3);
        }
        if (tide.phase === 'idle' && a.t > 1) {
          vortex.visible = false;
          return true;
        }
        return false;
      },
      cancel() {
        vortex.visible = false;
      },
    },
    // a line of ice spikes racing out from the Warden toward you
    icespikes: {
      weight: 3,
      pose: 'pound',
      ok: () => !flooded(),
      start(b, a, player) {
        a.lines = b.phase >= 3 ? 2 : 1;
        a.next = 0.1;
      },
      update(b, a, dt, player) {
        if (a.lines > 0 && a.t >= a.next) {
          a.lines--;
          a.next += 1.2;
          const ang = Math.atan2(player.pos.x - b.pos.x, player.pos.z - b.pos.z);
          for (let k = 0; k < 9; k++) {
            const d = 4 + k * 2.6;
            H.erupt(b.pos.x + Math.sin(ang) * d, 0, b.pos.z + Math.cos(ang) * d, { kind: 'ice', radius: 1.45, warn: 0.75, dur: 0.8, height: 3, delay: k * 0.09 });
          }
          audio.sample('ice_crack', { gain: 0.9 }) || audio.shatter();
        }
        return a.lines <= 0 && a.t > a.next;
      },
    },
  };

  const stage = {
    key: 'deep',
    name: 'THE DROWNED WARDEN',
    title: 'V · THE DEEP',
    sub: 'STAGE V',
    main: 'THE DEEP',
    color: '#3a8bff',
    hp: 1500,
    tier: 2,
    form: 'deep',
    blade: 0x7ad8ff,
    ring: 0x6ab8ff,
    shield: false,
    cover: true,
    limbPalette: [3],
    corePalette: [3],
    torsoPalette: [3],
    orbPalette: [0, 1, 2, 3],
    orbSpeed: 0.75,
    armor: 2.5,
    kneelTime: 4.5,
    // (the kneel is THE window: one carries about a third of the chunk; leg armor and broken limbs are chip)
    dmg: { vent: 9, kneel: 15, limb: 2, head: 4, broken: 1, torso: 1 },
    attacks: (b) => (flooded() ? { volley: 1 } : { sweep: 2, slam: 2, volley: 1, icespikes: 3 }),
    specials,
    env: 0.2, // image-based light (main's default 0.35)
    intensity: 1, // combat director attack tokens
    walk: false,
    spawn: new THREE.Vector3(X(0), -3, Z(0)),
    floorY: -3,
    ringY: 0,
    bounds: { minX: X(-1), maxX: X(1), minZ: Z(-1), maxZ: Z(1) },
    playerStart: new THREE.Vector3(X(0), 0, Z(R - 1.6)),
    playerYaw: 0,
    atmosphere: 'finDeep',
    music: 'music_finale_deep',
    musicFallback: 'music_blue',
    introHint: 'Its plates are BLUE. When the deep rises it spins — and its core lies open.',
    intro: '<b>THE DEEP.</b> Falling in is safe — swim to a floe and press <b>Space</b> to climb out. When the water rises, the <b>glowing corners hold air</b>.',
    tips: {
      tide: 'THE FLOOD: breathe in an <b>air pocket</b> (the glowing corners) — and <b>swim against the pull</b>! Its core is open: hit it with blue.',
      icespikes: 'Ice spikes racing at you: <b>sidestep the line</b>!',
    },
    // (for tests and tools: what the water is doing, and where the air is)
    state: () => ({ tide: tide.phase, water: tide.y, pockets: POCKETS.map(([x, z]) => [X(x), Z(z)]) }),
    reset() {
      tide.phase = 'idle';
      tide.t = 0;
      tide.timer = 14;
      setLevel(LOW);
      vortex.visible = false;
      for (const v of vols) v.current.set(0, 0, 0);
    },
    update(dt, player, b) {
      airMat.uniforms.uTime.value += dt;
      vortexMat.uniforms.uTime.value += dt;
      if (tide.phase === 'idle') {
        tide.timer -= dt;
        if (tide.timer <= 0 && !b.queued && b.attack?.type !== 'tide') {
          b.queue('tide');
          tide.timer = 28;
        }
      }
      updateTide(dt, player);
      vortexMat.uniforms.uI.value += ((vortex.visible ? 1 : 0) - vortexMat.uniforms.uI.value) * Math.min(1, dt * 3);
      // the maelstrom's pull: round and inward, felt by any swimmer (currents live on the water volumes)
      const p = player.pos;
      const dx = p.x - b.pos.x, dz = p.z - b.pos.z, d = Math.hypot(dx, dz) || 1;
      const spin = tide.phase === 'high' ? 1 : tide.phase === 'rise' ? Math.min(1, tide.t / T.rise) : tide.phase === 'fall' ? 1 - Math.min(1, tide.t / T.fall) : 0;
      const pull = spin * 1.7 * Math.min(1, 26 / d), swirl = spin * 2.2;
      const cx = (-dx / d) * pull + (dz / d) * swirl, cz = (-dz / d) * pull - (dx / d) * swirl;
      for (const v of vols) v.current.set(cx, 0, cz);
      // the vortex itself is deadly
      if (tide.phase === 'high' && d < VORTEX && p.y < HIGH) player.damage(1, 'spike');
      // bubbles and churn
      if (Math.random() < dt * (flooded() ? 30 : 6)) {
        const a = Math.random() * Math.PI * 2, r = 1 + Math.random() * 20;
        W.fx.bubbles?.(_v.set(b.pos.x + Math.cos(a) * r, Math.min(tide.y - 0.2, BED + Math.random() * (tide.y - BED)), b.pos.z + Math.sin(a) * r), 2);
      }
    },
    onExit() {
      setLevel(LOW);
      vortex.visible = false;
      for (const v of vols) v.current.set(0, 0, 0);
    },
  };
  return stage;
}

// one geometry from many (indexed ones unrolled so they all match)
const flatMerge = (geos) => mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)));
