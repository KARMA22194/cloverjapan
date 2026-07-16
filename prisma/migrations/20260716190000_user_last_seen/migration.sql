-- Präsenz: letzte App-Aktivität
ALTER TABLE "User" ADD COLUMN "lastSeenAt" TIMESTAMP(3);
