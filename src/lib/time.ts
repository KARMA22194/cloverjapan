import { formatInTimeZone } from "date-fns-tz";

// Feste App-Zeitzone (MVP-Annahme). Einträge sind tagesbasiert und werden intern
// als UTC-Mitternacht gespeichert (@db.Date), daher rechnen wir Datumsarithmetik in UTC.
export const APP_TIMEZONE = process.env.APP_TIMEZONE ?? "Europe/Berlin";

export const MONTHS_DE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

export const WEEKDAYS_DE = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

/** Heutiges Datum in der App-Zeitzone als `yyyy-MM-dd`. */
export function todayParam(): string {
  return formatInTimeZone(new Date(), APP_TIMEZONE, "yyyy-MM-dd");
}

/** `yyyy-MM-dd` → Date (UTC-Mitternacht). Wirft bei ungültigem Format. */
export function parseDateParam(param: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(param)) {
    throw new Error(`Ungültiges Datum: ${param}`);
  }
  const date = new Date(`${param}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Ungültiges Datum: ${param}`);
  }
  return date;
}

/** Date → `yyyy-MM-dd` (UTC). */
export function toDateParam(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Tag verschieben (UTC-basiert). */
export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** Halboffener Monatsbereich [start, end) in UTC. `month` ist 1-basiert. */
export function monthRange(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end };
}

/** Halboffener Jahresbereich [start, end) in UTC. */
export function yearRange(year: number): { start: Date; end: Date } {
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year + 1, 0, 1));
  return { start, end };
}

/** Anzahl Tage in einem Monat (1-basiert). */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Minuten → dezimale Stunden (z. B. 450 → 7.5). */
export function minutesToHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

/** Dezimale Stunden → Minuten (z. B. 7.5 → 450). */
export function hoursToMinutes(hours: number): number {
  return Math.round(hours * 60);
}

/** Minuten → Anzeige "7:30 h" (leer wenn 0). */
export function formatMinutes(minutes: number): string {
  if (!minutes) return "–";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, "0")} h`;
}

/** Formatiert ein UTC-Datum als deutschsprachiges Label, z. B. "Mo, 08.07.2026". */
export function formatDateLong(date: Date): string {
  const weekday = WEEKDAYS_DE[date.getUTCDay()];
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = date.getUTCFullYear();
  return `${weekday}, ${dd}.${mm}.${yyyy}`;
}
