"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { api } from "@/lib/api/client";
import { autoCategoryForDate, noteCategoryMeta } from "@/lib/notes";
import type { NoteDto } from "@/lib/api/dto";

export function DayNotes({ dateParam, notes }: { dateParam: string; notes: NoteDto[] }) {
  const router = useRouter();

  // Kategorie ist an den Wochentag gebunden (erzwungen) — kein manueller Picker.
  const forced = autoCategoryForDate(dateParam);
  const forcedMeta = noteCategoryMeta(forced);

  const [newContent, setNewContent] = useState("");
  const [addPending, setAddPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!newContent.trim()) return;
    setAddPending(true);
    setError(null);
    try {
      await api.post("/api/v1/notes", {
        date: dateParam,
        content: newContent,
        category: forced, // durch den Wochentag bestimmt
      });
      setNewContent("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Speichern.");
    } finally {
      setAddPending(false);
    }
  }

  function startEdit(note: NoteDto) {
    setEditingId(note.id);
    setEditContent(note.content);
    setError(null);
  }

  async function saveEdit(id: string) {
    if (!editContent.trim()) return;
    setBusyId(id);
    setError(null);
    try {
      // Nur der Inhalt ist editierbar — die Kategorie folgt dem Datum.
      await api.patch(`/api/v1/notes/${id}`, { content: editContent });
      setEditingId(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Speichern.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await api.delete(`/api/v1/notes/${id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Löschen.");
      setBusyId(null);
    }
  }

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-lg text-slate-900 dark:text-slate-100">Notizen</h2>

      {/* Neue Notiz — Kategorie ist durch den Wochentag vorgegeben. */}
      <form
        onSubmit={addNote}
        className="mb-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3"
      >
        <textarea
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          placeholder="Was hast du heute gemacht?"
          rows={newContent ? 3 : 1}
          className="w-full resize-none rounded-md border border-slate-300 dark:border-slate-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            Kategorie (automatisch):
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-black/10 px-2.5 py-1 font-medium text-slate-700"
              style={{ backgroundColor: forcedMeta.color }}
            >
              <span className="h-2 w-2 rounded-full bg-slate-700/40" />
              {forcedMeta.label}
            </span>
          </span>
          <button
            type="submit"
            disabled={addPending || !newContent.trim()}
            className="inline-flex items-center justify-center rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            {addPending ? "Speichern…" : "Hinzufügen"}
          </button>
        </div>
      </form>

      {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {/* Karten (Keep-Masonry via CSS-Columns) */}
      {notes.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 dark:border-slate-700 px-4 py-6 text-center text-sm text-slate-400 dark:text-slate-500">
          Noch keine Notizen für diesen Tag.
        </p>
      ) : (
        <div className="gap-3 [column-fill:_balance] sm:columns-2 lg:columns-3">
          {notes.map((note) => {
            const meta = noteCategoryMeta(note.category);
            const isEditing = editingId === note.id;
            const busy = busyId === note.id;

            return (
              <div
                key={note.id}
                style={{ backgroundColor: meta.color }}
                className="mb-3 break-inside-avoid rounded-lg border border-black/10 p-3 text-slate-800 shadow-sm"
              >
                {isEditing ? (
                  <>
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={4}
                      className="w-full resize-none rounded-md border border-black/15 bg-white/70 px-2 py-1.5 text-sm text-slate-800 outline-none focus:border-slate-500"
                    />
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => saveEdit(note.id)}
                        disabled={busy || !editContent.trim()}
                        className="rounded-md bg-slate-800 px-3 py-1 text-xs font-medium text-white transition hover:bg-slate-900 disabled:opacity-50"
                      >
                        {busy ? "…" : "Speichern"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded-md border border-black/15 px-3 py-1 text-xs text-slate-700 transition hover:bg-black/5"
                      >
                        Abbrechen
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="rounded-full bg-black/10 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                        {meta.label}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {new Date(note.createdAt).toLocaleTimeString("de-DE", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm text-slate-800">
                      {note.content}
                    </p>
                    <div className="mt-2 flex items-center justify-end gap-1 border-t border-black/10 pt-2">
                      <button
                        type="button"
                        onClick={() => startEdit(note)}
                        className="rounded px-2 py-1 text-xs text-slate-600 transition hover:bg-black/5"
                      >
                        Bearbeiten
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(note.id)}
                        disabled={busy}
                        className="rounded px-2 py-1 text-xs text-red-600 transition hover:bg-red-500/10 disabled:opacity-50"
                      >
                        Löschen
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
