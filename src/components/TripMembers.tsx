"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/api/client";

interface Member {
  id: string;
  name: string;
  email: string;
  isMe: boolean;
}

export function TripMembers() {
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ members: Member[] }>("/api/v1/trip/members")
      .then((d) => setMembers(d.members))
      .catch(() => {});
  }, []);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setPending(true);
    setError(null);
    setInfo(null);
    try {
      const d = await api.post<{ member: Member }>("/api/v1/trip/members", {
        email: email.trim(),
      });
      setMembers((prev) => [...prev.filter((m) => m.id !== d.member.id), d.member]);
      setInfo(`${d.member.name} wurde eingeladen.`);
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Einladen fehlgeschlagen.");
    } finally {
      setPending(false);
    }
  }

  function remove(id: string) {
    setMembers((prev) => prev.filter((m) => m.id !== id));
    api.delete(`/api/v1/trip/members/${id}`).catch(() => {});
  }

  return (
    <div className="max-w-xl">
      <form
        onSubmit={invite}
        className="mb-4 flex gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3"
      >
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-Mail der Person (bestehendes Konto)"
          className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <button
          type="submit"
          disabled={pending || !email.trim()}
          className="shrink-0 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "…" : "Einladen"}
        </button>
      </form>
      {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {info && <p className="mb-3 text-sm text-emerald-600 dark:text-emerald-400">{info}</p>}

      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <div className="border-b border-slate-100 dark:border-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200">
          Mitglieder ({members.length})
        </div>
        {members.map((m) => (
          <div
            key={m.id}
            className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 px-4 py-2.5 last:border-b-0"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                {m.name}
                {m.isMe && <span className="ml-1 text-xs text-slate-400">(du)</span>}
              </p>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">{m.email}</p>
            </div>
            {!m.isMe && (
              <button
                type="button"
                onClick={() => remove(m.id)}
                className="shrink-0 rounded px-2 py-1 text-xs text-red-600 transition hover:bg-red-500/10 dark:text-red-400"
              >
                Entfernen
              </button>
            )}
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
        Eingeladene Mitglieder bearbeiten Reiseplaner, Ausgaben, Tagesplaner und Checkliste
        gemeinsam. Die Person muss bereits ein Konto haben; beim Einladen wechselt sie in diese
        Reise (ihre bisherigen Japan-Einträge bleiben in ihrer alten Reise).
      </p>
    </div>
  );
}
