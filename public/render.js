// マス1つ分と字（フォント／書き順データ）を描く。寸法はすべて mm。
import STROKES from './data/strokes.js';
import { isSmall } from './kana.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const VIEW = 109; // KanjiVG の座標系

export const INK = '#1a1a1a';
const START_DOT = '#c0392b';

export function hasStrokes(ch) { return Boolean(STROKES[ch]); }
export function strokeCount(ch) { return STROKES[ch] ? STROKES[ch].s.length : 0; }

// なぞり字の色。fade のときは前のマスほど濃く、あとのマスほど薄くする。
export function traceColor(index, total, fade) {
  if (!fade || total <= 1) return '#b4b4b4';
  const t = index / (total - 1);
  const v = Math.round(0x8c + (0xd2 - 0x8c) * t);
  return '#' + v.toString(16).repeat(3);
}

function svgEl(name, attrs) {
  const el = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function startPoint(d) {
  const m = d.match(/^M\s*([\d.]+)[ ,]([\d.]+)/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

// 書き順データで字を描く。
//   upTo: その画までを描く（書き順図用）。current: 強調する画（0始まり）
export function strokeGlyph(ch, opt = {}) {
  const data = STROKES[ch];
  const svg = svgEl('svg', { viewBox: `0 0 ${VIEW} ${VIEW}`, class: 'glyph-svg', 'aria-hidden': 'true' });
  const width = opt.width ?? 4.2;
  const count = opt.upTo != null ? opt.upTo + 1 : data.s.length;
  for (let i = 0; i < count; i++) {
    let color = opt.color ?? INK;
    if (opt.current != null && i < opt.current) color = '#c4c4c4';
    const attrs = {
      d: data.s[i], fill: 'none', stroke: color, 'stroke-width': width,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    };
    if (opt.dotted) {
      attrs['stroke-dasharray'] = `0.1 ${width * 1.9}`;
      attrs['stroke-width'] = width * 0.95;
    }
    svg.appendChild(svgEl('path', attrs));
  }
  if (opt.startDots) {
    const targets = opt.current != null ? [opt.current] : data.s.map((_, i) => i);
    targets.forEach(i => {
      const p = startPoint(data.s[i]);
      if (p) svg.appendChild(svgEl('circle', { cx: p[0], cy: p[1], r: width * 0.95, fill: START_DOT }));
    });
  }
  if (opt.numbers) {
    const targets = opt.current != null ? [opt.current] : data.n.map((_, i) => i);
    const size = opt.numberSize ?? 11;
    targets.forEach(i => {
      const pos = data.n[i];
      if (!pos) return;
      const t = svgEl('text', {
        x: pos[0] - 1, y: pos[1] + 1, 'font-size': size, fill: START_DOT,
        'font-family': 'Noto Sans JP, sans-serif', 'font-weight': 700,
        stroke: '#fff', 'stroke-width': 3, 'paint-order': 'stroke', 'text-anchor': 'middle',
      });
      t.textContent = String(i + 1);
      svg.appendChild(t);
    });
  }
  return svg;
}

function textGlyph(ch, color) {
  const span = document.createElement('span');
  span.className = 'glyph-text';
  span.textContent = ch;
  span.style.color = color;
  return span;
}

// 1文字ぶんの字を作る。
//   kind: 'model' | 'trace'。ctx: { glyph, traceStyle, strokeNumbers, startDots, vertical }
export function glyph(ch, kind, ctx, color) {
  const canStroke = hasStrokes(ch);
  const dotted = kind === 'trace' && ctx.traceStyle === 'dot';
  // 書き順の番号はフォントの字形と位置が合わないので、番号つきの手本は書き順データで描く
  const numbered = kind === 'model' && ctx.strokeNumbers;
  const wantsStroke = ctx.glyph === 'stroke' || dotted || numbered;
  let el;
  if (wantsStroke && canStroke) {
    el = strokeGlyph(ch, {
      color: dotted ? '#6f6f6f' : color,
      dotted,
      numbers: numbered,
      startDots: numbered && ctx.startDots,
    });
  } else {
    el = textGlyph(ch, color);
  }
  // 縦書きでは小書き文字を右上に寄せ、長音記号は縦にする（字そのものは横書き用の形で持っている）
  if (ctx.vertical && isSmall(ch)) el.classList.add('v-small');
  if (ctx.vertical && ch === 'ー') el.classList.add('v-rotate');
  return el;
}

// マス1つ。spec: { kind: 'model'|'trace'|'blank'|'void', ch, color, unit }
export function cell(spec, size, ctx) {
  const div = document.createElement('div');
  div.className = 'cell cell-' + spec.kind + (ctx.guides ? ' guides' : '');
  div.style.inlineSize = size + 'mm';
  div.style.blockSize = size + 'mm';
  div.style.setProperty('--cell', size + 'mm');
  if (spec.unit) div.dataset.unit = spec.unit;
  if (spec.ch && (spec.kind === 'model' || spec.kind === 'trace')) {
    div.appendChild(glyph(spec.ch, spec.kind, ctx, spec.color ?? INK));
  }
  return div;
}

// ことばれんしゅうの絵の欄
export function pictureCell(emoji, size) {
  const div = document.createElement('div');
  div.className = 'pic' + (emoji ? '' : ' pic-empty');
  div.style.inlineSize = size + 'mm';
  div.style.blockSize = size + 'mm';
  div.style.setProperty('--cell', size + 'mm');
  div.textContent = emoji || 'え';
  return div;
}
