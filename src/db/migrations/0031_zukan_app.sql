CREATE SCHEMA "zukan";
--> statement-breakpoint
CREATE TABLE "zukan"."comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"author_user_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comments_body_length_check" CHECK (char_length("zukan"."comments"."body") between 1 and 300)
);
--> statement-breakpoint
CREATE TABLE "zukan"."entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_user_id" uuid NOT NULL,
	"department_id" uuid,
	"location_id" uuid,
	"number" integer,
	"status" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"chapter" text,
	"what" text DEFAULT '' NOT NULL,
	"effect" text DEFAULT '' NOT NULL,
	"place" text DEFAULT '' NOT NULL,
	"posted_on" date NOT NULL,
	"ai_review" jsonb,
	"score_effect" smallint,
	"score_idea" smallint,
	"score_reuse" smallint,
	"score_sustain" smallint,
	"score" smallint,
	"appraised_by_user_id" uuid,
	"appraisal_comment" text DEFAULT '' NOT NULL,
	"appraised_at" timestamp with time zone,
	"reveal_seen_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entries_status_check" CHECK ("zukan"."entries"."status" in ('draft', 'published')),
	CONSTRAINT "entries_chapter_check" CHECK ("zukan"."entries"."chapter" is null or "zukan"."entries"."chapter" in ('jitan', 'anzen', 'hinshitsu', 'katazuke', 'cost', 'raku', 'other')),
	CONSTRAINT "entries_published_check" CHECK (("zukan"."entries"."status" = 'draft' and "zukan"."entries"."number" is null) or ("zukan"."entries"."status" = 'published' and "zukan"."entries"."number" is not null and "zukan"."entries"."chapter" is not null and "zukan"."entries"."title" <> '')),
	CONSTRAINT "entries_title_length_check" CHECK (char_length("zukan"."entries"."title") <= 30),
	CONSTRAINT "entries_what_length_check" CHECK (char_length("zukan"."entries"."what") <= 500),
	CONSTRAINT "entries_effect_length_check" CHECK (char_length("zukan"."entries"."effect") <= 200),
	CONSTRAINT "entries_place_length_check" CHECK (char_length("zukan"."entries"."place") <= 100),
	CONSTRAINT "entries_appraisal_comment_length_check" CHECK (char_length("zukan"."entries"."appraisal_comment") <= 200),
	CONSTRAINT "entries_scores_check" CHECK (("zukan"."entries"."score" is null and "zukan"."entries"."score_effect" is null and "zukan"."entries"."score_idea" is null and "zukan"."entries"."score_reuse" is null and "zukan"."entries"."score_sustain" is null)
        or ("zukan"."entries"."score" between 0 and 100 and "zukan"."entries"."score_effect" between 1 and 5 and "zukan"."entries"."score_idea" between 1 and 5 and "zukan"."entries"."score_reuse" between 1 and 5 and "zukan"."entries"."score_sustain" between 1 and 5))
);
--> statement-breakpoint
CREATE TABLE "zukan"."photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "photos_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "photos_kind_check" CHECK ("zukan"."photos"."kind" in ('before', 'after'))
);
--> statement-breakpoint
CREATE TABLE "zukan"."reactions" (
	"entry_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reactions_pkey" PRIMARY KEY("entry_id","user_id","kind"),
	CONSTRAINT "reactions_kind_check" CHECK ("zukan"."reactions"."kind" in ('naruhodo', 'maneshitai'))
);
--> statement-breakpoint
ALTER TABLE "zukan"."comments" ADD CONSTRAINT "comments_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "zukan"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zukan"."comments" ADD CONSTRAINT "comments_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zukan"."entries" ADD CONSTRAINT "entries_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zukan"."entries" ADD CONSTRAINT "entries_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "core"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zukan"."entries" ADD CONSTRAINT "entries_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "core"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zukan"."entries" ADD CONSTRAINT "entries_appraised_by_user_id_users_id_fk" FOREIGN KEY ("appraised_by_user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zukan"."photos" ADD CONSTRAINT "photos_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "zukan"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zukan"."reactions" ADD CONSTRAINT "reactions_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "zukan"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zukan"."reactions" ADD CONSTRAINT "reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comments_entry_id_created_at_idx" ON "zukan"."comments" USING btree ("entry_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "entries_number_unique" ON "zukan"."entries" USING btree ("number");--> statement-breakpoint
CREATE INDEX "entries_author_user_id_idx" ON "zukan"."entries" USING btree ("author_user_id","created_at");--> statement-breakpoint
CREATE INDEX "entries_status_published_at_idx" ON "zukan"."entries" USING btree ("status","published_at");--> statement-breakpoint
CREATE INDEX "photos_entry_id_idx" ON "zukan"."photos" USING btree ("entry_id");