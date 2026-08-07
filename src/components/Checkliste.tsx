"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/api/client";
import { useMembers } from "@/lib/useMembers";
import { buttonClasses } from "@/components/ui/Button";
import { fieldClasses } from "@/components/ui/Field";
import { cn } from "@/lib/cn";

interface Item {
  id: string;
  text: string;
  done: boolean;
  by?: string;
  assignee?: string;
  completedBy?: string;
}

// Typische Punkte für eine Japan-Reise (per Knopf einfügbar).
const JAPAN_TEMPLATE = [
  "Reisepass (mind. 6 Monate gültig)",
  "Visit Japan Web ausgefüllt (Einreise/Zoll)",
  "Flugtickets / Boarding-Pässe",
  "Hotel-Buchungsbestätigungen",
  "Auslandskrankenversicherung",
  "Bargeld (Yen) + Kreditkarte",
  "Suica/PASMO (IC-Karte für Bahn)",
  "Pocket-WiFi oder eSIM",
  "Steckdosen-Adapter (Typ A, 100 V)",
  "JR Pass (falls gebucht)",
  "Powerbank",
  "Reiseapotheke / Medikamente",
  "Regenschirm / Regenjacke",
  "Bequeme Schuhe",
];

export function Checkliste() {
  const [items, setItems] = useState<Item[]>([]);
  const [text, setText] = useState("");
  const members = useMembers();
  const myName = members.find((m) => m.isMe)?.name ?? "";

  useEffect(() => {
    api
      .get<Item[]>("/api/v1/checklist")
      .then(setItems)
      .catch(() => {});
  }, []);

  // Optimistisch aktualisieren + komplette Liste speichern (PUT-Replace).
  // Zuweisung als assigneeName mitsenden (der Server erwartet dieses Feld).
  function save(next: Item[]) {
    setItems(next);
    api
      .put<Item[]>("/api/v1/checklist", {
        items: next.map((it) => ({
          id: it.id,
          text: it.text,
          done: it.done,
          assigneeName: it.assignee ?? "",
          completedByName: it.completedBy ?? "",
        })),
      })
      .then(setItems)
      .catch(() => {});
  }

  const assign = (id: string, name: string) =>
    save(items.map((it) => (it.id === id ? { ...it, assignee: name } : it)));

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    save([...items, { id: crypto.randomUUID(), text: text.trim(), done: false }]);
    setText("");
  }

  // Beim Abhaken den eigenen Namen als „erledigt von" festhalten; beim Zurücksetzen leeren.
  const toggle = (id: string) =>
    save(
      items.map((it) => {
        if (it.id !== id) return it;
        const done = !it.done;
        return { ...it, done, completedBy: done ? myName : "" };
      }),
    );
  const remove = (id: string) => save(items.filter((it) => it.id !== id));
  const clearDone = () => save(items.filter((it) => !it.done));

  // Japan-Vorlage anhängen — nur Punkte, die (nach Text) noch nicht existieren.
  function insertTemplate() {
    const existing = new Set(items.map((it) => it.text.trim().toLowerCase()));
    const additions = JAPAN_TEMPLATE.filter((t) => !existing.has(t.toLowerCase())).map((t) => ({
      id: crypto.randomUUID(),
      text: t,
      done: false,
    }));
    if (additions.length > 0) save([...items, ...additions]);
  }

  const doneCount = items.filter((it) => it.done).length;

  return (
    <div className="max-w-xl">
      <form
        onSubmit={add}
        className="mb-4 flex gap-2 rounded-card border border-hairline bg-surface shadow-card p-3"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Neuer Punkt… (z. B. Reisepass, Adapter, JR-Pass)"
          className={fieldClasses}
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className={buttonClasses("primary", "md", "shrink-0")}
        >
          Hinzufügen
        </button>
      </form>

      <div className="rounded-card border border-hairline bg-surface shadow-card">
        <div className="flex items-center justify-between border-b border-hairline px-4 py-2">
          <span className="text-sm font-medium text-ink-muted">
            {items.length === 0 ? "Checkliste" : `${doneCount}/${items.length} erledigt`}
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={insertTemplate}
              className="text-xs text-brand transition hover:underline"
            >
              🇯🇵 Japan-Vorlage einfügen
            </button>
            {doneCount > 0 && (
              <button
                type="button"
                onClick={clearDone}
                className="text-xs text-ink-muted transition hover:text-red-600"
              >
                Erledigte löschen
              </button>
            )}
          </div>
        </div>

        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-subtle">
            Noch keine Punkte. Füge oben etwas hinzu.
          </p>
        ) : (
          items.map((it) => (
            <div
              key={it.id}
              className="flex items-center gap-3 border-b border-hairline px-4 py-2.5 last:border-b-0"
            >
              <input
                type="checkbox"
                checked={it.done}
                onChange={() => toggle(it.id)}
                className="h-4 w-4 accent-[#009bc9]"
              />
              <div className="min-w-0 flex-1">
                <span
                  className={`text-sm ${
                    it.done
                      ? "text-ink-subtle line-through"
                      : "text-ink"
                  }`}
                >
                  {it.text}
                </span>
                {it.by && (
                  <span className="ml-2 text-[11px] text-ink-subtle">· {it.by}</span>
                )}
                {it.assignee && (
                  <span className="ml-2 rounded bg-brand-tint/60 px-1.5 py-0.5 text-[11px] text-brand-dark dark:bg-brand/20 dark:text-brand-tint">
                    👤 {it.assignee}
                  </span>
                )}
                {it.done && it.completedBy && (
                  <span className="ml-2 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                    ✓ {it.completedBy}
                  </span>
                )}
              </div>
              {members.length > 1 && (
                <select
                  value={it.assignee ?? ""}
                  onChange={(e) => assign(it.id, e.target.value)}
                  aria-label="Zuweisen"
                  className={cn(fieldClasses, "shrink-0 px-1 py-0.5 text-xs text-ink-muted")}
                >
                  <option value="">— niemand</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.name}>
                      {m.name}
                      {m.isMe ? " (ich)" : ""}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={() => remove(it.id)}
                className="shrink-0 rounded px-1.5 py-1 text-xs text-red-600 transition hover:bg-red-500/10 dark:text-red-400"
                aria-label="Entfernen"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>

      <p className="mt-3 text-xs text-ink-subtle">
        Wird in deinem Konto gespeichert (gerätesynchron).
      </p>
    </div>
  );
}
