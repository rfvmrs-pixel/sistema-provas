CREATE TABLE "admin_sectors" (
	"id" serial PRIMARY KEY NOT NULL,
	"admin_id" integer NOT NULL,
	"sector_id" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admins" ADD COLUMN "label" varchar(150);--> statement-breakpoint
ALTER TABLE "admin_sectors" ADD CONSTRAINT "admin_sectors_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_sectors" ADD CONSTRAINT "admin_sectors_sector_id_sectors_id_fk" FOREIGN KEY ("sector_id") REFERENCES "public"."sectors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_sectors_admin_sector_idx" ON "admin_sectors" USING btree ("admin_id","sector_id");