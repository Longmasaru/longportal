import { eq } from "drizzle-orm";
import type { db } from "@/db/client";
import type { AppManifest } from "./constants";
import { appRegistry } from "./schema";

// manifest(コード)→ app_registry(DB)の同期。docs/DESIGN.md 8 章・24 章。
// - 初回は INSERT(is_enabled = false = 誰にも見えない)。
// - 2 回目以降は route だけを更新し、管理画面の運用設定(表示名・Audience・表示順など)は上書きしない。
// - manifest から消えた internal のアプリは、無効にして in_manifest = false にする(削除しない)。

type Executor = Pick<typeof db, "select" | "insert" | "update">;

export type AppSyncReport = { added: string[]; updated: string[]; missing: string[]; conflicts: string[] };

export async function syncAppRegistry(tx: Executor, manifests: readonly AppManifest[]): Promise<AppSyncReport> {
  const existing = await tx.select().from(appRegistry);
  const byKey = new Map(existing.map((r) => [r.appKey, r]));
  const report: AppSyncReport = { added: [], updated: [], missing: [], conflicts: [] };

  for (const m of manifests) {
    const current = byKey.get(m.appKey);
    if (!current) {
      await tx.insert(appRegistry).values({
        appKey: m.appKey,
        kind: "internal",
        displayName: m.displayName,
        description: m.description,
        icon: m.icon,
        route: m.route,
        isEnabled: false,
        inManifest: true,
      });
      report.added.push(m.appKey);
    } else if (current.kind !== "internal") {
      // 管理画面で登録した外部アプリと、同じ app_key を使っている。上書きしない。
      report.conflicts.push(m.appKey);
    } else if (current.route !== m.route || !current.inManifest) {
      await tx
        .update(appRegistry)
        .set({ route: m.route, inManifest: true })
        .where(eq(appRegistry.appKey, m.appKey));
      report.updated.push(m.appKey);
    }
  }

  const keys = new Set(manifests.map((m) => m.appKey));
  for (const r of existing) {
    if (r.kind === "internal" && r.inManifest && !keys.has(r.appKey)) {
      await tx
        .update(appRegistry)
        .set({ isEnabled: false, inManifest: false })
        .where(eq(appRegistry.appKey, r.appKey));
      report.missing.push(r.appKey);
    }
  }
  return report;
}
