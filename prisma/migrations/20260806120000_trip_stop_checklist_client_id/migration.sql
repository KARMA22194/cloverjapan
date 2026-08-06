-- K5: Client-vergebene Primärschlüssel entfernen. Der server-seitige `id` bleibt PK
-- (künftig cuid, vom Client nie gesetzt); die stabile Client-Kennung wandert nach
-- `clientId`, pro Reise eindeutig. Bestand: clientId = bisheriger id-Wert.

-- TripStop
ALTER TABLE "TripStop" ADD COLUMN "clientId" TEXT;
UPDATE "TripStop" SET "clientId" = "id" WHERE "clientId" IS NULL;
ALTER TABLE "TripStop" ALTER COLUMN "clientId" SET NOT NULL;
CREATE UNIQUE INDEX "TripStop_tripId_clientId_key" ON "TripStop"("tripId", "clientId");

-- ChecklistItem
ALTER TABLE "ChecklistItem" ADD COLUMN "clientId" TEXT;
UPDATE "ChecklistItem" SET "clientId" = "id" WHERE "clientId" IS NULL;
ALTER TABLE "ChecklistItem" ALTER COLUMN "clientId" SET NOT NULL;
CREATE UNIQUE INDEX "ChecklistItem_tripId_clientId_key" ON "ChecklistItem"("tripId", "clientId");
