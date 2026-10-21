import assert from "node:assert/strict";
import { test } from "node:test";
import { COMPANY_CALENDAR } from "./company-calendar";
import {
  canEditEvent,
  canSeeEvent,
  countResponses,
  isInvited,
  needsResponse,
  requiresManage,
  withCompanyOffDays,
  type EventFacts,
} from "./events";
import { nextLongHoliday, paydayOf, todaysHighlights } from "./highlights";
import { dayInfo, monthGrid, nextOffDay, remainingWorkdays, yearSummary } from "./logic";

const paidLeaveFriday = withCompanyOffDays(COMPANY_CALENDAR, [
  { date: "2026-10-30", kind: "paid_leave_day", title: "一斉有給取得日" },
]);

test("金曜の一斉有給取得日で、土日と合わせて 3 連休になる", () => {
  // 登録前の次の連休は 11/21〜23
  assert.equal(nextLongHoliday("2026-10-21")?.start, "2026-11-21");
  assert.deepEqual(nextLongHoliday("2026-10-21", paidLeaveFriday), {
    start: "2026-10-30",
    end: "2026-11-01",
    days: 3,
    name: "3連休",
    truncated: false,
  });
  // 前の日(木曜)には「明日から 3 連休」
  assert.deepEqual(
    todaysHighlights("2026-10-29", { calendar: paidLeaveFriday, payday: null }).map((h) => h.kind),
    ["holiday_tomorrow"],
  );
  assert.equal(nextOffDay("2026-10-28", paidLeaveFriday)?.date, "2026-10-30");
});

test("一斉有給取得日は休み(赤)で、有給の印が付き、残りの出勤日数と年間の出勤日が減る", () => {
  const day = dayInfo("2026-10-30", paidLeaveFriday);
  assert.equal(day.kind, "off");
  assert.equal(day.offEvent, "paid_leave_day");
  assert.equal(day.label, "一斉有給取得日");
  // 10/21〜10/31 の出勤日: 21,22,23,26,27,28,29,30 → 30 日が休みになり 7 日
  assert.equal(remainingWorkdays("2026-10-21"), 8);
  assert.equal(remainingWorkdays("2026-10-21", paidLeaveFriday), 7);
  assert.equal(yearSummary(2026, paidLeaveFriday)!.offDays, yearSummary(2026)!.offDays + 1);
  const cell = monthGrid("2026-10", paidLeaveFriday).flat().find((d) => d?.date === "2026-10-30");
  assert.equal(cell?.kind, "off");
  // 元のカレンダーは変わらない
  assert.equal(dayInfo("2026-10-30").kind, "work");
  assert.equal(COMPANY_CALENDAR[2026].extraOffDays, undefined);
});

test("臨時休業は休み。出勤土曜に重なれば出勤土曜ではなくなる", () => {
  const cal = withCompanyOffDays(COMPANY_CALENDAR, [
    { date: "2026-10-28", kind: "temporary_closure", title: "臨時休業" },
    { date: "2026-10-17", kind: "temporary_closure", title: "設備点検のため臨時休業" },
  ]);
  assert.equal(dayInfo("2026-10-28", cal).kind, "off");
  assert.equal(dayInfo("2026-10-28", cal).offEvent, "temporary_closure");
  const sat = dayInfo("2026-10-17", cal);
  assert.equal(sat.kind, "off");
  assert.equal(sat.isWorkSaturday, false);
  assert.deepEqual(todaysHighlights("2026-10-16", { calendar: cal }), []);
});

test("行事・予定は休みにしない。未登録の年の休みは無視する", () => {
  const cal = withCompanyOffDays(COMPANY_CALENDAR, [
    { date: "2026-10-28", kind: "event", title: "健康診断" },
    { date: "2027-01-08", kind: "paid_leave_day", title: "一斉有給取得日" },
  ]);
  assert.equal(dayInfo("2026-10-28", cal).kind, "work");
  assert.equal(dayInfo("2026-10-28", cal).offEvent, null);
  assert.equal(dayInfo("2027-01-08", cal).kind, "unknown");
});

test("給料日は一斉有給取得日ではずらさない", () => {
  const cal = withCompanyOffDays(COMPANY_CALENDAR, [{ date: "2026-10-29", kind: "paid_leave_day", title: "一斉有給取得日" }]);
  assert.equal(paydayOf("2026-10"), "2026-10-29");
  assert.equal(
    todaysHighlights("2026-10-29", { calendar: cal }).some((h) => h.kind === "payday"),
    true,
  );
});

const base: EventFacts = { kind: "event", date: "2026-10-30", visibility: "invitees", audienceId: null, createdBy: "u-owner" };
const viewer = (userId: string, employeeId: string | null, audiences: string[] = []) => ({
  userId,
  employeeId,
  matchedAudienceIds: new Set(audiences),
});

test("呼びかけの相手と見える条件", () => {
  const named = new Set(["e-a"]);
  // 名指しされた人
  assert.equal(isInvited(base, viewer("u-a", "e-a"), named), true);
  // 名指しされていない人には見えない
  assert.equal(isInvited(base, viewer("u-b", "e-b"), named), false);
  assert.equal(canSeeEvent(base, viewer("u-b", "e-b"), false), false);
  // 登録した本人には見えるが、相手には含めない
  assert.equal(isInvited(base, viewer("u-owner", "e-a"), named), false);
  assert.equal(canSeeEvent(base, viewer("u-owner", "e-owner"), false), true);
  // Audience に当てはまる人
  const aud = { ...base, audienceId: "aud-1" };
  assert.equal(isInvited(aud, viewer("u-c", "e-c", ["aud-1"]), new Set()), true);
  assert.equal(isInvited(aud, viewer("u-d", "e-d", ["aud-2"]), new Set()), false);
  // 社員でないアカウントは相手にならない
  assert.equal(isInvited(aud, viewer("u-x", null, ["aud-1"]), new Set()), false);
  // 全社に表示する予定は誰でも見える
  assert.equal(canSeeEvent({ ...base, visibility: "company" }, viewer("u-b", "e-b"), false), true);
  // 休みの種類は呼びかけを持たない
  assert.equal(isInvited({ ...base, kind: "paid_leave_day" }, viewer("u-a", "e-a"), named), false);
});

test("返事のお願いは、返事をするか予定の日が過ぎると消える", () => {
  assert.equal(needsResponse(base, true, null, "2026-10-21"), true);
  assert.equal(needsResponse(base, true, null, "2026-10-30"), true);
  assert.equal(needsResponse(base, true, null, "2026-10-31"), false);
  assert.equal(needsResponse(base, true, "yes", "2026-10-21"), false);
  assert.equal(needsResponse(base, false, null, "2026-10-21"), false);
  assert.deepEqual(countResponses(["yes", "no", null, "yes"]), { yes: 2, no: 1, none: 1 });
});

test("編集できる人と、権限が要る登録", () => {
  assert.equal(canEditEvent(base, { userId: "u-owner", canManage: false }), true);
  assert.equal(canEditEvent(base, { userId: "u-admin", canManage: true }), false);
  const company = { ...base, visibility: "company" as const };
  assert.equal(canEditEvent(company, { userId: "u-owner", canManage: false }), false);
  assert.equal(canEditEvent(company, { userId: "u-admin", canManage: true }), true);
  assert.equal(requiresManage({ kind: "event", visibility: "invitees", audienceId: null }), false);
  assert.equal(requiresManage({ kind: "event", visibility: "invitees", audienceId: "aud-1" }), true);
  assert.equal(requiresManage({ kind: "event", visibility: "company", audienceId: null }), true);
  assert.equal(requiresManage({ kind: "temporary_closure", visibility: "company", audienceId: null }), true);
});
