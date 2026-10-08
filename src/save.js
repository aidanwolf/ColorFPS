// Progress that survives a page refresh: the checkpoint you last reached, your colors, the secrets you
// found and your stats, in localStorage. World state (doors, puzzles) is rebuilt fresh on load.
const KEY = 'chroma-save-v1';
const LOGS_KEY = 'chroma-logs-v2'; // ids of the audio logs you've picked up (src/story/recorder.js)
// v1 held the ids of the original sixteen logs; the story was rewritten (new scripts behind the same
// ids), so those finds don't carry over: v1 is simply dropped and everyone starts the new logs fresh.
const OLD_LOGS_KEYS = ['chroma-logs-v1'];

export function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    return s && s.v === 1 && Array.isArray(s.cp?.pos) ? s : null;
  } catch {
    return null;
  }
}

export function writeSave(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, ...data }));
  } catch {
    // private mode / storage full: progress just isn't kept
  }
}

export function loadLogs() {
  try {
    for (const k of OLD_LOGS_KEYS) localStorage.removeItem(k);
    const l = JSON.parse(localStorage.getItem(LOGS_KEY) || '[]');
    return Array.isArray(l) ? l : [];
  } catch {
    return [];
  }
}

export function writeLogs(ids) {
  try {
    localStorage.setItem(LOGS_KEY, JSON.stringify(ids));
  } catch {
    // not kept
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(LOGS_KEY);
    for (const k of OLD_LOGS_KEYS) localStorage.removeItem(k);
  } catch {
    // nothing to clear
  }
}
