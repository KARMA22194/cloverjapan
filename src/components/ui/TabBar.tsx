import { cn } from "@/lib/cn";
import { SectionIcon } from "@/components/ui/SectionIcon";
import type { SectionId } from "@/lib/sectionIcons";

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
  /**
   * `icon` ist ein Bereichs-Schlüssel aus `SECTION_ICONS`, kein Emoji-Literal —
   * so kann ein Mitglied das Symbol im Profil durch ein eigenes Bild ersetzen.
   */
  items: readonly { key: K; label: string; icon?: SectionId }[];
  active: K;
  onSelect: (key: K) => void;
  /** Beschriftung der Leiste für Screenreader, z. B. „Geld-Bereiche". */
  label: string;
  /**
   * Präfix der Panel-IDs — muss zu den `id`s der `TabPanel`s passen.
   *
   * Optional, weil nicht jede Leiste **ein** Panel schaltet: der Reiseplaner
   * blendet mehrere verteilte Blöcke ein/aus. Dort bleibt `aria-controls` weg,
   * statt auf eine nicht existierende ID zu zeigen — ein toter Verweis ist für
   * Screenreader schlechter als keiner.
   */
  idPrefix?: string;
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
            aria-controls={idPrefix ? `${idPrefix}-${t.key}` : undefined}
            onClick={() => onSelect(t.key)}
            className={cn(
              "shrink-0 rounded-[0.5rem] px-3 py-1.5 text-sm font-semibold transition duration-150",
              on
                ? "bg-surface text-ink shadow-card ring-1 ring-hairline"
                : "text-ink-muted hover:bg-surface hover:text-ink",
            )}
          >
            {t.icon && <SectionIcon id={t.icon} size={18} className="mr-1.5" />}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
