-- M2: Session-Versionierung. Passwort-Reset erhöht den Wert → alte JWTs werden
-- beim nächsten Request/SSR-Read abgewiesen (echtes Session-Revoke).
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
