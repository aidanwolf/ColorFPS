// Bonus Round (https://bonusround.io) — the ad network for three.js games.
// Natural breaks in Chroma Breach become 15-second playable branded rounds.
// Docs: https://bonusround.io/docs/  ·  Integration recipe: https://bonusround.io/integrate.md
//
// Only the PUBLIC publisher id goes in the game. It's set in `.env` (override in `.env.local`):
//   VITE_BONUSROUND_PUB=pub_xxxxxxxxxxxxxxxx
// Never put a `br_sk_` or `br_pk_` key in game code.
//
// Every call is safe when the SDK didn't load (ad blockers, offline): `attach` goes through the
// `bonusround` queue and everything else through `window.BonusRound?.`.

const SDK_URL = 'https://bonusround.io/v1/br.js';
const PUB = import.meta.env.VITE_BONUSROUND_PUB || '';

export const ads = {
  enabled: false,

  // Inject the loader tag (equivalent to the <script async data-pub> tag in the docs).
  load() {
    if (!PUB) {
      console.info('[chroma] Bonus Round is off: set VITE_BONUSROUND_PUB in .env to your pub_ id.');
      return;
    }
    const s = document.createElement('script');
    s.src = SDK_URL;
    s.async = true;
    s.dataset.pub = PUB;
    document.head.append(s);
    this.enabled = true;
  },

  // Native mode: with worldRoot + host the round plays inside our scene with our own player,
  // controls and physics (https://bonusround.io/docs/attach#host-adapter).
  // onStart/onEnd also fire for rounds that our code didn't start.
  // SDK 1.0.0 doesn't always emit 'start'/'end', so an impression/start analytics event also counts
  // as a start and 'complete' as an end ('viewable' can arrive after 'complete', so it's ignored);
  // for breaks we request, break() resolving is the final word.
  attach({ THREE, scene, camera, renderer, worldRoot, host, onStart, onEnd }) {
    (window.bonusround = window.bonusround || []).push((BR) => {
      BR.attach({ THREE, scene, camera, renderer, worldRoot, host });
      BR.on('start', onStart);
      BR.on('end', onEnd);
      BR.on('event', (e) => {
        if (e?.type === 'impression' || e?.type === 'start') onStart();
        else if (e?.type === 'complete') onEnd();
      });
    });
  },

  // An intermission round at a natural break. Resolves immediately when unfilled or unavailable.
  async intermission() {
    try {
      return (await window.BonusRound?.break('intermission')) ?? { filled: false, reason: 'sdk_unavailable' };
    } catch (e) {
      return { filled: false, reason: String(e) };
    }
  },

  // Whether the SDK is present, so the death screen can offer a rewarded revive.
  get available() {
    return !!window.BonusRound;
  },

  // Rewarded round from our own button: onReward runs only if the player finishes the round.
  async rewarded(onReward) {
    try {
      return (await window.BonusRound?.rewarded({ button: false, onReward })) ?? { filled: false, reason: 'sdk_unavailable' };
    } catch (e) {
      return { filled: false, reason: String(e) };
    }
  },

  // Interval offers: welcome in menus, never during active play or the boss fight.
  safe(v) {
    window.BonusRound?.safe(v);
  },

  setMuted(muted) {
    window.BonusRound?.config({ muted });
  },
};
