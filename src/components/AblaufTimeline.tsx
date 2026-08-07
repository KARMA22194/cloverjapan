import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getActiveTripId } from "@/lib/services/trip";
import { listFlights } from "@/lib/services/flightsService";
import { listBookings } from "@/lib/services/bookingsService";
import { getTripStops } from "@/lib/services/tripStops";
import { getAllPlannerTasks } from "@/lib/services/plannerTasks";
import { toDateParam } from "@/lib/time";

interface Entry {
  time: string; // "HH:MM" oder ""
  kind: "flight" | "stop" | "task" | "booking";
  emoji: string;
  label: string;
  sub?: string;
  done?: boolean;
  href?: string;
}

const BOOKING_EMOJI: Record<string, string> = {
  TICKET: "🎟️",
  RESTAURANT: "🍜",
  AKTIVITAET: "🎪",
  TRANSPORT: "🚄",
  SONSTIGES: "📌",
};

/** UTC-Uhrzeit (Flug-/Stopp-Zeiten sind als UTC-naive Wall-Clock gespeichert). */
function utcTime(d: Date): string {
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

function shortLabel(label: string): string {
  return label.split(",").slice(0, 2).join(", ");
}

/** "YYYY-MM-DD" → "Mo, 21.12.2026" (in UTC, ohne Zeitzonen-Verschiebung). */
function formatDay(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function mapsPlaceUrl(lat: number, lng: number, label: string): string {
  const name = label.split(",")[0].trim();
  return `https://www.google.com/maps/search/${encodeURIComponent(name)}/@${lat},${lng},16z`;
}

/** Zusammengeführte Tag-für-Tag-Timeline (Flüge, Orte, Aufgaben, Buchungen). */
export async function AblaufTimeline() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const tripId = await getActiveTripId(session.user.id);
  const [flights, stops, tasks, bookings] = await Promise.all([
    listFlights(tripId),
    getTripStops(tripId),
    getAllPlannerTasks(tripId),
    listBookings(tripId),
  ]);

  // Einträge nach Tag (YYYY-MM-DD) gruppieren.
  const byDay = new Map<string, Entry[]>();
  const push = (day: string, e: Entry) => {
    const list = byDay.get(day) ?? [];
    list.push(e);
    byDay.set(day, list);
  };

  let undatedFlights = 0;
  for (const f of flights) {
    if (!f.departure) {
      undatedFlights++;
      continue;
    }
    const day = toDateParam(f.departure);
    const route = [f.fromCode, f.toCode].filter(Boolean).join(" → ");
    push(day, {
      time: utcTime(f.departure),
      kind: "flight",
      emoji: "✈️",
      label: `${f.flightNumber}${route ? ` · ${route}` : ""}`,
      sub: [f.airline, f.arrival ? `Ankunft ${utcTime(f.arrival)}` : ""].filter(Boolean).join(" · "),
    });
  }

  for (const s of stops) {
    if (!s.date) continue;
    push(toDateParam(s.date), {
      time: "",
      kind: "stop",
      emoji: "📍",
      label: shortLabel(s.label),
      href: mapsPlaceUrl(s.lat, s.lng, s.label),
    });
  }

  for (const t of tasks) {
    push(toDateParam(t.date), {
      time: t.time || "",
      kind: "task",
      emoji: t.done ? "✅" : "⬜",
      label: t.text,
      done: t.done,
    });
  }

  for (const b of bookings) {
    if (!b.date) continue;
    push(toDateParam(b.date), {
      time: b.time || "",
      kind: "booking",
      emoji: BOOKING_EMOJI[b.kind] ?? "🎟️",
      label: b.title,
      sub: b.ref ? `Nr.: ${b.ref}` : undefined,
    });
  }

  const days = [...byDay.keys()].sort();
  for (const list of byDay.values()) {
    list.sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
  }

  return (
    <div className="max-w-2xl">
      {days.length === 0 ? (
        <p className="rounded-card border border-hairline bg-surface shadow-card px-4 py-8 text-center text-sm text-ink-subtle">
          Noch nichts mit Datum. Weise im Reiseplaner Orten einen Reisetag zu, erfasse Flüge oder
          lege Aufgaben im Tagesplaner an.
        </p>
      ) : (
        <div className="space-y-4">
          {days.map((day) => (
            <div
              key={day}
              className="rounded-card border border-hairline bg-surface shadow-card"
            >
              <div className="border-b border-hairline px-4 py-2 text-sm font-semibold text-brand-dark dark:text-brand-tint">
                {formatDay(day)}
              </div>
              <ul>
                {byDay.get(day)!.map((e, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3 border-b border-hairline px-4 py-2.5 last:border-b-0"
                  >
                    <span className="w-11 shrink-0 pt-0.5 text-xs tabular-nums text-ink-subtle">
                      {e.time || "—"}
                    </span>
                    <span className="shrink-0 pt-0.5">{e.emoji}</span>
                    <div className="min-w-0 flex-1">
                      {e.href ? (
                        <a
                          href={e.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-ink hover:text-brand hover:underline"
                        >
                          {e.label}
                        </a>
                      ) : (
                        <span
                          className={`text-sm ${
                            e.done
                              ? "text-ink-subtle line-through"
                              : "text-ink"
                          }`}
                        >
                          {e.label}
                        </span>
                      )}
                      {e.sub && (
                        <p className="truncate text-[11px] text-ink-subtle">{e.sub}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {undatedFlights > 0 && (
        <p className="mt-4 text-xs text-ink-subtle">
          {undatedFlights} Flug(e) ohne Abflugdatum werden hier nicht angezeigt.
        </p>
      )}
    </div>
  );
}
