import { sql } from "drizzle-orm";
import { boolean, check, index, integer, text, uuid } from "drizzle-orm/pg-core";
import { audiences } from "../audience/schema";
import { core, timestamps } from "../shared/schema-helpers";
import type { AppIcon, AppKind, AppTarget } from "./constants";

/**
 * アプリの登録簿(ポータル上の運用設定)。docs/DESIGN.md 8 章・24 章。
 * 主キーは app_key(永続 ID)。internal は manifest の sync で、external は管理画面で登録する。
 */
export const appRegistry = core.table(
  "app_registry",
  {
    appKey: text("app_key").primaryKey(),
    kind: text("kind").$type<AppKind>().notNull(),
    displayName: text("display_name").notNull(),
    description: text("description").notNull().default(""),
    icon: text("icon").$type<AppIcon>().notNull().default("grid"),
    /** external だけ。別タブで開く URL。 */
    url: text("url"),
    /** internal だけ。ポータル内のパス(manifest から)。 */
    route: text("route"),
    target: text("target").$type<AppTarget>().notNull().default("company"),
    /** target = audience のときだけ使う(必須)。 */
    audienceId: uuid("audience_id").references(() => audiences.id, { onDelete: "restrict" }),
    sortOrder: integer("sort_order").notNull().default(0),
    /** 初期値は false(誰にも見えない)。管理画面で有効にする。 */
    isEnabled: boolean("is_enabled").notNull().default(false),
    /** internal で、コードの manifest にまだあるか(消えたら false にして警告する)。 */
    inManifest: boolean("in_manifest").notNull().default(true),
    ...timestamps(),
  },
  (t) => [
    check("app_registry_app_key_check", sql`${t.appKey} ~ '^[a-z][a-z0-9_-]{1,39}$'`),
    check("app_registry_kind_check", sql`${t.kind} in ('internal', 'external')`),
    check("app_registry_target_check", sql`${t.target} in ('company', 'audience')`),
    check("app_registry_audience_check", sql`(${t.target} = 'audience') = (${t.audienceId} is not null)`),
    check(
      "app_registry_location_check",
      sql`(${t.kind} = 'external' and ${t.url} ~ '^https?://' and ${t.route} is null) or (${t.kind} = 'internal' and ${t.route} like '/%' and ${t.url} is null)`,
    ),
    index("app_registry_audience_id_idx").on(t.audienceId),
  ],
);

export type AppRegistryRow = typeof appRegistry.$inferSelect;
