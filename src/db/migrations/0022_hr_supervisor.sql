ALTER TABLE "hr"."records" DROP CONSTRAINT "records_visibility_check";--> statement-breakpoint
ALTER TABLE "hr"."profiles" ADD COLUMN "supervisor_employee_id" uuid;--> statement-breakpoint
ALTER TABLE "hr"."profiles" ADD CONSTRAINT "profiles_supervisor_employee_id_employees_id_fk" FOREIGN KEY ("supervisor_employee_id") REFERENCES "core"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "profiles_supervisor_employee_id_idx" ON "hr"."profiles" USING btree ("supervisor_employee_id");--> statement-breakpoint
ALTER TABLE "hr"."profiles" ADD CONSTRAINT "profiles_supervisor_not_self" CHECK ("hr"."profiles"."supervisor_employee_id" is null or "hr"."profiles"."supervisor_employee_id" <> "hr"."profiles"."employee_id");--> statement-breakpoint
ALTER TABLE "hr"."records" ADD CONSTRAINT "records_visibility_check" CHECK ("hr"."records"."visibility" in ('employee', 'supervisors', 'personal', 'managers'));