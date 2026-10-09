// VERDANT: a rounded organic-tech pistol. A smooth moss-green pod body with a tapered nose, one
// curved leaf vane cresting over the top, a living green capsule set into its flank and a
// wooden grip. It lobs gooey globs (globs.js): each one is a pump, the collar slamming back, the
// capsule squeezing and the glob at the emitter spat out, then a fresh one swelling up in its place.
// Springy: it wobbles back into place after each shot and the capsule throbs.
import * as THREE from 'three';
import { Kit, part, group, glow, setGlow, blade, grip, CYL_Z } from './kit.js';

const BIO = new THREE.Color(0x22e862);

export function buildVerdant(hex) {
  const root = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({ color: 0x46573f, metalness: 0.1, roughness: 0.6 });
  const leaf = new THREE.MeshStandardMaterial({ color: 0x3f8a32, metalness: 0, roughness: 0.55 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a3c26, metalness: 0, roughness: 0.8 });
  const bio = glow(BIO, 1.6);
  const kit = new Kit();

  const pod = new THREE.CapsuleGeometry(0.07, 0.24, 6, 18);
  kit.add(pod, shell, [0, 0, 0.09], CYL_Z, [0.92, 1, 1]); // body
  kit.add(new THREE.CylinderGeometry(0.036, 0.058, 0.2, 18), shell, [0, 0, -0.175], CYL_Z); // nose
  kit.add(new THREE.TorusGeometry(0.05, 0.011, 8, 28), bio, [0, 0, -0.276]); // emitter ring
  grip(kit, wood);
  kit.build(root);

  // the vane: one curved leaf blade cresting forward over the top; it sways on its own spring
  const vane = group(root, [0, 0.06, 0.2]);
  part(vane, blade([0.04, 0], [[0.02, 0.1, -0.2, 0.09], [-0.06, 0.04, -0.12, -0.005]], 0.014), leaf);
  // the capsule: a green glass cell with a living core, set into the left flank
  const capsule = group(root, [-0.06, 0.012, 0.08]);
  const glass = new THREE.MeshStandardMaterial({ color: 0x40ff80, emissive: BIO, emissiveIntensity: 0.4, roughness: 0.2, transparent: true, opacity: 0.5, depthWrite: false });
  part(capsule, new THREE.CapsuleGeometry(0.026, 0.12, 4, 12), bio, 0, CYL_Z, [0.6, 1, 0.6]);
  part(capsule, new THREE.CapsuleGeometry(0.026, 0.12, 4, 12), glass, 0, CYL_Z);
  const seed = part(root, new THREE.SphereGeometry(0.026, 12, 10), glow(hex, 2.6), [0, 0, -0.285]);
  // the pump collar round the nose
  const collar = part(root, new THREE.TorusGeometry(0.052, 0.012, 8, 24), leaf, [0, 0, -0.16]);
  let pump = 0;
  let regrow = 1; // the next glob swelling at the emitter (0 just fired → 1 ready)

  const muzzle = group(root, [0, 0, -0.31]);
  let jx = 0; // capsule / vane jiggle spring
  let jv = 0;
  let flare = 0;

  return {
    root,
    muzzle,
    light: 0x46ff80,
    spring: { omega: 15, zeta: 0.24 },
    kick: { z: 0.05, pitch: 0.13, roll: 0.05, yaw: 0.02 },
    fire() {
      jv += 11;
      flare = 1;
      pump = 1;
      regrow = 0;
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
      const breath = 0.5 + 0.5 * Math.sin(t * 1.7);
      const k = 1 + breath * 0.04 + jx * 0.12;
      capsule.scale.set(k, k, 1 - jx * 0.06);
      setGlow(bio, BIO, 1.1 + breath * 0.7 + flare * 1.4);
      glass.emissiveIntensity = 0.3 + breath * 0.2 + flare * 0.6;
      vane.rotation.x = Math.sin(t * 1.3) * 0.03 - jx * 0.18;
      regrow = Math.min(1, regrow + dt * 1.7);
      pump = Math.max(0, pump - dt * 5);
      const swell = regrow * regrow * (3 - 2 * regrow);
      seed.scale.setScalar((0.25 + swell * 1.15) * (1 + Math.sin(t * 2.6) * 0.05 + Math.sin(t * 13) * 0.04 * swell));
      seed.position.z = -0.285 - swell * 0.012;
      collar.position.z = -0.16 + pump * pump * 0.07;
      // an organic, breathing sway
      root.rotation.z = Math.sin(t * 0.9) * 0.03;
      root.rotation.x = Math.sin(t * 0.7 + 1) * 0.015;
      root.rotation.y = Math.sin(t * 0.55) * 0.012;
      root.position.y = Math.sin(t * 1.2) * 0.004;
      return 0.4 + breath * 0.15 + flare * 0.4;
    },
  };
}
