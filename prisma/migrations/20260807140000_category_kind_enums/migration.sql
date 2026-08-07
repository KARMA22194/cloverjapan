-- Expense.category und Booking.kind von String auf echte Enums umstellen.
-- Vorher akzeptierte die DB jeden Text; die erlaubten Werte standen nur im
-- Kommentar bzw. im Zod-Schema.
--
-- Unerwartete Altwerte werden auf SONSTIGES bzw. TICKET abgebildet, damit die
-- Migration auch bei historischen Daten durchläuft (statt hart zu scheitern).

CREATE TYPE "ExpenseCategory" AS ENUM ('ESSEN', 'FIGUREN', 'KLEIDUNG', 'SIGHTSEEING', 'TRANSPORT', 'SONSTIGES');
CREATE TYPE "BookingKind" AS ENUM ('TICKET', 'RESTAURANT', 'AKTIVITAET', 'TRANSPORT', 'SONSTIGES');

-- Altwerte normalisieren (Groß-/Kleinschreibung, Leerzeichen, Unbekanntes).
UPDATE "Expense"
SET "category" = CASE
    WHEN upper(btrim("category")) IN ('ESSEN', 'FIGUREN', 'KLEIDUNG', 'SIGHTSEEING', 'TRANSPORT', 'SONSTIGES')
      THEN upper(btrim("category"))
    ELSE 'SONSTIGES'
  END;

UPDATE "Booking"
SET "kind" = CASE
    WHEN upper(btrim("kind")) IN ('TICKET', 'RESTAURANT', 'AKTIVITAET', 'TRANSPORT', 'SONSTIGES')
      THEN upper(btrim("kind"))
    ELSE 'TICKET'
  END;

ALTER TABLE "Expense"
  ALTER COLUMN "category" TYPE "ExpenseCategory" USING "category"::"ExpenseCategory";

ALTER TABLE "Booking"
  ALTER COLUMN "kind" DROP DEFAULT,
  ALTER COLUMN "kind" TYPE "BookingKind" USING "kind"::"BookingKind",
  ALTER COLUMN "kind" SET DEFAULT 'TICKET';
