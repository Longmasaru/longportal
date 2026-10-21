CREATE SCHEMA "nippo";
--> statement-breakpoint
CREATE TABLE "nippo"."comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"author_user_id" uuid,
	"by_owner" boolean DEFAULT false NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nippo"."reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"report_date" date NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"training" text DEFAULT '' NOT NULL,
	"top_learning" text DEFAULT '' NOT NULL,
	"taught" text DEFAULT '' NOT NULL,
	"asked" text DEFAULT '' NOT NULL,
	"noticed" text DEFAULT '' NOT NULL,
	"can_do" text DEFAULT '' NOT NULL,
	"difficult" text DEFAULT '' NOT NULL,
	"unclear" text DEFAULT '' NOT NULL,
	"tomorrow" text DEFAULT '' NOT NULL,
	"score" smallint,
	"score_note" text DEFAULT '' NOT NULL,
	"submitted_at" timestamp with time zone,
	"author_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reports_status_check" CHECK ("nippo"."reports"."status" in ('draft', 'submitted')),
	CONSTRAINT "reports_score_check" CHECK ("nippo"."reports"."score" is null or "nippo"."reports"."score" between 1 and 10),
	CONSTRAINT "reports_submitted_at_check" CHECK (("nippo"."reports"."status" = 'draft') = ("nippo"."reports"."submitted_at" is null))
);
--> statement-breakpoint
ALTER TABLE "nippo"."comments" ADD CONSTRAINT "comments_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "nippo"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nippo"."comments" ADD CONSTRAINT "comments_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nippo"."reports" ADD CONSTRAINT "reports_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "core"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nippo"."reports" ADD CONSTRAINT "reports_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comments_report_id_created_at_idx" ON "nippo"."comments" USING btree ("report_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_employee_id_report_date_idx" ON "nippo"."reports" USING btree ("employee_id","report_date");--> statement-breakpoint
CREATE INDEX "reports_status_report_date_idx" ON "nippo"."reports" USING btree ("status","report_date");