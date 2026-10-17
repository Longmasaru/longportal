CREATE TABLE "hr"."abilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"axis" text NOT NULL,
	"level" smallint NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "abilities_level_check" CHECK ("hr"."abilities"."level" between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "hr"."abilities" ADD CONSTRAINT "abilities_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "core"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr"."abilities" ADD CONSTRAINT "abilities_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "abilities_employee_id_axis_idx" ON "hr"."abilities" USING btree ("employee_id","axis");