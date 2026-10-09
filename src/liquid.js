// Animated hazard liquids. Every 'acid' box gets a subdivided surface on top whose vertices roll in slow
// waves and whose shader draws, per area: glowing lava with drifting crust (Foundry, Prism), shifting
// quicksand swirling into sink holes (Solar), bubbling toxic sludge (Verdant) and scalding brine (Azure).
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
  // vertical motion in metres: lava heaves, quicksand barely breathes, sludge, brine and water ripple
  return [0.12, 0.03, 0.09, 0.07, 0.08][style];
}

const cache = new Map();
export function liquidMaterial(zone, surface, styleOverride = null) {
  const style = styleOverride ?? LIQUID_STYLE[zone] ?? 0;
  const key = style + (surface ? 's' : 'b');
  if (cache.has(key)) return cache.get(key);
  const m = new THREE.ShaderMaterial({
    fog: true,
    // (the style and glow are uniforms, not defines: every style shares one program)
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uAmp: { value: surface ? waves(style) : 0 }, uStyle: { value: style }, uGlow: { value: 1 } }]),
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
      uniform float uTime, uGlow;
      uniform int uStyle;
      varying vec3 vW;
      ${NOISE}
      void main(){
        vec2 p = vW.xz;
        float t = uTime;
        vec3 c;
        if (uStyle == 0) {
          // lava: dark cooling crust plates drifting over a white-hot flow, with glowing seams
          vec2 flow = p * 0.18 + vec2(t * 0.03, t * 0.02);
          float crust = lfbm(flow + lfbm(flow * 1.7 - t * 0.05) * 1.3);
          float seam = 1.0 - smoothstep(0.02, 0.12, abs(crust - 0.5));
          float heat = smoothstep(0.62, 0.32, crust);
          c = mix(vec3(0.16, 0.03, 0.01), vec3(1.9, 0.55, 0.08), heat);
          c += vec3(2.2, 1.1, 0.25) * seam * (0.6 + 0.4 * sin(t * 2.0 + p.x));
          c += vec3(0.6, 0.12, 0.02) * (0.5 + 0.5 * sin(t * 1.3 + lfbm(p * 0.5) * 6.0)) * heat;
        } else if (uStyle == 1) {
          // quicksand: wavy dune ripples crawling steadily one way across it (lit on one face, shaded on
          // the other, pale crests), fine streaks along the flow and darker wet patches
          vec2 dir = vec2(0.8, 0.6);
          float along = dot(p, dir), across = dot(p, vec2(-dir.y, dir.x));
          float warp = sin(across * 0.33 + lfbm(p * 0.12) * 4.0) * 0.8 + lfbm(p * 0.35) * 1.1;
          float ph = (along + warp) * 3.0 - t * 1.2;
          float face = cos(ph); // which way this bit of ripple faces the sun
          float crest = smoothstep(0.75, 1.0, sin(ph));
          float drift = lfbm(p * 0.3 + dir * t * 0.06);
          c = mix(vec3(0.74, 0.57, 0.34), vec3(0.55, 0.4, 0.23), drift);
          c *= 0.84 + 0.2 * face;
          c += vec3(0.16, 0.12, 0.07) * crest;
          c *= 0.95 + 0.05 * sin(across * 2.1 + lfbm(p * 0.8 + dir * t * 0.2) * 5.0);
          c = mix(c, vec3(0.3, 0.21, 0.12), smoothstep(0.66, 0.85, lfbm(p * 0.18 - dir * t * 0.02)) * 0.6);
        } else if (uStyle == 2) {
          // toxic sludge: oily green with glowing bubbling patches
          float s = lfbm(p * 0.3 + vec2(t * 0.04, t * 0.03));
          float glow = smoothstep(0.55, 0.85, lfbm(p * 0.8 - t * 0.12));
          c = mix(vec3(0.05, 0.25, 0.06), vec3(0.25, 1.4, 0.35), s);
          c += vec3(0.6, 2.0, 0.5) * glow * (0.6 + 0.4 * sin(t * 3.0 + p.y));
        } else if (uStyle == 4) {
          // swimmable water: clear blue-green, glinting ripples (seen from above and below)
          float k = lfbm(p * 0.5 + vec2(t * 0.07, t * 0.05));
          float glint = pow(max(0.0, 1.0 - abs(sin(k * 11.0 - t * 1.4))), 8.0);
          c = mix(vec3(0.03, 0.22, 0.32), vec3(0.1, 0.5, 0.65), k) + vec3(0.6, 0.9, 1.0) * glint * 0.5;
        } else {
          // brine: hot turquoise, steaming, with drifting caustic light
          float k = lfbm(p * 0.4 + vec2(t * 0.06, -t * 0.05));
          float caustic = pow(max(0.0, 1.0 - abs(sin(k * 9.0 + t))), 6.0);
          c = mix(vec3(0.02, 0.16, 0.2), vec3(0.18, 0.95, 0.9), k);
          c += vec3(0.9, 1.5, 1.3) * caustic * 0.6;
        }
        gl_FragColor = vec4(clamp(c * uGlow, 0.0, 3.0), uStyle == 4 ? 0.62 : 1.0);
        #include <fog_fragment>
      }`,
    transparent: style === 4,
    depthWrite: style !== 4,
    side: style === 4 ? THREE.DoubleSide : THREE.FrontSide,
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

// The surface sheet of a swimmable water volume.
export function waterSurface(world, x1, z1, x2, z2, y) {
  const w = x2 - x1, d = z2 - z1;
  const geo = new THREE.PlaneGeometry(w, d, Math.min(48, Math.max(1, Math.round(w / 1.5))), Math.min(48, Math.max(1, Math.round(d / 1.5))));
  geo.rotateX(-Math.PI / 2).translate((x1 + x2) / 2, y, (z1 + z2) / 2);
  const mesh = new THREE.Mesh(geo, liquidMaterial('blue', true, 4));
  mesh.matrixAutoUpdate = false;
  world.scene.add(mesh);
  return mesh;
}

export function updateLiquids(t) {
  time.value = t % 10000;
}
