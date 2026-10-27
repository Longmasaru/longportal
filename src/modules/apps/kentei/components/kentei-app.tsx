"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { LINK_CLASS } from "@/modules/core/shared/ui/form";
import { submitTestAction, recordStudyAnswerAction } from "../actions";
import { pastSets, type Bilingual, type ExamContent } from "../content";
import { accuracy, addAnswer, formatSeconds, progressOf, shuffle, weakIds, type QuestionStat } from "../logic";
import { Glossary } from "./glossary";
import { Practical } from "./practical";
import { Study, WEAK_TITLE, newSession, type StudySession } from "./study";
import { Test, finishLocally, type TestState } from "./test";
import { DEFAULT_PREFS, PrefsProvider, T, VI_FONT, type Lang, type Prefs } from "./text";
import { Meter, Pill, SECTION_TITLE } from "./ui";

// 練習の画面(ホーム・学習・用語集・模擬テスト・実技・記録)。docs/DESIGN.md 43 章。
// 答えの記録はサーバーに残す(本人と、指導する人が見る)。表示の言語などの設定は、この端末のブラウザにだけ保存する。

export type ClientTest = {
  id: string;
  kind: "random" | "past";
  round: number | null;
  correct: number;
  total: number;
  score: number;
  passed: boolean;
  seconds: number;
  takenAt: string;
};

type Tab = "home" | "study" | "glossary" | "test" | "practical" | "record";

const TABS: { key: Tab; ja: string; vi: string }[] = [
  { key: "home", ja: "ホーム", vi: "Trang chủ" },
  { key: "study", ja: "学習", vi: "Học" },
  { key: "glossary", ja: "用語集", vi: "Từ vựng" },
  { key: "test", ja: "模擬テスト", vi: "Thi thử" },
  { key: "practical", ja: "実技", vi: "Thực hành" },
  { key: "record", ja: "記録", vi: "Kết quả" },
];

function loadPrefs(key: string): Prefs {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const v = JSON.parse(raw) as Partial<Prefs>;
      return {
        lang: v.lang === "ja" || v.lang === "vi" ? v.lang : "both",
        kanji: v.kanji === true,
        romaji: v.romaji === true,
      };
    }
  } catch {
    // 保存できない環境(プライベートモードなど)では、既定の表示で使う。
  }
  return DEFAULT_PREFS;
}

export function KenteiApp({
  exam,
  content,
  initialStats,
  initialTests,
  userId,
  resultsHref,
}: {
  exam: { id: string; title: string; grade: string; titleVi: string };
  content: ExamContent;
  initialStats: Record<string, QuestionStat>;
  initialTests: ClientTest[];
  userId: string;
  /** 指導する人の画面(権限がある人だけ)。 */
  resultsHref?: string;
}) {
  const prefsKey = `kentei:prefs:${userId}`;
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [tab, setTab] = useState<Tab>("home");
  const [stats, setStats] = useState(initialStats);
  const [tests, setTests] = useState(initialTests);
  const [session, setSession] = useState<StudySession | null>(null);
  const [test, setTest] = useState<TestState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const finished = useRef(new Set<number>());
  const sets = useMemo(() => pastSets(content.questions), [content.questions]);
  const ids = useMemo(() => content.questions.map((q) => q.id), [content.questions]);

  useEffect(() => {
    // 設定は、ブラウザでの表示後に読み込む(サーバーの描画と食い違わないように)。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrefs(loadPrefs(prefsKey));
  }, [prefsKey]);

  const updatePrefs = (next: Prefs) => {
    setPrefs(next);
    try {
      localStorage.setItem(prefsKey, JSON.stringify(next));
    } catch {
      // 保存できなくても、表示は切り替わる。
    }
  };

  const go = (next: Tab) => {
    setTab(next);
    window.scrollTo({ top: 0 });
  };

  const onAnswer = (questionId: string, answer: boolean) => {
    const q = content.questions.find((x) => x.id === questionId);
    if (!q) return;
    setStats((s) => ({
      ...s,
      [questionId]: addAnswer(s[questionId], answer === q.answer),
    }));
    startTransition(async () => {
      const r = await recordStudyAnswerAction({
        examId: exam.id,
        questionId,
        answer,
      }).catch(() => ({ error: "x" }));
      setNotice(
        "error" in r
          ? "記録できなかった答えがあります。通信を確かめてください。 / Có câu trả lời chưa được lưu."
          : null,
      );
    });
  };

  const onFinish = useCallback(
    (t: TestState) => {
      if (t.done || finished.current.has(t.startedAt)) return;
      finished.current.add(t.startedAt);
      const local = finishLocally(content, t);
      setTest(local);
      window.scrollTo({ top: 0 });
      const answers = t.ids.map((q, k) => ({ q, a: t.answers[k] }));
      const seconds = Math.round((Math.min(Date.now(), t.endAt) - t.startedAt) / 1000);
      const mark = (saved: "saved" | "error") =>
        setTest((cur) =>
          cur && cur.startedAt === t.startedAt && cur.done ? { ...cur, done: { ...cur.done, saved } } : cur,
        );
      startTransition(async () => {
        const r = await submitTestAction({
          examId: exam.id,
          kind: t.kind,
          round: t.round,
          answers,
          seconds,
        }).catch(() => ({
          error: "x",
        }));
        if ("error" in r) return mark("error");
        setTests((list) => [{ ...r.result, takenAt: new Date(r.result.takenAt).toISOString() }, ...list]);
        const answerOf = new Map(content.questions.map((q) => [q.id, q.answer]));
        setStats((s) => {
          const next = { ...s };
          for (const x of answers) if (x.a !== null) next[x.q] = addAnswer(next[x.q], answerOf.get(x.q) === x.a);
          return next;
        });
        mark("saved");
      });
    },
    [content, exam.id],
  );

  const studyWeak = () => {
    setTest(null);
    const weak = weakIds(ids, stats);
    setSession(weak.length ? newSession(shuffle(weak), WEAK_TITLE) : null);
    go("study");
  };
  const studyIds = (picked: string[], title: Bilingual) => {
    setSession(newSession(picked, title));
    go("study");
  };

  const tabs = TABS.filter((t) => t.key !== "practical" || content.practical);

  return (
    <PrefsProvider prefs={prefs}>
      <div className="flex flex-col gap-6" lang={prefs.lang === "vi" ? "vi" : "ja"}>
        <header className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-heading text-brand03 text-xs font-bold tracking-[0.2em]">
                SKILL TEST
                <span className="text-brand04 ml-3 font-medium tracking-[0.1em]">技能検定 {exam.grade}</span>
              </p>
              <h1 className="text-brand01 text-xl font-bold md:text-2xl">
                {prefs.lang === "vi" && exam.titleVi ? (
                  <span lang="vi" className={VI_FONT}>
                    {exam.titleVi}
                  </span>
                ) : (
                  exam.title
                )}
              </h1>
              {prefs.lang === "both" && exam.titleVi ? (
                <p lang="vi" className={`${VI_FONT} text-brand04 text-sm`}>
                  {exam.titleVi}
                </p>
              ) : null}
            </div>
            {resultsHref ? (
              <Link href={resultsHref} className={`${LINK_CLASS} text-sm`}>
                練習している人の記録 →
              </Link>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <div role="group" aria-label="表示する言語 / Ngôn ngữ" className="border-brand01 flex border">
              {(
                [
                  ["both", "日本語 + Tiếng Việt"],
                  ["ja", "日本語"],
                  ["vi", "Tiếng Việt"],
                ] as [Lang, string][]
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={prefs.lang === v}
                  onClick={() => updatePrefs({ ...prefs, lang: v })}
                  className={`${VI_FONT} aria-pressed:bg-brand01 text-brand01 px-3 py-1.5 text-xs font-bold aria-pressed:text-white`}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="text-brand01 flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={prefs.romaji}
                onChange={(e) => updatePrefs({ ...prefs, romaji: e.target.checked })}
              />
              <span className={VI_FONT}>ローマ字 / Romaji</span>
            </label>
            <label className="text-brand01 flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={prefs.kanji}
                onChange={(e) => updatePrefs({ ...prefs, kanji: e.target.checked })}
              />
              <span className={VI_FONT}>漢字 / Kanji</span>
            </label>
          </div>
          <nav aria-label="メニュー / Menu" className="border-brand01/20 flex overflow-x-auto border-b">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                aria-current={tab === t.key ? "page" : undefined}
                onClick={() => go(t.key)}
                className="text-brand04 hover:text-brand03 aria-[current=page]:border-brand03 aria-[current=page]:text-brand01 -mb-px shrink-0 border-b-2 border-transparent px-3 py-2 text-sm font-bold"
              >
                <T ja={t.ja} vi={t.vi} />
              </button>
            ))}
          </nav>
        </header>

        {notice ? (
          <p role="alert" className="bg-brand03 px-3 py-2 text-sm font-bold text-white">
            {notice}
          </p>
        ) : null}

        <div>
          {tab === "home" ? (
            <Home content={content} ids={ids} sets={sets} stats={stats} tests={tests} go={go} onWeak={studyWeak} />
          ) : tab === "study" ? (
            <Study
              content={content}
              sets={sets}
              stats={stats}
              session={session}
              setSession={setSession}
              onAnswer={onAnswer}
            />
          ) : tab === "glossary" ? (
            <Glossary content={content} onStudy={studyIds} />
          ) : tab === "test" ? (
            <Test
              content={content}
              sets={sets}
              test={test}
              setTest={setTest}
              onFinish={onFinish}
              onStudyWeak={studyWeak}
            />
          ) : tab === "practical" && content.practical ? (
            <Practical
              practical={content.practical}
              passScore={content.practicalPassScore}
              storageKey={`kentei:bring:${userId}:${exam.id}`}
            />
          ) : (
            <Record content={content} stats={stats} tests={tests} />
          )}
        </div>
      </div>
    </PrefsProvider>
  );
}

function Home({
  content,
  ids,
  sets,
  stats,
  tests,
  go,
  onWeak,
}: {
  content: ExamContent;
  ids: string[];
  sets: Map<number, string[]>;
  stats: Record<string, QuestionStat>;
  tests: ClientTest[];
  go: (t: Tab) => void;
  onWeak: () => void;
}) {
  const p = progressOf(ids, stats);
  const last = tests[0];
  const w = content.written;
  const steps: {
    tab: Tab | "weak";
    ja: string;
    vi: string;
    dJa: string;
    dVi: string;
  }[] = [
    {
      tab: "glossary",
      ja: "用語集",
      vi: "Từ vựng",
      dJa: "道具・機械の名前と意味をおぼえる",
      dVi: "Nhớ tên và ý nghĩa dụng cụ, máy",
    },
    {
      tab: "study",
      ja: "学習",
      vi: "Học",
      dJa: "分野ごとに 1 問ずつ。すぐに答えと解説",
      dVi: "Từng câu theo chủ đề, có đáp án và giải thích ngay",
    },
    {
      tab: "weak",
      ja: "間違えた問題",
      vi: "Câu đã sai",
      dJa: "間違えた問題だけ、もう一度",
      dVi: "Làm lại những câu đã sai",
    },
    {
      tab: "test",
      ja: "模擬テスト",
      vi: "Thi thử",
      dJa: `本番と同じ ${w.count} 問・${w.minutes} 分`,
      dVi: `${w.count} câu, ${w.minutes} phút như thi thật`,
    },
    ...(content.practical
      ? [
          {
            tab: "practical" as const,
            ja: "実技",
            vi: "Thực hành",
            dJa: "作業の流れ・注意・持ち物を確かめる",
            dVi: "Kiểm tra quy trình, lưu ý, đồ mang theo",
          },
        ]
      : []),
  ];
  return (
    <div className="flex flex-col gap-8">
      <section className="bg-bg01 flex flex-col gap-2 p-5 md:p-8">
        <h2 className="text-brand01 text-xl font-bold md:text-2xl">
          <T ja="学科と実技を、ここで練習" vi="Luyện lý thuyết và thực hành tại đây" />
        </h2>
        <p className="text-ink text-sm leading-relaxed">
          <T
            ja={`学科は、正しい(○)か誤り(×)かを選ぶ ${w.count} 問・${w.minutes} 分。過去問 ${sets.size} 回分(${ids.length} 問)から練習できます。`}
            vi={`Lý thuyết: ${w.count} câu chọn Đúng (○) / Sai (×), ${w.minutes} phút. Luyện từ ${sets.size} đề cũ (${ids.length} câu).`}
          />
        </p>
      </section>
      <section className="grid grid-cols-3 gap-2">
        {[
          {
            v: `${p.mastered}`,
            sub: `/${p.total}`,
            ja: "おぼえた問題",
            vi: "Câu đã thuộc",
          },
          {
            v: `${p.answered}`,
            sub: `/${p.total}`,
            ja: "といた問題",
            vi: "Câu đã làm",
          },
          {
            v: last ? `${last.score}` : "—",
            sub: last ? "点" : "",
            ja: "前回の模擬テスト",
            vi: "Lần thi thử trước",
          },
        ].map((s) => (
          <div
            key={s.ja}
            className="border-brand01/15 flex flex-col items-center gap-1 border bg-white px-2 py-4 text-center"
          >
            <span className="font-heading text-brand01 text-3xl font-bold">
              {s.v}
              <small className="text-brand04 text-sm">{s.sub}</small>
            </span>
            <span className="text-brand04 text-xs">
              <T ja={s.ja} vi={s.vi} />
            </span>
          </div>
        ))}
      </section>
      <section className="flex flex-col gap-3">
        <h2 className={SECTION_TITLE}>
          <T ja="おすすめの進め方" vi="Cách học đề xuất" />
        </h2>
        <ol className="flex flex-col gap-2">
          {steps.map((s, k) => (
            <li key={s.tab}>
              <button
                type="button"
                onClick={() => (s.tab === "weak" ? onWeak() : go(s.tab))}
                className="border-brand01/15 hover:border-brand03 flex w-full items-center gap-4 border bg-white p-3 text-left transition-colors"
              >
                <span className="font-heading bg-brand01 flex size-9 shrink-0 items-center justify-center text-lg font-bold text-white">
                  {k + 1}
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-brand01 font-bold">
                    <T ja={s.ja} vi={s.vi} inline />
                    {s.tab === "weak" ? (
                      <span className="ml-2">
                        <Pill tone={p.weak ? "ng" : "neutral"}>{p.weak}</Pill>
                      </span>
                    ) : null}
                  </span>
                  <span className="text-brand04 text-xs">
                    <T ja={s.dJa} vi={s.dVi} />
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Record({
  content,
  stats,
  tests,
}: {
  content: ExamContent;
  stats: Record<string, QuestionStat>;
  tests: ClientTest[];
}) {
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className={SECTION_TITLE}>
          <T ja="分野ごとの正答率" vi="Tỉ lệ đúng theo chủ đề" />
        </h2>
        <div className="flex flex-col gap-2 bg-white p-4">
          {content.categories.map((c) => {
            const acc = accuracy(
              content.questions.filter((q) => q.category === c.key).map((q) => q.id),
              stats,
            );
            return (
              <div
                key={c.key}
                className="grid grid-cols-[1fr_6rem_3rem] items-center gap-3 text-sm md:grid-cols-[14rem_1fr_3rem]"
              >
                <span className="text-brand01 font-bold">
                  <T ja={c.ja} vi={c.vi} />
                </span>
                <Meter
                  ratio={acc ?? 0}
                  tone={acc === null ? "brand04" : acc >= content.written.passRatio ? "brand01" : "brand03"}
                />
                <span className="font-heading text-brand04 text-right">
                  {acc === null ? "—" : `${Math.round(acc * 100)}%`}
                </span>
              </div>
            );
          })}
        </div>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className={SECTION_TITLE}>
          <T ja="模擬テストの記録" vi="Lịch sử thi thử" />
        </h2>
        {tests.length ? (
          <TestTable tests={tests} />
        ) : (
          <p className="text-brand04 text-sm">
            <T
              ja="まだ記録がありません。模擬テストを受けると、ここに出ます。"
              vi="Chưa có kết quả. Làm bài thi thử sẽ hiện ở đây."
            />
          </p>
        )}
        <p className="text-brand04 text-xs">
          <T
            ja="記録はポータルに保存され、指導する人も見ることができます。"
            vi="Kết quả được lưu trên cổng thông tin và người hướng dẫn cũng có thể xem."
          />
        </p>
      </section>
    </div>
  );
}

export function TestTable({ tests }: { tests: ClientTest[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full bg-white text-sm">
        <thead className="text-brand04 text-xs">
          <tr className="border-field border-b">
            <th className="px-3 py-2 text-left font-bold">
              <T ja="日時" vi="Ngày giờ" inline />
            </th>
            <th className="px-3 py-2 text-left font-bold">
              <T ja="内容" vi="Đề" inline />
            </th>
            <th className="px-3 py-2 text-right font-bold">
              <T ja="点" vi="Điểm" inline />
            </th>
            <th className="px-3 py-2 text-right font-bold">
              <T ja="時間" vi="Thời gian" inline />
            </th>
          </tr>
        </thead>
        <tbody>
          {tests.map((t) => (
            <tr key={t.id} className="border-field border-b last:border-0">
              <td className="font-heading text-brand04 px-3 py-2 whitespace-nowrap">
                {new Date(t.takenAt).toLocaleString("ja-JP", {
                  timeZone: "Asia/Tokyo",
                  month: "numeric",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </td>
              <td className="text-brand01 px-3 py-2">
                {t.kind === "past" ? (
                  <T ja={`過去問 第${t.round}回`} vi={`Đề cũ số ${t.round}`} inline />
                ) : (
                  <T ja="ランダム" vi="Ngẫu nhiên" inline />
                )}
              </td>
              <td
                className={`font-heading px-3 py-2 text-right font-bold ${t.passed ? "text-brand01" : "text-brand03"}`}
              >
                {t.score}
              </td>
              <td className="font-heading text-brand04 px-3 py-2 text-right">{formatSeconds(t.seconds)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
