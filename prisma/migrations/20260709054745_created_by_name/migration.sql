-- AlterTable
ALTER TABLE "ChecklistItem" ADD COLUMN     "createdByName" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "createdByName" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "PlannerTask" ADD COLUMN     "createdByName" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "TripStop" ADD COLUMN     "createdByName" TEXT NOT NULL DEFAULT '';
