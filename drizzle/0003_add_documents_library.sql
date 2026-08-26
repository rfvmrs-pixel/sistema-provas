CREATE TABLE "documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"sector_id" integer NOT NULL,
	"file_name" varchar(300) NOT NULL,
	"extracted_text" text NOT NULL,
	"file_data" text NOT NULL,
	"file_size" integer NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "document_id" integer;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_sector_id_sectors_id_fk" FOREIGN KEY ("sector_id") REFERENCES "public"."sectors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_sector_idx" ON "documents" USING btree ("sector_id");--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;