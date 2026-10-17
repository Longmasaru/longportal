// 画面からの呼び出し(google.script.run の代わり)の入口。/apps/haisou/api への POST { fn, args }。
// 毎回: 同じサイトからの呼び出しか → アプリを使えるか(requireAppAccess)→ 引数の形(zod)→ 処理。
import { z } from "zod";
import { requireAppAccess } from "@/modules/core/apps";
import { manifest } from "./manifest";
import * as svc from "./service";

const Str = (maxLen: number) => z.string().max(maxLen);
const Short = Str(500);

const StopSchema = z.object({
  row: z.number().int(),
  name: Str(200),
  person: Short.default(""),
  address: Short.default(""),
  tel: Str(100).default(""),
  kind: z.string().max(5).optional(),
  latlng: Str(100).default(""),
  yoken: Str(100).default("納品"),
  detail: Str(2000).default(""),
  stay: z.number().int().min(0).max(24 * 60),
  wait: z.number().int().min(0).max(24 * 60).default(0),
});

const CalcSchema = z.object({
  date: Str(20).default(""),
  startTime: z.string().regex(/^\d{1,2}:\d{2}$/, "出発時刻が正しくありません"),
  shift: Str(10).default(""),
  driver: Str(100).default(""),
  driverEmail: Str(320).default(""),
  optimize: z.boolean().optional(),
  avoidHighways: z.boolean().optional(),
  stops: z.array(StopSchema).max(25, "1つの便の配達先は25件までです"),
});

const ScheduleSchema = z.object({
  no: z.number().int(),
  row: z.number().int(),
  latlng: Str(100).default(""),
  name: Str(200),
  person: Short.default(""),
  address: Short.default(""),
  tel: Str(100).default(""),
  yoken: Str(100).default(""),
  detail: Str(2000).default(""),
  stay: z.number().int(),
  wait: z.number().int().min(0).max(24 * 60).default(0),
  travelMin: z.number(),
  travelKm: z.number().nullable(),
  arrive: Str(10),
  depart: Str(10),
  breaksCrossed: z.array(Str(100)).default([]),
});

const ResultSchema = z.object({
  date: Str(50),
  dateRaw: Str(20).default(""),
  shift: Str(10).default(""),
  driver: Str(100).default(""),
  driverEmail: Str(320).default(""),
  startTime: Str(10),
  backTime: Str(10),
  avoidHighways: z.boolean().default(false),
  lastLegMin: z.number(),
  lastLegKm: z.number().nullable(),
  totalMin: z.number(),
  totalKm: z.number().nullable(),
  optimized: z.boolean(),
  reason: Str(5000).default(""),
  schedule: z.array(ScheduleSchema).max(100),
  links: z.array(z.object({ label: Str(100), url: Str(5000) })).max(20),
});

const DefaultsEntry = z.object({
  row: z.number().optional(),
  name: Str(200).optional(),
  yoken: Str(100).default(""),
  detail: Str(2000).default(""),
  stay: z.number().int().min(0).default(0),
});

const ClientSchema = z.object({
  name: Short.default(""),
  kana: Short.default(""),
  person: Short.default(""),
  address: Short.default(""),
  tel: Str(100).default(""),
  kind: Str(5).default("1"),
  stay: Str(10).default(""),
  lat: Str(30).default(""),
  lng: Str(30).default(""),
  allowDuplicate: z.boolean().optional(),
});

const DriverSchema = z.object({ name: Str(100).default(""), email: Str(320).default("") });
const Id = z.uuid("不正なリクエストです。");
const Month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "月の指定が正しくありません");

type Ctx = { userId: string; today: string };
type Handler = (args: unknown[], ctx: Ctx) => Promise<unknown>;

/** 引数の並び(タプル)を検証してから呼ぶ。 */
function fn<T extends [z.ZodType, ...z.ZodType[]] | []>(
  schemas: T,
  run: (args: { [K in keyof T]: T[K] extends z.ZodType ? z.output<T[K]> : never }, ctx: Ctx) => Promise<unknown>,
): Handler {
  return (args, ctx) => {
    const parsed = z.tuple(schemas as unknown as [z.ZodType, ...z.ZodType[]]).parse(args.slice(0, schemas.length));
    return run(parsed as never, ctx);
  };
}

const HANDLERS: Record<string, Handler> = {
  // ルート作成(dialog.html)
  getClients: fn([], () => svc.getClients()),
  getDrivers: fn([], () => svc.getDrivers()),
  getCompanyDefaults: fn([], (_, ctx) => svc.getCompanyDefaults(ctx.userId)),
  saveCompanyDefaults: fn([z.array(DefaultsEntry).max(100)], ([entries], ctx) =>
    svc.saveCompanyDefaults(ctx.userId, entries),
  ),
  getHistoryDetailsByCompany: fn([], () => svc.getHistoryDetailsByCompany()),
  calcRoute: fn([CalcSchema], ([payload], ctx) => svc.calcRoute(payload, ctx.today)),
  reschedule: fn([ResultSchema], async ([result]) => svc.reschedule(result)),
  saveHistory: fn([ResultSchema], ([result], ctx) => svc.saveHistory(result, ctx.userId)),
  listRouteStates: fn([], () => svc.listRouteStates()),
  saveRouteState: fn([Str(200), z.record(z.string(), z.unknown())], ([name, payload], ctx) =>
    svc.saveRouteState(name, payload, ctx.userId),
  ),
  loadRouteState: fn([Str(200)], ([name]) => svc.loadRouteState(name)),
  deleteRouteState: fn([Str(200)], ([name]) => svc.deleteRouteState(name)),

  // 取引先の管理(clients.html)
  cmListClients: fn([], () => svc.cmListClients()),
  cmAddClient: fn([ClientSchema], ([c], ctx) => svc.cmAddClient(c, ctx.userId)),
  cmUpdateClient: fn([z.number().int(), Short, ClientSchema], ([row, name, c], ctx) =>
    svc.cmUpdateClient(row, name, c, ctx.userId),
  ),
  cmDeleteClient: fn([z.number().int(), Short], ([row, name], ctx) => svc.cmDeleteClient(row, name, ctx.userId)),
  cmGeocode: fn([Short], ([address]) => svc.cmGeocode(address)),

  // 配達者の管理
  dmListDrivers: fn([], () => svc.dmListDrivers()),
  dmAddDriver: fn([DriverSchema], ([d]) => svc.dmAddDriver(d)),
  dmUpdateDriver: fn([Id, DriverSchema], ([id, d]) => svc.dmUpdateDriver(id, d)),
  dmDeleteDriver: fn([Id], ([id]) => svc.dmDeleteDriver(id)),
  dmMoveDriver: fn([Id, z.union([z.literal(-1), z.literal(1)])], ([id, dir]) => svc.dmMoveDriver(id, dir)),

  // 配達履歴
  hList: fn([Month, Str(100)], ([month, driver]) => svc.listHistory(month, driver)),
  hDrivers: fn([], () => svc.listHistoryDrivers()),
  hSetActual: fn([Id, Str(50)], ([id, value]) => svc.setHistoryActual(id, value.trim())),
  hDeleteBatch: fn([Id], ([batchId]) => svc.deleteHistoryBatch(batchId)),
};

const RequestSchema = z.object({ fn: z.string().max(50), args: z.array(z.unknown()).max(10).default([]) });

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** 同じサイトの画面からの呼び出しか(よそのサイトから、ログイン中の人に代わって操作させない)。 */
function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") === "same-origin";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function handleRpc(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return json({ ok: false, message: "不正なリクエストです。" }, 403);
  const actor = await requireAppAccess(manifest.appKey);
  const body = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return json({ ok: false, message: "不正なリクエストです。" }, 400);
  const handler = Object.hasOwn(HANDLERS, body.data.fn) ? HANDLERS[body.data.fn] : undefined;
  if (!handler) return json({ ok: false, message: "不正なリクエストです。" }, 400);
  try {
    const value = await handler(body.data.args, { userId: actor.userId, today: actor.today });
    return json({ ok: true, value: value ?? null });
  } catch (e) {
    if (e instanceof svc.UserError) return json({ ok: false, message: e.message });
    if (e instanceof z.ZodError) {
      return json({ ok: false, message: e.issues[0]?.message ?? "入力の形が正しくありません。" });
    }
    console.error(`[haisou] ${body.data.fn} に失敗しました`, e);
    return json({ ok: false, message: "処理できませんでした。時間をおいてもう一度お試しください。" });
  }
}
