ALTER TABLE "exam_schedules" ADD COLUMN "kind" varchar(20) DEFAULT 'geral' NOT NULL;--> statement-breakpoint
ALTER TABLE "exam_schedules" ADD COLUMN "role_id" integer;--> statement-breakpoint
ALTER TABLE "exam_schedules" ADD COLUMN "num_questions" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "exam_schedules" ADD COLUMN "target_employee_name" varchar(150);--> statement-breakpoint
ALTER TABLE "exam_schedules" ADD COLUMN "target_employee_matricula" varchar(50);--> statement-breakpoint
ALTER TABLE "exam_schedules" ADD COLUMN "exam_id" integer;--> statement-breakpoint
ALTER TABLE "exam_schedules" ADD COLUMN "exam_link_id" integer;--> statement-breakpoint
ALTER TABLE "exam_schedules" ADD CONSTRAINT "exam_schedules_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_schedules" ADD CONSTRAINT "exam_schedules_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_schedules" ADD CONSTRAINT "exam_schedules_exam_link_id_exam_links_id_fk" FOREIGN KEY ("exam_link_id") REFERENCES "public"."exam_links"("id") ON DELETE set null ON UPDATE no action;