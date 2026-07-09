/*
  Warnings:

  - You are about to drop the column `userId` on the `ChecklistItem` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `Expense` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `PlannerTask` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `TripStop` table. All the data in the column will be lost.
  - Added the required column `tripId` to the `ChecklistItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tripId` to the `Expense` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tripId` to the `PlannerTask` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tripId` to the `TripStop` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "ChecklistItem" DROP CONSTRAINT "ChecklistItem_userId_fkey";

-- DropForeignKey
ALTER TABLE "Expense" DROP CONSTRAINT "Expense_userId_fkey";

-- DropForeignKey
ALTER TABLE "PlannerTask" DROP CONSTRAINT "PlannerTask_userId_fkey";

-- DropForeignKey
ALTER TABLE "TripStop" DROP CONSTRAINT "TripStop_userId_fkey";

-- DropIndex
DROP INDEX "ChecklistItem_userId_position_idx";

-- DropIndex
DROP INDEX "Expense_userId_idx";

-- DropIndex
DROP INDEX "PlannerTask_userId_date_idx";

-- DropIndex
DROP INDEX "TripStop_userId_position_idx";

-- AlterTable
ALTER TABLE "ChecklistItem" DROP COLUMN "userId",
ADD COLUMN     "tripId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Expense" DROP COLUMN "userId",
ADD COLUMN     "tripId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "PlannerTask" DROP COLUMN "userId",
ADD COLUMN     "tripId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "TripStop" DROP COLUMN "userId",
ADD COLUMN     "tripId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Japan-Reise',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripMember" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TripMember_userId_key" ON "TripMember"("userId");

-- CreateIndex
CREATE INDEX "TripMember_tripId_idx" ON "TripMember"("tripId");

-- CreateIndex
CREATE INDEX "ChecklistItem_tripId_position_idx" ON "ChecklistItem"("tripId", "position");

-- CreateIndex
CREATE INDEX "Expense_tripId_idx" ON "Expense"("tripId");

-- CreateIndex
CREATE INDEX "PlannerTask_tripId_date_idx" ON "PlannerTask"("tripId", "date");

-- CreateIndex
CREATE INDEX "TripStop_tripId_position_idx" ON "TripStop"("tripId", "position");

-- AddForeignKey
ALTER TABLE "TripMember" ADD CONSTRAINT "TripMember_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripMember" ADD CONSTRAINT "TripMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripStop" ADD CONSTRAINT "TripStop_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannerTask" ADD CONSTRAINT "PlannerTask_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
