-- Gesammelte Eki-Stamps pro Reise
CREATE TABLE "CollectedStamp" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "stampKey" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CollectedStamp_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CollectedStamp_tripId_stampKey_key" ON "CollectedStamp"("tripId", "stampKey");
ALTER TABLE "CollectedStamp" ADD CONSTRAINT "CollectedStamp_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
