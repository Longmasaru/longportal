CREATE SCHEMA "kyokasho";
--> statement-breakpoint
CREATE TABLE "kyokasho"."books" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(60) NOT NULL,
	"department" varchar(40) NOT NULL,
	"title" varchar(80) NOT NULL,
	"description" varchar(300) DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"target" varchar(20) DEFAULT 'company' NOT NULL,
	"audience_id" uuid,
	"is_published" boolean DEFAULT false NOT NULL,
	"source_url" text DEFAULT '' NOT NULL,
	"content" jsonb NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"imported_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "books_target_check" CHECK ("kyokasho"."books"."target" IN ('company', 'audience')),
	CONSTRAINT "books_audience_check" CHECK (("kyokasho"."books"."target" = 'audience') = ("kyokasho"."books"."audience_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "kyokasho"."images" (
	"id" uuid PRIMARY KEY NOT NULL,
	"book_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" varchar(40) NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kyokasho"."books" ADD CONSTRAINT "books_audience_id_audiences_id_fk" FOREIGN KEY ("audience_id") REFERENCES "core"."audiences"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyokasho"."books" ADD CONSTRAINT "books_imported_by_users_id_fk" FOREIGN KEY ("imported_by") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyokasho"."images" ADD CONSTRAINT "images_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "kyokasho"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "books_slug_key" ON "kyokasho"."books" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "images_book_id_idx" ON "kyokasho"."images" USING btree ("book_id");