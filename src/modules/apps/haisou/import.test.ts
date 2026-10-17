import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeClock, parseJstDateTime, readClients, readDrivers, readHistory, readSavedRoutes } from "./import";

test("normalizeClock", () => {
  assert.equal(normalizeClock("9:00"), "09:00");
  assert.equal(normalizeClock("09:05:00"), "09:05");
  assert.equal(normalizeClock("直行"), "直行");
});

test("readClients: No. は元のシートの行番号。空の行は飛ばし、区分と滞在をそろえる", () => {
  const csv = [
    "会社名,フリガナ,担当者,住所,電話番号,受注先1/外注先2,滞在時間(分)",
    "テスト商事,テストショウジ,社長,金沢市,076-000-0000,1.0,30.0",
    ",,,,,,",
    "外注工業,ガイチュウ,,白山市,,2,",
  ].join("\n");
  const { records, issues } = readClients(csv);
  assert.equal(issues.length, 0);
  assert.deepEqual(
    records.map((r) => [r.rowNo, r.name, r.kind, r.stayMin, r.lat]),
    [
      [2, "テスト商事", 1, 30, null],
      [4, "外注工業", 2, null, null],
    ],
  );
});

test("readDrivers: シートの順に並べる", () => {
  const { records } = readDrivers("氏名,メールアドレス\n竹下,a@example.com\n\n梶,\n");
  assert.deepEqual(records, [
    { name: "竹下", email: "a@example.com", sortOrder: 1 },
    { name: "梶", email: "", sortOrder: 2 },
  ]);
});

test("readHistory: 見出しなし。順番が 1 に戻るか、便が変わったら別の保存", () => {
  const row = (shift: string, seq: number, name: string) =>
    `2026年9月8日(火),${shift},竹下,9:00:00,11:41,${seq},${name},,金沢市,,納品,,09:51,10:01,10,${seq === 1 ? "12.3" : ""},${seq === 1 ? "60" : ""},,`;
  const csv = [row("AM", 1, "A"), row("AM", 2, "B"), row("AM", 1, "C"), row("PM", 1, "D")].join("\n");
  const { records, issues } = readHistory(csv);
  assert.equal(issues.length, 0);
  assert.deepEqual(
    records.map((r) => r.batch),
    [1, 1, 2, 3],
  );
  assert.equal(records[0].deliveryDate, "2026-09-08");
  assert.equal(records[0].startTime, "09:00");
  assert.equal(records[0].totalKm, 12.3);
  assert.equal(records[1].totalMin, null);
});

test("readSavedRoutes: 保存日時は JST、同じ名前は下の行", () => {
  const csv = [
    "保存名,保存日時,配達日,配達者,AM件数,PM件数,データ(JSON)",
    'A,2026-09-14 22:29:35,2026-09-16 00:00:00,梶,2,3,"{""date"":""2026-09-16""}"',
    'A,2026-09-15 08:00:00,2026-09-16,梶,1,0,"{""date"":""2026-09-16""}"',
    "B,2026-09-15 08:00:00,,梶,0,0,{壊れた",
  ].join("\n");
  const { records, issues } = readSavedRoutes(csv);
  assert.equal(records.length, 1);
  assert.equal(records[0].amCount, 1);
  assert.equal(records[0].deliveryDate, "2026-09-16");
  assert.equal(records[0].savedAt.toISOString(), "2026-09-14T23:00:00.000Z");
  assert.equal(issues.length, 2);
});

test("parseJstDateTime", () => {
  assert.equal(parseJstDateTime("2026/9/14 22:29")?.toISOString(), "2026-09-14T13:29:00.000Z");
  assert.equal(parseJstDateTime("あした"), null);
});
