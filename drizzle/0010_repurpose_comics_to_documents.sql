DROP TABLE "exam_comics" CASCADE;
--> statement-breakpoint
CREATE TABLE "document_comics" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"images" jsonb NOT NULL,
	"correct_index" integer NOT NULL,
	"explanation" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "document_comics_document_id_unique" UNIQUE("document_id")
);
--> statement-breakpoint
ALTER TABLE "document_comics" ADD CONSTRAINT "document_comics_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
