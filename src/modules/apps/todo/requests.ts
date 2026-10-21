// TODO の依頼の決まり(docs/DESIGN.md 41 章)。DB にも画面にも依存しない純粋関数。
// 依頼は「頼まれた人(user_id)の TODO の 1 行」で、requested_at が空でない行。

export const REQUEST_STATES = ["open", "done", "returned"] as const;
export type RequestState = (typeof REQUEST_STATES)[number];

export const REQUEST_STATE_LABEL: Record<RequestState, string> = {
  open: "未完了",
  done: "完了",
  returned: "お返し",
};

export const RETURN_REASON_MAX = 200;

/** 判定に使う、TODO の 1 行の一部。 */
export type RequestFacts = {
  /** 持ち主(依頼なら頼まれた人) */
  userId: string;
  /** 頼んだ人(依頼でなければ null。依頼でも、アカウントが消えたら null) */
  requestedByUserId: string | null;
  /** 依頼か(requested_at が空でない) */
  isRequest: boolean;
  done: boolean;
  returned: boolean;
  acknowledged: boolean;
};

export function requestState(t: Pick<RequestFacts, "done" | "returned">): RequestState {
  if (t.returned) return "returned";
  return t.done ? "done" : "open";
}

export type TodoAbilities = {
  /** 見られるか(持ち主と、頼んだ人だけ。管理者にも特別扱いはない) */
  canSee: boolean;
  /** 相手・タスク名・メモ・期限を変える(頼んだ人が、完了するまで。お返しされたものは頼み直し) */
  canEditRequest: boolean;
  /** 取り下げる(頼んだ人が、完了するまで) */
  canWithdraw: boolean;
  /** 完了にする・未完了に戻す */
  canToggleDone: boolean;
  /** お返しする(頼まれた人が、未完了のとき) */
  canReturn: boolean;
  /** 確認しました(頼まれた人が、未完了で未確認のとき) */
  canAcknowledge: boolean;
  /** カテゴリ・優先度を変える(持ち主) */
  canOrganize: boolean;
  /** 本人の TODO として、タスク名・詳細・期限を変える(依頼でない行の持ち主) */
  canEditOwn: boolean;
  /** 削除する(依頼でない行の持ち主。依頼は削除せず、お返し・取り下げ) */
  canDelete: boolean;
  /** 添付ファイル(依頼でない行の持ち主だけ) */
  canAttach: boolean;
};

const NONE: TodoAbilities = {
  canSee: false,
  canEditRequest: false,
  canWithdraw: false,
  canToggleDone: false,
  canReturn: false,
  canAcknowledge: false,
  canOrganize: false,
  canEditOwn: false,
  canDelete: false,
  canAttach: false,
};

/** 見る人(viewerUserId)から見た、TODO の 1 行に対してできること。deny by default。 */
export function abilitiesFor(viewerUserId: string, t: RequestFacts): TodoAbilities {
  const isOwner = t.userId === viewerUserId;
  if (!t.isRequest) {
    if (!isOwner) return NONE;
    return {
      ...NONE,
      canSee: true,
      canToggleDone: true,
      canOrganize: true,
      canEditOwn: true,
      canDelete: true,
      canAttach: true,
    };
  }
  const state = requestState(t);
  const isRequester = t.requestedByUserId !== null && t.requestedByUserId === viewerUserId;
  if (isRequester) {
    return { ...NONE, canSee: true, canEditRequest: state !== "done", canWithdraw: state !== "done" };
  }
  if (isOwner) {
    return {
      ...NONE,
      canSee: true,
      canToggleDone: state !== "returned",
      canReturn: state === "open",
      canAcknowledge: state === "open" && !t.acknowledged,
      canOrganize: state !== "returned",
    };
  }
  return NONE;
}

/** 頼まれた人の「自分のタスク」に出すか(お返ししたものは出さない)。 */
export function showsInAssigneeList(t: Pick<RequestFacts, "isRequest" | "returned">): boolean {
  return !t.isRequest || !t.returned;
}

/** 頼まれた人のホームに「依頼が届きました」を出すか(確認・完了・お返しまで)。 */
export function needsHomeNotice(t: Pick<RequestFacts, "isRequest" | "done" | "returned" | "acknowledged">): boolean {
  return t.isRequest && requestState(t) === "open" && !t.acknowledged;
}

/**
 * 頼んだ人が内容・相手を変えたときに、あわせて変える列。
 * 中身が変わったら「確認しました」を消して、もう一度お知らせを出す。お返しされたものは、頼み直し(未完了に戻す)。
 */
export function resetOnRequestEdit(changed: boolean, wasReturned: boolean) {
  const reset: { acknowledgedAt?: null; returnedAt?: null; returnedReason?: null; done?: false } = {};
  if (changed || wasReturned) reset.acknowledgedAt = null;
  if (wasReturned) {
    reset.returnedAt = null;
    reset.returnedReason = null;
    reset.done = false;
  }
  return reset;
}

/** 「○○さんから」「○○さんへ」の名前(アカウントが消えた・社員でない場合)。 */
export function personLabel(name: string | null | undefined): string {
  return name && name.trim() ? `${name}さん` : "(不明な人)";
}
