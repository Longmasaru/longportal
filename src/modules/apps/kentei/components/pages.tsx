import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { z } from "zod";
import { requireAppAccess } from "@/modules/core/apps";
import { BUTTON_SECONDARY, LINK_CLASS, StatusTag } from "@/modules/core/shared/ui/form";
import { setExamPublishedAction } from "../actions";
import { accuracy, formatSeconds, weakIds } from "../logic";
import { manifest } from "../manifest";
import {
  canManageExams,
  canViewResults,
  findLearnerName,
  listExamsForActor,
  listLearners,
  loadRecords,
  requireExamForActor,
  type TestRecord,
} from "../queries";
import { KenteiApp, TestTable, type ClientTest } from "./kentei-app";
import { PrefsProvider } from "./text";

// 技能検定の練習の画面(一覧 → 試験ごとの練習、指導する人の記録の画面)。入口は requireAppAccess("kentei")。

const BASE = manifest.route;

function Shell({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8 md:px-8 md:py-10">{children}</div>;
}

function Breadcrumb({ items }: { items: { href?: string; label: string }[] }) {
  return (
    <nav aria-label="現在地" className="text-brand04 flex flex-wrap items-center gap-1.5 text-xs">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 ? <span aria-hidden>›</span> : null}
          {item.href ? (
            <Link href={item.href} className="hover:text-brand03 underline-offset-2 hover:underline">
              {item.label}
            </Link>
          ) : (
            <span className="text-brand01 font-bold">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

const toClient = (t: TestRecord): ClientTest => ({
  ...t,
  takenAt: t.takenAt.toISOString(),
});

export async function ExamsPage() {
  const actor = await requireAppAccess(manifest.appKey);
  const exams = await listExamsForActor(actor);
  const manage = canManageExams(actor);
  return (
    <Shell>
      <div className="flex flex-col gap-2">
        <p className="font-heading text-brand03 text-xs font-bold tracking-[0.2em]">
          SKILL TEST
          <span className="text-brand04 ml-3 font-medium tracking-[0.1em]">技能検定の練習</span>
        </p>
        <h1 className="text-brand01 text-2xl font-bold">技能検定の練習</h1>
        <p className="text-brand04 text-sm">
          学科の過去問・用語集・模擬テストと、実技の流れを、日本語とベトナム語で練習できます。
          <span lang="vi" className="block [font-family:system-ui,-apple-system,Segoe_UI,Roboto,sans-serif]">
            Luyện thi kỹ năng nghề bằng tiếng Nhật và tiếng Việt.
          </span>
        </p>
      </div>
      {exams.length ? (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {exams.map((e) => (
            <li key={e.id} className="border-brand01/15 flex flex-col gap-3 border bg-white p-5">
              <Link href={`${BASE}/${e.slug}`} className="group flex flex-col gap-1">
                <span className="text-brand03 text-xs font-bold">{e.grade}</span>
                <span className="text-brand01 group-hover:text-brand03 text-lg font-bold transition-colors">
                  {e.title}
                </span>
                {e.titleVi ? (
                  <span
                    lang="vi"
                    className="text-brand04 text-sm [font-family:system-ui,-apple-system,Segoe_UI,Roboto,sans-serif]"
                  >
                    {e.titleVi}
                  </span>
                ) : null}
                <span className="text-brand04 mt-1 text-xs">
                  学科 {e.questionCount} 問{e.hasPractical ? "・実技" : ""}
                </span>
              </Link>
              {manage ? (
                <form action={setExamPublishedAction} className="flex items-center gap-3">
                  <StatusTag tone={e.isPublished ? "info" : "muted"}>{e.isPublished ? "公開中" : "非公開"}</StatusTag>
                  <input type="hidden" name="id" value={e.id} />
                  <input type="hidden" name="published" value={e.isPublished ? "false" : "true"} />
                  <button type="submit" className={`${BUTTON_SECONDARY} px-3 py-1 text-xs`}>
                    {e.isPublished ? "非公開にする" : "公開する"}
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-brand04 text-sm">まだ試験がありません。</p>
      )}
    </Shell>
  );
}

export async function ExamPage({ slug }: { slug: string }) {
  const actor = await requireAppAccess(manifest.appKey);
  const exam = await requireExamForActor(actor, slug);
  const { stats, tests } = await loadRecords(actor.userId, exam.id);
  return (
    <Shell>
      <Breadcrumb items={[{ href: BASE, label: "技能検定の練習" }, { label: `${exam.title} ${exam.grade}` }]} />
      {!exam.isPublished ? (
        <p className="bg-field text-brand04 px-3 py-2 text-sm">
          非公開の試験です(確かめる権限のある人だけに見えています)。
        </p>
      ) : null}
      <KenteiApp
        exam={{
          id: exam.id,
          title: exam.title,
          grade: exam.grade,
          titleVi: exam.titleVi,
        }}
        content={exam.content}
        initialStats={stats}
        initialTests={tests.map(toClient)}
        userId={actor.userId}
        resultsHref={canViewResults(actor) ? `${BASE}/${exam.slug}/results` : undefined}
      />
    </Shell>
  );
}

function pct(v: number | null): string {
  return v === null ? "—" : `${Math.round(v * 100)}%`;
}

function dateJst(d: Date | null): string {
  return d
    ? d.toLocaleString("ja-JP", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
}

export async function ResultsPage({ slug }: { slug: string }) {
  const actor = await requireAppAccess(manifest.appKey);
  if (!canViewResults(actor)) notFound();
  const exam = await requireExamForActor(actor, slug);
  const learners = await listLearners(exam);
  const pass = Math.round(exam.content.written.passRatio * 100);
  return (
    <Shell>
      <Breadcrumb
        items={[
          { href: BASE, label: "技能検定の練習" },
          {
            href: `${BASE}/${exam.slug}`,
            label: `${exam.title} ${exam.grade}`,
          },
          { label: "練習している人の記録" },
        ]}
      />
      <div className="flex flex-col gap-1">
        <h1 className="text-brand01 text-2xl font-bold">練習している人の記録</h1>
        <p className="text-brand04 text-sm">
          学科 {exam.content.questions.length} 問。「おぼえた」は続けて 2
          回正解した問題、「間違い」は最後に間違えた問題です。模擬テストの合格は正答率 {pass}% 以上。
        </p>
      </div>
      {learners.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] bg-white text-sm whitespace-nowrap">
            <thead className="text-brand04 text-xs">
              <tr className="border-field border-b">
                <th className="px-3 py-2 text-left font-bold">名前</th>
                <th className="px-3 py-2 text-right font-bold">おぼえた</th>
                <th className="px-3 py-2 text-right font-bold">間違い</th>
                <th className="px-3 py-2 text-right font-bold">正答率</th>
                <th className="px-3 py-2 text-right font-bold">模擬テスト</th>
                <th className="px-3 py-2 text-right font-bold">最高・前回</th>
                <th className="px-3 py-2 text-left font-bold">最後の練習</th>
              </tr>
            </thead>
            <tbody>
              {learners.map((l) => (
                <tr key={l.userId} className="border-field border-b last:border-0">
                  <td className="px-3 py-2">
                    <Link href={`${BASE}/${exam.slug}/results/${l.userId}`} className={LINK_CLASS}>
                      {l.name}
                    </Link>
                    {l.employeeNumber ? <span className="text-brand04 ml-2 text-xs">{l.employeeNumber}</span> : null}
                  </td>
                  <td className="font-heading px-3 py-2 text-right">
                    {l.progress.mastered}/{l.progress.total}
                  </td>
                  <td
                    className={`font-heading px-3 py-2 text-right ${l.progress.weak ? "text-brand03 font-bold" : ""}`}
                  >
                    {l.progress.weak}
                  </td>
                  <td className="font-heading px-3 py-2 text-right">{pct(l.progress.accuracy)}</td>
                  <td className="font-heading px-3 py-2 text-right">
                    {l.testCount ? `${l.passCount}/${l.testCount} 合格` : "—"}
                  </td>
                  <td className="font-heading px-3 py-2 text-right">
                    {l.bestScore ?? "—"}・{l.lastScore ?? "—"}
                  </td>
                  <td className="text-brand04 px-3 py-2 whitespace-nowrap">{dateJst(l.lastActivity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-brand04 text-sm">まだ記録がありません。</p>
      )}
    </Shell>
  );
}

export async function LearnerPage({ slug, userId }: { slug: string; userId: string }) {
  const actor = await requireAppAccess(manifest.appKey);
  if (!canViewResults(actor) || !z.uuid().safeParse(userId).success) notFound();
  const exam = await requireExamForActor(actor, slug);
  const person = await findLearnerName(userId);
  if (!person) notFound();
  const { stats, tests } = await loadRecords(userId, exam.id);
  const { content } = exam;
  const weak = weakIds(
    content.questions.map((q) => q.id),
    stats,
  );
  return (
    <Shell>
      <Breadcrumb
        items={[
          { href: BASE, label: "技能検定の練習" },
          {
            href: `${BASE}/${exam.slug}`,
            label: `${exam.title} ${exam.grade}`,
          },
          {
            href: `${BASE}/${exam.slug}/results`,
            label: "練習している人の記録",
          },
          { label: person.name },
        ]}
      />
      <h1 className="text-brand01 text-2xl font-bold">
        {person.name}
        {person.employeeNumber ? (
          <span className="text-brand04 ml-3 text-sm font-normal">{person.employeeNumber}</span>
        ) : null}
      </h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-brand01 text-lg font-bold">分野ごとの正答率</h2>
        <table className="w-full bg-white text-sm">
          <tbody>
            {content.categories.map((c) => {
              const ids = content.questions.filter((q) => q.category === c.key).map((q) => q.id);
              const acc = accuracy(ids, stats);
              return (
                <tr key={c.key} className="border-field border-b last:border-0">
                  <td className="text-brand01 px-3 py-2 font-bold">{c.ja}</td>
                  <td className="text-brand04 px-3 py-2 text-right text-xs">
                    {ids.filter((id) => stats[id]).length}/{ids.length} 問
                  </td>
                  <td
                    className={`font-heading px-3 py-2 text-right font-bold ${acc !== null && acc < content.written.passRatio ? "text-brand03" : "text-brand01"}`}
                  >
                    {pct(acc)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-brand01 text-lg font-bold">模擬テストの記録</h2>
        {tests.length ? (
          <PrefsProvider prefs={{ lang: "ja", kanji: false, romaji: false }}>
            <TestTable tests={tests.map(toClient)} />
          </PrefsProvider>
        ) : (
          <p className="text-brand04 text-sm">まだ受けていません。</p>
        )}
        {tests.length ? (
          <p className="text-brand04 text-xs">
            平均 {Math.round(tests.reduce((n, t) => n + t.score, 0) / tests.length)} 点・平均の時間{" "}
            {formatSeconds(tests.reduce((n, t) => n + t.seconds, 0) / tests.length)}
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-brand01 text-lg font-bold">
          最後に間違えた問題 <span className="text-brand04 font-heading text-sm">{weak.length}</span>
        </h2>
        {weak.length ? (
          <ol className="flex flex-col gap-2">
            {weak.map((id) => {
              const q = content.questions.find((x) => x.id === id)!;
              const s = stats[id];
              return (
                <li key={id} className="flex flex-col gap-1 bg-white p-3 text-sm">
                  <p className="text-ink">{q.kanji || q.ja}</p>
                  <p className="text-brand04 text-xs">
                    答え {q.answer ? "○" : "×"}・{s.n} 回中 {s.ok} 回正解
                  </p>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="text-brand04 text-sm">ありません。</p>
        )}
      </section>
    </Shell>
  );
}
