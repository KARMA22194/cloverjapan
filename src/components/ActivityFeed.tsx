"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/api/client";

interface Entry {
  id: string;
  userName: string;
  action: string;
  summary: string;
  createdAt: string;
}

const VERB: Record<string, { emoji: string; text: string }> = {
  "booking.create": { emoji: "🎟️", text: "Buchung hinzugefügt" },
  "expense.create": { emoji: "💴", text: "Ausgabe erfasst" },
  "wishlist.create": { emoji: "🛍️", text: "Wunsch notiert" },
  "task.create": { emoji: "📝", text: "Aufgabe angelegt" },
  "flight.create": { emoji: "✈️", text: "Flug erfasst" },
  "stamp.collect": { emoji: "⛩️", text: "Stempel gesammelt" },
};

/** "vor 3 Min", "vor 2 Std", "gestern", sonst Datum. */
function relTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const min = Math.round(diff / 60_000);
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${min} Min`;
  const std = Math.round(min / 60);
  if (std < 24) return `vor ${std} Std`;
  const tage = Math.round(std / 24);
  if (tage === 1) return "gestern";
  if (tage < 7) return `vor ${tage} Tagen`;
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" }).format(then);
}

export function ActivityFeed() {
  const [items, setItems] = useState<Entry[] | null>(null);

  useEffect(() => {
    api
      .get<Entry[]>("/api/v1/activity")
      .then(setItems)
      .catch(() => setItems([]));
  }, []);

  // Vor dem Laden oder wenn leer: nichts anzeigen (Dashboard bleibt aufgeräumt).
  if (!items || items.length === 0) return null;

  return (
    <div className="rounded-card border border-hairline bg-surface shadow-card p-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-subtle">
        Zuletzt im Team
      </p>
      <ul className="space-y-2">
        {items.slice(0, 6).map((e) => {
          const v = VERB[e.action] ?? { emoji: "•", text: e.action };
          return (
            <li key={e.id} className="flex items-start gap-2 text-sm">
              <span className="shrink-0" aria-hidden>
                {v.emoji}
              </span>
              <span className="min-w-0 flex-1 text-ink-muted">
                <span className="font-medium">{e.userName || "Jemand"}</span>{" "}
                <span className="text-ink-muted">{v.text}:</span>{" "}
                <span className="text-ink">{e.summary}</span>
              </span>
              <span className="shrink-0 whitespace-nowrap text-[11px] text-ink-subtle">
                {relTime(e.createdAt)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
