import { requireGlobalPermission } from "../../access";
import { listAudiences } from "../../audience";
import { PageHeading, StatusTag } from "../../shared/ui/form";
import { listLinksAdmin } from "../queries";
import { LinkForm } from "./link-forms";

/** 社内リンク管理。サイドバーの「社内リンク」に出すリンクを登録する(別タブで開く)。 */
export async function AdminLinksPage() {
  await requireGlobalPermission("core.links.manage");
  const [links, allAudiences] = await Promise.all([listLinksAdmin(), listAudiences()]);
  const audiences = allAudiences.filter((a) => a.isActive).map((a) => ({ id: a.id, name: a.name }));
  const nextSortOrder = links.reduce((m, l) => Math.max(m, l.sortOrder), 0) + 10;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-8 md:py-10">
      <PageHeading
        title="社内リンク管理"
        description="サイドバーの「社内リンク」に出すリンクです(別タブで開きます)。全社、または Audience に当てはまる社員にだけ表示します。"
      />

      <section aria-labelledby="link-new" className="border-brand01/20 border bg-white p-5">
        <h2 id="link-new" className="text-brand01 mb-3 font-bold">
          社内リンクを追加
        </h2>
        <LinkForm key={links.length} audiences={audiences} nextSortOrder={nextSortOrder} />
      </section>

      <section aria-labelledby="link-list">
        <h2 id="link-list" className="text-brand01 border-brand01/20 border-b pb-2 text-lg font-bold">
          登録済みの社内リンク({links.length}件)
        </h2>
        {links.length === 0 ? (
          <p className="text-brand04 py-8 text-center text-sm">まだ社内リンクがありません。</p>
        ) : (
          <ul>
            {links.map((l) => {
              // 無効にした Audience を使っているリンクも、編集画面の選択肢に残す。
              const options =
                l.audienceId && !audiences.some((a) => a.id === l.audienceId)
                  ? [...audiences, { id: l.audienceId, name: `${l.audienceName ?? "削除された Audience"}(無効)` }]
                  : audiences;
              return (
                <li key={l.id} className="border-brand04/40 border-b py-4">
                  <p className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-brand01 font-bold">{l.title}</span>
                    {!l.isActive ? <StatusTag tone="muted">無効</StatusTag> : null}
                    <span className="text-brand04 text-xs">
                      {l.target === "company" ? "全社" : `Audience: ${l.audienceName ?? "(削除済み)"}`}
                    </span>
                  </p>
                  <LinkForm
                    link={{
                      id: l.id,
                      title: l.title,
                      url: l.url,
                      description: l.description,
                      target: l.target,
                      audienceId: l.audienceId,
                      sortOrder: l.sortOrder,
                      isActive: l.isActive,
                    }}
                    audiences={options}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
