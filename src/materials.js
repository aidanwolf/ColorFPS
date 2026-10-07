// Procedural canvas textures and the shared material palette.
import * as THREE from 'three';
import { COLORS } from './colors.js';

function canvasTex(size, draw, { repeat = true } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function grain(g, s, amount, alpha = 0.08) {
  for (let i = 0; i < amount; i++) {
    const v = Math.random() * 255;
    g.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    g.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}

const panelTex = canvasTex(256, (g, s) => {
  g.fillStyle = '#9a9aa2';
  g.fillRect(0, 0, s, s);
  grain(g, s, 5000);
  // panel seams
  g.strokeStyle = 'rgba(20,20,30,0.75)';
  g.lineWidth = 3;
  g.strokeRect(2, 2, s - 4, s - 4);
  g.beginPath();
  g.moveTo(0, s * 0.62);
  g.lineTo(s, s * 0.62);
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.18)';
  g.lineWidth = 1;
  g.strokeRect(5, 5, s - 10, s - 10);
  // bolts
  g.fillStyle = 'rgba(30,30,40,0.8)';
  for (const [x, y] of [[14, 14], [s - 14, 14], [14, s - 14], [s - 14, s - 14]]) {
    g.beginPath();
    g.arc(x, y, 4, 0, Math.PI * 2);
    g.fill();
  }
  // grime streaks
  for (let i = 0; i < 14; i++) {
    g.fillStyle = `rgba(30,25,20,${Math.random() * 0.08})`;
    g.fillRect(Math.random() * s, s * 0.62, 3 + Math.random() * 8, Math.random() * s * 0.4);
  }
});

const floorTex = canvasTex(256, (g, s) => {
  g.fillStyle = '#7d7f88';
  g.fillRect(0, 0, s, s);
  grain(g, s, 7000, 0.1);
  g.strokeStyle = 'rgba(15,15,22,0.8)';
  g.lineWidth = 3;
  for (let i = 0; i <= 2; i++) {
    g.beginPath();
    g.moveTo(0, (i * s) / 2);
    g.lineTo(s, (i * s) / 2);
    g.moveTo((i * s) / 2, 0);
    g.lineTo((i * s) / 2, s);
    g.stroke();
  }
  // diamond tread
  g.fillStyle = 'rgba(255,255,255,0.06)';
  for (let y = 8; y < s; y += 16)
    for (let x = (y / 16) % 2 ? 8 : 0; x < s; x += 16) {
      g.fillRect(x, y, 6, 2);
    }
});

const grateTex = canvasTex(128, (g, s) => {
  g.fillStyle = '#2a2c34';
  g.fillRect(0, 0, s, s);
  g.fillStyle = '#6f7380';
  for (let i = 0; i < s; i += 16) g.fillRect(0, i, s, 6);
  g.fillStyle = '#9ca0ad';
  for (let i = 0; i < s; i += 16) g.fillRect(0, i, s, 1);
});

const hazardTex = canvasTex(128, (g, s) => {
  g.fillStyle = '#1c1c22';
  g.fillRect(0, 0, s, s);
  g.fillStyle = '#e8b41c';
  for (let i = -s; i < s * 2; i += 32) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + 16, 0);
    g.lineTo(i + 16 - s, s);
    g.lineTo(i - s, s);
    g.fill();
  }
});

// A glyph for color-locked surfaces: concentric chevrons that glow.
export const glyphTex = canvasTex(
  256,
  (g, s) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, s, s);
    g.strokeStyle = '#fff';
    g.lineWidth = 10;
    g.strokeRect(14, 14, s - 28, s - 28);
    g.lineWidth = 6;
    g.beginPath();
    g.arc(s / 2, s / 2, s * 0.24, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.moveTo(s / 2, s * 0.18);
    g.lineTo(s / 2, s * 0.82);
    g.moveTo(s * 0.18, s / 2);
    g.lineTo(s * 0.82, s / 2);
    g.stroke();
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(s / 2, s / 2, s * 0.08, 0, Math.PI * 2);
    g.fill();
  },
  { repeat: false },
);

export const ZONE_TINT = {
  red: 0xc9a9a4,
  yellow: 0xcdbd9a,
  green: 0xa4c2ad,
  blue: 0xa2acc8,
  boss: 0xb3a5c7,
};

const cache = new Map();

// Materials keyed by kind + zone so static geometry can be merged per material.
export function mat(kind, zone = 'red') {
  const key = kind + ':' + zone;
  if (cache.has(key)) return cache.get(key);
  const tint = new THREE.Color(ZONE_TINT[zone] ?? 0xffffff);
  let m;
  switch (kind) {
    case 'wall':
      m = new THREE.MeshStandardMaterial({ map: panelTex, color: tint.clone().multiplyScalar(0.62), roughness: 0.85, metalness: 0.15 });
      break;
    case 'floor':
      m = new THREE.MeshStandardMaterial({ map: floorTex, color: tint.clone().multiplyScalar(0.55), roughness: 0.9, metalness: 0.1 });
      break;
    case 'ceil':
      m = new THREE.MeshStandardMaterial({ map: panelTex, color: tint.clone().multiplyScalar(0.3), roughness: 1 });
      break;
    case 'metal':
      m = new THREE.MeshStandardMaterial({ map: panelTex, color: tint.clone().multiplyScalar(0.42), roughness: 0.45, metalness: 0.7 });
      break;
    case 'plat':
      m = new THREE.MeshStandardMaterial({ map: floorTex, color: tint.clone().multiplyScalar(0.7), roughness: 0.6, metalness: 0.4 });
      break;
    case 'grate':
      m = new THREE.MeshStandardMaterial({ map: grateTex, color: 0xffffff, roughness: 0.6, metalness: 0.6 });
      break;
    case 'hazard':
      m = new THREE.MeshStandardMaterial({ map: hazardTex, color: 0xffffff, roughness: 0.7 });
      break;
    case 'rock':
      m = new THREE.MeshStandardMaterial({ color: tint.clone().multiplyScalar(0.35), roughness: 1, flatShading: true });
      break;
    case 'grass':
      m = new THREE.MeshStandardMaterial({ color: 0x2f6b3a, roughness: 1 });
      break;
    case 'acid':
      m = new THREE.MeshBasicMaterial({ color: zone === 'green' ? 0x39ff6a : zone === 'yellow' ? 0xffaa22 : 0xff3a1a });
      break;
    case 'trimWhite':
      m = new THREE.MeshBasicMaterial({ color: 0xdfe6ff });
      break;
    default: {
      // glow0..glow3: emissive trims in each blaster color
      if (kind.startsWith('glow')) {
        const c = new THREE.Color(COLORS[+kind.slice(4)].hex).multiplyScalar(2.2);
        m = new THREE.MeshBasicMaterial({ color: c });
      } else {
        m = new THREE.MeshStandardMaterial({ color: 0xff00ff });
      }
    }
  }
  cache.set(key, m);
  return m;
}

// Box geometry whose UVs are scaled to world size so textures tile instead of stretching.
export function boxGeo(w, h, d, uvScale = 0.5) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, uv.getX(k) * dims[f][0] * uvScale, uv.getY(k) * dims[f][1] * uvScale);
    }
  }
  return g;
}
