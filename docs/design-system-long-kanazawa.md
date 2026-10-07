# design.md — 株式会社ロング 金沢 コーポレートサイト

現行サイト <https://www.long-kanazawa.com/> のデザインシステム仕様書。
実装（WordPress テーマ `long-kanazawa.com` / Tailwind CSS v3.4.4）から実測・抽出した値をまとめたもの。
リニューアルや別サイト（採用サイト・新工場サイト等）を作る際の基準として使う。

- 調査日: 2026-09-02
- 抽出元: `wp/wp-content/themes/long-kanazawa.com/assets/styles/{tailwind,components}.css`, `assets/scripts/common.css`, トップページ HTML

---

## 1. サイト概要

| 項目 | 内容 |
|---|---|
| サイト名 | 株式会社ロング 金沢 |
| ドメイン | www.long-kanazawa.com |
| 言語 | `ja`（単一言語） |
| ディスクリプション | 金沢（石川県）の板金加工・溶接・曲げなら高品質＆低コストの株式会社ロング |
| 所在地 | 〒920-0209 石川県金沢市東蚊爪町1丁目34-3 |
| TEL | 076-237-1128 |
| コピーライト | © LONG Co., Ltd. |

### 技術スタック

- WordPress（自作テーマ、`/wp/` サブディレクトリ設置）
- Tailwind CSS v3.4.4 + 手書きコンポーネント CSS（`components.css`）
- Adobe Fonts（Typekit `wuy8icy`）+ Google Fonts
- Contact Form 7（お問い合わせ）
- Flexible Table Block（設備一覧などの表組み）
- Swiper（スライダー）、Easy FancyBox（画像ライトボックス）
- Yoast SEO v24.7（JSON-LD 構造化データ出力あり）
- Speculation Rules API によるプリフェッチ有効

---

## 2. デザインの方向性

**「精密・信頼・清潔」を、青を基調とした余白の広いレイアウトで表現する。**

- 製造業サイトとしての **信頼感** を濃紺（brand01）で担保する
- 見出しは **英字（Futura PT）を大きく主役** にし、日本語をその下に小さく添える二段構成
- 白 + 淡いブルー（bg01）を背景に、写真（工場・加工品・スタッフ）を大きく見せる
- 装飾は最小限。影・グラデーション・角丸は原則使わない（ボタンのピル型のみ例外）
- アクセントのオレンジ（brand03）は「今ここ」「反応」を示すためだけに使う（hover・現在地・必須ラベル）

---

## 3. カラー

### ブランドカラー

| トークン | 値 | 用途 |
|---|---|---|
| `brand01` | `#003c96` | 主役の濃紺。見出し英字、ボタン枠・文字、ボーダー、送信ボタン背景、ページネーション現在地 |
| `brand03` | `#e67150` | アクセントのオレンジ。hover 時の文字色、見出し下線、必須ラベル背景 |
| `brand04` | `#666666` | サブテキスト、リスト区切り線 |
| `bg01` | `#e9f9ff` | 淡いブルー背景。セクション背景、フッター背景、表の縞 |

### 補助色

| 用途 | 値 |
|---|---|
| リンク文字（本文中） | `#009bf5` |
| 任意ラベル背景 / 画像キャプション背景 | `#009bf5` |
| CTA 帯 | `#F07350` |
| 白 | `#ffffff` |
| 入力欄・画像枠のグレー | `#eeeeee` |

### 使用ルール

- **リンクは青（`#009bf5`）、hover でオレンジ（`#e67150`）** — サイト全体で一貫させる
- **必須 = オレンジ `#e67150` / 任意 = 青 `#009bf5`** のラベル（白文字）
- 表は奇数行を `bg01`、罫線は白抜き
- ダークモードの定義は現状なし（`prefers-color-scheme` 未対応）

> コントラスト注記: `#009bf5` は白背景上で約 2.9:1 で WCAG AA（4.5:1）を満たさない。本文リンクは下線が付いているため識別自体は可能だが、リニューアル時は `#0077c2` 前後まで落とすことを推奨。

---

## 4. タイポグラフィ

### 書体

| 用途 | フォント | 供給元 |
|---|---|---|
| 英字・数字・大見出し | `futura-pt` | Adobe Fonts |
| 和文・本文全般 | `Zen Kaku Gothic New` (400/500/700/900) | Google Fonts |
| フォールバック | `-apple-system, system-ui, sans-serif` | — |

- `font-feature-settings: "palt"` を `body` に指定（和文の詰め組み）
- 英字見出しは基本 **`font-weight: 700〜900` + 大サイズ**、和文見出しは `500` で字間を広く

### スケール（PC / SP）

| 役割 | SP | PC (≥768px) | ウェイト・字間 |
|---|---|---|---|
| セクション英字見出し `heading/01_en` | 2.5rem | 5rem | 900 / futura-pt |
| セクション和文見出し `heading/01_ja` | 1.25rem | 同左 | 500 / `letter-spacing: .2em` |
| 記事 h2 (`content/01`) | 3rem | 5rem | 700 / futura-pt |
| 記事 h3 | 1.25rem | 2.25rem | 700 |
| 記事 h4 | 1.125rem | 1.75rem | 700 |
| 本文 `body/01` | .875rem | 1.3125rem | 500 / line-height 1.75 |
| 記事本文 p / ul / ol | 1rem | 1.3125rem | 400 / line-height 1.75 |
| 記事一覧 タイトル・日付 | .8125rem | 1.25rem | 400 |
| ボタン `button/01` | .875rem | 1.5rem | 700 / `letter-spacing: .3em` |

- 既定の行間は `body` で `1.75`
- 字間は `tracking-widest (.1em)` と `.2em` を多用。日本語の大見出しはゆったり空ける

### 流体スケーリング（重要）

ルート `font-size` をビューポート幅に連動させ、**1920px 幅のデザインを rem ごと縮小**する方式。

```html
<html class="md:text-[calc(var(--100vw)*16/1920)] xl:text-[calc(1500px*16/1920)]">
```

- 〜767px: ブラウザ既定（16px）＝ SP 専用の値を各所で指定
- 768px〜1499px: `16px × 幅/1920` で線形に縮小・拡大
- 1500px〜: `12.5px` で固定（それ以上は拡大しない）

→ **PC の数値はすべて「1920px 基準のデザイン値」として書く**。`rem` で書けば自動で追従する。

---

## 5. レイアウト

### 主要 CSS 変数

| 変数 | SP | ≥768px | ≥1500px |
|---|---|---|---|
| `--inner-x`（左右余白） | `1rem` | `10rem` | `calc(50vw - 590px)` |
| `--header-h`（ヘッダー高） | `4rem` | `6rem` | 同左 |

- コンテンツ最大幅は実質 **1180px 相当**（`--inner-x` の xl 定義から逆算）
- 画像を余白いっぱいまで出す時は `margin-left: calc(var(--inner-x) * -1)` / `width: calc(100% + var(--inner-x)*2)` で内側余白を打ち消す（`wp-block-media-text` で多用）

### ブレークポイント

| 名前 | 幅 | 備考 |
|---|---|---|
| （既定） | 〜767px | SP。ハンバーガーメニュー |
| `md` | 768px〜 | **実質の PC/SP 分岐点。ほぼすべての切替がここ** |
| `lg` | 1024px〜 | ごく一部の文字サイズのみ |
| `xl` | 1500px〜 | ルート font-size と `--inner-x` を固定 |
| `2xl` | 1920px〜 | コンテナ幅のみ |

### 縦のリズム

- セクション余白 `section/01`: SP `padding: 2rem var(--inner-x)` / PC `4.5rem var(--inner-x)`
- 記事本体の開始位置 `content/01`: SP `margin-top: 2rem` / PC `10rem`
- 見出し前 `margin-top: 3em`、見出し後 `margin-bottom: .5〜1em`
- ブロック間は `mt-*` ユーティリティ（`.5 / 1 / 1.25 / 1.5 / 2 / 2.5 / 3.5 / 5 / 7 / 10rem`）を使用

---

## 6. コンポーネント

命名は **`ブロック/連番`**（`section/01`, `heading/01`）、子要素は **`ブロック/連番_要素`**（`heading/01_en`, `postlist/01_item`）。
バリエーションは `-delay01` のようにハイフン始まりの修飾子。

### `heading/01` — セクション見出し

```html
<h2 class="heading/01">
  <span class="heading/01_en">TOPICS</span>
  <span class="heading/01_ja">トピックス</span>
</h2>
```

英字（futura-pt 900・brand01・PC 5rem）を主、和文（500・1.25rem・字間 .2em）を従。

### `button/01` — 標準ボタン

- 白背景・`1px solid #003c96`・**ピル型（`border-radius: 9999px`）**・brand01 文字
- `min-width`: SP `15rem` / PC `20rem`、`padding: 1em 1.5em`
- `letter-spacing: .3em` + `text-indent: .3em`（字間による右寄れの補正）
- SP は中央寄せ、PC は右寄せ（`margin-right: 0`）
- hover: 疑似要素の brand01 オーバーレイを `opacity: .2` でフェードイン（.2s）

### `postlist/01` — 記事リスト（Topics / News）

- 1 行 = `日付 / タイトル / 矢印`
- 日付カラム幅 SP `5.5rem` / PC `7.5rem`、タイトルは残り幅
- 上下境界線 `1px solid #666`、hover で文字色 → brand03
- 行 padding: SP `1.5rem var(--inner-x)` / PC `2rem 0`

### `pagination/01`

- 中央揃え・`gap` SP `.75rem` / PC `1rem`
- 現在ページ = brand01、hover = brand03
- 前後矢印は border 2 辺 + `rotate(45deg)` で描画（画像を使わない）

### `content/01` / `content/02` — 記事本文（WordPress ブロック）

`content/01` = 通常ページ、`content/02` = 見出しを小さくした派生（`h2` が 1.5rem 固定）。
対応ブロック:

| ブロック | スタイル |
|---|---|
| `wp-block-media-text` | gap SP `3rem` / PC `5rem`、画像は外側余白まで拡張 |
| `wp-block-gallery` | gutter `1rem`、画像枠 `1px solid #eee`、キャプションは `#009bf5` 背景の白文字 |
| `wp-block-columns` | `gap: 6.25rem`、下 `margin: 7rem` |
| Flexible Table | 奇数行 `bg01`、罫線白、SP は横スクロール（`↔ 横にスクロールできます` を疑似要素で表示） |
| `.googlemap` | `aspect-ratio: 1/.66`、上 `margin: 5〜6rem` |

### フォーム（Contact Form 7）

- 入力欄: 背景 `#eee`、`padding: .5rem 1rem`、幅 100%、枠線なし
- ラベル: `p` を `font-weight: 700`、入力は `.wpcf7-form-control-wrap` を `display: block` + `margin-top: .5rem`
- 必須バッジ `.required` = `#e67150` / 任意バッジ `.optional` = `#009bf5`（白文字・`font-size: .8em`）
- ラジオ・同意チェックは `display: flex; gap: 2rem 1rem`
- 送信ボタン: brand01 背景・白文字・`padding: 1rem 0`、SP 幅 100% / PC `max-width: 20rem`

### ヘッダー / ナビ

- 高さ `--header-h`（SP 4rem / PC 6rem）、ロゴ幅 SP `10rem` / PC `15rem`
- PC: 横並びグローバルナビ。現在地は `.current-menu-item` に下線、`.current-item` は brand03
- SP: ハンバーガー（`aria-expanded` で 3 本線 → × にトランスフォーム）。ドロワーは `top: var(--header-h)` に固定表示、`aria-hidden` で `opacity` + `translateY(-2rem)` を切替
- ナビ項目: Home / Topics / Technology / Machines / Works / Company / Recruit / Contact

### フッター

- `bg01` 背景、PC は `padding-bottom: 13rem` と大きく取る
- 全ページリンクを **英語ラベル + 和文サブラベル** の 2 行で並べる
- 住所・TEL・コピーライトを最下部に配置
- Privacy policy / About the site へのリンクを含む

---

## 7. モーション

| 用途 | 指定 |
|---|---|
| スクロールイン `inview/fadeup01` | `opacity: 0 → 1`, `translateY(2rem) → 0`、`.5s` |
| 連続要素のずらし | `-delay01`〜`-delay06` = `.1s` 刻みの `transition-delay` |
| 色・不透明度の hover | `.15〜.2s`, `cubic-bezier(.4,0,.2,1)` |
| ページ内リンク | `scroll-behavior: smooth`（`html`） |

発火は JS で `.js-inview` に `.js-inview-active` を付与する方式。**新規要素も同じ 2 クラス構成に合わせること。**

---

## 8. ページ構成

```
/                     トップ（Machines / Technology / Topics / News の抜粋）
├─ /technology/       加工・製品技術について
├─ /machines/         設備機械リスト（表組み中心）
├─ /works/            製品事例紹介（ギャラリー中心）
├─ /company/          会社概要（表組み + Google マップ）
├─ /recruit/          採用情報
├─ /contact/          お問い合わせ（Contact Form 7）
├─ /topics/           トピックス一覧（記事）
│   └─ /topics/{id}   記事詳細
├─ /news/             最新情報一覧
├─ /privacy-policy/   プライバシーポリシー
└─ /about-the-site/   このサイトについて
```

### トップページのセクション順

1. ヒーロー（キャッチ「機械カバーの製作をメインに 最新の技術と機械設備でつくる 高品質の製品を製作。」）
2. `#machines` 最新の機械設備 → 「設備機械へ」ボタン
3. `#technology` 高い品質とお客様の信頼を守る → 「加工・製品技術紹介へ」ボタン
4. `#topics` TOPICS / トピックス（最新 4 件）→ MORE
5. `#news` NEWS / 最新情報 → MORE
6. フッター

---

## 9. ライティング規約

- セクション見出しは **英語（大文字）+ 和文** の対で書く（`TOPICS` / `トピックス`）
- キャッチコピーは 3 行前後で改行位置を制御する（`<br>` で意図的に折る）
- 導線ラベルは「〜へ」（例: 設備機械へ / 加工・製品技術紹介へ）、記事一覧は `MORE`
- 強みは **「品質」「コスト」「納期」** の 3 語で括る（サイト全体で一貫）
- 日付表記は `YYYY.MM.DD`（例: 2025.10.23）

---

## 10. 既知の課題・改善候補

実装から見つかった、リニューアル時に直しておきたい点。

1. **`letter-spaceing` のタイプミス** — `components.css` の `.heading/01_en` と `.heading/01_ja` で `letter-spacing` が `letter-spaceing` と綴られており、**字間指定が効いていない**。見出しの見た目に直結する。
2. **`.opational` のタイプミス** — `content/02` のフォーム任意ラベルが `.opational`（`content/01` は正しく `.optional`）。片方で背景色が当たらない。
3. **リンク色のコントラスト不足** — `#009bf5` は白背景で AA 未達（約 2.9:1）。
4. **`content/01` と `content/02` がほぼ全文コピー** — 見出しサイズしか違わない。共通化して差分だけ上書きする構造にすべき。
5. **ダークモード未対応** — 必要かどうかを含めて判断する。
6. **`viewport` に `initial-scale` 指定なし** — `width=device-width` のみ。
7. **`h1` がロゴのみ** — トップの主見出しが `h2` から始まる。SEO 上は `h1` にキャッチコピーを置く構成も検討余地あり。

---

## 11. 新規ページを作るときのチェックリスト

- [ ] `--inner-x` / `--header-h` を使い、独自の余白値を直書きしない
- [ ] PC の寸法は **1920px 基準** で `rem` 指定する（px 直書きしない）
- [ ] 分岐は原則 `md`（768px）1 本に寄せる
- [ ] 見出しは `heading/01`、ボタンは `button/01`、一覧は `postlist/01` を再利用する
- [ ] 色は `brand01 / brand03 / brand04 / bg01` のトークン経由で当てる
- [ ] スクロールアニメは `js-inview` + `inview/fadeup01`（+ `-delay0n`）で統一
- [ ] リンク hover は必ず brand03 に変える
- [ ] 表を入れる場合は SP の横スクロール対応を確認する
