"use client";

import { useEffect, useMemo, useState } from "react";

import { api } from "@/lib/api/client";
import { eurFmt, yenFmt } from "@/lib/format";

interface Member {
  id: string;
  name: string;
  isMe: boolean;
}
interface Expense {
  yen: number;
  paidById?: string | null;
  shared?: boolean;
}
interface Settlement {
  id: string;
  fromId: string;
  toId: string;
  fromName: string;
  toName: string;
  yen: number;
}


export function Abrechnung() {
  const [members, setMembers] = useState<Member[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [rate, setRate] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<{ members: Member[] }>("/api/v1/trip/members").then((r) => setMembers(r.members)),
      api.get<Expense[]>("/api/v1/expenses").then(setExpenses),
      api.get<Settlement[]>("/api/v1/settlements").then(setSettlements),
    ])
      .catch(() => {})
      .finally(() => setLoaded(true));
    api
      .get<{ rate: number }>("/api/v1/fx/rate?from=JPY&to=EUR")
      .then((r) => setRate(r.rate))
      .catch(() => {});
  }, []);

  // Betrag als bezahlt verbuchen (Zahlung from→to) bzw. rückgängig machen.
  async function markPaid(t: { fromId: string; toId: string; fromName: string; toName: string; yen: number }) {
    setBusy(true);
    try {
      const s = await api.post<Settlement>("/api/v1/settlements", t);
      setSettlements((prev) => [...prev, s]);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }

  async function undoSettlement(id: string) {
    setSettlements((prev) => prev.filter((s) => s.id !== id));
    api.delete(`/api/v1/settlements/${id}`).catch(() => {});
  }

  const calc = useMemo(() => {
    const memberIds = new Set(members.map((m) => m.id));
    // Nur geteilte Ausgaben mit zugeordnetem (aktuellem) Zahler fließen in die Aufteilung.
    const counted = expenses.filter(
      (e) => e.shared !== false && e.paidById && memberIds.has(e.paidById),
    );
    const personal = expenses.filter((e) => e.shared === false).length;
    const unassigned = expenses.filter(
      (e) => e.shared !== false && (!e.paidById || !memberIds.has(e.paidById)),
    ).length;
    const total = counted.reduce((s, e) => s + e.yen, 0);
    const n = members.length;
    const share = n > 0 ? total / n : 0;

    const paid = new Map<string, number>();
    for (const e of counted) paid.set(e.paidById!, (paid.get(e.paidById!) ?? 0) + e.yen);

    const balances = members.map((m) => ({
      id: m.id,
      name: m.name,
      isMe: m.isMe,
      paid: paid.get(m.id) ?? 0,
      balance: (paid.get(m.id) ?? 0) - share,
    }));

    // Verbuchte Zahlungen anrechnen: from zahlt to → from-Schuld sinkt, to-Guthaben sinkt.
    const byId = new Map(balances.map((b) => [b.id, b]));
    for (const s of settlements) {
      const f = byId.get(s.fromId);
      const t = byId.get(s.toId);
      if (f) f.balance += s.yen;
      if (t) t.balance -= s.yen;
    }

    // Ausgleich (greedy): Schuldner zahlen an Gläubiger.
    const debtors = balances
      .filter((b) => b.balance < -0.5)
      .map((b) => ({ id: b.id, name: b.name, amt: -b.balance }))
      .sort((a, b) => b.amt - a.amt);
    const creditors = balances
      .filter((b) => b.balance > 0.5)
      .map((b) => ({ id: b.id, name: b.name, amt: b.balance }))
      .sort((a, b) => b.amt - a.amt);

    const transfers: { fromId: string; toId: string; fromName: string; toName: string; yen: number }[] = [];
    let i = 0;
    let j = 0;
    while (i < debtors.length && j < creditors.length) {
      const amt = Math.min(debtors[i].amt, creditors[j].amt);
      if (Math.round(amt) > 0) {
        transfers.push({
          fromId: debtors[i].id,
          toId: creditors[j].id,
          fromName: debtors[i].name,
          toName: creditors[j].name,
          yen: Math.round(amt),
        });
      }
      debtors[i].amt -= amt;
      creditors[j].amt -= amt;
      if (debtors[i].amt < 0.5) i++;
      if (creditors[j].amt < 0.5) j++;
    }

    return { total, share, balances, transfers, unassigned, personal };
  }, [members, expenses, settlements]);

  const eur = (yen: number) => (rate ? eurFmt.format(yen * rate) : null);

  if (!loaded) {
    return <p className="text-sm text-ink-subtle">Lädt…</p>;
  }

  if (members.length < 2) {
    return (
      <p className="rounded-card border border-hairline bg-surface shadow-card px-4 py-8 text-center text-sm text-ink-subtle">
        Die Abrechnung teilt Ausgaben unter allen Reise-Mitgliedern auf. Lade unter „Mitglieder"
        jemanden ein, dann rechnet sich hier, wer wem was schuldet.
      </p>
    );
  }

  return (
    <div className="max-w-xl space-y-4">
      <div className="rounded-card border border-hairline bg-surface shadow-card p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-ink-muted">Gesamt (aufgeteilt)</span>
          <span className="text-lg font-semibold text-ink">
            {yenFmt.format(calc.total)}
          </span>
        </div>
        <p className="mt-1 text-xs text-ink-subtle">
          {yenFmt.format(Math.round(calc.share))} pro Person ({members.length} Mitglieder, gleichmäßig geteilt).
          {calc.personal > 0 && ` ${calc.personal} persönliche Ausgabe(n) nicht aufgeteilt.`}
          {calc.unassigned > 0 && ` ${calc.unassigned} ohne Zahler nicht berücksichtigt.`}
        </p>
      </div>

      {/* Saldo je Person */}
      <div className="rounded-card border border-hairline bg-surface shadow-card">
        <div className="border-b border-hairline px-4 py-2 text-sm font-medium text-ink-muted">
          Saldo je Person
        </div>
        <ul>
          {calc.balances.map((b) => {
            const positive = b.balance > 0.5;
            const negative = b.balance < -0.5;
            return (
              <li
                key={b.name}
                className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-2.5 last:border-b-0"
              >
                <div className="min-w-0">
                  <span className="text-sm text-ink">
                    {b.name}
                    {b.isMe && " (ich)"}
                  </span>
                  <span className="ml-2 text-[11px] text-ink-subtle">
                    gezahlt {yenFmt.format(b.paid)}
                  </span>
                </div>
                <span
                  className={`shrink-0 text-sm font-medium ${
                    positive
                      ? "text-green-600 dark:text-green-400"
                      : negative
                        ? "text-red-600 dark:text-red-400"
                        : "text-ink-subtle"
                  }`}
                  title={positive ? "bekommt zurück" : negative ? "schuldet" : "ausgeglichen"}
                >
                  {positive ? "+" : ""}
                  {yenFmt.format(Math.round(b.balance))}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Ausgleich */}
      <div className="rounded-card border border-hairline bg-surface shadow-card">
        <div className="border-b border-hairline px-4 py-2 text-sm font-medium text-ink-muted">
          Ausgleich – wer zahlt wem
        </div>
        {calc.transfers.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-ink-subtle">
            Alles ausgeglichen 🎉
          </p>
        ) : (
          <ul>
            {calc.transfers.map((t, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-2.5 last:border-b-0 text-sm"
              >
                <span className="min-w-0 text-ink">
                  <span className="text-red-600 dark:text-red-400">{t.fromName}</span> →{" "}
                  <span className="text-green-600 dark:text-green-400">{t.toName}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-right">
                    <span className="font-medium text-ink">
                      {yenFmt.format(t.yen)}
                    </span>
                    {eur(t.yen) && (
                      <span className="ml-1 text-[11px] text-ink-subtle">
                        ≈ {eur(t.yen)}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => markPaid(t)}
                    className="shrink-0 rounded-md border border-brand px-2 py-1 text-xs font-medium text-brand transition hover:bg-brand hover:text-white disabled:opacity-50"
                  >
                    Bezahlt
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Verbuchte Zahlungen (mit Undo) */}
      {settlements.length > 0 && (
        <div className="rounded-card border border-hairline bg-surface shadow-card">
          <div className="border-b border-hairline px-4 py-2 text-sm font-medium text-ink-muted">
            Beglichen
          </div>
          <ul>
            {settlements.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-2.5 last:border-b-0 text-sm"
              >
                <span className="min-w-0 text-ink-muted line-through">
                  {s.fromName} → {s.toName} · {yenFmt.format(s.yen)}
                </span>
                <button
                  type="button"
                  onClick={() => undoSettlement(s.id)}
                  className="shrink-0 rounded px-2 py-1 text-xs text-ink-muted transition hover:text-red-600"
                >
                  rückgängig
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-ink-subtle">
        Gleichmäßige Aufteilung aller zugeordneten Ausgaben unter allen Mitgliedern. Den Zahler
        legst du beim Erfassen im Ausgabenrechner fest.
      </p>
    </div>
  );
}
