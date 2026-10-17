// LINE WORKS の Bot の準備(docs/DESIGN.md 33 章): Bot が入ったトークルームを作り、試しに 1 通送って、channelId を表示する。
//
// 1) 名指しで 1 つ作る:
//    npm run lineworks:setup -- --members <LINE WORKS の ID をカンマ区切り> --title <トークルームの名前>
// 2) 設計図(JSON)から、社員名簿と LINE WORKS の名前を突き合わせてまとめて作る(既定は確認だけ。--apply で作る):
//    npm run lineworks:setup -- --rooms <JSON のパス> [--apply]
//    JSON: { "rooms": [ { "key": "stud", "title": "教科書 スタッド", "members": ["稲荷", "上田"] },
//                       { "key": "ブレーキ部", "title": "…", "departments": ["ブレーキ部"] },
//                       { "key": "*", "title": "…", "all": true } ] }
//    key は送り先の名前(教科書の slug か部署名。"*" は全体用)。氏名が入るので、JSON はリポジトリの外に置く。
//    最後に、Vercel に登録する KYOKASHO_LINEWORKS_CHANNELS / KYOKASHO_LINEWORKS_CHANNEL_ID の値を表示する。
//
// 鍵は .env.local の LINEWORKS_*。秘密鍵は、ダウンロードしたファイルの場所を LINEWORKS_PRIVATE_KEY_FILE に書いてもよい。
// 名簿は .env.local の DB(読むだけ)。LINE WORKS の利用者の一覧には、アプリの OAuth Scopes に user.read が要る。
import { readFileSync } from "node:fs";
import { and, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { db, pool } from "../src/db/client";
import { departments } from "../src/modules/core/departments/schema";
import { employeeAssignments, employees } from "../src/modules/core/employees/schema";
import { createLineWorksChannel, lineWorksConfig, listLineWorksUsers, sendLineWorksChannelText } from "../src/modules/core/lineworks";
import { resolveRoom, type RoomSpec, type RosterEmployee } from "../src/modules/core/lineworks/match";
import { todayJst } from "../src/modules/core/shared/jst";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function loadRoster(): Promise<RosterEmployee[]> {
  const today = todayJst();
  return db
    .select({ familyName: employees.familyName, givenName: employees.givenName, department: departments.name })
    .from(employees)
    .leftJoin(
      employeeAssignments,
      and(
        eq(employeeAssignments.employeeId, employees.id),
        eq(employeeAssignments.isPrimary, true),
        lte(employeeAssignments.startDate, today),
        or(isNull(employeeAssignments.endDate), gte(employeeAssignments.endDate, today)),
      ),
    )
    .leftJoin(departments, eq(departments.id, employeeAssignments.departmentId))
    .where(inArray(employees.status, ["active", "leave"]));
}

async function setupRooms(path: string, apply: boolean): Promise<void> {
  const { rooms } = JSON.parse(readFileSync(path, "utf8")) as { rooms: RoomSpec[] };
  const [roster, directory] = await Promise.all([loadRoster(), listLineWorksUsers()]);
  console.log(`[lineworks] 名簿 ${roster.length} 人、LINE WORKS ${directory.length} 人`);

  const resolved = rooms.map((spec) => ({ spec, ...resolveRoom(spec, roster, directory) }));
  let blocked = false;
  for (const r of resolved) {
    console.log(`\n■ ${r.spec.title}(${r.spec.key}): ${r.memberIds.length} 人`);
    if (r.notInLineWorks.length) console.log(`  LINE WORKS に見つからない: ${r.notInLineWorks.join("、")}`);
    for (const p of r.problems) console.log(`  ✗ ${p}`);
    if (r.problems.length || r.memberIds.length === 0) blocked = true;
  }
  if (blocked) throw new Error("✗ の問題を直してから、もう一度実行してください。");
  if (!apply) {
    console.log("\n(確認だけ。作るときは --apply を付けてください)");
    return;
  }

  const channels: Record<string, string> = {};
  let fallback = "";
  for (const r of resolved) {
    const channelId = await createLineWorksChannel(r.memberIds, r.spec.title);
    const sent = await sendLineWorksChannelText(channelId, `LONG PORTAL から「${r.spec.title}」に知らせを送れるようになりました。`);
    console.log(`[lineworks] 作りました: ${r.spec.title}(試しの送信: ${sent ? "OK" : "失敗"})`);
    if (r.spec.key === "*") fallback = channelId;
    else channels[r.spec.key] = channelId;
  }
  console.log(`\nKYOKASHO_LINEWORKS_CHANNELS=${JSON.stringify(channels)}`);
  if (fallback) console.log(`KYOKASHO_LINEWORKS_CHANNEL_ID=${fallback}`);
}

async function main(): Promise<void> {
  const keyFile = process.env.LINEWORKS_PRIVATE_KEY_FILE?.trim();
  if (!process.env.LINEWORKS_PRIVATE_KEY && keyFile) process.env.LINEWORKS_PRIVATE_KEY = readFileSync(keyFile, "utf8");
  if (!lineWorksConfig()) {
    throw new Error("LINEWORKS_CLIENT_ID / CLIENT_SECRET / SERVICE_ACCOUNT / PRIVATE_KEY(_FILE) / BOT_ID を .env.local に入れてください。");
  }
  const roomsPath = arg("rooms");
  if (roomsPath) return setupRooms(roomsPath, process.argv.includes("--apply"));

  const members = (arg("members") ?? "").split(",").map((m) => m.trim()).filter(Boolean);
  const title = arg("title") ?? "LONG PORTAL の知らせ";
  if (members.length === 0) throw new Error("--rooms か --members を指定してください。");
  const channelId = await createLineWorksChannel(members, title);
  const sent = await sendLineWorksChannelText(channelId, `LONG PORTAL から「${title}」に知らせを送れるようになりました。`);
  console.log(`[lineworks] トークルームを作りました: channelId=${channelId}(試しの送信: ${sent ? "OK" : "失敗"})`);
}

main()
  .catch((err) => {
    console.error(`[lineworks] ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
