"use client";

import { useCallback, useEffect, useState } from "react";

import { api } from "@/lib/api/client";
import { Avatar } from "@/components/Avatar";
import { buttonClasses } from "@/components/ui/Button";
import { fieldClasses } from "@/components/ui/Field";

interface Member {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  isMe: boolean;
  isOwner: boolean;
  canManage: boolean;
  lastSeenAt?: string | null;
}

// Bis zu dieser Stille gilt jemand als „online". Der Heartbeat kommt alle 2 min
// (PresenceHeartbeat) → 5 min überbrücken einen verpassten Ping, ohne dass jemand
// sofort als „offline" erscheint, während die App noch offen ist.
const ONLINE_MS = 5 * 60 * 1000;

function isOnline(lastSeenAt?: string | null): boolean {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < ONLINE_MS;
}

/** „online" / „vor X Min" / „vor X Std" / „vor X Tagen" bzw. null = nie gesehen. */
function presenceLabel(lastSeenAt?: string | null): string | null {
  if (!lastSeenAt) return null;
  const ms = Date.now() - new Date(lastSeenAt).getTime();
  if (ms < ONLINE_MS) return "online";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `zuletzt vor ${min} Min`;
  const std = Math.floor(min / 60);
  if (std < 24) return `zuletzt vor ${std} Std`;
  const tage = Math.floor(std / 24);
  return `zuletzt vor ${tage} ${tage === 1 ? "Tag" : "Tagen"}`;
}

/** Genauer Zeitpunkt für den Tooltip, z. B. „zuletzt online: 17.07.2026, 11:44 Uhr". */
function exactSeen(lastSeenAt?: string | null): string {
  if (!lastSeenAt) return "noch nie online";
  const d = new Date(lastSeenAt).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `zuletzt online: ${d} Uhr`;
}

interface Invitation {
  id: string;
  email: string;
  invitedBy: string;
  createdAt: string;
  expiresAt: string;
  expired: boolean;
  inviteUrl: string;
}

interface Incoming {
  id: string;
  tripName: string;
  invitedBy: string;
  expiresAt: string;
}

/** „läuft in X Tagen ab" bzw. „abgelaufen" aus dem ISO-Ablaufdatum. */
function expiryLabel(expiresAt: string, expired?: boolean): string {
  if (expired) return "abgelaufen";
  const ms = new Date(expiresAt).getTime() - Date.now();
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
  if (days <= 0) return "läuft heute ab";
  if (days === 1) return "läuft morgen ab";
  return `läuft in ${days} Tagen ab`;
}

export function TripMembers() {
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [incoming, setIncoming] = useState<Incoming[]>([]);
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [iCanManage, setICanManage] = useState(false);
  const [isOwner, setIsOwner] = useState(false);

  const reload = useCallback(() => {
    return api
      .get<{
        members: Member[];
        invitations: Invitation[];
        incoming: Incoming[];
        canManage: boolean;
        isOwner: boolean;
      }>("/api/v1/trip/members")
      .then((d) => {
        setMembers(d.members);
        setInvitations(d.invitations);
        setIncoming(d.incoming);
        setICanManage(d.canManage);
        setIsOwner(d.isOwner);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // Nur die Präsenz aktualisieren (id + lastSeenAt) — ohne Profilbilder/Einladungen.
  const refreshPresence = useCallback(() => {
    return api
      .get<{ id: string; lastSeenAt: string | null }[]>("/api/v1/trip/presence")
      .then((rows) => {
        const seen = new Map(rows.map((r) => [r.id, r.lastSeenAt]));
        setMembers((prev) =>
          prev.map((m) => (seen.has(m.id) ? { ...m, lastSeenAt: seen.get(m.id) ?? null } : m)),
        );
      })
      .catch(() => {});
  }, []);

  // Präsenz alle 30 s aktualisieren (nur bei sichtbarem Tab) und beim Zurückkehren
  // sofort. Der schlanke Endpunkt spart pro Tick ~1 MB Bilder + 5 Einladungs-Queries.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") refreshPresence();
    };
    const timer = setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refreshPresence]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setPending(true);
    setError(null);
    setInfo(null);
    try {
      const d = await api.post<{
        invited: true;
        email: string;
        inviteUrl: string;
        emailSent: boolean;
        hasAccount: boolean;
      }>("/api/v1/trip/members", { email: email.trim() });

      if (d.hasAccount) {
        setInfo(
          d.emailSent
            ? `Einladung an ${d.email} gesendet. Die Person muss sie bei sich bestätigen — bis dahin steht sie unten als ausstehend.`
            : `${d.email} hat ein Konto — die Einladung erscheint bei der Person nach dem Anmelden. Sie steht unten als ausstehend.`,
        );
      } else {
        setInfo(
          d.emailSent
            ? `Einladung an ${d.email} gesendet — sie erscheint unten als ausstehend.`
            : `Registrierungs-Link für ${d.email} erstellt — unten kopieren und teilen.`,
        );
      }
      setEmail("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Einladen fehlgeschlagen.");
    } finally {
      setPending(false);
    }
  }

  async function copyLink(inv: Invitation) {
    try {
      await navigator.clipboard.writeText(inv.inviteUrl);
      setCopiedId(inv.id);
      setTimeout(() => setCopiedId((c) => (c === inv.id ? null : c)), 2000);
    } catch {
      setCopiedId(null);
    }
  }

  function revoke(id: string) {
    setInvitations((prev) => prev.filter((i) => i.id !== id));
    api.delete(`/api/v1/trip/invitations/${id}`).catch(() => reload());
  }

  function remove(id: string) {
    setMembers((prev) => prev.filter((m) => m.id !== id));
    // Bei Fehler (z. B. 403) macht der api-Client einen Toast; Liste zurückholen.
    api.delete(`/api/v1/trip/members/${id}`).catch(() => reload());
  }

  // Verwalter-Recht setzen/entziehen (nur der Owner sieht diesen Schalter).
  function setManage(id: string, canManage: boolean) {
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, canManage } : m)));
    api
      .patch(`/api/v1/trip/members/${id}`, { canManage })
      .then(() => reload())
      .catch(() => reload());
  }

  async function acceptIncoming(id: string) {
    setIncoming((prev) => prev.filter((i) => i.id !== id));
    try {
      await api.post(`/api/v1/trip/invitations/${id}/accept`);
      await reload();
      setInfo("Einladung angenommen — du bist der Reise beigetreten.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Beitritt fehlgeschlagen.");
      reload();
    }
  }

  function declineIncoming(id: string) {
    setIncoming((prev) => prev.filter((i) => i.id !== id));
    api.delete(`/api/v1/trip/invitations/${id}`).catch(() => reload());
  }

  return (
    <div className="max-w-xl">
      {/* Einladungen AN MICH (Zustimmungs-Schritt: Beitreten verlässt die aktuelle Reise). */}
      {incoming.length > 0 && (
        <div className="mb-4 rounded-lg border border-brand/40 bg-brand-tint/30 dark:bg-brand/10">
          <div className="border-b border-brand/20 px-4 py-2 text-sm font-medium text-brand-dark dark:text-brand-tint">
            Einladungen an dich ({incoming.length})
          </div>
          {incoming.map((inv) => (
            <div key={inv.id} className="border-b border-brand/10 px-4 py-3 last:border-b-0">
              <p className="text-sm text-ink">
                <strong>{inv.invitedBy}</strong> lädt dich zu <strong>{inv.tripName}</strong> ein.
              </p>
              <p className="mt-0.5 text-xs text-ink-muted">
                {expiryLabel(inv.expiresAt)} · Beim Beitreten verlässt du deine aktuelle Reise.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => acceptIncoming(inv.id)}
                  className={buttonClasses("primary", "sm")}
                >
                  Beitreten
                </button>
                <button
                  type="button"
                  onClick={() => declineIncoming(inv.id)}
                  className="rounded-md px-3 py-1.5 text-xs text-ink-muted transition hover:bg-ink-subtle/10"
                >
                  Ablehnen
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <form
        onSubmit={invite}
        className="mb-4 flex gap-2 rounded-card border border-hairline bg-surface shadow-card p-3"
      >
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-Mail der Person"
          className={fieldClasses}
        />
        <button
          type="submit"
          disabled={pending || !email.trim()}
          className={buttonClasses("primary", "md", "shrink-0")}
        >
          {pending ? "…" : "Einladen"}
        </button>
      </form>
      {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {info && <p className="mb-3 text-sm text-emerald-600 dark:text-emerald-400">{info}</p>}

      {/* Ausstehende Einladungen (von mir verschickt, noch nicht angenommen). */}
      {invitations.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-300/60 dark:border-amber-500/30 bg-amber-50/60 dark:bg-amber-500/5">
          <div className="border-b border-amber-200/70 dark:border-amber-500/20 px-4 py-2 text-sm font-medium text-amber-800 dark:text-amber-300">
            Ausstehende Einladungen ({invitations.length})
          </div>
          {invitations.map((inv) => (
            <div
              key={inv.id}
              className="flex items-center gap-3 border-b border-amber-200/50 dark:border-amber-500/10 px-4 py-2.5 last:border-b-0"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-200/70 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300">
                ✉
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">
                  {inv.email}
                </p>
                <p className="flex items-center gap-1.5 text-xs">
                  <span
                    className={`inline-block rounded-full px-1.5 py-0.5 text-[11px] font-medium ${
                      inv.expired
                        ? "bg-red-500/15 text-red-600 dark:text-red-400"
                        : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                    }`}
                  >
                    {inv.expired ? "Abgelaufen" : "Ausstehend"}
                  </span>
                  <span className="text-ink-muted">
                    · {expiryLabel(inv.expiresAt, inv.expired)}
                  </span>
                </p>
              </div>
              {!inv.expired && (
                <button
                  type="button"
                  onClick={() => copyLink(inv)}
                  className="shrink-0 rounded px-2 py-1 text-xs font-medium text-brand transition hover:bg-brand/10"
                >
                  {copiedId === inv.id ? "Kopiert ✓" : "Link"}
                </button>
              )}
              <button
                type="button"
                onClick={() => revoke(inv.id)}
                className="shrink-0 rounded px-2 py-1 text-xs text-red-600 transition hover:bg-red-500/10 dark:text-red-400"
              >
                {inv.expired ? "Löschen" : "Widerrufen"}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-card border border-hairline bg-surface shadow-card">
        <div className="border-b border-hairline px-4 py-2 text-sm font-medium text-ink-muted">
          Mitglieder ({members.length})
        </div>
        {members.map((m) => (
          <div
            key={m.id}
            className="flex items-center gap-3 border-b border-hairline px-4 py-2.5 last:border-b-0"
          >
            <div className="relative shrink-0">
              <Avatar name={m.name} image={m.image} size={36} />
              {/* Präsenz-Punkt: grün = online, grau = offline. */}
              <span
                title={m.isMe ? "du bist online" : exactSeen(m.lastSeenAt)}
                className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface ${
                  isOnline(m.lastSeenAt) ? "bg-emerald-500" : "bg-ink-subtle"
                }`}
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 truncate text-sm font-medium text-ink">
                <span className="truncate">{m.name}</span>
                {m.isMe && <span className="text-xs text-ink-subtle">(du)</span>}
                {m.isOwner && (
                  <span
                    title="Ersteller der Reise"
                    className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300"
                  >
                    👑 Ersteller
                  </span>
                )}
                {!m.isOwner && m.canManage && (
                  <span
                    title="Darf Mitglieder verwalten"
                    className="shrink-0 rounded bg-brand-tint/60 px-1.5 py-0.5 text-[11px] font-medium text-brand-dark dark:bg-brand/20 dark:text-brand-tint"
                  >
                    Verwalter
                  </span>
                )}
              </p>
              <p className="flex items-center gap-1.5 truncate text-xs text-ink-muted">
                <span className="truncate">{m.email}</span>
                {presenceLabel(m.lastSeenAt) && (
                  <>
                    <span aria-hidden>·</span>
                    <span
                      title={m.isMe ? undefined : exactSeen(m.lastSeenAt)}
                      className={`shrink-0 ${
                        isOnline(m.lastSeenAt)
                          ? "font-medium text-emerald-600 dark:text-emerald-400"
                          : "cursor-help"
                      }`}
                    >
                      {presenceLabel(m.lastSeenAt)}
                    </span>
                  </>
                )}
              </p>
            </div>
            {/* Verwalter-Recht vergeben/entziehen — nur der Owner, für andere Mitglieder. */}
            {isOwner && !m.isMe && !m.isOwner && (
              <button
                type="button"
                onClick={() => setManage(m.id, !m.canManage)}
                title={m.canManage ? "Verwalter-Recht entziehen" : "Zum Verwalter machen"}
                className={`shrink-0 rounded border px-2 py-1 text-xs transition ${
                  m.canManage
                    ? "border-brand text-brand hover:bg-brand/10"
                    : "border-hairline text-ink-muted hover:bg-surface-2"
                }`}
              >
                {m.canManage ? "Verwalter ✓" : "Zum Verwalter"}
              </button>
            )}
            {/* Sich selbst entfernen (verlassen) — außer der Owner. */}
            {m.isMe && !m.isOwner && (
              <button
                type="button"
                onClick={() => remove(m.id)}
                className="shrink-0 rounded px-2 py-1 text-xs text-red-600 transition hover:bg-red-500/10 dark:text-red-400"
              >
                Verlassen
              </button>
            )}
            {/* Andere entfernen — nur mit Recht, nie den Owner; Verwalter nur der Owner. */}
            {!m.isMe && iCanManage && !m.isOwner && (isOwner || !m.canManage) && (
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

      <p className="mt-3 text-xs text-ink-subtle">
        Eingeladene Mitglieder bearbeiten Reiseplaner, Ausgaben, Tagesplaner und Checkliste
        gemeinsam. Einladungen müssen von der eingeladenen Person bestätigt werden (Konten über
        „Einladungen an dich", neue Konten über den Registrierungs-Link, 14 Tage gültig).
      </p>
    </div>
  );
}
