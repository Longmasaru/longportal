CREATE SCHEMA "hr";
--> statement-breakpoint
CREATE TABLE "hr"."condition_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"checked_on" date NOT NULL,
	"health" text,
	"mental" text,
	"satisfaction" smallint,
	"note" text DEFAULT '' NOT NULL,
	"author_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "condition_checks_health_check" CHECK ("hr"."condition_checks"."health" is null or "hr"."condition_checks"."health" in ('good', 'same', 'poor')),
	CONSTRAINT "condition_checks_mental_check" CHECK ("hr"."condition_checks"."mental" is null or "hr"."condition_checks"."mental" in ('good', 'same', 'poor')),
	CONSTRAINT "condition_checks_satisfaction_check" CHECK ("hr"."condition_checks"."satisfaction" is null or "hr"."condition_checks"."satisfaction" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "hr"."profiles" (
	"employee_id" uuid PRIMARY KEY NOT NULL,
	"birth_date" date,
	"gender" text,
	"remote_ratio" smallint,
	"goal" text DEFAULT '' NOT NULL,
	"mid_review" text DEFAULT '' NOT NULL,
	"final_review" text DEFAULT '' NOT NULL,
	"review_history" text DEFAULT '' NOT NULL,
	"multi_review" text DEFAULT '' NOT NULL,
	"career_wish" text DEFAULT '' NOT NULL,
	"job_history" text DEFAULT '' NOT NULL,
	"prior_career" text DEFAULT '' NOT NULL,
	"strengths" text DEFAULT '' NOT NULL,
	"personality" text DEFAULT '' NOT NULL,
	"motivation" text DEFAULT '' NOT NULL,
	"manager_comment" text DEFAULT '' NOT NULL,
	"overtime_hours" numeric(5, 1),
	"leave_granted" numeric(4, 1),
	"leave_taken" numeric(4, 1),
	"leave_as_of" date,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_gender_check" CHECK ("hr"."profiles"."gender" is null or "hr"."profiles"."gender" in ('male', 'female', 'other')),
	CONSTRAINT "profiles_remote_ratio_check" CHECK ("hr"."profiles"."remote_ratio" is null or "hr"."profiles"."remote_ratio" between 0 and 100),
	CONSTRAINT "profiles_overtime_check" CHECK ("hr"."profiles"."overtime_hours" is null or "hr"."profiles"."overtime_hours" >= 0),
	CONSTRAINT "profiles_leave_check" CHECK (("hr"."profiles"."leave_granted" is null or "hr"."profiles"."leave_granted" >= 0) and ("hr"."profiles"."leave_taken" is null or "hr"."profiles"."leave_taken" >= 0))
);
--> statement-breakpoint
CREATE TABLE "hr"."qualifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"name" text NOT NULL,
	"acquired_on" date,
	"expires_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hr"."records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"occurred_on" date NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"visibility" text DEFAULT 'employee' NOT NULL,
	"author_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "records_kind_check" CHECK ("hr"."records"."kind" in ('talk', 'caution', 'praise', 'transfer')),
	CONSTRAINT "records_visibility_check" CHECK ("hr"."records"."visibility" in ('employee', 'managers'))
);
--> statement-breakpoint
CREATE TABLE "hr"."skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"name" text NOT NULL,
	"level" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skills_level_check" CHECK ("hr"."skills"."level" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "hr"."trainings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"taken_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trainings_kind_check" CHECK ("hr"."trainings"."kind" in ('internal', 'external'))
);
--> statement-breakpoint
ALTER TABLE "hr"."condition_checks" ADD CONSTRAINT "condition_checks_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "core"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr"."condition_checks" ADD CONSTRAINT "condition_checks_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr"."profiles" ADD CONSTRAINT "profiles_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "core"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr"."profiles" ADD CONSTRAINT "profiles_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr"."qualifications" ADD CONSTRAINT "qualifications_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "core"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr"."records" ADD CONSTRAINT "records_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "core"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr"."records" ADD CONSTRAINT "records_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr"."skills" ADD CONSTRAINT "skills_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "core"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr"."trainings" ADD CONSTRAINT "trainings_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "core"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "condition_checks_employee_id_checked_on_idx" ON "hr"."condition_checks" USING btree ("employee_id","checked_on");--> statement-breakpoint
CREATE INDEX "qualifications_employee_id_idx" ON "hr"."qualifications" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "records_employee_id_occurred_on_idx" ON "hr"."records" USING btree ("employee_id","occurred_on");--> statement-breakpoint
CREATE INDEX "skills_employee_id_idx" ON "hr"."skills" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "trainings_employee_id_idx" ON "hr"."trainings" USING btree ("employee_id");