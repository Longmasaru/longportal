// 本文の見せ方の下ごしらえ(docs/DESIGN.md 30 章)。
// - Google ドキュメント由来の崩れ(見えない文字、** の囲み、位置合わせの全角スペース)を表示の前に整える。
// - 日本語を文節で区切り、行の折り返しが語の途中(「近寄|らない」など)にならないようにする。
//   CSS の word-break: auto-phrase は iPhone の Safari が対応していないため、BudouX で区切り位置を求めて <wbr> を入れる。
import { loadDefaultJapaneseParser } from "budoux";

const parser = loadDefaultJapaneseParser();

const INVISIBLE = /[\u200b-\u200d\u2060\ufeff]/g;
// 位置合わせのために続けた空白(全角を含む 2 つ以上)。前後が和文なら詰め、英数字どうしの間なら 1 つにする。
const SPACE_RUN = /[ \u3000\t]{2,}/g;
const ASCII_WORD = /[A-Za-z0-9]/;

/** 表示用に文字を整える(中身の意味は変えない)。 */
export function cleanText(text: string): string {
  return text
    .replace(INVISIBLE, "")
    .replace(SPACE_RUN, (run: string, offset: number, whole: string) =>
      ASCII_WORD.test(whole[offset - 1] ?? "") && ASCII_WORD.test(whole[offset + run.length] ?? "") ? " " : "",
    )
    .replace(/[ \u3000\t]*\n[ \u3000\t]*/g, "\n");
}

export type Segment = { text: string; bold: boolean };

/** `**太字**` の囲みを太字の区切りにする(Google ドキュメントから記号のまま残ることがある)。 */
export function splitBold(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(/\*\*(.+?)\*\*/g)) {
    const start = m.index ?? 0;
    if (start > last) out.push({ text: text.slice(last, start), bold: false });
    out.push({ text: m[1], bold: true });
    last = start + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), bold: false });
  return out;
}

/** 文節に区切る(区切りのあいだでだけ改行させる)。 */
export function phrases(text: string): string[] {
  return text ? parser.parse(text) : [];
}
