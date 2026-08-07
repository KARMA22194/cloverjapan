-- Composite-Indizes passend zu den tatsächlich genutzten Listen-Abfragen
-- (Filter auf tripId + Sortierung). Postgres liest damit sortiert aus dem Index,
-- statt die Treffermenge nachträglich zu sortieren.
--
-- Die bisherigen reinen tripId-Indizes werden ersetzt: ein Index auf
-- (tripId, x) bedient Abfragen auf tripId allein genauso gut (Präfix-Regel).

-- Expense: orderBy createdAt asc
DROP INDEX IF EXISTS "Expense_tripId_idx";
CREATE INDEX "Expense_tripId_createdAt_idx" ON "Expense"("tripId", "createdAt");

-- Booking: orderBy [date asc, time asc, createdAt asc]
DROP INDEX IF EXISTS "Booking_tripId_idx";
CREATE INDEX "Booking_tripId_date_time_idx" ON "Booking"("tripId", "date", "time");

-- Flight: orderBy [departure asc, createdAt asc]
DROP INDEX IF EXISTS "Flight_tripId_idx";
CREATE INDEX "Flight_tripId_departure_idx" ON "Flight"("tripId", "departure");

-- Settlement: orderBy createdAt asc
DROP INDEX IF EXISTS "Settlement_tripId_idx";
CREATE INDEX "Settlement_tripId_createdAt_idx" ON "Settlement"("tripId", "createdAt");

-- LuggageTag: orderBy createdAt asc
DROP INDEX IF EXISTS "LuggageTag_tripId_idx";
CREATE INDEX "LuggageTag_tripId_createdAt_idx" ON "LuggageTag"("tripId", "createdAt");

-- PlannerTask: orderBy [date asc, time asc, createdAt asc] — time ergänzt
DROP INDEX IF EXISTS "PlannerTask_tripId_date_idx";
CREATE INDEX "PlannerTask_tripId_date_time_idx" ON "PlannerTask"("tripId", "date", "time");
