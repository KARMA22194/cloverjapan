-- AlterTable: Aufgaben/Checklisten-Punkte einem Mitglied zuweisen (Namens-Schnappschuss)
ALTER TABLE "PlannerTask" ADD COLUMN "assigneeName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ChecklistItem" ADD COLUMN "assigneeName" TEXT NOT NULL DEFAULT '';
