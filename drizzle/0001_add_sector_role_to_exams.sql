ALTER TABLE "exams" ADD COLUMN "sector_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "role_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_sector_id_sectors_id_fk" FOREIGN KEY ("sector_id") REFERENCES "public"."sectors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exams_sector_role_idx" ON "exams" USING btree ("sector_id","role_id");