import type { ReactNode } from "react";
import { getPortalContext } from "../queries";
import { PortalFrame } from "./portal-frame";

/** ポータル共通レイアウト。ユーザーとメニューを取得して枠に渡す。 */
export async function PortalShell({ children }: { children: ReactNode }) {
  const { user, navigation } = await getPortalContext();
  return (
    <PortalFrame user={user} navigation={navigation}>
      {children}
    </PortalFrame>
  );
}
