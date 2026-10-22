import Link from "next/link";
import type { ReactNode } from "react";
import { getPortalContext } from "../queries";
import { PortalFrame } from "./portal-frame";

/**
 * ポータル共通レイアウト。ユーザーとメニューを取得して枠に渡す。
 * appBadges はサイドバーのアプリの横に出す数(アプリ側が数える。core は apps を参照できないので src/app から渡す)。
 */
export async function PortalShell({ children, appBadges }: { children: ReactNode; appBadges?: Record<string, number> }) {
  const { user, navigation } = await getPortalContext(appBadges);
  return (
    <PortalFrame user={user} navigation={navigation}>
      {user.emailStatus !== "verified" ? <EmailNotice status={user.emailStatus} /> : null}
      {children}
    </PortalFrame>
  );
}

/** メールアドレスが未登録・未確認のときの案内(パスワードを忘れたときに困らないように)。docs/DESIGN.md 26 章。 */
function EmailNotice({ status }: { status: "none" | "unverified" }) {
  return (
    <div role="status" className="bg-brand03/10 border-brand03 border-b px-4 py-2.5 text-sm md:px-8">
      <p className="text-brand01 mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          {status === "none"
            ? "メールアドレスが登録されていません。パスワードを忘れたときのために、登録してください。"
            : "メールアドレスの確認がまだです。届いたメールのリンクを開いてください。"}
        </span>
        <Link href="/password" className="hover:text-brand03 font-bold underline transition-colors">
          {status === "none" ? "登録する" : "確認メールを送り直す・変更する"}
        </Link>
      </p>
    </div>
  );
}
