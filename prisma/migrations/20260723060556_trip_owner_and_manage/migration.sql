-- AlterTable
ALTER TABLE "Trip" ADD COLUMN     "ownerId" TEXT;

-- AlterTable
ALTER TABLE "TripMember" ADD COLUMN     "canManage" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: bestehende Reisen bekommen als Owner das früheste (erste) Mitglied.
UPDATE "Trip" t
SET "ownerId" = (
  SELECT tm."userId"
  FROM "TripMember" tm
  WHERE tm."tripId" = t.id
  ORDER BY tm."joinedAt" ASC, tm."id" ASC
  LIMIT 1
)
WHERE t."ownerId" IS NULL;
