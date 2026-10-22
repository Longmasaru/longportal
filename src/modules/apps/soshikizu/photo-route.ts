// 組織図の顔写真の入口(/apps/soshikizu/photos/<社員の id>)と、トークの入口(/apps/soshikizu/talk/<社員の id>)。組織図を見られる人だけが使える。
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
import { isOnRoster, lineWorksTalkUrl } from "./logic";
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

/** 組織図に載っている社員(在籍者)の LINE WORKS の利用者。見つからなければ null。 */
async function findLineWorksUser(id: string, today: string): Promise<LineWorksUser | null> {
  if (!z.uuid().safeParse(id).success) return null;
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
  if (!e || !isOnRoster(e, today)) return null;

  const list = await directory();
  if (!list) return null;
  const userId = matchDirectoryUser({ ...e, department: null }, list);
  return list.find((u) => u.userId === userId) ?? null;
}

export async function handlePhotoRequest(id: string): Promise<Response> {
  const actor = await requireAppAccess(manifest.appKey);
  const user = await findLineWorksUser(id, actor.today);
  if (!user) return NOT_FOUND();
  const photo = await fetchLineWorksUserPhoto(user.userId);
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

/**
 * LINE WORKS のトークの入口(/apps/soshikizu/talk/<社員の id>)。その人との 1 対 1 のトークへ転送する。
 * 宛先は LINE WORKS のアカウント(メール)。アカウントの一覧を画面に出さないよう、押されたときにだけ調べる。
 */
export async function handleTalkRequest(id: string): Promise<Response> {
  const actor = await requireAppAccess(manifest.appKey);
  const user = await findLineWorksUser(id, actor.today);
  if (!user?.email) {
    return new Response(
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>組織図</title>' +
        '<p style="font-family:sans-serif;padding:24px">この人の LINE WORKS のアカウントが見つかりませんでした。LINE WORKS のアプリから探してください。</p>',
      { status: 404, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
    );
  }
  return new Response(null, {
    status: 302,
    headers: { Location: lineWorksTalkUrl(user.email), "Cache-Control": "no-store" },
  });
}
