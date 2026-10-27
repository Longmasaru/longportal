import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { ExamContent } from "./content";

// 取り込むときに、ベトナム語が空の文を Claude で訳して埋める(scripts/import-kentei.ts の --translate。docs/DESIGN.md 44 章)。
// 送るのは試験の問題・用語・実技の文だけ(社員の情報は送らない)。訳は機械訳なので、あとで人が確かめる前提。
// 技能実習生が読む専門用語の訳なので、教科書の整理(Haiku)より精度を優先して Sonnet を使う。

const MODEL = "claude-sonnet-5-5";
const TIMEOUT_MS = 120_000;
const BATCH = 40;

type Slot = { ja: string; set: (vi: string) => void };

/** ベトナム語が空で、日本語がある文の一覧(中身をその場で書き換える関数つき)。 */
export function missingVietnamese(c: ExamContent): Slot[] {
  const slots: Slot[] = [];
  const add = (ja: string | undefined, vi: string | undefined, set: (v: string) => void) => {
    if (ja?.trim() && !vi?.trim()) slots.push({ ja: ja.trim(), set });
  };
  for (const x of c.categories) add(x.ja, x.vi, (v) => (x.vi = v));
  for (const q of c.questions) {
    add(q.kanji || q.ja, q.vi, (v) => (q.vi = v));
    add(q.explainJa, q.explainVi, (v) => (q.explainVi = v));
  }
  for (const t of c.glossary) {
    add(t.kanji, t.vi, (v) => (t.vi = v));
    add(t.descJa, t.descVi, (v) => (t.descVi = v));
  }
  const p = c.practical;
  if (p) {
    for (const o of p.overview) {
      add(o.label.ja, o.label.vi, (v) => (o.label.vi = v));
      add(o.value.ja, o.value.vi, (v) => (o.value.vi = v));
    }
    for (const n of [...(p.drawing?.notes ?? []), ...p.bringNotes]) add(n.ja, n.vi, (v) => (n.vi = v));
    for (const s of [...p.steps, ...p.rules]) add(s.kanji || s.ja, s.vi, (v) => (s.vi = v));
    for (const b of p.bring) add([b.ja, b.spec].filter(Boolean).join(" "), b.vi, (v) => (b.vi = v));
    for (const x of p.venue) add([x.ja, x.spec].filter(Boolean).join(" "), x.vi, (v) => (x.vi = v));
    for (const q of p.quiz) {
      add(q.kanji || q.ja, q.vi, (v) => (q.vi = v));
      add(q.explainJa, q.explainVi, (v) => (q.explainVi = v));
    }
  }
  return slots;
}

const outputSchema = z.array(z.string());

/** 空のベトナム語を訳で埋める。埋めた数を返す。ANTHROPIC_API_KEY がなければ止める。 */
export async function fillVietnamese(
  content: ExamContent,
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  const slots = missingVietnamese(content);
  if (!slots.length) return 0;
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("--translate には ANTHROPIC_API_KEY が必要です(.env.local)。");
  const api = new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 2 });
  for (let i = 0; i < slots.length; i += BATCH) {
    const batch = slots.slice(i, i + BATCH);
    const response = await api.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: [
        "あなたは、日本の金属加工(板金・プレス・溶接)の工場で働くベトナム人技能実習生のための翻訳者です。",
        "技能検定(国家試験)の練習問題・用語・実技の注意を、日本語からベトナム語に訳します。",
        "- 実習生が読んで意味が正確に分かる、自然で平易なベトナム語にする。",
        "- 専門用語はベトナムの工場で通じる語を使う(例: プレスブレーキ → máy chấn tôn、シャー → máy cắt tôn、バリ → ba via)。",
        "- 正誤問題は、文の正しさ・誤りがそのまま伝わるように訳す(意味を補ったり直したりしない)。",
        "- 数字・単位・記号(mm、°、○×)は、そのまま残す。",
        "- 入力は JSON の文字列の配列です。同じ順・同じ数の、訳だけの JSON の文字列の配列を出力する。前置きや説明は付けない。",
      ].join("\n"),
      messages: [{ role: "user", content: JSON.stringify(batch.map((s) => s.ja)) }],
    });
    const text = response.content
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join("")
      .trim()
      .replace(/^```(?:json)?\s*|\s*```$/g, "");
    const parsed = outputSchema.safeParse(JSON.parse(text));
    if (!parsed.success || parsed.data.length !== batch.length) {
      throw new Error("訳の形が合いませんでした。もう一度実行してください。");
    }
    parsed.data.forEach((vi, k) => batch[k].set(vi.trim()));
    onProgress?.(Math.min(i + BATCH, slots.length), slots.length);
  }
  return slots.length;
}
