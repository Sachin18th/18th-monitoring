/*
  Warnings:

  - You are about to drop the column `customer_email_encrypted` on the `storefront_sessions` table. All the data in the column will be lost.
  - You are about to drop the column `customer_email_hash` on the `storefront_sessions` table. All the data in the column will be lost.
  - You are about to drop the column `customer_id` on the `storefront_sessions` table. All the data in the column will be lost.
  - You are about to drop the column `customer_name` on the `storefront_sessions` table. All the data in the column will be lost.
  - You are about to drop the column `identity_meta` on the `storefront_sessions` table. All the data in the column will be lost.
  - You are about to drop the column `identity_source` on the `storefront_sessions` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "idx_storefront_event_visitor";

-- DropIndex
DROP INDEX "idx_storefront_session_email_hash";

-- AlterTable
ALTER TABLE "storefront_sessions" DROP COLUMN "customer_email_encrypted",
DROP COLUMN "customer_email_hash",
DROP COLUMN "customer_id",
DROP COLUMN "customer_name",
DROP COLUMN "identity_meta",
DROP COLUMN "identity_source";
