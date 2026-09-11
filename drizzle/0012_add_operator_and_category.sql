ALTER TABLE "documents" ADD COLUMN "category" varchar(100);--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "category" varchar(100);--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "is_operator" boolean DEFAULT false NOT NULL;