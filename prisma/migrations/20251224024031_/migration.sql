/*
  Warnings:

  - A unique constraint covering the columns `[hash]` on the table `AppStorage` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `hash` to the `AppStorage` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "AppStorage" ADD COLUMN     "hash" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "AppStorage_hash_key" ON "AppStorage"("hash");
