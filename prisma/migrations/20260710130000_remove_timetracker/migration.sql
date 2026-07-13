-- Timetracker entfernt: nur noch Japan-Reise. Tabellen + Enum löschen.
-- CASCADE entfernt zugehörige Foreign-Key-Constraints/Indizes mit.

-- DropTable
DROP TABLE IF EXISTS "Note" CASCADE;
DROP TABLE IF EXISTS "TimeEntry" CASCADE;
DROP TABLE IF EXISTS "Assignment" CASCADE;
DROP TABLE IF EXISTS "Project" CASCADE;

-- DropEnum
DROP TYPE IF EXISTS "NoteCategory";
