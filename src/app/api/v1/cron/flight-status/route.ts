import type { NextRequest } from "next/server";

import { handle, ok, unauthorized } from "@/lib/api/http";
import { db } from "@/lib/db";
import { fetchLiveStatus, flightApiConfigured } from "@/lib/services/flightStatus";
import {
  describeChange,
  isCheckDue,
  parseSignature,
  statusFields,
  statusSignature,
} from "@/lib/services/flightSchedule";
import { pushConfigured, sendPushToTrip } from "@/lib/services/push";
import { toDateParam } from "@/lib/time";

/**
 * GET /api/v1/cron/flight-status — prüft anstehende Flüge und meldet Änderungen.
 *
 * Am Reisetag ist das die nützlichste Benachrichtigung, die diese App hat: Gate,
 * Verspätung und Kofferband erfährt man sonst erst am Monitor in der Halle. Der
 * Live-Status in der Oberfläche aktualisiert sich nur, **solange jemand die
 * Seite offen hat** — genau dann nicht, wenn man unterwegs ist.
 *
 * ⚠️ **Der Takt kommt nicht von hier.** Dieser Endpunkt darf beliebig oft
 * aufgerufen werden; ob ein Flug tatsächlich abgefragt wird, entscheidet
 * `isCheckDue` (Fenster + gestaffelter Abstand). Das ist Absicht: so hängt die
 * Kostenkontrolle nicht am Cron-Anbieter. Vercel erlaubt auf dem Hobby-Tarif
 * nur **einen Lauf pro Tag** — damit wäre der Endpunkt wertlos. Ein beliebiger
 * externer Aufrufer (alle 15 min, mit `Authorization: Bearer $CRON_SECRET`)
 * genügt und ist bei den üblichen Anbietern kostenlos.
 *
 * ⚠️ **Ohne Push wird gar nicht erst abgefragt.** Sonst verbrauchte der Lauf
 * Kontingent bei einem kostenpflichtigen Dienst, ohne dass irgendjemand etwas
 * davon hätte.
 */
export function GET(req: NextRequest) {
  return handle(async () => {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
      throw unauthorized("Cron-Aufruf nicht autorisiert.");
    }
    if (!flightApiConfigured()) return ok({ skipped: "kein AeroDataBox-Key" });
    if (!pushConfigured()) return ok({ skipped: "kein Web-Push konfiguriert" });

    const now = new Date();
    // Grobfilter in der DB, Feinentscheidung in `isCheckDue`. Ohne ihn läse jeder
    // Lauf sämtliche je erfassten Flüge.
    const from = new Date(now.getTime() - 72 * 3600_000);
    const to = new Date(now.getTime() + 30 * 3600_000);
    const candidates = await db.flight.findMany({
      where: {
        OR: [
          { departureUtc: { gte: from, lte: to } },
          { departureUtc: null, departure: { gte: from, lte: to } },
        ],
      },
      select: {
        id: true,
        tripId: true,
        flightNumber: true,
        fromCode: true,
        toCode: true,
        departure: true,
        departureUtc: true,
        arrivalUtc: true,
        liveSignature: true,
        liveCheckedAt: true,
      },
    });

    let checked = 0;
    let notified = 0;
    const errors: string[] = [];

    for (const f of candidates) {
      if (!isCheckDue(f, now)) continue;
      const date = f.departure ? toDateParam(f.departure) : null;
      if (!date || !f.flightNumber) continue;

      try {
        const live = await fetchLiveStatus(f.flightNumber.toUpperCase(), date);
        checked++;

        const next = statusFields(live);
        const prev = parseSignature(f.liveSignature);
        const message = describeChange(prev, next);

        await db.flight.update({
          where: { id: f.id },
          data: {
            liveSignature: statusSignature(next),
            liveCheckedAt: now,
            // Die echte UTC-Zeit nachtragen, sobald der Dienst sie liefert — ab
            // dann greift das exakte Fenster statt des groben Notnagels.
            ...(live.departureUtc && !f.departureUtc
              ? { departureUtc: new Date(live.departureUtc) }
              : {}),
            ...(live.arrivalUtc && !f.arrivalUtc
              ? { arrivalUtc: new Date(live.arrivalUtc) }
              : {}),
          },
        });

        if (!message) continue;
        const route = f.fromCode && f.toCode ? ` ${f.fromCode}→${f.toCode}` : "";
        // `null` als Auslöser: die Meldung kommt nicht von einem Mitglied,
        // also soll sie auch alle erreichen.
        await sendPushToTrip(f.tripId, null, {
          title: `✈️ ${f.flightNumber}${route}`,
          body: message,
          url: "/fluege",
        });
        notified++;
      } catch (err) {
        // Ein einzelner Flug darf den Lauf nicht abbrechen — der nächste kann
        // der wichtige sein. Kontingent-Fehler (429) beenden ihn allerdings:
        // weitere Versuche wären zwecklos.
        const status = (err as { status?: number })?.status;
        errors.push(`${f.flightNumber}: ${(err as Error).message}`);
        if (status === 429) break;
      }
    }

    return ok({ candidates: candidates.length, checked, notified, errors });
  });
}
