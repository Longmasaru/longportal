import Link from "next/link";
import { requireGlobalPermission } from "../../access";
import { PageHeading } from "../../shared/ui/form";
import { MASTER_DESCRIPTION, MASTER_KEYS, MASTER_LABEL, type MasterKey } from "../config";
import { listMasters } from "../repo";
import { MasterCreateForm } from "./master-create-form";
import { MasterRowItem } from "./master-row";

/** 組織管理(部署・拠点・役職・雇用区分)。管理者のみ。 */
export async function MasterPage({ masterKey }: { masterKey: MasterKey }) {
  await requireGlobalPermission("core.organization.manage");
  const rows = await listMasters(masterKey);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-8 md:py-10">
      <PageHeading title="組織管理" description={MASTER_DESCRIPTION[masterKey]} />

      <nav aria-label="マスタの種類" className="border-brand01/20 flex flex-wrap gap-x-1 border-b">
        {MASTER_KEYS.map((key) => {
          const active = key === masterKey;
          return (
            <Link
              key={key}
              href={`/admin/organization/${key}`}
              aria-current={active ? "page" : undefined}
              className={`-mb-px border-b-2 px-4 py-2 text-sm transition-colors ${
                active
                  ? "border-brand03 text-brand01 font-bold"
                  : "text-brand04 hover:text-brand03 border-transparent font-medium"
              }`}
            >
              {MASTER_LABEL[key]}
            </Link>
          );
        })}
      </nav>

      <MasterCreateForm key={masterKey} masterKey={masterKey} />

      <section aria-label={`${MASTER_LABEL[masterKey]}の一覧`}>
        <p className="text-brand04 mb-2 text-sm">{rows.length}件</p>
        {rows.length === 0 ? (
          <p className="border-brand01/15 text-brand04 border-y py-8 text-center text-sm">
            まだ登録がありません。上のフォームから追加してください。
          </p>
        ) : (
          <ul>
            {rows.map((row) => (
              <MasterRowItem key={row.id} masterKey={masterKey} row={row} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
