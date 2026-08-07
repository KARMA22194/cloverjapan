/**
 * Content-Security-Policy — **nonce-basiert** statt `script-src 'unsafe-inline'`.
 *
 * Warum überhaupt: mit `'unsafe-inline'` in `script-src` ist die CSP als
 * XSS-Schutz weitgehend wirkungslos — ein eingeschleustes `<script>` läuft
 * einfach mit. Nötig war es, weil Next.js seinen RSC-Payload über Inline-Scripts
 * (`self.__next_f.push(…)`) ausliefert und das Theme-Script vor dem ersten Paint
 * laufen muss. Beide akzeptieren einen Nonce: liegt die CSP mit `'nonce-…'` im
 * **Request**-Header, hängt Next ihn automatisch an seine eigenen Scripts.
 *
 * Der Nonce wird pro Request in der Middleware erzeugt (siehe `src/middleware.ts`)
 * und dort auch in `x-nonce` gelegt, damit das Root-Layout ihn für das
 * Theme-Script lesen kann.
 *
 * Ebenfalls eingeengt: `connect-src`/`img-src` standen auf `https:` — also freie
 * Exfiltration an jeden HTTPS-Host. Jetzt nur noch die Dienste, die der Browser
 * wirklich direkt anspricht (Karten-Tiles und Regenradar); alles andere läuft
 * ohnehin serverseitig über die eigene API.
 */

/** Hosts, die der Browser direkt kontaktiert (alles Übrige geht über /api/v1). */
const TILE_HOSTS = [
  "https://*.basemaps.cartocdn.com", // Karten-Grundkarte (Leaflet)
  "https://*.rainviewer.com", // Regenradar: api. (JSON) + tilecache. (Kacheln)
  "https://tilecache.rainviewer.com",
];

export const NONCE_HEADER = "x-nonce";

/** CSP-Wert für diesen Request. `isDev` lockert nur, was `next dev` braucht. */
export function buildCsp(nonce: string, isDev: boolean): string {
  // next dev braucht eval() (Fast Refresh/HMR). 'strict-dynamic' würde im Dev die
  // von webpack nachgeladenen Chunks abdecken, kollidiert dort aber mit 'self' —
  // deshalb bleibt Dev bewusst schlichter, Produktion streng.
  const script = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    ...(isDev ? ["'unsafe-eval'", "'unsafe-inline'"] : []),
  ].join(" ");

  const connect = ["'self'", ...TILE_HOSTS, ...(isDev ? ["ws:"] : [])].join(" ");
  const img = ["'self'", "data:", "blob:", ...TILE_HOSTS].join(" ");

  return [
    "default-src 'self'",
    `img-src ${img}`,
    // Leaflet setzt Styles per Attribut — dafür bleibt 'unsafe-inline' in
    // style-src stehen. Das ist das deutlich kleinere Übel (kein Code-Vollzug).
    "style-src 'self' 'unsafe-inline'",
    `script-src ${script}`,
    `connect-src ${connect}`,
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}
