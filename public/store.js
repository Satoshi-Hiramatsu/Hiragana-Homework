// プリセット・履歴・にがてな字・前回の設定を、このブラウザの localStorage に保存する。
const PREFIX = 'hiragana-renshu.';
const HISTORY_MAX = 20;

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function write(key, value) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* 容量超過・無効時は保存しない */ }
}

export function loadLast() { return read('last', null); }
export function saveLast(cfg) { write('last', cfg); }

export function presets() { return read('presets', []); }
export function addPreset(name, config) {
  const list = presets();
  list.unshift({ id: Date.now().toString(36), name, config, saved: Date.now() });
  write('presets', list);
}
export function removePreset(id) { write('presets', presets().filter(p => p.id !== id)); }

export function history() { return read('history', []); }
export function addHistory(config, seed) {
  const list = history();
  list.unshift({ config, seed, printed: Date.now() });
  write('history', list.slice(0, HISTORY_MAX));
}

// にがてな字: { unit, count, last } を記録回数の多い順で返す
export function weakList() {
  return read('weak', []).sort((a, b) => b.count - a.count || b.last - a.last);
}
export function recordWeak(units) {
  const list = read('weak', []);
  const now = Date.now();
  units.forEach(unit => {
    const hit = list.find(w => w.unit === unit);
    if (hit) { hit.count++; hit.last = now; } else list.push({ unit, count: 1, last: now });
  });
  write('weak', list);
}
export function removeWeak(unit) { write('weak', read('weak', []).filter(w => w.unit !== unit)); }
