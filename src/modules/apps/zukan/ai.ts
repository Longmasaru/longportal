import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { createViewUrl } from "@/modules/core/storage";
import {
  CHAPTER_LABEL,
  CRITERIA,
  CRITERION_LABEL,
  CRITERION_MAX,
  CRITERION_MIN,
  EFFECT_MAX,
  TITLE_MAX,
  WHAT_MAX,
  ZUKAN_CHAPTERS,
  type AiReview,
  type PhotoKind,
  type ZukanChapter,
} from "./constants";

// カイゼン図鑑の AI(Claude。docs/DESIGN.md 44 章)。
// - 下書き: 写真とひとことのメモから、名前・章・何をしたか・効果の案を作る(保存はしない)。
// - 下見: 登録されたページを 4 観点で 1〜5 点にし、理由を添える(鑑定する人だけが見る。最後は人が決める)。
// 送るのは写真と文章だけ(投稿者の名前・所属は送らない)。安全の判断で断られたときは、サーバー側の fallback で続ける。

const MODEL = "claude-opus-5-5";
const TIMEOUT_MS = 90_000;
const BETAS = ["server-side-fallback-2026-07-01"];

let client: Anthropic | null = null;
function anthropic(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  client ??= new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 1 });
  return client;
}

export type AiPhoto = { kind: PhotoKind; storageKey: string; contentType: string };

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

/** R2 の写真を読み、AI に渡せる形にする(署名付き URL から取得して base64)。 */
async function loadImages(photos: AiPhoto[]): Promise<Anthropic.Beta.BetaContentBlockParam[]> {
  const blocks: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const p of photos) {
    if (!(IMAGE_TYPES as readonly string[]).includes(p.contentType)) continue;
    const url = await createViewUrl({ key: p.storageKey, contentType: p.contentType });
    const res = await fetch(url);
    if (!res.ok) throw new Error(`photo ${res.status}`);
    const data = Buffer.from(await res.arrayBuffer()).toString("base64");
    blocks.push({ type: "text", text: p.kind === "before" ? "【ビフォー(改善前)の写真】" : "【アフター(改善後)の写真】" });
    blocks.push({ type: "image", source: { type: "base64", media_type: p.contentType as ImageType, data } });
  }
  return blocks;
}

function logError(what: string, err: unknown) {
  console.error(`[zukan] ${what}に失敗しました(${err instanceof Anthropic.APIError ? (err.status ?? "接続") : "不明"})`);
}

const CHAPTER_GUIDE = ZUKAN_CHAPTERS.map((c) => `- ${c}: ${CHAPTER_LABEL[c].label}${CHAPTER_LABEL[c].hint ? `(${CHAPTER_LABEL[c].hint})` : ""}`).join("\n");

// ---- 下書き ----------------------------------------------------------------------

const DraftSchema = z.object({
  title: z.string(),
  chapter: z.enum(ZUKAN_CHAPTERS),
  what: z.string(),
  effect: z.string(),
});

export type DraftSuggestion = { title: string; chapter: ZukanChapter; what: string; effect: string };
export type DraftResult = { draft: DraftSuggestion } | { error: string };

export async function draftFromPhotos(input: { photos: AiPhoto[]; memo: string }): Promise<DraftResult> {
  const api = anthropic();
  if (!api) return { error: "AI の設定がされていないため、下書きを作れません。" };
  try {
    const images = await loadImages(input.photos);
    const response = await api.beta.messages.parse({
      model: MODEL,
      max_tokens: 4096,
      betas: BETAS,
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(DraftSchema) },
      system: [
        "あなたは、ものづくりの会社(工場・事務・営業を含む全社)の社員が、ちょっとした改善を社内の「カイゼン図鑑」に登録するのを手伝うアシスタントです。",
        "改善前(ビフォー)と改善後(アフター)の写真と、本人のひとことのメモから、図鑑のページの下書きを作ってください。",
        `- title: 図鑑の見出し。何の改善か一目で分かる名詞句で、${TITLE_MAX}字以内(例: 工具の定位置ボード)。`,
        `- chapter: 次のどれか 1 つの key。\n${CHAPTER_GUIDE}`,
        `- what: 何をしたか。です・ます調で 1〜3 文、${WHAT_MAX}字以内。`,
        `- effect: 効果。分かる範囲で具体的に 1〜2 文、${EFFECT_MAX}字以内。写真とメモから分からない数字は作らない。分からなければ見込みとして控えめに書く。`,
        "- 写真やメモに無い事実を足さない。大げさに褒めない。",
      ].join("\n"),
      messages: [
        {
          role: "user",
          content: [
            ...images,
            { type: "text", text: input.memo.trim() ? `<memo>\n${input.memo.trim()}\n</memo>` : "(メモはありません。写真だけで判断してください)" },
          ],
        },
      ],
    });
    if (response.stop_reason === "refusal") return { error: "AI が下書きを作れませんでした。自分で書いてください。" };
    const out = response.parsed_output;
    if (!out) return { error: "AI から案が返りませんでした。もう一度お試しください。" };
    return {
      draft: {
        title: out.title.trim().slice(0, TITLE_MAX),
        chapter: out.chapter,
        what: out.what.trim().slice(0, WHAT_MAX),
        effect: out.effect.trim().slice(0, EFFECT_MAX),
      },
    };
  } catch (err) {
    logError("下書きの作成", err);
    return { error: "AI につながりませんでした。少し待ってから、もう一度お試しください。" };
  }
}

// ---- 下見(点数の案) -------------------------------------------------------------

const Scored = z.object({ score: z.number().int(), reason: z.string() });
const ReviewSchema = z.object({
  effect: Scored,
  idea: Scored,
  reuse: Scored,
  sustain: Scored,
  summary: z.string(),
});

const clamp = (n: number) => Math.min(CRITERION_MAX, Math.max(CRITERION_MIN, Math.round(n)));

export async function reviewEntry(input: {
  photos: AiPhoto[];
  title: string;
  chapter: ZukanChapter;
  what: string;
  effect: string;
  place: string;
}): Promise<AiReview | null> {
  const api = anthropic();
  if (!api) return null;
  try {
    const images = await loadImages(input.photos);
    const guide = CRITERIA.map((c) => `- ${c}(${CRITERION_LABEL[c].label}): ${CRITERION_LABEL[c].hint}`).join("\n");
    const response = await api.beta.messages.parse({
      model: MODEL,
      max_tokens: 4096,
      betas: BETAS,
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(ReviewSchema) },
      system: [
        "あなたは、ものづくりの会社の「カイゼン図鑑」に登録された改善を、管理者が点数を付ける前に下見するアシスタントです。",
        "あなたの点数は案で、最後は管理者が決めます。本人には見せません。",
        `次の 4 観点を、それぞれ ${CRITERION_MIN}〜${CRITERION_MAX} の整数で採点し、理由を 1 文(60 字以内)で添えてください。`,
        guide,
        "目安: 3 = 社内でよくある、ちゃんとした改善。5 = ほかの部署にも広げたい、はっきり効く改善。1 = 効果がほとんど分からない。",
        "小さな改善でも、効いていれば正当に評価する。写真と文章から分からないことは、良くも悪くも推測で点を動かさない。",
        "summary には、管理者向けの全体の見立てを 1〜2 文(100 字以内)で書く。",
      ].join("\n"),
      messages: [
        {
          role: "user",
          content: [
            ...images,
            {
              type: "text",
              text: [
                `名前: ${input.title}`,
                `章: ${CHAPTER_LABEL[input.chapter].label}`,
                input.place ? `場所: ${input.place}` : "",
                `何をしたか: ${input.what || "(書かれていません)"}`,
                `効果: ${input.effect || "(書かれていません)"}`,
              ]
                .filter(Boolean)
                .join("\n"),
            },
          ],
        },
      ],
    });
    if (response.stop_reason === "refusal") return null;
    const out = response.parsed_output;
    if (!out) return null;
    return {
      scores: { effect: clamp(out.effect.score), idea: clamp(out.idea.score), reuse: clamp(out.reuse.score), sustain: clamp(out.sustain.score) },
      reasons: {
        effect: out.effect.reason.slice(0, 120),
        idea: out.idea.reason.slice(0, 120),
        reuse: out.reuse.reason.slice(0, 120),
        sustain: out.sustain.reason.slice(0, 120),
      },
      summary: out.summary.slice(0, 200),
      model: response.model,
      at: new Date().toISOString(),
    };
  } catch (err) {
    logError("AI の下見", err);
    return null;
  }
}
