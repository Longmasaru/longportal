import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import type { Actor } from "@/modules/core/access";
import { requireAppAccess } from "@/modules/core/apps";
import { canInAnyScope } from "@/modules/core/access";
import { isRecordKind, RECORD_KINDS, RECORD_KIND_SHORT, type RecordKind } from "../labels";
import { HR_RECORDS_MANAGE, manifest } from "../manifest";
import { getEmployeeProfile, getSheet, listRecords, modeFor } from "../queries";
import { RecordForm, RecordList } from "./record-forms";
import { SheetSections } from "./sheet-view";

const TAB =
  "border-brand01/20 text-brand01 hover:border-brand03 hover:text-brand03 border bg-white px-3 py-1.5 text-sm font-bold transition-colors";
const TAB_ACTIVE = "border-brand01 bg-brand01 border px-3 py-1.5 text-sm font-bold text-white";

function Header({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div>
      <p className="font-heading text-brand03 text-xs font-bold tracking-[0.2em]">
        HR<span className="text-brand04 ml-3 font-medium tracking-[0.1em]">{eyebrow}</span>
      </p>
      <h1 className="text-brand01 mt-2 text-2xl font-bold">{title}</h1>
      <p className="text-brand04 mt-1 text-sm">{description}</p>
    </div>
  );
}

/** 社員のページの本体(/apps/hr/<id>、本人が /apps/hr を開いたときも)。 */
export async function EmployeeRecordsView({
  actor,
  employeeId,
  kind,
}: {
  actor: Actor;
  employeeId: string;
  kind: RecordKind | null;
}) {
  const profile = await getEmployeeProfile(employeeId, actor.today);
  if (!profile) notFound();
  const mode = modeFor(actor, profile);
  if (mode === "none") notFound();

  const [all, sheet] = await Promise.all([listRecords(profile.id, mode), getSheet(profile.id)]);
  const records = kind ? all.filter((r) => r.kind === kind) : all;
  const isSelf = mode === "self";
  const base = isSelf && profile.id === actor.employee?.id ? manifest.route : `${manifest.route}/${profile.id}`;
  const href = (k: RecordKind | null) => (k ? `${base}?kind=${k}` : base);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 md:px-8 md:py-10">
      {!isSelf || canInAnyScope(actor, HR_RECORDS_MANAGE) ? (
        <Link href={manifest.route} className="text-brand04 hover:text-brand03 text-sm font-bold transition-colors">
          ‹ 社員の一覧へ
        </Link>
      ) : null}
      <Header
        eyebrow="人事管理"
        title={isSelf ? "自分の人事管理シート" : `${profile.name} さんの人事管理シート`}
        description={
          isSelf
            ? "基本情報・目標と評価・スキルと資格、面談で話したこと・注意・ほめを、あとから見返せます。"
            : "1〜3 章と「本人に公開」の記録は、本人も自分のページで見られます。4・5 章と管理者だけのメモは見えません。"
        }
      />

      <SheetSections profile={profile} sheet={sheet} editable={!isSelf} isSelf={isSelf} today={actor.today} />

      {!isSelf ? (
        <section aria-labelledby="hr-new" className="border-brand01/15 flex flex-col gap-3 border bg-white p-4">
          <h2 id="hr-new" className="text-brand01 text-lg font-bold">
            記録を追加
          </h2>
          <RecordForm employeeId={profile.id} today={actor.today} />
        </section>
      ) : null}

      <section aria-labelledby="hr-records" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="hr-records" className="text-brand01 text-lg font-bold">
            記録({all.length}件)
          </h2>
          <nav className="flex flex-wrap gap-2" aria-label="種類で絞り込み">
            <Link href={href(null)} className={kind === null ? TAB_ACTIVE : TAB}>
              すべて
            </Link>
            {RECORD_KINDS.map((k) => (
              <Link key={k} href={href(k)} className={kind === k ? TAB_ACTIVE : TAB}>
                {RECORD_KIND_SHORT[k]} {all.filter((r) => r.kind === k).length}
              </Link>
            ))}
          </nav>
        </div>
        <RecordList records={records} editable={!isSelf} employeeId={profile.id} today={actor.today} />
      </section>
    </div>
  );
}

const idSchema = z.uuid();

export function parseKind(value: string | string[] | undefined): RecordKind | null {
  return isRecordKind(value) ? value : null;
}

/** /apps/hr/<社員 ID>。権限のない人が他の社員を開くと 404。 */
export async function HrEmployeePage({ employeeId, kind }: { employeeId: string; kind: RecordKind | null }) {
  const actor = await requireAppAccess(manifest.appKey);
  if (!idSchema.safeParse(employeeId).success) notFound();
  return <EmployeeRecordsView actor={actor} employeeId={employeeId} kind={kind} />;
}
