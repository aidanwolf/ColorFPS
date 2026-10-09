// AZURE — THE STORM: a tropical storm over the Drowned Reach's open sea (called from azure.js). Squalls of
// heavy warm rain sweep through and break into bright spells (the sky's clouds follow: azureOcean.js).
//   · Streaks: one instanced draw of ~9000 quads whose positions live entirely in the vertex shader (each
//     drop falls through a box that wraps round the camera), so the CPU only sets a few uniforms a frame.
//   · Cover: a ROOF MAP, built once from the world's static solids (and the tops of the water volumes):
//     the top of the highest solid over every 0.5 m cell of the world. A drop below that height is under
//     cover and isn't drawn, so rain stops at the edge of every roof, ledge and room exactly, and you can
//     stand in a doorway and watch it fall outside. The same map puts the splashes on whatever the rain
//     lands on (crowns on decks, rings on water) and tells the CPU how open the sky is above you.
//   · Splashes: one instanced draw of expanding rings scattered round the camera on the roof map.
//   · Sound: the hiss of rain out in the open, a muffled drumming under cover (a synth stand-in until
//     the `amb_rain` loop exists), and thunder after each lightning flash.
//   · Wet look: Azure's shared box materials are darkened and glossed once, at build.
//   · Lightning: every 10-25 s a flicker that lights the sky, the hemisphere light and the rain, a
//     jagged bolt far off over the sea, and the thunder a moment later.
// Off underwater and anywhere outside the storm's bounds; the whole thing costs two draws.
//   buildRain(B, { bounds: [x1, z1, x2, z2], intensity, ocean }) → { openness, flashK, squall, setIntensity(k), strike() }
import * as THREE from 'three';
import { audio } from '../audio.js';
import { SynthLoop, noiseVoice } from '../weapons/rays.js';
import { mat } from '../materials.js';

const CELL = 0.5; // m per roof-map texel
const DROPS = 9000;
const SPLASHES = 700;
const BOX = [40, 30, 40]; // m: the box of rain that wraps round the camera
const SPLASH_TILE = 30; // m: the tile splashes are scattered over round the camera
const FALL = 17; // m/s
const NONE = -1e5; // roof-map value where nothing stands (open air all the way down): no splash
const OUT = 1e5; // outside the storm: everything counts as covered
audio.manifest?.then(() => audio.prefetch(['amb_rain', 'thunder', 'thunder_far']));

const HM_GLSL = `
  uniform sampler2D uRoof;
  uniform vec4 uRoofBox; // x1, z1, width, depth (m)
  float roofAt(vec2 xz) {
    vec2 uv = (xz - uRoofBox.xy) / uRoofBox.zw;
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return ${OUT.toFixed(1)};
    return texture2D(uRoof, uv).r;
  }`;

const RAIN_V = `
  attribute vec4 aSeed;
  uniform float uTime, uIntensity, uLen, uWidth;
  uniform vec3 uBox;
  uniform vec2 uWind;
  varying float vA;
  varying float vT;
  ${HM_GLSL}
  void main() {
    vec3 vel = vec3(uWind.x, -${FALL.toFixed(1)} * (0.85 + 0.3 * aSeed.w), uWind.y);
    vec3 p = aSeed.xyz * uBox + vel * uTime;
    p = mod(p - cameraPosition + uBox * 0.5, uBox) + cameraPosition - uBox * 0.5;
    float h = roofAt(p.xz);
    vec3 dir = normalize(vel);
    float len = uLen * (0.7 + 0.6 * aSeed.w);
    // under cover (or thinned out by a lighter shower): collapse it off screen
    if (p.y < h || aSeed.w > uIntensity) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vA = 0.0; return; }
    len = min(len, (p.y - h) / max(0.01, -dir.y)); // a drop meeting the deck is cut off at it
    vec3 toCam = cameraPosition - p;
    float d = length(toCam);
    vec3 side = normalize(cross(dir, toCam / max(d, 0.001)));
    vec3 w = p + dir * (position.y * len) + side * (position.x * uWidth * (1.0 + d * 0.035));
    vA = smoothstep(0.7, 3.0, d) * (1.0 - smoothstep(uBox.x * 0.32, uBox.x * 0.5, d));
    vT = position.y;
    gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
  }`;
const RAIN_F = `
  uniform vec3 uColor;
  varying float vA;
  varying float vT;
  void main() {
    if (vA <= 0.0) discard;
    // a faint tail and a brighter head
    gl_FragColor = vec4(uColor * (0.35 + 0.65 * vT), vA * (0.25 + 0.75 * vT));
  }`;

const SPLASH_V = `
  attribute vec3 aSeed;
  uniform float uTime, uIntensity;
  uniform float uTile;
  varying vec2 vUv;
  varying float vA;
  varying float vWater;
  ${HM_GLSL}
  uniform sampler2D uWet;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    float period = 0.42 + 0.3 * aSeed.z;
    float tt = uTime / period + aSeed.z * 17.0;
    float n = floor(tt), ph = fract(tt);
    vec2 r = vec2(hash(aSeed.xy + n * 0.1371), hash(aSeed.yx * 1.7 + n * 0.0917));
    vec2 xz = mod(r * uTile - cameraPosition.xz + uTile * 0.5, uTile) + cameraPosition.xz - uTile * 0.5;
    float h = roofAt(xz);
    vec2 uv = (xz - uRoofBox.xy) / uRoofBox.zw;
    float water = texture2D(uWet, uv).r;
    vWater = water;
    vA = 0.0;
    if (h < -1e4 || h > 1e4 || h > cameraPosition.y + 8.0 || aSeed.z > uIntensity || length(xz - cameraPosition.xz) > uTile * 0.5) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }
    float size = mix(0.03, water > 0.5 ? 0.42 : 0.17, sqrt(ph));
    vec3 w = vec3(xz.x + position.x * size, h + 0.025, xz.y + position.z * size);
    vUv = position.xz;
    float d = distance(cameraPosition, w);
    vA = (1.0 - ph) * (1.0 - ph) * (1.0 - smoothstep(uTile * 0.3, uTile * 0.5, d));
    gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
  }`;
const SPLASH_F = `
  uniform vec3 uColor;
  varying vec2 vUv;
  varying float vA;
  varying float vWater;
  void main() {
    if (vA <= 0.0) discard;
    float r = length(vUv);
    float ring = 1.0 - smoothstep(0.0, vWater > 0.5 ? 0.12 : 0.22, abs(r - 0.78));
    float dot = vWater > 0.5 ? 0.0 : (1.0 - smoothstep(0.0, 0.35, r)) * 0.6;
    float a = (ring + dot) * vA;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor, a * 0.55);
  }`;

export function buildRain(B, { bounds = [20, -236, 204, -36], intensity = 1, ocean = null } = {}) {
  const { W, game } = B;
  const [bx1, bz1, bx2, bz2] = bounds;
  // everything up top is wet: Azure's shared box materials darken and gloss up (sharper highlights)
  for (const k of ['floor', 'plat', 'metal', 'wall', 'grate']) {
    const m = mat(k, 'blue');
    m.roughness *= 0.6;
    m.metalness = Math.min(1, m.metalness + 0.1);
    m.color.multiplyScalar(0.88);
  }
  const nx = Math.ceil((bx2 - bx1) / CELL), nz = Math.ceil((bz2 - bz1) / CELL);
  const roof = new Float32Array(nx * nz).fill(NONE);
  const wetMap = new Uint8Array(nx * nz);
  const roofTex = new THREE.DataTexture(roof, nx, nz, THREE.RedFormat, THREE.FloatType);
  const wetTex = new THREE.DataTexture(wetMap, nx, nz, THREE.RedFormat, THREE.UnsignedByteType);
  for (const t of [roofTex, wetTex]) {
    t.magFilter = t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
  }
  wetTex.minFilter = wetTex.magFilter = THREE.LinearFilter;
  const roofBox = new THREE.Vector4(bx1, bz1, nx * CELL, nz * CELL);

  // The roof map: the top of the highest static solid (or water surface) over each cell. Built on the
  // first frame, once every world module has added its solids.
  let built = false;
  function buildRoof() {
    built = true;
    const raster = (min, max, top, water) => {
      const i1 = Math.max(0, Math.floor((min.x - bx1) / CELL)), i2 = Math.min(nx - 1, Math.ceil((max.x - bx1) / CELL) - 1);
      const j1 = Math.max(0, Math.floor((min.z - bz1) / CELL)), j2 = Math.min(nz - 1, Math.ceil((max.z - bz1) / CELL) - 1);
      for (let j = j1; j <= j2; j++) {
        for (let i = i1; i <= i2; i++) {
          const k = j * nx + i;
          if (top > roof[k]) {
            roof[k] = top;
            wetMap[k] = water ? 255 : 0;
          }
        }
      }
    };
    for (const s of W.solids) {
      if (!s.static || s.noShot || s.max.x < bx1 || s.min.x > bx2 || s.max.z < bz1 || s.min.z > bz2) continue;
      // (thin slivers, under a cell wide, would wall off whole cells: only count them where they cover it)
      if (s.max.x - s.min.x < CELL * 0.5 || s.max.z - s.min.z < CELL * 0.5) continue;
      raster(s.min, s.max, s.max.y, false);
    }
    for (const w of W.waters || []) raster(w.min, w.max, w.max.y, true);
    roofTex.needsUpdate = true;
    wetTex.needsUpdate = true;
  }
  const roofAt = (x, z) => {
    const i = Math.floor((x - bx1) / CELL), j = Math.floor((z - bz1) / CELL);
    if (i < 0 || j < 0 || i >= nx || j >= nz) return OUT;
    return roof[j * nx + i];
  };

  // ---- streaks
  const quad = new THREE.InstancedBufferGeometry();
  quad.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
  quad.setIndex([0, 1, 2, 0, 2, 3]);
  const seeds = new Float32Array(DROPS * 4);
  for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
  quad.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  quad.instanceCount = DROPS;
  const common = {
    uTime: { value: 0 }, uIntensity: { value: intensity }, uRoof: { value: roofTex }, uRoofBox: { value: roofBox },
  };
  const rainCol = new THREE.Color(0.55, 0.62, 0.68); // (warm tropical rain, lit by a bright sky)
  const rainMat = new THREE.ShaderMaterial({
    uniforms: {
      ...common, uLen: { value: 0.8 }, uWidth: { value: 0.0075 }, uBox: { value: new THREE.Vector3(...BOX) },
      uWind: { value: new THREE.Vector2(-1.6, 0.9) }, uColor: { value: rainCol.clone() },
    },
    vertexShader: RAIN_V, fragmentShader: RAIN_F, transparent: true, depthWrite: false,
  });
  const rain = new THREE.Mesh(quad, rainMat);
  // ---- splashes
  const flat = new THREE.InstancedBufferGeometry();
  flat.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1], 3));
  flat.setIndex([0, 2, 1, 0, 3, 2]);
  const sSeeds = new Float32Array(SPLASHES * 3);
  for (let i = 0; i < sSeeds.length; i++) sSeeds[i] = Math.random();
  flat.setAttribute('aSeed', new THREE.InstancedBufferAttribute(sSeeds, 3));
  flat.instanceCount = SPLASHES;
  const splashMat = new THREE.ShaderMaterial({
    uniforms: { ...common, uTime: common.uTime, uIntensity: common.uIntensity, uTile: { value: SPLASH_TILE }, uWet: { value: wetTex }, uColor: { value: new THREE.Color(0.6, 0.75, 0.95) } },
    vertexShader: SPLASH_V, fragmentShader: SPLASH_F, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  });
  const splash = new THREE.Mesh(flat, splashMat);
  for (const m of [rain, splash]) {
    m.frustumCulled = false;
    m.userData.noCull = true;
    m.userData.noBatch = true;
    m.raycast = () => {};
    m.visible = false;
    W.scene.add(m);
  }
  rain.renderOrder = 6;
  splash.renderOrder = 2;

  // ---- lightning: a jagged bolt (one ribbon, re-shaped for each strike) far off over the sea
  const SEGS = 18;
  const boltGeo = new THREE.BufferGeometry();
  const boltPos = new Float32Array(SEGS * 2 * 3 * 3); // two triangles per segment... (as a line strip of quads)
  boltGeo.setAttribute('position', new THREE.BufferAttribute(boltPos, 3));
  const boltMat = new THREE.MeshBasicMaterial({ color: 0xdfeaff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
  const bolt = new THREE.Mesh(boltGeo, boltMat);
  bolt.frustumCulled = false;
  bolt.userData.noCull = true;
  bolt.raycast = () => {};
  bolt.visible = false;
  bolt.renderOrder = 1;
  W.scene.add(bolt);
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _s = new THREE.Vector3();
  function shapeBolt(cam) {
    // somewhere 120-180 m off, mostly in the direction you're looking, from the clouds down to the sea
    game.camera.getWorldDirection(_a);
    const ang = Math.atan2(_a.z, _a.x) + (Math.random() - 0.5) * 2.2, dist = 120 + Math.random() * 60;
    const x0 = cam.x + Math.cos(ang) * dist, z0 = cam.z + Math.sin(ang) * dist;
    let x = x0, y = 110, z = z0;
    _s.set(Math.sin(ang), 0, -Math.cos(ang)); // sideways to the view
    let k = 0;
    for (let i = 0; i < SEGS; i++) {
      const w = 0.9 * (1 - i / SEGS) + 0.25;
      _a.set(x, y, z);
      x += (Math.random() - 0.5) * 9;
      z += (Math.random() - 0.5) * 9;
      y -= 6.5 + Math.random() * 3; // (down to about the sea)
      _b.set(x, y, z);
      for (const [p, o] of [[_a, -w], [_a, w], [_b, w], [_a, -w], [_b, w], [_b, -w]]) {
        boltPos[k++] = p.x + _s.x * o;
        boltPos[k++] = p.y;
        boltPos[k++] = p.z + _s.z * o;
      }
    }
    boltGeo.attributes.position.needsUpdate = true;
    boltGeo.computeBoundingSphere();
  }

  // ---- sound: the open-air hiss and a muffled drumming under cover (synth stand-ins for amb_rain)
  const hiss = new SynthLoop((ctx, out) => {
    const a = noiseVoice('highpass', 2200, 0.5)(ctx, out);
    const b = noiseVoice('bandpass', 700, 0.4)(ctx, out);
    return { srcs: [...a.srcs, ...b.srcs], filter: a.filter };
  });
  const drum = new SynthLoop(noiseVoice('lowpass', 520, 0.7));
  let rainLoop = null; // the real loop, once generated

  const st = {
    openness: 0, // 0 (indoors) .. 1 (open sky over you), smoothed
    flashK: 0,
    squall: 1, // the passing squalls: 1 in the thick of one, ~0.3 in a sunny break
    intensity,
    setIntensity(k) {
      st.intensity = k;
    },
    strike() {
      startStrike(game.camera.position);
    },
  };
  let t = 0, nextStrike = 6 + Math.random() * 8, strike = null, lastAdd = { hemi: 0, sky: 0 };
  const skyAdd = new THREE.Vector3();
  // A strike: a few quick flickers (k over time), the bolt for the brightest, thunder after.
  function startStrike(cam) {
    shapeBolt(cam);
    const flick = [[0, 1], [0.07, 0.25], [0.12, 0.9], [0.22, 0.15], [0.3, 0.55]];
    strike = { t: 0, flick, dur: 0.75 };
    const delay = 0.4 + Math.random() * 2.2;
    const loud = st.openness > 0.3 ? 1 : 0.55;
    const name = delay < 1 ? 'thunder' : 'thunder_far';
    if (audio.available?.has(name)) audio.sample(name, { gain: 0.9 * loud, vary: 0.1, delay });
    else {
      audio.noise({ dur: 0.35, gain: 0.28 * loud, freq: 2400, f2: 400, type: 'bandpass', q: 0.6, delay });
      audio.noise({ dur: 3.6, gain: 0.55 * loud, freq: 420, f2: 60, type: 'lowpass', q: 0.4, delay: delay + 0.05 });
      audio.noise({ dur: 2.4, gain: 0.3 * loud, freq: 160, f2: 40, type: 'lowpass', q: 0.8, delay: delay + 0.6 });
    }
  }

  W.add({
    update(dt, player) {
      if (!built) buildRoof();
      const cam = game.camera.position;
      const inStorm = cam.x > bx1 - 5 && cam.x < bx2 && cam.z > bz1 && cam.z < bz2 && cam.x > 18;
      const under = !!player.headUnder || cam.y < -9.5;
      // squalls roll through every minute or two, with bright breaks of blue between them
      st.squall = 0.62 + 0.38 * Math.sin(t * 0.055) * Math.sin(t * 0.021 + 1.3) + 0.25 * Math.sin(t * 0.13);
      st.squall = Math.min(1, Math.max(0.28, st.squall));
      const rainK = st.intensity * st.squall;
      if (ocean) ocean.storm = st.intensity > 0.5 ? 0.15 + 0.85 * st.squall : 0.05;
      const on = inStorm && !under && rainK > 0.01;
      rain.visible = splash.visible = on;
      t += dt;
      common.uTime.value = t;
      common.uIntensity.value = rainK;
      // how open the sky is over you: the eye against the roof map here and in a ring round you
      let open = 0;
      if (inStorm) {
        const ey = cam.y - 0.3;
        if (ey > roofAt(cam.x, cam.z)) open += 3;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          if (ey > roofAt(cam.x + Math.cos(a) * 4, cam.z + Math.sin(a) * 4)) open += 1;
        }
        open /= 11;
      }
      if (under) open = 0;
      st.openness += (open - st.openness) * Math.min(1, dt * 3);
      // sound
      const gainOpen = on ? 0.13 * st.openness * rainK : 0;
      const roofed = inStorm && !under && st.openness < 0.5 && cam.y > -9.5 ? (1 - st.openness * 2) * 0.05 * rainK : 0;
      if (audio.available?.has('amb_rain')) {
        rainLoop ??= audio.createLoop('amb_rain', { gain: 0 });
        rainLoop.setGain(gainOpen * 3.5);
      } else hiss.set(gainOpen, dt);
      drum.set(roofed, dt);
      // lightning (only while you're out in the storm's air, or not far under cover from it; the squalls
      // bring it, the breaks rarely)
      if (inStorm && !under && (st.openness > 0.05 || cam.y > -9.5) && st.intensity > 0.5) {
        nextStrike -= dt * (0.3 + st.squall);
        if (nextStrike <= 0 && !strike) {
          nextStrike = 10 + Math.random() * 15;
          startStrike(cam);
        }
      }
      let k = 0;
      if (strike) {
        strike.t += dt;
        for (const [at, v] of strike.flick) {
          const age = strike.t - at;
          if (age >= 0) k = Math.max(k, v * Math.exp(-age * 14));
        }
        if (strike.t > strike.dur) strike = null;
      }
      st.flashK = k;
      bolt.visible = k > 0.35 && inStorm;
      boltMat.opacity = Math.min(1, k * 1.4);
      // the flash: on the hemisphere light and the sky, undone exactly as the atmosphere eases (main.js
      // lerps toward its preset by ka a frame, so the base under last frame's add is cur - add * (1 - ka))
      const ka = 1 - Math.exp(-dt * 1.2);
      const vis = inStorm ? 0.15 * (cam.y > -9.5 ? 1 : 0) + 0.85 * st.openness : 0;
      if (ocean) ocean.flash = k * vis;
      const hemi = game.hemi;
      if (hemi) {
        const base = hemi.intensity - lastAdd.hemi * (1 - ka);
        const add = k * 3.2 * vis;
        hemi.intensity = base + add;
        lastAdd.hemi = add;
      }
      const u = game.sky?.material?.uniforms;
      if (u) {
        const add = k * 1.1 * vis;
        for (const key of ['uTop', 'uMid', 'uHor']) {
          const v = u[key].value;
          skyAdd.set(0.55, 0.65, 0.85).multiplyScalar(lastAdd.sky * (1 - ka));
          v.sub(skyAdd);
          skyAdd.set(0.55, 0.65, 0.85).multiplyScalar(add);
          v.add(skyAdd);
        }
        lastAdd.sky = add;
      }
      rainMat.uniforms.uColor.value.copy(rainCol).multiplyScalar(1 + k * 2.5);
    },
  });

  return st;
}
