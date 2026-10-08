// AZURE: a crisp, angular rifle. A faceted navy frame under a white frost plate, one hexagonal
// blue core glowing through both flanks, a slim hex barrel and an ice crystal at the tip that spins
// hard with every shot. Precise: a tight, crisp kick.
import * as THREE from 'three';
import { Kit, part, group, glow, setGlow, profile, grip, CYL_Z } from './kit.js';

const COLD = new THREE.Color(0x5ab4ff);

export function buildAzure(hex) {
  const root = new THREE.Group();
  const frame = new THREE.MeshStandardMaterial({ color: 0x2c3850, metalness: 0.7, roughness: 0.35 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x6a7a94, metalness: 0.85, roughness: 0.3 });
  const frost = new THREE.MeshStandardMaterial({ color: 0xe8f6ff, metalness: 0.05, roughness: 0.5 });
  const cold = glow(COLD, 1.6);
  const kit = new Kit();

  // the frame: a wedge with a raked back and a chamfered nose
  kit.add(profile([[0.3, -0.06], [0.31, 0.02], [0.27, 0.058], [-0.1, 0.058], [-0.19, 0.012], [-0.19, -0.03], [-0.06, -0.06]], 0.1), frame);
  kit.add(profile([[0.23, 0.056], [0.2, 0.084], [-0.04, 0.084], [-0.11, 0.056]], 0.076), frost); // frost plate
  kit.add(new THREE.CylinderGeometry(0.036, 0.036, 0.108, 6), cold, [0, -0.004, 0.06], [0, 0, Math.PI / 2]); // the core
  kit.add(new THREE.CylinderGeometry(0.016, 0.022, 0.26, 6), trim, [0, -0.004, -0.31], CYL_Z); // barrel
  kit.add(new THREE.CylinderGeometry(0.034, 0.034, 0.03, 6), frost, [0, -0.004, -0.4], CYL_Z); // collar
  grip(kit, frame);
  kit.build(root);

  // the crystal tip with a hot heart in the current color
  const crystalMat = new THREE.MeshStandardMaterial({ color: 0x7ac0ff, emissive: 0x1a4cff, emissiveIntensity: 1.2, metalness: 0, roughness: 0.25, flatShading: true, transparent: true, opacity: 0.85 });
  const crystal = part(root, new THREE.OctahedronGeometry(0.046, 0), crystalMat, [0, -0.004, -0.48], 0, [0.85, 0.85, 1.9]);
  const heart = part(root, new THREE.SphereGeometry(0.018, 10, 8), glow(hex, 2.6), [0, -0.004, -0.48]);

  const muzzle = group(root, [0, -0.004, -0.56]);
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
      crystal.rotation.z += dt * (1.1 + spin);
      const k = 0.85 * (1 - pulse * 0.25);
      crystal.scale.set(k, k, 1.9 * (1 + pulse * 0.2));
      crystalMat.emissiveIntensity = 1.1 + Math.sin(t * 3.1) * 0.2 + pulse * 1.6;
      heart.scale.setScalar(1 + pulse);
      setGlow(cold, COLD, 1.5 + Math.sin(t * 1.4) * 0.25 + pulse * 1.2);
      // steady and precise: barely any idle drift
      root.position.y = Math.sin(t * 1.1) * 0.002;
      return 0.4 + pulse * 0.6;
    },
  };
}
