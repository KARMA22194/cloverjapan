-- Beleg-Fotos aus Expense.receipt in eine eigene Tabelle auslagern.
--
-- Als Spalte konnte der (bis 1,5 MB große) Blob durch ein `select` ohne Feldliste
-- versehentlich mitgeladen werden. Mit eigener Tabelle ist das strukturell
-- ausgeschlossen; `Expense.hasReceipt` bleibt für die Listen-Anzeige.

CREATE TABLE "ExpenseReceipt" (
    "expenseId" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseReceipt_pkey" PRIMARY KEY ("expenseId")
);

ALTER TABLE "ExpenseReceipt"
  ADD CONSTRAINT "ExpenseReceipt_expenseId_fkey"
  FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Bestandsdaten übernehmen …
INSERT INTO "ExpenseReceipt" ("expenseId", "data")
SELECT "id", "receipt" FROM "Expense" WHERE "receipt" IS NOT NULL;

-- … hasReceipt konsistent nachziehen (falls es je auseinandergelaufen ist) …
UPDATE "Expense" SET "hasReceipt" = ("receipt" IS NOT NULL);

-- … und erst dann die alte Spalte entfernen.
ALTER TABLE "Expense" DROP COLUMN "receipt";
