// かな → ローマ字(試験の問題用紙に添えられたローマ字に近い形。ヘボン式)。docs/DESIGN.md 44 章。
// 問題文は ひらがなを空白で区切って書かれているので、区切りごとに変換し、文末の助詞(が・は・を)を分ける。

const BASE =
  "あa いi うu えe おo かka きki くku けke こko さsa しshi すsu せse そso たta ちchi つtsu てte とto なna にni ぬnu ねne のno はha ひhi ふfu へhe ほho まma みmi むmu めme もmo やya ゆyu よyo らra りri るru れre ろro わwa をo んn がga ぎgi ぐgu げge ごgo ざza じji ずzu ぜze ぞzo だda ぢji づzu でde どdo ばba びbi ぶbu べbe ぼbo ぱpa ぴpi ぷpu ぺpe ぽpo ぁa ぃi ぅu ぇe ぉo ゔvu";
const KANA: Record<string, string> = Object.fromEntries(BASE.split(" ").map((p) => [p[0], p.slice(1)]));
const SMALL_Y: Record<string, string> = { ゃ: "ya", ゅ: "yu", ょ: "yo" };

/** カタカナをひらがなにする(長音「ー」などはそのまま)。 */
function toHiragana(c: string): string {
  const n = c.charCodeAt(0);
  return n >= 0x30a1 && n <= 0x30f6 ? String.fromCharCode(n - 0x60) : c;
}

function word(w: string): string {
  const s = [...w].map(toHiragana);
  let out = "";
  let tsu = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "っ") {
      tsu = true;
      continue;
    }
    if (c === "ー") {
      out += out.match(/[aiueo]$/)?.[0] ?? "";
      continue;
    }
    let r = KANA[c];
    if (r === undefined) {
      out += c === "、" ? "," : c === "。" ? "." : c;
      tsu = false;
      continue;
    }
    const next = s[i + 1];
    if (SMALL_Y[next]) {
      const sh = r === "shi" || r === "chi" || r === "ji";
      r =
        (r === "shi" ? "sh" : r === "chi" ? "ch" : r === "ji" ? "j" : r.slice(0, -1)) +
        SMALL_Y[next].replace(/^y/, sh ? "" : "y");
      i++;
    }
    if (tsu) {
      out += r[0] === "c" ? "t" : r[0];
      tsu = false;
    }
    if (c === "ん" && next !== "を" && /^[aiueoy]/.test(KANA[next] ?? "")) r = "n'";
    out += r;
  }
  // 区切りの終わりの助詞を分ける(「…が」→ ga、「…は」→ wa、「…を」→ o)。
  const tail = w.replace(/[、。]$/, "");
  return out
    .replace(/(?<=.)ga([.,]?)$/, tail.endsWith("が") ? " ga$1" : "ga$1")
    .replace(/ha([.,]?)$/, (m, p: string) => (tail.endsWith("は") ? (w.length > 1 ? ` wa${p}` : `wa${p}`) : m))
    .replace(/(?<=.)o([.,]?)$/, (m, p: string) => (tail.endsWith("を") ? ` o${p}` : m));
}

/** ひらがな(空白区切り)の文をローマ字にする。先頭は大文字。 */
export function toRomaji(text: string): string {
  const s = text
    .split(/[　 ]+/)
    .filter(Boolean)
    .map(word)
    .join(" ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
