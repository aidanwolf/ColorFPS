// AZURE — THE TURBINE FIELD and the machines of the deep (called from azure.js).
//   · THE TURBINE: a colossal intake pump lying on the trench floor north of the crossing (the swim from
//     the Generator Hall's sea door to the hull), its mouth a ring of pulsing blue-white light behind a
//     grille, a rotor turning in its throat, silt streaming into it. Every ~10 s it PULSES: the rings flare,
//     it groans, and for three seconds the sea round the crossing rushes into its mouth faster than you
//     can swim. Caught in the open, you're dragged into the grille (and thrown back to your checkpoint).
//     Shelter: press up against the two sunken wrecks between the route and the mouth, or breathe in the
//     air bell between them; or hose the BYPASS VALVE on the first wreck and the pull drops away for a
//     while. Past the second wreck its exhaust runs east along the hull: ride it to the tunnel.
//     The Azure Engine's death (the Intake) stops it all.
//   · THE MACHINES: a harvester sub, tens of metres long, gliding down the trench overhead; a pipe-layer
//     crawling out over the north lip trailing new pipeline into the dark; a half-built turbine ring in the
//     abyss to the south with welding drones sparking round it. Ambient: no collision, no AI.
//   buildTurbine(B, { zone, hab, currents, trench }) → { pulse (0..1), bypass, stop() }
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BLUE } from '../colors.js';
import { audio } from '../audio.js';
import { addCaustics, SEA_Y } from './azureOcean.js';
import { FLOOR_Y } from './azureTrench.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _v = V(0, 0, 0), _w = V(0, 0, 0);
audio.manifest?.then(() => audio.prefetch(['reactor_hum', 'rotor_turn', 'titan_charge', 'titan_groan_big', 'titan_groan', 'servo_heavy', 'hydraulic_hiss', 'turbine_pulse', 'turbine_loop', 'seabed_machine', 'leviathan_groan', 'drone_servo']));

// the turbine's geometry: mouth (grille) at z MOUTH facing +z (south, toward the crossing), axis along z
const TX = 96, TY = -55.5, TR = 10.2, MOUTH = -158, REAR = -194;
const CYCLE = 10, CALM = 4.5, RAMP = 1, PULL = 3; // seconds
export const TURBINE = { x: TX, y: TY, r: TR, mouth: MOUTH };

export function buildTurbine(B, { zone, hab, currents, trench }) {
  const { W, game, level } = B;
  const st = { pulse: 0, bypass: 0, t: 0, down: false };
  const parts = new Map();
  const put = (m, g) => {
    if (!parts.has(m)) parts.set(m, []);
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k);
    if (!n.attributes.normal) n.computeVertexNormals();
    parts.get(m).push(n);
  };
  const hullM = addCaustics(new THREE.MeshStandardMaterial({ color: 0x5d6f72, metalness: 0.75, roughness: 0.45 }), 0.9, { weather: true });
  const darkM = addCaustics(new THREE.MeshStandardMaterial({ color: 0x1a2226, metalness: 0.7, roughness: 0.5 }), 0.6);
  const throatM = new THREE.MeshBasicMaterial({ color: 0x02080c });
  const ringM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9ff4ff).multiplyScalar(1.6) });
  const lampM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff2c8).multiplyScalar(2) });
  const zAx = (g) => g.rotateX(Math.PI / 2);

  // ------------------------------------------------------------------ THE TURBINE
  // housing: a great cylinder, banded, flaring into a bell-mouth intake
  put(hullM, zAx(new THREE.CylinderGeometry(TR, TR, MOUTH - REAR, 32, 1, true)).translate(TX, TY, (MOUTH + REAR) / 2));
  put(hullM, zAx(new THREE.CylinderGeometry(TR + 2.4, TR, 4, 32, 1, true)).translate(TX, TY, MOUTH + 2)); // the bell mouth
  put(darkM, new THREE.TorusGeometry(TR + 2.4, 0.6, 8, 40).translate(TX, TY, MOUTH + 4));
  for (let z = MOUTH - 4; z > REAR; z -= 6) put(darkM, new THREE.TorusGeometry(TR + 0.3, 0.45, 6, 36).translate(TX, TY, z));
  put(darkM, new THREE.CircleGeometry(TR, 32).rotateY(Math.PI).translate(TX, TY, REAR)); // the rear cap
  put(throatM, zAx(new THREE.CylinderGeometry(TR * 0.98, 2, 22, 32, 1, true)).translate(TX, TY, MOUTH - 11)); // the throat narrowing into the dark
  // the grille over the mouth: radial bars and rings
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    put(darkM, new THREE.BoxGeometry(0.35, TR + 2.2, 0.35).translate(0, (TR + 2.2) / 2, 0).rotateZ(a).translate(TX, TY, MOUTH + 3.4));
  }
  for (const r of [3, 6.5, 10]) put(darkM, new THREE.TorusGeometry(r, 0.18, 5, 40).translate(TX, TY, MOUTH + 3.4));
  // feet and saddles on the trench floor, and the harvest mains running from its rear into the hull
  for (const z of [MOUTH - 6, (MOUTH + REAR) / 2, REAR + 5]) {
    put(darkM, new THREE.BoxGeometry(TR * 2.4, 5, 3).translate(TX, FLOOR_Y + 2, z));
    for (const s of [-1, 1]) put(hullM, new THREE.BoxGeometry(2.5, TY - FLOOR_Y, 2.5).translate(TX + s * TR * 0.85, (TY + FLOOR_Y) / 2, z));
  }
  for (const [y, z] of [[-50, REAR + 8], [-60, REAR + 14]]) {
    put(hullM, new THREE.CylinderGeometry(1.4, 1.4, 112 - (TX + TR), 14).rotateZ(Math.PI / 2).translate((TX + TR + 112) / 2, y, z));
    for (let x = TX + TR + 2; x < 112; x += 3) put(darkM, new THREE.TorusGeometry(1.55, 0.18, 5, 14).rotateY(Math.PI / 2).translate(x, y, z));
  }
  // work lights on its crown
  for (const z of [MOUTH - 3, MOUTH - 16, REAR + 4]) put(lampM, new THREE.SphereGeometry(0.5, 8, 6).translate(TX, TY + TR + 0.4, z));
  // its colliders (a box round the housing, and the grille: the intake itself is a trigger)
  W.addSolid(V(TX - TR, FLOOR_Y, REAR), V(TX + TR, TY + TR, MOUTH - 1.5), { static: true, kind: 'metal' });
  W.addSolid(V(TX - TR - 2.6, TY - TR - 2.6, MOUTH - 1.5), V(TX + TR + 2.6, TY + TR + 2.6, MOUTH + 2.6), { static: true, kind: 'metal' });
  // the glowing intake rings (their own materials: they flare with each pulse)
  const glowRings = [];
  for (const [r, z, w] of [[TR + 1.9, MOUTH + 3.9, 0.22], [TR - 0.2, MOUTH + 1.2, 0.18], [TR * 0.7, MOUTH - 1, 0.14], [TR * 0.4, MOUTH - 3, 0.12]]) {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7fe8ff), fog: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, w, 6, 48), m);
    ring.position.set(TX, TY, z);
    ring.raycast = () => {};
    ring.userData.noCull = true;
    W.scene.add(ring);
    glowRings.push(m);
  }
  // the rotor turning in its throat
  const rotor = new THREE.Group();
  {
    const blades = [];
    for (let k = 0; k < 9; k++) blades.push(new THREE.BoxGeometry(1.6, TR * 0.88, 0.25).translate(0, TR * 0.46, 0).rotateY(0.5).rotateZ((k / 9) * Math.PI * 2));
    blades.push(new THREE.SphereGeometry(2.2, 14, 10).scale(1, 1, 1.6));
    const m = new THREE.Mesh(mergeGeometries(blades.map((g) => g.toNonIndexed())), darkM);
    m.raycast = () => {};
    rotor.add(m);
    rotor.position.set(TX, TY, MOUTH - 4.5);
    rotor.userData.noCull = true;
    W.scene.add(rotor);
  }
  // the light falling out of the mouth into the silt
  const coneM = new THREE.MeshBasicMaterial({ color: 0x9ff4ff, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const cone = new THREE.Mesh(zAx(new THREE.CylinderGeometry(TR + 2, TR * 2.2, 26, 32, 1, true)).translate(TX, TY, MOUTH + 16), coneM);
  cone.raycast = () => {};
  cone.userData.noCull = true;
  W.scene.add(cone);
  // silt and motes streaming into the mouth (one draw: a shader moves them along their paths)
  const SILT = 420;
  const sg = new THREE.BufferGeometry();
  const seeds = new Float32Array(SILT * 4);
  for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
  sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SILT * 3), 3));
  sg.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  const siltU = { uT: { value: 0 }, uPull: { value: 0 }, uScale: { value: 300 }, uPhase: { value: 0 } };
  const silt = new THREE.Points(sg, new THREE.ShaderMaterial({
    uniforms: siltU,
    vertexShader: `uniform float uT, uPull, uScale, uPhase; attribute vec4 aSeed; varying float vA;
      void main(){
        // each mote starts out in the water in front of the mouth and is drawn in along a curve
        float ph = fract(aSeed.w + uPhase * (0.25 + aSeed.z * 0.2));
        float a = aSeed.x * 6.2831, r0 = 4.0 + aSeed.y * 18.0;
        vec3 start = vec3(${TX.toFixed(1)} + cos(a) * r0, ${TY.toFixed(1)} + sin(a) * r0 * 0.7, ${MOUTH.toFixed(1)} + 6.0 + aSeed.z * 24.0);
        vec3 end = vec3(${TX.toFixed(1)}, ${TY.toFixed(1)}, ${(MOUTH - 4).toFixed(1)});
        float k = ph * ph;
        vec3 p = mix(start, end, k);
        p.x += sin(ph * 12.0 + a) * (1.0 - k) * 0.8;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_PointSize = clamp((1.0 + aSeed.y * 2.0) * uScale * 0.02 / max(-mv.z, 0.5), 1.0, 6.0);
        vA = smoothstep(0.0, 0.15, ph) * (1.0 - smoothstep(0.85, 1.0, ph)) * (0.35 + uPull * 0.65) * smoothstep(70.0, 20.0, -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `varying float vA; void main(){ float r = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(0.75, 0.95, 1.0) * smoothstep(0.5, 0.0, r) * vA, 1.0); }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  silt.frustumCulled = false;
  silt.userData.noCull = true;
  silt.raycast = () => {};
  W.scene.add(silt);

  // ------------------------------------------------------------------ the crossing's wrecks, valve and exhaust
  // two sunken barge sections between the swim route (z -146) and the mouth: press up against them while
  // the turbine pulls
  const SZ = -146, SY = -56;
  for (const [x1, x2, h] of [[84.5, 90.5, 10.5], [99.5, 105.5, 9.5]]) {
    B.W.box(x1, FLOOR_Y, -151.6, x2, FLOOR_Y + h, -149, 'metal', zone);
    B.W.deco(x1 + 0.3, FLOOR_Y + h, -151.3, x2 - 0.3, FLOOR_Y + h + 0.5, -149.3, 'metal', zone);
    B.W.deco(x1 - 0.02, FLOOR_Y + h - 1.2, -149.02, x2 + 0.02, FLOOR_Y + h - 0.9, -148.98, 'hazard', zone);
    for (let x = x1 + 1; x < x2; x += 2.2) put(hullM, new THREE.BoxGeometry(0.4, h * 0.8, 0.5).translate(x, FLOOR_Y + h * 0.4, -148.8)); // ribs
  }
  // the BYPASS VALVE on the first wreck's face: hose it and the turbine's pull drops away for 8 s
  const bypass = { activate() { st.bypass = 8; game.hud.message('The bypass valve opens: the turbine\'s pull <b>drops away</b> for a few seconds. <b>Go!</b>', 3); }, deactivate() {} };
  B.colorSwitch({ pos: [87.5, SY - 1.2, -148.9], face: '+z', color: BLUE, mode: 'pulse', size: 1.3, links: [bypass], zone, light: false });
  B.W.deco(86.6, SY - 2.2, -148.95, 88.4, SY - 2.1, -148.9, 'glow1', zone);
  // the shelters' current zones: the pull over the whole crossing, stronger at the mouth (it bends in
  // toward the axis), and the exhaust lane east along the hull that carries you to the tunnel
  const Y1 = FLOOR_Y - 8, Y2 = SEA_Y;
  const zones = {
    pullW: { min: [84.2, Y1, -158], max: [TX, -40, -134], dir: V(0.25, 0, -1).normalize(), k: 1 },
    pullE: { min: [TX, Y1, -158], max: [111.9, -40, -134], dir: V(-0.25, 0, -1).normalize(), k: 1 },
    mouth: { min: [TX - TR - 3, Y1, -158], max: [TX + TR + 3, -40, -152], dir: V(0, 0, -1), k: 1.35 },
    exhaust: { min: [105.6, -60, -148.6], max: [111.9, -50, -143.4], dir: V(1, 0, 0), k: 0 },
  };
  for (const [id, z] of Object.entries(zones)) currents.push({ id, min: z.min, max: z.max, current: [0, 0, 0] });
  hab.trail([[104.5, SY + 1, SZ - 0.5], [111.5, SY + 1.4, SZ]], { step: 1.6, along: 30 });
  // the intake itself: swimming into the grille throws you back to your checkpoint
  let suckedT = 0;
  W.trigger([TX - TR - 2.6, TY - TR - 2.6, MOUTH + 2.4], [TX + TR + 2.6, TY + TR + 2.6, MOUTH + 4.6], () => {
    if (game.voidT || st.down || game.state !== 'playing') return;
    suckedT = 1.2;
    game.player.shake = Math.max(game.player.shake, 1);
    audio.sample('impact_death', { gain: 0.6, rate: 0.6, vary: 0 });
    game.hud.message('The intake had you. <b>Shelter behind the wrecks</b> when it pulses — or hose the <b>bypass valve</b>.', 5);
    game.fallOutOfWorld();
  }, { once: false });
  B.hint([80.6, SY - 2, SZ - 2], [84, SY + 3, SZ + 2], 'The <b>turbine</b> pulses: when its rings flare, the sea rushes into its mouth. <b>Wait it out pressed against a wreck</b>, then swim on.', 7);

  // ------------------------------------------------------------------ THE MACHINES
  // the HARVESTER SUB: a colossal machine gliding down the trench overhead, its lights sweeping the floor
  const sub = (() => {
    const g = new THREE.Group();
    const add = (geo, m, x = 0, y = 0, z = 0) => {
      const o = new THREE.Mesh(geo, m);
      o.position.set(x, y, z);
      o.raycast = () => {};
      g.add(o);
      return o;
    };
    add(zAx(new THREE.CylinderGeometry(5, 5, 46, 20)), hullM);
    add(new THREE.SphereGeometry(5, 20, 12).scale(1, 1, 1.4), hullM, 0, 0, -23);
    add(zAx(new THREE.CylinderGeometry(5, 2.5, 12, 20)), hullM, 0, 0, 29);
    add(new THREE.BoxGeometry(4, 5, 12), darkM, 0, 6, -4);
    for (const s of [-1, 1]) {
      add(new THREE.BoxGeometry(14, 0.8, 5), darkM, s * 10, -1, 8);
      add(zAx(new THREE.CylinderGeometry(2.2, 2.2, 8, 14)), darkM, s * 16, -1, 8);
      add(new THREE.SphereGeometry(0.8, 8, 6), lampM, s * 4, -3.5, -18);
    }
    add(new THREE.BoxGeometry(6, 1, 24), darkM, 0, -5.5, 4); // the harvest boom under its belly
    const beamM = new THREE.MeshBasicMaterial({ color: 0xcfefff, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
    for (const s of [-1, 1]) {
      const b = add(new THREE.ConeGeometry(7, 34, 12, 1, true).translate(0, -17, 0), beamM, s * 4, -3.5, -18);
      b.rotation.x = 0.35;
    }
    g.position.set(TX, -33, -260);
    g.userData.noCull = true;
    W.scene.add(g);
    return { g, t: 0, z: -260, roared: false, hum: null, hg: 0 };
  })();
  // the PIPE-LAYER: crawling out over the north lip, new pipeline unspooling behind it into the dark
  const layer = (() => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(14, 6, 26), addCaustics(new THREE.MeshStandardMaterial({ color: 0xd06a2a, metalness: 0.5, roughness: 0.6 }), 0.8));
    body.position.y = 4;
    g.add(body);
    for (const s of [-1, 1]) {
      const tr = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 28), darkM);
      tr.position.set(s * 7, 1.5, 0);
      g.add(tr);
    }
    const reel = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 10, 16).rotateZ(Math.PI / 2), darkM);
    reel.position.set(0, 9, 4);
    g.add(reel);
    for (const s of [-1, 1]) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), lampM);
      l.position.set(s * 6, 7, -13);
      g.add(l);
    }
    g.traverse((o) => (o.raycast = () => {}));
    g.position.set(70, FLOOR_Y - 1, -214);
    g.userData.noCull = true;
    W.scene.add(g);
    // the pipeline it has laid: from the station's foot out past the lip (instanced segments)
    const seg = new THREE.CylinderGeometry(1.1, 1.1, 6, 12).rotateX(Math.PI / 2);
    const N = 60, im = new THREE.InstancedMesh(seg, hullM, N);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    for (let i = 0; i < N; i++) {
      const z = -186 - i * 6;
      const y = (trench ? trench.floorAt(70, z) : FLOOR_Y) + 0.6;
      im.setMatrixAt(i, m4.compose(_v.set(70, y, z), q, _w.set(1, 1, 1)));
    }
    im.userData.noCull = true;
    im.raycast = () => {};
    W.scene.add(im);
    return { g, reel, t: 0 };
  })();
  // the CONSTRUCTION RIG: a half-built turbine ring in the abyss to the south, drones welding round it
  const rig = (() => {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(16, 2.2, 10, 40, Math.PI * 1.35), hullM);
    ring.rotation.y = Math.PI / 2;
    g.add(ring);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.8, 34, 0.8), darkM);
      strut.position.set(0, Math.sin(a) * 18, Math.cos(a) * 18);
      strut.rotation.x = a;
      g.add(strut);
    }
    const scaf = new THREE.Mesh(new THREE.BoxGeometry(6, 40, 6), new THREE.MeshBasicMaterial({ color: 0x223038, wireframe: true, fog: false }));
    scaf.position.set(0, -10, 22);
    g.add(scaf);
    g.traverse((o) => (o.raycast = () => {}));
    g.position.set(84, -112, 30);
    g.userData.noCull = true;
    W.scene.add(g);
    // welding drones: little lights circling it, flashing white-blue
    const D = 14, dg = new THREE.InstancedMesh(new THREE.SphereGeometry(0.7, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), D);
    dg.userData.noCull = true;
    dg.raycast = () => {};
    W.scene.add(dg);
    return { g, dg, D, t: 0 };
  })();

  // ------------------------------------------------------------------ the clock
  const cam = game.camera.position;
  let loop = null, loopG = 0, warned = false;
  const c0 = new THREE.Color(0x7fe8ff), cHot = new THREE.Color(1.6, 2.2, 2.4);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = V(1, 1, 1);
  game.onPowerDown?.((name) => name === 'azure' && (st.down = true));
  W.add({
    update(dt, player) {
      st.t += dt;
      if (st.down || game.isWorldDown?.('azure')) st.down = true;
      // the pulse: calm, a ramp (the rings flare, it groans), the pull, the ease-off
      const ph = st.t % CYCLE;
      let p = ph < CALM ? 0 : ph < CALM + RAMP ? (ph - CALM) / RAMP : ph < CALM + RAMP + PULL ? 1 : ph < CALM + 2 * RAMP + PULL ? 1 - (ph - CALM - RAMP - PULL) / RAMP : 0;
      if (st.down) p = 0;
      st.bypass = Math.max(0, st.bypass - dt);
      const by = st.bypass > 0 ? 0.2 : 1;
      st.pulse = p * by;
      const near = Math.hypot(cam.x - TX, cam.z - (MOUTH + 10)) < 90 && cam.y < SEA_Y;
      if (near && !st.down && ph >= CALM && ph < CALM + dt * 1.5 && by === 1) {
        audio.sample(audio.sfxOr('turbine_pulse', 'titan_charge'), { gain: 0.7, vary: 0, rate: audio.available?.has('turbine_pulse') ? 1 : 0.55 });
        if (!warned && player.pos.x > 80 && player.pos.x < 112 && Math.abs(player.pos.z - SZ) < 12) {
          warned = true;
          game.hud.message('The turbine is <b>pulling</b>! Get behind a wreck!', 2.5);
        }
      }
      // the currents: a gentle draw in the calm, a torrent in the pull
      const pullK = st.down ? 0 : 0.9 + 10 * st.pulse;
      for (const w of level.azure.sea || []) {
        const z = w.zone && zones[w.zone];
        if (!z) continue;
        if (w.zone === 'exhaust') w.current.copy(z.dir).multiplyScalar(st.down ? 0 : 5.5);
        else w.current.copy(z.dir).multiplyScalar(pullK * z.k);
      }
      // looks: rings flare, the rotor spins up, the cone brightens, silt rushes
      const glow = st.down ? 0.08 : 0.45 + 1.4 * st.pulse + 0.1 * Math.sin(st.t * 3);
      for (const m of glowRings) m.color.copy(c0).lerp(cHot, st.pulse).multiplyScalar(glow);
      coneM.opacity = st.down ? 0 : 0.035 + 0.07 * st.pulse;
      rotor.rotation.z -= dt * (st.down ? 0 : 0.8 + 6 * st.pulse);
      siltU.uT.value = st.t;
      siltU.uPull.value = st.pulse;
      siltU.uPhase.value += dt * (st.down ? 0 : 0.15 + 0.9 * st.pulse);
      siltU.uScale.value = game.renderer.domElement.height / 2;
      silt.visible = cam.y < SEA_Y && !st.down;
      // its hum (a stand-in until turbine_loop exists)
      const d = Math.hypot(cam.x - TX, cam.y - TY, cam.z - MOUTH);
      const want = st.down || cam.x < 26 ? 0 : (d < 140 ? 0.32 * (1 - d / 140) : 0) * (0.6 + 0.6 * st.pulse);
      loopG += (want - loopG) * Math.min(1, dt * 3);
      if (!loop && loopG > 0.01) loop = audio.createLoop(audio.sfxOr('turbine_loop', 'reactor_hum'), { gain: 0, rate: audio.available?.has('turbine_loop') ? 1 : 0.35 });
      loop?.setGain(loopG);
      loop?.setRate?.(audio.available?.has('turbine_loop') ? 1 : 0.35 + 0.15 * st.pulse);
      suckedT = Math.max(0, suckedT - dt);
      // the harvester sub glides down the trench overhead (every ~110 s), lights sweeping the floor
      const here = cam.x > 25 && cam.y < SEA_Y + 30;
      sub.g.visible = here;
      if (here) {
        sub.t += dt;
        const cyc = sub.t % 110;
        sub.z = -280 + cyc * 3.2;
        sub.g.position.set(TX, -33 + Math.sin(sub.t * 0.2) * 0.6, sub.z);
        sub.g.rotation.z = Math.sin(sub.t * 0.15) * 0.03;
        const sd = Math.hypot(cam.x - TX, cam.y + 33, cam.z - sub.z);
        if (sd < 45 && !sub.roared && cam.y < SEA_Y) {
          sub.roared = true;
          audio.sample(audio.sfxOr('harvester_pass', 'titan_groan_big'), { gain: 0.65, vary: 0, rate: 0.6 });
        }
        if (cyc < 1) sub.roared = false;
        const sw = sd < 120 ? 0.25 * (1 - sd / 120) : 0;
        sub.hg += (sw - sub.hg) * Math.min(1, dt * 2);
        if (!sub.hum && sub.hg > 0.01) sub.hum = audio.createLoop(audio.sfxOr('seabed_machine', 'servo_heavy'), { gain: 0, rate: 0.4 });
        sub.hum?.setGain(sub.hg);
      } else sub.hum?.setGain(0);
      // the pipe-layer inches north and back; its reel turns
      layer.t += dt;
      layer.g.position.z = -214 - (layer.t * 0.4) % 30;
      layer.reel.rotation.x -= dt * 0.5;
      layer.g.visible = here;
      // the welding drones circle the half-built ring, flashing
      rig.t += dt;
      rig.g.visible = here;
      for (let i = 0; i < rig.D; i++) {
        const a = rig.t * (0.3 + (i % 3) * 0.1) + i * 1.7, r = 17 + (i % 4) * 1.5;
        m4.compose(_v.set(84 + Math.sin(a * 1.3) * 3, -112 + Math.sin(a) * r, 30 + Math.cos(a) * r), q, one.setScalar(Math.sin(rig.t * 23 + i * 7) > 0.6 ? 1.6 : 0.7));
        rig.dg.setMatrixAt(i, m4);
      }
      rig.dg.instanceMatrix.needsUpdate = true;
      rig.dg.visible = here;
    },
  });
  // ---- merge the static pieces
  for (const [m, list] of parts) {
    const mesh = new THREE.Mesh(mergeGeometries(list, false), m);
    mesh.matrixAutoUpdate = false;
    mesh.raycast = () => {};
    mesh.userData.noCull = true;
    W.scene.add(mesh);
  }
  return st;
}
