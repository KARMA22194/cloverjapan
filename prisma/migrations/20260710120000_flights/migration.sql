-- CreateTable
CREATE TABLE "Flight" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "flightNumber" TEXT NOT NULL,
    "airline" TEXT NOT NULL DEFAULT '',
    "fromCode" TEXT NOT NULL DEFAULT '',
    "fromName" TEXT NOT NULL DEFAULT '',
    "toCode" TEXT NOT NULL DEFAULT '',
    "toName" TEXT NOT NULL DEFAULT '',
    "departure" TIMESTAMP(3),
    "arrival" TIMESTAMP(3),
    "bookingRef" TEXT NOT NULL DEFAULT '',
    "priceYen" INTEGER,
    "createdByName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Flight_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "flightId" TEXT;

-- CreateIndex
CREATE INDEX "Flight_tripId_idx" ON "Flight"("tripId");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_flightId_key" ON "Expense"("flightId");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_flightId_fkey" FOREIGN KEY ("flightId") REFERENCES "Flight"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flight" ADD CONSTRAINT "Flight_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
