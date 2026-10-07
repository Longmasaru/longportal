CREATE SCHEMA IF NOT EXISTS "core";--> statement-breakpoint
CREATE TABLE "core"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"login_id" text NOT NULL,
	"password_hash" text NOT NULL,
	"employee_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_login_id_unique" UNIQUE("login_id"),
	CONSTRAINT "users_employee_id_unique" UNIQUE("employee_id"),
	CONSTRAINT "users_status_check" CHECK ("core"."users"."status" in ('active', 'disabled')),
	CONSTRAINT "users_login_id_lowercase" CHECK ("core"."users"."login_id" = lower("core"."users"."login_id"))
);
--> statement-breakpoint
CREATE TABLE "core"."departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "departments_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "core"."employee_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"department_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"is_primary" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employee_assignments_period_check" CHECK ("core"."employee_assignments"."end_date" is null or "core"."employee_assignments"."end_date" >= "core"."employee_assignments"."start_date")
);
--> statement-breakpoint
CREATE TABLE "core"."employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_number" text NOT NULL,
	"name" text NOT NULL,
	"name_kana" text,
	"employment_type_id" uuid NOT NULL,
	"position_id" uuid,
	"hired_on" date NOT NULL,
	"left_on" date,
	"status" text DEFAULT 'planned' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employees_employee_number_unique" UNIQUE("employee_number"),
	CONSTRAINT "employees_status_check" CHECK ("core"."employees"."status" in ('planned', 'active', 'leave', 'retired')),
	CONSTRAINT "employees_retired_requires_left_on" CHECK ("core"."employees"."status" <> 'retired' or "core"."employees"."left_on" is not null),
	CONSTRAINT "employees_left_on_after_hired_on" CHECK ("core"."employees"."left_on" is null or "core"."employees"."left_on" >= "core"."employees"."hired_on")
);
--> statement-breakpoint
CREATE TABLE "core"."employment_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employment_types_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "core"."locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "locations_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "core"."positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"is_management" boolean DEFAULT false NOT NULL,
	"rank" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "positions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "core"."users" ADD CONSTRAINT "users_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "core"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."employee_assignments" ADD CONSTRAINT "employee_assignments_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "core"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."employee_assignments" ADD CONSTRAINT "employee_assignments_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "core"."departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."employee_assignments" ADD CONSTRAINT "employee_assignments_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "core"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."employees" ADD CONSTRAINT "employees_employment_type_id_employment_types_id_fk" FOREIGN KEY ("employment_type_id") REFERENCES "core"."employment_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."employees" ADD CONSTRAINT "employees_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "core"."positions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "employee_assignments_employee_id_start_date_idx" ON "core"."employee_assignments" USING btree ("employee_id","start_date");--> statement-breakpoint
CREATE INDEX "employee_assignments_department_id_idx" ON "core"."employee_assignments" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "employee_assignments_location_id_idx" ON "core"."employee_assignments" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "employees_employment_type_id_idx" ON "core"."employees" USING btree ("employment_type_id");--> statement-breakpoint
CREATE INDEX "employees_position_id_idx" ON "core"."employees" USING btree ("position_id");--> statement-breakpoint
CREATE INDEX "employees_status_idx" ON "core"."employees" USING btree ("status");