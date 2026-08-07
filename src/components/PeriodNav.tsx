import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";

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
        <h1 className="text-xl font-semibold text-ink">{title}</h1>
        {subtitle && <p className="text-sm text-ink-muted">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-1">
        <Link
          href={prevHref}
          aria-label="Zurück"
          className={buttonClasses("secondary", "md")}
        >
          ‹
        </Link>
        <Link
          href={todayHref}
          className={buttonClasses("secondary", "md")}
        >
          {todayLabel}
        </Link>
        <Link
          href={nextHref}
          aria-label="Weiter"
          className={buttonClasses("secondary", "md")}
        >
          ›
        </Link>
      </div>
    </div>
  );
}
