import type { ReactNode } from "react";
import { formatDateDot } from "@/modules/core/shared/format";
import {
  ABILITY_AXES,
  CONDITION_STATES,
  CONDITION_STATE_LABEL,
  GENDERS,
  GENDER_LABEL,
  NAME_MAX,
  PROFILE_TEXT_FIELDS,
  SATISFACTION_LABEL,
  SECTION_LABEL,
  SECTION_VISIBLE_TO_SELF,
  TEXT_MAX,
  TRAINING_KINDS,
  TRAINING_KIND_LABEL,
  type ConditionState,
  type Section,
} from "../labels";
import { ageOn, leaveSummary, tenureOn, trend } from "../logic";
import { AbilityRadar } from "./ability-radar";
import type { EmployeeProfile, HrSheet } from "../types";
import { AddItemForm, DeleteItemButton, SectionCard, type FieldSpec } from "./sheet-forms";

// 人事管理シートの 1〜5 章(docs/DESIGN.md 31.1・31.2)。タブごとに 1 章を出す。本人の見え方では SECTION_VISIBLE_TO_SELF の章だけを出し、編集はさせない。

function Item({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-brand04 text-xs font-bold tracking-widest">{label}</dt>
      <dd className="text-brand01 mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

const EMPTY = <span className="text-brand04 font-normal">—</span>;

/** 文章の項目。書かれた項目だけを並べ、未記入の項目は 1 行にまとめる(31.2)。 */
function TextGroup({ fields, values, editable }: { fields: readonly { key: string; label: string }[]; values: Record<string, string>; editable: boolean }) {
  const filled = fields.filter((f) => values[f.key]);
  const empty = fields.filter((f) => !values[f.key]);
  return (
    <div className="flex flex-col gap-4">
      {filled.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {filled.map((f) => (
            <div key={f.key}>
              <p className="text-brand04 text-xs font-bold tracking-widest">{f.label}</p>
              <p className="text-brand01 mt-1 text-sm leading-relaxed whitespace-pre-wrap">{values[f.key]}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-brand04 text-sm">まだ書かれていません。{editable ? "「編集」から書き込めます。" : ""}</p>
      )}
      {filled.length > 0 && empty.length > 0 ? (
        <p className="text-brand04 text-xs">未記入: {empty.map((f) => f.label).join("、")}</p>
      ) : null}
    </div>
  );
}

const TREND_MARK = { up: "↑", flat: "→", down: "↓" } as const;
const STATE_SCORE: Record<ConditionState, number> = { good: 3, same: 2, poor: 1 };

function ListTable({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[28rem] text-left text-sm">
        <thead>
          <tr className="border-brand01 text-brand01 border-b text-xs">
            {head.map((h) => (
              <th key={h} className="px-2 py-1.5 font-bold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function SubHeading({ children }: { children: ReactNode }) {
  return <h3 className="text-brand01 border-brand01/15 border-t pt-3 text-sm font-bold">{children}</h3>;
}

/** 1 つの章(タブ)の中身。本人の見え方で出さない章は null。 */
export function SheetSection({
  section,
  profile,
  sheet,
  editable,
  isSelf,
  today,
  supervisorCandidates = [],
}: {
  section: Section;
  profile: EmployeeProfile;
  sheet: HrSheet;
  editable: boolean;
  /** 本人に見せる範囲だけを出す(本人・上司の見え方) */
  isSelf: boolean;
  today: string;
  /** 上司を選ぶ欄の候補(編集できるときだけ。31.4) */
  supervisorCandidates?: { id: string; name: string; employeeNumber: string }[];
}) {
  if (isSelf && !SECTION_VISIBLE_TO_SELF[section]) return null;
  const p = sheet.profile;
  const show = (s: Section) => s === section;
  const textValues: Record<string, string> = Object.fromEntries(
    [...PROFILE_TEXT_FIELDS.goals, ...PROFILE_TEXT_FIELDS.skills, ...PROFILE_TEXT_FIELDS.character].map((f) => [
      f.key,
      p ? String(p[f.key as keyof typeof p] ?? "") : "",
    ]),
  );
  const primary = profile.assignments[0];
  const tenure = tenureOn(profile.hiredOn, today);
  const leave = leaveSummary(p?.leaveGranted ?? null, p?.leaveTaken ?? null);
  const common = { employeeId: profile.id };
  const textFields = (keys: readonly { key: string; label: string }[]): FieldSpec[] =>
    keys.map((f) => ({
      name: f.key,
      label: f.label,
      type: "textarea",
      maxLength: TEXT_MAX,
      value: p ? String(p[f.key as keyof typeof p] ?? "") : "",
    }));
  const latest = sheet.conditions[0];
  const previous = sheet.conditions[1];
  const stateOptions = CONDITION_STATES.map((s) => ({ value: s, label: CONDITION_STATE_LABEL[s] }));
  const satisfactionOptions = [5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: SATISFACTION_LABEL[n] }));

  return (
    <>
      {show("basic") ? (
      <SectionCard
        {...common}
        id="hr-basic"
        section="basic"
        title={SECTION_LABEL.basic}
        note={editable ? "社員番号・氏名・所属・役職・雇用区分・入社日は、社員管理で変更します" : undefined}
        fields={
          editable
            ? [
                { name: "birthDate", label: "生年月日", type: "date", value: sheet.birthDate ?? "" },
                {
                  name: "gender",
                  label: "性別",
                  type: "select",
                  value: p?.gender ?? "",
                  options: GENDERS.map((g) => ({ value: g, label: GENDER_LABEL[g] })),
                },
                { name: "remoteRatio", label: "在宅勤務比率", type: "number", value: p?.remoteRatio?.toString() ?? "", suffix: "%" },
                {
                  name: "supervisorEmployeeId",
                  label: "上司(部下のページを、本人と同じ範囲で見られます)",
                  type: "select",
                  value: p?.supervisorEmployeeId ?? "",
                  options: supervisorCandidates.map((c) => ({ value: c.id, label: `${c.name}(${c.employeeNumber})` })),
                  wide: true,
                },
              ]
            : undefined
        }
        view={
          <dl className="grid gap-4 sm:grid-cols-4">
            <Item label="社員番号">
              <span className="font-heading">{profile.employeeNumber}</span>
            </Item>
            <Item label="氏名">{profile.name}</Item>
            <Item label="フリガナ">{profile.nameKana ?? EMPTY}</Item>
            <Item label="生年月日 / 年齢">
              {sheet.birthDate ? `${formatDateDot(sheet.birthDate)}(${ageOn(sheet.birthDate, today)}歳)` : EMPTY}
            </Item>
            <Item label="性別">{p?.gender ? GENDER_LABEL[p.gender] : EMPTY}</Item>
            <Item label="所属部署">{primary?.departmentName ?? "所属なし"}</Item>
            <Item label="役職">{profile.positionName ?? "役職なし"}</Item>
            <Item label="雇用形態">{profile.employmentTypeName ?? EMPTY}</Item>
            <Item label="勤務地">{primary?.locationName ?? EMPTY}</Item>
            <Item label="在宅勤務比率">{p?.remoteRatio !== null && p?.remoteRatio !== undefined ? `${p.remoteRatio}%` : EMPTY}</Item>
            <Item label="入社年月日">{formatDateDot(profile.hiredOn)}</Item>
            <Item label="勤続年数">{tenure ? `${tenure.years}年${tenure.months}ヶ月` : "入社前"}</Item>
            <Item label="上司">{sheet.supervisor?.name ?? EMPTY}</Item>
            <Item label="直属の部下" wide>
              {sheet.directReports.length > 0 ? sheet.directReports.map((r) => r.name).join("、") : EMPTY}
            </Item>
          </dl>
        }
      />
      ) : null}

      {show("goals") ? (
        <SectionCard
          {...common}
          id="hr-goals"
          section="goals"
          title={SECTION_LABEL.goals}
          fields={editable ? textFields(PROFILE_TEXT_FIELDS.goals) : undefined}
          view={
            <TextGroup fields={PROFILE_TEXT_FIELDS.goals} values={textValues} editable={editable} />
          }
        />
      ) : null}

      {show("skills") ? (
        <SectionCard
          {...common}
          id="hr-abilities"
          section="abilities"
          title="能力の評価(5 項目)"
          note="全社共通の項目。1〜5 で付けます"
          fields={
            editable
              ? ABILITY_AXES.map((a) => ({
                  name: a.key,
                  label: a.label,
                  type: "select" as const,
                  value: sheet.abilities[a.key]?.toString() ?? "",
                  options: [5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n}` })),
                }))
              : undefined
          }
          view={<AbilityRadar abilities={sheet.abilities} list />}
        />
      ) : null}

      {show("skills") ? (
        <SectionCard
          {...common}
          id="hr-skills"
          section="skills"
          title={SECTION_LABEL.skills}
          fields={editable ? textFields(PROFILE_TEXT_FIELDS.skills) : undefined}
          view={
            <TextGroup fields={PROFILE_TEXT_FIELDS.skills} values={textValues} editable={editable} />
          }
        >
          <SubHeading>保有資格・免許</SubHeading>
          {sheet.qualifications.length === 0 ? (
            <p className="text-brand04 text-sm">まだ登録されていません。</p>
          ) : (
            <ListTable head={["資格・免許", "取得日", "有効期限", ...(editable ? [""] : [])]}>
              {sheet.qualifications.map((q) => (
                <tr key={q.id} className="border-brand04/30 border-b">
                  <td className="text-brand01 px-2 py-2 font-bold">{q.name}</td>
                  <td className="text-brand01 px-2 py-2 tabular-nums">{q.acquiredOn ? formatDateDot(q.acquiredOn) : "—"}</td>
                  <td className="px-2 py-2 tabular-nums">
                    {q.expiresOn ? (
                      <span className={q.expiresOn < today ? "text-brand03 font-bold" : "text-brand01"}>
                        {formatDateDot(q.expiresOn)}
                        {q.expiresOn < today ? "(期限切れ)" : ""}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  {editable ? (
                    <td className="px-2 py-2 text-right">
                      <DeleteItemButton type="qualification" id={q.id} />
                    </td>
                  ) : null}
                </tr>
              ))}
            </ListTable>
          )}
          {editable ? (
            <AddItemForm
              {...common}
              type="qualification"
              label="資格・免許を追加"
              fields={[
                { name: "name", label: "資格・免許", type: "text", required: true, maxLength: NAME_MAX, wide: true },
                { name: "acquiredOn", label: "取得日", type: "date" },
                { name: "expiresOn", label: "有効期限", type: "date" },
              ]}
            />
          ) : null}

          <SubHeading>保有スキル・専門技術</SubHeading>
          {sheet.skills.length === 0 ? (
            <p className="text-brand04 text-sm">まだ登録されていません。</p>
          ) : (
            <ListTable head={["スキル・専門技術", "評価(1〜5)", ...(editable ? [""] : [])]}>
              {sheet.skills.map((s) => (
                <tr key={s.id} className="border-brand04/30 border-b">
                  <td className="text-brand01 px-2 py-2 font-bold">{s.name}</td>
                  <td className="text-brand01 px-2 py-2" aria-label={`評価 ${s.level}`}>
                    <span className="text-brand03 tracking-widest">{"★".repeat(s.level)}</span>
                    <span className="text-brand04/50 tracking-widest">{"★".repeat(5 - s.level)}</span>
                  </td>
                  {editable ? (
                    <td className="px-2 py-2 text-right">
                      <DeleteItemButton type="skill" id={s.id} />
                    </td>
                  ) : null}
                </tr>
              ))}
            </ListTable>
          )}
          {editable ? (
            <AddItemForm
              {...common}
              type="skill"
              label="スキルを追加"
              fields={[
                { name: "name", label: "スキル・専門技術", type: "text", required: true, maxLength: NAME_MAX },
                {
                  name: "level",
                  label: "評価",
                  type: "select",
                  required: true,
                  value: "3",
                  options: [5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: String(n) })),
                },
              ]}
            />
          ) : null}

          <SubHeading>受講済の研修</SubHeading>
          {sheet.trainings.length === 0 ? (
            <p className="text-brand04 text-sm">まだ登録されていません。</p>
          ) : (
            <ListTable head={["社内・社外", "研修内容", "受講日", ...(editable ? [""] : [])]}>
              {sheet.trainings.map((t) => (
                <tr key={t.id} className="border-brand04/30 border-b">
                  <td className="text-brand01 px-2 py-2">{TRAINING_KIND_LABEL[t.kind]}</td>
                  <td className="text-brand01 px-2 py-2 font-bold">{t.title}</td>
                  <td className="text-brand01 px-2 py-2 tabular-nums">{t.takenOn ? formatDateDot(t.takenOn) : "—"}</td>
                  {editable ? (
                    <td className="px-2 py-2 text-right">
                      <DeleteItemButton type="training" id={t.id} />
                    </td>
                  ) : null}
                </tr>
              ))}
            </ListTable>
          )}
          {editable ? (
            <AddItemForm
              {...common}
              type="training"
              label="研修を追加"
              fields={[
                {
                  name: "kind",
                  label: "社内・社外",
                  type: "select",
                  required: true,
                  options: TRAINING_KINDS.map((k) => ({ value: k, label: TRAINING_KIND_LABEL[k] })),
                },
                { name: "takenOn", label: "受講日", type: "date" },
                { name: "title", label: "研修内容", type: "text", required: true, maxLength: NAME_MAX, wide: true },
              ]}
            />
          ) : null}
        </SectionCard>
      ) : null}

      {show("character") ? (
        <SectionCard
          {...common}
          id="hr-character"
          section="character"
          title={SECTION_LABEL.character}
          note="本人には見えません"
          fields={editable ? textFields(PROFILE_TEXT_FIELDS.character) : undefined}
          view={
            <TextGroup fields={PROFILE_TEXT_FIELDS.character} values={textValues} editable={editable} />
          }
        />
      ) : null}

      {show("condition") ? (
        <SectionCard
          {...common}
          id="hr-condition"
          section="condition"
          title={SECTION_LABEL.condition}
          note="本人には見えません"
          fields={
            editable
              ? [
                  { name: "overtimeHours", label: "月平均残業時間", type: "number", value: p?.overtimeHours?.toString() ?? "", suffix: "時間" },
                  { name: "leaveAsOf", label: "数字の基準日", type: "date", value: p?.leaveAsOf ?? "" },
                  { name: "leaveGranted", label: "有給の付与日数", type: "number", value: p?.leaveGranted?.toString() ?? "", suffix: "日" },
                  { name: "leaveTaken", label: "有給の取得日数", type: "number", value: p?.leaveTaken?.toString() ?? "", suffix: "日" },
                ]
              : undefined
          }
          view={
            <dl className="grid gap-4 sm:grid-cols-4">
              <Item label="月平均残業時間">{p?.overtimeHours !== null && p?.overtimeHours !== undefined ? `${p.overtimeHours}時間` : EMPTY}</Item>
              <Item label="有給(付与 / 取得 / 残)">
                {leave ? `${p?.leaveGranted}日 / ${p?.leaveTaken ?? 0}日 / ${leave.remaining}日` : EMPTY}
              </Item>
              <Item label="有給休暇消化率">{leave ? `${leave.rate}%` : EMPTY}</Item>
              <Item label="基準日">{p?.leaveAsOf ? formatDateDot(p.leaveAsOf) : EMPTY}</Item>
            </dl>
          }
        >
          <SubHeading>健康状態・メンタルの変化</SubHeading>
          {latest ? (
            <ListTable head={["", `前回${previous ? `(${formatDateDot(previous.checkedOn)})` : ""}`, `今回(${formatDateDot(latest.checkedOn)})`, "変化"]}>
              {(
                [
                  ["健康状態", previous?.health, latest.health, (v: ConditionState | null | undefined) => (v ? CONDITION_STATE_LABEL[v] : "—"), (v: ConditionState | null | undefined) => (v ? STATE_SCORE[v] : null)],
                  ["メンタル面", previous?.mental, latest.mental, (v: ConditionState | null | undefined) => (v ? CONDITION_STATE_LABEL[v] : "—"), (v: ConditionState | null | undefined) => (v ? STATE_SCORE[v] : null)],
                ] as const
              ).map(([label, prev, now, fmt, score]) => {
                const t = trend(score(prev), score(now));
                return (
                  <tr key={label} className="border-brand04/30 border-b">
                    <th className="text-brand01 px-2 py-2 text-left font-bold">{label}</th>
                    <td className="text-brand01 px-2 py-2">{fmt(prev)}</td>
                    <td className="text-brand01 px-2 py-2">{fmt(now)}</td>
                    <td className={`px-2 py-2 font-bold ${t === "down" ? "text-brand03" : "text-brand01"}`}>{t ? TREND_MARK[t] : "—"}</td>
                  </tr>
                );
              })}
              <tr className="border-brand04/30 border-b">
                <th className="text-brand01 px-2 py-2 text-left font-bold">満足度</th>
                <td className="text-brand01 px-2 py-2">{previous?.satisfaction ? SATISFACTION_LABEL[previous.satisfaction] : "—"}</td>
                <td className="text-brand01 px-2 py-2">{latest.satisfaction ? SATISFACTION_LABEL[latest.satisfaction] : "—"}</td>
                {(() => {
                  const t = trend(previous?.satisfaction, latest.satisfaction);
                  return <td className={`px-2 py-2 font-bold ${t === "down" ? "text-brand03" : "text-brand01"}`}>{t ? TREND_MARK[t] : "—"}</td>;
                })()}
              </tr>
            </ListTable>
          ) : (
            <p className="text-brand04 text-sm">まだ確認の記録がありません。</p>
          )}
          {sheet.conditions.length > 0 ? (
            <details className="text-sm">
              <summary className="text-brand01 cursor-pointer font-bold">これまでの確認({sheet.conditions.length}回)</summary>
              <ul className="mt-2 flex flex-col gap-2">
                {sheet.conditions.map((c) => (
                  <li key={c.id} className="border-brand04/30 flex flex-wrap items-start justify-between gap-2 border-b pb-2">
                    <span className="text-brand01">
                      <span className="font-heading font-bold tabular-nums">{formatDateDot(c.checkedOn)}</span>
                      {"  "}健康 {c.health ? CONDITION_STATE_LABEL[c.health] : "—"} ・ メンタル {c.mental ? CONDITION_STATE_LABEL[c.mental] : "—"} ・ 満足度{" "}
                      {c.satisfaction ? SATISFACTION_LABEL[c.satisfaction] : "—"}
                      {c.note ? <span className="text-brand04 block whitespace-pre-wrap">{c.note}</span> : null}
                    </span>
                    {editable ? <DeleteItemButton type="condition" id={c.id} /> : null}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {editable ? (
            <AddItemForm
              {...common}
              type="condition"
              label="今回の確認を追加"
              fields={[
                { name: "checkedOn", label: "確認した日", type: "date", required: true, value: today },
                { name: "satisfaction", label: "満足度", type: "select", options: satisfactionOptions },
                { name: "health", label: "健康状態", type: "select", options: stateOptions },
                { name: "mental", label: "メンタル面", type: "select", options: stateOptions },
                { name: "note", label: "メモ", type: "textarea", maxLength: TEXT_MAX },
              ]}
            />
          ) : null}
        </SectionCard>
      ) : null}
    </>
  );
}
