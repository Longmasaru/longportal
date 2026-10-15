import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeDate, normalizeText, parseCsv, readImportCsv } from "./import";

const HEADER = "employee_number,name,name_kana,position,department,hired_on";

test("parseCsv: 引用符・引用符内のカンマ・改行・BOM・空行に対応", () => {
  const rows = parseCsv('﻿a,"b,c","d""e"\r\n\r\n"x\ny",z\n');
  assert.deepEqual(rows, [
    ["a", "b,c", 'd"e'],
    ["x\ny", "z"],
  ]);
});

test("normalizeText: 半角カナを全角に、空白の連続を全角空白 1 つに", () => {
  assert.equal(normalizeText("ﾔﾏﾀﾞ  ﾀﾛｳ "), "ヤマダ　タロウ");
  assert.equal(normalizeText("山田　 太郎 "), "山田　太郎");
  assert.equal(normalizeText("ｻﾌﾞﾘｰﾀﾞｰ"), "サブリーダー");
  // 英字だけの氏名は半角空白(全角英字・全角空白も半角にそろう)
  assert.equal(normalizeText("JOHN　Q  SAMPLE"), "JOHN Q SAMPLE");
  assert.equal(normalizeText("ＪＡＮＥ　ＤＯＥ"), "JANE DOE");
});

test("normalizeDate: スラッシュ区切りを YYYY-MM-DD に。実在しない日付は null", () => {
  assert.equal(normalizeDate("2021/9/21"), "2021-09-21");
  assert.equal(normalizeDate("1987-04-01"), "1987-04-01");
  assert.equal(normalizeDate("2021/2/30"), null);
  assert.equal(normalizeDate("令和3年"), null);
});

test("readImportCsv: 正常な行は records、問題のある行は issues に分ける", () => {
  const csv = [
    HEADER,
    '"0001","山田  太郎","ﾔﾏﾀﾞ ﾀﾛｳ","ﾘｰﾀﾞｰ","溶接","2020/4/1"',
    '"0002","佐藤 花子","","","","2021/10/1"',
    '"","名無し","","","","2021/10/1"',
    '"0003","日付なし","","","",""',
    '"0001","重複","","","","2022/1/1"',
  ].join("\n");
  const { records, issues } = readImportCsv(csv);

  assert.deepEqual(records, [
    {
      line: 2,
      employeeNumber: "0001",
      name: "山田　太郎",
      nameKana: "ヤマダ　タロウ",
      positionName: "リーダー",
      departmentName: "溶接",
      hiredOn: "2020-04-01",
    },
    {
      line: 3,
      employeeNumber: "0002",
      name: "佐藤　花子",
      nameKana: null,
      positionName: null,
      departmentName: null,
      hiredOn: "2021-10-01",
    },
  ]);
  assert.deepEqual(
    issues.map((i) => i.line),
    [4, 5, 6],
  );
});

test("readImportCsv: 見出しが違えば何も取り込まない", () => {
  const { records, issues } = readImportCsv("番号,氏名\n1,山田");
  assert.equal(records.length, 0);
  assert.equal(issues[0].line, 1);
});
