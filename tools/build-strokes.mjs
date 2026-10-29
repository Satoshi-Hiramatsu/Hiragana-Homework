// KanjiVG（https://kanjivg.tagaini.net/ CC BY-SA 3.0）からひらがな・カタカナの
// 書き順データを取得し、public/data/strokes.js に書き出す保守用スクリプト。
//   node tools/build-strokes.mjs
// 出力形式: { "あ": { s: ["M31.01,33c...", ...], n: [[22.51,35], ...] }, ... }
//   s = 画ごとのパス（viewBox 0 0 109 109）、n = 画番号の表示位置
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data', 'strokes.js');

const chars = [];
for (let c = 0x3041; c <= 0x3093; c++) chars.push(c); // ぁ〜ん
for (let c = 0x30a1; c <= 0x30f4; c++) chars.push(c); // ァ〜ヴ
chars.push(0x30fc); // ー

function parse(svg) {
  const pathGroup = svg.split('kvg:StrokeNumbers_')[0];
  const s = [...pathGroup.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map(m => m[1]);
  const n = [...svg.matchAll(/<text transform="matrix\(1 0 0 1 ([\d.]+) ([\d.]+)\)">\d+<\/text>/g)]
    .map(m => [Number(m[1]), Number(m[2])]);
  return { s, n };
}

async function fetchOne(code) {
  const name = code.toString(16).padStart(5, '0') + '.svg';
  const res = await fetch(BASE + name);
  if (!res.ok) return null;
  return parse(await res.text());
}

const data = {};
const missing = [];
for (let i = 0; i < chars.length; i += 12) {
  const batch = chars.slice(i, i + 12);
  const results = await Promise.all(batch.map(fetchOne));
  batch.forEach((code, j) => {
    const ch = String.fromCodePoint(code);
    if (results[j] && results[j].s.length) data[ch] = results[j];
    else missing.push(ch);
  });
}

await mkdir(dirname(OUT), { recursive: true });
const header = '// 自動生成ファイル（tools/build-strokes.mjs）。手で編集しないでください。\n'
  + '// 書き順データ: KanjiVG (https://kanjivg.tagaini.net/) © Ulrich Apel, CC BY-SA 3.0\n';
await writeFile(OUT, header + 'export default ' + JSON.stringify(data) + ';\n');
console.log(`${Object.keys(data).length} 文字を書き出しました: ${OUT}`);
if (missing.length) console.log('取得できなかった文字: ' + missing.join(' '));
