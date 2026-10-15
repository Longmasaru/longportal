CREATE SCHEMA "todo";
--> statement-breakpoint
CREATE TABLE "todo"."attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"todo_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"file_name" text NOT NULL,
	"size" bigint NOT NULL,
	"content_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attachments_object_key_unique" UNIQUE("object_key")
);
--> statement-breakpoint
CREATE TABLE "todo"."categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"icon" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "categories_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "todo"."todos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"text" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"category_id" uuid NOT NULL,
	"due_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "todos_priority_check" CHECK ("todo"."todos"."priority" in ('low', 'medium', 'high')),
	CONSTRAINT "todos_text_length_check" CHECK (char_length("todo"."todos"."text") between 1 and 200)
);
--> statement-breakpoint
ALTER TABLE "todo"."attachments" ADD CONSTRAINT "attachments_todo_id_todos_id_fk" FOREIGN KEY ("todo_id") REFERENCES "todo"."todos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo"."attachments" ADD CONSTRAINT "attachments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo"."todos" ADD CONSTRAINT "todos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo"."todos" ADD CONSTRAINT "todos_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "todo"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_todo_id_idx" ON "todo"."attachments" USING btree ("todo_id");--> statement-breakpoint
CREATE INDEX "todos_user_id_created_at_idx" ON "todo"."todos" USING btree ("user_id","created_at");--> statement-breakpoint
-- 初期のカテゴリ(仕事向け。docs/DESIGN.md 25 章)。自動分類の選択肢にもなる。
INSERT INTO "todo"."categories" ("code", "label", "icon", "sort_order") VALUES
  ('work', '業務', '💼', 10),
  ('meeting', '会議', '🗓️', 20),
  ('contact', '連絡', '📞', 30),
  ('document', '書類', '📄', 40),
  ('safety', '安全', '⛑️', 50),
  ('equipment', '設備', '🔧', 60),
  ('education', '教育', '📚', 70),
  ('improvement', '改善', '💡', 80),
  ('other', 'その他', '📌', 90)
ON CONFLICT ("code") DO NOTHING;
