import type { NextRequest } from "next/server";

import { ApiError, badRequest, handle, ok } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";

/**
 * GET /api/v1/geo/weather?lat=&lng= — aktuelles Wetter via Open-Meteo (keyfrei).
 */
export function GET(req: NextRequest) {
  return handle(async () => {
    await requireUser();
    const lat = Number(req.nextUrl.searchParams.get("lat"));
    const lng = Number(req.nextUrl.searchParams.get("lng"));
    if (Number.isNaN(lat) || Number.isNaN(lng)) throw badRequest("lat und lng nötig.");

    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(lat));
    url.searchParams.set("longitude", String(lng));
    url.searchParams.set("current", "temperature_2m,precipitation,weather_code");
    url.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min");
    url.searchParams.set("forecast_days", "5");
    url.searchParams.set("timezone", "auto");

    const res = await fetch(url, { cache: "no-store" });
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

    return ok({
      tempC: Math.round(data.current.temperature_2m),
      precipitation: data.current.precipitation,
      code: data.current.weather_code,
      text: info.text,
      emoji: info.emoji,
      daily,
    });
  });
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
