// Einträge sind tagesbasiert und werden intern als UTC-Mitternacht gespeichert
// (@db.Date), daher rechnet die Datumsarithmetik unten in UTC.
//
// ⚠️ Hier stand eine **feste App-Zeitzone** (`APP_TIMEZONE`, Europe/Berlin), aus der
// „heute" abgeleitet wurde. Für eine **Reise**-App ist das die falsche Annahme: der
// ganze Zweck ist, dass man sich bewegt. In Japan (UTC+9) liegt Berlin sieben
// Stunden zurück — zwischen Mitternacht und 7:00 Ortszeit lieferte `todayParam()`
// den **Vortag**. Der Tagesplaner öffnete dann auf gestern, und `scheduleReminders`
// verwarf alle Erinnerungen des laufenden Tages, weil `dateISO !== todayISO`.
// Die Uhrzeit der Erinnerung wurde derweil über `setHours` in **Gerätezeit**
// berechnet: eine Hälfte der Logik rechnete japanisch, die andere deutsch.
//
// ⚠️ Im Code stand bereits ein Kommentar über genau diesen Fehler — jemand hatte ihn
// schon einmal von UTC auf Berlin korrigiert. Berlin ist nur ebenso falsch, sobald
// das Flugzeug abgehoben ist. Die einzig richtige Bezugsgröße ist die Zeitzone des
// **Geräts**: sie ist das, was der Reisende auf die Uhr schaut.

export const MONTHS_DE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

export const WEEKDAYS_DE = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

/**
 * Heutiges Datum als `yyyy-MM-dd` — in der Zeitzone des **Geräts**.
 *
 * ⚠️ **Die einzige Quelle für „heute" in dieser App.** Es gab drei wortgleiche
 * Kopien namens `todayStr()` (Dashboard, Flug-Tagesstatus, Flugplaner), die die
 * Gerätezeit benutzten, und diese Funktion, die Berlin benutzte. In Deutschland
 * fällt das nie auf, in Japan sieben Stunden lang jeden Morgen: das Dashboard
 * zeigte den 19., der Tagesplaner den 18.
 *
 * ⚠️ **Nicht im Server-Rendering aufrufen.** Auf dem Server gibt es kein Gerät;
 * dort käme die Zeitzone des Rechenzentrums heraus (auf Vercel UTC), und das
 * server-gerenderte HTML widerspräche dem, was der Client gleich darauf rechnet.
 * Alle heutigen Aufrufer sind Client-Komponenten und rufen es **nach** dem ersten
 * Laden auf (hinter `if (!loaded) return null` bzw. in einem Effekt).
 *
 * Der optionale Parameter existiert nur für die Prüfung (`e2e/today-tz.ts`).
 */
export function todayParam(now: Date = new Date()): string {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Ganze Tage von heute bis `dateStr` (`yyyy-MM-dd`); negativ = Vergangenheit.
 * Lag als private Funktion im Dashboard — gehört neben `todayParam`, weil es
 * dieselbe Vorstellung von „heute" braucht.
 */
export function daysUntil(dateStr: string, now: Date = new Date()): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const target = Date.UTC(y, m - 1, d);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86400000);
}

/**
 * `yyyy-MM-dd` → Date (UTC-Mitternacht). Wirft bei ungültigem Format **oder**
 * bei kalendarisch nicht existierenden Tagen (z. B. 2026-02-31, das JS sonst
 * still auf den 3. März rollt).
 */
export function parseDateParam(param: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(param);
  if (!m) throw new Error(`Ungültiges Datum: ${param}`);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== mo - 1 ||
    date.getUTCDate() !== d
  ) {
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
