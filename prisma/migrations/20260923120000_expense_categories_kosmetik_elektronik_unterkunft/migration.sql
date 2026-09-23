-- AlterEnum: drei neue Ausgaben-Kategorien.
--
-- Rein additiv: bestehende Zeilen behalten ihren Wert, es wird nichts
-- umgeschrieben. Die Position (BEFORE …) spiegelt nur die Reihenfolge im
-- Schema, damit `prisma migrate diff` danach keine Drift meldet.
--
-- ⚠️ `ADD VALUE` ist seit PostgreSQL 12 innerhalb einer Transaktion erlaubt,
-- solange der neue Wert nicht in **derselben** Transaktion benutzt wird —
-- deshalb steht hier ausschließlich das ALTER TYPE (kein UPDATE).
ALTER TYPE "ExpenseCategory" ADD VALUE 'KOSMETIK' BEFORE 'SIGHTSEEING';
ALTER TYPE "ExpenseCategory" ADD VALUE 'ELEKTRONIK' BEFORE 'SIGHTSEEING';
ALTER TYPE "ExpenseCategory" ADD VALUE 'UNTERKUNFT' BEFORE 'SONSTIGES';
