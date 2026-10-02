/**
 * Kartenkacheln für einen Ausschnitt vorab bestimmen — damit die Karte auch
 * ohne Netz etwas zeigt.
 *
 * Der Service-Worker hält Kacheln bereits offline vor (`TILE_CACHE`,
 * cache-first), aber nur die, die schon einmal durch den Browser gelaufen
 * sind. Wer im Zug ohne Empfang die Karte öffnet, sieht also genau die
 * Ausschnitte, durch die er vorher zufällig gescrollt ist. Dieses Modul
 * berechnet, welche Kacheln zu einem Bereich gehören, damit sie im WLAN
 * vorgeladen werden können.
 *
 * ⚠️ **Die URL muss exakt der entsprechen, die Leaflet später anfragt** —
 * sonst liegt die Kachel zwar im Cache, wird aber nie gefunden. Leaflet wählt
 * die Subdomain deterministisch über `Math.abs(x + y) % anzahl`; genau das
 * bildet `tileUrl` nach. Eine zufällig gewählte Subdomain hätte hier einen
 * Cache erzeugt, der zu 75 % ins Leere zeigt, und das sieht man erst offline.
 */

export interface TileCoord {
  z: number;
  x: number;
  y: number;
}

// ⚠️ **`import type`, und das muss so bleiben.** `e2e/map-tiles.ts` prüft dieses
// Modul ohne Netz über `node --experimental-strip-types`. Ein echter Import
// scheiterte dort an der fehlenden Dateiendung (Node-ESM verlangt sie,
// TypeScript verbietet sie im Quellcode) — ein type-only Import wird dagegen
// vom Compiler entfernt und existiert zur Laufzeit gar nicht. Deshalb liegt
// hier die URL-Bildung und dort nur die Frage, *welche* Karte gilt.
import type { BasemapConfig } from "../map/basemap";

/**
 * Obergrenze, unterhalb derer eine Antwort als Platzhalter gilt (Bytes).
 *
 * ⚠️ Bewusst niedrig. Eine echte Kachel wiegt 20–60 KB, CARTOs
 * „API KEY REQUIRED"-Bild rund 2 KB. Eine reine Meereskachel kann allerdings
 * ebenfalls klein sein — deshalb schlägt die Erkennung erst an, wenn
 * **ausnahmslos alle** geholten Kacheln darunter liegen.
 */
export const PLACEHOLDER_MAX_BYTES = 4096;

/** Ab wie vielen Kacheln die Platzhalter-Erkennung überhaupt urteilt. */
export const PLACEHOLDER_MIN_SAMPLE = 8;

export interface LatLngBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}


/**
 * Obergrenze je Vorladevorgang.
 *
 * ⚠️ Das ist keine technische, sondern eine **Anstands**grenze. Die Kacheln
 * kommen von CARTOs kostenlosem Dienst; massenhaft Kartenmaterial abzuziehen
 * ist genau das, was solche Anbieter untersagen. Wer eine größere Fläche
 * braucht, lädt sie in mehreren Schritten — das ist Absicht, keine Schikane.
 */
export const MAX_PRELOAD_TILES = 1500;

/**
 * Kachelindex auf das gültige Raster begrenzen.
 *
 * ⚠️ Nicht bloß Vorsicht: am Nordrand ergibt die Mercator-Formel rechnerisch
 * exakt 0, durch Gleitkomma-Ungenauigkeit aber −1,6e−9 — und `Math.floor`
 * daraus **−1**. Am Südrand entsprechend 2^z, also eine Kachel zu weit. Beides
 * hätte URLs erzeugt, die es nicht gibt.
 */
function clampTile(v: number, z: number): number {
  return Math.max(0, Math.min(2 ** z - 1, v));
}

/** Längengrad → Kachelspalte (Web-Mercator). */
export function lonToTileX(lon: number, z: number): number {
  return clampTile(Math.floor(((lon + 180) / 360) * 2 ** z), z);
}

/** Breitengrad → Kachelzeile (Web-Mercator). */
export function latToTileY(lat: number, z: number): number {
  // Auf den in Web-Mercator darstellbaren Bereich begrenzen — jenseits von
  // ±85,0511° läuft die Umrechnung gegen unendlich.
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const rad = (clamped * Math.PI) / 180;
  return clampTile(
    Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z),
    z,
  );
}

/**
 * Vollständige Kachel-URL — deckungsgleich mit dem, was Leaflet anfragt.
 *
 * ⚠️ Die Vorlage steht in `../map/basemap`, nicht mehr hier. Vorher lagen
 * Vorlage und Subdomain-Liste doppelt im Code (einmal dort, einmal in
 * `TripPlanner`); ein Unterschied zwischen beiden wäre erst offline aufgefallen.
 *
 * ⚠️ `{r}` wird zu einem leeren String. Leaflet ersetzt den Platzhalter nur bei
 * eingeschaltetem `detectRetina` durch „@2x" — das ist hier bewusst aus, sonst
 * fragte jedes Retina-Gerät (also jedes iPhone) andere URLs an als vorgeladen
 * wurden, und die Offline-Karte wäre dort wirkungslos.
 *
 * ⚠️ Die Subdomain wählt Leaflet deterministisch über `Math.abs(x + y) % n`.
 * Eine zufällig gewählte erzeugte einen Cache, der zu drei Vierteln ins Leere
 * zeigt — wieder nur offline sichtbar.
 */
export function tileUrl(cfg: BasemapConfig, { z, x, y }: TileCoord): string {
  const sub = cfg.subdomains ? cfg.subdomains[Math.abs(x + y) % cfg.subdomains.length] : "";
  return cfg.template
    .replace("{s}", sub)
    .replace("{r}", "")
    .replace("{z}", String(z))
    .replace("{x}", String(x))
    .replace("{y}", String(y));
}

/** Alle Kacheln eines Ausschnitts auf einer Zoomstufe. */
export function tilesForBounds(bounds: LatLngBounds, z: number): TileCoord[] {
  const max = 2 ** z - 1;
  const clamp = (v: number) => Math.max(0, Math.min(max, v));
  const x1 = clamp(lonToTileX(bounds.west, z));
  const x2 = clamp(lonToTileX(bounds.east, z));
  // Nord ist die KLEINERE Zeilennummer — die Achse zeigt nach unten.
  const y1 = clamp(latToTileY(bounds.north, z));
  const y2 = clamp(latToTileY(bounds.south, z));

  const out: TileCoord[] = [];
  for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
      out.push({ z, x, y });
    }
  }
  return out;
}

/**
 * Welche Zoomstufen zum Vorladen sinnvoll sind: die aktuelle und **zwei**
 * darüber (= näher heran), höchstens bis 16.
 *
 * ⚠️ Die Spanne war zuerst auf drei Stufen angesetzt — ein Stadtbezirk kam damit
 * auf 1.736 Kacheln und riss die Grenze von {@link MAX_PRELOAD_TILES}. Der Grund
 * ist die Vervierfachung je Stufe: bei einem typischen Ausschnitt trägt allein
 * die tiefste Stufe rund drei Viertel aller Kacheln. Zwei Stufen halten denselben
 * Bezirk bei etwa 360.
 *
 * ⚠️ Über der letzten vorgeladenen Stufe zeigt Leaflet offline die hochskalierte
 * Elternkachel — unscharf, aber nicht leer. Für „wo bin ich und wo ist die
 * Station" reicht das; die Alternative wäre, das Vierfache an fremder Bandbreite
 * zu verbrauchen.
 */
/**
 * Übersichtsstufen, die **immer** mitgeladen werden.
 *
 * ⚠️ Ohne sie ist das Vorgeladene offline praktisch nicht erreichbar: nach einem
 * Neuladen startet die Karte wieder auf der Japan-Übersicht (Stufe 5), und wer
 * sich von dort zum vorgeladenen Stadtteil durchzoomen will, sieht auf jeder
 * Zwischenstufe eine graue Fläche. Gemessen im Produktionslauf — die Kacheln
 * waren da, man kam nur nicht hin. Kostet ein gutes Dutzend Kacheln.
 */
export const OVERVIEW_ZOOMS = [5, 6, 7, 8];

export function preloadZooms(current: number, maxZoom = 16): number[] {
  const start = Math.max(1, Math.round(current));
  const zooms: number[] = [];
  for (let z = start; z <= Math.min(start + 2, maxZoom); z++) zooms.push(z);
  return zooms;
}

/**
 * Kacheln vorladen, damit der Service-Worker sie in den `TILE_CACHE` legt.
 *
 * ⚠️ Bewusst **vier** gleichzeitige Anfragen, nicht alle auf einmal. Die Kacheln
 * kommen von einem fremden, kostenlosen Dienst; ein Sturm aus hunderten
 * parallelen Anfragen ist genau das Verhalten, das solche Anbieter sperren lässt.
 *
 * ⚠️ Einzelne Fehlschläge werden verschluckt: eine fehlende Kachel ist offline
 * eine graue Fläche, kein Grund, den ganzen Vorgang abzubrechen.
 */
export class PlaceholderTilesError extends Error {
  constructor() {
    super(
      "Der Kartendienst liefert nur Platzhalter statt Kacheln. " +
        "Vermutlich fehlt der CARTO-Schlüssel oder er ist ungültig.",
    );
    this.name = "PlaceholderTilesError";
  }
}

export async function preloadTiles(
  cfg: BasemapConfig,
  tiles: TileCoord[],
  onProgress: (done: number) => void,
  signal: AbortSignal,
): Promise<void> {
  const CONCURRENCY = 4;
  let next = 0;
  let done = 0;
  // ⚠️ Platzhalter-Erkennung. CARTO antwortet ohne gültigen Schlüssel mit
  // HTTP 200 und einem Bild, auf dem „API KEY REQUIRED" steht — es gibt also
  // keinen Fehlercode, auf den man prüfen könnte. Ohne diese Zählung liefe der
  // Vorgang durch, meldete Erfolg und füllte den Offline-Cache mit Attrappen;
  // bemerkt hätte es jemand erst ohne Empfang. Geurteilt wird erst ab
  // PLACEHOLDER_MIN_SAMPLE und nur, wenn **ausnahmslos** alle Antworten winzig
  // sind: eine reine Meereskachel ist ebenfalls klein, ein ganzer Ausschnitt
  // davon aber nicht.
  let measured = 0;
  let tiny = 0;

  async function worker(): Promise<void> {
    while (next < tiles.length && !signal.aborted) {
      const tile = tiles[next++];
      try {
        // ⚠️ **`cors`, nicht `no-cors`.** Eine no-cors-Antwort ist *opak*, und
        // Browser rechnen opake Einträge mit einem großzügigen Aufschlag aufs
        // Speicherkontingent an (Schutz davor, die Größe fremder Antworten
        // auszumessen). Gemessen: von 138 vorgeladenen Kacheln landeten so nur
        // 63 im Cache — der Rest scheiterte still an der Quote, und `tileFirst`
        // verschluckt den Fehler. Sichtbar wäre das erst ohne Empfang.
        // CARTO sendet `Access-Control-Allow-Origin: *`, also geht es sauber:
        // die Antwort ist normal lesbar, zählt nur mit ihrer echten Größe, und
        // der Service-Worker kann `res.ok` überhaupt erst prüfen.
        const res = await fetch(tileUrl(cfg, tile), { mode: "cors", signal });
        if (res.ok) {
          // Den Rumpf wirklich lesen — sonst kennt der Browser die Größe nicht,
          // und der Service-Worker bekäme einen angefangenen Stream.
          const blob = await res.blob();
          measured++;
          if (blob.size <= PLACEHOLDER_MAX_BYTES) tiny++;
        }
      } catch {
        /* einzelne Kachel: egal */
      }
      onProgress(++done);
      if (measured >= PLACEHOLDER_MIN_SAMPLE && tiny === measured) {
        throw new PlaceholderTilesError();
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
}

/** Alle Kacheln für einen Ausschnitt über mehrere Zoomstufen, ohne Dubletten. */
export function planPreload(bounds: LatLngBounds, zooms: number[]): TileCoord[] {
  const seen = new Set<string>();
  const out: TileCoord[] = [];
  for (const z of zooms) {
    for (const t of tilesForBounds(bounds, z)) {
      const key = `${t.z}/${t.x}/${t.y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(t);
    }
  }
  return out;
}
