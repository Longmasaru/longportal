import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Grant } from "@/modules/core/access/grants";
import {
  awaitsComment,
  canReviewEmployee,
  emptyFields,
  mergeSorted,
  reportMode,
  sanitizeSorted,
  shouldRemindToday,
  submitProblem,
} from "./logic";

const CODE = "nippo.reports.review";
const grant = (locationId: string | null, departmentId: string | null, code = CODE): Grant => ({
  permissionCode: code,
  locationId,
  departmentId,
});

describe("canReviewEmployee", () => {
  it("全社の割当なら全員", () => {
    assert.equal(canReviewEmployee([grant(null, null)], CODE, []), true);
  });

  it("部署つきの割当は、その部署の社員だけ", () => {
    const grants = [grant(null, "dept-x")];
    assert.equal(canReviewEmployee(grants, CODE, [{ locationId: "loc-a", departmentId: "dept-x" }]), true);
    assert.equal(canReviewEmployee(grants, CODE, [{ locationId: "loc-a", departmentId: "dept-y" }]), false);
    assert.equal(canReviewEmployee(grants, CODE, []), false);
  });

  it("別の権限では読めない", () => {
    assert.equal(canReviewEmployee([grant(null, null, "hr.records.manage")], CODE, []), false);
  });
});

describe("reportMode", () => {
  it("自分の日報は、権限があっても本人の見え方", () => {
    assert.equal(reportMode("e1", "e1", "draft", true), "owner");
    assert.equal(reportMode("e1", "e1", "submitted", false), "owner");
  });

  it("指導者には、提出済みだけが見える", () => {
    assert.equal(reportMode("m1", "e1", "submitted", true), "reviewer");
    assert.equal(reportMode("m1", "e1", "draft", true), "none");
  });

  it("権限がなければ、他の人の日報は見えない", () => {
    assert.equal(reportMode("x1", "e1", "submitted", false), "none");
    assert.equal(reportMode(null, "e1", "submitted", false), "none");
  });
});

describe("awaitsComment", () => {
  it("提出済みで、本人以外のコメントがないとき", () => {
    assert.equal(awaitsComment("submitted", 0), true);
    assert.equal(awaitsComment("submitted", 1), false);
    assert.equal(awaitsComment("draft", 0), false);
  });
});

describe("shouldRemindToday", () => {
  it("日報を書く人で、今日まだ提出していないとき", () => {
    assert.equal(shouldRemindToday("火", true, null), true);
    assert.equal(shouldRemindToday("火", true, "draft"), true);
    assert.equal(shouldRemindToday("火", true, "submitted"), false);
  });

  it("一度も書いていない人と、日曜には出さない", () => {
    assert.equal(shouldRemindToday("火", false, null), false);
    assert.equal(shouldRemindToday("日", true, null), false);
  });
});

describe("submitProblem", () => {
  it("研修内容が空なら提出できない", () => {
    assert.notEqual(submitProblem(emptyFields()), null);
    assert.equal(submitProblem({ ...emptyFields(), training: "図面作成" }), null);
  });
});

describe("sanitizeSorted", () => {
  it("知らない項目・型の違うもの・範囲外の点数は捨てる", () => {
    const out = sanitizeSorted({ training: " 図面作成 ", unknown: "x", taught: 3, score: 11, difficult: "" });
    assert.deepEqual(out, { training: "図面作成" });
  });

  it("点数は 1〜10 の整数だけ", () => {
    assert.equal(sanitizeSorted({ score: 7 }).score, 7);
    assert.equal(sanitizeSorted({ score: 6.5 }).score, undefined);
    assert.equal(sanitizeSorted({ score: "7" }).score, undefined);
  });

  it("オブジェクトでなければ空", () => {
    assert.deepEqual(sanitizeSorted(null), {});
    assert.deepEqual(sanitizeSorted("text"), {});
  });
});

describe("mergeSorted", () => {
  it("空の項目には入れ、書いてある項目には後ろに足す", () => {
    const current = { ...emptyFields(), training: "午前: 朝礼" };
    const next = mergeSorted(current, { training: "午後: 図面", taught: "穴認識の手順" });
    assert.equal(next.training, "午前: 朝礼\n午後: 図面");
    assert.equal(next.taught, "穴認識の手順");
  });

  it("点数は、まだ付いていないときだけ入れる", () => {
    assert.equal(mergeSorted(emptyFields(), { score: 6 }).score, 6);
    assert.equal(mergeSorted({ ...emptyFields(), score: 8 }, { score: 6 }).score, 8);
  });
});
