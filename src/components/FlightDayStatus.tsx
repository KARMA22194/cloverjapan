"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/api/client";
import { FlightLiveStatus } from "@/components/FlightLiveStatus";

interface Flight {
  id: string;
  flightNumber: string;
  fromCode: string;
  toCode: string;
  departure: string | null;
  arrival: string | null;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Zeigt den Live-Flugstatus prominent auf dem Dashboard – aber nur, wenn heute
 * ein Flug relevant ist (zwischen Abflug- und Ankunftstag). So erscheint die Karte
 * am Abreisetag automatisch und verschwindet danach wieder.
 */
export function FlightDayStatus() {
  const [flights, setFlights] = useState<Flight[] | null>(null);

  useEffect(() => {
    api
      .get<Flight[]>("/api/v1/flights")
      .then(setFlights)
      .catch(() => setFlights([]));
  }, []);

  if (!flights) return null;
  const today = todayStr();
  const relevant = flights.filter((f) => {
    if (!f.flightNumber || !f.departure) return false;
    const dep = f.departure.slice(0, 10);
    const arr = f.arrival?.slice(0, 10) ?? dep;
    return dep <= today && today <= arr;
  });
  if (relevant.length === 0) return null;

  return (
    <div className="mb-6 rounded-xl border border-brand/40 bg-brand/5 p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-brand-dark dark:text-brand-tint">
        ✈️ Heute unterwegs
      </p>
      <div className="space-y-5">
        {relevant.map((f) => (
          <div key={f.id}>
            <p className="mb-1.5 text-sm font-medium text-slate-800 dark:text-slate-100">
              {f.flightNumber}
              {f.fromCode && (
                <span className="text-slate-500 dark:text-slate-400">
                  {" "}
                  · {f.fromCode} → {f.toCode}
                </span>
              )}
            </p>
            <FlightLiveStatus number={f.flightNumber} date={f.departure!.slice(0, 10)} />
          </div>
        ))}
      </div>
    </div>
  );
}
