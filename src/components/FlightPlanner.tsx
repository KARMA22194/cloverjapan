"use client";

import { useCallback, useEffect, useState } from "react";

import { api } from "@/lib/api/client";

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
  bookingRef: string;
  priceYen: number | null;
  by?: string;
}

type Currency = "EUR" | "JPY";

const FALLBACK_RATE = 0.0058; // JPY→EUR
const eurFmt = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const yenFmt = new Intl.NumberFormat("de-DE", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });
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
  const [lookupPending, setLookupPending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const reload = useCallback(() => {
    return api
      .get<Flight[]>("/api/v1/flights")
      .then(setFlights)
      .catch(() => {});
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

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
    });
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
    "w-full rounded-md border border-slate-300 dark:border-slate-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-brand";
  const labelClass = "mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300";

  return (
    <div className="space-y-6">
      {/* Formular */}
      <form
        onSubmit={save}
        className="space-y-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4"
      >
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-32">
            <label className={labelClass}>Flugnummer</label>
            <input
              value={form.flightNumber}
              onChange={(e) => set("flightNumber", e.target.value)}
              placeholder="LH716"
              className={inputClass}
            />
          </div>
          <div className="w-40">
            <label className={labelClass}>Datum (für Abruf)</label>
            <input
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
            <label className={labelClass}>Airline</label>
            <input value={form.airline} onChange={(e) => set("airline", e.target.value)} placeholder="Lufthansa" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Buchungsnummer</label>
            <input value={form.bookingRef} onChange={(e) => set("bookingRef", e.target.value)} placeholder="ABC123" className={inputClass} />
          </div>
          <div className="flex gap-2">
            <div className="w-20">
              <label className={labelClass}>Ab (IATA)</label>
              <input value={form.fromCode} onChange={(e) => set("fromCode", e.target.value)} placeholder="FRA" className={inputClass} />
            </div>
            <div className="flex-1">
              <label className={labelClass}>Abflug-Ort</label>
              <input value={form.fromName} onChange={(e) => set("fromName", e.target.value)} placeholder="Frankfurt" className={inputClass} />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="w-20">
              <label className={labelClass}>An (IATA)</label>
              <input value={form.toCode} onChange={(e) => set("toCode", e.target.value)} placeholder="HND" className={inputClass} />
            </div>
            <div className="flex-1">
              <label className={labelClass}>Ankunfts-Ort</label>
              <input value={form.toName} onChange={(e) => set("toName", e.target.value)} placeholder="Tokyo Haneda" className={inputClass} />
            </div>
          </div>
          <div>
            <label className={labelClass}>Abflug (Datum/Zeit)</label>
            <input type="datetime-local" value={form.departure} onChange={(e) => set("departure", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Ankunft (Datum/Zeit)</label>
            <input type="datetime-local" value={form.arrival} onChange={(e) => set("arrival", e.target.value)} className={inputClass} />
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 dark:border-slate-800 pt-3">
          <div className="w-32">
            <label className={labelClass}>Preis</label>
            <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="z. B. 780" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Währung</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as Currency)}
              className={inputClass}
            >
              <option value="EUR">Euro (€)</option>
              <option value="JPY">Yen (¥)</option>
            </select>
          </div>
          <p className="pb-2 text-xs text-slate-500 dark:text-slate-400">
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
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark disabled:opacity-60"
          >
            {saving ? "Speichert…" : editingId ? "Flug speichern" : "Flug hinzufügen"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-md border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm text-slate-700 dark:text-slate-200 transition hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Abbrechen
            </button>
          )}
        </div>
      </form>

      {/* Liste */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <div className="border-b border-slate-100 dark:border-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200">
          Flüge ({flights.length})
        </div>
        {flights.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-500">
            Noch keine Flüge. Flugnummer + Datum eingeben und „Flugdaten holen" (oder manuell ausfüllen).
          </p>
        ) : (
          <ul>
            {flights.map((f) => (
              <li key={f.id} className="flex items-start gap-3 border-b border-slate-100 dark:border-slate-800 px-4 py-3 last:border-b-0">
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand/10 text-brand">✈</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                    {f.flightNumber}
                    {f.airline && <span className="ml-1 font-normal text-slate-500 dark:text-slate-400">· {f.airline}</span>}
                  </p>
                  <p className="truncate text-sm text-slate-600 dark:text-slate-300">
                    {(f.fromCode || f.fromName || "?")}{f.fromName && f.fromCode ? ` ${f.fromName}` : ""} → {(f.toCode || f.toName || "?")}{f.toName && f.toCode ? ` ${f.toName}` : ""}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {fmtDate(f.departure)} → {fmtDate(f.arrival)}
                    {f.bookingRef && ` · Buchung ${f.bookingRef}`}
                  </p>
                  {f.by && <p className="text-[11px] text-slate-400 dark:text-slate-500">von {f.by}</p>}
                </div>
                <div className="flex flex-col items-end gap-1">
                  {f.priceYen ? (
                    <span className="text-sm font-medium tabular-nums text-slate-800 dark:text-slate-100">
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
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-slate-400 dark:text-slate-500">
        Wird in der Reise gespeichert und mit Mitgliedern geteilt. Ein hinterlegter Preis erscheint
        automatisch als Ausgabe (Kategorie Transport) im Ausgabenrechner.
      </p>
    </div>
  );
}
