import assert from "node:assert/strict";
import { test } from "node:test";
import { dueDayItems, type DueSource } from "./calendar-items";
import {
  abilitiesFor,
  needsHomeNotice,
  personLabel,
  requestState,
  resetOnRequestEdit,
  showsInAssigneeList,
  type RequestFacts,
} from "./requests";

const REQUESTER = "u-requester";
const ASSIGNEE = "u-assignee";
const OTHER = "u-other";

const request = (over: Partial<RequestFacts> = {}): RequestFacts => ({
  userId: ASSIGNEE,
  requestedByUserId: REQUESTER,
  isRequest: true,
  done: false,
  returned: false,
  acknowledged: false,
  ...over,
});
const own = (over: Partial<RequestFacts> = {}): RequestFacts => ({
  userId: ASSIGNEE,
  requestedByUserId: null,
  isRequest: false,
  done: false,
  returned: false,
  acknowledged: false,
  ...over,
});

test("状態: 未完了・完了・お返し", () => {
  assert.equal(requestState({ done: false, returned: false }), "open");
  assert.equal(requestState({ done: true, returned: false }), "done");
  assert.equal(requestState({ done: false, returned: true }), "returned");
});

test("見られるのは頼んだ人と頼まれた人だけ(ほかの人・管理者には特別扱いなし)", () => {
  assert.equal(abilitiesFor(REQUESTER, request()).canSee, true);
  assert.equal(abilitiesFor(ASSIGNEE, request()).canSee, true);
  assert.equal(abilitiesFor(OTHER, request()).canSee, false);
  // 本人の TODO は本人だけ
  assert.equal(abilitiesFor(ASSIGNEE, own()).canSee, true);
  assert.equal(abilitiesFor(REQUESTER, own()).canSee, false);
  // ほかの人は何もできない
  assert.deepEqual(Object.values(abilitiesFor(OTHER, request())).filter(Boolean), []);
});

test("頼んだ人: 完了するまで変更・取り下げができる。完了・お返し・並べ替えはできない", () => {
  const open = abilitiesFor(REQUESTER, request());
  assert.equal(open.canEditRequest, true);
  assert.equal(open.canWithdraw, true);
  assert.equal(open.canToggleDone, false);
  assert.equal(open.canReturn, false);
  assert.equal(open.canOrganize, false);
  assert.equal(open.canDelete, false);
  assert.equal(open.canAttach, false);

  const returned = abilitiesFor(REQUESTER, request({ returned: true }));
  assert.equal(returned.canEditRequest, true, "お返しされたものは頼み直せる");
  assert.equal(returned.canWithdraw, true);

  const done = abilitiesFor(REQUESTER, request({ done: true }));
  assert.equal(done.canEditRequest, false);
  assert.equal(done.canWithdraw, false);
});

test("頼まれた人: 完了・お返し・確認・並べ替えができる。内容の変更・削除・添付はできない", () => {
  const open = abilitiesFor(ASSIGNEE, request());
  assert.equal(open.canToggleDone, true);
  assert.equal(open.canReturn, true);
  assert.equal(open.canAcknowledge, true);
  assert.equal(open.canOrganize, true);
  assert.equal(open.canEditRequest, false);
  assert.equal(open.canEditOwn, false);
  assert.equal(open.canWithdraw, false);
  assert.equal(open.canDelete, false);
  assert.equal(open.canAttach, false);

  assert.equal(abilitiesFor(ASSIGNEE, request({ acknowledged: true })).canAcknowledge, false);

  const done = abilitiesFor(ASSIGNEE, request({ done: true }));
  assert.equal(done.canToggleDone, true, "未完了に戻せる");
  assert.equal(done.canReturn, false);
  assert.equal(done.canAcknowledge, false);

  const returned = abilitiesFor(ASSIGNEE, request({ returned: true }));
  assert.equal(returned.canToggleDone, false);
  assert.equal(returned.canReturn, false);
  assert.equal(returned.canOrganize, false);
});

test("頼んだ人のアカウントが消えた依頼は、頼まれた人だけが扱う", () => {
  const orphan = request({ requestedByUserId: null });
  assert.equal(abilitiesFor(ASSIGNEE, orphan).canReturn, true);
  assert.equal(abilitiesFor(REQUESTER, orphan).canSee, false);
});

test("本人の TODO は、これまでどおり全部できる(依頼の操作はない)", () => {
  const a = abilitiesFor(ASSIGNEE, own());
  assert.equal(a.canEditOwn && a.canDelete && a.canAttach && a.canToggleDone && a.canOrganize, true);
  assert.equal(a.canReturn || a.canEditRequest || a.canWithdraw || a.canAcknowledge, false);
});

test("一覧とホームのお知らせ", () => {
  assert.equal(showsInAssigneeList(own()), true);
  assert.equal(showsInAssigneeList(request()), true);
  assert.equal(showsInAssigneeList(request({ returned: true })), false);

  assert.equal(needsHomeNotice(request()), true);
  assert.equal(needsHomeNotice(request({ acknowledged: true })), false);
  assert.equal(needsHomeNotice(request({ done: true })), false);
  assert.equal(needsHomeNotice(request({ returned: true })), false);
  assert.equal(needsHomeNotice(own()), false);
});

test("頼み直し: 内容を変えたら確認を消し、お返しされたものは未完了に戻す", () => {
  assert.deepEqual(resetOnRequestEdit(false, false), {});
  assert.deepEqual(resetOnRequestEdit(true, false), { acknowledgedAt: null });
  assert.deepEqual(resetOnRequestEdit(false, true), {
    acknowledgedAt: null,
    returnedAt: null,
    returnedReason: null,
    done: false,
  });
});

test("名前の表示", () => {
  assert.equal(personLabel("山田 太郎"), "山田 太郎さん");
  assert.equal(personLabel(null), "(不明な人)");
  assert.equal(personLabel("  "), "(不明な人)");
});

test("カレンダーの印: 未完了で期限のあるものだけ、期限の順に。依頼は「○○さんから」", () => {
  const rows: DueSource[] = [
    {
      id: "1",
      text: "見積もりを出す",
      dueDate: "2026-10-23",
      done: false,
      isRequest: true,
      returned: false,
      requesterName: "山田",
    },
    {
      id: "2",
      text: "日報",
      dueDate: "2026-10-20",
      done: false,
      isRequest: false,
      returned: false,
      requesterName: null,
    },
    { id: "3", text: "期限なし", dueDate: null, done: false, isRequest: false, returned: false, requesterName: null },
    {
      id: "4",
      text: "完了済み",
      dueDate: "2026-10-21",
      done: true,
      isRequest: false,
      returned: false,
      requesterName: null,
    },
    {
      id: "5",
      text: "お返し済み",
      dueDate: "2026-10-22",
      done: false,
      isRequest: true,
      returned: true,
      requesterName: "佐藤",
    },
  ];
  assert.deepEqual(dueDayItems(rows, "/apps/todo"), [
    { id: "2", date: "2026-10-20", title: "日報", tag: "TODO", href: "/apps/todo" },
    { id: "1", date: "2026-10-23", title: "見積もりを出す", tag: "山田さんから", href: "/apps/todo" },
  ]);
  assert.deepEqual(dueDayItems([], "/apps/todo"), []);
});
