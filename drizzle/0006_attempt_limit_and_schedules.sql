CREATE TABLE "exam_schedules" (
	"id" serial PRIMARY KEY NOT NULL,
	"sector_id" integer NOT NULL,
	"document_id" integer,
	"document_label" varchar(300) NOT NULL,
	"scheduled_date" date NOT NULL,
	"note" varchar(300),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "question_set_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "current_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "exam_schedules" ADD CONSTRAINT "exam_schedules_sector_id_sectors_id_fk" FOREIGN KEY ("sector_id") REFERENCES "public"."sectors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_schedules" ADD CONSTRAINT "exam_schedules_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exam_schedules_sector_date_idx" ON "exam_schedules" USING btree ("sector_id","scheduled_date");