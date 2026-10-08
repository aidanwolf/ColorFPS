// CRIMSON: a chunky foundry cannon. Riveted dark steel, a boiler on the back, red-hot vents and
// coils that build heat as you fire, and a three-barrel cluster that spins up. Kicks hard.
import * as THREE from 'three';
import { Kit, group, glow, setGlow, tube, CYL_Z } from './kit.js';

const HOT = new THREE.Color(0xff3010);
const WHITE_HOT = new THREE.Color(0xffa040);
const _c = new THREE.Color();

export function buildCrimson(hex) {
  const root = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x646a76, metalness: 0.85, roughness: 0.4 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1e1f25, metalness: 0.75, roughness: 0.55 });
  const copper = new THREE.MeshStandardMaterial({ color: 0xa8603a, metalness: 0.9, roughness: 0.32 });
  const hazard = new THREE.MeshStandardMaterial({ color: 0xc89a20, metalness: 0.3, roughness: 0.6 });
  const hot = glow(HOT, 1); // vents, coils and bores: brightness follows the heat
  const core = glow(hex, 2.4);
  const kit = new Kit();
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

  // receiver: a heavy block with bolted side plates
  kit.add(box(0.18, 0.16, 0.34), steel, [0, 0, 0.02]);
  kit.add(box(0.03, 0.13, 0.3), dark, [-0.098, 0, 0.02]);
  kit.add(box(0.03, 0.13, 0.3), dark, [0.098, 0, 0.02]);
  const rivet = new THREE.SphereGeometry(0.0085, 6, 4);
  for (const x of [-0.114, 0.114])
    for (const y of [-0.052, 0.052]) for (const z of [-0.11, -0.03, 0.07, 0.15]) kit.add(rivet, steel, [x, y, z]);
  // left-side vents (the side you see): glowing slots behind steel louvres
  for (let i = 0; i < 3; i++) {
    const y = -0.03 + i * 0.03;
    kit.add(box(0.006, 0.014, 0.16), hot, [-0.114, y, 0.02]);
    kit.add(box(0.012, 0.007, 0.17), dark, [-0.118, y + 0.013, 0.02], [0, 0, -0.5]);
  }
  kit.add(box(0.014, 0.006, 0.17), dark, [-0.118, -0.047, 0.02]);
  // top: a heat sink with the glow showing between its fins, and a hazard-striped strap
  kit.add(box(0.14, 0.03, 0.26), dark, [0, 0.093, -0.01]);
  kit.add(box(0.11, 0.008, 0.24), hot, [0, 0.112, -0.01]);
  for (let i = 0; i < 7; i++) kit.add(box(0.15, 0.04, 0.012), steel, [0, 0.124, -0.12 + i * 0.037]);
  for (let i = 0; i < 4; i++) kit.add(box(0.186, 0.168, 0.012), i % 2 ? dark : hazard, [0, 0, 0.135 + i * 0.012]);
  // boiler on the back with copper bands and a glowing sight glass
  kit.add(new THREE.CylinderGeometry(0.075, 0.075, 0.13, 14), dark, [0, 0.01, 0.255], CYL_Z);
  for (const z of [0.205, 0.255, 0.305]) kit.add(new THREE.TorusGeometry(0.077, 0.009, 6, 18), copper, [0, 0.01, z]);
  kit.add(new THREE.CylinderGeometry(0.068, 0.072, 0.02, 14), steel, [0, 0.01, 0.325], CYL_Z);
  kit.add(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 12), hot, [0, 0.01, 0.336], CYL_Z);
  kit.add(new THREE.TorusGeometry(0.032, 0.007, 6, 14), copper, [0, 0.01, 0.338]);
  // a copper feed pipe from the boiler to the coils
  kit.add(tube([[-0.07, -0.05, 0.25], [-0.105, -0.07, 0.16], [-0.11, -0.075, -0.05], [-0.085, -0.06, -0.17]], 0.011, 20, 6), copper);
  // grip and guard
  kit.add(box(0.07, 0.17, 0.09), dark, [0, -0.15, 0.1], [0.3, 0, 0]);
  kit.add(box(0.074, 0.02, 0.12), steel, [0, -0.085, 0.06]);
  kit.add(box(0.02, 0.07, 0.012), steel, [0, -0.12, 0.005]);
  // coil housing around the barrel root, wound with red-hot coils
  kit.add(new THREE.CylinderGeometry(0.08, 0.09, 0.12, 8), steel, [0, 0.005, -0.2], CYL_Z);
  for (const z of [-0.16, -0.2, -0.24]) kit.add(new THREE.TorusGeometry(0.091, 0.013, 6, 16), hot, [0, 0.005, z]);
  kit.add(new THREE.CylinderGeometry(0.095, 0.095, 0.02, 8), dark, [0, 0.005, -0.138], CYL_Z);
  kit.build(root);

  // the barrel cluster spins about the bore axis
  const cluster = group(root, [0, 0.005, -0.26]);
  const ck = new Kit();
  ck.add(new THREE.CylinderGeometry(0.07, 0.07, 0.024, 12), dark, [0, 0, -0.01], CYL_Z);
  ck.add(new THREE.CylinderGeometry(0.068, 0.068, 0.03, 12), steel, [0, 0, -0.29], CYL_Z);
  ck.add(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 12), dark, [0, 0, -0.15], CYL_Z);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const x = Math.cos(a) * 0.04;
    const y = Math.sin(a) * 0.04;
    ck.add(new THREE.CylinderGeometry(0.021, 0.023, 0.31, 10), steel, [x, y, -0.15], CYL_Z);
    ck.add(new THREE.CylinderGeometry(0.025, 0.025, 0.022, 10), dark, [x, y, -0.315], CYL_Z);
    ck.add(new THREE.CylinderGeometry(0.012, 0.012, 0.004, 8), hot, [x, y, -0.327], CYL_Z);
  }
  ck.add(new THREE.CylinderGeometry(0.016, 0.016, 0.012, 8), core, [0, 0, -0.31], CYL_Z);
  ck.build(cluster);

  const muzzle = group(root, [0, 0.005, -0.6]);
  let heat = 0;
  let flash = 0;
  let spin = 0.8;

  return {
    root,
    muzzle,
    light: 0xff4a22,
    spring: { omega: 15, zeta: 0.75 },
    kick: { z: 0.05, pitch: 0.09, roll: -0.035, yaw: 0.015 },
    fire() {
      heat = Math.min(1, heat + 0.12);
      flash = 1;
      spin = Math.min(30, spin + 9);
    },
    update(dt, t) {
      heat = Math.max(0, heat - dt * 0.45);
      flash = Math.max(0, flash - dt * 9);
      spin += (0.8 - spin) * Math.min(1, dt * 2.2);
      cluster.rotation.z += spin * dt;
      // vents pulse slowly at rest, flare with every shot and run white-hot under sustained fire
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.4);
      _c.copy(HOT).lerp(WHITE_HOT, heat * 0.7);
      setGlow(hot, _c, 0.45 + pulse * 0.3 + heat * 1.8 + flash * 0.9);
      // a heavy, slow breath
      root.position.y = Math.sin(t * 1.5) * 0.003;
      root.rotation.z = Math.sin(t * 0.8) * 0.006;
      return 0.35 + heat * 1.2 + pulse * 0.15; // muzzle light at rest
    },
  };
}
