import Link from "next/link";
import { notFound } from "next/navigation";
import { findNavItem } from "../queries";
import { Icon } from "./icons";

/** メニューにあるが未実装のページ用の「準備中」表示。メニューにないパスは 404。 */
export async function ComingSoon({ href }: { href: string }) {
  const item = await findNavItem(href);
  if (!item) notFound();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8 md:py-10">
      <div className="flex items-center gap-3">
        <span className="bg-bg01 text-brand01 flex size-11 items-center justify-center">
          <Icon name={item.icon ?? "file-text"} size={24} />
        </span>
        <h1 className="text-brand01 text-2xl font-bold">{item.label}</h1>
      </div>
      <p className="border-brand01/15 text-brand04 mt-8 border-y py-10 text-center text-sm">
        この画面は準備中です。
      </p>
      <p className="mt-6 text-sm">
        <Link href="/" className="text-brand01 hover:text-brand03 font-bold transition-colors">
          ホームへ戻る
        </Link>
      </p>
    </div>
  );
}
