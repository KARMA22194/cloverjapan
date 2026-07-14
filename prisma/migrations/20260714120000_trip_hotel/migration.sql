-- CreateTable
CREATE TABLE "TripHotel" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "checkIn" TEXT,
    "checkOut" TEXT,
    "position" INTEGER NOT NULL,
    "createdByName" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "TripHotel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TripHotel_tripId_position_idx" ON "TripHotel"("tripId", "position");

-- AddForeignKey
ALTER TABLE "TripHotel" ADD CONSTRAINT "TripHotel_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
