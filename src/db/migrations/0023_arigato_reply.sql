ALTER TABLE "arigato"."cards" ADD COLUMN "reply" text;--> statement-breakpoint
ALTER TABLE "arigato"."cards" ADD COLUMN "replied_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "arigato"."cards" ADD CONSTRAINT "cards_reply_check" CHECK ("arigato"."cards"."reply" is null or "arigato"."cards"."reply" in ('glad', 'likewise', 'welcome', 'anytime'));