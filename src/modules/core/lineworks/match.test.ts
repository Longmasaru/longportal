import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveRoom } from "./match";

const roster = [
  { familyName: "稲荷", givenName: "一郎", department: "ブレーキ部" },
  { familyName: "上田", givenName: "二郎", department: "ブレーキ部" },
  { familyName: "谷口", givenName: "三郎", department: "技術部" },
  { familyName: "松本", givenName: "四郎", department: "技術部" },
  { familyName: "松本", givenName: "五郎", department: "総務・経理" },
];
const directory = [
  { userId: "inari@x", lastName: "稲荷", firstName: "一郎" },
  { userId: "ueda@x", lastName: "上田", firstName: "二郎" },
  { userId: "taniguchi@x", lastName: "谷口", firstName: "三郎" },
  { userId: "matsumoto4@x", lastName: "松本", firstName: "四郎" },
];

test("部署の全員: LINE WORKS にいない人は別に返す", () => {
  const r = resolveRoom({ key: "技術部", title: "t", departments: ["技術部"] }, roster, directory);
  assert.deepEqual(r.memberIds, ["taniguchi@x", "matsumoto4@x"]);
  assert.deepEqual(r.notInLineWorks, []);
  assert.deepEqual(r.problems, []);
  const all = resolveRoom({ key: "*", title: "t", all: true }, roster, directory);
  assert.equal(all.memberIds.length, 4);
  assert.deepEqual(all.notInLineWorks, ["松本 五郎"]);
});

test("名指し: 名字だけで 1 人に決まれば入れる。何人もいる・いないときは問題として返す", () => {
  const r = resolveRoom({ key: "stud", title: "t", members: ["稲荷", "上田", "松本", "無量江", "松本 四郎"] }, roster, directory);
  assert.deepEqual(r.memberIds, ["inari@x", "ueda@x", "matsumoto4@x"]);
  assert.equal(r.problems.length, 2);
  assert.match(r.problems[0], /松本.*2 人/);
  assert.match(r.problems[1], /無量江/);
});
