// AZURE — THE TRENCH: the world under the waves (called from azure.js).
//   · the trench floor: sand dunes and rubble, its playable shelf at ~y -66, falling away over an abyss
//     lip at both ends into blue-black depth (one mesh, baked colors, caustics)
//   · the walls: the west cliff under the Nexus and natural cliffs past both ends of the station's hull,
//     layered strata, ledges and seep-glow, running off into the fog north and south
//   · far silhouettes: pinnacles and an arch tinted by the murk, and work lights pricking it far away
//   · reef life: coral (branch, brain, fan), kelp curtains that sway, rocks, barnacles; schools of
//     tropical fish that swim in loops and scatter from the Leviathan (one draw each, all in shaders)
//   · THE CRAWLER: a colossal tracked seabed miner dredging the trench's south end, drum spinning, silt
//     boiling up, work lights cutting the murk (an ambient set piece; no collision, no AI)
//   · the LEVIATHAN PUPPET: a cheap stand-in for Charybdis that glides past the windows on scripted paths
//     (play('name')), culled whenever it isn't on stage
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { audio } from '../audio.js';
import { addCaustics, SEA_Y } from './azureOcean.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _v = V(0, 0, 0), _w = V(0, 0, 0), _u = V(0, 0, 0);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = V(1, 1, 1), _c = new THREE.Color();
audio.manifest?.then(() => audio.prefetch(['reactor_hum', 'servo_heavy', 'rotor_turn', 'leviathan_groan', 'leviathan_roar', 'glass_hit', 'glass_creak', 'seabed_machine', 'temple_rumble']));

function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// smooth value noise in 2D (for the terrain, baked once)
function noise2(seed) {
  const h = (x, y) => {
    let n = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export const FLOOR_Y = -66;

export function buildTrench(B, { keepOut = [], fishZones = [] } = {}) {
  const { W, game, level } = B;
  const rng = mulberry32(0x7e4c4);
  const n1 = noise2(11), n2 = noise2(23), n3 = noise2(37);
  const blocked = (x, z, m = 0) => keepOut.some(([a, b]) => x > a[0] - m && x < b[0] + m && z > a[2] - m && z < b[2] + m);
  const time = { value: 0 };
  const fogCol = game.scene.fog.color; // (silhouettes are tinted by the murk, read each frame)

  // ------------------------------------------------------------------ the floor
  // height of the floor at (x, z): the shelf, dunes, rubble banks under the walls, the abyss lips
  const floorAt = (x, z) => {
    let y = FLOOR_Y + (n1(x * 0.045, z * 0.045) - 0.5) * 1.8 + (n2(x * 0.15, z * 0.15) - 0.5) * 0.5;
    y += smooth(42, 34, x) * (6 + n3(z * 0.1, 3) * 5); // talus under the west cliff
    y += smooth(104, 113, x) * (2 + n3(z * 0.12, 7) * 3);
    // the abyss lips past both ends of the station: the floor breaks away into the deep
    y -= smooth(-50, -36, z) * (70 + n1(x * 0.05, 9) * 30);
    y -= smooth(-224, -240, z) * (70 + n1(x * 0.05, 4) * 30);
    return y;
  };
  {
    const X1 = 30, X2 = 113, Z1 = -560, Z2 = 300;
    const g = new THREE.PlaneGeometry(X2 - X1, Z2 - Z1, Math.round((X2 - X1) / 2.5), Math.round((Z2 - Z1) / 3)).rotateX(-Math.PI / 2).translate((X1 + X2) / 2, 0, (Z1 + Z2) / 2);
    const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
    const sand = new THREE.Color(0xb3a47e), dark = new THREE.Color(0x3e5250), weed = new THREE.Color(0x56704a);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), y = floorAt(x, z);
      pos.setY(i, y);
      const deep = smooth(FLOOR_Y - 5, FLOOR_Y - 40, y);
      _c.copy(sand).lerp(weed, n2(x * 0.08, z * 0.08) * 0.45).lerp(dark, Math.max(deep, smooth(FLOOR_Y + 2, FLOOR_Y + 9, y) * 0.6));
      _c.toArray(col, i * 3);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = addCaustics(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }), 1.2);
    const mesh = new THREE.Mesh(g, m);
    mesh.matrixAutoUpdate = false;
    mesh.userData.noCull = true;
    mesh.raycast = () => {};
    W.scene.add(mesh);
    // (collision: the shelf is a floor you can stand on)
    W.addSolid(V(36, FLOOR_Y - 6, -224), V(112, FLOOR_Y - 0.4, -50), { static: true, kind: 'rock' });
  }

  // ------------------------------------------------------------------ the walls
  // a cliff face along z at x ≈ x0 facing `dir` (+1 east, -1 west), from y0 up to the top profile
  const stoneMat = addCaustics(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.05, flatShading: true, side: THREE.DoubleSide }), 1);
  const cliffGeos = [];
  function cliffFace(x0, dir, z1, z2, y0, top) {
    const segZ = Math.round(Math.abs(z2 - z1) / 4), segY = Math.round((top(0) - y0) / 3.5) + 4;
    const g = new THREE.PlaneGeometry(1, 1, segZ, segY);
    const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
    const a = new THREE.Color(0x3c4a4e), b = new THREE.Color(0x6b6a5c), c = new THREE.Color(0x24333a), lichen = new THREE.Color(0x4f7a5a), seep = new THREE.Color(0x40e0d0);
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i) + 0.5, v = pos.getY(i) + 0.5;
      const z = z1 + (z2 - z1) * u, t = top(z), y = y0 + (t - y0) * v;
      // strata: ledges every few metres jut out, the faces between lean back; noise breaks it all up
      const band = Math.floor((y + n1(z * 0.03, 1) * 6) / 5.5);
      const ledge = ((y + n1(z * 0.03, 1) * 6) / 5.5) % 1;
      let out = (n1(z * 0.05, y * 0.05) - 0.5) * 7 + (n2(z * 0.18, y * 0.18) - 0.5) * 2.2 + (ledge < 0.18 ? 1.4 : 0) + (band % 3) * 0.6;
      out *= smooth(top(z) + 1, top(z) - 4, y) * 0.6 + 0.4;
      pos.setXYZ(i, x0 + dir * out, y, z);
      _c.copy(band % 2 ? a : b).lerp(c, n2(z * 0.07, y * 0.09) * 0.6);
      if (ledge < 0.18) _c.lerp(lichen, 0.5);
      if (y > SEA_Y - 30) _c.lerp(lichen, 0.25 * smooth(SEA_Y - 30, SEA_Y - 8, y));
      if (n3(z * 0.2, y * 0.2) > 0.86 && y < -40) _c.lerp(seep, 0.6); // seep vents glowing faintly
      _c.toArray(col, i * 3);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    cliffGeos.push(g);
  }
  // the west wall: under the Nexus it stands up out of the sea; past it, it slips under the surface
  const westTop = (z) => -14 + n1(z * 0.02, 5) * 6 + (15 - n1(z * 0.02, 5) * 6) * smooth(-40, -64, z) * smooth(-222, -198, z);
  cliffFace(34.6, 1, 300, -560, -170, westTop);
  // the rim under the Nexus: a rocky shelf from its foundations out to the cliff's lip, palms leaning in
  // the wind (the only land in the Reach)
  {
    const g = new THREE.PlaneGeometry(1, 1, 4, 64);
    const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
    const rockC = new THREE.Color(0x5a5e52), sandC = new THREE.Color(0xc8b88a), green = new THREE.Color(0x4a7a3a);
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i) + 0.5, v = pos.getY(i) + 0.5;
      const z = -36 - v * 192, x = 24.5 + u * 10.6, t = westTop(z);
      const y = t + (n2(x * 0.3, z * 0.3) - 0.5) * 1.2 + (u > 0.95 ? -0.6 : 0);
      pos.setXYZ(i, x, y, z);
      _c.copy(rockC).lerp(sandC, smooth(0.6, 0.2, u) * 0.6).lerp(green, n3(x * 0.2, z * 0.2) * 0.5);
      _c.toArray(col, i * 3);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    cliffGeos.push(g);
  }
  // the east wall past both ends of the hull (the hull itself is the station: azure.js)
  const eastTop = (z) => -16 + n1(z * 0.02, 8) * 8;
  cliffFace(113.5, -1, -62, 300, -170, eastTop);
  cliffFace(113.5, -1, -560, -226, -170, eastTop);
  // and the floor's walls in the abyss past the lips: the canyon goes on down
  {
    const merged = mergeGeometries(cliffGeos.map((g) => g.toNonIndexed()), false);
    cliffGeos.forEach((g) => g.dispose());
    merged.computeVertexNormals();
    const mesh = new THREE.Mesh(merged, stoneMat);
    mesh.matrixAutoUpdate = false;
    mesh.userData.noCull = true;
    mesh.raycast = () => {};
    W.scene.add(mesh);
  }

  // ---- palms on the rim (trunks curving out over the sea, fronds that stream in the wind)
  const palms = [];
  {
    const trunkM = new THREE.MeshStandardMaterial({ color: 0x7a6248, roughness: 0.9, flatShading: true });
    const frondM = new THREE.MeshStandardMaterial({ color: 0x3f8a3a, roughness: 0.8, side: THREE.DoubleSide, emissive: 0x081a06 });
    const trunks = [], fronds = [];
    for (const [x, z, h, lean] of [[28, -70, 9, 0.35], [31, -84, 11, 0.5], [27.5, -95, 8, 0.25], [30.5, -152, 10, 0.45], [28, -166, 8.5, 0.3], [32, -180, 9.5, 0.55], [29, -192, 7.5, 0.3]]) {
      const base = V(x, westTop(z) - 0.3, z), top = V(x + lean * h * 0.8, base.y + h, z + (rng() - 0.5) * 2);
      const mid = V().lerpVectors(base, top, 0.5).add(V(-lean * 1.2, 0, 0));
      trunks.push(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(base, mid, top), 8, 0.28, 6));
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2 + rng() * 0.3;
        const fr = new THREE.PlaneGeometry(0.9, 4.2, 1, 4).translate(0, 2.1, 0);
        const p = fr.attributes.position;
        for (let i = 0; i < p.count; i++) p.setZ(i, -Math.pow(p.getY(i) / 4.2, 2) * 1.6); // drooping
        fr.rotateX(-Math.PI / 2 + 0.5).rotateY(a).translate(top.x, top.y, top.z);
        fronds.push(fr);
      }
      palms.push(top);
    }
    const tm = new THREE.Mesh(mergeGeometries(trunks.map((g) => g.toNonIndexed())), trunkM);
    const fm = new THREE.Mesh(mergeGeometries(fronds.map((g) => g.toNonIndexed())), frondM);
    frondM.onBeforeCompile = (sh) => {
      sh.uniforms.uT = time;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uT;').replace('#include <begin_vertex>', `#include <begin_vertex>
        float gust = sin(uT * 1.7 + position.z * 0.3) * 0.5 + sin(uT * 3.1 + position.x) * 0.25;
        transformed.x -= (0.6 + gust * 0.5) * max(0.0, position.y - 8.0) * 0.06;
        transformed.y += sin(uT * 4.0 + position.x * 2.0 + position.z) * 0.08;`);
    };
    for (const m of [tm, fm]) {
      m.matrixAutoUpdate = false;
      m.userData.noCull = true;
      m.raycast = () => {};
      W.scene.add(m);
    }
  }

  // ------------------------------------------------------------------ far silhouettes (tinted by the murk)
  const silMat = new THREE.MeshBasicMaterial({ color: 0x103040, fog: false });
  {
    const parts = [];
    const pinnacle = (x, z, h, r) => {
      const g = new THREE.CylinderGeometry(r * 0.25, r, h, 7, 4).translate(x, floorAt(Math.min(112, Math.max(30, x)), z) - 30 + h / 2, z);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + (rng() - 0.5) * r * 0.4);
      parts.push(g);
    };
    for (const [x, z, h, r] of [[60, 60, 90, 14], [92, 110, 120, 18], [48, 190, 140, 20], [80, -320, 110, 16], [56, -380, 150, 22], [100, -440, 130, 18], [70, 30, 70, 10]]) pinnacle(x, z, h, r);
    // an arch far to the south and one far to the north
    for (const [z, s] of [[150, 1], [-300, 1.3]]) {
      const t = new THREE.TorusGeometry(26 * s, 7 * s, 6, 14, Math.PI).translate(74, -70, z);
      parts.push(t);
    }
    const mesh = new THREE.Mesh(mergeGeometries(parts.map((g) => g.toNonIndexed()), false), silMat);
    mesh.matrixAutoUpdate = false;
    mesh.userData.noCull = true;
    mesh.raycast = () => {};
    W.scene.add(mesh);
  }
  // pinpricks of work lights far off in the murk (the machine is still building out there)
  const farLights = [];
  {
    const N = 26, pos = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const far = i % 2 ? 1 : -1;
      pos[i * 3] = 45 + rng() * 60;
      pos[i * 3 + 1] = -60 - rng() * 60;
      pos[i * 3 + 2] = far > 0 ? 80 + rng() * 160 : -290 - rng() * 180;
      seed[i] = rng() * 50;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { uT: time, uScale: { value: 300 } },
      vertexShader: `uniform float uT, uScale; attribute float aSeed; varying float vA; varying float vWarm;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = clamp(2.2 * uScale / max(-mv.z, 1.0), 1.5, 9.0);
          vA = (0.55 + 0.45 * step(0.0, sin(uT * (1.0 + fract(aSeed)) + aSeed))) * smoothstep(400.0, 120.0, -mv.z); vWarm = step(0.5, fract(aSeed * 3.1));
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vA; varying float vWarm; void main(){ float r = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, r);
          gl_FragColor = vec4(mix(vec3(0.6, 0.95, 1.0), vec3(1.0, 0.75, 0.4), vWarm) * a * vA, 1.0); }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    pts.userData.noCull = true;
    pts.raycast = () => {};
    W.scene.add(pts);
    farLights.push(pts);
  }

  // ------------------------------------------------------------------ reef life
  // coral: three prototypes, instanced with per-instance colors
  const coralMat = addCaustics(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0, flatShading: true, emissive: 0x140a10 }), 1);
  const CORAL = [0xff6f61, 0xffa24a, 0xd85aa8, 0xf2d25a, 0x8a6cf0, 0x4fe0c0, 0xff8fb0];
  const branch = (() => {
    const parts = [new THREE.CylinderGeometry(0.06, 0.12, 0.8, 5).translate(0, 0.4, 0)];
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2, l = 0.5 + (k % 2) * 0.3;
      parts.push(new THREE.CylinderGeometry(0.03, 0.07, l, 4).translate(0, l / 2, 0).rotateZ(0.6).rotateY(a).translate(0, 0.55, 0));
    }
    return mergeGeometries(parts.map((g) => g.toNonIndexed()));
  })();
  const brain = new THREE.IcosahedronGeometry(0.6, 1).scale(1, 0.6, 1).translate(0, 0.25, 0);
  const fan = new THREE.CircleGeometry(0.8, 9, 0, Math.PI).translate(0, 0.05, 0);
  const protos = [branch, brain, fan];
  const coralPts = [[], [], []];
  const reef = (x1, z1, x2, z2, n, yOff = 0) => {
    for (let i = 0; i < n; i++) {
      const x = x1 + rng() * (x2 - x1), z = z1 + rng() * (z2 - z1);
      if (blocked(x, z, 1.5)) continue;
      const k = rng() < 0.5 ? 0 : rng() < 0.6 ? 1 : 2;
      coralPts[k].push({ x, y: floorAt(x, z) + yOff, z, s: 0.7 + rng() * 1.6, yaw: rng() * 6.28, c: CORAL[Math.floor(rng() * CORAL.length)] });
    }
  };
  reef(37, -52, 111, -222, 520);
  reef(36, -60, 44, -200, 180, -0.2); // the talus under the west cliff
  // coral on the cliff ledges near the top (the shallows under the Nexus)
  for (let i = 0; i < 160; i++) {
    const z = -66 - rng() * 130, y = -12 - rng() * 22;
    coralPts[rng() < 0.6 ? 0 : 2].push({ x: 36.2 + rng() * 1.4, y, z, s: 0.6 + rng(), yaw: rng() * 6.28, c: CORAL[Math.floor(rng() * CORAL.length)] });
  }
  protos.forEach((geo, k) => {
    const list = coralPts[k];
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geo, coralMat, list.length);
    list.forEach((p, i) => {
      _q.setFromAxisAngle(_u.set(0, 1, 0), p.yaw);
      im.setMatrixAt(i, _m.compose(_v.set(p.x, p.y, p.z), _q, _s.setScalar(p.s)));
      im.setColorAt(i, _c.setHex(p.c));
    });
    im.userData.noCull = true;
    im.raycast = () => {};
    W.scene.add(im);
  });
  // rocks
  {
    const rockMat = addCaustics(new THREE.MeshStandardMaterial({ color: 0x45524f, roughness: 1, flatShading: true }), 1);
    const list = [];
    for (let i = 0; i < 220; i++) {
      const x = 37 + rng() * 74, z = -50 - rng() * 172;
      if (blocked(x, z, 2)) continue;
      list.push([x, floorAt(x, z) - 0.3, z, 0.6 + Math.pow(rng(), 2) * 3.5]);
    }
    const im = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), rockMat, list.length);
    list.forEach(([x, y, z, s], i) => {
      _q.setFromEuler(new THREE.Euler(rng() * 3, rng() * 3, rng() * 3));
      im.setMatrixAt(i, _m.compose(_v.set(x, y, z), _q, _s.set(s, s * (0.5 + rng() * 0.5), s * (0.7 + rng() * 0.6))));
    });
    im.userData.noCull = true;
    im.raycast = () => {};
    W.scene.add(im);
  }
  // kelp: tall ribbons swaying in the swell (the sway lives in the vertex shader)
  const kelp = [];
  const kelpBed = (x1, z1, x2, z2, n, h0, h1) => {
    for (let i = 0; i < n; i++) {
      const x = x1 + rng() * (x2 - x1), z = z1 + rng() * (z2 - z1);
      if (blocked(x, z, 1)) continue;
      kelp.push([x, floorAt(x, z) - 0.2, z, h0 + rng() * (h1 - h0), rng() * 6.28]);
    }
  };
  kelpBed(37, -52, 50, -222, 170, 6, 22); // curtains along the west cliff
  kelpBed(50, -52, 110, -80, 120, 4, 15);
  kelpBed(84, -125, 110, -222, 110, 4, 16);
  kelpBed(104, -60, 111, -222, 70, 8, 26); // up the hull's feet
  {
    const geo = new THREE.PlaneGeometry(0.3, 1, 1, 10).translate(0, 0.5, 0);
    const g2 = geo.clone().rotateY(Math.PI / 2);
    const blade = mergeGeometries([geo.toNonIndexed(), g2.toNonIndexed()]);
    const im = new THREE.InstancedMesh(blade, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, side: THREE.DoubleSide, emissive: 0x081206 }), kelp.length);
    const KELP = [0x6a7a2c, 0x7a6a2a, 0x4f7a3a, 0x8a7a34, 0x3f6a44];
    kelp.forEach(([x, y, z, h, yaw], i) => {
      _q.setFromAxisAngle(_u.set(0, 1, 0), yaw);
      im.setMatrixAt(i, _m.compose(_v.set(x, y, z), _q, _s.set(1 + h * 0.04, h, 1 + h * 0.04)));
      im.setColorAt(i, _c.setHex(KELP[i % KELP.length]));
    });
    im.material.onBeforeCompile = (sh) => {
      sh.uniforms.uT = time;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uT;').replace('#include <begin_vertex>', `#include <begin_vertex>
        { vec3 ip = vec3(instanceMatrix[3]); float k = position.y * position.y;
          transformed.x += sin(uT * 0.9 + ip.x * 0.3 + ip.z * 0.2 + position.y * 2.0) * 0.18 * k;
          transformed.z += cos(uT * 0.7 + ip.z * 0.4 + position.y * 1.6) * 0.14 * k; }`);
    };
    im.userData.noCull = true;
    im.raycast = () => {};
    W.scene.add(im);
  }

  // ------------------------------------------------------------------ fish schools
  // Every fish is one instance; its school (a uniform: centre, heading, scatter) and its own offset and
  // phase do the rest in the vertex shader: the body wiggles, the school wheels in loops.
  const SCHOOLS = fishZones.length ? fishZones : [
    { c: [70, -52, -70], r: [10, 4, 7], n: 36, speed: 0.12, col: [0xffd23a, 0x2fa8ff] },
    { c: [52, -40, -130], r: [8, 3, 8], n: 30, speed: 0.1, col: [0xc0e8ff, 0x8ab4d0] },
    { c: [95, -48, -160], r: [9, 4, 9], n: 34, speed: 0.14, col: [0xff7a3a, 0xffffff] },
    { c: [80, -30, -100], r: [12, 3, 8], n: 30, speed: 0.08, col: [0x5ae0ff, 0x2a60ff] },
    { c: [60, -60, -195], r: [10, 3, 8], n: 30, speed: 0.11, col: [0xffe066, 0x20202a] },
    { c: [100, -35, -70], r: [7, 3, 6], n: 26, speed: 0.13, col: [0xd860ff, 0x60f0ff] },
  ];
  const NS = SCHOOLS.length;
  let st_fish = null;
  const schoolU = { uT: time, uC: { value: SCHOOLS.map(() => new THREE.Vector4()) }, uD: { value: SCHOOLS.map(() => new THREE.Vector4(1, 0, 0, 0)) } };
  const school = SCHOOLS.map((s, i) => ({ ...s, i, pos: V(...s.c), dir: V(1, 0, 0), scatter: 0, a: rng() * 6.28 }));
  {
    const body = new THREE.OctahedronGeometry(1, 0).scale(0.32, 0.12, 0.05).toNonIndexed();
    body.deleteAttribute('uv');
    body.deleteAttribute('normal');
    const tail = new THREE.BufferGeometry();
    tail.setAttribute('position', new THREE.Float32BufferAttribute([-0.28, 0, 0, -0.5, 0.12, 0, -0.5, -0.12, 0], 3));
    const fishGeo = mergeGeometries([body, tail]);
    fishGeo.computeVertexNormals();
    let total = 0;
    for (const s of SCHOOLS) total += s.n;
    const ig = new THREE.InstancedBufferGeometry().copy(fishGeo);
    const off = new Float32Array(total * 4), sid = new Float32Array(total), colA = new Float32Array(total * 3);
    let k = 0;
    SCHOOLS.forEach((s, i) => {
      for (let j = 0; j < s.n; j++, k++) {
        off[k * 4] = (rng() * 2 - 1) * s.r[0];
        off[k * 4 + 1] = (rng() * 2 - 1) * s.r[1];
        off[k * 4 + 2] = (rng() * 2 - 1) * s.r[2];
        off[k * 4 + 3] = rng() * 6.28;
        sid[k] = i;
        _c.setHex(s.col[j % 2]).toArray(colA, k * 3);
      }
    });
    ig.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4));
    ig.setAttribute('aSchool', new THREE.InstancedBufferAttribute(sid, 1));
    ig.setAttribute('aCol', new THREE.InstancedBufferAttribute(colA, 3));
    ig.instanceCount = total;
    const fm = new THREE.ShaderMaterial({
      uniforms: schoolU,
      vertexShader: `
        #include <common>
        #include <fog_pars_vertex>
        uniform float uT; uniform vec4 uC[${NS}]; uniform vec4 uD[${NS}];
        attribute vec4 aOff; attribute float aSchool; attribute vec3 aCol;
        varying vec3 vCol; varying float vShade;
        void main() {
          int s = int(aSchool + 0.5);
          vec4 C = uC[0]; vec4 D = uD[0];
          for (int i = 0; i < ${NS}; i++) if (i == s) { C = uC[i]; D = uD[i]; }
          vec3 dir = normalize(D.xyz);
          vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), dir));
          float ph = aOff.w;
          // each fish weaves round its slot; a scattered school bursts outward
          vec3 slot = aOff.xyz * (1.0 + C.w * 2.5) + vec3(sin(uT * 0.7 + ph * 3.0), sin(uT * 1.1 + ph) * 0.4, cos(uT * 0.6 + ph * 2.0)) * 0.8;
          vec3 local = position;
          local.z += sin(uT * (9.0 + C.w * 10.0) + ph * 5.0 + position.x * 6.0) * 0.06 * smoothstep(0.1, -0.5, position.x);
          vec3 fwd = normalize(dir + side * sin(uT * 0.8 + ph) * 0.25);
          vec3 sd = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
          vec3 wp = C.xyz + slot + fwd * local.x + vec3(0.0, local.y, 0.0) + sd * local.z;
          vCol = aCol;
          vShade = 0.65 + 0.35 * clamp(local.y * 6.0 + 0.5, 0.0, 1.0);
          vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        #include <common>
        #include <fog_pars_fragment>
        varying vec3 vCol; varying float vShade;
        void main() { gl_FragColor = vec4(vCol * vShade, 1.0);
          #include <fog_fragment>
        }`,
      fog: true, side: THREE.DoubleSide,
    });
    fm.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]);
    Object.assign(fm.uniforms, schoolU);
    const fish = new THREE.Mesh(ig, fm);
    fish.frustumCulled = false;
    fish.userData.noCull = true;
    fish.userData.noBatch = true;
    fish.raycast = () => {};
    W.scene.add(fish);
    st_fish = fish;
  }

  // ------------------------------------------------------------------ THE CRAWLER: a seabed miner
  const crawler = (() => {
    const g = new THREE.Group();
    const hullM = addCaustics(new THREE.MeshStandardMaterial({ color: 0xc8a030, metalness: 0.6, roughness: 0.55 }), 0.8);
    const darkM = addCaustics(new THREE.MeshStandardMaterial({ color: 0x23282c, metalness: 0.7, roughness: 0.5 }), 0.8);
    const lampM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff2c8).multiplyScalar(2), fog: false });
    const beamM = new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
    const add = (geo, m, x, y, z) => {
      const o = new THREE.Mesh(geo, m);
      o.position.set(x, y, z);
      o.raycast = () => {};
      g.add(o);
      return o;
    };
    // tracks, body, cab, the dredge drum on its arms, a crane boom with drill heads
    for (const s of [-1, 1]) {
      add(new THREE.BoxGeometry(30, 5, 6), darkM, 0, 2.5, s * 9);
      for (let k = -3; k <= 3; k++) add(new THREE.CylinderGeometry(2.2, 2.2, 6.4, 10).rotateX(Math.PI / 2), darkM, k * 4.2, 2.4, s * 9);
    }
    add(new THREE.BoxGeometry(26, 7, 14), hullM, -1, 8, 0);
    add(new THREE.BoxGeometry(8, 5, 10), hullM, -8, 14, 0);
    add(new THREE.BoxGeometry(7.6, 1.2, 10.2), lampM, -8, 13.8, 0).scale.set(1, 0.15, 1);
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(12, 2, 1.6), darkM, 15, 5, s * 6);
    const drum = add(new THREE.CylinderGeometry(3.4, 3.4, 13, 14).rotateX(Math.PI / 2), darkM, 21, 3.6, 0);
    for (let k = 0; k < 12; k++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.6, 5), hullM);
      const a = (k / 12) * Math.PI * 2;
      spike.position.set(Math.cos(a) * 3.8, Math.sin(a) * 3.8, ((k % 3) - 1) * 4);
      spike.rotation.z = a - Math.PI / 2;
      drum.add(spike);
    }
    const boom = add(new THREE.BoxGeometry(22, 1.4, 1.4), hullM, 2, 18, 0);
    boom.rotation.z = 0.5;
    const drill = add(new THREE.CylinderGeometry(0.6, 1.4, 6, 8), darkM, 11, 20, 0);
    // work lights: lamps and long beams down into the silt
    const beams = [];
    for (const [x, y, z, rx] of [[12, 12, -6, -0.9], [12, 12, 6, -0.9], [-12, 13, -7, -0.6], [-12, 13, 7, -0.6], [-4, 17, 0, -1.2]]) {
      add(new THREE.SphereGeometry(0.6, 8, 6), lampM, x, y, z);
      const beam = add(new THREE.ConeGeometry(6, 30, 12, 1, true).translate(0, -15, 0), beamM, x, y, z);
      beam.rotation.z = rx;
      beams.push(beam);
    }
    g.position.set(78, FLOOR_Y - 0.5, -52);
    g.rotation.y = Math.PI / 2; // (crawling along the trench, drum north)
    g.userData.noCull = true;
    W.scene.add(g);
    // the silt it boils up: points emitted at the drum, rising and spreading (one draw)
    const N = 260, pos = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) seed[i] = rng() * 100;
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const silt = new THREE.Points(sg, new THREE.ShaderMaterial({
      uniforms: { uT: time, uScale: { value: 300 }, uO: { value: V() }, uF: { value: V(0, 0, -1) } },
      vertexShader: `uniform float uT, uScale; uniform vec3 uO, uF; attribute float aSeed; varying float vA;
        void main(){ float ph = fract(uT * (0.05 + fract(aSeed) * 0.05) + fract(aSeed * 0.13));
          vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), uF));
          vec3 p = uO + side * (fract(aSeed * 7.3) - 0.5) * 14.0 + uF * (-ph * 22.0) + vec3(0.0, ph * 16.0 + sin(aSeed) * 2.0, 0.0) + side * sin(uT * 0.3 + aSeed) * ph * 8.0;
          vec4 mv = viewMatrix * vec4(p, 1.0); gl_PointSize = clamp((2.0 + ph * 6.0) * uScale / max(-mv.z, 1.0), 2.0, 120.0);
          vA = smoothstep(0.0, 0.1, ph) * (1.0 - ph) * smoothstep(120.0, 30.0, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vA; void main(){ float r = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.05, r) * vA * 0.35; gl_FragColor = vec4(vec3(0.55, 0.62, 0.55) * 1.2, a); }`,
      transparent: true, depthWrite: false, fog: false,
    }));
    silt.frustumCulled = false;
    silt.userData.noCull = true;
    silt.raycast = () => {};
    W.scene.add(silt);
    return { g, drum, drill, beams, silt, t: 0, hum: null, hg: 0 };
  })();

  // ------------------------------------------------------------------ the LEVIATHAN PUPPET
  const pup = (() => {
    const SEG = 24, SP = 2.1;
    const RAD = Array.from({ length: SEG }, (_, i) => {
      const t = i / (SEG - 1);
      return (0.45 + 1.85 * Math.pow(1 - t, 0.8) * Math.min(1, 0.85 + t * 2.2)) * 1.7;
    });
    const armor = new THREE.MeshStandardMaterial({ color: 0x1d3046, metalness: 0.6, roughness: 0.38, flatShading: true, emissive: 0x03121f, emissiveIntensity: 1 });
    const glowM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x2fd8ff).multiplyScalar(1.6), fog: false });
    const eyeM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xbff8ff).multiplyScalar(2.5), fog: false });
    const segs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), armor, SEG);
    const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 6, 4), glowM, SEG * 2);
    const head = new THREE.Group();
    const skull = new THREE.Mesh(new THREE.ConeGeometry(2.6, 7.5, 7).rotateZ(-Math.PI / 2), armor);
    skull.position.x = 2.5;
    head.add(skull);
    const jaw = new THREE.Mesh(new THREE.ConeGeometry(1.9, 6, 6).rotateZ(-Math.PI / 2), armor);
    jaw.position.set(2.2, -1.2, 0);
    jaw.rotation.z = -0.15;
    head.add(jaw);
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), eyeM);
      e.position.set(3.2, 0.7, s * 1.6);
      head.add(e);
    }
    for (const o of [segs, dots, head]) {
      o.frustumCulled = false;
      o.userData.noCull = true;
      o.visible = false;
      o.traverse?.((c) => (c.raycast = () => {}));
      W.scene.add(o);
    }
    segs.raycast = dots.raycast = () => {};
    const path = { curve: null, len: 1, s: 0, speed: 10, done: true, onEnd: null };
    const pts = Array.from({ length: SEG + 1 }, () => V());
    const _t = V();
    // a point d m along the path (held straight past its ends: it swims in from and out to off-path points)
    const at = (d, out) => {
      const u = d / path.len;
      if (u <= 0) return path.curve.getPointAt(0, out).addScaledVector(path.curve.getTangentAt(0, _t), d);
      if (u >= 1) return path.curve.getPointAt(1, out).addScaledVector(path.curve.getTangentAt(1, _t), d - path.len);
      return path.curve.getPointAt(u, out);
    };
    function play(points, { speed = 10, onEnd = null } = {}) {
      path.curve = new THREE.CatmullRomCurve3(points.map((p) => V(...p)));
      path.len = path.curve.getLength();
      path.s = 0;
      path.speed = speed;
      path.done = false;
      path.onEnd = onEnd;
      segs.visible = dots.visible = head.visible = true;
    }
    function update(dt) {
      if (path.done) return;
      path.s += path.speed * dt;
      const tailLen = SEG * SP + 4;
      if (path.s > path.len + tailLen) {
        path.done = true;
        segs.visible = dots.visible = head.visible = false;
        path.onEnd?.();
        return;
      }
      at(path.s, pts[0]);
      at(path.s - 0.5, _u);
      head.position.copy(pts[0]);
      _w.subVectors(pts[0], _u).normalize();
      head.quaternion.setFromUnitVectors(_v.set(1, 0, 0), _w);
      jaw.rotation.z = -0.15 - Math.max(0, Math.sin(path.s * 0.3)) * 0.25;
      for (let i = 0; i < SEG; i++) {
        const d = path.s - 3 - i * SP;
        at(d, pts[i + 1]);
        const wob = Math.sin(time.value * 1.6 - i * 0.45) * 0.8 * (i / SEG);
        pts[i + 1].y += wob * 0.4;
        const r = RAD[i];
        _q.identity();
        segs.setMatrixAt(i, _m.compose(pts[i + 1], _q, _s.set(r * 1.25, r, r)));
        // two glowing marks per segment, along its flanks
        at(d + 0.6, _u);
        _w.subVectors(pts[i + 1], _u).normalize();
        _v.crossVectors(_w, _u.set(0, 1, 0)).normalize();
        for (let k = 0; k < 2; k++) {
          const s = k ? 1 : -1;
          _u.copy(pts[i + 1]).addScaledVector(_v, s * r * 0.95);
          _u.y += r * 0.25;
          dots.setMatrixAt(i * 2 + k, _m.compose(_u, _q, _s.setScalar(1 + (i % 3 === 0 ? 0.6 : 0) + Math.sin(time.value * 2 + i) * 0.15)));
        }
      }
      segs.instanceMatrix.needsUpdate = true;
      dots.instanceMatrix.needsUpdate = true;
      // fish flee from its head
      for (const sc of school) if (sc.pos.distanceTo(pts[0]) < 26) sc.scatter = 1;
    }
    return { play, update, head, get active() { return !path.done; }, get pos() { return pts[0]; } };
  })();

  // ------------------------------------------------------------------ the clock
  W.add({
    update(dt, player) {
      time.value += dt;
      const cam = game.camera.position;
      const here = cam.x > 25 && cam.y < SEA_Y + 20;
      silMat.color.copy(fogCol).multiplyScalar(0.6);
      // schools wheel in loops round their homes
      for (const s of school) {
        s.a += dt * s.speed * (1 + s.scatter * 3);
        const px = s.c[0] + Math.cos(s.a) * s.r[0] * 1.6, pz = s.c[2] + Math.sin(s.a * 1.3) * s.r[2] * 1.6, py = s.c[1] + Math.sin(s.a * 0.7) * 2;
        _v.set(px, py, pz);
        s.dir.subVectors(_v, s.pos);
        if (s.dir.lengthSq() < 1e-6) s.dir.set(1, 0, 0);
        s.pos.copy(_v);
        s.scatter = Math.max(0, s.scatter - dt * 0.35);
        schoolU.uC.value[s.i].set(s.pos.x, s.pos.y, s.pos.z, s.scatter);
        schoolU.uD.value[s.i].set(s.dir.x, s.dir.y * 0.3, s.dir.z, 0);
      }
      if (st_fish) st_fish.visible = here;
      // the crawler grinds south and north along the trench's end, drum turning
      const c = crawler;
      c.t += dt;
      c.g.visible = here;
      c.silt.visible = here;
      if (here) {
        const z = -54 + Math.sin(c.t * 0.025) * 6;
        c.g.position.z = z;
        c.drum.rotation.z -= dt * 1.1;
        c.drill.rotation.y += dt * 4;
        c.silt.material.uniforms.uO.value.set(c.g.position.x, FLOOR_Y + 1, z - 21);
        c.silt.material.uniforms.uScale.value = game.renderer.domElement.height / 2;
        // its deep thrum, by distance (a stand-in until seabed_machine exists)
        const d = cam.distanceTo(c.g.position);
        const want = d < 110 ? 0.28 * (1 - d / 110) : 0;
        c.hg += (want - c.hg) * Math.min(1, dt * 2);
        if (!c.hum && c.hg > 0.01) c.hum = audio.createLoop(audio.sfxOr('seabed_machine', 'reactor_hum'), { gain: 0, rate: audio.available?.has('seabed_machine') ? 1 : 0.45 });
        c.hum?.setGain(c.hg);
      } else c.hum?.setGain(0);
      farLights[0].material.uniforms.uScale.value = game.renderer.domElement.height / 2;
      pup.update(dt);
    },
  });

  return { floorAt, puppet: pup, crawler, schools: school };
}
