"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "@/lib/api/client";
import { eurFmt, yenFmt } from "@/lib/format";
import { FlightLiveStatus } from "@/components/FlightLiveStatus";
import { buttonClasses } from "@/components/ui/Button";
import { fieldClasses } from "@/components/ui/Field";

/** Heutiges Datum als YYYY-MM-DD (lokal). */
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface Flight {
  id: string;
  flightNumber: string;
  airline: string;
  fromCode: string;
  fromName: string;
  toCode: string;
  toName: string;
  departure: string | null;
  arrival: string | null;
  durationMin: number | null;
  bookingRef: string;
  seats: string;
  priceYen: number | null;
  by?: string;
}

// Wichtige japanische Flughäfen → Richtung erkennen (Hin-/Rückflug).
const JP_AIRPORTS = new Set([
  "HND", "NRT", "KIX", "ITM", "CTS", "FUK", "NGO", "OKA", "KOJ", "SDJ",
  "HIJ", "KMJ", "KMQ", "OKJ", "TAK", "MYJ", "AXT", "AOJ", "KIJ", "ISG",
]);
function directionLabel(fromCode: string, toCode: string): string | null {
  const f = JP_AIRPORTS.has(fromCode.toUpperCase());
  const t = JP_AIRPORTS.has(toCode.toUpperCase());
  if (t && !f) return "Hinflug";
  if (f && !t) return "Rückflug";
  return null;
}
function fmtDuration(min: number | null): string | null {
  if (!min || min <= 0) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h} h${m ? ` ${m} min` : ""}`;
}
/** Kalendertage zwischen Ab- und Ankunft (für „+1 Tag") aus den UTC-naiven ISO-Werten. */
function overnightDays(dep: string | null, arr: string | null): number {
  if (!dep || !arr) return 0;
  const d = dep.slice(0, 10);
  const a = arr.slice(0, 10);
  if (a <= d) return 0;
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`)) / 86400000);
}

type Currency = "EUR" | "JPY";

const FALLBACK_RATE = 0.0058; // JPY→EUR
// Gespeicherte Zeit ist Wall-Clock als UTC-naiv → immer in UTC formatieren (kein Verschieben).
const dtFmt = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

const emptyForm = {
  flightNumber: "",
  airline: "",
  fromCode: "",
  fromName: "",
  toCode: "",
  toName: "",
  departure: "", // datetime-local "YYYY-MM-DDTHH:MM"
  arrival: "",
  bookingRef: "",
  seats: "",
};

/** ISO "…T17:20:00.000Z" → datetime-local "…T17:20". */
const isoToLocal = (iso: string | null) => (iso ? iso.slice(0, 16) : "");
/** datetime-local "…T17:20" → ISO "…T17:20:00Z" (als UTC-naiv gespeichert). */
const localToIso = (v: string) => (v ? `${v}:00Z` : null);
const fmtDate = (iso: string | null) => (iso ? dtFmt.format(new Date(iso)) : "—");

export function FlightPlanner() {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [rate, setRate] = useState<number>(FALLBACK_RATE);
  const [form, setForm] = useState({ ...emptyForm });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [lookupDate, setLookupDate] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState<Currency>("EUR");
  // Echte Flugdauer (nur aus dem Auto-Abruf; bei manueller Eingabe null).
  const [durationMin, setDurationMin] = useState<number | null>(null);
  const [lookupPending, setLookupPending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  // Aufgeklappte Live-Status-Panels; am Abreisetag wird ein Flug automatisch geöffnet.
  const [liveOpen, setLiveOpen] = useState<Set<string>>(new Set());
  const seededLive = useRef<Set<string>>(new Set());

  const reload = useCallback(() => {
    return api
      .get<Flight[]>("/api/v1/flights")
      .then(setFlights)
      .catch(() => {});
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // Flüge, die heute abfliegen, einmalig automatisch aufklappen (Live-Status).
  useEffect(() => {
    const today = todayStr();
    const toOpen = flights.filter(
      (f) => f.flightNumber && f.departure?.slice(0, 10) === today && !seededLive.current.has(f.id),
    );
    if (toOpen.length === 0) return;
    // Ref-Mutation im Effekt-Body (nicht im setState-Updater → Strict-Mode-sicher).
    toOpen.forEach((f) => seededLive.current.add(f.id));
    setLiveOpen((prev) => {
      const next = new Set(prev);
      toOpen.forEach((f) => next.add(f.id));
      return next;
    });
  }, [flights]);

  function toggleLive(id: string) {
    setLiveOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  useEffect(() => {
    api
      .get<{ rate: number }>("/api/v1/fx/rate?from=JPY&to=EUR")
      .then((r) => setRate(r.rate))
      .catch(() => {});
  }, []);

  const set = (k: keyof typeof emptyForm, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function resetForm() {
    setForm({ ...emptyForm });
    setPrice("");
    setCurrency("EUR");
    setDurationMin(null);
    setLookupDate("");
    setEditingId(null);
    setError(null);
  }

  function startEdit(f: Flight) {
    setEditingId(f.id);
    setForm({
      flightNumber: f.flightNumber,
      airline: f.airline,
      fromCode: f.fromCode,
      fromName: f.fromName,
      toCode: f.toCode,
      toName: f.toName,
      departure: isoToLocal(f.departure),
      arrival: isoToLocal(f.arrival),
      bookingRef: f.bookingRef,
      seats: f.seats ?? "",
    });
    setDurationMin(f.durationMin);
    // Bereits gespeicherter Preis ist in Yen → zum Bearbeiten in ¥ anzeigen.
    setPrice(f.priceYen ? String(f.priceYen) : "");
    setCurrency("JPY");
    setLookupDate(isoToLocal(f.departure).slice(0, 10));
    setInfo(null);
    setError(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function runLookup() {
    setError(null);
    setInfo(null);
    const number = form.flightNumber.trim();
    if (!number || !lookupDate) {
      setError("Flugnummer und Datum für den Abruf angeben.");
      return;
    }
    setLookupPending(true);
    try {
      const d = lookupDate.slice(0, 10);
      const r = await api.get<{
        airline: string;
        fromCode: string;
        fromName: string;
        toCode: string;
        toName: string;
        departure: string | null;
        arrival: string | null;
        durationMin: number | null;
      }>(`/api/v1/flights/lookup?number=${encodeURIComponent(number)}&date=${d}`);
      setForm((f) => ({
        ...f,
        airline: r.airline || f.airline,
        fromCode: r.fromCode || f.fromCode,
        fromName: r.fromName || f.fromName,
        toCode: r.toCode || f.toCode,
        toName: r.toName || f.toName,
        departure: isoToLocal(r.departure) || f.departure,
        arrival: isoToLocal(r.arrival) || f.arrival,
      }));
      setDurationMin(r.durationMin ?? null);
      setInfo("Flugdaten übernommen — Preis ergänzen und speichern.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Abruf fehlgeschlagen.");
    } finally {
      setLookupPending(false);
    }
  }

  function priceToYen(): number | null {
    const n = Number(price.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return null;
    if (currency === "JPY") return Math.round(n);
    return rate ? Math.round(n / rate) : null; // EUR → Yen
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.flightNumber.trim()) {
      setError("Flugnummer fehlt.");
      return;
    }
    const priceYen = priceToYen();
    const payload = {
      ...form,
      departure: localToIso(form.departure),
      arrival: localToIso(form.arrival),
      durationMin,
      priceYen,
    };
    setSaving(true);
    try {
      if (editingId) {
        await api.patch(`/api/v1/flights/${editingId}`, payload);
      } else {
        await api.post("/api/v1/flights", payload);
      }
      await reload();
      resetForm();
      setInfo("Gespeichert.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  function remove(id: string) {
    setFlights((prev) => prev.filter((f) => f.id !== id));
    api.delete(`/api/v1/flights/${id}`).catch(() => reload());
  }

  const yenPreview = priceToYen();
  const inputClass =
    fieldClasses;
  const labelClass = "mb-1 block text-xs font-medium text-ink-muted";

  return (
    <div className="space-y-6">
      {/* Formular */}
      <form
        onSubmit={save}
        className="space-y-3 rounded-card border border-hairline bg-surface shadow-card p-4"
      >
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-32">
            <label htmlFor="flug-flugnummer" className={labelClass}>Flugnummer</label>
            <input id="flug-flugnummer"
              value={form.flightNumber}
              onChange={(e) => set("flightNumber", e.target.value)}
              placeholder="LH716"
              className={inputClass}
            />
          </div>
          <div className="w-40">
            <label htmlFor="flug-datum" className={labelClass}>Datum (für Abruf)</label>
            <input id="flug-datum"
              type="date"
              value={lookupDate}
              onChange={(e) => setLookupDate(e.target.value)}
              className={inputClass}
            />
          </div>
          <button
            type="button"
            onClick={runLookup}
            disabled={lookupPending}
            className="rounded-md border border-brand/50 bg-brand/10 px-3 py-2 text-sm font-medium text-brand transition hover:bg-brand/20 disabled:opacity-60"
          >
            {lookupPending ? "Lädt…" : "✈ Flugdaten holen"}
          </button>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label htmlFor="flug-airline" className={labelClass}>Airline</label>
            <input id="flug-airline" value={form.airline} onChange={(e) => set("airline", e.target.value)} placeholder="Lufthansa" className={inputClass} />
          </div>
          <div>
            <label htmlFor="flug-buchungsnummer" className={labelClass}>Buchungsnummer</label>
            <input id="flug-buchungsnummer" value={form.bookingRef} onChange={(e) => set("bookingRef", e.target.value)} placeholder="ABC123" className={inputClass} />
          </div>
          <div>
            <label htmlFor="flug-sitzplaetze" className={labelClass}>Sitzplätze</label>
            <input id="flug-sitzplaetze" value={form.seats} onChange={(e) => set("seats", e.target.value)} placeholder="z. B. 32A, 32B" className={inputClass} />
          </div>
          <div className="flex gap-2">
            <div className="w-20">
              <label htmlFor="flug-ab" className={labelClass}>Ab (IATA)</label>
              <input id="flug-ab" value={form.fromCode} onChange={(e) => set("fromCode", e.target.value)} placeholder="FRA" className={inputClass} />
            </div>
            <div className="flex-1">
              <label htmlFor="flug-abflug-ort" className={labelClass}>Abflug-Ort</label>
              <input id="flug-abflug-ort" value={form.fromName} onChange={(e) => set("fromName", e.target.value)} placeholder="Frankfurt" className={inputClass} />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="w-20">
              <label htmlFor="flug-an" className={labelClass}>An (IATA)</label>
              <input id="flug-an" value={form.toCode} onChange={(e) => set("toCode", e.target.value)} placeholder="HND" className={inputClass} />
            </div>
            <div className="flex-1">
              <label htmlFor="flug-ankunfts-ort" className={labelClass}>Ankunfts-Ort</label>
              <input id="flug-ankunfts-ort" value={form.toName} onChange={(e) => set("toName", e.target.value)} placeholder="Tokyo Haneda" className={inputClass} />
            </div>
          </div>
          <div>
            <label htmlFor="flug-abflug" className={labelClass}>Abflug (Datum/Zeit)</label>
            <input id="flug-abflug" type="datetime-local" value={form.departure} onChange={(e) => set("departure", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="flug-ankunft" className={labelClass}>Ankunft (Datum/Zeit)</label>
            <input id="flug-ankunft" type="datetime-local" value={form.arrival} onChange={(e) => set("arrival", e.target.value)} className={inputClass} />
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2 border-t border-hairline pt-3">
          <div className="w-32">
            <label htmlFor="flug-preis" className={labelClass}>Preis</label>
            <input id="flug-preis" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="z. B. 780" className={inputClass} />
          </div>
          <div>
            <label htmlFor="flug-waehrung" className={labelClass}>Währung</label>
            <select id="flug-waehrung"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as Currency)}
              className={inputClass}
            >
              <option value="EUR">Euro (€)</option>
              <option value="JPY">Yen (¥)</option>
            </select>
          </div>
          <p className="pb-2 text-xs text-ink-muted">
            {yenPreview
              ? `≈ ${yenFmt.format(yenPreview)} · ${eurFmt.format(yenPreview * rate)} — landet im Ausgabenrechner`
              : "optional — fließt als Ausgabe (Transport) in den Rechner"}
          </p>
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {info && <p className="text-sm text-emerald-600 dark:text-emerald-400">{info}</p>}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className={buttonClasses("primary", "md")}
          >
            {saving ? "Speichert…" : editingId ? "Flug speichern" : "Flug hinzufügen"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className={buttonClasses("secondary", "md")}
            >
              Abbrechen
            </button>
          )}
        </div>
      </form>

      {/* Liste */}
      <div className="rounded-card border border-hairline bg-surface shadow-card">
        <div className="border-b border-hairline px-4 py-2 text-sm font-medium text-ink-muted">
          Flüge ({flights.length})
        </div>
        {flights.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-subtle">
            Noch keine Flüge. Flugnummer + Datum eingeben und „Flugdaten holen" (oder manuell ausfüllen).
          </p>
        ) : (
          <ul>
            {flights.map((f) => (
              <li key={f.id} className="border-b border-hairline px-4 py-3 last:border-b-0">
                <div className="flex items-start gap-3">
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand/10 text-brand">✈</span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
                    {f.flightNumber}
                    {f.airline && <span className="font-normal text-ink-muted">· {f.airline}</span>}
                    {directionLabel(f.fromCode, f.toCode) && (
                      <span className="rounded-full bg-brand/15 px-1.5 py-0.5 text-[10px] font-medium text-brand">
                        {directionLabel(f.fromCode, f.toCode)}
                      </span>
                    )}
                  </p>
                  <p className="truncate text-sm text-ink-muted">
                    {(f.fromCode || f.fromName || "?")}{f.fromName && f.fromCode ? ` ${f.fromName}` : ""} → {(f.toCode || f.toName || "?")}{f.toName && f.toCode ? ` ${f.toName}` : ""}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {fmtDate(f.departure)} → {fmtDate(f.arrival)}
                    {overnightDays(f.departure, f.arrival) > 0 && (
                      <span className="ml-1 text-amber-600 dark:text-amber-400">
                        (+{overnightDays(f.departure, f.arrival)} Tag{overnightDays(f.departure, f.arrival) > 1 ? "e" : ""})
                      </span>
                    )}
                    {fmtDuration(f.durationMin) && ` · ${fmtDuration(f.durationMin)} Flugzeit`}
                    {f.bookingRef && ` · Buchung ${f.bookingRef}`}
                  </p>
                  {f.seats && (
                    <p className="mt-0.5 text-xs text-ink-muted">
                      💺 Sitze:{" "}
                      <span className="font-semibold tabular-nums text-ink">
                        {f.seats}
                      </span>
                    </p>
                  )}
                  {f.by && <p className="text-[11px] text-ink-subtle">von {f.by}</p>}
                </div>
                <div className="flex flex-col items-end gap-1">
                  {f.priceYen ? (
                    <span className="text-sm font-medium tabular-nums text-ink">
                      {eurFmt.format(f.priceYen * rate)}
                    </span>
                  ) : null}
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => startEdit(f)}
                      className="rounded px-2 py-1 text-xs text-brand transition hover:bg-brand/10"
                    >
                      Bearbeiten
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(f.id)}
                      className="rounded px-2 py-1 text-xs text-red-600 transition hover:bg-red-500/10 dark:text-red-400"
                    >
                      Löschen
                    </button>
                  </div>
                </div>
                </div>
                {f.flightNumber && f.departure && (
                  <div className="mt-2 sm:pl-12">
                    <button
                      type="button"
                      onClick={() => toggleLive(f.id)}
                      className="text-xs font-medium text-brand hover:underline"
                    >
                      {liveOpen.has(f.id) ? "Live-Status ausblenden" : "🔴 Live-Status anzeigen"}
                    </button>
                    {liveOpen.has(f.id) && (
                      <div className="mt-2 rounded-md border border-hairline bg-surface-2 p-3">
                        <FlightLiveStatus number={f.flightNumber} date={f.departure.slice(0, 10)} />
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-ink-subtle">
        Wird in der Reise gespeichert und mit Mitgliedern geteilt. Ein hinterlegter Preis erscheint
        automatisch als Ausgabe (Kategorie Transport) im Ausgabenrechner.
      </p>
    </div>
  );
}
