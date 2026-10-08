// CRIMSON: a compact heavy blaster. A blocky dark-steel receiver, a stubby steel shroud with a
// glowing barrel slot, one copper heat-vent fin on top and an octagonal copper muzzle collar that
// spins up as you fire. Heat builds in the slot, the fin's vent and the rear exhaust. Kicks hard.
import * as THREE from 'three';
import { Kit, part, group, glow, setGlow, rbox, profile, grip, CYL_Z } from './kit.js';

const HOT = new THREE.Color(0xff3010);
const WHITE_HOT = new THREE.Color(0xffa040);
const _c = new THREE.Color();

export function buildCrimson(hex) {
  const root = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2c34, metalness: 0.6, roughness: 0.5 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x5c626e, metalness: 0.7, roughness: 0.4 });
  const copper = new THREE.MeshStandardMaterial({ color: 0xa8603a, metalness: 0.85, roughness: 0.35 });
  const hot = glow(HOT, 1); // slot, vent and exhaust: brightness follows the heat
  const kit = new Kit();

  kit.add(rbox(0.15, 0.15, 0.34, 0.022), dark, [0, -0.005, 0.12]); // receiver
  kit.add(rbox(0.116, 0.104, 0.3, 0.018), steel, [0, 0.004, -0.17]); // barrel shroud
  kit.add(new THREE.BoxGeometry(0.122, 0.022, 0.2), hot, [0, 0.008, -0.18]); // the glowing barrel slot
  // the heat-vent fin, raked back, glowing where it meets the receiver
  kit.add(profile([[0.25, 0.066], [0.22, 0.134], [0.09, 0.14], [-0.04, 0.066]], 0.024), copper);
  kit.add(new THREE.BoxGeometry(0.036, 0.008, 0.27), hot, [0, 0.07, 0.1]);
  kit.add(rbox(0.158, 0.158, 0.034, 0.012), copper, [0, -0.005, -0.03]); // copper band
  kit.add(new THREE.BoxGeometry(0.09, 0.016, 0.006), hot, [0, 0.03, 0.29]); // rear exhaust slot
  // the emitter, burning in the current color: a core inside the collar and a ring at its lip
  const core = glow(hex, 2.4);
  kit.add(new THREE.CylinderGeometry(0.032, 0.032, 0.054, 16), core, [0, 0.004, -0.337], CYL_Z);
  kit.add(new THREE.TorusGeometry(0.056, 0.01, 8, 28), core, [0, 0.004, -0.362]);
  grip(kit, dark);
  kit.build(root);

  // the octagonal muzzle collar spins about the bore
  const collar = part(root, new THREE.CylinderGeometry(0.054, 0.054, 0.05, 8), copper, [0, 0.004, -0.335], CYL_Z);

  const muzzle = group(root, [0, 0.004, -0.37]);
  let heat = 0;
  let flash = 0;
  let spin = 0.6;

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
      spin += (0.6 - spin) * Math.min(1, dt * 2.2);
      collar.rotation.y += spin * dt; // (the collar's own y is the bore axis)
      // the glow pulses slowly at rest, flares with every shot and runs white-hot under sustained fire
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.4);
      _c.copy(HOT).lerp(WHITE_HOT, heat * 0.7);
      setGlow(hot, _c, 0.6 + pulse * 0.3 + heat * 1.8 + flash * 0.9);
      // a heavy, slow breath
      root.position.y = Math.sin(t * 1.5) * 0.003;
      root.rotation.z = Math.sin(t * 0.8) * 0.006;
      return 0.35 + heat * 1.2 + pulse * 0.15; // muzzle light at rest
    },
  };
}
