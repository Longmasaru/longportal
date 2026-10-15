import { requireGlobalPermission } from "../../access";
import { listAudiences } from "../../audience";
import { PageHeading, StatusTag } from "../../shared/ui/form";
import { listAppsAdmin } from "../queries";
import { AppForm } from "./app-forms";

/** アプリ管理(登録簿)。誰に見せるか・表示名・並び順などを決める。docs/DESIGN.md 24 章。 */
export async function AdminAppsPage() {
  await requireGlobalPermission("core.apps.manage");
  const [apps, allAudiences] = await Promise.all([listAppsAdmin(), listAudiences()]);
  const audiences = allAudiences.filter((a) => a.isActive).map((a) => ({ id: a.id, name: a.name }));
  const nextSortOrder = apps.reduce((m, a) => Math.max(m, a.sortOrder), 0) + 10;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-8 md:py-10">
      <PageHeading
        title="アプリ管理"
        description="サイドバーの「アプリ」に出すアプリと、表示する相手を決めます。無効のアプリや、表示する相手に当てはまらない人には、見えません(ポータルの中のアプリは、直接開いても入れません)。"
      />

      <section aria-labelledby="app-list">
        <h2 id="app-list" className="text-brand01 border-brand01/20 border-b pb-2 text-lg font-bold">
          登録済みのアプリ({apps.length}件)
        </h2>
        {apps.length === 0 ? (
          <p className="text-brand04 py-8 text-center text-sm">まだアプリが登録されていません。</p>
        ) : (
          <ul>
            {apps.map((a) => {
              // 無効にした Audience を使っているアプリも、選択肢に残す。
              const options =
                a.audienceId && !audiences.some((x) => x.id === a.audienceId)
                  ? [...audiences, { id: a.audienceId, name: `${a.audienceName ?? "削除された Audience"}(無効)` }]
                  : audiences;
              return (
                <li key={a.appKey} className="border-brand04/40 border-b py-4">
                  <p className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-brand01 font-bold">{a.displayName}</span>
                    <StatusTag tone={a.isEnabled ? "info" : "muted"}>{a.isEnabled ? "有効" : "無効"}</StatusTag>
                    <StatusTag tone="neutral">{a.kind === "internal" ? "ポータルの中" : "別プロジェクト"}</StatusTag>
                    {a.kind === "internal" && !a.inManifest ? (
                      <StatusTag tone="attention">コードから削除済み</StatusTag>
                    ) : null}
                    <span className="font-heading text-brand04 text-xs">
                      {a.appKey} ・ {a.kind === "internal" ? a.route : a.url}
                    </span>
                  </p>
                  <AppForm
                    app={{
                      appKey: a.appKey,
                      kind: a.kind,
                      displayName: a.displayName,
                      description: a.description,
                      icon: a.icon,
                      url: a.url,
                      target: a.target,
                      audienceId: a.audienceId,
                      sortOrder: a.sortOrder,
                      isEnabled: a.isEnabled,
                      inManifest: a.inManifest,
                    }}
                    audiences={options}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="app-new" className="border-brand01/20 border bg-white p-5">
        <h2 id="app-new" className="text-brand01 font-bold">
          別プロジェクトのアプリを登録
        </h2>
        <p className="text-brand04 mt-1 mb-3 text-xs">
          ほかの社員が作ったアプリなど、ポータルの外にあるアプリを、URL で登録します。登録した直後は「無効」です。ポータルの中のアプリは、コードに追加すると自動で登録されます。
        </p>
        <AppForm key={apps.length} audiences={audiences} nextSortOrder={nextSortOrder} />
      </section>
    </div>
  );
}
