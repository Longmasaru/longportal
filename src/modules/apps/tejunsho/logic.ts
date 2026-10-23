import type { Guide } from "./types";

// 手順書の並べ方・探し方(DB を使わない純粋関数。logic.test.ts で確かめる)。

/** slug と節の id に使える形。 */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** まとまりごとに、並び順 → 題名の順で並べる。まとまりは最初に出てくる手順書の並び順で並べる。 */
export function groupGuides(guides: readonly Guide[]): { category: string; guides: Guide[] }[] {
  const sorted = [...guides].sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "ja"));
  const groups = new Map<string, Guide[]>();
  for (const guide of sorted) {
    const list = groups.get(guide.category);
    if (list) list.push(guide);
    else groups.set(guide.category, [guide]);
  }
  return [...groups].map(([category, list]) => ({ category, guides: list }));
}

export function findGuide(guides: readonly Guide[], slug: string): Guide | undefined {
  return guides.find((g) => g.slug === slug);
}

/** 画面に出す日付(YYYY.MM.DD)。 */
export function formatCheckedOn(date: string): string {
  return date.replaceAll("-", ".");
}

/** 手順書の書き間違い(slug・節の id の重複や形、空の節)を探す。問題がなければ空の配列。 */
export function validateGuides(guides: readonly Guide[]): string[] {
  const problems: string[] = [];
  const slugs = new Set<string>();
  for (const guide of guides) {
    if (!SLUG_PATTERN.test(guide.slug)) problems.push(`${guide.slug}: slug の形が正しくありません`);
    if (slugs.has(guide.slug)) problems.push(`${guide.slug}: slug が重なっています`);
    slugs.add(guide.slug);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(guide.checkedOn)) problems.push(`${guide.slug}: checkedOn は YYYY-MM-DD で書きます`);
    if (guide.sections.length === 0) problems.push(`${guide.slug}: 節がありません`);
    const ids = new Set<string>();
    for (const section of guide.sections) {
      if (!SLUG_PATTERN.test(section.id)) problems.push(`${guide.slug}#${section.id}: id の形が正しくありません`);
      if (ids.has(section.id)) problems.push(`${guide.slug}#${section.id}: id が重なっています`);
      ids.add(section.id);
      if (section.parts.every((p) => p.blocks.length === 0)) problems.push(`${guide.slug}#${section.id}: 中身がありません`);
    }
    for (const source of guide.sources) {
      if (!source.url.startsWith("https://")) problems.push(`${guide.slug}: 出典の URL は https:// で書きます`);
    }
  }
  return problems;
}
