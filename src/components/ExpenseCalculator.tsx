"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { api } from "@/lib/api/client";
import { eurFmt, yenFmt } from "@/lib/format";
import { resizeImage } from "@/lib/image";
import { useMembers } from "@/lib/useMembers";
import {
  EXPENSE_CATEGORIES,
  expenseCategoryMeta,
  type ExpenseCategoryValue,
  type ExpenseItem as Item,
} from "@/lib/expenses";
import { buttonClasses } from "@/components/ui/Button";
import { fieldClasses } from "@/components/ui/Field";
import { cn } from "@/lib/cn";

const FALLBACK_RATE = 0.0058; // grober JPY→EUR-Fallback, falls der Dienst ausfällt

/** Beleg-Bild client-seitig verkleinern → JPEG-Data-URL (max. 1000 px lange Kante). */
const resizeReceipt = (file: File) => resizeImage(file, { max: 1000, quality: 0.6 });

/**
 * Hinweis zur Verlässlichkeit des erkannten Betrags.
 *
 * Der Beleg-Scan liefert einen **Vorschlag**, keine Wahrheit — bei einem
 * schwachen Fund (kein „合計" auf dem Zettel, nur eine Zwischensumme) muss der
 * Betrag geprüft werden, sonst geht später die Abrechnung nicht auf. Bei einem
 * klaren Summenfund bleibt die Zeile leer, damit der Hinweis nicht abstumpft.
 */
function scanNoteFor(
  yen: number,
  source?: "total" | "taxIncluded" | "subtotal" | "guess",
  categoryFrom?: "keywords" | "history" | "fallback",
): string | null {
  const notes: string[] = [];
  if (yen <= 0) notes.push("Betrag nicht erkannt – bitte eintippen.");
  else if (source === "guess") notes.push("Betrag unsicher – bitte prüfen.");
  else if (source === "subtotal") notes.push("Nur Zwischensumme erkannt – bitte prüfen.");
  // Bei „fallback" steht SONSTIGES nur, weil nichts erkannt wurde — das gehört
  // gesagt, sonst sieht die Kategorie wie ein Befund aus.
  if (categoryFrom === "fallback") notes.push("Kategorie unklar \u2013 auf \u201eSonstiges\u201c gesetzt.");
  return notes.length > 0 ? notes.join(" ") : null;
}


/** Donut aus Anteilen; 2px-Lücke zwischen Segmenten (Track scheint durch). */
function Donut({ segments }: { segments: { color: string; frac: number }[] }) {
  const size = 132;
  const stroke = 20;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="Ausgaben nach Kategorie"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        className="stroke-surface-2"
      />
      {segments.map((s, i) => {
        const dash = Math.max(s.frac * c - 2, 0.001);
        const seg = (
          <circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth={stroke}
            strokeDasharray={`${dash} ${c - dash}`}
            strokeDashoffset={-acc * c}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        );
        acc += s.frac;
        return seg;
      })}
    </svg>
  );
}

/**
 * Horizontale Balken (eine Serie → eine Markenfarbe, keine Legende nötig). Wert
 * direkt an der Zeile beschriftet; recessiver Track. `frac` = Anteil am Maximum.
 */
function BarList({
  rows,
}: {
  rows: { label: string; value: string; frac: number; title?: string }[];
}) {
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} title={r.title}>
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate text-ink-muted">{r.label}</span>
            <span className="shrink-0 tabular-nums font-medium text-ink-muted">
              {r.value}
            </span>
          </div>
          <div className="mt-0.5 h-2 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-brand"
              style={{ width: `${Math.max(r.frac * 100, 2)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * `canAiScan` / `canReceiptPhoto` kommen als Props vom Server (`/geld/page.tsx`),
 * nicht aus einem eigenen Fetch: sonst erschiene der Scan-Knopf beim ersten
 * Rendern und verschwände einen Moment später wieder. Beide Rechte werden
 * zusätzlich serverseitig geprüft — das Ausblenden hier ist Bequemlichkeit,
 * keine Sperre (siehe `requirePermission`).
 */
interface ServerBudget {
  totalYen: number;
  categories: Record<string, number>;
}

/** Eingabefeld → ganze Yen. Akzeptiert Komma, ignoriert Unsinn. */
function toYen(v: string): number {
  return Math.max(0, Math.round(Number(String(v).replace(",", ".")) || 0));
}

export function ExpenseCalculator({
  canAiScan,
  canReceiptPhoto,
}: {
  canAiScan: boolean;
  canReceiptPhoto: boolean;
}) {
  const [rate, setRate] = useState<number | null>(null);
  const [rateDate, setRateDate] = useState<string | null>(null);
  const [rateEstimated, setRateEstimated] = useState(false);

  const [items, setItems] = useState<Item[]>([]);

  const [yenInput, setYenInput] = useState("");
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState<ExpenseCategoryValue>("ESSEN");
  const [budget, setBudget] = useState("");
  const [catBudgets, setCatBudgets] = useState<Record<string, string>>({});
  // Erst wahr, wenn das Budget vom Server da ist — verhindert, dass der
  // Speicher-Effekt den leeren Anfangszustand über den echten Stand schreibt.
  const budgetLoaded = useRef(false);
  const [receiptView, setReceiptView] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  // Hinweis nach dem Scan: sagt, ob der Betrag nachgeprüft werden sollte.
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [pendingReceipt, setPendingReceipt] = useState<string | null>(null);

  const members = useMembers();
  const [paidById, setPaidById] = useState("");
  // Aufteilen ist bewusst **aus** voreingestellt und wird nach jedem Eintrag
  // zurückgesetzt: der Haken muss aktiv gesetzt werden. Bliebe er stehen, würde
  // die nächste, persönliche Ausgabe still auf alle verteilt — das fällt erst in
  // der Abrechnung auf und ist der teurere der beiden Fehler (ein Klick zu viel
  // gegen falsch verteiltes Geld).
  const [shared, setShared] = useState(false);

  // Kurs laden (mit Fallback).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api.get<{ rate: number; date: string | null }>(
          "/api/v1/fx/rate?from=JPY&to=EUR",
        );
        if (!cancelled) {
          setRate(r.rate);
          setRateDate(r.date);
        }
      } catch {
        if (!cancelled) {
          setRate(FALLBACK_RATE);
          setRateEstimated(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Ausgaben aus der (geteilten) Reise laden.
  useEffect(() => {
    api
      .get<Item[]>("/api/v1/expenses")
      .then(setItems)
      .catch(() => {});
  }, []);

  // Standard-Zahler = ich selbst, sobald die Mitglieder geladen sind.
  useEffect(() => {
    if (!paidById && members.length > 0) {
      const me = members.find((m) => m.isMe);
      if (me) setPaidById(me.id);
    }
  }, [members, paidById]);

  /**
   * Budget: **persönlich, pro Reise, in der DB** (`GET/PUT /api/v1/budget`).
   *
   * Vorher lag es im `localStorage` — also pro Gerät und pro Browser: das am
   * Rechner gesetzte Budget war auf dem Handy unsichtbar und beim Leeren der
   * Browserdaten weg. Ein dort vorhandener Stand wird deshalb **einmalig
   * übernommen**, solange in der DB noch nichts steht, und danach lokal gelöscht.
   */
  useEffect(() => {
    let alive = true;
    const readLocal = () => {
      try {
        const total = toYen(localStorage.getItem("japan-budget") ?? "");
        const raw = localStorage.getItem("japan-cat-budgets");
        const cats: Record<string, number> = {};
        if (raw) {
          for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, string>)) {
            const y = toYen(v);
            if (y > 0) cats[k] = y;
          }
        }
        return { total, cats };
      } catch {
        return { total: 0, cats: {} as Record<string, number> };
      }
    };

    api
      .get<ServerBudget>("/api/v1/budget")
      .then(async (server) => {
        if (!alive) return;
        const empty = server.totalYen === 0 && Object.keys(server.categories).length === 0;
        const local = empty ? readLocal() : { total: 0, cats: {} };
        const use =
          empty && (local.total > 0 || Object.keys(local.cats).length > 0)
            ? { totalYen: local.total, categories: local.cats }
            : server;

        setBudget(use.totalYen > 0 ? String(use.totalYen) : "");
        setCatBudgets(
          Object.fromEntries(Object.entries(use.categories).map(([k, v]) => [k, String(v)])),
        );
        // Erst **nach** dem Setzen freigeben, sonst schriebe der Speicher-Effekt
        // unten den leeren Anfangszustand über das, was gerade geladen wurde.
        budgetLoaded.current = true;

        if (use !== server) {
          await api.put("/api/v1/budget", use).catch(() => {});
          try {
            localStorage.removeItem("japan-budget");
            localStorage.removeItem("japan-cat-budgets");
          } catch {
            /* ignore */
          }
        }
      })
      .catch(() => {
        // Ohne Server-Antwort bleibt das Feld leer — aber Tippen soll trotzdem
        // gespeichert werden, sobald es wieder geht.
        budgetLoaded.current = true;
      });
    return () => {
      alive = false;
    };
  }, []);

  // Speichern gebündelt: beim Tippen einer Zahl sonst ein PUT je Tastendruck.
  useEffect(() => {
    if (!budgetLoaded.current) return;
    const t = setTimeout(() => {
      const categories: Record<string, number> = {};
      for (const [k, v] of Object.entries(catBudgets)) {
        const y = toYen(v);
        if (y > 0) categories[k] = y;
      }
      api.put("/api/v1/budget", { totalYen: toYen(budget), categories }).catch(() => {});
    }, 800);
    return () => clearTimeout(t);
  }, [budget, catBudgets]);

  function setCatBudget(cat: string, val: string) {
    setCatBudgets((prev) => {
      const next = { ...prev, [cat]: val };
      return next;
    });
  }

  const parsedYen = Number(yenInput.replace(",", "."));
  const validYen = Number.isFinite(parsedYen) && parsedYen > 0;
  const eur = (yen: number) => (rate ? yen * rate : 0);

  const totals = useMemo(() => {
    const perCat = new Map<string, number>();
    let yen = 0;
    for (const it of items) {
      perCat.set(it.category, (perCat.get(it.category) ?? 0) + it.yen);
      yen += it.yen;
    }
    return { perCat, yen };
  }, [items]);

  const budgetYen = toYen(budget);
  const pct = budgetYen > 0 ? Math.round((totals.yen / budgetYen) * 100) : 0;
  const over = budgetYen > 0 && totals.yen > budgetYen;
  const catBreakdown = EXPENSE_CATEGORIES.filter((c) => totals.perCat.has(c.value)).map((c) => {
    const yen = totals.perCat.get(c.value) ?? 0;
    return { ...c, yen, eur: eur(yen), frac: totals.yen > 0 ? yen / totals.yen : 0 };
  });

  // Wer hat wie viel bezahlt (nach paidById; Name über die Mitgliederliste).
  const perPerson = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items) m.set(it.paidById ?? "?", (m.get(it.paidById ?? "?") ?? 0) + it.yen);
    const rows = [...m.entries()].map(([id, yen]) => ({
      name: members.find((x) => x.id === id)?.name ?? "Unbekannt",
      yen,
    }));
    return rows.sort((a, b) => b.yen - a.yen);
  }, [items, members]);

  // Ausgaben je Tag (aus createdAt), chronologisch — Verlauf über die Reise.
  const perDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items) {
      const day = it.createdAt?.slice(0, 10);
      if (day) m.set(day, (m.get(day) ?? 0) + it.yen);
    }
    return [...m.entries()]
      .map(([day, yen]) => ({ day, yen }))
      .sort((a, b) => a.day.localeCompare(b.day));
  }, [items]);
  const maxPerson = Math.max(1, ...perPerson.map((p) => p.yen));
  const maxDay = Math.max(1, ...perDay.map((d) => d.yen));

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!validYen) return;
    try {
      const created = await api.post<Item>("/api/v1/expenses", {
        category,
        label: label.trim(),
        yen: Math.round(parsedYen),
        paidById: paidById || undefined,
        shared,
      });
      // Gescanntes Beleg-Foto automatisch an die neue Ausgabe hängen.
      let item = created;
      if (pendingReceipt) {
        await api.patch(`/api/v1/expenses/${created.id}`, { receipt: pendingReceipt }).catch(() => {});
        item = { ...created, hasReceipt: true };
        setPendingReceipt(null);
      }
      setItems((prev) => [...prev, item]);
      setYenInput("");
      setLabel("");
      setShared(false);
    } catch {
      /* ignore */
    }
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
    api.delete(`/api/v1/expenses/${id}`).catch(() => {});
  }

  async function scanReceipt(file: File) {
    setScanning(true);
    setScanNote(null);
    // Außerhalb des try, damit das Foto im Fehlerfall erhalten bleibt.
    let dataUrl: string | null = null;
    try {
      dataUrl = await resizeReceipt(file);
      const r = await api.post<{
        yen: number;
        category?: ExpenseCategoryValue;
        label: string;
        /** Wie belastbar der Betrag ist — siehe `@/lib/receipt`. */
        source?: "total" | "taxIncluded" | "subtotal" | "guess";
        /** Woher die Kategorie kam — `fallback` heißt „geraten". */
        categoryFrom?: "keywords" | "history" | "fallback";
      }>("/api/v1/expenses/scan", { image: dataUrl });
      if (r.yen > 0) setYenInput(String(r.yen));
      // Die Route setzt inzwischen immer eine Kategorie (im Zweifel SONSTIGES),
      // damit ein unbekannter Beleg nicht auf der Voreinstellung „Essen" liegen
      // bleibt. `categoryFrom` sagt, ob sie erkannt oder nur eingeordnet wurde.
      if (r.category) setCategory(r.category);
      if (r.label) setLabel(r.label);
      setPendingReceipt(dataUrl); // wird beim Speichern automatisch angehängt
      setScanNote(scanNoteFor(r.yen, r.source, r.categoryFrom));
    } catch {
      // Die Fehlermeldung selbst (kein Key, Kontingent aufgebraucht, Beleg
      // unlesbar) erscheint als Toast. Das **Foto** aber behalten: es ist schon
      // aufgenommen und verkleinert, und es nach der Meldung ein zweites Mal
      // verlangen zu müssen wäre die eigentliche Zumutung.
      if (dataUrl && canReceiptPhoto) {
        setPendingReceipt(dataUrl);
        setScanNote("Nicht gelesen \u2013 Foto wird angeh\u00e4ngt, Betrag bitte eintippen.");
      }
    } finally {
      setScanning(false);
    }
  }

  /**
   * Beleg-Foto **ohne** Scan übernehmen.
   *
   * Zwei Gründe, warum das ein eigener Knopf ist und nicht nur ein Rückfall:
   * wer den Betrag ohnehin vor sich hat, spart ein Bild vom Monatskontingent —
   * und wer `canAiScan` nicht hat, kann seinen Beleg trotzdem dokumentieren.
   * Das Foto landet in `pendingReceipt` und wird beim Speichern angehängt,
   * denselben Weg, den auch der Scan nimmt.
   */
  async function attachPhotoOnly(file: File) {
    try {
      setScanNote(null);
      setPendingReceipt(await resizeReceipt(file));
    } catch {
      /* Fehlermeldung erscheint als Toast */
    }
  }

  async function attachReceipt(id: string, file: File) {
    try {
      const dataUrl = await resizeReceipt(file);
      await api.patch(`/api/v1/expenses/${id}`, { receipt: dataUrl });
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, hasReceipt: true } : it)));
    } catch {
      /* ignore */
    }
  }

  /**
   * Kategorie einer bereits erfassten Ausgabe ändern.
   *
   * Optimistisch, aber mit **Rücknahme** im Fehlerfall: die Liste ist die
   * Grundlage für Donut, Summen und Zollrechner — sie darf nicht etwas anderes
   * zeigen als die Datenbank hält. Die Fehlermeldung selbst kommt als Toast aus
   * dem API-Client.
   */
  async function changeCategory(id: string, category: ExpenseCategoryValue) {
    const before = items.find((it) => it.id === id)?.category;
    if (!before || before === category) return;
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, category } : it)));
    try {
      await api.patch(`/api/v1/expenses/${id}`, { category });
    } catch {
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, category: before } : it)));
    }
  }

  async function viewReceipt(id: string) {
    try {
      const r = await api.get<{ receipt: string | null }>(`/api/v1/expenses/${id}`);
      if (r.receipt) setReceiptView(r.receipt);
    } catch {
      /* ignore */
    }
  }

  function clearAll() {
    // Löscht die gesamte Ausgaben-Historie der Reise inklusive Belegfotos — für alle.
    if (
      !window.confirm(
        `${items.length} Ausgaben inkl. Belege für alle Mitglieder löschen? Das lässt sich nicht rückgängig machen.`,
      )
    ) {
      return;
    }
    setItems([]);
    api.delete("/api/v1/expenses").catch(() => {});
  }

  const inputClass =
    fieldClasses;

  return (
    <div className="space-y-6">
      {/* ⚠️ `min-w-0` an BEIDEN Rasterfeldern ist Pflicht, nicht Kosmetik.
          Eine Grid-Spur `1fr` bedeutet `minmax(auto, 1fr)`, und dieses `auto`
          ist die **min-content-Breite des Inhalts** — die Spur schrumpft also
          nie unter ihren breitesten Inhalt. In der Rechnungsliste ist das die
          längste Bezeichnung: bei „Matsumoto Kiyoshi" wuchs die einspaltige
          Handy-Ansicht auf 426 px und schob die ganze Seite 54 px über den
          Rand — trotz `truncate` und `min-w-0` an der Zeile selbst, denn die
          greifen erst innerhalb der Spur. Gemessen in
          `e2e/expense-categories-zoll.mjs`; `e2e/mobile-check.mjs` sah es nicht,
          weil es mit leerer Liste prüft. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(300px,1fr)_1.2fr]">
      {/* Eingabe */}
      <div className="flex min-w-0 flex-col gap-3">
        {/* Kurs-Banner */}
        <div className="rounded-card border border-hairline bg-surface shadow-card px-3 py-2 text-sm text-ink-muted">
          {rate === null ? (
            "Wechselkurs wird geladen…"
          ) : (
            <>
              Kurs: <span className="font-semibold">1.000 ¥ ≈ {eurFmt.format(1000 * rate)}</span>
              <span className="ml-2 text-xs text-ink-subtle">
                {rateEstimated ? "(geschätzt – Dienst nicht erreichbar)" : rateDate ? `Stand: ${rateDate}` : ""}
              </span>
            </>
          )}
        </div>

        <form
          onSubmit={addItem}
          className="rounded-card border border-hairline bg-surface shadow-card p-3"
        >
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {canAiScan && (
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-brand/50 bg-brand/10 px-3 py-2 text-sm font-medium text-brand transition hover:bg-brand/20">
                📸 {scanning ? "Beleg wird gelesen…" : "Beleg scannen"}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  disabled={scanning}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) scanReceipt(f);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
            {canReceiptPhoto && (
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-hairline px-3 py-2 text-sm font-medium text-ink-muted transition hover:border-brand/50 hover:text-brand">
                📷 Nur Foto
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) attachPhotoOnly(f);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
            {pendingReceipt && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400">
                Foto wird angehängt ✓
              </span>
            )}
            {scanNote && (
              <span className="text-xs text-amber-600 dark:text-amber-400">{scanNote}</span>
            )}
          </div>

          <div className="flex gap-2">
            <div className="w-32">
              <label htmlFor="ausgabe-betrag" className="mb-1 block text-xs font-medium text-ink-muted">
                Betrag (¥)
              </label>
              <input id="ausgabe-betrag"
                value={yenInput}
                onChange={(e) => setYenInput(e.target.value)}
                inputMode="decimal"
                placeholder="z. B. 1200"
                className={inputClass}
              />
            </div>
            <div className="flex-1">
              <label htmlFor="ausgabe-bezeichnung" className="mb-1 block text-xs font-medium text-ink-muted">
                Bezeichnung (optional)
              </label>
              <input id="ausgabe-bezeichnung"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="z. B. Ramen, Gunpla…"
                className={inputClass}
              />
            </div>
          </div>

          <div className="mt-2">
            <span className="mb-1 block text-xs font-medium text-ink-muted">
              Kategorie
            </span>
            <div className="flex flex-wrap gap-1.5">
              {EXPENSE_CATEGORIES.map((c) => {
                const selected = c.value === category;
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setCategory(c.value)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium text-slate-700 transition ${
                      selected ? "border-slate-700 ring-1 ring-slate-700" : "border-black/10 hover:border-slate-400"
                    }`}
                    style={{ backgroundColor: c.color }}
                    aria-pressed={selected}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          {members.length > 1 && (
            <div className="mt-2 flex items-end gap-3">
              <div className="flex-1">
                <label htmlFor="ausgabe-bezahlt-von" className="mb-1 block text-xs font-medium text-ink-muted">
                  Bezahlt von
                </label>
                <select id="ausgabe-bezahlt-von"
                  value={paidById}
                  onChange={(e) => setPaidById(e.target.value)}
                  className={inputClass}
                >
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                      {m.isMe ? " (ich)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <label
                className="flex shrink-0 cursor-pointer items-center gap-1.5 py-2 text-xs text-ink-muted"
                title="Aus: persönliche Ausgabe, wird nicht in die Abrechnung aufgeteilt"
              >
                <input
                  type="checkbox"
                  checked={shared}
                  onChange={(e) => setShared(e.target.checked)}
                  className="h-4 w-4 accent-brand"
                />
                Auf alle aufteilen
              </label>
            </div>
          )}

          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-sm text-ink-muted">
              ={" "}
              <span className="font-semibold text-ink">
                {validYen ? eurFmt.format(eur(parsedYen)) : "0,00 €"}
              </span>
            </span>
            <button
              type="submit"
              disabled={!validYen}
              className={buttonClasses("primary", "md")}
            >
              Zur Rechnung
            </button>
          </div>
        </form>

        <p className="text-xs text-ink-subtle">
          Wird in der Reise gespeichert und mit eingeladenen Mitgliedern geteilt.
        </p>
      </div>

      {/* Rechnung */}
      <div className="min-w-0 rounded-card border border-hairline bg-surface shadow-card">
        <div className="flex items-center justify-between border-b border-hairline px-3 py-2">
          <span className="text-sm font-medium text-ink-muted">
            Rechnung ({items.length})
          </span>
          {items.length > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="text-xs text-ink-muted transition hover:text-red-600"
            >
              Alles löschen
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-ink-subtle">
            Noch nichts erfasst. Betrag eingeben und „Zur Rechnung".
          </p>
        ) : (
          <ul>
            {items.map((it) => {
              const meta = expenseCategoryMeta(it.category);
              return (
                <li
                  key={it.id}
                  className="flex items-center gap-2 border-b border-hairline px-3 py-2 last:border-b-0"
                >
                  {/* Kategorie direkt in der Liste änderbar.
                      ⚠️ Ein natives <select> ist immer so breit wie seine
                      LÄNGSTE Option („Sightseeing") — als sichtbares Element
                      waren damit alle Pillen gleich lang und „Essen" hatte eine
                      große Lücke. Deshalb trägt die Pille den Text selbst (und
                      damit ihre Breite), und das <select> liegt unsichtbar
                      darüber: nativer Auswahldialog auf dem Handy, Tastatur und
                      Screenreader bleiben erhalten, `focus-within` zeichnet den
                      Fokus auf der Pille nach.
                      Feste Farben sind hier Absicht (siehe CLAUDE.md): der Grund
                      ist ein helles Pastell, dunkle Schrift muss bleiben. */}
                  <span
                    title="Kategorie ändern"
                    className="relative inline-flex shrink-0 items-center rounded-full border border-black/10 py-0.5 pl-2 pr-3.5 text-[11px] font-medium focus-within:ring-2 focus-within:ring-brand/60"
                    style={{ backgroundColor: meta.color, color: "#334155" }}
                  >
                    {meta.label}
                    <span aria-hidden className="absolute right-1 top-1/2 -translate-y-1/2 text-[8px] leading-none">
                      ▾
                    </span>
                    <select
                      value={it.category}
                      onChange={(e) => changeCategory(it.id, e.target.value as ExpenseCategoryValue)}
                      aria-label={`Kategorie von ${it.label || "Ausgabe"}`}
                      className="absolute inset-0 h-full w-full cursor-pointer appearance-none border-0 bg-transparent p-0 opacity-0"
                    >
                      {EXPENSE_CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink-muted">
                      {it.label || "—"}
                    </p>
                    {it.by && (
                      <p className="truncate text-[11px] text-ink-subtle">
                        von {it.by}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-right text-sm tabular-nums text-ink-muted">
                    {yenFmt.format(it.yen)}
                  </span>
                  <span className="w-20 shrink-0 text-right text-sm font-medium tabular-nums text-ink">
                    {eurFmt.format(eur(it.yen))}
                  </span>
                  {/* Ansehen darf jeder, der die Ausgabe sieht — anhängen nur mit
                      Recht. Ohne diese Bedingung wäre `canReceiptPhoto` mit zwei
                      Klicks umgangen: der Weg über die Liste führt auf denselben
                      Endpunkt wie der Knopf im Formular. */}
                  {it.hasReceipt ? (
                    <button
                      type="button"
                      onClick={() => viewReceipt(it.id)}
                      title="Beleg ansehen"
                      aria-label="Beleg ansehen"
                      className="shrink-0 rounded px-1.5 py-1 text-xs text-brand transition hover:bg-brand/10"
                    >
                      📎
                    </button>
                  ) : canReceiptPhoto ? (
                    <label
                      title="Beleg anhängen"
                      className="shrink-0 cursor-pointer rounded px-1.5 py-1 text-xs text-ink-subtle transition hover:text-brand"
                    >
                      📷
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (f) attachReceipt(it.id, f);
                        }}
                      />
                    </label>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => removeItem(it.id)}
                    className="shrink-0 rounded px-1.5 py-1 text-xs text-red-600 transition hover:bg-red-500/10 dark:text-red-400"
                    aria-label="Entfernen"
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {/* Summen */}
        {items.length > 0 && (
          <div className="border-t border-hairline px-3 py-2">
            <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1">
              {EXPENSE_CATEGORIES.filter((c) => totals.perCat.has(c.value)).map((c) => {
                const y = totals.perCat.get(c.value) ?? 0;
                return (
                  <span key={c.value} className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
                    <span className="h-2.5 w-2.5 rounded-sm border border-black/10" style={{ backgroundColor: c.color }} />
                    {c.label}: {eurFmt.format(eur(y))}
                  </span>
                );
              })}
            </div>
            <div className="flex items-center justify-between border-t border-hairline pt-2 text-sm font-semibold text-ink">
              <span>Gesamt</span>
              <span className="tabular-nums">
                {yenFmt.format(totals.yen)} · {eurFmt.format(eur(totals.yen))}
              </span>
            </div>
          </div>
        )}
      </div>
      </div>

      {items.length > 0 && (
        <div className="rounded-card border border-hairline bg-surface shadow-card p-4">
          <h2 className="mb-3 text-lg text-ink">Auswertung</h2>

          {/* Budget */}
          <div className="mb-4">
            <div className="mb-1.5 flex items-center gap-2">
              <label htmlFor="budget" className="text-xs font-medium text-ink-muted">
                Budget (¥)
              </label>
              <input
                id="budget"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                inputMode="decimal"
                placeholder="z. B. 200000"
                className={cn(fieldClasses, "w-32 px-2 py-1")}
              />
            </div>
            {budgetYen > 0 && (
              <>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(pct, 100)}%`,
                      backgroundColor: over ? "#e2001a" : "#009bc9",
                    }}
                  />
                </div>
                <p
                  className={`mt-1 text-xs ${
                    over ? "text-red-600 dark:text-red-400" : "text-ink-muted"
                  }`}
                >
                  {yenFmt.format(totals.yen)} von {yenFmt.format(budgetYen)} ({pct}%)
                  {over ? " — Budget überschritten!" : ` · ${yenFmt.format(budgetYen - totals.yen)} übrig`}
                </p>
              </>
            )}
          </div>

          {/* Donut + Legende */}
          <div className="flex flex-wrap items-center gap-6">
            <div className="relative">
              <Donut segments={catBreakdown.map((c) => ({ color: c.color, frac: c.frac }))} />
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[11px] text-ink-subtle">Gesamt</span>
                <span className="text-sm font-semibold text-ink">
                  {eurFmt.format(eur(totals.yen))}
                </span>
              </div>
            </div>
            <ul className="min-w-[240px] flex-1 space-y-2">
              {catBreakdown.map((c) => {
                const cBudget = toYen(catBudgets[c.value] ?? "");
                const cPct = cBudget > 0 ? Math.round((c.yen / cBudget) * 100) : 0;
                const cOver = cBudget > 0 && c.yen > cBudget;
                return (
                  <li key={c.value} className="text-sm">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 shrink-0 rounded-sm border border-black/10"
                        style={{ backgroundColor: c.color }}
                      />
                      <span className="text-ink-muted">{c.label}</span>
                      <span className="ml-auto tabular-nums text-ink-muted">
                        {eurFmt.format(c.eur)} · {Math.round(c.frac * 100)}%
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 pl-5">
                      <input
                        value={catBudgets[c.value] ?? ""}
                        onChange={(e) => setCatBudget(c.value, e.target.value)}
                        inputMode="decimal"
                        placeholder="Budget ¥"
                        aria-label={`Budget für ${c.label} (¥)`}
                        className={cn(fieldClasses, "w-24 px-1.5 py-0.5 text-xs")}
                      />
                      {cBudget > 0 && (
                        <div className="flex flex-1 items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                            <div
                              className={`h-full rounded-full ${cOver ? "bg-danger" : "bg-brand"}`}
                              style={{ width: `${Math.min(cPct, 100)}%` }}
                            />
                          </div>
                          <span
                            className={`shrink-0 text-[11px] tabular-nums ${
                              cOver
                                ? "text-red-600 dark:text-red-400"
                                : "text-ink-subtle"
                            }`}
                          >
                            {cPct}%
                          </span>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Wer hat bezahlt (nur sinnvoll ab 2 Zahlern) */}
          {perPerson.length > 1 && (
            <div className="mt-5">
              <p className="mb-2 text-xs font-medium text-ink-muted">
                Wer hat bezahlt
              </p>
              <BarList
                rows={perPerson.map((p) => ({
                  label: p.name,
                  value: `${yenFmt.format(p.yen)} · ${eurFmt.format(eur(p.yen))}`,
                  frac: p.yen / maxPerson,
                  title: `${p.name}: ${yenFmt.format(p.yen)}`,
                }))}
              />
            </div>
          )}

          {/* Verlauf: Ausgaben je Tag (ab 2 Tagen) */}
          {perDay.length > 1 && (
            <div className="mt-5">
              <p className="mb-2 text-xs font-medium text-ink-muted">
                Ausgaben je Tag
              </p>
              <BarList
                rows={perDay.map((d) => ({
                  label: new Date(`${d.day}T00:00:00Z`).toLocaleDateString("de-DE", {
                    weekday: "short",
                    day: "2-digit",
                    month: "2-digit",
                    timeZone: "UTC",
                  }),
                  value: `${yenFmt.format(d.yen)} · ${eurFmt.format(eur(d.yen))}`,
                  frac: d.yen / maxDay,
                  title: `${d.day}: ${yenFmt.format(d.yen)}`,
                }))}
              />
            </div>
          )}
        </div>
      )}

      {receiptView && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setReceiptView(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Beleg"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={receiptView}
            alt="Beleg"
            className="max-h-[90vh] max-w-full rounded-lg shadow-xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setReceiptView(null)}
            aria-label="Schließen"
            className="absolute right-4 top-4 rounded-full bg-white/90 px-3 py-1 text-sm font-medium text-slate-800 shadow"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
