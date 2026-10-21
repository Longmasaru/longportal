// 組織図の顔写真の入口(/apps/soshikizu/photos/<社員の id>)。LINE WORKS のアイコンを、組織図を見られる人にだけ返す。
// 写真はポータルに保存しない(DB・R2 の変更なし)。社員と LINE WORKS の利用者は、メール → 氏名の順で突き合わせる。
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { requireAppAccess } from "@/modules/core/apps";
import { users } from "@/modules/core/auth/schema";
import { employees } from "@/modules/core/employees/schema";
import {
  fetchLineWorksUserPhoto,
  listLineWorksUsers,
  matchDirectoryUser,
  type LineWorksUser,
} from "@/modules/core/lineworks";
import { isOnRoster } from "./logic";
import { manifest } from "./manifest";

const DIRECTORY_TTL_MS = 60 * 60 * 1000;
const DIRECTORY_RETRY_MS = 5 * 60 * 1000;
let directoryCache: { users: Promise<LineWorksUser[] | null>; expiresAt: number } | null = null;

/**
 * LINE WORKS の利用者の一覧(1 時間使い回す。取れなければ null を 5 分覚える)。
 * 組織図を開くと写真が一度に何十枚も頼まれるので、取りに行く途中のものも共有する。
 */
function directory(): Promise<LineWorksUser[] | null> {
  const now = Date.now();
  if (directoryCache && directoryCache.expiresAt > now) return directoryCache.users;
  const users = listLineWorksUsers().catch((err: unknown) => {
    console.error(`[soshikizu] LINE WORKS の利用者を取れませんでした: ${err instanceof Error ? err.message : "不明"}`);
    directoryCache = { users: Promise.resolve(null), expiresAt: Date.now() + DIRECTORY_RETRY_MS };
    return null;
  });
  directoryCache = { users, expiresAt: now + DIRECTORY_TTL_MS };
  return users;
}

const NOT_FOUND = () =>
  new Response("Not Found", { status: 404, headers: { "Cache-Control": "private, max-age=3600" } });

export async function handlePhotoRequest(id: string): Promise<Response> {
  const actor = await requireAppAccess(manifest.appKey);
  if (!z.uuid().safeParse(id).success) return NOT_FOUND();

  const [e] = await db
    .select({
      familyName: employees.familyName,
      givenName: employees.givenName,
      familyNameKana: employees.familyNameKana,
      givenNameKana: employees.givenNameKana,
      hiredOn: employees.hiredOn,
      leftOn: employees.leftOn,
      status: employees.status,
      email: users.email,
    })
    .from(employees)
    .leftJoin(users, eq(users.employeeId, employees.id))
    .where(eq(employees.id, id))
    .limit(1);
  // 組織図に載っている人(在籍者)の写真だけを返す。
  if (!e || !isOnRoster(e, actor.today)) return NOT_FOUND();

  const list = await directory();
  if (!list) return NOT_FOUND();
  const userId = matchDirectoryUser({ ...e, department: null }, list);
  if (!userId) return NOT_FOUND();
  const photo = await fetchLineWorksUserPhoto(userId);
  if (!photo) return NOT_FOUND();
  return new Response(photo.data, {
    headers: {
      "Content-Type": photo.contentType,
      // 写真はあまり変わらないので、本人のブラウザに 1 日覚えさせる。
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
