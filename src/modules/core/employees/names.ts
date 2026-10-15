// 氏名を姓と名に分ける・つなぐ(純粋関数。docs/DESIGN.md 22 章)。
// 既存データの移行(migration 0006 の SQL)も、同じ規則で書いている。変えるときは両方を直すこと。

/** 英字(ASCII)だけの文字列か。外国籍の方の氏名の判定に使う。 */
export function isAsciiOnly(value: string): boolean {
  return /^[\x20-\x7E]*$/.test(value);
}

export type SplitName = { family: string; given: string | null };

/** 空白(半角・全角)で区切った語。`withDot` なら中黒(・)でも区切る(外国籍の方のかな)。 */
function words(value: string, withDot = false): string[] {
  return value
    .trim()
    .split(withDot ? /[\s　・]+/ : /[\s　]+/)
    .filter((w) => w !== "");
}

/**
 * 氏名を姓と名に分ける。
 * - 英字だけの氏名(ベトナムの方など): 最後の語が名、それより前(ミドルネームまで)が姓。
 * - それ以外: 最初の空白の前が姓、後ろが名。
 * - 空白がなければ、全体を姓とし、名は null。
 * `asciiRule` を渡すと、英字だけかどうかの判定をその値で行う(かなを、氏名の判定に合わせて分けるため)。
 */
export function splitName(value: string, asciiRule: boolean = isAsciiOnly(value)): SplitName {
  // 外国籍の方のかな(レ・クオック・アン)は、中黒でも区切り、姓の中は中黒でつなぐ。
  const dotted = asciiRule && value.includes("・");
  const w = words(value, dotted);
  if (w.length === 0) return { family: "", given: null };
  if (w.length === 1) return { family: w[0], given: null };
  const sep = dotted ? "・" : isAsciiOnly(value) ? " " : "　";
  if (asciiRule) return { family: w.slice(0, -1).join(sep), given: w[w.length - 1] };
  return { family: w[0], given: w.slice(1).join(sep) };
}

/** 姓と名をつなぐ(表示用の氏名。DB の生成列 name と同じ規則)。 */
export function joinName(family: string, given: string | null): string {
  if (!given) return family;
  return `${family}${isAsciiOnly(family + given) ? " " : "　"}${given}`;
}

/**
 * 姓(かな)と名(かな)をつなぐ(DB の生成列 name_kana と同じ規則)。両方空なら null。
 * 姓(かな)に中黒があれば中黒で(レ・クオック・アン)、なければ全角空白でつなぐ。
 */
export function joinNameKana(family: string | null, given: string | null): string | null {
  if (!family && !given) return null;
  if (!family) return given;
  if (!given) return family;
  return `${family}${family.includes("・") ? "・" : "　"}${given}`;
}
