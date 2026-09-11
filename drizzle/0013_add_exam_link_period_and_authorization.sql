ALTER TABLE "exam_links" ADD COLUMN "period_start" date;--> statement-breakpoint
ALTER TABLE "exam_links" ADD COLUMN "period_end" date;--> statement-breakpoint
ALTER TABLE "exam_links" ADD COLUMN "authorized_by" varchar(150);--> statement-breakpoint
ALTER TABLE "exam_links" ADD COLUMN "authorization_comment" varchar(500);--> statement-breakpoint
ALTER TABLE "exam_links" ADD COLUMN "authorized_at" timestamp;