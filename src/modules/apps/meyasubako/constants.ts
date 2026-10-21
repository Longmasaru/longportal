// 目安箱の決まり(docs/DESIGN.md 42 章)。DB・ネットワークに依存しない純粋な定数と関数。

/** 何についての投稿か。key は DB に保存するので変えない(表示名は変えてよい)。 */
export const MEYASUBAKO_CATEGORIES = ["request", "hazard", "consult", "idea", "want", "thanks", "other"] as const;
export type MeyasubakoCategory = (typeof MEYASUBAKO_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<MeyasubakoCategory, { label: string; hint: string }> = {
  request: { label: "要望", hint: "こうしてほしい" },
  hazard: { label: "ヒヤリハット・危険", hint: "危なかった・注意が必要" },
  consult: { label: "困りごと・相談", hint: "どうしたらいい?" },
  idea: { label: "意見・提案", hint: "こうすると良くなる" },
  want: { label: "欲しいもの", hint: "ここに〇〇があれば" },
  thanks: { label: "ありがとう・よかったこと", hint: "共有したい良い話" },
  other: { label: "その他", hint: "" },
};

/** 宛先。基本は会社宛て。リーダー宛ては、投稿者の所属を範囲に持つリーダーにも見える。 */
export const MEYASUBAKO_DESTINATIONS = ["company", "leader"] as const;
export type MeyasubakoDestination = (typeof MEYASUBAKO_DESTINATIONS)[number];
export const DESTINATION_LABEL: Record<MeyasubakoDestination, string> = {
  company: "会社宛て",
  leader: "リーダー宛て",
};

/** ほかの社員に見せるか。押し間違いを防ぐため、画面では初期値を置かず必ず選ばせる。 */
export const MEYASUBAKO_VISIBILITIES = ["public", "private"] as const;
export type MeyasubakoVisibility = (typeof MEYASUBAKO_VISIBILITIES)[number];
export const VISIBILITY_LABEL: Record<MeyasubakoVisibility, { label: string; hint: string }> = {
  public: { label: "みんなに見えてOK", hint: "「みんなの投稿」に出ます。会社からの返事も全員が読めます。" },
  private: { label: "管理者だけに送る", hint: "ほかの社員には見えません。相談や個人的なことはこちら。" },
};

/** 対応の状況。new = まだ誰も開いていない。 */
export const MEYASUBAKO_STATUSES = ["new", "seen", "doing", "done"] as const;
export type MeyasubakoStatus = (typeof MEYASUBAKO_STATUSES)[number];
export const STATUS_LABEL: Record<MeyasubakoStatus, string> = {
  new: "未読",
  seen: "確認済み",
  doing: "対応中",
  done: "完了",
};

export const BODY_MAX = 2000;
export const PLACE_MAX = 100;
export const MESSAGE_MAX = 1000;
export const PHOTO_MAX_COUNT = 4;
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
export const PHOTO_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
/** 1 人が 1 日に送れる投稿の数(連投の防止)。 */
export const DAILY_POST_LIMIT = 20;
/** 「みんなの投稿」に出す件数。 */
export const PUBLIC_LIMIT = 100;

/** 全投稿を見て、返事・状況の変更・削除ができる権限(全社で割り当てる)。 */
export const MANAGE_PERMISSION = "meyasubako.posts.manage";
/** 「リーダー宛て」の投稿のうち、投稿者の所属(投稿時)が割当の範囲に入るものを見て返事ができる権限。 */
export const LEADER_PERMISSION = "meyasubako.leader.respond";

/** 投稿の入力で足りないもの(画面と Server Action で同じ判定を使う)。 */
export type MissingField = "category" | "visibility" | "content";

export function missingFields(input: {
  category: string | null | undefined;
  visibility: string | null | undefined;
  body: string;
  photoCount: number;
}): MissingField[] {
  const missing: MissingField[] = [];
  if (!MEYASUBAKO_CATEGORIES.includes(input.category as MeyasubakoCategory)) missing.push("category");
  if (input.body.trim() === "" && input.photoCount === 0) missing.push("content");
  if (!MEYASUBAKO_VISIBILITIES.includes(input.visibility as MeyasubakoVisibility)) missing.push("visibility");
  return missing;
}

export const MISSING_MESSAGE: Record<MissingField, string> = {
  category: "カテゴリが選ばれていません",
  content: "内容が空です(写真だけでも送れます)",
  visibility: "「みんなに見えてOK」か「管理者だけ」かが選ばれていません",
};

/** 投稿に対して、見る人ができること(判定に要る値だけを受け取る)。 */
export type PostAccessInput = {
  authorUserId: string;
  visibility: MeyasubakoVisibility;
  anonymous: boolean;
};

export type PostAccess = {
  view: boolean;
  /** 返事・状況の変更ができる(管理する人・範囲内のリーダー)。 */
  respond: boolean;
  /** やり取りに書き込める(投稿者本人か、返事ができる人)。 */
  message: boolean;
  /** 投稿者の名前を出してよい(匿名なら本人以外には出さない。管理する人にも出さない)。 */
  showAuthor: boolean;
  isAuthor: boolean;
};

/** respond = 管理する人か、リーダー宛てで範囲内のリーダーか(呼び出し側で権限から求める)。 */
export function postAccess(post: PostAccessInput, viewerUserId: string, respond: boolean): PostAccess {
  const isAuthor = post.authorUserId === viewerUserId;
  const view = isAuthor || respond || post.visibility === "public";
  return {
    view,
    respond,
    message: isAuthor || respond,
    showAuthor: view && (!post.anonymous || isAuthor),
    isAuthor,
  };
}

/** 返事をする側が見るべき投稿か(未読、または投稿者があとから書き足した)。 */
export function needsResponder(post: {
  status: MeyasubakoStatus;
  authorActivityAt: Date | null;
  responderReadAt: Date | null;
}): boolean {
  if (post.status === "new") return true;
  if (!post.authorActivityAt) return false;
  return !post.responderReadAt || post.authorActivityAt > post.responderReadAt;
}

/** 投稿者に、まだ読んでいない返事・状況の変化があるか。 */
export function unreadForAuthor(post: { responderActivityAt: Date | null; authorReadAt: Date | null }): boolean {
  if (!post.responderActivityAt) return false;
  return !post.authorReadAt || post.responderActivityAt > post.authorReadAt;
}
