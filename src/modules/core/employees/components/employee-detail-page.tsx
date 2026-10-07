import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "../../access";
import { formatDateDot } from "../../shared/format";
import { todayJst } from "../../shared/jst";
import { FormNotice, LINK_CLASS, PageHeading, StatusTag } from "../../shared/ui/form";
import { EMPLOYEE_STATUS_LABEL } from "../labels";
import { getEmployeeDetail, getFormOptions, type AssignmentRow } from "../queries";
import { AccountControls, IssueAccountForm } from "./account-forms";
import { EndAssignmentForm, TransferForm } from "./assignment-forms";
import { EmployeeForm } from "./employee-form";

function period(a: AssignmentRow): string {
  return `${formatDateDot(a.startDate)} 〜 ${a.endDate ? formatDateDot(a.endDate) : "現在"}`;
}

function assignmentState(a: AssignmentRow, today: string): "current" | "upcoming" | "ended" {
  if (a.endDate !== null && a.endDate < today) return "ended";
  if (a.startDate > today) return "upcoming";
  return "current";
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-brand01 border-brand01/20 border-b pb-2 text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

export async function EmployeeDetailPage({ id }: { id: string }) {
  const actor = await requireAdmin();
  if (!z.uuid().safeParse(id).success) notFound();
  const today = todayJst();
  const detail = await getEmployeeDetail(id, today);
  if (!detail) notFound();
  const { employee, assignments, user, warnings } = detail;
  const options = await getFormOptions({
    employmentTypeId: employee.employmentTypeId,
    positionId: employee.positionId,
  });
  const hasCurrent = assignments.some((a) => a.isPrimary && assignmentState(a, today) === "current");

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 md:px-8 md:py-10">
      <PageHeading
        title={employee.name}
        description={`社員番号 ${employee.employeeNumber}${employee.nameKana ? ` ・ ${employee.nameKana}` : ""} ・ ${detail.employmentTypeName} ・ ${detail.positionName ?? "役職なし"}`}
        aside={
          <span className="flex items-center gap-4">
            <StatusTag tone={employee.status === "retired" ? "muted" : "neutral"}>
              {EMPLOYEE_STATUS_LABEL[employee.status]}
            </StatusTag>
            <Link href="/admin/employees" className={LINK_CLASS}>
              社員一覧へ戻る
            </Link>
          </span>
        }
      />

      {warnings.length > 0 ? (
        <div className="flex flex-col gap-2">
          {warnings.map((w) => (
            <FormNotice key={w.code} tone="warning">
              {w.message}
            </FormNotice>
          ))}
        </div>
      ) : null}

      <Section title="基本情報">
        <EmployeeForm
          options={options}
          employee={{
            id: employee.id,
            employeeNumber: employee.employeeNumber,
            name: employee.name,
            nameKana: employee.nameKana,
            employmentTypeId: employee.employmentTypeId,
            positionId: employee.positionId,
            hiredOn: employee.hiredOn,
            leftOn: employee.leftOn,
            status: employee.status,
          }}
        />
      </Section>

      <Section title="所属(異動履歴)">
        <p className="text-brand04 text-sm">
          主所属は同時に 1 件です(期間の重複は登録できません)。異動日に、現在の主所属は前日で終了します。
        </p>
        {assignments.length === 0 ? (
          <p className="border-brand01/15 text-brand04 border-y py-6 text-center text-sm">
            所属がまだ登録されていません。
          </p>
        ) : (
          <ul>
            {assignments.map((a) => {
              const state = assignmentState(a, today);
              return (
                <li
                  key={a.id}
                  className="border-brand04/40 flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-1 py-3 first:border-t"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className={`font-bold ${state === "ended" ? "text-brand04" : "text-brand01"}`}>
                        {a.locationName} / {a.departmentName}
                      </span>
                      <StatusTag tone={a.isPrimary ? "info" : "neutral"}>
                        {a.isPrimary ? "主所属" : "副所属"}
                      </StatusTag>
                      {state === "current" ? <StatusTag tone="attention">現在</StatusTag> : null}
                      {state === "upcoming" ? <StatusTag tone="info">予定</StatusTag> : null}
                      {state === "ended" ? <StatusTag tone="muted">終了</StatusTag> : null}
                    </p>
                    <p className="text-brand04 font-heading text-xs tracking-wide">{period(a)}</p>
                  </div>
                  {state !== "ended" ? (
                    <EndAssignmentForm assignmentId={a.id} startDate={a.startDate} today={today} />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        <TransferForm employeeId={employee.id} options={options} today={today} hasCurrent={hasCurrent} />
      </Section>

      <Section title="ログインアカウント">
        {user ? (
          <>
            <dl className="grid max-w-xl grid-cols-[8rem_1fr] gap-y-1 text-sm">
              <dt className="text-brand04">ログインID</dt>
              <dd className="text-brand01 font-bold">{user.loginId}</dd>
              <dt className="text-brand04">状態</dt>
              <dd>
                <StatusTag tone={user.status === "active" ? "info" : "muted"}>
                  {user.status === "active" ? "有効" : "無効"}
                </StatusTag>
              </dd>
              <dt className="text-brand04">最終ログイン</dt>
              <dd className="text-brand01">
                {user.lastLoginAt
                  ? user.lastLoginAt.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })
                  : "まだログインしていません"}
              </dd>
              <dt className="text-brand04">パスワード</dt>
              <dd className="text-brand01">
                {user.mustChangePassword ? "初回ログイン時に変更が必要" : "変更済み"}
              </dd>
            </dl>
            <AccountControls userId={user.id} status={user.status} isSelf={user.id === actor.userId} />
          </>
        ) : (
          <>
            <p className="text-brand04 text-sm">
              この社員にはまだログインアカウントがありません。入社前でも発行できますが、実際に使えるのは、
              状態が「在籍」または「休職」で、入社日以降、退職日までの間です。
            </p>
            <IssueAccountForm
              employeeId={employee.id}
              defaultLoginId={employee.employeeNumber.toLowerCase()}
              canIssue={detail.hasOpenPrimary}
            />
          </>
        )}
      </Section>
    </div>
  );
}
