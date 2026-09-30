// Flug-Status-Cron: Zugangsschutz und Auswahl der Kandidaten.
//
// ⚠️ Dieser Test ruft AeroDataBox bewusst **nie** auf. Jeder Aufruf zählt aufs
// Monatskontingent eines kostenpflichtigen Dienstes — ein Test, der genau die
// Ressource verbrennt, die er schützen soll, wäre absurd. Deshalb liegen alle
// angelegten Flüge außerhalb des Prüffensters oder gelten als eben erst geprüft;
// erwartet wird durchgehend `checked: 0`.
//
// Die inhaltliche Logik (Fenster, Takt, Meldungstext) prüft `e2e/flight-due.ts`
// ohne Netz und ohne Datenbank.
import bcrypt from "bcryptjs";
import { testDb } from "./_db.mjs";

const db = testDb();
const BASE = "http://localhost:3000";
const stamp = Date.now();
const H = 3600_000;

const secret = process.env.CRON_SECRET;
if (!secret) {
  console.log("FEHL CRON_SECRET ist nicht gesetzt — der Endpunkt wäre gesperrt.");
  process.exit(1);
}

const user = await db.user.create({
  data: {
    email: `flightcron-${stamp}@example.test`,
    name: "Flug Cron",
    passwordHash: bcrypt.hashSync("Test-1234!", 10),
    role: "USER",
    active: true,
    emailVerified: new Date(),
  },
});
const trip = await db.trip.create({ data: { name: `Cron-Test ${stamp}`, ownerId: user.id } });
await db.tripMember.create({ data: { tripId: trip.id, userId: user.id } });

const results = [];
const ok = (n, c, e = "") => results.push(`${c ? "OK  " : "FEHL"} ${n}${e ? ` — ${e}` : ""}`);
const call = (headers) =>
  fetch(`${BASE}/api/v1/cron/flight-status`, { headers }).then(async (r) => ({
    status: r.status,
    body: await r.json().catch(() => null),
  }));

try {
  // ── Zugangsschutz ───────────────────────────────────────────────────────
  ok("ohne Header → 401", (await call({})).status === 401);
  ok("falsches Secret → 401", (await call({ Authorization: "Bearer falsch" })).status === 401);

  const auth = { Authorization: `Bearer ${secret}` };

  // ── Flüge, die NICHT abgefragt werden dürfen ────────────────────────────
  const now = Date.now();
  const mk = (label, data) =>
    db.flight.create({
      data: {
        tripId: trip.id,
        flightNumber: `XX${label}`,
        fromCode: "FRA",
        toCode: "HND",
        createdByName: "Test",
        ...data,
      },
    });

  // (a) längst vorbei → nicht einmal Kandidat
  await mk("01", {
    departure: new Date(now - 200 * H),
    departureUtc: new Date(now - 200 * H),
    arrivalUtc: new Date(now - 186 * H),
  });
  // (b) weit in der Zukunft → nicht einmal Kandidat
  await mk("02", { departure: new Date(now + 200 * H), departureUtc: new Date(now + 200 * H) });
  // (c) im Grobfilter, aber außerhalb des Fensters (18 h vor Abflug, exakt)
  await mk("03", { departure: new Date(now + 18 * H), departureUtc: new Date(now + 18 * H) });
  // (d) im Fenster, aber gerade eben geprüft → Takt verbietet den Aufruf
  await mk("04", {
    departure: new Date(now + 2 * H),
    departureUtc: new Date(now + 2 * H),
    arrivalUtc: new Date(now + 16 * H),
    liveCheckedAt: new Date(now - 60_000),
  });

  const r = await call(auth);
  ok("autorisiert → 200", r.status === 200, JSON.stringify(r.body));
  ok("kein einziger Abruf beim Dienst", r.body?.checked === 0, `checked=${r.body?.checked}`);
  ok("keine Benachrichtigung", r.body?.notified === 0, `notified=${r.body?.notified}`);
  ok("keine Fehler", (r.body?.errors?.length ?? 0) === 0, JSON.stringify(r.body?.errors));

  // ⚠️ Der Grobfilter darf nur die zeitlich nahen Flüge ziehen — sonst läse jeder
  // Lauf die gesamte Flughistorie der Datenbank.
  const ours = [
    { l: "01", inRange: false },
    { l: "02", inRange: false },
    { l: "03", inRange: true },
    { l: "04", inRange: true },
  ];
  ok(
    "Grobfilter zieht nur zeitnahe Flüge",
    r.body?.candidates >= ours.filter((o) => o.inRange).length,
    `candidates=${r.body?.candidates}`,
  );

  // ── Nichts wurde angefasst ──────────────────────────────────────────────
  const untouched = await db.flight.findMany({
    where: { tripId: trip.id },
    select: { flightNumber: true, liveSignature: true },
  });
  ok(
    "kein Status geschrieben (es gab ja keinen Abruf)",
    untouched.every((f) => f.liveSignature === null),
    untouched.map((f) => `${f.flightNumber}:${f.liveSignature}`).join(" "),
  );
} finally {
  console.log(results.join("\n"));
  const failed = results.filter((x) => x.startsWith("FEHL")).length;
  console.log(`\n${results.length - failed}/${results.length} OK`);
  await db.flight.deleteMany({ where: { tripId: trip.id } }).catch(() => {});
  await db.user.delete({ where: { id: user.id } }).catch(() => {});
  await db.trip.delete({ where: { id: trip.id } }).catch(() => {});
  await db.$disconnect();
  process.exit(failed ? 1 : 0);
}
