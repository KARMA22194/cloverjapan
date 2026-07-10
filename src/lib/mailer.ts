import nodemailer from "nodemailer";

// SMTP-Transport aus Env; null, wenn nicht konfiguriert (dann kein Versand).
function transport() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
}

/**
 * Schickt eine Einladungs-Mail zur gemeinsamen Japan-Reise.
 * Gibt zurück, ob tatsächlich versendet wurde (false, wenn SMTP fehlt/Fehler).
 */
export async function sendTripInviteEmail(to: string, inviterName: string): Promise<boolean> {
  const t = transport();
  if (!t) return false;

  const from = process.env.SMTP_FROM ?? "CloverJapanPlaner <no-reply@localhost>";
  const appUrl = process.env.APP_URL ?? "";
  try {
    await t.sendMail({
      from,
      to,
      subject: `${inviterName} hat dich zur Japan-Reise eingeladen`,
      text:
        `${inviterName} hat dich zur gemeinsamen Japan-Reise (CloverJapanPlaner) eingeladen.\n\n` +
        `Melde dich in der App an${appUrl ? `: ${appUrl}` : "."}\n` +
        `Dort bearbeitet ihr Reiseplaner, Ausgaben, Tagesplaner und Checkliste gemeinsam.`,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Schickt einer Person OHNE Konto den Registrierungs-Link zur Japan-Reise.
 * Gibt zurück, ob tatsächlich versendet wurde (false, wenn SMTP fehlt/Fehler).
 */
export async function sendRegistrationInviteEmail(
  to: string,
  inviterName: string,
  inviteUrl: string,
): Promise<boolean> {
  const t = transport();
  if (!t) return false;

  const from = process.env.SMTP_FROM ?? "CloverJapanPlaner <no-reply@localhost>";
  try {
    await t.sendMail({
      from,
      to,
      subject: `${inviterName} hat dich zur Japan-Reise eingeladen`,
      text:
        `${inviterName} hat dich zur gemeinsamen Japan-Reise (CloverJapanPlaner) eingeladen.\n\n` +
        `Du hast noch kein Konto. Registriere dich über diesen Link (7 Tage gültig):\n` +
        `${inviteUrl}\n\n` +
        `Danach bearbeitet ihr Reiseplaner, Ausgaben, Tagesplaner und Checkliste gemeinsam.`,
    });
    return true;
  } catch {
    return false;
  }
}
