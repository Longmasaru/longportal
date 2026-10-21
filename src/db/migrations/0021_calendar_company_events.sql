CREATE TABLE "calendar"."company_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"date" date NOT NULL,
	"time" varchar(5),
	"title" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"visibility" text NOT NULL,
	"audience_id" uuid,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_events_kind_check" CHECK ("calendar"."company_events"."kind" in ('paid_leave_day', 'temporary_closure', 'event')),
	CONSTRAINT "company_events_visibility_check" CHECK ("calendar"."company_events"."visibility" in ('company', 'invitees')),
	CONSTRAINT "company_events_off_day_check" CHECK ("calendar"."company_events"."kind" = 'event' or ("calendar"."company_events"."visibility" = 'company' and "calendar"."company_events"."time" is null and "calendar"."company_events"."audience_id" is null))
);
--> statement-breakpoint
CREATE TABLE "calendar"."event_invitees" (
	"event_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	CONSTRAINT "event_invitees_event_id_employee_id_pk" PRIMARY KEY("event_id","employee_id")
);
--> statement-breakpoint
CREATE TABLE "calendar"."event_responses" (
	"event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"response" text NOT NULL,
	"responded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_responses_event_id_user_id_pk" PRIMARY KEY("event_id","user_id"),
	CONSTRAINT "event_responses_response_check" CHECK ("calendar"."event_responses"."response" in ('yes', 'no'))
);
--> statement-breakpoint
ALTER TABLE "calendar"."company_events" ADD CONSTRAINT "company_events_audience_id_audiences_id_fk" FOREIGN KEY ("audience_id") REFERENCES "core"."audiences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar"."company_events" ADD CONSTRAINT "company_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar"."company_events" ADD CONSTRAINT "company_events_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar"."event_invitees" ADD CONSTRAINT "event_invitees_event_id_company_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "calendar"."company_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar"."event_invitees" ADD CONSTRAINT "event_invitees_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "core"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar"."event_responses" ADD CONSTRAINT "event_responses_event_id_company_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "calendar"."company_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar"."event_responses" ADD CONSTRAINT "event_responses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "company_events_date_idx" ON "calendar"."company_events" USING btree ("date");--> statement-breakpoint
CREATE INDEX "company_events_created_by_idx" ON "calendar"."company_events" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "company_events_audience_id_idx" ON "calendar"."company_events" USING btree ("audience_id");--> statement-breakpoint
CREATE INDEX "event_invitees_employee_id_idx" ON "calendar"."event_invitees" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "event_responses_user_id_idx" ON "calendar"."event_responses" USING btree ("user_id");