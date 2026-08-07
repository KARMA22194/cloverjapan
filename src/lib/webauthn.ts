// WebAuthn/Passkey-Konfiguration. Für Produktion via ENV setzen (HTTPS-Domain).
export const rpName = process.env.WEBAUTHN_RP_NAME ?? "Time Tracker";
export const rpID = process.env.WEBAUTHN_RP_ID ?? "localhost";
export const origin = process.env.WEBAUTHN_ORIGIN ?? "http://localhost:3000";

/**
 * Fail-Fast zur **Laufzeit** (nicht beim Import/Build): In Produktion dürfen
 * RP-ID/Origin nicht auf die localhost/HTTP-Defaults zurückfallen — sonst würden
 * Assertions still gegen localhost validiert. Wird zu Beginn jedes Passkey-Flows
 * aufgerufen. Bewusst kein Modul-Level-Throw: `next build` evaluiert die Route-Module
 * mit NODE_ENV=production, hat dabei aber keine Runtime-Secrets → würde den Build brechen.
 */
export function assertWebauthnConfig(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (!process.env.WEBAUTHN_RP_ID || !process.env.WEBAUTHN_ORIGIN) {
    throw new Error("WEBAUTHN_RP_ID und WEBAUTHN_ORIGIN müssen in Produktion gesetzt sein.");
  }
  if (!process.env.WEBAUTHN_ORIGIN.startsWith("https://")) {
    throw new Error("WEBAUTHN_ORIGIN muss in Produktion eine https://-URL sein.");
  }
}

/**
 * Kurzlebige Challenge-Cookies zwischen options- und verify-Aufruf.
 *
 * Registrierung und Login haben **getrennte** Namen: mit einem gemeinsamen Cookie
 * ließe sich eine für den einen Flow ausgestellte Challenge im anderen einreichen.
 * Die eigentliche Einmal-Verwendung erzwingt `services/webauthnChallenge.ts`.
 */
export const CHALLENGE_COOKIE_REGISTER = "pk_chal_reg";
export const CHALLENGE_COOKIE_AUTH = "pk_chal_auth";

/** Cookie-Optionen für beide Challenge-Cookies. */
export const challengeCookieOptions = {
  httpOnly: true,
  path: "/",
  maxAge: 300,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
} as const;

/** Liest einen Cookie-Wert aus einem rohen Cookie-Header. */
export function readCookie(header: string, name: string): string | undefined {
  const found = header
    .split(";")
    .map((s) => s.trim())
    .find((c) => c.startsWith(`${name}=`));
  return found ? decodeURIComponent(found.slice(name.length + 1)) : undefined;
}
