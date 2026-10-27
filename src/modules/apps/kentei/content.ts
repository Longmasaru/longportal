import { z } from "zod";

// 試験 1 つ分の中身(学科の問題・用語・実技の資料)。DB の kentei.exams.content(JSON)に入れる。docs/DESIGN.md 44 章。
// 過去問は「禁転載複製」の資料なので、中身はリポジトリに入れない(取り込みは scripts/import-kentei.ts)。
// 文はすべて日本語(ja)とベトナム語(vi)の組。問題文の ja は試験と同じ ひらがな、kanji は漢字まじり(指導する人向け)。
// 画像は取り込みのときに kentei.images の ID に置き換える(取り込む JSON では、フォルダの中のファイル名)。

const text = (max: number) => z.string().trim().min(1).max(max);
const optText = (max: number) => z.string().trim().max(max).default("");

/** 日本語とベトナム語の組。 */
export const bilingualSchema = z.object({ ja: text(400), vi: optText(400) });
export type Bilingual = z.infer<typeof bilingualSchema>;

export const categorySchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,29}$/),
  ja: text(40),
  vi: optText(80),
});

/** 学科の 1 問(正誤式)。同じ文の問題は 1 つにまとめ、出題された回・番号を sources に並べる。 */
export const questionSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]{1,60}$/),
  category: z.string(),
  /** 正しい(○)なら true、誤り(×)なら false。 */
  answer: z.boolean(),
  /** 図(取り込みのときはファイル名、保存後は kentei.images の ID)。 */
  image: z.string().max(200).optional(),
  ja: text(400),
  kanji: optText(400),
  vi: optText(600),
  explainJa: optText(1000),
  explainVi: optText(1500),
  /** 出題された回と番号(例 "3-12" = 第 3 回の 12 番)。 */
  sources: z.array(z.string().regex(/^\d{1,3}-\d{1,3}$/)).min(1),
});
export type Question = z.infer<typeof questionSchema>;

export const termSchema = z.object({
  kanji: text(60),
  yomi: optText(80),
  vi: optText(120),
  category: z.string(),
  descJa: optText(400),
  descVi: optText(600),
  /** 関連する問題の id。 */
  questions: z.array(z.string()).default([]),
});
export type Term = z.infer<typeof termSchema>;

/** 実技の文(試験と同じ ひらがな・漢字・ベトナム語)。 */
export const sentenceSchema = z.object({
  ja: text(400),
  kanji: optText(600),
  vi: optText(800),
  strong: z.boolean().optional(),
});
export type Sentence = z.infer<typeof sentenceSchema>;

export const practicalSchema = z.object({
  /** 例 "令和8年度"。 */
  year: optText(20),
  overview: z.array(z.object({ label: bilingualSchema, value: bilingualSchema })).default([]),
  drawing: z
    .object({
      image: z.string().max(200),
      notes: z.array(bilingualSchema).default([]),
    })
    .nullable()
    .default(null),
  steps: z.array(sentenceSchema).default([]),
  rules: z.array(sentenceSchema).default([]),
  bring: z
    .array(
      z.object({
        ja: text(60),
        yomi: optText(80),
        spec: optText(120),
        quantity: optText(20),
        vi: optText(160),
        required: z.boolean().optional(),
      }),
    )
    .default([]),
  bringNotes: z.array(bilingualSchema).default([]),
  venue: z.array(z.object({ ja: text(60), spec: optText(120), vi: optText(200) })).default([]),
  quiz: z
    .array(
      z.object({
        answer: z.boolean(),
        ja: text(400),
        kanji: optText(400),
        vi: optText(600),
        explainJa: optText(1000),
        explainVi: optText(1500),
      }),
    )
    .default([]),
});
export type Practical = z.infer<typeof practicalSchema>;

export const examContentSchema = z
  .object({
    version: z.literal(1),
    /** 学科の本番の形(問題数・時間・合格の正答率)。基礎級は 20 問・60 分・60%。 */
    written: z.object({
      count: z.number().int().min(1).max(100),
      minutes: z.number().int().min(1).max(240),
      passRatio: z.number().min(0.1).max(1),
    }),
    /** 実技の合格点(100 点満点)。 */
    practicalPassScore: z.number().int().min(0).max(100).default(60),
    categories: z.array(categorySchema).min(1),
    questions: z.array(questionSchema).min(1),
    glossary: z.array(termSchema).default([]),
    practical: practicalSchema.nullable().default(null),
  })
  .superRefine((c, ctx) => {
    const cats = new Set(c.categories.map((x) => x.key));
    const ids = new Set<string>();
    const slots = new Set<string>();
    for (const q of c.questions) {
      if (ids.has(q.id))
        ctx.addIssue({
          code: "custom",
          message: `問題の id が重なっています: ${q.id}`,
        });
      ids.add(q.id);
      if (!cats.has(q.category))
        ctx.addIssue({
          code: "custom",
          message: `分野がありません: ${q.id} の ${q.category}`,
        });
      for (const s of q.sources) {
        if (slots.has(s))
          ctx.addIssue({
            code: "custom",
            message: `同じ回・番号が 2 つの問題にあります: ${s}`,
          });
        slots.add(s);
      }
    }
    for (const t of c.glossary) {
      if (!cats.has(t.category))
        ctx.addIssue({
          code: "custom",
          message: `用語の分野がありません: ${t.kanji}`,
        });
      for (const id of t.questions) {
        if (!ids.has(id))
          ctx.addIssue({
            code: "custom",
            message: `用語「${t.kanji}」の関連問題がありません: ${id}`,
          });
      }
    }
  });
export type ExamContent = z.infer<typeof examContentSchema>;

/** 過去問の回ごとの並び(回の番号 → 問題 id の配列。番号順)。 */
export function pastSets(questions: readonly Pick<Question, "id" | "sources">[]): Map<number, string[]> {
  const sets = new Map<number, string[]>();
  for (const q of questions) {
    for (const s of q.sources) {
      const [round, no] = s.split("-").map(Number);
      const list = sets.get(round) ?? [];
      list[no - 1] = q.id;
      sets.set(round, list);
    }
  }
  return new Map([...sets.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => [k, v.filter(Boolean)]));
}

/** 中身が使っている画像の名前(取り込むファイル名、または保存後の ID)。 */
export function imageRefs(content: ExamContent): string[] {
  const refs = content.questions.flatMap((q) => (q.image ? [q.image] : []));
  if (content.practical?.drawing) refs.push(content.practical.drawing.image);
  return [...new Set(refs)];
}

/** 画像の名前を置き換えた中身を返す(取り込みのとき、ファイル名 → 画像の ID)。 */
export function replaceImageRefs(content: ExamContent, map: ReadonlyMap<string, string>): ExamContent {
  const swap = (ref: string) => {
    const to = map.get(ref);
    if (!to) throw new Error(`画像が見つかりません: ${ref}`);
    return to;
  };
  return {
    ...content,
    questions: content.questions.map((q) => (q.image ? { ...q, image: swap(q.image) } : q)),
    practical: content.practical
      ? {
          ...content.practical,
          drawing: content.practical.drawing
            ? {
                ...content.practical.drawing,
                image: swap(content.practical.drawing.image),
              }
            : null,
        }
      : null,
  };
}
