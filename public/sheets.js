// 4つの形式（行れんしゅう・1もじじっくり・50音ひょう・ことば）の用紙本文を組み立てる。
// 縦書き・横書きの違いは CSS の writing-mode に任せ、ここでは
//   inline = 1行の進む向きの長さ、block = 行が積み重なる向きの長さ
// として、どちらの向きでも同じ計算で割り付ける。寸法はすべて mm。
import { cell, pictureCell, strokeGlyph, hasStrokes, strokeCount, traceColor, INK } from './render.js';
import { isSmall } from './kana.js';

const PAD_X = 12;
const PAD_TOP = 10;
const PAD_BOTTOM = 10;
const HEADER = 18; // 用紙ヘッダー（タイトル・なまえ欄）の高さ＋余白

export function paperDims(cfg) {
  const landscape = cfg.paper === 'landscape';
  const pw = landscape ? 297 : 210;
  const ph = landscape ? 210 : 297;
  const bodyW = pw - PAD_X * 2;
  const bodyH = ph - PAD_TOP - PAD_BOTTOM - HEADER;
  const vertical = cfg.direction === 'tate';
  return {
    pw, ph, bodyW, bodyH, vertical,
    inline: vertical ? bodyH : bodyW,
    block: vertical ? bodyW : bodyH,
  };
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

// base のあとに空マスのグループを、target 行に収まるだけ足す（最低1つ）。
function fillWithBlanks(base, makeBlank, cap, s, target) {
  let groups = base.slice();
  let limit = Math.max(target, flow(groups, cap, s).length);
  let added = 0;
  for (let guard = 0; guard < 400; guard++) {
    const next = groups.concat([makeBlank()]);
    if (flow(next, cap, s).length > limit) {
      if (added === 0) { limit++; continue; }
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
  body.className = 'sheet-body' + (dims.vertical ? ' vertical' : '');
  body.style.width = dims.bodyW + 'mm';
  body.style.height = dims.bodyH + 'mm';
  return body;
}

function pagesToBodies(pages, dims, gapBetween, maxUsed) {
  return pages.map(page => {
    const body = makeBody(dims);
    // 行の長さがそろうので、余った分を inline 方向の前後に振り分けて中央に置く
    body.style.paddingInlineStart = Math.max(0, (dims.inline - maxUsed) / 2) + 'mm';
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

// ===== A. 行れんしゅう =====
export function buildLinePages(cfg, units, ctx) {
  const dims = paperDims(cfg);
  const s = cfg.cellSize;
  const blocks = units.map(unit => {
    const gap = [...unit].length > 1 ? SLOT_GAP : 0;
    const base = [{ cells: cellsOf(unit, 'model', { unit }), gapBefore: gap }]
      .concat(traceGroups(unit, cfg.traceCount, ctx, gap, unit));
    const lines = fillWithBlanks(base, () => ({ cells: cellsOf(unit, 'blank'), gapBefore: gap }),
      dims.inline, s, cfg.linesPerUnit);
    return unitBlock(lines, s, ctx);
  });
  const between = cfg.linesPerUnit > 1 ? 5 : 2.5;
  const maxUsed = Math.max(0, ...blocks.map(b => b.used));
  return pagesToBodies(paginate(blocks, dims, between), dims, between, maxUsed);
}

// ===== D. ことばれんしゅう =====
export function buildWordPages(cfg, words, ctx) {
  const dims = paperDims(cfg);
  const s = cfg.cellSize;
  const blocks = words.map(w => {
    const base = [];
    if (cfg.showPicture) base.push({ pic: w.pic || '', gapBefore: 0 });
    base.push({ cells: cellsOf(w.text, 'model', { unit: w.text }), gapBefore: WORD_GAP });
    base.push(...traceGroups(w.text, cfg.traceCount, ctx, WORD_GAP, w.text));
    const lines = fillWithBlanks(base, () => ({ cells: cellsOf(w.text, 'blank'), gapBefore: WORD_GAP }),
      dims.inline, s, cfg.linesPerUnit);
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
  if (ctx.vertical && isSmall(ch)) box.firstChild.classList.add('v-small');
  if (ctx.vertical && ch === 'ー') box.firstChild.classList.add('v-rotate');
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
