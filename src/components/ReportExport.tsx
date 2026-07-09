"use client";

import { useState } from "react";

import { api } from "@/lib/api/client";
import { MONTHS_DE } from "@/lib/time";

interface ProjectMeta {
  id: string;
  code: string;
  name: string;
}
interface MonthReport {
  projects: ProjectMeta[];
  days: number[];
  cell: Record<string, Record<string, number>>;
  perDay: Record<string, number>;
  perProject: Record<string, number>;
  total: number;
}
interface YearReport {
  projects: ProjectMeta[];
  months: number[];
  cell: Record<string, Record<string, number>>;
  perMonth: Record<string, number>;
  perProject: Record<string, number>;
  total: number;
}

/** Minuten → Stunden mit deutschem Dezimalkomma; leer bei 0. */
function h(min?: number): string {
  if (!min) return "";
  return String(Math.round((min / 60) * 100) / 100).replace(".", ",");
}

function toCsv(rows: string[][]): string {
  return rows
    .map((r) =>
      r
        .map((cell) => (/[";\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell))
        .join(";"),
    )
    .join("\r\n");
}

function download(filename: string, rows: string[][]) {
  const csv = "﻿" + toCsv(rows); // BOM → Excel erkennt UTF-8
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ReportExport({
  type,
  year,
  month,
}: {
  type: "month" | "year";
  year: number;
  month?: number;
}) {
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      if (type === "month" && month) {
        const r = await api.get<MonthReport>(`/api/v1/reports/month?year=${year}&month=${month}`);
        const header = ["Tag", ...r.projects.map((p) => p.code), "Summe"];
        const body = r.days.map((d) => [
          String(d),
          ...r.projects.map((p) => h(r.cell[d]?.[p.id])),
          h(r.perDay[d]),
        ]);
        const footer = ["Gesamt", ...r.projects.map((p) => h(r.perProject[p.id])), h(r.total)];
        download(`zeiten-${year}-${String(month).padStart(2, "0")}.csv`, [header, ...body, footer]);
      } else {
        const r = await api.get<YearReport>(`/api/v1/reports/year?year=${year}`);
        const header = ["Monat", ...r.projects.map((p) => p.code), "Summe"];
        const body = r.months.map((m) => [
          MONTHS_DE[m - 1],
          ...r.projects.map((p) => h(r.cell[m]?.[p.id])),
          h(r.perMonth[m]),
        ]);
        const footer = ["Gesamt", ...r.projects.map((p) => h(r.perProject[p.id])), h(r.total)];
        download(`zeiten-${year}.csv`, [header, ...body, footer]);
      }
    } catch {
      /* Fehler bewusst still — Button bleibt nutzbar */
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      className="rounded-md border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-sm text-slate-700 dark:text-slate-200 transition hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
    >
      {busy ? "Export…" : "⬇ CSV-Export"}
    </button>
  );
}
