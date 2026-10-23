import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GUIDES } from "./guides";
import { findGuide, formatCheckedOn, groupGuides, validateGuides } from "./logic";
import type { Guide } from "./types";

function guide(slug: string, category: string, sortOrder: number, title = slug): Guide {
  return {
    slug,
    category,
    title,
    description: "",
    checkedOn: "2026-10-23",
    sortOrder,
    sections: [{ id: "a", title: "A", parts: [{ blocks: [{ kind: "text", text: "x" }] }] }],
    sources: [],
  };
}

describe("手順書", () => {
  it("登録してある手順書に書き間違いがない", () => {
    assert.deepEqual(validateGuides(GUIDES), []);
  });

  it("書き間違いを見つける", () => {
    const bad = guide("Bad Slug", "x", 1);
    bad.sections.push({ id: "a", title: "dup", parts: [{ blocks: [] }] });
    const problems = validateGuides([bad, guide("ok", "x", 2), guide("ok", "x", 3)]);
    assert.ok(problems.some((p) => p.includes("slug の形")));
    assert.ok(problems.some((p) => p.includes("id が重なって")));
    assert.ok(problems.some((p) => p.includes("中身がありません")));
    assert.ok(problems.some((p) => p.includes("slug が重なって")));
  });

  it("まとまりごとに並び順で並べる", () => {
    const groups = groupGuides([guide("c", "B", 30), guide("a", "A", 20), guide("b", "B", 10)]);
    assert.deepEqual(
      groups.map((g) => [g.category, g.guides.map((x) => x.slug)]),
      [
        ["B", ["b", "c"]],
        ["A", ["a"]],
      ],
    );
  });

  it("slug で探す・日付の表記", () => {
    assert.equal(findGuide([guide("a", "A", 1)], "a")?.slug, "a");
    assert.equal(findGuide([guide("a", "A", 1)], "z"), undefined);
    assert.equal(formatCheckedOn("2026-10-23"), "2026.10.23");
  });
});
