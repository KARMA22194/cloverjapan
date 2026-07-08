import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { PeriodNav } from "@/components/PeriodNav";
import { getMonthReport } from "@/lib/services/reports";
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

  const report = await getMonthReport(session.user.id, year, month);
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

            // Heatmap: Tagessumme → Brand-Deckkraft (funktioniert in Light & Dark);
            // Wochenenden ohne Buchung bekommen einen dezenten Slate-Ton.
            const alpha = minutes > 0 ? Math.min(0.14 + (minutes / 480) * 0.5, 0.7) : 0;
            const bg =
              minutes > 0
                ? `rgba(0, 155, 201, ${alpha})`
                : isWeekend
                  ? "rgba(100, 116, 139, 0.08)"
                  : undefined;

            return (
              <Link
                key={dateStr}
                href={`/day/${dateStr}`}
                style={bg ? { backgroundColor: bg } : undefined}
                className={`flex min-h-24 flex-col justify-between border-b border-r border-slate-100 dark:border-slate-800 p-2 transition hover:ring-2 hover:ring-inset hover:ring-brand ${
                  isToday ? "ring-2 ring-inset ring-brand" : ""
                }`}
              >
                <span
                  className={`text-sm ${
                    isToday
                      ? "font-bold text-brand-dark dark:text-brand"
                      : "font-medium text-slate-700 dark:text-slate-200"
                  }`}
                >
                  {d}
                </span>
                {minutes > 0 && (
                  <span className="text-right text-xs font-medium tabular-nums text-slate-700 dark:text-slate-100">
                    {minutesToHours(minutes)} h
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
        Klicke einen Tag an, um Zeiten zu erfassen oder zu bearbeiten.
      </p>
    </div>
  );
}
