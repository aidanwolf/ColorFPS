// SOLAR SKYLINE — the monuments round Sunscorch Mesa's eastern edge (solar.js calls buildSolarSkyline):
// seated colossi crowned with sun discs, battered pylons and mirror obelisks with gilded caps. They give the
// mesa its silhouette from every spot in Solar and close its views to the east, so the Prism Atrium's
// glass and the Foundry's brick stay out of sight.
//
//   colossus(x, y, z, face, s)   a seated colossus on its plinth (face: the way it looks, '-x' = west; s 1 ≈ 33 m)
//   pylon(x1, z1, x2, z2, y, h)  a battered pylon tower with a cornice and a glowing band
//   obelisk(x, y, z, h)          a tapering obelisk with a gilded mirror cap that catches the sun
import * as THREE from 'three';

const _q = new THREE.Vector3();

export function buildSolarSkyline(B, K) {
  const { W } = B;
  const { R, M, G } = K;
  const discMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.74, 0.3).multiplyScalar(1.6), side: THREE.DoubleSide });
  const capMat = new THREE.MeshStandardMaterial({ color: 0xffd27a, metalness: 0.9, roughness: 0.18, emissive: 0x3a2808 });
  const discs = [], caps = [];

  // place a box given in a monument's local frame (it looks down local -z) by its facing
  const placer = (x, y, z, face, s) => (x1, y1, z1, x2, y2, z2, fn = R) => {
    const map = (lx, lz) => {
      if (face === '-z') return [x + lx * s, z + lz * s];
      if (face === '+z') return [x - lx * s, z - lz * s];
      if (face === '-x') return [x + lz * s, z - lx * s];
      return [x - lz * s, z + lx * s];
    };
    const [ax, az] = map(x1, z1), [bx, bz] = map(x2, z2);
    fn(Math.min(ax, bx), y + y1 * s, Math.min(az, bz), Math.max(ax, bx), y + y2 * s, Math.max(az, bz));
  };
  const local = (x, y, z, face, s, lx, ly, lz) => {
    if (face === '-z') return _q.set(x + lx * s, y + ly * s, z + lz * s);
    if (face === '+z') return _q.set(x - lx * s, y + ly * s, z - lz * s);
    if (face === '-x') return _q.set(x + lz * s, y + ly * s, z - lx * s);
    return _q.set(x - lz * s, y + ly * s, z + lx * s);
  };
  const yawOf = { '-z': 0, '+z': Math.PI, '-x': Math.PI / 2, '+x': -Math.PI / 2 };

  function colossus(x, y, z, face = '-x', s = 1) {
    const b = placer(x, y, z, face, s);
    b(-6.5, 0, -9, 6.5, 4, 8.5); // plinth
    b(-6.8, 3.4, -9.3, 6.8, 4, 8.8, M); // its bronze band
    b(-5, 4, 0, 5, 17, 7.5); // the throne
    b(-5.4, 17, 5.8, 5.4, 22, 7.5); // its back
    b(-4.2, 4, -6.5, -1.1, 13, -1); // shins
    b(1.1, 4, -6.5, 4.2, 13, -1);
    b(-4.6, 4, -8.2, -0.8, 5.2, -5.6); // feet
    b(0.8, 4, -8.2, 4.6, 5.2, -5.6);
    b(-4.6, 13, -6.8, 4.6, 15.6, 2); // thighs and lap
    b(-3.6, 15.6, -0.2, 3.6, 25.5, 4.6); // torso
    b(-5.2, 22.6, 0.2, 5.2, 25.6, 4.4); // shoulders
    b(-5.4, 15.2, -6.2, -3.4, 16.8, 2.4); // forearms on the knees
    b(3.4, 15.2, -6.2, 5.4, 16.8, 2.4);
    b(-5.2, 16.8, 0.6, -3.6, 23, 3.6); // upper arms
    b(3.6, 16.8, 0.6, 5.2, 23, 3.6);
    b(-2.7, 23.6, 1.4, 2.7, 30, 5.2); // the nemes headdress
    b(-1.8, 25.6, 0.4, 1.8, 29.6, 3.6); // the face
    b(-0.5, 23.2, -0.1, 0.5, 25.8, 1.2); // the beard
    b(-0.35, 30, 2.4, 0.35, 31.2, 3.6, M); // the disc's mount
    const p = local(x, y, z, face, s, 0, 34.2, 3);
    discs.push(new THREE.CircleGeometry(3.4 * s, 28).rotateY(yawOf[face]).translate(p.x, p.y, p.z));
    const glowRing = local(x, y, z, face, s, 0, 34.2, 3.08);
    discs.push(new THREE.RingGeometry(3.6 * s, 4.1 * s, 28).rotateY(yawOf[face] + Math.PI).translate(glowRing.x, glowRing.y, glowRing.z));
  }

  function pylon(x1, z1, x2, z2, y, h = 30, courses = 6) {
    const dh = h / courses;
    for (let k = 0; k < courses; k++) {
      const i = k * 0.5;
      R(x1 + i, y + k * dh, z1 + i, x2 - i, y + (k + 1) * dh, z2 - i);
    }
    const i = courses * 0.5;
    R(x1 + i - 0.8, y + h, z1 + i - 0.8, x2 - i + 0.8, y + h + 1.2, z2 - i + 0.8);
    G(x1 + i - 0.85, y + h + 0.4, z1 + i - 0.85, x2 - i + 0.85, y + h + 0.6, z2 - i + 0.85);
  }

  function obelisk(x, y, z, h = 28) {
    R(x - 2.2, y, z - 2.2, x + 2.2, y + 1.4, z + 2.2);
    const n = 6, dh = (h - 2) / n;
    for (let k = 0; k < n; k++) {
      const w = 1.5 - k * 0.12;
      R(x - w, y + 1.4 + k * dh, z - w, x + w, y + 1.4 + (k + 1) * dh, z + w);
    }
    const top = y + 1.4 + n * dh, w = 1.5 - n * 0.12;
    caps.push(new THREE.ConeGeometry(w * 1.42, 2.4, 4).rotateY(Math.PI / 4).translate(x, top + 1.2, z));
  }

  function finish() {
    for (const [geos, m] of [[discs, discMat], [caps, capMat]]) {
      if (!geos.length) continue;
      const g = geos.length > 1 ? mergeGeos(geos) : geos[0];
      const mesh = new THREE.Mesh(g, m);
      mesh.userData.noCull = true;
      W.scene.add(mesh);
    }
  }

  return { colossus, pylon, obelisk, finish };
}

function mergeGeos(geos) {
  const pos = [], nor = [];
  for (const g0 of geos) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    pos.push(...g.attributes.position.array);
    nor.push(...g.attributes.normal.array);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}
