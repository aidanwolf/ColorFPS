// TEMPLE KIT — the look and the moving parts of the Sun Temple's interior (solarTempleInterior.js builds the
// temple with them). Everything is placed through a FRAME: the temple is authored in its own coordinates
// (origin at the door's threshold on the temple floor, +z into the temple, +y up, x across) and one
// transform { x, y, z, yaw } (yaw a multiple of 90°) puts it in the world, so boxes stay axis-aligned.
//
//   frame(T)                 P / V / D / box / face / yaw / local / size / M (see below)
//   new Builder(W, F)        merged static dressing per material, authored in temple coordinates:
//                            add(key, geo), blk(key, x1, y1, z1, x2, y2, z2, { solid, uv }), solid(...), finish()
//   templeMats()             the shared materials (sandstone, bronze, gold, the obelisk, cloth that sways...)
//   Brazier                  a bronze bowl on a tripod: lit by the temple waking or by your beam
//   Censer                   a bronze incense burner swinging on a chain: it knocks you off what you stand on
//   SlideBlock               a stone block that grinds out of a wall (activate) and back in (deactivate)
//   VLift                    a stone platform riding up and down on ropes (and a counterweight)
//   Drawbridge               a plank bridge hinged at one end that swings down when activated
//   StoneRing                a great bronze ring round the obelisk carrying stone drums; a gong turns it
//   BurnRope                 a taut rope: hold the yellow beam on it and it burns through
//   SupportJoint             a crystal clamp in a stone shroud: hold the beam on it and it cracks
//   DustClouds               soft billowing dust (normal-blended billboards, one draw)
//   Debris                   tumbling stone chunks (one instanced draw)
//   Launch                   a scripted ride of the player along a path (player.mount)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { YELLOW } from '../colors.js';
import { audio } from '../audio.js';
import { boxGeo } from '../materials.js';
import { regionOf } from './regions.js';
import { nearGain } from '../entities/mechkit.js';

const _c = new THREE.Color(), _u = new THREE.Vector3();
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _e = new THREE.Euler(), _s = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const rnd = (a, b) => a + Math.random() * (b - a);
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
export const SAND_HEX = 0xc9a26a;

// ------------------------------------------------------------------ the frame
// world = T + rotY(yaw) · local. P: a point ([x, y, z]); V: the same as a Vector3; D: a direction; box: an
// AABB as [min, max]; face: a face name ('+x'...) turned into the world's; yaw: a player/enemy yaw;
// local: a world point back into temple coordinates; size: a box size [w, h, d] turned; M: the matrix.
export function frame(T) {
  const c = Math.round(Math.cos(T.yaw)), s = Math.round(Math.sin(T.yaw));
  const wx = (x, z) => T.x + x * c + z * s;
  const wz = (x, z) => T.z - x * s + z * c;
  const P = (x, y, z) => [wx(x, z), T.y + y, wz(x, z)];
  const V = (x, y, z, out = new THREE.Vector3()) => out.set(wx(x, z), T.y + y, wz(x, z));
  const D = (x, y, z) => [x * c + z * s, y, -x * s + z * c];
  const box = (x1, y1, z1, x2, y2, z2) => {
    const a = P(x1, y1, z1), b = P(x2, y2, z2);
    return [[Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])], [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])]];
  };
  const NAMES = { '1,0': '+x', '-1,0': '-x', '0,1': '+z', '0,-1': '-z' };
  const face = (f) => {
    if (f === 'up' || f === 'down') return f;
    const v = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] }[f];
    const d = D(v[0], 0, v[1]);
    return NAMES[`${Math.round(d[0])},${Math.round(d[2])}`];
  };
  const yaw = (ly) => ly + T.yaw;
  const local = (p, out = new THREE.Vector3()) => {
    const dx = p.x - T.x, dz = p.z - T.z;
    return out.set(dx * c - dz * s, p.y - T.y, dx * s + dz * c);
  };
  const size = (w, h, d) => (s !== 0 ? [d, h, w] : [w, h, d]);
  // the local yaw that faces from (x, z) toward (tx, tz)
  const faceTo = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));
  const M = new THREE.Matrix4().makeRotationY(T.yaw).setPosition(T.x, T.y, T.z);
  const Q = new THREE.Quaternion().setFromAxisAngle(UP, T.yaw);
  return { T, c, s, P, V, D, box, face, yaw, local, size, faceTo, M, Q };
}

// ------------------------------------------------------------------ textures (drawn once)
function canvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
let seed = 1;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// dressed sandstone: courses of blocks, each a little different, with worn edges and the odd crack
function sandTexture() {
  seed = 11;
  return canvas(256, 256, (g, w, h) => {
    // a warm pale ground, mottled
    g.fillStyle = '#bb9c74';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      const r = 6 + rand() * 26;
      g.fillStyle = rand() < 0.5 ? `rgba(120,85,50,${0.03 + rand() * 0.05})` : `rgba(240,215,175,${0.03 + rand() * 0.05})`;
      g.beginPath();
      g.arc(rand() * w, rand() * h, r, 0, Math.PI * 2);
      g.fill();
    }
    // four courses of ashlar, each block a slightly different stone
    const rows = 4;
    for (let r = 0; r < rows; r++) {
      const y0 = (r * h) / rows, rh = h / rows;
      const n = 2;
      const off = r % 2 ? w / 4 : 0;
      for (let i = -1; i < n + 1; i++) {
        const x0 = off + (i * w) / n, bw = w / n;
        const t = 0.94 + rand() * 0.1;
        g.fillStyle = `rgba(${(190 * t) | 0},${(158 * t) | 0},${(118 * t) | 0},0.55)`;
        g.fillRect(x0 + 1.5, y0 + 1.5, bw - 3, rh - 3);
        // worn arrises: a lit top edge, a shadowed foot
        g.fillStyle = 'rgba(255,240,210,0.12)';
        g.fillRect(x0 + 1.5, y0 + 1.5, bw - 3, 3);
        g.fillStyle = 'rgba(60,35,15,0.16)';
        g.fillRect(x0 + 1.5, y0 + rh - 5, bw - 3, 3.5);
        // mortar joints
        g.fillStyle = 'rgba(70,45,25,0.45)';
        g.fillRect(x0, y0, 1.5, rh);
      }
      g.fillStyle = 'rgba(70,45,25,0.45)';
      g.fillRect(0, y0, w, 1.5);
    }
    // grain, pits, a crack or two
    for (let i = 0; i < 2200; i++) {
      g.fillStyle = rand() < 0.55 ? `rgba(70,45,20,${0.04 + rand() * 0.09})` : `rgba(255,235,200,${0.03 + rand() * 0.06})`;
      g.fillRect(rand() * w, rand() * h, 1 + rand() * 1.5, 1 + rand() * 1.5);
    }
    g.strokeStyle = 'rgba(60,35,15,0.35)';
    g.lineWidth = 1;
    for (let k = 0; k < 3; k++) {
      let x = rand() * w, y = rand() * h;
      g.beginPath();
      g.moveTo(x, y);
      for (let s2 = 0; s2 < 5; s2++) g.lineTo((x += (rand() - 0.5) * 18), (y += rand() * 12));
      g.stroke();
    }
  });
}

// the worshippers' frieze: rows of figures with their arms raised to an obelisk under a sun; gold inlay
// (the emissive map) traces the sun's rays, the obelisk and the hands
function reliefTextures() {
  const draw = (g, w, h, inlay) => {
    if (!inlay) {
      g.fillStyle = '#a57c50';
      g.fillRect(0, 0, w, h);
      seed = 5;
      for (let i = 0; i < 1600; i++) {
        g.fillStyle = `rgba(60,35,10,${0.04 + rand() * 0.1})`;
        g.fillRect(rand() * w, rand() * h, 2, 2);
      }
    } else {
      g.fillStyle = '#000';
      g.fillRect(0, 0, w, h);
    }
    const cx = w / 2;
    // carved: a light edge up-left, a dark edge down-right, so it reads as relief
    const carve = (path, fill = true) => {
      if (inlay) return;
      g.save();
      g.translate(-1.5, -1.5);
      g.fillStyle = 'rgba(255,230,190,0.35)';
      path();
      fill && g.fill();
      g.restore();
      g.save();
      g.translate(2, 2);
      g.fillStyle = 'rgba(40,20,5,0.55)';
      path();
      fill && g.fill();
      g.restore();
      g.fillStyle = '#9a7248';
      path();
      fill && g.fill();
    };
    // the obelisk, point down, hanging from a sun
    const ob = () => {
      g.beginPath();
      g.moveTo(cx - 26, 40);
      g.lineTo(cx + 26, 40);
      g.lineTo(cx + 16, 190);
      g.lineTo(cx, 226);
      g.lineTo(cx - 16, 190);
      g.closePath();
    };
    carve(ob);
    const sun = () => {
      g.beginPath();
      g.arc(cx, 26, 22, 0, Math.PI * 2);
    };
    carve(sun);
    if (inlay) {
      g.strokeStyle = '#fff';
      g.lineWidth = 3;
      for (let k = 0; k < 14; k++) {
        const a = Math.PI + (k / 13) * Math.PI;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * 28, 26 - Math.sin(a) * -0 + Math.sin(a) * 28);
        g.lineTo(cx + Math.cos(a) * 46, 26 + Math.sin(a) * 46);
        g.stroke();
      }
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(cx, 50);
      g.lineTo(cx, 210);
      g.stroke();
      g.beginPath();
      g.arc(cx, 26, 12, 0, Math.PI * 2);
      g.fillStyle = '#fff';
      g.fill();
      for (let y = 70; y < 190; y += 24) g.fillRect(cx - 12, y, 24, 3);
    }
    // the worshippers, facing in from both sides, arms raised
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const x = cx + side * (70 + i * 52), base = 236, kneel = i % 2 === 1;
        const fig = () => {
          g.beginPath();
          const hy = kneel ? base - 70 : base - 96;
          g.arc(x, hy, 9, 0, Math.PI * 2);
          g.moveTo(x - 9, hy + 12);
          g.lineTo(x + 9, hy + 12);
          g.lineTo(x + 7, kneel ? base - 18 : base - 40);
          g.lineTo(kneel ? x - side * 18 : x + 8, base);
          g.lineTo(kneel ? x - side * 26 : x - 8, base);
          g.lineTo(x - 7, kneel ? base - 18 : base - 40);
          g.closePath();
          // arms raised toward the obelisk
          g.moveTo(x - side * 4, hy + 14);
          g.lineTo(x - side * 26, hy - 26);
          g.lineTo(x - side * 20, hy - 30);
          g.lineTo(x + side * 4, hy + 6);
          g.closePath();
        };
        carve(fig);
        if (inlay) {
          g.fillStyle = '#fff';
          const hy = kneel ? base - 70 : base - 96;
          g.beginPath();
          g.arc(x - side * 24, hy - 29, 3.5, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
    // a band of glyphs along the bottom and the top
    for (const y of [6, h - 14]) {
      for (let x = 10; x < w - 10; x += 22) {
        const k = ((x * 7) >> 3) % 4;
        const glyph = () => {
          g.beginPath();
          if (k === 0) g.arc(x + 6, y + 4, 5, 0, Math.PI * 2);
          else if (k === 1) g.rect(x, y, 12, 8);
          else if (k === 2) (g.moveTo(x, y + 8), g.lineTo(x + 6, y), g.lineTo(x + 12, y + 8), g.closePath());
          else g.ellipse(x + 6, y + 4, 7, 3.5, 0, 0, Math.PI * 2);
        };
        if (inlay) {
          g.fillStyle = 'rgba(255,255,255,0.55)';
          glyph();
          g.fill();
        } else carve(glyph);
      }
    }
  };
  const map = canvas(512, 256, (g, w, h) => draw(g, w, h, false));
  const glow = canvas(512, 256, (g, w, h) => draw(g, w, h, true));
  return { map, glow };
}

// the obelisk's skin: four faces side by side (the cylinder's u runs round it). Dark stone in columns of
// carved glyphs; the emissive map holds its conduit grooves (dormant until the temple wakes)
function obeliskTextures() {
  const W = 512, H = 1024;
  const draw = (g, glow) => {
    g.fillStyle = glow ? '#000' : '#3a3026';
    g.fillRect(0, 0, W, H);
    seed = 23;
    if (!glow) {
      for (let i = 0; i < 4000; i++) {
        g.fillStyle = rand() < 0.5 ? `rgba(0,0,0,${0.1 + rand() * 0.15})` : `rgba(255,220,170,${0.03 + rand() * 0.05})`;
        g.fillRect(rand() * W, rand() * H, 1 + rand() * 2, 1 + rand() * 3);
      }
    }
    const fw = W / 4;
    for (let f = 0; f < 4; f++) {
      const x0 = f * fw;
      // the face's border
      g.strokeStyle = glow ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,0.5)';
      g.lineWidth = 4;
      g.strokeRect(x0 + 6, 6, fw - 12, H - 12);
      // the conduit grooves: a main channel down the middle and two side channels, crossed by bands
      if (glow) {
        g.fillStyle = '#fff';
        g.fillRect(x0 + fw / 2 - 3, 0, 6, H);
        g.fillRect(x0 + 18, 0, 3, H);
        g.fillRect(x0 + fw - 21, 0, 3, H);
        for (let y = 60; y < H; y += 128) {
          g.fillRect(x0 + 18, y, fw - 36, 3);
          // a node where the channels cross
          g.beginPath();
          g.arc(x0 + fw / 2, y + 1, 8, 0, Math.PI * 2);
          g.fill();
        }
      } else {
        g.fillStyle = 'rgba(0,0,0,0.6)';
        g.fillRect(x0 + fw / 2 - 5, 0, 10, H);
        g.fillRect(x0 + 16, 0, 7, H);
        g.fillRect(x0 + fw - 23, 0, 7, H);
      }
      // glyph columns either side of the main channel
      for (const cx of [x0 + 40, x0 + fw - 40]) {
        for (let y = 20; y < H - 20; y += 26) {
          const k = (rand() * 6) | 0;
          g.fillStyle = glow ? 'rgba(255,255,255,0.25)' : 'rgba(255,215,160,0.16)';
          g.strokeStyle = g.fillStyle;
          g.lineWidth = 2;
          g.beginPath();
          if (k === 0) g.arc(cx, y + 8, 7, 0, Math.PI * 2);
          else if (k === 1) g.rect(cx - 7, y + 2, 14, 12);
          else if (k === 2) (g.moveTo(cx - 8, y + 14), g.lineTo(cx, y), g.lineTo(cx + 8, y + 14), g.closePath());
          else if (k === 3) (g.ellipse(cx, y + 8, 9, 4, 0, 0, Math.PI * 2), g.moveTo(cx + 3, y + 8), g.arc(cx, y + 8, 3, 0, Math.PI * 2));
          else if (k === 4) (g.moveTo(cx - 8, y + 8), g.lineTo(cx + 8, y + 8), g.moveTo(cx, y), g.lineTo(cx, y + 16));
          else (g.moveTo(cx - 7, y + 2), g.lineTo(cx + 7, y + 2), g.lineTo(cx + 7, y + 14));
          k < 3 ? g.stroke() : g.stroke();
        }
      }
    }
  };
  return { map: canvas(W, H, (g) => draw(g, false)), glow: canvas(W, H, (g) => draw(g, true)) };
}

// prayer cloth: deep red with an ochre border, a gold sun with an eye in it, frayed tassels at the foot
function clothTexture() {
  return canvas(128, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#7a1c12';
    g.fillRect(0, 0, w, h - 20);
    g.fillStyle = '#c8862a';
    g.fillRect(0, 0, w, 10);
    g.fillRect(0, 0, 8, h - 20);
    g.fillRect(w - 8, 0, 8, h - 20);
    g.fillRect(0, h - 30, w, 10);
    // the sun and the eye
    g.fillStyle = '#e0a83a';
    g.beginPath();
    g.arc(w / 2, 86, 28, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#e0a83a';
    g.lineWidth = 4;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      g.beginPath();
      g.moveTo(w / 2 + Math.cos(a) * 34, 86 + Math.sin(a) * 34);
      g.lineTo(w / 2 + Math.cos(a) * 46, 86 + Math.sin(a) * 46);
      g.stroke();
    }
    g.fillStyle = '#3a0c06';
    g.beginPath();
    g.ellipse(w / 2, 86, 18, 9, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e8c070';
    g.beginPath();
    g.arc(w / 2, 86, 5, 0, Math.PI * 2);
    g.fill();
    // a pointed obelisk below it
    g.fillStyle = '#c8862a';
    g.beginPath();
    g.moveTo(w / 2 - 12, 150);
    g.lineTo(w / 2 + 12, 150);
    g.lineTo(w / 2, 205);
    g.closePath();
    g.fill();
    // tassels
    g.fillStyle = '#c8862a';
    for (let x = 4; x < w; x += 10) g.fillRect(x, h - 20, 4, 14 + ((x * 13) % 6));
    // weave
    g.fillStyle = 'rgba(0,0,0,0.08)';
    for (let y = 0; y < h - 20; y += 3) g.fillRect(0, y, w, 1);
  });
}

// a soft round puff (dust), white with a soft edge
function puffTexture() {
  return canvas(64, 64, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.45, 'rgba(255,255,255,0.55)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, w);
  });
}

function flameTexture() {
  return canvas(64, 128, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h * 0.72, 2, w / 2, h * 0.6, h * 0.5);
    gr.addColorStop(0, 'rgba(255,250,220,1)');
    gr.addColorStop(0.25, 'rgba(255,190,80,0.9)');
    gr.addColorStop(0.6, 'rgba(255,90,20,0.45)');
    gr.addColorStop(1, 'rgba(120,20,0,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(w / 2, 0);
    g.quadraticCurveTo(w, h * 0.6, w / 2, h);
    g.quadraticCurveTo(0, h * 0.6, w / 2, 0);
    g.fill();
  });
}

// cloth that sways: a standard material with a vertex sway (attribute `sway`: 0 where it hangs from, 1 at the
// free end), every banner and flag in the temple sharing one clock
export const CLOTH_CLOCK = { value: 0 };
function swayMaterial(params) {
  const m = new THREE.MeshStandardMaterial(params);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = CLOTH_CLOCK;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float sway;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float ph = position.x * 0.43 + position.z * 0.37 + position.y * 0.21;
        float wv = sin(uTime * 1.6 + ph) * 0.6 + sin(uTime * 2.7 + ph * 1.7) * 0.25 + sin(uTime * 0.7 + ph * 0.5) * 0.35;
        transformed += objectNormal * wv * 0.22 * sway * sway;
        transformed.y += abs(wv) * 0.04 * sway;`,
      );
  };
  m.customProgramCacheKey = () => 'templeCloth';
  return m;
}

// the dust: camera-facing puffs, normal blending (so a cloud hides what's behind it), per-instance color,
// size and opacity (instanceMatrix carries the centre and size; instanceColor the tint; aAlpha the fade)
const DUST_VS = `
  attribute float aAlpha; attribute float aRot;
  varying vec2 vUv; varying float vA; varying vec3 vCol;
  void main(){
    vUv = uv; vA = aAlpha;
    #ifdef USE_INSTANCING_COLOR
      vCol = instanceColor;
    #else
      vCol = vec3(1.0);
    #endif
    vec3 c = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    float s = length(instanceMatrix[0].xyz);
    vec4 mv = viewMatrix * modelMatrix * vec4(c, 1.0);
    float cr = cos(aRot), sr = sin(aRot);
    vec2 p = vec2(position.x * cr - position.y * sr, position.x * sr + position.y * cr);
    mv.xy += p * s;
    gl_Position = projectionMatrix * mv;
  }`;
const DUST_FS = `
  uniform sampler2D map; uniform vec3 uLight;
  varying vec2 vUv; varying float vA; varying vec3 vCol;
  void main(){
    float a = texture2D(map, vUv).a * vA;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vCol * uLight, a);
    #include <colorspace_fragment>
  }`;

let MATS = null;
export function templeMats() {
  if (MATS) return MATS;
  const sand = sandTexture();
  const relief = reliefTextures();
  const ob = obeliskTextures();
  const cloth = clothTexture();
  MATS = {
    sand: new THREE.MeshStandardMaterial({ map: sand, color: 0xf2dcc0, roughness: 0.95, metalness: 0.02 }),
    sandDark: new THREE.MeshStandardMaterial({ map: sand, color: 0xa8907a, roughness: 1, metalness: 0 }),
    ledge: new THREE.MeshStandardMaterial({ map: sand, color: 0xfff0d8, roughness: 0.9, metalness: 0.03 }),
    floor: new THREE.MeshStandardMaterial({ map: sand, color: 0xe0c8a8, roughness: 0.92, metalness: 0.03 }),
    bronze: new THREE.MeshStandardMaterial({ color: 0x9a6a32, roughness: 0.38, metalness: 0.85 }),
    darkBronze: new THREE.MeshStandardMaterial({ color: 0x4a3420, roughness: 0.5, metalness: 0.8 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xe0b050, roughness: 0.22, metalness: 1, emissive: 0x3a2400, emissiveIntensity: 0.4 }),
    obelisk: new THREE.MeshStandardMaterial({ map: ob.map, emissiveMap: ob.glow, emissive: new THREE.Color(1, 0.7, 0.25), emissiveIntensity: 0.15, color: 0xffffff, roughness: 0.55, metalness: 0.25 }),
    capital: new THREE.MeshStandardMaterial({ map: sand, color: 0x6a5440, roughness: 0.7, metalness: 0.2 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x6a4626, roughness: 0.9, metalness: 0 }),
    rope: new THREE.MeshStandardMaterial({ color: 0xa88a5a, roughness: 1, metalness: 0 }),
    relief: new THREE.MeshStandardMaterial({ map: relief.map, emissiveMap: relief.glow, emissive: new THREE.Color(1, 0.72, 0.3), emissiveIntensity: 0.05, roughness: 0.95, metalness: 0.05 }),
    seam: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.12, 0.07, 0.03) }),
    candle: new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.8, emissive: 0x2a1a08 }),
    flame: new THREE.MeshBasicMaterial({ map: flameTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, color: 0xffffff }),
    cloth: swayMaterial({ map: cloth, side: THREE.DoubleSide, roughness: 0.95, metalness: 0, alphaTest: 0.5 }),
    flags: swayMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.95, metalness: 0 }),
    chain: new THREE.MeshStandardMaterial({ color: 0x5a4a38, roughness: 0.5, metalness: 0.9 }),
    socket: new THREE.MeshStandardMaterial({ color: 0x14100c, roughness: 0.6, metalness: 0.6 }),
    // the ledges' edges: a soft gold line (wayfinding in the dark, brighter as the temple wakes)
    edge: new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.7, 0.3).multiplyScalar(0.55) }),
    pulse: new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.85, 0.45).multiplyScalar(2.6) }),
    puff: puffTexture(),
  };
  MATS.dust = new THREE.ShaderMaterial({
    vertexShader: DUST_VS, fragmentShader: DUST_FS, transparent: true, depthWrite: false,
    uniforms: { map: { value: MATS.puff }, uLight: { value: new THREE.Color(1, 1, 1) } },
  });
  return MATS;
}

// ------------------------------------------------------------------ static dressing, merged per material
export class Builder {
  constructor(W, F) {
    this.W = W;
    this.F = F;
    this.parts = new Map();
    this.meshes = {};
  }

  add(key, geo) {
    if (!this.parts.has(key)) this.parts.set(key, []);
    this.parts.get(key).push(geo);
    return geo;
  }

  // a collider (temple coordinates)
  solid(x1, y1, z1, x2, y2, z2, props = {}) {
    const [a, b] = this.F.box(x1, y1, z1, x2, y2, z2);
    return this.W.addSolid(new THREE.Vector3(...a), new THREE.Vector3(...b), { static: true, kind: 'floor', ...props });
  }

  // a box (drawn in `key`'s material; solid unless { solid: false })
  // occ: a big opaque box the world's occlusion culling may hide things behind (walls, floors, the roof)
  blk(key, x1, y1, z1, x2, y2, z2, { solid = true, uv = 0.25, props = {}, occ = false } = {}) {
    const w = Math.abs(x2 - x1), h = Math.abs(y2 - y1), d = Math.abs(z2 - z1);
    if (w < 0.001 || h < 0.001 || d < 0.001) return null;
    this.add(key, boxGeo(w, h, d, uv).translate((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2));
    if (occ) props = { ...props, drawn: { m: templeMats()[key], region: regionOf(this.F.V((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2)) } };
    return solid ? this.solid(Math.min(x1, x2), Math.min(y1, y2), Math.min(z1, z2), Math.max(x1, x2), Math.max(y1, y2), Math.max(z1, z2), props) : null;
  }

  // merge everything into one mesh per material, moved into the world
  finish(mats, extra = {}) {
    for (const [key, geos] of this.parts) {
      const list = geos.map((g) => {
        const n = g.index ? g.toNonIndexed() : g;
        for (const a of Object.keys(n.attributes)) if (!['position', 'normal', 'uv', 'sway', 'color'].includes(a)) n.deleteAttribute(a);
        if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
        return n;
      });
      // (cloth and flags carry sway, flags colors: every piece in one material has the same attributes)
      const merged = mergeGeometries(list, false);
      if (!merged) {
        console.warn('[temple] merge failed', key);
        continue;
      }
      merged.applyMatrix4(this.F.M);
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, extra[key] || mats[key]);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.W.scene.add(mesh);
      this.meshes[key] = mesh;
    }
    this.parts.clear();
    return this.meshes;
  }
}

// a geometry stretched between two points (cables, ropes, chains, braces), w × h across
export function beamGeo(a, b, w = 0.1, h = w, radial = 0) {
  const A = a.isVector3 ? a : new THREE.Vector3(...a), Bv = b.isVector3 ? b : new THREE.Vector3(...b);
  const len = A.distanceTo(Bv);
  const g = radial ? new THREE.CylinderGeometry(w, w, len, radial).rotateX(Math.PI / 2) : new THREE.BoxGeometry(w, h, len);
  _m.lookAt(A, Bv, Math.abs(Bv.y - A.y) > len * 0.95 ? new THREE.Vector3(1, 0, 0) : UP);
  _q.setFromRotationMatrix(_m);
  g.applyQuaternion(_q);
  g.translate((A.x + Bv.x) / 2, (A.y + Bv.y) / 2, (A.z + Bv.z) / 2);
  return g;
}

// a hanging banner: a cloth strip of w × h hanging from (x, y, z) (its top centre), its face's normal n
// ([nx, nz]), tagged with `sway` for the shader
export function bannerGeo(x, y, z, n, w = 1.4, h = 4, segs = 6) {
  const g = new THREE.PlaneGeometry(w, h, 1, segs);
  const sway = new Float32Array(g.attributes.position.count);
  for (let i = 0; i < sway.length; i++) sway[i] = 0.5 - g.attributes.position.getY(i) / h; // 0 at the top
  g.setAttribute('sway', new THREE.BufferAttribute(sway, 1));
  g.rotateY(Math.atan2(n[0], n[1]));
  g.translate(x, y - h / 2, z);
  return g;
}

// a string of prayer flags between a and b, sagging, small triangles in turn colors (vertexColors)
const FLAG_COLORS = [0xb8281a, 0xe0a030, 0xf2e6c8, 0x8a3a12, 0xd86a1a].map((h) => new THREE.Color(h));
export function flagStringGeo(a, b, { sag = 1.2, n = 14, size = 0.55 } = {}) {
  const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b);
  const pos = [], nor = [], col = [], sw = [];
  const along = new THREE.Vector3().subVectors(Bv, A);
  const side = new THREE.Vector3(-along.z, 0, along.x).normalize();
  const pt = (t) => new THREE.Vector3().lerpVectors(A, Bv, t).setY(A.y + (Bv.y - A.y) * t - sag * 4 * t * (1 - t));
  for (let i = 0; i < n; i++) {
    const t0 = (i + 0.15) / n, t1 = (i + 0.85) / n;
    const p0 = pt(t0), p1 = pt(t1), tip = pt((t0 + t1) / 2).setY(pt((t0 + t1) / 2).y - size * 1.3);
    const c = FLAG_COLORS[i % FLAG_COLORS.length];
    for (const [p, s] of [[p0, 0], [p1, 0], [tip, 1]]) {
      pos.push(p.x, p.y, p.z);
      nor.push(side.x, side.y, side.z);
      col.push(c.r, c.g, c.b);
      sw.push(s);
    }
  }
  // the cord itself (thin, not swaying)
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('sway', new THREE.Float32BufferAttribute(sw, 1));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  return g;
}

// the cord of a flag string (or any sagging line) as short segments
export function sagGeos(a, b, sag = 1.2, w = 0.03, n = 8) {
  const out = [];
  const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b);
  let prev = A.clone();
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const p = new THREE.Vector3().lerpVectors(A, Bv, t);
    p.y -= sag * 4 * t * (1 - t);
    out.push(beamGeo(prev, p, w));
    prev = p;
  }
  return out;
}

// ------------------------------------------------------------------ Brazier
// (every lit brazier's coals share one flickering material; BRAZIER_CLOCK drives it)
const COALS = {
  dark: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.06, 0.035, 0.02) }),
  lit: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.6, 0.15) }),
};
export function brazierFlicker(t) {
  const f = 0.85 + 0.15 * Math.sin(t * 17) * Math.sin(t * 7.3);
  COALS.lit.color.setRGB(1.6, 0.6, 0.15).multiplyScalar(f);
}
// A bronze bowl on three legs. ignite() (the temple waking) or the yellow beam held on it lights it:
// flames, embers, smoke, a warm light (real: one of the world's pooled lights). onLit(b) when it catches.
export class Brazier {
  // bd + at: the bowl, rim and legs go into that Builder's merged dressing (at: the temple-local foot);
  // only the coals and the flame are its own meshes
  constructor(W, pos, { real = false, lit = false, onLit = null, scale = 1, bd = null, at = null } = {}) {
    this.W = W;
    this.pos = new THREE.Vector3(...pos);
    this.top = this.pos.clone().setY(this.pos.y + 1.15 * scale);
    this.on = false;
    this.k = 0;
    this.t = Math.random() * 10;
    this.heat = 0;
    this.onLit = onLit;
    const M = templeMats();
    this.group = new THREE.Group();
    this.group.position.copy(this.pos);
    const statics = [
      ['bronze', new THREE.CylinderGeometry(0.62, 0.36, 0.42, 12, 1, true).translate(0, 0.95, 0)],
      ['gold', new THREE.TorusGeometry(0.62, 0.05, 6, 16).rotateX(Math.PI / 2).translate(0, 1.16, 0)],
      ['darkBronze', new THREE.CircleGeometry(0.36, 10).rotateX(Math.PI / 2).translate(0, 0.74, 0)],
    ];
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      statics.push(['bronze', beamGeo([Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5], [Math.cos(a) * 0.25, 0.85, Math.sin(a) * 0.25], 0.07)]);
    }
    for (const [k, g] of statics) {
      if (bd && at) bd.add(k, g.scale(scale, scale, scale).translate(at[0], at[1], at[2]));
      else this.group.add(new THREE.Mesh(g, M[k]));
    }
    // the coals (one shared material while dark, one shared flickering one once lit)
    this.coals = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.05, 12).translate(0, 1.1, 0), COALS.dark);
    this.group.add(this.coals);
    // the flame: three crossed cards of fire in one mesh, scaled with the blaze
    const cards = [0, 1, 2].map((k) => new THREE.PlaneGeometry(0.9, 1.5).translate(0, 0.7, 0).rotateY((k / 3) * Math.PI));
    this.flame = new THREE.Mesh(mergeGeometries(cards), M.flame);
    this.flame.position.y = 1.1;
    this.flame.visible = false;
    this.group.add(this.flame);
    this.group.scale.setScalar(scale);
    // the beam's target: an invisible box round the bowl
    const hit = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.8, 1.3), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 1.0;
    this.group.add(hit);
    this.group.userData.hit = this;
    this.group.userData.beamRadius = 2.5;
    W.scene.add(this.group);
    W.addHittable(this.group);
    this.light = real ? W.addLight(0xff9a40, 0, 16, 1.5) : null;
    if (this.light) this.light.position.copy(this.top).y += 0.8;
    W.add(this);
    if (lit) this.ignite(true);
  }

  onHit(color) {
    return color === YELLOW ? 'hit' : 'immune';
  }

  onBeam(dt) {
    if (this.on) return 'hit';
    this.heat += dt;
    this.fed = 0;
    if (this.heat > 0.35) this.ignite(false, true);
    return 'hit';
  }

  ignite(instant = false, byPlayer = false) {
    if (this.on) return;
    this.on = true;
    this.flame.visible = true;
    this.coals.material = COALS.lit;
    if (instant) this.k = 1;
    else {
      this.W.fx.burst(this.top, 0xffa040, { count: 30, speed: 4, life: 0.7, size: 0.3, gravity: -2 });
      audio.sample('incinerator_ignite', { gain: 0.5 * nearGain(this.W, this.top, 40), rate: 1.4, vary: 0.1 });
    }
    this.onLit?.(this, byPlayer);
  }

  douse() {
    this.on = false;
    this.k = 0;
    this.flame.visible = false;
    this.coals.material = COALS.dark;
    if (this.light) this.light.intensity = 0;
  }

  update(dt, player) {
    if (!this.on) {
      this.fed = (this.fed ?? 9) + dt;
      if (this.fed > 0.15) this.heat = Math.max(0, this.heat - dt * 0.5);
      return;
    }
    this.t += dt;
    if (this.k < 1) this.k = Math.min(1, this.k + dt * 1.5);
    const f = 0.85 + 0.15 * Math.sin(this.t * 17) * Math.sin(this.t * 7.3);
    this.flame.scale.set(this.k * (0.9 + 0.1 * Math.sin(this.t * 11)), this.k * f * (0.9 + 0.2 * Math.sin(this.t * 6.1)), this.k);
    this.flame.rotation.y += dt * 0.6;
    if (this.light) this.light.intensity = 10 * this.k * f;
    const d2 = player.pos.distanceToSquared(this.top);
    if (d2 < 40 * 40 && Math.random() < dt * 14) {
      _v.copy(this.top).add(_w.set(rnd(-0.3, 0.3), 0.4, rnd(-0.3, 0.3)));
      this.W.fx.ember(_v, rnd(-0.3, 0.3), rnd(1.2, 2.6), rnd(-0.3, 0.3), Math.random() < 0.5 ? 0xffa030 : 0xff6a18, 0.9, 0.06);
    }
    if (d2 < 30 * 30 && Math.random() < dt * 3) {
      _v.copy(this.top).y += 1.6;
      this.W.fx.puff(_v, rnd(-0.1, 0.1), 0.6, rnd(-0.1, 0.1), _c.setRGB(0.25, 0.2, 0.17), 0.18, 3, 0.35, 3);
    }
  }
}

// ------------------------------------------------------------------ Censer
// A bronze incense burner on a long chain from `pivot`, swinging back and forth along `axis` (a world
// direction, unit, horizontal). Smoke trails it. If it catches you, you're knocked off your feet along
// its swing (no damage: you'll most likely fall). One sweep each way every `period` s.
export class Censer {
  constructor(W, { pivot, length = 6, axis = [0, 0, 1], amp = 0.95, period = 4.4, phase = 0 }) {
    this.W = W;
    this.pivot = new THREE.Vector3(...pivot);
    this.len = length;
    this.axis = new THREE.Vector3(...axis).normalize();
    this.amp = amp;
    this.period = period;
    this.t = phase * period;
    this.cool = 0;
    this.prevA = 0;
    this.pos = new THREE.Vector3();
    const M = templeMats();
    this.group = new THREE.Group();
    this.group.position.copy(this.pivot);
    // the swing plane: the group turns about the horizontal axis across the swing
    this.across = new THREE.Vector3().crossVectors(UP, this.axis).normalize();
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, length - 0.5, 5), M.chain);
    chain.position.y = -(length - 0.5) / 2;
    const pot = new THREE.Group();
    pot.position.y = -length;
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.65), M.bronze);
    const lid = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.55, 10), M.gold);
    lid.position.y = 0.42;
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.05, 6, 14), M.gold);
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.12;
    this.glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.6, 0.15) });
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), this.glowMat);
    glow.position.y = 0.05;
    pot.add(body, lid, band, glow);
    this.group.add(chain, pot);
    W.scene.add(this.group);
    W.add(this);
  }

  angle() {
    return this.amp * Math.sin((this.t / this.period) * Math.PI * 2);
  }

  update(dt, player) {
    this.t += dt;
    this.cool -= dt;
    const a = this.angle();
    _q.setFromAxisAngle(this.across, -a);
    this.group.quaternion.copy(_q);
    this.pos.set(0, -this.len, 0).applyQuaternion(_q).add(this.pivot);
    const near = player.pos.distanceToSquared(this.pos) < 40 * 40;
    if (near && Math.random() < dt * 14) {
      this.W.fx.puff(_u.copy(this.pos).setY(this.pos.y + 0.6), rnd(-0.1, 0.1), 0.4, rnd(-0.1, 0.1), _c.setRGB(0.32, 0.28, 0.24), 0.2, 2.2, 0.3, 3.2);
    }
    // a whoosh as it sweeps past the bottom
    if (near && Math.sign(a) !== Math.sign(this.prevA)) {
      const g = nearGain(this.W, this.pos, 18);
      if (g > 0.05) audio.noise({ dur: 0.5, gain: 0.12 * g, freq: 500, f2: 260, q: 0.8 });
    }
    this.prevA = a;
    // it hits you: off your feet, thrown along its swing
    if (this.cool > 0 || player.dead) return;
    _v.copy(player.pos).y += 0.9;
    if (_v.distanceToSquared(this.pos) < 1.0 * 1.0 || (Math.abs(_v.y - this.pos.y) < 1.0 && Math.hypot(_v.x - this.pos.x, _v.z - this.pos.z) < 0.85)) {
      const dir = Math.cos((this.t / this.period) * Math.PI * 2) >= 0 ? 1 : -1; // which way it's swinging
      _w.copy(this.axis).multiplyScalar(dir * 9.5);
      player.launch(5.5, _w, false);
      player.shake = Math.max(player.shake || 0, 0.6);
      this.cool = 1.2;
      audio.sample('boss_slam', { gain: 0.5, rate: 1.6, vary: 0.05 }) || audio.slam?.();
      audio.sample('mirror_hit', { gain: 0.6, rate: 0.5 });
      this.W.fx.burst(this.pos, 0xffa040, { count: 26, speed: 6, life: 0.6, size: 0.18, gravity: 6 });
    }
  }
}

// ------------------------------------------------------------------ SlideBlock
// A block (box min..max, world) that waits pushed `depth` m back into the wall along -out (out: unit,
// world) and grinds out when activated (deactivate: back in). Linked to receivers it follows their timer:
// it shudders in the last seconds. look: the material key.
export class SlideBlock {
  constructor(W, { min, max, out, depth = null, look = 'ledge', time = 1.1, delay = 0, onOut = null }) {
    this.W = W;
    this.min = new THREE.Vector3(...min);
    this.max = new THREE.Vector3(...max);
    this.out = new THREE.Vector3(...out);
    const size = new THREE.Vector3().subVectors(this.max, this.min);
    this.depth = depth ?? Math.abs(size.dot(this.out)) + 0.05;
    this.time = time;
    this.delay = delay;
    this.k = 0;
    this.target = 0;
    this.wait = 0;
    this.shudder = 0;
    this.onOut = onOut;
    const M = templeMats();
    this.group = new THREE.Group();
    const body = new THREE.Mesh(boxGeo(size.x, size.y, size.z), M[look]);
    const trimMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.7, 0.25).multiplyScalar(1.6) });
    const trim = new THREE.Mesh(new THREE.BoxGeometry(size.x + 0.04, 0.06, size.z + 0.04), trimMat);
    trim.position.y = size.y / 2 - 0.05;
    this.group.add(body, trim);
    this.center = new THREE.Vector3().addVectors(this.min, this.max).multiplyScalar(0.5);
    W.scene.add(this.group);
    this.solid = W.addSolid(this.min.clone(), this.max.clone(), { kind: 'floor', delta: new THREE.Vector3(), moving: true });
    this.place();
    W.add(this);
  }

  place() {
    const off = (1 - smooth(this.k)) * this.depth;
    _v.copy(this.out).multiplyScalar(-off);
    this.group.position.copy(this.center).add(_v);
    if (this.shudder > 0) this.group.position.x += (Math.random() - 0.5) * 0.06 * this.shudder;
    this.solid.min.copy(this.min).add(_v);
    this.solid.max.copy(this.max).add(_v);
    this.solid.enabled = this.k > 0.05;
    this.group.visible = this.k > 0.002;
  }

  activate(src, instant = false) {
    if (this.target === 1) return;
    this.target = 1;
    this.wait = instant ? 0 : this.delay;
    if (instant) {
      this.k = 1;
      this.place();
    }
  }

  deactivate() {
    this.target = 0;
    this.wait = 0;
  }

  timer(left) {
    this.shudder = left < 1.5 ? 1 : 0;
  }

  reset() {}

  update(dt) {
    if (this.k === this.target) {
      if (this.shudder) this.place();
      return;
    }
    if (this.wait > 0) return void (this.wait -= dt);
    const was = this.k;
    this.k = this.target > this.k ? Math.min(1, this.k + dt / this.time) : Math.max(0, this.k - dt / (this.time * 0.8));
    if (was === 0 || was === 1) {
      const g = nearGain(this.W, this.center, 45);
      audio.sample('servo_heavy', { gain: 0.7 * g, rate: 0.6, vary: 0.1 });
      audio.sample('floor_collapse', { gain: 0.35 * g, rate: 0.8, vary: 0.1 });
    }
    if (Math.random() < dt * 25) {
      _v.copy(this.center).addScaledVector(this.out, -((1 - this.k) * this.depth) + this.depth * 0.5);
      this.W.fx.puff(_v, rnd(-0.3, 0.3), rnd(-0.2, 0.3), rnd(-0.3, 0.3), _c.setRGB(0.55, 0.42, 0.28), 0.6, 1.2, 0.35, 3);
    }
    this.place();
    if (this.k === 1 && was < 1) {
      audio.sample('hydraulic_land', { gain: 0.5 * nearGain(this.W, this.center, 40), rate: 0.7 });
      this.onOut?.(this);
    }
  }
}

// ------------------------------------------------------------------ VLift
// A platform (box min..max at its bottom stop, world) riding `rise` m up and down on ropes. mode 'cycle':
// it rides on its own once started (pause s at each end); mode 'call': it waits at the bottom until you've
// stood on it for `wait` s, rides up to `stop()` (a height above its bottom, chosen when it leaves), pauses
// and comes back. A counterweight (cw: { pos: [x, y, z] top centre, size }) moves the other way.
export class VLift {
  constructor(W, { min, max, rise, mode = 'cycle', speed = 2, pause = 2, wait = 0.6, active = false, look = 'ledge', pulley = null, cw = null, stop = null, rim = 0xffc860 }) {
    this.W = W;
    this.min = new THREE.Vector3(...min);
    this.max = new THREE.Vector3(...max);
    this.size = new THREE.Vector3().subVectors(this.max, this.min);
    this.rise = rise;
    this.mode = mode;
    this.speed = speed;
    this.pause = pause;
    this.waitT = wait;
    this.active = active;
    this.stop = stop;
    this.h = 0; // height above the bottom
    this.goal = 0;
    this.dir = 0;
    this.hold = 0;
    this.stand = 0;
    this.ride = rise;
    const M = templeMats();
    this.group = new THREE.Group();
    const body = new THREE.Mesh(boxGeo(this.size.x, this.size.y, this.size.z), M[look]);
    body.position.copy(this.size).multiplyScalar(0.5);
    this.rimMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(rim).multiplyScalar(0.4) });
    const edge = new THREE.Mesh(new THREE.BoxGeometry(this.size.x + 0.05, 0.07, this.size.z + 0.05), this.rimMat);
    edge.position.set(this.size.x / 2, this.size.y - 0.03, this.size.z / 2);
    // a bronze frame and the four ropes up to the pulley beam (they stretch as it rides)
    const frame = new THREE.Mesh(new THREE.BoxGeometry(this.size.x + 0.2, 0.18, this.size.z + 0.2), M.bronze);
    frame.position.set(this.size.x / 2, -0.09, this.size.z / 2);
    this.group.add(body, edge, frame);
    W.scene.add(this.group);
    this.pulley = pulley ? new THREE.Vector3(...pulley) : null;
    if (this.pulley) {
      this.ropes = [];
      const g = new THREE.CylinderGeometry(0.035, 0.035, 1, 5).translate(0, 0.5, 0);
      for (const [cx, cz] of [[0.15, 0.15], [this.size.x - 0.15, 0.15], [0.15, this.size.z - 0.15], [this.size.x - 0.15, this.size.z - 0.15]]) {
        const r = new THREE.Mesh(g, M.rope);
        r.userData.c = [cx, cz];
        W.scene.add(r);
        this.ropes.push(r);
      }
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.12, 6, 14), M.bronze);
      wheel.position.copy(this.pulley);
      W.scene.add(wheel);
      this.wheel = wheel;
    }
    if (cw) {
      this.cwTop = new THREE.Vector3(...cw.pos);
      const s = cw.size || [1.2, 1.6, 1.2];
      this.cw = new THREE.Mesh(boxGeo(...s), M.sandDark);
      this.cwH = s[1];
      W.scene.add(this.cw);
      this.cwRope = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 5).translate(0, 0.5, 0), M.rope);
      W.scene.add(this.cwRope);
    }
    this.solid = W.addSolid(this.min.clone(), this.max.clone(), { kind: 'floor', delta: new THREE.Vector3(), moving: true });
    this.place();
    W.add(this);
  }

  start(instant = false) {
    this.active = true;
    this.rimMat.color.set(0xffc860).multiplyScalar(1.6);
    if (instant) return;
    audio.sample('elevator_start', { gain: 0.6 * nearGain(this.W, this.min, 40), rate: 0.7 });
  }

  place() {
    this.group.position.copy(this.min).y += this.h;
    this.solid.min.copy(this.min).y += this.h;
    this.solid.max.copy(this.max).y += this.h;
    if (this.ropes) {
      for (const r of this.ropes) {
        const [cx, cz] = r.userData.c;
        _v.set(this.min.x + cx, this.max.y + this.h, this.min.z + cz);
        const len = Math.max(0.1, _w.copy(this.pulley).sub(_v).length());
        r.position.copy(_v);
        r.quaternion.setFromUnitVectors(UP, _w.normalize());
        r.scale.set(1, len, 1);
      }
      this.wheel.rotation.z = -this.h * 2;
    }
    if (this.cw) {
      const y = this.cwTop.y - (this.rise - this.h) * 0; // (its travel mirrors the platform's)
      this.cw.position.set(this.cwTop.x, this.cwTop.y - this.h - this.cwH / 2, this.cwTop.z);
      const top = this.cwTop.y - this.h;
      this.cwRope.position.set(this.cwTop.x, top, this.cwTop.z);
      this.cwRope.scale.set(1, Math.max(0.1, (this.pulley ? this.pulley.y : top + 4) - top), 1);
      void y;
    }
  }

  riding(player) {
    const s = this.solid;
    return player.grounded && player.ground === s;
  }

  update(dt, player) {
    const d = this.solid.delta.set(0, 0, 0);
    if (!this.active) return;
    const before = this.h;
    if (this.mode === 'cycle') {
      if (this.hold > 0) this.hold -= dt;
      else {
        if (this.dir === 0) this.dir = this.h < this.rise / 2 ? 1 : -1;
        this.h += this.dir * this.speed * dt;
        if (this.h >= this.rise || this.h <= 0) {
          this.h = Math.max(0, Math.min(this.rise, this.h));
          this.dir *= -1;
          this.hold = this.pause;
        }
      }
    } else {
      // call: wait for a rider at the bottom, then up to the chosen stop and back
      if (this.dir === 0) {
        const on = this.riding(player);
        this.stand = on ? this.stand + dt : 0;
        const goal = this.stop ? this.stop() : this.rise;
        this.rimMat.color.set(0xffc860).multiplyScalar(goal > 0.5 ? 1.2 + (on ? 1 : 0.4 * Math.sin(this.W.time * 4)) : 0.25);
        if (on && goal > 0.5 && this.stand > this.waitT) {
          this.ride = goal;
          this.dir = 1;
          audio.sample('elevator_start', { gain: 0.6, rate: 0.8 });
        }
      } else if (this.hold > 0) {
        this.hold -= dt;
        if (this.hold <= 0) this.dir = -1;
      } else {
        this.h += this.dir * this.speed * dt;
        if (this.dir > 0 && this.h >= this.ride) {
          this.h = this.ride;
          this.hold = this.pause;
          audio.sample('hydraulic_land', { gain: 0.4, rate: 0.9 });
        } else if (this.dir < 0 && this.h <= 0) {
          this.h = 0;
          this.dir = 0;
          this.stand = -1.5; // (a moment before it'll take you up again)
        }
      }
    }
    d.set(0, this.h - before, 0);
    this.place();
  }
}

// ------------------------------------------------------------------ Drawbridge
// A plank bridge lying min..max (world) when down, hinged along the edge at `hinge` side ('+x' '-x' '+z'
// '-z': which end of the box the hinge is on). Raised it stands upright on its hinge; activate() swings it
// down (with a creak, a slam and dust); then it's solid.
export class Drawbridge {
  constructor(W, { min, max, hinge = '+x', down = false }) {
    this.W = W;
    this.min = new THREE.Vector3(...min);
    this.max = new THREE.Vector3(...max);
    const size = new THREE.Vector3().subVectors(this.max, this.min);
    const alongX = hinge[1] === 'x', sg = hinge[0] === '+' ? 1 : -1;
    this.k = down ? 1 : 0; // 0 raised → 1 down
    this.target = this.k;
    this.t = 0;
    const M = templeMats();
    // pivot at the hinge edge, top of the deck
    this.pivot = new THREE.Group();
    const hx = alongX ? (sg > 0 ? this.max.x : this.min.x) : (this.min.x + this.max.x) / 2;
    const hz = alongX ? (this.min.z + this.max.z) / 2 : sg > 0 ? this.max.z : this.min.z;
    this.pivot.position.set(hx, this.max.y, hz);
    const len = alongX ? size.x : size.z, wid = alongX ? size.z : size.x;
    const deck = new THREE.Group();
    // planks across the bridge, a little uneven
    const geos = [];
    const n = Math.round(len / 0.32);
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) * (len / n);
      const g = new THREE.BoxGeometry(alongX ? len / n - 0.04 : wid, size.y * (0.85 + Math.random() * 0.3), alongX ? wid : len / n - 0.04);
      g.translate(alongX ? -sg * u : 0, -size.y / 2, alongX ? 0 : -sg * u);
      geos.push(g);
    }
    // two stringers under it
    for (const o of [-wid / 2 + 0.2, wid / 2 - 0.2]) {
      const g = new THREE.BoxGeometry(alongX ? len : 0.16, 0.16, alongX ? 0.16 : len);
      g.translate(alongX ? (-sg * len) / 2 : o, -size.y - 0.08, alongX ? o : (-sg * len) / 2);
      geos.push(g);
    }
    deck.add(new THREE.Mesh(mergeGeometries(geos.map((g) => g.toNonIndexed())), M.wood));
    this.pivot.add(deck);
    this.axis = alongX ? new THREE.Vector3(0, 0, sg) : new THREE.Vector3(-sg, 0, 0);
    W.scene.add(this.pivot);
    this.solid = W.addSolid(this.min.clone(), this.max.clone(), { kind: 'floor', static: true });
    this.place();
    W.add(this);
  }

  place() {
    // raised: turned 90° up about the hinge
    this.pivot.quaternion.setFromAxisAngle(this.axis, -(1 - this.k) * (Math.PI / 2) * (this.axis.x + this.axis.z > 0 ? 1 : 1));
    this.solid.enabled = this.k > 0.97;
  }

  activate(src, instant = false) {
    this.target = 1;
    if (instant) {
      this.k = 1;
      this.place();
      return;
    }
    audio.sample('servo_heavy', { gain: 0.6 * nearGain(this.W, this.pivot.position, 40), rate: 0.45 });
  }

  deactivate() {}

  reset() {}

  update(dt) {
    if (this.k >= this.target) return;
    this.t += dt;
    // it falls, accelerating, and bounces once
    this.k = Math.min(1, this.k + dt * (0.4 + this.t * 2.2));
    this.place();
    if (this.k >= 1) {
      const p = this.pivot.position;
      audio.sample('door_slam', { gain: 0.8 * nearGain(this.W, p, 40), rate: 0.7 }) || audio.sample('boss_slam', { gain: 0.5, rate: 1.3 });
      this.W.fx.burst(_v.set((this.min.x + this.max.x) / 2, this.max.y, (this.min.z + this.max.z) / 2), SAND_HEX, { count: 40, speed: 3, life: 1.2, size: 0.4, gravity: 1, mode: 'puff' });
      this.W.game.player.shake = Math.max(this.W.game.player.shake || 0, 0.25);
    }
  }
}

// ------------------------------------------------------------------ StoneRing (and its gong)
// A great bronze ring of radius r round the obelisk at height y (world), carrying `n` stone drums (stand on
// them: they're solids that carry their riders). turn() rotates it a quarter turn (dir ±1) over `time` s.
// angle: the world angle of drum 0 (about +y, from +x toward +z).
export class StoneRing {
  constructor(W, { center, y, r = 7.5, n = 4, drum = 1.15, angle = Math.PI, time = 3.6 }) {
    this.W = W;
    this.c = new THREE.Vector3(center[0], y, center[2]);
    this.r = r;
    this.n = n;
    this.angle = angle;
    this.from = angle;
    this.to = angle;
    this.time = time;
    this.u = 1;
    this.y = y;
    const M = templeMats();
    this.group = new THREE.Group();
    this.group.position.copy(this.c);
    const band = new THREE.Mesh(new THREE.TorusGeometry(r, 0.18, 8, 72), M.bronze);
    band.rotation.x = Math.PI / 2;
    band.position.y = -0.4;
    const inlay = new THREE.Mesh(new THREE.TorusGeometry(r, 0.05, 4, 72), M.gold);
    inlay.rotation.x = Math.PI / 2;
    inlay.position.y = -0.22;
    this.group.add(band, inlay);
    // the spokes in to the obelisk's collar
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const sp = new THREE.Mesh(beamGeo([Math.cos(a) * 4.2, -0.5, Math.sin(a) * 4.2], [Math.cos(a) * (r - 0.1), -0.4, Math.sin(a) * (r - 0.1)], 0.16), M.darkBronze);
      this.group.add(sp);
    }
    this.drums = [];
    this.dR = drum;
    for (let i = 0; i < n; i++) {
      const g = new THREE.Group();
      const top = new THREE.Mesh(new THREE.CylinderGeometry(drum, drum * 1.05, 0.6, 16), M.ledge);
      top.position.y = -0.3;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(drum + 0.02, 0.05, 4, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.72, 0.28).multiplyScalar(1.5) }));
      rim.rotation.x = Math.PI / 2;
      rim.position.y = -0.04;
      const under = new THREE.Mesh(new THREE.ConeGeometry(drum * 0.8, 0.9, 12), M.sandDark);
      under.rotation.x = Math.PI;
      under.position.y = -1.05;
      g.add(top, rim, under);
      this.group.add(g);
      const s = W.addSolid(new THREE.Vector3(), new THREE.Vector3(), { kind: 'floor', delta: new THREE.Vector3(), moving: true });
      this.drums.push({ g, s, p: new THREE.Vector3() });
    }
    W.scene.add(this.group);
    this.place(true);
    W.add(this);
  }

  drumPos(i, out) {
    const a = this.angle + (i / this.n) * Math.PI * 2;
    return out.set(this.c.x + Math.cos(a) * this.r, this.y, this.c.z + Math.sin(a) * this.r);
  }

  place(first = false) {
    const hw = this.dR * 0.92;
    for (let i = 0; i < this.n; i++) {
      const d = this.drums[i];
      this.drumPos(i, _v);
      if (first) d.p.copy(_v);
      d.s.delta.subVectors(_v, d.p);
      d.p.copy(_v);
      d.s.min.set(_v.x - hw, this.y - 0.6, _v.z - hw);
      d.s.max.set(_v.x + hw, this.y, _v.z + hw);
      d.g.position.set(_v.x - this.c.x, 0, _v.z - this.c.z);
    }
    this.group.rotation.y = -this.angle;
    // (the drums don't spin with the band: counter-rotate them)
    for (const d of this.drums) d.g.rotation.y = this.angle;
  }

  turning() {
    return this.u < 1;
  }

  turn(dir = 1) {
    if (this.u < 1) return false;
    this.from = this.angle;
    this.to = this.angle + dir * (Math.PI * 2) / this.n;
    this.u = 0;
    audio.sample('servo_heavy', { gain: 0.8 * nearGain(this.W, this.c, 50), rate: 0.4 });
    audio.sample('rotor_turn', { gain: 0.6 * nearGain(this.W, this.c, 50), rate: 0.5 });
    return true;
  }

  setAngle(a) {
    this.angle = this.from = this.to = a;
    this.u = 1;
    this.place(true);
  }

  update(dt, player) {
    for (const d of this.drums) d.s.delta.set(0, 0, 0);
    if (this.u >= 1) return;
    this.u = Math.min(1, this.u + dt / this.time);
    this.angle = this.from + (this.to - this.from) * smooth(this.u);
    this.place();
    if (Math.random() < dt * 20) {
      const d = this.drums[(Math.random() * this.n) | 0];
      this.W.fx.puff(_u.copy(d.p).setY(d.p.y - 0.7), rnd(-0.3, 0.3), -0.4, rnd(-0.3, 0.3), _c.setRGB(0.5, 0.4, 0.28), 0.5, 1.5, 0.3, 3);
    }
    if (this.u >= 1) audio.sample('rotor_lock', { gain: 0.8 * nearGain(this.W, this.c, 50), rate: 0.5 });
    void player;
  }
}

// A bronze gong (a disc of radius r facing `n`, world) hung in a frame: any hit rings it and calls onRing
// (once it's settled again).
export class Gong {
  constructor(W, { pos, n, r = 0.85, onRing = null }) {
    this.W = W;
    this.pos = new THREE.Vector3(...pos);
    this.onRing = onRing;
    this.swing = 0;
    this.sv = 0;
    this.cool = 0;
    this.glow = 0;
    const M = templeMats();
    this.group = new THREE.Group();
    this.group.position.copy(this.pos);
    this.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...n));
    this.disc = new THREE.Group();
    this.discMat = M.gold.clone();
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.08, 28).rotateX(Math.PI / 2), this.discMat);
    const boss = new THREE.Mesh(new THREE.SphereGeometry(r * 0.28, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), M.bronze);
    boss.position.z = 0.04;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.7, 0.03, 4, 28), M.darkBronze);
    ring.position.z = 0.05;
    this.disc.add(disc, boss, ring);
    this.disc.position.y = -0.2;
    // the frame: two posts and a bar
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, r * 2.6, 0.12), M.bronze);
      post.position.set(sx * (r + 0.2), 0, -0.12);
      this.group.add(post);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(r * 2.6, 0.14, 0.14), M.bronze);
    bar.position.set(0, r * 1.25, -0.12);
    this.group.add(bar, this.disc);
    this.group.userData.hit = this;
    this.group.userData.beamRadius = r + 1.2;
    W.scene.add(this.group);
    W.addHittable(this.group);
    W.add(this);
  }

  ring() {
    this.sv += 2.5;
    this.glow = 1;
    const g = Math.max(0.3, nearGain(this.W, this.pos, 60));
    // a gong: a low fundamental, inharmonic partials and a long shimmer
    for (const [f, gain, dur] of [[98, 0.22, 3.2], [147, 0.12, 2.6], [211, 0.08, 2.2], [302, 0.05, 1.6], [431, 0.03, 1.2]]) audio.tone({ type: 'sine', f, f2: f * 0.985, dur, gain: gain * g, attack: 0.005 });
    audio.noise({ dur: 0.25, gain: 0.08 * g, freq: 2400, f2: 900, q: 0.6 });
    this.W.fx.ring(this.pos, null, 0xffc860, { size: 0.6, end: 3.2, life: 0.6, thick: 0.1, k: 1.4 });
  }

  onHit(color, hit) {
    if (this.cool > 0) return 'hit';
    this.cool = 0.6;
    this.ring();
    this.W.fx.sparks(hit?.point || this.pos, hit?.normal || UP, 0xffd070, { count: 10, speed: 6, life: 0.3 });
    this.onRing?.(this);
    return 'hit';
  }

  update(dt) {
    this.cool -= dt;
    this.sv += (-this.swing * 30 - this.sv * 2.2) * dt;
    this.swing += this.sv * dt;
    this.disc.rotation.x = this.swing * 0.25;
    this.glow = Math.max(0, this.glow - dt * 0.8);
    this.discMat.emissiveIntensity = 0.4 + this.glow * 3;
  }
}

// ------------------------------------------------------------------ BurnRope
// A taut rope from a to b (world). Hold the yellow beam on it ~`time` s and it burns through (embers,
// smoke, a snap); onBurn() then. burned / burn(instant).
export class BurnRope {
  constructor(W, { a, b, time = 0.9, onBurn = null }) {
    this.W = W;
    this.a = new THREE.Vector3(...a);
    this.b = new THREE.Vector3(...b);
    this.time = time;
    this.heat = 0;
    this.burned = false;
    this.onBurn = onBurn;
    this.feed = 9;
    this.mat = templeMats().rope.clone();
    this.mesh = new THREE.Mesh(beamGeo(this.a, this.b, 0.07, 0.07, 6), this.mat);
    // a fatter invisible sleeve so the beam finds it
    const sleeve = new THREE.Mesh(beamGeo(this.a, this.b, 0.28, 0.28, 6), new THREE.MeshBasicMaterial({ visible: false }));
    this.group = new THREE.Group();
    this.group.add(this.mesh, sleeve);
    this.group.userData.hit = this;
    this.group.userData.beamRadius = this.a.distanceTo(this.b) / 2 + 1;
    this.mid = new THREE.Vector3().addVectors(this.a, this.b).multiplyScalar(0.5);
    this.group.position.set(0, 0, 0);
    W.scene.add(this.group);
    W.addHittable(this.group);
    W.add(this);
  }

  onHit(color) {
    return color === YELLOW ? 'hit' : 'immune';
  }

  onBeam(dt, hit) {
    if (this.burned) return 'hit';
    this.feed = 0;
    this.heat += dt;
    if (hit?.point && Math.random() < dt * 30) this.W.fx.ember(hit.point, rnd(-1, 1), rnd(0.5, 2), rnd(-1, 1), 0xff8a30, 0.6, 0.05);
    if (hit?.point && Math.random() < dt * 8) this.W.fx.puff(hit.point, 0, 0.6, 0, _c.setRGB(0.3, 0.25, 0.2), 0.5, 1.5, 0.2, 3);
    if (Math.random() < dt * 4) audio.sample('lava_sizzle', { gain: 0.35, rate: 1.4, vary: 0.2 });
    if (this.heat >= this.time) this.burn();
    return 'hit';
  }

  burn(instant = false) {
    if (this.burned) return;
    this.burned = true;
    this.group.visible = false;
    this.W.removeHittable(this.group);
    if (!instant) {
      this.W.fx.burst(this.mid, 0xff8a30, { count: 30, speed: 4, life: 0.8, size: 0.12, gravity: 4 });
      audio.sample('crumble_break', { gain: 0.5, rate: 1.6 }) || audio.sample('shatter', { gain: 0.4, rate: 1.5 });
    }
    this.onBurn?.(this, instant);
  }

  update(dt) {
    this.feed += dt;
    if (this.burned) return;
    if (this.feed > 0.15) this.heat = Math.max(0, this.heat - dt * 0.4);
    const k = this.heat / this.time;
    this.mat.emissive.setRGB(1.2 * k, 0.4 * k, 0.05 * k);
  }
}

// ------------------------------------------------------------------ SupportJoint
// One of the obelisk's support joints: a crystal held in bronze jaws, deep in a stone shroud open only along
// `open` (a world direction) — only a beam coming straight down that throat reaches it. Hold the yellow beam
// on the crystal ~`time` s and it cracks (onCrack). broken / crack(instant).
export class SupportJoint {
  constructor(W, { pos, open, time = 1.8, onCrack = null }) {
    this.W = W;
    this.pos = new THREE.Vector3(...pos);
    this.open = new THREE.Vector3(...open);
    this.time = time;
    this.heat = 0;
    this.feed = 9;
    this.broken = false;
    this.onCrack = onCrack;
    this.t = Math.random() * 10;
    const M = templeMats();
    this.group = new THREE.Group();
    this.group.position.copy(this.pos);
    this.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.open);
    this.crystalMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.75, 0.3).multiplyScalar(1.2) });
    this.crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), this.crystalMat);
    this.crystal.scale.set(1, 1, 1.5);
    // the jaws
    for (const sx of [-1, 1]) {
      const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.5), M.bronze);
      jaw.position.set(sx * 0.3, 0, -0.1);
      this.group.add(jaw);
    }
    this.halo = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.4, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.7, 0.25).multiplyScalar(1.5), transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
    this.halo.position.z = 0.2;
    this.group.add(this.crystal, this.halo);
    this.group.userData.hit = this;
    this.group.userData.beamRadius = 1.4;
    W.scene.add(this.group);
    W.addHittable(this.group);
    W.add(this);
  }

  onHit(color) {
    return color === YELLOW ? 'hit' : 'immune';
  }

  onBeam(dt, hit) {
    if (this.broken) return 'hit';
    this.feed = 0;
    this.heat += dt;
    if (Math.random() < dt * 30) this.W.fx.sparks(hit?.point || this.pos, this.open, 0xffd070, { count: 3, speed: 6, life: 0.3 });
    if (Math.random() < dt * 3) audio.sample('energy_crackle', { gain: 0.4, rate: 0.8 + this.heat * 0.3, vary: 0.1 });
    if (this.heat >= this.time) this.crack();
    return 'hit';
  }

  crack(instant = false) {
    if (this.broken) return;
    this.broken = true;
    this.crystal.visible = false;
    this.halo.visible = false;
    this.W.removeHittable(this.group);
    if (!instant) {
      this.W.fx.burst(this.pos, 0xffc860, { count: 50, speed: 10, life: 0.9, size: 0.3, gravity: 6, mode: 'shard' });
      this.W.fx.flash(this.pos, 0xffc860, { size: 3, life: 0.3, k: 2 });
      this.W.fx.ring(this.pos, this.open, 0xffc860, { size: 0.4, end: 4, life: 0.5, thick: 0.2, k: 1.6 });
    }
    this.onCrack?.(this, instant);
  }

  update(dt) {
    this.feed += dt;
    if (this.broken) return;
    this.t += dt;
    if (this.feed > 0.15) this.heat = Math.max(0, this.heat - dt * 0.6);
    const k = this.heat / this.time;
    const pulse = 0.5 + 0.5 * Math.sin(this.t * (3 + k * 20));
    this.crystalMat.color.setRGB(1, 0.75 - k * 0.4, 0.3 - k * 0.2).multiplyScalar(1.2 + pulse * 0.8 + k * 3);
    this.crystal.rotation.z += dt * (1 + k * 10);
    this.halo.scale.setScalar(1 + k * 0.6 + pulse * 0.1);
    if (k > 0.3) this.group.position.copy(this.pos).add(_v.set((Math.random() - 0.5) * 0.04 * k, (Math.random() - 0.5) * 0.04 * k, 0));
  }
}

// ------------------------------------------------------------------ DustClouds
// Up to `max` soft puffs of dust that billow and drift (normal-blended: they hide what's behind them).
// puff(p, v, size, life, color, grow) one; jet(p, dir, n, speed, size) a gout of sand; light(k) dims them in
// the dark.
export class DustClouds {
  constructor(W, max = 160) {
    this.W = W;
    this.max = max;
    const M = templeMats();
    const geo = new THREE.PlaneGeometry(1, 1);
    this.alpha = new Float32Array(max);
    this.rot = new Float32Array(max);
    geo.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(this.alpha, 1));
    geo.setAttribute('aRot', new THREE.InstancedBufferAttribute(this.rot, 1));
    this.mesh = new THREE.InstancedMesh(geo, M.dust, max);
    this.mesh.frustumCulled = false;
    this.mesh.userData.noCull = true;
    this.mesh.renderOrder = 4;
    this.mesh.count = 0;
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.p = Array.from({ length: max }, () => ({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), size: 1, grow: 2, life: 0, max: 1, spin: 0, col: new THREE.Color(), drag: 1.2, grav: 0 }));
    this.n = 0;
    this.cursor = 0;
    W.scene.add(this.mesh);
    W.add(this);
  }

  puff(pos, vel, size = 2, life = 3, color = SAND_HEX, grow = 3, { drag = 1.2, grav = 0 } = {}) {
    let i;
    if (this.n < this.max) i = this.n++;
    else i = this.cursor = (this.cursor + 1) % this.max;
    const q = this.p[i];
    q.pos.copy(pos);
    q.vel.copy(vel);
    q.size = size;
    q.grow = grow;
    q.life = 0;
    q.max = life;
    q.spin = rnd(-0.4, 0.4);
    q.col.set(color).multiplyScalar(rnd(0.8, 1.1));
    q.drag = drag;
    q.grav = grav;
    this.rot[i] = Math.random() * Math.PI * 2;
    return q;
  }

  jet(pos, dir, n = 8, speed = 14, size = 1.2, color = SAND_HEX) {
    for (let k = 0; k < n; k++) {
      _v.set(dir[0] + rnd(-0.25, 0.25), dir[1] + rnd(-0.1, 0.1), dir[2] + rnd(-0.25, 0.25)).normalize().multiplyScalar(speed * rnd(0.6, 1.1));
      this.puff(pos, _v, size * rnd(0.6, 1.2), rnd(1.5, 2.6), color, 2.5, { drag: 0.9, grav: 7 });
    }
  }

  update(dt) {
    let live = 0;
    for (let i = 0; i < this.n; i++) {
      const q = this.p[i];
      q.life += dt;
      if (q.life >= q.max) continue;
      q.vel.multiplyScalar(Math.exp(-q.drag * dt));
      q.vel.y -= q.grav * dt;
      q.pos.addScaledVector(q.vel, dt);
      this.rot[i] += q.spin * dt;
      // (pack the live ones to the front)
      if (live !== i) {
        const t = this.p[live];
        this.p[live] = q;
        this.p[i] = t;
        this.rot[live] = this.rot[i];
      }
      const u = q.life / q.max;
      const s = q.size * (1 + (q.grow - 1) * Math.sqrt(u));
      _m.makeScale(s, s, s).setPosition(q.pos);
      this.mesh.setMatrixAt(live, _m);
      this.mesh.setColorAt(live, q.col);
      this.alpha[live] = Math.min(1, u * 8) * (1 - u) * (1 - u) * 0.85;
      live++;
    }
    this.n = live;
    this.mesh.count = live;
    if (live) {
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
      this.mesh.geometry.attributes.aAlpha.needsUpdate = true;
      this.mesh.geometry.attributes.aRot.needsUpdate = true;
    }
  }
}

// ------------------------------------------------------------------ Debris
// Tumbling stone chunks: drop(p, v, size) one; they fall, bounce once off `floor(x, z)` (a function giving the
// floor height there, or a number) and settle into it.
export class Debris {
  constructor(W, max = 60, floor = -1e9) {
    this.W = W;
    this.max = max;
    this.floor = floor;
    const M = templeMats();
    this.mesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.5, 0), M.sand, max);
    this.mesh.frustumCulled = false;
    this.mesh.userData.noCull = true;
    this.mesh.count = 0;
    this.p = Array.from({ length: max }, () => ({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), size: 1, life: 0, bounced: false }));
    this.n = 0;
    this.cursor = 0;
    W.scene.add(this.mesh);
    W.add(this);
  }

  drop(pos, vel, size = 1) {
    let i;
    if (this.n < this.max) i = this.n++;
    else i = this.cursor = (this.cursor + 1) % this.max;
    const q = this.p[i];
    q.pos.copy(pos);
    q.vel.copy(vel);
    q.rot.set(Math.random() * 6, Math.random() * 6, 0);
    q.spin.set(rnd(-4, 4), rnd(-4, 4), rnd(-4, 4));
    q.size = size;
    q.life = 0;
    q.bounced = false;
  }

  update(dt) {
    let live = 0;
    for (let i = 0; i < this.n; i++) {
      const q = this.p[i];
      q.life += dt;
      if (q.life > 7) continue;
      q.vel.y -= 22 * dt;
      q.pos.addScaledVector(q.vel, dt);
      q.rot.x += q.spin.x * dt;
      q.rot.y += q.spin.y * dt;
      q.rot.z += q.spin.z * dt;
      const fy = typeof this.floor === 'function' ? this.floor(q.pos.x, q.pos.z) : this.floor;
      if (q.pos.y < fy + q.size * 0.3) {
        q.pos.y = fy + q.size * 0.3;
        if (!q.bounced) {
          q.bounced = true;
          q.vel.set(q.vel.x * 0.4, -q.vel.y * 0.25, q.vel.z * 0.4);
          q.spin.multiplyScalar(0.5);
        } else {
          q.vel.set(0, 0, 0);
          q.spin.set(0, 0, 0);
          q.pos.y -= dt * 0.4; // settling into the sand
        }
      }
      if (live !== i) {
        this.p[i] = this.p[live];
        this.p[live] = q;
      }
      _q.setFromEuler(q.rot);
      _m.compose(q.pos, _q, _s.set(q.size, q.size * 0.8, q.size));
      this.mesh.setMatrixAt(live, _m);
      live++;
    }
    this.n = live;
    this.mesh.count = live;
    if (live) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ Launch
// Carries the player along a smooth path (world points, a Catmull-Rom curve) over `time` s: Player.update's
// mount hook hands it the frame after mouse look, so you can look about while you fly. ease(u) shapes the
// pace; onDone() when you're set down (on your feet, with a moment's grace).
export class Launch {
  constructor(game, pts, { time = 4, ease = (u) => u, onDone = null, shake = (u) => 0, look = null } = {}) {
    this.game = game;
    this.curve = new THREE.CatmullRomCurve3(pts.map((p) => (p.isVector3 ? p.clone() : new THREE.Vector3(...p))), false, 'centripetal');
    this.time = time;
    this.ease = ease;
    this.t = 0;
    this.onDone = onDone;
    this.shakeF = shake;
    this.look = look; // (u) => [point, weight] | null: the view is steered toward point (weight 0..1)
    this.prev = this.curve.getPoint(0);
    const p = game.player;
    p.mount = this;
    p.vel.set(0, 0, 0);
    p.crouching = false;
  }

  carry(p, dt) {
    this.t += dt;
    const u = Math.min(1, this.t / this.time);
    this.curve.getPoint(this.ease(u), p.pos);
    p.vel.subVectors(p.pos, this.prev).divideScalar(Math.max(dt, 1e-3));
    this.prev.copy(p.pos);
    p.grounded = false;
    p.ground = null;
    p.height = 1.75;
    p.fallTop = p.pos.y;
    p.fallSpeed = Math.max(0, -p.vel.y) * 0.6;
    p.sinkDepth = 0;
    p.inSand = false;
    p.burn = 0;
    p.launched = true;
    p.invuln = Math.max(p.invuln, 1.5);
    p.eye += (1.61 - p.eye) * Math.min(1, dt * 10);
    p.shake = Math.max(0, Math.max(p.shake - dt * 2.5, this.shakeF(u)));
    p.landKick = Math.max(0, (p.landKick || 0) - dt * 1.4);
    const L = this.look?.(u);
    if (L && L[1] > 0) {
      const [t, w] = L;
      const dx = t.x - p.pos.x, dy = t.y - (p.pos.y + p.eye), dz = t.z - p.pos.z;
      const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
      let dyaw = yaw - p.yaw;
      dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
      const k = Math.min(1, dt * 4 * w);
      p.yaw += dyaw * k;
      p.pitch += (Math.max(-1.5, Math.min(1.5, pitch)) - p.pitch) * k;
    }
    p.updateCamera();
    if (u >= 1) {
      p.mount = null;
      p.vel.multiplyScalar(0.15);
      p.vel.y = Math.min(p.vel.y, 0);
      p.carry?.set(0, 0, 0);
      p.launched = false;
      p.invuln = Math.max(p.invuln, 2);
      this.onDone?.();
    }
  }
}
