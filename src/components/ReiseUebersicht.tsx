"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/api/client";
import { eurFmt, yenFmt } from "@/lib/format";

interface Stop {
  id: string;
  label: string;
  date: string | null;
}
interface Flight {
  id: string;
  flightNumber: string;
  airline: string;
  fromCode: string;
  toCode: string;
  departure: string | null;
  arrival: string | null;
  priceYen: number | null;
}
interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}
interface Expense {
  id: string;
  category: string;
  label: string;
  yen: number;
}

const dtFmt = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});
const dFmt = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
const fmtDt = (iso: string | null) => (iso ? dtFmt.format(new Date(iso)) : "—");
const fmtD = (iso: string | null) => (iso ? dFmt.format(new Date(`${iso}T00:00:00Z`)) : null);

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
      <h2 className="mb-2 text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
      {children}
    </section>
  );
}

export function ReiseUebersicht() {
  const [stops, setStops] = useState<Stop[]>([]);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [rate, setRate] = useState<number>(0.0058);

  useEffect(() => {
    api.get<Stop[]>("/api/v1/trip-stops").then(setStops).catch(() => {});
    api.get<Flight[]>("/api/v1/flights").then(setFlights).catch(() => {});
    api.get<ChecklistItem[]>("/api/v1/checklist").then(setChecklist).catch(() => {});
    api.get<Expense[]>("/api/v1/expenses").then(setExpenses).catch(() => {});
    api.get<{ rate: number }>("/api/v1/fx/rate?from=JPY&to=EUR").then((r) => setRate(r.rate)).catch(() => {});
  }, []);

  const totalYen = expenses.reduce((s, e) => s + e.yen, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Alles Wichtige auf einen Blick — zum Drucken oder als PDF speichern.
        </p>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark print:hidden"
        >
          Drucken / PDF
        </button>
      </div>

      <Section title={`Flüge (${flights.length})`}>
        {flights.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">Keine Flüge hinterlegt.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {flights.map((f) => (
              <li key={f.id} className="flex flex-wrap justify-between gap-2">
                <span className="text-slate-800 dark:text-slate-100">
                  <strong>{f.flightNumber}</strong>
                  {f.airline && ` · ${f.airline}`} — {f.fromCode || "?"} → {f.toCode || "?"}
                </span>
                <span className="text-slate-500 dark:text-slate-400">
                  {fmtDt(f.departure)} → {fmtDt(f.arrival)}
                  {f.priceYen ? ` · ${eurFmt.format(f.priceYen * rate)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Route (${stops.length} Stopps)`}>
        {stops.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">Noch keine Orte im Reiseplaner.</p>
        ) : (
          <ol className="space-y-1 text-sm">
            {stops.map((s, i) => (
              <li key={s.id} className="flex justify-between gap-2">
                <span className="text-slate-800 dark:text-slate-100">
                  {i + 1}. {s.label.split(",").slice(0, 2).join(", ")}
                </span>
                {fmtD(s.date) && (
                  <span className="text-slate-500 dark:text-slate-400">{fmtD(s.date)}</span>
                )}
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section title={`Checkliste (${checklist.filter((c) => c.done).length}/${checklist.length})`}>
        {checklist.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">Keine Punkte.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {checklist.map((c) => (
              <li key={c.id} className="text-slate-800 dark:text-slate-100">
                {c.done ? "☑" : "☐"} <span className={c.done ? "line-through text-slate-400" : ""}>{c.text}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Ausgaben">
        <div className="flex justify-between text-sm">
          <span className="text-slate-600 dark:text-slate-300">{expenses.length} Einträge</span>
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            {yenFmt.format(totalYen)} · {eurFmt.format(totalYen * rate)}
          </span>
        </div>
      </Section>
    </div>
  );
}
