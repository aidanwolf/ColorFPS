// The holographic map (M): a translucent, scanlined model of the whole world floating over the dimmed
// game, which you can orbit, zoom and pan. It's built once (on first open) from the level's merged
// static meshes, which it draws again with its own shaders (the GPU buffers are shared with the game),
// plus their edges as glowing outlines, in its own scene and bloom pass. Nothing runs while it's closed
// except one grid lookup a frame to chart where you've been.
// Fog of war: where you've stood is kept as a coarse 8 m grid (localStorage, beside the save). Rooms near
// those cells are drawn bright; the rest of an area you've entered is a faint dashed outline, and areas
// you've never set foot in are only a ghostly silhouette.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLORS, RED, YELLOW, GREEN, BLUE } from './colors.js';
import { audio } from './audio.js';
import { loadSave } from './save.js';
import { regionOf, PORTALS } from './levels/regions.js';
import { currentObjective, DOORS } from './levels/guide.js';
import { Barrier } from './entities/barrier.js';
import { Checkpoint, Pickup } from './entities/misc.js';
import { ads } from './monetization/bonusround.js';
import './map.css';

const KEY = 'chroma-map-v1';
const params = new URLSearchParams(location.search);
// the fog-of-war grid: 8 m cells over 432 × 176 × 512 m, with room around today's worlds
const CELL = 8;
const NX = 54, NY = 22, NZ = 64;
const GRID_MIN = new THREE.Vector3(-216, -88, -392);
const OPEN_TIME = 0.5;
const CLOSE_TIME = 0.28;
const START_DIST = 80;
// (gain evens out how bright each color reads in the hologram: yellow and cyan glare, blue sinks)
const AREAS = {
  red: { name: 'CRIMSON FOUNDRY', color: 0xff3344, gain: 1.1 },
  hub: { name: 'THE PRISM ATRIUM', color: 0x4ff0ff, gain: 0.75 },
  solar: { name: 'SOLAR · SUNSCORCH MESA', color: 0xffc23a, gain: 0.6 },
  verdant: { name: 'VERDANT · EMERALD HOLLOW', color: 0x3dff7a, gain: 0.65 },
  azure: { name: 'AZURE · THE COLD DEEP', color: 0x3a8bff, gain: 1.25 },
  prism: { name: 'PRISM CORE', color: 0xb46bff, gain: 1.1 },
};
// which world each core restores (for the objective beacon)
const CORE_AREA = { [YELLOW]: 'solar', [GREEN]: 'verdant', [BLUE]: 'azure' };

// ---- shaders: every hologram surface shares the fog-of-war lookup and the scan-in sweep ----
const VERT = `
  varying vec3 vW;
  varying vec3 vN;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vN = normal;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const COMMON = `
  uniform sampler3D uVisit;
  uniform vec3 uGridMin, uGridSize, uOrigin, uColor;
  uniform float uTime, uSweep, uSweepOn, uEntered, uHi, uCut;
  varying vec3 vW;
  varying vec3 vN;
  float charted(vec3 p) { return texture(uVisit, (p - uGridMin) / uGridSize).r; }
  // the hologram scans in from the player outward (and back in when closing)
  float lead(vec3 p) {
    float d = distance(p, uOrigin);
    if (d > uSweep) discard;
    return uSweepOn * exp(-(uSweep - d) * 0.35);
  }
  // shared shimmer: screen scanlines and a bright band rolling up through the model
  float holo() {
    float scan = 0.82 + 0.18 * sin(gl_FragCoord.y * 1.35 - uTime * 7.0);
    float band = smoothstep(0.985, 1.0, sin(vW.y * 0.09 - uTime * 1.3));
    return scan + band * 1.4;
  }
  float pulse() { return uHi * (0.75 + 0.25 * sin(uTime * 3.2)); }
  // in the area you're in, roofs and upper storeys fade so you can see the floor you're on
  float cutaway() { return uHi * smoothstep(uCut, uCut + 4.0, vW.y); }`;
const FILL_FRAG = COMMON + `
  void main() {
    float l = lead(vW);
    float v = smoothstep(0.08, 0.7, charted(vW));
    vec3 n = normalize(vN);
    vec3 V = normalize(cameraPosition - vW);
    float rim = pow(1.0 - abs(dot(n, V)), 3.0);
    float up = step(0.6, n.y);
    // floors carry a faint 2 m survey grid
    vec2 g = abs(fract(vW.xz * 0.5) - 0.5);
    float grid = up * smoothstep(0.44, 0.5, max(g.x, g.y));
    float a = 0.012 + 0.025 * up + 0.07 * rim + 0.12 * grid;
    a *= mix(0.06, 1.0, v) * uEntered * (0.8 + 0.4 * pulse()) * (1.0 - 0.92 * cutaway());
    gl_FragColor = vec4(uColor * a * holo() + vec3(0.6, 0.9, 1.0) * l * 0.5, 1.0);
  }`;
const EDGE_FRAG = COMMON + `
  uniform float uBright;
  void main() {
    float l = lead(vW);
    float v = smoothstep(0.08, 0.7, charted(vW));
    // uncharted parts of a known area: a faint dashed outline; unknown areas: a ghost
    float dash = step(0.5, fract((vW.x + vW.y + vW.z) * 0.7));
    float k = mix(dash * 0.22, 1.0, v);
    k = mix(0.07, k, uEntered) * (0.8 + 0.45 * pulse()) * (1.0 - 0.88 * cutaway());
    gl_FragColor = vec4(uColor * k * uBright * holo() + vec3(0.7, 0.95, 1.0) * l, 1.0);
  }`;
const DEPTH_FRAG = COMMON + `
  void main() {
    lead(vW);
    if (cutaway() > 0.5) discard;
    gl_FragColor = vec4(0.0);
  }`;
const HAZARD_FRAG = COMMON + `
  void main() {
    float l = lead(vW);
    float v = smoothstep(0.08, 0.7, charted(vW));
    float stripe = step(0.55, fract((vW.x + vW.z) * 0.35 - uTime * 0.6));
    gl_FragColor = vec4(uColor * (0.08 + 0.32 * stripe) * v * holo() + vec3(1.0, 0.6, 0.3) * l * 0.5, 1.0);
  }`;
// the dimmed, blurred, cyan-graded snapshot of the game behind the hologram
const BG_FRAG = `
  uniform sampler2D tSnap;
  uniform vec2 uRes;
  uniform float uOpen, uTime;
  varying vec2 vUv;
  void main() {
    vec3 c = vec3(0.0);
    float ws = 0.0;
    for (int i = -2; i <= 2; i++)
      for (int j = -2; j <= 2; j++) {
        float w = exp(-float(i * i + j * j) / 4.0);
        c += texture2D(tSnap, vUv + vec2(float(i), float(j)) * 9.0 * uOpen / uRes).rgb * w;
        ws += w;
      }
    c = pow(c / ws, vec3(2.2)); // the snapshot is display-encoded; this pass works in linear
    float lum = dot(c, vec3(0.3, 0.59, 0.11));
    vec3 graded = vec3(0.003, 0.01, 0.018) + lum * vec3(0.03, 0.07, 0.1);
    vec2 q = vUv - 0.5;
    float vig = smoothstep(0.95, 0.2, length(q * vec2(1.25, 1.0)));
    graded *= 0.5 + 0.5 * vig;
    // projector glow under the hologram and fine scanlines
    graded += vec3(0.0, 0.025, 0.04) * vig * vig;
    graded *= 0.85 + 0.15 * sin(gl_FragCoord.y * 2.1 + uTime * 3.0);
    gl_FragColor = vec4(mix(c, graded, uOpen), 1.0);
  }`;
const BEAM_FRAG = `
  uniform vec3 uColor;
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    float fade = pow(1.0 - vUv.y, 1.6);
    float bands = 0.6 + 0.4 * sin(vUv.y * 40.0 - uTime * 6.0);
    float edge = 0.55 + 0.45 * pow(abs(sin(vUv.x * 3.14159 * 4.0)), 6.0);
    gl_FragColor = vec4(uColor * fade * bands * edge * 1.4, 1.0);
  }`;

// a soft round glow and a hollow ring, drawn once for the marker sprites
function spriteTex(kind) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  if (kind === 'glow') {
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
  } else {
    x.strokeStyle = '#fff';
    x.lineWidth = 4;
    x.beginPath();
    x.arc(32, 32, 26, 0, Math.PI * 2);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const add = THREE.AdditiveBlending;
const _v = new THREE.Vector3();
const _c = new THREE.Color();
const ease = (k) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);

export class MapView {
  constructor(game) {
    this.game = game;
    this.isOpen = false;
    this.built = false;
    // dev jumps (?dev&start=…) chart into memory only, like the save
    this.persist = !(params.has('dev') && params.get('start'));
    this.visit = new Uint8Array(NX * NY * NZ); // charted cells (each visited cell plus its neighbours)
    this.trail = new Set(); // the cells you've actually stood in
    this.entered = new Set(); // areas you've set foot in
    this.lastCell = -1;
    this.dirty = false;
    this.savedAt = 0;
    // the chart belongs to the save: a new game (no save) starts a blank map
    const s = this.persist && loadSave() ? this.load() : null;
    if (s) {
      s.cells.forEach((c) => Number.isInteger(c) && c >= 0 && c < this.visit.length && this.chart(c));
      s.areas.forEach((a) => AREAS[a] && this.entered.add(a));
      this.dirty = false;
    }
    addEventListener('pagehide', () => this.flush(true));
    this.buildUi();
    // building takes a fraction of a second: do it behind the title screen if there's time, else on
    // first open (never in the middle of play)
    const prebuild = () => !this.built && this.game.state === 'title' && this.build(true);
    if (window.requestIdleCallback) requestIdleCallback(prebuild, { timeout: 4000 });
    else setTimeout(prebuild, 2000);
  }

  // ------------------------------------------------------------------ charting
  load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || 'null');
      return s && s.v === 1 && Array.isArray(s.cells) && Array.isArray(s.areas) ? s : null;
    } catch {
      return null;
    }
  }

  flush(force = false) {
    if (!this.dirty || !this.persist || (!force && performance.now() - this.savedAt < 3000)) return;
    this.dirty = false;
    this.savedAt = performance.now();
    try {
      localStorage.setItem(KEY, JSON.stringify({ v: 1, cells: [...this.trail], areas: [...this.entered] }));
    } catch {
      // storage unavailable: the map is charted for this session only
    }
  }

  cellOf(p) {
    const x = Math.floor((p.x - GRID_MIN.x) / CELL), y = Math.floor((p.y - GRID_MIN.y) / CELL), z = Math.floor((p.z - GRID_MIN.z) / CELL);
    if (x < 0 || y < 0 || z < 0 || x >= NX || y >= NY || z >= NZ) return -1;
    return x + NX * (y + NY * z);
  }

  // Stand in a cell: it and its 26 neighbours are charted (about a room's worth around you).
  chart(c) {
    if (this.trail.has(c)) return;
    this.trail.add(c);
    const x = c % NX, y = Math.floor(c / NX) % NY, z = Math.floor(c / (NX * NY));
    for (let dz = -1; dz <= 1; dz++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const X = x + dx, Y = y + dy, Z = z + dz;
          if (X >= 0 && Y >= 0 && Z >= 0 && X < NX && Y < NY && Z < NZ) this.visit[X + NX * (Y + NY * Z)] = 255;
        }
    if (this.visitTex) this.visitTex.needsUpdate = true;
    this.dirty = true;
  }

  // Called every gameplay frame: chart the cell the player is in (a lookup unless it's a new cell).
  track(pos) {
    const c = this.cellOf(pos);
    if (c !== this.lastCell && c >= 0) {
      this.lastCell = c;
      if (!this.trail.has(c)) {
        this.chart(c);
        this.entered.add(regionOf(pos));
      }
    }
    if (this.dirty) this.flush();
  }

  chartedAt(p) {
    const c = this.cellOf(p);
    return c >= 0 ? this.visit[c] / 255 : 0;
  }

  // dev helper: chart everything
  revealAll() {
    this.visit.fill(255);
    Object.keys(AREAS).forEach((a) => this.entered.add(a));
    if (this.visitTex) this.visitTex.needsUpdate = true;
  }

  // ------------------------------------------------------------------ DOM
  buildUi() {
    const root = (this.root = document.createElement('div'));
    root.id = 'map';
    root.className = 'hidden';
    root.innerHTML = `
      <div class="map-labels"></div>
      <div class="map-head">
        <div class="map-kicker">HOLOGRAPHIC CARTOGRAPHY</div>
        <div class="map-area"></div>
        <div class="map-charted"></div>
      </div>
      <div class="map-obj"><div class="map-label">OBJECTIVE</div><div class="map-obj-text"></div></div>
      <div class="map-side">
        <div class="map-label">SECTORS</div>
        <div class="map-areas"></div>
        <div class="map-label lg-title">LEGEND</div>
        <div class="map-legend">
          <div><i class="lg-you"></i>You</div>
          <div><i class="lg-goal"></i>Objective</div>
          <div><i class="lg-save"></i>Save point</div>
          <div><i class="lg-cp"></i>Checkpoint</div>
          <div><i class="lg-gate"></i>Color gate</div>
          <div><i class="lg-core"></i>Chroma core</div>
          <div><i class="lg-hazard"></i>Hazard</div>
          <div><i class="lg-known"></i>Charted</div>
          <div><i class="lg-unknown"></i>Uncharted</div>
        </div>
      </div>
      <div class="map-hint desk-hint"><kbd>Drag</kbd> rotate <kbd>Right-drag</kbd>/<kbd>WASD</kbd> pan <kbd>Wheel</kbd> zoom <kbd>R</kbd><kbd>F</kbd> up/down <kbd>Space</kbd> recenter <kbd>M</kbd> close</div>
      <div class="map-hint touch-hint">Drag to rotate · pinch to zoom · two fingers to pan · double-tap to recenter</div>
      <button type="button" class="map-close" aria-label="Close map">✕</button>
      <div class="map-scanline"></div>`;
    document.body.appendChild(root);
    this.labelsEl = root.querySelector('.map-labels');
    this.areaEl = root.querySelector('.map-area');
    this.chartedEl = root.querySelector('.map-charted');
    this.objEl = root.querySelector('.map-obj-text');
    this.areasEl = root.querySelector('.map-areas');
    root.querySelector('.map-close').addEventListener('click', (e) => {
      e.stopPropagation();
      this.close();
    });
    this.bindControls();
  }

  label(text, cls) {
    const el = document.createElement('div');
    el.className = 'map-tag ' + (cls || '');
    el.innerHTML = text;
    this.labelsEl.appendChild(el);
    return el;
  }

  // Orbit (left drag), pan (right drag / shift-drag / two fingers), zoom (wheel / pinch). Mouse moves
  // arrive as movementX/Y, so this works with the pointer still locked from gameplay.
  bindControls() {
    this.drag = null;
    addEventListener('mousedown', (e) => {
      if (!this.isOpen || e.target.closest?.('.map-close')) return;
      this.drag = e.button === 2 || e.shiftKey ? 'pan' : 'orbit';
    });
    addEventListener('mouseup', () => (this.drag = null));
    addEventListener('mousemove', (e) => {
      if (!this.isOpen || !this.drag) return;
      if (this.drag === 'orbit') this.orbit(e.movementX, e.movementY);
      else this.pan(e.movementX, e.movementY);
    });
    addEventListener('wheel', (e) => this.isOpen && this.zoom(Math.exp(Math.sign(e.deltaY) * 0.14)), { passive: true });
    addEventListener('contextmenu', (e) => this.isOpen && e.preventDefault());
    const touches = new Map();
    let lastTap = 0;
    const mid = () => {
      const p = [...touches.values()];
      return { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2, d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) };
    };
    let pinch = null;
    const opts = { passive: false };
    this.root.addEventListener('touchstart', (e) => {
      if (e.target.closest('.map-close')) return;
      e.preventDefault();
      for (const t of e.changedTouches) touches.set(t.identifier, { x: t.clientX, y: t.clientY });
      if (touches.size === 2) pinch = mid();
      if (touches.size === 1) {
        if (performance.now() - lastTap < 300) this.recenter();
        lastTap = performance.now();
      }
    }, opts);
    this.root.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const one = touches.size === 1;
      for (const t of e.changedTouches) {
        const p = touches.get(t.identifier);
        if (!p) continue;
        if (one) this.orbit((t.clientX - p.x) * 1.4, (t.clientY - p.y) * 1.4);
        p.x = t.clientX;
        p.y = t.clientY;
      }
      if (touches.size === 2 && pinch) {
        const m = mid();
        this.pan(m.x - pinch.x, m.y - pinch.y);
        if (m.d > 10 && pinch.d > 10) this.zoom(pinch.d / m.d);
        pinch = m;
      }
    }, opts);
    const end = (e) => {
      for (const t of e.changedTouches) touches.delete(t.identifier);
      pinch = touches.size === 2 ? mid() : null;
    };
    this.root.addEventListener('touchend', end);
    this.root.addEventListener('touchcancel', end);
  }

  orbit(dx, dy) {
    this.goal.yaw -= dx * 0.006;
    this.goal.pitch = Math.min(1.5, Math.max(-0.35, this.goal.pitch + dy * 0.005));
  }

  // move the focus point in the camera's screen plane, by an amount that tracks the zoom
  pan(dx, dy) {
    const k = this.goal.dist * 0.0016;
    const cam = this.camera;
    const right = _v.setFromMatrixColumn(cam.matrixWorld, 0);
    this.goal.target.addScaledVector(right, -dx * k);
    const up = _v.setFromMatrixColumn(cam.matrixWorld, 1);
    this.goal.target.addScaledVector(up, dy * k);
  }

  zoom(f) {
    this.goal.dist = Math.min(750, Math.max(12, this.goal.dist * f));
  }

  recenter() {
    const p = this.game.player;
    this.goal.target.copy(p.pos).setY(p.pos.y + 1);
    this.goal.yaw = p.yaw;
  }

  // ------------------------------------------------------------------ hologram (built on first open)
  build(compile = false) {
    const g = this.game, W = g.world, r = g.renderer;
    this.built = true;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.5, 4000);
    this.visitTex = new THREE.Data3DTexture(this.visit, NX, NY, NZ);
    this.visitTex.format = THREE.RedFormat;
    this.visitTex.minFilter = this.visitTex.magFilter = THREE.LinearFilter;
    this.visitTex.unpackAlignment = 1;
    this.visitTex.needsUpdate = true;
    this.shared = {
      uVisit: { value: this.visitTex },
      uGridMin: { value: GRID_MIN.clone() },
      uGridSize: { value: new THREE.Vector3(NX * CELL, NY * CELL, NZ * CELL) },
      uOrigin: { value: new THREE.Vector3() },
      uTime: { value: 0 },
      uSweep: { value: 0 },
      uSweepOn: { value: 1 },
      uCut: { value: 0 },
    };
    const mk = (frag, extra, opts) => new THREE.ShaderMaterial({ uniforms: { ...this.shared, uEntered: { value: 1 }, uHi: { value: 0 }, ...extra }, vertexShader: VERT, fragmentShader: frag, ...opts });
    const glow = { transparent: true, blending: add, depthWrite: false };

    // one look per area: a translucent fill, outlines in front, and fainter outlines seen through walls
    this.areas = {};
    const edgeGeos = {};
    const boxes = {};
    for (const m of W.staticGroup.children) {
      const region = m.userData.region;
      if (!region || !AREAS[region]) continue;
      if (!this.areas[region]) {
        const color = new THREE.Color(AREAS[region].color).multiplyScalar(AREAS[region].gain);
        const uniforms = { uColor: { value: color }, uEntered: { value: 1 }, uHi: { value: 0 } };
        this.areas[region] = {
          uniforms,
          fill: mk(FILL_FRAG, uniforms, glow),
          front: mk(EDGE_FRAG, { ...uniforms, uBright: { value: 0.62 } }, glow),
          back: mk(EDGE_FRAG, { ...uniforms, uBright: { value: 0.14 } }, { ...glow, depthFunc: THREE.GreaterDepth }),
          // depth only, pushed back a little, so outlines on the near faces win and hidden ones draw faint
          depthMat: mk(DEPTH_FRAG, uniforms, { colorWrite: false, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 }),
          depth: [],
        };
        edgeGeos[region] = [];
        boxes[region] = new THREE.Box3();
      }
      const A = this.areas[region];
      const depth = new THREE.Mesh(m.geometry, A.depthMat);
      depth.renderOrder = 0;
      const fill = new THREE.Mesh(m.geometry, A.fill);
      fill.renderOrder = 1;
      A.depth.push(depth);
      this.scene.add(depth, fill);
      edgeGeos[region].push(new THREE.EdgesGeometry(m.geometry, 30));
      m.geometry.computeBoundingBox();
      boxes[region].union(m.geometry.boundingBox);
    }
    for (const [region, geos] of Object.entries(edgeGeos)) {
      const merged = mergeGeometries(geos, false);
      geos.forEach((e) => e.dispose());
      const A = this.areas[region];
      const front = new THREE.LineSegments(merged, A.front);
      front.renderOrder = 3;
      const back = new THREE.LineSegments(merged, A.back);
      back.renderOrder = 4;
      this.scene.add(front, back);
      // area name, floating over the middle of the area
      const b = boxes[region], c = b.getCenter(new THREE.Vector3());
      // (the Prism Core is right under the Hub, so its name hangs below it)
      A.below = region === 'prism';
      A.anchor = A.below ? new THREE.Vector3(c.x, b.min.y, c.z) : new THREE.Vector3(c.x, Math.min(b.max.y, c.y + 18) + 4, c.z);
      A.labelEl = this.label(`<b>${AREAS[region].name}</b><small></small>`, 'area');
      A.labelEl.style.setProperty('--ac', '#' + new THREE.Color(AREAS[region].color).getHexString());
      A.subEl = A.labelEl.querySelector('small');
      A.labelEl.classList.toggle('below', A.below);
    }

    // hazards (lava, acid, spikes…) get warning stripes
    const hz = W.solids.filter((s) => s.static && s.hazard).map((s) => {
      const size = _v.subVectors(s.max, s.min);
      return new THREE.BoxGeometry(size.x, size.y, size.z).translate((s.min.x + s.max.x) / 2, (s.min.y + s.max.y) / 2, (s.min.z + s.max.z) / 2);
    });
    if (hz.length) {
      const hm = new THREE.Mesh(mergeGeometries(hz, false), mk(HAZARD_FRAG, { uColor: { value: new THREE.Color(0xff5a1a) } }, glow));
      hm.renderOrder = 2;
      this.scene.add(hm);
    }

    // charting progress per area counts the cells holding walkable tops (floors, platforms, ledges)
    this.floorCells = {};
    for (const s of W.solids) {
      if (!s.static || s.hazard || s.kind === 'wall' || s.kind === 'ceil') continue;
      for (let x = s.min.x + 1; x <= s.max.x; x += CELL)
        for (let z = s.min.z + 1; z <= s.max.z; z += CELL) {
          _v.set(Math.min(x, s.max.x - 0.5), s.max.y + 1, Math.min(z, s.max.z - 0.5));
          const c = this.cellOf(_v), region = regionOf(_v);
          if (c < 0 || !AREAS[region]) continue;
          (this.floorCells[region] ??= new Set()).add(c);
        }
    }

    this.buildMarkers();
    this.buildCompass();

    // the backdrop: last game frame, dimmed and blurred
    this.bgMat = new THREE.ShaderMaterial({
      uniforms: { tSnap: { value: null }, uRes: { value: new THREE.Vector2() }, uOpen: { value: 0 }, uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: BG_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.bgMat);
    bg.frustumCulled = false;
    this.bgScene = new THREE.Scene();
    this.bgScene.add(bg);

    const target = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType });
    this.composer = new EffectComposer(r, target);
    this.composer.setPixelRatio(g.composer._pixelRatio);
    this.composer.addPass(new RenderPass(this.bgScene, new THREE.Camera()));
    const holo = new RenderPass(this.scene, this.camera);
    holo.clear = false;
    holo.clearDepth = true;
    this.composer.addPass(holo);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.6, 0.4, 0.3);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.size = [innerWidth, innerHeight];

    this.goal = { target: new THREE.Vector3(), yaw: 0, pitch: 1, dist: START_DIST };
    this.view = { target: new THREE.Vector3(), yaw: 0, pitch: 1, dist: START_DIST };
    if (compile) {
      r.compile(this.scene, this.camera);
      r.compile(this.bgScene, this.camera);
    }
  }

  // a compass ring around the focus point, north (-z) marked, so "the west door" means something
  buildCompass() {
    const pts = [], seg = 128;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      pts.push(Math.cos(a0), 0, Math.sin(a0), Math.cos(a1), 0, Math.sin(a1));
    }
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2, l = i % 18 === 0 ? 0.12 : i % 6 === 0 ? 0.06 : 0.03;
      pts.push(Math.cos(a), 0, Math.sin(a), Math.cos(a) * (1 - l), 0, Math.sin(a) * (1 - l));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.compass = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x9bf6ff, transparent: true, opacity: 0.3, blending: add, depthTest: false, depthWrite: false }));
    this.compass.renderOrder = 5;
    this.scene.add(this.compass);
    this.compassTags = [['N', 0, -1], ['E', 1, 0], ['S', 0, 1], ['W', -1, 0]].map(([t, x, z]) => ({ el: this.label(t, 'compass' + (t === 'N' ? ' north' : '')), dir: new THREE.Vector3(x, 0, z) }));
  }

  buildMarkers() {
    const W = this.game.world;
    const glowTex = spriteTex('glow'), ringTex = spriteTex('ring');
    const top = (o, order = 10) => {
      o.renderOrder = order;
      o.traverse((c) => c.material && Object.assign(c.material, { depthTest: false, depthWrite: false, transparent: true, toneMapped: false }));
      return o;
    };
    const sprite = (tex, color, size, opacity = 1) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, blending: add, opacity }));
      s.scale.setScalar(size);
      return s;
    };
    this.scaled = []; // markers drawn at a constant size on screen
    this.markers = new THREE.Group();
    this.scene.add(this.markers);

    // you: a chevron pointing where you face, a pulsing ring and a halo
    const shape = new THREE.Shape();
    shape.moveTo(0, 2.6);
    shape.lineTo(1.7, -1.7);
    shape.lineTo(0, -0.7);
    shape.lineTo(-1.7, -1.7);
    shape.closePath();
    const arrowGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.35, bevelEnabled: false }).rotateX(-Math.PI / 2);
    const you = (this.you = new THREE.Group());
    you.add(new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9bf6ff) })));
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(arrowGeo), new THREE.LineBasicMaterial({ color: new THREE.Color(0x40e8ff).multiplyScalar(4) }));
    outline.scale.setScalar(1.18);
    you.add(outline);
    this.youRing = new THREE.Mesh(new THREE.RingGeometry(2.6, 2.9, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x9bf6ff, blending: add, side: THREE.DoubleSide }));
    you.add(this.youRing);
    // a thin plumb line so you can tell how high up you are
    const plumb = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -8, 0)]);
    you.add(new THREE.Line(plumb, new THREE.LineBasicMaterial({ color: 0x9bf6ff, blending: add, opacity: 0.6 })));
    this.markers.add(top(you, 13));
    this.scaled.push(you);

    // the objective: a column of light with a spinning diamond over it
    const beam = (this.beam = new THREE.Group());
    this.beamMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color() }, uTime: this.shared.uTime },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: BEAM_FRAG,
      blending: add,
      side: THREE.DoubleSide,
    });
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1, 24, 1, true).translate(0, 0.5, 0), this.beamMat);
    this.beamCol = col;
    beam.add(col);
    this.beamGem = new THREE.Mesh(new THREE.OctahedronGeometry(1.1, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true }));
    this.beamGem.scale.set(1, 1.6, 1);
    beam.add(this.beamGem);
    this.beamRing = new THREE.Mesh(new THREE.RingGeometry(1.6, 2, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, blending: add, side: THREE.DoubleSide }));
    beam.add(this.beamRing);
    this.beamGlow = sprite(glowTex, 0xffffff, 2.6, 0.4);
    beam.add(this.beamGlow);
    this.markers.add(top(beam, 12));
    this.scaled.push(beam);
    this.beamLabel = this.label('OBJECTIVE', 'goal');

    // checkpoints (the active one is your save point)
    this.checkpoints = W.entities.filter((e) => e instanceof Checkpoint).map((cp) => {
      const grp = new THREE.Group();
      grp.position.copy(cp.pos).setY(cp.pos.y + 1);
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.8, 0), new THREE.MeshBasicMaterial({ color: 0x5fd3a0 }));
      gem.scale.set(1, 1.5, 1);
      const halo = sprite(glowTex, 0x5fd3a0, 1.6, 0.3);
      const ring = sprite(ringTex, 0x9bf6ff, 4.5);
      grp.add(gem, halo, ring);
      this.markers.add(top(grp, 11));
      this.scaled.push(grp);
      return { cp, grp, gem, halo, ring };
    });

    // color gates: secret doors and permanent color locks (the regenerating puzzle panels aren't gates)
    this.gates = W.entities.filter((e) => e instanceof Barrier && (e.kind === 'door' || (e.kind === 'wall' && !e.regen && e.max.y - e.min.y >= 2.5))).map((b) => {
      const grp = new THREE.Group();
      const size = new THREE.Vector3().subVectors(b.max, b.min).max(new THREE.Vector3(0.6, 0.6, 0.6));
      grp.position.addVectors(b.min, b.max).multiplyScalar(0.5);
      const c = new THREE.Color(COLORS[b.color].hex);
      const box = new THREE.BoxGeometry(size.x, size.y, size.z);
      grp.add(new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: c, blending: add, opacity: 0.55 })));
      grp.add(new THREE.LineSegments(new THREE.EdgesGeometry(box), new THREE.LineBasicMaterial({ color: c.clone().multiplyScalar(3) })));
      const icon = new THREE.Group();
      icon.position.y = size.y / 2 + 1.2;
      icon.add(sprite(ringTex, c, 2.2), sprite(glowTex, c, 1.8, 0.5));
      grp.add(icon);
      this.markers.add(top(grp, 11));
      return { b, grp, icon };
    });

    // the chroma cores still on their pedestals
    this.cores = W.entities.filter((e) => e instanceof Pickup && e.type === 'color').map((p) => {
      const grp = new THREE.Group();
      grp.position.copy(p.pos);
      const c = new THREE.Color(COLORS[p.color].hex);
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(2.5) }));
      gem.scale.set(1, 1.4, 1);
      const cage = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.OctahedronGeometry(1.7, 0)), new THREE.LineBasicMaterial({ color: c.clone().multiplyScalar(3) }));
      grp.add(gem, cage, sprite(glowTex, c, 3, 0.4));
      this.markers.add(top(grp, 12));
      this.scaled.push(grp);
      const el = this.label(`${COLORS[p.color].name} CORE`, 'core');
      el.style.setProperty('--ac', COLORS[p.color].css);
      return { p, grp, gem, cage, el };
    });
  }

  // ------------------------------------------------------------------ open / close
  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  open() {
    const g = this.game;
    if (this.isOpen || g.state !== 'playing' || g.rulesPaused) return;
    if (!this.built) this.build();
    this.isOpen = true;
    this.closing = false;
    this.t = 0;
    g.state = 'map';
    g.input.mouseDown = false;
    this.drag = null;
    this.snapped = false;
    this.refresh();
    // open over where you are, looking the way you face, a little zoomed in so it can pull out
    this.recenter();
    this.goal.pitch = 1.0;
    this.goal.dist = START_DIST;
    this.view.target.copy(this.goal.target);
    Object.assign(this.view, { yaw: this.goal.yaw, pitch: this.goal.pitch, dist: this.goal.dist });
    this.root.classList.remove('hidden', 'show', 'closing');
    void this.root.offsetWidth; // restart the CSS entrance
    this.root.classList.add('show');
    document.body.classList.add('map-open');
    ads.safe(true);
    audio.prefetch(['map_open', 'map_close']);
    if (!audio.sample('map_open', { gain: 0.8, vary: 0 })) {
      audio.sample('ui_click', { gain: 0.5, rate: 0.8 });
      audio.tone({ type: 'sine', f: 160, f2: 640, dur: 0.45, gain: 0.12, attack: 0.05 });
      audio.tone({ type: 'triangle', f: 320, f2: 1280, dur: 0.3, gain: 0.05, attack: 0.02, delay: 0.05 });
      audio.noise({ dur: 0.45, gain: 0.05, freq: 600, f2: 4000, q: 2 });
    }
    this.startHum();
    this.update(0); // pose the camera and markers for this frame's render
  }

  // A soft projector hum while the map is open (raw oscillators: the game's loop sounds are muted
  // whenever gameplay isn't running).
  startHum() {
    const ctx = audio.ctx;
    if (!ctx || !audio.sfxBus || this.hum) return;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.gain.setTargetAtTime(0.03, ctx.currentTime, 0.2);
    out.connect(audio.sfxBus);
    const nodes = [[55, 'sine', 0.6], [110.4, 'sine', 0.3], [220.7, 'triangle', 0.06]].map(([f, type, level]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type;
      o.frequency.value = f;
      g.gain.value = level;
      o.connect(g).connect(out);
      o.start();
      return o;
    });
    // a slow shimmer on top
    const lfo = ctx.createOscillator(), depth = ctx.createGain();
    lfo.frequency.value = 0.4;
    depth.gain.value = 0.01;
    lfo.connect(depth).connect(out.gain);
    lfo.start();
    this.hum = { out, nodes: [...nodes, lfo] };
  }

  stopHum() {
    if (!this.hum) return;
    const t = audio.ctx.currentTime;
    this.hum.out.gain.cancelScheduledValues(t);
    this.hum.out.gain.setTargetAtTime(0, t, 0.06);
    this.hum.nodes.forEach((o) => o.stop(t + 0.5));
    this.hum = null;
  }

  // Close with the reverse scan; toPause (the pointer lock was dropped, i.e. Esc) goes straight to
  // the pause menu instead.
  close(toPause = false) {
    if (!this.isOpen) return;
    if (toPause) {
      this.finishClose();
      return this.game.pause();
    }
    if (this.closing) return;
    this.closing = true;
    this.stopHum();
    this.ct = 0;
    this.root.classList.add('closing');
    if (!audio.sample('map_close', { gain: 0.8, vary: 0 })) {
      audio.tone({ type: 'sine', f: 640, f2: 140, dur: 0.3, gain: 0.1, attack: 0.02 });
      audio.noise({ dur: 0.25, gain: 0.04, freq: 3000, f2: 500, q: 2 });
    }
  }

  finishClose() {
    const g = this.game;
    this.isOpen = false;
    this.closing = false;
    this.stopHum();
    this.root.classList.add('hidden');
    document.body.classList.remove('map-open');
    g.state = 'playing';
    g.input.mouseDown = false;
    ads.safe(false);
    this.flush(true);
  }

  // Everything that can change between openings: fog, which areas are known, markers, panels.
  refresh() {
    const g = this.game, here = regionOf(g.player.pos);
    this.here = here;
    for (const [region, A] of Object.entries(this.areas)) {
      const known = this.entered.has(region) || region === here;
      A.uniforms.uEntered.value = known ? 1 : 0;
      A.uniforms.uHi.value = region === here ? 1 : 0;
      A.depth.forEach((m) => (m.visible = known));
      A.labelEl.classList.toggle('unknown', !known);
      A.labelEl.classList.toggle('here', region === here);
      A.subEl.textContent = region === here ? 'YOU ARE HERE' : known ? `${this.percent(region)}% CHARTED` : 'UNCHARTED';
      A.labelEl._w = 0;
    }
    // save point and checkpoints you've come across
    const save = g.checkpoint?.ref;
    for (const k of this.checkpoints) {
      const isSave = k.cp === save;
      k.grp.visible = isSave || (k.cp.used ?? false) || this.chartedAt(k.cp.pos) > 0;
      const c = isSave ? 0x9bf6ff : 0x5fd3a0;
      k.gem.material.color.set(c).multiplyScalar(isSave ? 1.6 : 0.9);
      k.halo.material.color.set(c);
      k.ring.visible = isSave;
      k.isSave = isSave;
    }
    // gates you've seen (and the Hub's, which you see from the start); broken ones are open
    for (const k of this.gates) k.grp.visible = !k.b.broken && (this.chartedAt(k.grp.position) > 0 || regionOf(k.grp.position) === 'hub');
    for (const k of this.cores) {
      const on = k.p.active && g.world.entities.includes(k.p) && !(g.blaster.has && g.blaster.unlocked[k.p.color]);
      k.grp.visible = on;
      k.el.style.display = on ? '' : 'none';
    }
    // objective
    const goal = currentObjective(g);
    this.objEl.innerHTML = goal.html || 'Explore.';
    const tgt = this.objectiveTarget(goal);
    this.beam.visible = !!tgt;
    this.beamLabel.style.display = tgt ? '' : 'none';
    if (tgt) {
      this.beam.position.copy(tgt.pos);
      _c.set(tgt.color);
      this.beamMat.uniforms.uColor.value.copy(_c);
      this.beamGem.material.color.copy(_c).multiplyScalar(3);
      this.beamRing.material.color.copy(_c);
      this.beamGlow.material.color.copy(_c);
      this.beamLabel.style.setProperty('--ac', '#' + _c.getHexString());
    }
    // panels
    const A = AREAS[here];
    this.areaEl.textContent = A.name;
    this.root.style.setProperty('--area', '#' + new THREE.Color(A.color).getHexString());
    let have = 0, all = 0;
    this.areasEl.innerHTML = Object.entries(AREAS)
      .map(([region, a]) => {
        const known = this.entered.has(region) || region === here;
        const pct = known ? this.percent(region) : 0;
        const cells = this.floorCells[region]?.size || 0;
        have += (pct / 100) * cells;
        all += cells;
        const css = '#' + new THREE.Color(a.color).getHexString();
        return `<div class="map-sector${region === here ? ' here' : ''}${known ? '' : ' unknown'}" style="--ac:${css}"><span>${a.name}</span><b>${known ? pct + '%' : '--'}</b><i style="width:${pct}%"></i></div>`;
      })
      .join('');
    this.chartedEl.textContent = `WORLD CHARTED ${all ? Math.round((have / all) * 100) : 0}%`;
  }

  // How much of an area's walkable ground is charted. The odd unreachable ledge shouldn't stop a
  // thorough player from seeing 100%, so 90% of it counts as all.
  percent(region) {
    const cells = this.floorCells[region];
    if (!cells?.size) return 0;
    let n = 0;
    for (const c of cells) if (this.visit[c]) n++;
    return Math.min(100, Math.round((n / cells.size / 0.9) * 100));
  }

  // Where the objective beacon stands: the Hub door to take, else the core of the world you're in,
  // the way back to the Hub, or the Warden's arena.
  objectiveTarget(goal) {
    const g = this.game, b = g.blaster, where = regionOf(g.player.pos);
    const corePos = (c) => this.cores.find((k) => k.p.color === c && k.grp.visible)?.p.pos;
    if (goal.door && DOORS[goal.door]) {
      const d = DOORS[goal.door];
      return { pos: new THREE.Vector3(d.pos[0], 4, d.pos[1]), color: d.color === null ? 0xffffff : COLORS[d.color].hex };
    }
    if (!goal.html) return null;
    if (!b.has) {
      const p = corePos(RED);
      return p && { pos: p.clone(), color: COLORS[RED].hex };
    }
    const next = [YELLOW, GREEN, BLUE].find((c) => !b.unlocked[c]);
    if (next !== undefined && where === CORE_AREA[next]) {
      const p = corePos(next);
      if (p) return { pos: p.clone(), color: COLORS[next].hex };
    }
    if (next === undefined && where === 'prism') {
      const t = g.level.bossTrigger;
      return t && { pos: t.min.clone().add(t.max).multiplyScalar(0.5).setY(t.min.y), color: 0xffffff };
    }
    if (where !== 'hub') {
      // the way back to the Hub: the Foundry's north door, or a world's return port onto the balcony
      const ports = PORTALS.filter((P) => (P.a === where && P.b === 'hub') || (P.b === where && P.a === 'hub'));
      const P = where === 'red' ? ports[0] : ports[ports.length - 1];
      if (P) return { pos: new THREE.Vector3(P.p[0], P.p[1] - 1.6, P.p[2]), color: 0x9bf6ff };
    }
    return null;
  }

  // ------------------------------------------------------------------ per frame (only while open)
  update(dt) {
    const g = this.game, inp = g.input;
    this.time = (this.time || 0) + dt;
    let k;
    if (this.closing) {
      this.ct += dt;
      if (this.ct >= CLOSE_TIME) return this.finishClose();
      k = 1 - ease(this.ct / CLOSE_TIME);
    } else {
      this.t += dt;
      k = ease(this.t / OPEN_TIME);
      // (not on the frame it opened: that M press is still down)
      if (this.t > 0 && (inp.hit('KeyM') || inp.hit('Escape'))) this.close();
      if (inp.hit('Space')) this.recenter();
    }
    if (innerWidth !== this.size[0] || innerHeight !== this.size[1]) this.resize();

    // keyboard: arrows orbit, WASD pan along the ground, R/F up and down, +/- zoom
    const key = (c) => inp.down(c);
    const goal = this.goal;
    const turn = (key('ArrowLeft') ? -1 : 0) + (key('ArrowRight') ? 1 : 0);
    const tilt = (key('ArrowUp') ? 1 : 0) + (key('ArrowDown') ? -1 : 0);
    if (turn || tilt) this.orbit(turn * dt * 260, tilt * dt * 200);
    const fwd = (key('KeyW') ? 1 : 0) - (key('KeyS') ? 1 : 0), side = (key('KeyD') ? 1 : 0) - (key('KeyA') ? 1 : 0);
    const lift = (key('KeyR') ? 1 : 0) - (key('KeyF') ? 1 : 0);
    if (fwd || side || lift) {
      const sp = goal.dist * 0.9 * dt, s = Math.sin(this.view.yaw), c = Math.cos(this.view.yaw);
      goal.target.x += (-s * fwd + c * side) * sp;
      goal.target.z += (-c * fwd - s * side) * sp;
      goal.target.y += lift * sp * 0.6;
    }
    if (key('Equal') || key('NumpadAdd')) this.zoom(Math.exp(-dt * 1.5));
    if (key('Minus') || key('NumpadSubtract')) this.zoom(Math.exp(dt * 1.5));

    // camera eases toward the controls
    const v = this.view, a = 1 - Math.exp(-dt * 12);
    v.target.lerp(goal.target, a);
    v.yaw += (goal.yaw - v.yaw) * a;
    v.pitch += (goal.pitch - v.pitch) * a;
    v.dist += (goal.dist - v.dist) * a;
    const dist = v.dist * (0.6 + 0.4 * k);
    const cam = this.camera;
    cam.position.set(Math.sin(v.yaw) * Math.cos(v.pitch), Math.sin(v.pitch), Math.cos(v.yaw) * Math.cos(v.pitch)).multiplyScalar(dist).add(v.target);
    cam.lookAt(v.target);
    cam.updateMatrixWorld();

    // scan-in sweep from the player, shared shader clock
    const p = g.player;
    const sh = this.shared;
    sh.uTime.value = this.time;
    sh.uOrigin.value.copy(p.pos);
    sh.uCut.value = p.pos.y + 6;
    sh.uSweep.value = 4 + k * 520;
    sh.uSweepOn.value = k < 1 ? 1 : 0;
    this.bgMat.uniforms.uOpen.value = k;
    this.bgMat.uniforms.uTime.value = this.time;
    this.bloom.strength = 0.6 * k * Math.min(1, Math.max(0.45, 140 / dist)); // dense far views glow less

    // markers keep a steady size on screen as you zoom
    const s = Math.min(9, Math.max(0.3, dist / START_DIST)) * (0.4 + 0.6 * k);
    for (const o of this.scaled) o.scale.setScalar(s);
    const t = this.time;
    this.you.position.copy(p.pos).setY(p.pos.y + 0.6);
    this.you.rotation.y = p.yaw;
    const pulse = (t * 1.2) % 1;
    this.youRing.scale.setScalar(0.6 + pulse * 1.8);
    this.youRing.material.opacity = 1 - pulse;
    this.you.children[0].material.color.setRGB(0.6, 0.95, 1).multiplyScalar(0.8 + Math.sin(t * 6) * 0.25);
    if (this.beam.visible) {
      this.beamCol.scale.set(1, 26 / s + 10, 1);
      this.beamGem.position.y = 26 / s + 12 + Math.sin(t * 2.4) * 0.6;
      this.beamGem.rotation.y = t * 1.6;
      this.beamGlow.position.y = this.beamGem.position.y;
      const bp = (t * 0.9) % 1;
      this.beamRing.scale.setScalar(0.5 + bp * 2.2);
      this.beamRing.material.opacity = 1 - bp;
    }
    for (const c of this.checkpoints) if (c.isSave) c.ring.material.opacity = 0.5 + 0.5 * Math.sin(t * 4);
    for (const c of this.cores) {
      c.gem.rotation.y = t * 1.8;
      c.cage.rotation.y = -t * 0.7;
      c.cage.rotation.x = t * 0.4;
    }
    for (const gt of this.gates) gt.icon.scale.setScalar(s * (0.9 + 0.1 * Math.sin(t * 4)));
    this.compass.position.copy(v.target).setY(v.target.y - 1);
    this.compass.scale.setScalar(dist * 0.42 * (0.7 + 0.3 * k));
    this.compass.material.opacity = 0.3 * k;
    this.placeLabels();
  }

  // Project the floating labels to the screen; most important first, and a label that would land on
  // one already placed is nudged up above it.
  placeLabels() {
    const w = innerWidth, h = innerHeight, cam = this.camera, placed = [];
    const put = (el, pos, dy = 0, below = false) => {
      _v.copy(pos).project(cam);
      if (_v.z > 1 || Math.abs(_v.x) > 1.3 || Math.abs(_v.y) > 1.3) return (el.style.visibility = 'hidden');
      el.style.visibility = '';
      const ew = (el._w ||= el.offsetWidth), eh = (el._h ||= el.offsetHeight);
      const r = { x: ((_v.x + 1) / 2) * w - ew / 2, y: ((1 - _v.y) / 2) * h + dy - (below ? 0 : eh), w: ew, h: eh };
      for (let i = 0; i < 8; i++) {
        const o = placed.find((q) => r.x < q.x + q.w && r.x + r.w > q.x && r.y < q.y + q.h && r.y + r.h > q.y);
        if (!o) break;
        r.y = o.y - r.h - 2;
      }
      placed.push(r);
      el.style.transform = `translate(${r.x}px, ${r.y}px)`;
    };
    for (const c of this.compassTags) put(c.el, _v.copy(c.dir).multiplyScalar(this.compass.scale.x * 1.07).add(this.compass.position), 6, true);
    if (this.beam.visible) put(this.beamLabel, _v.copy(this.beamGem.position).multiplyScalar(this.beam.scale.x).add(this.beam.position), -14);
    for (const c of this.cores) if (c.grp.visible) put(c.el, c.grp.position, -26);
    const areas = Object.entries(this.areas).sort(([a], [b]) => (b === this.here) - (a === this.here) || this.entered.has(b) - this.entered.has(a));
    for (const [, A] of areas) put(A.labelEl, A.anchor, A.below ? 8 : 0, A.below);
  }

  resize() {
    this.size = [innerWidth, innerHeight];
    this.composer.setSize(innerWidth, innerHeight);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.snapped = false; // the frozen game frame no longer fits: take it again
  }

  // Instead of the game's composer: on the first frame, render the game once and keep that frame as the
  // backdrop, then draw the hologram over it with its own bloom.
  render() {
    const r = this.game.renderer;
    if (!this.snapped) {
      this.game.composer.render();
      const size = r.getDrawingBufferSize(new THREE.Vector2());
      if (!this.snap || this.snap.image.width !== size.x || this.snap.image.height !== size.y) {
        this.snap?.dispose();
        this.snap = new THREE.FramebufferTexture(size.x, size.y);
      }
      r.copyFramebufferToTexture(this.snap);
      this.bgMat.uniforms.tSnap.value = this.snap;
      this.bgMat.uniforms.uRes.value.copy(size);
      this.snapped = true;
    }
    const tm = r.toneMapping;
    r.toneMapping = THREE.NoToneMapping; // keep the hologram's neon unfiltered
    this.composer.render();
    r.toneMapping = tm;
  }
}
