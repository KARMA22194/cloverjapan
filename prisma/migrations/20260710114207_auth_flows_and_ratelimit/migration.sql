-- CreateEnum
CREATE TYPE "TokenType" AS ENUM ('EMAIL_VERIFY', 'PASSWORD_RESET');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerified" TIMESTAMP(3);

-- Backfill: alle bereits bestehenden Konten gelten als bestätigt (sonst würden sie
-- durch die neue Login-Sperre für unbestätigte E-Mails ausgesperrt). Nur künftige
-- Selbst-Registrierungen starten unbestätigt.
UPDATE "User" SET "emailVerified" = CURRENT_TIMESTAMP WHERE "emailVerified" IS NULL;

-- CreateTable
CREATE TABLE "Token" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "TokenType" NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "resetAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Token_token_key" ON "Token"("token");

-- CreateIndex
CREATE INDEX "Token_userId_type_idx" ON "Token"("userId", "type");

-- CreateIndex
CREATE INDEX "RateLimit_resetAt_idx" ON "RateLimit"("resetAt");

-- AddForeignKey
ALTER TABLE "Token" ADD CONSTRAINT "Token_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
