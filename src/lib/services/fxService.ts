/**
 * Wechselkurse (keyfrei über open.er-api.com, ECB-nah).
 *
 * Eine Quelle für beide Nutzungen: den Endpunkt `/api/v1/fx/rate`, den die
 * Oberfläche für die Live-Umrechnung abfragt, **und** das Einfrieren des Kurses
 * beim Anlegen einer Ausgabe. Vorher stand der Aufruf nur im Route-Handler.
 */
import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

export interface FxRate {
  rate: number;
  /** Zeitstempel des Kursstands beim Anbieter (für die Anzeige). */
  date: string | null;
}

/**
 * Kurs holen — oder `null`, wenn der Dienst nicht erreichbar ist.
 *
 * Wirft **nicht**: beim Anlegen einer Ausgabe darf ein ausgefallener
 * Kursdienst den Vorgang nicht scheitern lassen. Ohne Kurs bleibt das Feld leer
 * und die Anzeige fällt auf den Tageskurs zurück — so wie vor dem Einfrieren.
 *
 * Der externe Aufruf ist über `next: { revalidate }` eine Stunde gecacht; der
 * Kurs ändert sich ohnehin nur täglich.
 */
export async function getFxRate(from = "JPY", to = "EUR"): Promise<FxRate | null> {
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${from}`, {
      headers: { "User-Agent": "TimeTracker/1.0" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      result: string;
      rates?: Record<string, number>;
      time_last_update_utc?: string;
    };
    const rate = data.rates?.[to];
    if (data.result !== "success" || typeof rate !== "number" || !(rate > 0)) return null;
    return { rate, date: data.time_last_update_utc ?? null };
  } catch {
    return null;
  }
}

/**
 * Kurs holen, **dann** eine Transaktion fahren.
 *
 * ⚠️ Der HTTP-Aufruf gehört vor `$transaction`, nicht hinein: ein langsamer
 * Kursdienst hielte sonst eine offene Postgres-Transaktion auf — bei Neon über
 * einen Pooler ist das der sichere Weg in Verbindungsknappheit.
 *
 * Für die gekoppelten Ausgaben aus Flügen und Buchungen, die im selben
 * Schreibvorgang wie ihr Ursprung entstehen.
 */
export async function runWithRate<T>(
  fn: (rateEur: number | null, tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const fx = await getFxRate();
  return db.$transaction((tx) => fn(fx?.rate ?? null, tx));
}
