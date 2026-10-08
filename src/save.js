// Progress that survives a page refresh: the checkpoint you last reached, your colors, the secrets you
// found and your stats, in localStorage. World state (doors, puzzles) is rebuilt fresh on load.
const KEY = 'chroma-save-v1';
const LOGS_KEY = 'chroma-logs-v1'; // ids of the audio logs you've picked up (src/story/recorder.js)

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
  } catch {
    // nothing to clear
  }
}
