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

/** Kurzlebiges Challenge-Cookie zwischen options- und verify-Aufruf. */
export const CHALLENGE_COOKIE = "pk_chal";

/** Liest einen Cookie-Wert aus einem rohen Cookie-Header. */
export function readCookie(header: string, name: string): string | undefined {
  const found = header
    .split(";")
    .map((s) => s.trim())
    .find((c) => c.startsWith(`${name}=`));
  return found ? decodeURIComponent(found.slice(name.length + 1)) : undefined;
}
