// Gemeinsame Formatter & Datumshilfen (client- und serverseitig nutzbar).

export const yenFmt = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});

export const eurFmt = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

/** "YYYY-MM-DD" → "DD.MM.YYYY". */
export function deDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}.${m}.${y}`;
}
