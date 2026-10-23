import assert from "node:assert/strict";
import { test } from "node:test";
import {
  compareMembers,
  displayName,
  expiryState,
  filterMembers,
  formatJapaneseDate,
  isOnRoster,
  normalizeForSearch,
  printGrid,
  yearOrdinal,
} from "./logic";
import type { NakamaMember } from "./types";

function member(over: Partial<NakamaMember> & { employeeId: string }): NakamaMember {
  return {
    employeeNumber: over.employeeId,
    name: "グエン ヴァン アン",
    nameKana: null,
    nativeName: "",
    nickname: "",
    arrivedOn: null,
    hometown: "",
    note: "",
    hiredOn: "2024-04-01",
    departmentId: null,
    departmentName: null,
    departmentSortOrder: null,
    locationName: null,
    residenceStatus: null,
    residenceExpiresOn: null,
    ...over,
  };
}

test("yearOrdinal: 来た日に 1 年目、1 年たった日から 2 年目", () => {
  assert.equal(yearOrdinal("2024-04-10", "2024-04-10"), 1);
  assert.equal(yearOrdinal("2024-04-10", "2025-04-09"), 1);
  assert.equal(yearOrdinal("2024-04-10", "2025-04-10"), 2);
  assert.equal(yearOrdinal("2020-12-31", "2026-10-23"), 6);
  assert.equal(yearOrdinal(null, "2026-10-23"), null);
  assert.equal(yearOrdinal("2027-01-01", "2026-10-23"), null);
});

test("normalizeForSearch: ひらがな・カタカナ・ベトナム語の記号を同じに扱う", () => {
  assert.equal(normalizeForSearch("あん"), normalizeForSearch("アン"));
  assert.equal(normalizeForSearch("Nguyễn Văn Đức"), "nguyenvanduc");
  assert.equal(normalizeForSearch("グエン・ヴァン"), "グエンヴァン");
  assert.equal(normalizeForSearch("ｱﾝ"), "アン");
});

test("filterMembers: 呼び名・ベトナム語の名前・部署で探せる", () => {
  const list = [
    member({ employeeId: "1", nickname: "アン", nativeName: "Nguyễn Văn An", departmentId: "d1" }),
    member({ employeeId: "2", nickname: "トゥイ", name: "ファム ティ トゥイ", nativeName: "Phạm Thị Thủy", departmentId: "d2" }),
  ];
  assert.deepEqual(filterMembers(list, "あん", null).map((m) => m.employeeId), ["1"]);
  assert.deepEqual(filterMembers(list, "thuy", null).map((m) => m.employeeId), ["2"]);
  assert.deepEqual(filterMembers(list, "", "d2").map((m) => m.employeeId), ["2"]);
  assert.deepEqual(filterMembers(list, "  ", null).length, 2);
  assert.deepEqual(filterMembers(list, "アン", "d2").length, 0);
});

test("compareMembers: 部署の順 → 日本に来た日の順(未入力は後)", () => {
  const list = [
    member({ employeeId: "c", departmentSortOrder: null }),
    member({ employeeId: "b", departmentSortOrder: 1, departmentName: "製造", arrivedOn: null }),
    member({ employeeId: "a", departmentSortOrder: 1, departmentName: "製造", arrivedOn: "2023-01-01" }),
    member({ employeeId: "d", departmentSortOrder: 0, departmentName: "総務" }),
  ];
  assert.deepEqual([...list].sort(compareMembers).map((m) => m.employeeId), ["d", "a", "b", "c"]);
});

test("displayName: 呼び名がなければ氏名", () => {
  assert.equal(displayName({ nickname: " アン ", name: "グエン" }), "アン");
  assert.equal(displayName({ nickname: "", name: "グエン" }), "グエン");
});

test("printGrid: A4 1 枚に全員が入る", () => {
  for (let n = 1; n <= 40; n++) {
    const { columns, rows } = printGrid(n);
    assert.ok(columns * rows >= n, `${n} 人`);
    assert.ok(columns * (rows - 1) < n, `${n} 人で空の行がない`);
  }
  assert.deepEqual(printGrid(15), { columns: 4, rows: 4 });
});

test("expiryState: 90 日以内で知らせ、過ぎたら過ぎていると出す", () => {
  assert.deepEqual(expiryState(null, "2026-10-23"), { state: "none", daysLeft: null });
  assert.equal(expiryState("2027-06-01", "2026-10-23").state, "ok");
  assert.equal(expiryState("2027-01-21", "2026-10-23").state, "soon");
  assert.equal(expiryState("2026-10-23", "2026-10-23").state, "soon");
  assert.equal(expiryState("2026-10-22", "2026-10-23").state, "expired");
});

test("isOnRoster と formatJapaneseDate", () => {
  assert.equal(isOnRoster({ hiredOn: "2024-01-01", leftOn: null, status: "active" }, "2026-10-23"), true);
  assert.equal(isOnRoster({ hiredOn: "2024-01-01", leftOn: "2026-10-22", status: "active" }, "2026-10-23"), false);
  assert.equal(isOnRoster({ hiredOn: "2024-01-01", leftOn: null, status: "retired" }, "2026-10-23"), false);
  assert.equal(formatJapaneseDate("2026-01-05"), "2026年1月5日");
});
