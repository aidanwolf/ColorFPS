// AZURE — THE RIG and THE WAVE (called from azure.js).
//   · The harvest rig round the Rim Deck: four great legs plunging to the trench floor (foam and spray
//     where the swell breaks on them), a derrick, a helipad, a crane, a flare stack burning over the sea, a
//     navigation beacon on the hull, buoys riding the swell; and a DIVE LINE with two air bells from the
//     rig down to the Aquarium's airlock (the way back down if you ever come out here again).
//   · THE ROGUE WAVE: the first time you step out onto the deck, a beat of storm and sea, then a rumble,
//     the sea draws back from the legs and a colossal wave rises out of the north. It slams the deck, the
//     world goes white and you're flung off into the sea, tumbling, sinking; black; a heartbeat... and you
//     wake on the trench floor far below, light rippling far overhead, with a little air left and the
//     Aquarium's lit hatch a short swim away. It plays once (a saved flag); after it the wake-up spot is
//     the checkpoint, and a respawn there gives you the same breath to make the swim on.
import * as THREE from 'three';
import { audio } from '../audio.js';
import { AIR_MAX } from '../player.js';
import { SEA_Y, swellY } from './azureOcean.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _v = V(0, 0, 0), _w = V(0, 0, 0);
export const WAVE_FLAG = 'evt:azure:wave';
export const WAKE_AIR = 11; // seconds of air you wake with
audio.manifest?.then(() => audio.prefetch(['rogue_wave', 'underwater_plunge', 'waves_crash', 'temple_rumble', 'leviathan_splash', 'heartbeat', 'thunder', 'impact_death', 'door_slam']));

// the rogue wave's cross-section: [forward, up] in units of its height (it travels toward +forward)
const PROFILE = [[-3.2, 0], [-2.0, 0.12], [-1.1, 0.42], [-0.45, 0.8], [-0.1, 0.97], [0.12, 1.02], [0.3, 0.96], [0.42, 0.8], [0.44, 0.66], [0.34, 0.6], [0.2, 0.5], [0.1, 0.32], [0.06, 0.15], [0.14, 0]];

export function buildRig(B, { zone, hab, ocean, wake, trench }) {
  const { W, game, level } = B;
  const st = level.azure;
  const rust = hab.rustMat, rib = hab.ribMat;
  const paint = new THREE.MeshStandardMaterial({ color: 0xd8c040, metalness: 0.5, roughness: 0.5 });
  const white = new THREE.MeshStandardMaterial({ color: 0xe8ecef, metalness: 0.3, roughness: 0.5 });
  const red = new THREE.MeshStandardMaterial({ color: 0xc23a2a, metalness: 0.4, roughness: 0.55 });
  const lampM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff0c0).multiplyScalar(2) });
  const redLamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3020).multiplyScalar(2) });
  const parts = new Map(); // material -> geometries
  const put = (m, g) => {
    if (!parts.has(m)) parts.set(m, []);
    parts.get(m).push(g.index ? g.toNonIndexed() : g);
  };
  const rod = (m, a, b, r, seg = 8) => {
    const A = V(...a), Bv = V(...b), d = V().subVectors(Bv, A), len = d.length();
    const g = new THREE.CylinderGeometry(r, r, len, seg);
    g.applyMatrix4(new THREE.Matrix4().compose(A.clone().add(Bv).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize()), V(1, 1, 1)));
    put(m, g);
  };
  const FLOOR = -66;

  // ------------------------------------------------------------------ the legs (solid: the sea foams round them)
  const legs = [[42.6, -102.6], [59.4, -102.6], [42.6, -121.4], [59.4, -119.6]];
  for (const [x, z] of legs) {
    rod(rust, [x, FLOOR - 1, z], [x, 2.6, z], 1.15, 12);
    W.addSolid(V(x - 1.1, FLOOR - 1, z - 1.1), V(x + 1.1, 2.4, z + 1.1), { static: true, kind: 'metal' });
    for (let y = SEA_Y - 30; y < 0; y += 12) put(rib, new THREE.TorusGeometry(1.3, 0.12, 5, 14).rotateX(Math.PI / 2).translate(x, y, z));
  }
  // cross-bracing between the legs, in bays down to the Aquarium's roofs
  for (let y = -6; y > -40; y -= 14) {
    for (let i = 0; i < 4; i++) {
      const [ax, az] = legs[i], [bx, bz] = legs[[1, 3, 0, 2][i]];
      rod(rust, [ax, y, az], [bx, y - 12, bz], 0.32);
      rod(rust, [bx, y, bz], [ax, y - 12, az], 0.32);
      rod(rust, [ax, y, az], [bx, y, bz], 0.4);
    }
  }
  // the deck's underside girders
  for (const z of [-104.2, -112, -119.8]) rod(rust, [42.6, 1.2, z], [59.4, 1.2, z], 0.45);

  // ------------------------------------------------------------------ the derrick (its own platform south-east)
  W.box(60, 4, -100, 72, 5, -88, 'floor', zone);
  W.deco(60.2, 0.5, -99.8, 71.8, 4, -88.2, 'metal', zone);
  for (const [x, z] of [[61, -99], [71, -99], [61, -89], [71, -89]]) {
    rod(rust, [x, FLOOR - 1, z], [x, 4, z], 0.8, 10);
    W.addSolid(V(x - 0.8, FLOOR - 1, z - 0.8), V(x + 0.8, 4, z + 0.8), { static: true, kind: 'metal' });
  }
  {
    const cx = 66, cz = -94, b = 3.4, top = 34, tw = 0.9;
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const [sx, sz] of corners) rod(paint, [cx + sx * b, 5, cz + sz * b], [cx + sx * tw, top, cz + sz * tw], 0.16, 6);
    for (let y = 8; y < top; y += 3.6) {
      const k0 = (y - 5) / (top - 5), k1 = Math.min(1, (y + 3.6 - 5) / (top - 5));
      const r0 = b + (tw - b) * k0, r1 = b + (tw - b) * k1;
      for (let i = 0; i < 4; i++) {
        const [ax, az] = corners[i], [bx, bz] = corners[(i + 1) % 4];
        rod(paint, [cx + ax * r0, y, cz + az * r0], [cx + bx * r0, y, cz + bz * r0], 0.08, 4);
        rod(paint, [cx + ax * r0, y, cz + az * r0], [cx + bx * r1, Math.min(top, y + 3.6), cz + bz * r1], 0.06, 4);
      }
    }
    put(white, new THREE.BoxGeometry(2.6, 1.6, 2.6).translate(cx, top + 0.8, cz));
    put(redLamp, new THREE.SphereGeometry(0.35, 8, 6).translate(cx, top + 2, cz));
    put(white, new THREE.BoxGeometry(5, 3, 4).translate(cx + 2.5, 6.5, cz + 3.5)); // the doghouse
  }

  // ------------------------------------------------------------------ the helipad (north-east, a little higher)
  W.box(60, 6, -128, 74, 7, -112, 'floor', zone);
  // (its north legs stand on the Generator Hall's roof; the south ones go down to the floor)
  for (const [x, z, y0] of [[61, -127, -41], [73, -127, -41], [61, -113, FLOOR - 1], [73, -113, FLOOR - 1]]) {
    rod(rust, [x, y0, z], [x, 6, z], 0.9, 10);
    W.addSolid(V(x - 0.9, y0, z - 0.9), V(x + 0.9, 6, z + 0.9), { static: true, kind: 'metal' });
  }
  {
    const cx = 67, cz = -120;
    put(white, new THREE.RingGeometry(5.6, 6.2, 32).rotateX(-Math.PI / 2).translate(cx, 7.02, cz));
    put(white, new THREE.BoxGeometry(0.7, 0.03, 5).translate(cx - 1.6, 7.02, cz));
    put(white, new THREE.BoxGeometry(0.7, 0.03, 5).translate(cx + 1.6, 7.02, cz));
    put(white, new THREE.BoxGeometry(2.6, 0.03, 0.7).translate(cx, 7.02, cz));
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      put(k % 2 ? lampM : redLamp, new THREE.SphereGeometry(0.16, 6, 4).translate(cx + Math.cos(a) * 6.6, 7.15, cz + Math.sin(a) * 6.6));
    }
    // safety netting rails round its rim
    for (const [a, b] of [[[60, 7.4, -128], [74, 7.4, -128]], [[60, 7.4, -112], [74, 7.4, -112]], [[60, 7.4, -128], [60, 7.4, -112]], [[74, 7.4, -128], [74, 7.4, -112]]]) rod(paint, a, b, 0.08, 4);
  }
  // a walkway on stilts from the deck's north-east corner to the helipad (decorative: rails close it off)
  rod(rust, [58, 3, -118], [62, 6, -118], 0.3);

  // ------------------------------------------------------------------ the crane on the deck's north rail
  {
    const x = 56.8, z = -119.1;
    rod(paint, [x, 4, z], [x, 12.5, z], 0.45, 10);
    put(paint, new THREE.BoxGeometry(2.2, 1.6, 2.2).translate(x, 13, z));
    rod(paint, [x, 13.4, z], [x + 16, 19, z - 9], 0.3, 6);
    rod(rib, [x + 16, 19, z - 9], [x + 16, 9, z - 9], 0.04, 4); // the hook line
    put(red, new THREE.BoxGeometry(0.8, 0.8, 0.8).translate(x + 16, 8.8, z - 9));
  }

  // ------------------------------------------------------------------ the flare stack: a boom out over the sea, burning
  const flareTip = V(40, 16, -136);
  rod(rust, [44, 4.5, -120], [flareTip.x, flareTip.y - 0.5, flareTip.z], 0.5, 8);
  rod(rust, [44, 1, -121], [flareTip.x + 1, flareTip.y - 2, flareTip.z + 2], 0.25, 6);
  const flameMat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uT; varying vec2 vUv;
      float h1(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h1(i), h1(i + vec2(1,0)), f.x), mix(h1(i + vec2(0,1)), h1(i + vec2(1,1)), f.x), f.y); }
      void main(){
        vec2 p = vUv - vec2(0.5, 0.0);
        float n = vn(vec2(p.x * 6.0, vUv.y * 4.0 - uT * 5.0)) * 0.6 + vn(vec2(p.x * 13.0, vUv.y * 9.0 - uT * 9.0)) * 0.4;
        float w = (1.0 - vUv.y) * 0.42 + 0.05;
        float a = smoothstep(w, w * 0.2, abs(p.x + (n - 0.5) * 0.25 * vUv.y)) * smoothstep(1.0, 0.25, vUv.y + (n - 0.5) * 0.3) * smoothstep(0.0, 0.08, vUv.y);
        vec3 c = mix(vec3(1.6, 1.3, 0.7), vec3(1.4, 0.35, 0.05), smoothstep(0.1, 0.8, vUv.y));
        gl_FragColor = vec4(c * a, a);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
  const flame = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 8).translate(0, 4, 0), flameMat);
  flame.position.copy(flareTip);
  flame.raycast = () => {};
  W.scene.add(flame);

  // ------------------------------------------------------------------ the beacon on the hull, sweeping
  const beaconPos = V(114, 15, -150);
  W.box(112, 14, -152, 116, 15, -148, 'metal', zone);
  rod(white, [114, 15, -150], [114, 22, -150], 0.6, 10);
  put(redLamp, new THREE.CylinderGeometry(0.7, 0.7, 1.2, 10).translate(114, 22.6, -150));
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff2c8, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
  const beam = new THREE.Mesh(new THREE.ConeGeometry(3.5, 70, 14, 1, true).rotateZ(Math.PI / 2).translate(35, 0, 0), beamMat);
  beam.position.set(114, 22.6, -150);
  beam.raycast = () => {};
  W.scene.add(beam);
  void beaconPos;

  // ------------------------------------------------------------------ buoys riding the swell
  const buoys = [];
  const buoyMat = new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.5, emissive: 0x401000 });
  for (const [x, z, s] of [[61, -104, 1], [82, -96, 0.8], [48, -140, 0.8], [96, -128, 0.9], [74, -170, 0.8], [100, -60, 0.9], [44, -70, 0.7]]) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.6 * s, 0.9 * s, 1.4 * s, 10), buoyMat);
    const cage = new THREE.Mesh(new THREE.ConeGeometry(0.4 * s, 1.2 * s, 4), rib);
    cage.position.y = 1.2 * s;
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.18 * s, 6, 4), lampM);
    lamp.position.y = 1.9 * s;
    g.add(body, cage, lamp);
    g.traverse((o) => (o.raycast = () => {}));
    g.position.set(x, SEA_Y, z);
    W.scene.add(g);
    buoys.push({ g, x, z, ph: Math.random() * 6 });
  }

  // ------------------------------------------------------------------ the dive line: rig to airlock, two bells on it
  const dl = st.diveLine = [[61, SEA_Y + 0.3, -104], [58, -24.5, -94], [53, -42.5, -82], [49, -58.6, -84.6]];
  hab.airBell(58, -22, -94, { yaw: Math.PI });
  hab.airBell(53, -40, -82, { yaw: Math.PI });
  hab.trail([[61, SEA_Y - 1, -104], [58, -25.5, -94]], { step: 2.6 });
  hab.trail([[58, -26.8, -94], [53, -43.5, -82]], { step: 2.6 });
  hab.trail([[53, -44.8, -82], [49, -58.6, -84.2]], { step: 2.6 });
  rod(rib, dl[0], [58, -22, -94], 0.05, 4);
  rod(rib, [58, -25.2, -94], [53, -40, -82], 0.05, 4);
  rod(rib, [53, -43.2, -82], [49, -57, -84.6], 0.05, 4);
  W.deco(57.6, 3.98, -109, 58, 4.04, -104, 'hazard', zone); // the gap in the deck's east rail: the dive point
  B.hint([54, 4, -109], [58, 7, -104], 'The <b>dive line</b>: a long way down, but the line has <b>air bells</b> on it all the way to the Aquarium.', 5);

  // ------------------------------------------------------------------ merge
  for (const [m, list] of parts) {
    const g = mergeAll(list);
    const mesh = new THREE.Mesh(g, m);
    mesh.matrixAutoUpdate = false;
    mesh.raycast = () => {};
    mesh.userData.noCull = true; // (the rig spans the whole water column: seen from the deck and from below)
    W.scene.add(mesh);
  }

  // ================================================================== THE ROGUE WAVE
  const H = 40; // m above the sea at its crest
  const WAVE_YAW = -0.36; // it comes out of the north-north-east, between the helipad and the Nexus (the view you're turned to face)
  const waveMat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uH: { value: H }, uHor: { value: game.sky?.material.uniforms.uHor.value || V(0.6, 0.75, 0.85) }, uFade: { value: 1 } },
    vertexShader: `uniform float uT, uH; varying vec3 vW; varying float vUp; varying float vFace; attribute vec2 aPro;
      void main(){
        vec3 p = position;
        // the crest ripples and curls unevenly along its length
        float r = sin(p.x * 0.05 + uT * 0.8) * 0.06 + sin(p.x * 0.13 - uT * 1.3) * 0.03;
        p.y *= 1.0 + r;
        p.z += r * uH * 0.5 * aPro.y;
        vec4 w = modelMatrix * vec4(p, 1.0);
        vW = w.xyz; vUp = aPro.y; vFace = aPro.x;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `uniform float uT, uFade; uniform vec3 uHor; varying vec3 vW; varying float vUp; varying float vFace;
      float h1(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h1(i), h1(i + vec2(1,0)), f.x), mix(h1(i + vec2(0,1)), h1(i + vec2(1,1)), f.x), f.y); }
      void main(){
        // a dark green-black wall of water, glassy turquoise where the light shines through the thin crest,
        // a churning white lip, foam streaks dragged down its face
        vec3 deep = vec3(0.004, 0.035, 0.05), glass = vec3(0.06, 0.48, 0.46);
        vec3 c = mix(deep, glass, smoothstep(0.5, 0.95, vUp) * (vFace > 0.0 ? 1.0 : 0.5));
        float streak = vn(vec2(vW.x * 0.09, vW.y * 0.04 - uT * 1.4)) * vn(vec2(vW.x * 0.35, vW.y * 0.15 + uT * 1.1));
        float lip = smoothstep(0.86, 1.0, vUp) * (0.7 + 0.3 * vn(vec2(vW.x * 0.2, uT * 2.0))) + smoothstep(0.45, 0.85, streak) * 0.55 * smoothstep(0.1, 0.7, vUp);
        lip += smoothstep(0.2, 0.0, vUp) * 0.8; // the boiling foot of it
        c = mix(c, vec3(0.92, 0.97, 1.0), clamp(lip, 0.0, 1.0));
        float dist = distance(cameraPosition, vW);
        c = mix(c, uHor, smoothstep(120.0, 420.0, dist) * 0.5);
        gl_FragColor = vec4(c, uFade);
      }`,
    side: THREE.DoubleSide, fog: false, transparent: true,
  });
  // the wave's mesh: the profile swept along x (400 m), y and z scaled by its height
  const wave = (() => {
    const L = 420, segX = 120, pos = [], pro = [], idx = [];
    for (let i = 0; i <= segX; i++) {
      const x = -L / 2 + (L * i) / segX;
      for (const [f, u] of PROFILE) {
        pos.push(x, u, f);
        pro.push(f > 0.2 && u > 0.3 ? 1 : -1, u);
      }
    }
    const n = PROFILE.length;
    for (let i = 0; i < segX; i++) for (let j = 0; j < n - 1; j++) {
      const a = i * n + j, b = (i + 1) * n + j;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aPro', new THREE.Float32BufferAttribute(pro, 2));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, waveMat);
    m.frustumCulled = false;
    m.userData.noCull = true;
    m.visible = false;
    m.renderOrder = 1;
    m.raycast = () => {};
    W.scene.add(m);
    return m;
  })();

  // a white-out over the screen at the impact (spray), then the sea's blue
  let veil = null;
  const setVeil = (a, color = '#ffffff') => {
    if (!veil) {
      veil = document.createElement('div');
      veil.id = 'azure-veil';
      Object.assign(veil.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '4', opacity: '0', transition: 'none' });
      document.body.appendChild(veil);
    }
    veil.style.background = color;
    veil.style.opacity = String(a);
  };
  const setBlur = (px, dim = 1) => {
    const el = game.renderer.domElement;
    el.style.filter = px > 0.05 || dim < 0.999 ? `blur(${px.toFixed(2)}px) brightness(${dim.toFixed(3)})` : '';
  };

  const T_LOCK = 1.4, T_HIT = 5.2, T_SPLASH = 6.5, T_BLACK = 7.6, T_WAKE = 9.8, T_UP = 13.2;
  const deckStart = V(), flungTo = V(50, SEA_Y - 0.5, -86), wakeAt = V(...wake.pos);
  const ride = {
    t: 0, phase: 'off', yaw0: 0, roll: 0,
    // Player.update's mount hook: the rest of your frame belongs to the wave
    carry(p, dt) {
      const t = this.t, cam = p.camera;
      p.vel.set(0, 0, 0);
      p.grounded = t < T_HIT;
      p.fallTop = p.pos.y;
      p.fallSpeed = 0;
      p.sprinting = false;
      p.launched = false;
      p.safeTimer = 0;
      p.invuln = 1;
      let roll = 0, eye = p.eye, pitch = p.pitch, yaw = p.yaw;
      if (t < T_HIT) {
        // braced on the deck: your view is drawn round to the wave, staggering in the shudder
        const k = Math.min(1, (t - T_LOCK) / 1.4);
        const d = Math.atan2(Math.sin(WAVE_YAW - p.yaw), Math.cos(WAVE_YAW - p.yaw)); // (turned to face it)
        yaw = p.yaw = p.yaw + d * Math.min(1, dt * 2.2);
        pitch = p.pitch = p.pitch + (0.16 * smoothK(Math.min(1, (t - T_LOCK) / 3)) - p.pitch) * Math.min(1, dt * 2);
        roll = Math.sin(t * 7) * 0.03 * k;
      } else if (t < T_SPLASH) {
        // flung off the deck, tumbling
        const k = (t - T_HIT) / (T_SPLASH - T_HIT);
        p.pos.lerpVectors(deckStart, flungTo, k);
        p.pos.y += Math.sin(k * Math.PI) * 6 - k * k * 2;
        roll = k * Math.PI * 2.4;
        pitch = Math.sin(k * 9) * 0.9;
        yaw = this.yaw0 + k * 1.8;
      } else if (t < T_WAKE) {
        // under: dragged down in the churn, the light fading overhead
        const k = (t - T_SPLASH) / (T_WAKE - T_SPLASH);
        p.pos.y = flungTo.y - k * 9;
        roll = Math.PI * 2.4 + k * 1.2 + Math.sin(t * 3) * 0.2;
        pitch = 0.6 + Math.sin(t * 2.1) * 0.3;
        yaw = this.yaw0 + 1.8 + k * 0.8;
        p.headUnder = true;
        if (Math.random() < dt * 30) W.fx.bubbles?.(_v.set(p.pos.x + (Math.random() - 0.5) * 2, p.pos.y + 1.2, p.pos.z + (Math.random() - 0.5) * 2), 3);
      } else {
        // waking on the sand: lying on your back looking up at the light, then rising
        const k = smoothK(Math.min(1, (t - T_WAKE - 0.6) / (T_UP - T_WAKE - 0.8)));
        p.pos.copy(wakeAt);
        eye = 0.35 + (1.61 - 0.35) * k;
        p.eye = eye;
        pitch = 1.25 * (1 - k) + p.pitch * k;
        roll = 0.45 * (1 - k);
        yaw = p.yaw;
        p.headUnder = true;
        p.swimming = true;
        p.air = WAKE_AIR;
      }
      cam.position.set(p.pos.x, p.pos.y + eye, p.pos.z);
      const sh = p.shake * p.shake * 0.5;
      if (sh > 0) cam.position.add(_w.set((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh));
      cam.rotation.set(pitch, yaw, roll, 'YXZ');
      p.shake = Math.max(0, p.shake - dt * 1.5);
    },
  };
  const smoothK = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
  st.waveDone = () => game.clearedEncounters?.has(WAVE_FLAG);
  let rumble = null;
  W.trigger([45, 3.5, -120], [58, 8, -104], () => {
    if (st.waveDone() || ride.phase !== 'off') return;
    ride.phase = 'rise';
    ride.t = 0;
    audio.slam?.(0.12, 9, 3);
    rumble = audio.sample(audio.sfxOr('rogue_wave', 'temple_rumble'), { gain: 1.1, vary: 0 });
    if (!audio.available?.has('rogue_wave')) audio.sample('thunder_far', { gain: 0.8, vary: 0, delay: 0.6, rate: 0.7 });
    game.hud.message('The sea is <b>pulling back</b> from the rig\'s legs…', 3);
    wave.visible = true;
  }, { once: false });

  W.add({
    update(dt, player) {
      const t0 = ocean.t.value;
      flameMat.uniforms.uT.value = t0;
      flame.lookAt(game.camera.position.x, flame.position.y, game.camera.position.z);
      beam.rotation.y = t0 * 0.6;
      for (const b of buoys) {
        const y = swellY(b.x, b.z, t0);
        b.g.position.y = SEA_Y - ocean.drop + y * (1 - 0.5 * (ride.phase === 'rise' ? 1 : 0));
        b.g.rotation.z = Math.sin(t0 * 0.9 + b.ph) * 0.12;
        b.g.rotation.x = Math.cos(t0 * 0.7 + b.ph) * 0.1;
      }
      // spray where the swell breaks on the legs (only near you, above water)
      const cam = game.camera.position;
      if (cam.y > SEA_Y && cam.x > 30 && Math.random() < dt * 6) {
        const [x, z] = legs[Math.floor(Math.random() * legs.length)];
        if (Math.hypot(cam.x - x, cam.z - z) < 70) W.fx.burst(_v.set(x + (Math.random() - 0.5) * 2.5, SEA_Y + swellY(x, z, t0) + 0.3, z + (Math.random() - 0.5) * 2.5), 0xe8f6ff, { count: 6, speed: 4.5, life: 1.1, size: 0.35, gravity: 7, spread: 0.9, dir: _w.set(0, 1, 0) });
      }
      if (ride.phase === 'off') return;
      ride.t += dt;
      const t = ride.t;
      waveMat.uniforms.uT.value = t0;
      // the sea draws back, the wave comes on out of the north, growing as it shoals
      ocean.drop = Math.min(3.2, t * 1.2) * (t < T_HIT ? 1 : Math.max(0, 1 - (t - T_HIT) * 2));
      const k = Math.min(1, t / T_HIT);
      // it runs in along the line you're turned to face, from 420 m out to the deck
      const dist = (1 - Math.pow(k, 1.15)) * 420 - 4;
      const h = H * (0.35 + 0.65 * k);
      const c = ride.phase === 'rise' ? player.pos : deckStart;
      wave.rotation.y = WAVE_YAW;
      wave.position.set(c.x - Math.sin(WAVE_YAW) * dist, SEA_Y - 2, c.z - Math.cos(WAVE_YAW) * dist);
      wave.scale.set(1, h, h);
      // spray torn off the crest as it closes
      if (k > 0.75 && Math.random() < dt * 30) W.fx.burst(_v.set(c.x - Math.sin(WAVE_YAW) * (dist - 2) + (Math.random() - 0.5) * 40, SEA_Y + h * 0.95, c.z - Math.cos(WAVE_YAW) * (dist - 2) + (Math.random() - 0.5) * 10), 0xffffff, { count: 8, speed: 6, life: 1.2, size: 0.9, gravity: 5, spread: 0.8, dir: _w.set(-Math.sin(WAVE_YAW), 0.6, -Math.cos(WAVE_YAW)).multiplyScalar(-1) });
      if (t > T_LOCK && ride.phase === 'rise') {
        ride.phase = 'brace';
        deckStart.copy(player.pos);
        ride.yaw0 = player.yaw;
        player.mount = ride;
        game.hud.message('<b>Brace!</b>', 2);
      }
      if (ride.phase === 'brace') {
        player.shake = Math.max(player.shake, 0.15 + k * 0.5);
        deckStart.copy(player.pos);
      }
      if (t > T_HIT && ride.phase === 'brace') {
        ride.phase = 'hit';
        ride.yaw0 = player.yaw;
        setVeil(1);
        player.shake = 1.4;
        audio.sample('waves_crash', { gain: 1.3, vary: 0 });
        audio.sample('impact_death', { gain: 0.5, vary: 0, rate: 0.7 });
        for (let i = 0; i < 6; i++) W.fx.burst(_v.copy(player.pos).add(_w.set((Math.random() - 0.5) * 8, 2 + Math.random() * 3, (Math.random() - 0.5) * 8)), 0xffffff, { count: 14, speed: 9, life: 1.2, size: 0.6, gravity: 4, spread: 1 });
      }
      if (ride.phase === 'hit') {
        const kk = (t - T_HIT) / (T_SPLASH - T_HIT);
        // white, then the sea's churning blue-green
        setVeil(kk < 0.35 ? 1 : 1 - (kk - 0.35) * 0.9, kk < 0.35 ? '#ffffff' : '#bfe8f0');
        wave.position.x += dt * 25 * Math.sin(WAVE_YAW);
        wave.position.z += dt * 25 * Math.cos(WAVE_YAW);
        if (t > T_SPLASH) {
          ride.phase = 'sink';
          wave.visible = false;
          setVeil(0.55, '#1a6a7a');
          audio.sample(audio.sfxOr('underwater_plunge', 'leviathan_splash'), { gain: 1.1, vary: 0 });
          W.fx.splash?.(_v.copy(player.pos), 22);
        }
      }
      if (ride.phase === 'sink') {
        const kk = (t - T_SPLASH) / (T_BLACK - T_SPLASH);
        setVeil(Math.max(0, 0.55 - kk * 0.55), '#1a6a7a');
        if (t > T_BLACK) {
          ride.phase = 'black';
          game.hud.fade(1, 1.6);
          audio.sample('heartbeat', { gain: 0.8, vary: 0, delay: 1.2 });
          audio.sample('heartbeat', { gain: 0.7, vary: 0, delay: 2.4 });
        }
      }
      if (ride.phase === 'black' && t > T_WAKE) {
        // the wake-up: on the trench floor, the checkpoint (and the flag) saved here
        ride.phase = 'wake';
        setVeil(0);
        ocean.drop = 0;
        game.clearedEncounters?.add(WAVE_FLAG);
        player.pos.copy(wakeAt);
        player.yaw = wake.yaw;
        player.pitch = 0;
        game.setCheckpoint(wakeAt, wake.yaw, null);
        player.air = WAKE_AIR;
        game.hud.fade(0, 2.6);
        game.setAtmosphere('azureSea');
      }
      if (ride.phase === 'wake') {
        const kk = Math.min(1, (t - T_WAKE) / 3.4);
        setBlur(9 * (1 - kk), 0.55 + 0.45 * kk);
        if (t > T_UP) {
          ride.phase = 'off';
          setBlur(0);
          player.mount = null;
          player.air = WAKE_AIR;
          player.vel.set(0, 0, 0);
          game.hud.message('<b>Air!</b> Swim for the <b>lit hatch</b> — follow the lights. <b>Space</b> rises, <b>C</b> dives, <b>Shift</b> swims faster.', 7);
        }
      }
    },
  });
  void rumble;
  void trench;
  return { wave, ride };
}

function mergeAll(list) {
  for (const g of list) {
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
  }
  return mergeGeometries(list, false);
}
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
