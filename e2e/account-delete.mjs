// Konto-Löschung und Admin-Icons von Ende zu Ende.
//
// Der Kern: nach dem Löschen darf KEINE verwaiste Reise mit Daten zurückbleiben —
// `TripMember` cascadet am User, `Trip` aber nicht (ownerId ist kein FK).
import { chromium } from "playwright";
import bcrypt from "bcryptjs";
import { testDb } from "./_db.mjs";

const db = testDb();
const BASE = "http://localhost:3000";
const PASS = "Test-1234!";
const stamp = Date.now();
const results = [];
const ok = (n, c, x = "") => results.push(`${c ? "OK  " : "FEHL"} ${n}${x ? ` — ${x}` : ""}`);

const mk = async (tag, role = "USER") =>
  db.user.create({
    data: {
      email: `del-${tag}-${stamp}@example.test`,
      name: `Del ${tag}`,
      passwordHash: await bcrypt.hash(PASS, 10),
      role,
      active: true,
      emailVerified: new Date(),
    },
  });

const admin = await mk("admin", "ADMIN");
const solo = await mk("solo");
const shared1 = await mk("shared1");
const shared2 = await mk("shared2");
const created = [admin.id, solo.id, shared1.id, shared2.id];

let restoreAdmins = [];
const browser = await chromium.launch({ args: ["--no-sandbox"] });

async function login(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
}

try {
  // ---------- Fall 1: Alleiniges Mitglied löscht sich selbst ----------
  const ctx1 = await browser.newContext();
  const p1 = await ctx1.newPage();
  await login(p1, solo.email);
  // Reise anlegen lassen + Daten erzeugen
  await p1.evaluate(async () => {
    const post = (u, b) =>
      fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
    await post("/api/v1/expenses", { category: "ESSEN", label: "Ramen", yen: 1200 });
    await post("/api/v1/bookings", { title: "Ticket", kind: "TICKET", date: "2026-12-01" });
    await post("/api/v1/luggage", { ownerName: "Solo", label: "Koffer" });
  });
  const soloTrip = await db.tripMember.findUnique({ where: { userId: solo.id } });
  const before = {
    expenses: await db.expense.count({ where: { tripId: soloTrip.tripId } }),
    bookings: await db.booking.count({ where: { tripId: soloTrip.tripId } }),
    luggage: await db.luggageTag.count({ where: { tripId: soloTrip.tripId } }),
  };
  ok("Solo-Reise hat Daten", before.expenses > 0 && before.bookings > 0, JSON.stringify(before));

  // falsches Passwort → abgewiesen
  const wrong = await p1.evaluate(() =>
    fetch("/api/v1/me", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "falsch-falsch" }),
    }).then((r) => r.status),
  );
  ok("falsches Passwort abgewiesen", wrong === 403, `status=${wrong}`);
  ok("Konto existiert noch", (await db.user.count({ where: { id: solo.id } })) === 1);

  // ohne Passwort → 400
  const noPw = await p1.evaluate(() =>
    fetch("/api/v1/me", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }).then((r) => r.status),
  );
  ok("ohne Passwort abgewiesen", noPw === 400, `status=${noPw}`);

  // richtiges Passwort → gelöscht
  const del = await p1.evaluate(
    (pw) =>
      fetch("/api/v1/me", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: pw }),
      }).then(async (r) => ({ status: r.status, body: await r.json() })),
    PASS,
  );
  ok("Selbst-Löschung 200", del.status === 200, `status=${del.status}`);
  ok("Reise wurde mitgelöscht (tripDeleted)", del.body?.tripDeleted === true, JSON.stringify(del.body));
  ok("Konto weg", (await db.user.count({ where: { id: solo.id } })) === 0);
  ok("Reise weg", (await db.trip.count({ where: { id: soloTrip.tripId } })) === 0);
  const after = {
    expenses: await db.expense.count({ where: { tripId: soloTrip.tripId } }),
    bookings: await db.booking.count({ where: { tripId: soloTrip.tripId } }),
    luggage: await db.luggageTag.count({ where: { tripId: soloTrip.tripId } }),
  };
  ok("KEINE verwaisten Reisedaten", after.expenses === 0 && after.bookings === 0 && after.luggage === 0, JSON.stringify(after));
  await ctx1.close();

  // ---------- Fall 2: Geteilte Reise — Owner löscht sich ----------
  const ctx2 = await browser.newContext();
  const p2 = await ctx2.newPage();
  await login(p2, shared1.email);
  await p2.evaluate(async () => {
    await fetch("/api/v1/expenses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ category: "ESSEN", label: "Gemeinsam", yen: 900 }),
    });
  });
  const m1 = await db.tripMember.findUnique({ where: { userId: shared1.id } });
  // shared2 in dieselbe Reise setzen (wie nach einer Einladung)
  await db.tripMember.deleteMany({ where: { userId: shared2.id } });
  await db.tripMember.create({ data: { tripId: m1.tripId, userId: shared2.id } });
  await db.trip.update({ where: { id: m1.tripId }, data: { ownerId: shared1.id } });

  const delShared = await p2.evaluate(
    (pw) =>
      fetch("/api/v1/me", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: pw }),
      }).then(async (r) => ({ status: r.status, body: await r.json() })),
    PASS,
  );
  ok("Owner-Löschung 200", delShared.status === 200);
  ok("Reise NICHT gelöscht", delShared.body?.tripDeleted === false, JSON.stringify(delShared.body));
  const trip2 = await db.trip.findUnique({ where: { id: m1.tripId }, select: { ownerId: true } });
  ok("Reise existiert weiter", trip2 !== null);
  ok("Eigentum weitergegeben", trip2?.ownerId === shared2.id, `ownerId=${trip2?.ownerId}`);
  ok("Ausgabe bleibt erhalten", (await db.expense.count({ where: { tripId: m1.tripId } })) > 0);
  const exp = await db.expense.findFirst({ where: { tripId: m1.tripId } });
  ok("paidById auf null (SetNull)", exp.paidById === null, `paidById=${exp.paidById}`);
  ok("Name bleibt als Schnappschuss", Boolean(exp.createdByName), `createdByName=${exp.createdByName}`);
  await ctx2.close();

  // ---------- Fall 3: Admin ----------
  const ctx3 = await browser.newContext();
  const p3 = await ctx3.newPage();
  await login(p3, admin.email);

  // eigenes Konto über den Admin-Endpunkt → verboten
  const self = await p3.evaluate(
    (id) => fetch(`/api/v1/users/${id}`, { method: "DELETE" }).then((r) => r.status),
    admin.id,
  );
  ok("Admin kann sich selbst hier nicht löschen", self === 403, `status=${self}`);

  // Letzter aktiver Admin: die übrigen kurz deaktivieren, prüfen, wiederherstellen.
  // (Der Seed bringt eigene Admins mit — ohne das wäre die Sperre nie erreicht.)
  const otherAdmins = await db.user.findMany({
    where: { role: "ADMIN", active: true, id: { not: admin.id } },
    select: { id: true },
  });
  restoreAdmins = otherAdmins.map((a) => a.id);
  if (restoreAdmins.length) {
    await db.user.updateMany({ where: { id: { in: restoreAdmins } }, data: { active: false } });
  }
  const lastAdminSelf = await p3.evaluate(
    (pw) =>
      fetch("/api/v1/me", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: pw }),
      }).then((r) => r.status),
    PASS,
  );
  ok("letzter Admin darf sich nicht selbst löschen", lastAdminSelf === 403, `status=${lastAdminSelf}`);
  ok("Admin-Konto noch da", (await db.user.count({ where: { id: admin.id } })) === 1);
  if (restoreAdmins.length) {
    await db.user.updateMany({ where: { id: { in: restoreAdmins } }, data: { active: true } });
    restoreAdmins = [];
  }

  // Icons für ein fremdes Konto setzen
  const iconRes = await p3.evaluate(async (targetId) => {
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const g = c.getContext("2d");
    g.fillStyle = "#0f0";
    g.fillRect(4, 4, 24, 24);
    const data = c.toDataURL("image/png");
    const put = await fetch(`/api/v1/users/${targetId}/icons/geld`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data }),
    });
    const get = await fetch(`/api/v1/users/${targetId}/icons`).then((r) => r.json());
    const badSection = await fetch(`/api/v1/users/${targetId}/icons/gibtsnicht`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data }),
    }).then((r) => r.status);
    const badUser = await fetch(`/api/v1/users/nichtda/icons/geld`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data }),
    }).then((r) => r.status);
    return { put: put.status, hasGeld: Boolean(get?.geld), badSection, badUser };
  }, shared2.id);
  ok("Admin setzt fremdes Symbol", iconRes.put === 200, `status=${iconRes.put}`);
  ok("Symbol beim Ziel-Konto gespeichert", iconRes.hasGeld);
  ok("unbekannter Bereich → 400", iconRes.badSection === 400, `status=${iconRes.badSection}`);
  ok("unbekannter Nutzer → 404", iconRes.badUser === 404, `status=${iconRes.badUser}`);
  const flag = await db.user.findUnique({ where: { id: shared2.id }, select: { customIcons: true } });
  ok("Spiegel-Flag beim Ziel gesetzt", flag?.customIcons === true);

  // Nicht-Admin darf weder fremde Symbole setzen noch Konten löschen
  const ctx4 = await browser.newContext();
  const p4 = await ctx4.newPage();
  await login(p4, shared2.email);
  const noIcon = await p4.evaluate(
    (id) =>
      fetch(`/api/v1/users/${id}/icons/geld`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ data: "data:image/png;base64,AAA" }),
      }).then((r) => r.status),
    admin.id,
  );
  ok("Nicht-Admin: Symbol setzen abgewiesen", noIcon === 403, `status=${noIcon}`);
  const noDel = await p4.evaluate(
    (id) => fetch(`/api/v1/users/${id}`, { method: "DELETE" }).then((r) => r.status),
    admin.id,
  );
  ok("Nicht-Admin: Löschen abgewiesen", noDel === 403, `status=${noDel}`);
  await ctx4.close();

  // Admin löscht fremdes Konto
  const admDel = await p3.evaluate(
    (id) => fetch(`/api/v1/users/${id}`, { method: "DELETE" }).then((r) => r.status),
    shared2.id,
  );
  ok("Admin löscht fremdes Konto", admDel === 200, `status=${admDel}`);
  ok("Konto weg", (await db.user.count({ where: { id: shared2.id } })) === 0);
  ok(
    "Icon-Zeilen mitgelöscht (Cascade)",
    (await db.userSectionIcon.count({ where: { userId: shared2.id } })) === 0,
  );
  await ctx3.close();
} finally {
  await browser.close();
  // Falls der Lauf mitten in der Letzter-Admin-Prüfung abbricht: Seed-Admins
  // MÜSSEN wieder aktiv sein, sonst bleibt die Installation ohne Verwaltung.
  if (restoreAdmins.length) {
    await db.user
      .updateMany({ where: { id: { in: restoreAdmins } }, data: { active: true } })
      .catch(() => {});
  }
  await db.user.deleteMany({ where: { id: { in: created } } }).catch(() => {});
  await db.$disconnect();
}

console.log(results.join("\n"));
console.log(results.every((r) => r.startsWith("OK")) ? "\nALLES OK" : "\nFEHLER VORHANDEN");
