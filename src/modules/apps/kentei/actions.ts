"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { requireGlobalPermission } from "@/modules/core/access";
import { requireAppAccess } from "@/modules/core/apps";
import { writeAuditLog } from "@/modules/core/audit";
import { pastSets } from "./content";
import { scoreTest } from "./logic";
import { MANAGE_PERMISSION, manifest } from "./manifest";
import { findExamForActor, type TestRecord } from "./queries";
import { kenteiAnswers, kenteiExams, kenteiTestResults } from "./schema";

// 練習の記録(本人のもの)と、試験の公開の切り替え。docs/DESIGN.md 44 章。
// 正誤は、画面から送られた値を使わず、サーバーが試験の中身の正解と照らして決める。

const idSchema = z.string().regex(/^[a-z0-9_]{1,60}$/);

const studySchema = z.object({
  examId: z.uuid(),
  questionId: idSchema,
  answer: z.boolean(),
});

/** 学習モードで 1 問答えた記録を残す。 */
export async function recordStudyAnswerAction(input: {
  examId: string;
  questionId: string;
  answer: boolean;
}): Promise<{ correct: boolean } | { error: string }> {
  const actor = await requireAppAccess(manifest.appKey);
  const parsed = studySchema.safeParse(input);
  if (!parsed.success) return { error: "不正なリクエストです。" };
  const exam = await findExamForActor(actor, parsed.data.examId);
  const question = exam?.content.questions.find((q) => q.id === parsed.data.questionId);
  if (!exam || !question) return { error: "問題が見つかりません。" };
  const correct = question.answer === parsed.data.answer;
  await db.insert(kenteiAnswers).values({
    userId: actor.userId,
    examId: exam.id,
    questionId: question.id,
    mode: "study",
    correct,
  });
  return { correct };
}

const testSchema = z
  .object({
    examId: z.uuid(),
    kind: z.enum(["random", "past"]),
    round: z.number().int().min(1).max(999).nullable(),
    answers: z
      .array(z.object({ q: idSchema, a: z.boolean().nullable() }))
      .min(1)
      .max(100),
    seconds: z
      .number()
      .int()
      .min(0)
      .max(24 * 3600),
  })
  .refine((v) => (v.kind === "past") === (v.round !== null));

/** 模擬テストを採点して記録する(答えた問題は、学習の記録にも足す)。 */
export async function submitTestAction(input: {
  examId: string;
  kind: "random" | "past";
  round: number | null;
  answers: { q: string; a: boolean | null }[];
  seconds: number;
}): Promise<{ result: TestRecord } | { error: string }> {
  const actor = await requireAppAccess(manifest.appKey);
  const parsed = testSchema.safeParse(input);
  if (!parsed.success) return { error: "不正なリクエストです。" };
  const v = parsed.data;
  const exam = await findExamForActor(actor, v.examId);
  if (!exam) return { error: "試験が見つかりません。" };
  const { content } = exam;
  const answerOf = new Map(content.questions.map((q) => [q.id, q.answer]));
  const ids = v.answers.map((x) => x.q);

  // 出題の形が本番どおりか(過去問は、その回の問題を番号順に。ランダムは、重ならない決まった数)。
  if (v.kind === "past") {
    const set = pastSets(content.questions).get(v.round!);
    if (!set || set.join(",") !== ids.join(",")) return { error: "問題の並びが試験と合いません。" };
  } else {
    const count = Math.min(content.written.count, content.questions.length);
    if (ids.length !== count || new Set(ids).size !== ids.length || ids.some((id) => !answerOf.has(id))) {
      return { error: "問題の並びが試験と合いません。" };
    }
  }

  const scored = scoreTest(v.answers, answerOf, content.written.passRatio);
  const seconds = Math.min(v.seconds, content.written.minutes * 60);
  const result = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(kenteiTestResults)
      .values({
        userId: actor.userId,
        examId: exam.id,
        kind: v.kind,
        round: v.round,
        ...scored,
        seconds,
        detail: v.answers,
      })
      .returning();
    const answered = v.answers.filter((x) => x.a !== null);
    if (answered.length) {
      await tx.insert(kenteiAnswers).values(
        answered.map((x) => ({
          userId: actor.userId,
          examId: exam.id,
          questionId: x.q,
          mode: "test",
          correct: answerOf.get(x.q) === x.a,
          answeredAt: row.takenAt,
        })),
      );
    }
    return row;
  });
  return {
    result: {
      id: result.id,
      kind: v.kind,
      round: result.round,
      correct: result.correct,
      total: result.total,
      score: result.score,
      passed: result.passed,
      seconds: result.seconds,
      takenAt: result.takenAt,
    },
  };
}

/** 試験の公開・非公開を切り替える(kentei.exams.manage)。 */
export async function setExamPublishedAction(formData: FormData): Promise<void> {
  const actor = await requireGlobalPermission(MANAGE_PERMISSION);
  const parsed = z.object({ id: z.uuid(), published: z.enum(["true", "false"]) }).safeParse({
    id: formData.get("id"),
    published: formData.get("published"),
  });
  if (!parsed.success) return;
  const isPublished = parsed.data.published === "true";
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select({ isPublished: kenteiExams.isPublished, slug: kenteiExams.slug })
      .from(kenteiExams)
      .where(eq(kenteiExams.id, parsed.data.id))
      .for("update");
    if (!before || before.isPublished === isPublished) return;
    await tx.update(kenteiExams).set({ isPublished }).where(eq(kenteiExams.id, parsed.data.id));
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      action: isPublished ? "kentei.exam.publish" : "kentei.exam.unpublish",
      targetType: "kentei_exam",
      targetId: parsed.data.id,
      before: { slug: before.slug, isPublished: before.isPublished },
      after: { slug: before.slug, isPublished },
    });
  });
  revalidatePath(manifest.route);
}
