// THE ATRIUM'S RESEARCH STATION: what's left of the team that came through on day 1 and stayed a month.
// The first week's glass rooms still stand at the edges (the field office SW, the instrument lab SE, the Prism lab
// NW, monitoring NE, an observation post on the north gallery). Then the cargo kept coming and the camp sprawled
// out over the free floor round the dais in work islands, grown a crate, a table, a rack at a time, every angle:
//   COMMONS (SW, by the red door): the day-1 party under its WELCOME TEAM banner (strung from a pole to a crate
//       stack), the kitchen table, cots under a canopy, the DAY 1 whiteboard on wheels; Wren's log 01 hovers by
//       the party table with open floor beside it for her ghost
//   YARD (SE): the generator, the tap on the red feed's wall socket, cargo on pallets, flight cases, cable reels
//   SENSORS (W of the dais): lab benches, a sample fridge, tripods and a mast aimed at the heart, the Prism board
//   WORKSHOP (E of the dais): a drone in pieces, the drone charging rack, a barricade of cases and the security
//       contractor who sat against it (helmet, plate carrier, rifle beside him)
//   OPS (N of the dais): a canopy over a trestle of monitors, desks pushed together (Wren's, empty), racks on
//       wheels, the radio that was their link to her, a stores tent under the gallery
//   then clutter() grows each island organically, cables run everywhere from the generators and wall sockets
//   (over cable bridges where they cross a lane), and status LEDs blink and kit beeps a month after.
// The lanes from every door and balcony drop to the dais, the ring round it and the lift approaches stay clear
// (LANE_CAPS / LANE_RECTS: in dev, a solid placed in one is reported).
// Whatever killed them came from the reactor, all at once: scorch streaks fan out from the dais, the panes facing it
// are cracked or blown in, chairs are knocked over, and on the walls a few people are only pale shadows.
//   Everything is shootable (breakables.js): monitors shatter, cases and generators blow, crates splinter,
//   papers fly, racks spark out, tripods topple, skeletons burst into bone and dust. Office chairs, the two
//   whiteboards and two trolleys roll when you push them (wheelies.js).
//   Drawn as one set of merged meshes (vertex-coloured props, a print atlas, a screen atlas, scorch, glass,
//   cables), plus the LEDs, the wheelies and the debris: a couple of dozen draw calls in all. Desks, crates,
//   racks, generators and glass are solid; cables, papers, bones and small things are not.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { regionOf } from './regions.js';
import { Breakables, patchBreakable } from '../entities/breakables.js';
import { Wheelies } from '../entities/wheelies.js';

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
  // cargo stencils (dark on white: tinted by the crate they're on)
  stencil: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => R(PS, (i % 2) * 256, 760 + Math.floor(i / 2) * 64, 256, 64)),
  hazard: R(PS, 512, 640, 256, 32),
  tally: R(PS, 768, 640, 128, 112),
  ops: R(PS, 512, 680, 256, 64),
  genPanel: R(PS, 896, 640, 128, 64),
  security: R(PS, 512, 760, 160, 40),
  camp: R(PS, 512, 808, 256, 160),
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
    // ---- cargo stencils
    const STEN = '"Arial Black", Impact, "Courier New", sans-serif';
    ['FRAGILE', 'PRISM TEAM · FIELD KIT', '▲ THIS WAY UP ▲', 'SAMPLES · KEEP COLD', 'HIGH VOLTAGE', 'HANDLE WITH CARE', 'CABLE · 50 m', 'CRATE 07 / 31'].forEach((s, i) => {
      const sx = (i % 2) * 256, sy = 760 + Math.floor(i / 2) * 64;
      g.fillStyle = '#ffffff';
      g.fillRect(sx, sy, 256, 64);
      g.strokeStyle = 'rgba(30,30,30,0.85)';
      g.lineWidth = 3;
      g.strokeRect(sx + 6, sy + 6, 244, 52);
      g.font = `${s.length > 14 ? 22 : 30}px ${STEN}`;
      g.fillStyle = i === 0 || i === 4 ? 'rgba(150,20,20,0.9)' : 'rgba(25,25,25,0.85)';
      g.textAlign = 'center';
      g.fillText(s, sx + 128, sy + (s.length > 14 ? 41 : 44));
      g.textAlign = 'left';
      // stencil gaps and scuffs
      for (let k = 0; k < 30; k++) {
        g.fillStyle = 'rgba(255,255,255,0.5)';
        g.fillRect(sx + 10 + Math.random() * 236, sy + 10 + Math.random() * 44, 2 + Math.random() * 8, 1 + Math.random() * 2);
      }
    });
    // ---- hazard stripes
    g.save();
    g.beginPath();
    g.rect(512, 640, 256, 32);
    g.clip();
    g.fillStyle = '#f1c232';
    g.fillRect(512, 640, 256, 32);
    g.fillStyle = '#1d1d1f';
    for (let x2 = 480; x2 < 800; x2 += 32) {
      g.beginPath();
      g.moveTo(x2, 672);
      g.lineTo(x2 + 16, 672);
      g.lineTo(x2 + 48, 640);
      g.lineTo(x2 + 32, 640);
      g.fill();
    }
    g.restore();
    // ---- a month of days crossed off
    g.fillStyle = '#ffffff';
    g.fillRect(768, 640, 128, 112);
    g.fillStyle = '#2f62c8';
    g.fillRect(768, 640, 128, 16);
    text('MARCH / APRIL', 778, 653, 11, '#fff', 'sans-serif');
    for (let d = 0; d < 35; d++) {
      const cx2 = 772 + (d % 7) * 17.5, cy2 = 662 + Math.floor(d / 7) * 17.5;
      g.strokeStyle = '#999';
      g.lineWidth = 1;
      g.strokeRect(cx2, cy2, 15, 15);
      if (d < 31) {
        marker(d === 0 ? RED : INK, 1.6);
        line([[cx2 + 2, cy2 + 2], [cx2 + 13, cy2 + 13]]);
        line([[cx2 + 13, cy2 + 2], [cx2 + 2, cy2 + 13]]);
      }
    }
    // ---- the ops tent's sign
    g.fillStyle = '#20252f';
    g.fillRect(512, 680, 256, 64);
    g.fillStyle = '#ffb43a';
    g.fillRect(520, 688, 8, 48);
    text('OPS · COMMS', 540, 722, 30, '#e8eef5', 'sans-serif');
    // ---- the generator's panel
    g.fillStyle = '#2a2d33';
    g.fillRect(896, 640, 128, 64);
    text('GEN-2', 904, 660, 16, '#f1c232', 'sans-serif');
    text('230V  50Hz', 904, 680, 12, '#dfe6f0', TYPE);
    g.fillStyle = '#111';
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      g.arc(990, 656 + k * 16, 6, 0, Math.PI * 2);
      g.fill();
    }
    // ---- SECURITY (white on black, for the contractor's vest)
    g.fillStyle = '#121316';
    g.fillRect(512, 760, 160, 40);
    text('SECURITY', 524, 789, 26, '#d8dadc', STEN);
    // ---- a hand-drawn plan of the camp, pinned up in the ops tent
    g.fillStyle = '#f6f4ee';
    g.fillRect(512, 808, 256, 160);
    marker(INK, 1.5);
    g.strokeRect(530, 822, 220, 130);
    g.beginPath();
    g.arc(640, 887, 22, 0, Math.PI * 2);
    g.stroke();
    text('heart', 624, 892, 12, RED);
    [['commons', 548, 940], ['power', 680, 940], ['sensors', 540, 870], ['workshop', 690, 870], ['ops', 640, 836]].forEach(([s, x2, y2]) => {
      marker(BLU, 1.5);
      g.strokeRect(x2 - 6, y2 - 14, 52, 20);
      text(s, x2 - 2, y2, 11, BLU);
    });
    text('KEEP LANES CLEAR!!', 560, 965, 12, RED, HAND, -0.03);
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
    cable: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05 }),
  };
  // every prop can break (breakables.js): screens, lamps and glass go dark at once, the rest chars, then goes
  for (const k of ['prop', 'metal', 'print', 'decal', 'cable']) patchBreakable(MATS[k]);
  for (const k of ['screen', 'static', 'lamp', 'flickA', 'flickB', 'glass']) patchBreakable(MATS[k], true);
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

// the world AABBs of a box given in frame M: one box for right-angle turns, else a grid of small boxes (so a
// desk at an odd angle doesn't grow invisible corners)
const _bv = new THREE.Vector3();
function obb(M, x1, y1, z1, x2, y2, z2, cell = 0.8) {
  const e = M.elements, ortho = Math.abs(e[0]) > 0.999 || Math.abs(e[2]) > 0.999;
  const nx = ortho ? 1 : Math.max(1, Math.ceil((x2 - x1) / cell)), nz = ortho ? 1 : Math.max(1, Math.ceil((z2 - z1) / cell));
  const out = [];
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) {
      const a = new THREE.Vector3(Infinity, Infinity, Infinity), b = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
      const ax = x1 + ((x2 - x1) * i) / nx, bx = x1 + ((x2 - x1) * (i + 1)) / nx, az = z1 + ((z2 - z1) * j) / nz, bz = z1 + ((z2 - z1) * (j + 1)) / nz;
      for (const x of [ax, bx]) for (const y of [y1, y2]) for (const z of [az, bz]) {
        _bv.set(x, y, z).applyMatrix4(M);
        a.min(_bv);
        b.max(_bv);
      }
      if (!ortho) {
        // (the corners of a turned cell poke out: pull them in a little)
        const sx = (b.x - a.x) * 0.12, sz = (b.z - a.z) * 0.12;
        a.x += sx, b.x -= sx, a.z += sz, b.z -= sz;
      }
      out.push({ min: a, max: b });
    }
  return out;
}

let BR = null; // the breakables registry while the station is being built
let LANES = null; // the walking lanes (checked in dev: no solid may stand in one)

class Kit {
  constructor(W) {
    this.W = W;
    this.parts = new Map();
    this.bid = 0; // the breakable the pieces being added belong to (negative: shown once it's broken)
    this.stack = [];
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
    g.setAttribute('bid', new THREE.BufferAttribute(new Float32Array(n).fill(this.bid), 1));
    if (this.track) {
      g.computeBoundingBox();
      this.track.union(g.boundingBox);
    }
    if (!this.parts.has(part)) this.parts.set(part, []);
    this.parts.get(part).push(g);
  }
  // Start a breakable: everything added until end() is it. type: see breakables.js; the box (in frame M) is
  // its shot proxy (and its collider if solid). Returns its id (0 when there's no registry).
  begin(type, M, x1, y1, z1, x2, y2, z2, opts = {}) {
    this.stack.push(this.bid);
    if (!BR) return (this.bid = 0);
    const boxes = opts.boxes || obb(M, x1, y1, z1, x2, y2, z2);
    // (inside another breakable, e.g. kit in an open case: it goes when that does)
    const id = BR.add({ type, boxes, parent: this.stack[this.stack.length - 1] > 0 ? this.stack[this.stack.length - 1] : 0, ...opts });
    this.bid = id;
    if (opts.solid) for (const b of boxes) checkLane(b, type);
    return id;
  }
  end() {
    this.bid = this.stack.pop() ?? 0;
  }
  // a breakable whose bounds are measured from what's built (endFit sets them, padded)
  beginFit(type, opts = {}) {
    const id = this.begin(type, I, 0, 0, 0, 0.01, 0.01, 0.01, opts);
    this.track = new THREE.Box3();
    return id;
  }
  endFit(pad = 0.05) {
    const id = this.bid, b = this.track;
    this.track = null;
    if (BR && id > 0 && !b.isEmpty()) BR.fit(id, b.min.subScalar(pad), b.max.addScalar(pad));
    this.end();
    return id;
  }
  // the pieces only seen once breakable `id` is broken (a scorch, the toppled version, planks)
  after(id, fn) {
    if (!id) return;
    const prev = this.bid;
    this.bid = -id;
    fn();
    this.bid = prev;
  }
  // a status LED on the current breakable
  led(M, x, y, z, color, mode = 'on', size = 0.022) {
    if (!BR) return;
    _bv.set(x, y, z).applyMatrix4(M);
    BR.led(Math.max(0, this.bid), _bv.x, _bv.y, _bv.z, color, mode, size);
  }
  beep(M, x, y, z, kind, gap) {
    if (!BR || this.bid <= 0) return;
    _bv.set(x, y, z).applyMatrix4(M);
    BR.beep(this.bid, _bv.x, _bv.y, _bv.z, kind, gap);
  }
  hum(M, x, y, z, name, gain, far) {
    if (!BR || this.bid <= 0) return;
    _bv.set(x, y, z).applyMatrix4(M);
    BR.hum(this.bid, _bv.x, _bv.y, _bv.z, name, gain, far);
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
  // a solid (collision) box given in a frame M (turned at an odd angle: a grid of smaller boxes)
  solid(M, x1, y1, z1, x2, y2, z2, props = {}) {
    let last = null;
    for (const b of obb(M, x1, y1, z1, x2, y2, z2)) {
      checkLane(b, 'solid');
      last = this.W.addSolid(b.min, b.max, { static: true, kind: 'metal', ...props });
    }
    return last;
  }
  // merge each material's pieces into one mesh, in one group (culled as one by World)
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
  // the merged geometry per material, not added anywhere (for instanced props: the wheelies)
  geometries() {
    const M = materials(), out = new Map();
    for (const [part, list] of this.parts) {
      const g = mergeGeometries(list, false);
      list.forEach((x) => x.dispose());
      g.deleteAttribute('bid');
      out.set(M[part], g);
    }
    this.parts.clear();
    return out;
  }
}

// ---------------------------------------------------------------- lanes: the walking routes that stay clear
// capsules [x1, z1, x2, z2, half-width] and rects { x1, z1, x2, z2 }: from each door and balcony drop to the
// plaza, the ring of floor round the dais, the approaches to the two lifts, the red door's arrival, and the
// patch beside log 01 where Wren's ghost stands.
const LANE_CAPS = [
  [0, -100, 0, -113.8, 2.3], // red door → plaza
  [-24.5, -112, -9.6, -117.8, 2.0], // Solar door → plaza
  [24.5, -112, 9.6, -117.8, 2.0], // Azure door → plaza
  [-10, -148, -4.4, -132.8, 2.0], // Verdant gate → plaza
  [-21, -122.5, -9.6, -123.0, 2.0], // west lift
  [21, -122.5, 9.6, -123.0, 2.0], // east lift
  [-19.6, -136, -9, -131.8, 1.7], // west balcony drop → plaza
  [19.6, -136, 9, -131.8, 1.7], // east balcony drop → plaza
  [10, -143.6, 9.4, -134.4, 1.7], // north balcony drop → plaza
];
const LANE_RECTS = [
  { x1: -9.6, z1: -133.6, x2: 9.6, z2: -114.4 }, // the dais and the ring round it
  { x1: -3.2, z1: -104.6, x2: 3.2, z2: -100 }, // arrival (the checkpoint)
  { x1: -8.6, z1: -104.4, x2: -3.2, z2: -100.2 }, // log 01's ghost
  { x1: -24.5, z1: -114.0, x2: -21, z2: -110.0 }, // Solar door mouth
  { x1: 21, z1: -114.0, x2: 24.5, z2: -110.0 }, // Azure door mouth
  { x1: -12.0, z1: -148, x2: -8.0, z2: -145 }, // Verdant gate mouth
];
// doors into the glass rooms, vents, and the like: no clutter
const KEEP_OUT = [
  { x1: -19.4, z1: -106.4, x2: -16.9, z2: -102.2 }, // field office door
  { x1: 12.4, z1: -105.2, x2: 14.7, z2: -101.2 }, // instrument lab door
  { x1: -19.0, z1: -140.3, x2: -16.0, z2: -137.6 }, // Prism lab door
  { x1: 15.7, z1: -140.3, x2: 18.7, z2: -137.6 }, // monitoring door
  { x1: 5.2, z1: -102.0, x2: 8.6, z2: -100 }, // the one who ran for the door
];
function inLane(x, z, pad = 0) {
  for (const [x1, z1, x2, z2, w] of LANE_CAPS) {
    const dx = x2 - x1, dz = z2 - z1, t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / (dx * dx + dz * dz)));
    if (Math.hypot(x - x1 - dx * t, z - z1 - dz * t) < w + pad) return true;
  }
  for (const r of LANE_RECTS) if (x > r.x1 - pad && x < r.x2 + pad && z > r.z1 - pad && z < r.z2 + pad) return true;
  return false;
}
// (dev) a solid standing in a lane: record it
function checkLane(b, what) {
  if (!LANES || b.max.y < FLOOR + 0.3 || b.min.y > FLOOR + 1.8) return;
  const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
  if (cx < -24.5 || cx > 24.5 || cz > -100 || cz < -148) return;
  for (const [x, z] of [[b.min.x, b.min.z], [b.max.x, b.min.z], [b.min.x, b.max.z], [b.max.x, b.max.z], [cx, cz]]) {
    if (inLane(x, z)) {
      LANES.push(`${what} at ${cx.toFixed(1)}, ${cz.toFixed(1)}`);
      return;
    }
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
// monitors (breakable: they shatter and go dark), each with a power LED; `beep` gives it a sound of its own
function crt(K, M, cell, part = 'screen', beep = null) {
  K.begin('monitor', M, -0.21, 0, -0.35, 0.21, 0.37, 0.19);
  K.box(M, 'prop', 0, 0.18, 0, 0.4, 0.34, 0.36, COL.beige);
  K.box(M, 'prop', 0, 0.17, -0.25, 0.28, 0.26, 0.18, COL.beige);
  K.box(M, 'prop', 0, 0.01, 0, 0.26, 0.02, 0.24, COL.beige);
  K.quad(M, 'prop', 0, 0.19, 0.1805, 0.31, 0.24, 0x101114);
  K.quad(M, part, 0, 0.19, 0.181, 0.31, 0.24, 0xffffff, part === 'screen' ? SC[cell] : null);
  K.led(M, 0.155, 0.04, 0.183, part === 'static' ? 0xffb43a : 0x4dff7a, part === 'static' ? 'slow' : 'on', 0.016);
  if (beep) K.beep(M, 0, 0.2, 0.1, beep, beep === 'ecg' ? [1.9, 1.95] : undefined);
  K.end();
}
function flat(K, M, cell, beep = null) {
  K.begin('monitor', M, -0.29, 0, -0.09, 0.29, 0.5, 0.04);
  K.box(M, 'metal', 0, 0.01, 0, 0.2, 0.02, 0.16, COL.black);
  K.box(M, 'metal', 0, 0.14, -0.03, 0.04, 0.26, 0.03, COL.black);
  K.box(M, 'prop', 0, 0.32, 0, 0.56, 0.34, 0.03, COL.black);
  K.quad(M, 'screen', 0, 0.32, 0.016, 0.52, 0.3, 0xffffff, SC[cell]);
  K.led(M, 0.25, 0.165, 0.017, 0x4aa8ff, 'on', 0.012);
  if (beep) K.beep(M, 0, 0.3, 0, beep);
  K.end();
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
  const c = new THREE.Vector3().applyMatrix4(M);
  K.begin('papers', M, -0.14, 0, -0.18, 0.14, Math.max(0.07, n * 0.006 + 0.02), 0.18, { papers: Array.from({ length: n }, (_, i) => [c.x, c.y + i * 0.006, c.z]) });
  for (let i = 0; i < n; i++) K.box(M, 'prop', (rnd() - 0.5) * 0.02, 0.003 + i * 0.006, (rnd() - 0.5) * 0.02, 0.21, 0.006, 0.29, i % 5 ? 0xcfcdc6 : 0xc4bfac, (rnd() - 0.5) * 0.15);
  K.quad(M, 'print', 0, n * 0.006 + 0.001, 0, 0.21, 0.29, 0xffffff, P.paper[Math.floor(rnd() * 8)], 0, -Math.PI / 2);
  K.end();
}
function binder(K, M, color) {
  K.box(M, 'prop', 0, 0.15, 0, 0.055, 0.3, 0.26, color);
}
function clipboard(K, M) {
  K.box(M, 'prop', 0, 0.004, 0, 0.23, 0.008, 0.32, COL.wood);
  K.quad(M, 'print', 0, 0.009, 0.01, 0.2, 0.27, 0xffffff, P.clip, 0, -Math.PI / 2);
  K.box(M, 'metal', 0, 0.014, -0.14, 0.09, 0.012, 0.03, COL.alu);
}
// a server rack (breakable: sparks out and goes dark); `wheels` puts it on castors with its door ajar
function rack(K, M, cell, h = 2.0, wheels = false) {
  const y0 = wheels ? 0.12 : 0;
  K.begin('rack', M, -0.31, 0, -0.45, 0.31, h + y0, 0.45, { solid: true });
  if (wheels) {
    for (const [x, z] of [[-0.25, -0.38], [0.25, -0.38], [-0.25, 0.38], [0.25, 0.38]]) {
      K.cyl(M, 'metal', x, 0.05, z, 0.045, 0.04, COL.black, 0, 0, Math.PI / 2);
      K.box(M, 'metal', x, 0.1, z, 0.05, 0.04, 0.05, COL.alu);
    }
    M = mul(M, T(0, y0, 0));
    // the glass door, swung open on its hinge
    K.box(mul(M, T(-0.3, 0, 0.46, -1.1)), 'metal', 0.29, h / 2, 0, 0.58, h - 0.04, 0.02, 0x2f343c);
  }
  K.box(M, 'metal', 0, h / 2, 0, 0.62, h, 0.9, 0x23262c);
  K.box(M, 'metal', 0, h + 0.01, 0, 0.6, 0.02, 0.86, 0x3a3f48);
  K.quad(M, 'screen', 0, h / 2 + 0.05, 0.451, 0.5, h - 0.3, 0xffffff, SC[cell]);
  K.box(M, 'metal', 0.27, h / 2, 0.455, 0.03, h - 0.1, 0.02, COL.alu);
  // status LEDs down the front: steady, blinking, the odd amber flicker
  const n = Math.round(h * 4);
  for (let i = 0; i < n; i++) {
    const y = 0.2 + (i / n) * (h - 0.35), r = (i * 7) % 5;
    K.led(M, -0.235, y, 0.46, r === 0 ? 0xffb43a : r === 3 ? 0x4aa8ff : 0x4dff7a, r === 0 ? 'flicker' : r === 1 ? 'fast' : r === 2 ? 'blink' : 'on', 0.018);
    if (i % 2) K.led(M, -0.2, y, 0.46, 0x4dff7a, 'flicker', 0.014);
  }
  const id = K.bid;
  K.end();
  return id;
}
const VIAL = [0xff3b3b, 0xffd23a, 0x40ff70, 0x3a9bff];
function sampleCase(K, M, open = true, spill = 0) {
  K.begin('equipment', M, -0.26, 0, -0.22, 0.26, open ? 0.44 : 0.2, 0.18);
  K.led(M, 0.2, 0.08, 0.171, 0x4dff7a, 'slow', 0.014);
  K.box(M, 'metal', 0, 0.05, 0, 0.5, 0.1, 0.34, COL.alu);
  K.box(M, 'prop', 0, 0.1, 0, 0.46, 0.005, 0.3, 0x1f2a36);
  if (open) K.box(M, 'metal', 0, 0.26, -0.19, 0.5, 0.32, 0.03, COL.alu, 0, -0.25);
  for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) if (r * 4 + c >= spill) K.cyl(M, 'lamp', -0.16 + c * 0.105, 0.14, -0.06 + r * 0.12, 0.022, 0.09, VIAL[c]);
  K.end();
}
function microscope(K, M) {
  K.begin('equipment', M, -0.11, 0, -0.14, 0.11, 0.45, 0.14);
  K.led(M, 0.08, 0.03, 0.131, 0x4aa8ff, 'on', 0.012);
  K.box(M, 'prop', 0, 0.02, 0, 0.2, 0.04, 0.26, COL.white);
  K.box(M, 'prop', 0, 0.18, -0.09, 0.06, 0.32, 0.07, COL.white, 0, -0.15);
  K.box(M, 'metal', 0, 0.13, 0.02, 0.15, 0.015, 0.14, COL.black);
  K.cyl(M, 'metal', 0, 0.28, 0, 0.026, 0.2, COL.black, 0, 0.45);
  K.cyl(M, 'metal', 0, 0.38, -0.05, 0.016, 0.08, COL.black, 0, 0.45);
  K.cyl(M, 'metal', 0, 0.19, 0.03, 0.03, 0.03, COL.alu);
  K.end();
}
function spectrometer(K, M, beep = 'chirp') {
  K.begin('equipment', M, -0.41, 0, -0.19, 0.29, 0.26, 0.21);
  K.led(M, 0.2, 0.2, 0.181, 0x4dff7a, 'blink', 0.016);
  K.led(M, 0.24, 0.2, 0.181, 0xffb43a, 'slow', 0.016);
  if (beep) K.beep(M, 0, 0.15, 0, beep, [4, 11]);
  K.box(M, 'prop', 0, 0.12, 0, 0.56, 0.24, 0.36, 0x8c949e);
  K.box(M, 'prop', 0, 0.245, 0, 0.5, 0.01, 0.3, 0x6c737c);
  K.cyl(M, 'metal', 0.34, 0.12, 0, 0.06, 0.14, COL.black, 0, 0, Math.PI / 2);
  K.quad(M, 'screen', -0.1, 0.14, 0.181, 0.22, 0.13, 0xffffff, SC.spectrum);
  for (let i = 0; i < 3; i++) K.cyl(M, 'metal', 0.1 + i * 0.07, 0.1, 0.19, 0.015, 0.02, COL.alu, 0, Math.PI / 2);
  K.end();
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
// coat: true (a lab coat and an ID badge), false (bare), or 'merc' (a security contractor: a black helmet with a
// cracked visor, a plate carrier with pouches). Breakable (a burst of bone and dust); returns its id.
function skeleton(K, M, pose = {}, coat = true) {
  const merc = coat === 'merc';
  if (merc) coat = false;
  const id = K.beginFit(merc ? 'merc' : 'skeleton');
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
    if (coat || merc) {
      const sc = merc ? 0x2b2f2a : COL.coat; // (the contractor: a dark combat shirt)
      K.cyl(sh, 'prop', 0, -0.13, 0, 0.05, 0.3, sc, 0, 0, 0, 'cyl6');
      K.add('prop', geos().cup, mul(el, T(0, -0.06, 0, 0, 0, 0, 0.055, 0.14, 0.055)), sc);
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
    if (merc) {
      K.box(ft, 'prop', 0, -0.005, 0.04, 0.1, 0.1, 0.28, 0x121315); // boots
      K.cyl(kn, 'prop', 0, -0.33, 0, 0.055, 0.16, 0x121315, 0, 0, 0, 'cyl6');
    }
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
  if (merc) {
    // the plate carrier: front and back plates, shoulder straps, a cummerbund, pouches, a SECURITY tag
    const V = 0x15171b, V2 = 0x23262b;
    K.box(chest, 'prop', 0, 0.2, 0.1, 0.32, 0.34, 0.06, V, 0, -0.1);
    K.box(chest, 'prop', 0, 0.2, -0.11, 0.32, 0.36, 0.05, V);
    for (const s2 of [-1, 1]) {
      K.box(chest, 'prop', s2 * 0.11, 0.37, -0.005, 0.07, 0.03, 0.22, V2);
      K.box(chest, 'prop', s2 * 0.17, 0.08, -0.005, 0.03, 0.13, 0.2, V2);
    }
    K.box(chest, 'prop', 0, 0.04, -0.005, 0.36, 0.11, 0.22, V2);
    for (let i = 0; i < 3; i++) K.box(chest, 'prop', -0.1 + i * 0.1, 0.11, 0.145, 0.085, 0.11, 0.05, 0x2a2d31, 0, -0.1);
    K.box(chest, 'prop', 0.19, 0.06, 0.06, 0.05, 0.1, 0.07, 0x2a2d31); // radio pouch
    K.box(chest, 'prop', 0.19, 0.16, 0.06, 0.012, 0.12, 0.012, 0x101010); // its antenna
    K.quad(chest, 'print', 0, 0.3, 0.134, 0.15, 0.037, 0xffffff, P.security, 0, -0.1);
    // the helmet: a shell over the cranium, a brim, ear cups, a visor with a crack, a dead headlamp
    K.sph(neck, 'prop', 0, 0.2, -0.005, 0.118, 0x16181c, 0.85, 1.12);
    K.box(neck, 'prop', 0, 0.16, -0.01, 0.235, 0.04, 0.27, 0x16181c);
    for (const s2 of [-1, 1]) K.box(neck, 'prop', s2 * 0.115, 0.13, -0.01, 0.03, 0.08, 0.1, 0x1f2227);
    K.box(neck, 'glass', 0, 0.135, 0.115, 0.2, 0.07, 0.012, 0xffffff, 0, 0.25);
    K.quad(neck, 'decal', 0.04, 0.137, 0.123, 0.08, 0.08, 0xffffff, D.crack, 0, 0.25);
    K.cyl(neck, 'metal', 0, 0.255, 0.1, 0.022, 0.03, 0x2a2d31, 0, Math.PI / 2 - 0.3);
    K.box(neck, 'prop', 0, 0.06, 0.04, 0.17, 0.012, 0.012, 0x101010); // the chin strap, undone
    if (BR && id) BR.get(id).helmet = new THREE.Vector3(0, 0.2, 0).applyMatrix4(neck);
  }
  K.endFit(0.04);
  return id;
}

// the contractor's rifle: a stubby black carbine (lying in frame M, muzzle along +x)
function rifle(K, M) {
  const B1 = 0x16181b, B2 = 0x2a2d31;
  K.box(M, 'prop', 0.05, 0.03, 0, 0.42, 0.07, 0.045, B1); // receiver
  K.box(M, 'metal', 0.42, 0.035, 0, 0.36, 0.022, 0.022, B2, 0, 0, Math.PI / 2 * 0); // barrel
  K.box(M, 'prop', 0.36, 0.035, 0, 0.24, 0.05, 0.05, B2); // handguard
  K.box(M, 'prop', -0.28, 0.02, 0, 0.26, 0.07, 0.04, B1, 0, 0, 0.05); // stock
  K.box(M, 'prop', 0.08, -0.04, 0, 0.05, 0.12, 0.04, B1, 0, 0, -0.25); // grip
  K.box(M, 'prop', 0.18, -0.06, 0, 0.06, 0.16, 0.035, B2, 0, 0, 0.2); // magazine
  K.box(M, 'prop', 0.1, 0.09, 0, 0.14, 0.04, 0.035, 0x0e0f11); // sight
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
// (each ~2 m cell of them is one breakable: shoot the floor there and they burst into a flurry)
function strew(K, x1, z1, x2, z2, n, rnd, { y = FLOOR, drift = null, away = true } = {}) {
  const cells = new Map();
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
    const key = Math.floor(x / 2) * 1000 + Math.floor(z / 2);
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push([x, y + 0.004 + rnd() * 0.01, z, ry, Math.floor(rnd() * 8), (rnd() - 0.5) * 0.08, tint]);
  }
  for (const list of cells.values()) {
    let ax = Infinity, az = Infinity, bx = -Infinity, bz = -Infinity;
    for (const [x, , z] of list) (ax = Math.min(ax, x)), (az = Math.min(az, z)), (bx = Math.max(bx, x)), (bz = Math.max(bz, z));
    K.begin('papers', I, 0, 0, 0, 0, 0, 0, { boxes: [{ min: new THREE.Vector3(ax - 0.16, y, az - 0.16), max: new THREE.Vector3(bx + 0.16, y + 0.05, bz + 0.16) }], papers: list });
    for (const [x, py, z, ry, i, tilt, tint] of list) paper(K, x, py, z, ry, i, tilt, tint);
    K.end();
  }
}
// a scorch / silhouette decal on a wall: a quad facing `ry`
const wallDecal = (K, x, y, z, w, h, uv, ry, tint = 0xffffff) => K.quad(I, 'decal', x, y, z, w, h, tint, uv, ry);
const floorDecal = (K, x, z, w, h, uv, ry, tint = 0xffffff, y = FLOOR + 0.006) => K.quad(I, 'decal', x, y, z, w, h, tint, uv, ry, -Math.PI / 2);
// a scorch streak on the floor centred at (x, z), its hot end toward the reactor
const streak = (K, x, z, len, w, tint = 0xffffff, y = FLOOR + 0.006) => floorDecal(K, x, z, len, w, D.streak, Math.atan2(x, z - PZ) - Math.PI / 2, tint, y);
const TINT = [0xffc4bc, 0xffecbc, 0xc8ffd0, 0xc0dcff];

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
  // (the day-1 whiteboard went out into the camp on wheels: hubCamp; its bracket is left, with the plan pinned up)
  K.aabb('metal', -24.5, FLOOR + 1.0, -105.5, -24.47, FLOOR + 1.03, -102.9, COL.alu);
  K.quad(I, 'print', -24.48, FLOOR + 1.75, -104.6, 0.9, 0.56, 0xffffff, P.camp, Math.PI / 2, 0, 0.02);
  K.quad(I, 'print', -24.48, FLOOR + 1.7, -103.3, 0.42, 0.37, 0xffffff, P.tally, Math.PI / 2, 0, -0.04);
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
  // somebody's shadow on the south wall, scorched in by the commons (yellow-fringed)
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
function banner(K, pts, hgt, face = new THREE.Vector3(0, 0, -1)) {
  const pos = [], nor = [], uv = [], [u1, v1, u2, v2] = P.banner;
  const L = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1], p[2] - pts[i][2]));
  const total = L.reduce((a, b) => a + b, 0);
  let s = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = new THREE.Vector3(...pts[i]), b = new THREE.Vector3(...pts[i + 1]), dir = b.clone().sub(a).normalize();
    const onFloor = a.y < 4.1 && b.y < 4.1;
    const across = onFloor ? new THREE.Vector3(0, 0, -1) : Math.abs(dir.y) > 0.6 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, -1, 0);
    const want = onFloor ? new THREE.Vector3(0, 1, 0) : face;
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
  for (const [x, z] of [[18.4, -102.5], [21.0, -102.6]]) wheelChair(K, x, z, faceReactor(x, z));
  chairFallen(K, 20.6, -105.4, 2.0, 1);
  // a shadow on the south wall (blue-fringed) and the scorch round it
  wallDecal(K, 17.3, FLOOR + 1.25, -100.012, 1.7, 2.3, D.sil2, Math.PI, TINT[3]);
  wallDecal(K, 17.4, FLOOR + 1.1, -100.01, 3.0, 3.0, D.blob, Math.PI);
  strew(K, 14.8, -107.0, 24.3, -100.2, 60, rnd, { drift: 'z2' });
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
  // the Prism whiteboard went out into the camp on wheels; the survey blueprint is taped up where it hung
  K.aabb('metal', -23.6, FLOOR + 1.04, -147.99, -21.2, FLOOR + 1.07, -147.95, COL.alu);
  K.quad(I, 'print', -22.4, FLOOR + 1.75, -147.985, 1.25, 0.78, 0xffffff, P.plan, 0, 0, 0.015);
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
  for (const [x, z] of [[-21.2, -144.6], [-19.8, -144.55], [-23.0, -145.3]]) wheelChair(K, x, z, faceReactor(x, z) + (rnd() - 0.5) * 0.4);
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
  chairFallen(K, 21.6, -145.9, Math.PI + 0.9, 1);
  for (const [x, z] of [[18.3, -145.6], [23.3, -145.7]]) wheelChair(K, x, z, faceReactor(x, z) + (rnd() - 0.5) * 0.3);
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
  wheelChair(K, 17.6, -144.6, faceReactor(17.6, -144.6));
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

// ================================================================ THE CAMP
// After the first week the glass rooms were full, and for a month the team kept hauling cargo through the breach
// and setting up wherever there was floor: out round the dais, in work islands that grew a crate, a table, a rack
// at a time. Nothing in rows, everything at whatever angle it was dropped, newer kit piled on the old, cables
// everywhere. The lanes from every door and balcony to the dais (LANE_CAPS) stay clear.
const WOOD = [0x9a7046, 0x8a6440, 0xa57a4c, 0x7d5a38, 0x6f6a4a];
const CASES = [0x1e2024, 0x2a2d33, 0x3a3f48, 0x4a4436, 0x23303a];
const CABLE = [0x18191c, 0x18191c, 0x2a2c30, 0xd8641e, 0xd9b11c, 0x2a5fb0, 0x9a2a2a, 0xbfc2c4];
const at = (x, z, ry = 0, y = FLOOR) => T(x, y, z, ry);
const up = (M, h) => mul(M, T(0, h, 0));
const tint = (hex, k) => _c.set(hex).multiplyScalar(k).clone();

let CHAIRS = null; // office chairs on castors: the wheelies (filled while building)
let PLUGS = null; // what draws power: { hub, x, y, z } (cables run to them from their island's hub)
// an office chair you can push about (a wheelie), or a fixed one if there are none
function wheelChair(K, x, z, ry) {
  if (CHAIRS) CHAIRS.push(['chair', x, z, ry]);
  else chair(K, T(x, FLOOR, z, ry));
}
const plug = (hub, M, x = 0, y = 0.1, z = 0) => {
  if (!PLUGS) return;
  _bv.set(x, y, z).applyMatrix4(M);
  PLUGS.push({ hub, x: _bv.x, y: _bv.y, z: _bv.z });
};

// ---------------------------------------------------------------- cargo
// a wooden crate (corner battens, slats, a stencil); open: no lid, packing straw and foam showing
function crate(K, M, w, h, d, color, { open = false, label = -1 } = {}) {
  const dark = tint(color, 0.72);
  if (open) {
    K.box(M, 'prop', 0, 0.02, 0, w, 0.04, d, color);
    for (const s of [-1, 1]) {
      K.box(M, 'prop', 0, h / 2, s * (d / 2 - 0.012), w, h, 0.024, color);
      K.box(M, 'prop', s * (w / 2 - 0.012), h / 2, 0, 0.024, h, d - 0.04, color);
    }
    K.box(M, 'prop', 0, h * 0.7, 0, w - 0.06, h * 0.6, d - 0.06, 0x2c2e33); // foam
    for (let i = 0; i < 9; i++) K.box(M, 'prop', ((i * 37) % 7 - 3) * w * 0.11, h + 0.01, ((i * 53) % 5 - 2) * d * 0.15, 0.24, 0.012, 0.016, 0xd9c27a, i * 0.7, 0.2, (i % 3) * 0.3);
  } else K.box(M, 'prop', 0, h / 2, 0, w, h, d, color);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) K.box(M, 'prop', sx * (w / 2 - 0.025), h / 2, sz * (d / 2 - 0.025), 0.065, h + 0.004, 0.065, dark);
  for (const y of [0.22, 0.78]) for (const s of [-1, 1]) K.box(M, 'prop', 0, h * y, s * (d / 2 + 0.004), w - 0.1, 0.07, 0.012, dark);
  if (label >= 0) K.quad(M, 'print', 0, h * 0.5, d / 2 + 0.012, Math.min(w * 0.72, 0.8), Math.min(w * 0.72, 0.8) / 4, tint(color, 1.25), P.stencil[label]);
  if (label >= 0 && w > 0.6) K.quad(M, 'print', w / 2 + 0.012, h * 0.5, 0, Math.min(d * 0.72, 0.7), Math.min(d * 0.72, 0.7) / 4, tint(color, 1.25), P.stencil[(label + 3) % 8], Math.PI / 2);
}
// a flight case: aluminium edges, corners, latches, a handle; open: the lid back on its hinge, kit in foam
function flightCase(K, M, w, h, d, color, { open = false, label = -1, kit = null } = {}) {
  const A = COL.alu;
  K.box(M, 'prop', 0, h / 2, 0, w, h, d, color);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(M, 'metal', sx * (w / 2 - 0.01), h / 2, sz * (d / 2 - 0.01), 0.03, h + 0.006, 0.03, A);
  for (const y of [0.01, h - 0.01, h * 0.62]) {
    K.box(M, 'metal', 0, y, d / 2 - 0.01, w + 0.006, 0.025, 0.03, A);
    K.box(M, 'metal', 0, y, -d / 2 + 0.01, w + 0.006, 0.025, 0.03, A);
  }
  for (const s of [-1, 1]) K.box(M, 'metal', s * w * 0.3, h * 0.62, d / 2 + 0.015, 0.06, 0.07, 0.02, 0x8a929c);
  if (open) {
    K.box(M, 'prop', 0, h - 0.004, 0, w - 0.05, 0.01, d - 0.05, 0x2c2e33);
    const L = mul(M, T(0, h, -d / 2, 0, -1.95));
    K.box(L, 'prop', 0, 0.025, d / 2, w, 0.05, d, color);
    K.box(L, 'prop', 0, 0.055, d / 2, w - 0.05, 0.01, d - 0.05, 0x2c2e33);
    if (kit) kit(up(M, h));
  } else K.box(M, 'metal', 0, h + 0.02, 0, 0.18, 0.03, 0.03, 0x1c1e22);
  if (label >= 0) K.quad(M, 'print', 0, h * 0.32, d / 2 + 0.006, Math.min(w * 0.6, 0.5), Math.min(w * 0.6, 0.5) / 4, 0xdddddd, P.stencil[label]);
}
function pallet(K, M, w = 1.2, d = 1.0) {
  for (const s of [-1, 0, 1]) K.box(M, 'prop', s * (w / 2 - 0.05), 0.05, 0, 0.09, 0.1, d, 0x8a7350);
  for (let i = 0; i < 5; i++) K.box(M, 'prop', 0, 0.12, -d / 2 + 0.1 + (i * (d - 0.2)) / 4, w, 0.022, 0.13, i % 2 ? 0x9c8358 : 0xa88e62);
}
// A pile of cargo, broken as one (it splinters, or bursts if it's cases). items: { k: 'crate' | 'case' | 'open' |
// 'pallet' | 'box', w, h, d, x, z, y (its base, on whatever's under it), ry, c, label }
function pile(K, x, z, ry, items, { kind = null, solid = true } = {}) {
  const M = at(x, z, ry), boxes = [];
  for (const it of items) {
    const F = mul(M, T(it.x || 0, it.y || 0, it.z || 0, it.ry || 0));
    if (it.k === 'pallet') boxes.push(...obb(F, -0.6, 0, -0.5, 0.6, 0.14, 0.5));
    else boxes.push(...obb(F, -it.w / 2, 0, -it.d / 2, it.w / 2, it.h, it.d / 2));
  }
  const cases = items.filter((i) => i.k === 'case').length, crates = items.filter((i) => i.k === 'crate' || i.k === 'open' || i.k === 'box').length;
  const type = kind || (cases > crates ? 'case' : 'crate');
  K.begin(type, I, 0, 0, 0, 0, 0, 0, { boxes, solid });
  for (const b of boxes) checkLane(b, 'pile');
  for (const it of items) {
    const F = mul(M, T(it.x || 0, it.y || 0, it.z || 0, it.ry || 0));
    if (it.k === 'pallet') pallet(K, F);
    else if (it.k === 'case') flightCase(K, F, it.w, it.h, it.d, it.c ?? CASES[0], { label: it.label ?? -1, open: it.open, kit: it.kit });
    else if (it.k === 'box') {
      K.box(F, 'prop', 0, it.h / 2, 0, it.w, it.h, it.d, it.c ?? 0xb08a5c);
      K.box(F, 'prop', 0, it.h + 0.002, 0, 0.06, 0.004, it.d + 0.004, 0xc9b27a); // tape
      if (it.label >= 0) K.quad(F, 'print', 0, it.h * 0.5, it.d / 2 + 0.004, it.w * 0.7, it.w * 0.175, tint(it.c ?? 0xb08a5c, 1.2), P.stencil[it.label]);
    } else crate(K, F, it.w, it.h, it.d, it.c ?? WOOD[0], { open: it.k === 'open', label: it.label ?? -1 });
  }
  const id = K.bid;
  // what's left once it's broken: a few planks, straw (crates) or a scorch (cases)
  K.after(id, () => {
    if (type === 'case') floorDecal(K, x, z, 1.6, 1.6, D.blob, ry, 0xffffff, FLOOR + 0.009);
    else for (let i = 0; i < 5; i++) K.box(M, 'prop', ((i * 41) % 9 - 4) * 0.12, 0.014, ((i * 29) % 7 - 3) * 0.12, 0.5, 0.025, 0.09, WOOD[i % 4], i * 1.3);
  });
  K.end();
  return id;
}

// ---------------------------------------------------------------- tables
function foldingTable(K, M, w = 1.6, d = 0.7, top = 0xd8d4c8) {
  const h = 0.73;
  K.box(M, 'prop', 0, h - 0.02, 0, w, 0.03, d, top);
  K.box(M, 'metal', 0, h - 0.05, 0, w - 0.04, 0.03, d - 0.04, 0x6a6f78);
  for (const s of [-1, 1]) {
    K.box(M, 'metal', s * (w / 2 - 0.15), (h - 0.05) / 2, 0, 0.03, h - 0.05, 0.03, 0x9aa1aa, 0, 0, s * 0.18);
    for (const t of [-1, 1]) K.box(M, 'metal', s * (w / 2 - 0.13), (h - 0.05) / 2, t * (d / 2 - 0.06), 0.025, h - 0.05, 0.025, 0x9aa1aa, 0, t * 0.12);
    K.box(M, 'metal', s * (w / 2 - 0.13), 0.02, 0, 0.03, 0.03, d - 0.08, 0x9aa1aa);
  }
  K.solid(M, -w / 2, 0, -d / 2, w / 2, h, d / 2);
  return up(M, h);
}
// planks on two sawhorses
function trestle(K, M, w = 3, d = 0.8) {
  const h = 0.78;
  for (const s of [-1, 1]) {
    const S = mul(M, T(s * (w / 2 - 0.35), 0, 0));
    K.box(S, 'prop', 0, h - 0.06, 0, 0.09, 0.08, d + 0.1, 0x9a7a52);
    for (const t of [-1, 1]) for (const u of [-1, 1]) K.box(S, 'prop', u * 0.12, (h - 0.08) / 2, t * (d / 2 - 0.02), 0.05, h - 0.06, 0.05, 0x8a6a46, 0, 0, u * 0.28);
  }
  for (let i = 0; i < 3; i++) K.box(M, 'prop', 0, h - 0.01, -d / 2 + d / 6 + (i * d) / 3, w, 0.03, d / 3 - 0.01, i === 1 ? 0xa08460 : 0x96785a, (i - 1) * 0.008);
  K.solid(M, -w / 2, 0, -d / 2, w / 2, h, d / 2);
  return up(M, h + 0.005);
}

// ---------------------------------------------------------------- power
// the portable generator (breakable: it blows up); its hum, LEDs and the panel
function generator(K, M, big = true) {
  const s = big ? 1 : 0.7, w = 1.5 * s, h = 1.0 * s, d = 0.85 * s;
  K.begin('generator', M, -w / 2 - 0.05, 0, -d / 2 - 0.05, w / 2 + 0.05, h + 0.12, d / 2 + 0.05, { solid: true });
  // the frame: a roll cage of tubes
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(M, 'metal', sx * w / 2, h / 2, sz * d / 2, 0.05, h, 0.05, 0x2a2d33);
  for (const sz of [-1, 1]) K.box(M, 'metal', 0, h, sz * d / 2, w, 0.05, 0.05, 0x2a2d33);
  for (const sx of [-1, 1]) K.box(M, 'metal', sx * w / 2, h, 0, 0.05, 0.05, d, 0x2a2d33);
  K.box(M, 'metal', 0, 0.06, 0, w + 0.06, 0.08, d + 0.06, 0x2a2d33);
  // engine block, alternator, fuel tank, muffler, exhaust
  K.box(M, 'prop', -w * 0.18, 0.4 * s, 0, w * 0.48, 0.55 * s, d * 0.7, 0x3a3f48);
  K.cyl(M, 'metal', w * 0.22, 0.38 * s, 0, 0.22 * s, w * 0.36, 0x6a707a, 0, 0, Math.PI / 2);
  K.box(M, 'prop', 0, h - 0.17 * s, 0, w * 0.8, 0.26 * s, d * 0.72, 0xd9a514);
  K.cyl(M, 'metal', -w * 0.25, h - 0.01, 0, 0.06, 0.05, 0x1c1e22);
  K.cyl(M, 'metal', w * 0.35, h * 0.55, -d * 0.4, 0.07, 0.4 * s, 0x5a5048, 0, 0, Math.PI / 2);
  K.cyl(M, 'metal', w * 0.55, h * 0.55 + 0.12, -d * 0.4, 0.035, 0.32, 0x4a4038, 0, 0, 0.6);
  // the panel: sockets, a meter, lights
  K.box(M, 'prop', w * 0.2, h * 0.45, d / 2 - 0.02, w * 0.42, h * 0.38, 0.04, 0x1c1e22);
  K.quad(M, 'print', w * 0.2, h * 0.5, d / 2 + 0.002, w * 0.38, w * 0.19, 0xffffff, P.genPanel);
  for (let i = 0; i < 3; i++) K.box(M, 'prop', w * 0.06 + i * 0.12, h * 0.33, d / 2 + 0.01, 0.07, 0.07, 0.02, 0x3a3f48);
  K.led(M, w * 0.36, h * 0.6, d / 2 + 0.005, 0x4dff7a, 'on', 0.025);
  K.led(M, w * 0.41, h * 0.6, d / 2 + 0.005, 0xffb43a, 'pulse', 0.025);
  K.led(M, w * 0.36, h * 0.53, d / 2 + 0.005, 0xff4a4a, 'slow', 0.02);
  // wheels and a handle (it was dragged in)
  for (const sz of [-1, 1]) K.cyl(M, 'prop', -w / 2 - 0.02, 0.13, sz * d * 0.4, 0.13, 0.08, 0x111214, 0, 0, Math.PI / 2);
  K.box(M, 'metal', w / 2 + 0.25, h * 0.85, 0, 0.04, 0.04, d * 0.8, 0x2a2d33);
  for (const sz of [-1, 1]) K.box(M, 'metal', w / 2 + 0.13, h * 0.85, sz * d * 0.4, 0.26, 0.04, 0.04, 0x2a2d33);
  K.hum(M, 0, 0.5, 0, 'engine_hum', big ? 0.32 : 0.22, 20);
  K.beep(M, w * 0.3, h * 0.6, d / 2, 'tick', [3, 7]);
  const id = K.bid;
  const c = new THREE.Vector3().applyMatrix4(M);
  K.after(id, () => floorDecal(K, c.x, c.z, 3.4, 3.4, D.blob, 0, 0x333333, FLOOR + 0.0095));
  K.end();
  return id;
}
// a power distribution box on its little stand: breakable, LEDs; plugs are fed from it
function distBox(K, M) {
  K.begin('equipment', M, -0.32, 0, -0.2, 0.32, 0.62, 0.2);
  K.box(M, 'metal', 0, 0.12, 0, 0.5, 0.24, 0.3, 0x2a2d33);
  K.box(M, 'prop', 0, 0.42, 0, 0.6, 0.36, 0.3, 0xd9a514);
  K.quad(M, 'print', 0, 0.42, 0.152, 0.5, 0.06, 0xffffff, P.hazard);
  for (let i = 0; i < 4; i++) K.box(M, 'prop', -0.2 + i * 0.13, 0.32, 0.155, 0.08, 0.08, 0.02, 0x1c1e22);
  for (let i = 0; i < 4; i++) K.led(M, -0.2 + i * 0.13, 0.52, 0.153, i === 2 ? 0xffb43a : 0x4dff7a, i === 2 ? 'blink' : 'on', 0.018);
  K.end();
}
// a cable reel (a wooden spool standing on its rims), the drum wound with `color`
function reel(K, M, r = 0.5, w = 0.45, color = 0x18191c) {
  for (const s of [-1, 1]) K.cyl(M, 'prop', s * w / 2, r, 0, r, 0.04, 0x8a6a46, 0, 0, Math.PI / 2);
  K.cyl(M, 'cable', 0, r, 0, r * 0.72, w - 0.04, color, 0, 0, Math.PI / 2);
  K.cyl(M, 'prop', 0, r, 0, r * 0.2, w + 0.06, 0x6a5038, 0, 0, Math.PI / 2);
  K.solid(M, -w / 2 - 0.02, 0, -r * 0.8, w / 2 + 0.02, r * 1.6, r * 0.8);
}
// a coil of spare cable lying flat
function coil(K, x, z, r, color, n = 4) {
  for (let i = 0; i < n; i++) K.add('cable', TORUS, T(x + i * 0.03, FLOOR + 0.02 + i * 0.035, z + i * 0.02, i * 0.4, Math.PI / 2, 0, r * (1 - i * 0.04)), color);
}
let TORUS = null;
// a fuel can
function fuelCan(K, M, color = 0xb02a22) {
  K.box(M, 'prop', 0, 0.2, 0, 0.3, 0.4, 0.17, color);
  K.box(M, 'prop', 0, 0.42, 0.02, 0.18, 0.04, 0.05, color);
  K.cyl(M, 'prop', 0.1, 0.44, 0, 0.025, 0.06, 0x1c1e22);
}

// ---------------------------------------------------------------- instruments
// a sensor on a tripod aimed at the reactor (breakable: it topples); `h` its head height
const TRIPODS = [];
function tripod(K, x, z, h = 1.45, head = 0) {
  TRIPODS.push([x, z]);
  const yaw = Math.atan2(0 - x, PZ - z), dist = Math.hypot(x, z - PZ), pitch = Math.atan2(25.5 - (FLOOR + h), dist);
  const M = at(x, z, yaw);
  K.begin('tripod', M, -0.45, 0, -0.45, 0.45, h + 0.3, 0.45);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    K.box(M, 'metal', Math.sin(a) * 0.22, h * 0.42, Math.cos(a) * 0.22, 0.025, h * 0.88, 0.025, COL.black, a, 0.3);
  }
  K.cyl(M, 'metal', 0, h * 0.85, 0, 0.022, h * 0.3, COL.alu);
  const H = mul(M, T(0, h, 0, 0, -pitch));
  if (head === 0) {
    // a boxy sensor with a lens
    K.box(H, 'prop', 0, 0.08, 0, 0.18, 0.16, 0.3, 0xd8dde3);
    K.cyl(H, 'metal', 0, 0.08, 0.18, 0.06, 0.08, COL.black, 0, Math.PI / 2);
    K.quad(H, 'lamp', 0, 0.08, 0.221, 0.08, 0.08, 0x9bf6ff);
  } else if (head === 1) {
    // a little dish
    K.box(H, 'prop', 0, 0.06, -0.05, 0.14, 0.12, 0.16, 0x3a3f48);
    K.add('metal', CONE, mul(H, T(0, 0.12, 0.08, 0, Math.PI / 2, 0, 0.22, 0.1, 0.22)), 0xd8dde3);
    K.cyl(H, 'metal', 0, 0.12, 0.16, 0.012, 0.16, COL.black, 0, Math.PI / 2);
  } else {
    // a camera with a long lens
    K.box(H, 'prop', 0, 0.08, -0.04, 0.14, 0.13, 0.2, 0x1c1e22);
    K.cyl(H, 'metal', 0, 0.08, 0.16, 0.05, 0.24, 0x2a2d33, 0, Math.PI / 2);
    K.led(H, 0.05, 0.16, 0.02, 0xff3030, 'beat', 0.016);
  }
  K.led(H, 0.07, 0.03, -0.12, 0x4dff7a, 'blink', 0.016);
  K.led(H, -0.07, 0.03, -0.12, 0x4aa8ff, 'fast', 0.014);
  K.beep(H, 0, 0.1, 0, 'servo', [6, 14]);
  const id = K.bid;
  // toppled: lying on the floor, the head away from the reactor
  K.after(id, () => {
    const F = mul(at(x, z, yaw + 0.4), T(0, 0.05, 0, 0, Math.PI / 2 - 0.08));
    for (let i = 0; i < 3; i++) K.box(F, 'metal', (i - 1) * 0.08, -h * 0.45, 0.02 * i, 0.025, h * 0.9, 0.025, COL.black, 0, 0, (i - 1) * 0.15);
    K.box(F, 'prop', 0, -h - 0.05, 0, 0.18, 0.16, 0.3, head === 0 ? 0xd8dde3 : 0x2a2d33, 0.3);
  });
  K.end();
  plug(null, M, 0, 0.1, 0);
  return id;
}
let CONE = null;
// a lattice mast with a dish at the top, aimed at the reactor; cables run up it (the "reactor sensors")
function mast(K, x, z, h = 7) {
  const yaw = Math.atan2(-x, PZ - z), M = at(x, z, yaw);
  const s = 0.3;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) K.box(M, 'metal', sx * s / 2, h / 2, sz * s / 2, 0.04, h, 0.04, 0xbfc4ca);
  for (let y = 0.4; y < h; y += 0.6) {
    K.box(M, 'metal', 0, y, s / 2, s, 0.02, 0.02, 0xbfc4ca, 0, 0, 0.5);
    K.box(M, 'metal', 0, y, -s / 2, s, 0.02, 0.02, 0xbfc4ca, 0, 0, -0.5);
    K.box(M, 'metal', s / 2, y + 0.3, 0, 0.02, 0.02, s, 0xbfc4ca, 0, 0.5);
    K.box(M, 'metal', -s / 2, y + 0.3, 0, 0.02, 0.02, s, 0xbfc4ca, 0, -0.5);
  }
  K.box(M, 'metal', 0, 0.05, 0, 0.9, 0.1, 0.9, 0x3a3f48); // ballast plate
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) K.box(M, 'prop', sx * 0.32, 0.2, sz * 0.32, 0.22, 0.2, 0.22, 0x6a6a64);
  const dist = Math.hypot(x, z - PZ), pitch = Math.atan2(25.5 - (FLOOR + h), dist);
  const H = mul(M, T(0, h + 0.1, 0.1, 0, -pitch));
  K.begin('equipment', M, -0.6, h - 0.3, -0.5, 0.6, h + 0.9, 0.7);
  K.add('metal', CONE, mul(H, T(0, 0.3, 0.2, 0, Math.PI / 2, 0, 0.55, 0.2, 0.55)), 0xe3e6ea);
  K.cyl(H, 'metal', 0, 0.3, 0.45, 0.02, 0.5, COL.black, 0, Math.PI / 2);
  K.box(H, 'prop', 0, 0.3, -0.05, 0.3, 0.3, 0.25, 0x3a3f48);
  K.led(H, 0.12, 0.42, -0.18, 0xff3030, 'beat', 0.03);
  K.led(M, 0.18, h * 0.5, 0.16, 0xff3030, 'slow', 0.025);
  K.end();
  K.solid(M, -0.45, 0, -0.45, 0.45, 2.2, 0.45);
  return { top: new THREE.Vector3(0, h + 0.2, 0).applyMatrix4(M), base: new THREE.Vector3(0.2, 0, 0.2).applyMatrix4(M) };
}
// a sample fridge: glass door, racks of glowing vials, a temperature readout (breakable: the door bursts)
function fridge(K, M) {
  const w = 0.62, h = 1.75, d = 0.62;
  K.begin('fridge', M, -w / 2, 0, -d / 2, w / 2, h, d / 2 + 0.03, { solid: true });
  K.box(M, 'prop', 0, h / 2, -0.02, w, h, d - 0.04, 0xe4e7ea);
  K.box(M, 'prop', 0, h / 2 + 0.05, 0.02, w - 0.08, h - 0.3, d - 0.06, 0x23303a);
  for (let r = 0; r < 4; r++) {
    K.box(M, 'metal', 0, 0.35 + r * 0.33, 0.02, w - 0.1, 0.012, d - 0.1, 0x9aa2ac);
    for (let i = 0; i < 6; i++) K.cyl(M, 'lamp', -0.2 + i * 0.08, 0.4 + r * 0.33, 0.12 + (i % 2) * 0.06, 0.018, 0.08, VIAL[(i + r) % 4]);
  }
  K.box(M, 'glass', 0, h / 2 + 0.05, d / 2 - 0.01, w - 0.04, h - 0.25, 0.02, 0xffffff);
  K.box(M, 'metal', w / 2 - 0.06, h / 2 + 0.05, d / 2 + 0.015, 0.025, 0.5, 0.025, COL.alu);
  K.box(M, 'prop', 0, 0.1, d / 2 - 0.02, w, 0.2, 0.03, 0x9aa2ac);
  K.quad(M, 'screen', -0.12, h - 0.08, d / 2 - 0.008, 0.14, 0.07, 0xffffff, SC.bars);
  K.led(M, 0.12, h - 0.08, d / 2 - 0.002, 0x4aa8ff, 'on', 0.02);
  K.led(M, 0.17, h - 0.08, d / 2 - 0.002, 0x4dff7a, 'slow', 0.02);
  K.beep(M, 0, h - 0.1, 0.3, 'combo', [8, 18]);
  K.end();
  plug(null, M, 0, 0.1, -d / 2);
}
// a laptop, open (breakable)
function laptop(K, M, cell = 'log', beep = null) {
  K.begin('monitor', M, -0.18, 0, -0.14, 0.18, 0.26, 0.13);
  K.box(M, 'prop', 0, 0.01, 0, 0.34, 0.02, 0.24, 0x2a2d33);
  K.quad(M, 'print', 0, 0.0205, 0.03, 0.3, 0.1, 0xffffff, P.keys, 0, -Math.PI / 2);
  const S = mul(M, T(0, 0.02, -0.12, 0, -0.32));
  K.box(S, 'prop', 0, 0.11, -0.005, 0.34, 0.22, 0.01, 0x2a2d33);
  K.quad(S, 'screen', 0, 0.115, 0.001, 0.3, 0.19, 0xffffff, SC[cell]);
  K.led(M, 0.14, 0.022, 0.1, 0x4dff7a, 'pulse', 0.01);
  if (beep) K.beep(M, 0, 0.1, 0, beep, [5, 14]);
  K.end();
}
// a field radio: dials, a handset on its cord, a whip antenna (breakable); it still squelches
function radio(K, M) {
  K.begin('equipment', M, -0.3, 0, -0.2, 0.3, 0.9, 0.2);
  K.box(M, 'prop', 0, 0.14, 0, 0.5, 0.28, 0.32, 0x4a5040);
  K.box(M, 'prop', 0, 0.2, 0.162, 0.44, 0.14, 0.01, 0x23262b);
  for (let i = 0; i < 4; i++) K.cyl(M, 'metal', -0.16 + i * 0.1, 0.09, 0.17, 0.022, 0.03, 0x1c1e22, 0, Math.PI / 2);
  K.quad(M, 'screen', -0.08, 0.21, 0.168, 0.18, 0.08, 0xffffff, SC.wave);
  K.led(M, 0.12, 0.24, 0.168, 0xff3030, 'fast', 0.016);
  K.led(M, 0.16, 0.24, 0.168, 0x4dff7a, 'on', 0.016);
  K.cyl(M, 'metal', 0.2, 0.6, -0.1, 0.008, 0.65, COL.black);
  K.box(M, 'prop', -0.32, 0.03, 0.1, 0.07, 0.05, 0.2, 0x1c1e22, 0.4); // the handset, off its hook
  K.beep(M, 0, 0.2, 0.1, 'radio', [7, 16]);
  K.end();
}
// a docking rack of four quadcopters charging (breakable: sparks out)
function droneRack(K, M) {
  K.begin('rack', M, -0.75, 0, -0.3, 0.75, 1.8, 0.3, { solid: true });
  for (const s of [-1, 1]) K.box(M, 'metal', s * 0.72, 0.9, 0, 0.04, 1.8, 0.5, 0x3a3f48);
  for (let r = 0; r < 3; r++) {
    K.box(M, 'metal', 0, 0.1 + r * 0.6, 0, 1.44, 0.03, 0.5, 0x4a5058);
    if (r === 2) continue;
    for (const s of [-1, 1]) {
      const D2 = mul(M, T(s * 0.35, 0.13 + r * 0.6, 0));
      K.box(D2, 'prop', 0, 0.05, 0, 0.16, 0.06, 0.16, 0xe6e8ea);
      for (let a = 0; a < 4; a++) {
        const ang = a * Math.PI / 2 + Math.PI / 4;
        K.box(D2, 'prop', Math.sin(ang) * 0.12, 0.06, Math.cos(ang) * 0.12, 0.02, 0.02, 0.18, 0xe6e8ea, ang);
        K.cyl(D2, 'prop', Math.sin(ang) * 0.2, 0.08, Math.cos(ang) * 0.2, 0.08, 0.005, 0x2a2d33);
      }
      K.led(D2, 0, 0.09, 0.085, a2(r, s) ? 0x4dff7a : 0xffb43a, 'pulse', 0.018);
    }
  }
  K.beep(M, 0, 0.8, 0.2, 'core', [9, 20]);
  K.end();
  plug(null, M, 0, 0.1, -0.25);
}
const a2 = (r, s) => (r + (s > 0 ? 1 : 0)) % 2 === 0;

// ---------------------------------------------------------------- shelter
// a pop-up canopy: four legs, a scissor frame, a peaked fabric roof with a valance (fabric: two colors)
function canopy(K, M, w, d, h, c1, c2) {
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    K.box(M, 'metal', sx * w / 2, h / 2, sz * d / 2, 0.04, h, 0.04, 0xbfc4ca);
    K.box(M, 'metal', sx * w / 2, 0.01, sz * d / 2, 0.14, 0.02, 0.14, 0x6a6f78);
  }
  for (const sz of [-1, 1]) for (const k of [-1, 1]) K.box(M, 'metal', 0, h - 0.18, sz * d / 2, Math.hypot(w, 0.3), 0.02, 0.02, 0x9aa1aa, 0, 0, k * 0.1);
  for (const sx of [-1, 1]) for (const k of [-1, 1]) K.box(M, 'metal', sx * w / 2, h - 0.18, 0, 0.02, 0.02, Math.hypot(d, 0.3), 0x9aa1aa, 0, k * 0.1);
  // the roof: four sloped panels up to a peak (each a triangle, both faces), a valance round the edge
  const peak = 0.55, c = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
  for (let i = 0; i < 4; i++) {
    const [ax, az] = c[i], [bx, bz] = c[(i + 1) % 4];
    const A = new THREE.Vector3(ax, h, az), Bv = new THREE.Vector3(bx, h, bz), C = new THREE.Vector3(0, h + peak, 0);
    const n = new THREE.Vector3().crossVectors(Bv.clone().sub(A), C.clone().sub(A)).normalize();
    const pos = [...A.toArray(), ...Bv.toArray(), ...C.toArray(), ...A.toArray(), ...C.toArray(), ...Bv.toArray()];
    const nor = [];
    for (let k = 0; k < 6; k++) nor.push(...(k < 3 ? n.toArray() : n.clone().negate().toArray()));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(12), 2));
    K.add('prop', g, M, i % 2 ? c1 : c2);
    const mx = (ax + bx) / 2, mz = (az + bz) / 2, along = i % 2 === 0;
    K.box(M, 'prop', mx, h - 0.1, mz, along ? w + 0.02 : 0.012, 0.22, along ? 0.012 : d + 0.02, i % 2 ? c2 : c1);
  }
  for (const [sx, sz] of [[-1, -1], [1, 1]]) K.solid(M, sx * w / 2 - 0.05, 0, sz * d / 2 - 0.05, sx * w / 2 + 0.05, h, sz * d / 2 + 0.05);
  for (const [sx, sz] of [[1, -1], [-1, 1]]) K.solid(M, sx * w / 2 - 0.05, 0, sz * d / 2 - 0.05, sx * w / 2 + 0.05, h, sz * d / 2 + 0.05);
}
// an A-frame tent, its door flap tied back (the front, +z)
function tent(K, M, w, d, h, color) {
  const half = w / 2, len = Math.hypot(half, h), ang = Math.atan2(h, half);
  for (const s of [-1, 1]) K.box(M, 'prop', s * half / 2, h / 2, 0, len, 0.025, d, color, 0, 0, s * -ang);
  const tri = (z, flip, c) => {
    for (const f of [0, Math.PI]) K.add('prop', geos().tri, mul(M, T(0, 0, z, f + (flip ? Math.PI : 0), 0, 0, w, h, 1)), c);
  };
  tri(-d / 2, false, tint(color, 0.85));
  // the front: two flaps, one rolled back
  K.add('prop', geos().tri, mul(M, T(-half / 2, 0, d / 2, 0, 0, 0, half, h, 1)), tint(color, 0.85));
  K.add('prop', geos().tri, mul(M, T(-half / 2, 0, d / 2, Math.PI, 0, 0, half, h, 1)), tint(color, 0.85));
  K.cyl(M, 'prop', half * 0.55, h * 0.45, d / 2 + 0.05, 0.08, h * 0.9, tint(color, 0.7), 0, 0, -0.45);
  K.box(M, 'metal', 0, h, 0, 0.03, 0.03, d + 0.2, 0x6a6f78);
  K.box(M, 'prop', 0, 0.01, 0, w - 0.1, 0.012, d - 0.05, 0x3a3a34); // groundsheet
  for (const s of [-1, 1]) K.solid(M, s * half * 0.75 - 0.25, 0, -d / 2, s * half * 0.75 + 0.25, h * 0.45, d / 2);
  K.solid(M, -0.2, 0, -d / 2, 0.2, h * 0.9, -d / 2 + 0.3);
}
// a camp cot with a sleeping bag, rumpled
function cot(K, M, bag = 0x3b5a7a) {
  K.box(M, 'prop', 0, 0.42, 0, 0.72, 0.03, 1.9, 0x3e4a3a);
  for (const s of [-1, 1]) K.box(M, 'metal', s * 0.37, 0.42, 0, 0.03, 0.03, 1.9, 0x6a6f78);
  for (const z of [-0.8, 0, 0.8]) for (const k of [-1, 1]) K.box(M, 'metal', 0, 0.21, z, 0.03, 0.46, 0.03, 0x6a6f78, 0, 0, k * 0.85);
  K.box(M, 'prop', 0.02, 0.5, 0.15, 0.64, 0.12, 1.3, bag, 0.04);
  K.box(M, 'prop', -0.05, 0.53, -0.4, 0.6, 0.1, 0.5, tint(bag, 0.8), -0.15, 0.1); // turned back
  K.box(M, 'prop', 0, 0.5, -0.78, 0.45, 0.1, 0.28, 0xd8d4c8, 0.1); // pillow
  K.solid(M, -0.38, 0, -0.95, 0.38, 0.45, 0.95);
}
function duffel(K, M, color = 0x2f4a3a) {
  K.cyl(M, 'prop', 0, 0.16, 0, 0.16, 0.6, color, 0, 0, Math.PI / 2);
  K.box(M, 'prop', 0, 0.33, 0, 0.3, 0.02, 0.05, 0x1c1e22);
}
function lantern(K, M, on = true) {
  K.begin('equipment', M, -0.09, 0, -0.09, 0.09, 0.3, 0.09);
  K.cyl(M, 'metal', 0, 0.02, 0, 0.08, 0.04, 0x2a2d33);
  K.cyl(M, on ? 'lamp' : 'prop', 0, 0.13, 0, 0.06, 0.18, on ? 0xfff1c8 : 0x8a8a80);
  K.cyl(M, 'metal', 0, 0.24, 0, 0.07, 0.04, 0x2a2d33);
  K.box(M, 'metal', 0, 0.3, 0, 0.1, 0.01, 0.01, 0x2a2d33);
  K.end();
}
// a whiteboard on a T-frame with castors, built at the origin (front +z): the wheelie kind for each board
function wheeledBoard(K, uv) {
  const M = I, w = 1.5, h = 0.95, y = 1.32;
  K.box(M, 'metal', 0, y, 0.015, w + 0.06, h + 0.06, 0.03, COL.alu);
  K.quad(M, 'print', 0, y, 0.031, w, h, 0xffffff, uv);
  K.quad(M, 'prop', 0, y, -0.001, w, h, 0xd8dde3, null, Math.PI);
  K.box(M, 'metal', 0, y - h / 2 - 0.04, 0.06, w * 0.6, 0.025, 0.07, COL.alu);
  [0xd23b3b, 0x2f62c8, 0x23262e].forEach((c, i) => K.cyl(M, 'prop', -0.3 + i * 0.16, y - h / 2 - 0.016, 0.065, 0.011, 0.12, c, 0, 0, Math.PI / 2));
  for (const s of [-1, 1]) {
    K.box(M, 'metal', s * (w / 2 + 0.04), 0.9, 0, 0.04, 1.7, 0.04, 0x9aa1aa);
    K.box(M, 'metal', s * (w / 2 + 0.04), 0.06, 0, 0.05, 0.04, 0.6, 0x9aa1aa);
    for (const t of [-1, 1]) K.cyl(M, 'prop', s * (w / 2 + 0.04), 0.03, t * 0.27, 0.03, 0.025, COL.black, 0, 0, Math.PI / 2);
  }
  K.box(M, 'metal', 0, 0.3, 0, w + 0.08, 0.03, 0.03, 0x9aa1aa);
}
// a trolley: two shelves on castors (a wheelie kind), with a toolbox and a coil of cable aboard
function cart(K, M = I) {
  const w = 0.9, d = 0.55;
  for (const y of [0.25, 0.85]) K.box(M, 'metal', 0, y, 0, w, 0.03, d, 0x5a616a);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    K.box(M, 'metal', sx * (w / 2 - 0.02), 0.5, sz * (d / 2 - 0.02), 0.03, 0.85, 0.03, 0x9aa1aa);
    K.cyl(M, 'prop', sx * (w / 2 - 0.04), 0.04, sz * (d / 2 - 0.04), 0.04, 0.03, COL.black, 0, 0, Math.PI / 2);
  }
  K.box(M, 'metal', w / 2 + 0.06, 0.95, 0, 0.03, 0.03, d - 0.05, 0x9aa1aa);
  K.box(M, 'prop', -0.15, 0.97, 0, 0.42, 0.2, 0.22, 0xb02a22);
  K.box(M, 'metal', -0.15, 1.08, 0, 0.3, 0.02, 0.02, 0x1c1e22);
  K.cyl(M, 'cable', 0.22, 0.32, 0, 0.17, 0.1, 0xd8641e);
  K.box(M, 'prop', 0.25, 0.92, 0.05, 0.25, 0.1, 0.3, 0x2a2d33);
}
// a bare pole (banner, string lights) on a weighted foot
function pole(K, x, z, h) {
  K.cyl(I, 'metal', x, FLOOR + h / 2, z, 0.025, h, 0xbfc4ca);
  K.cyl(I, 'prop', x, FLOOR + 0.06, z, 0.22, 0.12, 0x3a3f48);
  K.solid(I, x - 0.12, FLOOR, z - 0.12, x + 0.12, FLOOR + h, z + 0.12);
}

// ---------------------------------------------------------------- cables
// A cable through points [x, z] (on the floor) or [x, y, z]: a Catmull-Rom tube that hugs the floor, wanders a
// little between the points and now and then throws a loop. Non-solid. r: radius.
function cable(K, pts, r, color, rnd, { wander = 0.22, loops = true } = {}) {
  const P3 = pts.map((p) => (p.length === 2 ? new THREE.Vector3(p[0], FLOOR + r, p[1]) : new THREE.Vector3(p[0], p[1], p[2])));
  const out = [P3[0]];
  for (let i = 1; i < P3.length; i++) {
    const a = P3[i - 1], b = P3[i], L = a.distanceTo(b), n = Math.floor(L / 1.3);
    const onFloor = a.y < FLOOR + 0.2 && b.y < FLOOR + 0.2;
    for (let k = 1; k <= n; k++) {
      const p = a.clone().lerp(b, k / (n + 1));
      if (onFloor) {
        const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1, o = (rnd() - 0.5) * 2 * wander;
        p.x += (-dz / l) * o;
        p.z += (dx / l) * o;
        // a loop: round and back over itself
        if (loops && rnd() < 0.12 && L > 3) {
          const lr = 0.18 + rnd() * 0.15, side = rnd() < 0.5 ? -1 : 1;
          const t = new THREE.Vector3(dx / l, 0, dz / l), nn = new THREE.Vector3((-dz / l) * side, 0, (dx / l) * side);
          for (let j = 0; j < 6; j++) {
            const ang = (j / 6) * Math.PI * 2;
            out.push(p.clone().addScaledVector(t, Math.sin(ang) * lr).addScaledVector(nn, (1 - Math.cos(ang)) * lr).setY(FLOOR + r + (j === 3 ? r * 2 : j > 1 && j < 5 ? r : 0)));
          }
        }
      }
      out.push(p);
    }
    out.push(b);
  }
  const curve = new THREE.CatmullRomCurve3(out, false, 'catmullrom', 0.4);
  const len = curve.getLength();
  K.add('cable', strip(new THREE.TubeGeometry(curve, Math.max(4, Math.ceil(len * 5)), r, 5, false)), I, color);
}
// a cable hanging between two points (a catenary-ish sag)
function sag(K, a, b, s, r, color) {
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    pts.push(new THREE.Vector3(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - s * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  K.add('cable', strip(new THREE.TubeGeometry(curve, 24, r, 4, false)), I, color);
  return curve;
}
// a cable protector across a lane: a low yellow-and-black ramp along the cable (walk straight over it)
function bridge(K, x, z, ry, len) {
  const M = at(x, z, ry);
  K.box(M, 'prop', 0, 0.03, 0, 0.42, 0.06, len, 0xd9b11c);
  for (const s of [-1, 1]) K.box(M, 'prop', s * 0.25, 0.015, 0, 0.1, 0.03, len, 0x1d1d1f, 0, 0, s * 0.25);
  for (let k = -len / 2 + 0.3; k < len / 2; k += 0.9) K.quad(M, 'print', 0, 0.061, k, 0.38, 0.12, 0xffffff, P.hazard, Math.PI / 2, -Math.PI / 2);
}
// string lights between points (some bulbs dead)
function lights(K, a, b, s, rnd) {
  const curve = sag(K, a, b, s, 0.006, 0x1c1e22);
  const n = Math.round(curve.getLength() / 0.45);
  for (let i = 1; i < n; i++) {
    const p = curve.getPoint(i / n), on = rnd() > 0.25;
    K.sph(I, on ? 'flickA' : 'prop', p.x, p.y - 0.06, p.z, 0.035, on ? [0xffd9a0, 0xffb0b0, 0xb0d0ff, 0xc0ffc0][i % 4] : 0x6a6a64, 1.3);
  }
}

// ---------------------------------------------------------------- the islands
// COMMONS (south-west, by the red door): the day-1 party under its banner, the kitchen table, cots under a canopy,
// the DAY 1 whiteboard on wheels. Log 01 hovers at (-9.4, -102.1); the floor east of it is left open for her.
function campCommons(K, W, rnd) {
  // the party table, the banner strung from a pole to a crate stack over it
  const tbl = at(-11.0, -103.4, -0.22);
  deskTop(K, tbl, 1.8, 0.75, { top: 0xe9e6dd, frame: 0x8a9099 });
  K.box(tbl, 'prop', 0, 0.735, 0.0, 1.8, 0.005, 0.76, 0xf2f2f2);
  K.box(tbl, 'prop', 0, 0.62, 0.38, 1.8, 0.24, 0.005, 0xf2f2f2);
  cake(K, mul(tbl, T(-0.35, 0.74, -0.05)));
  for (let i = 0; i < 7; i++) cupR(K, mul(tbl, T(0.35 + (i % 4) * 0.1, 0.74, -0.2 + Math.floor(i / 4) * 0.12)), i % 3 ? 0xc8323c : 0x2f62c8);
  hat(K, mul(tbl, T(-0.75, 0.74, 0.2)), 0x2f62c8);
  K.add('prop', geos().cup, T(-10.1, FLOOR + 0.045, -102.4, 1.2, 0, Math.PI / 2, 0.045, 0.12, 0.045), 0xc8323c);
  K.add('prop', geos().cup, T(-12.4, FLOOR + 0.045, -104.6, -0.7, 0, Math.PI / 2, 0.045, 0.12, 0.045), 0x2f62c8);
  hat(K, T(-12.3, FLOOR + 0.06, -102.6, 0, 0, 1.7), 0xd9a514);
  hat(K, T(-10.2, FLOOR + 0.06, -104.7, 0, 1.6, 0.3), 0xd23b3b);
  for (const [bx, bz, c] of [[-12.2, -103.9, 0xd23b3b], [-11.9, -104.25, 0x2f9b4a], [-9.9, -103.0, 0xd9a514]]) {
    K.sph(I, 'prop', bx, FLOOR + 0.13, bz, 0.19, c, 0.68, 1.12, rnd());
    K.aabb('prop', bx - 0.004, FLOOR + 0.15, bz - 0.004, bx + 0.004, FLOOR + 0.76, bz + 0.004, 0xeeeeee);
  }
  // the banner: tied to a pole at the north end (its tie has slipped) and a broom handle taped to a crate stack
  pile(K, -12.1, -100.95, 0.18, [{ k: 'crate', w: 0.8, h: 0.62, d: 0.7, c: WOOD[1], label: 1 }, { k: 'crate', w: 0.6, h: 0.5, d: 0.55, y: 0.62, ry: 0.3, c: WOOD[3], label: 2 }]);
  K.cyl(I, 'metal', -12.15, FLOOR + 1.85, -100.9, 0.02, 1.5, 0x9a7a52);
  pole(K, -12.6, -106.7, 2.6);
  const bpts = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    bpts.push([-12.15 - 0.45 * t, FLOOR + 2.55 - 0.95 * t - 0.4 * 4 * t * (1 - t), -100.95 - 5.65 * t]);
  }
  banner(K, bpts, 0.36, new THREE.Vector3(1, 0, 0));
  // string lights from the pole over to the canopy and back to the wall
  lights(K, [-12.6, FLOOR + 2.55, -106.7], [-14.6, FLOOR + 2.45, -105.4], 0.25, rnd);
  lights(K, [-12.15, FLOOR + 2.6, -100.9], [-15.2, FLOOR + 3.4, -100.05], 0.35, rnd);
  W.deco(-15.3, FLOOR + 3.3, -100.06, -15.1, FLOOR + 3.5, -100.0, 'metal', 'hub');
  // somebody sat against the crates with a cup, facing the heart
  skeleton(K, T(-12.15, FLOOR + 0.12, -101.75, 2.75), { waist: [-0.12, 0, 0.1], chest: [0.2, 0.1, 0], neck: [0.35, -0.4, 0.25], armL: [0.5, 0.3, 0], elbowL: 1.2, armR: [0.25, 0.1, 0], elbowR: 0.4, legL: [1.4, 0.25, 0], legR: [1.3, 0.05, 0], kneeL: 0.3, kneeR: 0.7 }, true);
  K.add('prop', geos().cup, T(-11.75, FLOOR + 0.04, -102.1, 0.3, 0, Math.PI / 2, 0.045, 0.12, 0.045), 0xc8323c);
  // the kitchen: a folding table with the kettle and the coffee, the water cooler knocked down
  const kt = foldingTable(K, at(-15.6, -101.2, 0.1), 1.7, 0.7);
  K.box(kt, 'prop', -0.55, 0.2, -0.05, 0.32, 0.4, 0.3, COL.black); // the coffee machine
  K.cyl(kt, 'prop', -0.55, 0.08, 0.08, 0.07, 0.14, 0x3a2414);
  K.cyl(kt, 'prop', 0.05, 0.11, 0.0, 0.09, 0.22, 0xd8dde3); // the kettle
  K.box(kt, 'prop', 0.05, 0.24, 0.0, 0.06, 0.04, 0.16, 0x1c1e22);
  for (let i = 0; i < 6; i++) mug(K, mul(kt, T(0.35 + (i % 3) * 0.11, 0, -0.15 + Math.floor(i / 3) * 0.13)), [0xd23b3b, 0xf2f2f2, 0x2f62c8, 0xd9a514, 0x2f9b4a, 0x6b4fa8][i]);
  K.box(kt, 'prop', -0.15, 0.05, 0.18, 0.4, 0.1, 0.28, 0xf0e2c4, 0.2); // pastries (DAY 1)
  K.box(kt, 'prop', -0.15, 0.1, 0.05, 0.4, 0.2, 0.01, 0xf0e2c4, 0.2, -0.5);
  plug('A', mul(kt, T(-0.55, -0.7, -0.3)));
  const wc = T(-17.4, FLOOR + 0.16, -102.0, 0.4, 0, Math.PI / 2);
  K.box(wc, 'prop', 0, 0.47, 0, 0.32, 0.95, 0.32, 0xaab0b6);
  K.add('prop', geos().cyl, T(-16.9, FLOOR + 0.13, -102.9, 0.9, 0, Math.PI / 2, 0.13, 0.36, 0.13), 0x6fb7d9);
  floorDecal(K, -16.8, -102.6, 1.6, 1.6, D.blob, 0.3, 0x6fa0c0);
  pile(K, -17.6, -100.6, -0.1, [{ k: 'box', w: 0.6, h: 0.4, d: 0.45, c: 0x4a7ab0 }, { k: 'box', w: 0.6, h: 0.4, d: 0.45, y: 0.4, ry: 0.2, c: 0x4a7ab0 }]);
  // sleeping: a blue canopy, three cots, bags, a lantern still on
  const cn = at(-16.0, -106.9, 0.12);
  canopy(K, cn, 3.0, 2.8, 2.35, 0x2f62c8, 0xdfe3e7);
  cot(K, mul(cn, T(-0.95, 0, 0.1, 0.08)), 0x3b5a7a);
  cot(K, mul(cn, T(0.05, 0, -0.2, -0.12)), 0x7a3b3b);
  cot(K, mul(cn, T(1.05, 0, 0.25, 0.05)), 0x3b6a4a);
  duffel(K, mul(cn, T(-0.5, 0, 1.25, 0.5)), 0x2f4a3a);
  duffel(K, mul(cn, T(0.6, 0, -1.25, -0.3)), 0x4a3a2f);
  lantern(K, mul(cn, T(0.55, 0, 1.15)), true);
  // supplies stacked by the field office
  pile(K, -18.3, -108.5, 0.35, [{ k: 'pallet' }, { k: 'box', w: 0.55, h: 0.42, d: 0.45, x: -0.28, y: 0.14, c: 0xb08a5c, label: 5 }, { k: 'box', w: 0.55, h: 0.42, d: 0.45, x: 0.3, y: 0.14, ry: 0.1, c: 0xa07a50 }, { k: 'box', w: 0.5, h: 0.38, d: 0.42, y: 0.56, ry: -0.2, c: 0xb08a5c, label: 2 }]);
  // the commons' power: a distribution box on a crate, fed from the yard's generator
  pile(K, -12.7, -108.0, 0.4, [{ k: 'crate', w: 0.7, h: 0.55, d: 0.6, c: WOOD[2] }]);
  distBox(K, at(-12.7, -108.0, 0.4, FLOOR + 0.55));
  wheelChair(K, -13.9, -104.9, 2.2);
  wheelChair(K, -9.6, -106.0, -0.6);
  // folding chairs knocked over
  for (const [x, z, ry] of [[-10.0, -104.8, 0.4], [-13.2, -102.4, 2.1]]) {
    const F = T(x, FLOOR + 0.22, z, ry, 0, Math.PI / 2);
    K.box(F, 'metal', 0, 0, 0, 0.42, 0.03, 0.4, 0x9aa1aa);
    K.box(F, 'metal', 0, 0.3, -0.2, 0.42, 0.4, 0.03, 0x9aa1aa);
  }
  strew(K, -18.5, -109.2, -8.8, -100.6, 60, rnd);
  strew(K, -8.6, -110.5, -3.6, -104.6, 14, rnd);
  streak(K, -14.6, -110.5, 4.2, 1.8);
}

// THE YARD (south-east): the generator, the tap on the red feed, cargo on pallets, flight cases, cable reels
function campYard(K, W, rnd) {
  // the tap: a thick orange cable down the wall from the feed's socket into a transformer box
  const tr = at(9.9, -100.62, 0);
  K.begin('equipment', tr, -0.42, 0, -0.27, 0.42, 1.0, 0.27, { solid: true });
  K.box(tr, 'metal', 0, 0.5, 0, 0.8, 1.0, 0.5, 0x5a616a);
  K.quad(tr, 'print', 0, 0.75, 0.252, 0.6, 0.15, 0xf1c232, P.stencil[4]);
  for (let i = 0; i < 5; i++) K.box(tr, 'metal', -0.3 + i * 0.15, 0.4, 0.255, 0.1, 0.5, 0.01, 0x4a5058);
  K.led(tr, 0.3, 0.92, 0.253, 0xff3030, 'slow', 0.025);
  K.led(tr, 0.24, 0.92, 0.253, 0x4dff7a, 'on', 0.025);
  K.beep(tr, 0, 0.8, 0.3, 'tick', [2, 4]);
  K.end();
  cable(K, [[9.0, 8.95, -100.38], [9.1, 7.5, -100.3], [9.3, 6.2, -100.3], [9.55, 5.1, -100.35], [9.7, 5.02, -100.55]], 0.05, 0xd8641e, rnd);
  for (let y = 5.6; y < 8.8; y += 0.9) K.box(I, 'metal', 9.0 + (8.95 - y) * -0.12, y, -100.33, 0.12, 0.05, 0.06, 0x9aa1aa);
  K.quad(I, 'print', 9.1, 6.6, -100.02, 0.5, 0.13, 0xf1c232, P.stencil[4], Math.PI);
  // the generator on its pallet, fuel cans, hazard stripes on the floor round it
  const gm = at(8.6, -107.0, 0.4);
  pallet(K, gm, 1.8, 1.2);
  generator(K, up(gm, 0.14), true);
  for (const [x, z, ry, c] of [[7.2, -105.9, 0.3, 0xb02a22], [7.5, -105.6, -0.2, 0xb02a22], [10.3, -108.3, 1.2, 0xd9a514]]) fuelCan(K, at(x, z, ry), c);
  for (const [x, z, ry] of [[8.6, -105.7, 0.4], [8.6, -108.3, 0.4]]) K.quad(at(x, z, ry, FLOOR + 0.007), 'print', 0, 0, 0, 2.4, 0.25, 0xffffff, P.hazard, 0, -Math.PI / 2);
  distBox(K, at(6.5, -105.0, -0.25));
  plug('B', at(6.5, -105.0, -0.25), 0, 0.1, -0.2);
  // cargo
  pile(K, 4.5, -103.2, 0.16, [{ k: 'crate', w: 0.9, h: 0.75, d: 0.8, x: -0.3, z: 0.1, c: WOOD[0], label: 1 }, { k: 'crate', w: 0.8, h: 0.7, d: 0.7, x: 0.55, z: -0.15, ry: -0.12, c: WOOD[2], label: 0 }, { k: 'crate', w: 0.75, h: 0.6, d: 0.7, x: -0.1, y: 0.75, ry: 0.25, c: WOOD[3], label: 7 }]);
  pile(K, 5.1, -107.8, 0.6, [{ k: 'open', w: 1.0, h: 0.62, d: 0.75, c: WOOD[1], label: 0 }]);
  K.box(at(5.85, -108.5, 1.4), 'prop', 0, 0.45, 0, 1.0, 0.04, 0.8, WOOD[1], 0, 0, 0.35); // its lid, leant on it
  pile(K, 10.9, -102.9, -0.25, [{ k: 'case', w: 0.9, h: 0.5, d: 0.6, c: CASES[0], label: 5 }, { k: 'case', w: 0.8, h: 0.45, d: 0.55, y: 0.5, ry: 0.2, c: CASES[2] }, { k: 'case', w: 0.6, h: 0.35, d: 0.45, y: 0.95, ry: -0.3, c: CASES[4], label: 0 }]);
  pile(K, 12.0, -108.9, -0.3, [{ k: 'pallet' }, { k: 'case', w: 1.0, h: 0.55, d: 0.7, y: 0.14, c: CASES[3], label: 1 }, { k: 'case', w: 0.7, h: 0.45, d: 0.5, y: 0.69, ry: 0.4, c: CASES[1], open: true, kit: (M) => sampleCase(K, mul(M, T(0, -0.05, 0.02, 0.1)), true, 2) }]);
  pile(K, 16.8, -108.55, 0.08, [{ k: 'pallet' }, { k: 'pallet', x: 1.15, ry: 0.05 }, { k: 'crate', w: 1.0, h: 0.8, d: 0.85, y: 0.14, c: WOOD[0], label: 3 }, { k: 'crate', w: 0.9, h: 0.7, d: 0.8, x: 1.15, y: 0.14, ry: -0.1, c: WOOD[2], label: 6 }, { k: 'crate', w: 0.85, h: 0.6, d: 0.75, x: 0.5, y: 0.94, ry: 0.15, c: WOOD[1], label: 1 }]);
  reel(K, at(13.5, -106.3, 0.9), 0.5, 0.45, 0x18191c);
  reel(K, at(11.0, -106.0, -0.4), 0.32, 0.3, 0xd8641e);
  coil(K, 6.4, -109.3, 0.35, 0x2a5fb0);
  // a pallet jack, left where it was
  const pj = at(7.0, -109.6, 1.15);
  for (const s of [-1, 1]) K.box(pj, 'metal', s * 0.25, 0.05, 0.3, 0.16, 0.06, 1.1, 0xb02a22);
  K.box(pj, 'metal', 0, 0.2, -0.3, 0.6, 0.3, 0.2, 0xb02a22);
  K.box(pj, 'metal', 0, 0.65, -0.55, 0.05, 0.9, 0.05, 0x1c1e22, 0, 0.5);
  strew(K, 3.6, -109.5, 14.2, -101.5, 24, rnd);
  streak(K, 7.0, -110.8, 4.0, 1.6);
}

// SENSORS (west of the dais, north of the west lift): lab benches pushed together, a sample fridge, tripods and a
// mast aimed at the heart, the Prism whiteboard on wheels
function campSensors(K, W, rnd) {
  canopy(K, at(-16.45, -127.55, -0.15), 3.7, 2.9, 2.4, 0x3b6a4a, 0xdfe3e7);
  const b1 = foldingTable(K, at(-17.5, -127.5, 0.2), 1.8, 0.75);
  microscope(K, mul(b1, T(-0.55, 0, 0.05, -0.4)));
  sampleCase(K, mul(b1, T(0.1, 0, 0.0, 0.3)), true, 3);
  laptop(K, mul(b1, T(0.65, 0, 0.1, -0.5)), 'graph', 'beep');
  plug('D', mul(b1, T(0, -0.7, -0.3)));
  const b2 = foldingTable(K, at(-15.5, -127.2, -0.38), 1.6, 0.7, 0xc8c4b8);
  spectrometer(K, mul(b2, T(-0.35, 0, 0.0, 0.15)));
  crt(K, mul(b2, T(0.45, 0, -0.05, -0.2)), 'spectrum');
  clipboard(K, mul(b2, T(0.15, 0, 0.25, 0.6)));
  stack(K, mul(b2, T(-0.05, 0, 0.22, -0.3)), 9, rnd);
  plug('D', mul(b2, T(0, -0.7, -0.3)));
  for (let i = 0; i < 5; i++) K.cyl(b2, 'lamp', -0.65 + (i % 3) * 0.08, 0.06, 0.2 + Math.floor(i / 3) * 0.08, 0.02, 0.12, VIAL[i % 4]);
  fridge(K, at(-18.9, -129.9, 0.3));
  pile(K, -14.6, -130.3, 0.4, [{ k: 'case', w: 0.8, h: 0.45, d: 0.55, c: CASES[2], label: 3 }, { k: 'case', w: 0.6, h: 0.4, d: 0.45, y: 0.45, ry: -0.35, c: CASES[0], open: true, kit: (M) => laptop(K, mul(M, T(0, -0.04, 0, 0.2)), 'feeds') }]);
  pile(K, -17.1, -131.3, -0.2, [{ k: 'crate', w: 0.7, h: 0.6, d: 0.6, c: WOOD[4], label: 3 }]);
  distBox(K, at(-16.4, -129.4, 0.5));
  wheelChair(K, -16.7, -128.7, 2.6);
  wheelChair(K, -14.6, -128.6, -2.4);
  // tripods at the island's edge, sensors on the heart, a cable slung between two of them
  tripod(K, -11.3, -126.9, 1.5, 0);
  tripod(K, -11.9, -129.4, 1.3, 1);
  tripod(K, -13.4, -126.5, 1.7, 2);
  sag(K, [-11.3, FLOOR + 1.45, -126.9], [-11.9, FLOOR + 1.25, -129.4], 0.5, 0.012, 0x18191c);
  sag(K, [-11.3, FLOOR + 1.45, -126.9], [-13.4, FLOOR + 1.65, -126.5], 0.45, 0.012, 0xd9b11c);
  // a cable thrown up to a clamp sensor on the dais's halo ring
  sag(K, [-11.3, FLOOR + 1.5, -126.9], [-6.3, FLOOR + 3.2, -126.0], 0.25, 0.014, 0xd8641e);
  K.box(I, 'metal', -6.32, FLOOR + 3.14, -126.0, 0.14, 0.12, 0.1, 0x3a3f48);
  const m = mast(K, -19.1, -126.9, 7.2);
  cable(K, [[m.base.x, m.base.z], [m.base.x, FLOOR + 1.5, m.base.z], [m.base.x, m.top.y - 0.4, m.base.z]], 0.018, 0x18191c, rnd);
  cable(K, [[m.base.x - 0.05, m.base.z + 0.05], [m.base.x - 0.05, m.top.y - 0.4, m.base.z + 0.05]], 0.014, 0xd9b11c, rnd);
  strew(K, -19.4, -131.5, -12.2, -126.2, 28, rnd);
}

// WORKSHOP (east of the dais, north of the east lift): a heavy bench with a drone in pieces, the drone charging
// rack, a barricade of cases, and the contractor who was meant to keep them safe
function campWorkshop(K, W, rnd) {
  const wb = at(17.3, -127.3, -0.15);
  deskTop(K, wb, 2.0, 0.8, { h: 0.9, top: 0x5a4a3c, frame: 0x2a2d33 });
  const top = up(wb, 0.9);
  // a drone in pieces: the body, arms, a rotor, a battery, the soldering station
  K.box(top, 'prop', -0.4, 0.05, 0.05, 0.22, 0.08, 0.22, 0xe6e8ea, 0.3);
  for (let i = 0; i < 3; i++) K.box(top, 'prop', 0.1 + i * 0.12, 0.012, 0.15 - i * 0.05, 0.02, 0.02, 0.2, 0xe6e8ea, i * 0.9);
  K.cyl(top, 'prop', 0.45, 0.005, 0.2, 0.09, 0.006, 0x2a2d33);
  K.box(top, 'prop', -0.1, 0.03, -0.22, 0.16, 0.05, 0.08, 0x2a5fb0);
  K.begin('equipment', top, 0.45, 0, -0.3, 0.85, 0.2, -0.05);
  K.box(top, 'prop', 0.65, 0.06, -0.18, 0.24, 0.12, 0.16, 0x3a3f48);
  K.quad(top, 'screen', 0.65, 0.07, -0.098, 0.12, 0.06, 0xffffff, SC.bars);
  K.led(top, 0.75, 0.1, -0.098, 0xff3030, 'on', 0.016);
  K.end();
  deskLamp(K, mul(top, T(-0.8, 0, -0.25, 0.6)), true);
  plug('H', mul(wb, T(0, 0.1, -0.35)));
  wheelChair(K, 16.9, -128.4, 0.2);
  droneRack(K, at(19.2, -130.0, -0.55));
  pile(K, 15.9, -131.6, 0.3, [{ k: 'crate', w: 0.8, h: 0.7, d: 0.7, c: WOOD[2], label: 6 }, { k: 'case', w: 0.6, h: 0.4, d: 0.45, y: 0.7, ry: -0.4, c: CASES[1] }]);
  distBox(K, at(15.1, -128.1, -0.4));
  // the barricade: cases and crates dragged into a low wall facing the heart
  pile(K, 12.75, -128.6, 0.12, [
    { k: 'case', w: 1.0, h: 0.6, d: 0.6, z: -1.0, ry: 1.57, c: CASES[0], label: 5 },
    { k: 'crate', w: 0.9, h: 0.7, d: 0.65, z: 0.05, ry: 1.5, c: WOOD[0], label: 1 },
    { k: 'case', w: 0.8, h: 0.5, d: 0.55, z: 1.0, ry: 1.7, c: CASES[2] },
    { k: 'case', w: 0.7, h: 0.35, d: 0.45, y: 0.7, z: 0.1, ry: 1.3, c: CASES[4] },
  ]);
  // the contractor: sat back against it facing the heart, mid-reload, the rifle down beside him
  const merc = T(12.0, FLOOR + 0.12, -128.45, -Math.PI / 2 + 0.15);
  skeleton(K, merc, { waist: [-0.1, 0, -0.05], chest: [0.15, -0.1, 0.05], neck: [0.6, 0.3, -0.35], armL: [0.7, 0.35, 0], elbowL: 1.5, armR: [0.4, -0.2, 0], elbowR: 0.9, legL: [1.4, 0.3, 0], legR: [1.05, -0.05, 0], kneeL: 0.5, kneeR: 1.3 }, 'merc');
  rifle(K, T(11.1, FLOOR + 0.05, -129.6, 0.6, Math.PI / 2, 0));
  K.box(T(11.75, FLOOR + 0.32, -128.1, 0.4, 0.2, 0.9), 'prop', 0, 0, 0, 0.06, 0.16, 0.035, 0x2a2d31); // the magazine in his hand
  for (let i = 0; i < 9; i++) K.cyl(I, 'metal', 11.0 + rnd() * 1.2, FLOOR + 0.008, -127.5 - rnd() * 2.2, 0.006, 0.03, 0xc9a24a, rnd() * 6, 0, Math.PI / 2);
  K.box(T(10.95, FLOOR + 0.02, -127.6, 0.9), 'prop', 0, 0, 0, 0.06, 0.03, 0.16, 0x2a2d31); // a spent magazine
  // sensors on this side too, and a cable up to the halo ring
  tripod(K, 11.4, -126.4, 1.45, 2);
  tripod(K, 13.3, -126.2, 1.6, 0);
  sag(K, [11.4, FLOOR + 1.45, -126.4], [6.3, FLOOR + 3.2, -126.0], 0.25, 0.014, 0x2a5fb0);
  K.box(I, 'metal', 6.32, FLOOR + 3.14, -126.0, 0.14, 0.12, 0.1, 0x3a3f48);
  const m = mast(K, 19.3, -127.0, 6.4);
  cable(K, [[m.base.x, m.base.z], [m.base.x, FLOOR + 1.5, m.base.z], [m.base.x, m.top.y - 0.4, m.base.z]], 0.018, 0x18191c, rnd);
  strew(K, 11.0, -131.6, 19.6, -126.2, 22, rnd);
}

// OPS (north of the dais): a canopy over a trestle of monitors, desks pushed together at odd angles (Wren's among
// them, empty), racks on wheels, the radio that was their link to her, a tent under the gallery
function campOps(K, W, rnd) {
  const cn = at(1.9, -138.5, -0.1);
  canopy(K, cn, 4.2, 3.4, 2.55, 0xd8641e, 0xe8e4dc);
  K.quad(cn, 'print', 0, 2.42, 1.71, 1.0, 0.25, 0xffffff, P.ops);
  // the trestle of monitors, screens facing the dais
  const tr = trestle(K, at(1.6, -137.3, 0.07), 3.4, 0.8);
  const mons = [[-1.4, 0, 'feeds', 0.2, 0], [-0.85, 0.12, 'graph', -0.1, 1], [-0.25, 0, 'heart', 0.05, 0], [0.35, 0.18, 'cam', -0.15, 1], [0.9, 0, 'alert', 0.15, 0], [1.4, 0.1, 'bars', -0.25, 1], [-0.55, 0.42, 'map', 0.1, 1], [0.6, 0.48, 'spectrum', -0.08, 1]];
  for (const [x, lift, cell, ry, flatOne] of mons) {
    const F = mul(tr, T(x, lift, -0.05, ry));
    if (lift > 0.3) K.box(mul(tr, T(x, 0, -0.1, ry)), 'prop', 0, lift / 2, 0, 0.45, lift, 0.32, lift > 0.4 ? CASES[2] : 0xb08a5c);
    else if (lift > 0) K.box(mul(tr, T(x, 0, -0.05, ry)), 'prop', 0, lift / 2, 0, 0.36, lift, 0.26, 0x6a6f78);
    if (flatOne) flat(K, F, cell, cell === 'cam' ? 'beep' : null);
    else crt(K, F, cell, 'screen', cell === 'heart' ? 'ecg' : cell === 'alert' ? 'alarm' : null);
  }
  for (let i = 0; i < 3; i++) keyboard(K, mul(tr, T(-1.0 + i * 0.95, 0, 0.25, (rnd() - 0.5) * 0.4)));
  mug(K, mul(tr, T(0.1, 0, 0.3)), 0xd9a514);
  plug('F', mul(tr, T(0, -0.78, -0.3)));
  plug('F', mul(tr, T(1.2, -0.78, -0.3)));
  // slumped across it, still in the chair
  chair(K, T(0.75, FLOOR, -136.35, Math.PI + 0.1));
  skeleton(K, T(0.75, FLOOR + 0.58, -136.37, Math.PI + 0.05), { waist: [0.5, 0, 0], chest: [0.55, 0, 0.05], neck: [0.35, 0.7, 0.3], armL: [1.4, -0.05, 0], elbowL: 0.5, armR: [1.3, 0.1, 0], elbowR: 1.2, legL: [1.5, 0.15, 0], legR: [1.5, 0.1, 0], kneeL: 1.5, kneeR: 1.6 }, true);
  wheelChair(K, 2.4, -135.8, Math.PI - 0.5);
  wheelChair(K, -0.6, -136.0, Math.PI + 0.6);
  // desks pushed together at odd angles; Wren's is the empty one with her plate and her login
  const d1 = at(-1.5, -140.7, 0.35);
  deskTop(K, d1, 1.6, 0.8);
  flat(K, mul(d1, T(-0.35, 0.74, -0.2, 0.2)), 'log');
  crt(K, mul(d1, T(0.4, 0.74, -0.1, -0.3)), 'prism');
  stack(K, mul(d1, T(0.1, 0.74, 0.2, 0.5)), 11, rnd);
  mug(K, mul(d1, T(-0.65, 0.74, 0.25)), 0x2f62c8);
  plug('F', mul(d1, T(0, 0.1, -0.35)));
  wheelChair(K, -1.3, -139.6, 0.4 + Math.PI);
  const d2 = at(0.4, -142.2, -0.28);
  deskTop(K, d2, 1.5, 0.75);
  crt(K, mul(d2, T(0.15, 0.74, -0.1)), 'login');
  keyboard(K, mul(d2, T(0.15, 0.74, 0.2)));
  K.quad(d2, 'print', -0.45, 0.745, 0.28, 0.3, 0.075, 0xffffff, P.plate[1], 0, -Math.PI / 2 + 0.3);
  K.quad(d2, 'print', -0.5, 0.742, -0.1, 0.1, 0.12, 0xffffff, P.photo, 0.2, -Math.PI / 2);
  for (let i = 0; i < 3; i++) K.box(d2, 'prop', 0.6, 0.755 + i * 0.012, 0.15, 0.12, 0.012, 0.04, [0xd9a514, 0x2f9b4a, 0xd23b3b][i], i * 0.3); // granola bars
  plug('F', mul(d2, T(0, 0.1, -0.33)));
  chair(K, T(0.53, FLOOR, -141.55, -0.28 + Math.PI)); // tucked in: she wasn't there
  const d3 = at(-2.6, -142.9, 1.25);
  deskTop(K, d3, 1.4, 0.7, { top: 0x8a6a4a });
  laptop(K, mul(d3, T(0.2, 0.74, 0, 0.3)), 'error', 'beep');
  stack(K, mul(d3, T(-0.3, 0.74, 0.1, -0.2)), 6, rnd);
  binder(K, mul(d3, T(-0.55, 0.74, -0.2, 0.3, 0, 0.15)), 0xd23b3b);
  // the radio: the link to Wren
  const rt = foldingTable(K, at(-1.9, -145.7, 0.18), 1.4, 0.65);
  radio(K, mul(rt, T(-0.2, 0, -0.05, 0.1)));
  clipboard(K, mul(rt, T(0.35, 0, 0.1, -0.4)));
  K.cyl(rt, 'prop', 0.45, 0.05, -0.15, 0.08, 0.1, 0x1c1e22); // headphones
  plug('F', mul(rt, T(0, -0.7, -0.3)));
  K.cyl(I, 'metal', -3.3, FLOOR + 3.0, -146.9, 0.025, 6.0, 0xbfc4ca);
  K.cyl(I, 'prop', -3.3, FLOOR + 0.08, -146.9, 0.25, 0.16, 0x3a3f48);
  K.box(I, 'metal', -3.3, FLOOR + 5.7, -146.9, 1.6, 0.02, 0.02, 0xbfc4ca);
  K.solid(I, -3.45, FLOOR, -147.05, -3.15, FLOOR + 3, -146.75);
  sag(K, [-3.3, FLOOR + 5.6, -146.9], [-2.0, FLOOR + 0.9, -145.8], 0.3, 0.01, 0x18191c);
  // racks on wheels, a second generator, a tent of stores
  const r1 = rack(K, at(5.6, -140.3, 0.25), 'rack', 1.75, true);
  rack(K, at(6.35, -141.55, -0.18), 'rack2', 1.6, true);
  rack(K, at(5.1, -142.6, 0.65), 'rack', 1.5, true);
  if (BR && r1) BR.hum(r1, 5.7, FLOOR + 1, -141.4, 'robot_idle_hum', 0.2, 16);
  plug('F', at(5.6, -140.3), 0, 0.1, -0.4);
  plug('F', at(6.35, -141.55), 0, 0.1, -0.4);
  plug('F', at(5.1, -142.6), 0, 0.1, -0.4);
  sag(K, [5.6, FLOOR + 1.9, -140.3], [3.9, FLOOR + 2.4, -139.9], 0.4, 0.014, 0x18191c);
  sag(K, [6.35, FLOOR + 1.75, -141.55], [3.9, FLOOR + 2.4, -137.2], 0.6, 0.012, 0x2a5fb0);
  generator(K, at(5.9, -146.3, -0.3), false);
  tent(K, at(1.9, -146.1, 0.06), 2.4, 2.8, 1.9, 0x5a6a4a);
  pile(K, 6.6, -144.0, -0.25, [{ k: 'crate', w: 0.8, h: 0.7, d: 0.7, c: WOOD[0], label: 7 }, { k: 'crate', w: 0.7, h: 0.55, d: 0.6, x: 0.1, y: 0.7, ry: 0.4, c: WOOD[3] }]);
  pile(K, -2.4, -137.6, 0.5, [{ k: 'case', w: 0.8, h: 0.5, d: 0.55, c: CASES[3], label: 1 }]);
  K.quad(I, 'print', 0.02, FLOOR + 1.2, -144.0, 0.42, 0.37, 0xffffff, P.tally, 0, 0, 0.05);
  K.quad(I, 'print', 3.55, FLOOR + 1.35, -144.62, 0.9, 0.56, 0xffffff, P.camp, 0.0, 0, -0.03);
  strew(K, -3.4, -147.4, 7.0, -135.0, 46, rnd);
  streak(K, 2.0, -134.2, 3.6, 1.6);
}

// overflow cargo and the small things between the lanes: crate stacks along the glass rooms, tripods on the
// wedges between the door lanes and the lift approaches, a wall socket on each side
function campEdges(K, W, rnd) {
  // west wedge and east wedge: tripods, a reel, a case
  tripod(K, -18.6, -118.6, 1.4, 1);
  tripod(K, -15.8, -119.6, 1.55, 0);
  reel(K, at(-20.3, -118.9, 0.7), 0.35, 0.32, 0xd9b11c);
  tripod(K, 18.4, -118.7, 1.5, 0);
  tripod(K, 15.6, -119.5, 1.35, 2);
  pile(K, 20.4, -118.8, -0.4, [{ k: 'case', w: 0.6, h: 0.45, d: 0.45, c: CASES[1], label: 4 }]);
  // wall sockets by the side doors, cables off to the wedges
  for (const s of [-1, 1]) {
    const x = s * 24.47;
    K.aabb('metal', x - 0.04, FLOOR + 0.35, -117.3, x + 0.04, FLOOR + 0.65, -116.8, 0x5a616a);
    K.led(I, x - s * 0.05, FLOOR + 0.6, -116.9, 0x4dff7a, 'on', 0.02);
  }
  // overflow cargo along the glass rooms and in the corners
  pile(K, -13.4, -141.0, 0.25, [{ k: 'crate', w: 0.9, h: 0.75, d: 0.8, c: WOOD[1], label: 7 }, { k: 'crate', w: 0.7, h: 0.6, d: 0.65, y: 0.75, ry: -0.3, c: WOOD[0] }]);
  pile(K, -13.6, -146.2, -0.15, [{ k: 'pallet' }, { k: 'case', w: 0.9, h: 0.5, d: 0.6, y: 0.14, c: CASES[0], label: 1 }, { k: 'case', w: 0.7, h: 0.45, d: 0.5, y: 0.64, ry: 0.3, c: CASES[2], label: 5 }]);
  pile(K, -22.3, -139.0, 0.2, [{ k: 'crate', w: 0.8, h: 0.6, d: 0.7, c: WOOD[3], label: 2 }, { k: 'box', w: 0.5, h: 0.35, d: 0.4, x: 0.6, ry: 0.5, c: 0xb08a5c }]);
  pile(K, 13.45, -137.0, -0.2, [{ k: 'crate', w: 0.9, h: 0.8, d: 0.8, c: WOOD[2], label: 3 }, { k: 'crate', w: 0.75, h: 0.6, d: 0.7, y: 0.8, ry: 0.35, c: WOOD[4], label: 0 }]);
  pile(K, 13.35, -140.6, 0.1, [{ k: 'pallet' }, { k: 'box', w: 0.5, h: 0.4, d: 0.45, x: -0.27, y: 0.14, c: 0xb08a5c, label: 5 }, { k: 'box', w: 0.5, h: 0.4, d: 0.45, x: 0.28, y: 0.14, ry: 0.1, c: 0xa07a50 }, { k: 'box', w: 0.5, h: 0.4, d: 0.45, y: 0.54, ry: -0.25, c: 0xb08a5c }]);
  pile(K, 13.5, -145.3, 0.3, [{ k: 'case', w: 0.8, h: 0.55, d: 0.6, c: CASES[4], label: 3 }]);
  pile(K, -22.6, -116.6, 0.15, [{ k: 'crate', w: 0.8, h: 0.6, d: 0.7, c: WOOD[0], label: 6 }]);
  pile(K, 22.7, -116.4, -0.2, [{ k: 'crate', w: 0.75, h: 0.55, d: 0.65, c: WOOD[2] }, { k: 'box', w: 0.45, h: 0.35, d: 0.4, y: 0.55, ry: 0.4, c: 0xb08a5c }]);
  coil(K, -21.6, -138.0, 0.3, 0x18191c);
  coil(K, 12.9, -142.6, 0.28, 0xd8641e, 3);
}

// the cables: trunks from the generators and wall sockets to each island's hub (over cable bridges where they
// cross a lane), then from each hub out to everything it powers, every which way
function campCables(K, W, rnd) {
  const R1 = 0.04, R2 = 0.022;
  // trunks
  cable(K, [[9.9, -101.0], [10.3, -102.0], [9.6, -104.6], [9.1, -106.1]], R1, 0xd8641e, rnd, { loops: false }); // tap → generator
  cable(K, [[7.9, -107.7], [6.0, -108.6], [3.4, -108.7], [0, -108.8], [-3.4, -108.5], [-6.5, -109.1], [-9.6, -108.3], [-12.3, -108.1]], R1, 0x18191c, rnd); // generator → commons
  cable(K, [[8.0, -107.5], [5.8, -108.3], [3.4, -108.45], [0, -108.5], [-3.4, -108.25], [-6.2, -108.6]], R2, 0xd9b11c, rnd); // a second run alongside
  bridge(K, 0, -108.6, Math.PI / 2, 6.2);
  cable(K, [[9.5, -107.8], [12.0, -109.9], [14.6, -110.6], [15.5, -112.5], [15.6, -116], [15.5, -119.5], [15.6, -123], [15.4, -126.0], [15.1, -127.8]], R1, 0x18191c, rnd); // generator → workshop
  bridge(K, 15.55, -115.7, 0, 5.4);
  bridge(K, 15.55, -122.9, 0, 5.4);
  cable(K, [[5.7, -145.8], [4.8, -144.6], [3.6, -143.4], [2.2, -141.8], [1.6, -140.4]], R1, 0x18191c, rnd); // second generator → ops
  cable(K, [[1.4, -140.2], [-1.0, -138.6], [-3.4, -138.2], [-6.7, -138.1], [-10.0, -138.2], [-12.0, -137.8], [-13.0, -136.0], [-13.0, -133.4], [-13.1, -131.2], [-15.0, -130.4], [-16.3, -129.6]], R1, 0x2a2c30, rnd); // ops → sensors
  bridge(K, -6.8, -138.15, Math.PI / 2, 5.6);
  bridge(K, -13.0, -133.4, 0, 4.6);
  cable(K, [[-24.4, FLOOR + 0.4, -117.0], [-24.2, -117.2], [-22.0, -117.9], [-19.8, -118.4], [-19.0, -120.0], [-19.0, -122.6], [-18.9, -125.4], [-17.5, -128.3], [-16.5, -129.3]], R2, 0xd9b11c, rnd); // west socket → sensors
  bridge(K, -19.0, -122.7, 0, 5.2);
  cable(K, [[24.4, FLOOR + 0.4, -116.9], [24.1, -117.1], [21.6, -117.7], [19.2, -118.5], [16.8, -119.4], [15.7, -119.6]], R2, 0x2a5fb0, rnd); // east socket → wedge
  cable(K, [[-24.4, FLOOR + 0.4, -117.1], [-23.0, -117.8], [-20.4, -118.6], [-18.6, -118.6], [-15.8, -119.6]], R2, 0x18191c, rnd);
  // from each hub out to what it powers
  const HUBS = { A: [-12.7, -108.0], B: [6.5, -105.0], D: [-16.4, -129.4], F: [1.5, -140.6], H: [15.1, -128.1] };
  for (const p of PLUGS) {
    let hub = p.hub;
    if (!hub) {
      // (the nearest hub that isn't across a lane)
      let best = 1e9;
      for (const [k, [hx, hz]] of Object.entries(HUBS)) {
        const d = Math.hypot(hx - p.x, hz - p.z);
        if (d < best) (best = d), (hub = k);
      }
      if (best > 7) continue;
    }
    const [hx, hz] = HUBS[hub];
    const L = Math.hypot(p.x - hx, p.z - hz);
    if (L < 0.3) continue;
    const mid = [hx + (p.x - hx) * 0.5 + (rnd() - 0.5) * L * 0.35, hz + (p.z - hz) * 0.5 + (rnd() - 0.5) * L * 0.35];
    const pts = [[hx + (rnd() - 0.5) * 0.3, hz + (rnd() - 0.5) * 0.3], mid, [p.x, p.z]];
    if (p.y > FLOOR + 0.25) pts.push([p.x, p.y, p.z]);
    cable(K, pts, 0.012 + rnd() * 0.012, CABLE[Math.floor(rnd() * CABLE.length)], rnd, { wander: 0.3 });
  }
  // spare runs going nowhere much (coiled ends, a taped join)
  for (const [x, z, l, a] of [[-6.2, -107.4, 2.4, 0.4], [4.2, -106.0, 2.0, 2.2], [-15.0, -125.9, 1.8, 0.1], [9.5, -127.8, 1.0, 1.3], [-3.0, -136.0, 2.0, 2.6], [7.0, -137.5, 2.4, -0.4]]) {
    const ex = x + Math.cos(a) * l, ez = z + Math.sin(a) * l;
    if (inLane(ex, ez, 0.3) || inLane(x, z, 0.3)) continue;
    cable(K, [[x, z], [ex, ez]], 0.016, CABLE[Math.floor(rnd() * CABLE.length)], rnd);
    K.cyl(I, 'prop', ex, FLOOR + 0.02, ez, 0.03, 0.08, 0xd9b11c, a, 0, Math.PI / 2);
  }
}

// ---------------------------------------------------------------- the month's clutter
// Each island is then grown the way the camp did: things dropped next to things, at any angle, newer kit piled on
// the old. A candidate goes either anywhere in the island or (mostly) just beside something already there, and
// stays if it clears the lanes, the keep-out spots and every solid (sometimes by a hand's width: pushed together).
const workLight = (K, x, z) => {
  const yaw = Math.atan2(-x, PZ - z) + Math.PI + 0.6, M = at(x, z, yaw);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    K.box(M, 'metal', Math.sin(a) * 0.25, 0.6, Math.cos(a) * 0.25, 0.025, 1.25, 0.025, 0x2a2d33, a, 0.35);
  }
  K.cyl(M, 'metal', 0, 1.5, 0, 0.02, 1.1, 0xd9b11c);
  const H = mul(M, T(0, 2.05, 0, 0, 0.5));
  K.box(H, 'prop', 0, 0, 0, 0.32, 0.24, 0.12, 0xd9b11c);
  K.quad(H, 'flickB', 0, 0, 0.061, 0.28, 0.2, 0xfff4dc);
};
// the kit that ends up on a table: a few of these
const TOP_KIT = [
  (K, F, rnd) => laptop(K, F, ['log', 'graph', 'feeds', 'wave', 'map', 'error'][Math.floor(rnd() * 6)], rnd() < 0.4 ? 'beep' : null),
  (K, F, rnd) => crt(K, F, ['graph', 'spectrum', 'wave', 'bars', 'map', 'log', 'heart', 'cam'][Math.floor(rnd() * 8)], rnd() < 0.15 ? 'static' : 'screen', rnd() < 0.15 ? 'beep' : null),
  (K, F, rnd) => flat(K, F, ['feeds', 'graph', 'rack', 'bars', 'nosig', 'prism'][Math.floor(rnd() * 6)]),
  (K, F, rnd) => spectrometer(K, F, rnd() < 0.5 ? 'chirp' : null),
  (K, F) => microscope(K, F),
  (K, F, rnd) => sampleCase(K, F, rnd() < 0.7, Math.floor(rnd() * 4)),
  (K, F, rnd) => stack(K, F, 3 + Math.floor(rnd() * 10), rnd),
  (K, F, rnd) => mug(K, F, [0xd23b3b, 0xf2f2f2, 0x2f62c8, 0xd9a514][Math.floor(rnd() * 4)]),
  (K, F) => clipboard(K, F),
  (K, F, rnd) => binder(K, F, [0x2f62c8, 0xd23b3b, 0x3a3f48, 0xd9a514][Math.floor(rnd() * 4)]),
  (K, F, rnd) => lantern(K, F, rnd() < 0.6),
  (K, F) => keyboard(K, F),
];
const pick = (a, rnd) => a[Math.floor(rnd() * a.length)];
const CLUTTER = {
  crates: {
    r: 1.0,
    f(K, x, z, ry, rnd) {
      const n = 1 + Math.floor(rnd() * 3), items = [];
      let y = 0;
      for (let i = 0; i < n; i++) {
        const prev = items[items.length - 1];
        const side = i > 0 && rnd() < 0.35; // beside the first, else on top of the last
        let w = 0.5 + rnd() * 0.5, d = 0.45 + rnd() * 0.4;
        const h = 0.4 + rnd() * 0.4;
        if (!side && prev) (w = Math.min(w, prev.w)), (d = Math.min(d, prev.d));
        const open = rnd() < 0.12;
        items.push({ k: open ? 'open' : 'crate', w, h, d, x: side ? 0.5 : (rnd() - 0.5) * 0.12, y: side ? 0 : y, ry: (rnd() - 0.5) * 0.8, c: pick(WOOD, rnd), label: rnd() < 0.7 ? Math.floor(rnd() * 8) : -1 });
        if (!side) y += h;
        if (open) break;
      }
      pile(K, x, z, ry, items);
    },
  },
  cases: {
    r: 0.6,
    f(K, x, z, ry, rnd) {
      const n = 1 + Math.floor(rnd() * 3), items = [];
      let y = 0, w = 0.7 + rnd() * 0.35, d = 0.45 + rnd() * 0.2;
      for (let i = 0; i < n; i++) {
        const h = 0.3 + rnd() * 0.25, open = i === n - 1 && rnd() < 0.3;
        const kit = open ? pick(TOP_KIT.slice(0, 6), rnd) : null;
        items.push({ k: 'case', w, h, d, y, ry: (rnd() - 0.5) * 0.6, c: pick(CASES, rnd), label: rnd() < 0.5 ? Math.floor(rnd() * 8) : -1, open, kit: kit ? (M) => kit(K, mul(M, T(0, -0.03, 0, (rnd() - 0.5) * 0.4)), rnd) : null });
        y += h;
        w *= 0.75 + rnd() * 0.2;
        d *= 0.85 + rnd() * 0.15;
      }
      pile(K, x, z, ry, items);
    },
  },
  pallet: {
    r: 0.8,
    f(K, x, z, ry, rnd) {
      const items = [{ k: 'pallet' }];
      const n = 2 + Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) {
        const low = i < 2;
        items.push({ k: rnd() < 0.5 ? 'box' : 'case', w: 0.42 + rnd() * 0.15, h: 0.3 + rnd() * 0.12, d: 0.38 + rnd() * 0.1, x: low ? (i ? 0.28 : -0.28) : (rnd() - 0.5) * 0.2, z: low ? (rnd() - 0.5) * 0.3 : 0, y: low ? 0.14 : 0.56, ry: (rnd() - 0.5) * 0.6, c: rnd() < 0.5 ? 0xb08a5c : pick(CASES, rnd), label: rnd() < 0.5 ? Math.floor(rnd() * 8) : -1 });
      }
      pile(K, x, z, ry, items);
    },
  },
  table: {
    r: 1.0,
    f(K, x, z, ry, rnd, hub) {
      const w = 1.2 + rnd() * 0.6, top = foldingTable(K, at(x, z, ry), w, 0.7, pick([0xd8d4c8, 0xc8c4b8, 0xe0dcd0], rnd));
      const n = 2 + Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) pick(TOP_KIT, rnd)(K, mul(top, T(-w / 2 + 0.25 + ((i + rnd() * 0.5) * (w - 0.5)) / n, 0, (rnd() - 0.5) * 0.25, (rnd() - 0.5) * 1.2)), rnd);
      plug(hub, mul(top, T(0, -0.7, -0.3)));
      return 'chair';
    },
  },
  desk: {
    r: 0.95,
    f(K, x, z, ry, rnd, hub) {
      const M = at(x, z, ry);
      deskTop(K, M, 1.4, 0.7, { top: rnd() < 0.3 ? 0x8a6a4a : COL.lam });
      TOP_KIT[rnd() < 0.5 ? 1 : 2](K, mul(M, T(-0.2 + rnd() * 0.4, 0.74, -0.12, (rnd() - 0.5) * 0.6)), rnd);
      keyboard(K, mul(M, T(0, 0.74, 0.18, (rnd() - 0.5) * 0.3)));
      TOP_KIT[6 + Math.floor(rnd() * 5)](K, mul(M, T(0.5, 0.74, 0.1, rnd())), rnd);
      plug(hub, mul(M, T(0, 0.1, -0.3)));
      return 'chair';
    },
  },
  cart: {
    r: 0.6,
    f(K, x, z, ry, rnd, hub) {
      const M = at(x, z, ry);
      cart(K, M);
      pick(TOP_KIT.slice(0, 4), rnd)(K, mul(M, T(0.1, 0.87, 0, (rnd() - 0.5) * 0.6)), rnd);
      K.solid(M, -0.45, 0, -0.28, 0.45, 1.0, 0.28);
      plug(hub, M);
    },
  },
  rack: {
    r: 0.62,
    f(K, x, z, ry, rnd, hub) {
      rack(K, at(x, z, ry), rnd() < 0.5 ? 'rack' : 'rack2', 1.3 + rnd() * 0.5, true);
      plug(hub, at(x, z, ry), 0, 0.1, -0.4);
    },
  },
  smalls: {
    r: 0.45,
    f(K, x, z, ry, rnd) {
      const k = rnd();
      if (k < 0.3) for (let i = 0; i < 2 + Math.floor(rnd() * 2); i++) fuelCan(K, at(x + (rnd() - 0.5) * 0.6, z + (rnd() - 0.5) * 0.6, rnd() * 6), rnd() < 0.7 ? 0xb02a22 : 0xd9a514);
      else if (k < 0.5) duffel(K, at(x, z, ry), pick([0x2f4a3a, 0x4a3a2f, 0x2a3a4a], rnd));
      else if (k < 0.75) coil(K, x, z, 0.22 + rnd() * 0.15, pick(CABLE, rnd), 2 + Math.floor(rnd() * 3));
      else reel(K, at(x, z, ry), 0.3 + rnd() * 0.15, 0.3, pick(CABLE, rnd));
    },
  },
  shelf: {
    r: 1.0,
    f(K, x, z, ry, rnd) {
      const M = at(x, z, ry), w = 1.5 + rnd() * 0.4, h = 1.8;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(M, 'metal', sx * (w / 2 - 0.02), h / 2, sz * 0.24, 0.035, h, 0.035, 0x6a6f78);
      for (let r = 0; r < 4; r++) {
        const y = 0.08 + r * 0.55;
        K.box(M, 'metal', 0, y, 0, w, 0.025, 0.5, 0x7a8088);
        if (r === 3) continue;
        let px = -w / 2 + 0.08;
        while (px < w / 2 - 0.25) {
          const bw = 0.2 + rnd() * 0.3, bh = 0.15 + rnd() * 0.3;
          if (rnd() < 0.8) {
            const c = rnd();
            if (c < 0.45) K.box(M, 'prop', px + bw / 2, y + bh / 2 + 0.013, (rnd() - 0.5) * 0.08, bw, bh, 0.36, pick([0xb08a5c, 0xa07a50, 0xc09a6c], rnd), (rnd() - 0.5) * 0.2);
            else if (c < 0.7) K.box(M, 'prop', px + bw / 2, y + Math.min(bh, 0.2) / 2 + 0.013, 0, bw, Math.min(bh, 0.2), 0.4, pick(CASES, rnd));
            else if (c < 0.85) K.cyl(M, 'cable', px + bw / 2, y + 0.06, 0, Math.min(bw, 0.2), 0.1, pick(CABLE, rnd));
            else for (let i = 0; i < 3; i++) K.box(M, 'prop', px + 0.04 + i * 0.06, y + 0.14, 0, 0.05, 0.26, 0.24, pick([0x2f62c8, 0xd23b3b, 0x3a3f48, 0xd9a514], rnd));
          }
          px += bw + 0.04;
        }
      }
      K.solid(M, -w / 2, 0, -0.26, w / 2, h, 0.26);
    },
  },
  cargo: {
    r: 1.3,
    f(K, x, z, ry, rnd) {
      const w = 1.6 + rnd() * 0.6, d = 1.0 + rnd() * 0.3, h = 1.0 + rnd() * 0.4;
      const items = [{ k: 'crate', w, h, d, c: pick(WOOD, rnd), label: Math.floor(rnd() * 8) }];
      if (rnd() < 0.6) items.push({ k: rnd() < 0.5 ? 'crate' : 'case', w: 0.6 + rnd() * 0.3, h: 0.4 + rnd() * 0.3, d: 0.5 + rnd() * 0.2, x: (rnd() - 0.5) * (w - 0.9), y: h, ry: (rnd() - 0.5) * 0.9, c: rnd() < 0.5 ? pick(WOOD, rnd) : pick(CASES, rnd), label: Math.floor(rnd() * 8) });
      pile(K, x, z, ry, items);
    },
  },
  tripod: { r: 0.45, f: (K, x, z, ry, rnd) => tripod(K, x, z, 1.2 + rnd() * 0.6, Math.floor(rnd() * 3)) },
  light: { r: 0.4, f: (K, x, z) => workLight(K, x, z) },
};
// the islands: their bounds, their hub (for power) and what they grow
const ISLANDS = [
  { hub: 'A', x1: -21.0, z1: -113.6, x2: -3.4, z2: -100.3, n: 48, mix: { crates: 4, cases: 2, pallet: 2, table: 3, desk: 1, smalls: 3, cart: 1, light: 1, shelf: 1, cargo: 1 } },
  { hub: 'B', x1: 3.4, z1: -113.6, x2: 14.4, z2: -100.3, n: 48, mix: { crates: 5, cases: 4, pallet: 4, smalls: 4, cart: 1, table: 1, light: 1, shelf: 2, cargo: 3 } },
  { hub: 'B', x1: 14.4, z1: -111.6, x2: 21.0, z2: -107.5, n: 12, mix: { crates: 3, cases: 2, pallet: 3, smalls: 2, cargo: 2 } },
  { hub: 'D', x1: -20.2, z1: -134.5, x2: -9.6, z2: -124.6, n: 40, mix: { table: 3, desk: 1, cases: 3, crates: 2, cart: 2, tripod: 2, smalls: 2, rack: 1, shelf: 1 } },
  { hub: 'H', x1: 9.6, z1: -134.5, x2: 20.2, z2: -124.6, n: 40, mix: { cases: 4, crates: 3, table: 2, cart: 2, rack: 2, smalls: 3, tripod: 1, light: 1, shelf: 2, cargo: 1 } },
  { hub: 'F', x1: -7.0, z1: -147.7, x2: 7.6, z2: -133.6, n: 56, mix: { desk: 3, table: 3, rack: 2, cases: 3, crates: 3, cart: 2, smalls: 2, light: 1, shelf: 2, cargo: 1 } },
  { hub: null, x1: -21.5, z1: -121.2, x2: -11.0, z2: -114.5, n: 8, mix: { tripod: 3, cases: 2, smalls: 2, crates: 1 } },
  { hub: null, x1: 11.0, z1: -121.2, x2: 21.5, z2: -114.5, n: 8, mix: { tripod: 3, cases: 2, smalls: 2, crates: 1 } },
  { hub: null, x1: -14.6, z1: -147.7, x2: -10.5, z2: -136.2, n: 7, mix: { crates: 3, cases: 2, pallet: 2, smalls: 1 } },
  { hub: null, x1: -24.4, z1: -140.0, x2: -14.6, z2: -136.4, n: 6, mix: { crates: 2, cases: 2, smalls: 2 } },
  { hub: null, x1: 11.2, z1: -147.7, x2: 14.6, z2: -135.4, n: 7, mix: { crates: 3, cases: 2, pallet: 2 } },
  { hub: null, x1: 14.6, z1: -140.0, x2: 24.4, z2: -136.6, n: 5, mix: { crates: 2, cases: 2, smalls: 1 } },
  { hub: null, x1: -24.4, z1: -120.5, x2: -21.2, z2: -114.3, n: 4, mix: { crates: 2, cases: 1, smalls: 1 } },
  { hub: null, x1: 21.2, z1: -120.5, x2: 24.4, z2: -114.3, n: 4, mix: { crates: 2, cases: 1, smalls: 1 } },
];
function clutter(K, W, rnd, keep) {
  // the floor's solids, bucketed in 2 m cells (kept up to date as the clutter adds its own)
  const cells = new Map();
  let seen = 0;
  const sync = () => {
    for (; seen < W.solids.length; seen++) {
      const s = W.solids[seen];
      if (s.noCollide || s.max.y < FLOOR + 0.1 || s.min.y > FLOOR + 2.2 || s.max.x < -26 || s.min.x > 26 || s.max.z < -150 || s.min.z > -98) continue;
      for (let i = Math.floor(s.min.x / 2); i <= Math.floor(s.max.x / 2); i++)
        for (let j = Math.floor(s.min.z / 2); j <= Math.floor(s.max.z / 2); j++) {
          const k = i * 1000 + j;
          if (!cells.has(k)) cells.set(k, []);
          cells.get(k).push(s);
        }
    }
  };
  const blocked = (x, z, r, gap) => {
    if (x - r < -24.4 || x + r > 24.4 || z + r > -100.1 || z - r < -147.9) return true;
    if (inLane(x, z, r)) return true;
    for (const k of KEEP_OUT) if (x + r > k.x1 && x - r < k.x2 && z + r > k.z1 && z - r < k.z2) return true;
    for (const [kx, kz, kr] of keep) if (Math.hypot(x - kx, z - kz) < r + kr) return true;
    for (const [vx, vz] of VENTS) if (Math.hypot(x - vx, z - vz) < r + 1.1) return true;
    sync();
    const R = r + gap;
    for (let i = Math.floor((x - R) / 2); i <= Math.floor((x + R) / 2); i++)
      for (let j = Math.floor((z - R) / 2); j <= Math.floor((z + R) / 2); j++)
        for (const s of cells.get(i * 1000 + j) || []) {
          if (!s.enabled) continue;
          const px = Math.max(s.min.x, Math.min(x, s.max.x)), pz = Math.max(s.min.z, Math.min(z, s.max.z));
          if (Math.hypot(x - px, z - pz) < R) return true;
        }
    return false;
  };
  for (const isl of ISLANDS) {
    const bag = [];
    for (const [k, w] of Object.entries(isl.mix)) for (let i = 0; i < w; i++) bag.push(k);
    const mine = [];
    let placed = 0;
    for (let tries = 0; placed < isl.n && tries < isl.n * 80; tries++) {
      const kind = pick(bag, rnd), it = CLUTTER[kind];
      let x, z;
      if (mine.length && rnd() < 0.8) {
        const [sx, sz, sr] = pick(mine, rnd), a = rnd() * Math.PI * 2, d = sr + it.r + 0.05 + rnd() * 0.7;
        x = sx + Math.cos(a) * d;
        z = sz + Math.sin(a) * d;
        if (x < isl.x1 || x > isl.x2 || z < isl.z1 || z > isl.z2) continue;
      } else {
        x = isl.x1 + rnd() * (isl.x2 - isl.x1);
        z = isl.z1 + rnd() * (isl.z2 - isl.z1);
      }
      const gap = rnd() < 0.4 ? 0.04 : 0.15 + rnd() * 0.45;
      if (blocked(x, z, it.r, gap)) continue;
      const ry = rnd() * Math.PI * 2;
      const extra = it.f(K, x, z, ry, rnd, isl.hub);
      if (extra === 'chair' && CHAIRS && rnd() < 0.6) {
        const cx = x + Math.sin(ry) * 0.9, cz = z + Math.cos(ry) * 0.9;
        if (!blocked(cx, cz, 0.38, 0.05)) {
          CHAIRS.push(['chair', cx, cz, ry + Math.PI + (rnd() - 0.5) * 1.2]);
          keep.push([cx, cz, 0.4]);
        }
      }
      if (kind === 'tripod' || kind === 'light' || kind === 'smalls') keep.push([x, z, it.r]);
      mine.push([x, z, it.r]);
      placed++;
    }
    isl.placed = placed;
  }
}

function buildCamp(K, W, rnd) {
  TRIPODS.length = 0;
  TORUS ??= strip(new THREE.TorusGeometry(1, 0.065, 4, 16));
  CONE ??= strip(new THREE.ConeGeometry(1, 1, 10, 1, true));
  campCommons(K, W, rnd);
  campYard(K, W, rnd);
  campSensors(K, W, rnd);
  campWorkshop(K, W, rnd);
  campOps(K, W, rnd);
  campEdges(K, W, rnd);
  // (the hand-placed things the clutter keeps clear of: bodies, tripods, the wheelies' spots, the radio mast)
  const keep = [[-12.15, -101.75, 1.0], [12.0, -128.45, 1.3], [11.1, -129.6, 0.6], [-6.4, -106.9, 1.0], [-13.0, -129.2, 1.0], [11.7, -104.8, 0.7], [14.3, -130.2, 0.7], [-3.3, -146.9, 0.4]];
  for (const [, x, z] of CHAIRS || []) keep.push([x, z, 0.45]);
  for (const t of TRIPODS) keep.push([t[0], t[1], 0.5]);
  clutter(K, W, rnd, keep);
  campCables(K, W, rnd);
}

// ---------------------------------------------------------------- drifting papers over the floor vents
const VENTS = [[-6.0, -109.9], [12.9, -103.4], [-17.2, -138.6], [17.0, -138.8]];
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
// the floor under a point (the sunken dais steps, the gallery), for debris and papers
function floorAt(x, z, y = FLOOR) {
  if (y > GAL - 0.5 && (x < -20 || x > 20 || z < -144)) return GAL;
  const u = Math.max(Math.abs(x), Math.abs(z - PZ));
  return u >= 7 ? FLOOR : u >= 6 ? FLOOR - 0.4 : u >= 5 ? FLOOR - 0.8 : FLOOR - 1.2;
}

export function buildOffices(B) {
  const { W, light } = B;
  const M = materials();
  const rnd = rng(1407);
  BR = new Breakables(W, { floorAt, paperMaterial: M.print, paperUV: P.paper[0] });
  CHAIRS = [];
  PLUGS = [];
  LANES = [];
  // the glass rooms of the first week, the observation post, the scorch, then the camp: all one set of meshes
  const t0 = performance.now();
  const K = new Kit(W);
  for (const fn of [buildSW, buildSE, buildNW, buildNE, buildGallery]) fn(K, W, rnd);
  buildScorch(K, rnd);
  buildCamp(K, W, rnd);
  K.build('station');
  BR.buildLeds();
  // the wheelies: office chairs, the two whiteboards, two trolleys
  const wh = new Wheelies(W, {
    floor: FLOOR,
    blocks: [{ x1: -7, z1: PZ - 7, x2: 7, z2: PZ + 7 }, { x1: -24.5, z1: -124.05, x2: -20.95, z2: -120.95 }, { x1: 20.95, z1: -124.05, x2: 24.5, z2: -120.95 }],
  });
  const kitOf = (fn) => {
    const k = new Kit(W);
    fn(k);
    return k.geometries();
  };
  const board = { circles: [[-0.55, 0, 0.3], [0, 0, 0.3], [0.55, 0, 0.3]], h: 2.0, mass: 1.6, swivel: 0.35, friction: 2.0 };
  wh.kind('chair', kitOf((k) => chair(k, I)), { circles: [[0, 0, 0.33]], h: 1.15, mass: 0.6, swivel: 1, friction: 1.5 });
  wh.kind('board1', kitOf((k) => wheeledBoard(k, P.wb2)), board);
  wh.kind('board2', kitOf((k) => wheeledBoard(k, P.wb1)), board);
  wh.kind('cart', kitOf(cart), { circles: [[-0.25, 0, 0.33], [0.25, 0, 0.33]], h: 1.15, mass: 1.1, swivel: 0.5, friction: 1.8 });
  for (const [k, x, z, ry] of CHAIRS) wh.add(k, x, z, ry);
  wh.add('board1', -6.4, -106.9, 0.83); // DAY 1, turned to the red door
  wh.add('board2', -13.0, -129.2, 1.2); // the Prism, by the sensors
  wh.add('cart', 11.7, -104.8, 0.4);
  wh.add('cart', 14.3, -130.2, -0.6);
  wh.build();
  if (LANES.length && typeof location !== 'undefined' && /[?&]dev\b/.test(location.search)) console.warn('camp: solids in a lane:', LANES);
  // the guide's chevrons keep to the lanes (guide.js): a step off them costs three
  W.laneCost = (x, z) => (inLane(x, z) ? 1 : 3);
  if (B.level) B.level.camp = { breakables: BR, wheelies: wh, lanes: LANES, inLane, islands: ISLANDS.map((i) => [i.hub, i.n, i.placed]), buildMs: Math.round(performance.now() - t0) };
  BR = CHAIRS = PLUGS = LANES = null;
  const drift = buildDrift(W);
  // the light still on in each room (two of them on a dying ballast)
  const lights = [
    { l: light(1.9, FLOOR + 2.2, -138.4, 0xfff0d8, 5, 8), f: 'flickB' }, // the ops canopy's work light
    { l: light(-12.0, FLOOR + 2.3, -104.4, 0xffd9a0, 3, 7), f: 'flickA' }, // the party lights
    { l: light(-21.8, FLOOR + 2.3, -103.0, 0xe8f0ff, 5, 9), f: 'flickA' },
    { l: light(19.5, FLOOR + 2.3, -103.9, 0xe8f0ff, 5, 9), f: 'flickB' },
    { l: light(-19.5, FLOOR + 2.3, -144.5, 0xe8f0ff, 5, 9), f: 'flickA' },
    { l: light(20.0, FLOOR + 2.3, -143.5, 0xe8f0ff, 5, 9), f: 'flickB' },
  ];
  for (const L of lights) L.k = L.l.intensity;
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
      for (const L of lights) L.l.intensity = L.k * (L.f === 'flickA' ? a : b);
      staticTex.offset.set(Math.random(), Math.random());
      drift(t);
    },
  });
}
