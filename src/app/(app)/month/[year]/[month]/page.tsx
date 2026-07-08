import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { PeriodNav } from "@/components/PeriodNav";
import { getMonthReport } from "@/lib/services/reports";
import { MONTHS_DE, WEEKDAYS_DE, formatMinutes, todayParam } from "@/lib/time";

export default async function MonthPage({
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
    redirect(`/month/${ty}/${Number(tm)}`);
  }

  const report = await getMonthReport(session.user.id, year, month);

  const prevMonth = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const nextMonth = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  const [ty, tm] = todayParam().split("-");

  const pad = (n: number) => String(n).padStart(2, "0");
  const dayParam = (d: number) => `${year}-${pad(month)}-${pad(d)}`;

  return (
    <div>
      <PeriodNav
        title={`${MONTHS_DE[month - 1]} ${year}`}
        subtitle={`Monatssumme: ${formatMinutes(report.total)}`}
        prevHref={`/month/${prevMonth.y}/${prevMonth.m}`}
        nextHref={`/month/${nextMonth.y}/${nextMonth.m}`}
        todayHref={`/month/${ty}/${Number(tm)}`}
        todayLabel="Akt. Monat"
      />

      {report.projects.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-400">
          Keine Zeiten in diesem Monat erfasst.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left">
                <th className="px-3 py-2 font-medium text-slate-600">Tag</th>
                {report.projects.map((p) => (
                  <th key={p.id} className="px-3 py-2 text-right font-medium text-slate-600">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: p.color }}
                      />
                      {p.code}
                    </span>
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-semibold text-slate-700">Summe</th>
              </tr>
            </thead>
            <tbody>
              {report.days.map((day) => {
                const dayTotal = report.perDay[day] ?? 0;
                const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
                const isWeekend = weekday === 0 || weekday === 6;
                return (
                  <tr
                    key={day}
                    className={`border-b border-slate-100 last:border-b-0 ${
                      isWeekend ? "bg-slate-50/60" : ""
                    } ${dayTotal === 0 ? "text-slate-300" : ""}`}
                  >
                    <td className="whitespace-nowrap px-3 py-1.5">
                      <Link
                        href={`/day/${dayParam(day)}`}
                        className="text-slate-600 hover:text-blue-600 hover:underline"
                      >
                        {WEEKDAYS_DE[weekday]} {pad(day)}.
                      </Link>
                    </td>
                    {report.projects.map((p) => (
                      <td key={p.id} className="px-3 py-1.5 text-right tabular-nums">
                        {formatMinutes(report.cell[day]?.[p.id] ?? 0)}
                      </td>
                    ))}
                    <td className="px-3 py-1.5 text-right font-medium tabular-nums text-slate-800">
                      {formatMinutes(dayTotal)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-800">
                <td className="px-3 py-2">Gesamt</td>
                {report.projects.map((p) => (
                  <td key={p.id} className="px-3 py-2 text-right tabular-nums">
                    {formatMinutes(report.perProject[p.id] ?? 0)}
                  </td>
                ))}
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatMinutes(report.total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
