/**
 * Kachel-Mathematik fürs Vorladen der Karte.
 *
 * Ohne Netz und ohne Browser:
 *   docker compose exec -T app node --experimental-strip-types e2e/map-tiles.ts
 *
 * WARUM DAS EINEN TEST BRAUCHT: ein Fehler hier ist unsichtbar. Die Kacheln
 * würden heruntergeladen, im Cache landen — und offline trotzdem fehlen, weil
 * die URL nicht zu der passt, die Leaflet anfragt. Auffallen würde das genau
 * einmal: im Zug, ohne Empfang.
 */
import {
  latToTileY,
  lonToTileX,
  planPreload,
  preloadZooms,
  tilesForBounds,
  tileUrl,
  MAX_PRELOAD_TILES,
} from "../src/lib/offline/mapTiles.ts";

let failed = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : `  → ${JSON.stringify(got)} statt ${JSON.stringify(want)}`}`);
};

// ── Bekannte Bezugspunkte (gegen die Referenzformel von OpenStreetMap) ──────
// Tokio-Bahnhof, 35.6812 / 139.7671
// (139,7671 + 180) / 360 × 4096 = 3638,24 → 3638. Die erste Erwartung hier war
// schlicht falsch gerechnet.
check("Tokio z12 Spalte", lonToTileX(139.7671, 12), 3638);
check("Tokio z12 Zeile", latToTileY(35.6812, 12), 1612);
// Nullpunkt: Greenwich am Äquator liegt auf z1 an der Ecke der vier Kacheln.
check("Nullpunkt z1 Spalte", lonToTileX(0, 1), 1);
check("Nullpunkt z1 Zeile", latToTileY(0, 1), 1);
// z0 hat genau eine Kachel — egal wo man hinschaut.
check("z0 überall 0/0", [lonToTileX(139.7, 0), latToTileY(35.7, 0)], [0, 0]);

// ── Polkappen dürfen nicht ins Unendliche laufen ───────────────────────────
const nearPole = latToTileY(89.9, 5);
check("Nordpol bleibt im Raster", Number.isFinite(nearPole) && nearPole >= 0, true);
const southPole = latToTileY(-89.9, 5);
check("Südpol bleibt im Raster", southPole <= 2 ** 5 - 1, true);

// ── Ausschnitt → Kachelmenge ───────────────────────────────────────────────
const tokyoArea = { north: 35.75, south: 35.6, east: 139.85, west: 139.65 };
const z14 = tilesForBounds(tokyoArea, 14);
check("Ausschnitt liefert Kacheln", z14.length > 0, true);
check(
  "Rechteck ist vollständig",
  z14.length,
  (Math.max(...z14.map((t) => t.x)) - Math.min(...z14.map((t) => t.x)) + 1) *
    (Math.max(...z14.map((t) => t.y)) - Math.min(...z14.map((t) => t.y)) + 1),
);
check("alle auf der angefragten Stufe", z14.every((t) => t.z === 14), true);

// ⚠️ Der eigentliche Zweck des Tests: die URL muss exakt der entsprechen, die
// Leaflet später anfragt. Leaflet wählt die Subdomain über |x+y| % 4 aus "abcd".
check("URL-Form", tileUrl({ z: 12, x: 3638, y: 1612 }),
  "https://c.basemaps.cartocdn.com/rastertiles/voyager/12/3638/1612.png");
check("Subdomain folgt |x+y| % 4", [
  tileUrl({ z: 1, x: 0, y: 0 }).slice(8, 9),
  tileUrl({ z: 1, x: 1, y: 0 }).slice(8, 9),
  tileUrl({ z: 1, x: 1, y: 1 }).slice(8, 9),
  tileUrl({ z: 2, x: 2, y: 1 }).slice(8, 9),
], ["a", "b", "c", "d"]);

// ── Zoomstufen ─────────────────────────────────────────────────────────────
check("drei Stufen ab der aktuellen", preloadZooms(12), [12, 13, 14]);
check("Deckel bei 16", preloadZooms(15), [15, 16]);
check("über dem Deckel nur die eigene", preloadZooms(16), [16]);

// ── Planung ohne Dubletten ─────────────────────────────────────────────────
const plan = planPreload(tokyoArea, [14, 14, 15]);
const keys = new Set(plan.map((t) => `${t.z}/${t.x}/${t.y}`));
check("keine doppelten Kacheln", keys.size, plan.length);
check("beide Stufen enthalten", [...new Set(plan.map((t) => t.z))].sort(), [14, 15]);

// ── Die Anstandsgrenze greift für realistische Ausschnitte ─────────────────
// Ein Stadtbezirk in vier Stufen muss durchgehen …
const cityPlan = planPreload(tokyoArea, preloadZooms(13));
check(`Stadtbezirk unter der Grenze (${cityPlan.length})`, cityPlan.length <= MAX_PRELOAD_TILES, true);
// … ganz Japan ab Stufe 10 aber nicht, sonst zöge man den Anbieter leer.
const japanPlan = planPreload({ north: 45.6, south: 30.9, east: 146, west: 128.5 }, preloadZooms(10));
check(`ganz Japan über der Grenze (${japanPlan.length})`, japanPlan.length > MAX_PRELOAD_TILES, true);

console.log(`\n${failed === 0 ? "Alle Fälle bestanden." : `${failed} fehlgeschlagen.`}`);
process.exit(failed === 0 ? 0 : 1);
