// SOLAR: a sleek, polished gold emitter. A sun disc of radiating fins around a shimmering lens,
// amber collector panels down the flanks and a heat line along the spine. Snappy and light.
import * as THREE from 'three';
import { Kit, part, group, glow, setGlow, lathe, CYL_Z } from './kit.js';

const WARM = new THREE.Color(0xffc040);
const EMBER = new THREE.Color(0xff8a18);

export function buildSolar(hex) {
  const root = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: 0xe0ac48, metalness: 1, roughness: 0.2 });
  const brass = new THREE.MeshStandardMaterial({ color: 0x8a5a22, metalness: 0.95, roughness: 0.3 });
  const ceramic = new THREE.MeshStandardMaterial({ color: 0xf2e8d4, metalness: 0.05, roughness: 0.45 });
  const panel = new THREE.MeshStandardMaterial({ color: 0x1c1430, metalness: 0.9, roughness: 0.1, emissive: 0x140a04 });
  const line = glow(EMBER, 1.3);
  const core = glow(hex, 2.6);
  const kit = new Kit();
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

  // a smooth fuselage drawn out to a point at the tail, with swept fins
  kit.add(lathe([[0, 0.27], [0.01, 0.262], [0.028, 0.225], [0.048, 0.15], [0.062, 0.06], [0.064, -0.02], [0.058, -0.12], [0.048, -0.19], [0.05, -0.2], [0, -0.2]], 20), gold);
  kit.add(box(0.007, 0.08, 0.12), gold, [0, 0.06, 0.19], [-0.55, 0, 0]);
  for (const s of [-1, 1]) kit.add(box(0.007, 0.07, 0.1), gold, [s * 0.05, -0.035, 0.19], [-0.5, 0, s * -2.2]);
  kit.add(new THREE.TorusGeometry(0.066, 0.009, 8, 24), ceramic, [0, 0, 0.04]);
  kit.add(new THREE.TorusGeometry(0.06, 0.006, 8, 24), ceramic, [0, 0, -0.1]);
  // spine: a ceramic rail with the heat line running down it
  kit.add(box(0.03, 0.022, 0.3), ceramic, [0, 0.066, -0.01]);
  kit.add(box(0.012, 0.01, 0.31), line, [0, 0.079, -0.01]);
  kit.add(box(0.008, 0.05, 0.12), gold, [0, 0.09, 0.08], [0.35, 0, 0]);
  // amber solar collectors on both flanks, tilted up to the sun, gold framed
  for (const s of [-1, 1]) {
    const tilt = [0, 0, s * 0.75];
    kit.add(box(0.006, 0.085, 0.2), brass, [s * 0.072, 0.03, 0.0], tilt);
    kit.add(box(0.004, 0.073, 0.186), panel, [s * 0.0745, 0.032, 0.0], tilt);
    for (let i = 0; i < 5; i++) kit.add(box(0.005, 0.074, 0.0025), line, [s * 0.0752, 0.032, -0.076 + i * 0.038], tilt);
    kit.add(box(0.005, 0.0025, 0.184), line, [s * 0.0752, 0.032, 0], tilt);
  }
  // grip and trigger
  kit.add(box(0.055, 0.15, 0.075), ceramic, [0, -0.11, 0.1], [0.32, 0, 0]);
  kit.add(box(0.058, 0.012, 0.078), gold, [0, -0.15, 0.11], [0.32, 0, 0]);
  kit.add(box(0.012, 0.045, 0.02), gold, [0, -0.07, 0.02], [0.3, 0, 0]);
  // emitter neck and the sun disc's backing plate
  kit.add(new THREE.CylinderGeometry(0.04, 0.05, 0.05, 16), brass, [0, 0, -0.22], CYL_Z);
  kit.add(new THREE.CylinderGeometry(0.068, 0.06, 0.02, 24), brass, [0, 0, -0.25], CYL_Z);
  kit.add(new THREE.TorusGeometry(0.068, 0.007, 8, 28), glow(WARM, 1.5), [0, 0, -0.26]);
  kit.build(root);

  // radiating fins, cupped forward like a solar collector; they turn and flare
  const rays = group(root, [0, 0, -0.255]);
  const rk = new Kit();
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const long = i % 2 === 0;
    const len = long ? 0.07 : 0.045;
    const r = 0.07 + len / 2;
    // blade: a flattened diamond tapering to its tip; long blades sit a little further forward
    rk.add(new THREE.CylinderGeometry(0.003, 0.012, len, 4), gold, [Math.cos(a) * r, Math.sin(a) * r, long ? -0.012 : 0], [0, 0, a - Math.PI / 2], [1, 1, 0.35]);
  }
  rk.build(rays);

  // the lens: a hot core, a turning ring and a shimmering halo
  const lens = part(root, new THREE.SphereGeometry(0.03, 16, 12), core, [0, 0, -0.265]);
  const ring = part(root, new THREE.TorusGeometry(0.044, 0.005, 6, 28), glow(WARM, 2), [0, 0, -0.27]);
  const haloMat = new THREE.MeshBasicMaterial({ color: WARM.clone(), transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false });
  const halo = part(root, new THREE.CircleGeometry(0.11, 32), haloMat, [0, 0, -0.268]);

  const muzzle = group(root, [0, 0, -0.29]);
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
      turn += 0.45;
    },
    update(dt, t) {
      flare = Math.max(0, flare - dt * 8);
      // fins advance a notch per shot (snappy), otherwise turn slowly
      const step = turn * Math.min(1, dt * 22);
      turn -= step;
      rays.rotation.z += dt * 0.5 + step;
      const f = 1 + flare * 0.22;
      rays.scale.set(f, f, 1 + flare * 0.6);
      // heat shimmer: two beating frequencies so it never looks like a loop
      const sh = Math.sin(t * 23) * 0.5 + Math.sin(t * 37.3) * 0.5;
      lens.scale.setScalar(1 + sh * 0.05 + flare * 0.45);
      ring.rotation.z -= dt * 1.6;
      ring.scale.setScalar(1 + Math.sin(t * 3) * 0.04 + flare * 0.3);
      haloMat.opacity = THREE.MathUtils.clamp(0.16 + sh * 0.05 + flare * 0.5, 0, 1);
      halo.scale.setScalar(0.85 + Math.sin(t * 5.1) * 0.05 + flare * 0.4);
      setGlow(line, EMBER, 1.2 + Math.sin(t * 2 - 1) * 0.3 + flare * 1.2);
      // a light, floaty hover
      root.position.y = Math.sin(t * 2.1) * 0.0035;
      root.rotation.z = Math.sin(t * 1.3) * 0.008;
      return 0.4 + sh * 0.06 + flare * 0.5;
    },
  };
}
