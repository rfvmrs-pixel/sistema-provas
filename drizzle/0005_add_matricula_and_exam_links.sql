CREATE TABLE "exam_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"exam_id" integer NOT NULL,
	"token" varchar(40) NOT NULL,
	"kind" varchar(20) DEFAULT 'geral' NOT NULL,
	"target_employee_id" integer,
	"label" varchar(150),
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "exam_links_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "exam_link_id" integer;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "matricula" varchar(50);--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "tempo_de_empresa" varchar(10);--> statement-breakpoint
ALTER TABLE "exam_links" ADD CONSTRAINT "exam_links_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_links" ADD CONSTRAINT "exam_links_target_employee_id_employees_id_fk" FOREIGN KEY ("target_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exam_links_exam_idx" ON "exam_links" USING btree ("exam_id");--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_exam_link_id_exam_links_id_fk" FOREIGN KEY ("exam_link_id") REFERENCES "public"."exam_links"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "employees_matricula_sector_unique" ON "employees" USING btree ("matricula","sector_id");