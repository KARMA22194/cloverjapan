// Katalog der sammelbaren „Eki-Stamps" (Stationen, Tempel, Sehenswürdigkeiten).
// Reine Daten + Geo-Helfer → von Server-Route UND Client-Komponente nutzbar.

export interface StampSpot {
  key: string;
  name: string;
  area: string;
  emoji: string;
  lat: number;
  lng: number;
  radiusM: number; // Umkreis, in dem der Stempel freigeschaltet wird
}

export const STAMP_CATALOG: StampSpot[] = [
  { key: "shibuya", name: "Shibuya Station", area: "Tokio", emoji: "🚉", lat: 35.658, lng: 139.7016, radiusM: 700 },
  { key: "tokyo-st", name: "Tokyo Station", area: "Tokio", emoji: "🚅", lat: 35.6812, lng: 139.7671, radiusM: 700 },
  { key: "teamlab", name: "teamLab Planets", area: "Toyosu, Tokio", emoji: "🎨", lat: 35.6493, lng: 139.7906, radiusM: 500 },
  { key: "sensoji", name: "Sensō-ji", area: "Asakusa, Tokio", emoji: "🏮", lat: 35.7148, lng: 139.7967, radiusM: 600 },
  { key: "meiji", name: "Meiji-Schrein", area: "Tokio", emoji: "🌳", lat: 35.6764, lng: 139.6993, radiusM: 900 },
  { key: "fuji", name: "Fuji-san", area: "Präfektur Yamanashi", emoji: "🗻", lat: 35.3606, lng: 138.7274, radiusM: 6000 },
  { key: "kyoto-st", name: "Kyoto Station", area: "Kyoto", emoji: "🚉", lat: 34.9858, lng: 135.7588, radiusM: 700 },
  { key: "fushimi", name: "Fushimi Inari-Taisha", area: "Kyoto", emoji: "⛩️", lat: 34.9671, lng: 135.7727, radiusM: 800 },
  { key: "kiyomizu", name: "Kiyomizu-dera", area: "Kyoto", emoji: "🏯", lat: 34.9949, lng: 135.7851, radiusM: 600 },
  { key: "osaka-jo", name: "Ōsaka-jō", area: "Osaka", emoji: "🏯", lat: 34.6873, lng: 135.5259, radiusM: 800 },
  { key: "dotonbori", name: "Dōtonbori", area: "Osaka", emoji: "🍜", lat: 34.6687, lng: 135.5013, radiusM: 500 },
  { key: "nara", name: "Nara-Park", area: "Nara", emoji: "🦌", lat: 34.6851, lng: 135.843, radiusM: 1500 },
  { key: "miyajima", name: "Itsukushima-Schrein", area: "Miyajima", emoji: "⛩️", lat: 34.296, lng: 132.3199, radiusM: 800 },
  { key: "hiroshima", name: "Friedenspark", area: "Hiroshima", emoji: "🕊️", lat: 34.3955, lng: 132.4536, radiusM: 700 },
  { key: "sapporo", name: "Sapporo Station", area: "Hokkaidō", emoji: "❄️", lat: 43.0686, lng: 141.3508, radiusM: 700 },
  { key: "fukuoka", name: "Hakata Station", area: "Fukuoka", emoji: "🍜", lat: 33.5902, lng: 130.4207, radiusM: 700 },
];

const stampByKey = new Map(STAMP_CATALOG.map((s) => [s.key, s] as const));
export const getStamp = (key: string): StampSpot | undefined => stampByKey.get(key);

/** Entfernung in Metern (Haversine). */
export function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Nächstgelegener Stempel-Ort im Umkreis, sonst null (mit Distanz zum Feedback). */
export function findStampAt(lat: number, lng: number): { spot: StampSpot; distM: number } | null {
  let best: { spot: StampSpot; distM: number } | null = null;
  for (const spot of STAMP_CATALOG) {
    const distM = distanceM(lat, lng, spot.lat, spot.lng);
    if (distM <= spot.radiusM && (!best || distM < best.distM)) best = { spot, distM };
  }
  return best;
}
