// AZURE: a cryo-station frame overgrown with translucent ice. A cold core glows through the
// facets, frost crusts the edges, and a crystal floats between three ice prongs, turning,
// with shards in orbit around it. Crisp: a tight, precise kick.
import * as THREE from 'three';
import { Kit, part, group, glow, setGlow, CYL_Z } from './kit.js';

const COLD = new THREE.Color(0x5ab4ff);
const LIFT = 0.02; // the crystal floats a little above the bore line, clear of the neck

export function buildAzure(hex) {
  const root = new THREE.Group();
  const frame = new THREE.MeshStandardMaterial({ color: 0x2c3850, metalness: 0.85, roughness: 0.3 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x6a7a94, metalness: 0.9, roughness: 0.3 });
  const ice = new THREE.MeshStandardMaterial({ color: 0xa8dcff, emissive: 0x123a66, metalness: 0.2, roughness: 0.06, transparent: true, opacity: 0.5, flatShading: true });
  const frost = new THREE.MeshStandardMaterial({ color: 0xe8f6ff, emissive: 0x203040, metalness: 0, roughness: 0.85, flatShading: true });
  const cold = glow(COLD, 1.4);
  const core = glow(hex, 2.4);
  const kit = new Kit();
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const octa = new THREE.OctahedronGeometry(1, 0);
  const shard = new THREE.TetrahedronGeometry(1, 0);

  // the station frame: a narrow spine with a cold rod down its middle
  kit.add(box(0.06, 0.07, 0.34), frame, [0, -0.01, 0.02]);
  kit.add(box(0.07, 0.012, 0.3), trim, [0, -0.048, 0.02]);
  kit.add(new THREE.CylinderGeometry(0.014, 0.014, 0.4, 8), cold, [0, 0.03, -0.01], CYL_Z);
  // cryo canister on the back, with glowing window strips
  kit.add(new THREE.CylinderGeometry(0.044, 0.044, 0.1, 12), frame, [0, 0, 0.24], CYL_Z);
  for (const z of [0.195, 0.285]) kit.add(new THREE.CylinderGeometry(0.048, 0.048, 0.012, 12), trim, [0, 0, z], CYL_Z);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI * 0.75 + i * (Math.PI / 6);
    kit.add(box(0.006, 0.01, 0.065), cold, [Math.cos(a) * 0.045, Math.sin(a) * 0.045, 0.24], [0, 0, a]);
  }
  kit.add(new THREE.CylinderGeometry(0.034, 0.04, 0.014, 12), trim, [0, 0, 0.296], CYL_Z);
  kit.add(new THREE.CylinderGeometry(0.017, 0.017, 0.006, 10), core, [0, 0, 0.304], CYL_Z);
  // grip
  kit.add(box(0.055, 0.16, 0.075), frame, [0, -0.13, 0.1], [0.28, 0, 0]);
  kit.add(box(0.06, 0.02, 0.08), trim, [0, -0.2, 0.12], [0.28, 0, 0]);
  // ice grown over the spine: a long slab on top and facets down the flanks, the rod glowing through
  kit.add(octa, ice, [0, 0.04, 0.0], [0, 0, 0], [0.062, 0.052, 0.21]);
  kit.add(octa, ice, [-0.04, 0.0, 0.05], [0, 0.15, 0.3], [0.03, 0.05, 0.13]);
  kit.add(octa, ice, [0.04, 0.0, 0.02], [0, -0.15, -0.3], [0.03, 0.05, 0.13]);
  kit.add(octa, ice, [-0.03, 0.02, -0.14], [0.1, 0.1, 0.5], [0.025, 0.04, 0.09]);
  // crystals jutting up and back at the rear, like growth on a cold pipe
  [[-0.02, 0.08, 0.13, -0.6, 0.2, 0.25, 0.018, 0.075], [0.015, 0.085, 0.09, -0.4, -0.2, -0.2, 0.014, 0.06], [-0.035, 0.06, 0.18, -0.8, 0.5, 0.6, 0.013, 0.05], [0.0, 0.07, 0.2, -0.9, 0, 0, 0.012, 0.045]].forEach(
    ([x, y, z, rx, ry, rz, w, h]) => kit.add(octa, ice, [x, y, z], [rx, ry, rz], [w, h, w]),
  );
  // frost crusting the frame's edges and the grip
  [[-0.032, 0.025, 0.12], [-0.034, -0.04, 0.0], [-0.03, 0.03, -0.1], [0.03, 0.03, 0.15], [-0.03, -0.1, 0.09], [-0.028, -0.035, 0.18], [0.0, 0.06, 0.06]].forEach(([x, y, z], i) =>
    kit.add(shard, frost, [x, y, z], [i, i * 1.7, i * 0.6], 0.011 + (i % 3) * 0.004),
  );
  // neck, frost ring and the three ice prongs that hold the crystal
  kit.add(new THREE.CylinderGeometry(0.035, 0.045, 0.06, 8), frame, [0, 0, -0.18], CYL_Z);
  kit.add(new THREE.TorusGeometry(0.046, 0.012, 5, 8), frost, [0, 0, -0.205]);
  for (let i = 0; i < 3; i++) {
    // spaced so the gap between two of them faces you (upper left) and the crystal shows through
    const a = (100 / 180) * Math.PI + (i / 3) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    // each prong leans out from the axis toward its tip
    kit.add(octa, ice, [c * 0.072, LIFT + s * 0.072, -0.29], [-s * 0.32, c * 0.32, a], [0.015, 0.026, 0.1]);
    kit.add(shard, frost, [c * 0.042, s * 0.042, -0.215], [i, i, i], 0.012);
  }
  kit.build(root);

  // the floating crystal and its orbiting shards
  const crystalMat = new THREE.MeshStandardMaterial({ color: 0x2a5cff, emissive: 0x1a4cff, emissiveIntensity: 1.4, metalness: 0, roughness: 0.4, flatShading: true });
  const crystal = part(root, new THREE.OctahedronGeometry(0.056, 0), crystalMat, [0, LIFT, -0.335], 0, [1, 1, 1.6]);
  const heart = part(root, new THREE.SphereGeometry(0.017, 8, 6), core, [0, LIFT, -0.335]);
  const orbit = group(root, [0, LIFT, -0.335]);
  const ok = new Kit();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    ok.add(octa, glow(COLD, 1.6), [Math.cos(a) * 0.078, Math.sin(a) * 0.078, 0], [0, 0, a], [0.008, 0.017, 0.008]);
  }
  ok.build(orbit);
  const orbitMat = orbit.children[0].material;

  const muzzle = group(root, [0, LIFT, -0.42]);
  let spin = 0;
  let pulse = 0;

  return {
    root,
    muzzle,
    light: 0x5aa8ff,
    spring: { omega: 32, zeta: 0.92 },
    kick: { z: 0.032, pitch: 0.05, roll: -0.012, yaw: 0 },
    fire() {
      spin = Math.min(40, spin + 14);
      pulse = 1;
    },
    update(dt, t) {
      spin = Math.max(0, spin - dt * spin * 7);
      pulse = Math.max(0, pulse - dt * 10);
      // the crystal contracts sharply on a shot and snaps back, spinning hard
      const bob = Math.sin(t * 2.2) * 0.006;
      crystal.position.y = LIFT + bob;
      crystal.rotation.z += dt * (1.1 + spin);
      crystal.rotation.y = Math.sin(t * 0.9) * 0.3;
      const k = 1 - pulse * 0.3;
      crystal.scale.set(k, k, 1.6 * (1 + pulse * 0.2));
      crystalMat.emissiveIntensity = 1.3 + Math.sin(t * 3.1) * 0.2 + pulse * 1.6;
      heart.position.y = LIFT + bob;
      heart.scale.setScalar(1 + pulse);
      orbit.position.y = LIFT + bob;
      orbit.rotation.z -= dt * (1.8 + spin * 0.4);
      orbit.scale.setScalar(1 + pulse * 0.6);
      setGlow(orbitMat, COLD, 1.4 + pulse * 1.2);
      setGlow(cold, COLD, 1.5 + Math.sin(t * 1.4) * 0.25 + pulse * 0.8);
      // steady and precise: barely any idle drift
      root.position.y = Math.sin(t * 1.1) * 0.002;
      return 0.4 + pulse * 0.6;
    },
  };
}
