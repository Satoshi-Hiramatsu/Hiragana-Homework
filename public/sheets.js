// 4つの形式（行れんしゅう・1もじじっくり・50音ひょう・ことば）の用紙本文を組み立てる。
// 用紙はいつも A4 横、字は縦書きで右から左へ進む。縦書きは CSS の writing-mode に任せ、ここでは
//   inline = 1列の長さ（上から下）、block = 列が積み重なる向きの長さ（右から左）
// として割り付ける。寸法はすべて mm。
import { cell, pictureCell, strokeGlyph, hasStrokes, strokeCount, traceColor, INK } from './render.js';
import { isSmall } from './kana.js';

const PAD_X = 12;
const PAD_TOP = 10;
const PAD_BOTTOM = 10;
const HEADER = 18; // 用紙ヘッダー（タイトル・なまえ欄）の高さ＋余白

export function paperDims() {
  const pw = 297;
  const ph = 210;
  const bodyW = pw - PAD_X * 2;
  const bodyH = ph - PAD_TOP - PAD_BOTTOM - HEADER;
  return { pw, ph, bodyW, bodyH, inline: bodyH, block: bodyW };
}

// ---- 乱数（履歴から同じ用紙を再現できるようにシードつき） ----
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffle(list, rng) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---- 行への流し込み ----
// group = { cells: [cellSpec...], pic?: emoji, gapBefore: mm }
function groupLength(g, s) { return g.pic !== undefined ? s : g.cells.length * s; }

function flow(groups, cap, s) {
  const lines = [];
  let line = null;
  for (const g of groups) {
    const len = groupLength(g, s);
    const gap = line && line.items.length ? (g.gapBefore || 0) : 0;
    if (line && line.used + gap + len <= cap + 0.01) {
      line.items.push({ group: g, gap });
      line.used += gap + len;
      continue;
    }
    if (len > cap + 0.01) {
      // 1行に入りきらない長いことばはマス単位で折り返す
      const per = Math.max(1, Math.floor(cap / s));
      for (let i = 0; i < g.cells.length; i += per) {
        const part = { ...g, cells: g.cells.slice(i, i + per) };
        line = { items: [{ group: part, gap: 0 }], used: part.cells.length * s };
        lines.push(line);
      }
      continue;
    }
    line = { items: [{ group: g, gap: 0 }], used: len };
    lines.push(line);
  }
  return lines;
}

// base のあとに空マスのグループを、target 行に収まるだけ足す。
// atLeastOne のときは、行を1つ増やしてでも最低1つ足す。
function fillWithBlanks(base, makeBlank, cap, s, target, atLeastOne = true) {
  let groups = base.slice();
  let limit = Math.max(target, flow(groups, cap, s).length);
  let added = 0;
  for (let guard = 0; guard < 400; guard++) {
    const next = groups.concat([makeBlank()]);
    if (flow(next, cap, s).length > limit) {
      if (added === 0 && atLeastOne) { limit++; continue; }
      break;
    }
    groups = next;
    added++;
  }
  return flow(groups, cap, s);
}

function renderLine(line, s, ctx) {
  const el = document.createElement('div');
  el.className = 'line';
  for (const { group, gap } of line.items) {
    if (gap) {
      const sp = document.createElement('div');
      sp.className = 'spacer';
      sp.style.inlineSize = gap + 'mm';
      el.appendChild(sp);
    }
    if (group.pic !== undefined) {
      el.appendChild(pictureCell(group.pic, s));
      continue;
    }
    const wrap = document.createElement('div');
    wrap.className = 'cell-group';
    group.cells.forEach(spec => wrap.appendChild(cell(spec, s, ctx)));
    el.appendChild(wrap);
  }
  return el;
}

function cellsOf(text, kind, extra = {}) {
  return [...text].map(ch => ({ kind, ch, ...extra }));
}

function traceGroups(text, count, ctx, gapBefore, unit) {
  const groups = [];
  for (let i = 0; i < count; i++) {
    groups.push({ cells: cellsOf(text, 'trace', { color: traceColor(i, count, ctx.fade), unit }), gapBefore });
  }
  return groups;
}

// ブロック（1単位分の行のまとまり）を、用紙の block 方向に詰めてページに分ける。
function paginate(blocks, dims, gapBetween) {
  const pages = [];
  let page = null;
  for (const b of blocks) {
    const need = (page && page.items.length ? gapBetween : 0) + b.size;
    if (!page || page.used + need > dims.block + 0.01) {
      page = { items: [], used: 0 };
      pages.push(page);
      page.items.push(b);
      page.used = b.size;
    } else {
      page.items.push(b);
      page.used += need;
    }
  }
  return pages;
}

function makeBody(dims) {
  const body = document.createElement('div');
  body.className = 'sheet-body';
  body.style.width = dims.bodyW + 'mm';
  body.style.height = dims.bodyH + 'mm';
  return body;
}

// centerBlock のときは、ページの列が少なくても左右（block 方向）の中央に置く
function pagesToBodies(pages, dims, gapBetween, maxUsed, centerBlock = false) {
  return pages.map(page => {
    const body = makeBody(dims);
    // 行の長さがそろうので、余った分を inline 方向の前後に振り分けて中央に置く
    body.style.paddingInlineStart = Math.max(0, (dims.inline - maxUsed) / 2) + 'mm';
    if (centerBlock) body.style.paddingBlockStart = Math.max(0, (dims.block - page.used) / 2) + 'mm';
    page.items.forEach((b, i) => {
      if (i > 0) b.el.style.marginBlockStart = gapBetween + 'mm';
      body.appendChild(b.el);
    });
    return body;
  });
}

const GAP_IN = 1.5;  // 同じ単位の行どうし
const SLOT_GAP = 2;  // 拗音など2マス以上の単位どうし
const WORD_GAP = 3;  // ことばどうし

function unitBlock(lines, s, ctx, cls) {
  const el = document.createElement('div');
  el.className = 'unit-block ' + (cls || '');
  lines.forEach((line, i) => {
    const lineEl = renderLine(line, s, ctx);
    if (i > 0) lineEl.style.marginBlockStart = GAP_IN + 'mm';
    el.appendChild(lineEl);
  });
  return { el, size: lines.length * s + (lines.length - 1) * GAP_IN, used: Math.max(...lines.map(l => l.used)) };
}

// だんだんうすくするときは、列ごとに濃さを変える。
// 右の列から 手本 → なぞり（濃い）→ なぞり（うすい）の3列。
// head は手本の列の先頭に置くもの（ことばの絵）。なぞりの列は同じ長さの空きをあけてそろえる。
const FADE_TRACE_LINES = 2;

function fadeColumnsBlock(text, dims, s, ctx, { gap, head } = {}) {
  const lead = head ? s + gap : 0;
  const len = [...text].length * s;
  const count = Math.max(1, Math.floor((dims.inline - lead + gap + 0.01) / (len + gap)));
  const column = (first, kind, extra) => flow(
    (first ? [first] : []).concat(Array.from({ length: count },
      () => ({ cells: cellsOf(text, kind, { unit: text, ...extra }), gapBefore: gap }))),
    dims.inline, s);
  const lines = [column(head, 'model', {})];
  for (let i = 0; i < FADE_TRACE_LINES; i++) {
    const spacer = head ? { cells: [{ kind: 'void' }], gapBefore: 0 } : null;
    lines.push(column(spacer, 'trace', { color: traceColor(i, FADE_TRACE_LINES, true) }));
  }
  return unitBlock(lines.flat(), s, ctx);
}

// ===== A. 行れんしゅう =====
// 1文字ぶんは、右上に 4マス分（2×2）の大きな手本を1つ。
// その下の右の列は上から traceCount 個をうすいなぞり字、残りを空マスにする。
// 手本の下の左の列と、さらに左へ続く列は空マス。
//   cfg.blankCols: 書く列（空マスの列）の数。手本の下の左の列も1つに数える。
// kindAt(i): i 個目（0始まり）のマスの種類と追加の指定
function repeatLine(unit, kindAt, cap, s, gap) {
  const len = [...unit].length * s;
  const count = Math.max(1, Math.floor((cap + gap + 0.01) / (len + gap)));
  return flow(Array.from({ length: count }, (_, i) => {
    const [kind, extra] = kindAt(i);
    return { cells: cellsOf(unit, kind, { unit, ...extra }), gapBefore: gap };
  }), cap, s)[0];
}
const BLANK = () => ['blank', {}];

function bigModelBlock(unit, dims, s, ctx, blankCols, traceCount) {
  const chars = [...unit];
  const gap = chars.length > 1 ? SLOT_GAP : 0;
  // 幅は2列ぶん（列のすきまも含む）、高さは2マスぶんにして、下と左の列にそろえる
  const big = s * 2;
  const rest = dims.inline - big * chars.length;

  const el = document.createElement('div');
  el.className = 'unit-block big-model-block';
  const top = document.createElement('div');
  top.className = 'line';
  const model = document.createElement('div');
  model.className = 'cell-group';
  // 大きな手本には、設定にかかわらず書き順の番号をすべて付ける
  const modelCtx = { ...ctx, strokeNumbers: true };
  chars.forEach(ch => {
    const box = cell({ kind: 'model', ch, unit }, big, modelCtx);
    box.style.blockSize = (big + GAP_IN) + 'mm';
    model.appendChild(box);
  });
  top.appendChild(model);

  const under = document.createElement('div');
  under.className = 'under-model';
  const traceColorValue = traceColor(0, 1, false);
  const trace = repeatLine(unit, i => (i < traceCount ? ['trace', { color: traceColorValue }] : BLANK()), rest, s, gap);
  const firstBlank = repeatLine(unit, BLANK, rest, s, gap);
  const traceEl = renderLine(trace, s, ctx);
  const blankEl = renderLine(firstBlank, s, ctx);
  blankEl.style.marginBlockStart = GAP_IN + 'mm';
  under.append(traceEl, blankEl);
  top.appendChild(under);
  el.appendChild(top);

  let used = big * chars.length + trace.used;
  for (let i = 1; i < blankCols; i++) {
    const line = repeatLine(unit, BLANK, dims.inline, s, gap);
    const lineEl = renderLine(line, s, ctx);
    lineEl.style.marginBlockStart = GAP_IN + 'mm';
    el.appendChild(lineEl);
    used = Math.max(used, line.used);
  }
  const cols = blankCols + 1; // なぞりの列 + 書く列
  return { el, size: cols * s + (cols - 1) * GAP_IN, used };
}

// 1枚に並べる文字の数を決め、用紙の幅（右から左）にぴったり収まるようにマスの大きさを合わせる。
// ページの数を1枚から順に試し、文字をページに均等に分けたときのマスの大きさが、
// 選んだ大きさにいちばん近い分け方を選ぶ（あ行の5文字なら、5文字で1枚をちょうど埋める）。
// 大きくするのは、1列に 手本2マス + なぞり + 空マス1つ が入るところまで。
// n 文字で用紙の幅をちょうど埋めるマスの大きさ
function sizeForCount(n, cols, block, between) {
  return ((block - (n - 1) * between) / n - (cols - 1) * GAP_IN) / cols;
}

function fitCellSize(s, cols, block, between, total, maxSize) {
  const sizeFor = n => sizeForCount(n, cols, block, between);
  let best = null;
  for (let pages = 1; pages <= Math.max(1, total); pages++) {
    const size = sizeFor(Math.ceil(Math.max(1, total) / pages));
    if (size > maxSize) continue;
    if (best === null || Math.abs(size - s) < Math.abs(best - s)) best = size;
  }
  if (best === null) best = maxSize; // 文字が少なすぎて埋めきれないときは上限の大きさで右から並べる
  return Math.floor(best * 100) / 100; // 端数で次の列がはみ出さないよう切り捨てる
}

// groups を渡したとき（行からえらんで、あいうえお順）は、1つの行を1ページにする。
// マスはいちばん字の多い行（ふつうは5文字）で用紙の幅がちょうど埋まる大きさにそろえ、
// 字の少ない行（や行・わ行など）は左右の中央に置く。
export function buildLinePages(cfg, units, ctx, groups) {
  const dims = paperDims(cfg);
  const between = 5;
  const cols = cfg.blankCols + 1;
  const maxSize = dims.inline / (2 + Math.max(1, cfg.traceCount) + 1);
  const block = unit => bigModelBlock(unit, dims, s, ctx, cfg.blankCols, cfg.traceCount);
  let s;
  if (groups && groups.length) {
    const most = Math.max(...groups.map(g => g.length));
    s = Math.floor(Math.min(sizeForCount(most, cols, dims.block, between), maxSize) * 100) / 100;
    const pages = groups.map(g => {
      const items = g.map(block);
      return { items, used: items.reduce((sum, b) => sum + b.size, 0) + (items.length - 1) * between };
    });
    const maxUsed = Math.max(0, ...pages.flatMap(p => p.items.map(b => b.used)));
    return pagesToBodies(pages, dims, between, maxUsed, true);
  }
  s = fitCellSize(cfg.cellSize, cols, dims.block, between, units.length, maxSize);
  const blocks = units.map(block);
  const maxUsed = Math.max(0, ...blocks.map(b => b.used));
  return pagesToBodies(paginate(blocks, dims, between), dims, between, maxUsed);
}

// ===== D. ことばれんしゅう =====
export function buildWordPages(cfg, words, ctx) {
  const dims = paperDims(cfg);
  const s = cfg.cellSize;
  if (ctx.fade) {
    const blocks = words.map(w => fadeColumnsBlock(w.text, dims, s, ctx,
      { gap: WORD_GAP, head: cfg.showPicture ? { pic: w.pic || '', gapBefore: 0 } : null }));
    const maxUsed = Math.max(0, ...blocks.map(b => b.used));
    return pagesToBodies(paginate(blocks, dims, 5), dims, 5, maxUsed);
  }
  const blocks = words.map(w => {
    const base = [];
    if (cfg.showPicture) base.push({ pic: w.pic || '', gapBefore: 0 });
    base.push({ cells: cellsOf(w.text, 'model', { unit: w.text }), gapBefore: WORD_GAP });
    base.push(...traceGroups(w.text, cfg.traceCount, ctx, WORD_GAP, w.text));
    // 空マスだけの列を足すと、絵の下にそろわない半端な列になるので足さない
    const lines = fillWithBlanks(base, () => ({ cells: cellsOf(w.text, 'blank'), gapBefore: WORD_GAP }),
      dims.inline, s, cfg.linesPerUnit, false);
    return unitBlock(lines, s, ctx);
  });
  const maxUsed = Math.max(0, ...blocks.map(b => b.used));
  return pagesToBodies(paginate(blocks, dims, 4), dims, 4, maxUsed);
}

// ===== B. 1もじじっくり =====
function bigGlyphBox(ch, size, ctx) {
  const box = document.createElement('div');
  box.className = 'big-glyph guides';
  box.style.inlineSize = size + 'mm';
  box.style.blockSize = size + 'mm';
  box.style.setProperty('--cell', size + 'mm');
  box.dataset.unit = ch;
  if (hasStrokes(ch)) {
    box.appendChild(strokeGlyph(ch, { numbers: true, startDots: ctx.startDots, width: 3.6, numberSize: 9 }));
  } else {
    const span = document.createElement('span');
    span.className = 'glyph-text';
    span.textContent = ch;
    span.style.color = INK;
    box.appendChild(span);
  }
  if (isSmall(ch)) box.firstChild.classList.add('v-small');
  if (ch === 'ー') box.firstChild.classList.add('v-rotate');
  return box;
}

function strokeSteps(ch, size) {
  const wrap = document.createElement('div');
  wrap.className = 'stroke-steps';
  const n = strokeCount(ch);
  for (let i = 0; i < n; i++) {
    const step = document.createElement('div');
    step.className = 'step-cell guides';
    step.style.inlineSize = size + 'mm';
    step.style.blockSize = size + 'mm';
    step.appendChild(strokeGlyph(ch, { upTo: i, current: i, startDots: true, width: 4.5 }));
    wrap.appendChild(step);
  }
  return wrap;
}

export function buildSinglePages(cfg, units, ctx, findWord) {
  const dims = paperDims(cfg);
  const s = cfg.cellSize;
  const P = Math.min(42, dims.block * 0.3);
  const stepSize = Math.min(15, P * 0.42);
  const blocks = units.map(unit => {
    const el = document.createElement('div');
    el.className = 'unit-block single-block';
    const panel = document.createElement('div');
    panel.className = 'info-panel';
    panel.style.blockSize = P + 'mm';
    const chars = [...unit];
    chars.forEach(ch => panel.appendChild(bigGlyphBox(ch, P, ctx)));
    if (chars.length === 1) {
      const side = document.createElement('div');
      side.className = 'info-side';
      const label = document.createElement('div');
      label.className = 'info-label';
      label.textContent = 'かきじゅん';
      side.appendChild(label);
      side.appendChild(strokeSteps(chars[0], stepSize));
      panel.appendChild(side);
    }
    const word = findWord ? findWord(unit) : null;
    if (word) {
      const ex = document.createElement('div');
      ex.className = 'info-word';
      const pic = document.createElement('span');
      pic.className = 'info-word-pic';
      pic.textContent = word.pic || '';
      const txt = document.createElement('span');
      txt.className = 'info-word-text';
      txt.textContent = word.text;
      ex.append(pic, txt);
      panel.appendChild(ex);
    }
    el.appendChild(panel);

    const gap = chars.length > 1 ? SLOT_GAP : 0;
    const base = traceGroups(unit, cfg.traceCount, ctx, gap, unit);
    const lines = fillWithBlanks(base, () => ({ cells: cellsOf(unit, 'blank'), gapBefore: gap }),
      dims.inline, s, cfg.singleLines);
    let used = 0;
    lines.forEach(line => {
      const lineEl = renderLine(line, s, ctx);
      lineEl.style.marginBlockStart = (GAP_IN * 2) + 'mm';
      el.appendChild(lineEl);
      used = Math.max(used, line.used);
    });
    return { el, size: P + lines.length * (s + GAP_IN * 2), used };
  });
  const between = 7;
  const pages = paginate(blocks, dims, between);
  return pages.map(page => {
    const body = makeBody(dims);
    page.items.forEach((b, i) => {
      if (i > 0) {
        b.el.style.marginBlockStart = between / 2 + 'mm';
        b.el.style.paddingBlockStart = between / 2 + 'mm';
        b.el.classList.add('with-rule');
      }
      body.appendChild(b.el);
    });
    return body;
  });
}

// ===== C. 50音ひょう =====
// sections: [{ label, rows: [[unit|null, ...], ...] }]
export function buildChartPages(cfg, sections, ctx, rng, answer) {
  const dims = paperDims(cfg);
  const LINE_GAP = 1;
  const SECTION_GAP = 8;
  const blocks = sections.map(sec => {
    const slotChars = Math.max(...sec.rows.flat().filter(Boolean).map(u => [...u].length), 1);
    const slots = Math.max(...sec.rows.map(r => r.length));
    const slotGap = slotChars > 1 ? SLOT_GAP : 0;
    const fitInline = (dims.inline - slotGap * (slots - 1)) / (slots * slotChars);
    const fitBlock = (dims.block - LINE_GAP * (sec.rows.length - 1)) / sec.rows.length;
    const s = Math.min(cfg.cellSize * 1.25, fitInline, fitBlock);

    const el = document.createElement('div');
    el.className = 'unit-block chart-block';
    let used = 0;
    sec.rows.forEach((row, ri) => {
      const groups = row.map((unit, ci) => {
        const gapBefore = slotGap;
        if (!unit) return { cells: Array.from({ length: slotChars }, () => ({ kind: 'void' })), gapBefore };
        let kind = 'model';
        if (!answer) {
          if (cfg.chartMode === 'trace') kind = 'trace';
          else if (cfg.chartMode === 'blank') kind = ci === 0 ? 'model' : 'blank';
          else if (rng() < cfg.blankRate / 100) kind = 'blank';
        }
        const color = kind === 'trace' ? traceColor(0, 1, false) : INK;
        return { cells: cellsOf(unit, kind, { color, unit: kind === 'model' ? unit : undefined }), gapBefore };
      });
      const line = flow(groups, Infinity, s)[0];
      const lineEl = renderLine(line, s, ctx);
      if (ri > 0) lineEl.style.marginBlockStart = LINE_GAP + 'mm';
      el.appendChild(lineEl);
      used = Math.max(used, line.used);
    });
    return { el, size: sec.rows.length * s + (sec.rows.length - 1) * LINE_GAP, used };
  });
  const pages = paginate(blocks, dims, SECTION_GAP);
  return pages.map(page => {
    const body = makeBody(dims);
    const maxUsed = Math.max(...page.items.map(b => b.used));
    body.style.paddingInlineStart = Math.max(0, (dims.inline - maxUsed) / 2) + 'mm';
    page.items.forEach((b, i) => {
      if (i > 0) b.el.style.marginBlockStart = SECTION_GAP + 'mm';
      body.appendChild(b.el);
    });
    return body;
  });
}
