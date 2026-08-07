import { lookup } from "node:dns/promises";

import { ApiError } from "@/lib/api/http";

/**
 * SSRF-Schutz für server-seitige Fetches auf **nutzergesteuerte** URLs
 * (z. B. eingefügte Maps-Links im Reiseplaner).
 *
 * Vorgehen (Best Practice ohne vollen Forward-Proxy):
 *  1. Nur http/https **und** nur die Standard-Ports 80/443 zulassen (sonst wäre der
 *     Server über eine öffentliche IP ein Port-Scanner/Request-Relay auf beliebige
 *     Dienste, z. B. `http://example.com:5432`).
 *  2. Host per DNS auflösen und jede Ziel-IP gegen private/loopback/link-local/
 *     metadata-Ranges prüfen (blockt 169.254.169.254, localhost, db:5432 …).
 *  3. Redirects **manuell** verfolgen und jeden Hop erneut prüfen (Kurzlinks!).
 *  4. Timeout + hartes Byte-Limit beim Lesen des Bodys ({@link readTextLimited}).
 *
 * Rest-Risiko DNS-Rebinding (IP ändert sich zwischen Prüfung und Verbindung) bleibt
 * bestehen; das erforderte ein Pinning der aufgelösten IP beim Connect (heavier).
 */

/** Erlaubte Ziel-Ports — alles andere wäre Port-Scanning über den Server. */
const ALLOWED_PORTS = new Set(["", "80", "443"]);

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
  // Dieselben eingebetteten v4-Adressen in **Hex**-Schreibweise: ::ffff:7f00:1 (IPv4-
  // mapped) und 64:ff9b::7f00:1 (NAT64, RFC 6052). Ohne diesen Zweig käme man mit
  // `http://[64:ff9b::7f00:1]/` an der Prüfung vorbei und landete auf 127.0.0.1.
  const hexV4 = addr.match(/^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexV4) {
    const hi = parseInt(hexV4[1], 16);
    const lo = parseInt(hexV4[2], 16);
    const dotted = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
    return ipv4IsPrivate(dotted);
  }
  if (addr.startsWith("fe8") || addr.startsWith("fe9") || addr.startsWith("fea") || addr.startsWith("feb"))
    return true; // fe80::/10 link-local
  if (addr.startsWith("fc") || addr.startsWith("fd")) return true; // fc00::/7 ULA
  if (addr.startsWith("64:ff9b:")) return true; // restliches NAT64-Präfix vorsorglich
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
  if (!ALLOWED_PORTS.has(url.port)) {
    throw new ApiError(400, "Nur die Standard-Ports 80/443 sind erlaubt.");
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

/**
 * Liest den Body **streamend** und bricht nach `maxBytes` ab.
 *
 * Wichtig gegenüber `(await res.text()).slice(0, n)`: dort puffert `text()` erst die
 * **vollständige** Antwort im Heap und kürzt danach — ein Ziel, das endlos (oder GB-weise)
 * streamt, reißt so den Node-/Lambda-Speicher, obwohl nur 200 kB gebraucht werden.
 * Hier wird die Verbindung beim Erreichen des Limits aktiv geschlossen.
 */
export async function readTextLimited(res: Response, maxBytes = 200_000): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  const chunks: string[] = [];
  let read = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const remaining = maxBytes - read;
      if (value.byteLength >= remaining) {
        chunks.push(decoder.decode(value.subarray(0, remaining)));
        break;
      }
      read += value.byteLength;
      chunks.push(decoder.decode(value, { stream: true }));
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return chunks.join("");
}
