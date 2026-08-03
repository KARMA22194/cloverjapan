"use client";

import { useEffect, useMemo, useState } from "react";

import { api } from "@/lib/api/client";
import { eurFmt } from "@/lib/format";

// Deutscher Reisezoll (Nicht-EU → Deutschland), Stand 2024:
const ALLOWANCE_PER_PERSON = 430; // € Reisefreimenge für Flug-/Seereisende
const FLAT_RATE = 0.175; // pauschaler Abgabensatz
// Obergrenze für die Pauschalierung: bezieht sich laut Zoll auf den WARENWERT
// je Reisender (nicht auf den Betrag nach Abzug der Freimenge!). Übersteigt der
// Warenwert 700 €/Person, ist nur die reguläre Verzollung zulässig.
const FLAT_CAP = 700; // € Warenwert-Obergrenze je Person
const EUST = 0.19; // Einfuhrumsatzsteuer (Regelsatz)
const FALLBACK_RATE = 0.0058; // JPY→EUR-Fallback


// Typische Zollsätze je Warenart (Regel-/Drittlandzoll, gerundet). Nur für die
// „regulär"-Rechnung über 700 €; im Zweifel beim Zoll prüfen.
const DUTY_CATEGORIES = [
  { value: 0, label: "Figuren/Spielzeug (0 %)" },
  { value: 0, label: "Elektronik (0 %)" },
  { value: 12, label: "Kleidung/Textilien (12 %)" },
  { value: 8, label: "Schuhe (8 %)" },
  { value: 4, label: "Sonstiges (≈4 %)" },
];

type Currency = "EUR" | "JPY";

export function CustomsCalculator() {
  const [rate, setRate] = useState(FALLBACK_RATE);
  const [valueInput, setValueInput] = useState("");
  const [currency, setCurrency] = useState<Currency>("EUR");
  const [persons, setPersons] = useState("1");
  const [dutyPct, setDutyPct] = useState(0);
  const [prefillNote, setPrefillNote] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ rate: number }>("/api/v1/fx/rate?from=JPY&to=EUR")
      .then((r) => setRate(r.rate))
      .catch(() => {});
  }, []);

  // Warenwert in Euro (aus Eingabe + Währung).
  const goodsEur = useMemo(() => {
    const n = Number(valueInput.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return 0;
    return currency === "JPY" ? n * rate : n;
  }, [valueInput, currency, rate]);

  const calc = useMemo(() => {
    const p = Math.max(1, Math.floor(Number(persons) || 1));
    const allowance = ALLOWANCE_PER_PERSON * p;
    const flatCap = FLAT_CAP * p;
    const dutiable = Math.max(0, goodsEur - allowance);

    // Pauschalierung nur, wenn der WARENWERT die 700-€-Grenze/Person nicht
    // übersteigt (nicht der Betrag nach Abzug der Freimenge). Der Satz selbst
    // wird auf den zu verzollenden Betrag angewendet.
    const flatAvailable = dutiable > 0 && goodsEur <= flatCap;
    const flat = flatAvailable ? dutiable * FLAT_RATE : null;

    const duty = dutiable * (dutyPct / 100);
    const eust = (dutiable + duty) * EUST;
    const regular = dutiable > 0 ? duty + eust : 0;

    // Empfehlung: wo zulässig, ist der Pauschalsatz meist einfacher/günstiger;
    // über der Warenwert-Grenze bleibt nur die reguläre Verzollung.
    const recommended = flatAvailable ? "flat" : dutiable > 0 ? "regular" : "none";
    return { p, allowance, flatCap, dutiable, flatAvailable, flat, duty, eust, regular, recommended };
  }, [goodsEur, persons, dutyPct]);

  async function prefillFromExpenses() {
    setPrefillNote(null);
    try {
      const items = await api.get<{ category: string; yen: number }[]>("/api/v1/expenses");
      // Nur „mitgebrachte Waren" (keine Verpflegung/Fahrten/Sightseeing).
      const goodsCats = new Set(["FIGUREN", "KLEIDUNG", "SONSTIGES"]);
      const yen = items.filter((i) => goodsCats.has(i.category)).reduce((s, i) => s + i.yen, 0);
      if (yen <= 0) {
        setPrefillNote("Keine passenden Waren-Ausgaben (Figuren/Kleidung/Sonstiges) gefunden.");
        return;
      }
      setCurrency("JPY");
      setValueInput(String(yen));
      setPrefillNote("Warenwert aus Ausgaben (Figuren, Kleidung, Sonstiges) übernommen.");
    } catch {
      setPrefillNote("Konnte Ausgaben nicht laden.");
    }
  }

  async function prefillFromWishlist() {
    setPrefillNote(null);
    try {
      const items = await api.get<{ priceYen: number | null }[]>("/api/v1/wishlist");
      const yen = items.reduce((s, i) => s + (i.priceYen ?? 0), 0);
      if (yen <= 0) {
        setPrefillNote("Keine Wunschliste mit Preisen gefunden.");
        return;
      }
      setCurrency("JPY");
      setValueInput(String(yen));
      setPrefillNote("Warenwert aus der Wunschliste übernommen.");
    } catch {
      setPrefillNote("Konnte Wunschliste nicht laden.");
    }
  }

  const inputClass =
    "w-full rounded-md border border-slate-300 dark:border-slate-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-brand";
  const labelClass = "mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300";

  const recPill = (kind: "flat" | "regular") =>
    calc.recommended === kind ? (
      <span className="ml-2 rounded-full bg-brand/15 px-2 py-0.5 text-[11px] font-medium text-brand">
        empfohlen
      </span>
    ) : null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Eingabe */}
      <div className="space-y-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-40">
            <label className={labelClass}>Warenwert</label>
            <input
              value={valueInput}
              onChange={(e) => setValueInput(e.target.value)}
              inputMode="decimal"
              placeholder="z. B. 900"
              className={inputClass}
            />
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
          <div className="w-24">
            <label className={labelClass}>Personen</label>
            <input
              value={persons}
              onChange={(e) => setPersons(e.target.value)}
              inputMode="numeric"
              className={inputClass}
            />
          </div>
        </div>

        {currency === "JPY" && goodsEur > 0 && (
          <p className="text-xs text-slate-500 dark:text-slate-400">≈ {eurFmt.format(goodsEur)}</p>
        )}

        <div>
          <label className={labelClass}>Warenart (für „regulär" ab 700 € Warenwert)</label>
          <select
            value={dutyPct}
            onChange={(e) => setDutyPct(Number(e.target.value))}
            className={inputClass}
          >
            {DUTY_CATEGORIES.map((c, i) => (
              <option key={i} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={prefillFromExpenses}
            className="rounded-md border border-brand/50 bg-brand/10 px-3 py-2 text-sm font-medium text-brand transition hover:bg-brand/20"
          >
            Aus Ausgaben übernehmen
          </button>
          <button
            type="button"
            onClick={prefillFromWishlist}
            className="rounded-md border border-brand/50 bg-brand/10 px-3 py-2 text-sm font-medium text-brand transition hover:bg-brand/20"
          >
            Aus Wunschliste übernehmen
          </button>
        </div>
        {prefillNote && (
          <p className="text-xs text-slate-500 dark:text-slate-400">{prefillNote}</p>
        )}
      </div>

      {/* Ergebnis */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <h2 className="mb-3 text-lg text-slate-900 dark:text-slate-100">Ergebnis</h2>

        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500 dark:text-slate-400">Warenwert</dt>
            <dd className="tabular-nums text-slate-800 dark:text-slate-100">{eurFmt.format(goodsEur)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500 dark:text-slate-400">
              Freimenge ({calc.p} × {eurFmt.format(ALLOWANCE_PER_PERSON)})
            </dt>
            <dd className="tabular-nums text-slate-800 dark:text-slate-100">− {eurFmt.format(calc.allowance)}</dd>
          </div>
          <div className="flex justify-between border-t border-slate-100 dark:border-slate-800 pt-1.5 font-medium">
            <dt className="text-slate-700 dark:text-slate-200">Zu verzollen</dt>
            <dd className="tabular-nums text-slate-900 dark:text-slate-100">{eurFmt.format(calc.dutiable)}</dd>
          </div>
        </dl>

        {calc.dutiable <= 0 ? (
          <p className="mt-4 rounded-md bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
            Alles innerhalb der Freimenge — voraussichtlich <strong>keine Abgaben</strong>.
          </p>
        ) : (
          <div className="mt-4 space-y-2">
            {/* Pauschal */}
            <div
              className={`rounded-md border px-3 py-2 ${
                calc.recommended === "flat"
                  ? "border-brand/50 bg-brand/5"
                  : "border-slate-200 dark:border-slate-700"
              }`}
            >
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  Pauschal 17,5 % {recPill("flat")}
                </span>
                <span className="tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                  {calc.flatAvailable ? eurFmt.format(calc.flat!) : "—"}
                </span>
              </div>
              {!calc.flatAvailable && (
                <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                  Nicht zulässig: Warenwert über {eurFmt.format(calc.flatCap)}
                  {calc.p > 1 ? ` (${eurFmt.format(FLAT_CAP)}/Person)` : ""} — Pauschalierung
                  nur bis dahin.
                </p>
              )}
            </div>

            {/* Regulär */}
            <div
              className={`rounded-md border px-3 py-2 ${
                calc.recommended === "regular"
                  ? "border-brand/50 bg-brand/5"
                  : "border-slate-200 dark:border-slate-700"
              }`}
            >
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  Regulär: Zoll {dutyPct} % + 19 % EUSt {recPill("regular")}
                </span>
                <span className="tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                  {eurFmt.format(calc.regular)}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                Zoll {eurFmt.format(calc.duty)} + EUSt {eurFmt.format(calc.eust)}
              </p>
            </div>
          </div>
        )}

        <p className="mt-4 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
          Schätzung nach deutschem Reisezoll (Flugreisende): Freimenge 430 €/Person; der
          Pauschalsatz 17,5 % ist nur bis 700 € Warenwert/Person zulässig, darüber gilt zwingend
          die reguläre Verzollung (Zoll + 19 % EUSt). Der Satz wird auf den Wert nach Abzug der
          Freimenge angewandt. Alkohol & Tabak haben eigene Mengengrenzen (hier nicht berechnet).
          Wechselkurs = tagesaktueller Marktkurs; der Zoll rechnet mit eigenen Monatskursen.
          Angaben ohne Gewähr — verbindlich ist der Zoll.
        </p>
      </div>
    </div>
  );
}
