CREATE TABLE "core"."login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"login_id" text NOT NULL,
	"ip" text,
	"succeeded" boolean NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "login_attempts_login_id_attempted_at_idx" ON "core"."login_attempts" USING btree ("login_id","attempted_at");--> statement-breakpoint
CREATE INDEX "login_attempts_ip_attempted_at_idx" ON "core"."login_attempts" USING btree ("ip","attempted_at");