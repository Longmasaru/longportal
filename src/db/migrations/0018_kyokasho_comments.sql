CREATE TABLE "kyokasho"."comment_thanks" (
	"comment_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comment_thanks_comment_id_user_id_pk" PRIMARY KEY("comment_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "kyokasho"."comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"book_id" uuid NOT NULL,
	"chapter_no" integer NOT NULL,
	"chapter_title" varchar(200) NOT NULL,
	"section_id" varchar(80),
	"section_title" varchar(200) DEFAULT '' NOT NULL,
	"quote" varchar(300) DEFAULT '' NOT NULL,
	"kind" varchar(20) NOT NULL,
	"body" text NOT NULL,
	"author_user_id" uuid,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"reply" text DEFAULT '' NOT NULL,
	"replied_by" uuid,
	"replied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comments_kind_check" CHECK ("kyokasho"."comments"."kind" IN ('question', 'addition', 'mistake', 'comment')),
	CONSTRAINT "comments_status_check" CHECK ("kyokasho"."comments"."status" IN ('open', 'adopted', 'reflected', 'kept')),
	CONSTRAINT "comments_body_check" CHECK (char_length("kyokasho"."comments"."body") BETWEEN 1 AND 1000),
	CONSTRAINT "comments_chapter_check" CHECK ("kyokasho"."comments"."chapter_no" >= 1)
);
--> statement-breakpoint
ALTER TABLE "kyokasho"."comment_thanks" ADD CONSTRAINT "comment_thanks_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "kyokasho"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyokasho"."comment_thanks" ADD CONSTRAINT "comment_thanks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyokasho"."comments" ADD CONSTRAINT "comments_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "kyokasho"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyokasho"."comments" ADD CONSTRAINT "comments_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyokasho"."comments" ADD CONSTRAINT "comments_replied_by_users_id_fk" FOREIGN KEY ("replied_by") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comments_book_chapter_idx" ON "kyokasho"."comments" USING btree ("book_id","chapter_no");--> statement-breakpoint
CREATE INDEX "comments_status_idx" ON "kyokasho"."comments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "comments_author_idx" ON "kyokasho"."comments" USING btree ("author_user_id");