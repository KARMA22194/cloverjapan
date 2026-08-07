import { cn } from "@/lib/cn";

/**
 * Segmentierte Tab-Leiste für die Bereiche `/geld`, `/programm`, `/info`.
 *
 * Statt der Unterstrich-Reiter jetzt ein Segment-Control: die aktive Fläche wird
 * als eigene Karte aus der eingelassenen Leiste herausgehoben. Das liest sich auf
 * dem Handy deutlich besser, weil ein 2px-Unterstrich dort kaum zu erkennen ist —
 * und die Leiste darf horizontal scrollen, statt in eine zweite Zeile zu brechen.
 *
 * `aria-controls` zeigt auf die Panel-IDs, die {@link TabPanel} vergibt
 * (`<idPrefix>-<key>`) — vorher fehlte die Verknüpfung ganz.
 */
export function TabBar<K extends string>({
  items,
  active,
  onSelect,
  label,
  idPrefix,
  className,
}: {
  items: readonly { key: K; label: string; emoji?: string }[];
  active: K;
  onSelect: (key: K) => void;
  /** Beschriftung der Leiste für Screenreader, z. B. „Geld-Bereiche". */
  label: string;
  /** Präfix der Panel-IDs — muss zu den `id`s der `TabPanel`s passen. */
  idPrefix: string;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        // `inline-flex` + `max-w-full`: die Leiste ist so breit wie ihre Segmente
        // (statt als leere Fläche über die ganze Spalte zu laufen) und scrollt
        // erst, wenn der Platz auf dem Handy nicht reicht.
        "mb-5 inline-flex max-w-full gap-1 overflow-x-auto rounded-field bg-surface-2 p-1 ring-1 ring-hairline",
        // Die Leiste scrollt bei Bedarf; die Segmente sollen dabei nicht schrumpfen.
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {items.map((t) => {
        const on = t.key === active;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={`${idPrefix}-${t.key}`}
            onClick={() => onSelect(t.key)}
            className={cn(
              "shrink-0 rounded-[0.5rem] px-3 py-1.5 text-sm font-semibold transition duration-150",
              on
                ? "bg-surface text-ink shadow-card ring-1 ring-hairline"
                : "text-ink-muted hover:bg-surface hover:text-ink",
            )}
          >
            {t.emoji && (
              <span aria-hidden className="mr-1">
                {t.emoji}
              </span>
            )}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
