CREATE SCHEMA "arigato";
--> statement-breakpoint
CREATE TABLE "arigato"."banzuke" (
	"basho" text NOT NULL,
	"user_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"rank" text NOT NULL,
	"side" text NOT NULL,
	"promoted" boolean DEFAULT false NOT NULL,
	"kojo_word" text,
	"wins" integer,
	"received" integer,
	"yusho" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "banzuke_basho_user_id_pk" PRIMARY KEY("basho","user_id"),
	CONSTRAINT "banzuke_basho_check" CHECK ("arigato"."banzuke"."basho" ~ '^[0-9]{4}-(01|03|05|07|09|11)$'),
	CONSTRAINT "banzuke_rank_check" CHECK ("arigato"."banzuke"."rank" in ('yokozuna', 'ozeki', 'sekiwake', 'komusubi', 'maegashira', 'juryo', 'makushita', 'jonokuchi', 'maezumo')),
	CONSTRAINT "banzuke_side_check" CHECK ("arigato"."banzuke"."side" in ('east', 'west'))
);
--> statement-breakpoint
CREATE TABLE "arigato"."cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_user_id" uuid NOT NULL,
	"to_user_id" uuid NOT NULL,
	"to_department_id" uuid,
	"tag" text NOT NULL,
	"message" text NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"sent_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cards_tag_check" CHECK ("arigato"."cards"."tag" in ('taught', 'helped', 'challenged', 'systemized')),
	CONSTRAINT "cards_visibility_check" CHECK ("arigato"."cards"."visibility" in ('public', 'private')),
	CONSTRAINT "cards_message_length_check" CHECK (char_length("arigato"."cards"."message") between 1 and 140),
	CONSTRAINT "cards_not_self_check" CHECK ("arigato"."cards"."from_user_id" <> "arigato"."cards"."to_user_id")
);
--> statement-breakpoint
CREATE TABLE "arigato"."likes" (
	"card_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "likes_card_id_user_id_pk" PRIMARY KEY("card_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "arigato"."shikona" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shikona_name_unique" UNIQUE("name"),
	CONSTRAINT "shikona_name_length_check" CHECK (char_length("arigato"."shikona"."name") between 1 and 12)
);
--> statement-breakpoint
ALTER TABLE "arigato"."banzuke" ADD CONSTRAINT "banzuke_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arigato"."cards" ADD CONSTRAINT "cards_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arigato"."cards" ADD CONSTRAINT "cards_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arigato"."cards" ADD CONSTRAINT "cards_to_department_id_departments_id_fk" FOREIGN KEY ("to_department_id") REFERENCES "core"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arigato"."likes" ADD CONSTRAINT "likes_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "arigato"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arigato"."likes" ADD CONSTRAINT "likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arigato"."shikona" ADD CONSTRAINT "shikona_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "banzuke_user_id_idx" ON "arigato"."banzuke" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cards_created_at_idx" ON "arigato"."cards" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "cards_to_user_id_created_at_idx" ON "arigato"."cards" USING btree ("to_user_id","created_at");--> statement-breakpoint
CREATE INDEX "cards_from_user_id_sent_on_idx" ON "arigato"."cards" USING btree ("from_user_id","sent_on");--> statement-breakpoint
CREATE INDEX "cards_sent_on_idx" ON "arigato"."cards" USING btree ("sent_on");