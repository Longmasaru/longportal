CREATE SCHEMA "nakama";
--> statement-breakpoint
CREATE TABLE "nakama"."members" (
	"employee_id" uuid PRIMARY KEY NOT NULL,
	"native_name" text DEFAULT '' NOT NULL,
	"nickname" text DEFAULT '' NOT NULL,
	"arrived_on" date,
	"hometown" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"residence_status" text,
	"residence_expires_on" date,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "members_residence_status_check" CHECK ("nakama"."members"."residence_status" is null or "nakama"."members"."residence_status" in ('technical_intern_1', 'technical_intern_2', 'technical_intern_3', 'employment_training', 'specified_skilled_1', 'specified_skilled_2', 'engineer', 'permanent', 'family', 'other')),
	CONSTRAINT "members_native_name_length_check" CHECK (char_length("nakama"."members"."native_name") <= 100),
	CONSTRAINT "members_nickname_length_check" CHECK (char_length("nakama"."members"."nickname") <= 30),
	CONSTRAINT "members_hometown_length_check" CHECK (char_length("nakama"."members"."hometown") <= 50),
	CONSTRAINT "members_note_length_check" CHECK (char_length("nakama"."members"."note") <= 100)
);
--> statement-breakpoint
ALTER TABLE "nakama"."members" ADD CONSTRAINT "members_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "core"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nakama"."members" ADD CONSTRAINT "members_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;