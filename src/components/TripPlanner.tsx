"use client";

import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { api } from "@/lib/api/client";
import { toast } from "@/lib/toast";
import { addExpenseItem } from "@/lib/expenses";
import { deDate } from "@/lib/format";

interface Stop {
  id: string;
  label: string;
  lat: number;
  lng: number;
  active?: boolean; // false = gespeichert, aber nicht Teil der aktuellen Route
  date?: string | null;
  by?: string;
  note?: string;
}

/** Ein Stopp gilt als aktiv (Teil der Route), solange er nicht ausdrücklich abgewählt ist. */
const isActive = (s: Stop) => s.active !== false;

interface Hotel {
  id: string;
  label: string;
  lat: number;
  lng: number;
  checkIn?: string | null;
  checkOut?: string | null;
  by?: string;
}

interface GeoResult {
  label: string;
  lat: number;
  lng: number;
  source?: "maps" | "text" | "url";
  area?: boolean; // true = Stadt/Gebiet statt konkreter Ort
  lodging?: boolean; // true = Beherbergungsbetrieb (Hotel/Ryokan/…)
  attraction?: boolean; // true = Sehenswürdigkeit (Museum/Park/…)
}

interface RouteInfo {
  geometry: [number, number][];
  distanceKm: number;
  durationMin: number;
  order: number[];
}

type KonbiniBrand = "7-Eleven" | "Lawson" | "FamilyMart" | "Ministop" | "Konbini";
interface Konbini {
  lat: number;
  lng: number;
  brand: KonbiniBrand;
  name: string;
  address?: string;
}

interface TransitConn {
  durationMin: number;
  transfers: number;
  lines: string[];
  departure: string | null;
  arrival: string | null;
  fare: { text: string } | null;
  fareYen?: number | null;
  estimated?: boolean;
}

interface TransitLeg {
  from: Stop;
  to: Stop;
  conn: TransitConn | null;
  error: string | null;
}

const JAPAN_CENTER: [number, number] = [36.2, 138.25];

// localStorage-Schlüssel für die (persönliche) Import-Zwischenablage.
const IMPORT_LS_KEY = "reiseplaner:import";

/** Kurzer, lesbarer Ortsname aus dem langen Nominatim-display_name. */
function shortLabel(label: string): string {
  return label.split(",").slice(0, 2).join(", ");
}

/**
 * Deep-Link in Google Maps (offizielles Maps-URL-Schema, keyfrei). Öffnet die
 * ÖPNV-Route zwischen zwei Punkten — dort zeigt Maps die volle Verbindung mit
 * Umstiegen, Linien und Zeiten (in der App bzw. auf maps.google.com).
 */
function mapsTransitUrl(from: { lat: number; lng: number }, to: { lat: number; lng: number }): string {
  return (
    `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}` +
    `&destination=${to.lat},${to.lng}&travelmode=transit`
  );
}

/**
 * Link auf die `place-link`-Route: löst mit Google-Key (kostenlos, nur place_id)
 * den exakten Ort an diesen Koordinaten auf und öffnet dessen POI-Karte; ohne Key
 * greift der keyfreie, koordinaten-zentrierte Fallback. `type` grenzt optional ein
 * (z. B. `lodging` für Hotels), `q`/`fallback` = Ortsname (erster Teil vor Komma).
 */
function placeLinkUrl(lat: number, lng: number, label: string, type?: string): string {
  const name = label.split(",")[0].trim();
  const p = new URLSearchParams({ lat: String(lat), lng: String(lng), q: name, fallback: name });
  if (type) p.set("type", type);
  return `/api/v1/geo/place-link?${p.toString()}`;
}

/**
 * Ortsname als direkter Link: ein Klick öffnet den exakten Ort in Google Maps
 * (neuer Tab) — hilft, unklare Import-Orte schnell einzuordnen. Auflösung über die
 * `place-link`-Route (mit Google-Key exakte Filiale, sonst koordinaten-zentriert).
 */
function PlaceLink({
  lat,
  lng,
  label,
  display,
  type,
}: {
  lat: number;
  lng: number;
  label: string;
  display: string;
  type?: string;
}) {
  return (
    <a
      href={placeLinkUrl(lat, lng, label, type)}
      target="_blank"
      rel="noopener noreferrer"
      title={`${label} — in Google Maps öffnen`}
      className="block w-full truncate text-left text-sm text-slate-700 transition hover:text-brand hover:underline dark:text-slate-200 dark:hover:text-brand"
    >
      {display}
    </a>
  );
}

/**
 * Sortierbares Listen-Element (Drag & Drop, Maus + Touch via @dnd-kit). Der eigentliche
 * Zeileninhalt kommt als Render-Prop und bekommt die `handle`-Props für den Greif-Button.
 */
function SortableStopLi({
  id,
  className,
  children,
}: {
  id: string;
  className?: string;
  children: (handle: {
    attributes: ReturnType<typeof useSortable>["attributes"];
    listeners: ReturnType<typeof useSortable>["listeners"];
    isDragging: boolean;
  }) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 10 : undefined,
    position: "relative",
  };
  return (
    <li ref={setNodeRef} style={style} className={className}>
      {children({ attributes, listeners, isDragging })}
    </li>
  );
}

function pinIcon(L: typeof Leaflet, n: number): Leaflet.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:9999px;background:#009bc9;color:#fff;font-size:12px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">${n}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

/** Eigener Marker für Unterkünfte (Akzentfarbe + Bett-Symbol), klar von Stopps unterscheidbar. */
function hotelIcon(L: typeof Leaflet): Leaflet.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:8px;background:#f87805;color:#fff;font-size:14px;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">🏨</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

// Konbini-Marker: kleiner als Stopps (sekundär), markenfarben mit Kürzel.
const KONBINI_STYLE: Record<KonbiniBrand, { color: string; badge: string }> = {
  "7-Eleven": { color: "#ee7203", badge: "7" },
  Lawson: { color: "#0055a5", badge: "L" },
  FamilyMart: { color: "#009a44", badge: "F" },
  Ministop: { color: "#1a9c6b", badge: "M" },
  Konbini: { color: "#64748b", badge: "🏪" },
};
function konbiniIcon(L: typeof Leaflet, brand: KonbiniBrand): Leaflet.DivIcon {
  const s = KONBINI_STYLE[brand];
  return L.divIcon({
    className: "",
    html: `<div style="display:flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:9999px;background:${s.color};color:#fff;font-size:10px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)">${s.badge}</div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

/** „Dein Standort"-Marker (blauer Punkt mit Halo). */
function meIcon(L: typeof Leaflet): Leaflet.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="width:16px;height:16px;border-radius:9999px;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 4px rgba(37,99,235,.3)"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

/** Route-Polylinie auf höchstens `max` Stützpunkte ausdünnen (kleine Overpass-Anfrage). */
function sampleGeometry(geom: [number, number][], max = 40): [number, number][] {
  if (geom.length <= max) return geom;
  const step = Math.ceil(geom.length / max);
  const out = geom.filter((_, i) => i % step === 0);
  const last = geom[geom.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

/** Kurze Pause (Import-Drosselung: Nominatim erlaubt ~1 Anfrage/Sekunde). */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Minimaler CSV-Parser: „"“-Quoting inkl. ""-Escape, \n und \r\n als Zeilenende. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

interface FileImportResult {
  direct: { label: string; lat: number; lng: number }[]; // enthält Koordinaten → sofort übernehmen
  queries: string[]; // nur Name/Link → erst über geo/resolve auflösen
  // Fallback-Link je Ortsname (aus der CSV-URL-Spalte): wird benutzt, wenn der
  // Name selbst nicht geocodiert werden kann.
  fallbacks: Record<string, string>;
  error?: string;
}

/**
 * Parst eine hochgeladene Orte-Datei. Unterstützt GeoJSON/KML/GPX (mit Koordinaten →
 * direkt) und CSV (Google-Takeout „Gespeicherte Orte" → Name/Link → aufzulösen).
 * Format wird aus der Endung bzw. dem Inhalt (`{` / `<`) erkannt.
 */
function parsePlacesFile(name: string, text: string): FileImportResult {
  const direct: { label: string; lat: number; lng: number }[] = [];
  const queries: string[] = [];
  const fallbacks: Record<string, string> = {};
  const trimmed = text.trimStart();
  const ext = name.toLowerCase().split(".").pop() || "";
  const looksJson = ext === "geojson" || ext === "json" || trimmed.startsWith("{");
  const looksXml = ext === "kml" || ext === "gpx" || trimmed.startsWith("<");

  try {
    if (looksJson) {
      const j = JSON.parse(text);
      const feats = Array.isArray(j.features) ? j.features : Array.isArray(j) ? j : [];
      for (const f of feats) {
        const props = (f && f.properties) || {};
        const loc = props.location || {};
        const label = loc.name || props.name || props.title || props.Title || "Ort";
        const g = f && f.geometry;
        const coords = g && g.type === "Point" ? g.coordinates : null;
        if (Array.isArray(coords) && coords.length >= 2) {
          const lng = Number(coords[0]);
          const lat = Number(coords[1]);
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            direct.push({ label, lat, lng });
            continue;
          }
        }
        const q = props.google_maps_url || props.url || props.URL || label;
        if (q) queries.push(String(q));
      }
    } else if (looksXml) {
      const doc = new DOMParser().parseFromString(text, "text/xml");
      const placemarks = Array.from(doc.getElementsByTagName("Placemark"));
      const wpts = Array.from(doc.getElementsByTagName("wpt"));
      if (placemarks.length > 0) {
        for (const pm of placemarks) {
          const label = pm.getElementsByTagName("name")[0]?.textContent?.trim() || "Ort";
          const raw = pm.getElementsByTagName("coordinates")[0]?.textContent?.trim();
          if (raw) {
            const [lngS, latS] = raw.split(/\s+/)[0].split(",");
            const lng = Number(lngS);
            const lat = Number(latS);
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
              direct.push({ label, lat, lng });
              continue;
            }
          }
          queries.push(label);
        }
      } else if (wpts.length > 0) {
        for (const w of wpts) {
          const lat = Number(w.getAttribute("lat"));
          const lng = Number(w.getAttribute("lon"));
          const label = w.getElementsByTagName("name")[0]?.textContent?.trim() || "Wegpunkt";
          if (Number.isFinite(lat) && Number.isFinite(lng)) direct.push({ label, lat, lng });
          else queries.push(label);
        }
      } else {
        return {
          direct,
          queries,
          fallbacks,
          error: "Keine Placemarks/Wegpunkte in der Datei gefunden.",
        };
      }
    } else {
      // CSV (z. B. Google-Takeout „Gespeicherte Orte": Spalten Title, Note, URL).
      const rows = parseCsv(text);
      if (rows.length === 0) return { direct, queries, fallbacks, error: "Leere oder unlesbare CSV." };
      const header = rows[0].map((c) => c.trim().toLowerCase());
      const titleIdx = header.indexOf("title");
      const urlIdx = header.indexOf("url");
      const hasHeader = titleIdx >= 0 || urlIdx >= 0;
      for (let i = hasHeader ? 1 : 0; i < rows.length; i++) {
        const r = rows[i];
        const title = (titleIdx >= 0 ? r[titleIdx] : r[0]) || "";
        const url = (urlIdx >= 0 ? r[urlIdx] : r.find((c) => /^https?:\/\//i.test(c))) || "";
        const name = title.trim();
        const link = url.trim();
        // Primär den Namen auflösen; die URL als Fallback merken (Name → Link).
        if (name) {
          queries.push(name);
          if (link) fallbacks[name] = link;
        } else if (link) {
          queries.push(link);
        }
      }
    }
  } catch {
    return { direct, queries, fallbacks, error: "Datei konnte nicht ausgewertet werden (Format?)." };
  }
  return { direct, queries, fallbacks };
}

export function TripPlanner() {
  const mapEl = useRef<HTMLDivElement>(null);
  const LRef = useRef<typeof Leaflet | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const markersRef = useRef<Leaflet.LayerGroup | null>(null);
  const routeRef = useRef<Leaflet.Polyline | null>(null);
  const konbiniRef = useRef<Leaflet.LayerGroup | null>(null);
  const rainRef = useRef<Leaflet.TileLayer | null>(null);
  const tileRef = useRef<Leaflet.TileLayer | null>(null);
  // Erst nach dem Laden aus localStorage darf zurückgeschrieben werden (kein Clobber).
  const importReady = useRef(false);
  // Fallback-Link je Ortsname aus einer importierten CSV (Name nicht geocodierbar → Link).
  const importFallback = useRef<Map<string, string>>(new Map());

  const [stops, setStops] = useState<Stop[]>([]);
  const [ready, setReady] = useState(false);
  // Tab-Umschalter: Karte & Route vs. Orte-Liste (Import + Stopps + Hotels).
  const [view, setView] = useState<"map" | "list">("map");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [suggestions, setSuggestions] = useState<GeoResult[]>([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const suggestRef = useRef<HTMLDivElement>(null);

  // Sammel-Import: mehrere Orte/Maps-Links (eine Zeile pro Ort) auf einmal.
  const [importOpen, setImportOpen] = useState(true);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const [importNote, setImportNote] = useState<string | null>(null);
  // Vorschau-Liste aufgelöster Import-Orte (erst prüfen, dann „In Stopps übernehmen").
  const [importCandidates, setImportCandidates] = useState<
    { id: string; label: string; lat: number; lng: number; note?: string }[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [route, setRoute] = useState<RouteInfo | null>(null);
  const [routing, setRouting] = useState(false);

  const [transitDirect, setTransitDirect] = useState(false);
  const [transitLegs, setTransitLegs] = useState<TransitLeg[]>([]);
  const [transitLoading, setTransitLoading] = useState(false);
  const [transitError, setTransitError] = useState<string | null>(null);
  const [addedLegs, setAddedLegs] = useState<Record<number, boolean>>({});
  const [weather, setWeather] = useState<Record<string, { emoji: string; tempC: number; text: string }>>({});
  const [weatherLoading, setWeatherLoading] = useState(false);

  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [hotelQuery, setHotelQuery] = useState("");
  const [hotelAdding, setHotelAdding] = useState(false);
  const [hotelError, setHotelError] = useState<string | null>(null);

  // Konbini-Radar: aus | entlang der Route | rund um den eigenen Standort.
  const [konbiniMode, setKonbiniMode] = useState<"off" | "route" | "location">("off");
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locatingStart, setLocatingStart] = useState(false);
  const [konbinis, setKonbinis] = useState<Konbini[]>([]);
  const [konbiniLoading, setKonbiniLoading] = useState(false);
  const [konbiniError, setKonbiniError] = useState<string | null>(null);
  const [hiddenBrands, setHiddenBrands] = useState<Set<KonbiniBrand>>(new Set());

  const [showRain, setShowRain] = useState(false);
  const [rainError, setRainError] = useState<string | null>(null);

  // Stopps aus der (geteilten) Reise laden.
  useEffect(() => {
    api
      .get<Stop[]>("/api/v1/trip-stops")
      .then(setStops)
      .catch(() => {});
    api
      .get<Hotel[]>("/api/v1/trip-hotels")
      .then(setHotels)
      .catch(() => {});
  }, []);

  // Import-Zwischenablage aus localStorage laden (einmalig, nur im Client → keine
  // Hydration-Mismatch, da initial leer gerendert wird).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(IMPORT_LS_KEY);
      if (raw) {
        const d = JSON.parse(raw) as { candidates?: unknown; text?: unknown };
        if (Array.isArray(d.candidates)) {
          setImportCandidates(
            d.candidates.filter(
              (c): c is { id: string; label: string; lat: number; lng: number; note?: string } =>
                !!c &&
                typeof c === "object" &&
                typeof (c as { lat?: unknown }).lat === "number" &&
                typeof (c as { lng?: unknown }).lng === "number",
            ),
          );
        }
        if (typeof d.text === "string") setImportText(d.text);
      }
    } catch {
      /* localStorage nicht verfügbar / defekt – ignorieren */
    }
    importReady.current = true;
  }, []);

  // Import-Zwischenablage bei Änderung zurückschreiben (erst nach dem Laden).
  useEffect(() => {
    if (!importReady.current) return;
    try {
      localStorage.setItem(
        IMPORT_LS_KEY,
        JSON.stringify({ candidates: importCandidates, text: importText }),
      );
    } catch {
      /* Quota/!verfügbar – unkritisch */
    }
  }, [importCandidates, importText]);

  // Komplette Stopp-Liste speichern (PUT-Replace); Antwort enthält den Ersteller (by).
  function persistStops(next: Stop[]) {
    api
      .put<Stop[]>("/api/v1/trip-stops", {
        stops: next.map((s) => ({
          id: s.id,
          label: s.label,
          lat: s.lat,
          lng: s.lng,
          active: isActive(s),
          date: s.date ?? null,
          note: s.note ?? "",
        })),
      })
      .then(setStops)
      .catch(() => {});
  }

  // Notiz zu einem Stopp: beim Tippen nur lokal (kein PUT je Tastendruck),
  // gespeichert wird beim Verlassen des Feldes (onBlur → persistStops).
  function setStopNote(id: string, note: string) {
    setStops((prev) => prev.map((s) => (s.id === id ? { ...s, note } : s)));
  }

  // Karte einmalig initialisieren (nur im Client → dynamischer Import).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mod = await import("leaflet");
      const m = mod as unknown as { default?: typeof Leaflet };
      const L = m.default ?? (mod as unknown as typeof Leaflet);
      if (cancelled || !mapEl.current || mapRef.current) return;
      LRef.current = L;
      const map = L.map(mapEl.current).setView(JAPAN_CENTER, 5);
      // CARTO „Voyager": keyfrei, CDN-schnell, erlaubt Fremd-Domains und zeigt
      // überwiegend lateinische Beschriftung (z. B. „Tokyo" statt „東京").
      // (Wikimedia-Tiles blockieren Fremd-Domains mit 403 → leere Karte.)
      tileRef.current = L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
        {
          subdomains: "abcd",
          attribution: "&copy; OpenStreetMap-Mitwirkende &copy; CARTO",
          maxZoom: 20,
        },
      ).addTo(map);
      markersRef.current = L.layerGroup().addTo(map);
      konbiniRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setReady(true);
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markersRef.current = null;
        konbiniRef.current = null;
        rainRef.current = null;
        routeRef.current = null;
      }
    };
  }, []);

  // Die Karte war im Import-Tab ausgeblendet (display:none → Größe 0, Kacheln nicht
  // geladen). Nach dem Sichtbarwerden per rAF (Layout gesetzt) neu vermessen UND die
  // Basemap-Kacheln neu laden — sonst bleibt der Kartenbereich leer/grau.
  useEffect(() => {
    if (view !== "map") return;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const map = mapRef.current;
        if (!map) return;
        map.invalidateSize();
        tileRef.current?.redraw();
        // Ansicht neu setzen erzwingt das Nachladen der Kacheln für den Ausschnitt.
        map.setView(map.getCenter(), map.getZoom(), { animate: false });
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [view]);

  // Marker + Route neu zeichnen, wenn sich Stopps/Route ändern.
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const layer = markersRef.current;
    if (!L || !map || !layer) return;

    layer.clearLayers();
    // Nur aktive Stopps erscheinen (nummeriert) auf der Karte; abgewählte bleiben
    // gespeichert, verschwinden aber aus Karte/Route.
    const active = stops.filter(isActive);
    active.forEach((s, i) => {
      // Label als DOM-Element mit textContent binden (nicht als HTML-String) —
      // Leaflet rendert String-Inhalte sonst als HTML → Stored XSS über den Stopp-Namen.
      const tooltipEl = document.createElement("span");
      tooltipEl.textContent = shortLabel(s.label);
      const popupEl = document.createElement("div");
      popupEl.textContent = `${i + 1}. ${shortLabel(s.label)}`;
      L.marker([s.lat, s.lng], { icon: pinIcon(L, i + 1) })
        .addTo(layer)
        // Dauerhaftes Label mit dem (deutsch bevorzugten) Ortsnamen direkt auf der Karte.
        .bindTooltip(tooltipEl, {
          permanent: true,
          direction: "right",
          offset: [12, 0],
          opacity: 0.9,
        })
        .bindPopup(popupEl);
    });

    // Unterkünfte als eigene Marker (🏨) — nicht Teil der Route.
    hotels.forEach((h) => {
      const tooltipEl = document.createElement("span");
      tooltipEl.textContent = shortLabel(h.label);
      const popupEl = document.createElement("div");
      popupEl.textContent = `🏨 ${shortLabel(h.label)}`;
      L.marker([h.lat, h.lng], { icon: hotelIcon(L) })
        .addTo(layer)
        .bindTooltip(tooltipEl, { direction: "right", offset: [14, 0], opacity: 0.9 })
        .bindPopup(popupEl);
    });

    if (routeRef.current) {
      routeRef.current.remove();
      routeRef.current = null;
    }
    if (route) {
      routeRef.current = L.polyline(route.geometry, {
        color: "#009bc9",
        weight: 4,
        opacity: 0.85,
      }).addTo(map);
      map.fitBounds(routeRef.current.getBounds(), { padding: [40, 40] });
    } else if (active.length > 0) {
      const group = L.featureGroup(active.map((s) => L.marker([s.lat, s.lng])));
      map.fitBounds(group.getBounds(), { padding: [40, 40], maxZoom: 9 });
    } else {
      map.setView(JAPAN_CENTER, 5);
    }
  }, [stops, hotels, route, ready]);

  // Konbinis laden – entlang der Route (~120 m Korridor) oder um den Standort (~400 m).
  useEffect(() => {
    let pts: string | null = null;
    let radius = 120;
    if (konbiniMode === "route" && route) {
      pts = sampleGeometry(route.geometry)
        .map(([lat, lng]) => `${lat},${lng}`)
        .join(";");
    } else if (konbiniMode === "location" && myLocation) {
      pts = `${myLocation.lat},${myLocation.lng}`;
      radius = 400;
    }
    if (!pts) {
      setKonbinis([]);
      setKonbiniError(null);
      return;
    }
    let cancelled = false;
    setKonbiniLoading(true);
    setKonbiniError(null);
    api
      .get<{ stores: Konbini[] }>(`/api/v1/geo/konbini?points=${encodeURIComponent(pts)}&radius=${radius}`)
      .then((d) => {
        if (!cancelled) setKonbinis(d.stores);
      })
      .catch((e) => {
        if (!cancelled) {
          setKonbinis([]);
          setKonbiniError(e instanceof Error ? e.message : "Konbinis konnten nicht geladen werden.");
        }
      })
      .finally(() => {
        if (!cancelled) setKonbiniLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [konbiniMode, route, myLocation]);

  // Konbini- und Standort-Marker rendern (eigener Layer → Stopp-/Hotel-Marker bleiben).
  useEffect(() => {
    const L = LRef.current;
    const layer = konbiniRef.current;
    if (!L || !layer) return;
    layer.clearLayers();
    if (konbiniMode === "location" && myLocation) {
      const meEl = document.createElement("div");
      meEl.textContent = "📍 Dein Standort";
      L.marker([myLocation.lat, myLocation.lng], { icon: meIcon(L) })
        .addTo(layer)
        .bindPopup(meEl);
    }
    konbinis
      .filter((k) => !hiddenBrands.has(k.brand))
      .forEach((k) => {
        // XSS-sicher: Popup als DOM-Elemente mit textContent (kein HTML-String).
        const popupEl = document.createElement("div");
        popupEl.className = "space-y-1";

        const titleEl = document.createElement("div");
        titleEl.className = "font-medium";
        titleEl.textContent =
          k.name && k.name !== k.brand ? `🏪 ${k.brand} · ${k.name}` : `🏪 ${k.brand}`;
        popupEl.appendChild(titleEl);

        if (k.address) {
          const addrEl = document.createElement("div");
          addrEl.className = "text-slate-500";
          addrEl.textContent = k.address;
          popupEl.appendChild(addrEl);
        }

        const linkEl = document.createElement("a");
        // Server-Route löst mit Google-Key (kostenlos, nur place_id) die exakte
        // Filiale auf und leitet auf deren POI-Karte weiter. `q` = Suchtext für
        // Google: die Marke (robuster als der ggf. japanische OSM-Filialname —
        // die exakte Filiale ergibt sich server-seitig über DISTANCE + Koordinaten).
        // `fallback` = keyfreier Suchtext (Name/Adresse, sonst Koordinaten), falls
        // kein Key/kein Treffer.
        const searchText = k.brand === "Konbini" ? "convenience store" : k.brand;
        const fallbackQuery =
          k.name && k.name !== k.brand
            ? [k.name, k.address].filter(Boolean).join(" ")
            : k.address
              ? `${k.brand} ${k.address}`
              : `${k.lat},${k.lng}`;
        linkEl.href =
          `/api/v1/geo/place-link?lat=${k.lat}&lng=${k.lng}` +
          `&q=${encodeURIComponent(searchText)}&fallback=${encodeURIComponent(fallbackQuery)}` +
          `&type=convenience_store`;
        linkEl.target = "_blank";
        linkEl.rel = "noopener noreferrer";
        linkEl.className = "inline-block text-brand hover:underline";
        linkEl.textContent = "📍 In Google Maps öffnen";
        popupEl.appendChild(linkEl);

        L.marker([k.lat, k.lng], { icon: konbiniIcon(L, k.brand) })
          .addTo(layer)
          .bindPopup(popupEl);
      });
  }, [konbinis, konbiniMode, myLocation, hiddenBrands, ready]);

  // Beim Ermitteln des Standorts die Karte dorthin zentrieren.
  useEffect(() => {
    const map = mapRef.current;
    if (map && konbiniMode === "location" && myLocation) {
      map.setView([myLocation.lat, myLocation.lng], 16);
    }
  }, [myLocation, konbiniMode]);

  // Regenradar-Overlay (RainViewer, keyfrei): jüngstes Radarbild als halbtransparente Kachel.
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    if (rainRef.current) {
      rainRef.current.remove();
      rainRef.current = null;
    }
    if (!showRain) {
      setRainError(null);
      return;
    }
    let cancelled = false;
    fetch("https://api.rainviewer.com/public/weather-maps.json")
      .then((r) => r.json())
      .then((d: { host?: string; radar?: { past?: { path: string }[] } }) => {
        if (cancelled || !mapRef.current) return;
        const frames = d.radar?.past ?? [];
        const frame = frames[frames.length - 1];
        if (!d.host || !frame?.path) {
          setRainError("Regenradar gerade nicht verfügbar.");
          return;
        }
        // {host}{path}/256/{z}/{x}/{y}/{color}/{smooth}_{snow}.png (Farbschema 2).
        const layer = L.tileLayer(`${d.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`, {
          opacity: 0.6,
          zIndex: 400,
          attribution: "Radar &copy; RainViewer",
        });
        layer.addTo(mapRef.current);
        rainRef.current = layer;
        setRainError(null);
      })
      .catch(() => {
        if (!cancelled) setRainError("Regenradar konnte nicht geladen werden.");
      });
    return () => {
      cancelled = true;
    };
  }, [showRain, ready]);

  // Echten Standort per Browser-Geolocation ermitteln (nur über HTTPS/localhost).
  function locateMe() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast("Standort wird von diesem Gerät nicht unterstützt.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setMyLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setKonbiniMode("location");
      },
      (err) => {
        setLocating(false);
        toast(
          err.code === err.PERMISSION_DENIED
            ? "Standortzugriff abgelehnt – in den Browser-Einstellungen erlauben."
            : "Standort konnte nicht ermittelt werden.",
        );
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  // Konbini-Marke ein-/ausblenden (Legende als Filter).
  function toggleBrand(b: KonbiniBrand) {
    setHiddenBrands((prev) => {
      const next = new Set(prev);
      if (next.has(b)) next.delete(b);
      else next.add(b);
      return next;
    });
  }

  // Autocomplete: bei einem Ortsnamen (kein Link) live Vorschläge holen (Nominatim
  // via geo/search), entprellt (schont Nominatim). Bei Links/kurzer Eingabe: aus.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3 || /https?:\/\//i.test(q)) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      api
        .get<GeoResult[]>(`/api/v1/geo/search?q=${encodeURIComponent(q)}`)
        .then((rs) => !cancelled && setSuggestions(rs.slice(0, 5)))
        .catch(() => !cancelled && setSuggestions([]));
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  // Vorschlagsliste bei Klick außerhalb des Eingabefelds schließen.
  useEffect(() => {
    if (!showSuggest) return;
    const onDown = (e: MouseEvent) => {
      if (suggestRef.current && !suggestRef.current.contains(e.target as Node)) {
        setShowSuggest(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [showSuggest]);

  // Einen Vorschlag direkt als Stopp übernehmen (Koordinaten sind schon bekannt).
  function pickSuggestion(r: GeoResult) {
    const next = [...stops, { id: crypto.randomUUID(), label: r.label, lat: r.lat, lng: r.lng }];
    setStops(next);
    persistStops(next);
    setQuery("");
    setSuggestions([]);
    setShowSuggest(false);
    setRoute(null);
    setTransitLegs([]);
    setTransitError(null);
  }

  // Einen Ort als Stopp anlegen. Ein Feld für beides: `geo/resolve` behandelt
  // sowohl einen Ortsnamen/Text (Nominatim-Geocode) als auch einen Google-/Apple-
  // Maps-Link (exakte Koordinaten) — daher die frühere Zweiteilung nicht mehr nötig.
  async function addStop(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 2) return;
    setAdding(true);
    setError(null);
    try {
      const r = await api.get<GeoResult>(`/api/v1/geo/resolve?q=${encodeURIComponent(q)}`);
      const next = [...stops, { id: crypto.randomUUID(), label: r.label, lat: r.lat, lng: r.lng }];
      setStops(next);
      persistStops(next);
      setQuery("");
      setRoute(null); // Route veraltet, sobald sich die Stopps ändern
      setTransitLegs([]);
      setTransitError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Konnte keinen Ort ermitteln.");
    } finally {
      setAdding(false);
    }
  }

  // Eigenen Standort (Browser-Geolocation) als **ersten** Stopp = Startpunkt der
  // Route setzen. Nur über HTTPS/localhost verfügbar.
  function addMyLocationAsStart() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast("Standort wird von diesem Gerät nicht unterstützt.");
      return;
    }
    setLocatingStart(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocatingStart(false);
        const me = {
          id: crypto.randomUUID(),
          label: "Mein Standort",
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        const next = [me, ...stops]; // an den Anfang → Startpunkt
        setStops(next);
        persistStops(next);
        setMyLocation({ lat: me.lat, lng: me.lng });
        setRoute(null);
        setTransitLegs([]);
        setTransitError(null);
      },
      (err) => {
        setLocatingStart(false);
        toast(
          err.code === err.PERMISSION_DENIED
            ? "Standortzugriff abgelehnt – in den Browser-Einstellungen erlauben."
            : "Standort konnte nicht ermittelt werden.",
        );
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  async function loadWeather() {
    if (stops.length === 0) return;
    setWeatherLoading(true);
    try {
      const entries = await Promise.all(
        stops.map(async (s) => {
          try {
            const w = await api.get<{ emoji: string; tempC: number; text: string }>(
              `/api/v1/geo/weather?lat=${s.lat}&lng=${s.lng}`,
            );
            return [s.id, w] as const;
          } catch {
            return [s.id, null] as const;
          }
        }),
      );
      const map: Record<string, { emoji: string; tempC: number; text: string }> = {};
      for (const [id, w] of entries) if (w) map[id] = w;
      setWeather(map);
    } finally {
      setWeatherLoading(false);
    }
  }

  function removeStop(id: string) {
    const next = stops.filter((s) => s.id !== id);
    setStops(next);
    persistStops(next);
    setRoute(null);
  }

  // Stopp in die Route auf-/abwählen: bleibt gespeichert, verschwindet aber aus
  // Karte/Route/Zugverbindungen. Route wird ungültig, sobald sich die Auswahl ändert.
  function toggleActive(id: string) {
    const next = stops.map((s) => (s.id === id ? { ...s, active: !isActive(s) } : s));
    setStops(next);
    persistStops(next);
    setRoute(null);
  }

  // Neue Stopps anhängen (Backend-Limit 200); gibt zurück, wie viele Platz hatten.
  function appendStops(newStops: Stop[]): number {
    const room = Math.max(0, 200 - stops.length);
    const take = newStops.slice(0, room);
    if (take.length > 0) {
      const next = [...stops, ...take];
      setStops(next);
      persistStops(next);
      setRoute(null);
    }
    return take.length;
  }

  // Orte-Datei importieren (CSV/GeoJSON/KML/GPX). Einträge mit Koordinaten werden
  // sofort übernommen; reine Namen/Links landen im Textfeld und werden per
  // „Importieren" über geo/resolve aufgelöst.
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // gleiche Datei erneut wählbar
    if (!file) return;
    setImportNote(null);
    let text: string;
    try {
      text = await file.text();
    } catch {
      setImportNote("⚠️ Datei konnte nicht gelesen werden.");
      return;
    }
    const { direct, queries, fallbacks, error } = parsePlacesFile(file.name, text);
    if (error) {
      setImportNote(`⚠️ ${error}`);
      return;
    }
    // Name→Link-Fallbacks merken (für „Auflösen": Name scheitert → Link versuchen).
    for (const [k, v] of Object.entries(fallbacks)) importFallback.current.set(k, v);
    if (direct.length === 0 && queries.length === 0) {
      setImportNote("⚠️ Keine Orte in der Datei gefunden.");
      return;
    }
    // Orte mit Koordinaten kommen in die Vorschau-Liste (nicht direkt in die Stopps).
    if (direct.length > 0) {
      setImportCandidates((prev) => [
        ...prev,
        ...direct.map((d) => ({ id: crypto.randomUUID(), label: d.label, lat: d.lat, lng: d.lng })),
      ]);
    }
    if (queries.length > 0) {
      setImportText((prev) => [prev.trim(), ...queries].filter(Boolean).join("\n"));
    }
    const parts: string[] = [];
    if (direct.length > 0) parts.push(`${direct.length} Orte mit Koordinaten in der Vorschau`);
    if (queries.length > 0)
      parts.push(`${queries.length} Namen/Links ins Feld gelegt — „Auflösen" tippen`);
    setImportNote(parts.join(" · "));
  }

  // Textfeld auflösen: jede Zeile über geo/resolve zu einem Ort machen und in die
  // Vorschau-Liste legen (noch NICHT in die Stopps). Nicht erkannte Zeilen bleiben
  // zur Korrektur im Feld.
  async function importList() {
    const lines = importText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return;
    setImporting(true);
    setImportNote(null);
    const found: { id: string; label: string; lat: number; lng: number }[] = [];
    const failed: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      // Drosseln: Nominatim blockt schnelle Serien (Policy ~1 Anfrage/Sekunde).
      if (i > 0) await sleep(1100);
      setImportProgress({ done: i, total: lines.length });
      const line = lines[i];
      try {
        const r = await api.get<GeoResult>(`/api/v1/geo/resolve?q=${encodeURIComponent(line)}`);
        found.push({ id: crypto.randomUUID(), label: r.label, lat: r.lat, lng: r.lng });
        continue;
      } catch {
        /* Name nicht gefunden → ggf. Fallback-Link versuchen */
      }
      // Fallback: der zum Namen gemerkte Google-Maps-Link aus der CSV.
      const link = importFallback.current.get(line);
      if (!link) {
        failed.push(line);
        continue;
      }
      await sleep(1100);
      try {
        const r = await api.get<GeoResult>(`/api/v1/geo/resolve?q=${encodeURIComponent(link)}`);
        // Ursprünglichen Namen als Label behalten (lesbarer als der Link/Koordinaten).
        found.push({ id: crypto.randomUUID(), label: line, lat: r.lat, lng: r.lng });
      } catch {
        failed.push(line);
      }
    }
    setImportProgress(null);
    if (found.length > 0) setImportCandidates((prev) => [...prev, ...found]);
    setImporting(false);
    setImportText(failed.join("\n"));
    setImportNote(
      failed.length > 0
        ? `${found.length} gefunden, ${failed.length} nicht erkannt (bleiben im Feld). Tipp: Für Google-Listen die GeoJSON-Datei aus Takeout laden — die enthält Koordinaten.`
        : `${found.length} Orte gefunden.`,
    );
  }

  // Einen Vorschlag aus der Vorschau-Liste entfernen.
  function removeCandidate(id: string) {
    setImportCandidates((prev) => prev.filter((c) => c.id !== id));
  }

  // Notiz an einem gefundenen Ort setzen (wandert beim Übernehmen in den Stopp).
  function setCandidateNote(id: string, note: string) {
    setImportCandidates((prev) => prev.map((c) => (c.id === id ? { ...c, note } : c)));
  }

  // Einen einzelnen Vorschlag in die Stopps übernehmen (und aus der Vorschau nehmen).
  function commitCandidate(id: string) {
    const c = importCandidates.find((x) => x.id === id);
    if (!c) return;
    const added = appendStops([
      { id: c.id, label: c.label, lat: c.lat, lng: c.lng, active: true, note: c.note ?? "" },
    ]);
    if (added > 0) {
      setImportCandidates((prev) => prev.filter((x) => x.id !== id));
      setImportNote(`„${shortLabel(c.label)}" in die Stopps übernommen.`);
    } else {
      setImportNote("Kein Platz mehr — Limit von 200 Stopps erreicht.");
    }
  }

  // Die geprüfte Vorschau-Liste in die echten Stopps übernehmen (Limit 200 beachtet)
  // und danach zur Karte wechseln, damit man das Ergebnis sieht.
  function commitCandidates() {
    if (importCandidates.length === 0) return;
    const room = Math.max(0, 200 - stops.length);
    const take = importCandidates.slice(0, room);
    const rest = importCandidates.slice(room);
    const added = appendStops(
      take.map((c) => ({
        id: c.id,
        label: c.label,
        lat: c.lat,
        lng: c.lng,
        active: true,
        note: c.note ?? "",
      })),
    );
    setImportCandidates(rest);
    setImportNote(
      added > 0
        ? `${added} in die Stopps übernommen${rest.length > 0 ? `, ${rest.length} wegen Limit (200) übrig` : ""}.`
        : "Kein Platz mehr — Limit von 200 Stopps erreicht.",
    );
    if (added > 0 && rest.length === 0) setView("map");
  }

  // Stopp in der Liste nach oben/unten verschieben (manuelle Reihenfolge).
  // Stopps per Drag & Drop sortieren (Maus, Touch mit kurzem Halten, Tastatur).
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onStopsDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = stops.findIndex((s) => s.id === active.id);
    const newIndex = stops.findIndex((s) => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(stops, oldIndex, newIndex);
    setStops(next);
    persistStops(next);
    setRoute(null); // Route veraltet bei geänderter Reihenfolge
  }

  function clearAll() {
    setStops([]);
    persistStops([]);
    setRoute(null);
  }

  // Unterkunft auflösen (Google-Maps-Link → exakte Koordinaten, sonst Name → geschätzt)
  // und in der Reise speichern. Nutzt denselben Resolver wie „Ort aus Link/Text".
  async function addHotel(e: React.FormEvent) {
    e.preventDefault();
    const q = hotelQuery.trim();
    if (q.length < 2) return;
    setHotelAdding(true);
    setHotelError(null);
    try {
      const r = await api.get<GeoResult>(`/api/v1/geo/resolve?q=${encodeURIComponent(q)}`);
      // Kein Gebiet/keine Sehenswürdigkeit als Unterkunft zulassen.
      if (r.area) {
        setHotelError(
          "Das sieht nach einer Stadt/einem Gebiet aus, keine Unterkunft. Bitte einen konkreten Hotelnamen oder einen Google-Maps-Link angeben.",
        );
        return;
      }
      if (r.source === "text") {
        // Namenseingabe: streng — nur echte Beherbergungstypen.
        if (!r.lodging) {
          setHotelError(
            "Das scheint keine Unterkunft zu sein (z. B. eine Sehenswürdigkeit). Bitte den Hotelnamen genauer angeben oder den Google-Maps-Link deiner Unterkunft einfügen.",
          );
          return;
        }
      } else if (r.attraction) {
        // Maps-Link: klare Sehenswürdigkeit (z. B. Museum) abweisen (Best-Effort).
        setHotelError(
          "Dieser Ort ist eine Sehenswürdigkeit, keine Unterkunft. Bitte den Link deines Hotels verwenden.",
        );
        return;
      }
      const hotel = await api.post<Hotel>("/api/v1/trip-hotels", {
        label: r.label,
        lat: r.lat,
        lng: r.lng,
      });
      setHotels((prev) => [...prev, hotel]);
      setHotelQuery("");
    } catch (err) {
      setHotelError(err instanceof Error ? err.message : "Konnte keine Unterkunft ermitteln.");
    } finally {
      setHotelAdding(false);
    }
  }

  // Maßgeblichen Hotel-Stand neu laden (Rollback nach fehlgeschlagener Mutation).
  function reloadHotels() {
    api
      .get<Hotel[]>("/api/v1/trip-hotels")
      .then(setHotels)
      .catch(() => {});
  }

  function setHotelDates(id: string, patch: { checkIn?: string | null; checkOut?: string | null }) {
    setHotels((prev) => prev.map((h) => (h.id === id ? { ...h, ...patch } : h)));
    api.patch<Hotel>(`/api/v1/trip-hotels/${id}`, patch).catch((err) => {
      setHotelError(
        err instanceof Error ? err.message : "Änderung konnte nicht gespeichert werden.",
      );
      reloadHotels(); // optimistische Änderung verwerfen, echten Stand zeigen
    });
  }

  function removeHotel(id: string) {
    const snapshot = hotels;
    setHotels((prev) => prev.filter((h) => h.id !== id));
    api.delete(`/api/v1/trip-hotels/${id}`).catch((err) => {
      setHotelError(err instanceof Error ? err.message : "Löschen fehlgeschlagen.");
      setHotels(snapshot); // Zeile wiederherstellen
    });
  }

  // Unterkunft als Stopp in den Reiseplaner übernehmen (wird Teil der Route).
  // „(Hotel)" wird ans erste Label-Segment gehängt (bleibt so auch nach shortLabel
  // sichtbar), das vollständige Label bleibt erhalten — Kürzung erst beim Rendern.
  function hotelToStop(h: Hotel) {
    const comma = h.label.indexOf(",");
    const label =
      comma === -1
        ? `${h.label} (Hotel)`
        : `${h.label.slice(0, comma)} (Hotel)${h.label.slice(comma)}`;
    const next = [...stops, { id: crypto.randomUUID(), label, lat: h.lat, lng: h.lng }];
    setStops(next);
    persistStops(next);
    setRoute(null); // Route veraltet, sobald sich die Stopps ändern
  }

  async function computeRoute() {
    const act = stops.filter(isActive);
    if (act.length < 2) return;
    setRouting(true);
    setError(null);
    setTransitLegs([]);
    setTransitError(null);
    try {
      const points = act.map((s) => `${s.lat},${s.lng}`).join(";");
      const data = await api.get<RouteInfo>(
        `/api/v1/geo/route?points=${encodeURIComponent(points)}`,
      );
      // Aktive Stopps in die optimale Reihenfolge bringen (passt zur gezeichneten
      // Route), abgewählte hängen wir unverändert hinten an.
      const orderedActive = data.order.map((i) => act[i]).filter(Boolean);
      const next = [...orderedActive, ...stops.filter((s) => !isActive(s))];
      setStops(next);
      persistStops(next);
      setRoute(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Route nicht berechenbar.");
    } finally {
      setRouting(false);
    }
  }

  async function addLegToCalculator(leg: TransitLeg, index: number) {
    if (!leg.conn?.fareYen) return;
    const ok = await addExpenseItem({
      category: "TRANSPORT",
      label: `Zug: ${shortLabel(leg.from.label)} → ${shortLabel(leg.to.label)}`,
      yen: leg.conn.fareYen,
    });
    if (ok) setAddedLegs((prev) => ({ ...prev, [index]: true }));
  }

  function addAllLegsToCalculator() {
    transitLegs.forEach((leg, i) => {
      if (leg.conn?.fareYen && !addedLegs[i]) addLegToCalculator(leg, i);
    });
  }

  async function loadTransit() {
    const act = stops.filter(isActive);
    if (act.length < 2) return;
    setTransitLoading(true);
    setTransitError(null);
    setAddedLegs({});
    try {
      const pairs: { from: Stop; to: Stop }[] = [];
      for (let i = 0; i < act.length - 1; i++) {
        pairs.push({ from: act[i], to: act[i + 1] });
      }
      const results = await Promise.all(
        pairs.map(async (p): Promise<TransitLeg> => {
          try {
            const data = await api.get<{ best: TransitConn }>(
              `/api/v1/geo/transit?from=${p.from.lat},${p.from.lng}` +
                `&to=${p.to.lat},${p.to.lng}&mode=${transitDirect ? "direct" : "any"}`,
            );
            return { from: p.from, to: p.to, conn: data.best, error: null };
          } catch (e) {
            return {
              from: p.from,
              to: p.to,
              conn: null,
              error: e instanceof Error ? e.message : "Fehler",
            };
          }
        }),
      );
      // Gleicher Fehler auf allen Etappen (z. B. Key fehlt) → einmal zentral zeigen.
      if (results.length > 0 && results.every((r) => r.error && r.error === results[0].error)) {
        setTransitError(results[0].error);
        setTransitLegs([]);
      } else {
        setTransitLegs(results);
      }
    } finally {
      setTransitLoading(false);
    }
  }

  const inputClass =
    "w-full rounded-md border border-slate-300 dark:border-slate-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-brand";

  // Gesamt-Übersicht der Zugverbindungen: Fahrzeit, Umstiege und ¥ über alle
  // Etappen aufsummiert (Liste ist klein → Berechnung im Render unkritisch).
  const transitTotals = (() => {
    const legs = transitLegs.filter((l) => l.conn);
    if (legs.length === 0) return null;
    const totalMin = legs.reduce((s, l) => s + (l.conn!.durationMin || 0), 0);
    const transfers = legs.reduce((s, l) => s + (l.conn!.transfers || 0), 0);
    const fareLegs = legs.filter((l) => l.conn!.fareYen != null);
    const totalYen = fareLegs.reduce((s, l) => s + (l.conn!.fareYen || 0), 0);
    return {
      count: legs.length,
      totalMin,
      transfers,
      totalYen,
      hasFare: fareLegs.length > 0,
      partialFare: fareLegs.length > 0 && fareLegs.length < legs.length,
      estimated: legs.some((l) => l.conn!.estimated),
    };
  })();

  // Route-Nummerierung: nur aktive Stopps zählen (entspricht der Karte).
  let runningNo = 0;
  const routeNo = new Map<string, number>();
  stops.forEach((s) => {
    if (isActive(s)) routeNo.set(s.id, ++runningNo);
  });
  const activeCount = runningNo;

  return (
    <div className="space-y-4">
      {/* Tab-Umschalter: entlastet den vollen Reiseplaner (Karte vs. Liste). */}
      <div className="inline-flex rounded-lg border border-slate-200 p-1 dark:border-slate-700">
        {([
          ["map", "🗺️ Karte & Route"],
          ["list", "📋 Import"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            aria-pressed={view === key}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              view === key
                ? "bg-brand text-white"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        className={
          view === "map"
            ? "grid gap-4 lg:grid-cols-[minmax(280px,1fr)_2fr]"
            : "space-y-4"
        }
      >
      {/* Steuerung: Orte eingeben + Liste */}
      <div className="flex flex-col gap-3">
        {/* Ein Feld für beides: Ortsname/Text ODER Google-/Apple-Maps-Link. */}
        <form
          onSubmit={addStop}
          className={`rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 ${
            view === "map" ? "" : "hidden"
          }`}
        >
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
            Ort hinzufügen
          </label>
          <div ref={suggestRef} className="relative">
            <textarea
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShowSuggest(true);
              }}
              onFocus={() => setShowSuggest(true)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setShowSuggest(false);
                  return;
                }
                // Enter fügt hinzu (Shift+Enter = Zeilenumbruch, z. B. bei langen Links).
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              rows={2}
              placeholder="Ortsname oder Google-Maps-Link (z. B. „Tokyo Tower“, „Fushimi Inari“)"
              className="w-full resize-none rounded-md border border-slate-300 dark:border-slate-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-brand"
            />
            {showSuggest && suggestions.length > 0 && (
              <ul
                role="listbox"
                className="absolute left-0 right-0 top-full z-[1200] mt-1 max-h-64 overflow-auto rounded-md border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
              >
                {suggestions.map((r, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={false}
                      onClick={() => pickSuggestion(r)}
                      className="block w-full truncate rounded px-2 py-1.5 text-left text-sm text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                      title={r.label}
                    >
                      📍 {r.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-xs text-slate-400 dark:text-slate-500">
              Maps-Link = exakt · Name/Text = geschätzt
            </span>
            <button
              type="submit"
              disabled={adding || query.trim().length < 2}
              className="shrink-0 rounded-md bg-brand px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {adding ? "…" : "Hinzufügen"}
            </button>
          </div>
          <button
            type="button"
            onClick={addMyLocationAsStart}
            disabled={locatingStart}
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand transition hover:underline disabled:opacity-60"
          >
            📍 {locatingStart ? "Standort…" : "Meinen Standort als Startpunkt"}
          </button>
          {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
        </form>

        {/* Orte-Liste-Tab: Listen-Import (entlastet den Karten-Tab). */}
        <div className={view === "list" ? "flex flex-col gap-3" : "hidden"}>
        {/* Sammel-Import: mehrere Orte/Maps-Links auf einmal (eine Zeile pro Ort). */}
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
          <button
            type="button"
            onClick={() => setImportOpen((o) => !o)}
            aria-expanded={importOpen}
            className="flex w-full items-center justify-between text-sm font-medium text-slate-700 dark:text-slate-200"
          >
            <span>📋 Liste importieren</span>
            <span
              className={`text-[10px] transition-transform duration-200 ${importOpen ? "rotate-180" : ""}`}
              aria-hidden
            >
              ▾
            </span>
          </button>
          {importOpen && (
            <div className="mt-2 space-y-2">
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                rows={5}
                placeholder={
                  "Ein Ort pro Zeile — Name oder Google-Maps-Link, z. B.:\nteamLab Planets\nFushimi Inari\nhttps://maps.app.goo.gl/…"
                }
                className="w-full resize-y rounded-md border border-slate-300 dark:border-slate-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-brand"
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-400 dark:text-slate-500">
                  {importing && importProgress
                    ? `Löse auf… ${importProgress.done + 1}/${importProgress.total}`
                    : "Jede Zeile wird gesucht und unten als Vorschau aufgelistet."}
                </span>
                <button
                  type="button"
                  onClick={importList}
                  disabled={importing || importText.trim().length === 0}
                  className="shrink-0 rounded-md bg-brand px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {importing ? "Suche…" : "Auflösen"}
                </button>
              </div>

              {/* Alternativ: Orte-Datei importieren (Takeout/My Maps/GPX). */}
              <div className="border-t border-slate-100 pt-2 dark:border-slate-800">
                <label className="inline-flex cursor-pointer items-center gap-1 text-sm font-medium text-brand transition hover:underline">
                  📁 Datei importieren
                  <input
                    type="file"
                    accept=".geojson,.json,.kml,.gpx,.csv,text/csv,application/json,application/geo+json"
                    onChange={onFile}
                    className="hidden"
                  />
                </label>
                <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                  Am besten <strong>GeoJSON/KML/GPX</strong> (enthalten Koordinaten → direkt in
                  die Vorschau). CSV (Google Takeout) hat nur Namen/Links → werden geocodiert;
                  sehr spezielle Shop-Namen findet der Geocoder evtl. nicht.
                </p>
                {importNote && (
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{importNote}</p>
                )}
              </div>

              {/* Vorschau-Liste: gefundene Orte prüfen, dann in die Stopps übernehmen. */}
              {importCandidates.length > 0 && (
                <div className="border-t border-slate-100 pt-2 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      Gefundene Orte ({importCandidates.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => setImportCandidates([])}
                      className="text-xs text-slate-500 transition hover:text-red-600 dark:text-slate-400"
                    >
                      Leeren
                    </button>
                  </div>
                  <ul className="mt-2 max-h-72 space-y-1 overflow-auto">
                    {importCandidates.map((c, i) => (
                      <li
                        key={c.id}
                        className="rounded-md border border-slate-100 px-2 py-1.5 text-sm dark:border-slate-800"
                      >
                        <div className="flex items-center gap-2">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">
                            {i + 1}
                          </span>
                          <a
                            href={placeLinkUrl(c.lat, c.lng, c.label)}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`${c.label} — in Google Maps öffnen`}
                            className="min-w-0 flex-1 truncate text-slate-700 transition hover:text-brand hover:underline dark:text-slate-200 dark:hover:text-brand"
                          >
                            {shortLabel(c.label)}
                          </a>
                          <button
                            type="button"
                            onClick={() => commitCandidate(c.id)}
                            aria-label={`„${shortLabel(c.label)}" als Stopp übernehmen`}
                            className="shrink-0 rounded border border-brand px-2 py-0.5 text-xs font-medium text-brand transition hover:bg-brand hover:text-white"
                          >
                            + Stopp
                          </button>
                          <button
                            type="button"
                            onClick={() => removeCandidate(c.id)}
                            aria-label={`„${shortLabel(c.label)}" aus der Vorschau entfernen`}
                            className="shrink-0 rounded px-1.5 py-0.5 text-xs text-red-600 transition hover:bg-red-500/10 dark:text-red-400"
                          >
                            ✕
                          </button>
                        </div>
                        <input
                          value={c.note ?? ""}
                          onChange={(e) => setCandidateNote(c.id, e.target.value)}
                          placeholder="📝 Notiz…"
                          maxLength={500}
                          aria-label={`Notiz zu „${shortLabel(c.label)}"`}
                          className="mt-1 ml-7 w-[calc(100%-1.75rem)] rounded border border-transparent bg-slate-50 px-2 py-1 text-xs text-slate-600 outline-none transition focus:border-brand focus:bg-transparent dark:bg-slate-800/50 dark:text-slate-300"
                        />
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={commitCandidates}
                    className="mt-2 w-full rounded-md bg-brand-dark px-3 py-2 text-sm font-medium text-white transition hover:opacity-90"
                  >
                    → {importCandidates.length} in die Stopps übernehmen
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        </div>
        {/* Hotel/Unterkunft: zurück im Karten-Tab (an alter Stelle). */}
        <div className={view === "map" ? "flex flex-col gap-3" : "hidden"}>
        {/* Unterkunft (Hotel/Ryokan) — eigener Marker, nicht Teil der Route. */}
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
          <form onSubmit={addHotel}>
            <label
              htmlFor="hotel-input"
              className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300"
            >
              🏨 Hotel / Unterkunft
            </label>
            <div className="flex gap-2">
              <input
                id="hotel-input"
                value={hotelQuery}
                onChange={(e) => setHotelQuery(e.target.value)}
                placeholder="Name oder Google-Maps-Link"
                className={inputClass}
              />
              <button
                type="submit"
                disabled={hotelAdding || hotelQuery.trim().length < 2}
                className="shrink-0 rounded-md bg-accent px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {hotelAdding ? "…" : "Speichern"}
              </button>
            </div>
            <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
              Maps-Link = exaktes Hotel · Name = geschätzt (bei gleichnamigen ggf. falsch)
            </p>
            {hotelError && (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">{hotelError}</p>
            )}
          </form>

          {hotels.length > 0 && (
            <ul className="mt-3 space-y-2">
              {hotels.map((h) => (
                <li
                  key={h.id}
                  className="rounded-md border border-slate-100 dark:border-slate-800 p-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-base leading-none">🏨</span>
                    <div className="min-w-0 flex-1">
                      <PlaceLink
                        lat={h.lat}
                        lng={h.lng}
                        label={h.label}
                        display={shortLabel(h.label)}
                        type="lodging"
                      />
                      {h.by && (
                        <p className="truncate text-[11px] text-slate-400 dark:text-slate-500">
                          von {h.by}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => hotelToStop(h)}
                      title="Als Stopp in die Route übernehmen"
                      aria-label={`Unterkunft „${shortLabel(h.label)}" zu den Stopps hinzufügen`}
                      className="shrink-0 rounded border border-brand px-2 py-1 text-xs font-medium text-brand transition hover:bg-brand hover:text-white"
                    >
                      + Stopp
                    </button>
                    <button
                      type="button"
                      onClick={() => removeHotel(h.id)}
                      aria-label={`Unterkunft „${shortLabel(h.label)}" entfernen`}
                      className="shrink-0 rounded px-2 py-1 text-xs text-red-600 transition hover:bg-red-500/10 dark:text-red-400"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="mt-1.5 space-y-1 pl-7 text-[11px] text-slate-500 dark:text-slate-400">
                    <label className="flex items-center gap-2">
                      <span className="w-16 shrink-0">Check-in</span>
                      <input
                        type="date"
                        value={h.checkIn ?? ""}
                        onChange={(e) => setHotelDates(h.id, { checkIn: e.target.value || null })}
                        className="min-w-0 flex-1 rounded border border-slate-300 dark:border-slate-600 bg-transparent px-1.5 py-0.5 text-xs text-slate-600 dark:text-slate-300 outline-none focus:border-brand"
                      />
                    </label>
                    <label className="flex items-center gap-2">
                      <span className="w-16 shrink-0">Check-out</span>
                      <input
                        type="date"
                        value={h.checkOut ?? ""}
                        onChange={(e) => setHotelDates(h.id, { checkOut: e.target.value || null })}
                        className="min-w-0 flex-1 rounded border border-slate-300 dark:border-slate-600 bg-transparent px-1.5 py-0.5 text-xs text-slate-600 dark:text-slate-300 outline-none focus:border-brand"
                      />
                    </label>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        </div>
        {/* Karten-Tab: Stopp-Liste (Route-Häkchen, Notizen, Sortierung) — an alter Stelle. */}
        <div className={view === "map" ? "flex flex-col gap-3" : "hidden"}>
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-3 py-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Stopps ({activeCount}
              {stops.length > activeCount ? ` in Route · ${stops.length - activeCount} gespeichert` : ""})
            </span>
            {stops.length > 0 && (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={loadWeather}
                  disabled={weatherLoading}
                  className="text-xs text-brand transition hover:underline disabled:opacity-50"
                >
                  {weatherLoading ? "Wetter…" : "🌦 Wetter"}
                </button>
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-xs text-slate-500 transition hover:text-red-600 dark:text-slate-400"
                >
                  Alle löschen
                </button>
              </div>
            )}
          </div>
          {stops.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-slate-400 dark:text-slate-500">
              Noch keine Orte. Gib oben einen Ort ein.
            </p>
          ) : (
            <DndContext
              sensors={dndSensors}
              collisionDetection={closestCenter}
              onDragEnd={onStopsDragEnd}
            >
              <SortableContext
                items={stops.map((s) => s.id)}
                strategy={verticalListSortingStrategy}
              >
                <ol>
                  {stops.map((s, i) => (
                    <SortableStopLi
                      key={s.id}
                      id={s.id}
                      className="border-b border-slate-100 dark:border-slate-800 px-3 py-2 last:border-b-0"
                    >
                      {({ attributes, listeners, isDragging }) => (
                        <>
                          {/* Zeile 1: Griff, „in Route", Nummer, Name/„von", Löschen */}
                          <div className={`flex items-center gap-2 ${isActive(s) ? "" : "opacity-60"}`}>
                            <button
                              type="button"
                              {...attributes}
                              {...listeners}
                              aria-label={`Stopp „${shortLabel(s.label)}" verschieben`}
                              className={`shrink-0 touch-none rounded px-1 text-slate-400 transition hover:text-brand dark:text-slate-500 ${
                                isDragging ? "cursor-grabbing" : "cursor-grab"
                              }`}
                            >
                              ⠿
                            </button>
                            <input
                              type="checkbox"
                              checked={isActive(s)}
                              onChange={() => toggleActive(s.id)}
                              aria-label={`„${shortLabel(s.label)}" in der Route`}
                              title={isActive(s) ? "In der Route — abwählen zum Aufheben" : "Nicht in der Route — anhaken, um sie aufzunehmen"}
                              className="h-4 w-4 shrink-0 cursor-pointer accent-brand"
                            />
                            {isActive(s) ? (
                              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
                                {routeNo.get(s.id)}
                              </span>
                            ) : (
                              <span
                                title="Gespeichert, nicht in der Route"
                                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-dashed border-slate-300 text-xs text-slate-400 dark:border-slate-600 dark:text-slate-500"
                              >
                                –
                              </span>
                            )}
                            <div className="min-w-0 flex-1">
                              <PlaceLink
                                lat={s.lat}
                                lng={s.lng}
                                label={s.label}
                                display={shortLabel(s.label)}
                              />
                              {s.by && (
                                <p className="truncate text-[11px] text-slate-400 dark:text-slate-500">
                                  von {s.by}
                                </p>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => removeStop(s.id)}
                              aria-label={`Stopp „${shortLabel(s.label)}" entfernen`}
                              className="shrink-0 rounded px-2 py-1 text-xs text-red-600 transition hover:bg-red-500/10 dark:text-red-400"
                            >
                              ✕
                            </button>
                          </div>
                          {/* Zeile 2: Wetter + Reisetag — nur zeigen, wenn Wetter geladen ist
                              oder dem Stopp (über den Tagesplaner) ein Reisetag zugeordnet wurde. */}
                          {(weather[s.id] || s.date) && (
                            <div className="mt-1.5 flex items-center gap-2 pl-8">
                              {weather[s.id] && (
                                <span
                                  className="shrink-0 text-xs text-slate-500 dark:text-slate-400"
                                  title={weather[s.id].text}
                                >
                                  {weather[s.id].emoji} {weather[s.id].tempC}°
                                </span>
                              )}
                              {s.date && (
                                <span
                                  title="Reisetag (im Tagesplaner zugeordnet)"
                                  className="shrink-0 rounded bg-brand-tint/60 px-1.5 py-0.5 text-xs text-brand-dark dark:bg-brand/20 dark:text-brand-tint"
                                >
                                  📅 {deDate(s.date)}
                                </span>
                              )}
                            </div>
                          )}
                          {/* Kurze Notiz/Absprache am Ort (im Team geteilt) */}
                          <input
                            value={s.note ?? ""}
                            onChange={(e) => setStopNote(s.id, e.target.value)}
                            onBlur={() => persistStops(stops)}
                            placeholder="📝 Notiz…"
                            maxLength={500}
                            aria-label={`Notiz zu „${shortLabel(s.label)}"`}
                            className="mt-1.5 ml-8 w-[calc(100%-2rem)] rounded border border-transparent bg-slate-50 px-2 py-1 text-xs text-slate-600 outline-none transition focus:border-brand focus:bg-transparent dark:bg-slate-800/50 dark:text-slate-300"
                          />
                        </>
                      )}
                    </SortableStopLi>
                  ))}
                </ol>
              </SortableContext>
            </DndContext>
          )}
        </div>
        </div>
        {/* Karten-Tab: Routen-/Konbini-/Regen-/Zug-Steuerung (ohne die lange Liste). */}
        <div className={view === "map" ? "flex flex-col gap-3" : "hidden"}>
        <button
          type="button"
          onClick={computeRoute}
          disabled={routing || activeCount < 2}
          className="rounded-md bg-brand-dark px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {routing ? "Berechne beste Route…" : "Beste Route berechnen"}
        </button>

        {route && (
          <div className="rounded-lg border border-brand/30 bg-brand-tint/40 px-3 py-2 text-sm text-slate-700 dark:text-slate-200">
            <span className="font-semibold">Beste Route (Auto):</span> {route.distanceKm} km ·{" "}
            {Math.floor(route.durationMin / 60)} h {route.durationMin % 60} min Fahrt
            <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
              Reihenfolge optimiert (ab dem ersten Ort).
            </span>
          </div>
        )}

        {/* Konbini-Radar: Convenience-Stores entlang der Route ODER um den Standort (keyfrei via OSM/Overpass) */}
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
          <p className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
            🏪 Konbini-Radar
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setKonbiniMode((m) => (m === "route" ? "off" : "route"))}
              disabled={!route}
              title={route ? undefined : "Zuerst die beste Route berechnen"}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                konbiniMode === "route"
                  ? "border-transparent bg-brand text-white"
                  : "border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              Entlang der Route
            </button>
            <button
              type="button"
              onClick={locateMe}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                konbiniMode === "location"
                  ? "border-transparent bg-brand text-white"
                  : "border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              📍 {locating ? "Standort…" : "In meiner Nähe"}
            </button>
            {konbiniMode !== "off" && (
              <button
                type="button"
                onClick={() => setKonbiniMode("off")}
                className="rounded-full px-3 py-1 text-xs text-slate-500 transition hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
              >
                Ausblenden
              </button>
            )}
          </div>

          {konbiniLoading && <p className="mt-2 text-xs text-slate-400">lädt…</p>}
          {konbiniError && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">{konbiniError}</p>
          )}
          {konbiniMode !== "off" && !konbiniLoading && !konbiniError && (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {konbinis.length > 0
                ? `${konbinis.filter((k) => !hiddenBrands.has(k.brand)).length}/${konbinis.length} Läden ${
                    konbiniMode === "route" ? "entlang der Route (~120 m)" : "in der Nähe (~400 m)"
                  } — Marke antippen zum Filtern.`
                : konbiniMode === "location"
                  ? "Keine Konbinis in der Nähe gefunden."
                  : "Keine Konbinis direkt an dieser Route gefunden."}
            </p>
          )}

          {konbiniMode !== "off" &&
            konbinis.length > 0 &&
            (() => {
              const order: KonbiniBrand[] = ["7-Eleven", "Lawson", "FamilyMart", "Ministop", "Konbini"];
              const counts = new Map<KonbiniBrand, number>();
              konbinis.forEach((k) => counts.set(k.brand, (counts.get(k.brand) ?? 0) + 1));
              const present = order.filter((b) => counts.has(b));
              return (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {present.map((b) => {
                    const active = !hiddenBrands.has(b);
                    return (
                      <button
                        key={b}
                        type="button"
                        onClick={() => toggleBrand(b)}
                        aria-pressed={active}
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition ${
                          active
                            ? "border-transparent text-white"
                            : "border-slate-300 text-slate-400 line-through dark:border-slate-600 dark:text-slate-500"
                        }`}
                        style={active ? { backgroundColor: KONBINI_STYLE[b].color } : undefined}
                      >
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: active ? "#fff" : KONBINI_STYLE[b].color }}
                        />
                        {b} ({counts.get(b)})
                      </button>
                    );
                  })}
                </div>
              );
            })()}
        </div>

        {/* Regenradar-Overlay (RainViewer, keyfrei) */}
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showRain}
              onChange={(e) => setShowRain(e.target.checked)}
              className="h-4 w-4 accent-[#009bc9]"
            />
            <span className="font-medium text-slate-700 dark:text-slate-200">🌧️ Regenradar</span>
          </label>
          {showRain && !rainError && (
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              Aktuelles Niederschlagsradar über der Karte — hineinzoomen für Details (RainViewer).
            </p>
          )}
          {rainError && (
            <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{rainError}</p>
          )}
        </div>

        {/* Zugverbindungen je Etappe (Google Directions, Transit) */}
        {route && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                🚆 Zugverbindungen
              </span>
              <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={transitDirect}
                  onChange={(e) => setTransitDirect(e.target.checked)}
                  className="h-3.5 w-3.5 accent-[#009bc9]"
                />
                nur direkt (ohne Umstieg)
              </label>
            </div>
            <button
              type="button"
              onClick={loadTransit}
              disabled={transitLoading}
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 transition hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              {transitLoading ? "Lade Zugverbindungen…" : "Zugverbindungen anzeigen"}
            </button>
            {transitError && (
              <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">{transitError}</p>
            )}
            {transitTotals && (
              <div className="mt-2 rounded-lg border border-brand/30 bg-brand-tint/40 px-3 py-2 text-sm text-slate-700 dark:text-slate-200">
                <span className="font-semibold">Gesamt (ÖPNV):</span>{" "}
                {Math.floor(transitTotals.totalMin / 60)} h {transitTotals.totalMin % 60} min Fahrt
                {transitTotals.transfers > 0 && (
                  <> · {transitTotals.transfers} Umstieg{transitTotals.transfers > 1 ? "e" : ""}</>
                )}
                {transitTotals.hasFare && (
                  <>
                    {" "}
                    · ≈ {transitTotals.totalYen.toLocaleString("de-DE")} ¥
                    {transitTotals.partialFare && (
                      <span className="text-slate-500 dark:text-slate-400"> (Etappen mit Preis)</span>
                    )}
                  </>
                )}
                <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                  Summe über {transitTotals.count} Etappe{transitTotals.count > 1 ? "n" : ""}
                  {route && <> · Strecke {route.distanceKm} km</>}
                  {transitTotals.estimated && <> · geschätzt</>}
                </span>
              </div>
            )}
            {transitLegs.some((l) => l.conn?.estimated) && (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Angaben sind eine Schätzung.
              </p>
            )}
            {transitLegs.length > 0 && (
              <ul className="mt-2 space-y-2">
                {transitLegs.map((leg, i) => (
                  <li
                    key={i}
                    className="rounded-md border border-slate-100 dark:border-slate-800 p-2 text-sm"
                  >
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {i + 1}. {shortLabel(leg.from.label)} → {shortLabel(leg.to.label)}
                    </div>
                    {leg.conn ? (
                      <>
                        <div className="text-slate-700 dark:text-slate-200">
                          {Math.floor(leg.conn.durationMin / 60)} h {leg.conn.durationMin % 60} min ·{" "}
                          {leg.conn.transfers === 0
                            ? "direkt"
                            : `${leg.conn.transfers} Umstieg${leg.conn.transfers > 1 ? "e" : ""}`}
                          {leg.conn.lines.length > 0 && <> · {leg.conn.lines.join(", ")}</>}
                          <span className="ml-1 font-medium">
                            · {leg.conn.fare ? leg.conn.fare.text : "kein Preis vom Anbieter"}
                          </span>
                        </div>
                        {leg.conn.fareYen != null && (
                          <button
                            type="button"
                            onClick={() => addLegToCalculator(leg, i)}
                            disabled={addedLegs[i]}
                            className="mt-1.5 rounded-md border border-slate-300 dark:border-slate-600 px-2 py-1 text-xs text-slate-700 dark:text-slate-200 transition hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-60"
                          >
                            {addedLegs[i] ? "✓ im Rechner" : "+ In Rechner übernehmen"}
                          </button>
                        )}
                      </>
                    ) : (
                      <div className="text-amber-600 dark:text-amber-400">{leg.error}</div>
                    )}
                    <a
                      href={mapsTransitUrl(leg.from, leg.to)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-slate-300 dark:border-slate-600 px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 transition hover:border-brand hover:text-brand"
                    >
                      🗺️ In Google Maps öffnen (ÖPNV)
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {transitLegs.some((l) => l.conn?.fareYen != null) && (
              <div className="mt-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={addAllLegsToCalculator}
                  className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white transition hover:bg-brand-dark"
                >
                  Alle Fahrten in den Rechner
                </button>
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  landet unter Japan · Ausgaben
                </span>
              </div>
            )}
          </div>
        )}

        <p className="text-xs text-slate-400 dark:text-slate-500">
          Karte © OpenStreetMap / Wikimedia (intl. Beschriftung) · Routing OSRM · Orte werden
          lokal in diesem Browser gespeichert.
        </p>
        </div>
      </div>

      {/* Karte — bleibt gemountet; Sichtbarkeit über DIESEN Wrapper, NICHT über die
          className des Leaflet-Containers: React würde die von Leaflet dynamisch
          gesetzten Klassen (u. a. `leaflet-container`) sonst bei jedem Tab-Wechsel
          überschreiben → Hintergrund/Positionierung weg, Karte bleibt leer. */}
      <div className={view === "map" ? "" : "hidden"}>
        <div
          ref={mapEl}
          className="z-0 h-[420px] w-full rounded-lg border border-slate-200 dark:border-slate-700 lg:h-[600px]"
        />
      </div>
      </div>
    </div>
  );
}
