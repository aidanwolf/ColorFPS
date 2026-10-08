// STAGE III · THE SUNSCORCH — Solar's echo: an open sand court ringed by mesas under a vast, churning sun,
// the Warden crowned with a halo of mirrors.
//   · SUN LANCES: the Warden calls the sun down in patterns (a rain round you, a cross through you, a
//     closing ring) — glowing circles first, then columns of sunfire.
//   · THE INCINERATOR: it plants itself and opens its chest; a low beam of focused sunlight sweeps round
//     the court — jump it as it passes. Its core (yellow) is exposed the whole time.
//   · quicksand pools swallow anyone who steps in; four obelisks give cover from its orbs.
//   · weak points: yellow limb plates; the core while it fires the beam or kneels.
import * as THREE from 'three';
import { rectMinus } from '../hub.js';
import { audio } from '../../audio.js';
import { LiquidPlane } from './hazards.js';

const C = { x: 760, z: -260 };
const R = 30; // the court is -R..R
const SUN_DIR = new THREE.Vector3(-0.8, 0.42, -0.3).normalize();
const BEAM_LEN = 38, BEAM_TOP = 0.9, BEAM_BOTTOM = 0.12;
const _v = new THREE.Vector3();
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// sand: warm grain and wind ripples
function sandTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#c99a5c';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) {
    const v = 150 + Math.random() * 80;
    g.fillStyle = `rgba(${v},${v * 0.78},${v * 0.5},0.25)`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 1.5);
  }
  g.strokeStyle = 'rgba(120,80,40,0.18)';
  g.lineWidth = 3;
  for (let y = 0; y < 256; y += 18) {
    g.beginPath();
    for (let x = 0; x <= 256; x += 8) g.lineTo(x, y + Math.sin((x / 256) * Math.PI * 4 + y) * 4);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(10, 10);
  return t;
}

// A huge sun low in the west, riding with the camera like the real one in Solar.
function makeSun(W) {
  const group = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.SphereGeometry(70, 32, 16), new THREE.ShaderMaterial({
    fog: false, depthWrite: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: 'varying vec3 vN; void main(){ vN = normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uTime; varying vec3 vN;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
      float n(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z); }
      void main(){
        vec3 p = normalize(vN);
        float c = n(p * 4.0 + uTime * 0.05) * 0.6 + n(p * 12.0 - uTime * 0.08) * 0.4;
        gl_FragColor = vec4(mix(vec3(1.6, 0.6, 0.12), vec3(1.9, 1.45, 0.8), smoothstep(0.35, 0.75, c)), 1.0);
      }`,
  }));
  const corona = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.ShaderMaterial({
    fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uTime; varying vec2 vUv;
      void main(){
        vec2 p = (vUv - 0.5) * 10.0;
        float r = length(p), a = atan(p.y, p.x + 1e-5);
        float glow = exp(-max(r - 1.0, 0.0) * 1.6) * 0.9 + exp(-r * 0.5) * 0.25;
        float rays = pow(max(0.5 + 0.5 * sin(a * 13.0 + sin(a * 3.0 + uTime * 0.15) * 2.0), 0.0), 8.0) * exp(-r * 0.25) * smoothstep(0.9, 1.6, r);
        vec3 col = vec3(1.0, 0.55, 0.2) * glow + vec3(1.0, 0.75, 0.4) * rays * 0.45;
        gl_FragColor = vec4(col * smoothstep(5.0, 3.2, r), 1.0);
      }`,
  }));
  group.add(disc, corona);
  group.userData.noCull = true;
  group.visible = false;
  W.scene.add(group);
  return {
    group,
    update(dt, cam) {
      group.visible = true;
      const d = Math.min(480, cam.far * 0.85);
      group.position.copy(cam.position).addScaledVector(SUN_DIR, d);
      group.scale.setScalar(d / 480);
      corona.lookAt(cam.position);
      disc.material.uniforms.uTime.value += dt;
      corona.material.uniforms.uTime.value += dt;
    },
  };
}

export function buildSunscorch({ B, W, game, level, H, boss }) {
  const { light, glowEdge, blocker } = B;
  const zone = 'yellow';
  const X = (x) => C.x + x, Z = (z) => C.z + z;
  const rock = (x1, y1, z1, x2, y2, z2) => W.box(X(x1), y1, Z(z1), X(x2), y2, Z(z2), 'rock', zone);

  // ---------------------------------------------------------------- the court
  // quicksand pools, clear of the middle (relative x1, z1, x2, z2)
  const pools = [[-25, -25, -15, -17], [13, -26, 24, -18], [-26, 11, -17, 22], [15, 13, 25, 23], [-5, 21, 6, 27], [-5, -28, 5, -22]];
  const holes = pools.map(([x1, z1, x2, z2]) => ({ u1: x1, v1: z1, u2: x2, v2: z2 }));
  // the court's rock, and a skin of rippled sand over it (with the pools left open)
  const sandPos = [], sandUv = [];
  for (const [x1, z1, x2, z2] of rectMinus(-R, -R, R, R, holes)) {
    rock(x1, -3, z1, x2, 0, z2);
    const q = [[x1, z1], [x1, z2], [x2, z2], [x1, z1], [x2, z2], [x2, z1]];
    for (const [x, z] of q) {
      sandPos.push(X(x), 0.01, Z(z));
      sandUv.push(x / 6, -z / 6);
    }
  }
  const sandGeo = new THREE.BufferGeometry();
  sandGeo.setAttribute('position', new THREE.Float32BufferAttribute(sandPos, 3));
  sandGeo.setAttribute('uv', new THREE.Float32BufferAttribute(sandUv, 2));
  sandGeo.computeVertexNormals();
  const sandTex = sandTexture();
  sandTex.repeat.set(1, 1);
  W.scene.add(new THREE.Mesh(sandGeo, new THREE.MeshStandardMaterial({ map: sandTex, roughness: 1, color: 0xffffff, side: THREE.DoubleSide })));
  const sinks = [];
  for (const [x1, z1, x2, z2] of pools) {
    rock(x1, -6, z1, x2, -3, z2);
    rock(x1, -3, z1, x2, -0.6, z2);
    new LiquidPlane(W, X(x1), Z(z1), X(x2), Z(z2), -0.08, { zone, style: 1, glow: 0.62 }); // the quicksand
    sinks.push({ x1: X(x1) + 0.15, x2: X(x2) - 0.15, z1: Z(z1) + 0.15, z2: Z(z2) - 0.15 });
    glowEdge(X(x1), Z(z1), X(x2), Z(z2), 0.05, 'glow1', zone, 0.06); // a warning rim of sunstone
  }
  // ARMOR: over the north-east pool's south lip (lean out over the quicksand).
  B.armor([X(18.5), 0, Z(-18.7)], { base: false, respawn: 45 });
  // obelisks: cover from its orbs
  const obelisks = [[-12, -9], [12, -9], [-12, 9], [12, 9]];
  for (const [x, z] of obelisks) {
    rock(x - 1, 0, z - 1, x + 1, 8, z + 1);
    W.box(X(x - 0.7), 8, Z(z - 0.7), X(x + 0.7), 9.2, Z(z + 0.7), 'metal', zone);
    W.deco(X(x - 1.02), 3, Z(z + 1), X(x + 1.02), 3.15, Z(z + 1.02), 'glow1', zone);
    W.deco(X(x - 1.02), 6, Z(z - 1.02), X(x + 1.02), 6.15, Z(z - 1), 'glow1', zone);
  }
  // the mesas round the court (blocked above so nobody climbs out)
  for (const [x1, z1, x2, z2] of [[-R - 6, -R - 6, R + 6, -R], [-R - 6, R, R + 6, R + 6], [-R - 6, -R, -R, R], [R, -R, R + 6, R]]) rock(x1, -6, z1, x2, 7, z2);
  for (let k = 0; k < 24; k++) {
    const side = k % 4, u = -R + ((k * 9.7) % (2 * R - 6)), w = 4 + (k % 4) * 2, h = 10 + ((k * 7.3) % 14);
    if (side === 0) rock(u, 7, -R - 6 - (k % 3) * 3, u + w, h, -R);
    else if (side === 1) rock(u, 7, R, u + w, h, R + 6 + (k % 3) * 3);
    else if (side === 2) rock(-R - 6 - (k % 3) * 3, 7, u, -R, h, u + w);
    else rock(R, 7, u, R + 6 + (k % 3) * 3, h, u + w);
  }
  // darker strata banding the mesa faces
  for (const y of [2.2, 4.6, 6.4]) {
    W.deco(X(-R), y, Z(-R - 0.06), X(R), y + 0.45, Z(-R), 'metal', zone);
    W.deco(X(-R), y, Z(R), X(R), y + 0.45, Z(R + 0.06), 'metal', zone);
    W.deco(X(-R - 0.06), y, Z(-R), X(-R), y + 0.45, Z(R), 'metal', zone);
    W.deco(X(R), y, Z(-R), X(R + 0.06), y + 0.45, Z(R), 'metal', zone);
  }
  for (const [x1, z1, x2, z2] of [[-R, -R - 1, R, -R], [-R, R, R, R + 1], [-R - 1, -R, -R, R], [R, -R, R + 1, R]]) blocker([X(x1), 7, Z(z1)], [X(x2), 60, Z(z2)]);
  // far mesas on the horizon (silhouettes against the sun)
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2, d = 70 + (k % 3) * 18, w = 10 + (k % 4) * 6;
    const cx = Math.cos(a) * d, cz = Math.sin(a) * d;
    rock(cx - w / 2, -6, cz - w / 2, cx + w / 2, 14 + (k % 5) * 6, cz + w / 2);
  }
  light(X(0), 10, Z(0), 0xffc070, 10, 36);

  const sun = makeSun(W);
  level.atmospheres.finSolar = {
    fog: 0xd27a38, fogNear: 50, fogFar: 260,
    skyTop: [0.28, 0.12, 0.05], skyMid: [0.75, 0.34, 0.1], skyHorizon: [1.0, 0.55, 0.22], aurora: 0, stars: 0,
    hemiSky: 0xffc890, hemiGround: 0x5a2a12, hemiIntensity: 0.6,
    sunColor: 0xffb070, sunIntensity: 3.0, sunDir: SUN_DIR.toArray(),
    exposure: 0.9, bloom: 0.45,
  };

  // ---------------------------------------------------------------- the incinerator beam
  const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd890).multiplyScalar(2.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const beamGlowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff8a2a).multiplyScalar(1.2), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
  const beam = new THREE.Group();
  const bh = BEAM_TOP - BEAM_BOTTOM;
  const core = new THREE.Mesh(new THREE.BoxGeometry(0.35, bh * 0.7, BEAM_LEN).translate(0, 0, BEAM_LEN / 2), beamMat);
  const glow = new THREE.Mesh(new THREE.BoxGeometry(0.9, bh, BEAM_LEN).translate(0, 0, BEAM_LEN / 2), beamGlowMat);
  beam.add(core, glow);
  beam.visible = false;
  W.scene.add(beam);
  // the telegraph: a thin line on the sand along where it starts, and an arc of where it will sweep
  const lineMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd23a).multiplyScalar(2), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const line = new THREE.Mesh(new THREE.PlaneGeometry(0.25, BEAM_LEN).rotateX(-Math.PI / 2).translate(0, 0, BEAM_LEN / 2), lineMat);
  line.visible = false;
  W.scene.add(line);
  const arcMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffa030), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  let arc = null;
  const setArc = (from, sweep) => {
    if (arc) {
      W.scene.remove(arc);
      arc.geometry.dispose();
    }
    // the arc of the sweep at the beam's tip: a fan of quads from `from` through `sweep` (our yaw a
    // points along (sin a, 0, cos a))
    const seg = 48, pos = [];
    for (let i = 0; i < seg; i++) {
      const a0 = from + (sweep * i) / seg, a1 = from + (sweep * (i + 1)) / seg;
      const r0 = BEAM_LEN - 1.2, r1 = BEAM_LEN;
      const p = (a, r) => [Math.sin(a) * r, 0, Math.cos(a) * r];
      pos.push(...p(a0, r0), ...p(a0, r1), ...p(a1, r1), ...p(a0, r0), ...p(a1, r1), ...p(a1, r0));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    arc = new THREE.Mesh(g, arcMat);
    W.scene.add(arc);
  };
  const beamOff = () => {
    beam.visible = false;
    line.visible = false;
    if (arc) arc.visible = false;
    beamRoar.setGain(0);
  };
  const beamRoar = audio.createLoop('incinerator_roar');

  // ---------------------------------------------------------------- specials
  const lance = (x, z, delay = 0, radius = 1.7) => H.erupt(x, 0, z, { kind: 'sun', radius, warn: 0.95, dur: 0.85, height: 26, delay });
  const inCourt = (x, z) => Math.abs(x - C.x) < R - 1 && Math.abs(z - C.z) < R - 1;
  const specials = {
    lances: {
      weight: 3,
      pose: 'raise',
      start(b, a, player) {
        a.pattern = ['rain', 'cross', 'ring'][Math.floor(Math.random() * 3)];
        a.waves = b.phase >= 3 ? 2 : a.pattern === 'rain' ? 2 : 1;
        a.next = 0.2;
        audio.sample('sun_hum', { gain: 0.7 }) || audio.charge();
      },
      update(b, a, dt, player) {
        if (a.waves > 0 && a.t >= a.next) {
          a.waves--;
          a.next += 1.3;
          const px = player.pos.x, pz = player.pos.z;
          if (a.pattern === 'rain') {
            lance(px, pz);
            for (let i = 0; i < 6; i++) {
              const ang = Math.random() * Math.PI * 2, r = 3.5 + Math.random() * 6;
              const x = px + Math.cos(ang) * r, z = pz + Math.sin(ang) * r;
              if (inCourt(x, z)) lance(x, z, 0.1 * (i + 1));
            }
          } else if (a.pattern === 'cross') {
            for (let k = -4; k <= 4; k++) {
              if (inCourt(px + k * 3.4, pz)) lance(px + k * 3.4, pz, Math.abs(k) * 0.06, 1.4);
              if (k && inCourt(px, pz + k * 3.4)) lance(px, pz + k * 3.4, Math.abs(k) * 0.06, 1.4);
            }
          } else {
            // a ring closes round you: get out between its columns before the middle goes up
            // (six columns 6 m out leave gaps of ~3 m to slip through)
            const off = Math.random() * Math.PI;
            for (let k = 0; k < 6; k++) {
              const ang = off + (k / 6) * Math.PI * 2;
              lance(px + Math.cos(ang) * 6, pz + Math.sin(ang) * 6, 0, 1.3);
            }
            lance(px, pz, 0.35, 2.8);
          }
        }
        return a.t > 1.3 * (a.pattern === 'rain' || b.phase >= 3 ? 2 : 1) + 0.8;
      },
    },
    // the incinerator: chest open, a low sweeping beam to jump
    beam: {
      weight: 2,
      pose: 'beam',
      rest: 0.6,
      ok: (b, dist) => dist > 5,
      start(b, a, player) {
        b.attack.openCore = true;
        const toP = Math.atan2(player.pos.x - b.pos.x, player.pos.z - b.pos.z);
        a.dir = Math.random() < 0.5 ? 1 : -1;
        a.sweep = (b.phase >= 3 ? 250 : 200) * (Math.PI / 180) * a.dir;
        a.from = toP - a.sweep * 0.42; // it starts off to one side of you and swings through
        a.dur = b.phase >= 3 ? 2.4 : 2.7;
        a.charge = 1.3;
        a.ang = a.from;
        a.prev = undefined;
        a.hit = false;
        audio.charge();
        game.hud.bossHint('Its chest opens — the INCINERATOR: jump the beam, hit the yellow core!', true);
        line.visible = true;
        setArc(a.from, a.sweep);
      },
      update(b, a, dt, player) {
        const ox = b.pos.x, oz = b.pos.z;
        b.yaw += wrap(a.ang - b.yaw) * Math.min(1, dt * 6);
        if (a.t < a.charge) {
          const k = a.t / a.charge;
          line.position.set(ox, 0.04, oz);
          line.rotation.y = a.from;
          lineMat.opacity = 0.3 + 0.7 * k * (0.6 + 0.4 * Math.sin(a.t * 40));
          arc.position.set(ox, 0.05, oz);
          arc.visible = true;
          arcMat.opacity = 0.25 * k;
          a.ang = a.from;
          return false;
        }
        const ft = a.t - a.charge;
        if (!beam.visible) {
          beam.visible = true;
          line.visible = false;
          audio.sample('incinerator_ignite', { gain: 1 }) || audio.sweep();
        }
        const k = Math.min(1, ft / a.dur);
        a.ang = a.from + a.sweep * k;
        beam.position.set(ox, BEAM_BOTTOM + bh / 2, oz);
        beam.rotation.y = a.ang;
        beamMat.color.setRGB(1.0, 0.85, 0.55).multiplyScalar(2.4 + Math.sin(a.t * 50) * 0.4);
        arcMat.opacity = 0.18 * (1 - k);
        beamRoar.setGain(0.9);
        // scorch: sparks where it rakes the sand
        const tip = Math.random() * BEAM_LEN;
        W.fx.ember(_v.set(ox + Math.sin(a.ang) * tip, 0.2, oz + Math.cos(a.ang) * tip), (Math.random() - 0.5) * 3, 2 + Math.random() * 3, (Math.random() - 0.5) * 3, 0xffb24a, 0.6, 0.1);
        // the hit: it swept past where you stand while your feet were under its top
        const px = player.pos.x - ox, pz = player.pos.z - oz, r = Math.hypot(px, pz);
        const rel = wrap(Math.atan2(px, pz) - a.ang);
        const crossed = a.prev !== undefined && Math.sign(rel) !== Math.sign(a.prev) && Math.abs(rel) < 1;
        const near = Math.abs(Math.sin(rel)) * r < 0.55 && Math.cos(rel) > 0;
        a.prev = rel;
        if (!a.hit && (crossed || near) && r < BEAM_LEN && r > 1.5 && player.pos.y < BEAM_TOP && player.pos.y + player.height > BEAM_BOTTOM) {
          a.hit = true;
          player.damage(1, 'burn');
        }
        if (k >= 1) {
          beamOff();
          a.openCore = false;
          b.vent(1.6, null);
          return true;
        }
        return false;
      },
      cancel() {
        beamOff();
      },
    },
  };

  const stage = {
    key: 'solar',
    name: 'THE SUNCROWNED WARDEN',
    title: 'III · THE SUNSCORCH',
    sub: 'STAGE III',
    main: 'THE SUNSCORCH',
    color: '#ffd23a',
    hp: 1400,
    tier: 2,
    form: 'solar',
    blade: 0xffc040,
    ring: 0xffb030,
    shield: false,
    cover: true,
    limbPalette: [1],
    corePalette: [1],
    torsoPalette: [1],
    orbPalette: [0, 1, 2, 3],
    armor: 2.5,
    kneelTime: 4.5,
    // (the kneel is THE window: one carries about a third of the chunk; leg armor and broken limbs are chip)
    dmg: { vent: 10, kneel: 15, limb: 2, head: 4, broken: 1, torso: 1 },
    attacks: { sweep: 1, slam: 2, volley: 2, charge: 2, lances: 3, beam: 2 },
    specials,
    env: 0.3, // image-based light (main's default 0.35)
    intensity: 2, // combat director attack tokens
    walk: true,
    spawn: new THREE.Vector3(X(0), 0, Z(-12)),
    floorY: 0,
    yaw: 0,
    bounds: { minX: X(-24), maxX: X(24), minZ: Z(-24), maxZ: Z(24) },
    playerStart: new THREE.Vector3(X(0), 0, Z(16)),
    playerYaw: 0,
    atmosphere: 'finSolar',
    music: 'music_finale_solar',
    musicFallback: 'music_yellow',
    introHint: 'Its plates burn YELLOW. When it opens its chest to fire, the core is bare.',
    intro: '<b>THE SUNSCORCH.</b> Keep out of the <b>quicksand</b>, and watch the sand for the sun coming down.',
    tips: {
      lances: 'Sun lances! <b>Get off the glowing circles</b> — fast.',
      beam: 'INCINERATOR: <b>jump the beam</b> as it sweeps past, and hit the yellow core!',
      charge: 'It\'s charging: <b>sidestep</b>!',
    },
    // (for tests and tools: the floor that kills)
    state: () => ({ pits: sinks }),
    reset() {
      beamOff();
    },
    onExit() {
      beamOff();
      sun.group.visible = false;
    },
    update(dt, player) {
      sun.update(dt, game.camera);
      // quicksand: step in and it has you
      const p = player.pos;
      if (p.y < 0.1) for (const s of sinks) if (p.x > s.x1 && p.x < s.x2 && p.z > s.z1 && p.z < s.z2) player.damage(1, 'quicksand');
      // heat shimmer motes
      if (Math.random() < dt * 12) W.fx.burst(_v.set(p.x + (Math.random() - 0.5) * 30, p.y + Math.random() * 6, p.z + (Math.random() - 0.5) * 30), 0xffd890, { count: 1, speed: 0.4, life: 3, size: 0.1, gravity: -0.3, drag: 0.4 });
    },
  };
  return stage;
}
