// 教科書を見られるかの判定(純粋関数)。docs/DESIGN.md 30 章。deny by default。

export type BookAccessInput = {
  isPublished: boolean;
  target: string;
  audienceId: string | null;
};

/**
 * 社員として見られるか: 公開済みで、全員向けか、当てはまる Audience の教科書。
 * 管理する人(kyokasho.books.manage)は、非公開・対象外の教科書も確認のために見られる。
 */
export function canViewBook(book: BookAccessInput, matchedAudienceIds: ReadonlySet<string>, canManage: boolean): boolean {
  if (canManage) return true;
  if (!book.isPublished) return false;
  if (book.target === "company") return true;
  return book.target === "audience" && book.audienceId !== null && matchedAudienceIds.has(book.audienceId);
}

/** 一覧の並び: まとまり(部署)ごとに、まとまりの中の最小の並び順で並べ、その中は並び順・題名の順。 */
export function groupBooks<T extends { department: string; sortOrder: number; title: string }>(
  books: T[],
): { department: string; books: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const b of [...books].sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "ja"))) {
    const list = groups.get(b.department) ?? [];
    list.push(b);
    groups.set(b.department, list);
  }
  return [...groups].map(([department, list]) => ({ department, books: list }));
}

/** URL に使う名前の形。画面の固定の住所(images・manage)とは重ならないようにする。 */
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/;
export const RESERVED_SLUGS = new Set(["images", "manage", "new"]);

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug) && !RESERVED_SLUGS.has(slug);
}

/** Google ドキュメントの URL から、文書の ID を取り出す(ドキュメントの URL でなければ null)。 */
export function googleDocId(url: string): string | null {
  const m = /^https:\/\/docs\.google\.com\/document\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]{20,})/.exec(url.trim());
  return m ? m[1] : null;
}
