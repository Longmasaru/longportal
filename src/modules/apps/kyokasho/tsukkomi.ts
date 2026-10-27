// ツッコミ(読んだ人の疑問・付け足し・まちがいの指摘・ひとこと)の種類・受け止め方と、集計(純粋関数)。docs/DESIGN.md 32 章。
// DB に依存しないので、クライアントからも読める。

export const COMMENT_KINDS = ["question", "addition", "mistake", "comment"] as const;
export type CommentKind = (typeof COMMENT_KINDS)[number];

export const KIND_LABELS: Record<CommentKind, { label: string; hint: string }> = {
  question: { label: "はてな", hint: "ここがわからない・これで合ってる?" },
  addition: { label: "付け足し・改善", hint: "こう書くともっとわかる・これも載せたい" },
  mistake: { label: "まちがい", hint: "今のやり方と違う・数字や名前の誤り" },
  comment: { label: "ひとこと", hint: "役に立った・気づいたこと" },
};

/** 受け止め方。open = 届いたまま、adopted = 採用(元の文書を直す)、reflected = 教科書に反映済み、kept = 今回はこのまま(返事で答える)。 */
export const COMMENT_STATUSES = ["open", "adopted", "reflected", "kept"] as const;
export type CommentStatus = (typeof COMMENT_STATUSES)[number];

export const STATUS_LABELS: Record<CommentStatus, string> = {
  open: "返事待ち",
  adopted: "採用(直します)",
  reflected: "教科書に反映済み",
  kept: "今回はこのまま",
};

export function isCommentKind(v: string): v is CommentKind {
  return (COMMENT_KINDS as readonly string[]).includes(v);
}

export function isCommentStatus(v: string): v is CommentStatus {
  return (COMMENT_STATUSES as readonly string[]).includes(v);
}

/** 採用した(反映済みを含む)ツッコミか。 */
export function isAdopted(status: string): boolean {
  return status === "adopted" || status === "reflected";
}

export const BODY_MAX = 1000;
export const REPLY_MAX = 1000;
export const QUOTE_MAX = 300;
/** 「AIで整える」に必要な、下書きの最低の字数。 */
export const POLISH_MIN = 10;

export type Contributor = { userId: string; name: string; count: number; adopted: number };

/**
 * 教科書をよくしてくれた人の一覧: 採用された数 → ツッコミの数 → 名前の順。
 * 書いた人が消えたツッコミ(author が null)は数えない。
 */
export function rankContributors(
  rows: { authorUserId: string | null; authorName: string | null; status: string }[],
): Contributor[] {
  const map = new Map<string, Contributor>();
  for (const r of rows) {
    if (!r.authorUserId) continue;
    const c = map.get(r.authorUserId) ?? { userId: r.authorUserId, name: r.authorName ?? "(名前なし)", count: 0, adopted: 0 };
    c.count += 1;
    if (isAdopted(r.status)) c.adopted += 1;
    map.set(r.authorUserId, c);
  }
  return [...map.values()].sort(
    (a, b) => b.adopted - a.adopted || b.count - a.count || a.name.localeCompare(b.name, "ja"),
  );
}

/** 本人が消せるのは、教科書チームがまだ返事をしていない自分のツッコミだけ。 */
export function canDeleteOwnComment(
  comment: { authorUserId: string | null; status: string; reply: string },
  userId: string,
): boolean {
  return comment.authorUserId === userId && comment.status === "open" && comment.reply === "";
}

/**
 * 新しいツッコミを知らせる LINE WORKS のトークルーム(docs/DESIGN.md 35 章)。
 * 教科書ごと・部署ごとのトークルームは KYOKASHO_LINEWORKS_CHANNELS(JSON。{"教科書の slug か部署名": "channelId"})に置く。
 * 同じ部署に教科書が何冊もある(ブレーキ部の初級編・スタッド・メタルエステ)ので、slug を先に見て、次に部署名を見る。
 * どちらにもないもの(全部署共通など)は、全体用の KYOKASHO_LINEWORKS_CHANNEL_ID へ送る(届け漏れを防ぐため)。
 */
export function notifyChannelFor(
  book: { slug: string; department: string },
  env: Record<string, string | undefined>,
): string | undefined {
  const raw = env.KYOKASHO_LINEWORKS_CHANNELS?.trim();
  if (raw) {
    try {
      const map: unknown = JSON.parse(raw);
      if (map && typeof map === "object" && !Array.isArray(map)) {
        for (const key of [book.slug, book.department]) {
          const id = (map as Record<string, unknown>)[key.trim()];
          if (typeof id === "string" && id.trim()) return id.trim();
        }
      }
    } catch {
      console.error("[kyokasho] KYOKASHO_LINEWORKS_CHANNELS が JSON として読めません。");
    }
  }
  return env.KYOKASHO_LINEWORKS_CHANNEL_ID?.trim() || undefined;
}

/** 元の Google ドキュメントに付けるコメントの、ツッコミごとの印(二重に付けないため。ID の頭 8 文字)。 */
export function googleCommentMarker(commentId: string): string {
  return `ツッコミ番号 ${commentId.slice(0, 8)}`;
}

/**
 * 元の Google ドキュメントに付けるコメントの本文(docs/DESIGN.md 32 章)。
 * コメントの書き手はポータルのサービスアカウントになるので、書いた人の名前を先頭に出す。
 * 続けて場所(章と節)・引用・本文と、ポータルのその章への道を入れる。
 */
export function googleCommentContent(c: {
  id: string;
  kind: CommentKind;
  chapterTitle: string;
  sectionTitle: string;
  quote: string;
  body: string;
  authorName: string;
  url: string;
}): string {
  const place = [c.chapterTitle, c.sectionTitle].filter(Boolean).join(" › ");
  const quote = c.quote.trim().replace(/\s+/g, " ");
  return [
    [`${c.authorName} さんのツッコミ【${KIND_LABELS[c.kind].label}】`, place && `場所: ${place}`, quote && `「${quote.length > 200 ? `${quote.slice(0, 200)}…` : quote}」`]
      .filter(Boolean)
      .join("\n"),
    c.body,
    `${c.url}\n${googleCommentMarker(c.id)}`,
  ].join("\n\n");
}
