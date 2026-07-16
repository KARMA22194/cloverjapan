"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { api } from "@/lib/api/client";
import { yenFmt } from "@/lib/format";

interface Flight {
  flightNumber: string;
  fromCode: string;
  toCode: string;
  departure: string | null;
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

  const card = "rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4";

  return (
    <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {/* Countdown */}
      <div className={card}>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Countdown
        </p>
        {countdown === null ? (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Noch kein Datum geplant.</p>
        ) : countdown === 0 ? (
          <p className="mt-1 text-2xl font-bold text-brand">Heute geht’s los! 🎉</p>
        ) : (
          <>
            <p className="mt-1 text-2xl font-bold text-brand">
              {countdown} <span className="text-base font-medium">Tage</span>
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500">bis {fmtDay(startDate!)}</p>
          </>
        )}
      </div>

      {/* Als Nächstes */}
      <Link href="/programm?tab=ablauf" className={`${card} transition hover:border-brand`}>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Als Nächstes
        </p>
        {nextFlight ? (
          <p className="mt-1 text-sm text-slate-800 dark:text-slate-100">
            ✈️ {nextFlight.flightNumber}
            {nextFlight.fromCode && ` ${nextFlight.fromCode}→${nextFlight.toCode}`}
            <span className="block text-xs text-slate-400 dark:text-slate-500">
              {fmtDay(nextFlight.departure!.slice(0, 10))} · {nextFlight.departure!.slice(11, 16)}
            </span>
          </p>
        ) : nextBooking ? (
          <p className="mt-1 text-sm text-slate-800 dark:text-slate-100">
            🎟️ {nextBooking.title}
            <span className="block text-xs text-slate-400 dark:text-slate-500">
              {fmtDay(nextBooking.date!)}
              {nextBooking.time && ` · ${nextBooking.time}`}
            </span>
          </p>
        ) : (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Nichts Anstehendes.</p>
        )}
      </Link>

      {/* Budget */}
      <Link href="/geld?tab=ausgaben" className={`${card} transition hover:border-brand`}>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Ausgaben
        </p>
        <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
          {yenFmt.format(spent)}
          {budget > 0 && (
            <span className="text-xs font-normal text-slate-400 dark:text-slate-500">
              {" "}
              / {yenFmt.format(budget)}
            </span>
          )}
        </p>
        {budget > 0 && (
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className={`h-full rounded-full ${over ? "bg-danger" : "bg-brand"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </Link>

      {/* Checkliste */}
      <Link href="/programm?tab=checkliste" className={`${card} transition hover:border-brand`}>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Checkliste
        </p>
        {openChecklist === 0 ? (
          <p className="mt-1 text-sm text-green-600 dark:text-green-400">Alles erledigt ✓</p>
        ) : (
          <p className="mt-1 text-2xl font-bold text-slate-800 dark:text-slate-100">
            {openChecklist} <span className="text-base font-medium">offen</span>
          </p>
        )}
      </Link>
    </div>
  );
}
