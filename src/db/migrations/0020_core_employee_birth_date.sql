ALTER TABLE "core"."employees" ADD COLUMN "birth_date" date;--> statement-breakpoint
-- 人事管理(hr.profiles)に入力済みの生年月日を、社員マスタへ移してから列を消す。docs/DESIGN.md 37 章。
UPDATE "core"."employees" AS e SET "birth_date" = p."birth_date" FROM "hr"."profiles" AS p WHERE p."employee_id" = e."id" AND p."birth_date" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "hr"."profiles" DROP COLUMN "birth_date";
