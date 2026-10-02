/**
 * Die Quelle der Basiskarte — **eine** Stelle für Leaflet und fürs Vorladen.
 *
 * ⚠️ Beide müssen exakt dieselbe URL bilden. Weichen sie ab, entsteht ein
 * Cache, der ins Leere zeigt: vorgeladen wird das eine, angefragt das andere —
 * und sichtbar wird der Unterschied **ausschließlich offline**, also genau
 * dann, wenn niemand mehr etwas daran ändern kann. Vorher standen die Vorlage
 * und die Subdomain-Liste doppelt im Code (`TripPlanner` und `mapTiles`).
 *
 * ⚠️ **CARTO verlangt seit August 2026 einen API-Key.** Ohne ihn antwortet der
 * Dienst weiterhin mit HTTP 200 — liefert aber ein Platzhalterbild mit dem
 * Aufdruck „API KEY REQUIRED" (rund 2 KB statt 20–60 KB). Es gibt also keinen
 * Fehler, auf den man prüfen könnte; die Karte sieht einfach leer aus, und der
 * Service-Worker legt die Platzhalter bereitwillig in den Offline-Cache. Genau
 * deshalb prüft `preloadTiles` die Antwortgrößen.
 *
 * Der Key ist kostenlos (5 Mio. Abrufe/Monat, nicht-kommerziell) und braucht
 * weder Konto noch Zahlungsmittel: https://carto.com/basemaps/apikey
 */

export interface BasemapConfig {
  /** Erkennungsname für Meldungen und Tests. */
  readonly id: "carto" | "osm";
  /** Leaflet-Vorlage inklusive `{s}`, `{z}`, `{x}`, `{y}` und `{r}`. */
  readonly template: string;
  readonly subdomains: string;
  readonly attribution: string;
  readonly maxZoom: number;
  /**
   * Darf der Nutzer größere Mengen auf Vorrat holen?
   *
   * ⚠️ Bei OSM **nein**, und das ist keine technische Grenze: Die Tile Usage
   * Policy der OSM Foundation untersagt Massen-Abrufe ausdrücklich. Die Kacheln
   * werden aus Spenden bezahlt; sie für eine Offline-Karte abzusaugen ist genau
   * das Verhalten, das solche Dienste sperren lässt. Mit CARTO-Key ist es
   * dagegen vom Tarif gedeckt.
   */
  readonly preloadAllowed: boolean;
}

const CARTO: Omit<BasemapConfig, "template"> = {
  id: "carto",
  subdomains: "abcd",
  attribution: "&copy; OpenStreetMap-Mitwirkende &copy; CARTO",
  maxZoom: 20,
  preloadAllowed: true,
};

/**
 * ⚠️ Rückfall ohne Key, damit die Karte nicht einfach weiß bleibt. OSM hat
 * keine Subdomains mehr (a/b/c sind abgekündigt), einen anderen Stil und
 * endet bei Zoom 19.
 */
const OSM: BasemapConfig = {
  id: "osm",
  template: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  subdomains: "",
  attribution: "&copy; OpenStreetMap-Mitwirkende",
  maxZoom: 19,
  preloadAllowed: false,
};

/**
 * Welche Basiskarte gilt — abhängig davon, ob ein CARTO-Key vorliegt.
 *
 * ⚠️ Der Key kommt zur **Laufzeit** aus der Server-Komponente, nicht über
 * `NEXT_PUBLIC_*`. Letzteres würde ihn beim Build einbacken — und der
 * Produktions-Docker-Build läuft ohne die Laufzeit-Umgebung, der Wert wäre dort
 * leer. Dieselbe Falle hatte den Self-Hosting-Build schon zweimal blockiert.
 */
export function basemapConfig(apiKey?: string | null): BasemapConfig {
  const key = apiKey?.trim();
  if (!key) return OSM;
  return {
    ...CARTO,
    template: `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(key)}`,
  };
}
