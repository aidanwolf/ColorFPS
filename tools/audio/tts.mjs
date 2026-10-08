// Voices the audio logs (tools/audio/logs.json) with ElevenLabs text-to-speech into public/audio/log_XX.mp3,
// and writes src/story/logdata.json for the game: each log's title, duration and subtitle lines, timed
// from the character alignment ElevenLabs returns with the audio.
// Usage: ELEVENLABS_API_KEY=... node tools/audio/tts.mjs [01,02,...] [--force]
// Logs whose mp3 exists and whose text hasn't changed are skipped. The key is read from the environment only.
// Behind an HTTP proxy, add NODE_USE_ENV_PROXY=1 (and NODE_EXTRA_CA_CERTS if the proxy needs a CA).
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const KEY = process.env.ELEVENLABS_API_KEY;
const OUT = new URL('../../public/audio', import.meta.url).pathname;
const DATA = new URL('../../src/story/logdata.json', import.meta.url).pathname;
const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const ONLY = args.find((a) => !a.startsWith('--')) ? new Set(args.find((a) => !a.startsWith('--')).split(',')) : null;
if (!KEY) throw new Error('ELEVENLABS_API_KEY not set');
const { voice, logs } = JSON.parse(fs.readFileSync(new URL('./logs.json', import.meta.url)));
const old = fs.existsSync(DATA) ? JSON.parse(fs.readFileSync(DATA)) : [];

async function speak(text) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voice.id}/with-timestamps?output_format=mp3_44100_128`;
  const body = { text, model_id: voice.model, voice_settings: voice.settings };
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, { method: 'POST', headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) return res.json();
    const txt = (await res.text()).slice(0, 300);
    if (res.status === 429 || res.status >= 500) { console.log(`  retry ${attempt} (${res.status}) ${txt}`); await new Promise((r) => setTimeout(r, 4000 * attempt)); continue; }
    throw new Error(`${res.status} ${txt}`);
  }
  throw new Error('failed after retries');
}

const duration = (file) => +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim();

// subtitle line start times: the first spoken character of each chunk in the alignment (falls back to
// spreading the chunks by length over the clip)
function timeChunks(chunks, align, dur) {
  const lines = [];
  let off = 0;
  const total = chunks.join(' ').length;
  for (const text of chunks) {
    let t = null;
    if (align) {
      const i = align.characters.findIndex((c, k) => k >= off && /\w/.test(c));
      if (i >= 0) t = align.character_start_times_seconds[i];
    }
    lines.push({ t: +(t ?? (dur * off) / total).toFixed(2), text });
    off += text.length + 1;
  }
  return lines;
}

const data = [];
let failed = 0;
for (const log of logs) {
  const name = `log_${log.id}`, file = `${OUT}/${name}.mp3`, text = log.chunks.join(' ');
  const prev = old.find((d) => d.id === log.id);
  if ((ONLY && !ONLY.has(log.id)) || (!ONLY && !FORCE && fs.existsSync(file) && prev?.text === text)) {
    if (prev) data.push({ ...prev, title: log.title, where: log.where });
    continue;
  }
  const t0 = Date.now();
  try {
    const res = await speak(text);
    fs.writeFileSync(file, Buffer.from(res.audio_base64, 'base64'));
    const dur = duration(file);
    data.push({ id: log.id, title: log.title, where: log.where, file: name, dur: +dur.toFixed(2), text, lines: timeChunks(log.chunks, res.alignment, dur) });
    console.log(`ok   ${name} ${dur.toFixed(1)}s ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name} ${e.message}`);
    if (prev) data.push(prev);
  }
}
fs.writeFileSync(DATA, JSON.stringify(data, null, 1) + '\n');
// the game only requests files listed in the manifest (avoids 404s for audio that doesn't exist yet)
const have = fs.readdirSync(OUT).filter((f) => f.endsWith('.mp3')).map((f) => f.slice(0, -4)).sort();
fs.writeFileSync(`${OUT}/manifest.json`, `[${have.map((n) => JSON.stringify(n)).join(', ')}]`);
console.log(`done, ${failed} failed; manifest lists ${have.length} files`);
