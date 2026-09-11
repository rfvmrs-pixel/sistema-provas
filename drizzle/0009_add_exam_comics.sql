CREATE TABLE "exam_comics" (
	"id" serial PRIMARY KEY NOT NULL,
	"exam_id" integer NOT NULL,
	"images" jsonb NOT NULL,
	"correct_index" integer NOT NULL,
	"explanation" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "exam_comics_exam_id_unique" UNIQUE("exam_id")
);
--> statement-breakpoint
ALTER TABLE "exam_comics" ADD CONSTRAINT "exam_comics_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;