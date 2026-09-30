/**
 * Reine Logik rund um den Flug-Status: Änderungserkennung, Meldungstext und die
 * Frage, wann überhaupt abgefragt werden darf.
 *
 * ⚠️ Bewusst **ohne** Netz, Datenbank und `@/`-Alias getrennt von
 * `flightStatus.ts`. Diese Funktionen entscheiden über Kosten und über den Text,
 * den jemand um 5 Uhr morgens auf dem Sperrbildschirm liest — beides will man
 * prüfen können, ohne einen kostenpflichtigen Dienst anzurufen
 * (`e2e/flight-due.ts`, ausgeführt mit `node --experimental-strip-types`).
 */
import type { LiveStatus } from "./flightStatus";

/* ─────────────────────────── Änderungserkennung ─────────────────────────── */

/**
 * Die **meldenswerten** Felder eines Standes — und nur die.
 *
 * ⚠️ Bewusst nicht der ganze Datensatz: AeroDataBox ändert laufend
 * Kleinigkeiten (Vorhersagen auf die Minute, Flugzeugkennung). Ein Push je
 * Abweichung wäre nach zwei Stunden stummgeschaltet — und fehlte dann genau
 * dann, wenn das Gate wirklich wechselt.
 *
 * ⚠️ Zeiten stehen als `hh:mm` drin, nicht als voller Zeitstempel: es ist die
 * Uhrzeit am Flughafen, die zählt, und ein Zeitstempel würde bei jeder
 * Vorhersage-Verschiebung um Sekunden einen Fehlalarm auslösen.
 */
export interface StatusFields {
  status: string;
  depTime: string | null;
  depTerminal: string | null;
  depCheckIn: string | null;
  depGate: string | null;
  arrTime: string | null;
  arrTerminal: string | null;
  arrGate: string | null;
  arrBelt: string | null;
}

/** Nur die Uhrzeit („2026-08-19 13:05+02:00" → „13:05"). */
function hhmm(v: string | null | undefined): string | null {
  if (!v) return null;
  const m = /(\d{2}:\d{2})/.exec(v);
  return m ? m[1] : null;
}

export function statusFields(s: LiveStatus): StatusFields {
  return {
    status: s.status,
    // Die *gültige* Zeit ist die berichtigte, sonst die geplante.
    depTime: hhmm(s.departure.revised ?? s.departure.scheduled),
    depTerminal: s.departure.terminal ?? null,
    depCheckIn: s.departure.checkInDesk ?? null,
    depGate: s.departure.gate ?? null,
    arrTime: hhmm(s.arrival.revised ?? s.arrival.scheduled),
    arrTerminal: s.arrival.terminal ?? null,
    arrGate: s.arrival.gate ?? null,
    arrBelt: s.arrival.baggageBelt ?? null,
  };
}

/** Fingerabdruck zum Speichern — daraus lässt sich der Vorzustand zurückholen. */
export function statusSignature(f: StatusFields): string {
  return JSON.stringify(f);
}

/** Gespeicherten Fingerabdruck zurücklesen; `null` bei fehlend/kaputt. */
export function parseSignature(raw: string | null | undefined): StatusFields | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as StatusFields;
    return v && typeof v === "object" && "status" in v ? v : null;
  } catch {
    return null;
  }
}

/**
 * Lesbare Meldung aus dem Unterschied zweier Stände.
 *
 * ⚠️ Der Text ist der eigentliche Wert. „Flugstatus geändert" zwingt zum
 * Nachsehen und ist kaum besser als keine Meldung; „Gate B24 · Abflug jetzt
 * 13:40" beantwortet die Frage sofort — auch auf einem Sperrbildschirm.
 *
 * ⚠️ Leeres Ergebnis heißt: nichts Meldenswertes. Dann wird **nicht** gepusht.
 * Das gilt ausdrücklich auch für den allerersten Abruf (`prev === null`):
 * niemand will eine Benachrichtigung darüber, dass die App zum ersten Mal
 * nachgesehen hat.
 */
export function describeChange(prev: StatusFields | null, next: StatusFields): string {
  if (prev === null) return "";
  const parts: string[] = [];

  if (prev.status !== next.status) parts.push(`Status: ${next.status}`);
  if (next.depTime && prev.depTime !== next.depTime) parts.push(`Abflug jetzt ${next.depTime}`);
  if (next.depGate && prev.depGate !== next.depGate) parts.push(`Gate ${next.depGate}`);
  if (next.depTerminal && prev.depTerminal !== next.depTerminal) {
    parts.push(`Terminal ${next.depTerminal}`);
  }
  if (next.depCheckIn && prev.depCheckIn !== next.depCheckIn) {
    parts.push(`Check-in ${next.depCheckIn}`);
  }
  if (next.arrTime && prev.arrTime !== next.arrTime) parts.push(`Ankunft jetzt ${next.arrTime}`);
  if (next.arrBelt && prev.arrBelt !== next.arrBelt) parts.push(`Kofferband ${next.arrBelt}`);
  if (next.arrGate && prev.arrGate !== next.arrGate) parts.push(`Ankunft-Gate ${next.arrGate}`);

  return parts.join(" · ");
}

/* ──────────────────────── Wann überhaupt nachsehen? ─────────────────────── */

export interface CheckCandidate {
  /** Echter Abflugzeitpunkt (aus dem Abruf). Fehlt bei manuell erfassten Flügen. */
  departureUtc: Date | null;
  /** Ortszeit ohne Zeitzone — nur als Notnagel, wenn `departureUtc` fehlt. */
  departure: Date | null;
  arrivalUtc: Date | null;
  liveCheckedAt: Date | null;
}

const MIN = 60_000;
const H = 60 * MIN;

/**
 * Soll dieser Flug jetzt abgefragt werden?
 *
 * ⚠️ **Das ist die Kostenbremse, nicht der Cron-Takt.** Ein Aufruf alle 15 min
 * rund um die Uhr wären 2.880 Abfragen im Monat je Flug — ein Vielfaches jedes
 * kostenlosen Kontingents. Der Cron darf deshalb ruhig oft klopfen; entschieden
 * wird hier:
 *
 *  - außerhalb des Reisefensters: gar nicht,
 *  - mehr als 4 h vor Abflug: **stündlich** (da ändert sich nichts Dringendes),
 *  - ab 4 h vorher bis 4 h nach Ankunft: **alle 15 min** (Gate, Verspätung, Band).
 *
 * Macht für einen Langstreckenflug rund 100 Abfragen, für Hin- und Rückflug
 * zusammen etwa 200 — mit Reserve unter {@link FLIGHT_MONTHLY_LIMIT}.
 *
 * ⚠️ **Ohne `departureUtc` ist die Uhrzeit wertlos.** `departure` trägt die
 * Ortszeit ohne Zeitzone: beim Rückflug aus Tokio läge ein Fenster „4 h vor
 * Abflug" neun Stunden daneben — die dichte Phase begänne Stunden **nach** dem
 * Start. Für solche (manuell erfassten) Flüge bleibt es deshalb beim stündlichen
 * Takt über ein großzügiges Fenster: lieber gröber melden als teuer danebenliegen.
 */
export function isCheckDue(f: CheckCandidate, now: Date): boolean {
  const exact = f.departureUtc !== null;
  const dep = f.departureUtc ?? f.departure;
  if (!dep) return false;

  const toDep = dep.getTime() - now.getTime();
  // Ende des Fensters: bekannte Ankunft + 4 h, sonst Abflug + 24 h (deckt auch
  // eine lange Verbindung ab, ohne die Zeitzone zu kennen).
  const end = (f.arrivalUtc ? f.arrivalUtc.getTime() : dep.getTime() + 24 * H) + 4 * H;
  if (now.getTime() > end) return false;

  // Vorlauf: exakt 15 h, unscharf großzügiger (die Ortszeit kann bis zu 12 h
  // gegenüber UTC verschoben sein).
  const lead = exact ? 15 * H : 27 * H;
  if (toDep > lead) return false;

  const interval = exact && toDep <= 4 * H ? 15 * MIN : 60 * MIN;
  if (f.liveCheckedAt && now.getTime() - f.liveCheckedAt.getTime() < interval) return false;

  return true;
}
