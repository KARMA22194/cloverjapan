"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/api/client";
import { Avatar } from "@/components/Avatar";

interface Member {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  isMe: boolean;
}

export function TripMembers() {
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<{ url: string; email: string } | null>(null);
  const [copied, setCopied] = useState(false);

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
    setInviteLink(null);
    setCopied(false);
    try {
      const d = await api.post<
        | { member: Member; emailSent: boolean }
        | { invited: true; email: string; inviteUrl: string; emailSent: boolean }
      >("/api/v1/trip/members", { email: email.trim() });

      if ("invited" in d) {
        // Person ohne Konto → Registrierungs-Link zum Teilen.
        setInviteLink({ url: d.inviteUrl, email: d.email });
        setInfo(
          d.emailSent
            ? `Einladung an ${d.email} gesendet. Registrierungs-Link auch hier:`
            : `${d.email} hat noch kein Konto. Schick ihr diesen Registrierungs-Link:`,
        );
      } else {
        setMembers((prev) => [...prev.filter((m) => m.id !== d.member.id), d.member]);
        setInfo(
          d.emailSent
            ? `${d.member.name} eingeladen — E-Mail gesendet.`
            : `${d.member.name} hinzugefügt (keine E-Mail konfiguriert).`,
        );
      }
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Einladen fehlgeschlagen.");
    } finally {
      setPending(false);
    }
  }

  async function copyLink() {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
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
          placeholder="E-Mail der Person"
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
      {info && <p className="mb-2 text-sm text-emerald-600 dark:text-emerald-400">{info}</p>}
      {inviteLink && (
        <div className="mb-3 flex gap-2 rounded-lg border border-brand/40 bg-brand-tint/30 dark:bg-brand/10 p-2">
          <input
            readOnly
            value={inviteLink.url}
            onFocus={(e) => e.target.select()}
            className="w-full truncate rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1.5 text-xs text-slate-600 dark:text-slate-300 outline-none"
          />
          <button
            type="button"
            onClick={copyLink}
            className="shrink-0 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white transition hover:bg-brand-dark"
          >
            {copied ? "Kopiert ✓" : "Kopieren"}
          </button>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <div className="border-b border-slate-100 dark:border-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200">
          Mitglieder ({members.length})
        </div>
        {members.map((m) => (
          <div
            key={m.id}
            className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 px-4 py-2.5 last:border-b-0"
          >
            <Avatar name={m.name} image={m.image} size={36} />
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
        gemeinsam. Hat die Person schon ein Konto, wechselt sie sofort in diese Reise; hat sie
        noch keins, bekommt sie einen Registrierungs-Link (per E-Mail und/oder zum Teilen).
      </p>
    </div>
  );
}
