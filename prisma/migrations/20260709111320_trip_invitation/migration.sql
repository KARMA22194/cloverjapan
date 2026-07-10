-- CreateTable
CREATE TABLE "TripInvitation" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "invitedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "TripInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TripInvitation_token_key" ON "TripInvitation"("token");

-- CreateIndex
CREATE INDEX "TripInvitation_tripId_idx" ON "TripInvitation"("tripId");

-- CreateIndex
CREATE INDEX "TripInvitation_email_idx" ON "TripInvitation"("email");

-- AddForeignKey
ALTER TABLE "TripInvitation" ADD CONSTRAINT "TripInvitation_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
