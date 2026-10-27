import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { FormNotice, LINK_CLASS, PageHeading } from "@/modules/core/shared/ui/form";
import { managerOrNull } from "../guard";
import { getNakamaMember } from "../queries";
import { MemberForm, RemoveMemberForm } from "./member-forms";

/** 名簿の 1 人の編集(権限 nakama.members.manage、全社)。 */
export async function NakamaMemberEditPage({ employeeId, added }: { employeeId: string; added: boolean }) {
  const actor = await managerOrNull();
  if (!actor || !z.uuid().safeParse(employeeId).success) notFound();
  const member = await getNakamaMember(employeeId);
  if (!member) notFound();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 md:px-8 md:py-10">
      <PageHeading
        title={`${member.name} さん`}
        description={`社員番号 ${member.employeeNumber}${member.nameKana ? `・${member.nameKana}` : ""}`}
        aside={
          <Link href="/apps/nakama/manage" className={LINK_CLASS}>
            一覧に戻る
          </Link>
        }
      />
      {added ? <FormNotice tone="success">名簿に足しました。呼び名や日本に来た日を入れてください。</FormNotice> : null}
      <MemberForm member={member} today={actor.today} />
      <div className="border-brand01/15 border-t pt-6">
        <RemoveMemberForm employeeId={member.employeeId} name={member.name} />
      </div>
    </div>
  );
}
