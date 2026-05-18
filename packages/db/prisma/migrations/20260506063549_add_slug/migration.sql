/*
  Warnings:

  - Added the required column `slug` to the `projects` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "user_sessions_token_key";

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "createdBy" VARCHAR(36),
ADD COLUMN     "slug" VARCHAR(255) NOT NULL;
