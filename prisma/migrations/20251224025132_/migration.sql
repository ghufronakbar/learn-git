/*
  Warnings:

  - You are about to drop the column `pathFile` on the `ContractVersion` table. All the data in the column will be lost.
  - Added the required column `hashFile` to the `ContractVersion` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ContractVersion" DROP COLUMN "pathFile",
ADD COLUMN     "hashFile" TEXT NOT NULL;
