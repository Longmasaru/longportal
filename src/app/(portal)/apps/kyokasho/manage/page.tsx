import { ManagePage } from "@/modules/apps/kyokasho";

// 「今すぐ取り込む」(Server Action)は、大きな教科書だと時間がかかるため長めにする。
export const maxDuration = 300;

export default function Page() {
  return <ManagePage />;
}
