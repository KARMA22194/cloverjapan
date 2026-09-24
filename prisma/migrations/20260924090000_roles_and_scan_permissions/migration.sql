-- Rollen auf USER/ADMIN eindampfen + zwei getrennte Beleg-Rechte.

-- AlterEnum
--
-- Enum-Werte lassen sich in PostgreSQL nicht entfernen; der Typ muss getauscht
-- werden. `EMPLOYEE` und `MANAGER` werden dabei zu `USER` — `MANAGER` wurde im
-- Code nirgends abgefragt, es geht also keine Berechtigung verloren.
-- Das DEFAULT muss vor dem Typwechsel weg, sonst scheitert der Cast.
CREATE TYPE "Role_new" AS ENUM ('USER', 'ADMIN');
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new"
  USING (CASE WHEN "role"::text = 'ADMIN' THEN 'ADMIN' ELSE 'USER' END)::"Role_new";
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "Role_old";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'USER';

-- AlterTable
--
-- Unterschiedliche Voreinstellungen mit Absicht: Fotografieren konnte bisher
-- jeder und kostet nichts, das bleibt so. Scannen ruft eine kostenpflichtige
-- API auf — das muss ein Admin bewusst freigeben.
ALTER TABLE "User" ADD COLUMN "canAiScan" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "canReceiptPhoto" BOOLEAN NOT NULL DEFAULT true;

-- Ohne diese Zeile stünde nach dem Deploy niemand mehr da, der scannen darf —
-- auch nicht der Admin, der das Recht vergeben soll.
UPDATE "User" SET "canAiScan" = true WHERE "role" = 'ADMIN';
