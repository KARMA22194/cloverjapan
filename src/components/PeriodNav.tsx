import Link from "next/link";

// Generische Vor/Zurück/Heute-Navigation für Tag/Monat/Jahr.
export function PeriodNav({
  prevHref,
  nextHref,
  todayHref,
  todayLabel = "Heute",
  title,
  subtitle,
}: {
  prevHref: string;
  nextHref: string;
  todayHref: string;
  todayLabel?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-1">
        <Link
          href={prevHref}
          aria-label="Zurück"
          className="rounded-md border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          ‹
        </Link>
        <Link
          href={todayHref}
          className="rounded-md border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          {todayLabel}
        </Link>
        <Link
          href={nextHref}
          aria-label="Weiter"
          className="rounded-md border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          ›
        </Link>
      </div>
    </div>
  );
}
