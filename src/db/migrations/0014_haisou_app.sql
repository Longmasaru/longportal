CREATE SCHEMA "haisou";
--> statement-breakpoint
CREATE TABLE "haisou"."clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"row_no" integer NOT NULL,
	"name" text NOT NULL,
	"kana" text DEFAULT '' NOT NULL,
	"person" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"tel" text DEFAULT '' NOT NULL,
	"kind" smallint DEFAULT 1 NOT NULL,
	"stay_min" integer,
	"lat" double precision,
	"lng" double precision,
	"deleted_at" timestamp with time zone,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clients_kind_check" CHECK ("haisou"."clients"."kind" in (1, 2)),
	CONSTRAINT "clients_stay_check" CHECK ("haisou"."clients"."stay_min" is null or "haisou"."clients"."stay_min" >= 0),
	CONSTRAINT "clients_latlng_check" CHECK (("haisou"."clients"."lat" is null) = ("haisou"."clients"."lng" is null))
);
--> statement-breakpoint
CREATE TABLE "haisou"."company_defaults" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"company_name" text NOT NULL,
	"yoken" text DEFAULT '' NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"stay" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "haisou"."drivers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "haisou"."geocode_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"address" text NOT NULL,
	"latlng" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "haisou"."history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"line_no" bigint GENERATED ALWAYS AS IDENTITY (sequence name "haisou"."history_line_no_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"batch_id" uuid NOT NULL,
	"delivery_date" date,
	"date_label" text NOT NULL,
	"shift" text DEFAULT '' NOT NULL,
	"driver" text DEFAULT '' NOT NULL,
	"start_time" text DEFAULT '' NOT NULL,
	"back_time" text DEFAULT '' NOT NULL,
	"seq" integer NOT NULL,
	"name" text NOT NULL,
	"person" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"tel" text DEFAULT '' NOT NULL,
	"yoken" text DEFAULT '' NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"arrive" text DEFAULT '' NOT NULL,
	"depart" text DEFAULT '' NOT NULL,
	"stay" integer,
	"total_km" double precision,
	"total_min" integer,
	"actual_time" text DEFAULT '' NOT NULL,
	"map_url" text DEFAULT '' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "haisou"."saved_routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivery_date" text DEFAULT '' NOT NULL,
	"driver" text DEFAULT '' NOT NULL,
	"am_count" integer DEFAULT 0 NOT NULL,
	"pm_count" integer DEFAULT 0 NOT NULL,
	"data" jsonb NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "haisou"."clients" ADD CONSTRAINT "clients_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "haisou"."company_defaults" ADD CONSTRAINT "company_defaults_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "haisou"."history" ADD CONSTRAINT "history_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "haisou"."saved_routes" ADD CONSTRAINT "saved_routes_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clients_row_no_key" ON "haisou"."clients" USING btree ("row_no");--> statement-breakpoint
CREATE UNIQUE INDEX "company_defaults_user_company_key" ON "haisou"."company_defaults" USING btree ("user_id","company_name");--> statement-breakpoint
CREATE UNIQUE INDEX "geocode_cache_address_key" ON "haisou"."geocode_cache" USING btree ("address");--> statement-breakpoint
CREATE INDEX "history_delivery_date_idx" ON "haisou"."history" USING btree ("delivery_date");--> statement-breakpoint
CREATE INDEX "history_batch_id_idx" ON "haisou"."history" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "history_name_idx" ON "haisou"."history" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "saved_routes_name_key" ON "haisou"."saved_routes" USING btree ("name");