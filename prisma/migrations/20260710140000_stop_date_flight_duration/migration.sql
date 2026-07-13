-- Reisetag je Stopp (Verknüpfung Reiseplaner ↔ Tagesplaner)
ALTER TABLE "TripStop" ADD COLUMN "date" TEXT;

-- Echte Flugdauer (aus UTC-Zeiten beim Abruf)
ALTER TABLE "Flight" ADD COLUMN "durationMin" INTEGER;
