# ひらがな れんしゅうプリント ジェネレーター

幼稚園児・小学1年生向けに、マスにひらがな・カタカナを書いて練習する**A4プリント**をブラウザ上で作成・印刷できるアプリです。
姉妹アプリ「算数 筆算プリント ジェネレーター」「漢字問題ジェネレーター」とデザイン・UIをそろえています。

## このアプリでできること

- 4つの形式
  - **行れんしゅう**：1行に1文字。手本 → なぞり（だんだんうすく）→ 空マス
  - **1もじじっくり**：大きな手本（書き順の番号・書きはじめの●）、1画ずつの書き順図、例のことば（絵つき）、なぞり・空マス
  - **50音ひょう**：ぜんぶなぞる／穴うめ（空欄の割合を指定）／白紙（あ段だけ表示）。こたえのページつき
  - **ことば**：「あり」「いぬ」など、絵（絵文字）＋手本＋なぞり＋空マス
- ひらがな／カタカナ、せいおん・だくおん・はんだくおん・ようおん（きゃ・しゅ…）を行ごとに選択
- 自由入力（名前の字や好きなことば）、記録した「にがてな字」だけで作成
- 用紙の向き（A4縦・横）と書く向き（横書き・縦書き）を個別に指定。縦書きは国語ノートと同じく右から左へ行が進みます
- マスの大きさ（特大30mm／大24mm／中20mm／小16mm）、なぞる数、十字の点線
- 字のかたち：教科書体風（Klee One）／UDデジタル教科書体（Windowsのみ）／まるもじ／えんぴつ風（書き順データ）。なぞり字は「うすい字」か「点線」
- あいうえお順／ばらばら、セット数（1〜5）
- なまえ・日付・組・番号・はなまる欄
- おすすめ設定（年少・年中／年長／小学1年 など）
- プリセット保存、印刷履歴（同じ並びを再現）、にがてな字の記録（プレビューの手本をクリックして印を付ける）。いずれもブラウザの localStorage に保存し、ログインやサーバー側の保存はありません
- スマートフォン対応、PWA（オフラインでも作成可能）

## 手元で動かす

必要なもの：[Node.js](https://nodejs.org/) 20以上

```bash
npm install
npm start        # wrangler dev（http://localhost:8787）
```

`public/` は静的ファイルだけで動くので、任意の静的サーバーで配信しても使えます（ES Modules を使うため `file://` で直接開くことはできません）。

## デプロイ（Cloudflare Workers）

```bash
npx wrangler login
npm run deploy
```

独自ドメインを使う場合は `wrangler.jsonc` に `routes` を追加してください。

## ファイル構成

| ファイル | 役割 |
|---|---|
| `public/index.html` | 画面（設定パネル・プレビュー） |
| `public/app.js` | 設定の読み書き、文字・ことばの選択、用紙ヘッダー、プレビュー、プリセット・履歴・にがて記録の画面 |
| `public/sheets.js` | 4形式の割り付けと改ページ。縦書き・横書きは CSS の `writing-mode` で切り替え、計算は共通 |
| `public/render.js` | マス1つと字（フォント／書き順データ）の描画 |
| `public/kana.js` | 行データ、ことばリスト、ひらがな⇔カタカナ変換 |
| `public/store.js` | localStorage への保存 |
| `public/data/strokes.js` | 書き順データ（自動生成） |
| `tools/build-strokes.mjs` | KanjiVG から書き順データを作り直すスクリプト（`npm run build:strokes`） |

## ライセンス・クレジット

- 書き順データ：[KanjiVG](https://kanjivg.tagaini.net/)（© Ulrich Apel, [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)）。`public/data/strokes.js` は KanjiVG から作った派生データのため、同じ CC BY-SA 3.0 が適用されます。
- フォント：Klee One、Zen Maru Gothic、Noto Sans JP、Shippori Mincho（Google Fonts、SIL Open Font License）
