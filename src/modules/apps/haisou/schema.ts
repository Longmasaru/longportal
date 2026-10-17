import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgSchema,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "@/modules/core/auth/schema";

// 配送ルートアプリのテーブル(docs/DESIGN.md 29 章)。元は Google スプレッドシート「取引先一覧表」の各シート。
// データは会社で共有するもの(アプリを使える人は全員が見て、編集できる)。前回の入力内容だけは本人のもの。
export const haisou = pgSchema("haisou");

const idColumn = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/** 取引先(元: 取引先一覧シート)。削除は deleted_at を入れる(過去のルート表・履歴は会社名で持つので影響しない)。 */
export const haisouClients = haisou.table(
  "clients",
  {
    id: idColumn(),
    /** 画面の「No.」。元のシートの行番号を引き継ぐ。新しい取引先は最大値 + 1。保存ルートの照合にも使う。 */
    rowNo: integer("row_no").notNull(),
    name: text("name").notNull(),
    kana: text("kana").notNull().default(""),
    person: text("person").notNull().default(""),
    address: text("address").notNull().default(""),
    tel: text("tel").notNull().default(""),
    /** 1 = 受注先、2 = 外注先 */
    kind: smallint("kind").notNull().default(1),
    /** 滞在時間(分)。NULL は既定(10 分)。 */
    stayMin: integer("stay_min"),
    /** 位置の補正(住所より優先)。 */
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("clients_row_no_key").on(t.rowNo),
    check("clients_kind_check", sql`${t.kind} in (1, 2)`),
    check("clients_stay_check", sql`${t.stayMin} is null or ${t.stayMin} >= 0`),
    check("clients_latlng_check", sql`(${t.lat} is null) = (${t.lng} is null)`),
  ],
);

/** 配達者(元: 配達者リストシート)。 */
export const haisouDrivers = haisou.table("drivers", {
  id: idColumn(),
  name: text("name").notNull(),
  email: text("email").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** 配達の履歴(元: 配達ルート履歴シート)。1 訪問 1 行。列は元のシートと同じ。 */
export const haisouHistory = haisou.table(
  "history",
  {
    id: idColumn(),
    /** 保存した順(元のシートの行の順)。 */
    lineNo: bigint("line_no", { mode: "number" }).generatedAlwaysAsIdentity(),
    /** 同じ「履歴に保存」で入った行(1 つの便)をまとめる。 */
    batchId: uuid("batch_id").notNull(),
    /** 配達日(JST の暦日)。表示用の dateLabel から読めなかったときは NULL。 */
    deliveryDate: date("delivery_date", { mode: "string" }),
    /** A: 日付(例: 2026年9月8日(火)) */
    dateLabel: text("date_label").notNull(),
    shift: text("shift").notNull().default(""),
    driver: text("driver").notNull().default(""),
    startTime: text("start_time").notNull().default(""),
    backTime: text("back_time").notNull().default(""),
    seq: integer("seq").notNull(),
    name: text("name").notNull(),
    person: text("person").notNull().default(""),
    address: text("address").notNull().default(""),
    tel: text("tel").notNull().default(""),
    yoken: text("yoken").notNull().default(""),
    detail: text("detail").notNull().default(""),
    arrive: text("arrive").notNull().default(""),
    depart: text("depart").notNull().default(""),
    stay: integer("stay"),
    /** 便の先頭の行だけに入る。 */
    totalKm: doublePrecision("total_km"),
    totalMin: integer("total_min"),
    /** R: 実時間(手入力) */
    actualTime: text("actual_time").notNull().default(""),
    /** S: マップの URL(便の先頭の行だけ)。 */
    mapUrl: text("map_url").notNull().default(""),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("history_delivery_date_idx").on(t.deliveryDate),
    index("history_batch_id_idx").on(t.batchId),
    index("history_name_idx").on(t.name),
  ],
);

/** 保存したルート表(元: 保存ルートシート)。data は画面の状態をそのまま持つ JSON。 */
export const haisouSavedRoutes = haisou.table(
  "saved_routes",
  {
    id: idColumn(),
    name: text("name").notNull(),
    savedAt: timestamp("saved_at", { withTimezone: true }).notNull().defaultNow(),
    /** 配達日(画面の入力値のまま。例: 2026-09-16) */
    deliveryDate: text("delivery_date").notNull().default(""),
    driver: text("driver").notNull().default(""),
    amCount: integer("am_count").notNull().default(0),
    pmCount: integer("pm_count").notNull().default(0),
    data: jsonb("data").notNull(),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("saved_routes_name_key").on(t.name)],
);

/** 会社ごとの前回の入力内容(要件・詳細・滞在)。元は Apps Script のユーザープロパティ(本人ごと)。 */
export const haisouCompanyDefaults = haisou.table(
  "company_defaults",
  {
    id: idColumn(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    companyName: text("company_name").notNull(),
    yoken: text("yoken").notNull().default(""),
    detail: text("detail").notNull().default(""),
    stay: integer("stay"),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("company_defaults_user_company_key").on(t.userId, t.companyName)],
);

/** 住所 → 位置の結果の控え(Google の呼び出しを減らす)。 */
export const haisouGeocodeCache = haisou.table(
  "geocode_cache",
  {
    id: idColumn(),
    address: text("address").notNull(),
    latlng: text("latlng").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("geocode_cache_address_key").on(t.address)],
);
