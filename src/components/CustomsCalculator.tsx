"use client";

import { useEffect, useMemo, useState } from "react";

import { api } from "@/lib/api/client";
import { eurFmt } from "@/lib/format";
import { fieldClasses } from "@/components/ui/Field";
import { cn } from "@/lib/cn";

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
  { value: 0, label: "Kosmetik/Drogerie (0 %)" },
  { value: 12, label: "Kleidung/Textilien (12 %)" },
  { value: 8, label: "Schuhe (8 %)" },
  { value: 4, label: "Sonstiges (≈4 %)" },
];

// Zuordnung Ausgaben-/Warenkategorie → Zollsatz + Anzeige-Label.
//
// ⚠️ **Wer hier fehlt, ist für den Zoll unsichtbar — und wer zu Unrecht drinsteht,
// wird verzollt.** Beides fällt im Ergebnis nicht auf, weil nur die Summe zu sehen
// ist. Zollrelevant sind ausschließlich **Waren**, die mit nach Hause kommen:
// Verpflegung, Fahrkarten, Eintritte und **Übernachtungen** sind es nicht.
// `UNTERKUNFT` gibt es genau deshalb als eigene Kategorie: Hotelrechnungen
// landeten vorher in „Sonstiges" und wurden damit als Ware zu ≈4 % verzollt —
// bei zwei Wochen Japan der mit Abstand größte Einzelposten.
//
// Sätze = Regel-/Drittlandzoll der EU (gerundet). Kosmetik, Parfum und
// Arzneimittel sind zollfrei (Kapitel 30/33), Einfuhrumsatzsteuer fällt
// trotzdem an — die rechnet der Block unten ohnehin auf alles.
const GOODS_DUTY: Record<string, { label: string; dutyPct: number }> = {
  FIGUREN: { label: "Figuren/Spielzeug", dutyPct: 0 },
  ELEKTRONIK: { label: "Elektronik", dutyPct: 0 },
  KOSMETIK: { label: "Kosmetik/Drogerie", dutyPct: 0 },
  KLEIDUNG: { label: "Kleidung/Textilien", dutyPct: 12 },
  SONSTIGES: { label: "Sonstiges", dutyPct: 4 },
};

/** Für Hinweistexte: „Figuren/Spielzeug, Elektronik, …" — aus einer Quelle. */
const GOODS_LABELS = Object.values(GOODS_DUTY)
  .map((g) => g.label)
  .join(", ");

/**
 * Mengen-Freimengen für Tabak und Alkohol (Flug-/Seereisende, **je Reisendem ab
 * 17 Jahren**).
 *
 * ⚠️ Das sind **eigene** Freimengen neben der 430-€-Wertgrenze, keine Teilmenge
 * davon. Bisher rechnete dieser Rechner nur den Warenwert und meldete „voraus-
 * sichtlich keine Abgaben", solange man unter 430 € blieb — auch bei drei
 * Flaschen japanischem Whisky. Genau das ist die häufigste Falle, weil Whisky
 * das typische Mitbringsel ist.
 *
 * Innerhalb einer Gruppe ist **anteilig kombinierbar**: jede Zeile zählt als
 * 100 % ihrer Gruppe, und die Anteile dürfen zusammen 100 % nicht übersteigen
 * (also z. B. 100 Zigaretten + 25 Zigarren). Wein und Bier haben eigene,
 * zusätzliche Grenzen.
 */
const TOBACCO_LIMITS = [
  { key: "cigarettes", label: "Zigaretten", unit: "Stück", limit: 200 },
  { key: "cigarillos", label: "Zigarillos", unit: "Stück", limit: 100 },
  { key: "cigars", label: "Zigarren", unit: "Stück", limit: 50 },
  { key: "tobacco", label: "Rauchtabak", unit: "g", limit: 250 },
] as const;

const SPIRIT_LIMITS = [
  { key: "spirits", label: "Spirituosen über 22 % vol", unit: "l", limit: 1 },
  { key: "liqueur", label: "Alkohol bis 22 % vol", unit: "l", limit: 2 },
] as const;

const SEPARATE_LIMITS = [
  { key: "wine", label: "Wein (nicht schäumend)", unit: "l", limit: 4 },
  { key: "beer", label: "Bier", unit: "l", limit: 16 },
] as const;

type QuantityKey =
  | (typeof TOBACCO_LIMITS)[number]["key"]
  | (typeof SPIRIT_LIMITS)[number]["key"]
  | (typeof SEPARATE_LIMITS)[number]["key"];

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
  // Mengen für Tabak/Alkohol; leer = 0. Eigener Zähler für Reisende ab 17,
  // weil Kinder für diese Freimengen **nicht** zählen — mit `persons` gerechnet
  // wäre die Grenze für eine Familie schlicht zu hoch.
  const [adults, setAdults] = useState("1");
  const [quantities, setQuantities] = useState<Partial<Record<QuantityKey, string>>>({});
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

  /**
   * Mengen-Freimengen prüfen.
   *
   * ⚠️ Hier wird bewusst **kein Betrag** berechnet. Über der Mengengrenze fallen
   * Tabak- bzw. Branntweinsteuer nach eigenen Sätzen an, und die Pauschalierung
   * dieses Rechners deckt das nicht ab. Eine Zahl zu zeigen, die nur für den
   * Warenwert stimmt, wäre schlimmer als gar keine — deshalb eine klare Warnung
   * und der Verweis auf den Zoll.
   */
  const quantityCheck = useMemo(() => {
    const heads = Math.max(0, Math.floor(Number(adults) || 0));
    const num = (k: QuantityKey) => {
      const n = Number((quantities[k] ?? "").replace(",", "."));
      return Number.isFinite(n) && n > 0 ? n : 0;
    };
    const share = (rows: readonly { key: QuantityKey; limit: number }[]) =>
      rows.reduce((sum, r) => sum + num(r.key) / r.limit, 0);

    const groups = [
      { name: "Tabakwaren", pct: share(TOBACCO_LIMITS), rows: TOBACCO_LIMITS },
      { name: "Spirituosen/Alkohol", pct: share(SPIRIT_LIMITS), rows: SPIRIT_LIMITS },
      ...SEPARATE_LIMITS.map((r) => ({ name: r.label, pct: share([r]), rows: [r] as const })),
    ];
    // `heads` teilt: zwei Erwachsene dürfen das Doppelte. Bei 0 Erwachsenen gibt
    // es keine Freimenge — jede Menge über null ist dann zu viel.
    const exceeded = groups
      .filter((g) => g.pct > 0 && (heads === 0 || g.pct > heads))
      .map((g) => g.name);
    const any = groups.some((g) => g.pct > 0);
    return { heads, exceeded, any };
  }, [adults, quantities]);

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
      // Nur Waren (s. GOODS_DUTY), gruppiert je Kategorie.
      const byCat = new Map<string, number>();
      for (const i of items) {
        if (!GOODS_DUTY[i.category]) continue;
        byCat.set(i.category, (byCat.get(i.category) ?? 0) + i.yen);
      }
      if (byCat.size === 0) {
        setBreakdown(null);
        setPrefillNote(`Keine passenden Waren-Ausgaben (${GOODS_LABELS}) gefunden.`);
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

        {/* Mengen-Freimengen. Eingeklappt, weil die meisten Reisen ohne
            auskommen — aber vorhanden, weil japanischer Whisky das typische
            Mitbringsel ist und der Rechner sonst fälschlich Entwarnung gibt. */}
        <details className="rounded-md border border-hairline px-3 py-2">
          <summary className="cursor-pointer list-none text-xs font-semibold text-brand">
            🥃 Alkohol &amp; Tabak (eigene Mengengrenzen)
          </summary>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-subtle">
            Gelten <strong>zusätzlich</strong> zur Wertgrenze von 430 € und nur für
            Reisende ab 17. Innerhalb einer Gruppe anteilig kombinierbar — 100 Zigaretten
            plus 25 Zigarren sind zusammen genau die Freimenge.
          </p>
          <div className="mt-2 w-28">
            {/* `htmlFor`/`id` statt nur nebeneinanderstehender Elemente: sonst
                gehört die Beschriftung dem Feld nicht, Screenreader lesen sie
                nicht vor und ein Klick darauf fokussiert nichts. */}
            <label htmlFor="zoll-erwachsene" className={labelClass}>
              Reisende ab 17
            </label>
            <input
              id="zoll-erwachsene"
              value={adults}
              onChange={(e) => setAdults(e.target.value)}
              inputMode="numeric"
              className={inputClass}
            />
          </div>
          {[
            { title: "Tabakwaren", rows: TOBACCO_LIMITS },
            { title: "Spirituosen / Alkohol", rows: SPIRIT_LIMITS },
            { title: "Zusätzlich erlaubt", rows: SEPARATE_LIMITS },
          ].map((group) => (
            <div key={group.title} className="mt-3">
              <p className="mb-1 text-[11px] font-medium text-ink-muted">{group.title}</p>
              <div className="space-y-1.5">
                {group.rows.map((r) => (
                  <div key={r.key} className="flex items-center gap-2">
                    <input
                      value={quantities[r.key] ?? ""}
                      onChange={(e) =>
                        setQuantities((prev) => ({ ...prev, [r.key]: e.target.value }))
                      }
                      inputMode="decimal"
                      placeholder="0"
                      aria-label={r.label}
                      className={cn(inputClass, "w-20 shrink-0 px-2 py-1 text-xs")}
                    />
                    <span className="min-w-0 text-xs text-ink-muted">
                      {r.label}{" "}
                      <span className="text-ink-subtle">
                        (frei: {r.limit} {r.unit})
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </details>
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

        {quantityCheck.exceeded.length > 0 && (
          <div className="mb-3 rounded-md border border-danger/40 bg-danger/5 px-3 py-2">
            <p className="text-sm font-semibold text-danger">
              Mengen-Freimenge überschritten: {quantityCheck.exceeded.join(", ")}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">
              Diese Waren sind <strong>anmeldepflichtig</strong>. Für die überschüssige Menge
              gibt es keine Reisefreimenge, und der Pauschalsatz oben deckt sie nicht ab —
              es fallen eigene Verbrauchsteuern an (Tabak- bzw. Branntweinsteuer) plus
              Einfuhrumsatzsteuer. Die Höhe rechnet dieses Werkzeug bewusst nicht aus;
              verbindlich ist der Zoll.
            </p>
          </div>
        )}

        {calc.dutiable <= 0 && quantityCheck.exceeded.length === 0 ? (
          <p className="mt-4 rounded-md bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
            Alles innerhalb der Freimenge — voraussichtlich <strong>keine Abgaben</strong>.
            {quantityCheck.any && " Mengen für Tabak/Alkohol ebenfalls im Rahmen."}
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
          Abzug der Freimenge angewandt. Alkohol & Tabak haben eigene Mengengrenzen — die prüft
          der Rechner, die Abgaben darüber hinaus (Tabak-/Branntweinsteuer) berechnet er bewusst
          nicht. Wechselkurs = tagesaktueller Marktkurs; der Zoll rechnet mit eigenen
          Monatskursen. Angaben ohne Gewähr — verbindlich ist der Zoll.
        </p>
      </div>
    </div>
  );
}
