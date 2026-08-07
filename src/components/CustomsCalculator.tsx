"use client";

import { useEffect, useMemo, useState } from "react";

import { api } from "@/lib/api/client";
import { eurFmt } from "@/lib/format";
import { fieldClasses } from "@/components/ui/Field";

// Deutscher Reisezoll (Nicht-EU → Deutschland), Stand 2024:
const ALLOWANCE_PER_PERSON = 430; // € Reisefreimenge für Flug-/Seereisende
const FLAT_RATE = 0.175; // pauschaler Abgabensatz
// Obergrenze für die Pauschalierung: bezieht sich laut Zoll auf den WARENWERT
// je Reisender (nicht auf den Betrag nach Abzug der Freimenge!). Übersteigt der
// Warenwert 700 €/Person, ist nur die reguläre Verzollung zulässig.
const FLAT_CAP = 700; // € Warenwert-Obergrenze je Person
const EUST = 0.19; // Einfuhrumsatzsteuer (Regelsatz)
const FALLBACK_RATE = 0.0058; // JPY→EUR-Fallback

// Typische Zollsätze je Warenart (Regel-/Drittlandzoll, gerundet). Für die
// manuelle Eingabe; im Zweifel beim Zoll prüfen.
const DUTY_CATEGORIES = [
  { value: 0, label: "Figuren/Spielzeug (0 %)" },
  { value: 0, label: "Elektronik (0 %)" },
  { value: 12, label: "Kleidung/Textilien (12 %)" },
  { value: 8, label: "Schuhe (8 %)" },
  { value: 4, label: "Sonstiges (≈4 %)" },
];

// Zuordnung Ausgaben-/Warenkategorie → Zollsatz + Anzeige-Label. Nur „Waren"
// (keine Verpflegung/Fahrten/Sightseeing) sind zollrelevant.
const GOODS_DUTY: Record<string, { label: string; dutyPct: number }> = {
  FIGUREN: { label: "Figuren/Spielzeug", dutyPct: 0 },
  KLEIDUNG: { label: "Kleidung/Textilien", dutyPct: 12 },
  SONSTIGES: { label: "Sonstiges", dutyPct: 4 },
};

type Currency = "EUR" | "JPY";

// Eine übernommene Warengruppe (Wert in Yen, damit live umrechenbar).
interface BreakdownItem {
  key: string;
  label: string;
  dutyPct: number;
  yen: number;
}

export function CustomsCalculator() {
  const [rate, setRate] = useState(FALLBACK_RATE);
  const [valueInput, setValueInput] = useState("");
  const [currency, setCurrency] = useState<Currency>("EUR");
  const [persons, setPersons] = useState("1");
  const [dutyIdx, setDutyIdx] = useState(0);
  const [breakdown, setBreakdown] = useState<BreakdownItem[] | null>(null);
  const [prefillNote, setPrefillNote] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ rate: number }>("/api/v1/fx/rate?from=JPY&to=EUR")
      .then((r) => setRate(r.rate))
      .catch(() => {});
  }, []);

  // Warenwert in Euro aus der manuellen Eingabe (nur ohne übernommene Liste).
  const goodsEur = useMemo(() => {
    const n = Number(valueInput.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return 0;
    return currency === "JPY" ? n * rate : n;
  }, [valueInput, currency, rate]);

  const calc = useMemo(() => {
    const p = Math.max(1, Math.floor(Number(persons) || 1));
    const allowance = ALLOWANCE_PER_PERSON * p;
    const flatCap = FLAT_CAP * p;

    // Effektive Warenaufstellung: entweder die übernommene Kategorien-Liste
    // (Yen live umgerechnet) oder eine Einzelposition aus der manuellen Eingabe.
    const cats = breakdown
      ? breakdown.map((c) => ({ label: c.label, dutyPct: c.dutyPct, eur: c.yen * rate }))
      : goodsEur > 0
        ? [
            {
              label: DUTY_CATEGORIES[dutyIdx].label,
              dutyPct: DUTY_CATEGORIES[dutyIdx].value,
              eur: goodsEur,
            },
          ]
        : [];

    const goods = cats.reduce((s, c) => s + c.eur, 0);
    const dutiable = Math.max(0, goods - allowance);

    // Pauschalierung nur, wenn der WARENWERT die 700-€-Grenze/Person nicht
    // übersteigt. Der Satz selbst gilt für den Betrag nach Abzug der Freimenge.
    const flatAvailable = dutiable > 0 && goods <= flatCap;
    const flat = flatAvailable ? dutiable * FLAT_RATE : null;

    // Reguläre Verzollung je Kategorie. Freimenge zugunsten des Reisenden
    // zuerst auf die höchstverzollten Waren anrechnen (minimiert den Zoll).
    const sorted = [...cats].sort((a, b) => b.dutyPct - a.dutyPct);
    let rest = allowance;
    const lines = sorted.map((c) => {
      const covered = Math.min(rest, c.eur);
      rest -= covered;
      const base = c.eur - covered; // zu verzollender Wert dieser Kategorie
      const duty = base * (c.dutyPct / 100);
      return { label: c.label, dutyPct: c.dutyPct, base, duty };
    });
    const dutyTotal = lines.reduce((s, l) => s + l.duty, 0);
    const eust = (dutiable + dutyTotal) * EUST;
    const regular = dutiable > 0 ? dutyTotal + eust : 0;

    // Wo die Pauschalierung zulässig ist, kann der Reisende die günstigere
    // Variante wählen; sonst bleibt nur die reguläre Verzollung.
    let recommended: "flat" | "regular" | "none" = "none";
    if (dutiable > 0) {
      recommended = flatAvailable ? (flat! <= regular ? "flat" : "regular") : "regular";
    }

    const multiCat = lines.filter((l) => l.base > 0).length > 1;
    return {
      p, allowance, flatCap, goods, dutiable, flatAvailable, flat,
      lines, dutyTotal, eust, regular, recommended, multiCat,
    };
  }, [breakdown, goodsEur, persons, dutyIdx, rate]);

  async function prefillFromExpenses() {
    setPrefillNote(null);
    try {
      const items = await api.get<{ category: string; yen: number }[]>("/api/v1/expenses");
      // Nur Waren (Figuren/Kleidung/Sonstiges), gruppiert je Kategorie.
      const byCat = new Map<string, number>();
      for (const i of items) {
        if (!GOODS_DUTY[i.category]) continue;
        byCat.set(i.category, (byCat.get(i.category) ?? 0) + i.yen);
      }
      if (byCat.size === 0) {
        setBreakdown(null);
        setPrefillNote("Keine passenden Waren-Ausgaben (Figuren/Kleidung/Sonstiges) gefunden.");
        return;
      }
      const bd: BreakdownItem[] = [...byCat.entries()].map(([key, yen]) => ({
        key,
        label: GOODS_DUTY[key].label,
        dutyPct: GOODS_DUTY[key].dutyPct,
        yen,
      }));
      setBreakdown(bd);
      setPrefillNote("Waren je Kategorie aus den Ausgaben übernommen — Zoll je Warenart berechnet.");
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
        setBreakdown(null);
        setPrefillNote("Keine Wunschliste mit Preisen gefunden.");
        return;
      }
      // Wunschliste hat keine Kategorien → als „Sonstiges" (≈4 %) angesetzt.
      setBreakdown([{ key: "WISHLIST", label: "Wunschliste (Sonstiges)", dutyPct: 4, yen }]);
      setPrefillNote("Warenwert aus der Wunschliste übernommen (als Sonstiges, ≈ 4 % Zoll).");
    } catch {
      setPrefillNote("Konnte Wunschliste nicht laden.");
    }
  }

  const inputClass =
    fieldClasses;
  const labelClass = "mb-1 block text-xs font-medium text-ink-muted";

  const recPill = (kind: "flat" | "regular") =>
    calc.recommended === kind ? (
      <span className="ml-2 rounded-full bg-brand/15 px-2 py-0.5 text-[11px] font-medium text-brand">
        empfohlen
      </span>
    ) : null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Eingabe */}
      <div className="space-y-3 rounded-card border border-hairline bg-surface shadow-card p-4">
        {breakdown ? (
          <>
            <div className="flex items-center justify-between">
              <label className={`${labelClass} mb-0`}>Übernommene Waren (je Kategorie)</label>
              <button
                type="button"
                onClick={() => {
                  setBreakdown(null);
                  setPrefillNote(null);
                }}
                className="text-xs font-medium text-brand transition hover:underline"
              >
                manuell eingeben
              </button>
            </div>
            <ul className="space-y-1">
              {breakdown.map((c) => (
                <li
                  key={c.key}
                  className="flex items-center justify-between rounded-md border border-hairline px-3 py-2 text-sm"
                >
                  <span className="text-ink-muted">
                    {c.label}
                    <span className="ml-1 text-xs text-ink-subtle">
                      · {c.dutyPct} % Zoll
                    </span>
                  </span>
                  <span className="tabular-nums text-ink">
                    {eurFmt.format(c.yen * rate)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="w-24">
              <label className={labelClass}>Personen</label>
              <input
                value={persons}
                onChange={(e) => setPersons(e.target.value)}
                inputMode="numeric"
                className={inputClass}
              />
            </div>
          </>
        ) : (
          <>
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
              <p className="text-xs text-ink-muted">≈ {eurFmt.format(goodsEur)}</p>
            )}

            <div>
              <label className={labelClass}>Warenart (Zollsatz für die reguläre Verzollung)</label>
              <select
                value={dutyIdx}
                onChange={(e) => setDutyIdx(Number(e.target.value))}
                className={inputClass}
              >
                {DUTY_CATEGORIES.map((c, i) => (
                  <option key={i} value={i}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

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
          <p className="text-xs text-ink-muted">{prefillNote}</p>
        )}
      </div>

      {/* Ergebnis */}
      <div className="rounded-card border border-hairline bg-surface shadow-card p-4">
        <h2 className="mb-3 text-lg text-ink">Ergebnis</h2>

        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-muted">Warenwert</dt>
            <dd className="tabular-nums text-ink">{eurFmt.format(calc.goods)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-muted">
              Freimenge ({calc.p} × {eurFmt.format(ALLOWANCE_PER_PERSON)})
            </dt>
            <dd className="tabular-nums text-ink">− {eurFmt.format(calc.allowance)}</dd>
          </div>
          <div className="flex justify-between border-t border-hairline pt-1.5 font-medium">
            <dt className="text-ink-muted">Zu verzollen</dt>
            <dd className="tabular-nums text-ink">{eurFmt.format(calc.dutiable)}</dd>
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
                  : "border-hairline"
              }`}
            >
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-ink-muted">
                  Pauschal 17,5 % {recPill("flat")}
                </span>
                <span className="tabular-nums font-semibold text-ink">
                  {calc.flatAvailable ? eurFmt.format(calc.flat!) : "—"}
                </span>
              </div>
              {!calc.flatAvailable && (
                <p className="mt-0.5 text-[11px] text-ink-subtle">
                  Nicht zulässig: Warenwert über {eurFmt.format(calc.flatCap)}
                  {calc.p > 1 ? ` (${eurFmt.format(FLAT_CAP)}/Person)` : ""} — Pauschalierung
                  nur bis dahin.
                </p>
              )}
            </div>

            {/* Regulär — je Warenart */}
            <div
              className={`rounded-md border px-3 py-2 ${
                calc.recommended === "regular"
                  ? "border-brand/50 bg-brand/5"
                  : "border-hairline"
              }`}
            >
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-ink-muted">
                  Regulär: Zoll je Warenart + 19 % EUSt {recPill("regular")}
                </span>
                <span className="tabular-nums font-semibold text-ink">
                  {eurFmt.format(calc.regular)}
                </span>
              </div>
              <div className="mt-1.5 space-y-0.5 text-[11px] text-ink-subtle">
                {calc.lines
                  .filter((l) => l.base > 0)
                  .map((l, i) => (
                    <div key={i} className="flex justify-between">
                      <span>
                        {l.label}: {l.dutyPct} % auf {eurFmt.format(l.base)}
                      </span>
                      <span className="tabular-nums">{eurFmt.format(l.duty)}</span>
                    </div>
                  ))}
                <div className="flex justify-between">
                  <span>Zoll gesamt</span>
                  <span className="tabular-nums">{eurFmt.format(calc.dutyTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>+ EUSt 19 %</span>
                  <span className="tabular-nums">{eurFmt.format(calc.eust)}</span>
                </div>
                {calc.multiCat && (
                  <p className="pt-0.5">Freimenge auf die höchstverzollten Waren angerechnet.</p>
                )}
              </div>
            </div>
          </div>
        )}

        <p className="mt-4 text-[11px] leading-relaxed text-ink-subtle">
          Schätzung nach deutschem Reisezoll (Flugreisende): Freimenge 430 €/Person; der
          Pauschalsatz 17,5 % ist nur bis 700 € Warenwert/Person zulässig, darüber gilt zwingend
          die reguläre Verzollung (Zoll je Warenart + 19 % EUSt). Der Satz wird auf den Wert nach
          Abzug der Freimenge angewandt. Alkohol & Tabak haben eigene Mengengrenzen (hier nicht
          berechnet). Wechselkurs = tagesaktueller Marktkurs; der Zoll rechnet mit eigenen
          Monatskursen. Angaben ohne Gewähr — verbindlich ist der Zoll.
        </p>
      </div>
    </div>
  );
}
