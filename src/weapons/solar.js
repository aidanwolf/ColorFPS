// SOLAR: a sleek, long emitter. A smooth white-ceramic fuselage with a gold spine and a heat line
// down its back, a slim gold emitter rod and one gold halo ring floating around it, with the sun
// burning at the tip. It pours a held sun beam (sunbeam.js): the halo spins up and burns, the heat
// line and the vent slits down its flanks glow hotter with the beam's heat, and an overheat vents
// steam from the slits while they blaze.
import * as THREE from 'three';
import { Kit, part, group, glow, setGlow, lathe, rbox, grip, CYL_Z } from './kit.js';

const WARM = new THREE.Color(0xffc040);
const EMBER = new THREE.Color(0xff8a18);
const COLD_VENT = new THREE.Color(0x3a2a1a);
const HOT_VENT = new THREE.Color(0xff5a10);
const WHITE_HOT = new THREE.Color(0xffe8c0);
const _vc = new THREE.Color();

// a soft round puff (steam), drawn once
let dotTex = null;
function softDot() {
  if (dotTex) return dotTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  dotTex = new THREE.CanvasTexture(c);
  return dotTex;
}

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

  // vent slits down both flanks: dark at rest, glowing with the beam's heat
  const ventMat = glow(COLD_VENT, 1);
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) part(root, new THREE.BoxGeometry(0.006, 0.012, 0.05), ventMat, [sx * 0.047, 0.012 - i * 0.02, 0.05 + i * 0.012]);
  // steam wisps that curl up off the vents when it overheats (in view-model space)
  const wisps = [];
  for (let i = 0; i < 8; i++) {
    const w = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(), color: 0xd8e2ea, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    w.visible = false;
    w.userData = { t: i / 8, sx: i % 2 ? 1 : -1 };
    root.add(w);
    wisps.push(w);
  }

  // the halo: a gold ring with a burning inner rim, floating around the rod
  const halo = group(root, [0, 0, -0.37]);
  part(halo, new THREE.TorusGeometry(0.08, 0.01, 10, 44), gold);
  const rimMat = glow(WARM, 2);
  part(halo, new THREE.TorusGeometry(0.064, 0.0045, 6, 44), rimMat);
  const tip = part(root, new THREE.SphereGeometry(0.022, 16, 12), glow(hex, 2.6), [0, 0, -0.465]);

  const muzzle = group(root, [0, 0, -0.48]);
  let flare = 0;
  let turn = 0;
  let heat = 0, beam = 0, vent = 0, spin = 0;

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
    // the sun beam's state each frame: heat 0..1, firing, venting (overheated, locked out)
    setHeat(h, firing, venting) {
      heat = h;
      beam = firing ? 1 : 0;
      vent = venting ? 1 : 0;
    },
    update(dt, t) {
      flare = Math.max(0, flare - dt * 8);
      // pouring the beam: the halo spins up hard and holds a flare that throbs
      spin += ((beam ? 18 : 0) - spin) * Math.min(1, dt * (beam ? 6 : 2.5));
      halo.rotation.z += spin * dt;
      if (beam) flare = Math.max(flare, 0.55 + Math.sin(t * 31) * 0.12 + Math.random() * 0.1);
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
      // the heat line runs from ember toward white hot; the vents from dark to blazing (flashing at a vent)
      _vc.copy(EMBER).lerp(WHITE_HOT, heat * heat);
      setGlow(line, _vc, 1.2 + Math.sin(t * 2 - 1) * 0.3 + flare * 1.2 + heat * 1.5);
      const vk = vent ? 2.6 + Math.sin(t * 22) * 0.6 : 0.25 + heat * 2.2;
      _vc.copy(COLD_VENT).lerp(HOT_VENT, Math.min(1, vent ? 1 : heat * 1.3));
      setGlow(ventMat, _vc, vk);
      for (const w of wisps) {
        const u = w.userData;
        u.t += dt * 1.4;
        if (u.t > 1) u.t -= 1;
        w.visible = vent > 0 || (heat > 0.85 && beam);
        if (!w.visible) continue;
        w.position.set(u.sx * (0.05 + u.t * 0.05), 0.02 + u.t * 0.09, 0.05 - u.t * 0.03);
        w.scale.setScalar(0.03 + u.t * 0.07);
        w.material.opacity = (vent ? 0.5 : 0.22) * Math.sin(u.t * Math.PI);
      }
      // a light, floaty hover
      root.position.y = Math.sin(t * 2.1) * 0.0035;
      root.rotation.z = Math.sin(t * 1.3) * 0.008;
      return 0.4 + sh * 0.06 + flare * 0.5 + heat * 0.4 + vent * 0.6;
    },
  };
}
