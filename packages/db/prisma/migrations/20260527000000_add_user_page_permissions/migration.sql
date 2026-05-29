CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE "user_page_permissions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" VARCHAR(36) NOT NULL,
  "project_id" VARCHAR(255) NOT NULL,
  "page_key" VARCHAR(100) NOT NULL,
  "is_allowed" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "user_page_permissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_user_page_permission"
  ON "user_page_permissions"("user_id", "project_id", "page_key");

CREATE INDEX "idx_user_page_permission_user_project"
  ON "user_page_permissions"("user_id", "project_id");

CREATE INDEX "idx_user_page_permission_project_page"
  ON "user_page_permissions"("project_id", "page_key");

ALTER TABLE "user_page_permissions"
  ADD CONSTRAINT "user_page_permissions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_page_permissions"
  ADD CONSTRAINT "user_page_permissions_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;