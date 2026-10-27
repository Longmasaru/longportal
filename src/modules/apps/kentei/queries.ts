import { asc, desc, eq, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { canGlobally, type Actor } from "@/modules/core/access";
import { users } from "@/modules/core/auth/schema";
import { employees } from "@/modules/core/employees/schema";
import { progressOf, summarizeAnswers, type Progress, type QuestionStat } from "./logic";
import { MANAGE_PERMISSION, RESULTS_PERMISSION } from "./manifest";
import { kenteiAnswers, kenteiExams, kenteiImages, kenteiTestResults, type KenteiExamRow } from "./schema";

// 技能検定の練習の読み出し。入口はページで requireAppAccess("kentei") を通したうえで判定する。
// 公開の試験は、アプリを使える人なら誰でも練習できる。非公開の試験は kentei.exams.manage の人だけ。
// 記録は本人のものだけ。ほかの人の記録は kentei.results.view の人だけが見る。

export function canManageExams(actor: Actor): boolean {
  return canGlobally(actor, MANAGE_PERMISSION);
}

export function canViewResults(actor: Actor): boolean {
  return canGlobally(actor, RESULTS_PERMISSION);
}

export type ExamSummary = {
  id: string;
  slug: string;
  title: string;
  grade: string;
  titleVi: string;
  isPublished: boolean;
  questionCount: number;
  hasPractical: boolean;
};

/** 練習できる試験の一覧(中身は含まない)。 */
export async function listExamsForActor(actor: Actor): Promise<ExamSummary[]> {
  const manage = canManageExams(actor);
  const rows = await db
    .select()
    .from(kenteiExams)
    .where(manage ? undefined : eq(kenteiExams.isPublished, true))
    .orderBy(asc(kenteiExams.sortOrder), asc(kenteiExams.title));
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    grade: r.grade,
    titleVi: r.titleVi,
    isPublished: r.isPublished,
    questionCount: r.content.questions.length,
    hasPractical: r.content.practical !== null,
  }));
}

/** 試験を 1 つ(中身つき)。練習できなければ 404(存在も知らせない)。 */
export async function requireExamForActor(actor: Actor, slug: string): Promise<KenteiExamRow> {
  const [row] = await db.select().from(kenteiExams).where(eq(kenteiExams.slug, slug)).limit(1);
  if (!row || (!row.isPublished && !canManageExams(actor))) notFound();
  return row;
}

/** 練習できる試験か(Server Action 用。見つからなければ null)。 */
export async function findExamForActor(actor: Actor, examId: string): Promise<KenteiExamRow | null> {
  const [row] = await db.select().from(kenteiExams).where(eq(kenteiExams.id, examId)).limit(1);
  if (!row || (!row.isPublished && !canManageExams(actor))) return null;
  return row;
}

export type TestRecord = {
  id: string;
  kind: "random" | "past";
  round: number | null;
  correct: number;
  total: number;
  score: number;
  passed: boolean;
  seconds: number;
  takenAt: Date;
};

const testColumns = {
  id: kenteiTestResults.id,
  kind: kenteiTestResults.kind,
  round: kenteiTestResults.round,
  correct: kenteiTestResults.correct,
  total: kenteiTestResults.total,
  score: kenteiTestResults.score,
  passed: kenteiTestResults.passed,
  seconds: kenteiTestResults.seconds,
  takenAt: kenteiTestResults.takenAt,
};

/** 本人(または指導する人が見る 1 人)の記録。 */
export async function loadRecords(
  userId: string,
  examId: string,
): Promise<{ stats: Record<string, QuestionStat>; tests: TestRecord[] }> {
  const [answers, tests] = await Promise.all([
    db
      .select({
        questionId: kenteiAnswers.questionId,
        correct: kenteiAnswers.correct,
      })
      .from(kenteiAnswers)
      .where(and(eq(kenteiAnswers.userId, userId), eq(kenteiAnswers.examId, examId)))
      .orderBy(asc(kenteiAnswers.answeredAt), asc(kenteiAnswers.id)),
    db
      .select(testColumns)
      .from(kenteiTestResults)
      .where(and(eq(kenteiTestResults.userId, userId), eq(kenteiTestResults.examId, examId)))
      .orderBy(desc(kenteiTestResults.takenAt))
      .limit(100),
  ]);
  return { stats: summarizeAnswers(answers), tests: tests as TestRecord[] };
}

export type LearnerRow = {
  userId: string;
  name: string;
  employeeNumber: string | null;
  progress: Progress;
  testCount: number;
  passCount: number;
  bestScore: number | null;
  lastScore: number | null;
  lastActivity: Date | null;
};

/** 練習している人の一覧(指導する人向け)。記録が 1 つもない人は出さない。 */
export async function listLearners(exam: KenteiExamRow): Promise<LearnerRow[]> {
  const questionIds = exam.content.questions.map((q) => q.id);
  const [answers, tests, people] = await Promise.all([
    db
      .select({
        userId: kenteiAnswers.userId,
        questionId: kenteiAnswers.questionId,
        correct: kenteiAnswers.correct,
        answeredAt: kenteiAnswers.answeredAt,
      })
      .from(kenteiAnswers)
      .where(eq(kenteiAnswers.examId, exam.id))
      .orderBy(asc(kenteiAnswers.answeredAt), asc(kenteiAnswers.id)),
    db
      .select({
        userId: kenteiTestResults.userId,
        score: kenteiTestResults.score,
        passed: kenteiTestResults.passed,
        takenAt: kenteiTestResults.takenAt,
      })
      .from(kenteiTestResults)
      .where(eq(kenteiTestResults.examId, exam.id))
      .orderBy(asc(kenteiTestResults.takenAt)),
    db
      .select({
        userId: users.id,
        loginId: users.loginId,
        name: employees.name,
        nameKana: employees.nameKana,
        employeeNumber: employees.employeeNumber,
      })
      .from(users)
      .leftJoin(employees, eq(employees.id, users.employeeId)),
  ]);

  const byUser = new Map<string, { answers: { questionId: string; correct: boolean }[]; last: Date | null }>();
  const entry = (userId: string) => {
    let e = byUser.get(userId);
    if (!e) byUser.set(userId, (e = { answers: [], last: null }));
    return e;
  };
  for (const a of answers) {
    const e = entry(a.userId);
    e.answers.push(a);
    e.last = a.answeredAt;
  }
  const testsByUser = new Map<string, typeof tests>();
  for (const t of tests) {
    testsByUser.set(t.userId, [...(testsByUser.get(t.userId) ?? []), t]);
    const e = entry(t.userId);
    if (!e.last || t.takenAt > e.last) e.last = t.takenAt;
  }

  const person = new Map(people.map((p) => [p.userId, p]));
  const rows: { row: LearnerRow; kana: string }[] = [];
  for (const [userId, e] of byUser) {
    const p = person.get(userId);
    const ts = testsByUser.get(userId) ?? [];
    rows.push({
      kana: p?.nameKana ?? "",
      row: {
        userId,
        name: p?.name ?? p?.loginId ?? "(不明)",
        employeeNumber: p?.employeeNumber ?? null,
        progress: progressOf(questionIds, summarizeAnswers(e.answers)),
        testCount: ts.length,
        passCount: ts.filter((t) => t.passed).length,
        bestScore: ts.length ? Math.max(...ts.map((t) => t.score)) : null,
        lastScore: ts.at(-1)?.score ?? null,
        lastActivity: e.last,
      },
    });
  }
  rows.sort((a, b) => a.kana.localeCompare(b.kana, "ja") || a.row.name.localeCompare(b.row.name, "ja"));
  return rows.map((r) => r.row);
}

/** 1 人の名前(指導する人の画面の見出し用)。 */
export async function findLearnerName(userId: string): Promise<{ name: string; employeeNumber: string | null } | null> {
  const [row] = await db
    .select({
      loginId: users.loginId,
      name: employees.name,
      employeeNumber: employees.employeeNumber,
    })
    .from(users)
    .leftJoin(employees, eq(employees.id, users.employeeId))
    .where(eq(users.id, userId))
    .limit(1);
  return row
    ? {
        name: row.name ?? row.loginId,
        employeeNumber: row.employeeNumber ?? null,
      }
    : null;
}

/** 画像の保存場所。その試験を練習できる人だけに返す。 */
export async function findImageForActor(
  actor: Actor,
  id: string,
): Promise<{ storageKey: string; contentType: string } | null> {
  const [row] = await db
    .select({
      storageKey: kenteiImages.storageKey,
      contentType: kenteiImages.contentType,
      isPublished: kenteiExams.isPublished,
    })
    .from(kenteiImages)
    .innerJoin(kenteiExams, eq(kenteiExams.id, kenteiImages.examId))
    .where(eq(kenteiImages.id, id))
    .limit(1);
  if (!row || (!row.isPublished && !canManageExams(actor))) return null;
  return { storageKey: row.storageKey, contentType: row.contentType };
}
