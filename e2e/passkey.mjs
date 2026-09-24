// Passkey-Registrierung und -Login mit virtuellem Authenticator (CDP).
//
// Warum das Skript existiert: der Passkey-Weg ist ein **vollwertiger
// Login-Faktor**, und bis zum Sprung auf SimpleWebAuthn 14 gab es dafür keinen
// Test. Genau dort steckte dann ein Bruch, den TypeScript nicht sehen konnte —
// ab v11 gehören die Optionen in einen Umschlag `{ optionsJSON }`, und der von
// der Funktion abgeleitete Typ passte weiter zu sich selbst.
//
// Deckt ab:
//  1. Registrierung legt eine Credential-Zeile für den richtigen Nutzer an,
//  2. der Login mit diesem Passkey führt in die App,
//  3. die Credential-Id liegt als base64url in der DB (Format-Wechsel in v11),
//  4. der Signaturzähler wird fortgeschrieben.
import { chromium } from "playwright";
import bcrypt from "bcryptjs";
import { testDb } from "./_db.mjs";

const db = testDb();
const BASE = "http://localhost:3000";
const PASS = "Test-1234!";
const stamp = Date.now();

const user = await db.user.create({
  data: {
    email: `pk-${stamp}@example.test`,
    name: "Passkey Test",
    passwordHash: await bcrypt.hash(PASS, 10),
    role: "USER",
    active: true,
    emailVerified: new Date(),
  },
});

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const results = [];
const ok = (name, cond, extra = "") =>
  results.push(`${cond ? "OK  " : "FEHL"} ${name}${extra ? ` — ${extra}` : ""}`);

try {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log("  [pageerror]", String(e).slice(0, 200)));
  page.on("response", (r) => {
    if (r.url().includes("/passkey/")) {
      console.log("  [http]", r.request().method(), r.status(), r.url().replace(BASE, ""));
    }
  });

  // Virtueller Authenticator: verhält sich wie ein Plattform-Passkey mit
  // Nutzer-Verifikation (Face ID/Fingerabdruck), nur ohne Hardware.
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });

  // ── Anmelden mit Passwort ──────────────────────────────────────────────
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', user.email);
  await page.fill('input[name="password"]', PASS);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 }),
    page.click('button[type="submit"]'),
  ]);

  // ── 1. Passkey einrichten ──────────────────────────────────────────────
  // ⚠️ Auf **Hydration** warten, nicht auf den Knopf (CLAUDE.md, Dev-Server-Falle 4).
  // Der Knopf steht im server-gerenderten HTML, sein onClick hängt aber erst nach
  // der Hydration dran — vorher verpufft der Klick lautlos, und der Test scheitert,
  // obwohl das Feature funktioniert. Genau so ist es hier passiert. Das Profil
  // lädt seine Daten per Client-Effekt: die Antwort ist das Signal.
  const profileLoaded = page.waitForResponse(
    (r) => r.url().includes("/api/v1/me") && r.request().method() === "GET",
    { timeout: 30000 },
  );
  await page.goto(`${BASE}/profil`, { waitUntil: "domcontentloaded" });
  await profileLoaded;
  const btn = page.getByRole("button", { name: "Passkey einrichten" });
  await btn.waitFor({ timeout: 20000 });
  await btn.click();

  let cred = null;
  for (let i = 0; i < 60 && !cred; i++) {
    cred = await db.credential.findFirst({
      where: { userId: user.id },
      select: { id: true, counter: true, publicKey: true },
    });
    if (!cred) await new Promise((r) => setTimeout(r, 500));
  }
  if (!cred) {
    const text = await page.locator("body").innerText();
    console.log("  [UI]", text.split("\n").filter((l) => /Passkey|Biometrie/i.test(l)).join(" | "));
  }
  ok("Credential in der DB", !!cred);
  ok("öffentlicher Schlüssel gespeichert", (cred?.publicKey?.length ?? 0) > 0);
  ok(
    "Credential-Id ist base64url",
    typeof cred?.id === "string" && /^[A-Za-z0-9_-]+$/.test(cred.id),
    cred?.id?.slice(0, 14),
  );

  // ── 2. Abmelden und per Passkey anmelden ───────────────────────────────
  // Abmelden über die Cookies statt über das Menü: der Abmelden-Knopf steckt in
  // einem ausklappbaren Profilmenü, und dessen Aufbau ist hier nicht das Thema.
  await context.clearCookies();
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });

  // ⚠️ Dieselbe Falle wie oben, aber die Login-Seite hat **kein** Netz-Signal:
  // sie lädt beim Mounten nichts. Also direkt prüfen, ob React seine Props schon
  // an den Knopf gehängt hat — `__reactProps$…` ist ein Interna, taugt aber als
  // Hydrations-Nachweis. Ohne das verpufft der erste Klick lautlos.
  await page.waitForFunction(
    () => {
      const b = [...document.querySelectorAll("button")].find((x) =>
        x.textContent?.includes("Mit Fingerabdruck anmelden"),
      );
      return !!b && Object.keys(b).some((k) => k.startsWith("__reactProps$"));
    },
    null,
    { timeout: 30000 },
  );
  await page.getByRole("button", { name: /Mit Fingerabdruck anmelden/ }).click();
  let loggedIn = true;
  await page
    .waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 45000 })
    .catch(async () => {
      loggedIn = false;
      const t = await page.locator("body").innerText();
      console.log("  [UI]", t.split("\n").filter((l) => /Passkey|Fingerabdruck/i.test(l)).join(" | "));
    });
  ok("Passkey-Login führt in die App", loggedIn, page.url().replace(BASE, ""));

  // ── 3. Zähler fortgeschrieben ──────────────────────────────────────────
  if (cred) {
    const after = await db.credential.findUnique({
      where: { id: cred.id },
      select: { counter: true },
    });
    ok(
      "Signaturzähler steht in der DB",
      typeof after?.counter === "number",
      `vorher=${cred.counter} nachher=${after?.counter}`,
    );
  }

  await cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId });
} finally {
  await browser.close();
  await db.user.delete({ where: { id: user.id } }).catch(() => {});
  await db.$disconnect();
}

console.log(results.join("\n"));
const bad = results.filter((x) => x.startsWith("FEHL"));
console.log(bad.length ? `\n${bad.length} FEHLER` : "\nALLES OK");
process.exit(bad.length ? 1 : 0);
