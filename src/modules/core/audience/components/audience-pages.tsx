import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireGlobalPermission } from "../../access";
import { todayJst } from "../../shared/jst";
import { BUTTON_PRIMARY, LINK_CLASS, PageHeading, StatusTag } from "../../shared/ui/form";
import {
  evaluateDefinition,
  getAudience,
  listAudiences,
  listAudienceUsages,
  loadMasterLookup,
  loadPopulation,
  lookupToOptions,
} from "../queries";
import { describeDefinition } from "../summary";
import { AudienceEditor } from "./audience-editor";

export async function AudiencesPage() {
  await requireGlobalPermission("core.audiences.manage");
  const today = todayJst();
  const [audiences, population] = await Promise.all([listAudiences(), loadPopulation(today)]);
  const lookup = await loadMasterLookup(population, today);
  const usages = await Promise.all(audiences.map((a) => listAudienceUsages(a.id)));

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-8 md:py-10">
      <PageHeading
        title="Audience管理"
        description="「誰に見せるか」を、条件で決めて名前を付けて保存します。社員の異動や役職の変更で、対象者は自動的に変わります。"
        aside={
          <Link href="/admin/audiences/new" className={`${BUTTON_PRIMARY} inline-block`}>
            Audience を作成
          </Link>
        }
      />

      <section aria-label="Audience の一覧">
        <p className="text-brand04 mb-2 text-sm">{audiences.length}件</p>
        {audiences.length === 0 ? (
          <p className="border-brand01/15 text-brand04 border-y py-10 text-center text-sm">
            まだ Audience がありません。「全社員」から作成してください。
          </p>
        ) : (
          <ul>
            {audiences.map((a, i) => {
              const desc = describeDefinition(a.definition, lookup);
              const count = a.isActive ? evaluateDefinition(a.definition, population, today).length : 0;
              return (
                <li key={a.id} className="border-brand04/40 border-b py-4 first:border-t">
                  <div className="flex flex-wrap items-start gap-x-6 gap-y-2">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <Link href={`/admin/audiences/${a.id}`} className={`${LINK_CLASS} text-base`}>
                          {a.name}
                        </Link>
                        {!a.isActive ? <StatusTag tone="muted">無効</StatusTag> : null}
                        {desc.hasStaleReference ? <StatusTag tone="attention">無効なマスタを参照</StatusTag> : null}
                      </p>
                      {a.description ? <p className="text-brand04 mt-0.5 text-sm">{a.description}</p> : null}
                      <p className="text-brand01 mt-2 text-sm">
                        {desc.groups.length === 0 ? (
                          <span className="text-brand04">(グループなし: 誰も対象になりません)</span>
                        ) : (
                          desc.groups.map((g, gi) => (
                            <span key={gi} className="block">
                              {gi > 0 ? <span className="text-brand03 mr-1 text-xs font-bold">または</span> : null}
                              {g}
                            </span>
                          ))
                        )}
                      </p>
                      <p className="text-brand04 mt-1 text-xs">
                        利用先: {usages[i].length === 0 ? "なし" : usages[i].map((u) => u.name).join("、")}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-brand04 text-xs">現在の対象</p>
                      <p className="text-brand01">
                        <span className="font-heading text-2xl font-black">{count}</span> 名
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

export async function AudienceNewPage() {
  await requireGlobalPermission("core.audiences.manage");
  const today = todayJst();
  const population = await loadPopulation(today);
  const options = lookupToOptions(await loadMasterLookup(population, today), population);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-8 md:py-10">
      <PageHeading
        title="Audience を作成"
        aside={
          <Link href="/admin/audiences" className={LINK_CLASS}>
            一覧へ戻る
          </Link>
        }
      />
      <AudienceEditor options={options} />
    </div>
  );
}

export async function AudienceEditPage({ id }: { id: string }) {
  await requireGlobalPermission("core.audiences.manage");
  if (!z.uuid().safeParse(id).success) notFound();
  const audience = await getAudience(id);
  if (!audience) notFound();

  const today = todayJst();
  const population = await loadPopulation(today);
  const lookup = await loadMasterLookup(population, today);
  const matched = audience.isActive ? evaluateDefinition(audience.definition, population, today) : [];
  const usages = await listAudienceUsages(id);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-8 md:py-10">
      <PageHeading
        title={audience.name}
        description={`利用先: ${usages.length === 0 ? "なし" : usages.map((u) => u.name).join("、")}`}
        aside={
          <Link href="/admin/audiences" className={LINK_CLASS}>
            一覧へ戻る
          </Link>
        }
      />
      <AudienceEditor
        audience={{
          id: audience.id,
          name: audience.name,
          description: audience.description,
          isActive: audience.isActive,
          definition: audience.definition,
        }}
        options={lookupToOptions(lookup, population)}
        initialPreview={{ ok: true, count: matched.length, shown: matched.slice(0, 100) }}
      />
    </div>
  );
}
