/**
 * Nutzerbezogene `localStorage`-Schlüssel und ihr Aufräumen.
 *
 * Der Offline-Daten-Cache des Service-Workers ist über den Marker `/__owner` an
 * genau einen Nutzer gebunden — `localStorage` war es nicht. Auf einem geteilten
 * Gerät sah der nächste Anmeldende deshalb noch die Import-Vorschau (inkl.
 * Koordinaten und Notizen) und die Budgets des vorherigen Nutzers und konnte sie
 * versehentlich in die eigene Reise übernehmen.
 *
 * Zwei Absicherungen, weil ein Nutzerwechsel nicht immer über „Abmelden" läuft:
 *  1. {@link clearUserScopedStorage} beim Logout,
 *  2. {@link syncStorageOwner} beim Laden der App — stimmt der hinterlegte Besitzer
 *     nicht mit der aktuellen Session überein, wird aufgeräumt (gleiches Prinzip
 *     wie der SW-Marker).
 *
 * Geräteeinstellungen (`theme`, PWA-Banner) bleiben bewusst erhalten: sie gehören
 * zum Browser, nicht zum Konto.
 */

const OWNER_KEY = "app:storage-owner";

/** Schlüssel mit personenbezogenem Inhalt — beim Nutzerwechsel zu verwerfen. */
export const USER_SCOPED_KEYS = [
  "reiseplaner:import", // aufgelöste Orte inkl. Koordinaten/Notizen
  "japan-budget",
  "japan-cat-budgets",
] as const;

/** Alle nutzerbezogenen Schlüssel entfernen (Logout / Nutzerwechsel). */
export function clearUserScopedStorage(): void {
  try {
    for (const key of USER_SCOPED_KEYS) localStorage.removeItem(key);
    localStorage.removeItem(OWNER_KEY);
  } catch {
    /* localStorage nicht verfügbar – dann gibt es auch nichts zu leeren */
  }
}

/**
 * Bindet den lokalen Speicher an `userId`. Gehörte er zuvor jemand anderem,
 * werden die personenbezogenen Schlüssel gelöscht.
 */
export function syncStorageOwner(userId: string): void {
  if (!userId) return;
  try {
    const previous = localStorage.getItem(OWNER_KEY);
    if (previous && previous !== userId) {
      for (const key of USER_SCOPED_KEYS) localStorage.removeItem(key);
    }
    if (previous !== userId) localStorage.setItem(OWNER_KEY, userId);
  } catch {
    /* localStorage nicht verfügbar – nichts zu tun */
  }
}
