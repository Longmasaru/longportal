CREATE TABLE "core"."portal_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"target" text DEFAULT 'company' NOT NULL,
	"audience_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portal_links_target_check" CHECK ("core"."portal_links"."target" in ('company', 'audience')),
	CONSTRAINT "portal_links_audience_check" CHECK (("core"."portal_links"."target" = 'audience') = ("core"."portal_links"."audience_id" is not null)),
	CONSTRAINT "portal_links_url_check" CHECK ("core"."portal_links"."url" ~ '^https?://')
);
--> statement-breakpoint
CREATE TABLE "core"."announcement_reads" (
	"announcement_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acknowledged_at" timestamp with time zone,
	CONSTRAINT "announcement_reads_announcement_id_user_id_pk" PRIMARY KEY("announcement_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "core"."announcement_recipients" (
	"announcement_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	CONSTRAINT "announcement_recipients_announcement_id_employee_id_pk" PRIMARY KEY("announcement_id","employee_id")
);
--> statement-breakpoint
CREATE TABLE "core"."announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"kind" text DEFAULT 'general' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"target" text NOT NULL,
	"audience_id" uuid,
	"requires_action" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_on" date NOT NULL,
	"expires_on" date,
	"banner_until" date,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "announcements_kind_check" CHECK ("core"."announcements"."kind" in ('general', 'request', 'approval', 'education', 'case', 'safety', 'health', 'event', 'rule', 'system')),
	CONSTRAINT "announcements_priority_check" CHECK ("core"."announcements"."priority" in ('normal', 'important', 'urgent')),
	CONSTRAINT "announcements_target_check" CHECK ("core"."announcements"."target" in ('company', 'audience', 'individual')),
	CONSTRAINT "announcements_status_check" CHECK ("core"."announcements"."status" in ('draft', 'published')),
	CONSTRAINT "announcements_audience_check" CHECK (("core"."announcements"."target" = 'audience') = ("core"."announcements"."audience_id" is not null)),
	CONSTRAINT "announcements_banner_check" CHECK ("core"."announcements"."banner_until" is null or ("core"."announcements"."target" = 'company' and "core"."announcements"."priority" = 'urgent')),
	CONSTRAINT "announcements_period_check" CHECK ("core"."announcements"."expires_on" is null or "core"."announcements"."expires_on" >= "core"."announcements"."published_on")
);
--> statement-breakpoint
ALTER TABLE "core"."portal_links" ADD CONSTRAINT "portal_links_audience_id_audiences_id_fk" FOREIGN KEY ("audience_id") REFERENCES "core"."audiences"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."announcement_reads" ADD CONSTRAINT "announcement_reads_announcement_id_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "core"."announcements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."announcement_reads" ADD CONSTRAINT "announcement_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."announcement_recipients" ADD CONSTRAINT "announcement_recipients_announcement_id_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "core"."announcements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."announcement_recipients" ADD CONSTRAINT "announcement_recipients_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "core"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."announcements" ADD CONSTRAINT "announcements_audience_id_audiences_id_fk" FOREIGN KEY ("audience_id") REFERENCES "core"."audiences"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."announcements" ADD CONSTRAINT "announcements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."announcements" ADD CONSTRAINT "announcements_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "portal_links_audience_id_idx" ON "core"."portal_links" USING btree ("audience_id");--> statement-breakpoint
CREATE INDEX "announcement_reads_user_id_idx" ON "core"."announcement_reads" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "announcement_recipients_employee_id_idx" ON "core"."announcement_recipients" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "announcements_status_published_on_idx" ON "core"."announcements" USING btree ("status","published_on");--> statement-breakpoint
CREATE INDEX "announcements_audience_id_idx" ON "core"."announcements" USING btree ("audience_id");