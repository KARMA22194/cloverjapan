/**
 * Prüft die Allowlist der offline nachholbaren Mutationen.
 *
 * Reine Funktionen, kein Netz, keine Datenbank:
 *   docker compose exec -T app node --experimental-strip-types e2e/offline-queueable.ts
 *
 * Diese Regeln sind im laufenden Betrieb praktisch nicht zu sehen — ein Endpunkt,
 * der versehentlich in der Warteschlange landet, fällt erst auf, wenn Stunden
 * später etwas passiert, das niemand mehr erwartet.
 */
import { isQueueable, usesClientId } from "../src/lib/offline/queueable.ts";

interface Case {
  name: string;
  method: string;
  path: string;
  queueable: boolean;
  clientId?: boolean;
}

const CASES: Case[] = [
  // — Der Kern: unterwegs erfasste Daten —
  { name: "Ausgabe anlegen", method: "POST", path: "/api/v1/expenses", queueable: true, clientId: true },
  { name: "Ausgabe ändern", method: "PATCH", path: "/api/v1/expenses/abc123", queueable: true },
  { name: "Ausgabe löschen", method: "DELETE", path: "/api/v1/expenses/abc123", queueable: true },
  { name: "Beleg anhängen", method: "PATCH", path: "/api/v1/expenses/abc123?x=1", queueable: true },
  { name: "Checkliste ersetzen", method: "PUT", path: "/api/v1/checklist", queueable: true },
  { name: "Aufgabe anlegen", method: "POST", path: "/api/v1/planner-tasks", queueable: true, clientId: true },
  { name: "Wunsch anlegen", method: "POST", path: "/api/v1/wishlist", queueable: true, clientId: true },
  { name: "Buchung anlegen", method: "POST", path: "/api/v1/bookings", queueable: true, clientId: true },
  { name: "Zahlung verbuchen", method: "POST", path: "/api/v1/settlements", queueable: true, clientId: true },
  { name: "Unterkunft anlegen", method: "POST", path: "/api/v1/trip-hotels", queueable: true, clientId: true },
  { name: "Stopps ersetzen", method: "PUT", path: "/api/v1/trip-stops", queueable: true },
  { name: "Budget setzen", method: "PUT", path: "/api/v1/budget", queueable: true },
  { name: "Stempel sammeln", method: "POST", path: "/api/v1/stamps/collect", queueable: true },

  // — Ausgeschlossen, jeweils aus einem eigenen Grund —
  {
    name: "Beleg-Scan (braucht Cloud Vision)",
    method: "POST",
    path: "/api/v1/expenses/scan",
    queueable: false,
  },
  {
    name: "ALLE Ausgaben löschen (Sammel-DELETE)",
    method: "DELETE",
    path: "/api/v1/expenses",
    queueable: false,
  },
  { name: "Kofferfund melden", method: "POST", path: "/api/v1/luggage/found/tok", queueable: false },
  { name: "Anwesenheit", method: "POST", path: "/api/v1/presence", queueable: false },
  { name: "Profil ändern", method: "PATCH", path: "/api/v1/me", queueable: false },
  { name: "Konto löschen", method: "DELETE", path: "/api/v1/me", queueable: false },
  { name: "Rechte vergeben", method: "PATCH", path: "/api/v1/users/u1", queueable: false },
  { name: "Einladung annehmen", method: "POST", path: "/api/v1/trip/invitations/i1/accept", queueable: false },
  { name: "Registrieren", method: "POST", path: "/api/v1/register", queueable: false },
  { name: "Lesen wird nie eingereiht", method: "GET", path: "/api/v1/expenses", queueable: false },

  // — Client-Id nur auf der Sammlung, nicht auf Einzelressourcen —
  { name: "PATCH vergibt keine Id", method: "PATCH", path: "/api/v1/expenses/abc", queueable: true, clientId: false },
  { name: "Checkliste vergibt keine Id (PUT ersetzt)", method: "PUT", path: "/api/v1/checklist", queueable: true, clientId: false },
];

let failed = 0;
for (const c of CASES) {
  const got = isQueueable(c.method, c.path);
  if (got !== c.queueable) {
    failed++;
    console.log(`✗ ${c.name}: isQueueable(${c.method} ${c.path}) = ${got}, erwartet ${c.queueable}`);
  } else {
    console.log(`✓ ${c.name}`);
  }
  if (c.clientId !== undefined) {
    const id = usesClientId(c.method, c.path);
    if (id !== c.clientId) {
      failed++;
      console.log(`✗ ${c.name}: usesClientId = ${id}, erwartet ${c.clientId}`);
    }
  }
}

console.log(`\n${failed === 0 ? `Alle ${CASES.length} Fälle bestanden.` : `${failed} Fall/Fälle fehlgeschlagen.`}`);
process.exit(failed === 0 ? 0 : 1);
