import type { NextRequest, NextResponse } from "next/server";

import { ApiError, badRequest, handle, ok } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";

/**
 * GET /api/v1/geo/weather?lat=&lng=            — Wetter für einen Ort
 * GET /api/v1/geo/weather?points=lat,lng;…     — Wetter für mehrere Orte (ein Request)
 *
 * Die Seitenleiste zeigt fünf Städte; als fünf Einzelaufrufe waren das fünf
 * Function-Invocations samt fünf `requireUser`-Queries pro Seitenaufruf, obwohl sich
 * die Werte 15 Minuten nicht ändern. Die Sammelform bündelt das in einen Request,
 * und der `Cache-Control`-Header lässt den Browser Wiederholungen ganz ohne
 * Invocation bedienen.
 */
export function GET(req: NextRequest) {
  return handle(async () => {
    await requireUser();

    const pointsRaw = req.nextUrl.searchParams.get("points");
    if (pointsRaw) {
      const points = parsePoints(pointsRaw);
      if (points.length === 0) throw badRequest("Ungültige Koordinaten.");
      if (points.length > 10) throw badRequest("Zu viele Orte (max. 10).");
      const list = await Promise.all(points.map((p) => fetchWeather(p.lat, p.lng)));
      return cached(ok(list));
    }

    const lat = Number(req.nextUrl.searchParams.get("lat"));
    const lng = Number(req.nextUrl.searchParams.get("lng"));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw badRequest("lat und lng nötig.");
    return cached(ok(await fetchWeather(lat, lng)));
  });
}

/** `lat,lng;lat,lng;…` → geprüfte Punkte. */
function parsePoints(raw: string): { lat: number; lng: number }[] {
  return raw
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((pair) => {
      const [lat, lng] = pair.split(",").map(Number);
      return { lat, lng };
    })
    .filter(
      (p) =>
        Number.isFinite(p.lat) &&
        Number.isFinite(p.lng) &&
        Math.abs(p.lat) <= 90 &&
        Math.abs(p.lng) <= 180,
    );
}

/** Private Browser-Cachedauer passend zur serverseitigen `revalidate`-Spanne. */
function cached(res: NextResponse): NextResponse {
  res.headers.set("Cache-Control", "private, max-age=900");
  return res;
}

async function fetchWeather(lat: number, lng: number) {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(lat));
    url.searchParams.set("longitude", String(lng));
    url.searchParams.set("current", "temperature_2m,precipitation,weather_code");
    url.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min");
    url.searchParams.set("forecast_days", "5");
    url.searchParams.set("timezone", "auto");

    // Open-Meteo-Antwort je Koordinate 15 Min server-seitig cachen (die Seitenleiste
    // fragt sonst bei jedem Seitenwechsel 5 Städte erneut ab).
    const res = await fetch(url, { next: { revalidate: 900 } });
    if (!res.ok) throw new ApiError(502, "Wetterdienst nicht erreichbar.");
    const data = (await res.json()) as {
      current?: { temperature_2m: number; precipitation: number; weather_code: number };
      daily?: {
        time: string[];
        weather_code: number[];
        temperature_2m_max: number[];
        temperature_2m_min: number[];
      };
    };
    if (!data.current) throw new ApiError(502, "Kein Wetter verfügbar.");

    const info = weatherInfo(data.current.weather_code);
    const daily = (data.daily?.time ?? []).map((date, i) => {
      const di = weatherInfo(data.daily!.weather_code[i]);
      return {
        date,
        max: Math.round(data.daily!.temperature_2m_max[i]),
        min: Math.round(data.daily!.temperature_2m_min[i]),
        code: data.daily!.weather_code[i],
        text: di.text,
        emoji: di.emoji,
      };
    });

    return {
      tempC: Math.round(data.current.temperature_2m),
      precipitation: data.current.precipitation,
      code: data.current.weather_code,
      text: info.text,
      emoji: info.emoji,
      daily,
    };
}

/** WMO-Wettercode → deutsches Label + Emoji. */
function weatherInfo(code: number): { text: string; emoji: string } {
  if (code === 0) return { text: "Klar", emoji: "☀️" };
  if (code === 1) return { text: "Überwiegend klar", emoji: "🌤️" };
  if (code === 2) return { text: "Teils bewölkt", emoji: "⛅" };
  if (code === 3) return { text: "Bewölkt", emoji: "☁️" };
  if (code === 45 || code === 48) return { text: "Nebel", emoji: "🌫️" };
  if (code >= 51 && code <= 57) return { text: "Niesel", emoji: "🌦️" };
  if (code >= 61 && code <= 67) return { text: "Regen", emoji: "🌧️" };
  if (code >= 71 && code <= 77) return { text: "Schnee", emoji: "🌨️" };
  if (code >= 80 && code <= 82) return { text: "Schauer", emoji: "🌦️" };
  if (code === 85 || code === 86) return { text: "Schneeschauer", emoji: "🌨️" };
  if (code >= 95) return { text: "Gewitter", emoji: "⛈️" };
  return { text: "—", emoji: "🌡️" };
}
