CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE "otp_codes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" VARCHAR(36) NOT NULL,
  "email" VARCHAR(255) NOT NULL,
  "code_hash" VARCHAR(255) NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "consumed_at" TIMESTAMP(3),
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_otp_user" ON "otp_codes"("user_id");

CREATE INDEX "idx_otp_email" ON "otp_codes"("email");

CREATE INDEX "idx_otp_expires" ON "otp_codes"("expires_at");

ALTER TABLE "otp_codes"
  ADD CONSTRAINT "otp_codes_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;