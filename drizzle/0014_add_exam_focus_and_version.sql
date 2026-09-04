ALTER TABLE "exams" ADD COLUMN "focus" varchar(300);--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;