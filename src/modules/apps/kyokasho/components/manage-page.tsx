import Link from "next/link";
import { requireGlobalPermission } from "@/modules/core/access";
import { requireAppAccess } from "@/modules/core/apps";
import { LINK_CLASS, PageHeading } from "@/modules/core/shared/ui/form";
import { googleDocId } from "../logic";
import { MANAGE_PERMISSION, manifest } from "../manifest";
import { listBooksAdmin } from "../queries";
import { BookForm } from "./book-form";
import { SyncButton } from "./sync-button";

const dateTime = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  dateStyle: "medium",
  timeStyle: "short",
});

/**
 * 教科書の管理(公開・見られる人・表示)。kyokasho.books.manage(全社)が必要。
 * 中身は、元の Google ドキュメントから毎日自動で取り込む(「今すぐ取り込む」もできる)。新しい教科書はコマンドで取り込む。
 */
export async function ManagePage() {
  await requireAppAccess(manifest.appKey);
  await requireGlobalPermission(MANAGE_PERMISSION);
  const { books, audiences } = await listBooksAdmin();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8 md:px-8 md:py-10">
      <PageHeading
        title="教科書の管理"
        description="教科書ごとに、公開するか・見られる人・一覧での表示を決めます。中身は、元の Google ドキュメントが変わっていれば、毎朝 3 時ごろに自動で取り込み直します(ここの設定とツッコミはそのまま残ります)。"
        aside={
          <Link href="/apps/kyokasho" className={LINK_CLASS}>
            ‹ 教科書の一覧へ
          </Link>
        }
      />

      {books.length === 0 ? (
        <p className="text-brand04 bg-white p-6 text-sm">
          まだ教科書がありません。Google ドキュメントを Word 形式でダウンロードし、取り込みのコマンドで入れてください。
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {books.map((book) => (
            <li key={book.id} className="border-brand01/15 flex flex-col gap-4 border bg-white p-4 md:p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link href={`/apps/kyokasho/${book.slug}`} className={LINK_CLASS}>
                  {book.department} {book.title} ›
                </Link>
                <p className="text-brand04 text-xs">
                  {book.slug} ・ 全 {book.chapterCount} 章 ・ 取り込み {dateTime.format(book.importedAt)}
                </p>
              </div>
              <div className="bg-bg01 flex flex-col gap-2 p-3 text-sm">
                {googleDocId(book.sourceUrl) ? (
                  <>
                    <p className="text-brand04 text-xs">
                      元の Google ドキュメントと毎日同期しています。直してすぐに載せたいときは、次のボタンで取り込めます。
                    </p>
                    <SyncButton bookId={book.id} />
                  </>
                ) : (
                  <p className="text-brand04 text-xs">
                    下の「元の Google ドキュメントの URL」を入れて保存すると、毎日自動で取り込むようになります。
                  </p>
                )}
              </div>
              <BookForm book={book} audiences={audiences} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
