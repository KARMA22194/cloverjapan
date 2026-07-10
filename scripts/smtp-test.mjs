// SMTP-Verbindungstest für die Einladungs-Mails.
// Aufruf im Container:
//   docker compose run --rm app node scripts/smtp-test.mjs empfaenger@example.com
// Ohne Empfänger-Argument wird nur die Verbindung geprüft (kein Versand).
import nodemailer from "nodemailer";

const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
const to = process.argv[2];

function fail(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

if (!SMTP_HOST) fail("SMTP_HOST ist nicht gesetzt (.env prüfen, danach `docker compose restart app`).");
if (!SMTP_USER || SMTP_USER.startsWith("DEINE_ADRESSE")) fail("SMTP_USER ist noch ein Platzhalter — echte Gmail-Adresse eintragen.");
if (!SMTP_PASS || SMTP_PASS === "APP_PASSWORT_16_ZEICHEN") fail("SMTP_PASS ist noch ein Platzhalter — Google-App-Passwort eintragen.");

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: Number(SMTP_PORT ?? 587),
  secure: SMTP_SECURE === "true",
  auth: { user: SMTP_USER, pass: SMTP_PASS },
});

console.log(`→ Verbinde mit ${SMTP_HOST}:${SMTP_PORT} (secure=${SMTP_SECURE}) als ${SMTP_USER} …`);

try {
  await transporter.verify();
  console.log("✅ SMTP-Verbindung & Login erfolgreich.");
} catch (err) {
  fail(`Verbindung/Login fehlgeschlagen: ${err.message}`);
}

if (to) {
  try {
    const info = await transporter.sendMail({
      from: SMTP_FROM ?? SMTP_USER,
      to,
      subject: "Testmail — Clover Japan",
      text: "Wenn du das liest, funktioniert der E-Mail-Versand für Reise-Einladungen. 🍀",
    });
    console.log(`✅ Testmail an ${to} gesendet (messageId: ${info.messageId}).`);
  } catch (err) {
    fail(`Versand fehlgeschlagen: ${err.message}`);
  }
} else {
  console.log("ℹ️  Kein Empfänger angegeben → keine Testmail versendet. Zum Senden: node scripts/smtp-test.mjs deine@adresse.de");
}
