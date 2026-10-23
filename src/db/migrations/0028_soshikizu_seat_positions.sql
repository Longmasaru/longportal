CREATE SCHEMA "soshikizu";
--> statement-breakpoint
CREATE TABLE "soshikizu"."seat_positions" (
	"employee_id" uuid PRIMARY KEY NOT NULL,
	"area" text NOT NULL,
	"x" double precision NOT NULL,
	"y" double precision NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "soshikizu"."seat_positions" ADD CONSTRAINT "seat_positions_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "core"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "soshikizu"."seat_positions" ADD CONSTRAINT "seat_positions_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;