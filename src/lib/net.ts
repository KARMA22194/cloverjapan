import { lookup } from "node:dns/promises";

import { ApiError } from "@/lib/api/http";

/**
 * SSRF-Schutz für server-seitige Fetches auf **nutzergesteuerte** URLs
 * (z. B. eingefügte Maps-Links im Reiseplaner).
 *
 * Vorgehen (Best Practice ohne vollen Forward-Proxy):
 *  1. Nur http/https zulassen.
 *  2. Host per DNS auflösen und jede Ziel-IP gegen private/loopback/link-local/
 *     metadata-Ranges prüfen (blockt 169.254.169.254, localhost, db:5432 …).
 *  3. Redirects **manuell** verfolgen und jeden Hop erneut prüfen (Kurzlinks!).
 *  4. Timeout + Größenlimit an der Aufrufstelle.
 *
 * Rest-Risiko DNS-Rebinding (IP ändert sich zwischen Prüfung und Verbindung) bleibt
 * bestehen; das erforderte ein Pinning der aufgelösten IP beim Connect (heavier).
 */

function ipv4IsPrivate(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true; // im Zweifel blocken
  const [a, b] = p;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8 (privat)
  if (a === 127) return true; // 127.0.0.0/8 (loopback)
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local / Cloud-Metadaten)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 (privat)
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 (privat)
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
  if (a === 192 && b === 0) return true; // 192.0.0.0/24 (IETF)
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 (Benchmark)
  if (a >= 224) return true; // 224.0.0.0/4 Multicast + 240.0.0.0/4 reserviert
  return false;
}

function ipv6IsPrivate(ip: string): boolean {
  const addr = ip.toLowerCase().split("%")[0]; // Zone-Index entfernen
  if (addr === "::1" || addr === "::") return true; // loopback / unspecified
  // IPv4-mapped/embedded (::ffff:a.b.c.d) → auf den v4-Teil prüfen.
  const v4 = addr.match(/(?:^|:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4) return ipv4IsPrivate(v4[1]);
  if (addr.startsWith("fe8") || addr.startsWith("fe9") || addr.startsWith("fea") || addr.startsWith("feb"))
    return true; // fe80::/10 link-local
  if (addr.startsWith("fc") || addr.startsWith("fd")) return true; // fc00::/7 ULA
  return false;
}

async function assertPublicUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ApiError(400, "Ungültige URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ApiError(400, "Nur http/https-URLs sind erlaubt.");
  }
  const results = await lookup(url.hostname, { all: true }).catch(() => {
    throw new ApiError(400, "Host konnte nicht aufgelöst werden.");
  });
  for (const { address, family } of results) {
    const isPrivate = family === 6 ? ipv6IsPrivate(address) : ipv4IsPrivate(address);
    if (isPrivate) throw new ApiError(400, "Zugriff auf interne/private Adressen ist nicht erlaubt.");
  }
}

/**
 * Fetch mit SSRF-Schutz: prüft die URL (und jeden Redirect-Hop) gegen private
 * Adressbereiche und verfolgt Redirects manuell.
 */
export async function safeFetch(
  rawUrl: string,
  init: RequestInit & { maxRedirects?: number; timeoutMs?: number } = {},
): Promise<Response> {
  const { maxRedirects = 4, timeoutMs = 8000, ...rest } = init;
  let url = rawUrl;
  for (let i = 0; i <= maxRedirects; i++) {
    await assertPublicUrl(url);
    const res = await fetch(url, {
      ...rest,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (location) {
        url = new URL(location, url).toString();
        continue;
      }
    }
    return res;
  }
  throw new ApiError(400, "Zu viele Weiterleitungen.");
}
