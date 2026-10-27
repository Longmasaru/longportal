import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireAppAccess } from "@/modules/core/apps";
import { manifest } from "../manifest";
import { getDraftForEdit } from "../queries";
import { EntryForm, type DraftInitial } from "./entry-form";

/** 登録の画面(/apps/zukan/new)。?draft=<id> で発見待ちの続き(本人のものだけ。ほかは 404)。 */
export async function ZukanNewPage({ draftId }: { draftId: string | null }) {
  const actor = await requireAppAccess(manifest.appKey);
  let draft: DraftInitial | null = null;
  if (draftId) {
    if (!z.uuid().safeParse(draftId).success) notFound();
    const found = await getDraftForEdit(actor, draftId);
    if (!found) notFound();
    const { entry, photos } = found;
    draft = {
      id: entry.id,
      title: entry.title,
      chapter: entry.chapter,
      what: entry.what,
      effect: entry.effect,
      place: entry.place,
      photos,
    };
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 md:px-8 md:py-10">
      <p className="text-sm">
        <Link href={draft ? `${manifest.route}?view=mine` : manifest.route} className="text-brand01 hover:text-brand03 font-bold">
          ← 図鑑に戻る
        </Link>
      </p>
      <header className="flex flex-col gap-2">
        <p className="font-heading text-brand03 text-xs font-bold tracking-[0.2em]">NEW PAGE</p>
        <h1 className="text-brand01 text-2xl font-black">{draft ? "発見待ちの続き" : "図鑑に登録する"}</h1>
        <p className="text-brand01 text-sm">
          写真を撮って、名前と章を選ぶだけで登録できます。アフターがまだなら、ビフォーだけ「発見待ち」で保存できます。
        </p>
      </header>
      <EntryForm draft={draft} />
    </div>
  );
}
