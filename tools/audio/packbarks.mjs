// Packs each persona's voiced barks (tools/audio/barks/bark_<id>.mp3, made by barks.mjs) into one file per
// persona, public/audio/barkpack_<persona>.mp3, and writes src/combat/barkpack.json with where each line
// sits in it ([offset, duration] in seconds). One file per world instead of ~300 keeps the web build small
// and fast to load. Needs ffmpeg. Usage: node tools/audio/packbarks.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const SRC = new URL('./barks', import.meta.url).pathname;
const OUT = new URL('../../public/audio', import.meta.url).pathname;
const MAP = new URL('../../src/combat/barkpack.json', import.meta.url).pathname;
const { lines } = JSON.parse(fs.readFileSync(new URL('./barks.json', import.meta.url)));
const RATE = 44100, GAP = 0.25; // silence between lines (also absorbs the mp3 encoder's start delay)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'barkpack-'));
const pack = {};
for (const persona of [...new Set(lines.map((l) => l.persona))]) {
  const own = lines.filter((l) => l.persona === persona && fs.existsSync(`${SRC}/bark_${l.id}.mp3`));
  if (!own.length) continue;
  const raw = [];
  let t = GAP;
  pack[persona] = {};
  const silence = Buffer.alloc(Math.round(GAP * RATE) * 2);
  raw.push(silence);
  for (const l of own) {
    // decode to raw mono 16-bit PCM so lengths are exact
    const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', `${SRC}/bark_${l.id}.mp3`, '-f', 's16le', '-ac', '1', '-ar', String(RATE), '-'], { maxBuffer: 1 << 28 });
    const dur = pcm.length / 2 / RATE;
    pack[persona][l.id] = [+t.toFixed(4), +dur.toFixed(4)];
    raw.push(pcm, silence);
    t += dur + GAP;
  }
  const rawFile = `${tmp}/${persona}.raw`;
  fs.writeFileSync(rawFile, Buffer.concat(raw));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 's16le', '-ac', '1', '-ar', String(RATE), '-i', rawFile, '-b:a', '96k', `${OUT}/barkpack_${persona}.mp3`]);
  console.log(`barkpack_${persona}: ${own.length} lines, ${t.toFixed(1)} s`);
}
fs.writeFileSync(MAP, JSON.stringify(pack) + '\n');
fs.rmSync(tmp, { recursive: true, force: true });
const have = fs.readdirSync(OUT).filter((f) => f.endsWith('.mp3')).map((f) => f.slice(0, -4)).sort();
fs.writeFileSync(`${OUT}/manifest.json`, JSON.stringify(have, null, 1) + '\n');
console.log(`manifest lists ${have.length} files`);
