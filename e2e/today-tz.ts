/**
 * „Heute" muss der Zeitzone des GERÄTS folgen, nicht einer festen App-Zeitzone.
 *
 * Ohne Netz und ohne Datenbank:
 *   docker compose exec -T app node --experimental-strip-types e2e/today-tz.ts
 *
 * WARUM DAS EINEN TEST BRAUCHT: der Fehler ist in Deutschland unsichtbar. Er
 * zeigt sich erst in Japan, jeden Morgen zwischen Mitternacht und 7:00 — also
 * dort, wo niemand mehr in Ruhe suchen kann. Zweimal wurde an dieser Stelle
 * schon die falsche Bezugsgröße eingesetzt (erst UTC, dann Europe/Berlin).
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { daysUntil, todayParam } from "../src/lib/time.ts";

// Ein Augenblick, an dem sich Tokio und Berlin im KALENDERTAG unterscheiden:
// 21:00 UTC → in Tokio (UTC+9) schon 6:00 des Folgetags, in Berlin (UTC+2) noch
// 23:00 des Vortags. Genau das Fenster, in dem der Tagesplaner falsch lag.
const INSTANT = "2026-08-18T21:00:00Z";

interface Case {
  tz: string;
  today: string;
  /** Tage bis zum 19.08.2026 aus Sicht dieser Zeitzone. */
  untilAug19: number;
}

const CASES: Case[] = [
  { tz: "Asia/Tokyo", today: "2026-08-19", untilAug19: 0 },
  { tz: "Europe/Berlin", today: "2026-08-18", untilAug19: 1 },
  { tz: "UTC", today: "2026-08-18", untilAug19: 1 },
  // Westlich von Greenwich, damit nicht nur „Osten" geprüft wird.
  { tz: "America/New_York", today: "2026-08-18", untilAug19: 1 },
];

// Kindprozess-Modus: misst in der per TZ gesetzten Zone und meldet das Ergebnis.
if (process.argv[2] === "--measure") {
  const now = new Date(INSTANT);
  process.stdout.write(JSON.stringify({ today: todayParam(now), until: daysUntil("2026-08-19", now) }));
  process.exit(0);
}

const self = fileURLToPath(import.meta.url);
let failed = 0;

for (const c of CASES) {
  const run = spawnSync(
    process.execPath,
    ["--experimental-strip-types", self, "--measure"],
    { env: { ...process.env, TZ: c.tz }, encoding: "utf8" },
  );
  if (run.status !== 0) {
    failed++;
    console.log(`✗ ${c.tz}: Kindprozess fehlgeschlagen — ${run.stderr.trim().split("\n").pop()}`);
    continue;
  }
  const got = JSON.parse(run.stdout) as { today: string; until: number };
  const okToday = got.today === c.today;
  const okUntil = got.until === c.untilAug19;
  if (okToday && okUntil) {
    console.log(`✓ ${c.tz.padEnd(18)} heute=${got.today}  Tage bis 19.08.=${got.until}`);
  } else {
    failed++;
    console.log(
      `✗ ${c.tz.padEnd(18)} heute=${got.today} (erwartet ${c.today}), ` +
        `Tage bis 19.08.=${got.until} (erwartet ${c.untilAug19})`,
    );
  }
}

// Die eigentliche Zusicherung: Tokio und Berlin dürfen sich an diesem Augenblick
// NICHT einig sein. Wäre „heute" wieder fest verdrahtet, lieferten beide dasselbe
// und alle Einzelfälle oben blieben trotzdem grün, sobald die feste Zone zufällig
// passt.
const tokyo = CASES.find((c) => c.tz === "Asia/Tokyo")!.today;
const berlin = CASES.find((c) => c.tz === "Europe/Berlin")!.today;
if (tokyo === berlin) {
  failed++;
  console.log("✗ Der Prüffall taugt nicht: Tokio und Berlin liegen am selben Tag.");
} else {
  console.log(`✓ Prüffall trennt sauber: Tokio ${tokyo} vs. Berlin ${berlin}`);
}

console.log(`\n${failed === 0 ? `Alle ${CASES.length + 1} Fälle bestanden.` : `${failed} fehlgeschlagen.`}`);
process.exit(failed === 0 ? 0 : 1);
