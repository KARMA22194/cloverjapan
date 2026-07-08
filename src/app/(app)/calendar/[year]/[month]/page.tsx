import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { PeriodNav } from "@/components/PeriodNav";
import { getMonthReport } from "@/lib/services/reports";
import { getMonthNotes } from "@/lib/services/notes";
import { NOTE_CATEGORIES, noteCategoryMeta } from "@/lib/notes";
import { MONTHS_DE, formatMinutes, minutesToHours, todayParam } from "@/lib/time";

// Montag-zuerst (getUTCDay: 0=So … 6=Sa → (d+6)%7: 0=Mo … 6=So).
const WEEKDAYS_MO = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

export default async function CalendarPage({
  params,
}: {
  params: Promise<{ year: string; month: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { year: yearStr, month: monthStr } = await params;
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    const [ty, tm] = todayParam().split("-");
    redirect(`/calendar/${ty}/${Number(tm)}`);
  }

  const [report, monthNotes] = await Promise.all([
    getMonthReport(session.user.id, year, month),
    getMonthNotes(session.user.id, year, month),
  ]);

  // Notizen pro Tag gruppieren (Tag = UTC-Tag des @db.Date).
  const notesByDay = new Map<number, { content: string; category: string }[]>();
  for (const n of monthNotes) {
    const day = n.date.getUTCDate();
    const list = notesByDay.get(day) ?? [];
    list.push({ content: n.content, category: n.category });
    notesByDay.set(day, list);
  }

  const daysInMonth = report.days.length;
  const firstDow = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const today = todayParam();

  const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  const [ty, tm] = today.split("-");
  const pad = (n: number) => String(n).padStart(2, "0");

  // Zellen: führende Leerzellen bis zum 1., dann die Tage, dann Auffüllen auf volle Wochen.
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div>
      <PeriodNav
        title={`Kalender · ${MONTHS_DE[month - 1]} ${year}`}
        subtitle={`Monatssumme: ${formatMinutes(report.total)}`}
        prevHref={`/calendar/${prev.y}/${prev.m}`}
        nextHref={`/calendar/${next.y}/${next.m}`}
        todayHref={`/calendar/${ty}/${Number(tm)}`}
        todayLabel="Akt. Monat"
      />

      <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        {/* Wochentags-Kopf */}
        <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-medium text-slate-500 dark:text-slate-400">
          {WEEKDAYS_MO.map((w) => (
            <div key={w} className="px-2 py-2 text-center">
              {w}
            </div>
          ))}
        </div>

        {/* Tages-Raster */}
        <div className="grid grid-cols-7">
          {cells.map((d, i) => {
            if (d === null) {
              return (
                <div
                  key={`empty-${i}`}
                  className="min-h-24 border-b border-r border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/40"
                />
              );
            }

            const dateStr = `${year}-${pad(month)}-${pad(d)}`;
            const minutes = report.perDay[d] ?? 0;
            const dow = (new Date(Date.UTC(year, month - 1, d)).getUTCDay() + 6) % 7;
            const isWeekend = dow >= 5;
            const isToday = dateStr === today;

            const dayNotes = notesByDay.get(d) ?? [];
            const hasNotes = dayNotes.length > 0;
            // Tage mit Notizen nehmen die Kategorie-Farbe an (alle Notizen eines
            // Tages haben dieselbe, weil die Kategorie am Wochentag hängt).
            const noteColor = hasNotes ? noteCategoryMeta(dayNotes[0].category).color : null;

            // Hintergrund-Priorität: Notiz-Farbe > Stunden-Heatmap > Wochenend-Ton.
            const alpha = minutes > 0 ? Math.min(0.14 + (minutes / 480) * 0.5, 0.7) : 0;
            const bg = noteColor
              ? noteColor
              : minutes > 0
                ? `rgba(0, 155, 201, ${alpha})`
                : isWeekend
                  ? "rgba(100, 116, 139, 0.08)"
                  : undefined;

            // Auf einer hellen Notiz-Kachel immer dunkler Text (Pastellfarbe).
            const dayNumClass = isToday
              ? "font-bold text-brand-dark"
              : hasNotes
                ? "font-medium text-slate-800"
                : "font-medium text-slate-700 dark:text-slate-200";
            const hoursClass = hasNotes
              ? "text-slate-700"
              : "text-slate-700 dark:text-slate-100";

            return (
              <Link
                key={dateStr}
                href={`/day/${dateStr}`}
                style={bg ? { backgroundColor: bg } : undefined}
                className={`flex min-h-28 flex-col gap-1 border-b border-r border-slate-100 dark:border-slate-800 p-2 transition hover:ring-2 hover:ring-inset hover:ring-brand ${
                  isToday ? "ring-2 ring-inset ring-brand" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-1">
                  <span className={`text-sm ${dayNumClass}`}>{d}</span>
                  {minutes > 0 && (
                    <span className={`text-xs font-medium tabular-nums ${hoursClass}`}>
                      {minutesToHours(minutes)} h
                    </span>
                  )}
                </div>

                {hasNotes && (
                  <div className="space-y-0.5 overflow-hidden">
                    {dayNotes.slice(0, 2).map((n, idx) => (
                      <p
                        key={idx}
                        className="truncate rounded bg-black/5 px-1 py-0.5 text-[11px] leading-tight text-slate-700"
                        title={n.content}
                      >
                        {n.content}
                      </p>
                    ))}
                    {dayNotes.length > 2 && (
                      <p className="text-[10px] text-slate-600">
                        +{dayNotes.length - 2} weitere
                      </p>
                    )}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Legende: was welche Farbe bedeutet */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
        <span className="font-medium text-slate-600 dark:text-slate-300">Farben:</span>
        {NOTE_CATEGORIES.map((c) => (
          <span key={c.value} className="inline-flex items-center gap-1.5">
            <span
              className="h-3 w-3 rounded-sm border border-black/10"
              style={{ backgroundColor: c.color }}
            />
            {c.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-3 w-3 rounded-sm border border-black/10"
            style={{ backgroundColor: "rgba(0, 155, 201, 0.5)" }}
          />
          gebuchte Stunden
        </span>
      </div>

      <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
        Tage mit Notizen zeigen deren Farbe · klicke einen Tag an, um Zeiten oder Notizen zu erfassen.
      </p>
    </div>
  );
}
