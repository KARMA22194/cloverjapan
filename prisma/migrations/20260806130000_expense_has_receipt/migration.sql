-- H7: hasReceipt spiegelt (receipt IS NOT NULL), damit die Ausgaben-Liste die großen
-- Beleg-Data-URLs nicht mehr mitladen muss.
ALTER TABLE "Expense" ADD COLUMN "hasReceipt" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Expense" SET "hasReceipt" = true WHERE "receipt" IS NOT NULL;
