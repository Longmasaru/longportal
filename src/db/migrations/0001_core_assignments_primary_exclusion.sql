-- 手書き SQL(Drizzle のスキーマ定義では EXCLUDE 制約を表現できないため)。docs/DESIGN.md 4.3 参照。
--
-- 主所属(is_primary = true)同士の期間重複を禁止する。副所属(is_primary = false)は重複可能。
-- WHERE (is_primary) は、将来副所属・兼務を許可しても維持する。
-- uuid の employee_id を「=」で GiST 排他制約に使うため btree_gist が必要。
-- end_date IS NULL(期限なし)は上限なしの区間として扱われる。end_date は最終日を含む('[]')。
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;--> statement-breakpoint
ALTER TABLE "core"."employee_assignments"
  ADD CONSTRAINT "employee_assignments_no_overlap_primary"
  EXCLUDE USING gist (
    "employee_id" WITH =,
    daterange("start_date", "end_date", '[]') WITH &&
  ) WHERE ("is_primary");
