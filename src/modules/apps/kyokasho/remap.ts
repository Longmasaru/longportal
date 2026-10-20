// 取り込み直したときに、ツッコミの付いている章と節を、新しい中身の中で探し直す。docs/DESIGN.md 30 章・32 章。
// 章は番号、節は見出しの順番(s<章>-<順>)で指しているので、元の文書に章や見出しが足されると、ずれてしまう。
// ツッコミには書いた時点の章と節の題名の写しがあるので、それと同じ題名を探す。DB に依存しない(テストのため)。
import { chapterOutline, type BookContent } from "./content";

export type CommentAnchor = {
  id: string;
  chapterNo: number;
  chapterTitle: string;
  sectionId: string | null;
  sectionTitle: string;
};

export type AnchorUpdate = { id: string; chapterNo: number; sectionId: string | null };

/**
 * 付け直しが要るツッコミだけを返す。
 * - 章: 同じ番号の章の題名が同じならそのまま。違えば、同じ題名の章(元の番号に近いもの)へ。見つからなければそのまま。
 * - 節: その章の中で、同じ題名の見出し(元の順番に近いもの)へ。見つからなければ、章全体へのツッコミにする(別の節を指さないように)。
 */
export function remapAnchors(content: BookContent, comments: CommentAnchor[]): AnchorUpdate[] {
  const chapters = content.chapters;
  const updates: AnchorUpdate[] = [];
  for (const c of comments) {
    let chapterNo = c.chapterNo;
    if (chapterTitle(chapters[chapterNo - 1]?.title) !== c.chapterTitle) {
      const found = closest(
        chapters.flatMap((ch, i) => (chapterTitle(ch.title) === c.chapterTitle ? [i + 1] : [])),
        c.chapterNo,
      );
      if (found !== null) chapterNo = found;
    }
    let sectionId = c.sectionId;
    if (sectionId !== null) {
      const outline = chapters[chapterNo - 1] ? chapterOutline(chapters[chapterNo - 1]) : [];
      const same = outline.find((h) => h.id === sectionId);
      if (!same || sectionTitle(same.text) !== c.sectionTitle) {
        const order = Number(/-(\d+)$/.exec(sectionId)?.[1] ?? 0);
        const candidates = outline.flatMap((h) =>
          sectionTitle(h.text) === c.sectionTitle ? [{ id: h.id, order: Number(/-(\d+)$/.exec(h.id)?.[1] ?? 0) }] : [],
        );
        const pick = closest(
          candidates.map((h) => h.order),
          order,
        );
        sectionId = candidates.find((h) => h.order === pick)?.id ?? null;
      }
    }
    if (chapterNo !== c.chapterNo || sectionId !== c.sectionId) updates.push({ id: c.id, chapterNo, sectionId });
  }
  return updates;
}

// ツッコミに写すときと同じ形にそろえて比べる(tsukkomi-actions.ts の postCommentAction)。
const chapterTitle = (t: string | undefined) => (t ?? "").slice(0, 200);
const sectionTitle = (t: string) => t.replace(/\*\*/g, "").slice(0, 200);

function closest(values: number[], target: number): number | null {
  let best: number | null = null;
  for (const v of values) if (best === null || Math.abs(v - target) < Math.abs(best - target)) best = v;
  return best;
}
