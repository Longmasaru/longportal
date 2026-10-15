-- 氏名を姓と名に分ける(docs/DESIGN.md 22 章)。drizzle-kit generate の出力を手で直したもの:
-- 生成列に置き換える前に、今の氏名から姓・名を移し、文字の欠けがないかを確かめる。
-- 分け方は src/modules/core/employees/names.ts の splitName と同じ規則。
ALTER TABLE "core"."employees" ADD COLUMN "family_name" text;--> statement-breakpoint
ALTER TABLE "core"."employees" ADD COLUMN "given_name" text;--> statement-breakpoint
ALTER TABLE "core"."employees" ADD COLUMN "family_name_kana" text;--> statement-breakpoint
ALTER TABLE "core"."employees" ADD COLUMN "given_name_kana" text;--> statement-breakpoint
-- 英字だけの氏名: 最後の語が名、それより前が姓。それ以外: 最初の空白の前が姓。空白がなければ全体を姓。
-- かなは、氏名が英字だけかどうかに合わせて同じように分ける(区切りは全角空白)。
UPDATE "core"."employees" e SET
  "family_name" = CASE
    WHEN cardinality(s.w) <= 1 THEN s.w[1]
    WHEN s.ascii THEN array_to_string(s.w[1:cardinality(s.w) - 1], ' ')
    ELSE s.w[1] END,
  "given_name" = CASE
    WHEN cardinality(s.w) <= 1 THEN NULL
    WHEN s.ascii THEN s.w[cardinality(s.w)]
    ELSE array_to_string(s.w[2:cardinality(s.w)], '　') END,
  "family_name_kana" = CASE
    WHEN s.k IS NULL THEN NULL
    WHEN cardinality(s.k) <= 1 THEN s.k[1]
    WHEN s.ascii THEN array_to_string(s.k[1:cardinality(s.k) - 1], '　')
    ELSE s.k[1] END,
  "given_name_kana" = CASE
    WHEN s.k IS NULL OR cardinality(s.k) <= 1 THEN NULL
    WHEN s.ascii THEN s.k[cardinality(s.k)]
    ELSE array_to_string(s.k[2:cardinality(s.k)], '　') END
FROM (
  SELECT
    "id",
    regexp_split_to_array(btrim("name", ' 　'), '[ 　]+') AS w,
    CASE WHEN "name_kana" IS NULL OR btrim("name_kana", ' 　') = '' THEN NULL
      ELSE regexp_split_to_array(btrim("name_kana", ' 　'), '[ 　]+') END AS k,
    "name" ~ '^[ -~]*$' AS ascii
  FROM "core"."employees"
) s
WHERE e."id" = s."id";--> statement-breakpoint
-- 文字の欠けがないこと(空白の違いだけは許す)を確かめる。欠けていれば migration 全体を中止する。
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "core"."employees"
    WHERE "family_name" IS NULL OR "family_name" = ''
      OR regexp_replace("name", '[ 　]', '', 'g')
        <> regexp_replace("family_name" || coalesce("given_name", ''), '[ 　]', '', 'g')
      OR regexp_replace(coalesce("name_kana", ''), '[ 　]', '', 'g')
        <> regexp_replace(coalesce("family_name_kana", '') || coalesce("given_name_kana", ''), '[ 　]', '', 'g')
  ) THEN
    RAISE EXCEPTION '氏名を姓と名に分けた結果が、元の氏名と一致しない社員がいます。';
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "core"."employees" ALTER COLUMN "family_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."employees" DROP COLUMN "name";--> statement-breakpoint
ALTER TABLE "core"."employees" ADD COLUMN "name" text GENERATED ALWAYS AS (family_name || case when given_name is null or given_name = '' then '' when (family_name || given_name) ~ '^[ -~]*$' then ' ' || given_name else '　' || given_name end) STORED NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."employees" DROP COLUMN "name_kana";--> statement-breakpoint
ALTER TABLE "core"."employees" ADD COLUMN "name_kana" text GENERATED ALWAYS AS (case when coalesce(family_name_kana, '') = '' and coalesce(given_name_kana, '') = '' then null when coalesce(family_name_kana, '') = '' then given_name_kana when coalesce(given_name_kana, '') = '' then family_name_kana else family_name_kana || '　' || given_name_kana end) STORED;
