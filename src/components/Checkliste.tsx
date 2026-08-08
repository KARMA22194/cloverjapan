"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/api/client";
import { useMembers } from "@/lib/useMembers";
import { buttonClasses } from "@/components/ui/Button";
import { fieldClasses } from "@/components/ui/Field";
import { Chip } from "@/components/ui/Chip";
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
          placeholder="Neuer Punkt…"
          // `min-w-0`: ohne das kann das Feld neben dem Knopf nicht schrumpfen und
          // schiebt ihn auf schmalen Bildschirmen aus der Zeile.
          className={cn(fieldClasses, "min-w-0")}
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
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-hairline px-4 py-2">
          <span className="text-sm font-bold text-ink">
            {items.length === 0 ? "Checkliste" : `${doneCount}/${items.length} erledigt`}
          </span>
          <div className="flex flex-wrap items-center gap-3">
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
            // `flex-wrap` + `basis-48` am Textblock: reicht der Platz nicht (Handy),
            // rutschen Auswahl und ✕ in eine zweite Zeile, statt den Text auf ein
            // paar Pixel zusammenzudrücken.
            <div
              key={it.id}
              className="flex flex-wrap items-start gap-x-3 gap-y-2 border-b border-hairline px-4 py-2.5 last:border-b-0"
            >
              <input
                type="checkbox"
                checked={it.done}
                onChange={() => toggle(it.id)}
                aria-label={it.text}
                className="mt-1 h-4 w-4 shrink-0 accent-brand"
              />
              <div className="min-w-0 flex-1 basis-48">
                <span
                  className={`block break-words text-sm ${
                    it.done ? "text-ink-subtle line-through" : "text-ink"
                  }`}
                >
                  {it.text}
                </span>
                {(it.by || it.assignee || (it.done && it.completedBy)) && (
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {it.by && <span className="text-[11px] text-ink-subtle">· {it.by}</span>}
                    {it.assignee && <Chip tone="brand">👤 {it.assignee}</Chip>}
                    {it.done && it.completedBy && (
                      <Chip tone="success">✓ {it.completedBy}</Chip>
                    )}
                  </div>
                )}
              </div>
              {members.length > 1 && (
                <select
                  value={it.assignee ?? ""}
                  onChange={(e) => assign(it.id, e.target.value)}
                  aria-label="Zuweisen"
                  // `w-auto` hebt das `w-full` der Rezeptur auf — sonst beansprucht
                  // die Auswahl die ganze Zeile und `shrink-0` lässt sie nicht nach.
                  className={cn(
                    fieldClasses,
                    "ml-auto w-auto max-w-40 shrink-0 px-1.5 py-1 text-xs text-ink-muted",
                  )}
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
                className={cn(
                  "shrink-0 rounded-field px-1.5 py-1 text-xs text-danger transition hover:bg-danger/10",
                  members.length > 1 ? "" : "ml-auto",
                )}
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
