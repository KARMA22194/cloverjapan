"use client";

import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";

import { api } from "@/lib/api/client";
import { addExpenseItem } from "@/lib/expenses";
import { deDate } from "@/lib/format";

interface Stop {
  id: string;
  label: string;
  lat: number;
  lng: number;
  date?: string | null;
  by?: string;
}

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
 * Deep-Link nach Google Maps (keyfrei). Sucht den Ortsnamen an genau diesen
 * Koordinaten (`/maps/search/<Name>/@lat,lng,zoom`) → Maps öffnet bei eindeutigen
 * POIs die volle Ortskarte und bleibt durch die Koordinaten an der richtigen Stelle.
 */
function mapsPlaceUrl(lat: number, lng: number, label: string): string {
  const name = label.split(",")[0].trim();
  return `https://www.google.com/maps/search/${encodeURIComponent(name)}/@${lat},${lng},16z`;
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

/** Route-Polylinie auf höchstens `max` Stützpunkte ausdünnen (kleine Overpass-Anfrage). */
function sampleGeometry(geom: [number, number][], max = 40): [number, number][] {
  if (geom.length <= max) return geom;
  const step = Math.ceil(geom.length / max);
  const out = geom.filter((_, i) => i % step === 0);
  const last = geom[geom.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

export function TripPlanner() {
  const mapEl = useRef<HTMLDivElement>(null);
  const LRef = useRef<typeof Leaflet | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const markersRef = useRef<Leaflet.LayerGroup | null>(null);
  const routeRef = useRef<Leaflet.Polyline | null>(null);
  const konbiniRef = useRef<Leaflet.LayerGroup | null>(null);

  const [stops, setStops] = useState<Stop[]>([]);
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paste, setPaste] = useState("");
  const [pastePending, setPastePending] = useState(false);
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

  const [showKonbini, setShowKonbini] = useState(false);
  const [konbinis, setKonbinis] = useState<Konbini[]>([]);
  const [konbiniLoading, setKonbiniLoading] = useState(false);
  const [konbiniError, setKonbiniError] = useState<string | null>(null);

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

  // Komplette Stopp-Liste speichern (PUT-Replace); Antwort enthält den Ersteller (by).
  function persistStops(next: Stop[]) {
    api
      .put<Stop[]>("/api/v1/trip-stops", {
        stops: next.map((s) => ({
          id: s.id,
          label: s.label,
          lat: s.lat,
          lng: s.lng,
          date: s.date ?? null,
        })),
      })
      .then(setStops)
      .catch(() => {});
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
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        subdomains: "abcd",
        attribution: "&copy; OpenStreetMap-Mitwirkende &copy; CARTO",
        maxZoom: 20,
      }).addTo(map);
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
    } else if (stops.length > 0) {
      const group = L.featureGroup(stops.map((s) => L.marker([s.lat, s.lng])));
      map.fitBounds(group.getBounds(), { padding: [40, 40], maxZoom: 9 });
    } else {
      map.setView(JAPAN_CENTER, 5);
    }
  }, [stops, hotels, route, ready]);

  // Konbinis entlang der berechneten Route laden (nur wenn Schalter an + Route da).
  useEffect(() => {
    if (!showKonbini || !route) {
      setKonbinis([]);
      setKonbiniError(null);
      return;
    }
    let cancelled = false;
    setKonbiniLoading(true);
    setKonbiniError(null);
    const pts = sampleGeometry(route.geometry)
      .map(([lat, lng]) => `${lat},${lng}`)
      .join(";");
    api
      .get<{ stores: Konbini[] }>(`/api/v1/geo/konbini?points=${encodeURIComponent(pts)}`)
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
  }, [showKonbini, route]);

  // Konbini-Marker rendern (eigener Layer → beeinflusst Stopp-/Hotel-Marker nicht).
  useEffect(() => {
    const L = LRef.current;
    const layer = konbiniRef.current;
    if (!L || !layer) return;
    layer.clearLayers();
    konbinis.forEach((k) => {
      // XSS-sicher: Popup als DOM-Element mit textContent (kein HTML-String).
      const popupEl = document.createElement("div");
      popupEl.textContent =
        k.name && k.name !== k.brand ? `🏪 ${k.brand} · ${k.name}` : `🏪 ${k.brand}`;
      L.marker([k.lat, k.lng], { icon: konbiniIcon(L, k.brand) })
        .addTo(layer)
        .bindPopup(popupEl);
    });
  }, [konbinis, ready]);

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
      const next = [...stops, { id: crypto.randomUUID(), label: r.label, lat: r.lat, lng: r.lng }];
      setStops(next);
      persistStops(next);
      setQuery("");
      setRoute(null); // Route veraltet, sobald sich die Stopps ändern
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler bei der Ortssuche.");
    } finally {
      setAdding(false);
    }
  }

  async function addFromPaste(e: React.FormEvent) {
    e.preventDefault();
    const q = paste.trim();
    if (q.length < 2) return;
    setPastePending(true);
    setError(null);
    try {
      const r = await api.get<GeoResult>(`/api/v1/geo/resolve?q=${encodeURIComponent(q)}`);
      const next = [...stops, { id: crypto.randomUUID(), label: r.label, lat: r.lat, lng: r.lng }];
      setStops(next);
      persistStops(next);
      setPaste("");
      setRoute(null);
      setTransitLegs([]);
      setTransitError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Konnte keinen Ort ermitteln.");
    } finally {
      setPastePending(false);
    }
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

  // Stopp in der Liste nach oben/unten verschieben (manuelle Reihenfolge).
  function moveStop(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= stops.length) return;
    const next = [...stops];
    [next[index], next[j]] = [next[j], next[index]];
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
    if (stops.length < 2) return;
    setRouting(true);
    setError(null);
    setTransitLegs([]);
    setTransitError(null);
    try {
      const points = stops.map((s) => `${s.lat},${s.lng}`).join(";");
      const data = await api.get<RouteInfo>(
        `/api/v1/geo/route?points=${encodeURIComponent(points)}`,
      );
      // Stopps in die optimale Reihenfolge bringen (passt zur gezeichneten Route).
      const ordered = data.order.map((i) => stops[i]).filter(Boolean);
      setStops(ordered);
      persistStops(ordered);
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
    if (stops.length < 2) return;
    setTransitLoading(true);
    setTransitError(null);
    setAddedLegs({});
    try {
      const pairs: { from: Stop; to: Stop }[] = [];
      for (let i = 0; i < stops.length - 1; i++) {
        pairs.push({ from: stops[i], to: stops[i + 1] });
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

        {/* Ort aus Link oder Text (z. B. Google-Maps-Link oder Caption) einfügen. */}
        <form
          onSubmit={addFromPaste}
          className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3"
        >
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
            Ort aus Link/Text einfügen
          </label>
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={2}
            placeholder="Google-Maps-Link oder Ortsname/Caption (z. B. „Fushimi Inari“)"
            className="w-full resize-none rounded-md border border-slate-300 dark:border-slate-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-xs text-slate-400 dark:text-slate-500">
              Maps-Link = exakt · Text/Caption = geschätzt
            </span>
            <button
              type="submit"
              disabled={pastePending || paste.trim().length < 2}
              className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pastePending ? "…" : "Einfügen"}
            </button>
          </div>
        </form>

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
                      <a
                        href={mapsPlaceUrl(h.lat, h.lng, h.label)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate text-sm text-slate-700 hover:text-brand hover:underline dark:text-slate-200 dark:hover:text-brand"
                        title={`${h.label} — in Google Maps öffnen`}
                      >
                        {shortLabel(h.label)}
                      </a>
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

        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-3 py-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Stopps ({stops.length})
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
            <ol>
              {stops.map((s, i) => (
                <li
                  key={s.id}
                  className="border-b border-slate-100 dark:border-slate-800 px-3 py-2 last:border-b-0"
                >
                  {/* Zeile 1: Nummer, Name/„von", Löschen */}
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <a
                        href={mapsPlaceUrl(s.lat, s.lng, s.label)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate text-sm text-slate-700 hover:text-brand hover:underline dark:text-slate-200 dark:hover:text-brand"
                        title={`${s.label} — in Google Maps öffnen`}
                      >
                        {shortLabel(s.label)}
                      </a>
                      {s.by && (
                        <p className="truncate text-[11px] text-slate-400 dark:text-slate-500">
                          von {s.by}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col leading-none">
                      <button
                        type="button"
                        onClick={() => moveStop(i, -1)}
                        disabled={i === 0}
                        aria-label={`„${shortLabel(s.label)}" nach oben`}
                        className="rounded px-1 text-[10px] text-slate-400 transition hover:text-brand disabled:opacity-30 dark:text-slate-500"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => moveStop(i, 1)}
                        disabled={i === stops.length - 1}
                        aria-label={`„${shortLabel(s.label)}" nach unten`}
                        className="rounded px-1 text-[10px] text-slate-400 transition hover:text-brand disabled:opacity-30 dark:text-slate-500"
                      >
                        ▼
                      </button>
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
            <span className="font-semibold">Beste Route (Auto):</span> {route.distanceKm} km ·{" "}
            {Math.floor(route.durationMin / 60)} h {route.durationMin % 60} min Fahrt
            <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
              Reihenfolge optimiert (ab dem ersten Ort).
            </span>
          </div>
        )}

        {/* Konbini-Radar: Convenience-Stores entlang der Route (keyfrei via OSM/Overpass) */}
        {route && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showKonbini}
                onChange={(e) => setShowKonbini(e.target.checked)}
                className="h-4 w-4 accent-[#009bc9]"
              />
              <span className="font-medium text-slate-700 dark:text-slate-200">
                🏪 Konbinis entlang der Route
              </span>
              {konbiniLoading && <span className="text-xs text-slate-400">lädt…</span>}
            </label>

            {showKonbini && !konbiniLoading && !konbiniError && (
              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                {konbinis.length > 0
                  ? `${konbinis.length} Läden im Umkreis von ~120 m entlang der Route.`
                  : "Keine Konbinis direkt an dieser Route gefunden."}
              </p>
            )}
            {konbiniError && (
              <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{konbiniError}</p>
            )}

            {showKonbini && konbinis.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                {(["7-Eleven", "Lawson", "FamilyMart"] as const).map((b) => (
                  <span key={b} className="inline-flex items-center gap-1">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: KONBINI_STYLE[b].color }}
                    />
                    {b}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

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

      {/* Karte */}
      <div
        ref={mapEl}
        className="z-0 h-[420px] w-full rounded-lg border border-slate-200 dark:border-slate-700 lg:h-[600px]"
      />
    </div>
  );
}
