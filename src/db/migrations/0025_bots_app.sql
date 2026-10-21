CREATE SCHEMA "bots";
--> statement-breakpoint
CREATE TABLE "bots"."bots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"channel_id" text NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bots_kind_check" CHECK ("bots"."bots"."kind" in ('rain', 'notice')),
	CONSTRAINT "bots_name_length_check" CHECK (char_length("bots"."bots"."name") between 1 and 60)
);
--> statement-breakpoint
CREATE TABLE "bots"."runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bot_id" uuid NOT NULL,
	"run_date" date NOT NULL,
	"status" text NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "runs_status_check" CHECK ("bots"."runs"."status" in ('running', 'sent', 'skipped', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "bots"."bots" ADD CONSTRAINT "bots_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bots"."runs" ADD CONSTRAINT "runs_bot_id_bots_id_fk" FOREIGN KEY ("bot_id") REFERENCES "bots"."bots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "runs_bot_id_run_date_idx" ON "bots"."runs" USING btree ("bot_id","run_date");--> statement-breakpoint
CREATE INDEX "runs_run_date_idx" ON "bots"."runs" USING btree ("run_date");