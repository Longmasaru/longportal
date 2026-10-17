import { notFound, redirect } from "next/navigation";
import { EXTERNAL_APP_CONTRACTS } from "@/modules/apps/external-apps";
import { ExternalAppFrame, resolveExternalAppPage } from "@/modules/core/sso";

// 別プロジェクトのアプリのページ(ポータルの中のアプリは、それぞれの静的なルートが優先される)。
export default async function Page(props: PageProps<"/apps/[appKey]">) {
  const { appKey } = await props.params;
  const page = await resolveExternalAppPage(appKey, EXTERNAL_APP_CONTRACTS);
  if (!page) notFound();
  if (page.mode === "redirect") redirect(page.url);
  return <ExternalAppFrame title={page.title} src={page.src} />;
}
