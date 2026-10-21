import { and, asc, desc, eq, isNotNull, isNull, or } from "drizzle-orm";
import { db } from "@/db/client";
import { evaluateEmployeeAccess, type Actor } from "@/modules/core/access";
import { loadPopulation } from "@/modules/core/audience";
import { users } from "@/modules/core/auth/schema";
import { employees } from "@/modules/core/employees/schema";
import { requestState, type RequestFacts, type RequestState } from "./requests";
import { todoCategories, todos, type TodoPriority } from "./schema";

// TODO の読み取り。必ず user_id(本人)で絞り込む(docs/DESIGN.md 25 章)。
// 依頼(39 章)は、頼まれた人(user_id)と頼んだ人(requested_by_user_id)の 2 人だけが読める。

export type CategoryRow = { code: string; label: string; icon: string };

export type TodoRow = {
  id: string;
  text: string;
  done: boolean;
  description: string;
  priority: TodoPriority;
  /** カテゴリの code */
  category: string;
  /** `YYYY-MM-DD` または空文字 */
  dueDate: string;
  /** 依頼(ほかの人から頼まれたもの)なら、その情報。本人の TODO は null。 */
  request: ReceivedRequest | null;
};

export type ReceivedRequest = {
  /** 頼んだ人の氏名(わからなければ null) */
  fromName: string | null;
  acknowledged: boolean;
};

/** 頼んだ人から見た依頼(「頼んだこと」)。 */
export type SentRequestRow = {
  id: string;
  text: string;
  description: string;
  dueDate: string;
  assigneeUserId: string;
  assigneeName: string | null;
  state: RequestState;
  returnedReason: string;
  acknowledged: boolean;
};

/** ホームのお知らせ(届いた依頼で、まだ確認していないもの)。 */
export type RequestNotice = { id: string; text: string; dueDate: string; fromName: string | null };

/** 依頼の相手の候補(在籍中で、有効なアカウントのある社員)。id は user の id。 */
export type AssigneeOption = {
  id: string;
  employeeNumber: string;
  name: string;
  nameKana: string;
  affiliation: string;
};

export const FALLBACK_CATEGORY_CODE = "other";

export async function listCategories(): Promise<CategoryRow[]> {
  return db
    .select({ code: todoCategories.code, label: todoCategories.label, icon: todoCategories.icon })
    .from(todoCategories)
    .orderBy(asc(todoCategories.sortOrder));
}

const columns = {
  id: todos.id,
  text: todos.text,
  done: todos.done,
  description: todos.description,
  priority: todos.priority,
  category: todoCategories.code,
  dueDate: todos.dueDate,
  requestedAt: todos.requestedAt,
  acknowledgedAt: todos.acknowledgedAt,
  /** 頼んだ人の氏名(users → employees を、頼んだ人で結ぶ) */
  fromName: employees.name,
};

type RawRow = Omit<TodoRow, "dueDate" | "request"> & {
  dueDate: string | null;
  requestedAt: Date | null;
  acknowledgedAt: Date | null;
  fromName: string | null;
};

function toRow({ requestedAt, acknowledgedAt, fromName, ...r }: RawRow): TodoRow {
  return {
    ...r,
    dueDate: r.dueDate ?? "",
    request: requestedAt ? { fromName, acknowledged: acknowledgedAt !== null } : null,
  };
}

/** 持ち主として読む TODO(頼んだ人の氏名つき)。 */
function ownerQuery() {
  return db
    .select(columns)
    .from(todos)
    .innerJoin(todoCategories, eq(todoCategories.id, todos.categoryId))
    .leftJoin(users, eq(users.id, todos.requestedByUserId))
    .leftJoin(employees, eq(employees.id, users.employeeId));
}

/** 本人の TODO と、頼まれた依頼(追加順)。お返しした依頼は出さない。 */
export async function listTodos(userId: string): Promise<TodoRow[]> {
  const rows = await ownerQuery()
    .where(and(eq(todos.userId, userId), isNull(todos.returnedAt)))
    .orderBy(asc(todos.createdAt));
  return rows.map(toRow);
}

/** 本人(持ち主)の TODO を 1 件(本人のものでなければ null)。 */
export async function getTodo(userId: string, id: string): Promise<TodoRow | null> {
  const [row] = await ownerQuery().where(and(eq(todos.userId, userId), eq(todos.id, id)));
  return row ? toRow(row) : null;
}

/**
 * 操作の判定(requests.ts の abilitiesFor)に使う事実。持ち主か頼んだ人でなければ null(存在も知らせない)。
 */
export async function getTodoFacts(
  viewerUserId: string,
  id: string,
): Promise<(RequestFacts & { text: string; description: string; dueDate: string }) | null> {
  const [row] = await db
    .select({
      userId: todos.userId,
      requestedByUserId: todos.requestedByUserId,
      requestedAt: todos.requestedAt,
      done: todos.done,
      returnedAt: todos.returnedAt,
      acknowledgedAt: todos.acknowledgedAt,
      text: todos.text,
      description: todos.description,
      dueDate: todos.dueDate,
    })
    .from(todos)
    .where(and(eq(todos.id, id), or(eq(todos.userId, viewerUserId), eq(todos.requestedByUserId, viewerUserId))));
  if (!row) return null;
  return {
    userId: row.userId,
    requestedByUserId: row.requestedByUserId,
    isRequest: row.requestedAt !== null,
    done: row.done,
    returned: row.returnedAt !== null,
    acknowledged: row.acknowledgedAt !== null,
    text: row.text,
    description: row.description,
    dueDate: row.dueDate ?? "",
  };
}

const sentColumns = {
  id: todos.id,
  text: todos.text,
  description: todos.description,
  dueDate: todos.dueDate,
  assigneeUserId: todos.userId,
  assigneeName: employees.name,
  done: todos.done,
  returnedAt: todos.returnedAt,
  returnedReason: todos.returnedReason,
  acknowledgedAt: todos.acknowledgedAt,
};

function toSent(r: {
  id: string;
  text: string;
  description: string;
  dueDate: string | null;
  assigneeUserId: string;
  assigneeName: string | null;
  done: boolean;
  returnedAt: Date | null;
  returnedReason: string | null;
  acknowledgedAt: Date | null;
}): SentRequestRow {
  return {
    id: r.id,
    text: r.text,
    description: r.description,
    dueDate: r.dueDate ?? "",
    assigneeUserId: r.assigneeUserId,
    assigneeName: r.assigneeName,
    state: requestState({ done: r.done, returned: r.returnedAt !== null }),
    returnedReason: r.returnedReason ?? "",
    acknowledged: r.acknowledgedAt !== null,
  };
}

function sentQuery() {
  return db
    .select(sentColumns)
    .from(todos)
    .innerJoin(users, eq(users.id, todos.userId))
    .leftJoin(employees, eq(employees.id, users.employeeId));
}

/** 本人が頼んだ依頼(新しい順)。 */
export async function listSentRequests(userId: string): Promise<SentRequestRow[]> {
  const rows = await sentQuery()
    .where(and(eq(todos.requestedByUserId, userId), isNotNull(todos.requestedAt)))
    .orderBy(desc(todos.requestedAt));
  return rows.map(toSent);
}

/** 本人が頼んだ依頼を 1 件。 */
export async function getSentRequest(userId: string, id: string): Promise<SentRequestRow | null> {
  const [row] = await sentQuery().where(
    and(eq(todos.id, id), eq(todos.requestedByUserId, userId), isNotNull(todos.requestedAt)),
  );
  return row ? toSent(row) : null;
}

/** ホームのお知らせ: 頼まれた依頼で、未完了・未確認のもの(requests.ts の needsHomeNotice と同じ条件)。 */
export async function listRequestNotices(userId: string): Promise<RequestNotice[]> {
  const rows = await db
    .select({ id: todos.id, text: todos.text, dueDate: todos.dueDate, fromName: employees.name })
    .from(todos)
    .leftJoin(users, eq(users.id, todos.requestedByUserId))
    .leftJoin(employees, eq(employees.id, users.employeeId))
    .where(
      and(
        eq(todos.userId, userId),
        isNotNull(todos.requestedAt),
        eq(todos.done, false),
        isNull(todos.returnedAt),
        isNull(todos.acknowledgedAt),
      ),
    )
    .orderBy(asc(todos.requestedAt));
  return rows.map((r) => ({ ...r, dueDate: r.dueDate ?? "" }));
}

/** 会社カレンダーに出す、本人の未完了で期限のある TODO(頼まれた依頼を含む。お返ししたものは除く)。 */
export async function listDueSources(userId: string) {
  const rows = await db
    .select({
      id: todos.id,
      text: todos.text,
      dueDate: todos.dueDate,
      done: todos.done,
      requestedAt: todos.requestedAt,
      returnedAt: todos.returnedAt,
      requesterName: employees.name,
    })
    .from(todos)
    .leftJoin(users, eq(users.id, todos.requestedByUserId))
    .leftJoin(employees, eq(employees.id, users.employeeId))
    .where(and(eq(todos.userId, userId), eq(todos.done, false), isNull(todos.returnedAt), isNotNull(todos.dueDate)));
  return rows.map((r) => ({
    id: r.id,
    text: r.text,
    dueDate: r.dueDate,
    done: r.done,
    isRequest: r.requestedAt !== null,
    returned: r.returnedAt !== null,
    requesterName: r.requesterName,
  }));
}

/** 依頼の相手の候補: 在籍中で、有効なアカウントのある社員(自分を除く。社員番号の順)。カレンダーの呼びかけ(38.2)と同じ選び方。 */
export async function listAssigneeOptions(actor: Actor): Promise<AssigneeOption[]> {
  const [population, accounts] = await Promise.all([
    loadPopulation(actor.today),
    db
      .select({ userId: users.id, employeeId: users.employeeId })
      .from(users)
      .where(and(eq(users.status, "active"), isNotNull(users.employeeId))),
  ]);
  const userByEmployee = new Map(accounts.map((a) => [a.employeeId!, a.userId]));
  return population.contexts
    .filter((c) => {
      const userId = userByEmployee.get(c.employeeId);
      return userId !== undefined && userId !== actor.userId && evaluateEmployeeAccess(c, actor.today) === null;
    })
    .map((c) => {
      const info = population.info.get(c.employeeId)!;
      return {
        id: userByEmployee.get(c.employeeId)!,
        employeeNumber: info.employeeNumber,
        name: info.name,
        nameKana: population.kana.get(c.employeeId) ?? "",
        affiliation: info.affiliation,
      };
    });
}

/** カテゴリの code → id(無い code は「その他」)。 */
export async function categoryIdOf(code: string): Promise<string> {
  const rows = await db.select({ id: todoCategories.id, code: todoCategories.code }).from(todoCategories);
  const found = rows.find((r) => r.code === code) ?? rows.find((r) => r.code === FALLBACK_CATEGORY_CODE);
  if (!found) throw new Error("TODO のカテゴリが登録されていません(migration を確認してください)。");
  return found.id;
}
