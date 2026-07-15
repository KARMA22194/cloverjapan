-- AlterTable: Ausgabe geteilt (Abrechnung) oder persönlich
ALTER TABLE "Expense" ADD COLUMN "shared" BOOLEAN NOT NULL DEFAULT true;
