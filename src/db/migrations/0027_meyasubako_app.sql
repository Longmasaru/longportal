CREATE SCHEMA "meyasubako";
--> statement-breakpoint
CREATE TABLE "meyasubako"."messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"author_user_id" uuid,
	"from_responder" boolean NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_body_length_check" CHECK (char_length("meyasubako"."messages"."body") between 1 and 1000)
);
--> statement-breakpoint
CREATE TABLE "meyasubako"."photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "photos_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "meyasubako"."posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_user_id" uuid NOT NULL,
	"department_id" uuid,
	"location_id" uuid,
	"category" text NOT NULL,
	"destination" text DEFAULT 'company' NOT NULL,
	"visibility" text NOT NULL,
	"anonymous" boolean DEFAULT false NOT NULL,
	"place" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"posted_on" date NOT NULL,
	"author_activity_at" timestamp with time zone,
	"responder_read_at" timestamp with time zone,
	"responder_activity_at" timestamp with time zone,
	"author_read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "posts_category_check" CHECK ("meyasubako"."posts"."category" in ('request', 'hazard', 'consult', 'idea', 'want', 'thanks', 'other')),
	CONSTRAINT "posts_destination_check" CHECK ("meyasubako"."posts"."destination" in ('company', 'leader')),
	CONSTRAINT "posts_visibility_check" CHECK ("meyasubako"."posts"."visibility" in ('public', 'private')),
	CONSTRAINT "posts_status_check" CHECK ("meyasubako"."posts"."status" in ('new', 'seen', 'doing', 'done')),
	CONSTRAINT "posts_body_length_check" CHECK (char_length("meyasubako"."posts"."body") <= 2000),
	CONSTRAINT "posts_place_length_check" CHECK (char_length("meyasubako"."posts"."place") <= 100)
);
--> statement-breakpoint
ALTER TABLE "meyasubako"."messages" ADD CONSTRAINT "messages_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "meyasubako"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meyasubako"."messages" ADD CONSTRAINT "messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meyasubako"."photos" ADD CONSTRAINT "photos_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "meyasubako"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meyasubako"."posts" ADD CONSTRAINT "posts_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meyasubako"."posts" ADD CONSTRAINT "posts_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "core"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meyasubako"."posts" ADD CONSTRAINT "posts_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "core"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messages_post_id_created_at_idx" ON "meyasubako"."messages" USING btree ("post_id","created_at");--> statement-breakpoint
CREATE INDEX "photos_post_id_idx" ON "meyasubako"."photos" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "posts_author_user_id_idx" ON "meyasubako"."posts" USING btree ("author_user_id","created_at");--> statement-breakpoint
CREATE INDEX "posts_created_at_idx" ON "meyasubako"."posts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "posts_visibility_created_at_idx" ON "meyasubako"."posts" USING btree ("visibility","created_at");