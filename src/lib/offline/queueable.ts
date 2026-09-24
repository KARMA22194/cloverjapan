/**
 * Welche Mutationen offline zwischengespeichert werden dürfen — **Allowlist**.
 *
 * Bewusst eine Positivliste statt „alles außer …": wer einen neuen Endpunkt
 * baut, bekommt ihn nicht versehentlich in die Warteschlange. Offline
 * nachzuholen ist nur dort richtig, wo der Server die Anfrage später genauso
 * beantworten würde wie jetzt.
 *
 * ⚠️ **Nicht** in der Liste und das aus gutem Grund:
 *  - `expenses/scan` — braucht Cloud Vision, also zwingend das Netz. Der Beleg
 *    lässt sich offline trotzdem anhängen („📷 Nur Foto" → PATCH mit `receipt`).
 *  - `luggage/found/*` — wer einen Koffer findet, soll sofort benachrichtigen;
 *    eine Meldung, die erst Stunden später ankommt, ist wertlos.
 *  - alles rund um Anmeldung, Konto, Rechte und Einladungen — dort hängt die
 *    Antwort an Serverzustand (Token, Rate-Limits), den der Client nicht kennt.
 *  - `presence` — ein Heartbeat von vor zwei Stunden ist keine Anwesenheit.
 */

type Method = "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * Pfade, deren Mutationen nachgeholt werden dürfen.
 * Ein Eintrag passt auf die Sammlung selbst **und** auf ihre Einzelressourcen
 * (`/api/v1/expenses` und `/api/v1/expenses/abc123`).
 */
const QUEUEABLE_PREFIXES = [
  "/api/v1/expenses",
  "/api/v1/checklist",
  "/api/v1/planner-tasks",
  "/api/v1/wishlist",
  "/api/v1/bookings",
  "/api/v1/settlements",
  "/api/v1/trip-hotels",
  "/api/v1/trip-stops",
  "/api/v1/budget",
  "/api/v1/stamps/collect",
];

/** Ausnahmen innerhalb eines erlaubten Präfixes (längere Pfade gewinnen). */
const BLOCKED_PATHS = ["/api/v1/expenses/scan"];

/**
 * Sammlungs-Endpunkte, bei denen ein POST einen neuen Datensatz anlegt und der
 * Client die Id deshalb **selbst** vergibt.
 *
 * ⚠️ Das ist der Kern der Idempotenz — ohne eigene Id gäbe es Doppelbuchungen.
 * Szenario: die Anfrage erreicht den Server, der legt an, und die **Antwort**
 * geht auf dem Rückweg verloren (im Zug, im Aufzug, beim Netzwechsel). Die
 * Warteschlange weiß dann nicht, ob es geklappt hat, und schickt beim nächsten
 * Versuch erneut. Mit einer vom Client vergebenen Id läuft der zweite Versuch
 * in den Primärschlüssel und kommt als 409 zurück — das lesen wir als „war
 * schon da" und hängen den Eintrag aus. Eine doppelte Ausgabe würde sonst
 * still die Abrechnung verfälschen.
 *
 * ⚠️ Nicht dabei sind Endpunkte, die **von sich aus** idempotent sind:
 * `checklist`, `trip-stops` und `budget` ersetzen per PUT den ganzen Stand,
 * `stamps/collect` hat einen Unique-Index auf (Reise, Stempel). Ein zweiter
 * Versuch ändert dort nichts.
 */
const CLIENT_ID_PATHS = [
  "/api/v1/expenses",
  "/api/v1/planner-tasks",
  "/api/v1/wishlist",
  "/api/v1/bookings",
  "/api/v1/settlements",
  "/api/v1/trip-hotels",
];

/** Pfad ohne Query-Teil (die Allowlist vergleicht nur den Pfad). */
function pathOnly(path: string): string {
  const q = path.indexOf("?");
  return q === -1 ? path : path.slice(0, q);
}

/** Darf diese Mutation offline zwischengespeichert werden? */
export function isQueueable(method: string, path: string): boolean {
  if (method === "GET") return false;
  const p = pathOnly(path);
  if (BLOCKED_PATHS.some((b) => p === b || p.startsWith(`${b}/`))) return false;

  const prefix = QUEUEABLE_PREFIXES.find((q) => p === q || p.startsWith(`${q}/`));
  if (!prefix) return false;

  // ⚠️ Ein DELETE muss einen **einzelnen** Datensatz meinen. Auf die Sammlung
  // selbst heißt es „alles löschen" (`DELETE /api/v1/expenses` löscht die
  // Ausgaben der ganzen Reise samt Belegen). So etwas Stunden später
  // nachzuholen, wenn niemand mehr daran denkt, wäre kein Dienst.
  if (method === "DELETE" && p === prefix) return false;

  return true;
}

/**
 * Legt ein POST auf genau **diesen** Pfad einen neuen Datensatz an, dessen Id
 * der Client vergeben darf? (Also nicht auf Unterpfaden wie `…/expenses/{id}`.)
 */
export function usesClientId(method: string, path: string): boolean {
  return method === "POST" && CLIENT_ID_PATHS.includes(pathOnly(path));
}
