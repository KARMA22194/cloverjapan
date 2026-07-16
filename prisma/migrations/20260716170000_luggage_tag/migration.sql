-- Digitaler Kofferanhänger (QR-Code → Finder-Seite)
CREATE TABLE "LuggageTag" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "notifyEmail" TEXT NOT NULL DEFAULT '',
    "whatsapp" TEXT NOT NULL DEFAULT '',
    "createdByName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LuggageTag_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LuggageTag_token_key" ON "LuggageTag"("token");
CREATE INDEX "LuggageTag_tripId_idx" ON "LuggageTag"("tripId");
ALTER TABLE "LuggageTag" ADD CONSTRAINT "LuggageTag_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
