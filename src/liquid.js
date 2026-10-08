// Animated hazard liquids. Every 'acid' box gets a subdivided surface on top whose vertices roll in slow
// waves and whose shader draws, per area: glowing lava with drifting crust (Foundry, Prism), shifting
// quicksand swirling into sink holes (Solar), bubbling toxic sludge (Verdant) and cold brine (Azure).
// Bubbles pop near the player (see LiquidFx).
import * as THREE from 'three';

const time = { value: 0 };
export const LIQUID_STYLE = { red: 0, boss: 0, hub: 0, yellow: 1, green: 2, blue: 3 }; // shader style per zone

const NOISE = /* glsl */ `
  float lh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float ln(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(lh(i), lh(i + vec2(1, 0)), f.x), mix(lh(i + vec2(0, 1)), lh(i + vec2(1, 1)), f.x), f.y); }
  float lfbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ v += a * ln(p); p = p * 2.03 + 17.1; a *= 0.5; } return v; }
`;

function waves(style) {
  // vertical motion in metres: lava heaves, quicksand barely breathes, sludge and brine ripple
  return [0.12, 0.03, 0.09, 0.07][style];
}

const cache = new Map();
export function liquidMaterial(zone, surface) {
  const style = LIQUID_STYLE[zone] ?? 0;
  const key = style + (surface ? 's' : 'b');
  if (cache.has(key)) return cache.get(key);
  const m = new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uAmp: { value: surface ? waves(style) : 0 } }]),
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      uniform float uTime, uAmp;
      varying vec3 vW;
      ${NOISE}
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.0);
        float h = sin(w.x * 0.45 + uTime * 0.9) * 0.5 + sin(w.z * 0.37 - uTime * 0.7) * 0.5 + (lfbm(w.xz * 0.25 + uTime * 0.08) - 0.5) * 1.6;
        w.y += h * uAmp;
        vW = w.xyz;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform float uTime;
      varying vec3 vW;
      ${NOISE}
      void main(){
        vec2 p = vW.xz;
        float t = uTime;
        vec3 c;
        #if STYLE == 0
          // lava: dark cooling crust plates drifting over a white-hot flow, with glowing seams
          vec2 flow = p * 0.18 + vec2(t * 0.03, t * 0.02);
          float crust = lfbm(flow + lfbm(flow * 1.7 - t * 0.05) * 1.3);
          float seam = 1.0 - smoothstep(0.02, 0.12, abs(crust - 0.5));
          float heat = smoothstep(0.62, 0.32, crust);
          c = mix(vec3(0.16, 0.03, 0.01), vec3(1.9, 0.55, 0.08), heat);
          c += vec3(2.2, 1.1, 0.25) * seam * (0.6 + 0.4 * sin(t * 2.0 + p.x));
          c += vec3(0.6, 0.12, 0.02) * (0.5 + 0.5 * sin(t * 1.3 + lfbm(p * 0.5) * 6.0)) * heat;
        #elif STYLE == 1
          // quicksand: ripples sliding inward toward slowly wandering sink holes, wet dark patches
          vec2 q = p * 0.11;
          vec2 cell = floor(q), f = fract(q) - 0.5 + (vec2(lh(cell), lh(cell + 3.1)) - 0.5) * 0.5;
          float r = length(f);
          float ring = sin(r * 38.0 + t * 1.6 + lh(cell) * 6.0) * 0.5 + 0.5;
          float drift = lfbm(p * 0.35 + vec2(t * 0.05, -t * 0.04));
          float hole = smoothstep(0.18, 0.0, r);
          c = mix(vec3(0.72, 0.56, 0.34), vec3(0.5, 0.36, 0.2), drift);
          c *= 0.86 + 0.14 * ring * (1.0 - hole);
          c = mix(c, vec3(0.22, 0.15, 0.08), hole * 0.85);
          c *= 0.9 + 0.1 * sin(dot(p, vec2(0.7, 0.4)) * 2.0 + t * 0.6);
        #elif STYLE == 2
          // toxic sludge: oily green with glowing bubbling patches
          float s = lfbm(p * 0.3 + vec2(t * 0.04, t * 0.03));
          float glow = smoothstep(0.55, 0.85, lfbm(p * 0.8 - t * 0.12));
          c = mix(vec3(0.05, 0.25, 0.06), vec3(0.25, 1.4, 0.35), s);
          c += vec3(0.6, 2.0, 0.5) * glow * (0.6 + 0.4 * sin(t * 3.0 + p.y));
        #else
          // brine: deep cold blue with drifting caustic light
          float k = lfbm(p * 0.4 + vec2(t * 0.06, -t * 0.05));
          float caustic = pow(max(0.0, 1.0 - abs(sin(k * 9.0 + t))), 6.0);
          c = mix(vec3(0.02, 0.1, 0.25), vec3(0.15, 0.55, 1.2), k);
          c += vec3(0.5, 1.2, 1.8) * caustic * 0.6;
        #endif
        gl_FragColor = vec4(clamp(c, 0.0, 3.0), 1.0);
        #include <fog_fragment>
      }`,
    defines: { STYLE: style },
  });
  m.uniforms.uTime = time;
  cache.set(key, m);
  return m;
}

// A rolling surface for an acid box's top face, slightly above it.
export function liquidSurface(world, x1, z1, x2, z2, y, zone) {
  const w = x2 - x1, d = z2 - z1;
  const geo = new THREE.PlaneGeometry(w, d, Math.min(48, Math.max(1, Math.round(w / 1.5))), Math.min(48, Math.max(1, Math.round(d / 1.5))));
  geo.rotateX(-Math.PI / 2).translate((x1 + x2) / 2, y + 0.03, (z1 + z2) / 2);
  const mesh = new THREE.Mesh(geo, liquidMaterial(zone, true));
  mesh.matrixAutoUpdate = false;
  world.scene.add(mesh);
  (world.liquids ??= []).push({ min: new THREE.Vector3(x1, y, z1), max: new THREE.Vector3(x2, y, z2), zone, style: LIQUID_STYLE[zone] ?? 0 });
  return mesh;
}

export function updateLiquids(t) {
  time.value = t % 10000;
}
