// SOLAR: a sleek, long emitter. A smooth white-ceramic fuselage with a gold spine and a heat line
// down its back, a slim gold emitter rod and one gold halo ring floating around it, with the sun
// burning at the tip. Snappy and light: the halo flares out and turns a notch with every shot.
import * as THREE from 'three';
import { Kit, part, group, glow, setGlow, lathe, rbox, grip, CYL_Z } from './kit.js';

const WARM = new THREE.Color(0xffc040);
const EMBER = new THREE.Color(0xff8a18);

export function buildSolar(hex) {
  const root = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: 0xe0ac48, metalness: 1, roughness: 0.25 });
  const ceramic = new THREE.MeshStandardMaterial({ color: 0xf2e8d4, metalness: 0.05, roughness: 0.45 });
  const line = glow(EMBER, 1.3);
  const kit = new Kit();

  // the fuselage: drawn out to a point at the tail, narrowing into the emitter neck
  kit.add(lathe([[0, 0.32], [0.016, 0.31], [0.034, 0.27], [0.047, 0.19], [0.052, 0.08], [0.048, -0.06], [0.036, -0.16], [0.024, -0.2], [0, -0.2]], 20), ceramic, 0, 0, [0.9, 1, 1]);
  kit.add(rbox(0.04, 0.028, 0.36, 0.012), gold, [0, 0.046, 0.06]); // gold spine
  kit.add(new THREE.BoxGeometry(0.012, 0.008, 0.3), line, [0, 0.062, 0.06]); // heat line
  kit.add(new THREE.CylinderGeometry(0.016, 0.026, 0.28, 14), gold, [0, 0, -0.32], CYL_Z); // emitter rod
  grip(kit, ceramic);
  kit.build(root);

  // the halo: a gold ring with a burning inner rim, floating around the rod
  const halo = group(root, [0, 0, -0.37]);
  part(halo, new THREE.TorusGeometry(0.08, 0.01, 10, 44), gold);
  const rimMat = glow(WARM, 2);
  part(halo, new THREE.TorusGeometry(0.064, 0.0045, 6, 44), rimMat);
  const tip = part(root, new THREE.SphereGeometry(0.022, 16, 12), glow(hex, 2.6), [0, 0, -0.465]);

  const muzzle = group(root, [0, 0, -0.48]);
  let flare = 0;
  let turn = 0;

  return {
    root,
    muzzle,
    light: 0xffc04a,
    spring: { omega: 26, zeta: 1 },
    kick: { z: 0.04, pitch: 0.075, roll: 0.02, yaw: -0.02 },
    fire() {
      flare = 1;
      turn += 0.6;
    },
    update(dt, t) {
      flare = Math.max(0, flare - dt * 8);
      // the halo advances a notch per shot (snappy), otherwise turns slowly
      const step = turn * Math.min(1, dt * 22);
      turn -= step;
      halo.rotation.z += dt * 0.6 + step;
      halo.scale.setScalar(1 + Math.sin(t * 3) * 0.02 + flare * 0.28);
      halo.position.z = -0.37 - flare * 0.03;
      // heat shimmer: two beating frequencies so it never looks like a loop
      const sh = Math.sin(t * 23) * 0.5 + Math.sin(t * 37.3) * 0.5;
      tip.scale.setScalar(1 + sh * 0.05 + flare * 0.5);
      setGlow(rimMat, WARM, 1.8 + sh * 0.2 + flare * 1.6);
      setGlow(line, EMBER, 1.2 + Math.sin(t * 2 - 1) * 0.3 + flare * 1.2);
      // a light, floaty hover
      root.position.y = Math.sin(t * 2.1) * 0.0035;
      root.rotation.z = Math.sin(t * 1.3) * 0.008;
      return 0.4 + sh * 0.06 + flare * 0.5;
    },
  };
}
