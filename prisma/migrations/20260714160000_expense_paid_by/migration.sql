-- AlterTable: Zahler der Ausgabe (für die Abrechnung)
ALTER TABLE "Expense" ADD COLUMN "paidById" TEXT;

-- CreateIndex
CREATE INDEX "Expense_paidById_idx" ON "Expense"("paidById");

-- AddForeignKey (Zahler aus der Reise entfernt → SetNull)
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
