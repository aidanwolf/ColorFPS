// VERDANT FLORA — the drowned forest: instanced swamp trees (vine-hung giants with buttress roots, stilt-rooted
// mangroves, dead snags), brush (ferns, reeds, bushes, bloated fungi), and the air (fireflies, spores, gnats,
// drips, drizzle, god-rays, mist). Built on the shared kit (verdantKit.js): each prop is captured once and
// instanced, so a dense forest costs a few draws. Used by verdantSwamp.js (and anyone who wants it).
//
//   const F = makeFlora(K);
//   F.trees(list) — list of { x, y, z, kind: 'giant' | 'mangrove' | 'snag', s, yaw, solid = true } → meshes
//   F.brush(list) — list of { x, y, z, kind: 'fern' | 'reed' | 'bush' | 'shroom' | 'lily', s, yaw } → meshes
//   F.fireflies(spots) · F.motes(box, n, opts) · F.drips(spots) · F.rain(box) · F.shaft(x, yTop, z, len, w)
//   F.mist(x, y, z, w, d) — and F.groupVisible(meshes, test(player)) hides a set when it can't be seen.
import * as THREE from 'three';

const PI = Math.PI;

let FMATS = null;
export function floraMats() {
  if (FMATS) return FMATS;
  const blob = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const shaftTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const h = g.createLinearGradient(0, 0, 64, 0);
    h.addColorStop(0, 'rgba(255,255,255,0)');
    h.addColorStop(0.5, 'rgba(255,255,255,1)');
    h.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = h;
    g.fillRect(0, 0, 64, 64);
    g.globalCompositeOperation = 'destination-in';
    const v = g.createLinearGradient(0, 0, 0, 64);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(0.2, 'rgba(0,0,0,1)');
    v.addColorStop(0.75, 'rgba(0,0,0,0.5)');
    v.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = v;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  FMATS = {
    blob,
    fungus: new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9dff6a).multiplyScalar(0.95) }),
    fungusTeal: new THREE.MeshBasicMaterial({ color: new THREE.Color(0x5dffd0).multiplyScalar(0.9) }),
    stalk: new THREE.MeshStandardMaterial({ color: 0x8a8a62, roughness: 0.9, flatShading: true }),
    capDull: new THREE.MeshStandardMaterial({ color: 0x6a5a3a, roughness: 0.8, flatShading: true, emissive: 0x1a1a08 }),
    reed: new THREE.MeshStandardMaterial({ color: 0x4a5a2a, roughness: 1, flatShading: true }),
    lily: new THREE.MeshStandardMaterial({ color: 0x3a6a2a, roughness: 0.6, flatShading: true }),
    shaft: new THREE.MeshBasicMaterial({ map: shaftTex, color: 0xe8ffb8, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    mist: new THREE.MeshBasicMaterial({ map: blob, color: 0x8aa080, transparent: true, opacity: 0.035, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  };
  return FMATS;
}

export function makeFlora(K) {
  const { W, mats } = K;
  const FM = floraMats();
  const R = K.R, rand = K.rand;

  // ---------------------------------------------------------------- tree props (built once, local coords)
  // a hanging vine: a thin tapered ribbon, kinked so it isn't a ruler
  function vineStrand(x, yTop, z, len, w = 0.09) {
    const g = new THREE.PlaneGeometry(w, len, 1, 3);
    const p = g.attributes.position;
    const ph = R(0, 6);
    for (let i = 0; i < p.count; i++) {
      const v = (p.getY(i) + len / 2) / len;
      p.setX(i, p.getX(i) * (0.4 + v * 0.6) + Math.sin(v * 5 + ph) * 0.12);
      p.setZ(i, Math.cos(v * 4 + ph) * 0.1);
    }
    g.translate(0, -len / 2, 0).rotateY(R(0, PI));
    K.put(mats.vine, K.twoSided(g), x, yTop, z);
  }
  // a shelf fungus on a trunk face: a half-disc sticking out, glowing (they're the swamp's lamps)
  function shelf(x, y, z, a, r, teal = false) {
    const g = new THREE.CylinderGeometry(r, r * 0.9, r * 0.22, 9, 1, false, 0, PI);
    g.rotateY(-a + PI / 2);
    K.put(teal ? FM.fungusTeal : FM.fungus, g, x + Math.cos(a) * 0.05, y, z + Math.sin(a) * 0.05);
  }
  function leafCluster(x, y, z, r) {
    const g = new THREE.IcosahedronGeometry(r, r > 1.4 ? 1 : 0); // (a bush's little clumps read fine at 20 faces)
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * R(0.85, 1.15), p.getY(i) * R(0.35, 0.55), p.getZ(i) * R(0.85, 1.15));
    g.rotateY(R(0, 6));
    K.put(rand() < 0.35 ? mats.leafLit : mats.leaf, g, x, y, z);
  }
  // an organic trunk: a tapered column, jittered, flaring at the foot
  function trunk(h, r0, r1, flare = 1.7, lean = [0, 0]) {
    const g = new THREE.CylinderGeometry(r1, r0, h, 10, 8);
    const p = g.attributes.position;
    const ph = R(0, 6);
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) + h / 2, v = y / h;
      const a = Math.atan2(p.getZ(i), p.getX(i));
      const k = (1 + (flare - 1) * Math.pow(Math.max(0, 1 - y / 2.5), 2)) * (1 + 0.12 * Math.sin(a * 3 + ph + v * 4) + 0.06 * Math.sin(a * 7 + v * 9));
      p.setXYZ(i, p.getX(i) * k + lean[0] * v * v * h, y, p.getZ(i) * k + lean[1] * v * v * h);
    }
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3, uv.getY(i) * h * 0.25);
    K.put(mats.bark, g);
  }

  const PROPS = {};
  // the drowned giant: buttress roots plunging into the water, a moss-banded trunk with glowing shelf
  // fungi, a few great limbs at the top hung with vines and moss curtains, a low dark canopy
  PROPS.giant = [0, 1, 2].map((v) => K.capture(() => {
    const h = R(17, 22), r0 = R(1.0, 1.25), r1 = r0 * 0.55;
    trunk(h, r0, r1, 1.9, [R(-0.04, 0.04), R(-0.04, 0.04)]);
    const nr = 6 + v;
    for (let i = 0; i < nr; i++) {
      const a = (i / nr) * PI * 2 + R(-0.3, 0.3), out = R(2.6, 4.4);
      K.limb([[Math.cos(a) * r0 * 0.6, R(2.2, 3.8), Math.sin(a) * r0 * 0.6], [Math.cos(a) * (r0 + out * 0.45), R(1.2, 2), Math.sin(a) * (r0 + out * 0.45)], [Math.cos(a) * (r0 + out), -1.2, Math.sin(a) * (r0 + out)]], R(0.38, 0.5), 0.14, mats.bark, 6, true);
    }
    for (let i = 0; i < 4; i++) K.mossCap(R(-0.4, 0.4), R(0.6, h * 0.5), R(-0.4, 0.4), r0 * R(0.9, 1.25), 0.5);
    for (let i = 0; i < 7; i++) {
      const a = R(0, PI * 2), y = R(1.5, 7);
      shelf(Math.cos(a) * r0 * 0.95, y, Math.sin(a) * r0 * 0.95, a, R(0.22, 0.45), rand() < 0.3);
    }
    const nb = 4 + (v % 2);
    for (let i = 0; i < nb; i++) {
      const a = (i / nb) * PI * 2 + R(-0.4, 0.4), y0 = h * R(0.55, 0.82), L = R(5, 8.5);
      const e = [Math.cos(a) * L, y0 + R(1, 3), Math.sin(a) * L];
      const m = [Math.cos(a) * L * 0.5, y0 + R(0.6, 1.6), Math.sin(a) * L * 0.5];
      K.limb([[0, y0, 0], m, e], R(0.32, 0.45), 0.12, mats.bark, 6, true);
      for (let k = 0; k < 2; k++) leafCluster(e[0] + R(-1.6, 1.6), e[1] + R(0, 1.5), e[2] + R(-1.6, 1.6), R(2.8, 3.9));
      for (let k = 0; k < 7; k++) {
        const u = R(0.2, 1);
        const px = m[0] * Math.min(1, u * 2) + (e[0] - m[0]) * Math.max(0, u * 2 - 1), py = (u < 0.5 ? y0 + (m[1] - y0) * u * 2 : m[1] + (e[1] - m[1]) * (u * 2 - 1)) - 0.2, pz = m[2] * Math.min(1, u * 2) + (e[2] - m[2]) * Math.max(0, u * 2 - 1);
        if (rand() < 0.55) vineStrand(px, py, pz, R(3, py - 2.5));
        else K.hangMoss(px, py, pz, R(1.2, 4.5), 0.5);
      }
    }
    leafCluster(0, h + 1, 0, R(3.5, 4.5));
    for (let k = 0; k < 6; k++) vineStrand(R(-r1, r1), h * R(0.5, 0.9), R(-r1, r1), R(4, 10), 0.12);
  }));
  // a mangrove: a slimmer tree lifted on arching stilt roots over the water
  PROPS.mangrove = [0, 1].map(() => K.capture(() => {
    const lift = R(1.6, 2.4), h = R(8, 12), r0 = R(0.42, 0.55);
    K.rod(mats.bark, [0, lift, 0], [R(-0.4, 0.4), h, R(-0.4, 0.4)], r0, r0 * 0.5, 8);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * PI * 2 + R(-0.25, 0.25), out = R(1.6, 2.8);
      K.limb([[0, lift + R(0.2, 1.4), 0], [Math.cos(a) * out * 0.55, lift + R(0.4, 1.0), Math.sin(a) * out * 0.55], [Math.cos(a) * out, -1, Math.sin(a) * out]], 0.16, 0.08, mats.bark, 5, true);
    }
    for (let i = 0; i < 3; i++) {
      const a = R(0, 6), L = R(2.5, 4);
      const e = [Math.cos(a) * L, h * R(0.75, 0.95) + 1, Math.sin(a) * L];
      K.limb([[0, h * R(0.6, 0.8), 0], e], 0.18, 0.08, mats.bark, 5, true);
      leafCluster(e[0], e[1] + 0.6, e[2], R(1.8, 2.6));
      for (let k = 0; k < 4; k++) vineStrand(e[0] + R(-1, 1), e[1], e[2] + R(-1, 1), R(2, 5));
    }
    leafCluster(0, h + 0.8, 0, R(2.2, 3));
    for (let i = 0; i < 3; i++) shelf(Math.cos(i * 2) * r0 * 0.9, lift + R(0.5, 3), Math.sin(i * 2) * r0 * 0.9, i * 2, R(0.15, 0.25), rand() < 0.4);
  }));
  // a dead snag: a broken trunk, bare forks, moss and fungus, no canopy (lets a little sky through)
  PROPS.snag = [0, 1].map(() => K.capture(() => {
    const h = R(7, 13), r0 = R(0.6, 0.9);
    trunk(h, r0, r0 * 0.7, 1.5);
    for (let i = 0; i < 2; i++) {
      const a = R(0, 6), y0 = h * R(0.5, 0.9);
      K.limb([[0, y0, 0], [Math.cos(a) * 2, y0 + 1.5, Math.sin(a) * 2], [Math.cos(a) * 3, y0 + 3.4, Math.sin(a) * 3]], 0.22, 0.06, mats.bark, 5);
    }
    K.put(mats.bark, new THREE.ConeGeometry(r0 * 0.7, 1.4, 7).translate(0, h + 0.7, 0));
    for (let i = 0; i < 6; i++) shelf(Math.cos(i * 1.3) * r0 * 0.95, R(0.8, h * 0.8), Math.sin(i * 1.3) * r0 * 0.95, i * 1.3, R(0.2, 0.4), rand() < 0.5);
    for (let i = 0; i < 3; i++) K.mossCap(0, R(1, h * 0.7), 0, r0 * 1.1, 0.4);
    for (let i = 0; i < 4; i++) K.hangMoss(R(-1.5, 1.5), h * R(0.6, 0.9), R(-1.5, 1.5), R(1, 3), 0.4);
  }));

  // ---------------------------------------------------------------- brush props
  function frond(x, y, z, len, yaw, lean, w, m) {
    const g = new THREE.PlaneGeometry(w, len, 1, 3);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const v = (p.getY(i) + len / 2) / len;
      p.setX(i, p.getX(i) * (1 - v * 0.85));
      p.setZ(i, -v * v * len * 0.4);
    }
    g.translate(0, len / 2, 0).rotateX(-lean).rotateY(yaw);
    K.put(m, K.twoSided(g), x, y, z);
  }
  PROPS.fern = [0, 1].map(() => K.capture(() => {
    const n = 9, a0 = R(0, 6);
    for (let i = 0; i < n; i++) frond(0, 0, 0, R(1.0, 1.8), a0 + (i / n) * PI * 2 + R(-0.2, 0.2), R(0.5, 1.05), 0.5, rand() < 0.3 ? mats.leafLit : mats.leaf);
  }));
  PROPS.reed = [0, 1].map(() => K.capture(() => {
    for (let i = 0; i < 14; i++) {
      const a = R(0, 6), d = R(0, 0.5), len = R(1.2, 2.6);
      const g = new THREE.PlaneGeometry(0.07, len, 1, 2);
      const p = g.attributes.position;
      for (let k = 0; k < p.count; k++) if (p.getY(k) > 0) p.setX(k, p.getX(k) * 0.2 + R(-0.15, 0.15));
      g.translate(0, len / 2, 0).rotateZ(R(-0.25, 0.25)).rotateY(a);
      K.put(FM.reed, K.twoSided(g), Math.cos(a) * d, 0, Math.sin(a) * d);
      if (rand() < 0.25) K.put(FM.capDull, new THREE.CylinderGeometry(0.05, 0.05, 0.3, 5), Math.cos(a) * d, len * 0.92, Math.sin(a) * d); // a cattail
    }
  }));
  PROPS.bush = [0, 1].map(() => K.capture(() => {
    for (let i = 0; i < 5; i++) leafCluster(R(-0.8, 0.8), R(0.3, 1.1), R(-0.8, 0.8), R(0.6, 1.1));
    for (let i = 0; i < 4; i++) frond(0, 0, 0, R(1.2, 1.8), R(0, 6), R(0.4, 0.8), 0.7, mats.leaf);
  }));
  // a cluster of bloated fungi: fat pale stalks, glowing caps (a light source on the forest floor)
  PROPS.shroom = [0, 1].map((v) => K.capture(() => {
    for (let i = 0; i < 5; i++) {
      const x = R(-0.5, 0.5), z = R(-0.5, 0.5), s = R(0.5, 1.3) * (i === 0 ? 1.4 : 1);
      K.put(FM.stalk, new THREE.CylinderGeometry(0.09 * s, 0.14 * s, 0.6 * s, 6).translate(0, 0.3 * s, 0), x, 0, z);
      K.put(v ? FM.fungusTeal : FM.fungus, new THREE.SphereGeometry(0.34 * s, 9, 4, 0, PI * 2, 0, PI / 2).scale(1, 0.75, 1), x, 0.58 * s, z);
    }
  }));
  PROPS.lily = [0].map(() => K.capture(() => {
    for (let i = 0; i < 6; i++) {
      const r = R(0.25, 0.5);
      K.put(FM.lily, new THREE.CircleGeometry(r, 8, 0.3, PI * 2 - 0.5).rotateX(-PI / 2), R(-1.2, 1.2), 0, R(-1.2, 1.2));
    }
  }));

  // ---------------------------------------------------------------- placing
  const groups = [];
  function trees(list) {
    const out = [];
    for (const kind of ['giant', 'mangrove', 'snag']) {
      const vars = PROPS[kind];
      vars.forEach((geoMap, vi) => {
        const mine = list.filter((t) => (t.kind || 'giant') === kind && (t.v ?? Math.abs(Math.round(t.x * 7 + t.z * 3))) % vars.length === vi);
        out.push(...K.instance(geoMap, mine.map((t) => ({ x: t.x, y: t.y, z: t.z, yaw: t.yaw ?? (t.x * 1.7 + t.z) % 6.28, s: t.s ?? 1 }))));
      });
    }
    // trunks are solid (roots aren't: they're dressing you walk through)
    for (const t of list) {
      if (t.solid === false) continue;
      const s = t.s ?? 1, kind = t.kind || 'giant';
      const r = (kind === 'giant' ? 1.05 : kind === 'snag' ? 0.7 : 0.45) * s;
      const h = (kind === 'giant' ? 14 : kind === 'snag' ? 7 : 9) * s;
      const y0 = kind === 'mangrove' ? t.y + 1.6 * s : t.y - 2;
      K.solid(t.x - r, y0, t.z - r, t.x + r, t.y + h, t.z + r, 'rock');
    }
    return out;
  }
  function brush(list) {
    const out = [];
    for (const kind of ['fern', 'reed', 'bush', 'shroom', 'lily']) {
      const vars = PROPS[kind];
      vars.forEach((geoMap, vi) => {
        const mine = list.filter((t) => t.kind === kind && (t.v ?? Math.abs(Math.round(t.x * 13 + t.z * 5))) % vars.length === vi);
        out.push(...K.instance(geoMap, mine.map((t) => ({ x: t.x, y: t.y, z: t.z, yaw: t.yaw ?? R(0, 6), s: t.s ?? 1 }))));
      });
    }
    return out;
  }
  // hide a set of meshes (or Points) whenever test(player.pos) says they can't be seen (the culling still applies)
  function groupVisible(meshes, test) {
    const g = { meshes, on: true };
    groups.push(g);
    W.add({
      update(dt, player) {
        const on = !!test(player.pos);
        if (on === g.on) return;
        g.on = on;
        for (const m of meshes) m.visible = on;
      },
    });
    return g;
  }

  // ---------------------------------------------------------------- the air
  const _v = new THREE.Vector3();
  // fireflies: little wandering clouds of light; spots [[x, y, z, r, n]]
  function fireflies(spots, color = 0xd8ff6a, size = 0.09) {
    const N = spots.reduce((a, s) => a + (s[4] || 18), 0);
    const base = new Float32Array(N * 3), pos = new Float32Array(N * 3), ph = new Float32Array(N);
    let k = 0;
    for (const [x, y, z, r, n = 18] of spots)
      for (let i = 0; i < n; i++, k++) {
        base[k * 3] = x + R(-r, r);
        base[k * 3 + 1] = y + R(-1, 2);
        base[k * 3 + 2] = z + R(-r, r);
        ph[k] = R(0, 100);
      }
    pos.set(base);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ map: FM.blob, color: new THREE.Color(color).multiplyScalar(2), size: size * 1.6, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const p = new THREE.Points(geo, m);
    p.frustumCulled = false;
    W.scene.add(p);
    let t = 0;
    const st = { m, alive: 1, p };
    const c = new THREE.Vector3(spots[0][0], spots[0][1], spots[0][2]);
    W.add({
      update(dt, player) {
        if (!p.visible || st.alive <= 0) return;
        t += dt;
        for (let i = 0; i < N; i++) {
          const q = ph[i];
          pos[i * 3] = base[i * 3] + Math.sin(t * 0.7 + q) * 0.9;
          pos[i * 3 + 1] = base[i * 3 + 1] + Math.sin(t * 1.1 + q * 1.7) * 0.5 - (1 - st.alive) * 3;
          pos[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * 0.6 + q * 0.6) * 0.9;
        }
        geo.attributes.position.needsUpdate = true;
        m.opacity = st.alive * (0.7 + 0.3 * Math.sin(t * 7));
      },
    });
    return st;
  }
  // drifting motes in a box (spores, gnats): slow random drift, wrapped inside the box
  function motes([x1, y1, z1, x2, y2, z2], n, { color = 0xd8ff9a, size = 0.08, speed = 0.3, jitter = 0, opacity = 0.8 } = {}) {
    const pos = new Float32Array(n * 3), vel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = R(x1, x2);
      pos[i * 3 + 1] = R(y1, y2);
      pos[i * 3 + 2] = R(z1, z2);
      vel[i * 3] = R(-1, 1) * speed;
      vel[i * 3 + 1] = R(-0.4, 0.6) * speed;
      vel[i * 3 + 2] = R(-1, 1) * speed;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ map: FM.blob, color: new THREE.Color(color).multiplyScalar(1.3), size: size * 1.6, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
    const p = new THREE.Points(geo, m);
    p.frustumCulled = false;
    W.scene.add(p);
    let t = 0;
    W.add({
      update(dt) {
        if (!p.visible) return;
        t += dt;
        for (let i = 0; i < n; i++) {
          let x = pos[i * 3] + vel[i * 3] * dt, y = pos[i * 3 + 1] + vel[i * 3 + 1] * dt, z = pos[i * 3 + 2] + vel[i * 3 + 2] * dt;
          if (jitter) {
            x += Math.sin(t * 13 + i) * jitter * dt;
            y += Math.cos(t * 11 + i * 1.3) * jitter * dt;
          }
          if (x < x1) x = x2; else if (x > x2) x = x1;
          if (y < y1) y = y2; else if (y > y2) y = y1;
          if (z < z1) z = z2; else if (z > z2) z = z1;
          pos[i * 3] = x;
          pos[i * 3 + 1] = y;
          pos[i * 3 + 2] = z;
        }
        geo.attributes.position.needsUpdate = true;
      },
    });
    return { p, m };
  }
  // falling streaks (drips off leaves, drizzle): spots [[x, yTop, z, yBot, r, n]]
  function drips(spots, { color = 0xd8f4ff, size = 0.06, near = 40 } = {}) {
    const N = spots.reduce((a, s) => a + (s[5] || 14), 0);
    const pos = new Float32Array(N * 3), info = [];
    let j = 0;
    for (const [x, yTop, z, yBot, r, n = 14] of spots)
      for (let i = 0; i < n; i++, j++) {
        info.push(yTop, yBot, R(6, 10));
        pos[j * 3] = x + R(-r, r);
        pos[j * 3 + 1] = R(yBot, yTop);
        pos[j * 3 + 2] = z + R(-r, r);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ map: FM.blob, color, size: size * 1.4, transparent: true, opacity: 0.6, depthWrite: false });
    const p = new THREE.Points(geo, m);
    p.frustumCulled = false;
    W.scene.add(p);
    const c = new THREE.Vector3(spots[0][0], spots[0][1], spots[0][2]);
    W.add({
      update(dt, player) {
        if (!p.visible || player.pos.distanceTo(c) > near + 30) return;
        for (let i = 0; i < N; i++) {
          pos[i * 3 + 1] -= info[i * 3 + 2] * dt;
          if (pos[i * 3 + 1] < info[i * 3 + 1]) pos[i * 3 + 1] = info[i * 3];
        }
        geo.attributes.position.needsUpdate = true;
      },
    });
    return { p, m };
  }
  function shaft(x, yTop, z, len, w, tilt = 0.15) {
    for (const a of [0, PI / 2]) {
      const g = new THREE.PlaneGeometry(w, len);
      g.translate(0, -len / 2, 0).rotateY(a).rotateX(tilt * 0.6).rotateZ(-tilt);
      K.put(FM.shaft, g, x, yTop, z);
    }
  }
  function mist(x, y, z, w, d) {
    K.put(FM.mist, new THREE.PlaneGeometry(w, d).rotateX(-PI / 2), x, y, z);
  }

  return { PROPS, FM, trees, brush, groupVisible, fireflies, motes, drips, shaft, mist, vineStrand, shelf, leafCluster, frond, trunk };
}
