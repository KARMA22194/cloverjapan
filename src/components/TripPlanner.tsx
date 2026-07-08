"use client";

import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";

import { api } from "@/lib/api/client";

interface Stop {
  id: string;
  label: string;
  lat: number;
  lng: number;
}

interface GeoResult {
  label: string;
  lat: number;
  lng: number;
}

interface RouteInfo {
  geometry: [number, number][];
  distanceKm: number;
  durationMin: number;
  order: number[];
}

const STORAGE_KEY = "reiseplaner-japan-stops";
const JAPAN_CENTER: [number, number] = [36.2, 138.25];

/** Kurzer, lesbarer Ortsname aus dem langen Nominatim-display_name. */
function shortLabel(label: string): string {
  return label.split(",").slice(0, 2).join(", ");
}

function pinIcon(L: typeof Leaflet, n: number): Leaflet.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:9999px;background:#009bc9;color:#fff;font-size:12px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">${n}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

export function TripPlanner() {
  const mapEl = useRef<HTMLDivElement>(null);
  const LRef = useRef<typeof Leaflet | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const markersRef = useRef<Leaflet.LayerGroup | null>(null);
  const routeRef = useRef<Leaflet.Polyline | null>(null);

  const [stops, setStops] = useState<Stop[]>([]);
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [route, setRoute] = useState<RouteInfo | null>(null);
  const [routing, setRouting] = useState(false);

  // localStorage laden (v1-Persistenz)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setStops(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  // localStorage speichern
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stops));
    } catch {
      /* ignore */
    }
  }, [stops]);

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
      // Wikimedia „osm-intl": internationale/lateinische Beschriftungen
      // (z. B. „Tokyo" statt „東京") — keyfrei. (Fallback wäre Esri World Street Map.)
      L.tileLayer("https://maps.wikimedia.org/osm-intl/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap-Mitwirkende · Wikimedia",
        maxZoom: 19,
      }).addTo(map);
      markersRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setReady(true);
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markersRef.current = null;
        routeRef.current = null;
      }
    };
  }, []);

  // Marker + Route neu zeichnen, wenn sich Stopps/Route ändern.
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const layer = markersRef.current;
    if (!L || !map || !layer) return;

    layer.clearLayers();
    stops.forEach((s, i) => {
      L.marker([s.lat, s.lng], { icon: pinIcon(L, i + 1) })
        .addTo(layer)
        .bindPopup(`${i + 1}. ${shortLabel(s.label)}`);
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
    } else if (stops.length > 0) {
      const group = L.featureGroup(stops.map((s) => L.marker([s.lat, s.lng])));
      map.fitBounds(group.getBounds(), { padding: [40, 40], maxZoom: 9 });
    } else {
      map.setView(JAPAN_CENTER, 5);
    }
  }, [stops, route, ready]);

  async function addStop(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 2) return;
    setAdding(true);
    setError(null);
    try {
      const results = await api.get<GeoResult[]>(
        `/api/v1/geo/search?q=${encodeURIComponent(q)}`,
      );
      if (results.length === 0) {
        setError(`Kein Ort in Japan gefunden für „${q}".`);
        return;
      }
      const r = results[0];
      setStops((prev) => [
        ...prev,
        { id: crypto.randomUUID(), label: r.label, lat: r.lat, lng: r.lng },
      ]);
      setQuery("");
      setRoute(null); // Route veraltet, sobald sich die Stopps ändern
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler bei der Ortssuche.");
    } finally {
      setAdding(false);
    }
  }

  function removeStop(id: string) {
    setStops((prev) => prev.filter((s) => s.id !== id));
    setRoute(null);
  }

  function clearAll() {
    setStops([]);
    setRoute(null);
  }

  async function computeRoute() {
    if (stops.length < 2) return;
    setRouting(true);
    setError(null);
    try {
      const points = stops.map((s) => `${s.lat},${s.lng}`).join(";");
      const data = await api.get<RouteInfo>(
        `/api/v1/geo/route?points=${encodeURIComponent(points)}`,
      );
      // Stopps in die optimale Reihenfolge bringen (passt zur gezeichneten Route).
      const ordered = data.order.map((i) => stops[i]).filter(Boolean);
      setStops(ordered);
      setRoute(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Route nicht berechenbar.");
    } finally {
      setRouting(false);
    }
  }

  const inputClass =
    "w-full rounded-md border border-slate-300 dark:border-slate-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-brand";

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(280px,1fr)_2fr]">
      {/* Steuerung: Orte eingeben + Liste */}
      <div className="flex flex-col gap-3">
        <form
          onSubmit={addStop}
          className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3"
        >
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
            Ort in Japan
          </label>
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="z. B. Tokyo Tower, Kyoto, Osaka Castle"
              className={inputClass}
            />
            <button
              type="submit"
              disabled={adding || query.trim().length < 2}
              className="shrink-0 rounded-md bg-brand px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {adding ? "…" : "Hinzufügen"}
            </button>
          </div>
          {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
        </form>

        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-3 py-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Stopps ({stops.length})
            </span>
            {stops.length > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="text-xs text-slate-500 transition hover:text-red-600 dark:text-slate-400"
              >
                Alle löschen
              </button>
            )}
          </div>
          {stops.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-slate-400 dark:text-slate-500">
              Noch keine Orte. Gib oben einen Ort ein.
            </p>
          ) : (
            <ol>
              {stops.map((s, i) => (
                <li
                  key={s.id}
                  className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 px-3 py-2 last:border-b-0"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-200" title={s.label}>
                    {shortLabel(s.label)}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeStop(s.id)}
                    className="shrink-0 rounded px-2 py-1 text-xs text-red-600 transition hover:bg-red-500/10 dark:text-red-400"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>

        <button
          type="button"
          onClick={computeRoute}
          disabled={routing || stops.length < 2}
          className="rounded-md bg-brand-dark px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {routing ? "Berechne beste Route…" : "Beste Route berechnen"}
        </button>

        {route && (
          <div className="rounded-lg border border-brand/30 bg-brand-tint/40 px-3 py-2 text-sm text-slate-700 dark:text-slate-200">
            <span className="font-semibold">Beste Route:</span> {route.distanceKm} km ·{" "}
            {Math.floor(route.durationMin / 60)} h {route.durationMin % 60} min Fahrt
            <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
              Reihenfolge optimiert (ab dem ersten Ort).
            </span>
          </div>
        )}

        <p className="text-xs text-slate-400 dark:text-slate-500">
          Karte © OpenStreetMap / Wikimedia (intl. Beschriftung) · Routing OSRM · Orte werden
          lokal in diesem Browser gespeichert.
        </p>
      </div>

      {/* Karte */}
      <div
        ref={mapEl}
        className="z-0 h-[420px] w-full rounded-lg border border-slate-200 dark:border-slate-700 lg:h-[600px]"
      />
    </div>
  );
}
