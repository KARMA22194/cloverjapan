// Feste Reise-Städte in Japan (für die Wetter-Ansicht).
export interface City {
  key: string;
  name: string;
  lat: number;
  lng: number;
}

export const JP_CITIES: City[] = [
  { key: "tokyo", name: "Tokio", lat: 35.6762, lng: 139.6503 },
  { key: "kyoto", name: "Kyoto", lat: 35.0116, lng: 135.7681 },
  { key: "osaka", name: "Osaka", lat: 34.6937, lng: 135.5023 },
  { key: "sapporo", name: "Sapporo", lat: 43.0618, lng: 141.3545 },
  { key: "fukuoka", name: "Fukuoka", lat: 33.5904, lng: 130.4017 },
];

export interface DailyForecast {
  date: string; // YYYY-MM-DD
  max: number;
  min: number;
  code: number;
  text: string;
  emoji: string;
}

export interface Weather {
  tempC: number;
  precipitation: number;
  code: number;
  text: string;
  emoji: string;
  daily: DailyForecast[];
}
