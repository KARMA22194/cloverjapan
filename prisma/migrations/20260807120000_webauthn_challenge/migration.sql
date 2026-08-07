-- WebAuthn-Challenges: Einmal-Verwendung serverseitig durchsetzen.
-- Eigene Tabelle (nicht `Token`), weil beim Passkey-Login der Nutzer zum
-- Zeitpunkt der Ausstellung noch unbekannt ist.
CREATE TABLE "WebauthnChallenge" (
    "challenge" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebauthnChallenge_pkey" PRIMARY KEY ("challenge")
);

-- Für das Aufräumen abgelaufener Challenges.
CREATE INDEX "WebauthnChallenge_expiresAt_idx" ON "WebauthnChallenge"("expiresAt");
