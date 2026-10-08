// VERDANT: a carved stone relic grown through with vines. Rune glyphs and bioluminescent bulbs
// breathe on its flank, leaves flutter, and roots cradle a living green crystal. Springy: it
// wobbles back into place after each shot.
import * as THREE from 'three';
import { Kit, part, group, glow, setGlow, tube, rough, CYL_Z } from './kit.js';

const BIO = new THREE.Color(0x22e862);
const WHITE = new THREE.Color(0xffffff);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

export function buildVerdant(hex) {
  const root = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0x4c5745, metalness: 0, roughness: 0.95, flatShading: true });
  const carved = new THREE.MeshStandardMaterial({ color: 0x434b3e, metalness: 0, roughness: 0.95, flatShading: true });
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a3c26, metalness: 0, roughness: 0.85 });
  const vine = new THREE.MeshStandardMaterial({ color: 0x2f6a2a, metalness: 0, roughness: 0.7 });
  const moss = new THREE.MeshStandardMaterial({ color: 0x4f8f34, metalness: 0, roughness: 1, flatShading: true });
  const rune = glow(BIO, 1.4);
  const kit = new Kit();
  // the carved body: a weathered eight-sided stone barrel tapering forward, collared, with glowing
  // glyphs cut into the face you see
  const oct = (r0, r1, len, mat, z, seg = 1, k = 0) => kit.add(rough(new THREE.CylinderGeometry(r0, r1, len, 8, seg), k, z), mat, [0, 0, z], CYL_Z);
  const radiusAt = (z) => 0.068 + ((z + 0.18) / 0.36) * 0.018; // back is wider
  oct(0.086, 0.068, 0.36, stone, 0, 5, 0.005);
  for (const z of [-0.14, 0.12]) oct(radiusAt(z) + 0.009, radiusAt(z) + 0.009, 0.03, carved, z, 1, 0.003);
  oct(0.07, 0.06, 0.02, carved, 0.185);
  oct(0.052, 0.072, 0.05, carved, -0.2, 1, 0.003);
  // glyph strokes on the upper-left face (the one you see): [along the face, z, length across, length along z]
  const fa = Math.atan2(0.383, -0.924); // that face's normal, in barrel space
  const glyph = (u, z, hu, hz) => {
    const d = radiusAt(z) * 0.924 + 0.001;
    kit.add(new THREE.BoxGeometry(0.004, hu, hz), rune, [Math.cos(fa) * d - Math.sin(fa) * u, Math.sin(fa) * d + Math.cos(fa) * u, z], [0, 0, fa]);
  };
  glyph(0, -0.02, 0.036, 0.006);
  glyph(0.012, -0.034, 0.006, 0.022);
  glyph(-0.012, -0.006, 0.006, 0.022);
  glyph(0, 0.02, 0.006, 0.03);
  glyph(0.01, 0.04, 0.026, 0.006);
  // a gnarled root stock and grip
  kit.add(tube([[0, 0.01, 0.15], [0, -0.005, 0.21], [0, -0.035, 0.25], [0, -0.075, 0.27]], 0.036, 12, 7), wood);
  kit.add(new THREE.SphereGeometry(0.036, 7, 5), wood, [0, -0.075, 0.27]);
  kit.add(tube([[0, -0.04, 0.06], [0.006, -0.1, 0.08], [-0.006, -0.16, 0.11], [0, -0.21, 0.14]], 0.026, 12, 7), wood);
  kit.add(tube([[0.03, -0.05, 0.12], [-0.035, -0.09, 0.1], [0.03, -0.13, 0.12], [-0.03, -0.17, 0.11], [0.0, -0.205, 0.13]], 0.008, 24, 5), vine);
  kit.add(tube([[-0.04, 0.05, 0.3], [-0.045, -0.04, 0.26], [0.0, -0.06, 0.22], [0.045, 0.04, 0.2], [0.0, 0.085, 0.15]], 0.008, 20, 5), vine);
  // two vines spiralling the barrel
  for (const a0 of [0, Math.PI]) {
    const pts = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      const a = a0 + t * Math.PI * 3.2;
      const r = 0.088 + Math.sin(i * 2.3 + a0) * 0.004;
      pts.push([Math.cos(a) * r, Math.sin(a) * r, 0.2 - t * 0.4]);
    }
    // one vine, one glowing tendril
    kit.add(tube(pts, a0 ? 0.0045 : 0.0075, 56, 5), a0 ? rune : vine);
  }
  // moss along the top ridge
  const clump = new THREE.IcosahedronGeometry(1, 0);
  [[-0.14, 0.022], [-0.07, 0.026], [0.02, 0.02], [0.13, 0.024]].forEach(([z, r], i) => kit.add(clump, moss, [i % 2 ? 0.008 : -0.01, radiusAt(z) * 0.96, z], [i, i * 2, 0], [r, r * 0.45, r * 1.4]));
  // roots reaching forward to cradle the crystal
  for (let i = 0; i < 3; i++) {
    const a = Math.PI / 2 + (i / 3) * Math.PI * 2;
    const at = (r, z) => [Math.cos(a) * r, Math.sin(a) * r, z];
    kit.add(tube([at(0.058, -0.2), at(0.086, -0.26), at(0.07, -0.34), at(0.026, -0.4)], 0.0095, 16, 5), wood);
  }
  kit.build(root);

  // bioluminescent bulbs on the flank and top (instanced so each can breathe on its own)
  const BULBS = [
    [-0.086, 0.045, -0.05, 0.017],
    [-0.09, -0.035, 0.07, 0.013],
    [-0.072, 0.07, 0.1, 0.015],
    [-0.088, -0.01, -0.15, 0.012],
    [-0.035, 0.088, -0.1, 0.013],
    [0.045, 0.088, 0.03, 0.014],
    [-0.05, 0.08, 0.16, 0.011],
  ];
  // each bulb is a glassy green skin around a hot core
  const shellMat = new THREE.MeshStandardMaterial({ color: 0x40ff80, emissive: BIO, emissiveIntensity: 0.5, roughness: 0.25, transparent: true, opacity: 0.55, depthWrite: false });
  const ball = new THREE.SphereGeometry(1, 12, 8);
  const cores = new THREE.InstancedMesh(ball, new THREE.MeshBasicMaterial({ color: 0xffffff }), BULBS.length);
  cores.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(BULBS.length * 3), 3);
  const shells = new THREE.InstancedMesh(ball, shellMat, BULBS.length);
  // instances move every frame and the view model is always on screen anyway
  cores.frustumCulled = shells.frustumCulled = false;
  root.add(cores, shells);
  const stalks = new Kit();
  BULBS.forEach(([x, y, z, r]) => stalks.add(new THREE.ConeGeometry(r * 0.7, r * 1.2, 5), vine, [x * 0.93, y * 0.93, z], [0, 0, Math.atan2(y, x) - Math.PI / 2]));
  stalks.build(root);

  // leaves sprouting from the vines; each flutters on its own
  const leafGeo = new THREE.SphereGeometry(1, 8, 5);
  leafGeo.scale(0.017, 0.0035, 0.034).translate(0, 0, 0.03);
  const LEAVES = [
    [-0.09, 0.03, 0.15, 0.4, -0.9, 0.6],
    [-0.085, -0.05, -0.05, -0.5, -1.4, -0.3],
    [0.02, 0.09, -0.16, 0.9, 0.3, 0.2],
    [-0.06, 0.07, 0.03, 0.6, -0.6, 1.0],
    [0.07, 0.06, 0.18, 0.5, 1.1, -0.4],
    [-0.07, -0.07, 0.2, -0.8, -1.0, 0.5],
    [-0.04, 0.05, 0.3, 0.7, -0.5, 0.0],
  ];
  const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshStandardMaterial({ color: 0x2a7a2a, roughness: 0.55, side: THREE.DoubleSide }), LEAVES.length);
  leaves.frustumCulled = false;
  root.add(leaves);

  // the living crystal, with a hot seed inside
  const crystalMat = new THREE.MeshStandardMaterial({ color: 0x2aa860, emissive: 0x10a040, emissiveIntensity: 1, roughness: 0.25, metalness: 0.1, flatShading: true, transparent: true, opacity: 0.88 });
  const crystal = part(root, new THREE.OctahedronGeometry(0.058, 0), crystalMat, [0, 0, -0.335], 0, [1, 1, 1.5]);
  const seed = part(root, new THREE.SphereGeometry(0.018, 10, 8), glow(hex, 2.6), [0, 0, -0.335]);

  const muzzle = group(root, [0, 0, -0.42]);
  let jx = 0; // bulb jiggle spring
  let jv = 0;
  let flare = 0;

  return {
    root,
    muzzle,
    light: 0x46ff80,
    spring: { omega: 15, zeta: 0.24 },
    kick: { z: 0.05, pitch: 0.13, roll: 0.05, yaw: 0.02 },
    fire() {
      jv += 9;
      flare = 1;
    },
    update(dt, t) {
      flare = Math.max(0, flare - dt * 6);
      const sub = Math.max(1, Math.ceil(dt * 120));
      for (let i = 0; i < sub; i++) {
        const h = dt / sub;
        jv += (-420 * jx - 8 * jv) * h;
        jx += jv * h;
      }
      jx = THREE.MathUtils.clamp(jx, -1, 1);
      BULBS.forEach(([x, y, z, r], i) => {
        const breath = 0.5 + 0.5 * Math.sin(t * 1.7 + i * 1.9);
        const k = Math.max(0.001, r * (1 + breath * 0.15 + jx * (0.4 + (i % 3) * 0.15)));
        shells.setMatrixAt(i, _m.compose(_p.set(x, y, z), _q.identity(), _s.setScalar(k)));
        cores.setMatrixAt(i, _m.compose(_p, _q, _s.setScalar(k * (0.45 + breath * 0.2 + flare * 0.2))));
        cores.setColorAt(i, _c.copy(BIO).lerp(WHITE, 0.25).multiplyScalar(1.1 + breath * 0.8 + flare * 1.2));
      });
      shells.instanceMatrix.needsUpdate = true;
      cores.instanceMatrix.needsUpdate = true;
      cores.instanceColor.needsUpdate = true;
      shellMat.emissiveIntensity = 0.35 + Math.sin(t * 1.3) * 0.1 + flare * 0.6;
      LEAVES.forEach(([x, y, z, rx, ry, rz], i) => {
        const flutter = Math.sin(t * (2.2 + i * 0.37) + i) * 0.18 + jx * 0.4;
        _q.setFromEuler(_e.set(rx + flutter, ry, rz + flutter * 0.5));
        leaves.setMatrixAt(i, _m.compose(_p.set(x, y, z), _q, _s.setScalar(1)));
      });
      leaves.instanceMatrix.needsUpdate = true;
      setGlow(rune, BIO, 0.9 + Math.sin(t * 1.1) * 0.35 + flare * 1.2);
      crystal.rotation.z += dt * (0.7 + flare * 6);
      crystal.position.y = Math.sin(t * 1.9) * 0.004;
      crystal.scale.set(1 + flare * 0.25, 1 + flare * 0.25, 1.5 - flare * 0.3);
      crystalMat.emissiveIntensity = 0.9 + Math.sin(t * 2.6) * 0.2 + flare * 1.5;
      seed.position.y = crystal.position.y;
      seed.scale.setScalar(1 + flare * 0.8);
      // an organic, breathing sway
      root.rotation.z = Math.sin(t * 0.9) * 0.03;
      root.rotation.x = Math.sin(t * 0.7 + 1) * 0.015;
      root.rotation.y = Math.sin(t * 0.55) * 0.012;
      root.position.y = Math.sin(t * 1.2) * 0.004;
      return 0.4 + Math.sin(t * 1.7) * 0.1 + flare * 0.4;
    },
  };
}
