CREATE SCHEMA "aikyoshitsu";
--> statement-breakpoint
CREATE TABLE "aikyoshitsu"."materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"file_name" text NOT NULL,
	"size" bigint NOT NULL,
	"content_type" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "materials_object_key_unique" UNIQUE("object_key")
);
--> statement-breakpoint
CREATE TABLE "aikyoshitsu"."sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"held_on" date,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_title_length_check" CHECK (char_length("aikyoshitsu"."sessions"."title") between 1 and 100)
);
--> statement-breakpoint
ALTER TABLE "aikyoshitsu"."materials" ADD CONSTRAINT "materials_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "aikyoshitsu"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aikyoshitsu"."materials" ADD CONSTRAINT "materials_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "materials_session_id_idx" ON "aikyoshitsu"."materials" USING btree ("session_id","sort_order");