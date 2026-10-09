// VERDANT KIT — the harvesting machine's shared look, for every Verdant module (verdantSwamp.js, the god
// tree, ...). The whole forest is a farm: green pipelines snake through it half-swallowed by roots and moss,
// algae reactors and harvest towers stand among the trees, pumps drink the swamp, sap taps are drilled into
// the trunks, and the old catwalks hum. One industrial language, ancient but clearly engineered.
//
//   import { makeVerdantKit } from './verdantKit.js';
//   const K = makeVerdantKit(B, { seed: 7 });
//   K.pipe([[x, y, z], ...] | THREE.Curve, { r, walk, leak, moss, flanges, segments })
//   K.reactorTank([x, y, z], h, { r, ladder, solid, cap, color })   // y = the floor it stands on
//   K.sapTap([x, y, z], { yaw, hose: [[x, y, z], ...] })           // the spigot's point on a trunk face
//   K.harvestTower([x, y, z], h, { r })                             // a lattice tower with a glowing condenser
//   K.pumpStation([x, y, z], { yaw, intake })                       // a pump house drinking from the swamp
//   K.catwalk([[x, z], [x, z], ...], top, { w, rails, solid })      // a grated walkway along a polyline
//   K.rootCradle([x, y, z], scale, { coreY, legs, conduits })       // the Seed Shrine's spider of roots
//   K.limb([[x, y, z], ...], r0, r1, mat?)                          // a tapering root through points
//   K.put(mat, geometry, x, y, z) · K.flush()                       // custom dressing, merged per material
//   K.capture(() => { ...K calls... }) → Map(material → geometry)   // build a prop once, for instancing
//   K.instance(geoMap, [{ x, y, z, yaw, s }, ...]) → InstancedMeshes // place many copies of it
//
// Everything static is collected and merged into one mesh per material when you call K.flush() (call it
// once per area so each area's meshes cull on their own). Positions are world metres; y is up.
// K.mats holds the shared materials (one set for every module, so the god tree and the swamp draw with the
// same ones): bark, moss, pipe, pipeDark, rust, glass, algae (animated), sap (glowing), glow, granite,
// jade, grate, leaf, leafLit, vine, swampDeep / swampShallow (the swamp's black water: deep, and knee-deep weedy;
// ShaderMaterials for a plane at the surface). `uniforms.uLife` (1 → 0) on algae and the waters drains them on a shutdown.
// Returned objects: reactorTank → { top, ladder }, rootCradle → { group, shudder(s), coreAt }.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { boxGeo } from '../materials.js';
import { liquidMaterial } from '../liquid.js';

const PI = Math.PI;

function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tex(size, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size, mulberry32(size * 7 + 3));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// ---------------------------------------------------------------- the swamp water
// Two looks over the same black water: deep (near-black, oily, a slow sheen, rafts of duckweed, never a bottom)
// and shallow (lighter, weedy, reeds and lilies, you can see it's knee deep). Readable at a glance.
function swampWater() {
  const time = liquidMaterial('green', true).uniforms.uTime; // (the shared liquid clock)
  const make = (deep) => {
    const m = new THREE.ShaderMaterial({
      fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uLife: { value: 1 } }]),
      vertexShader: /* glsl */ `
        #include <fog_pars_vertex>
        uniform float uTime;
        varying vec3 vW;
        void main(){
          vec4 w = modelMatrix * vec4(position, 1.0);
          w.y += (sin(w.x * 0.6 + uTime * 0.7) * 0.5 + sin(w.z * 0.5 - uTime * 0.55) * 0.5) * 0.025;
          vW = w.xyz;
          vec4 mvPosition = viewMatrix * w;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        #include <fog_pars_fragment>
        uniform float uTime, uLife;
        varying vec3 vW;
        float lh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float ln(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(lh(i), lh(i + vec2(1, 0)), f.x), mix(lh(i + vec2(0, 1)), lh(i + vec2(1, 1)), f.x), f.y); }
        float fb(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ v += a * ln(p); p = p * 2.03 + 17.1; a *= 0.5; } return v; }
        void main(){
          vec2 p = vW.xz;
          float t = uTime * uLife;
          vec3 V = normalize(cameraPosition - vW);
          float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 3.0);
          float swirl = fb(p * 0.12 + vec2(t * 0.012, -t * 0.009));
          #if DEEP
            float scum = smoothstep(0.58, 0.78, fb(p * 0.35 + vec2(t * 0.02, -t * 0.015) + swirl));
            vec3 c = mix(vec3(0.012, 0.022, 0.014), vec3(0.03, 0.045, 0.024), swirl);
            c = mix(c, vec3(0.1, 0.14, 0.04), scum * 0.75);
            float oil = sin(fb(p * 0.5 - t * 0.03) * 14.0) * 0.5 + 0.5;
            c += vec3(0.07, 0.11, 0.09) * fres * (0.5 + 0.5 * oil);
          #else
            float weed = smoothstep(0.45, 0.7, fb(p * 0.6 + swirl * 2.0));
            vec3 c = mix(vec3(0.05, 0.07, 0.035), vec3(0.09, 0.12, 0.05), swirl);
            c = mix(c, vec3(0.16, 0.24, 0.07), weed * 0.7);
            float rip = pow(max(0.0, 1.0 - abs(sin(fb(p * 0.9 + t * 0.1) * 10.0 - t))), 6.0);
            c += vec3(0.1, 0.14, 0.1) * (fres * 0.6 + rip * 0.25);
          #endif
          gl_FragColor = vec4(c, 1.0);
          #include <fog_fragment>
        }`,
      defines: { DEEP: deep ? 1 : 0 },
    });
    m.uniforms.uTime = time;
    return m;
  };
  return { deep: make(true), shallow: make(false) };
}


// ---------------------------------------------------------------- shared materials (built once)
const time = { value: 0 };
let MATS = null;
function buildMats() {
  const barkTex = tex(128, (g, s, r) => {
    g.fillStyle = '#3e3424';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 60; i++) {
      g.fillStyle = `rgba(${14 + r() * 26},${12 + r() * 18},${8 + r() * 10},${0.5 + r() * 0.5})`;
      g.fillRect(r() * s, 0, 1 + r() * 4, s);
    }
    for (let i = 0; i < 140; i++) {
      g.fillStyle = `rgba(${50 + r() * 40},${90 + r() * 60},${40 + r() * 30},${0.2 + r() * 0.4})`;
      g.fillRect(r() * s, r() * s, 1 + r() * 6, 1 + r() * 4);
    }
  });
  const mossTex = tex(64, (g, s, r) => {
    g.fillStyle = '#2b4a1e';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 200; i++) {
      g.fillStyle = `rgba(${30 + r() * 60},${70 + r() * 90},${20 + r() * 30},${0.4 + r() * 0.5})`;
      g.fillRect(r() * s, r() * s, 1 + r() * 3, 1 + r() * 3);
    }
  });
  // painted green pipe metal: rust blooms, drips of grime down from the seams
  const pipeTex = tex(128, (g, s, r) => {
    g.fillStyle = '#3f6b45';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 1600; i++) {
      const v = r() * 60;
      g.fillStyle = `rgba(${v},${v + 20},${v},0.08)`;
      g.fillRect(r() * s, r() * s, 2, 2);
    }
    for (let i = 0; i < 22; i++) {
      g.fillStyle = `rgba(${90 + r() * 50},${50 + r() * 20},${20},${0.25 + r() * 0.35})`;
      g.beginPath();
      g.arc(r() * s, r() * s, 2 + r() * 9, 0, PI * 2);
      g.fill();
    }
    for (let i = 0; i < 26; i++) {
      g.fillStyle = `rgba(20,24,14,${0.15 + r() * 0.2})`;
      g.fillRect(r() * s, r() * s, 1 + r() * 2, 8 + r() * 40);
    }
    g.fillStyle = 'rgba(10,14,10,0.5)';
    g.fillRect(0, 0, s, 3);
  });
  // granite: grey-green speckled stone with carved glyph bands (the ruin, plinths, pump houses)
  const graniteTex = tex(256, (g, s, r) => {
    g.fillStyle = '#5c625a';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 9000; i++) {
      const v = 40 + r() * 120;
      g.fillStyle = `rgba(${v},${v + 4},${v - 4},${0.12 + r() * 0.2})`;
      g.fillRect(r() * s, r() * s, 1 + r() * 2, 1 + r() * 2);
    }
    // block joints
    g.strokeStyle = 'rgba(18,22,18,0.7)';
    g.lineWidth = 2;
    for (let y = 0; y <= s; y += s / 4) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(s, y);
      g.stroke();
      const off = (y / (s / 4)) % 2 ? s / 4 : 0;
      for (let x = off; x <= s; x += s / 2) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x, y + s / 4);
        g.stroke();
      }
    }
    // moss in the joints and a damp bottom
    for (let i = 0; i < 400; i++) {
      g.fillStyle = `rgba(${40 + r() * 40},${80 + r() * 60},${30 + r() * 20},${0.15 + r() * 0.3})`;
      g.fillRect(r() * s, Math.floor(r() * 4) * (s / 4) + r() * 5 - 2, 2 + r() * 6, 1 + r() * 3);
    }
  });
  const glyphTex = tex(128, (g, s, r) => {
    g.fillStyle = '#545a52';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 2000; i++) {
      const v = 40 + r() * 110;
      g.fillStyle = `rgba(${v},${v},${v},0.15)`;
      g.fillRect(r() * s, r() * s, 1, 1);
    }
    // a band of squared, stepped glyphs (circuit-like: these were engineers)
    g.strokeStyle = 'rgba(15,18,15,0.85)';
    g.lineWidth = 3;
    for (let k = 0; k < 4; k++) {
      const x0 = k * 32 + 4;
      g.strokeRect(x0, 20, 24, 24);
      g.beginPath();
      g.moveTo(x0 + 12, 20);
      g.lineTo(x0 + 12, 8 + r() * 6);
      g.moveTo(x0 + 4, 32);
      g.lineTo(x0 + 4 + r() * 16, 32);
      g.lineTo(x0 + 20, 32 + r() * 8);
      g.stroke();
      g.beginPath();
      g.arc(x0 + 12, 80, 9, 0, PI * 2);
      g.moveTo(x0 + 12, 71);
      g.lineTo(x0 + 12, 60);
      g.moveTo(x0 + 3, 80);
      g.lineTo(x0 - 4, 80);
      g.stroke();
      g.strokeRect(x0 + 6, 100, 12, 18);
    }
  });
  const grateTex = tex(64, (g, s) => {
    g.fillStyle = '#20241e';
    g.fillRect(0, 0, s, s);
    g.fillStyle = '#5b6658';
    for (let i = 0; i < s; i += 8) g.fillRect(0, i, s, 3);
    g.fillStyle = '#3c4a34';
    for (let i = 0; i < s; i += 16) g.fillRect(i, 0, 2, s);
  });

  // the algae: a murky glowing column with streaks drifting up and bubbles rising (uv in metres:
  // u round the tank, v up it)
  const algae = new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uColor: { value: new THREE.Color(0.25, 1.15, 0.38) }, uLife: { value: 1 } }]),
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      varying vec2 vUv;
      void main(){
        vUv = uv;
        vec4 mvPosition = viewMatrix * modelMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform float uTime, uLife;
      uniform vec3 uColor;
      varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main(){
        vec2 p = vUv;
        float t = uTime * uLife;
        float murk = n(vec2(p.x * 1.1, p.y * 0.5 - t * 0.12)) * 0.55 + n(vec2(p.x * 2.6 + 5.0, p.y * 1.4 - t * 0.3)) * 0.45;
        float strand = smoothstep(0.62, 0.9, n(vec2(p.x * 4.0, p.y * 0.35 - t * 0.08)));
        vec3 c = mix(uColor * 0.18, uColor, murk);
        c = mix(c, uColor * 0.08, strand * 0.7);
        vec2 q = vec2(p.x * 2.2, p.y * 2.2 - t * 1.1);
        vec2 cell = floor(q), f = fract(q) - 0.5;
        float r = h(cell);
        vec2 off = vec2(h(cell + 3.1) - 0.5, h(cell + 7.7) - 0.5) * 0.45;
        float d = length(f - off), rad = 0.05 + 0.1 * h(cell + 1.3);
        float b = (smoothstep(rad, rad * 0.6, d) - smoothstep(rad * 0.55, 0.0, d) * 0.6) * step(0.5, r);
        c += vec3(0.7, 1.3, 0.8) * b * 1.2;
        c *= 0.85 + 0.15 * sin(uTime * 1.7 + p.y * 0.8);
        vec3 dead = vec3(dot(c, vec3(0.3, 0.55, 0.15))) * vec3(0.22, 0.25, 0.2);
        gl_FragColor = vec4(mix(dead, c, uLife), 1.0);
        #include <fog_fragment>
      }`,
  });
  algae.uniforms.uTime = time;
  const m = {
    bark: new THREE.MeshStandardMaterial({ map: barkTex, color: 0xa89a86, roughness: 1, flatShading: true }),
    moss: new THREE.MeshStandardMaterial({ map: mossTex, color: 0x7f9466, roughness: 1, flatShading: true }),
    pipe: new THREE.MeshStandardMaterial({ map: pipeTex, color: 0xb0c8a8, roughness: 0.55, metalness: 0.55 }),
    pipeDark: new THREE.MeshStandardMaterial({ color: 0x2c3530, roughness: 0.5, metalness: 0.75, flatShading: true }),
    rust: new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.9, metalness: 0.3, flatShading: true }),
    glass: new THREE.MeshStandardMaterial({ color: 0xc8ffe0, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }),
    algae,
    sap: new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7dff6a).multiplyScalar(1.6) }),
    glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3dff7a).multiplyScalar(1.8) }),
    granite: new THREE.MeshStandardMaterial({ map: graniteTex, color: 0xb4bcae, roughness: 0.95, flatShading: true }),
    glyph: new THREE.MeshStandardMaterial({ map: glyphTex, color: 0xb0b8aa, roughness: 0.95 }),
    jade: new THREE.MeshStandardMaterial({ color: 0x2f9a6a, roughness: 0.3, metalness: 0.1, emissive: 0x0a3a22, flatShading: true }),
    grate: new THREE.MeshStandardMaterial({ map: grateTex, color: 0xb0b8a0, roughness: 0.7, metalness: 0.6 }),
    leaf: new THREE.MeshStandardMaterial({ color: 0x1a3a1e, roughness: 0.95, flatShading: true, side: THREE.DoubleSide }),
    leafLit: new THREE.MeshStandardMaterial({ color: 0x31522a, roughness: 0.95, flatShading: true, side: THREE.DoubleSide }),
    vine: new THREE.MeshStandardMaterial({ color: 0x23421f, roughness: 1, flatShading: true, side: THREE.DoubleSide }),
  };
  const water = swampWater();
  m.swampDeep = water.deep;
  m.swampShallow = water.shallow;
  m.glass.renderOrder = 2;
  return m;
}
export function kitMaterials() {
  return (MATS ??= buildMats());
}

const ticking = new WeakSet();

// ---------------------------------------------------------------- the kit
export function makeVerdantKit(B, { seed = 1 } = {}) {
  const { W } = B;
  const mats = kitMaterials();
  const rand = mulberry32(seed * 7919 + 13);
  const R = (a, b) => a + (b - a) * rand();
  if (!ticking.has(W)) {
    ticking.add(W);
    W.add({ update: (dt) => (time.value = (time.value + dt) % 10000) });
  }
  let lists = new Map();
  const put = (m, geo, x = 0, y = 0, z = 0) => {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (x || y || z) g.translate(x, y, z);
    if (!lists.has(m)) lists.set(m, []);
    lists.get(m).push(g);
    return g;
  };
  // merge what's been collected into one mesh per material (call once per area)
  function flush() {
    const out = [];
    for (const [m, geos] of lists) {
      if (!geos.length) continue;
      const mesh = new THREE.Mesh(mergeGeometries(geos, false), m);
      geos.forEach((g) => g.dispose());
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      if (m.transparent) mesh.renderOrder = 2;
      W.scene.add(mesh);
      out.push(mesh);
    }
    lists = new Map();
    return out;
  }
  const solid = (x1, y1, z1, x2, y2, z2, kind = 'metal') =>
    W.addSolid(new THREE.Vector3(Math.min(x1, x2), Math.min(y1, y2), Math.min(z1, z2)), new THREE.Vector3(Math.max(x1, x2), Math.max(y1, y2), Math.max(z1, z2)), { static: true, kind });

  // a cylinder from a to b (radius r0 at a, r1 at b)
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);
  function rod(m, a, b, r0, r1 = r0, seg = 6) {
    _a.set(...a);
    _b.set(...b);
    _d.subVectors(_b, _a);
    const len = _d.length();
    if (len < 1e-3) return;
    const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1);
    g.translate(0, len / 2, 0);
    _q.setFromUnitVectors(UP, _d.normalize());
    g.applyQuaternion(_q);
    put(m, g, _a.x, _a.y, _a.z);
  }
  // a root as a chain of tapering limbs through the points, a knuckle at each bend
  function limb(pts, r0, r1, m = mats.bark, seg = 6) {
    for (let i = 0; i < pts.length - 1; i++) {
      const ra = r0 + (r1 - r0) * (i / (pts.length - 1)), rb = r0 + (r1 - r0) * ((i + 1) / (pts.length - 1));
      rod(m, pts[i], pts[i + 1], ra, rb, seg);
      if (i < pts.length - 2) put(m, new THREE.IcosahedronGeometry(rb * 1.05, 1), ...pts[i + 1]);
    }
  }
  function mossCap(x, y, z, r, flat = 0.35) {
    put(mats.moss, new THREE.IcosahedronGeometry(r, 1).scale(1, flat, 1), x, y, z);
  }
  function hangMoss(x, yTop, z, len, w = 0.35) {
    for (const a of [0, PI / 2]) {
      const g = new THREE.PlaneGeometry(w, len, 1, 2);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) p.setX(i, p.getX(i) * 0.3);
      g.translate(0, -len / 2, 0).rotateY(a + R(-0.4, 0.4));
      put(mats.vine, g, x, yTop, z);
    }
  }

  // ---------------------------------------------------------------- PIPELINE
  // A painted green pipeline along a curve (points, or any THREE.Curve), riveted flanges every few metres,
  // moss and roots over its back. walk: true puts collision along it so you can walk the top (best on
  // level runs); leak: [u, ...] (0..1 along it) leaves a glowing sap leak with a drip and a puddle there.
  function pipe(path, { r = 0.45, walk = false, leak = [], moss = true, flanges = true, segments = 0, supports = 0, ground = null } = {}) {
    const curve = path.isCurve ? path : new THREE.CatmullRomCurve3(path.map((p) => new THREE.Vector3(...p)), false, 'catmullrom', 0.2);
    const len = curve.getLength();
    const segs = segments || Math.max(4, Math.ceil(len / 1.2));
    const g = new THREE.TubeGeometry(curve, segs, r, 12, false);
    // uv in metres along the pipe (the texture's grime drips run along it)
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i) * 1.2, uv.getX(i) * len * 0.35);
    put(mats.pipe, g);
    const P = new THREE.Vector3(), T = new THREE.Vector3();
    if (flanges)
      for (let s = 1.5; s < len - 0.5; s += 3.2) {
        const u = s / len;
        curve.getPointAt(u, P);
        curve.getTangentAt(u, T);
        const f = new THREE.CylinderGeometry(r * 1.22, r * 1.22, 0.16, 12);
        f.applyQuaternion(_q.setFromUnitVectors(UP, T));
        put(mats.pipeDark, f, P.x, P.y, P.z);
      }
    if (moss)
      for (let s = R(0.5, 2); s < len; s += R(1.6, 4)) {
        curve.getPointAt(s / len, P);
        mossCap(P.x + R(-0.1, 0.1), P.y + r * 0.85, P.z + R(-0.1, 0.1), r * R(0.7, 1.3), 0.3);
        if (rand() < 0.5) hangMoss(P.x + R(-r, r), P.y - r * 0.3, P.z + R(-r, r), R(0.6, 2.2));
        if (rand() < 0.22) {
          // a root strangling it
          const a = R(0, PI * 2);
          limb([[P.x + Math.cos(a) * r * 2.5, P.y - r * 3, P.z + Math.sin(a) * r * 2.5], [P.x, P.y + r * 1.1, P.z], [P.x - Math.cos(a) * r * 2.2, P.y - r * 2.6, P.z - Math.sin(a) * r * 2.2]], r * 0.45, r * 0.25);
        }
      }
    for (const u of leak) {
      curve.getPointAt(u, P);
      put(mats.sap, new THREE.SphereGeometry(r * 0.35, 8, 6).scale(1.4, 0.6, 1.4), P.x, P.y - r * 0.92, P.z);
      const gy = ground ?? P.y - 3;
      put(mats.sap, new THREE.CylinderGeometry(0.03, 0.05, Math.max(0.1, P.y - r - gy), 5), P.x, (P.y - r + gy) / 2, P.z);
      put(mats.sap, new THREE.CircleGeometry(R(0.6, 1.1), 10).rotateX(-PI / 2), P.x, gy + 0.03, P.z);
      leaks.push(new THREE.Vector3(P.x, P.y - r, P.z));
    }
    if (supports && ground !== null)
      for (let s = supports / 2; s < len; s += supports) {
        curve.getPointAt(s / len, P);
        rod(mats.pipeDark, [P.x, ground - 0.5, P.z], [P.x, P.y - r, P.z], 0.12, 0.1, 6);
        put(mats.pipeDark, boxGeo(r * 2.6, 0.18, 0.3, 0.5).applyQuaternion(_q.setFromUnitVectors(new THREE.Vector3(1, 0, 0), curve.getTangentAt(s / len, T).setY(0).normalize().applyAxisAngle(UP, PI / 2))), P.x, P.y - r - 0.05, P.z);
      }
    if (walk) {
      // collision along the top: small boxes every half metre (axis-aligned under each sample)
      const n = Math.ceil(len / 0.5);
      for (let i = 0; i <= n; i++) {
        curve.getPointAt(i / n, P);
        const h = r * 0.82;
        solid(P.x - h, P.y - r, P.z - h, P.x + h, P.y + r, P.z + h, 'metal');
      }
    }
    return curve;
  }
  const leaks = []; // (points sap drips from: the swamp's drip particles read these)

  // ---------------------------------------------------------------- ALGAE REACTOR TANK
  // A tall glass tank of glowing, bubbling algae on a ribbed plinth, capped with a dome and pipe stubs,
  // four ribs up its sides, a gauge; ladder: true adds a ladder up one side (returned as a climb volume
  // for player ladders: world.ladders). y = the floor it stands on.
  function reactorTank([x, y, z], h, { r = 1.4, ladder = false, ladderYaw = 0, solid: isSolid = true, cap = true, glowRing = true } = {}) {
    const base = 0.9, top = y + h;
    put(mats.pipeDark, new THREE.CylinderGeometry(r * 1.25, r * 1.4, base, 16), x, y + base / 2, z);
    put(mats.granite, new THREE.CylinderGeometry(r * 1.45, r * 1.55, 0.3, 16), x, y + 0.15, z);
    const ch = h - base - 0.8;
    const col = new THREE.CylinderGeometry(r * 0.9, r * 0.9, ch, 18, 1, true);
    const uv = col.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2 * PI * r * 0.9, uv.getY(i) * ch);
    put(mats.algae, col, x, y + base + ch / 2, z);
    put(mats.algae, new THREE.CircleGeometry(r * 0.9, 18).rotateX(-PI / 2), x, y + base + ch, z);
    put(mats.glass, new THREE.CylinderGeometry(r, r, ch, 20, 1, true), x, y + base + ch / 2, z);
    if (glowRing) {
      put(mats.glow, new THREE.TorusGeometry(r * 1.02, 0.05, 4, 24).rotateX(PI / 2), x, y + base + 0.05, z);
      put(mats.glow, new THREE.TorusGeometry(r * 1.02, 0.05, 4, 24).rotateX(PI / 2), x, y + base + ch - 0.05, z);
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * PI * 2 + PI / 4;
      put(mats.pipeDark, boxGeo(0.16, ch, 0.16, 0.5), x + Math.cos(a) * r * 1.04, y + base + ch / 2, z + Math.sin(a) * r * 1.04);
    }
    for (let k = 1; k < 4; k++) put(mats.pipeDark, new THREE.TorusGeometry(r * 1.05, 0.07, 4, 20).rotateX(PI / 2), x, y + base + (ch * k) / 4, z);
    if (cap) {
      put(mats.pipeDark, new THREE.CylinderGeometry(r * 1.1, r * 1.15, 0.5, 16), x, top - 0.55, z);
      put(mats.pipe, new THREE.SphereGeometry(r * 1.05, 16, 6, 0, PI * 2, 0, PI / 2).scale(1, 0.45, 1), x, top - 0.3, z);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * PI * 2 + 0.4;
        rod(mats.pipe, [x + Math.cos(a) * r * 0.5, top - 0.2, z + Math.sin(a) * r * 0.5], [x + Math.cos(a) * r * 0.55, top + 0.6, z + Math.sin(a) * r * 0.55], 0.14, 0.14, 8);
      }
      mossCap(x + R(-0.3, 0.3), top - 0.05, z + R(-0.3, 0.3), r * 0.8, 0.25);
      for (let i = 0; i < 4; i++) hangMoss(x + Math.cos(i * 1.7) * r * 1.1, top - 0.5, z + Math.sin(i * 1.7) * r * 1.1, R(0.8, Math.min(4, h * 0.4)));
    }
    // the gauge: a dark disc with a glowing needle slot
    const ga = R(0, PI * 2);
    put(mats.pipeDark, new THREE.CylinderGeometry(0.22, 0.22, 0.08, 10).rotateX(PI / 2).rotateY(-ga + PI / 2), x + Math.cos(ga) * r * 1.42, y + base * 0.55, z + Math.sin(ga) * r * 1.42);
    put(mats.sap, boxGeo(0.03, 0.16, 0.02, 0.5).rotateY(-ga + PI / 2), x + Math.cos(ga) * r * 1.47, y + base * 0.6, z + Math.sin(ga) * r * 1.47);
    if (isSolid) solid(x - r * 1.05, y, z - r * 1.05, x + r * 1.05, top, z + r * 1.05);
    let lad = null;
    if (ladder) {
      const dx = -Math.sin(ladderYaw), dz = -Math.cos(ladderYaw); // the side the ladder is on (yaw 0 = north side)
      const ox = x + dx * (r * 1.05 + 0.25), oz = z + dz * (r * 1.05 + 0.25);
      const sx = Math.abs(dz) > 0.5 ? 0.3 : 0, sz = Math.abs(dx) > 0.5 ? 0.3 : 0;
      rod(mats.pipeDark, [ox - sx, y, oz - sz], [ox - sx, top + 0.6, oz - sz], 0.04, 0.04, 5);
      rod(mats.pipeDark, [ox + sx, y, oz + sz], [ox + sx, top + 0.6, oz + sz], 0.04, 0.04, 5);
      for (let yy = y + 0.35; yy < top + 0.4; yy += 0.35) rod(mats.pipeDark, [ox - sx, yy, oz - sz], [ox + sx, yy, oz + sz], 0.025, 0.025, 4);
      // (generous: 1.5 m along the face, from the rungs out to 0.75 m off them)
      const ax = Math.abs(dx) > 0.5 ? 0.45 : 0.75, az = Math.abs(dz) > 0.5 ? 0.45 : 0.75;
      lad = { min: new THREE.Vector3(ox - ax + dx * 0.3, y, oz - az + dz * 0.3), max: new THREE.Vector3(ox + ax + dx * 0.3, top + 0.3, oz + az + dz * 0.3), n: [dx, 0, dz] };
      (W.ladders ??= []).push(lad);
    }
    return { top, ladder: lad };
  }

  // ---------------------------------------------------------------- SAP TAP
  // A spigot drilled into a trunk: a collar plate, the tap, a glass collector glowing with sap, a hose off it.
  // pos: the point on the trunk's surface; yaw: which way the tap points out of the trunk (0 = north).
  function sapTap([x, y, z], { yaw = 0, hose = null } = {}) {
    const dx = -Math.sin(yaw), dz = -Math.cos(yaw);
    put(mats.pipeDark, new THREE.CylinderGeometry(0.28, 0.28, 0.08, 10).rotateX(PI / 2).rotateY(yaw), x, y, z);
    rod(mats.pipe, [x, y, z], [x + dx * 0.5, y, z + dz * 0.5], 0.07, 0.06, 8);
    rod(mats.pipeDark, [x + dx * 0.5, y, z + dz * 0.5], [x + dx * 0.5, y - 0.25, z + dz * 0.5], 0.05, 0.05, 6);
    const cx = x + dx * 0.5, cz = z + dz * 0.5;
    put(mats.sap, new THREE.CylinderGeometry(0.16, 0.16, 0.42, 10), cx, y - 0.55, cz);
    put(mats.glass, new THREE.CylinderGeometry(0.19, 0.19, 0.5, 10, 1, true), cx, y - 0.55, cz);
    put(mats.pipeDark, new THREE.CylinderGeometry(0.21, 0.21, 0.06, 10), cx, y - 0.28, cz);
    put(mats.pipeDark, new THREE.CylinderGeometry(0.21, 0.16, 0.08, 10), cx, y - 0.82, cz);
    if (hose) {
      const pts = [new THREE.Vector3(cx, y - 0.85, cz), ...hose.map((p) => new THREE.Vector3(...p))];
      const c = new THREE.CatmullRomCurve3(pts);
      put(mats.pipeDark, new THREE.TubeGeometry(c, Math.max(6, Math.ceil(c.getLength() * 2)), 0.05, 5, false));
    }
  }

  // ---------------------------------------------------------------- HARVEST TOWER
  // A four-legged lattice tower over the trees with a glowing condenser drum at the top and a pipe down.
  function harvestTower([x, y, z], h, { r = 2.2, solidLegs = true } = {}) {
    const legs = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [x + a * r, z + b * r]);
    for (const [lx, lz] of legs) {
      rod(mats.pipeDark, [lx, y, lz], [x + (lx - x) * 0.45, y + h, z + (lz - z) * 0.45], 0.16, 0.1, 6);
      put(mats.granite, boxGeo(0.9, 0.6, 0.9, 0.5), lx, y + 0.3, lz);
      if (solidLegs) solid(lx - 0.25, y, lz - 0.25, lx + 0.25, y + h * 0.6, lz + 0.25);
    }
    for (let k = 1; k < 6; k++) {
      const t0 = k / 6, yy = y + h * t0, s = 1 - 0.55 * t0;
      for (let i = 0; i < 4; i++) {
        const [ax, az] = legs[i], [bx, bz] = legs[(i + 1) % 4];
        rod(mats.pipeDark, [x + (ax - x) * s, yy, z + (az - z) * s], [x + (bx - x) * s, yy + h / 6, z + (bz - z) * s], 0.05, 0.05, 4);
      }
    }
    const dy = y + h;
    put(mats.pipe, new THREE.CylinderGeometry(r * 0.9, r * 0.9, 2.4, 16), x, dy + 1.2, z);
    put(mats.sap, new THREE.CylinderGeometry(r * 0.92, r * 0.92, 0.35, 16, 1, true), x, dy + 1.2, z);
    put(mats.pipeDark, new THREE.CylinderGeometry(r * 0.6, r * 0.95, 0.6, 16), x, dy + 2.7, z);
    put(mats.glow, new THREE.SphereGeometry(0.22, 8, 6), x, dy + 3.2, z);
    rod(mats.pipe, [x + r * 0.5, dy, z], [x + r * 0.5, y, z], 0.22, 0.22, 10);
    mossCap(x, dy + 3, z, r * 0.7, 0.3);
    for (let i = 0; i < 6; i++) hangMoss(x + R(-r, r), dy, z + R(-r, r), R(1, 4));
  }

  // ---------------------------------------------------------------- PUMP STATION
  // A granite pump house with a green-lit hatch, a fat intake pipe bending down into the water beside it,
  // a flywheel and an outlet stub. yaw: the side the intake drinks from (0 = north). intake: its depth.
  function pumpStation([x, y, z], { yaw = 0, intake = 2, solid: isSolid = true } = {}) {
    const g = (geo) => geo.rotateY(yaw);
    put(mats.granite, g(boxGeo(3.2, 2.6, 2.6, 0.5)).translate(0, 1.3, 0), x, y, z);
    put(mats.pipeDark, g(boxGeo(3.5, 0.3, 2.9, 0.5)).translate(0, 2.75, 0), x, y, z);
    put(mats.pipeDark, g(boxGeo(1.1, 1.6, 0.06, 0.5)).translate(0.6, 1.0, 1.31), x, y, z);
    put(mats.sap, g(boxGeo(0.7, 0.06, 0.04, 0.5)).translate(0.6, 1.5, 1.35), x, y, z);
    put(mats.pipeDark, g(new THREE.TorusGeometry(0.7, 0.1, 5, 14).translate(-1.65, 1.6, 0).rotateY(0)), x, y, z);
    mossCap(x, y + 2.95, z, 1.6, 0.25);
    const dx = -Math.sin(yaw), dz = -Math.cos(yaw);
    pipe([[x + dx * 1.3, y + 1.8, z + dz * 1.3], [x + dx * 2.4, y + 2.2, z + dz * 2.4], [x + dx * 3.2, y + 1, z + dz * 3.2], [x + dx * 3.3, y - intake, z + dz * 3.3]], { r: 0.38, moss: true, flanges: true });
    if (isSolid) solid(x - 1.7, y, z - 1.7, x + 1.7, y + 2.9, z + 1.7, 'rock');
  }

  // ---------------------------------------------------------------- CATWALK
  // An overgrown grated walkway along a polyline of [x, z] points at height top (each leg straight).
  function catwalk(pts, top, { w = 1.6, rails = true, solid: isSolid = true, posts = 6, ground = null } = {}) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const L = Math.hypot(bx - ax, bz - az), yaw = Math.atan2(bx - ax, bz - az);
      const cx = (ax + bx) / 2, cz = (az + bz) / 2;
      const deck = boxGeo(w, 0.12, L + (i < pts.length - 2 ? w : 0), 0.5).rotateY(yaw);
      put(mats.grate, deck, cx, top - 0.06, cz);
      const nx = Math.cos(yaw), nz = -Math.sin(yaw); // across the walkway
      if (rails)
        for (const s of [-1, 1]) {
          rod(mats.pipeDark, [ax + nx * s * w * 0.48, top + 1.0, az + nz * s * w * 0.48], [bx + nx * s * w * 0.48, top + 1.0, bz + nz * s * w * 0.48], 0.035, 0.035, 5);
          for (let u = 0; u <= L; u += 2) rod(mats.pipeDark, [ax + (bx - ax) * (u / L) + nx * s * w * 0.48, top, az + (bz - az) * (u / L) + nz * s * w * 0.48], [ax + (bx - ax) * (u / L) + nx * s * w * 0.48, top + 1.0, az + (bz - az) * (u / L) + nz * s * w * 0.48], 0.03, 0.03, 4);
        }
      for (let u = 0; u < L; u += R(0.8, 2.2)) if (rand() < 0.6) hangMoss(ax + (bx - ax) * (u / L) + nx * R(-w / 2, w / 2), top - 0.1, az + (bz - az) * (u / L) + nz * R(-w / 2, w / 2), R(0.5, 2.4));
      if (ground !== null) for (let u = posts / 2; u < L; u += posts) rod(mats.pipeDark, [ax + (bx - ax) * (u / L), ground - 0.5, az + (bz - az) * (u / L)], [ax + (bx - ax) * (u / L), top - 0.1, az + (bz - az) * (u / L)], 0.1, 0.08, 6);
      if (isSolid) {
        // axis-aligned legs only get one box; a diagonal leg gets a run of small ones
        if (Math.abs(bx - ax) < 0.01 || Math.abs(bz - az) < 0.01) solid(Math.min(ax, bx) - w / 2, top - 0.15, Math.min(az, bz) - w / 2, Math.max(ax, bx) + w / 2, top, Math.max(az, bz) + w / 2);
        else for (let u = 0; u <= L; u += 0.5) solid(ax + (bx - ax) * (u / L) - w / 2, top - 0.15, az + (bz - az) * (u / L) - w / 2, ax + (bx - ax) * (u / L) + w / 2, top, az + (bz - az) * (u / L) + w / 2);
      }
    }
  }

  // ---------------------------------------------------------------- ROOT CRADLE
  // The Seed Shrine's spider of roots (from the original verdant.js shrine), at any scale: great roots climb
  // out of the floor round a centre, bow outward, then arch in and knot together high over it, hung with
  // glowing fruit and moss; at scale >= 2 stone-shod legs, a crown of side shoots and algae conduits wind up
  // them to feed what it holds. Built as its own group (so it can shudder); returns
  // { group, coreAt: Vector3 (where the held thing sits, in its grip under the knot), shudder(strength) }.
  function rootCradle([cx, cy, cz], scale = 1, { legs = 4, conduits = scale >= 2, knotY = null } = {}) {
    const s = scale, saved = lists;
    lists = new Map(); // (its own meshes: collected apart from the area's)
    const kY = knotY ?? cy + 9.1 * s;
    const r0 = (u) => u * s;
    for (let i = 0; i < legs; i++) {
      const a = (i / legs) * PI * 2 + PI / 4 + R(-0.12, 0.12);
      const rad = r0(7.6) * R(0.92, 1.08);
      const bx = cx + Math.cos(a) * rad, bz = cz + Math.sin(a) * rad, k = R(0.9, 1.1);
      const at = (u, y, out = 0) => [bx + (cx - bx) * u - (cx - bx) * out, y, bz + (cz - bz) * u - (cz - bz) * out];
      // up out of the floor, bowing outward (the "knee"), then arching in over the centre
      const pts = [[bx, cy - 0.8 * s, bz], at(0.04, cy + r0(2.9) * k, 0.06), at(0.2, cy + r0(5.8) * k, 0.04), at(0.5, kY + r0(1.1)), at(0.8, kY + r0(0.8)), [cx, kY, cz]];
      limb(pts, 0.85 * s, 0.32 * s, mats.bark, 8);
      limb([at(0.1, cy + r0(0.5), 0), at(0.3, cy + r0(3.3), -0.05), at(0.45, cy + r0(4.7) * k, 0.02)], 0.28 * s, 0.14 * s, mats.bark, 6); // a side shoot
      put(mats.bark, new THREE.IcosahedronGeometry(1.1 * s, 1).scale(1.3, 0.5, 1.3), bx, cy - 0.3 * s, bz); // the foot, heaving the floor
      if (s >= 2) {
        // monumental: a carved stone shoe round each foot, glyph band glowing, and moss down the knee
        put(mats.granite, new THREE.CylinderGeometry(1.25 * s, 1.55 * s, 1.1 * s, 8), bx, cy + 0.55 * s - 0.3, bz);
        put(mats.glyph, new THREE.CylinderGeometry(1.28 * s, 1.28 * s, 0.35 * s, 8, 1, true), bx, cy + 0.75 * s, bz);
        put(mats.glow, new THREE.TorusGeometry(1.3 * s, 0.06 * s, 4, 16).rotateX(PI / 2), bx, cy + 1.05 * s, bz);
        const knee = at(0.2, cy + r0(5.8) * k, 0.04);
        for (let m = 0; m < 5; m++) hangMoss(knee[0] + R(-0.5, 0.5) * s, knee[1] - 0.3 * s, knee[2] + R(-0.5, 0.5) * s, R(1.5, 4) * s * 0.5, 0.35 * s * 0.6);
        // a second, thinner leg segment off each knee down to the floor (spider-like)
        const kn2 = at(0.2, cy + r0(5.8) * k, 0.04);
        limb([kn2, at(-0.05, cy + r0(3.2), 0.18), at(-0.12, cy - 0.5, 0.25)], 0.4 * s, 0.25 * s, mats.bark, 6);
        if (conduits) {
          // an algae conduit spiralling up the root to the knot
          const cp = [];
          for (let u = 0; u <= 1.001; u += 0.1) {
            const p = new THREE.Vector3();
            const seg = Math.min(pts.length - 2, Math.floor(u * (pts.length - 1)));
            const f = u * (pts.length - 1) - seg;
            p.set(...pts[seg]).lerp(new THREE.Vector3(...pts[seg + 1]), f);
            const tw = u * PI * 3 + i;
            p.x += Math.cos(tw) * 0.9 * s * (1 - u * 0.6);
            p.z += Math.sin(tw) * 0.9 * s * (1 - u * 0.6);
            p.y += 0.6 * s * (1 - u);
            cp.push(p);
          }
          const curve = new THREE.CatmullRomCurve3(cp);
          const L = curve.getLength();
          const tg = new THREE.TubeGeometry(curve, Math.ceil(L * 1.5), 0.16 * s, 8, false);
          const uv = tg.attributes.uv;
          for (let q = 0; q < uv.count; q++) uv.setXY(q, uv.getY(q) * 2, uv.getX(q) * L);
          put(mats.algae, tg);
          put(mats.glass, new THREE.TubeGeometry(curve, Math.ceil(L * 1.5), 0.2 * s, 8, false));
        }
      }
      for (let m = 0; m < 4; m++) {
        const u = R(0.25, 0.85);
        const p = at(u, cy + (kY - cy) * Math.min(1, u * 1.3) + 0.2 * s);
        put(mats.sap, new THREE.IcosahedronGeometry(0.12 * s * R(0.9, 1.4), 0), p[0] + R(-0.3, 0.3) * s, p[1] + 0.3 * s, p[2]);
      }
    }
    put(mats.bark, new THREE.IcosahedronGeometry(1.4 * s, 1).scale(1, 0.7, 1), cx, kY + 0.3 * s, cz);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * PI * 2, rr = R(0.4, 1.1) * s;
      hangMoss(cx + Math.cos(a) * rr, kY - 0.2 * s, cz + Math.sin(a) * rr, R(1.2, 3) * s, 0.35 * Math.min(s, 2));
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * PI * 2 + 0.3;
      put(mats.sap, new THREE.SphereGeometry(R(0.16, 0.26) * s, 8, 6), cx + Math.cos(a) * 0.9 * s, kY - R(0.8, 1.6) * s, cz + Math.sin(a) * 0.9 * s);
    }
    // the grip: four talons curling down from the knot round the held thing
    const coreAt = new THREE.Vector3(cx, kY - 2.6 * s, cz);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * PI * 2;
      const o = 1.1 * s;
      limb([[cx + Math.cos(a) * 0.4 * s, kY - 0.3 * s, cz + Math.sin(a) * 0.4 * s], [cx + Math.cos(a) * o, kY - 1.6 * s, cz + Math.sin(a) * o], [cx + Math.cos(a) * o * 0.95, coreAt.y - 0.5 * s, cz + Math.sin(a) * o * 0.95], [cx + Math.cos(a) * o * 0.45, coreAt.y - 1.1 * s, cz + Math.sin(a) * o * 0.45]], 0.3 * s, 0.1 * s, mats.bark, 6);
    }
    const group = new THREE.Group();
    group.position.set(cx, cy, cz);
    for (const [m, geos] of lists) {
      if (!geos.length) continue;
      const geo = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      geo.translate(-cx, -cy, -cz);
      const mesh = new THREE.Mesh(geo, m);
      if (m.transparent) mesh.renderOrder = 2;
      group.add(mesh);
    }
    lists = saved;
    W.scene.add(group);
    let shake = 0, t = 0;
    W.add({
      update(dt) {
        if (shake <= 0) return;
        t += dt;
        shake = Math.max(0, shake - dt * 0.6);
        group.rotation.z = Math.sin(t * 31) * 0.006 * shake;
        group.rotation.x = Math.sin(t * 27 + 1) * 0.006 * shake;
        group.position.y = cy + Math.sin(t * 23) * 0.04 * shake * s - (1 - shake) * 0;
        if (shake <= 0) group.rotation.set(0, 0, 0), (group.position.y = cy);
      },
    });
    return { group, coreAt, shudder: (k = 1) => (shake = Math.max(shake, k)) };
  }

  // build a prop once (fn() calls put / limb / rod / ... as usual) and get back its geometry merged per
  // material, in the coordinates it was built at, without adding anything to the scene (for instancing)
  function capture(fn) {
    const saved = lists;
    lists = new Map();
    fn();
    const out = new Map();
    for (const [m, geos] of lists) {
      if (!geos.length) continue;
      out.set(m, mergeGeometries(geos, false));
      geos.forEach((g) => g.dispose());
    }
    lists = saved;
    return out;
  }
  // instance a captured prop: list of { x, y, z, yaw = 0, s = 1 (or sx, sy, sz) }; one InstancedMesh per
  // material, added to the scene; returns the meshes
  const _m4 = new THREE.Matrix4(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _qq = new THREE.Quaternion();
  function instance(geoMap, list) {
    const out = [];
    if (!list.length) return out;
    for (const [m, geo] of geoMap) {
      const mesh = new THREE.InstancedMesh(geo, m, list.length);
      list.forEach((o, i) => {
        _qq.setFromAxisAngle(UP, o.yaw || 0);
        if (o.tilt) _qq.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(o.tilt[0], 0, o.tilt[1])));
        mesh.setMatrixAt(i, _m4.compose(_p.set(o.x, o.y, o.z), _qq, _s.set(o.sx ?? o.s ?? 1, o.sy ?? o.s ?? 1, o.sz ?? o.s ?? 1)));
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.computeBoundingBox?.();
      if (m.transparent) mesh.renderOrder = 2;
      W.scene.add(mesh);
      out.push(mesh);
    }
    return out;
  }

  return { W, mats, rand, R, put, flush, capture, instance, solid, rod, limb, mossCap, hangMoss, pipe, reactorTank, sapTap, harvestTower, pumpStation, catwalk, rootCradle, leaks };
}
