"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/api/client";
import { yenFmt } from "@/lib/format";
import { Card, CardLabel, CardLink } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";

interface Flight {
  flightNumber: string;
  fromCode: string;
  toCode: string;
  departure: string | null;
  seats: string;
}
interface Booking {
  title: string;
  date?: string | null;
  time: string;
}
interface Checklist {
  done: boolean;
}
interface Expense {
  yen: number;
}


/** Heutiges Datum als YYYY-MM-DD (lokal). */
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Ganze Tage von heute bis dateStr (YYYY-MM-DD); negativ = Vergangenheit. */
function daysUntil(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const target = Date.UTC(y, m - 1, d);
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86400000);
}

function fmtDay(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function TripDashboard() {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [checklist, setChecklist] = useState<Checklist[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [budget, setBudget] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<Flight[]>("/api/v1/flights").then(setFlights),
      api.get<Booking[]>("/api/v1/bookings").then(setBookings),
      api.get<Checklist[]>("/api/v1/checklist").then(setChecklist),
      api.get<Expense[]>("/api/v1/expenses").then(setExpenses),
    ])
      .catch(() => {})
      .finally(() => setLoaded(true));
    try {
      const b = localStorage.getItem("japan-budget");
      if (b) setBudget(Math.max(0, Math.round(Number(b.replace(",", ".")) || 0)));
    } catch {
      /* ignore */
    }
  }, []);

  if (!loaded) return null;

  const today = todayStr();

  // Alle datierten Ereignisse → frühestes für den Countdown (Reisebeginn).
  const eventDates = [
    ...flights.map((f) => f.departure?.slice(0, 10)),
    ...bookings.map((b) => b.date),
  ].filter((d): d is string => !!d);
  const upcoming = eventDates.filter((d) => daysUntil(d) >= 0).sort();
  const startDate = upcoming[0] ?? null;
  const countdown = startDate ? daysUntil(startDate) : null;

  // Nächster Flug / nächste Buchung (ab heute).
  const nextFlight = flights
    .filter((f) => f.departure && f.departure.slice(0, 10) >= today)
    .sort((a, b) => (a.departure! < b.departure! ? -1 : 1))[0];
  const nextBooking = bookings
    .filter((b) => b.date && b.date >= today)
    .sort((a, b) => (a.date! + a.time < b.date! + b.time ? -1 : 1))[0];

  const openChecklist = checklist.filter((c) => !c.done).length;
  const spent = expenses.reduce((s, e) => s + e.yen, 0);
  const pct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
  const over = budget > 0 && spent > budget;

  // Nichts geplant → Dashboard ausblenden (Kacheln reichen).
  if (!startDate && !nextFlight && !nextBooking && spent === 0 && openChecklist === 0) return null;

  // Große Zahl in der Marken-Headline-Schrift mit Verlauf — trägt die Kachel,
  // statt dass ein Label um Aufmerksamkeit mit dem Wert konkurriert.
  const bigNumber = "font-heading text-3xl leading-none";

  return (
    <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* Countdown */}
      <Card pad="lg" className="flex flex-col justify-between gap-3">
        <CardLabel>Countdown</CardLabel>
        {countdown === null ? (
          <p className="text-sm text-ink-muted">Noch kein Datum geplant.</p>
        ) : countdown === 0 ? (
          <p className={`${bigNumber} bg-gradient-to-r from-brand-lift to-brand bg-clip-text text-transparent`}>
            Heute geht’s los! 🎉
          </p>
        ) : (
          <div>
            <p className={`${bigNumber} bg-gradient-to-r from-brand-lift to-brand bg-clip-text tabular-nums text-transparent`}>
              {countdown}
              <span className="ml-1.5 font-sans text-base font-bold">Tage</span>
            </p>
            <p className="mt-1.5 text-xs font-semibold text-ink-subtle">
              bis {fmtDay(startDate!)}
            </p>
          </div>
        )}
      </Card>

      {/* Als Nächstes */}
      <CardLink href="/programm?tab=ablauf" pad="lg" className="flex flex-col justify-between gap-3">
        <CardLabel>Als Nächstes</CardLabel>
        {nextFlight ? (
          <div className="text-sm font-semibold text-ink">
            ✈️ {nextFlight.flightNumber}
            {nextFlight.fromCode && ` ${nextFlight.fromCode}→${nextFlight.toCode}`}
            <span className="mt-0.5 block text-xs font-normal text-ink-subtle">
              {fmtDay(nextFlight.departure!.slice(0, 10))} · {nextFlight.departure!.slice(11, 16)}
            </span>
            {nextFlight.seats && (
              <Chip tone="brand" className="mt-2 tabular-nums">
                💺 {nextFlight.seats}
              </Chip>
            )}
          </div>
        ) : nextBooking ? (
          <div className="text-sm font-semibold text-ink">
            🎟️ {nextBooking.title}
            <span className="mt-0.5 block text-xs font-normal text-ink-subtle">
              {fmtDay(nextBooking.date!)}
              {nextBooking.time && ` · ${nextBooking.time}`}
            </span>
          </div>
        ) : (
          <p className="text-sm text-ink-muted">Nichts Anstehendes.</p>
        )}
      </CardLink>

      {/* Budget */}
      <CardLink href="/geld?tab=ausgaben" pad="lg" className="flex flex-col justify-between gap-3">
        <CardLabel>Ausgaben</CardLabel>
        <div>
          <p className={`${bigNumber} tabular-nums text-ink`}>{yenFmt.format(spent)}</p>
          {budget > 0 && (
            <>
              <p className="mt-1.5 text-xs font-semibold text-ink-subtle tabular-nums">
                von {yenFmt.format(budget)} · {pct} %
              </p>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-2 ring-1 ring-hairline">
                <div
                  className={`h-full rounded-full transition-[width] duration-500 ${
                    over ? "bg-danger" : "bg-gradient-to-r from-brand-lift to-brand"
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </>
          )}
        </div>
      </CardLink>

      {/* Checkliste */}
      <CardLink
        href="/programm?tab=checkliste"
        pad="lg"
        className="flex flex-col justify-between gap-3"
      >
        <CardLabel>Checkliste</CardLabel>
        {openChecklist === 0 ? (
          <Chip tone="success" className="self-start">
            Alles erledigt ✓
          </Chip>
        ) : (
          <p className={`${bigNumber} tabular-nums text-ink`}>
            {openChecklist}
            <span className="ml-1.5 font-sans text-base font-bold text-ink-muted">offen</span>
          </p>
        )}
      </CardLink>
    </div>
  );
}
