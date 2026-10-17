CREATE TABLE "core"."auth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"token_hash" text NOT NULL,
	"email" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_tokens_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "auth_tokens_purpose_check" CHECK ("core"."auth_tokens"."purpose" in ('email_verify', 'password_reset'))
);
--> statement-breakpoint
ALTER TABLE "core"."users" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "core"."users" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "core"."auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_tokens_user_id_purpose_idx" ON "core"."auth_tokens" USING btree ("user_id","purpose");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "core"."users" USING btree ("email");--> statement-breakpoint
ALTER TABLE "core"."users" ADD CONSTRAINT "users_email_lowercase" CHECK ("core"."users"."email" is null or "core"."users"."email" = lower("core"."users"."email"));