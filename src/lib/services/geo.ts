const USER_AGENT = "TimeTracker-Reiseplaner/1.0 (self-hosted)";

export interface GeoHit {
  label: string;
  lat: number;
  lng: number;
}

/**
 * Löst Freitext zu einem Ort in Japan auf (Nominatim). Für die Übernahme von
 * Tagesplaner-Aufgaben in den Reiseplaner: klappt die Auflösung, ist es ein Ort.
 * Server-seitig (Container-Proxy-CA, sauberer User-Agent). null, wenn kein Treffer.
 */
export async function geocodeJapan(text: string): Promise<GeoHit | null> {
  const clean = text
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[#@]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length < 2) return null;

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", clean);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "jp");
  url.searchParams.set("accept-language", "de,en,ja");

  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) return null;
  const data = (await res.json()) as { display_name: string; lat: string; lon: string }[];
  if (!data.length) return null;
  return { label: data[0].display_name, lat: Number(data[0].lat), lng: Number(data[0].lon) };
}
