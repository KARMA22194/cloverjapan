-- Datums-Spalten von TEXT auf echtes DATE umstellen.
--
-- Vorher waren es Strings im Format YYYY-MM-DD: lexikografisch sortierbar, aber
-- ohne DB-seitige Validierung und ohne Range-Abfragen. Die API liefert weiterhin
-- YYYY-MM-DD (die DTOs wandeln über toDateParam), der Client bleibt unverändert.
--
-- `NULLIF(col, '')` fängt leere Strings ab, die sonst am Cast scheitern würden.
-- Ungültige Altwerte gibt es nach M13 nicht mehr; sollte doch einer existieren,
-- schlägt die Migration bewusst fehl, statt still Daten zu verlieren.

ALTER TABLE "TripStop"
  ALTER COLUMN "date" TYPE DATE USING NULLIF("date", '')::DATE;

ALTER TABLE "TripHotel"
  ALTER COLUMN "checkIn"  TYPE DATE USING NULLIF("checkIn", '')::DATE,
  ALTER COLUMN "checkOut" TYPE DATE USING NULLIF("checkOut", '')::DATE;

ALTER TABLE "Booking"
  ALTER COLUMN "date" TYPE DATE USING NULLIF("date", '')::DATE;
