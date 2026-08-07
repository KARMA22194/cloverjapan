"use client";

import { useState } from "react";

import { logoutAction } from "@/app/actions/auth";
import { api } from "@/lib/api/client";
import { clearUserScopedStorage } from "@/lib/userStorage";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";

/**
 * Eigenes Konto löschen.
 *
 * Zwei Hürden, weil der Schritt nicht rückholbar ist: das Formular ist eingeklappt
 * und verlangt das **Passwort**. Letzteres prüft der Server (`DELETE /api/v1/me`) —
 * ein Cookie allein genügte nicht, sonst reichte ein untergeschobener Request, um
 * ein Konto samt Reisedaten zu vernichten.
 */
export function AccountDelete() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;
    setPending(true);
    setError(null);
    try {
      await api.delete("/api/v1/me", { password });
      // Aufräumen wie beim Abmelden: personenbezogener Offline-Cache und der
      // Service-Worker-Datenspeicher gehören nicht auf ein fremdes Gerät.
      try {
        navigator.serviceWorker?.controller?.postMessage({ type: "logout" });
        clearUserScopedStorage();
      } catch {
        /* SW evtl. nicht aktiv – unkritisch */
      }
      // Session-Cookie serverseitig entwerten und auf /login schicken. Ohne das
      // bliebe ein Cookie zurück, dessen Konto es nicht mehr gibt.
      await logoutAction();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Löschen fehlgeschlagen.");
      setPending(false);
    }
  }

  return (
    <Card pad="lg" className="mt-6 ring-danger/25">
      <h2 className="text-sm font-bold text-ink">Konto löschen</h2>
      <p className="mt-1 text-xs text-ink-muted">
        Entfernt dein Konto endgültig — Login, Passkeys und Push-Abos. Warst du das
        letzte Mitglied deiner Reise, wird auch die Reise mit allen Orten, Ausgaben,
        Buchungen und Kofferanhängern gelöscht. Sind noch andere dabei, bleibt die
        Reise bestehen; dein Name bleibt dort in den bereits erfassten Einträgen
        stehen, damit die Abrechnung nachvollziehbar bleibt.
      </p>

      {!open ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOpen(true)}
          className="mt-3 text-danger hover:bg-danger/10"
        >
          Konto löschen …
        </Button>
      ) : (
        <form onSubmit={remove} className="mt-3">
          <label className="mb-1 block text-xs font-semibold text-ink-muted" htmlFor="del-pw">
            Zur Bestätigung dein Passwort
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id="del-pw"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-56"
            />
            <Button type="submit" variant="danger" disabled={!password || pending}>
              {pending ? "…" : "Endgültig löschen"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setOpen(false);
                setPassword("");
                setError(null);
              }}
              disabled={pending}
            >
              Abbrechen
            </Button>
          </div>
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        </form>
      )}
    </Card>
  );
}
