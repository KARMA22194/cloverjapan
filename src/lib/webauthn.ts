// WebAuthn/Passkey-Konfiguration. Für Produktion via ENV setzen (HTTPS-Domain).
export const rpName = process.env.WEBAUTHN_RP_NAME ?? "Time Tracker";
export const rpID = process.env.WEBAUTHN_RP_ID ?? "localhost";
export const origin = process.env.WEBAUTHN_ORIGIN ?? "http://localhost:3000";

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
