CREATE SCHEMA "kentei";
--> statement-breakpoint
CREATE TABLE "kentei"."answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"exam_id" uuid NOT NULL,
	"question_id" varchar(60) NOT NULL,
	"mode" varchar(10) NOT NULL,
	"correct" boolean NOT NULL,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "answers_mode_check" CHECK ("kentei"."answers"."mode" in ('study', 'test'))
);
--> statement-breakpoint
CREATE TABLE "kentei"."exams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(60) NOT NULL,
	"title" varchar(80) NOT NULL,
	"grade" varchar(20) NOT NULL,
	"title_vi" varchar(160) DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"content" jsonb NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"imported_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kentei"."images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" varchar(40) NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kentei"."test_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"exam_id" uuid NOT NULL,
	"kind" varchar(10) NOT NULL,
	"round" integer,
	"correct" integer NOT NULL,
	"total" integer NOT NULL,
	"score" integer NOT NULL,
	"passed" boolean NOT NULL,
	"seconds" integer NOT NULL,
	"detail" jsonb NOT NULL,
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "test_results_kind_check" CHECK ("kentei"."test_results"."kind" in ('random', 'past')),
	CONSTRAINT "test_results_round_check" CHECK (("kentei"."test_results"."kind" = 'past') = ("kentei"."test_results"."round" is not null))
);
--> statement-breakpoint
ALTER TABLE "kentei"."answers" ADD CONSTRAINT "answers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kentei"."answers" ADD CONSTRAINT "answers_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "kentei"."exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kentei"."exams" ADD CONSTRAINT "exams_imported_by_users_id_fk" FOREIGN KEY ("imported_by") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kentei"."images" ADD CONSTRAINT "images_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "kentei"."exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kentei"."test_results" ADD CONSTRAINT "test_results_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kentei"."test_results" ADD CONSTRAINT "test_results_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "kentei"."exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "answers_user_exam_idx" ON "kentei"."answers" USING btree ("user_id","exam_id","answered_at");--> statement-breakpoint
CREATE UNIQUE INDEX "exams_slug_key" ON "kentei"."exams" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "images_exam_id_idx" ON "kentei"."images" USING btree ("exam_id");--> statement-breakpoint
CREATE INDEX "test_results_user_exam_idx" ON "kentei"."test_results" USING btree ("user_id","exam_id","taken_at");