"use client";

import { useEffect, useMemo, useState } from "react";

import { api } from "@/lib/api/client";

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

const yenFmt = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});
const eurFmt = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

export function Abrechnung() {
  const [members, setMembers] = useState<Member[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [rate, setRate] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<{ members: Member[] }>("/api/v1/trip/members").then((r) => setMembers(r.members)),
      api.get<Expense[]>("/api/v1/expenses").then(setExpenses),
    ])
      .catch(() => {})
      .finally(() => setLoaded(true));
    api
      .get<{ rate: number }>("/api/v1/fx/rate?from=JPY&to=EUR")
      .then((r) => setRate(r.rate))
      .catch(() => {});
  }, []);

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
      name: m.name,
      isMe: m.isMe,
      paid: paid.get(m.id) ?? 0,
      balance: (paid.get(m.id) ?? 0) - share,
    }));

    // Ausgleich (greedy): Schuldner zahlen an Gläubiger.
    const debtors = balances
      .filter((b) => b.balance < -0.5)
      .map((b) => ({ name: b.name, amt: -b.balance }))
      .sort((a, b) => b.amt - a.amt);
    const creditors = balances
      .filter((b) => b.balance > 0.5)
      .map((b) => ({ name: b.name, amt: b.balance }))
      .sort((a, b) => b.amt - a.amt);

    const transfers: { from: string; to: string; yen: number }[] = [];
    let i = 0;
    let j = 0;
    while (i < debtors.length && j < creditors.length) {
      const amt = Math.min(debtors[i].amt, creditors[j].amt);
      if (Math.round(amt) > 0) {
        transfers.push({ from: debtors[i].name, to: creditors[j].name, yen: Math.round(amt) });
      }
      debtors[i].amt -= amt;
      creditors[j].amt -= amt;
      if (debtors[i].amt < 0.5) i++;
      if (creditors[j].amt < 0.5) j++;
    }

    return { total, share, balances, transfers, unassigned, personal };
  }, [members, expenses]);

  const eur = (yen: number) => (rate ? eurFmt.format(yen * rate) : null);

  if (!loaded) {
    return <p className="text-sm text-slate-400 dark:text-slate-500">Lädt…</p>;
  }

  if (members.length < 2) {
    return (
      <p className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-500">
        Die Abrechnung teilt Ausgaben unter allen Reise-Mitgliedern auf. Lade unter „Mitglieder"
        jemanden ein, dann rechnet sich hier, wer wem was schuldet.
      </p>
    );
  }

  return (
    <div className="max-w-xl space-y-4">
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-slate-500 dark:text-slate-400">Gesamt (aufgeteilt)</span>
          <span className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {yenFmt.format(calc.total)}
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
          {yenFmt.format(Math.round(calc.share))} pro Person ({members.length} Mitglieder, gleichmäßig geteilt).
          {calc.personal > 0 && ` ${calc.personal} persönliche Ausgabe(n) nicht aufgeteilt.`}
          {calc.unassigned > 0 && ` ${calc.unassigned} ohne Zahler nicht berücksichtigt.`}
        </p>
      </div>

      {/* Saldo je Person */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <div className="border-b border-slate-100 dark:border-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200">
          Saldo je Person
        </div>
        <ul>
          {calc.balances.map((b) => {
            const positive = b.balance > 0.5;
            const negative = b.balance < -0.5;
            return (
              <li
                key={b.name}
                className="flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 px-4 py-2.5 last:border-b-0"
              >
                <div className="min-w-0">
                  <span className="text-sm text-slate-800 dark:text-slate-100">
                    {b.name}
                    {b.isMe && " (ich)"}
                  </span>
                  <span className="ml-2 text-[11px] text-slate-400 dark:text-slate-500">
                    gezahlt {yenFmt.format(b.paid)}
                  </span>
                </div>
                <span
                  className={`shrink-0 text-sm font-medium ${
                    positive
                      ? "text-green-600 dark:text-green-400"
                      : negative
                        ? "text-red-600 dark:text-red-400"
                        : "text-slate-400 dark:text-slate-500"
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
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <div className="border-b border-slate-100 dark:border-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200">
          Ausgleich – wer zahlt wem
        </div>
        {calc.transfers.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-400 dark:text-slate-500">
            Alles ausgeglichen 🎉
          </p>
        ) : (
          <ul>
            {calc.transfers.map((t, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 px-4 py-2.5 last:border-b-0 text-sm"
              >
                <span className="text-slate-800 dark:text-slate-100">
                  <span className="text-red-600 dark:text-red-400">{t.from}</span> → {" "}
                  <span className="text-green-600 dark:text-green-400">{t.to}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    {yenFmt.format(t.yen)}
                  </span>
                  {eur(t.yen) && (
                    <span className="ml-1 text-[11px] text-slate-400 dark:text-slate-500">
                      ≈ {eur(t.yen)}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-slate-400 dark:text-slate-500">
        Gleichmäßige Aufteilung aller zugeordneten Ausgaben unter allen Mitgliedern. Den Zahler
        legst du beim Erfassen im Ausgabenrechner fest.
      </p>
    </div>
  );
}
