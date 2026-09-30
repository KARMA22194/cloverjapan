-- Flug-Live-Status: echte UTC-Zeitpunkte + Fingerabdruck des letzten Standes.
--
-- `departure`/`arrival` tragen die ORTSZEIT ohne Zeitzone (Anzeige am Flughafen).
-- Für jede Rechnung mit "jetzt" ist das unbrauchbar: beim Rückflug aus Tokio
-- liegen Ortszeit und echter Augenblick neun Stunden auseinander. AeroDataBox
-- liefert die UTC-Zeit beim Abruf ohnehin mit.
--
-- Alles nullable und ohne Default: Altbestand und manuell erfasste Flüge haben
-- diese Werte nicht, und sie zu raten wäre schlimmer als sie wegzulassen.
ALTER TABLE "Flight" ADD COLUMN "departureUtc"  TIMESTAMP(3);
ALTER TABLE "Flight" ADD COLUMN "arrivalUtc"    TIMESTAMP(3);
ALTER TABLE "Flight" ADD COLUMN "liveSignature" TEXT;
ALTER TABLE "Flight" ADD COLUMN "liveCheckedAt" TIMESTAMP(3);
