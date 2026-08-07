-- Eigene Bereichs-Symbole pro Nutzer.
-- Spiegel-Flag am User, damit das Layout die Tabelle nur bei Bedarf abfragt.
ALTER TABLE "User" ADD COLUMN "customIcons" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "UserSectionIcon" (
    "userId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSectionIcon_pkey" PRIMARY KEY ("userId","section")
);

ALTER TABLE "UserSectionIcon" ADD CONSTRAINT "UserSectionIcon_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
