import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import type { Actor } from "@/modules/core/access";
import { requireAppAccess } from "@/modules/core/apps";
import { canInAnyScope } from "@/modules/core/access";
import { formatDateDot } from "@/modules/core/shared/format";
import {
  CONDITION_STATE_LABEL,
  isRecordKind,
  isTab,
  RECORD_KINDS,
  RECORD_KIND_SHORT,
  SATISFACTION_LABEL,
  SECTION_VISIBLE_TO_SELF,
  TABS,
  TAB_LABEL,
  type RecordKind,
  type Tab,
} from "../labels";
import { ageOn, tenureOn } from "../logic";
import { HR_RECORDS_MANAGE, manifest } from "../manifest";
import { getEmployeeProfile, getSheet, listRecords, modeFor } from "../queries";
import type { EmployeeProfile, HrRecord, HrSheet } from "../types";
import { AbilityRadar } from "./ability-radar";
import { KindTag, NewRecordPanel, RecordList } from "./record-forms";
import { SheetSection } from "./sheet-view";

const FILTER = "border-brand01/20 text-brand01 hover:border-brand03 hover:text-brand03 border bg-white px-3 py-1 text-sm font-bold transition-colors";
const FILTER_ACTIVE = "border-brand01 bg-brand01 border px-3 py-1 text-sm font-bold text-white";

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-brand04 text-xs">{label}</dt>
      <dd className="text-brand01 text-sm font-bold">{children}</dd>
    </div>
  );
}

function SummaryBox({ title, children, href }: { title: string; children: React.ReactNode; href?: string }) {
  return (
    <div className="border-brand01/15 flex flex-col gap-2 border-t pt-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-brand04 text-xs font-bold tracking-widest">{title}</h3>
        {href ? (
          <Link href={href} className="text-brand01 hover:text-brand03 text-xs font-bold transition-colors">
            すべて見る ›
          </Link>
        ) : null}
      </div>
      {children}
    </div>
  );
}

/** ページのいちばん上の「まとめ」(31.2)。名札・能力のグラフ・直近の記録・(管理する人には)最新のコンディション。 */
function Summary({
  profile,
  sheet,
  records,
  isSelf,
  today,
  base,
}: {
  profile: EmployeeProfile;
  sheet: HrSheet;
  records: HrRecord[];
  isSelf: boolean;
  today: string;
  base: string;
}) {
  const primary = profile.assignments[0];
  const tenure = tenureOn(profile.hiredOn, today);
  const birth = sheet.birthDate;
  const latest = sheet.conditions[0];
  const expired = sheet.qualifications.filter((q) => q.expiresOn && q.expiresOn < today).length;

  return (
    <section aria-label="まとめ" className="border-brand01/15 grid gap-6 border bg-white p-5 md:grid-cols-[1fr_auto]">
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-brand04 text-xs">
            <span className="font-heading">{profile.employeeNumber}</span>
            {profile.nameKana ? ` ・ ${profile.nameKana}` : ""}
          </p>
          <p className="text-brand01 text-2xl font-bold">{profile.name}</p>
          <p className="text-brand01 mt-1 text-sm">
            {primary ? `${primary.locationName} / ${primary.departmentName}` : "所属なし"}
            <span className="text-brand04"> ・ </span>
            {profile.positionName ?? "役職なし"}
            {profile.status === "retired" ? <span className="text-brand03 ml-2 font-bold">退職</span> : null}
          </p>
        </div>
        <dl className="grid grid-cols-3 gap-3">
          <Fact label="年齢">{birth ? `${ageOn(birth, today)}歳` : "—"}</Fact>
          <Fact label="勤続">{tenure ? `${tenure.years}年${tenure.months}ヶ月` : "入社前"}</Fact>
          <Fact label="入社">{formatDateDot(profile.hiredOn)}</Fact>
        </dl>

        <SummaryBox title="直近の記録" href={`${base}?tab=records`}>
          {records.length === 0 ? (
            <p className="text-brand04 text-sm">まだ記録がありません。</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {records.slice(0, 3).map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-heading text-brand04 tabular-nums">{formatDateDot(r.occurredOn)}</span>
                  <KindTag kind={r.kind} />
                  <span className="text-brand01 font-bold">{r.title}</span>
                </li>
              ))}
            </ul>
          )}
        </SummaryBox>

        {!isSelf ? (
          <SummaryBox title="最新のコンディション(本人には見えません)" href={`${base}?tab=condition`}>
            {latest ? (
              <p className="text-brand01 text-sm">
                <span className="font-heading text-brand04 mr-2 tabular-nums">{formatDateDot(latest.checkedOn)}</span>
                健康 <b className={latest.health === "poor" ? "text-brand03" : undefined}>{latest.health ? CONDITION_STATE_LABEL[latest.health] : "—"}</b>
                {" ・ "}メンタル <b className={latest.mental === "poor" ? "text-brand03" : undefined}>{latest.mental ? CONDITION_STATE_LABEL[latest.mental] : "—"}</b>
                {" ・ "}満足度 <b className={latest.satisfaction !== null && latest.satisfaction <= 2 ? "text-brand03" : undefined}>{latest.satisfaction ? SATISFACTION_LABEL[latest.satisfaction] : "—"}</b>
              </p>
            ) : (
              <p className="text-brand04 text-sm">まだ確認の記録がありません。</p>
            )}
          </SummaryBox>
        ) : null}

        {expired > 0 ? (
          <p className="text-brand03 text-sm font-bold">
            有効期限の切れた資格・免許が {expired} 件あります(
            <Link href={`${base}?tab=skills`} className="underline">
              スキルと資格
            </Link>
            )。
          </p>
        ) : null}
      </div>

      <div className="flex flex-col items-center gap-1 md:w-[300px]">
        <h3 className="text-brand04 self-start text-xs font-bold tracking-widest">能力の評価</h3>
        <AbilityRadar abilities={sheet.abilities} />
      </div>
    </section>
  );
}

/** 社員のページの本体(/apps/hr/<id>、本人が /apps/hr を開いたときも)。 */
export async function EmployeeRecordsView({
  actor,
  employeeId,
  kind,
  tab,
}: {
  actor: Actor;
  employeeId: string;
  kind: RecordKind | null;
  tab: Tab;
}) {
  const profile = await getEmployeeProfile(employeeId, actor.today);
  if (!profile) notFound();
  const mode = modeFor(actor, profile);
  if (mode === "none") notFound();

  const [all, sheet] = await Promise.all([listRecords(profile.id, mode), getSheet(profile.id)]);
  const isSelf = mode === "self";
  const tabs = TABS.filter((t) => t === "records" || !isSelf || SECTION_VISIBLE_TO_SELF[t]);
  const current: Tab = tabs.includes(tab) ? tab : "records";
  const records = kind ? all.filter((r) => r.kind === kind) : all;
  const base = isSelf && profile.id === actor.employee?.id ? manifest.route : `${manifest.route}/${profile.id}`;
  const kindHref = (k: RecordKind | null) => (k ? `${base}?kind=${k}` : base);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-8 md:py-10">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          {!isSelf || canInAnyScope(actor, HR_RECORDS_MANAGE) ? (
            <Link href={manifest.route} className="text-brand04 hover:text-brand03 text-sm font-bold transition-colors">
              ‹ 社員の一覧へ
            </Link>
          ) : null}
          <h1 className="text-brand01 mt-1 text-xl font-bold">{isSelf ? "自分の人事管理シート" : "人事管理シート"}</h1>
        </div>
        <p className="text-brand04 text-xs">
          {isSelf
            ? "上司が書いた、面談・注意・ほめの記録などを見られます。"
            : "本人も自分のページで見られます(記録・基本情報・目標と評価・スキルと資格)。"}
        </p>
      </div>

      <Summary profile={profile} sheet={sheet} records={all} isSelf={isSelf} today={actor.today} base={base} />

      <nav aria-label="シートの章" className="border-brand01/20 -mb-2 flex flex-wrap gap-x-1 border-b">
        {tabs.map((t) => (
          <Link
            key={t}
            href={t === "records" ? base : `${base}?tab=${t}`}
            aria-current={t === current ? "page" : undefined}
            className={
              t === current
                ? "border-brand01 text-brand01 -mb-px border-b-2 px-3 py-2 text-sm font-bold"
                : "text-brand04 hover:text-brand01 px-3 py-2 text-sm font-bold transition-colors"
            }
          >
            {TAB_LABEL[t]}
            {t === "records" ? <span className="ml-1 font-normal">{all.length}</span> : null}
            {!isSelf && (t === "character" || t === "condition") ? <span className="ml-1 text-[10px] font-normal">(非公開)</span> : null}
          </Link>
        ))}
      </nav>

      {current === "records" ? (
        <section aria-label="記録" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <nav className="flex flex-wrap gap-2" aria-label="種類で絞り込み">
              <Link href={kindHref(null)} className={kind === null ? FILTER_ACTIVE : FILTER}>
                すべて {all.length}
              </Link>
              {RECORD_KINDS.map((k) => (
                <Link key={k} href={kindHref(k)} className={kind === k ? FILTER_ACTIVE : FILTER}>
                  {RECORD_KIND_SHORT[k]} {all.filter((r) => r.kind === k).length}
                </Link>
              ))}
            </nav>
          </div>
          {!isSelf ? <NewRecordPanel employeeId={profile.id} today={actor.today} /> : null}
          <RecordList records={records} editable={!isSelf} employeeId={profile.id} today={actor.today} />
        </section>
      ) : (
        <SheetSection
          section={current}
          profile={profile}
          sheet={sheet}
          editable={!isSelf}
          isSelf={isSelf}
          today={actor.today}
        />
      )}
    </div>
  );
}

const idSchema = z.uuid();

export function parseKind(value: string | string[] | undefined): RecordKind | null {
  return isRecordKind(value) ? value : null;
}

export function parseTab(value: string | string[] | undefined): Tab {
  return isTab(value) ? value : "records";
}

/** /apps/hr/<社員 ID>。権限のない人が他の社員を開くと 404。 */
export async function HrEmployeePage({ employeeId, kind, tab }: { employeeId: string; kind: RecordKind | null; tab: Tab }) {
  const actor = await requireAppAccess(manifest.appKey);
  if (!idSchema.safeParse(employeeId).success) notFound();
  return <EmployeeRecordsView actor={actor} employeeId={employeeId} kind={kind} tab={tab} />;
}
