"use client";

import { useActionState, useState, useTransition } from "react";
import {
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  FIELD_CLASS,
  Field,
  FormNotice,
  StatusTag,
} from "../../shared/ui/form";
import {
  deleteAudienceAction,
  previewAudienceAction,
  saveAudienceAction,
  type AudienceFormState,
  type PreviewResult,
} from "../actions";
import {
  ATTRIBUTE_LABEL,
  CONDITION_ATTRIBUTES,
  MAX_CONDITIONS_PER_GROUP,
  MAX_GROUPS,
  type AudienceCondition,
  type AudienceDefinition,
  type ConditionAttribute,
  type MasterListAttribute,
} from "../definition";
import type { EmployeeOption, MasterOptions } from "../queries";

// 編集中の条件は、どの種類でも同じ形(ids / flag / months)で持ち、保存・プレビューの直前に定義へ変換する。
type DraftCondition = {
  key: number;
  attribute: ConditionAttribute;
  operator: "in" | "is" | "lt" | "gte";
  ids: string[];
  flag: boolean;
  months: string;
};
type DraftGroup = { key: number; conditions: DraftCondition[] };

// 追加した行のキー(イベントハンドラ内=クライアントでのみ使う)。初期表示のキーは、サーバーと同じ値になるよう位置から決める。
let addedKeySeq = 1_000_000;
const nextKey = () => addedKeySeq++;

const LIST_ATTRIBUTES: ConditionAttribute[] = ["department", "location", "position", "employment_type"];
const isListAttribute = (a: ConditionAttribute): a is MasterListAttribute => LIST_ATTRIBUTES.includes(a);

function toDefinition(groups: DraftGroup[]): AudienceDefinition {
  return {
    groups: groups.map((g) => ({
      conditions: g.conditions.map((c): AudienceCondition => {
        if (isListAttribute(c.attribute)) return { attribute: c.attribute, operator: "in", value: c.ids };
        if (c.attribute === "employee") return { attribute: "employee", operator: "in", value: c.ids };
        if (c.attribute === "is_management") return { attribute: "is_management", operator: "is", value: c.flag };
        return {
          attribute: "tenure_months",
          operator: c.operator === "gte" ? "gte" : "lt",
          value: Number(c.months),
        };
      }),
    })),
  };
}

export type AudienceEditorValues = {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  definition: AudienceDefinition;
};

export function AudienceEditor({
  audience,
  options,
  initialPreview,
}: {
  audience?: AudienceEditorValues;
  options: MasterOptions;
  initialPreview?: PreviewResult;
}) {
  const editing = audience !== undefined;
  const [groups, setGroups] = useState<DraftGroup[]>(() =>
    (audience?.definition.groups ?? []).map((g, gi) => ({
      key: gi + 1,
      conditions: g.conditions.map((c, ci): DraftCondition => ({
        key: (gi + 1) * 1000 + ci + 1,
        attribute: c.attribute,
        operator: c.operator,
        ids: Array.isArray(c.value) ? c.value : [],
        flag: typeof c.value === "boolean" ? c.value : true,
        months: typeof c.value === "number" ? String(c.value) : "12",
      })),
    })),
  );
  const [preview, setPreview] = useState<PreviewResult | undefined>(initialPreview);
  const [previewDirty, setPreviewDirty] = useState(false);
  const [previewing, startPreview] = useTransition();
  const [state, action, saving] = useActionState<AudienceFormState, FormData>(saveAudienceAction, undefined);
  const [delState, delAction, deleting] = useActionState<AudienceFormState, FormData>(deleteAudienceAction, undefined);

  const definition = toDefinition(groups);
  const change = (fn: (g: DraftGroup[]) => DraftGroup[]) => {
    setGroups(fn);
    setPreviewDirty(true);
  };
  const updateCondition = (gk: number, ck: number, patch: Partial<DraftCondition>) =>
    change((gs) =>
      gs.map((g) =>
        g.key === gk ? { ...g, conditions: g.conditions.map((c) => (c.key === ck ? { ...c, ...patch } : c)) } : g,
      ),
    );

  const runPreview = () =>
    startPreview(async () => {
      setPreview(await previewAudienceAction(JSON.stringify(definition)));
      setPreviewDirty(false);
    });

  return (
    <div className="flex flex-col gap-6">
      <form action={action} className="border-brand01/20 flex flex-col gap-6 border bg-white p-5">
        {editing ? <input type="hidden" name="id" value={audience.id} /> : <input type="hidden" name="id" value="" />}
        <input type="hidden" name="definition" value={JSON.stringify(definition)} />
        {state?.error ? <FormNotice tone="error">{state.error}</FormNotice> : null}
        {state?.success ? <FormNotice tone="success">{state.success}</FormNotice> : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="名前" htmlFor="aud-name" required>
            <input id="aud-name" name="name" required maxLength={50} defaultValue={audience?.name} className={FIELD_CLASS} />
          </Field>
          <Field label="説明" htmlFor="aud-desc">
            <input id="aud-desc" name="description" maxLength={200} defaultValue={audience?.description} className={FIELD_CLASS} />
          </Field>
        </div>
        <label className="text-brand01 flex items-center gap-2 text-sm">
          <input type="checkbox" name="isActive" defaultChecked={audience?.isActive ?? true} className="size-4" />
          有効(無効にすると、誰も対象になりません)
        </label>

        <fieldset className="flex flex-col gap-4">
          <legend className="text-brand01 mb-1 font-bold">対象者の条件</legend>
          <p className="text-brand04 text-sm">
            グループの中の条件は「かつ」(すべて満たす人)、グループどうしは「または」(どれかに当てはまる人)です。
            条件のないグループは、いまアクセスできる全社員が対象になります。グループが 1 つもなければ、誰も対象になりません。
            部署と拠点は、<strong className="text-brand01">同じ 1 つの所属</strong>が両方を満たす場合だけ当てはまります(兼務の人は、別々の所属では当てはまりません)。
            特定の人を名指しで選ぶときは、項目の「社員」を使います。ほかの条件の人に足したいときは、「社員」だけのグループを追加してください。
          </p>

          {groups.length === 0 ? (
            <FormNotice tone="warning">グループがないため、現在は誰も対象になりません。</FormNotice>
          ) : null}

          {groups.map((group, gi) => (
            <div key={group.key}>
              {gi > 0 ? (
                <p className="text-brand03 mb-3 text-center text-sm font-bold tracking-widest">— または —</p>
              ) : null}
              <div className="border-brand01/30 bg-bg01/40 flex flex-col gap-3 border p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-brand01 font-bold">グループ {gi + 1}</p>
                  <button
                    type="button"
                    onClick={() => change((gs) => gs.filter((g) => g.key !== group.key))}
                    className={BUTTON_SECONDARY}
                  >
                    グループを削除
                  </button>
                </div>

                {group.conditions.length === 0 ? (
                  <p className="text-brand01 bg-white px-3 py-2 text-sm">
                    条件なし(いまアクセスできる全社員が対象)
                  </p>
                ) : null}

                {group.conditions.map((c, ci) => (
                  <div key={c.key}>
                    {ci > 0 ? <p className="text-brand04 mb-2 text-center text-xs font-bold">かつ</p> : null}
                    <div className="flex flex-wrap items-start gap-3 bg-white p-3">
                      <div>
                        <label htmlFor={`attr-${c.key}`} className="text-brand04 mb-1 block text-xs font-bold">
                          項目
                        </label>
                        <select
                          id={`attr-${c.key}`}
                          value={c.attribute}
                          onChange={(e) => {
                            const attribute = e.target.value as ConditionAttribute;
                            updateCondition(group.key, c.key, {
                              attribute,
                              operator: attribute === "tenure_months" ? "lt" : attribute === "is_management" ? "is" : "in",
                              ids: [],
                              flag: true,
                              months: "12",
                            });
                          }}
                          className={`${FIELD_CLASS} !w-auto`}
                        >
                          {CONDITION_ATTRIBUTES.map((a) => (
                            <option key={a} value={a}>
                              {ATTRIBUTE_LABEL[a]}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="min-w-0 flex-1">
                        {isListAttribute(c.attribute) ? (
                          <fieldset>
                            <legend className="text-brand04 mb-1 text-xs font-bold">
                              {ATTRIBUTE_LABEL[c.attribute]}(どれかに当てはまる)
                            </legend>
                            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                              {options[c.attribute]
                                .filter((o) => o.isActive || c.ids.includes(o.id))
                                .map((o) => (
                                  <label key={o.id} className="text-brand01 flex items-center gap-1.5 text-sm">
                                    <input
                                      type="checkbox"
                                      checked={c.ids.includes(o.id)}
                                      onChange={(e) =>
                                        updateCondition(group.key, c.key, {
                                          ids: e.target.checked ? [...c.ids, o.id] : c.ids.filter((id) => id !== o.id),
                                        })
                                      }
                                      className="size-4"
                                    />
                                    {o.name}
                                    {!o.isActive ? <StatusTag tone="muted">無効</StatusTag> : null}
                                  </label>
                                ))}
                              {options[c.attribute].length === 0 ? (
                                <span className="text-brand04 text-sm">選択肢がありません(先に組織管理で登録してください)。</span>
                              ) : null}
                            </div>
                          </fieldset>
                        ) : c.attribute === "employee" ? (
                          <EmployeePicker
                            conditionKey={c.key}
                            options={options.employee}
                            selected={c.ids}
                            onChange={(ids) => updateCondition(group.key, c.key, { ids })}
                          />
                        ) : c.attribute === "is_management" ? (
                          <div>
                            <label htmlFor={`flag-${c.key}`} className="text-brand04 mb-1 block text-xs font-bold">
                              条件
                            </label>
                            <select
                              id={`flag-${c.key}`}
                              value={c.flag ? "yes" : "no"}
                              onChange={(e) => updateCondition(group.key, c.key, { flag: e.target.value === "yes" })}
                              className={`${FIELD_CLASS} !w-auto`}
                            >
                              <option value="yes">管理職</option>
                              <option value="no">管理職以外(役職なしを含む)</option>
                            </select>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-end gap-3">
                            <div>
                              <label htmlFor={`op-${c.key}`} className="text-brand04 mb-1 block text-xs font-bold">
                                入社から
                              </label>
                              <input
                                id={`mo-${c.key}`}
                                type="number"
                                min={0}
                                max={1200}
                                value={c.months}
                                onChange={(e) => updateCondition(group.key, c.key, { months: e.target.value })}
                                className={`${FIELD_CLASS} !w-28`}
                                aria-label="期間(か月)"
                              />
                            </div>
                            <span className="text-brand01 pb-2 text-sm">か月</span>
                            <select
                              id={`op-${c.key}`}
                              value={c.operator === "gte" ? "gte" : "lt"}
                              onChange={(e) => updateCondition(group.key, c.key, { operator: e.target.value as "lt" | "gte" })}
                              className={`${FIELD_CLASS} !w-auto`}
                              aria-label="未満か以上か"
                            >
                              <option value="lt">未満(例: 入社1年未満 = 12か月未満)</option>
                              <option value="gte">以上</option>
                            </select>
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          change((gs) =>
                            gs.map((g) =>
                              g.key === group.key ? { ...g, conditions: g.conditions.filter((x) => x.key !== c.key) } : g,
                            ),
                          )
                        }
                        className={BUTTON_SECONDARY}
                      >
                        条件を削除
                      </button>
                    </div>
                  </div>
                ))}

                <div>
                  <button
                    type="button"
                    disabled={group.conditions.length >= MAX_CONDITIONS_PER_GROUP}
                    onClick={() =>
                      change((gs) =>
                        gs.map((g) =>
                          g.key === group.key
                            ? {
                                ...g,
                                conditions: [
                                  ...g.conditions,
                                  { key: nextKey(), attribute: "location", operator: "in", ids: [], flag: true, months: "12" },
                                ],
                              }
                            : g,
                        ),
                      )
                    }
                    className={BUTTON_SECONDARY}
                  >
                    条件を追加
                  </button>
                </div>
              </div>
            </div>
          ))}

          <div>
            <button
              type="button"
              disabled={groups.length >= MAX_GROUPS}
              onClick={() => change((gs) => [...gs, { key: nextKey(), conditions: [] }])}
              className={BUTTON_SECONDARY}
            >
              グループを追加
            </button>
          </div>
        </fieldset>

        <div className="border-brand01/15 flex flex-wrap gap-3 border-t pt-5">
          <button type="submit" disabled={saving} className={BUTTON_PRIMARY}>
            {saving ? "保存中…" : editing ? "保存" : "作成"}
          </button>
          <button type="button" onClick={runPreview} disabled={previewing} className={BUTTON_SECONDARY}>
            {previewing ? "確認中…" : "対象者をプレビュー"}
          </button>
        </div>
      </form>

      <section aria-label="対象者のプレビュー" className="flex flex-col gap-3">
        <h2 className="text-brand01 border-brand01/20 border-b pb-2 text-lg font-bold">現在の対象者</h2>
        {previewDirty ? (
          <FormNotice tone="info">条件が変更されています。「対象者をプレビュー」で更新してください。</FormNotice>
        ) : null}
        {!preview ? (
          <p className="text-brand04 text-sm">「対象者をプレビュー」を押すと、現在の対象人数と対象者を確認できます。</p>
        ) : !preview.ok ? (
          <FormNotice tone="error">{preview.error}</FormNotice>
        ) : (
          <>
            <p className="text-brand01 text-sm">
              <span className="font-heading text-2xl font-black">{preview.count}</span> 名
              <span className="text-brand04 ml-2 text-xs">
                (いまアクセスできる社員が対象。入社予定・退職済みは含みません)
              </span>
            </p>
            {preview.count === 0 ? null : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[32rem] text-left text-sm">
                  <thead>
                    <tr className="border-brand01 text-brand01 border-b-2 text-xs">
                      <th className="px-2 py-2 font-bold">社員</th>
                      <th className="px-2 py-2 font-bold">社員番号</th>
                      <th className="px-2 py-2 font-bold">主所属</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.shown.map((m) => (
                      <tr key={m.employeeId} className="border-brand04/40 border-b">
                        <td className="text-brand01 px-2 py-2 font-bold">{m.name}</td>
                        <td className="font-heading text-brand04 px-2 py-2 text-xs">{m.employeeNumber}</td>
                        <td className="text-brand01 px-2 py-2">{m.affiliation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.count > preview.shown.length ? (
                  <p className="text-brand04 mt-2 text-xs">先頭の {preview.shown.length} 名を表示しています。</p>
                ) : null}
              </div>
            )}
          </>
        )}
      </section>

      {editing ? (
        <form
          action={delAction}
          onSubmit={(e) => {
            if (!window.confirm(`Audience「${audience.name}」を削除します。よろしいですか?`)) e.preventDefault();
          }}
          className="flex flex-col gap-3"
        >
          <input type="hidden" name="id" value={audience.id} />
          {delState?.error ? <FormNotice tone="error">{delState.error}</FormNotice> : null}
          <div>
            <button type="submit" disabled={deleting} className={BUTTON_SECONDARY}>
              この Audience を削除
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

// 絞り込み用の正規化: 空白を除き、カタカナをひらがなに、英字を小文字にそろえる。
function normalizeForSearch(s: string): string {
  return s
    .replace(/[\s　]/g, "")
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .toLowerCase();
}

/** 社員を一覧から選ぶ欄(社員番号・氏名・フリガナ・主所属で絞り込める)。 */
function EmployeePicker({
  conditionKey,
  options,
  selected,
  onChange,
}: {
  conditionKey: number;
  options: EmployeeOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const selectedSet = new Set(selected);
  const byId = new Map(options.map((o) => [o.id, o]));
  // いまアクセスできる社員と、選択済みの社員(退職などで対象外になった人も外せるように残す)
  const candidates = options.filter((o) => o.isActive || selectedSet.has(o.id));
  const q = normalizeForSearch(query);
  const shown = q
    ? candidates.filter((o) =>
        normalizeForSearch(`${o.employeeNumber} ${o.name} ${o.nameKana} ${o.affiliation}`).includes(q),
      )
    : candidates;
  const toggle = (id: string, on: boolean) =>
    onChange(on ? [...selected, id] : selected.filter((x) => x !== id));

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-brand04 mb-1 text-xs font-bold">社員(選んだ人のどれかに当てはまる)</legend>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-brand01 text-sm">
          選択中 <span className="font-bold">{selected.length}</span> 人
        </span>
        {selected.map((id) => {
          const o = byId.get(id);
          return (
            <span key={id} className="bg-bg01 text-brand01 inline-flex items-center gap-1 px-2 py-0.5 text-xs">
              {o ? o.name : "(不明な社員)"}
              {o && !o.isActive ? <StatusTag tone="muted">対象外</StatusTag> : null}
              <button
                type="button"
                onClick={() => toggle(id, false)}
                className="text-brand04 hover:text-brand01 ml-0.5 font-bold"
                aria-label={`${o ? o.name : "不明な社員"}を外す`}
              >
                ×
              </button>
            </span>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          id={`emp-q-${conditionKey}`}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="社員番号・氏名・フリガナ・部署で絞り込み"
          aria-label="社員を絞り込む"
          className={`${FIELD_CLASS} !w-72 max-w-full`}
        />
        <button
          type="button"
          onClick={() => onChange([...new Set([...selected, ...shown.filter((o) => o.isActive).map((o) => o.id)])])}
          disabled={shown.length === 0}
          className={BUTTON_SECONDARY}
        >
          表示中をすべて選ぶ
        </button>
        <button type="button" onClick={() => onChange([])} disabled={selected.length === 0} className={BUTTON_SECONDARY}>
          選択をすべて外す
        </button>
      </div>

      <div className="border-brand01/20 max-h-72 overflow-y-auto border">
        {shown.length === 0 ? (
          <p className="text-brand04 px-3 py-4 text-sm">
            {candidates.length === 0 ? "選べる社員がいません。" : "当てはまる社員がいません。"}
          </p>
        ) : (
          <ul>
            {shown.map((o) => (
              <li key={o.id} className="border-brand04/30 border-b last:border-b-0">
                <label className="hover:bg-bg01/60 flex cursor-pointer items-center gap-3 px-3 py-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedSet.has(o.id)}
                    onChange={(e) => toggle(o.id, e.target.checked)}
                    className="size-4 shrink-0"
                  />
                  <span className="font-heading text-brand04 w-12 shrink-0 text-xs">{o.employeeNumber}</span>
                  <span className="text-brand01 font-bold whitespace-nowrap">{o.name}</span>
                  {!o.isActive ? <StatusTag tone="muted">対象外</StatusTag> : null}
                  <span className="text-brand04 ml-auto min-w-0 truncate text-xs">{o.affiliation}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
    </fieldset>
  );
}
