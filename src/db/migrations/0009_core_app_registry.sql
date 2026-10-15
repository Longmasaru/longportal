CREATE TABLE "core"."app_registry" (
	"app_key" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"icon" text DEFAULT 'grid' NOT NULL,
	"url" text,
	"route" text,
	"target" text DEFAULT 'company' NOT NULL,
	"audience_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"in_manifest" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_registry_app_key_check" CHECK ("core"."app_registry"."app_key" ~ '^[a-z][a-z0-9_-]{1,39}$'),
	CONSTRAINT "app_registry_kind_check" CHECK ("core"."app_registry"."kind" in ('internal', 'external')),
	CONSTRAINT "app_registry_target_check" CHECK ("core"."app_registry"."target" in ('company', 'audience')),
	CONSTRAINT "app_registry_audience_check" CHECK (("core"."app_registry"."target" = 'audience') = ("core"."app_registry"."audience_id" is not null)),
	CONSTRAINT "app_registry_location_check" CHECK (("core"."app_registry"."kind" = 'external' and "core"."app_registry"."url" ~ '^https?://' and "core"."app_registry"."route" is null) or ("core"."app_registry"."kind" = 'internal' and "core"."app_registry"."route" like '/%' and "core"."app_registry"."url" is null))
);
--> statement-breakpoint
ALTER TABLE "core"."app_registry" ADD CONSTRAINT "app_registry_audience_id_audiences_id_fk" FOREIGN KEY ("audience_id") REFERENCES "core"."audiences"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "app_registry_audience_id_idx" ON "core"."app_registry" USING btree ("audience_id");