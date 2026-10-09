// THE ATRIUM'S RESEARCH STATION: what's left of the team that set up in the Prism Atrium on day 1.
// Glass-walled rooms and a cubicle pod round the edges of the hall (the middle, the dais and every route
// to the four doors stay open), abandoned in a hurry: papers everywhere, chairs shoved back, screens still
// running, a "WELCOME TEAM · DAY 1" banner half down, cake on the table — and the people, as bones.
//   SW (x -24.5..-8, z -107..-100), by the red door: the field office (glass), a pinwheel cubicle pod, the
//       day-1 party table (Wren's log 01 hovers there, open floor beside it)
//   SE (x 9.5..24.5, z -107.2..-100): the instrument lab (glass: racks, bench, samples) and a coffee corner
//   NW (x -24.5..-14.8, z -148..-140.2), under the gallery: the Prism research lab (glass)
//   NE (x 14.8..24.5, z -148..-140.2), under the gallery: monitoring (a wall of screens)
//   north gallery (y 12, x -16..-9): an observation post looking at the reactor
// Whatever killed them came from the reactor, all at once: scorch streaks fan out from the dais, the panes
// facing it are cracked or blown in (shards inside), every chair is pushed back and turned toward it, and on
// the walls a few people are only pale, colour-fringed shadows in the scorch.
//   Drawn as a handful of merged meshes per room (vertex-coloured props, one texture atlas for print, one for
//   screens, one for scorch/cracks, one shared glass), so the whole station adds ~20 draw calls; batch.js
//   merges the opaque ones across rooms. Desks, partitions, racks and glass are solid; papers, chairs, bones
//   and small things are not. Frames and posts are W.deco, so they show on the map.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { regionOf } from './regions.js';

const FLOOR = 4;
const GAL = 12;
const PZ = -124; // the reactor / dais axis
const GH = 3; // glass wall height
const faceReactor = (x, z) => Math.atan2(0 - x, PZ - z); // ry that turns a prop's +z front toward the reactor

// a seeded random, so the mess is the same every time
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- textures (canvas atlases)
function canvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
// uv rect [u1, v1, u2, v2] of a pixel rect in a w×h canvas (canvas y runs down, uv v up)
const R = (S, x, y, w, h) => [x / S, 1 - (y + h) / S, (x + w) / S, 1 - y / S];
const HAND = '"Segoe Print", "Bradley Hand", "Comic Sans MS", "Chalkboard SE", cursive, sans-serif';
const TYPE = '"Courier New", Courier, monospace';

// PRINT atlas (1024²): whiteboards, banner, papers, stickies, badges, photo, posters, cake top, signs
const PS = 1024;
const P = {
  wb1: R(PS, 0, 0, 512, 256),
  wb2: R(PS, 512, 0, 512, 256),
  banner: R(PS, 0, 256, 1024, 64),
  paper: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => R(PS, i * 64, 336, 64, 88)),
  sticky: [0, 1, 2, 3].map((i) => R(PS, 512 + i * 48, 336, 48, 48)),
  badge: R(PS, 704, 336, 96, 60),
  photo: R(PS, 808, 336, 96, 112),
  calendar: R(PS, 912, 336, 112, 112),
  poster: R(PS, 0, 440, 160, 224),
  plan: R(PS, 160, 440, 256, 160),
  clip: R(PS, 416, 440, 96, 128),
  cake: R(PS, 512, 440, 128, 128),
  cork: R(PS, 640, 456, 192, 128),
  spines: R(PS, 832, 456, 192, 64),
  keys: R(PS, 832, 520, 192, 48),
  sign: [0, 1, 2, 3].map((i) => R(PS, (i % 2) * 256, 672 + Math.floor(i / 2) * 40, 256, 40)),
  plate: [0, 1, 2, 3].map((i) => R(PS, 512 + i * 128, 600, 128, 32)),
};
function printAtlas() {
  return canvas(PS, PS, (g) => {
    g.fillStyle = '#e8e6df';
    g.fillRect(0, 0, PS, PS);
    const marker = (c, w = 3) => {
      g.strokeStyle = c;
      g.fillStyle = c;
      g.lineWidth = w;
      g.lineCap = g.lineJoin = 'round';
    };
    const text = (s, x, y, size, c, font = HAND, rot = 0, align = 'left') => {
      g.save();
      g.translate(x, y);
      g.rotate(rot);
      g.font = `${size}px ${font}`;
      g.fillStyle = c;
      g.textAlign = align;
      g.fillText(s, 0, 0);
      g.restore();
    };
    const line = (pts) => {
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.stroke();
    };
    const arrow = (x1, y1, x2, y2) => {
      line([[x1, y1], [x2, y2]]);
      const a = Math.atan2(y2 - y1, x2 - x1);
      line([[x2 - 10 * Math.cos(a - 0.45), y2 - 10 * Math.sin(a - 0.45)], [x2, y2], [x2 - 10 * Math.cos(a + 0.45), y2 - 10 * Math.sin(a + 0.45)]]);
    };
    const smudge = (x, y, w, h) => {
      for (let i = 0; i < 18; i++) {
        g.fillStyle = `rgba(120,130,150,${0.02 + Math.random() * 0.04})`;
        g.beginPath();
        g.ellipse(x + Math.random() * w, y + Math.random() * h, 10 + Math.random() * 40, 4 + Math.random() * 12, Math.random() * 3, 0, Math.PI * 2);
        g.fill();
      }
    };
    const RED = '#d23b3b', YEL = '#d9a514', GRN = '#2f9b4a', BLU = '#2f62c8', INK = '#23262e';
    // ---- whiteboard 1: the Prism, four inputs, "generative source?"
    g.fillStyle = '#f4f6f7';
    g.fillRect(0, 0, 512, 256);
    smudge(0, 0, 512, 256);
    marker(INK, 3);
    const cx = 256, cy = 120;
    line([[cx, cy - 58], [cx + 36, cy], [cx, cy + 58], [cx - 36, cy], [cx, cy - 58]]);
    line([[cx - 36, cy], [cx + 36, cy]]);
    line([[cx, cy - 58], [cx - 8, cy], [cx, cy + 58]]);
    const ins = [[RED, 60, 46, 'A: heat'], [YEL, 60, 196, 'B: light?'], [GRN, 452, 46, 'C: bio??'], [BLU, 452, 196, 'D: hydro']];
    for (const [c, x, y, s] of ins) {
      marker(c, 4);
      g.beginPath();
      g.arc(x, y, 16, 0, Math.PI * 2);
      g.stroke();
      arrow(x + (x < cx ? 20 : -20), y + (y < cy ? 8 : -8), cx + (x < cx ? -40 : 40), cy + (y < cy ? -10 : 10));
      text(s, x - 34, y + (y < cy ? -22 : 36), 17, c);
    }
    marker(INK, 3);
    arrow(cx, cy + 62, cx, cy + 104);
    text('OUT  >  IN ?!', cx + 14, cy + 100, 20, INK);
    marker(RED, 3);
    g.beginPath();
    g.ellipse(cx + 2, 30, 112, 22, -0.03, 0, Math.PI * 2);
    g.stroke();
    text('generative source?', cx - 92, 37, 22, RED, HAND, -0.03);
    text('how???', 380, 140, 20, INK, HAND, 0.12);
    text('Σ out ≈ 4.07 × Σ in', 330, 240, 15, BLU);
    text('(check this!!)', 30, 128, 15, INK, HAND, -0.08);
    // ---- whiteboard 2: day 1
    g.fillStyle = '#f4f6f7';
    g.fillRect(512, 0, 512, 256);
    smudge(512, 0, 512, 256);
    text("DAY 1 — WE'RE IN!!!", 540, 44, 30, BLU, HAND, -0.02);
    marker(BLU, 3);
    line([[540, 52], [800, 47]]);
    text('09:12  breach open', 545, 84, 16, INK);
    text('09:40  ATRIUM !!!', 545, 106, 16, INK);
    text('10:15  readings off the scale', 545, 128, 16, INK);
    text('to do:', 545, 162, 18, GRN);
    ['1. samples (all 4)', '2. map the doors', '3. coffee', '4. name it?'].forEach((s, i) => text(s, 552, 184 + i * 18, 15, INK));
    text('names:', 800, 98, 16, INK);
    ['the Heart', 'Big Fridge', 'the PRISM ✓'].forEach((s, i) => {
      text(s, 806, 120 + i * 20, 15, INK);
      if (i < 2) {
        marker(RED, 2);
        line([[804, 115 + i * 20], [806 + s.length * 7.5, 115 + i * 20]]);
      }
    });
    marker(INK, 3);
    g.beginPath();
    g.arc(905, 205, 22, 0, Math.PI * 2);
    g.stroke();
    for (let i = 0; i < 5; i++) line([[883 + i * 11, 188], [883 + i * 11, 222]]);
    text("it's BEATING?", 838, 248, 15, RED);
    text("W — Bea's bday 7pm!!", 740, 238, 14, '#b2399b', HAND, -0.05);
    // ---- banner: WELCOME TEAM · DAY 1
    const bg = g.createLinearGradient(0, 256, 0, 320);
    bg.addColorStop(0, '#fff6e3');
    bg.addColorStop(1, '#f3e2c4');
    g.fillStyle = bg;
    g.fillRect(0, 256, 1024, 64);
    const word = 'WELCOME TEAM ✦ DAY 1';
    const cols = [RED, YEL, GRN, BLU];
    g.font = `bold 46px "Arial Black", Impact, sans-serif`;
    g.textBaseline = 'middle';
    let x = 30;
    [...word].forEach((ch, i) => {
      g.fillStyle = cols[i % 4];
      g.fillText(ch, x, 290);
      x += ch === ' ' ? 26 : g.measureText(ch).width + 4;
    });
    g.textBaseline = 'alphabetic';
    for (let i = 0; i < 1024; i += 32) {
      g.fillStyle = cols[(i / 32) % 4];
      g.beginPath();
      g.moveTo(i, 256);
      g.lineTo(i + 16, 266);
      g.lineTo(i + 32, 256);
      g.fill();
    }
    // ---- papers: typed pages, a graph, a table, a sketch, a schedule
    for (let i = 0; i < 8; i++) {
      const px = i * 64, py = 336;
      g.fillStyle = ['#f6f4ee', '#f2efe6', '#f7f7f4', '#efe9d8', '#f6f4ee', '#eef1f4', '#f6f4ee', '#f3eee0'][i];
      g.fillRect(px + 1, py + 1, 62, 86);
      g.fillStyle = 'rgba(40,44,54,0.75)';
      if (i === 1 || i === 5) {
        // a graph
        marker('rgba(40,44,54,0.8)', 1);
        line([[px + 8, py + 10], [px + 8, py + 50], [px + 58, py + 50]]);
        const c = i === 1 ? [RED, BLU] : [GRN, YEL];
        c.forEach((cc, k) => {
          marker(cc, 1.5);
          line(Array.from({ length: 10 }, (_, j) => [px + 10 + j * 5, py + 44 - j * (k ? 2.6 : 1.4) - Math.random() * 6]));
        });
        for (let r = 0; r < 4; r++) g.fillRect(px + 8, py + 58 + r * 6, 30 + Math.random() * 20, 2);
      } else if (i === 3) {
        // a hand sketch of the heart
        marker('rgba(30,50,120,0.8)', 1.5);
        g.beginPath();
        g.arc(px + 32, py + 36, 14, 0, Math.PI * 2);
        g.stroke();
        line([[px + 32, py + 8], [px + 32, py + 22]]);
        line([[px + 32, py + 50], [px + 32, py + 70]]);
        for (let r = 0; r < 3; r++) g.fillRect(px + 8, py + 74 + r * 4, 40, 1.5);
      } else if (i === 6) {
        // a table
        for (let r = 0; r < 9; r++) for (let c2 = 0; c2 < 4; c2++) g.fillRect(px + 7 + c2 * 13, py + 12 + r * 7, 10, 2);
        g.fillStyle = 'rgba(200,40,40,0.7)';
        g.fillRect(px + 46, py + 40, 10, 2);
      } else {
        g.fillRect(px + 8, py + 9, 30, 3);
        for (let r = 0; r < 12; r++) g.fillRect(px + 8, py + 18 + r * 5.5, 40 + Math.random() * 10, 1.6);
        if (i === 7) {
          g.fillStyle = 'rgba(200,40,40,0.8)';
          g.font = `9px ${TYPE}`;
          g.fillText('DAY 1', px + 34, py + 13);
        }
      }
    }
    // ---- sticky notes
    const sc = ['#f7e45a', '#ff9ec7', '#8fe3f2', '#a6ec7c'];
    const st = ['ask P.', 'DAY 1 :)', 'coffee→', 'it hums?'];
    for (let i = 0; i < 4; i++) {
      g.fillStyle = sc[i];
      g.fillRect(512 + i * 48 + 1, 337, 46, 46);
      text(st[i], 512 + i * 48 + 4, 364, 11, '#333', HAND, -0.08);
    }
    // ---- ID badge
    g.fillStyle = '#ffffff';
    g.fillRect(704, 336, 96, 60);
    g.fillStyle = '#3c6fd1';
    g.fillRect(704, 336, 96, 14);
    text('PRISM TEAM', 710, 347, 10, '#fff', 'sans-serif');
    g.fillStyle = '#b8c0cc';
    g.fillRect(710, 355, 28, 34);
    g.fillStyle = '#7a8494';
    g.beginPath();
    g.arc(724, 366, 7, 0, Math.PI * 2);
    g.fill();
    g.fillRect(714, 375, 20, 14);
    g.fillStyle = '#333';
    g.fillRect(744, 360, 48, 4);
    g.fillRect(744, 370, 36, 3);
    g.fillRect(744, 378, 42, 3);
    // ---- team photo (a polaroid): five people and the reactor
    g.fillStyle = '#fbfaf6';
    g.fillRect(808, 336, 96, 112);
    g.fillStyle = '#2a3346';
    g.fillRect(814, 342, 84, 80);
    g.fillStyle = '#c9b8ff';
    g.beginPath();
    g.arc(856, 356, 9, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < 5; i++) {
      g.fillStyle = ['#e7e2da', '#d7cfc4', '#f0ece6', '#ddd6cc', '#e9e4dc'][i];
      g.beginPath();
      g.arc(824 + i * 16, 388, 5, 0, Math.PI * 2);
      g.fill();
      g.fillRect(819 + i * 16, 394, 10, 24);
    }
    g.fillStyle = '#e7e2da';
    g.fillRect(814 + 3 * 16 + 9, 386, 4, 12); // somebody waving
    text('day 1!!', 836, 440, 14, '#2f62c8');
    // ---- calendar
    g.fillStyle = '#ffffff';
    g.fillRect(912, 336, 112, 112);
    g.fillStyle = '#d23b3b';
    g.fillRect(912, 336, 112, 20);
    text('MARCH', 944, 351, 13, '#fff', 'sans-serif');
    g.fillStyle = '#666';
    for (let r = 0; r < 5; r++) for (let c2 = 0; c2 < 7; c2++) g.fillRect(917 + c2 * 15, 364 + r * 16, 9, 6);
    marker(RED, 2.5);
    g.beginPath();
    g.ellipse(917 + 3 * 15 + 4, 364 + 2 * 16 + 3, 10, 8, 0, 0, Math.PI * 2);
    g.stroke();
    text('DAY 1', 950, 444, 11, RED);
    // ---- poster: breach protocol
    g.fillStyle = '#1d2a3c';
    g.fillRect(0, 440, 160, 224);
    g.fillStyle = '#f1c232';
    g.fillRect(0, 440, 160, 34);
    text('BREACH PROTOCOL', 9, 463, 14, '#1d2a3c', 'sans-serif');
    ['1  Log every entry', '2  Two-person rule', '3  No probes on', '    live conduits', '4  Back by 18:00', '5  Have fun! :)'].forEach((s, i) => text(s, 10, 500 + i * 24, 12, '#dfe6f0', 'sans-serif'));
    g.fillStyle = '#f1c232';
    g.fillRect(0, 648, 160, 16);
    // ---- the Atrium floor plan (blueprint)
    g.fillStyle = '#1f4f8f';
    g.fillRect(160, 440, 256, 160);
    marker('rgba(220,235,255,0.85)', 1.5);
    g.strokeRect(198, 452, 180, 136);
    g.beginPath();
    g.arc(288, 520, 26, 0, Math.PI * 2);
    g.stroke();
    g.strokeRect(278, 510, 20, 20);
    [[288, 588], [198, 486], [262, 452], [378, 486]].forEach(([x2, y2]) => g.strokeRect(x2 - 6, y2 - 4, 12, 8));
    text('ATRIUM — survey 1', 170, 596, 11, 'rgba(220,235,255,0.9)', TYPE);
    text('?', 284, 525, 14, '#ffd75a', HAND);
    // ---- clipboard sheet: a checklist
    g.fillStyle = '#f7f6f1';
    g.fillRect(416, 440, 96, 128);
    text('SAMPLES', 424, 458, 12, INK, 'sans-serif');
    ['thermal', 'photonic', 'organic', 'aqueous'].forEach((s, i) => {
      g.strokeStyle = INK;
      g.lineWidth = 1;
      g.strokeRect(424, 470 + i * 22, 9, 9);
      text(s, 438, 479 + i * 22, 11, INK, 'sans-serif');
      if (i < 2) text('✓', 423, 479 + i * 22, 13, GRN);
    });
    // ---- cake top
    g.fillStyle = '#fbf3f6';
    g.fillRect(512, 440, 128, 128);
    g.fillStyle = '#f7c6d9';
    g.beginPath();
    g.arc(576, 504, 60, 0, Math.PI * 2);
    g.lineWidth = 8;
    g.strokeStyle = '#f2a6c4';
    g.stroke();
    text('DAY 1', 542, 514, 26, BLU, HAND);
    for (let i = 0; i < 12; i++) {
      g.fillStyle = cols[i % 4];
      const a = (i / 12) * Math.PI * 2;
      g.fillRect(576 + Math.cos(a) * 48 - 2, 504 + Math.sin(a) * 48 - 2, 4, 4);
    }
    // ---- cork board
    g.fillStyle = '#b98a57';
    g.fillRect(640, 456, 192, 128);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(${90 + Math.random() * 60},${60 + Math.random() * 40},30,0.25)`;
      g.fillRect(640 + Math.random() * 192, 456 + Math.random() * 128, 2, 2);
    }
    // ---- binder spines
    for (let i = 0; i < 12; i++) {
      g.fillStyle = ['#2f62c8', '#d23b3b', '#3a3f48', '#2f9b4a', '#d9a514', '#6b4fa8'][i % 6];
      g.fillRect(832 + i * 16, 456, 15, 64);
      g.fillStyle = '#f2f2f2';
      g.fillRect(835 + i * 16, 470, 9, 18);
    }
    // ---- keyboard keys
    g.fillStyle = '#2b2e35';
    g.fillRect(832, 520, 192, 48);
    g.fillStyle = '#4a4f59';
    for (let r = 0; r < 4; r++) for (let c2 = 0; c2 < 16; c2++) g.fillRect(836 + c2 * 11.6, 524 + r * 10.5, 9.5, 8.5);
    // ---- door signs and desk plates
    ['FIELD OFFICE', 'INSTRUMENT LAB', 'PRISM RESEARCH', 'MONITORING'].forEach((s, i) => {
      const sx = (i % 2) * 256, sy = 672 + Math.floor(i / 2) * 40;
      g.fillStyle = '#20252f';
      g.fillRect(sx, sy, 256, 40);
      g.fillStyle = '#9bf6ff';
      g.fillRect(sx + 8, sy + 8, 6, 24);
      text(s, sx + 24, sy + 29, 22, '#e8eef5', 'sans-serif');
    });
    ['P. NAIR', 'W. ASHBY', 'T. OKAFOR', 'M. LINDQVIST'].forEach((s, i) => {
      g.fillStyle = '#c8ccd2';
      g.fillRect(512 + i * 128, 600, 128, 32);
      text(s, 512 + i * 128 + 10, 623, 18, '#22252b', 'sans-serif');
    });
  });
}

// SCREEN atlas (512²): 4×4 cells of 128×128 (what the monitors still show)
const SS = 512;
const SC = Object.fromEntries(['graph', 'log', 'spectrum', 'wave', 'heart', 'alert', 'prism', 'nosig', 'rack', 'map', 'error', 'cam', 'feeds', 'login', 'rack2', 'bars'].map((k, i) => [k, R(SS, (i % 4) * 128, Math.floor(i / 4) * 128, 128, 128)]));
function screenAtlas() {
  return canvas(SS, SS, (g) => {
    const cell = (k, bg, draw) => {
      const i = Object.keys(SC).indexOf(k), x = (i % 4) * 128, y = Math.floor(i / 4) * 128;
      g.save();
      g.translate(x, y);
      g.fillStyle = bg;
      g.fillRect(0, 0, 128, 128);
      draw();
      // scanlines
      g.fillStyle = 'rgba(0,0,0,0.18)';
      for (let j = 0; j < 128; j += 3) g.fillRect(0, j, 128, 1);
      g.restore();
    };
    const pl = (c, w, pts) => {
      g.strokeStyle = c;
      g.lineWidth = w;
      g.beginPath();
      pts.forEach(([a, b], i) => (i ? g.lineTo(a, b) : g.moveTo(a, b)));
      g.stroke();
    };
    const tx = (s, x, y, c, size = 10) => {
      g.fillStyle = c;
      g.font = `${size}px "Courier New", monospace`;
      g.fillText(s, x, y);
    };
    const C4 = ['#ff4a4a', '#ffd23a', '#4dff7a', '#4aa8ff'];
    cell('graph', '#061018', () => {
      pl('#1d3a4a', 1, [[10, 10], [10, 110], [120, 110]]);
      C4.forEach((c, k) => pl(c, 2, Array.from({ length: 22 }, (_, j) => [12 + j * 5, 96 - k * 14 - Math.sin(j * 0.6 + k) * 8 - (j > 15 ? (j - 15) * (6 + k * 2) : 0)])));
      tx('FEED LOAD', 14, 20, '#9bf6ff');
    });
    cell('log', '#020a04', () => {
      for (let j = 0; j < 11; j++) tx(['> init probe 4', 'OK  thermal 98.2', 'OK  photonic 101', 'OK  organic 97.6', 'OK  aqueous 99.9', '> sum in  397.0', '> sum out 1615.8', '?? gain x4.07', '> recheck... ', 'gain x4.07', '_'][j], 6, 14 + j * 10.5, '#5dff8a', 9);
    });
    cell('spectrum', '#0a0814', () => {
      for (let j = 0; j < 24; j++) {
        const h = 12 + Math.abs(Math.sin(j * 0.7) * 60) + Math.random() * 20;
        g.fillStyle = C4[Math.floor(j / 6)];
        g.fillRect(8 + j * 4.8, 112 - h, 3.6, h);
      }
      tx('SPECTRUM', 8, 16, '#d9c8ff');
    });
    cell('wave', '#04101a', () => {
      pl('#9bf6ff', 2, Array.from({ length: 60 }, (_, j) => [4 + j * 2, 64 + Math.sin(j * 0.5) * 30 * Math.sin(j * 0.07)]));
      tx('HUM 50.0 Hz?', 8, 116, '#9bf6ff');
    });
    cell('heart', '#100408', () => {
      pl('#ff5a7a', 2, [[0, 70], [30, 70], [36, 50], [42, 92], [48, 30], [54, 70], [80, 70], [86, 56], [92, 84], [98, 40], [104, 70], [128, 70]]);
      tx('BPM  31', 8, 18, '#ff8aa0', 12);
      tx('core temp ???', 8, 116, '#ff8aa0');
    });
    cell('alert', '#2a0303', () => {
      g.fillStyle = '#ff3030';
      g.fillRect(8, 40, 112, 48);
      tx('SURGE', 30, 72, '#fff', 22);
      tx('feed coupling 412%', 6, 110, '#ffb0b0', 9);
    });
    cell('prism', '#060a18', () => {
      pl('#c9b8ff', 2, [[64, 18], [92, 64], [64, 110], [36, 64], [64, 18]]);
      pl('#c9b8ff', 1, [[36, 64], [92, 64]]);
      C4.forEach((c, k) => {
        const [x2, y2] = [[14, 20], [14, 108], [114, 20], [114, 108]][k];
        pl(c, 2, [[x2, y2], [64 + (x2 < 64 ? -18 : 18), 64 + (y2 < 64 ? -14 : 14)]]);
      });
    });
    cell('nosig', '#0b2a6a', () => tx('NO SIGNAL', 22, 68, '#cfe0ff', 14));
    const rack = (k, seed) =>
      cell(k, '#101216', () => {
        for (let r = 0; r < 10; r++) {
          g.fillStyle = '#1c1f26';
          g.fillRect(6, 4 + r * 12.4, 116, 10);
          for (let j = 0; j < 8; j++) {
            const on = (Math.sin(r * 7.1 + j * 3.3 + seed) + 1) / 2;
            g.fillStyle = on > 0.6 ? (j % 3 ? '#4dff7a' : '#4aa8ff') : on > 0.45 ? '#ffb43a' : '#20242c';
            g.fillRect(10 + j * 6, 7 + r * 12.4, 3, 3);
          }
          g.fillStyle = '#2a2f38';
          g.fillRect(70, 6 + r * 12.4, 46, 6);
        }
      });
    rack('rack', 1);
    rack('rack2', 4);
    cell('map', '#041018', () => {
      g.strokeStyle = '#3fd0ff';
      g.lineWidth = 1.5;
      g.strokeRect(20, 20, 88, 88);
      g.beginPath();
      g.arc(64, 64, 14, 0, Math.PI * 2);
      g.stroke();
      C4.forEach((c, k) => {
        g.fillStyle = c;
        const [x2, y2] = [[64, 106], [22, 46], [54, 22], [106, 46]][k];
        g.fillRect(x2 - 4, y2 - 3, 8, 6);
      });
      g.fillStyle = '#ffffff';
      g.fillRect(40, 96, 4, 4);
      tx('you are here', 46, 100, '#9bf6ff', 8);
    });
    cell('error', '#0a0a0a', () => {
      g.fillStyle = '#c8c8c8';
      g.fillRect(14, 34, 100, 60);
      g.fillStyle = '#1a2a8a';
      g.fillRect(14, 34, 100, 12);
      tx('ERROR', 18, 44, '#fff', 9);
      tx('feed sync lost', 20, 64, '#111', 9);
      tx('[ RETRY ]', 36, 84, '#111', 9);
    });
    cell('cam', '#06070a', () => {
      const gr = g.createRadialGradient(64, 54, 4, 64, 54, 40);
      gr.addColorStop(0, '#f2e8ff');
      gr.addColorStop(0.4, '#7a5cc8');
      gr.addColorStop(1, '#06070a');
      g.fillStyle = gr;
      g.fillRect(0, 0, 128, 128);
      tx('CAM 2  ATRIUM', 6, 120, '#e8e8e8', 9);
      g.fillStyle = '#ff3030';
      g.beginPath();
      g.arc(116, 10, 4, 0, Math.PI * 2);
      g.fill();
    });
    cell('feeds', '#060c10', () => {
      C4.forEach((c, k) => {
        tx(['THERMAL', 'PHOTONIC', 'ORGANIC', 'AQUEOUS'][k], 6, 20 + k * 28, c, 9);
        g.fillStyle = c;
        g.fillRect(6, 25 + k * 28, 50 + Math.random() * 60, 5);
      });
    });
    cell('login', '#0e1a2e', () => {
      tx('PRISM TEAM', 30, 50, '#9bf6ff', 12);
      g.fillStyle = '#e8eef5';
      g.fillRect(24, 62, 80, 12);
      tx('wren ashby_', 27, 72, '#111', 9);
    });
    cell('bars', '#050b08', () => {
      for (let j = 0; j < 8; j++) {
        g.fillStyle = j > 5 ? '#ff4a4a' : '#4dff7a';
        g.fillRect(10 + j * 14, 110 - (20 + j * 11), 10, 20 + j * 11);
      }
      tx('OUTPUT', 8, 16, '#5dff8a');
    });
  });
}

// SCORCH atlas (512², alpha): scorch blob, streak, splatter, two burn silhouettes, two crack stars, a stain
const DS = 512;
const D = {
  blob: R(DS, 0, 0, 256, 256),
  streak: R(DS, 256, 0, 256, 128),
  splat: R(DS, 256, 128, 128, 128),
  crack: R(DS, 384, 128, 128, 128),
  sil1: R(DS, 0, 256, 192, 256),
  sil2: R(DS, 192, 256, 192, 256),
  crack2: R(DS, 384, 256, 128, 128),
  stain: R(DS, 384, 384, 128, 128),
};
function scorchAtlas() {
  return canvas(DS, DS, (g) => {
    g.clearRect(0, 0, DS, DS);
    const blob = (x, y, r, a) => {
      for (let i = 0; i < 40; i++) {
        const rr = r * (0.3 + Math.random() * 0.7), ox = (Math.random() - 0.5) * r * 0.6, oy = (Math.random() - 0.5) * r * 0.6;
        const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rr);
        gr.addColorStop(0, `rgba(10,8,8,${a * 0.18})`);
        gr.addColorStop(1, 'rgba(10,8,8,0)');
        g.fillStyle = gr;
        g.fillRect(x - r * 1.4, y - r * 1.4, r * 2.8, r * 2.8);
      }
    };
    blob(128, 128, 120, 1);
    // streak: hot end at the left (u 0), fanning out and fading to the right
    g.save();
    g.beginPath();
    g.rect(256, 0, 256, 128);
    g.clip();
    g.filter = 'blur(3px)';
    for (let i = 0; i < 40; i++) {
      const spread = (Math.random() - 0.5) * 2, len = 150 + Math.random() * 100, x0 = 262 + Math.random() * 40;
      const gr = g.createLinearGradient(x0, 0, x0 + len, 0);
      gr.addColorStop(0, 'rgba(10,7,6,0)');
      gr.addColorStop(0.15, `rgba(10,7,6,${0.05 + Math.random() * 0.04})`);
      gr.addColorStop(0.55, 'rgba(10,7,6,0.035)');
      gr.addColorStop(1, 'rgba(10,7,6,0)');
      g.strokeStyle = gr;
      g.lineWidth = 3 + Math.random() * 9;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x0, 64 + spread * 22);
      g.lineTo(x0 + len, 64 + spread * 50);
      g.stroke();
    }
    g.filter = 'none';
    g.restore();
    blob(320, 192, 50, 0.9);
    // burn silhouettes: a scorched patch with a pale person-shaped shadow left in it, fringed in white
    // (tinted per copy: each glows faintly in one world's colour)
    const person = (ox, pose) => {
      g.save();
      g.beginPath();
      if (pose === 0) {
        // standing, one arm thrown up over the face
        g.ellipse(ox + 92, 330, 15, 18, 0, 0, Math.PI * 2);
        g.moveTo(ox + 70, 350);
        g.lineTo(ox + 116, 350);
        g.lineTo(ox + 120, 420);
        g.lineTo(ox + 112, 500);
        g.lineTo(ox + 98, 500);
        g.lineTo(ox + 93, 440);
        g.lineTo(ox + 88, 500);
        g.lineTo(ox + 74, 500);
        g.lineTo(ox + 68, 420);
        g.closePath();
        g.moveTo(ox + 112, 352);
        g.lineTo(ox + 140, 310);
        g.lineTo(ox + 132, 292);
        g.lineTo(ox + 104, 340);
        g.closePath();
        g.moveTo(ox + 72, 354);
        g.lineTo(ox + 56, 410);
        g.lineTo(ox + 64, 414);
        g.lineTo(ox + 80, 368);
        g.closePath();
      } else {
        // half-turned, mid-step, a hand reaching out
        g.ellipse(ox + 96, 328, 14, 17, 0.2, 0, Math.PI * 2);
        g.moveTo(ox + 76, 348);
        g.lineTo(ox + 112, 348);
        g.lineTo(ox + 116, 420);
        g.lineTo(ox + 132, 498);
        g.lineTo(ox + 118, 502);
        g.lineTo(ox + 98, 440);
        g.lineTo(ox + 80, 502);
        g.lineTo(ox + 66, 498);
        g.lineTo(ox + 78, 420);
        g.closePath();
        g.moveTo(ox + 110, 352);
        g.lineTo(ox + 166, 372);
        g.lineTo(ox + 164, 382);
        g.lineTo(ox + 106, 368);
        g.closePath();
      }
      g.restore();
    };
    for (let k = 0; k < 2; k++) {
      const ox = k * 192;
      g.save();
      g.beginPath();
      g.rect(ox, 256, 192, 256);
      g.clip();
      for (let i = 0; i < 70; i++) {
        const x = ox + 96 + (Math.random() - 0.5) * 120, y = 400 + (Math.random() - 0.5) * 180, r = 30 + Math.random() * 60;
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, 'rgba(12,9,9,0.1)');
        gr.addColorStop(1, 'rgba(12,9,9,0)');
        g.fillStyle = gr;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      // the shadow: cut the scorch out, then a soft bright rim
      g.globalCompositeOperation = 'destination-out';
      g.filter = 'blur(2px)';
      g.fillStyle = 'rgba(0,0,0,1)';
      person(ox, k);
      g.fill();
      g.globalCompositeOperation = 'source-over';
      // the bleached shadow: faintly paler than the wall, a soft tinted halo at its edge
      g.filter = 'blur(5px)';
      g.strokeStyle = 'rgba(170,170,170,0.14)';
      g.lineWidth = 8;
      person(ox, k);
      g.stroke();
      g.filter = 'blur(1.5px)';
      g.fillStyle = 'rgba(150,150,150,0.07)';
      person(ox, k);
      g.fill();
      g.filter = 'none';
      g.restore();
    }
    // glass cracks: white lines from an impact point, with a ring or two
    const crack = (x, y, n) => {
      g.strokeStyle = 'rgba(235,248,255,0.9)';
      g.lineWidth = 1.2;
      for (let i = 0; i < n; i++) {
        let a = (i / n) * Math.PI * 2 + Math.random() * 0.4, px = x, py = y;
        g.beginPath();
        g.moveTo(px, py);
        for (let s = 0; s < 6; s++) {
          a += (Math.random() - 0.5) * 0.5;
          px += Math.cos(a) * 11;
          py += Math.sin(a) * 11;
          g.lineTo(px, py);
        }
        g.stroke();
      }
      for (const rr of [10, 22]) {
        g.beginPath();
        for (let i = 0; i <= 12; i++) {
          const a = (i / 12) * Math.PI * 2, r2 = rr * (0.8 + Math.random() * 0.4);
          i ? g.lineTo(x + Math.cos(a) * r2, y + Math.sin(a) * r2) : g.moveTo(x + Math.cos(a) * r2, y + Math.sin(a) * r2);
        }
        g.stroke();
      }
    };
    crack(448, 192, 11);
    crack(448, 320, 8);
    // a coffee stain
    g.strokeStyle = 'rgba(90,55,25,0.55)';
    g.lineWidth = 5;
    g.beginPath();
    g.arc(448, 448, 34, 0.3, Math.PI * 2.1);
    g.stroke();
    g.fillStyle = 'rgba(110,70,30,0.18)';
    g.beginPath();
    g.arc(448, 448, 32, 0, Math.PI * 2);
    g.fill();
  });
}

function noiseTex() {
  const t = canvas(128, 128, (g) => {
    const im = g.createImageData(128, 128);
    for (let i = 0; i < im.data.length; i += 4) {
      const v = Math.random() * 255;
      im.data[i] = im.data[i + 1] = im.data[i + 2] = v;
      im.data[i + 3] = 255;
    }
    g.putImageData(im, 0, 0);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (let j = 0; j < 128; j += 2) g.fillRect(0, j, 128, 1);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ---------------------------------------------------------------- materials (shared by every room)
let MATS = null;
function materials() {
  if (MATS) return MATS;
  const print = printAtlas(), screen = screenAtlas(), scorch = scorchAtlas(), noise = noiseTex();
  const lampC = new THREE.Color(0xf2f6ff).multiplyScalar(1.7);
  MATS = {
    prop: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.05 }),
    metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.55 }),
    print: new THREE.MeshStandardMaterial({ vertexColors: true, map: print, emissiveMap: print, emissive: 0x111111, roughness: 0.85, metalness: 0 }),
    screen: new THREE.MeshBasicMaterial({ vertexColors: true, map: screen, color: new THREE.Color(1.35, 1.35, 1.35) }),
    static: new THREE.MeshBasicMaterial({ map: noise, color: new THREE.Color(0.75, 0.85, 0.95) }),
    lamp: new THREE.MeshBasicMaterial({ vertexColors: true, color: lampC }),
    flickA: new THREE.MeshBasicMaterial({ vertexColors: true, color: lampC.clone() }),
    flickB: new THREE.MeshBasicMaterial({ vertexColors: true, color: lampC.clone() }),
    glass: new THREE.MeshStandardMaterial({ color: 0xa8dcff, transparent: true, opacity: 0.13, roughness: 0.05, metalness: 0.25, depthWrite: false }),
    decal: new THREE.MeshStandardMaterial({ vertexColors: true, map: scorch, transparent: true, depthWrite: false, roughness: 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
  };
  MATS.lampC = lampC;
  return MATS;
}

// ---------------------------------------------------------------- the kit: geometry gathered per material
const strip = (g) => {
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
  return n;
};
let GEO = null;
function geos() {
  GEO ??= {
    box: strip(new THREE.BoxGeometry(1, 1, 1)),
    cyl: strip(new THREE.CylinderGeometry(1, 1, 1, 10)),
    cyl6: strip(new THREE.CylinderGeometry(1, 1, 1, 6)),
    cup: strip(new THREE.CylinderGeometry(1, 0.72, 1, 10)),
    cone: strip(new THREE.ConeGeometry(1, 1, 8)),
    sph: strip(new THREE.SphereGeometry(1, 8, 6)),
    quad: strip(new THREE.PlaneGeometry(1, 1)), // faces +z
    disc: strip(new THREE.CircleGeometry(1, 16)), // faces +z
    rib: strip(new THREE.TorusGeometry(1, 0.09, 3, 10, Math.PI * 1.55).rotateZ(Math.PI * 0.225 + Math.PI / 2).rotateX(Math.PI / 2)), // open at the front (+z)
    tri: strip(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.1, 1, 0], 3)).setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3)).setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2))),
  };
  return GEO;
}
const _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
// translate · rotate (yaw, then pitch, then roll) · scale
function T(x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(sx, sy, sz));
}
const mul = (A, B) => new THREE.Matrix4().multiplyMatrices(A, B);
const I = new THREE.Matrix4();

class Kit {
  constructor(W) {
    this.W = W;
    this.parts = new Map();
  }
  add(part, geo, M, color = 0xffffff, uv = null) {
    const g = geo.clone().applyMatrix4(M);
    if (uv) {
      const a = g.attributes.uv;
      for (let i = 0; i < a.count; i++) a.setXY(i, uv[0] + a.getX(i) * (uv[2] - uv[0]), uv[1] + a.getY(i) * (uv[3] - uv[1]));
    }
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    if (color && color.isColor) _c.copy(color);
    else _c.set(color);
    for (let i = 0; i < n; i++) col.set([_c.r, _c.g, _c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (!this.parts.has(part)) this.parts.set(part, []);
    this.parts.get(part).push(g);
  }
  // primitives in a parent frame M (local position, size, rotation)
  box(M, part, x, y, z, w, h, d, color, ry = 0, rx = 0, rz = 0, uv = null) {
    this.add(part, geos().box, mul(M, T(x, y, z, ry, rx, rz, w, h, d)), color, uv);
  }
  cyl(M, part, x, y, z, r, h, color, ry = 0, rx = 0, rz = 0, geo = 'cyl') {
    this.add(part, geos()[geo], mul(M, T(x, y, z, ry, rx, rz, r, h, r)), color);
  }
  sph(M, part, x, y, z, r, color, sy = 1, sz = 1, ry = 0, rx = 0, rz = 0) {
    this.add(part, geos().sph, mul(M, T(x, y, z, ry, rx, rz, r, r * sy, r * sz)), color);
  }
  quad(M, part, x, y, z, w, h, color, uv = null, ry = 0, rx = 0, rz = 0) {
    this.add(part, geos().quad, mul(M, T(x, y, z, ry, rx, rz, w, h, 1)), color, uv);
  }
  // an axis-aligned box in world coordinates
  aabb(part, x1, y1, z1, x2, y2, z2, color) {
    this.add(part, geos().box, T((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2, 0, 0, 0, Math.abs(x2 - x1), Math.abs(y2 - y1), Math.abs(z2 - z1)), color);
  }
  // a solid (collision) box given in a frame M (only right-angle turns: its world bounds are taken)
  solid(M, x1, y1, z1, x2, y2, z2, props = {}) {
    const a = new THREE.Vector3(Infinity, Infinity, Infinity), b = new THREE.Vector3(-Infinity, -Infinity, -Infinity), v = new THREE.Vector3();
    for (const x of [x1, x2]) for (const y of [y1, y2]) for (const z of [z1, z2]) {
      v.set(x, y, z).applyMatrix4(M);
      a.min(v);
      b.max(v);
    }
    return this.W.addSolid(a, b, { static: true, kind: 'metal', ...props });
  }
  // merge each material's pieces into one mesh, in one group for the room (culled as one by World)
  build(name) {
    const M = materials(), group = new THREE.Group();
    group.name = name;
    for (const [part, list] of this.parts) {
      const mesh = new THREE.Mesh(mergeGeometries(list, false), M[part]);
      list.forEach((g) => g.dispose());
      mesh.matrixAutoUpdate = false;
      if (part === 'glass') mesh.renderOrder = 2;
      if (part === 'decal') mesh.renderOrder = 1;
      group.add(mesh);
    }
    this.parts.clear();
    this.W.scene.add(group);
    return group;
  }
}

// ---------------------------------------------------------------- the prop library (every prop's front is +z)
const COL = {
  lam: 0xcfc8b6, lamGrey: 0x9aa1aa, frame: 0x2f343c, fabric: 0x5f6b78, fabric2: 0x6c6878, cap: 0x8a9099,
  chair: 0x2a2e36, chairSeat: 0x3c4656, beige: 0xcdc6b2, black: 0x1c1e22, white: 0xdfe3e7, bone: 0xc9bfa4,
  boneDark: 0x9d927a, socket: 0x120e0b, coat: 0xa9ada9, coatHung: 0xc2c7cb, alu: 0x9aa2ac, wood: 0x8a6440, shard: 0x7f9fab,
};

function deskTop(K, M, w, d, { h = 0.74, top = COL.lam, frame = COL.frame, solid = true, legs = true } = {}) {
  K.box(M, 'prop', 0, h - 0.0175, 0, w, 0.035, d, top);
  if (legs) {
    for (const s of [-1, 1]) K.box(M, 'metal', s * (w / 2 - 0.04), (h - 0.035) / 2, 0, 0.04, h - 0.035, d - 0.08, frame);
    K.box(M, 'metal', 0, h - 0.3, -d / 2 + 0.05, w - 0.12, 0.4, 0.02, frame);
  }
  if (solid) K.solid(M, -w / 2, 0, -d / 2, w / 2, h, d / 2);
}
function chair(K, M, seat = COL.chairSeat) {
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    K.box(M, 'metal', Math.sin(a) * 0.15, 0.06, Math.cos(a) * 0.15, 0.04, 0.03, 0.3, COL.chair, a);
    K.box(M, 'metal', Math.sin(a) * 0.29, 0.025, Math.cos(a) * 0.29, 0.04, 0.05, 0.05, COL.black, a);
  }
  K.cyl(M, 'metal', 0, 0.25, 0, 0.025, 0.36, COL.alu);
  K.box(M, 'prop', 0, 0.46, 0, 0.47, 0.07, 0.46, seat);
  K.box(M, 'prop', 0, 0.82, -0.23, 0.44, 0.52, 0.06, seat, 0, -0.12);
  K.box(M, 'metal', 0, 0.6, -0.22, 0.05, 0.3, 0.03, COL.chair);
  for (const s of [-1, 1]) {
    K.box(M, 'metal', s * 0.25, 0.58, 0, 0.03, 0.2, 0.03, COL.chair);
    K.box(M, 'prop', s * 0.25, 0.68, 0.01, 0.06, 0.03, 0.26, COL.chair);
  }
}
// a chair lying on its side (its occupant would have faced `ry`)
const chairFallen = (K, x, z, ry, side = 1) => chair(K, T(x, FLOOR + 0.25, z, ry, 0, side * Math.PI / 2).multiply(T(0, -0.25, 0)), COL.chairSeat);
function crt(K, M, cell, part = 'screen') {
  K.box(M, 'prop', 0, 0.18, 0, 0.4, 0.34, 0.36, COL.beige);
  K.box(M, 'prop', 0, 0.17, -0.25, 0.28, 0.26, 0.18, COL.beige);
  K.box(M, 'prop', 0, 0.01, 0, 0.26, 0.02, 0.24, COL.beige);
  K.quad(M, part, 0, 0.19, 0.181, 0.31, 0.24, 0xffffff, part === 'screen' ? SC[cell] : null);
}
function flat(K, M, cell) {
  K.box(M, 'metal', 0, 0.01, 0, 0.2, 0.02, 0.16, COL.black);
  K.box(M, 'metal', 0, 0.14, -0.03, 0.04, 0.26, 0.03, COL.black);
  K.box(M, 'prop', 0, 0.32, 0, 0.56, 0.34, 0.03, COL.black);
  K.quad(M, 'screen', 0, 0.32, 0.016, 0.52, 0.3, 0xffffff, SC[cell]);
}
function keyboard(K, M) {
  K.box(M, 'prop', 0, 0.012, 0, 0.44, 0.024, 0.15, 0x2b2e35);
  K.quad(M, 'print', 0, 0.0245, 0.005, 0.41, 0.11, 0xffffff, P.keys, 0, -Math.PI / 2);
}
function mug(K, M, color) {
  K.cyl(M, 'prop', 0, 0.048, 0, 0.04, 0.095, color);
  K.cyl(M, 'prop', 0, 0.094, 0, 0.034, 0.004, 0x2a1a10);
  K.box(M, 'prop', 0.048, 0.05, 0, 0.014, 0.05, 0.012, color);
}
const mugFallen = (K, x, y, z, ry, color) => mug(K, T(x, y + 0.04, z, ry, 0, Math.PI / 2).multiply(T(0, -0.045, 0)), color);
function paper(K, x, y, z, ry, i, tilt = 0, tint = 0xffffff) {
  K.quad(I, 'print', x, y, z, 0.21, 0.29, tint, P.paper[i % 8], ry, -Math.PI / 2 + tilt);
}
function stack(K, M, n, rnd) {
  for (let i = 0; i < n; i++) K.box(M, 'prop', (rnd() - 0.5) * 0.02, 0.003 + i * 0.006, (rnd() - 0.5) * 0.02, 0.21, 0.006, 0.29, i % 5 ? 0xcfcdc6 : 0xc4bfac, (rnd() - 0.5) * 0.15);
  K.quad(M, 'print', 0, n * 0.006 + 0.001, 0, 0.21, 0.29, 0xffffff, P.paper[Math.floor(rnd() * 8)], 0, -Math.PI / 2);
}
function binder(K, M, color) {
  K.box(M, 'prop', 0, 0.15, 0, 0.055, 0.3, 0.26, color);
}
function clipboard(K, M) {
  K.box(M, 'prop', 0, 0.004, 0, 0.23, 0.008, 0.32, COL.wood);
  K.quad(M, 'print', 0, 0.009, 0.01, 0.2, 0.27, 0xffffff, P.clip, 0, -Math.PI / 2);
  K.box(M, 'metal', 0, 0.014, -0.14, 0.09, 0.012, 0.03, COL.alu);
}
function whiteboard(K, M, uv, w = 2.4, h = 1.2) {
  K.box(M, 'metal', 0, 0, 0.015, w + 0.06, h + 0.06, 0.03, COL.alu);
  K.quad(M, 'print', 0, 0, 0.031, w, h, 0xffffff, uv);
  K.box(M, 'metal', 0, -h / 2 - 0.04, 0.06, w * 0.6, 0.025, 0.07, COL.alu);
  [0xd23b3b, 0x2f62c8, 0x23262e].forEach((c, i) => K.cyl(M, 'prop', -0.3 + i * 0.16, -h / 2 - 0.016, 0.065, 0.011, 0.12, c, 0, 0, Math.PI / 2));
}
function rack(K, M, cell, h = 2.0) {
  K.box(M, 'metal', 0, h / 2, 0, 0.62, h, 0.9, 0x23262c);
  K.box(M, 'metal', 0, h + 0.01, 0, 0.6, 0.02, 0.86, 0x3a3f48);
  K.quad(M, 'screen', 0, h / 2 + 0.05, 0.451, 0.5, h - 0.3, 0xffffff, SC[cell]);
  K.box(M, 'metal', 0.27, h / 2, 0.455, 0.03, h - 0.1, 0.02, COL.alu);
  K.solid(M, -0.31, 0, -0.45, 0.31, h, 0.45);
}
const VIAL = [0xff3b3b, 0xffd23a, 0x40ff70, 0x3a9bff];
function sampleCase(K, M, open = true, spill = 0) {
  K.box(M, 'metal', 0, 0.05, 0, 0.5, 0.1, 0.34, COL.alu);
  K.box(M, 'prop', 0, 0.1, 0, 0.46, 0.005, 0.3, 0x1f2a36);
  if (open) K.box(M, 'metal', 0, 0.26, -0.19, 0.5, 0.32, 0.03, COL.alu, 0, -0.25);
  for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) if (r * 4 + c >= spill) K.cyl(M, 'lamp', -0.16 + c * 0.105, 0.14, -0.06 + r * 0.12, 0.022, 0.09, VIAL[c]);
}
function microscope(K, M) {
  K.box(M, 'prop', 0, 0.02, 0, 0.2, 0.04, 0.26, COL.white);
  K.box(M, 'prop', 0, 0.18, -0.09, 0.06, 0.32, 0.07, COL.white, 0, -0.15);
  K.box(M, 'metal', 0, 0.13, 0.02, 0.15, 0.015, 0.14, COL.black);
  K.cyl(M, 'metal', 0, 0.28, 0, 0.026, 0.2, COL.black, 0, 0.45);
  K.cyl(M, 'metal', 0, 0.38, -0.05, 0.016, 0.08, COL.black, 0, 0.45);
  K.cyl(M, 'metal', 0, 0.19, 0.03, 0.03, 0.03, COL.alu);
}
function spectrometer(K, M) {
  K.box(M, 'prop', 0, 0.12, 0, 0.56, 0.24, 0.36, 0x8c949e);
  K.box(M, 'prop', 0, 0.245, 0, 0.5, 0.01, 0.3, 0x6c737c);
  K.cyl(M, 'metal', 0.34, 0.12, 0, 0.06, 0.14, COL.black, 0, 0, Math.PI / 2);
  K.quad(M, 'screen', -0.1, 0.14, 0.181, 0.22, 0.13, 0xffffff, SC.spectrum);
  for (let i = 0; i < 3; i++) K.cyl(M, 'metal', 0.1 + i * 0.07, 0.1, 0.19, 0.015, 0.02, COL.alu, 0, Math.PI / 2);
}
function labCoat(K, M) {
  // hanging from a hook at the origin: shoulders, a body that flares a little, sleeves, collar, pocket, buttons
  K.box(M, 'metal', 0, 0, 0.02, 0.03, 0.06, 0.06, COL.alu);
  K.box(M, 'prop', 0, -0.07, 0.07, 0.4, 0.07, 0.13, COL.coatHung);
  K.box(M, 'prop', 0, -0.34, 0.075, 0.42, 0.5, 0.14, COL.coatHung);
  K.box(M, 'prop', 0, -0.8, 0.08, 0.46, 0.44, 0.12, COL.coatHung, 0, 0.03);
  for (const s of [-1, 1]) {
    K.box(M, 'prop', s * 0.25, -0.38, 0.1, 0.1, 0.6, 0.1, 0xbfc6cc, 0, 0.05, s * 0.07);
    K.box(M, 'prop', s * 0.06, -0.14, 0.15, 0.07, 0.16, 0.012, 0xaab2ba, 0, 0, s * -0.45); // lapels
    K.box(M, 'prop', s * 0.12, -0.72, 0.145, 0.12, 0.1, 0.01, 0xb4bcc4); // pockets
  }
  K.box(M, 'prop', 0, -0.55, 0.148, 0.012, 0.92, 0.006, 0x9aa3ac);
  for (let i = 0; i < 4; i++) K.box(M, 'prop', 0.025, -0.3 - i * 0.18, 0.15, 0.018, 0.018, 0.008, 0x6c747c);
  K.box(M, 'prop', -0.12, -0.3, 0.147, 0.06, 0.04, 0.008, 0x3c6fd1); // a pen in the breast pocket
}
function cake(K, M) {
  K.cyl(M, 'prop', 0, 0.01, 0, 0.26, 0.02, COL.white); // board
  K.cyl(M, 'prop', 0, 0.075, 0, 0.19, 0.11, 0xf7e9ee);
  K.cyl(M, 'prop', 0, 0.06, 0, 0.192, 0.025, 0xf2a6c4);
  K.add('print', geos().disc, mul(M, T(0, 0.131, 0, 0, -Math.PI / 2, 0, 0.19, 0.19, 1)), 0xffffff, P.cake);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    K.cyl(M, 'prop', Math.cos(a) * 0.12, 0.165, Math.sin(a) * 0.12, 0.006, 0.07, VIAL[i]);
  }
  // one slice out on a plate
  K.cyl(M, 'prop', 0.36, 0.005, 0.12, 0.09, 0.01, COL.white);
  K.box(M, 'prop', 0.36, 0.05, 0.12, 0.09, 0.08, 0.05, 0xf7e9ee, 0.7);
}
function cupR(K, M, color = 0xc8323c) {
  K.add('prop', geos().cup, mul(M, T(0, 0.06, 0, 0, 0, 0, 0.045, 0.12, 0.045)), color);
}
function hat(K, M, color) {
  K.add('prop', geos().cone, mul(M, T(0, 0.09, 0, 0, 0, 0, 0.07, 0.18, 0.07)), color);
  K.sph(M, 'prop', 0, 0.185, 0, 0.018, 0xffffff);
}
function lampStrip(K, x, y, z, along, part, cable = 0.6) {
  const [w, d] = along === 'x' ? [1.3, 0.2] : [0.2, 1.3];
  K.aabb('metal', x - w / 2, y, z - d / 2, x + w / 2, y + 0.07, z + d / 2, 0x3a3f48);
  K.aabb(part, x - w / 2 + 0.05, y - 0.02, z - d / 2 + 0.04, x + w / 2 - 0.05, y, z + d / 2 - 0.04, 0xffffff);
  for (const s of [-1, 1]) {
    const cx = along === 'x' ? x + s * 0.5 : x, cz = along === 'x' ? z : z + s * 0.5;
    K.aabb('metal', cx - 0.01, y + 0.07, cz - 0.01, cx + 0.01, y + 0.07 + cable, cz + 0.01, COL.black);
  }
}
function deskLamp(K, M, on = true) {
  K.cyl(M, 'metal', 0, 0.01, 0, 0.07, 0.02, COL.black);
  K.box(M, 'metal', 0, 0.18, -0.04, 0.02, 0.34, 0.02, COL.black, 0, 0.25);
  K.box(M, 'metal', 0, 0.33, 0.06, 0.02, 0.02, 0.24, COL.black, 0, 0.3);
  K.add('metal', geos().cone, mul(M, T(0, 0.3, 0.17, 0, 0.5, 0, 0.07, 0.1, 0.07)), 0x2d4a6a);
  if (on) K.sph(M, 'lamp', 0, 0.27, 0.19, 0.03, 0xfff1c8);
}
function plant(K, M, dead = true) {
  K.cyl(M, 'prop', 0, 0.14, 0, 0.13, 0.28, 0xb4643c, 0, 0, 0, 'cup');
  K.cyl(M, 'prop', 0, 0.27, 0, 0.12, 0.01, 0x3a2a1a);
  const leaf = dead ? 0x7a6a3c : 0x3f7a3c;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    K.box(M, 'prop', Math.cos(a) * 0.08, 0.36, Math.sin(a) * 0.08, 0.04, 0.22, 0.012, leaf, -a, 0, dead ? 0.9 + i * 0.08 : 0.3);
  }
}
function cabinet(K, M, open = true) {
  K.box(M, 'metal', 0, 0.66, 0, 0.5, 1.32, 0.62, 0x7d858f);
  for (let i = 0; i < 4; i++) {
    const dz = open && i === 1 ? 0.35 : 0;
    K.box(M, 'metal', 0, 0.17 + i * 0.32, 0.31 + dz, 0.46, 0.28, 0.02, 0x8d959f);
    K.box(M, 'metal', 0, 0.24 + i * 0.32, 0.33 + dz, 0.12, 0.02, 0.03, COL.alu);
    if (dz) {
      K.box(M, 'metal', 0, 0.1 + i * 0.32, 0.31 + dz / 2, 0.44, 0.02, dz, 0x5d646d);
      for (let j = 0; j < 6; j++) K.box(M, 'prop', 0, 0.2 + i * 0.32, 0.36 + j * 0.05, 0.36, 0.2, 0.004, 0xf0ece0, 0, 0.1);
    }
  }
  K.solid(M, -0.25, 0, -0.31, 0.25, 1.32, 0.31);
}
function shelf(K, M, w = 1.8, rnd) {
  K.box(M, 'metal', 0, 0.9, -0.16, w, 1.8, 0.02, 0x4a5058);
  for (const s of [-1, 1]) K.box(M, 'metal', s * (w / 2 - 0.01), 0.9, 0, 0.02, 1.8, 0.34, 0x4a5058);
  const cols = [0x2f62c8, 0xd23b3b, 0x3a3f48, 0x2f9b4a, 0xd9a514, 0x6b4fa8, 0xe6e2d6];
  for (let r = 0; r < 4; r++) {
    K.box(M, 'metal', 0, 0.02 + r * 0.45, 0, w - 0.02, 0.02, 0.32, 0x5a616a);
    let x = -w / 2 + 0.06;
    while (x < w / 2 - 0.12) {
      if (rnd() < 0.18) {
        x += 0.12;
        continue;
      }
      const lean = rnd() < 0.1 ? 0.3 : 0;
      K.box(M, 'prop', x, 0.03 + r * 0.45 + 0.15, 0.0, 0.055, 0.3, 0.26, cols[Math.floor(rnd() * cols.length)], 0, 0, lean);
      x += 0.06;
    }
  }
  K.solid(M, -w / 2, 0, -0.17, w / 2, 1.8, 0.17);
}

// ---------------------------------------------------------------- skeletons
// A stylised human skeleton (1.75 m), posed by joint angles; with a lab coat and an ID badge if `coat`.
// The root is the pelvis; the body faces +z. Angles (radians): waist / chest / neck = [pitch, yaw, roll]
// (pitch > 0 bends forward), arms / legs = [swing forward, out sideways, twist], elbows / knees bend.
function skeleton(K, M, pose = {}, coat = true) {
  const p = { waist: [0, 0, 0], chest: [0, 0, 0], neck: [0, 0, 0], armL: [0, 0, 0], armR: [0, 0, 0], elbowL: 0, elbowR: 0, legL: [0, 0, 0], legR: [0, 0, 0], kneeL: 0, kneeR: 0, jaw: 0.15, ...pose };
  const B = COL.bone, BD = COL.boneDark, S = COL.socket;
  const J = (F, x, y, z, a = [0, 0, 0]) => mul(F, T(x, y, z, a[1], a[0], a[2]));
  // a long bone hanging down the frame's -y: a shaft with knobbly ends
  const bone = (F, len, r) => {
    K.cyl(F, 'prop', 0, -len / 2, 0, r, len, B, 0, 0, 0, 'cyl6');
    K.sph(F, 'prop', 0, -0.012, 0, r * 1.7, BD);
    K.sph(F, 'prop', 0, -len + 0.012, 0, r * 1.6, B);
  };
  // pelvis: two wings and the sacrum
  for (const s of [-1, 1]) K.box(M, 'prop', s * 0.085, 0.01, -0.005, 0.13, 0.12, 0.05, B, s * 0.35, 0, s * 0.25);
  K.box(M, 'prop', 0, -0.01, -0.04, 0.07, 0.11, 0.04, BD);
  K.box(M, 'prop', 0, -0.06, 0.04, 0.12, 0.025, 0.03, B);
  const spine = J(M, 0, 0.05, -0.03, p.waist);
  for (let i = 0; i < 5; i++) K.box(spine, 'prop', 0, 0.025 + i * 0.05, 0, 0.045, 0.034, 0.045, i % 2 ? B : BD);
  const chest = J(spine, 0, 0.26, 0, p.chest);
  for (let i = 0; i < 8; i++) K.box(chest, 'prop', 0, 0.02 + i * 0.048, -0.06, 0.035, 0.032, 0.04, i % 2 ? B : BD);
  K.box(chest, 'prop', 0, 0.23, 0.085, 0.035, 0.2, 0.018, B, 0, -0.12);
  for (let i = 0; i < 7; i++) {
    const s = 0.1 + Math.sin(((i + 1.5) / 8) * Math.PI) * 0.05;
    K.add('prop', geos().rib, mul(chest, T(0, 0.07 + i * 0.045, -0.015, 0, 0.18, 0, s * 1.2, s * 0.6, s * 0.95)), B);
  }
  for (const s of [-1, 1]) K.box(chest, 'prop', s * 0.1, 0.375, -0.01, 0.17, 0.022, 0.025, B, s * 0.2, 0, s * -0.12); // collarbones
  const neck = J(chest, 0, 0.4, -0.04, p.neck);
  for (let i = 0; i < 2; i++) K.box(neck, 'prop', 0, 0.02 + i * 0.04, 0, 0.035, 0.03, 0.035, BD);
  // skull: cranium, face, cheekbones, jaw; dark sockets and nose
  K.sph(neck, 'prop', 0, 0.175, 0.0, 0.098, B, 1.0, 1.15);
  K.box(neck, 'prop', 0, 0.125, 0.07, 0.105, 0.07, 0.06, B);
  for (const s of [-1, 1]) {
    K.box(neck, 'prop', s * 0.052, 0.14, 0.065, 0.03, 0.03, 0.05, BD);
    K.sph(neck, 'prop', s * 0.035, 0.157, 0.096, 0.025, S, 1, 0.6);
  }
  K.box(neck, 'prop', 0, 0.128, 0.1, 0.018, 0.026, 0.01, S);
  K.box(neck, 'prop', 0, 0.098, 0.088, 0.075, 0.012, 0.03, 0xe2dccb); // teeth
  const jaw = J(neck, 0, 0.1, 0.02, [p.jaw, 0, 0]);
  K.box(jaw, 'prop', 0, -0.025, 0.04, 0.085, 0.022, 0.07, B);
  for (const s of [-1, 1]) K.box(jaw, 'prop', s * 0.045, -0.005, 0.0, 0.016, 0.05, 0.03, B);
  // arms
  for (const [side, a, e] of [[1, p.armL, p.elbowL], [-1, p.armR, p.elbowR]]) {
    const sh = J(chest, side * 0.18, 0.355, -0.03, [-a[0], side * a[2], side * a[1]]);
    bone(sh, 0.29, 0.019);
    const el = J(sh, 0, -0.29, 0, [-e, 0, 0]);
    bone(el, 0.25, 0.015);
    const hd = J(el, 0, -0.26, 0, [0.2, 0, 0]);
    K.box(hd, 'prop', 0, -0.035, 0, 0.055, 0.06, 0.02, BD);
    for (let f = 0; f < 4; f++) K.box(hd, 'prop', -0.022 + f * 0.015, -0.09, 0.006, 0.009, 0.06, 0.009, B, 0, 0.35 + f * 0.05);
    K.box(hd, 'prop', side * 0.035, -0.05, 0.01, 0.01, 0.045, 0.01, B, 0, 0, side * 0.5);
    if (coat) {
      K.cyl(sh, 'prop', 0, -0.13, 0, 0.05, 0.3, COL.coat, 0, 0, 0, 'cyl6');
      K.add('prop', geos().cup, mul(el, T(0, -0.06, 0, 0, 0, 0, 0.055, 0.14, 0.055)), COL.coat);
    }
  }
  // legs
  for (const [side, a, k] of [[1, p.legL, p.kneeL], [-1, p.legR, p.kneeR]]) {
    const hip = J(M, side * 0.095, -0.04, 0, [-a[0], side * a[2], side * a[1]]);
    bone(hip, 0.43, 0.024);
    const kn = J(hip, 0, -0.43, 0, [k, 0, 0]);
    K.box(kn, 'prop', 0, 0, 0.035, 0.045, 0.045, 0.02, BD); // kneecap
    bone(kn, 0.41, 0.019);
    const ft = J(kn, 0, -0.42, 0);
    K.box(ft, 'prop', 0, -0.02, 0.06, 0.07, 0.035, 0.2, B);
    K.box(ft, 'prop', 0, -0.02, -0.03, 0.05, 0.045, 0.05, BD);
  }
  if (coat) {
    // an open lab coat: back, shoulders, two narrow front panels (the ribs show between), the skirt; a badge
    K.box(chest, 'prop', 0, 0.17, -0.1, 0.38, 0.42, 0.02, COL.coat);
    K.box(chest, 'prop', 0, 0.37, -0.03, 0.42, 0.04, 0.16, COL.coat);
    for (const s of [-1, 1]) {
      K.box(chest, 'prop', s * 0.185, 0.17, -0.02, 0.02, 0.42, 0.16, COL.coat);
      K.box(chest, 'prop', s * 0.15, 0.2, 0.07, 0.08, 0.36, 0.015, COL.coat, s * -0.3);
      K.box(chest, 'prop', s * 0.09, 0.36, 0.07, 0.05, 0.08, 0.012, 0xb9c0c6, 0, 0, s * 0.5); // lapels
      K.box(M, 'prop', s * 0.11, -0.22, -0.05, 0.17, 0.46, 0.015, COL.coat, 0, 0.15, s * 0.06);
      K.box(M, 'prop', s * 0.17, -0.2, 0.02, 0.015, 0.42, 0.14, COL.coat, 0, 0, s * 0.08);
    }
    K.quad(chest, 'print', 0.15, 0.26, 0.081, 0.07, 0.045, 0xffffff, P.badge, -0.3);
  }
}
// shards of glass scattered on the floor around (x, z), thrown toward (dx, dz)
function shards(K, x, z, dx, dz, n, spread, rnd, y = FLOOR) {
  for (let i = 0; i < n; i++) {
    const d = Math.pow(rnd(), 1.6) * spread, s = (rnd() - 0.5) * spread * 0.9;
    const px = x + dx * d + dz * s, pz = z + dz * d - dx * s, sz = 0.02 + rnd() * 0.07;
    K.add('metal', geos().tri, T(px, y + 0.004 + rnd() * 0.004, pz, rnd() * 6.28, -Math.PI / 2 + (rnd() - 0.5) * 0.2, 0, sz, sz * (0.6 + rnd()), 1), COL.shard);
  }
}

// ---------------------------------------------------------------- glass walls
// A glass wall along x (axis 'x', at z = t) or along z (axis 'z', at x = t), from pane list [[u1, u2, type]]:
// 'g' glass, 'c' cracked, 'b' blown out (shards thrown to the `inside` side, ±1 along the wall's normal),
// 'd' an open doorway, 'D' a doorway with its glass door swung open into the room.
function glassWall(K, W, axis, t, inside, panes, rnd, y0 = FLOOR) {
  const X = axis === 'x';
  const at = (u, n) => (X ? [u, t + n] : [t + n, u]);
  const box = (u1, u2, n1, n2) => {
    const [xa, za] = at(u1, n1), [xb, zb] = at(u2, n2);
    return [Math.min(xa, xb), Math.min(za, zb), Math.max(xa, xb), Math.max(za, zb)];
  };
  const deco = (u1, u2, v1, v2, n1, n2, kind = 'metal') => {
    const [x1, z1, x2, z2] = box(u1, u2, n1, n2);
    W.deco(x1, v1, z1, x2, v2, z2, kind, 'hub');
  };
  const solid = (u1, u2) => {
    const [x1, z1, x2, z2] = box(u1, u2, -0.06, 0.06);
    W.addSolid(new THREE.Vector3(x1, y0, z1), new THREE.Vector3(x2, y0 + GH, z2), { static: true, glass: true, kind: 'wall' });
  };
  const u1 = panes[0][0], u2 = panes[panes.length - 1][1];
  deco(u1, u2, y0 + GH, y0 + GH + 0.14, -0.07, 0.07); // header
  const posts = new Set();
  for (const [a, b, type] of panes) {
    posts.add(a);
    posts.add(b);
    const [x1, z1, x2, z2] = box(a + 0.04, b - 0.04, -0.012, 0.012);
    const glassBox = (v1, v2) => K.aabb('glass', x1, v1, z1, x2, v2, z2, 0xffffff);
    if (type === 'g' || type === 'c') {
      deco(a, b, y0, y0 + 0.08, -0.04, 0.04);
      glassBox(y0 + 0.08, y0 + GH);
      solid(a, b);
      if (type === 'c') {
        // a crack star, on both faces
        const u = a + (b - a) * (0.3 + rnd() * 0.4), v = y0 + 0.9 + rnd() * 1.4, sz = 0.9 + rnd() * 0.6, uv = rnd() < 0.5 ? D.crack : D.crack2;
        for (const n of [-0.016, 0.016]) {
          const [cx, cz] = at(u, n);
          K.quad(I, 'decal', cx, v, cz, sz, sz, 0xffffff, uv, X ? (n > 0 ? 0 : Math.PI) : n > 0 ? Math.PI / 2 : -Math.PI / 2, 0, rnd() * 6.28);
        }
      }
    } else if (type === 'b') {
      deco(a, b, y0, y0 + 0.08, -0.04, 0.04);
      // jagged teeth left in the frame, bottom and top
      for (let i = 0; i < 5; i++) {
        const u = a + 0.1 + ((b - a - 0.2) * (i + rnd() * 0.6)) / 5, h = 0.12 + rnd() * 0.25, w = 0.12 + rnd() * 0.2;
        const [cx, cz] = at(u, 0);
        const [tx, tz] = at(a + 0.1 + ((b - a - 0.2) * (i + rnd() * 0.6)) / 5, 0), ht = 0.2 + rnd() * 0.5;
        for (const f of [0, Math.PI]) {
          K.add('glass', geos().tri, T(cx, y0 + 0.08, cz, (X ? 0 : Math.PI / 2) + f, 0, 0, w, h, 1), 0xffffff);
          K.add('glass', geos().tri, T(tx, y0 + GH, tz, (X ? 0 : Math.PI / 2) + f, 0, Math.PI, w, ht, 1), 0xffffff);
        }
      }
      const [cx, cz] = at((a + b) / 2, inside * 0.3);
      const [dx, dz] = X ? [0, inside] : [inside, 0];
      shards(K, cx, cz, dx, dz, 46, 2.4, rnd);
    } else if (type === 'D') {
      // the door: hinged at a, swung ~80° into the room
      const L = b - a - 0.08, sw = 1.4;
      const [hx, hz] = at(a + 0.04, 0);
      const ry0 = X ? 0 : -Math.PI / 2; // local +x runs along the wall
      const ry = ry0 + (X ? -inside : inside) * sw;
      const M = T(hx, y0, hz, ry);
      K.box(M, 'glass', L / 2, 0.06 + (GH - 0.2) / 2, 0, L, GH - 0.2, 0.025, 0xffffff);
      K.box(M, 'metal', L / 2, 0.04, 0, L, 0.06, 0.05, COL.alu);
      K.box(M, 'metal', L / 2, GH - 0.12, 0, L, 0.05, 0.05, COL.alu);
      for (const e of [0.025, L - 0.025]) K.box(M, 'metal', e, GH / 2 - 0.04, 0, 0.05, GH - 0.1, 0.05, COL.alu);
      K.box(M, 'metal', L - 0.15, 1.05, 0.045, 0.025, 0.3, 0.025, 0x3a3f48);
      K.box(M, 'metal', L - 0.15, 1.05, -0.045, 0.025, 0.3, 0.025, 0x3a3f48);
    }
  }
  for (const u of posts) deco(u - 0.04, u + 0.04, y0, y0 + GH, -0.05, 0.05);
  // the posts beside doorways and blown panes are solid
  panes.forEach(([a, b, type]) => {
    if (type === 'g' || type === 'c') return;
    for (const u of [a, b]) {
      const [x1, z1, x2, z2] = box(u - 0.05, u + 0.05, -0.06, 0.06);
      W.addSolid(new THREE.Vector3(x1, y0, z1), new THREE.Vector3(x2, y0 + GH, z2), { static: true, kind: 'metal' });
    }
  });
}
// a room sign over a doorway, both faces
function sign(K, axis, t, u, uv, y = FLOOR + GH + 0.32) {
  for (const s of [-1, 1]) {
    const x = axis === 'x' ? u : t + s * 0.075, z = axis === 'x' ? t + s * 0.075 : u;
    const ry = axis === 'x' ? (s > 0 ? 0 : Math.PI) : s > 0 ? Math.PI / 2 : -Math.PI / 2;
    K.quad(I, 'print', x, y, z, 1.2, 0.19, 0xffffff, uv, ry);
  }
  if (axis === 'x') K.aabb('metal', u - 0.63, y - 0.12, t - 0.07, u + 0.63, y + 0.12, t + 0.07, 0x20252f);
  else K.aabb('metal', t - 0.07, y - 0.12, u - 0.63, t + 0.07, y + 0.12, u + 0.63, 0x20252f);
}
// papers strewn over a floor rect, denser toward `drift` (a far wall the blast pushed them to)
function strew(K, x1, z1, x2, z2, n, rnd, { y = FLOOR, drift = null, away = true } = {}) {
  for (let i = 0; i < n; i++) {
    let u = rnd(), v = rnd();
    if (drift === 'x1') u = Math.pow(u, 1.8);
    if (drift === 'x2') u = 1 - Math.pow(u, 1.8);
    if (drift === 'z1') v = Math.pow(v, 1.8);
    if (drift === 'z2') v = 1 - Math.pow(v, 1.8);
    const x = x1 + (x2 - x1) * u, z = z1 + (z2 - z1) * v;
    // blown away from the reactor: oriented roughly along the blast, with some scatter
    const ry = away ? faceReactor(x, z) + (rnd() - 0.5) * 1.6 : rnd() * 6.28;
    const k = 0.55 + rnd() * 0.2, tint = _c.setRGB(k, k * (0.97 + rnd() * 0.03), k * (0.9 + rnd() * 0.1)).clone();
    paper(K, x, y + 0.004 + rnd() * 0.01, z, ry, Math.floor(rnd() * 8), (rnd() - 0.5) * 0.08, tint);
  }
}
// a scorch / silhouette decal on a wall: a quad facing `ry`
const wallDecal = (K, x, y, z, w, h, uv, ry, tint = 0xffffff) => K.quad(I, 'decal', x, y, z, w, h, tint, uv, ry);
const floorDecal = (K, x, z, w, h, uv, ry, tint = 0xffffff, y = FLOOR + 0.006) => K.quad(I, 'decal', x, y, z, w, h, tint, uv, ry, -Math.PI / 2);
// a scorch streak on the floor centred at (x, z), its hot end toward the reactor
const streak = (K, x, z, len, w, tint = 0xffffff, y = FLOOR + 0.006) => floorDecal(K, x, z, len, w, D.streak, Math.atan2(x, z - PZ) - Math.PI / 2, tint, y);
const TINT = [0xffc4bc, 0xffecbc, 0xc8ffd0, 0xc0dcff];

// ---------------------------------------------------------------- cubicle pod (a pinwheel of four cells)
// cell k (0 NW, 1 NE, 2 SE, 3 SW) is the NW cell turned k quarter-turns clockwise about the pod's centre;
// each opens at one outer corner (N, E, S, W in turn). cells[k]: { person, chairFallen, fallenWall, mess }
function cubiclePod(K, W, cx, cz, cells, rnd, cell = 2.4, h = 1.4) {
  const th = 0.06, y0 = FLOOR, hf = 1.05; // fabric to 1.05 m, a frosted-glass topper above
  for (let k = 0; k < 4; k++) {
    const C = T(cx, y0, cz, -k * Math.PI / 2), o = cells[k] || {};
    const panel = (x1, z1, x2, z2, color = COL.fabric) => {
      const w = Math.max(Math.abs(x2 - x1), th), d = Math.max(Math.abs(z2 - z1), th);
      const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2, along = w > d;
      K.box(C, 'prop', mx, hf / 2, mz, w, hf, d, color);
      K.box(C, 'prop', mx, hf + 0.015, mz, w + 0.01, 0.03, d + 0.02, COL.cap);
      K.box(C, 'glass', mx, (hf + h) / 2 + 0.015, mz, along ? w - 0.04 : 0.02, h - hf - 0.03, along ? 0.02 : d - 0.04, 0xffffff);
      K.box(C, 'prop', mx, h, mz, w + 0.01, 0.025, d + 0.02, COL.cap);
      K.box(C, 'prop', mx, 0.05, mz, w + 0.01, 0.1, d + 0.012, 0x2a2e35);
      // posts between the panels (none at a run's inner end, where the spine's posts already stand)
      const L = Math.max(w, d), n = Math.max(1, Math.round(L / 1.2));
      for (let i = 0; i < n; i++) {
        const f = -L / 2 + (L * i) / n;
        K.box(C, 'prop', mx + (along ? f : 0), h / 2, mz + (along ? 0 : f), along ? 0.035 : d + 0.014, h, along ? d + 0.014 : 0.035, COL.cap);
      }
      K.solid(C, (x1 + x2) / 2 - w / 2, 0, (z1 + z2) / 2 - d / 2, (x1 + x2) / 2 + w / 2, h, (z1 + z2) / 2 + d / 2, { kind: 'wall' });
    };
    const fab = k % 2 ? COL.fabric2 : COL.fabric;
    panel(-cell, 0, 0, 0, fab); // the spine on its south side
    panel(-cell + 1.1, -cell, 0, -cell, fab); // north wall, open at the west end
    if (!o.fallenWall) panel(-cell, -cell, -cell, 0, fab); // west wall
    else {
      // fallen flat outward
      K.box(C, 'prop', -cell - hf / 2 - 0.02, 0.035, -cell / 2, hf, th, cell, fab, 0, 0, 0.04);
      K.box(C, 'prop', -cell - hf - 0.03, 0.04, -cell / 2, 0.03, 0.03, cell, COL.cap);
      // its glass topper burst where it hit the floor
      const at = new THREE.Vector3(-cell - hf - 0.1, 0, -cell / 2).applyMatrix4(C), dir = new THREE.Vector3(-1, 0, 0).transformDirection(C);
      shards(K, at.x, at.z, dir.x, dir.z, 36, 1.6, rnd);
    }
    // the L desk in the inner (south-east) corner
    const dA = T(-0.85, 0, -0.38, Math.PI), dB = T(-0.38, 0, -1.25, -Math.PI / 2);
    deskTop(K, mul(C, dA), 1.6, 0.7);
    deskTop(K, mul(C, dB), 1.0, 0.7, { legs: true });
    // the monitor at the corner, keyboard, stuff
    const mon = mul(C, T(-0.42, 0.74, -0.42, Math.PI * 1.25));
    if (o.flat) flat(K, mon, o.screen || 'graph');
    else crt(K, mon, o.screen || 'log', o.screen === 'static' ? 'static' : 'screen');
    keyboard(K, mul(C, T(-0.64, 0.74, -0.64, Math.PI * 1.25)));
    mug(K, mul(C, T(-1.35, 0.74, -0.25)), [0xd23b3b, 0xf2f2f2, 0x2f62c8, 0x2f9b4a][k]);
    stack(K, mul(C, T(-1.25, 0.74, -0.5, 0.2)), 6 + k * 3, rnd);
    if (k !== 1) binder(K, mul(C, T(-0.2, 0.74, -1.5, 0, 0, 0.12)), [0x2f62c8, 0xd23b3b, 0x3a3f48, 0xd9a514][k]);
    K.quad(C, 'print', -0.5, hf - 0.14, -0.035, 0.08, 0.08, 0xffffff, P.sticky[k], Math.PI);
    K.quad(C, 'print', -1.1, hf - 0.26, -0.035, 0.08, 0.08, 0xffffff, P.sticky[(k + 2) % 4], Math.PI, 0, 0.2);
    K.quad(C, 'print', -cell + 1.6, hf - 0.1, -cell + 0.035, 0.3, 0.075, 0xffffff, P.plate[k]);
    if (o.photo) K.quad(C, 'print', -0.04, hf - 0.2, -1.0, 0.1, 0.12, 0xffffff, P.photo, -Math.PI / 2, 0, 0.08);
    if (o.lamp) deskLamp(K, mul(C, T(-1.5, 0.74, -0.2, Math.PI * 0.9)), o.lamp === 'on');
    if (o.plant) plant(K, mul(C, T(-0.25, 0.74, -1.62)), true);
    // the chair: pushed back from the desk and turned toward the reactor, or knocked over
    const [wx, wz] = [new THREE.Vector3(-1.15, 0, -1.05).applyMatrix4(C).x, new THREE.Vector3(-1.15, 0, -1.05).applyMatrix4(C).z];
    if (o.chairFallen) chairFallen(K, wx, wz, faceReactor(wx, wz) + 0.6, 1);
    else if (!o.person) chair(K, T(wx, y0, wz, faceReactor(wx, wz) + (rnd() - 0.5) * 0.4));
    if (o.person) o.person(C);
  }
}

// ---------------------------------------------------------------- the rooms
function buildSW(K, W, rnd) {
  // the field office: glass on its east and north sides
  glassWall(K, W, 'z', -19.2, -1, [[-106.6, -105.0, 'g'], [-105.0, -103.6, 'D'], [-103.6, -102.0, 'c'], [-102.0, -100, 'g']], rnd);
  glassWall(K, W, 'x', -106.6, 1, [[-24.5, -22.9, 'g'], [-22.9, -21.3, 'b'], [-21.3, -19.2, 'c']], rnd);
  sign(K, 'z', -19.2, -104.3, P.sign[0]);
  W.deco(-24.5, FLOOR + GH, -106.0, -19.2, FLOOR + GH + 0.1, -105.9, 'metal', 'hub');
  W.deco(-24.5, FLOOR + GH, -103.0, -19.2, FLOOR + GH + 0.1, -102.9, 'metal', 'hub');
  lampStrip(K, -21.8, FLOOR + GH - 0.5, -105.95, 'x', 'lamp', 0.5);
  lampStrip(K, -21.8, FLOOR + GH - 0.5, -102.95, 'x', 'flickA', 0.5);
  // whiteboard (day 1) on the west wall, the lead's desk facing the door, cabinet, shelf, coats, cork board
  whiteboard(K, T(-24.5, FLOOR + 1.65, -104.2, Math.PI / 2), P.wb2, 2.4, 1.2);
  const desk = T(-21.9, FLOOR, -103.3, -Math.PI / 2);
  deskTop(K, desk, 1.7, 0.8, { top: 0x8a6a4a });
  crt(K, mul(desk, T(0.45, 0.74, -0.05)), 'heart');
  keyboard(K, mul(desk, T(0.1, 0.74, 0.2)));
  mug(K, mul(desk, T(-0.55, 0.74, 0.15)), 0xf2f2f2);
  stack(K, mul(desk, T(-0.3, 0.74, -0.15, 0.3)), 9, rnd);
  K.quad(desk, 'print', 0.35, 0.742, 0.25, 0.12, 0.08, 0xffffff, P.badge, 0.4, -Math.PI / 2);
  deskLamp(K, mul(desk, T(-0.7, 0.74, -0.25, 0.4)), true);
  // slumped over the desk, still in the chair
  chair(K, T(-22.75, FLOOR, -103.3, Math.PI / 2 + 0.15));
  skeleton(K, T(-22.75, FLOOR + 0.58, -103.32, Math.PI / 2 + 0.1), { waist: [0.5, 0, 0.05], chest: [0.5, 0.1, 0], neck: [0.35, -0.6, 0.4], armL: [1.35, 0.1, 0], elbowL: 0.6, armR: [1.0, -0.1, 0.3], elbowR: 1.4, legL: [1.5, 0.12, 0], legR: [1.45, 0.05, 0], kneeL: 1.55, kneeR: 1.7 }, true);
  cabinet(K, T(-24.15, FLOOR, -100.45, Math.PI / 2), true);
  shelf(K, T(-22.6, FLOOR, -100.2, Math.PI), 1.7, rnd);
  W.deco(-21.4, FLOOR + 1.78, -100.06, -19.6, FLOOR + 1.84, -100.0, 'metal', 'hub');
  labCoat(K, T(-21.1, FLOOR + 1.8, -100.02, Math.PI));
  labCoat(K, T(-20.5, FLOOR + 1.8, -100.02, Math.PI));
  K.quad(T(-20.0, FLOOR + 0.02, -101.2, 0.3, -Math.PI / 2 + 0.02), 'prop', 0, 0, 0, 0.5, 1.0, COL.coat); // a coat dropped on the floor
  // a cork board: the team photo, the day-1 schedule, the calendar, a sticky note
  K.aabb('prop', -23.9, FLOOR + 1.8, -100.03, -22.9, FLOOR + 2.5, -100.0, 0x8a6a40);
  const cork = (dx, dy, w, h, uv, rz = 0, dz = 0) => K.quad(I, 'print', -23.4 + dx, FLOOR + 2.15 + dy, -100.035 - dz, w, h, 0xffffff, uv, Math.PI, 0, rz);
  cork(0, 0, 0.96, 0.66, P.cork);
  cork(0.25, 0.08, 0.2, 0.235, P.photo, 0.1, 0.004);
  cork(-0.1, 0.12, 0.22, 0.3, P.paper[7], -0.05, 0.004);
  cork(-0.33, -0.1, 0.2, 0.2, P.calendar, -0.04, 0.004);
  cork(0.05, -0.18, 0.08, 0.08, P.sticky[1], 0, 0.008);
  plant(K, T(-19.6, FLOOR, -106.1), true);
  strew(K, -24.3, -106.4, -19.4, -100.3, 55, rnd, { drift: 'x1' });
  // the cubicle pod: four cells in a pinwheel
  const podX = -15.2, podZ = -103.8;
  cubiclePod(K, W, podX, podZ, [
    { screen: 'graph', flat: true, photo: true, lamp: 'on', fallenWall: true },
    { screen: 'static', chairFallen: true, plant: true },
    {
      screen: 'login', lamp: 'off',
      person: (C) => {
        // nobody here: the chair went over, the coat's still on its back
        const p = new THREE.Vector3(-1.3, 0, -1.1).applyMatrix4(C);
        chairFallen(K, p.x, p.z, 0.8, -1);
        K.quad(T(p.x - 0.5, FLOOR + 0.015, p.z + 0.2, 1.1, -Math.PI / 2 + 0.03), 'prop', 0, 0, 0, 0.45, 0.9, COL.coat);
      },
    },
    { screen: 'feeds', flat: true, photo: true },
  ], rnd);
  strew(K, -17.6, -106.2, -12.8, -101.4, 70, rnd, { drift: 'z2' });
  strew(K, -19.0, -108.5, -10.5, -106.4, 22, rnd);
  strew(K, -18.9, -106.2, -17.7, -100.2, 10, rnd);
  // the day-1 party: a folding table by the south wall, cake and cups, hats, deflated balloons
  const tbl = T(-9.7, FLOOR, -100.6);
  deskTop(K, tbl, 1.8, 0.75, { top: 0xe9e6dd, frame: 0x8a9099 });
  K.box(tbl, 'prop', 0, 0.735, 0.0, 1.8, 0.005, 0.76, 0xf2f2f2); // paper tablecloth
  K.box(tbl, 'prop', 0, 0.62, 0.38, 1.8, 0.24, 0.005, 0xf2f2f2);
  cake(K, mul(tbl, T(-0.35, 0.74, -0.05)));
  for (let i = 0; i < 7; i++) cupR(K, mul(tbl, T(0.35 + (i % 4) * 0.1, 0.74, -0.2 + Math.floor(i / 4) * 0.12)), i % 3 ? 0xc8323c : 0x2f62c8);
  K.add('prop', geos().cup, T(-9.0, FLOOR + 0.79, -100.35, 0.4, 0, Math.PI / 2, 0.045, 0.12, 0.045), 0xc8323c);
  K.add('prop', geos().cup, T(-10.9, FLOOR + 0.045, -101.5, 1.2, 0, Math.PI / 2, 0.045, 0.12, 0.045), 0xc8323c);
  K.add('prop', geos().cup, T(-8.4, FLOOR + 0.045, -102.3, -0.7, 0, Math.PI / 2, 0.045, 0.12, 0.045), 0x2f62c8);
  hat(K, T(-10.4, FLOOR + 0.74, -100.75), 0x2f62c8);
  hat(K, T(-11.2, FLOOR + 0.06, -102.0, 0, 0, 1.7), 0xd9a514);
  hat(K, T(-8.2, FLOOR + 0.06, -101.6, 0, 1.6, 0.3), 0xd23b3b);
  for (const [bx, bz, c] of [[-11.0, -100.35, 0xd23b3b], [-10.75, -100.3, 0x2f9b4a], [-8.55, -100.3, 0xd9a514]]) {
    K.sph(I, 'prop', bx, FLOOR + 0.13, bz, 0.19, c, 0.68, 1.12, rnd());
    K.aabb('prop', bx - 0.004, FLOOR + 0.15, bz - 0.004, bx + 0.004, FLOOR + 0.76, bz + 0.004, 0xeeeeee);
  }
  // the banner: still up from the west hook to the middle one; its east end tore loose and hangs to the floor
  // (it reads east to west, as you face the south wall)
  const bpts = [[-8.15, 6.92, -100.05], [-9.3, 6.72, -100.05], [-10.5, 6.7, -100.05], [-11.6, 6.9, -100.05], [-11.75, 6.2, -100.06], [-11.85, 5.45, -100.07], [-11.92, 4.7, -100.09], [-11.95, 4.07, -100.14], [-12.35, 4.012, -100.42], [-13.0, 4.012, -100.62], [-13.6, 4.012, -100.7]];
  banner(K, bpts, 0.42);
  W.deco(-8.2, 6.86, -100.05, -8.1, 7.12, -100.0, 'metal', 'hub');
  W.deco(-11.65, 6.84, -100.05, -11.55, 7.1, -100.0, 'metal', 'hub');
  W.deco(-15.4, 6.86, -100.05, -15.3, 7.12, -100.0, 'metal', 'hub'); // the hook it tore off
  // somebody's shadow on the south wall, scorched in beside the table (yellow-fringed)
  wallDecal(K, -7.2, FLOOR + 1.25, -100.012, 1.7, 2.3, D.sil1, Math.PI, TINT[1]);
  wallDecal(K, -7.1, FLOOR + 1.0, -100.01, 3.2, 3.0, D.blob, Math.PI, 0xffffff);
  // scorch fanning from the reactor across the floor here, and the dropped coffee
  streak(K, -12.0, -108.6, 4.0, 1.8);
  streak(K, -21.0, -109.0, 3.5, 1.5);
  floorDecal(K, -16.2, -101.0, 0.5, 0.5, D.stain, 0.4);
}

// a banner of quads through points (each [x, y, z]), the banner texture running along it. Where it hangs on
// the wall (facing -z, into the room) its top edge runs through the points; where it hangs straight down
// its top edge faces east; where it lies on the floor its top edge is toward the wall.
function banner(K, pts, hgt) {
  const pos = [], nor = [], uv = [], [u1, v1, u2, v2] = P.banner;
  const L = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1], p[2] - pts[i][2]));
  const total = L.reduce((a, b) => a + b, 0);
  let s = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = new THREE.Vector3(...pts[i]), b = new THREE.Vector3(...pts[i + 1]), dir = b.clone().sub(a).normalize();
    const onFloor = a.y < 4.1 && b.y < 4.1;
    const across = onFloor ? new THREE.Vector3(0, 0, -1) : Math.abs(dir.y) > 0.6 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, -1, 0);
    const want = onFloor ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, -1);
    let n = dir.clone().cross(across).normalize();
    const flip = n.dot(want) < 0;
    if (flip) n.negate();
    const a2 = a.clone().addScaledVector(across, hgt), b2 = b.clone().addScaledVector(across, hgt);
    const ua = u1 + ((u2 - u1) * s) / total, ub = u1 + ((u2 - u1) * (s + L[i])) / total;
    s += L[i];
    const A = [a, ua, v2], A2 = [a2, ua, v1], Bv = [b, ub, v2], B2 = [b2, ub, v1];
    const tris = flip ? [A, A2, Bv, Bv, A2, B2] : [A, Bv, A2, Bv, B2, A2];
    for (const [p, u, v] of tris) {
      pos.push(p.x, p.y, p.z);
      nor.push(n.x, n.y, n.z);
      uv.push(u, v);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  K.add('print', g, I, 0xffffff);
}

function buildSE(K, W, rnd) {
  glassWall(K, W, 'z', 14.6, 1, [[-107.2, -105.6, 'g'], [-105.6, -104.0, 'c'], [-104.0, -102.5, 'D'], [-102.5, -100, 'g']], rnd);
  glassWall(K, W, 'x', -107.2, 1, [[14.6, 16.2, 'b'], [16.2, 17.8, 'g'], [17.8, 19.4, 'c'], [19.4, 21.0, 'g'], [21.0, 22.6, 'b'], [22.6, 24.5, 'g']], rnd);
  sign(K, 'z', 14.6, -103.25, P.sign[1]);
  for (const x of [17.9, 21.2]) W.deco(x - 0.05, FLOOR + GH, -107.2, x + 0.05, FLOOR + GH + 0.1, -100, 'metal', 'hub');
  lampStrip(K, 17.9, FLOOR + GH - 0.5, -103.9, 'z', 'flickB', 0.5);
  lampStrip(K, 21.2, FLOOR + GH - 0.5, -103.9, 'z', 'lamp', 0.5);
  // racks along the east wall
  ['rack', 'rack2', 'rack', 'rack2'].forEach((c, i) => rack(K, T(24.0, FLOOR, -105.9 + i * 1.0, -Math.PI / 2), c, 2.05));
  K.cyl(I, 'metal', 23.2, FLOOR + 0.7, -106.75, 0.11, 1.4, 0x2f7a4a);
  K.cyl(I, 'metal', 22.9, FLOOR + 0.7, -106.85, 0.11, 1.4, 0x8a8f99);
  // the south counter: microscope, centrifuge, samples, a CRT
  const ctr = T(21.1, FLOOR, -100.4);
  deskTop(K, ctr, 4.2, 0.75, { h: 0.9, top: 0x3a3f48, frame: 0xd8dde3 });
  K.box(ctr, 'prop', 0, 0.42, 0.0, 4.1, 0.84, 0.7, 0xd8dde3);
  microscope(K, mul(ctr, T(-1.6, 0.9, 0.05, -0.3)));
  sampleCase(K, mul(ctr, T(-0.8, 0.9, 0.0, 0.1)), true, 0);
  crt(K, mul(ctr, T(0.2, 0.9, -0.05)), 'spectrum');
  K.cyl(ctr, 'prop', 1.0, 1.02, 0.0, 0.17, 0.24, COL.white); // centrifuge
  K.cyl(ctr, 'metal', 1.0, 1.15, 0.0, 0.15, 0.02, COL.alu);
  for (let i = 0; i < 5; i++) K.cyl(ctr, 'lamp', 1.5 + (i % 3) * 0.1, 0.96, -0.1 + Math.floor(i / 3) * 0.14, 0.03, 0.12, VIAL[i % 4]);
  // the island bench, a curled-up body under it
  const isl = T(19.6, FLOOR, -103.9);
  deskTop(K, isl, 4.0, 1.4, { h: 0.92, top: 0x2e333b, frame: 0xc6ccd3 });
  spectrometer(K, mul(isl, T(-1.2, 0.92, -0.2, 0.2)));
  sampleCase(K, mul(isl, T(0.4, 0.92, 0.2, -0.5)), true, 3);
  for (const [vx, vz, c] of [[19.95, -103.05, 0], [20.4, -102.85, 2], [20.9, -103.1, 3]]) K.add('lamp', geos().cyl, T(vx, FLOOR + 0.02, vz, rnd() * 6, 0, Math.PI / 2, 0.022, 0.09, 0.022), VIAL[c]);
  stack(K, mul(isl, T(1.3, 0.92, -0.3, 0.4)), 7, rnd);
  clipboard(K, mul(isl, T(0.9, 0.92, 0.35, -0.3)));
  mug(K, mul(isl, T(-0.3, 0.92, 0.45)), 0x2f9b4a);
  skeleton(K, T(19.0, FLOOR + 0.13, -104.2, -Math.PI / 2 + 0.2, 0, Math.PI / 2), { waist: [0.8, 0, 0], chest: [0.5, 0, 0], neck: [0.6, 0.2, 0], armL: [1.4, 0.3, 0], elbowL: 2.4, armR: [2.0, -0.2, 0], elbowR: 2.2, legL: [1.9, 0.15, 0], legR: [1.6, 0, 0], kneeL: 2.4, kneeR: 2.5 }, true);
  // coats on hooks by the door, chairs shoved back, a stool on its side
  W.deco(15.0, FLOOR + 1.78, -100.06, 16.4, FLOOR + 1.84, -100.0, 'metal', 'hub');
  labCoat(K, T(15.3, FLOOR + 1.8, -100.02, Math.PI));
  labCoat(K, T(16.0, FLOOR + 1.8, -100.02, Math.PI, 0, 0.1));
  for (const [x, z] of [[18.4, -102.5], [21.0, -102.6]]) chair(K, T(x, FLOOR, z, faceReactor(x, z)));
  chairFallen(K, 20.6, -105.4, 2.0, 1);
  // a shadow on the south wall (blue-fringed) and the scorch round it
  wallDecal(K, 17.3, FLOOR + 1.25, -100.012, 1.7, 2.3, D.sil2, Math.PI, TINT[3]);
  wallDecal(K, 17.4, FLOOR + 1.1, -100.01, 3.0, 3.0, D.blob, Math.PI);
  strew(K, 14.8, -107.0, 24.3, -100.2, 60, rnd, { drift: 'z2' });
  // the coffee corner outside: counter and machine, a table with its chairs knocked flying, the water cooler down
  const cof = T(11.5, FLOOR, -100.4);
  deskTop(K, cof, 2.4, 0.7, { h: 0.9, top: 0x5a4a3c, frame: 0x3a3f48 });
  K.box(cof, 'prop', 0, 0.44, 0.0, 2.3, 0.86, 0.66, 0x6c5c4c);
  K.box(cof, 'prop', -0.6, 1.1, -0.05, 0.32, 0.4, 0.32, COL.black);
  K.cyl(cof, 'prop', -0.6, 1.0, 0.08, 0.07, 0.14, 0x3a2414);
  for (let i = 0; i < 6; i++) mug(K, mul(cof, T(0.1 + (i % 3) * 0.12, 0.9, -0.15 + Math.floor(i / 3) * 0.12)), [0xd23b3b, 0xf2f2f2, 0x2f62c8, 0xd9a514, 0x2f9b4a, 0x6b4fa8][i]);
  K.box(cof, 'prop', 0.75, 0.95, 0.0, 0.4, 0.1, 0.28, 0xf0e2c4); // a box of pastries (DAY 1)
  K.box(cof, 'prop', 0.75, 1.0, -0.14, 0.4, 0.2, 0.01, 0xf0e2c4, 0, -0.5);
  const tb = T(11.6, FLOOR, -103.4);
  K.cyl(tb, 'prop', 0, 0.735, 0, 0.45, 0.03, COL.lam);
  K.cyl(tb, 'metal', 0, 0.36, 0, 0.04, 0.72, COL.frame);
  K.cyl(tb, 'metal', 0, 0.01, 0, 0.25, 0.02, COL.frame);
  K.solid(tb, -0.32, 0, -0.32, 0.32, 0.75, 0.32);
  mug(K, mul(tb, T(0.12, 0.75, -0.1)), 0xf2f2f2);
  K.quad(tb, 'decal', -0.1, 0.752, 0.1, 0.22, 0.22, 0xffffff, D.stain, 0, -Math.PI / 2);
  chairFallen(K, 12.5, -104.1, 2.6, 1);
  chairFallen(K, 10.6, -102.9, -0.6, -1);
  const wc = T(13.2, FLOOR + 0.16, -101.7, 0.3, 0, Math.PI / 2);
  K.box(wc, 'prop', 0, 0.47, 0, 0.32, 0.95, 0.32, 0xaab0b6);
  K.add('prop', geos().cyl, T(12.5, FLOOR + 0.13, -102.8, 0.9, 0, Math.PI / 2, 0.13, 0.36, 0.13), 0x6fb7d9);
  floorDecal(K, 12.4, -102.3, 1.6, 1.6, D.blob, 0.3, 0x6fa0c0);
  strew(K, 9.6, -105.0, 14.4, -100.2, 26, rnd);
  // the one who ran for the way out: face down by the south wall, reaching for the red door
  skeleton(K, T(6.9, FLOOR + 0.08, -101.0, -Math.PI / 2, Math.PI / 2 - 0.05, 0), { neck: [-0.5, 0.5, 0.0], armR: [3.0, -0.15, 0], elbowR: 0.1, armL: [-0.15, 0.2, 0], elbowL: 0.1, legL: [0.1, 0.12, 0], legR: [-0.05, 0.05, 0], kneeL: 0.25, kneeR: 0.35 }, true);
  K.quad(I, 'print', 5.6, FLOOR + 0.008, -100.7, 0.07, 0.045, 0xffffff, P.badge, 0.7, -Math.PI / 2);
  strew(K, 4.0, -102.5, 9.0, -100.2, 9, rnd);
  streak(K, 12.5, -108.6, 4.2, 1.8);
}

function buildNW(K, W, rnd) {
  glassWall(K, W, 'x', -140.2, -1, [[-24.5, -23.0, 'g'], [-23.0, -21.4, 'c'], [-21.4, -19.8, 'g'], [-19.8, -18.3, 'g'], [-18.3, -16.8, 'D'], [-16.8, -14.8, 'c']], rnd);
  glassWall(K, W, 'z', -14.8, -1, [[-148, -146.4, 'g'], [-146.4, -144.8, 'b'], [-144.8, -143.2, 'c'], [-143.2, -141.6, 'g'], [-141.6, -140.2, 'g']], rnd);
  sign(K, 'x', -140.2, -17.55, P.sign[2]);
  for (const z of [-146.0, -142.6]) W.deco(-24.5, FLOOR + GH, z - 0.05, -14.8, FLOOR + GH + 0.1, z + 0.05, 'metal', 'hub');
  lampStrip(K, -22.3, FLOOR + GH - 0.5, -146.0, 'x', 'lamp', 0.5);
  lampStrip(K, -18.0, FLOOR + GH - 0.5, -146.0, 'x', 'flickA', 0.5);
  lampStrip(K, -22.3, FLOOR + GH - 0.5, -142.6, 'x', 'lamp', 0.5);
  // whiteboard (the Prism) on the north wall, a burn shadow beside it, racks
  whiteboard(K, T(-22.4, FLOOR + 1.7, -148), P.wb1, 2.4, 1.2);
  wallDecal(K, -19.3, FLOOR + 1.1, -147.99, 3.0, 3.0, D.blob, 0);
  wallDecal(K, -19.3, FLOOR + 1.25, -147.988, 1.7, 2.3, D.sil1, 0, TINT[2]);
  ['rack', 'rack2', 'rack'].forEach((c, i) => rack(K, T(-17.45 + i * 0.66, FLOOR, -147.5), c, 2.05));
  // the west bench: screens, a spectrometer, samples; one of them slumped at it
  const wb = T(-24.1, FLOOR, -144.2, Math.PI / 2);
  deskTop(K, wb, 5.0, 0.8);
  crt(K, mul(wb, T(-1.9, 0.74, -0.05)), 'prism');
  crt(K, mul(wb, T(-1.0, 0.74, -0.05)), 'wave');
  crt(K, mul(wb, T(1.3, 0.74, -0.05)), 'static', 'static');
  spectrometer(K, mul(wb, T(0.25, 0.74, -0.05)));
  sampleCase(K, mul(wb, T(2.0, 0.74, 0.05, 0.2)), true, 1);
  keyboard(K, mul(wb, T(-1.0, 0.74, 0.22, 0.1)));
  keyboard(K, mul(wb, T(-1.9, 0.74, 0.22)));
  mug(K, mul(wb, T(-1.45, 0.74, 0.2)), 0xd9a514);
  stack(K, mul(wb, T(0.9, 0.74, 0.2, 0.3)), 8, rnd);
  chair(K, T(-23.15, FLOOR, -145.2, -Math.PI / 2 + 0.1));
  skeleton(K, T(-23.15, FLOOR + 0.58, -145.2, -Math.PI / 2 + 0.1), { waist: [0.45, 0, -0.05], chest: [0.55, -0.1, 0], neck: [0.4, 0.5, -0.3], armL: [1.2, 0.2, 0], elbowL: 1.5, armR: [1.4, -0.15, 0], elbowR: 0.4, legL: [1.5, 0.1, 0], legR: [1.5, 0.08, 0], kneeL: 1.6, kneeR: 1.5 }, true);
  chairFallen(K, -22.9, -142.7, 1.2, -1);
  // the worktable: the team's model of the Prism, a survey plan, a microscope
  const wt = T(-20.6, FLOOR, -145.6);
  deskTop(K, wt, 3.0, 1.2, { h: 0.9, top: 0xd8dde3 });
  K.box(wt, 'metal', -0.4, 0.95, 0, 0.12, 0.1, 0.12, COL.frame);
  K.add('lamp', strip(new THREE.OctahedronGeometry(0.16, 0)), mul(wt, T(-0.4, 1.22, 0, 0.4, 0, 0, 1, 1.5, 1)), 0xb8a8ff);
  VIAL.forEach((c, i) => K.box(wt, 'lamp', -0.4 + Math.cos(i * 1.57) * 0.3, 1.2 + (i % 2) * 0.05, Math.sin(i * 1.57) * 0.3, 0.05, 0.05, 0.05, c, i, 0.6));
  K.quad(wt, 'print', 0.75, 0.902, 0.05, 0.9, 0.56, 0xffffff, P.plan, 0.1, -Math.PI / 2);
  microscope(K, mul(wt, T(0.2, 0.9, -0.35, 0.6)));
  clipboard(K, mul(wt, T(-1.05, 0.9, 0.25, 0.4)));
  for (const [x, z] of [[-21.2, -144.6], [-19.8, -144.55]]) chair(K, T(x, FLOOR, z, faceReactor(x, z) + (rnd() - 0.5) * 0.4));
  // coats on the column by the door
  W.deco(-20.62, FLOOR + 1.78, -141.7, -20.58, FLOOR + 1.84, -142.3, 'metal', 'hub');
  labCoat(K, T(-20.62, FLOOR + 1.8, -141.85, -Math.PI / 2));
  labCoat(K, T(-20.62, FLOOR + 1.8, -142.2, -Math.PI / 2, 0, 0.08));
  K.quad(T(-20.62, FLOOR + 1.3, -142.0), 'print', 0, 0, 0, 0.28, 0.39, 0xffffff, P.poster, -Math.PI / 2);
  // the one who almost made it: face down just inside the door, reaching through it
  skeleton(K, T(-17.2, FLOOR + 0.08, -141.95, 0.1, Math.PI / 2 - 0.05, 0), { neck: [-0.55, -0.4, 0], armL: [3.05, 0.1, 0], elbowL: 0.15, armR: [-0.1, 0.3, 0], elbowR: 0.2, legL: [-0.05, 0.14, 0], legR: [0.1, 0.05, 0], kneeL: 0.3, kneeR: 0.15 }, true);
  clipboard(K, T(-19.4, FLOOR + 0.004, -142.9, 2.2));
  strew(K, -24.3, -147.8, -15.0, -140.4, 70, rnd, { drift: 'x1' });
  strew(K, -14.6, -147.5, -12.6, -141.0, 12, rnd);
}

function buildNE(K, W, rnd) {
  glassWall(K, W, 'z', 14.8, 1, [[-148, -146.4, 'g'], [-146.4, -144.8, 'c'], [-144.8, -143.2, 'g'], [-143.2, -141.6, 'b'], [-141.6, -140.2, 'g']], rnd);
  glassWall(K, W, 'x', -140.2, -1, [[14.8, 16.4, 'g'], [16.4, 17.9, 'D'], [17.9, 19.5, 'c'], [19.5, 21.1, 'g'], [21.1, 22.8, 'c'], [22.8, 24.5, 'g']], rnd);
  sign(K, 'x', -140.2, 17.15, P.sign[3]);
  for (const z of [-146.0, -142.6]) W.deco(14.8, FLOOR + GH, z - 0.05, 24.5, FLOOR + GH + 0.1, z + 0.05, 'metal', 'hub');
  lampStrip(K, 18.0, FLOOR + GH - 0.5, -142.6, 'x', 'flickB', 0.5);
  lampStrip(K, 22.0, FLOOR + GH - 0.5, -142.6, 'x', 'lamp', 0.5);
  // the wall of screens
  W.deco(16.9, FLOOR + 0.9, -148, 24.1, FLOOR + 2.95, -147.85, 'metal', 'hub');
  const wall = ['feeds', 'graph', 'cam', 'heart', 'bars', 'map', 'static', 'alert', 'spectrum', 'nosig'];
  wall.forEach((c, i) => {
    const x = 17.6 + (i % 5) * 1.42, y = FLOOR + 1.45 + (i < 5 ? 0.98 : 0);
    K.quad(I, c === 'static' ? 'static' : 'screen', x, y, -147.84, 1.3, 0.88, 0xffffff, c === 'static' ? null : SC[c]);
  });
  // the console under it, one of them slumped across it
  const con = T(20.5, FLOOR, -147.35);
  deskTop(K, con, 7.0, 0.9, { top: 0x3a3f48, frame: 0x2a2e36 });
  for (let i = 0; i < 4; i++) keyboard(K, mul(con, T(-2.4 + i * 1.6, 0.74, 0.15)));
  flat(K, mul(con, T(-1.6, 0.74, -0.15)), 'log');
  flat(K, mul(con, T(1.6, 0.74, -0.15)), 'error');
  stack(K, mul(con, T(0.0, 0.74, 0.0, -0.2)), 5, rnd);
  mug(K, mul(con, T(2.6, 0.74, 0.2)), 0x6b4fa8);
  mugFallen(K, 19.5, FLOOR + 0.74, -147.1, 0.8, 0xf2f2f2);
  K.quad(con, 'decal', -1.05, 0.743, 0.15, 0.4, 0.4, 0xffffff, D.stain, 0, -Math.PI / 2);
  K.quad(con, 'print', -1.6, 1.05, -0.13, 0.07, 0.07, 0xffffff, P.sticky[2]);
  K.quad(con, 'print', 1.68, 1.08, -0.13, 0.07, 0.07, 0xffffff, P.sticky[3]);
  chair(K, T(21.3, FLOOR, -146.4, Math.PI + 0.15));
  skeleton(K, T(21.3, FLOOR + 0.58, -146.42, Math.PI + 0.1), { waist: [0.5, 0, 0], chest: [0.55, 0, 0.05], neck: [0.35, 0.7, 0.3], armL: [1.4, -0.05, 0], elbowL: 0.5, armR: [1.3, 0.1, 0], elbowR: 1.2, legL: [1.5, 0.15, 0], legR: [1.5, 0.1, 0], kneeL: 1.5, kneeR: 1.6 }, true);
  for (const [x, z] of [[18.3, -145.6], [23.3, -145.7]]) chair(K, T(x, FLOOR, z, faceReactor(x, z) + (rnd() - 0.5) * 0.3));
  // racks on the east wall, a calendar on the west glass end, a pair of desks in the middle
  ['rack2', 'rack', 'rack2', 'rack'].forEach((c, i) => rack(K, T(24.0, FLOOR, -145.0 + i * 1.0, -Math.PI / 2), c, 2.05));
  K.quad(I, 'print', 15.3, FLOOR + 1.9, -147.99, 0.4, 0.4, 0xffffff, P.calendar);
  wallDecal(K, 15.8, FLOOR + 1.2, -147.99, 1.5, 2.1, D.sil2, 0, TINT[0]);
  const dk = T(18.4, FLOOR, -143.3);
  deskTop(K, dk, 2.2, 1.4);
  flat(K, mul(dk, T(-0.5, 0.74, -0.2, 0)), 'nosig');
  flat(K, mul(dk, T(0.5, 0.74, 0.2, Math.PI)), 'login');
  stack(K, mul(dk, T(0.4, 0.74, -0.35)), 6, rnd);
  binder(K, mul(dk, T(-0.7, 0.74, 0.35, 0.4, 0, Math.PI / 2 - 0.05)), 0x2f62c8);
  binder(K, mul(dk, T(-0.62, 0.74, 0.4, 0.2, 0, Math.PI / 2 - 0.05)), 0xd23b3b);
  chairFallen(K, 18.2, -141.8, 2.9, -1);
  chair(K, T(17.6, FLOOR, -144.6, faceReactor(17.6, -144.6)));
  plant(K, T(23.9, FLOOR, -140.8), true);
  strew(K, 15.0, -147.0, 24.3, -140.4, 66, rnd, { drift: 'x2' });
  strew(K, 12.8, -146.5, 14.6, -141.0, 8, rnd);
}

// the observation post on the north gallery: a desk at the railing, a tripod scope aimed at the heart, a watcher
function buildGallery(K, W, rnd) {
  const y = GAL;
  const dk = T(-13.4, y, -144.75, Math.PI);
  deskTop(K, dk, 1.6, 0.7);
  crt(K, mul(dk, T(0.4, 0.74, -0.05)), 'cam');
  clipboard(K, mul(dk, T(-0.3, 0.74, -0.05, 0.3)));
  mug(K, mul(dk, T(-0.62, 0.74, 0.15)), 0x2f62c8);
  chair(K, T(-13.3, y, -145.6, 0.3));
  // the tripod scope
  const tp = T(-10.8, y, -145.0, Math.PI - 0.15);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    K.box(tp, 'metal', Math.sin(a) * 0.18, 0.55, Math.cos(a) * 0.18, 0.025, 1.15, 0.025, COL.black, a, 0.32);
  }
  K.cyl(tp, 'metal', 0, 1.18, 0.05, 0.08, 0.5, 0xd8dde3, 0, Math.PI / 2 + 0.35);
  K.cyl(tp, 'metal', 0, 1.27, 0.28, 0.1, 0.06, COL.black, 0, Math.PI / 2 + 0.35);
  // the watcher: sat against the north wall facing the reactor, a clipboard in the lap
  skeleton(K, T(-11.9, y + 0.12, -147.65, 0), { waist: [-0.15, 0, 0.1], chest: [0.15, 0, 0], neck: [0.5, 0.35, 0.3], armL: [0.5, 0.25, 0], elbowL: 0.9, armR: [0.4, 0.15, 0], elbowR: 1.1, legL: [1.45, 0.2, 0], legR: [1.2, 0.1, 0], kneeL: 0.25, kneeR: 0.9 }, true);
  clipboard(K, T(-11.85, y + 0.33, -147.25, 0.2, -0.3));
  strew(K, -16.0, -147.8, -9.0, -144.4, 18, rnd, { y });
  K.add('prop', geos().cyl, T(-12.6, y + 0.04, -146.6, 0.6, 0, Math.PI / 2, 0.04, 0.26, 0.04), 0x6c8a5c); // a thermos
}

// scorch streaks fanning out from the dais across the hall floor (kept off the four colour channels)
function buildScorch(K, rnd) {
  let n = 0;
  for (let tries = 0; n < 26 && tries < 200; tries++) {
    const a = rnd() * Math.PI * 2;
    if (Math.abs(Math.sin(2 * a)) < 0.3) continue; // (steer clear of the compass channels)
    const r = 7.6 + rnd() * 3, len = 4 + rnd() * 5, w = 1.6 + rnd() * 1.4;
    const x = Math.sin(a) * (r + len / 2), z = PZ + Math.cos(a) * (r + len / 2);
    if (Math.abs(x) > 22 || z > -101 || z < -146) continue;
    streak(K, x, z, len, w, 0xffffff, FLOOR + 0.004 + n++ * 0.0002);
  }
}

// ---------------------------------------------------------------- drifting papers over the floor vents
const VENTS = [[-15.0, -108.2], [12.0, -106.2], [-17.2, -138.6], [17.0, -138.8]];
function buildDrift(W) {
  const M = materials(), N = 6, geo = geos().quad.clone();
  // uvs: one paper variant per instance is not possible with a shared uv set, so they're all typed pages
  const uvA = geo.attributes.uv, uv = P.paper[0];
  for (let i = 0; i < uvA.count; i++) uvA.setXY(i, uv[0] + uvA.getX(i) * (uv[2] - uv[0]), uv[1] + uvA.getY(i) * (uv[3] - uv[1]));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(uvA.count * 3).fill(1), 3));
  geo.scale(0.21, 0.29, 1);
  const mesh = new THREE.InstancedMesh(geo, M.print, VENTS.length * N);
  const papers = [];
  const r = rng(77);
  VENTS.forEach(([x, z], v) => {
    W.deco(x - 0.5, FLOOR, z - 0.25, x + 0.5, FLOOR + 0.02, z + 0.25, 'grate', 'hub');
    for (let i = 0; i < N; i++) papers.push({ x, z, a: r() * 6.28, rad: 0.3 + r() * 1.1, sp: (0.25 + r() * 0.4) * (r() < 0.5 ? -1 : 1), h: r(), ph: r() * 6.28, spin: r() * 6.28 });
  });
  const m4 = new THREE.Matrix4();
  const place = (t) => {
    papers.forEach((p, i) => {
      const a = p.a + t * p.sp, lift = 0.02 + Math.max(0, Math.sin(t * 0.9 + p.ph)) * (0.15 + p.h * 0.5);
      m4.copy(T(p.x + Math.cos(a) * p.rad, FLOOR + lift, p.z + Math.sin(a) * p.rad * 0.6, p.spin + t * p.sp * 0.7, -Math.PI / 2 + Math.sin(t * 2.1 + p.ph) * 0.35 * Math.min(1, lift * 4), Math.sin(t * 1.7 + p.ph) * 0.3));
      mesh.setMatrixAt(i, m4);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
  place(0);
  mesh.computeBoundingBox();
  mesh.boundingBox.expandByScalar(1.5);
  mesh.computeBoundingSphere();
  mesh.boundingSphere.radius += 1.5;
  W.scene.add(mesh);
  return place;
}

// ---------------------------------------------------------------- the whole station
export function buildOffices(B) {
  const { W, light } = B;
  const M = materials();
  const rnd = rng(1407);
  const rooms = [['SW', buildSW], ['SE', buildSE], ['NW', buildNW], ['NE', buildNE], ['gallery', buildGallery], ['scorch', (K) => buildScorch(K, rnd)]];
  for (const [name, fn] of rooms) {
    const K = new Kit(W);
    fn(K, W, rnd);
    K.build('offices_' + name);
  }
  const drift = buildDrift(W);
  // the light still on in each room (two of them on a dying ballast)
  const lights = [
    { l: light(-21.8, FLOOR + 2.3, -103.0, 0xe8f0ff, 5, 9), f: 'flickA' },
    { l: light(19.5, FLOOR + 2.3, -103.9, 0xe8f0ff, 5, 9), f: 'flickB' },
    { l: light(-19.5, FLOOR + 2.3, -144.5, 0xe8f0ff, 5, 9), f: 'flickA' },
    { l: light(20.0, FLOOR + 2.3, -143.5, 0xe8f0ff, 5, 9), f: 'flickB' },
  ];
  const base = M.lampC;
  let t = 0, nextA = 0, nextB = 0, a = 1, b = 1;
  const staticTex = M.static.map;
  W.add({
    update(dt, player) {
      if (regionOf(player.pos) !== 'hub') return;
      t += dt;
      // flicker: mostly on, with stutters and the odd dead second
      if (t > nextA) {
        a = Math.random() < 0.12 ? 0.05 : 0.6 + Math.random() * 0.4;
        nextA = t + (a < 0.1 ? 0.3 + Math.random() * 0.9 : 0.04 + Math.random() * (Math.random() < 0.8 ? 0.12 : 1.6));
      }
      if (t > nextB) {
        b = Math.random() < 0.2 ? 0.08 : 0.75 + Math.random() * 0.25;
        nextB = t + 0.05 + Math.random() * (Math.random() < 0.7 ? 0.1 : 2.4);
      }
      M.flickA.color.copy(base).multiplyScalar(a);
      M.flickB.color.copy(base).multiplyScalar(b);
      for (const L of lights) L.l.intensity = 5 * (L.f === 'flickA' ? a : b);
      staticTex.offset.set(Math.random(), Math.random());
      drift(t);
    },
  });
}
