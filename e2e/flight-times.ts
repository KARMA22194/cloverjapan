/**
 * Welche Flugzeit gilt — und wie verbindlich ist sie?
 *
 * Ohne Netz und ohne Datenbank:
 *   docker compose exec -T app node --experimental-strip-types e2e/flight-times.ts
 *
 * WARUM DAS EINEN TEST BRAUCHT: AeroDataBox liefert vier Zeiten je Endpunkt,
 * und drei davon sahen in der App gleich aus. Eine bloße **Vorhersage** wurde
 * wie eine gemeldete Verspätung dargestellt (rot, Plan durchgestrichen) —
 * direkt neben dem grünen „Planmäßig". Teurer war der unsichtbare Teil: dieselbe
 * Zahl ging in die Push-Signatur, also löste jedes Wackeln der Vorhersage eine
 * Benachrichtigung aus. Beides fällt im Code nicht auf, nur im Ergebnis.
 */
import {
  displayTime,
  endpointTimes,
  statusFields,
  describeChange,
  PREDICTION_MIN_MINUTES,
  type EndpointTimes,
} from "../src/lib/services/flightSchedule.ts";
import type { LiveStatus } from "../src/lib/services/flightStatus.ts";

let failed = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = Object.is(got, want);
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : `  → ${got} statt ${want}`}`);
};

/** AeroDataBox-Ortszeit für den 19.08.2026 in Tokio. */
const t = (hhmm: string) => ({ local: `2026-08-19 ${hhmm}:00+09:00` });

/* ── 1. Zuordnung der Rohfelder ─────────────────────────────────────────── */

const plan = endpointTimes({ scheduledTime: t("10:45") });
check("nur Plan → scheduled", plan.scheduled?.slice(11, 16), "10:45");
check("nur Plan → kein revised", plan.revised, null);
check("nur Plan → kein predicted", plan.predicted, null);

const pred = endpointTimes({ scheduledTime: t("10:45"), predictedTime: t("10:51") });
check("Vorhersage landet NICHT in revised", pred.revised, null);
check("Vorhersage landet in predicted", pred.predicted?.slice(11, 16), "10:51");

const rev = endpointTimes({
  scheduledTime: t("10:45"),
  revisedTime: t("12:30"),
  predictedTime: t("10:51"),
});
check("Meldung landet in revised", rev.revised?.slice(11, 16), "12:30");
check("Meldung verdrängt die Vorhersage nicht aus predicted", rev.predicted?.slice(11, 16), "10:51");

const flown = endpointTimes({ scheduledTime: t("10:45"), runwayTime: t("10:58") });
check("tatsächliche Zeit gilt als gemeldet", flown.revised?.slice(11, 16), "10:58");

const both = endpointTimes({ scheduledTime: t("10:45"), revisedTime: t("12:30"), runwayTime: t("12:41") });
check("gemeldet schlägt Landebahn-Zeit", both.revised?.slice(11, 16), "12:30");

/* ── 2. Darstellung ─────────────────────────────────────────────────────── */

const ep = (o: Partial<EndpointTimes>): EndpointTimes =>
  ({ scheduled: null, revised: null, predicted: null, ...o });

const d1 = displayTime(ep({ scheduled: t("10:45").local }));
check("nur Plan → kind scheduled", d1.kind, "scheduled");
check("nur Plan → zeigt 10:45", d1.shown, "10:45");

// Der Fall aus dem Screenshot: sechs Minuten Vorhersage.
const d2 = displayTime(ep({ scheduled: t("10:45").local, predicted: t("10:51").local }));
check("6-min-Vorhersage → NICHT als Änderung", d2.kind, "scheduled");
check("6-min-Vorhersage → zeigt weiter den Plan", d2.shown, "10:45");

const d3 = displayTime(ep({ scheduled: t("10:45").local, predicted: t("11:00").local }));
check("15-min-Vorhersage → kind predicted", d3.kind, "predicted");
check("15-min-Vorhersage → zeigt 11:00", d3.shown, "11:00");
check("15-min-Vorhersage → Plan bleibt sichtbar", d3.scheduled, "10:45");

const d4 = displayTime(ep({ scheduled: t("10:45").local, predicted: t("10:29").local }));
check("Vorhersage 16 min FRÜHER → auch das zählt", d4.kind, "predicted");

const d5 = displayTime(
  ep({ scheduled: t("10:45").local, revised: t("12:30").local, predicted: t("10:51").local }),
);
check("Meldung schlägt Vorhersage", d5.kind, "revised");
check("Meldung → zeigt 12:30", d5.shown, "12:30");

const d6 = displayTime(ep({ scheduled: t("10:45").local, revised: t("10:45").local }));
check("Meldung gleich dem Plan → keine Hervorhebung", d6.kind, "scheduled");

const d7 = displayTime(ep({ predicted: t("10:51").local }));
check("ohne Plan ist die Vorhersage besser als nichts", d7.shown, "10:51");

const d8 = displayTime(ep({}));
check("gar keine Zeit → nichts zu zeigen", d8.shown, null);

// Die Schwelle steht im Erklärtext der Oberfläche — sie darf nicht still wandern.
check("Schwelle unverändert", PREDICTION_MIN_MINUTES, 15);

/* ── 3. Push: eine Vorhersage ist keine Nachricht ───────────────────────── */

const live = (arr: Partial<EndpointTimes>): LiveStatus => ({
  found: true,
  flightNumber: "NH204",
  status: "Expected",
  departure: {
    airportIata: "FRA",
    scheduled: "2026-08-19 14:00:00+02:00",
    revised: null,
    predicted: null,
    terminal: "1",
    checkInDesk: null,
    gate: null,
  },
  arrival: {
    airportIata: "HND",
    scheduled: t("10:45").local,
    revised: null,
    predicted: null,
    terminal: "3",
    gate: null,
    baggageBelt: null,
    ...arr,
  },
  departureUtc: null,
  arrivalUtc: null,
});

const before = statusFields(live({}));
const afterPrediction = statusFields(live({ predicted: t("10:51").local }));
check("Vorhersage ändert die Push-Signatur nicht", describeChange(before, afterPrediction), "");

const afterWobble = statusFields(live({ predicted: t("11:20").local }));
check(
  "auch eine große Vorhersage löst keinen Push aus",
  describeChange(before, afterWobble),
  "",
);

const afterReport = statusFields(live({ revised: t("12:30").local }));
check(
  "eine gemeldete Verspätung schon",
  describeChange(before, afterReport),
  "Ankunft jetzt 12:30",
);

console.log(failed === 0 ? "\nAlles grün." : `\n${failed} Fehlschlag/Fehlschläge.`);
process.exit(failed === 0 ? 0 : 1);
