CREATE TABLE "core"."audience_conditions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"attribute" text NOT NULL,
	"operator" text NOT NULL,
	"value" jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "audience_conditions_attribute_check" CHECK ("core"."audience_conditions"."attribute" in ('department', 'location', 'position', 'employment_type', 'is_management', 'tenure_months')),
	CONSTRAINT "audience_conditions_operator_check" CHECK ("core"."audience_conditions"."operator" in ('in', 'is', 'lt', 'gte'))
);
--> statement-breakpoint
CREATE TABLE "core"."audience_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audience_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."audience_members" (
	"audience_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"kind" text NOT NULL,
	CONSTRAINT "audience_members_audience_id_employee_id_pk" PRIMARY KEY("audience_id","employee_id"),
	CONSTRAINT "audience_members_kind_check" CHECK ("core"."audience_members"."kind" in ('include', 'exclude'))
);
--> statement-breakpoint
CREATE TABLE "core"."audiences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audiences_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "core"."audience_conditions" ADD CONSTRAINT "audience_conditions_group_id_audience_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "core"."audience_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."audience_groups" ADD CONSTRAINT "audience_groups_audience_id_audiences_id_fk" FOREIGN KEY ("audience_id") REFERENCES "core"."audiences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."audience_members" ADD CONSTRAINT "audience_members_audience_id_audiences_id_fk" FOREIGN KEY ("audience_id") REFERENCES "core"."audiences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."audience_members" ADD CONSTRAINT "audience_members_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "core"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audience_conditions_group_id_idx" ON "core"."audience_conditions" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "audience_groups_audience_id_idx" ON "core"."audience_groups" USING btree ("audience_id");