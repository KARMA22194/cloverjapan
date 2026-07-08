import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { PeriodNav } from "@/components/PeriodNav";
import { getYearReport } from "@/lib/services/reports";
import { MONTHS_DE, formatMinutes, todayParam } from "@/lib/time";

export default async function YearPage({
  params,
}: {
  params: Promise<{ year: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { year: yearStr } = await params;
  const year = Number(yearStr);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    redirect(`/year/${todayParam().slice(0, 4)}`);
  }

  const report = await getYearReport(session.user.id, year);
  const currentYear = Number(todayParam().slice(0, 4));

  return (
    <div>
      <PeriodNav
        title={`Jahr ${year}`}
        subtitle={`Jahressumme: ${formatMinutes(report.total)}`}
        prevHref={`/year/${year - 1}`}
        nextHref={`/year/${year + 1}`}
        todayHref={`/year/${currentYear}`}
        todayLabel="Akt. Jahr"
      />

      {report.projects.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-400">
          Keine Zeiten in diesem Jahr erfasst.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left">
                <th className="px-3 py-2 font-medium text-slate-600">Monat</th>
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
              {report.months.map((m) => {
                const monthTotal = report.perMonth[m] ?? 0;
                return (
                  <tr
                    key={m}
                    className={`border-b border-slate-100 last:border-b-0 ${
                      monthTotal === 0 ? "text-slate-300" : ""
                    }`}
                  >
                    <td className="whitespace-nowrap px-3 py-1.5">
                      <Link
                        href={`/month/${year}/${m}`}
                        className="text-slate-600 hover:text-blue-600 hover:underline"
                      >
                        {MONTHS_DE[m - 1]}
                      </Link>
                    </td>
                    {report.projects.map((p) => (
                      <td key={p.id} className="px-3 py-1.5 text-right tabular-nums">
                        {formatMinutes(report.cell[m]?.[p.id] ?? 0)}
                      </td>
                    ))}
                    <td className="px-3 py-1.5 text-right font-medium tabular-nums text-slate-800">
                      {formatMinutes(monthTotal)}
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
