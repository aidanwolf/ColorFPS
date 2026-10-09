// AZURE: a crisp, angular rifle, like a piece of diving gear. A faceted navy frame under a brass deck plate,
// one hexagonal blue core glowing through both flanks, a slim hex barrel and a sea-glass bulb at the tip with
// an impeller inside that spins hard with every shot. It pours a pressurized water stream (hose.js): while it
// sprays the impeller whirls, the core pulses with the pump and the nozzle trembles.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Kit, part, group, glow, setGlow, profile, grip, CYL_Z } from './kit.js';

const SEA = new THREE.Color(0x4ad8ff);

export function buildAzure(hex) {
  const root = new THREE.Group();
  const frame = new THREE.MeshStandardMaterial({ color: 0x2c3850, metalness: 0.7, roughness: 0.35 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x6a7a94, metalness: 0.85, roughness: 0.3 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc9a050, metalness: 0.85, roughness: 0.32 });
  const sea = glow(SEA, 1.6);
  const kit = new Kit();

  // the frame: a wedge with a raked back and a chamfered nose
  kit.add(profile([[0.3, -0.06], [0.31, 0.02], [0.27, 0.058], [-0.1, 0.058], [-0.19, 0.012], [-0.19, -0.03], [-0.06, -0.06]], 0.1), frame);
  kit.add(profile([[0.23, 0.056], [0.2, 0.084], [-0.04, 0.084], [-0.11, 0.056]], 0.076), brass); // brass deck plate
  kit.add(new THREE.CylinderGeometry(0.036, 0.036, 0.108, 6), sea, [0, -0.004, 0.06], [0, 0, Math.PI / 2]); // the core
  kit.add(new THREE.CylinderGeometry(0.016, 0.022, 0.26, 6), trim, [0, -0.004, -0.31], CYL_Z); // barrel
  kit.add(new THREE.CylinderGeometry(0.034, 0.034, 0.03, 6), brass, [0, -0.004, -0.4], CYL_Z); // collar
  grip(kit, frame);
  kit.build(root);

  // the sea-glass bulb at the tip, an impeller spinning inside it round a hot heart in the current color
  const crystalMat = new THREE.MeshStandardMaterial({ color: 0x5ae0d0, emissive: 0x0a6a7a, emissiveIntensity: 1.2, metalness: 0.1, roughness: 0.1, transparent: true, opacity: 0.55 });
  part(root, new THREE.SphereGeometry(0.05, 14, 10), crystalMat, [0, -0.004, -0.48], 0, [1, 1, 1.25]);
  const blades = [];
  for (let k = 0; k < 4; k++) blades.push(new THREE.BoxGeometry(0.008, 0.07, 0.03).rotateY(0.6).rotateZ((k / 4) * Math.PI));
  const crystal = part(root, mergeGeometries(blades), brass, [0, -0.004, -0.48], 0, [0.85, 0.85, 1]);
  const heart = part(root, new THREE.SphereGeometry(0.018, 10, 8), glow(hex, 2.6), [0, -0.004, -0.48]);

  const muzzle = group(root, [0, -0.004, -0.56]);
  let spin = 0;
  let pulse = 0;
  let spray = 0;

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
    // the water stream's pressure (0 off → 1 full)
    spray(on) {
      spray = on;
    },
    update(dt, t) {
      spin = Math.max(0, spin - dt * spin * 7);
      if (spray > 0) {
        spin = Math.max(spin, 26 * spray);
        pulse = Math.max(pulse, 0.35 + 0.25 * Math.sin(t * 38));
      }
      pulse = Math.max(0, pulse - dt * 10);
      // the impeller spins hard on a shot and whirls while it sprays
      crystal.rotation.z += dt * (1.1 + spin);
      const k = 0.85 * (1 - pulse * 0.15);
      crystal.scale.set(k, k, 1);
      crystalMat.emissiveIntensity = 1.1 + Math.sin(t * 3.1) * 0.2 + pulse * 1.6;
      heart.scale.setScalar(1 + pulse);
      setGlow(sea, SEA, 1.5 + Math.sin(t * 1.4) * 0.25 + pulse * 1.2);
      // steady and precise: barely any idle drift
      root.position.y = Math.sin(t * 1.1) * 0.002 + (spray ? (Math.random() - 0.5) * 0.0025 * spray : 0);
      return 0.4 + pulse * 0.6;
    },
  };
}
