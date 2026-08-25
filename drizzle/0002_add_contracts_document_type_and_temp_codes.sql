ALTER TABLE "admins" ADD COLUMN "sector_id" integer;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "mode" varchar(20) DEFAULT 'simulado' NOT NULL;--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "session_label" varchar(150);--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "temp_code_hash" varchar(255);--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "temp_code_exam_id" integer;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "temp_code_session_label" varchar(150);--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "temp_code_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "document_type" varchar(10) DEFAULT 'IT' NOT NULL;--> statement-breakpoint
ALTER TABLE "admins" ADD CONSTRAINT "admins_sector_id_sectors_id_fk" FOREIGN KEY ("sector_id") REFERENCES "public"."sectors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_temp_code_exam_id_exams_id_fk" FOREIGN KEY ("temp_code_exam_id") REFERENCES "public"."exams"("id") ON DELETE set null ON UPDATE no action;