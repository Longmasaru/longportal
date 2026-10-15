import { sql } from "drizzle-orm";
import { boolean, check, index, integer, text, uuid } from "drizzle-orm/pg-core";
import { audiences } from "../audience/schema";
import { core, idColumn, timestamps } from "../shared/schema-helpers";

// 社内リンク(docs/DESIGN.md 23 章)。サイドバーに出し、別タブで開く。

export const LINK_TARGETS = ["company", "audience"] as const;
export type LinkTarget = (typeof LINK_TARGETS)[number];

export const portalLinks = core.table(
  "portal_links",
  {
    id: idColumn(),
    title: text("title").notNull(),
    /** https:// または http:// で始まる URL(アプリ側で検証し、CHECK 制約でも担保)。 */
    url: text("url").notNull(),
    description: text("description").notNull().default(""),
    target: text("target").$type<LinkTarget>().notNull().default("company"),
    /** target = audience のときだけ使う(必須)。 */
    audienceId: uuid("audience_id").references(() => audiences.id, { onDelete: "restrict" }),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps(),
  },
  (t) => [
    check("portal_links_target_check", sql`${t.target} in ('company', 'audience')`),
    check("portal_links_audience_check", sql`(${t.target} = 'audience') = (${t.audienceId} is not null)`),
    check("portal_links_url_check", sql`${t.url} ~ '^https?://'`),
    index("portal_links_audience_id_idx").on(t.audienceId),
  ],
);

export type PortalLink = typeof portalLinks.$inferSelect;
