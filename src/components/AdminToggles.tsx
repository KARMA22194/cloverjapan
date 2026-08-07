"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { api } from "@/lib/api/client";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";

const buttonClass = buttonClasses("secondary", "sm");

/** Nutzer aktivieren/deaktivieren (PATCH /api/v1/users/{id}). */
export function UserActiveButton({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function toggle() {
    setPending(true);
    try {
      await api.patch(`/api/v1/users/${id}`, { active: !active });
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Aktion fehlgeschlagen.");
      setPending(false);
    }
  }

  return (
    <button type="button" onClick={toggle} disabled={pending} className={buttonClass}>
      {active ? "Deaktivieren" : "Aktivieren"}
    </button>
  );
}

/**
 * Konto endgültig löschen (DELETE /api/v1/users/{id}, nur ADMIN).
 *
 * Bewusst **keine** `confirm()`-Abfrage: ein Klick auf „OK" ist bei einem
 * unwiderruflichen Schritt zu wenig, und Verwechslungen in einer Liste gleich
 * aussehender Zeilen sind der Normalfall. Stattdessen muss die **E-Mail-Adresse
 * abgetippt** werden — das erzwingt einen Blick darauf, wen man wirklich löscht.
 */
export function UserDeleteButton({ id, email }: { id: string; email: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = typed.trim().toLowerCase() === email.toLowerCase();

  async function remove() {
    if (!matches) return;
    setPending(true);
    setError(null);
    try {
      const res = await api.delete<{ tripDeleted: boolean }>(`/api/v1/users/${id}`);
      // Wurde die Reise mitgelöscht, ist das eine Information, die man nicht
      // stillschweigend übergehen sollte.
      if (res.tripDeleted) {
        alert("Konto gelöscht. Die Reise hatte danach keine Mitglieder mehr und wurde mit allen Daten entfernt.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Löschen fehlgeschlagen.");
      setPending(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-field px-3 py-1 text-xs font-semibold text-danger transition hover:bg-danger/10"
      >
        Löschen
      </button>
    );
  }

  return (
    <div className="min-w-0 rounded-field bg-danger/5 p-2 ring-1 ring-danger/25">
      <p className="mb-1.5 text-xs text-ink-muted">
        Endgültig löschen? Tippe <span className="font-bold text-ink">{email}</span> zum
        Bestätigen.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="E-Mail bestätigen"
          autoComplete="off"
          className="w-56 py-1 text-xs"
        />
        <Button variant="danger" size="sm" onClick={remove} disabled={!matches || pending}>
          {pending ? "…" : "Endgültig löschen"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setOpen(false);
            setTyped("");
            setError(null);
          }}
          disabled={pending}
        >
          Abbrechen
        </Button>
      </div>
      {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
    </div>
  );
}
