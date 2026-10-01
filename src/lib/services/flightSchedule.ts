/**
 * Reine Logik rund um den Flug-Status: welche Zeit gilt, Änderungserkennung,
 * Meldungstext und die Frage, wann überhaupt abgefragt werden darf.
 *
 * ⚠️ Bewusst **ohne** Netz, Datenbank und `@/`-Alias getrennt von
 * `flightStatus.ts`. Diese Funktionen entscheiden über Kosten und über den Text,
 * den jemand um 5 Uhr morgens auf dem Sperrbildschirm liest — beides will man
 * prüfen können, ohne einen kostenpflichtigen Dienst anzurufen
 * (`e2e/flight-due.ts`, ausgeführt mit `node --experimental-strip-types`).
 */
/**
 * ⚠️ Der Import ist **type-only** und muss es bleiben. `flightStatus.ts` zieht
 * über `@/lib/rate` den Prisma-Client nach sich; diese Datei wird aber auch von
 * `FlightLiveStatus.tsx` im Browser benutzt. Ein echter Import würde die halbe
 * Serverwelt ins Client-Bundle holen — und das fiele erst an der Bundle-Größe
 * auf, nicht an einem Fehler.
 */
import type { LiveStatus } from "./flightStatus";

const MIN = 60_000;
const H = 60 * MIN;

/** Nur die Uhrzeit („2026-08-19 13:05+02:00" → „13:05"). */
function hhmm(v: string | null | undefined): string | null {
  if (!v) return null;
  const m = /(\d{2}:\d{2})/.exec(v);
  return m ? m[1] : null;
}

/* ────────────────────────── Welche Zeit gilt? ───────────────────────────── */

/**
 * Die drei Zeitquellen eines Endpunkts — **sauber getrennt**.
 *
 * ⚠️ AeroDataBox liefert bis zu vier Zeiten je Endpunkt, und sie wiegen sehr
 * unterschiedlich schwer:
 *  - `scheduledTime` — der Flugplan.
 *  - `revisedTime` — eine vom Flughafen oder der Airline **gemeldete** neue
 *    Zeit. Eine Tatsache aus dem operativen System.
 *  - `runwayTime` — tatsächliches Abheben/Aufsetzen. Gibt es erst hinterher und
 *    ist dann die verbindlichste Angabe überhaupt; gehört deshalb zu `revised`.
 *  - `predictedTime` — AeroDataBox' **eigene Vorhersage**. Gemeldet hat die
 *    niemand; sie wackelt minutenweise und steht oft schon da, während der
 *    Status noch „Expected" lautet.
 *
 * ⚠️ Genau diese Trennung fehlte: `predictedTime` landete im selben Feld wie
 * `revisedTime`. Sichtbar wurde das als Bildschirm, der sich selbst widersprach
 * — grün „Planmäßig" und daneben rot durchgestrichen eine Verspätung um sechs
 * Minuten, die niemand gemeldet hatte. Teurer war der unsichtbare Teil:
 * {@link statusFields} nahm dieselbe Zahl, also löste **jedes Wackeln der
 * Vorhersage eine Push-Nachricht aus** — genau das, wovor der Kommentar an
 * `StatusFields` warnt.
 */
export interface EndpointTimes {
  scheduled: string | null;
  /** Gemeldet oder tatsächlich geflogen — verbindlich. */
  revised: string | null;
  /** Vorhersage des Datendienstes — unverbindlich. */
  predicted: string | null;
}

interface AdbTime {
  local?: string;
}

/** Der Ausschnitt der AeroDataBox-Antwort, der Zeiten trägt. */
export interface AdbEndpointTimes {
  scheduledTime?: AdbTime;
  revisedTime?: AdbTime;
  predictedTime?: AdbTime;
  runwayTime?: AdbTime;
}

export function endpointTimes(e: AdbEndpointTimes): EndpointTimes {
  return {
    scheduled: e.scheduledTime?.local ?? null,
    revised: e.revisedTime?.local ?? e.runwayTime?.local ?? null,
    predicted: e.predictedTime?.local ?? null,
  };
}

/**
 * Ab welcher Abweichung eine **Vorhersage** überhaupt erwähnt wird (Minuten).
 *
 * ⚠️ Keine Schönheitsgrenze. Darunter ist die Vorhersage Rauschen: sie bewegt
 * sich bei jedem Abruf um ein paar Minuten, und ableiten lässt sich daraus
 * nichts. Sechs Minuten „Verspätung" bei einem Flug, der noch nicht einmal am
 * Gate steht, sind keine Information — sie sehen nur aus wie eine.
 */
export const PREDICTION_MIN_MINUTES = 15;

/** Woher die angezeigte Zeit stammt — bestimmt, wie verbindlich sie aussieht. */
export type TimeKind = "scheduled" | "revised" | "predicted";

export interface ShownTime {
  /** Geplante Zeit als `hh:mm`. */
  scheduled: string | null;
  /** Die Zeit, die gilt bzw. erwartet wird, als `hh:mm`. */
  shown: string | null;
  kind: TimeKind;
}

/** Minuten zwischen zwei AeroDataBox-Ortszeiten („2026-08-19 13:05+02:00"). */
function minutesBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const ms = Date.parse(b.replace(" ", "T")) - Date.parse(a.replace(" ", "T"));
  return Number.isFinite(ms) ? Math.round(ms / MIN) : null;
}

/**
 * Welche Zeit zeigt die Oberfläche — und wie verbindlich ist sie?
 *
 * Rangfolge:
 *  1. **Gemeldetes** schlägt alles. Weicht es vom Plan ab, ist das eine echte
 *     Änderung und wird hervorgehoben.
 *  2. Sonst eine **Vorhersage** — aber erst ab {@link PREDICTION_MIN_MINUTES}
 *     und ausdrücklich als Vorhersage gekennzeichnet.
 *  3. Sonst der Plan.
 *
 * ⚠️ Liegt eine gemeldete Zeit vor, wird die Vorhersage gar nicht erst
 * betrachtet. Sie gegen eine Meldung antreten zu lassen hieße, eine Schätzung
 * über eine Auskunft zu stellen.
 */
export function displayTime(t: EndpointTimes): ShownTime {
  const scheduled = hhmm(t.scheduled);

  if (t.revised) {
    const revised = hhmm(t.revised);
    if (revised && revised !== scheduled) return { scheduled, shown: revised, kind: "revised" };
    return { scheduled, shown: scheduled ?? revised, kind: "scheduled" };
  }

  // Ohne geplante Zeit ist die Vorhersage besser als gar nichts.
  if (!t.scheduled && t.predicted) {
    return { scheduled: null, shown: hhmm(t.predicted), kind: "predicted" };
  }

  const diff = minutesBetween(t.scheduled, t.predicted);
  if (diff !== null && Math.abs(diff) >= PREDICTION_MIN_MINUTES) {
    return { scheduled, shown: hhmm(t.predicted), kind: "predicted" };
  }

  return { scheduled, shown: scheduled, kind: "scheduled" };
}

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

/**
 * ⚠️ Gemeldet oder geplant — **nie** `predicted`. Die Vorhersage bewegt sich bei
 * fast jedem Abruf; in der dichten Phase wird alle 15 min nachgesehen, ein Push
 * je Minutenänderung wären Dutzende „Ankunft jetzt 10:52" auf einem Flug. Wer
 * eine Vorhersage meldet, meldet nichts — er schickt nur Lärm, in dem die eine
 * Meldung untergeht, auf die es ankommt.
 */
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
