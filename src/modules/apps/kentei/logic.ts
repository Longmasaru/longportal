// 技能検定の練習の判定・集計(DB や画面に依存しない純粋な関数。docs/DESIGN.md 44 章)。

/** 1 問ごとの記録のまとめ。 */
export type QuestionStat = {
  /** 答えた回数。 */
  n: number;
  /** 正解した回数。 */
  ok: number;
  /** 最後から続けて正解した回数。 */
  streak: number;
  /** 最後に答えたときに正解したか。 */
  last: boolean;
};

/** 続けて 2 回正解したら「おぼえた」。 */
export const MASTERED_STREAK = 2;

/** 答えの記録(古い順)を、問題ごとのまとめにする。 */
export function summarizeAnswers(
  rows: readonly { questionId: string; correct: boolean }[],
): Record<string, QuestionStat> {
  const stats: Record<string, QuestionStat> = {};
  for (const r of rows) stats[r.questionId] = addAnswer(stats[r.questionId], r.correct);
  return stats;
}

/** まとめに 1 回分の答えを足す(画面で、保存を待たずに表示を変えるのにも使う)。 */
export function addAnswer(stat: QuestionStat | undefined, correct: boolean): QuestionStat {
  const s = stat ?? { n: 0, ok: 0, streak: 0, last: false };
  return {
    n: s.n + 1,
    ok: s.ok + (correct ? 1 : 0),
    streak: correct ? s.streak + 1 : 0,
    last: correct,
  };
}

export function isMastered(stat: QuestionStat | undefined): boolean {
  return (stat?.streak ?? 0) >= MASTERED_STREAK;
}

/** 最後に間違えた問題(並びは問題の並びのまま)。 */
export function weakIds(questionIds: readonly string[], stats: Readonly<Record<string, QuestionStat>>): string[] {
  return questionIds.filter((id) => stats[id] && !stats[id].last);
}

/** 正答率(答えた回数がなければ null)。 */
export function accuracy(questionIds: readonly string[], stats: Readonly<Record<string, QuestionStat>>): number | null {
  let n = 0;
  let ok = 0;
  for (const id of questionIds) {
    const s = stats[id];
    if (s) {
      n += s.n;
      ok += s.ok;
    }
  }
  return n ? ok / n : null;
}

export type Progress = {
  total: number;
  answered: number;
  mastered: number;
  weak: number;
  accuracy: number | null;
};

export function progressOf(questionIds: readonly string[], stats: Readonly<Record<string, QuestionStat>>): Progress {
  return {
    total: questionIds.length,
    answered: questionIds.filter((id) => stats[id]).length,
    mastered: questionIds.filter((id) => isMastered(stats[id])).length,
    weak: weakIds(questionIds, stats).length,
    accuracy: accuracy(questionIds, stats),
  };
}

export type Scored = {
  correct: number;
  total: number;
  score: number;
  passed: boolean;
};

/**
 * 模擬テストの採点。答えは問題の正解と照らす(画面から送られた正誤は使わない)。
 * 点数は 100 点満点(正答数 × 100 ÷ 問題数、四捨五入)。合格は正答率が passRatio 以上(基礎級は 60%)。
 */
export function scoreTest(
  answers: readonly { q: string; a: boolean | null }[],
  answerOf: ReadonlyMap<string, boolean>,
  passRatio: number,
): Scored {
  const total = answers.length;
  const correct = answers.filter((x) => x.a !== null && answerOf.get(x.q) === x.a).length;
  // 浮動小数の誤差で 12/20 = 0.6 を落とさないよう、整数で比べる。
  const passed = total > 0 && correct * 1000 >= Math.round(passRatio * 1000) * total;
  return {
    correct,
    total,
    score: total ? Math.round((correct * 100) / total) : 0,
    passed,
  };
}

/** 合格に必要な正答数(20 問・60% なら 12)。 */
export function passCount(total: number, passRatio: number): number {
  return Math.ceil((Math.round(passRatio * 1000) * total) / 1000);
}

/** 並びをシャッフルした写しを返す。 */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 秒を「分:秒」にする。 */
export function formatSeconds(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
