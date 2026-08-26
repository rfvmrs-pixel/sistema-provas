ALTER TABLE "admins" ADD COLUMN "role" varchar(20) DEFAULT 'gestor' NOT NULL;--> statement-breakpoint
-- Contas já existentes sem Contrato (sector_id null) são o(s) admin(s) geral —
-- precisam virar role "admin" (o default "gestor" acima é só para linhas
-- novas com sector_id preenchido).
UPDATE "admins" SET "role" = 'admin' WHERE "sector_id" IS NULL;