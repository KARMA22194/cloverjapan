-- Persönliches Budget pro Mitglied und Reise.
--
-- Das Gesamtbudget als Spalte am `TripMember`: der ist genau das Paar
-- (Nutzer, Reise), eine eigene Tabelle hätte dieselbe Beziehung noch einmal
-- modelliert. Die Teilbudgets je Kategorie brauchen eine eigene Zeile, weil die
-- Kategorienliste offen ist.
--
-- Bis hierher lagen beide Werte im `localStorage` des jeweiligen Browsers —
-- also pro Gerät, und beim Leeren der Browserdaten weg. Der Client übernimmt
-- einen dort vorhandenen Stand einmalig.
ALTER TABLE "TripMember" ADD COLUMN "budgetYen" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "MemberCategoryBudget" (
    "tripMemberId" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "yen" INTEGER NOT NULL,

    CONSTRAINT "MemberCategoryBudget_pkey" PRIMARY KEY ("tripMemberId","category")
);

ALTER TABLE "MemberCategoryBudget"
  ADD CONSTRAINT "MemberCategoryBudget_tripMemberId_fkey"
  FOREIGN KEY ("tripMemberId") REFERENCES "TripMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
