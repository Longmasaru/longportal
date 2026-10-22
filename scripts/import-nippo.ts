// 過去の日報の取り込み(Google ドキュメントの「日報まとめ」から)。docs/DESIGN.md 39 章。
// 1 人分のドキュメントを、1 日 1 件の「提出済み」の日報にし、「指導者からのフィードバック」を指導者のコメントにする。
// すでに日報がある日は、取り込まない(アプリで書いたものを上書きしない)。ただし、提出済みでまだ指導者のコメントがなく、
// ドキュメントにフィードバックがある日は、そのコメントだけを足す(取り込んだあとにドキュメントへ書いたフィードバック)。
//
// 実行(既定は確認だけで、DB に書き込まない):
//   npm run db:import-nippo -- <テキストのパス> --employee <社員番号> --mentor <指導者のログインID> --actor <ログインID> [--apply]
// テキストは、Google ドキュメントの「ファイル → ダウンロード → 書式なしテキスト(.txt)」で保存したもの。
// 日報の中身は個人の記録のため、ファイルはリポジトリの中に置かないこと。出力にも本文は出さない(日付と件数だけ)。
import { readFileSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import { db, pool } from "../src/db/client";
import { parseNippoDocument, type ParsedReport } from "../src/modules/apps/nippo/import";
import { nippoComments, nippoReports } from "../src/modules/apps/nippo/schema";
import { writeAuditLog } from "../src/modules/core/audit";
import { users } from "../src/modules/core/auth/schema";
import { employees } from "../src/modules/core/employees/schema";
import { todayJst } from "../src/modules/core/shared/jst";
import { assertTarget } from "./guard";

/** その日の JST の時刻(提出・コメントの日時の目安。元のドキュメントには時刻がない)。 */
function jstAt(date: string, time: string): Date {
  return new Date(`${date}T${time}:00+09:00`);
}

function option(argv: string[], name: string): string {
  const i = argv.indexOf(name);
  return i >= 0 ? (argv[i + 1] ?? "").trim() : "";
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const apply = argv.includes("--apply");
  const employeeNumber = option(argv, "--employee");
  const mentorLoginId = option(argv, "--mentor").toLowerCase();
  const actorLoginId = option(argv, "--actor").toLowerCase();
  const valued = new Set(["--employee", "--mentor", "--actor"]);
  const path = argv.find((a, i) => !a.startsWith("--") && !valued.has(argv[i - 1]));
  if (!path || !employeeNumber || !mentorLoginId || !actorLoginId) {
    throw new Error(
      "使い方: npm run db:import-nippo -- <テキストのパス> --employee <社員番号> --mentor <ログインID> --actor <ログインID> [--apply]",
    );
  }
  assertTarget("import-nippo");

  const today = todayJst();
  const { reports, skipped } = parseNippoDocument(readFileSync(path, "utf8"), Number(today.slice(0, 4)));

  const [employee] = await db.select().from(employees).where(eq(employees.employeeNumber, employeeNumber));
  if (!employee) throw new Error(`社員番号 ${employeeNumber} の社員が見つかりません。`);
  const [owner] = await db.select({ id: users.id }).from(users).where(eq(users.employeeId, employee.id));
  const [mentor] = await db.select({ id: users.id, status: users.status }).from(users).where(eq(users.loginId, mentorLoginId));
  if (!mentor || mentor.status !== "active") throw new Error("--mentor のアカウントが見つからないか、無効です。");
  const [actor] = await db.select({ id: users.id, status: users.status }).from(users).where(eq(users.loginId, actorLoginId));
  if (!actor || actor.status !== "active") throw new Error("--actor のアカウントが見つからないか、無効です。");

  const existing = new Map(
    (
      await db
        .select({ id: nippoReports.id, reportDate: nippoReports.reportDate, status: nippoReports.status })
        .from(nippoReports)
        .where(eq(nippoReports.employeeId, employee.id))
    ).map((r) => [r.reportDate, r]),
  );
  // 指導者(本人以外)のコメントがすでにある日報。
  const reviewed = new Set(
    (
      await db
        .selectDistinct({ reportId: nippoComments.reportId })
        .from(nippoComments)
        .innerJoin(nippoReports, eq(nippoComments.reportId, nippoReports.id))
        .where(and(eq(nippoReports.employeeId, employee.id), eq(nippoComments.byOwner, false)))
    ).map((r) => r.reportId),
  );

  const problems: string[] = [];
  const seen = new Set<string>();
  const toInsert: ParsedReport[] = [];
  const toComment: { reportId: string; reportDate: string; body: string }[] = [];
  let already = 0;
  for (const r of reports) {
    // 「氏名」の欄が、取り込み先の社員の姓で始まっているか(別の人のドキュメントを取り違えないため)。
    if (r.name && !r.name.startsWith(employee.familyName.replace(/\s/g, ""))) {
      problems.push(`${r.reportDate}: 氏名の欄が社員番号 ${employeeNumber} の社員と一致しません`);
    } else if (r.reportDate > today) problems.push(`${r.reportDate}: 今日より後の日付です`);
    else if (seen.has(r.reportDate)) problems.push(`${r.reportDate}: 同じ日付の日報が 2 つあります`);
    else {
      const e = existing.get(r.reportDate);
      if (!e) toInsert.push(r);
      else {
        already++;
        if (r.feedback && e.status === "submitted" && !reviewed.has(e.id)) {
          toComment.push({ reportId: e.id, reportDate: r.reportDate, body: r.feedback });
        }
      }
    }
    seen.add(r.reportDate);
  }
  const withFeedback = toInsert.filter((r) => r.feedback).length;
  const unknown = [...new Set(toInsert.flatMap((r) => r.unknownHeadings))];

  console.log(
    `[nippo] 読み取った日報: ${reports.length} 件(${reports[0]?.reportDate ?? "-"} 〜 ${reports.at(-1)?.reportDate ?? "-"})/ 日付が読めない: ${skipped} 件`,
  );
  console.log(
    `[nippo] 取り込む: ${toInsert.length} 件(うちコメントつき ${withFeedback} 件)/ すでにある日: ${already} 件 / 問題: ${problems.length} 件`,
  );
  if (toComment.length > 0) {
    console.log(`[nippo] すでにある日に、指導者のコメントを足す: ${toComment.length} 件(${toComment.map((c) => c.reportDate).join("、")})`);
  }
  if (unknown.length > 0) console.log(`[nippo] 決まった項目にない見出し(「自分で気づいたこと」に残す): ${unknown.join("、")}`);
  if (!owner) console.log("[nippo] この社員にはアカウントがありません(書いた人のアカウントは空で取り込みます)。");
  for (const p of problems) console.log(`  - ${p}`);
  if (!apply) {
    console.log("[nippo] 確認だけで終了しました(DB は変更していません)。書き込むには --apply を付けてください。");
    return;
  }
  if (problems.length > 0) throw new Error("問題のある日報があるため、何も取り込んでいません。");

  await db.transaction(async (tx) => {
    for (const r of toInsert) {
      const submittedAt = jstAt(r.reportDate, "17:30");
      const [row] = await tx
        .insert(nippoReports)
        .values({
          employeeId: employee.id,
          reportDate: r.reportDate,
          status: "submitted",
          ...r.fields,
          submittedAt,
          authorUserId: owner?.id ?? null,
          createdAt: submittedAt,
          updatedAt: submittedAt,
        })
        .returning({ id: nippoReports.id });
      if (r.feedback) {
        const at = jstAt(r.reportDate, "18:00");
        await tx.insert(nippoComments).values({
          reportId: row.id,
          authorUserId: mentor.id,
          byOwner: false,
          body: r.feedback,
          createdAt: at,
          updatedAt: at,
        });
      }
    }
    for (const c of toComment) {
      const at = jstAt(c.reportDate, "18:00");
      await tx.insert(nippoComments).values({
        reportId: c.reportId,
        authorUserId: mentor.id,
        byOwner: false,
        body: c.body,
        createdAt: at,
        updatedAt: at,
      });
    }
    // 監査ログには、日報の本文は残さない(誰の日報を何件取り込んだかだけ)。
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "nippo.report.import",
      targetType: "employee",
      targetId: employee.id,
      after: { reports: toInsert.length, comments: withFeedback + toComment.length, source: "google_docs" },
    });
  });
  const count = await db
    .select({ id: nippoReports.id })
    .from(nippoReports)
    .where(and(eq(nippoReports.employeeId, employee.id), eq(nippoReports.status, "submitted")));
  console.log(`[nippo] 取り込みました: ${toInsert.length} 件・足したコメント ${toComment.length} 件(この社員の提出済みの日報は全部で ${count.length} 件)`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
