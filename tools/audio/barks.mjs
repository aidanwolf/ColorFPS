// Voices the enemy barks (tools/audio/barks.json) with ElevenLabs text-to-speech into
// public/audio/bark_<id>.mp3, one file per line, each persona with its own premade voice and settings.
// The game (src/combat/barks.js) plays them through a per-persona robot chain (ring-mod, formant,
// bit-crush, filters), so the reads here should stay clean and dry.
//
// Usage: ELEVENLABS_API_KEY=... node tools/audio/barks.mjs [--persona foundry,solar] [--event hit,spot]
//                                                         [--only foundry_hit_01,...] [--force] [--dry]
//   --dry     list what would be voiced (and the character count) without calling the API
//   --force   re-voice lines whose mp3 already exists
// Existing files are skipped, so it's safe to re-run (e.g. after adding lines). The key is read from the
// environment only and never written anywhere. Behind an HTTP proxy, add NODE_USE_ENV_PROXY=1 (and
// NODE_EXTRA_CA_CERTS if the proxy needs a CA). The audio manifest is rebuilt from the folder at the end.
import fs from 'node:fs';

const OUT = new URL('../../public/audio', import.meta.url).pathname;
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const list = (name) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? new Set(args[i + 1].split(',')) : null;
};
const FORCE = flag('--force');
const DRY = flag('--dry');
const PERSONAS = list('--persona');
const EVENTS = list('--event');
const ONLY = list('--only');

const { personas, lines } = JSON.parse(fs.readFileSync(new URL('./barks.json', import.meta.url)));
const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY && !DRY) throw new Error('ELEVENLABS_API_KEY not set (or pass --dry to list the work)');
fs.mkdirSync(OUT, { recursive: true });

const file = (id) => `${OUT}/bark_${id}.mp3`;
const todo = lines.filter((l) =>
  (!PERSONAS || PERSONAS.has(l.persona)) && (!EVENTS || EVENTS.has(l.event)) && (!ONLY || ONLY.has(l.id)) && (FORCE || !fs.existsSync(file(l.id))));
for (const l of todo) if (!personas[l.persona]) throw new Error(`line ${l.id}: unknown persona "${l.persona}"`);
console.log(`${todo.length} of ${lines.length} lines to voice, ${todo.reduce((s, l) => s + l.text.length, 0)} characters`);
if (DRY) {
  for (const l of todo) console.log(`  ${l.id.padEnd(24)} [${personas[l.persona].voice.name}] ${l.text}`);
  process.exit(0);
}

async function tts(text, voice) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voice.id}?output_format=mp3_44100_128`;
  const body = { text, model_id: voice.model, voice_settings: voice.settings };
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, { method: 'POST', headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    const txt = (await res.text()).slice(0, 300);
    if (res.status === 429 || res.status >= 500) {
      console.log(`  retry ${attempt} (${res.status}) ${txt}`);
      await new Promise((r) => setTimeout(r, 4000 * attempt));
      continue;
    }
    throw new Error(`${res.status} ${txt}`);
  }
  throw new Error('failed after retries');
}

let i = 0, failed = 0;
async function worker() {
  while (i < todo.length) {
    const l = todo[i++];
    const t0 = Date.now();
    try {
      const buf = await tts(l.text, personas[l.persona].voice);
      fs.writeFileSync(file(l.id), buf);
      console.log(`ok   bark_${l.id.padEnd(24)} ${(buf.length / 1024).toFixed(0)}KB ${((Date.now() - t0) / 1000).toFixed(1)}s  ${l.text}`);
    } catch (e) {
      failed++;
      console.log(`FAIL bark_${l.id.padEnd(24)} ${e.message}`);
    }
  }
}
await Promise.all([worker(), worker(), worker()]);
// the game only requests files listed in the manifest (avoids 404s for audio that doesn't exist yet)
const have = fs.readdirSync(OUT).filter((f) => f.endsWith('.mp3')).map((f) => f.slice(0, -4)).sort();
fs.writeFileSync(`${OUT}/manifest.json`, `[${have.map((n) => JSON.stringify(n)).join(', ')}]`);
console.log(`done, ${failed} failed; manifest lists ${have.length} files`);
