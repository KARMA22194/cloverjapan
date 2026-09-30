/**
 * Wann wird der Flugstatus abgefragt? — die Kostenbremse.
 *
 * Ohne Netz und ohne Datenbank:
 *   docker compose exec -T app node --experimental-strip-types e2e/flight-due.ts
 *
 * WARUM DAS EINEN TEST BRAUCHT: ein Fehler hier kostet Geld und ist im Betrieb
 * unsichtbar — man sieht keine falsche Anzeige, nur irgendwann eine Rechnung
 * oder ein leeres Kontingent. Zusätzlich wird nachgerechnet, wie viele Abfragen
 * eine echte Reise wirklich auslöst.
 */
import {
  describeChange,
  isCheckDue,
  parseSignature,
  statusSignature,
  type CheckCandidate,
  type StatusFields,
} from "../src/lib/services/flightSchedule.ts";

let failed = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : `  → ${got} statt ${want}`}`);
};

const H = 3600_000;
const MIN = 60_000;
const NOW = new Date("2026-08-19T09:00:00Z");
const at = (hoursFromNow: number) => new Date(NOW.getTime() + hoursFromNow * H);

const f = (o: Partial<CheckCandidate>): CheckCandidate => ({
  departureUtc: null, departure: null, arrivalUtc: null, liveCheckedAt: null, ...o,
});

// ── Ohne Abflugzeit gibt es nichts zu tun ──────────────────────────────────
check("kein Datum → nein", isCheckDue(f({}), NOW), false);

// ── Fenster ────────────────────────────────────────────────────────────────
check("20 h vorher → nein", isCheckDue(f({ departureUtc: at(20) }), NOW), false);
check("14 h vorher → ja", isCheckDue(f({ departureUtc: at(14) }), NOW), true);
check("1 h vorher → ja", isCheckDue(f({ departureUtc: at(1) }), NOW), true);
check("während des Flugs → ja",
  isCheckDue(f({ departureUtc: at(-3), arrivalUtc: at(9) }), NOW), true);
check("2 h nach Ankunft → ja",
  isCheckDue(f({ departureUtc: at(-16), arrivalUtc: at(-2) }), NOW), true);
check("6 h nach Ankunft → nein",
  isCheckDue(f({ departureUtc: at(-20), arrivalUtc: at(-6) }), NOW), false);

// ── Takt ───────────────────────────────────────────────────────────────────
check("10 h vorher, vor 30 min geprüft → nein (stündlich)",
  isCheckDue(f({ departureUtc: at(10), liveCheckedAt: new Date(NOW.getTime() - 30 * MIN) }), NOW), false);
check("10 h vorher, vor 70 min geprüft → ja",
  isCheckDue(f({ departureUtc: at(10), liveCheckedAt: new Date(NOW.getTime() - 70 * MIN) }), NOW), true);
check("2 h vorher, vor 10 min geprüft → nein (viertelstündlich)",
  isCheckDue(f({ departureUtc: at(2), liveCheckedAt: new Date(NOW.getTime() - 10 * MIN) }), NOW), false);
check("2 h vorher, vor 20 min geprüft → ja",
  isCheckDue(f({ departureUtc: at(2), liveCheckedAt: new Date(NOW.getTime() - 20 * MIN) }), NOW), true);

// ── Ohne echte UTC-Zeit: großzügiger, aber NIE im dichten Takt ─────────────
// Sonst wäre die Ortszeit als UTC gelesen worden — beim Rückflug aus Tokio neun
// Stunden daneben.
check("unscharf, 20 h vorher → ja (großzügiges Fenster)",
  isCheckDue(f({ departure: at(20) }), NOW), true);
check("unscharf, 2 h vorher, vor 20 min geprüft → nein (bleibt stündlich)",
  isCheckDue(f({ departure: at(2), liveCheckedAt: new Date(NOW.getTime() - 20 * MIN) }), NOW), false);
check("unscharf, 2 h vorher, vor 70 min geprüft → ja",
  isCheckDue(f({ departure: at(2), liveCheckedAt: new Date(NOW.getTime() - 70 * MIN) }), NOW), true);

// ── Nachrechnen: was kostet eine echte Reise? ──────────────────────────────
// Langstrecke FRA→HND, 14 h. Cron klopft alle 5 min; gezählt wird, wie oft
// tatsächlich abgefragt würde.
function simulate(depOffsetH: number, durationH: number, exact: boolean): number {
  const start = new Date("2026-08-01T00:00:00Z");
  const dep = new Date(start.getTime() + depOffsetH * H);
  const arr = new Date(dep.getTime() + durationH * H);
  let calls = 0;
  let last: Date | null = null;
  for (let t = 0; t < 72 * H; t += 5 * MIN) {
    const now = new Date(start.getTime() + t);
    const cand: CheckCandidate = exact
      ? { departureUtc: dep, departure: dep, arrivalUtc: arr, liveCheckedAt: last }
      : { departureUtc: null, departure: dep, arrivalUtc: null, liveCheckedAt: last };
    if (isCheckDue(cand, now)) { calls++; last = now; }
  }
  return calls;
}

const exactCalls = simulate(30, 14, true);
const fuzzyCalls = simulate(30, 14, false);
console.log(`\n  Langstrecke mit UTC-Zeit : ${exactCalls} Abfragen`);
console.log(`  dieselbe ohne UTC-Zeit   : ${fuzzyCalls} Abfragen`);
console.log(`  Hin- und Rückflug (exakt): ${exactCalls * 2} von 400 im Monat`);

check("Ein Flug bleibt unter 120 Abfragen", exactCalls < 120, true);
check("Hin und zurück bleiben unter dem Monatskontingent", exactCalls * 2 < 400, true);
check("Ohne UTC-Zeit wird es NICHT teurer", fuzzyCalls <= exactCalls, true);

// ── Der Meldungstext ────────────────────────────────────────────────────────
// Das ist, was jemand nachts auf dem Sperrbildschirm liest. „Status geändert"
// wäre kaum besser als gar keine Meldung.
const base: StatusFields = {
  status: "Expected", depTime: "13:05", depTerminal: "1", depCheckIn: null,
  depGate: null, arrTime: "08:30", arrTerminal: null, arrGate: null, arrBelt: null,
};
const eq = (name: string, got: string, want: string) => {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : `  → "${got}" statt "${want}"`}`);
};

eq("erster Abruf meldet nichts", describeChange(null, base), "");
eq("nichts geändert → keine Meldung", describeChange(base, { ...base }), "");
eq("Gate neu", describeChange(base, { ...base, depGate: "B24" }), "Gate B24");
eq("Verspätung", describeChange(base, { ...base, depTime: "13:40" }), "Abflug jetzt 13:40");
eq("Kofferband", describeChange(base, { ...base, arrBelt: "7" }), "Kofferband 7");
eq("mehreres zugleich",
  describeChange(base, { ...base, status: "Delayed", depTime: "13:40", depGate: "B24" }),
  "Status: Delayed · Abflug jetzt 13:40 · Gate B24");
// ⚠️ Ein verschwundenes Gate ist KEINE Meldung wert — der Dienst liefert Felder
// zeitweise nicht, und „Gate null" wäre nur verwirrend.
eq("weggefallenes Feld meldet nichts",
  describeChange({ ...base, depGate: "B24" }, { ...base, depGate: null }), "");

// Fingerabdruck muss den Vorzustand verlustfrei zurückgeben, sonst meldet der
// nächste Lauf Änderungen, die keine sind.
const roundTrip = parseSignature(statusSignature(base));
check("Fingerabdruck übersteht Speichern und Lesen",
  roundTrip !== null && describeChange(roundTrip, base), "");
check("kaputter Fingerabdruck → null", parseSignature("{kaputt"), null);
check("fehlender Fingerabdruck → null", parseSignature(null), null);

console.log(`\n${failed === 0 ? "Alle Fälle bestanden." : `${failed} fehlgeschlagen.`}`);
process.exit(failed === 0 ? 0 : 1);
