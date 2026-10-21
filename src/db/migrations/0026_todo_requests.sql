ALTER TABLE "todo"."todos" ADD COLUMN "requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "todo"."todos" ADD COLUMN "requested_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "todo"."todos" ADD COLUMN "acknowledged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "todo"."todos" ADD COLUMN "returned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "todo"."todos" ADD COLUMN "returned_reason" text;--> statement-breakpoint
ALTER TABLE "todo"."todos" ADD CONSTRAINT "todos_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "todos_requested_by_idx" ON "todo"."todos" USING btree ("requested_by_user_id","requested_at");--> statement-breakpoint
ALTER TABLE "todo"."todos" ADD CONSTRAINT "todos_request_columns_check" CHECK ("todo"."todos"."requested_at" is not null or ("todo"."todos"."requested_by_user_id" is null and "todo"."todos"."acknowledged_at" is null and "todo"."todos"."returned_at" is null and "todo"."todos"."returned_reason" is null));--> statement-breakpoint
ALTER TABLE "todo"."todos" ADD CONSTRAINT "todos_request_not_self_check" CHECK ("todo"."todos"."requested_by_user_id" is null or "todo"."todos"."requested_by_user_id" <> "todo"."todos"."user_id");--> statement-breakpoint
ALTER TABLE "todo"."todos" ADD CONSTRAINT "todos_returned_not_done_check" CHECK (not ("todo"."todos"."done" and "todo"."todos"."returned_at" is not null));--> statement-breakpoint
ALTER TABLE "todo"."todos" ADD CONSTRAINT "todos_returned_reason_check" CHECK ("todo"."todos"."returned_reason" is null or ("todo"."todos"."returned_at" is not null and char_length("todo"."todos"."returned_reason") <= 200));