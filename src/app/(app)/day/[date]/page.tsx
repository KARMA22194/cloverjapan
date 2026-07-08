import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { PeriodNav } from "@/components/PeriodNav";
import { NewEntryForm } from "@/components/NewEntryForm";
import { EntryRow, type EntryData } from "@/components/EntryRow";
import { DayNotes } from "@/components/DayNotes";
import { getDayEntries } from "@/lib/services/timeEntries";
import { getBookableProjects } from "@/lib/services/projects";
import { getDayNotes } from "@/lib/services/notes";
import { toNoteDto } from "@/lib/api/dto";
import {
  parseDateParam,
  toDateParam,
  addDays,
  formatDateLong,
  formatMinutes,
  minutesToHours,
  todayParam,
} from "@/lib/time";

export default async function DayPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const userId = session.user.id;

  const { date: dateParam } = await params;

  // Ungültiges Datum → heute.
  let date: Date;
  try {
    date = parseDateParam(dateParam);
  } catch {
    redirect(`/day/${todayParam()}`);
  }

  const [entries, projects, notes] = await Promise.all([
    getDayEntries(userId, dateParam),
    getBookableProjects(userId),
    getDayNotes(userId, dateParam),
  ]);
  const noteDtos = notes.map(toNoteDto);

  const total = entries.reduce((sum, e) => sum + e.minutes, 0);
  const projectOptions = projects.map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code,
    color: p.color,
  }));

  const rows: EntryData[] = entries.map((e) => ({
    id: e.id,
    projectId: e.projectId,
    hours: minutesToHours(e.minutes),
    hoursLabel: String(minutesToHours(e.minutes)),
    minutesLabel: formatMinutes(e.minutes),
    note: e.note,
    project: {
      id: e.project.id,
      name: e.project.name,
      code: e.project.code,
      color: e.project.color,
    },
  }));

  const prev = toDateParam(addDays(date, -1));
  const next = toDateParam(addDays(date, 1));

  return (
    <div>
      <PeriodNav
        title={formatDateLong(date)}
        subtitle={`Tagessumme: ${formatMinutes(total)}`}
        prevHref={`/day/${prev}`}
        nextHref={`/day/${next}`}
        todayHref={`/day/${todayParam()}`}
      />

      <div className="mb-6">
        <NewEntryForm dateParam={dateParam} projects={projectOptions} />
      </div>

      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-500">
            Noch keine Zeiten für diesen Tag erfasst.
          </p>
        ) : (
          rows.map((entry) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              dateParam={dateParam}
              projects={projectOptions}
            />
          ))
        )}
      </div>

      <DayNotes dateParam={dateParam} notes={noteDtos} />
    </div>
  );
}
