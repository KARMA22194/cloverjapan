-- AlterTable: Stopps können gespeichert bleiben, ohne Teil der aktuellen Route zu sein.
ALTER TABLE "TripStop" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
