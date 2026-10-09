// AZURE — THE DROWNED REACH: the sea itself (called from azure.js).
//   · The OCEAN VOLUME: one sea from the trench floor to the surface (SEA_Y), built as water boxes with the
//     habitats' air spaces cut out of it (oceanVolumes). Every box carries `top` = the real surface, so a
//     swimmer under a habitat or beside an air bell still knows how far up the air is (player.js).
//   · The OCEAN SURFACE: a radial grid riding with the camera, rolled by four Gerstner swells in the
//     vertex shader (fading out with distance so the far sea is a flat sheet that only shades), whitecaps
//     on the crests, foam lines and turquoise shallows round everything that pierces the surface (one
//     mask texture rasterised once from the solids), and from below: Snell's window and dancing light.
//   · The SKY: a dome of towering tropical storm clouds over a deep blue sky, a sun breaking through with
//     god-rays, and a rainbow opposite it (over the open sea east of the rig). Only above water.
//   · UNDERWATER: a depth-tinted fog (main.js asks level.waterFog), a backdrop sphere in the fog's color
//     (so nothing past the fog shows the sky), slanting god-rays from the surface and drifting particulate.
//   · CAUSTICS: one tileable caustics texture, two scrolling samples min()'d together, projected on every
//     underwater surface of Azure's materials (addCaustics patches a material's shader).
// No per-frame allocations: every update only writes uniforms and a few reused vectors.
import * as THREE from 'three';

export const SEA_Y = -9.5;
// sun: high in the west-south-west, so the rainbow stands over the open sea to the east
export const SUN_DIR = new THREE.Vector3(-0.72, 0.58, 0.22).normalize();
const _v = new THREE.Vector3();

// ------------------------------------------------------------------ caustics
// A tileable caustic network: the bright seams between jittered Voronoi cells (F2 - F1), softened.
let causTex = null;
export function causticTexture() {
  if (causTex) return causTex;
  const S = 256, N = 7, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d'), img = g.createImageData(S, S);
  let seed = 0x5eed;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pts = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) pts.push([(i + 0.15 + rnd() * 0.7) / N, (j + 0.15 + rnd() * 0.7) / N]);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      let f1 = 9, f2 = 9;
      for (const [px, py] of pts) {
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            const dx = px + ox - u, dy = py + oy - v, d = Math.sqrt(dx * dx + dy * dy);
            if (d < f1) (f2 = f1), (f1 = d);
            else if (d < f2) f2 = d;
          }
        }
      }
      const e = (f2 - f1) * N; // 0 on a seam
      const b = Math.pow(Math.max(0, 1 - e / 0.55), 1.6);
      const k = (y * S + x) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = Math.round(255 * b);
      img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  causTex = new THREE.CanvasTexture(c);
  causTex.wrapS = causTex.wrapT = THREE.RepeatWrapping;
  causTex.colorSpace = THREE.NoColorSpace;
  causTex.generateMipmaps = true;
  causTex.minFilter = THREE.LinearMipmapLinearFilter;
  return causTex;
}

// shared by every patched material: time, overall strength (dimmed indoors), the sea's level
export const causticU = {
  uCausTex: { value: null },
  uCausT: { value: 0 },
  uCausK: { value: 1 },
  uSea: { value: SEA_Y },
};
export const CAUSTIC_GLSL = `
  uniform sampler2D uCausTex;
  uniform float uCausT, uCausK, uSea;
  // two scrolling samples of the caustic network, min()'d: the light that dances on the sea floor
  float causAt(vec2 p) {
    float a = texture2D(uCausTex, p * 0.085 + vec2(uCausT * 0.021, uCausT * 0.013)).r;
    float b = texture2D(uCausTex, p * 0.113 + vec2(-uCausT * 0.016, uCausT * 0.019) + 0.37).r;
    return min(a, b);
  }
  // the caustic light reaching a surface at world point w (normal n) under the sea: brightest on floors
  float caustic(vec3 w, vec3 n) {
    float depth = uSea - w.y;
    if (depth <= 0.0) return 0.0;
    vec3 an = abs(n);
    vec2 p = an.y > 0.6 ? w.xz : (an.x > an.z ? w.zy : w.xy);
    float up = n.y > 0.6 ? 1.0 : (n.y < -0.6 ? 0.35 : 0.22);
    return causAt(p) * up * exp(-depth * 0.011) * smoothstep(0.0, 1.5, depth) * uCausK;
  }`;

// Patch a MeshStandard material so its underwater surfaces catch the caustic light (tinted by its own
// albedo). strength scales it for this material. weather: sea-weathered steel on top (rust streaks
// running down from plate seams, and a band of barnacles and weed either side of the waterline).
const WEATHER_GLSL = `
  float wh(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
  float wn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(wh(i), wh(i + vec2(1,0)), f.x), mix(wh(i + vec2(0,1)), wh(i + vec2(1,1)), f.x), f.y); }
  vec3 weather(vec3 base, vec3 w, vec3 n) {
    vec3 an = abs(n);
    vec2 p = an.y > 0.6 ? w.xz : (an.x > an.z ? w.zy : w.xy);
    // big riveted plates (6 x 3 m, every other row offset) with thin dark seams
    float row = floor(p.y / 3.0);
    float seam = smoothstep(0.02, 0.0, 0.5 - abs(fract(p.y / 3.0) - 0.5)) + smoothstep(0.01, 0.0, 0.5 - abs(fract(p.x / 6.0 + row * 0.5) - 0.5));
    float plate = wh(vec2(floor(p.x / 6.0 + row * 0.5), row));
    float streak = wn(vec2(p.x * 1.3, p.y * 0.1)) * smoothstep(0.0, 1.0, fract(-p.y / 3.0));
    float rust = clamp(streak * 1.4 - 0.35 + wn(p * 0.35) * 0.5, 0.0, 1.0);
    vec3 c = mix(base * (0.88 + plate * 0.24), vec3(0.42, 0.2, 0.1), rust * 0.7);
    c *= 1.0 - min(seam, 1.0) * 0.3;
    // the tide line: barnacles, weed and verdigris a metre and a half either side of the sea's level
    // (out in the open sea only: the station's flooded rooms past the hull keep their own water lines)
    float band = (1.0 - smoothstep(0.6, 2.2, abs(w.y - uSea + 0.3))) * smoothstep(118.0, 113.0, w.x);
    float bar = smoothstep(0.45, 0.75, wn(p * 4.0)) * band;
    c = mix(c, vec3(0.18, 0.3, 0.22), band * 0.65);
    c = mix(c, vec3(0.75, 0.72, 0.62), bar * 0.6);
    // deeper down: a fur of weed and teal growth
    float under = smoothstep(uSea - 1.0, uSea - 12.0, w.y);
    c = mix(c, c * vec3(0.55, 0.85, 0.8) + vec3(0.0, 0.03, 0.03), under * 0.6);
    return c;
  }`;
export function addCaustics(m, strength = 1, { weather = false } = {}) {
  causticU.uCausTex.value = causticTexture();
  m.userData.occluder = true; // (still an opaque occluder for world.js)
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, causticU, { uCausS: { value: strength } });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCausW;\nvarying vec3 vCausN;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvCausW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvCausN = normalize(mat3(modelMatrix) * objectNormal);');
    let f = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCausW;\nvarying vec3 vCausN;\nuniform float uCausS;\n' + CAUSTIC_GLSL + (weather ? WEATHER_GLSL : ''));
    if (weather) f = f.replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb = weather(diffuseColor.rgb, vCausW, normalize(vCausN));');
    sh.fragmentShader = f.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vec3(0.55, 1.0, 1.05) * caustic(vCausW, normalize(vCausN)) * 1.6 * uCausS;');
  };
  // (strength is a uniform, so every strength shares one program: only the weathering changes the code)
  m.customProgramCacheKey = () => (weather ? 'causw' : 'caus');
  m.needsUpdate = true;
  return m;
}

// The swell's height at (x, z) at time t (the vertical part of the shader's Gerstner sum, for things that
// bob on it: buoys, the wave's drawback). amp: the swell's amplitude (OCEAN_AMP by default).
export const OCEAN_AMP = 0.6; // (the four swells sum to ~3.9x this at a crest: ~2.3 m)
const SW = [[-0.94, -0.34, 46, 0.3, 1], [-0.7, 0.71, 27, 0.26, 1], [-0.99, 0.14, 14, 0.22, 0.9], [-0.31, -0.95, 8.5, 0.18, 0.7]];
export function swellY(x, z, t, amp = OCEAN_AMP) {
  let y = 0;
  for (const [dx, dz, L, st, a] of SW) {
    const l = Math.hypot(dx, dz), k = (2 * Math.PI) / L, c = Math.sqrt(9.8 / k);
    y += (st / k) * amp * a * Math.sin(k * ((dx * x + dz * z) / l - c * t));
  }
  return y;
}

// ------------------------------------------------------------------ the ocean volume
// Subtract boxes from boxes: what's left of `a` once `b` is cut out of it (up to six boxes, x slabs
// first, then z, then y, so the pieces stay big).
function cut(a, b) {
  if (b.max.x <= a.min.x || b.min.x >= a.max.x || b.max.y <= a.min.y || b.min.y >= a.max.y || b.max.z <= a.min.z || b.min.z >= a.max.z) return [a];
  const out = [], mn = a.min.clone(), mx = a.max.clone();
  const piece = (x1, y1, z1, x2, y2, z2) => x2 - x1 > 1e-3 && y2 - y1 > 1e-3 && z2 - z1 > 1e-3 && out.push({ min: new THREE.Vector3(x1, y1, z1), max: new THREE.Vector3(x2, y2, z2) });
  if (b.min.x > mn.x) piece(mn.x, mn.y, mn.z, b.min.x, mx.y, mx.z);
  if (b.max.x < mx.x) piece(b.max.x, mn.y, mn.z, mx.x, mx.y, mx.z);
  const x1 = Math.max(mn.x, b.min.x), x2 = Math.min(mx.x, b.max.x);
  if (b.min.z > mn.z) piece(x1, mn.y, mn.z, x2, mx.y, b.min.z);
  if (b.max.z < mx.z) piece(x1, mn.y, b.max.z, x2, mx.y, mx.z);
  const z1 = Math.max(mn.z, b.min.z), z2 = Math.min(mx.z, b.max.z);
  if (b.min.y > mn.y) piece(x1, mn.y, z1, x2, b.min.y, z2);
  if (b.max.y < mx.y) piece(x1, b.max.y, z1, x2, mx.y, z2);
  return out;
}

// Register the sea: `bounds` [[x1, y1, z1], [x2, y2, z2]] (its max y is the surface) minus every air box
// in `airs` ([[min], [max]]). `currents` [{ min, max, current }]: the pieces inside those boxes push
// swimmers (the trench's soft edges, the turbine's intakes). Returns the list of volumes.
export function oceanVolumes(W, bounds, airs, currents = []) {
  let boxes = [{ min: new THREE.Vector3(...bounds[0]), max: new THREE.Vector3(...bounds[1]) }];
  // the current zones first, as cuts of their own, so each piece is wholly in or out of one (a later
  // zone wins where two overlap); every piece remembers its zone's id (to animate its current)
  const keep = (from, list) => {
    for (const p of list) {
      p.current = from.current;
      p.zone = from.zone;
    }
    return list;
  };
  for (const c of currents) {
    const cb = { min: new THREE.Vector3(...c.min), max: new THREE.Vector3(...c.max) };
    boxes = boxes.flatMap((b) => keep(b, cut(b, cb)).concat(intersect(b, cb, c.current, c.id)));
  }
  for (const [a, b] of airs) {
    const ab = { min: new THREE.Vector3(...a), max: new THREE.Vector3(...b) };
    boxes = boxes.flatMap((x) => keep(x, cut(x, ab)));
  }
  const top = bounds[1][1];
  const vols = boxes.map((b) => ({ min: b.min, max: b.max, top, ocean: true, zone: b.zone || null, current: b.current ? new THREE.Vector3(...b.current) : null }));
  (W.waters ??= []).push(...vols);
  return vols;
}
function intersect(a, b, current, zone = null) {
  const mn = a.min.clone().max(b.min), mx = a.max.clone().min(b.max);
  if (mx.x - mn.x < 1e-3 || mx.y - mn.y < 1e-3 || mx.z - mn.z < 1e-3) return [];
  return [{ min: mn, max: mx, current, zone }];
}

// ------------------------------------------------------------------ the foam mask
// R: a tight foam line round everything that pierces the surface; G: a wide falloff for the turquoise
// shallows. Rasterised once (1 texel = 1 m) from the static solids crossing the sea's level.
function foamMask(W, box, extra = []) {
  const [x1, z1, x2, z2] = box, nx = Math.ceil(x2 - x1), nz = Math.ceil(z2 - z1);
  const hit = new Uint8Array(nx * nz);
  const mark = (ax, az, bx, bz) => {
    for (let j = Math.max(0, Math.floor(az - z1)); j < Math.min(nz, Math.ceil(bz - z1)); j++)
      for (let i = Math.max(0, Math.floor(ax - x1)); i < Math.min(nx, Math.ceil(bx - x1)); i++) hit[j * nx + i] = 1;
  };
  for (const s of W.solids) {
    if (!s.static || s.min.y > SEA_Y + 0.3 || s.max.y < SEA_Y - 0.3) continue;
    mark(s.min.x, s.min.z, s.max.x, s.max.z);
  }
  for (const [ax, az, bx, bz] of extra) mark(ax, az, bx, bz);
  // distance (in texels) to the nearest hit, by two chamfer passes
  const d = new Float32Array(nx * nz).fill(1e4);
  for (let k = 0; k < d.length; k++) if (hit[k]) d[k] = 0;
  const at = (i, j) => (i < 0 || j < 0 || i >= nx || j >= nz ? 1e4 : d[j * nx + i]);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) d[j * nx + i] = Math.min(d[j * nx + i], at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + 1.41, at(i + 1, j - 1) + 1.41);
  for (let j = nz - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) d[j * nx + i] = Math.min(d[j * nx + i], at(i + 1, j) + 1, at(i, j + 1) + 1, at(i + 1, j + 1) + 1.41, at(i - 1, j + 1) + 1.41);
  const data = new Uint8Array(nx * nz * 4);
  for (let k = 0; k < d.length; k++) {
    data[k * 4] = Math.round(255 * Math.max(0, 1 - d[k] / 4.5));
    data[k * 4 + 1] = Math.round(255 * Math.max(0, 1 - d[k] / 26));
    data[k * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(data, nx, nz, THREE.RGBAFormat);
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return { tex: t, box: new THREE.Vector4(x1, z1, nx, nz) };
}

// ------------------------------------------------------------------ the ocean surface
const WAVES_GLSL = `
  uniform float uT, uAmp;
  // four Gerstner swells (direction, wavelength, steepness, speed): the long Pacific rollers from the
  // east-north-east and a cross sea under them
  const vec4 W0 = vec4(-0.94, -0.34, 46.0, 0.30);
  const vec4 W1 = vec4(-0.70, 0.71, 27.0, 0.26);
  const vec4 W2 = vec4(-0.99, 0.14, 14.0, 0.22);
  const vec4 W3 = vec4(-0.31, -0.95, 8.5, 0.18);
  void gerst(vec4 w, vec2 p, float amp, inout vec3 d, inout vec3 tx, inout vec3 tz) {
    float k = 6.2831853 / w.z, c = sqrt(9.8 / k), a = w.w / k * amp;
    vec2 dir = normalize(w.xy);
    float f = k * (dot(dir, p) - c * uT);
    float s = sin(f), co = cos(f);
    d += vec3(dir.x * a * co, a * s, dir.y * a * co);
    tx += vec3(-dir.x * dir.x * w.w * amp * s, dir.x * w.w * amp * co, -dir.x * dir.y * w.w * amp * s);
    tz += vec3(-dir.x * dir.y * w.w * amp * s, dir.y * w.w * amp * co, -dir.y * dir.y * w.w * amp * s);
  }
  vec3 swell(vec2 p, float amp, out vec3 n) {
    vec3 d = vec3(0.0), tx = vec3(1.0, 0.0, 0.0), tz = vec3(0.0, 0.0, 1.0);
    gerst(W0, p, amp, d, tx, tz);
    gerst(W1, p, amp, d, tx, tz);
    gerst(W2, p, amp * 0.9, d, tx, tz);
    gerst(W3, p, amp * 0.7, d, tx, tz);
    n = normalize(cross(tz, tx));
    return d;
  }`;

const OCEAN_V = `
  ${WAVES_GLSL}
  uniform sampler2D uMask;
  uniform vec4 uMaskBox;
  uniform float uNearFlat;
  varying vec3 vW;
  varying vec3 vN;
  varying float vH;
  varying vec2 vMask;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    float dist = distance(w.xz, cameraPosition.xz);
    vec2 muv = (w.xz - uMaskBox.xy) / uMaskBox.zw;
    vec2 mask = (muv.x > 0.0 && muv.y > 0.0 && muv.x < 1.0 && muv.y < 1.0) ? texture2D(uMask, muv).rg : vec2(0.0);
    vMask = mask;
    // the swell dies away with distance (the far sheet only shades) and calms in the lee of structures;
    // right round a swimmer at the surface it flattens, so the waves never slice through the view
    float amp = uAmp * (1.0 - smoothstep(140.0, 260.0, dist)) * (1.0 - 0.55 * mask.r);
    amp *= mix(1.0, smoothstep(1.5, 12.0, dist), uNearFlat);
    vec3 n;
    vec3 d = swell(w.xz, amp, n);
    w.xyz += d;
    vH = d.y / max(uAmp * 3.9, 0.01);
    vN = n;
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

const OCEAN_F = `
  ${WAVES_GLSL}
  uniform vec3 uSunDir, uHor, uSkyTop, uFogCol, uSunCol;
  uniform float uFlash, uUnder;
  varying vec3 vW;
  varying vec3 vN;
  varying float vH;
  varying vec2 vMask;
  float h1(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
  float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h1(i), h1(i + vec2(1,0)), f.x), mix(h1(i + vec2(0,1)), h1(i + vec2(1,1)), f.x), f.y); }
  void main() {
    if (vW.x < 32.0) discard; // (the sea lies east of the Nexus; the other worlds keep their own ground)
    vec3 toCam = cameraPosition - vW;
    float dist = length(toCam);
    vec3 V = toCam / dist;
    // ripples on top of the swell: two drifting noise layers bend the normal
    vec2 rp = vW.xz * 0.35;
    float r1 = vn(rp + vec2(uT * 0.6, uT * 0.2)) - 0.5, r2 = vn(rp * 2.3 - vec2(uT * 0.4, -uT * 0.7)) - 0.5;
    float fine = 1.0 - smoothstep(30.0, 160.0, dist);
    vec3 n;
    if (dist > 200.0) swell(vW.xz, 0.6, n); else n = normalize(vN);
    n = normalize(n + vec3(r1 * 0.35 + r2 * 0.2, 0.0, r2 * 0.35 - r1 * 0.15) * fine);
    if (!gl_FrontFacing) {
      // ---- seen from below: Snell's window, a bright rippling ceiling of light, fading into the murk
      float up = clamp(-V.y, 0.0, 1.0);
      float win = smoothstep(0.55, 0.85, up);
      float sh = vn(vW.xz * 0.12 + uT * vec2(0.08, 0.12)) * vn(vW.xz * 0.27 - uT * vec2(0.12, 0.05)) * (1.0 - smoothstep(25.0, 70.0, dist));
      vec3 c = mix(uFogCol * 1.3, vec3(0.55, 0.9, 1.0), win) + vec3(0.6, 0.95, 1.0) * sh * (0.4 + win);
      c += vec3(1.0, 0.95, 0.8) * pow(max(dot(-V, vec3(uSunDir.x * 0.3, 1.0, uSunDir.z * 0.3)), 0.0), 40.0) * 1.5;
      float murk = exp(-dist * 0.032);
      gl_FragColor = vec4(mix(uFogCol, c, murk), 1.0);
      return;
    }
    // ---- seen from above
    float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
    vec3 R = reflect(-V, n);
    float ry = clamp(R.y, 0.0, 1.0);
    vec3 sky = mix(uHor, uSkyTop, smoothstep(0.0, 0.6, ry));
    // the sea's own color: deep sapphire, lifting to turquoise in the shallows round structures and
    // on the sunlit faces of the swells
    vec3 deep = vec3(0.01, 0.08, 0.20), mid = vec3(0.02, 0.24, 0.42), shallow = vec3(0.05, 0.62, 0.66);
    vec3 body = mix(deep, mid, clamp(vH * 0.5 + 0.5, 0.0, 1.0));
    body = mix(body, shallow, vMask.g * vMask.g * 0.85);
    float sss = pow(max(dot(V, -uSunDir), 0.0), 3.0) * clamp(vH + 0.3, 0.0, 1.0);
    body += vec3(0.05, 0.4, 0.38) * sss * 0.6;
    vec3 c = mix(body, sky, fres * 0.85);
    // the sun's glitter path
    float spec = pow(max(dot(R, uSunDir), 0.0), 220.0);
    c += uSunCol * spec * 2.5 * (1.0 - uFlash * 0.5);
    // whitecaps on the crests, streaky foam blown downwind, and foam lines where the sea hits structures
    float crest = smoothstep(0.5, 0.9, vH) * (0.35 + 0.65 * vn(vW.xz * 0.25 + uT * 0.15));
    float streak = vn(vec2(vW.x * 0.08 + uT * 0.4, vW.z * 0.9)) * vn(vW.xz * 0.6 - uT * 0.3);
    float edge = vMask.r * (0.55 + 0.45 * sin(uT * 2.2 - vMask.r * 9.0 + vn(vW.xz * 0.7) * 6.0));
    float foam = clamp(crest * 0.9 + streak * crest * 0.6 + edge * (0.6 + 0.4 * vn(vW.xz * 1.7 + uT)), 0.0, 1.0) * fine;
    c = mix(c, vec3(0.92, 0.97, 1.0), foam * 0.85);
    c += vec3(0.6, 0.7, 0.9) * uFlash * 0.25;
    // into the haze toward the horizon
    float haze = smoothstep(80.0, 420.0, dist);
    c = mix(c, uFogCol, haze * 0.65);
    c = mix(c, uHor, smoothstep(300.0, 430.0, dist));
    gl_FragColor = vec4(c, 1.0);
  }`;

// a radial grid of rings out to `R`, dense in the middle (where the swell is drawn)
function radialGrid(R = 3000, rings = 72, segs = 128) {
  const pos = [], idx = [];
  pos.push(0, 0, 0);
  const radius = (i) => (i <= 40 ? i * 3.2 : 128 + Math.pow((i - 40) / (rings - 40), 2.2) * (R - 128));
  for (let i = 1; i <= rings; i++) {
    const r = radius(i);
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      pos.push(Math.cos(a) * r, 0, Math.sin(a) * r);
    }
  }
  for (let s = 0; s < segs; s++) idx.push(0, 1 + ((s + 1) % segs), 1 + s);
  for (let i = 1; i < rings; i++) {
    const a0 = 1 + (i - 1) * segs, b0 = 1 + i * segs;
    for (let s = 0; s < segs; s++) {
      const s1 = (s + 1) % segs;
      idx.push(a0 + s, b0 + s1, b0 + s, a0 + s, a0 + s1, b0 + s1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

// ------------------------------------------------------------------ the sky
const SKY_F = `
  uniform float uT, uFade, uFlash, uStorm;
  uniform vec3 uSunDir, uTop, uMid, uHor;
  varying vec3 vDir;
  float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
  float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * n3(p); p = p * 2.07 + 0.31; a *= 0.5; } return s; }
  void main() {
    vec3 d = normalize(vDir);
    if (d.y < -0.08) discard;
    float h = max(d.y, 0.0);
    // TOWERING CUMULONIMBUS round the horizon: columns of billowing cloud rising to an uneven top, taller
    // to the north-east and south where the storm cells sit; broken cumulus overhead with blue between
    float az = atan(d.z, d.x);
    float cells = 0.55 + 0.45 * sin(az * 2.0 + 0.6) * sin(az * 3.0 - 1.1);
    float colN = fbm(vec3(az * 3.2, 3.1, uT * 0.002));
    float topH = 0.015 + 0.42 * pow(max(0.0, colN - 0.38) * 2.6, 1.25) * (0.45 + 0.55 * cells) * (0.65 + 0.35 * uStorm);
    float billow = fbm(vec3(az * 9.0, h * 12.0 - uT * 0.006, 1.7));
    float tower = smoothstep(topH + 0.025, topH - 0.035, h + (billow - 0.5) * 0.1) * smoothstep(-0.03, 0.01, h);
    vec2 cp = d.xz / (h + 0.18);
    vec3 q = vec3(cp * 1.3, uT * 0.006);
    float base = fbm(q + vec3(uT * 0.004, 0.0, 0.0));
    float detail = fbm(q * 3.1 - vec3(uT * 0.01, 0.0, 0.0));
    float cover = 0.6 - uStorm * 0.14;
    float over = smoothstep(cover, cover + 0.2, base * 0.75 + detail * 0.35) * smoothstep(0.06, 0.28, h);
    float dens = clamp(max(tower, over), 0.0, 1.0);
    float towers = tower;
    // the light: towers sunlit on the side facing the sun and on their crowns, bruised dark at the base
    // (darker still in the storm cells, where the rain hangs under them)
    float sunSide = clamp(dot(normalize(d.xz + 1e-4), normalize(uSunDir.xz)) * 0.5 + 0.5, 0.0, 1.0);
    float crown = smoothstep(topH * 0.35, topH, h);
    float lit = clamp(mix(0.12, 1.05, crown) * (0.5 + 0.5 * sunSide) + (billow - 0.5) * 0.9, 0.0, 1.0);
    lit = mix(lit, clamp(0.55 + (fbm(q * 2.0 + uSunDir * 0.6) - base) * 2.5, 0.0, 1.0), over * (1.0 - tower));
    float sunAmt = pow(max(dot(d, uSunDir), 0.0), 3.0);
    vec3 belly = mix(vec3(0.3, 0.34, 0.4), vec3(0.1, 0.12, 0.17), cells * uStorm);
    vec3 top = mix(vec3(0.88, 0.92, 0.98), vec3(1.25, 1.15, 1.0), sunAmt);
    vec3 cloud = mix(belly, top, lit);
    // rain curtains hanging under the storm cells
    float curtain = tower * (1.0 - crown) * cells * uStorm * smoothstep(0.4, 0.9, fbm(vec3(az * 14.0, h * 3.0 + uT * 0.05, 5.0)));
    cloud = mix(cloud, vec3(0.32, 0.36, 0.42), curtain * 0.5);
    // silver linings round the sun
    float edge = dens * (1.0 - dens) * 4.0;
    cloud += vec3(1.0, 0.95, 0.85) * edge * pow(max(dot(d, uSunDir), 0.0), 8.0) * 1.5;
    // the sun: a hot disc and a wide glow, dimmed where cloud covers it
    float sd = dot(d, uSunDir);
    vec3 sun = vec3(1.6, 1.45, 1.2) * (smoothstep(0.9993, 0.9997, sd) * 6.0 + pow(max(sd, 0.0), 220.0) * 1.5 + pow(max(sd, 0.0), 12.0) * 0.25);
    // god-rays: streaks fanning out from the sun through the gaps in the cloud
    vec3 toSun = normalize(cross(cross(uSunDir, d), uSunDir));
    float ang = atan(dot(cross(uSunDir, toSun), d), dot(toSun, vec3(0.0, 1.0, 0.0)));
    float rays = smoothstep(0.35, 1.0, n3(vec3(ang * 9.0, uT * 0.05, 0.0))) * pow(max(sd, 0.0), 6.0) * (1.0 - dens);
    // the rainbow: a band 40.5..42.5 deg from the antisolar point, where the rain hangs in sunlight
    float ra = degrees(acos(clamp(dot(d, -uSunDir), -1.0, 1.0)));
    float rb = clamp((ra - 40.2) / 2.6, 0.0, 1.0);
    vec3 bow = clamp(abs(fract(rb * 0.85 + vec3(0.0, 0.33, 0.67)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
    float bowA = smoothstep(0.0, 0.15, rb) * smoothstep(1.0, 0.85, rb) * (1.0 - dens * 0.8) * smoothstep(-0.02, 0.06, d.y) * 0.32 * (1.0 - uStorm * 0.5);
    // the sky behind it all (the same gradient as the world's sky dome, which this one covers), a little
    // greyer under the storm cells
    vec3 sky = mix(uHor, uMid, smoothstep(-0.05, 0.25, h));
    sky = mix(sky, uTop, smoothstep(0.25, 0.9, h));
    sky = mix(sky, vec3(0.35, 0.4, 0.46), towers * cells * uStorm * 0.5);
    vec3 col = sky + sun * (1.0 - dens) + vec3(1.0, 0.9, 0.75) * rays * 0.35;
    col = mix(col, cloud, dens);
    col += bow * bowA;
    col += vec3(0.6, 0.7, 0.95) * uFlash * dens * 1.5;
    gl_FragColor = vec4(col, uFade);
  }`;

// ------------------------------------------------------------------ build it all
// opts: { foamBox: [x1, z1, x2, z2] (where the foam mask is rasterised), foamExtra: [[x1, z1, x2, z2]] }
export function buildOcean(B, { foamBox = [20, -240, 230, -30], foamExtra = [] } = {}) {
  const { W, game, level } = B;
  const st = { under: false, flash: 0, storm: 0.6, surface: null, drop: 0, t: null };
  const t = { value: 0 };
  st.t = t;
  const sky = game.sky?.material?.uniforms;
  const fogCol = new THREE.Color(0x0e4a5e);
  // ---- the surface
  const maskU = { uMask: { value: null }, uMaskBox: { value: new THREE.Vector4(0, 0, 1, 1) } };
  const surfMat = new THREE.ShaderMaterial({
    uniforms: {
      uT: t, uAmp: { value: OCEAN_AMP }, uNearFlat: { value: 0 }, ...maskU,
      uSunDir: { value: SUN_DIR }, uSunCol: { value: new THREE.Color(1.0, 0.92, 0.75) },
      uHor: { value: sky ? sky.uHor.value : new THREE.Vector3(0.6, 0.75, 0.85) }, uSkyTop: { value: sky ? sky.uMid.value : new THREE.Vector3(0.3, 0.55, 0.9) },
      uFogCol: { value: fogCol }, uFlash: { value: 0 }, uUnder: { value: 0 },
    },
    vertexShader: OCEAN_V, fragmentShader: OCEAN_F, side: THREE.DoubleSide, fog: false,
  });
  const surf = new THREE.Mesh(radialGrid(), surfMat);
  surf.frustumCulled = false;
  surf.userData.noCull = true;
  surf.userData.noBatch = true;
  surf.raycast = () => {};
  surf.position.y = SEA_Y;
  W.scene.add(surf);
  st.surface = surf;
  // ---- the sky dome (above water only)
  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      uT: t, uFade: { value: 1 }, uFlash: { value: 0 }, uStorm: { value: 0.5 }, uSunDir: { value: SUN_DIR },
      uTop: { value: sky ? sky.uTop.value : new THREE.Vector3(0.1, 0.3, 0.7) }, uMid: { value: sky ? sky.uMid.value : new THREE.Vector3(0.3, 0.5, 0.85) }, uHor: { value: sky ? sky.uHor.value : new THREE.Vector3(0.6, 0.75, 0.85) },
    },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: SKY_F, side: THREE.BackSide, transparent: true, depthWrite: false, fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), skyMat);
  dome.frustumCulled = false;
  dome.userData.noCull = true;
  dome.userData.noBatch = true;
  dome.renderOrder = -5;
  dome.raycast = () => {};
  W.scene.add(dome);
  // ---- the underwater backdrop: the fog's own color, darker below, so the murk never shows the sky
  const backMat = new THREE.ShaderMaterial({
    uniforms: { uFogCol: { value: fogCol } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uFogCol; varying vec3 vDir;
      void main(){ float y = normalize(vDir).y; gl_FragColor = vec4(uFogCol * mix(0.35, 1.25, smoothstep(-0.6, 0.7, y)), 1.0); }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const back = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), backMat);
  back.frustumCulled = false;
  back.userData.noCull = true;
  back.userData.noBatch = true;
  back.renderOrder = 1; // (after the world's sky dome, which it must cover; the depth test keeps it behind everything nearer)
  back.raycast = () => {};
  W.scene.add(back);
  // ---- underwater god-rays: tall slanting sheets hanging from the surface, wrapped round the camera
  const RAYS = 14;
  const rayGeo = new THREE.InstancedBufferGeometry();
  rayGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, -1, 0, -0.5, -1, 0], 3));
  rayGeo.setIndex([0, 2, 1, 0, 3, 2]);
  const rseed = new Float32Array(RAYS * 4);
  for (let i = 0; i < rseed.length; i++) rseed[i] = Math.random();
  rayGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(rseed, 4));
  rayGeo.instanceCount = RAYS;
  const rayMat = new THREE.ShaderMaterial({
    uniforms: { uT: t, uSea: { value: SEA_Y }, uK: { value: 0 }, uSun: { value: SUN_DIR } },
    vertexShader: `
      attribute vec4 aSeed; uniform float uT, uSea; uniform vec3 uSun; varying float vA; varying vec2 vUv;
      void main() {
        float R = 46.0;
        vec2 c = (aSeed.xy - 0.5) * 2.0 * R + vec2(sin(uT * 0.05 + aSeed.z * 6.0), cos(uT * 0.04 + aSeed.w * 6.0)) * 3.0;
        c = mod(c - cameraPosition.xz + R, 2.0 * R) + cameraPosition.xz - R;
        float len = 70.0, w = 3.0 + aSeed.z * 7.0;
        // a sheet turned to face the camera about the vertical, leaning away from the sun
        vec3 lean = normalize(vec3(-uSun.x * 0.45, -1.0, -uSun.z * 0.45));
        vec3 toCam = normalize(vec3(cameraPosition.x - c.x, 0.0, cameraPosition.z - c.y));
        vec3 side = normalize(cross(lean, toCam));
        vec3 top = vec3(c.x, uSea, c.y);
        vec3 p = top + side * position.x * w - lean * position.y * len;
        vUv = vec2(position.x + 0.5, -position.y);
        float d = distance(cameraPosition, p);
        vA = smoothstep(2.0, 10.0, d) * (1.0 - smoothstep(30.0, 52.0, d)) * (0.55 + 0.45 * sin(uT * (0.3 + aSeed.w * 0.4) + aSeed.x * 20.0));
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform float uK; varying float vA; varying vec2 vUv;
      void main() {
        float a = vA * uK * smoothstep(0.0, 0.35, vUv.x) * smoothstep(1.0, 0.65, vUv.x) * pow(1.0 - vUv.y, 1.6);
        if (a < 0.003) discard;
        gl_FragColor = vec4(vec3(0.5, 0.9, 1.0) * a * 0.22, 1.0);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide,
  });
  const rays = new THREE.Mesh(rayGeo, rayMat);
  rays.frustumCulled = false;
  rays.userData.noCull = true;
  rays.userData.noBatch = true;
  rays.raycast = () => {};
  rays.renderOrder = 4;
  W.scene.add(rays);

  // ---- the underwater fog (main.js calls this instead of its own murk while your head is under)
  const shallowC = new THREE.Color(0x1a8aa6), deepC = new THREE.Color(0x0a3a58);
  level.waterFog = (f, player) => {
    const p = player.pos;
    if (p.x < 30) return false; // (not ours)
    const depth = Math.max(0, SEA_Y - (p.y + player.eye));
    const k = Math.min(1, depth / 55);
    f.color.copy(shallowC).lerp(deepC, k);
    if (st.flash > 0.05) f.color.multiplyScalar(1 + st.flash * 0.6);
    f.near = 0.5;
    f.far = 34 + (1 - k) * 22;
    fogCol.copy(f.color);
    return true;
  };

  // the foam mask, on the first frame (once every module has added its solids)
  let masked = false;
  const camP = new THREE.Vector3();
  W.add({
    update(dt, player) {
      if (!masked) {
        masked = true;
        const m = foamMask(W, foamBox, foamExtra);
        maskU.uMask.value = m.tex;
        maskU.uMaskBox.value.copy(m.box);
      }
      t.value += dt;
      causticU.uCausT.value = t.value;
      const cam = game.camera.position;
      camP.copy(cam);
      const inAzure = cam.x > 25 && cam.z < -36 && cam.z > -240 && cam.x < 400;
      const camUnder = cam.y < SEA_Y + 0.05;
      st.under = inAzure && camUnder;
      // the surface rides with the camera, snapped to its inner ring spacing so it doesn't shimmer
      const inHub = cam.x > -25 && cam.x < 25 && cam.z < -99.5 && cam.z > -148.5 && cam.y > 2;
      surf.visible = inAzure || inHub; // (and from the Nexus, whose east windows look out over it)
      surf.position.set(Math.round(cam.x / 3.2) * 3.2, SEA_Y - st.drop, Math.round(cam.z / 3.2) * 3.2);
      surfMat.uniforms.uNearFlat.value = Math.abs(cam.y - SEA_Y) < 3 ? 1 - Math.abs(cam.y - SEA_Y) / 3 : 0;
      surfMat.uniforms.uFlash.value = st.flash;
      const far = game.camera.far;
      dome.visible = inAzure && !camUnder;
      dome.position.copy(cam);
      dome.scale.setScalar(far * 0.9);
      skyMat.uniforms.uFlash.value = st.flash;
      skyMat.uniforms.uStorm.value = st.storm;
      back.visible = st.under;
      back.position.copy(cam);
      back.scale.setScalar(Math.min(far * 0.85, 160));
      // the light under the waves: rays near the surface, caustics everywhere (dimmer indoors)
      const swimming = !!player.headUnder;
      rays.visible = st.under;
      rayMat.uniforms.uK.value = st.under ? (swimming ? 1 : 0.45) * Math.max(0, 1 - (SEA_Y - cam.y) / 70) : 0;
      causticU.uCausK.value = inAzure ? (swimming ? 1 : 0.3) : 0;
      if (!swimming && st.under) fogCol.copy(game.scene.fog.color); // (inside a habitat: the backdrop follows its fog)
    },
  });
  return st;
}
