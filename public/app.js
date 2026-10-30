import { ROWS, GROUP_LABELS, WORDS_HIRAGANA, WORDS_KATAKANA, toKatakana, splitUnits } from './kana.js';
import { buildLinePages, buildSinglePages, buildChartPages, buildWordPages, makeRng, shuffle } from './sheets.js';
import * as store from './store.js';

const $ = id => document.getElementById(id);

const FONTS = {
  klee: "'Klee One', 'Yu Gothic', serif",
  ud: "'UD Digi Kyokasho N-R', 'UD デジタル 教科書体 N-R', 'Klee One', serif",
  maru: "'Zen Maru Gothic', 'Yu Gothic', sans-serif",
  stroke: "'Klee One', 'Yu Gothic', serif",
};

const DEFAULT_ROWS = ['a'];
let currentSeed = newSeed();

function newSeed() { return Math.floor(Math.random() * 2 ** 31); }

// ---- 行えらび（チップ）を組み立てる ----
function buildRowPicker() {
  const root = $('rowGroups');
  root.innerHTML = '';
  for (const [group, title] of Object.entries(GROUP_LABELS)) {
    const wrap = document.createElement('div');
    wrap.className = 'row-group';
    wrap.innerHTML = `<div class="row-group-head"><span class="row-group-title">${title}</span>`
      + `<span class="row-group-actions"><button type="button" class="link-btn" data-all="${group}">すべて</button>`
      + `<button type="button" class="link-btn" data-none="${group}">はずす</button></span></div>`;
    const chips = document.createElement('div');
    chips.className = 'row-chips';
    ROWS.filter(r => r.group === group).forEach(r => {
      const label = document.createElement('label');
      label.className = 'chip';
      label.innerHTML = `<input type="checkbox" class="row-check" value="${r.key}"><span data-label="${r.label}"></span>`;
      chips.appendChild(label);
    });
    wrap.appendChild(chips);
    root.appendChild(wrap);
  }
  root.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const group = btn.dataset.all || btn.dataset.none;
    const on = Boolean(btn.dataset.all);
    const keys = new Set(ROWS.filter(r => r.group === group).map(r => r.key));
    document.querySelectorAll('.row-check').forEach(c => { if (keys.has(c.value)) c.checked = on; });
    render();
  });
}

function refreshRowLabels() {
  const kata = radio('script') === 'kata';
  document.querySelectorAll('.row-chips span[data-label]').forEach(span => {
    span.textContent = kata ? toKatakana(span.dataset.label) : span.dataset.label;
  });
}

// ---- 設定の読み書き ----
function radio(name) {
  const el = document.querySelector(`input[name="${name}"]:checked`);
  return el ? el.value : null;
}
function setRadio(name, value) {
  const el = document.querySelector(`input[name="${name}"][value="${value}"]`);
  if (el) el.checked = true;
}

const RADIOS = ['format', 'script'];
const SELECTS = {
  linesPerUnit: 'linesPerUnit', singleLines: 'singleLines', chartMode: 'chartMode', blankRate: 'blankRate',
  source: 'source', order: 'order', cellSize: 'cellSize', traceCount: 'traceCount', glyph: 'glyphSelect',
  traceStyle: 'traceStyle', sets: 'setCount', blankCols: 'blankCols', glyphScale: 'glyphScale',
};
const NUMERIC = new Set(['linesPerUnit', 'singleLines', 'blankRate', 'cellSize', 'traceCount', 'sets', 'blankCols', 'glyphScale']);
const CHECKS = {
  answer: 'opt-answer', showPicture: 'opt-picture', fade: 'opt-fade', strokeNumbers: 'opt-numbers',
  startDots: 'opt-start', guides: 'opt-guides', metaName: 'meta-name', metaDate: 'meta-date',
  metaClass: 'meta-class', metaNumber: 'meta-number', metaHanamaru: 'meta-hanamaru', metaBadge: 'meta-badge',
};

function readConfig() {
  const cfg = {};
  RADIOS.forEach(name => { cfg[name] = radio(name); });
  for (const [key, id] of Object.entries(SELECTS)) {
    cfg[key] = NUMERIC.has(key) ? Number($(id).value) : $(id).value;
  }
  for (const [key, id] of Object.entries(CHECKS)) cfg[key] = $(id).checked;
  cfg.rows = [...document.querySelectorAll('.row-check:checked')].map(c => c.value);
  cfg.customText = $('customText').value;
  cfg.title = $('meta-title').value.trim();
  return cfg;
}

function applyConfig(cfg) {
  RADIOS.forEach(name => { if (cfg[name]) setRadio(name, cfg[name]); });
  for (const [key, id] of Object.entries(SELECTS)) {
    if (cfg[key] !== undefined) $(id).value = String(cfg[key]);
  }
  for (const [key, id] of Object.entries(CHECKS)) {
    if (cfg[key] !== undefined) $(id).checked = Boolean(cfg[key]);
  }
  if (Array.isArray(cfg.rows)) {
    const set = new Set(cfg.rows);
    document.querySelectorAll('.row-check').forEach(c => { c.checked = set.has(c.value); });
  }
  if (cfg.customText !== undefined) $('customText').value = cfg.customText;
  if (cfg.title !== undefined) $('meta-title').value = cfg.title;
  syncVisibility();
}

// ---- おすすめ設定 ----
const SEION = ROWS.filter(r => r.group === 'seion').map(r => r.key);
const RECOMMEND = {
  first: { format: 'single', script: 'hira', source: 'rows', rows: ['a'], cellSize: 30, glyph: 'stroke', traceStyle: 'dot', traceCount: 4, singleLines: 2, strokeNumbers: true, startDots: true, order: 'seq' },
  nencho: { format: 'line', script: 'hira', source: 'rows', rows: ['a', 'ka'], cellSize: 24, glyph: 'klee', traceStyle: 'gray', traceCount: 3, blankCols: 1, strokeNumbers: true, startDots: true, order: 'seq' },
  grade1: { format: 'line', script: 'hira', source: 'rows', rows: SEION, cellSize: 20, glyph: 'klee', traceStyle: 'gray', traceCount: 3, blankCols: 1, strokeNumbers: false, order: 'seq' },
  chart: { format: 'chart', script: 'hira', source: 'rows', rows: SEION, chartMode: 'fill', blankRate: 35, answer: true, cellSize: 24, glyph: 'klee' },
  word: { format: 'word', script: 'hira', source: 'rows', rows: ['a', 'ka', 'sa'], cellSize: 20, glyph: 'klee', traceStyle: 'gray', traceCount: 1, linesPerUnit: 1, showPicture: true, strokeNumbers: false, order: 'seq' },
  dakuon: { format: 'line', script: 'hira', source: 'rows', rows: ['ga', 'za', 'da', 'ba', 'pa', 'y-き', 'y-し', 'y-ち'], cellSize: 20, glyph: 'klee', traceStyle: 'gray', traceCount: 3, blankCols: 1, strokeNumbers: false, order: 'seq' },
  katakana: { format: 'single', script: 'kata', source: 'rows', rows: ['a'], cellSize: 30, glyph: 'stroke', traceStyle: 'dot', traceCount: 4, singleLines: 2, strokeNumbers: true, startDots: true, order: 'seq' },
};

// ---- 練習する字・ことばを決める ----
function selectedRows(cfg) {
  const set = new Set(cfg.rows);
  return ROWS.filter(r => set.has(r.key));
}
function conv(cfg, text) { return cfg.script === 'kata' ? toKatakana(text) : text; }

function resolveUnits(cfg) {
  if (cfg.source === 'custom') return splitUnits(cfg.customText);
  if (cfg.source === 'weak') {
    const kata = cfg.script === 'kata';
    return store.weakList().map(w => w.unit).filter(u => /[ァ-ー]/.test(u) === kata);
  }
  return selectedRows(cfg).flatMap(r => r.chars.filter(Boolean)).map(u => conv(cfg, u));
}

// 行ごとの字のまとまり。「ん」は、わ行もえらんでいれば わ・を・ん で1つにする
function rowGroups(cfg) {
  const groups = [];
  let prevKey = null;
  for (const r of selectedRows(cfg)) {
    const chars = r.chars.filter(Boolean).map(u => conv(cfg, u));
    if (r.key === 'n' && prevKey === 'wa') groups[groups.length - 1].push(...chars);
    else groups.push(chars);
    prevKey = r.key;
  }
  return groups;
}

function wordEntries(cfg) {
  const list = cfg.script === 'kata' ? WORDS_KATAKANA : WORDS_HIRAGANA;
  return list.map(([text, pic, focus]) => ({ text, pic, focus: focus ? conv(cfg, focus) : splitUnits(text)[0] }));
}

function resolveWords(cfg) {
  if (cfg.source === 'custom') {
    return cfg.customText.split(/[\s、,]+/).filter(Boolean).map(text => ({ text, pic: '' }));
  }
  const targets = new Set(resolveUnits(cfg));
  // 「っ」のことばは拗音のどれかを選んだときに出す
  if (cfg.source === 'rows' && selectedRows(cfg).some(r => r.group === 'youon')) targets.add(conv(cfg, 'っ'));
  return wordEntries(cfg).filter(w => targets.has(w.focus));
}

function chartSections(cfg) {
  const rows = selectedRows(cfg);
  const sections = [];
  for (const group of Object.keys(GROUP_LABELS)) {
    const inGroup = rows.filter(r => r.group === group);
    if (inGroup.length) sections.push({ rows: inGroup.map(r => r.chars.map(c => (c ? conv(cfg, c) : null))) });
  }
  return sections;
}

function badgeText(cfg) {
  if (cfg.format !== 'chart' && cfg.source === 'custom') return '';
  if (cfg.format !== 'chart' && cfg.source === 'weak') return 'にがてな字';
  const labels = selectedRows(cfg).map(r => conv(cfg, r.label));
  if (labels.length > 5) return labels.slice(0, 4).join('・') + ' ほか';
  return labels.join('・');
}

function autoTitle(cfg) {
  const name = cfg.script === 'kata' ? 'カタカナ' : 'ひらがな';
  if (cfg.format === 'chart') return name + ' 50おんひょう';
  if (cfg.format === 'word') return 'ことばを かこう';
  return name + ' れんしゅう';
}

// ---- 用紙ヘッダー ----
function buildSheetHeader(cfg, badge) {
  const header = document.createElement('div');
  header.className = 'sheet-header';
  const titleWrap = document.createElement('div');
  titleWrap.className = 'sheet-title-wrap';
  const titleEl = document.createElement('span');
  titleEl.className = 'sheet-title';
  titleEl.textContent = cfg.title || autoTitle(cfg);
  titleWrap.appendChild(titleEl);
  if (badge) {
    const b = document.createElement('span');
    b.className = 'sheet-badge';
    b.textContent = badge;
    titleWrap.appendChild(b);
  }
  header.appendChild(titleWrap);

  const meta = document.createElement('div');
  meta.className = 'sheet-meta';
  const add = html => { const d = document.createElement('div'); d.innerHTML = html; meta.appendChild(d); };
  if (cfg.metaDate) add('<span class="slot short"></span>がつ<span class="slot short"></span>にち');
  if (cfg.metaClass) add('<span class="slot short"></span>くみ');
  if (cfg.metaNumber) add('<span class="slot short"></span>ばん');
  if (cfg.metaName) add('なまえ <span class="slot"></span>');
  if (cfg.metaHanamaru) {
    const h = document.createElement('div');
    h.className = 'hanamaru';
    h.textContent = 'はなまる';
    meta.appendChild(h);
  }
  header.appendChild(meta);
  return header;
}

function wrapSheet(body, cfg, badge) {
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.style.setProperty('--kana-font', FONTS[cfg.glyph] || FONTS.klee);
  // 字の大きさ（マスに対する割合）。書き順データの字はふつう（76%）を基準に拡大・縮小する
  const scale = (cfg.glyphScale || 76) / 100;
  sheet.style.setProperty('--glyph-scale', String(scale));
  sheet.style.setProperty('--glyph-ratio', String(scale / 0.76));
  sheet.appendChild(buildSheetHeader(cfg, badge));
  sheet.appendChild(body);
  return sheet;
}

// ---- 生成 ----
function buildSheets(cfg, seed) {
  const rng = makeRng(seed);
  const ctx = {
    glyph: cfg.glyph === 'stroke' ? 'stroke' : 'font',
    traceStyle: cfg.traceStyle,
    strokeNumbers: cfg.strokeNumbers,
    startDots: cfg.startDots,
    guides: cfg.guides,
    fade: cfg.fade,
  };
  const badge = cfg.metaBadge ? badgeText(cfg) : '';
  const sheets = [];
  const words = wordEntries(cfg);
  const findWord = unit => words.find(w => w.focus === unit && w.pic) || null;

  for (let set = 0; set < cfg.sets; set++) {
    if (cfg.format === 'chart') {
      const sections = chartSections(cfg);
      if (!sections.length) throw new Error('50音ひょうに使う行を1つ以上えらんでください。');
      buildChartPages(cfg, sections, ctx, rng, false).forEach(b => sheets.push(wrapSheet(b, cfg, badge)));
      if (cfg.answer && cfg.chartMode !== 'trace') {
        buildChartPages(cfg, sections, ctx, rng, true).forEach(b => sheets.push(wrapSheet(b, cfg, 'こたえ')));
      }
      continue;
    }
    if (cfg.format === 'word') {
      let words = resolveWords(cfg);
      if (!words.length) throw new Error(cfg.source === 'custom'
        ? '練習することばを入力してください。'
        : 'えらんだ行ではじまることばがありません。ほかの行もえらんでください。');
      if (cfg.order === 'random') words = shuffle(words, rng);
      buildWordPages(cfg, words, ctx).forEach(b => sheets.push(wrapSheet(b, cfg, badge)));
      continue;
    }
    let units = resolveUnits(cfg);
    if (!units.length) throw new Error(cfg.source === 'weak'
      ? 'にがてな字がまだ記録されていません。'
      : cfg.source === 'custom' ? '練習する字を入力してください。' : '練習する行を1つ以上えらんでください。');
    if (cfg.order === 'random') units = shuffle(units, rng);
    // 行からえらんで あいうえお順 のときは、行れんしゅうを1つの行ごとに1ページにする
    const groups = cfg.source === 'rows' && cfg.order !== 'random' ? rowGroups(cfg) : null;
    const bodies = cfg.format === 'single'
      ? buildSinglePages(cfg, units, ctx, findWord)
      : buildLinePages(cfg, units, ctx, groups);
    bodies.forEach(b => sheets.push(wrapSheet(b, cfg, badge)));
  }
  return sheets;
}

function render() {
  syncVisibility();
  const cfg = readConfig();
  store.saveLast(cfg);
  const wrapper = $('a4Wrapper');
  $('errorMsg').textContent = '';
  let sheets = [];
  try {
    sheets = buildSheets(cfg, currentSeed);
  } catch (e) {
    $('errorMsg').textContent = e.message;
  }
  wrapper.replaceChildren(...sheets);
  $('previewTitle').textContent = sheets.length
    ? `A4横プリントプレビュー（${sheets.length}枚）`
    : 'A4プリントプレビュー';
  updatePreviewScale();
}

// ---- 形式・えらびかたに応じて設定項目を出し分ける ----
function syncVisibility() {
  const format = radio('format');
  document.querySelectorAll('.op-block[data-for]').forEach(el => {
    el.hidden = !el.dataset.for.split(' ').includes(format);
  });
  const source = $('source').value;
  document.querySelectorAll('[data-source]').forEach(el => {
    el.hidden = format === 'chart' ? el.dataset.source !== 'rows' : el.dataset.source !== source;
  });
  $('source').disabled = format === 'chart';
  $('order').disabled = format === 'chart';
  $('blankRateWrap').hidden = $('chartMode').value !== 'fill';
  refreshRowLabels();
}

// ---- プレビューの表示倍率（算数筆算と同じ方式） ----
const HINT_ACTUAL = '画面表示は縮小されず等倍です（横スクロールで確認できます）';
const HINT_SCALED = '画面幅に合わせて縮小表示中です（印刷はA4等倍で出力されます）';

function updatePreviewScale() {
  const wrapper = $('a4Wrapper');
  const fitToggle = $('opt-fit-width');
  const fitLabel = $('previewFitToggle');
  const hint = $('previewHint');
  const sheets = Array.from(wrapper.querySelectorAll('.sheet'));
  const available = wrapper.clientWidth;
  if (sheets.length === 0 || available === 0) {
    wrapper.classList.remove('is-scaled', 'is-overflowing');
    fitLabel.hidden = true;
    return;
  }
  const sheetWidth = sheets[0].offsetWidth;
  const overflows = sheetWidth > available + 1;
  fitLabel.hidden = !overflows;
  const scale = overflows && fitToggle.checked ? Math.max(0.2, (available - 2) / sheetWidth) : 1;
  wrapper.style.setProperty('--sheet-scale', String(scale));
  wrapper.classList.toggle('is-scaled', scale < 1);
  wrapper.classList.toggle('is-overflowing', overflows && scale === 1);
  sheets.forEach(sheet => {
    sheet.style.marginBottom = scale < 1 ? (sheet.offsetHeight * (scale - 1)) + 'px' : '';
  });
  hint.textContent = scale < 1 ? HINT_SCALED : HINT_ACTUAL;
}

let previewScaleTimer = 0;
function schedulePreviewScale() {
  clearTimeout(previewScaleTimer);
  previewScaleTimer = setTimeout(updatePreviewScale, 120);
}

// ---- にがてな字 ----
function recordMarked() {
  const units = [...new Set([...document.querySelectorAll('#a4Wrapper .marked')].map(el => el.dataset.unit))];
  if (!units.length) {
    $('errorMsg').textContent = 'プレビューの手本をクリックして、にがてな字に印を付けてください。';
    return;
  }
  store.recordWeak(units);
  document.querySelectorAll('#a4Wrapper .marked').forEach(el => el.classList.remove('marked'));
  refreshWeakList();
}

function listRow(title, meta, actions) {
  const row = document.createElement('div');
  row.className = 'list-row';
  const main = document.createElement('div');
  main.className = 'list-row-main';
  const t = document.createElement('span');
  t.className = 'list-row-title';
  t.textContent = title;
  main.appendChild(t);
  if (meta) {
    const m = document.createElement('span');
    m.className = 'list-row-meta';
    m.textContent = meta;
    main.appendChild(m);
  }
  const act = document.createElement('div');
  act.className = 'list-row-actions';
  actions.forEach(([label, cls, fn]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-small ' + cls;
    b.textContent = label;
    b.addEventListener('click', fn);
    act.appendChild(b);
  });
  row.append(main, act);
  return row;
}

function emptyRow(text) {
  const d = document.createElement('div');
  d.className = 'list-empty';
  d.textContent = text;
  return d;
}

function refreshWeakList() {
  const root = $('weakList');
  const list = store.weakList();
  root.replaceChildren(...(list.length ? list.map(w => listRow(
    w.unit, `${w.count}回 記録・${formatDate(w.last)}`,
    [['けす', 'btn-danger', () => { store.removeWeak(w.unit); refreshWeakList(); if (readConfig().source === 'weak') render(); }]],
  )) : [emptyRow('まだ記録はありません。')]));
}

// ---- プリセット ----
function refreshPresetList() {
  const root = $('presetList');
  const list = store.presets();
  root.replaceChildren(...(list.length ? list.map(p => listRow(p.name, formatDate(p.saved), [
    ['よびだす', 'btn-secondary', () => { applyConfig(p.config); render(); }],
    ['けす', 'btn-danger', () => { store.removePreset(p.id); refreshPresetList(); }],
  ])) : [emptyRow('保存したプリセットはありません。')]));
}

function savePreset() {
  const name = $('preset-name').value.trim() || summary(readConfig());
  store.addPreset(name, readConfig());
  $('preset-name').value = '';
  refreshPresetList();
}

// ---- 履歴 ----
function summary(cfg) {
  const formatName = { line: '行れんしゅう', single: '1もじじっくり', chart: '50音ひょう', word: 'ことば' }[cfg.format];
  const what = cfg.source === 'custom' && cfg.format !== 'chart'
    ? '「' + cfg.customText.replace(/\s+/g, ' ').slice(0, 12) + '」'
    : badgeText({ ...cfg, metaBadge: true }) || '';
  return `${formatName} ${what}`.trim();
}

function refreshHistoryList() {
  const root = $('historyList');
  const list = store.history();
  root.replaceChildren(...(list.length ? list.map(h => listRow(summary(h.config), formatDate(h.printed), [
    ['表示', 'btn-secondary', () => { applyConfig(h.config); currentSeed = h.seed; render(); }],
  ])) : [emptyRow('まだ印刷した記録はありません。')]));
}

function formatDate(ts) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ---- イベント ----
buildRowPicker();

const saved = store.loadLast();
applyConfig(saved || { rows: DEFAULT_ROWS });

document.querySelector('.control-panel').addEventListener('change', e => {
  if (e.target.id === 'recommend') {
    const preset = RECOMMEND[e.target.value];
    if (preset) applyConfig(preset);
  }
  if (e.target.id === 'preset-name') return;
  render();
});
let inputTimer = 0;
['customText', 'meta-title'].forEach(id => $(id).addEventListener('input', () => {
  clearTimeout(inputTimer);
  inputTimer = setTimeout(render, 300);
}));

$('generateBtn').addEventListener('click', () => { currentSeed = newSeed(); render(); });
$('printBtn').addEventListener('click', () => window.print());
window.addEventListener('beforeprint', () => {
  if (!$('a4Wrapper').querySelector('.sheet')) return;
  store.addHistory(readConfig(), currentSeed);
  refreshHistoryList();
});
$('presetSaveBtn').addEventListener('click', savePreset);
$('weakRecordBtn').addEventListener('click', recordMarked);

$('a4Wrapper').addEventListener('click', e => {
  const target = e.target.closest('.cell-model[data-unit], .big-glyph[data-unit]');
  if (!target) return;
  // 手本の列は同じ字が並ぶので、同じまとまりの手本にまとめて印を付ける
  const on = !target.classList.contains('marked');
  const block = target.closest('.unit-block') || target;
  block.querySelectorAll('.cell-model, .big-glyph').forEach(el => {
    if (el.dataset.unit === target.dataset.unit) el.classList.toggle('marked', on);
  });
  if (block === target) target.classList.toggle('marked', on);
});

// 設定メニューは一度に1項目だけ開く（details の name 属性に未対応のブラウザ向け）
const accordions = Array.from(document.querySelectorAll('.settings-accordion'));
accordions.forEach(details => details.addEventListener('toggle', () => {
  if (!details.open) return;
  accordions.forEach(other => { if (other !== details) other.open = false; });
}));

window.addEventListener('resize', schedulePreviewScale);
window.addEventListener('orientationchange', schedulePreviewScale);
$('opt-fit-width').addEventListener('change', updatePreviewScale);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(updatePreviewScale);

render();
refreshPresetList();
refreshHistoryList();
refreshWeakList();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
