"use client";

import { useEffect, useRef, useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";

import { api } from "@/lib/api/client";
import { Avatar } from "@/components/Avatar";
import { resizeImage } from "@/lib/image";
import { buttonClasses } from "@/components/ui/Button";

/** Bild quadratisch auf 128×128 zuschneiden, als JPEG-Data-URL. */
const resize = (file: File) => resizeImage(file, { max: 128, quality: 0.85, square: true });

export function ProfileForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pkPending, setPkPending] = useState(false);
  const [pkMsg, setPkMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function addPasskey() {
    setPkPending(true);
    setPkMsg(null);
    try {
      const options = await api.get<Parameters<typeof startRegistration>[0]>(
        "/api/v1/passkey/register/options",
      );
      let attResp;
      try {
        attResp = await startRegistration(options);
      } catch {
        setPkMsg("Biometrie abgebrochen oder vom Gerät/Browser nicht unterstützt.");
        return;
      }
      await api.post("/api/v1/passkey/register/verify", attResp);
      setPkMsg("✓ Passkey eingerichtet — künftig Login per Fingerabdruck/Face ID möglich.");
    } catch (e) {
      // Serverfehler (z. B. Verifizierung) sichtbar machen statt zu verschlucken.
      setPkMsg(e instanceof Error ? `Fehler: ${e.message}` : "Passkey konnte nicht eingerichtet werden.");
    } finally {
      setPkPending(false);
    }
  }

  useEffect(() => {
    api
      .get<{ name: string; email: string; image: string | null }>("/api/v1/me")
      .then((m) => {
        setName(m.name);
        setEmail(m.email);
        setImage(m.image);
      })
      .catch(() => {});
  }, []);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPending(true);
    setError(null);
    try {
      const dataUrl = await resize(file);
      await api.patch("/api/v1/me", { image: dataUrl });
      setImage(dataUrl);
    } catch {
      setError("Bild konnte nicht gesetzt werden.");
    } finally {
      setPending(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeImage() {
    setPending(true);
    setError(null);
    try {
      await api.patch("/api/v1/me", { image: null });
      setImage(null);
    } catch {
      setError("Konnte nicht entfernt werden.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="max-w-md">
      <div className="flex items-center gap-4 rounded-card border border-hairline bg-surface shadow-card p-4">
        <Avatar name={name || "?"} image={image} size={72} />
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{name}</p>
          <p className="truncate text-sm text-ink-muted">{email}</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={pending}
              className={buttonClasses("primary", "md")}
            >
              {pending ? "…" : image ? "Bild ändern" : "Bild wählen"}
            </button>
            {image && (
              <button
                type="button"
                onClick={removeImage}
                disabled={pending}
                className={buttonClasses("secondary", "md")}
              >
                Entfernen
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
          </div>
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
      <p className="mt-3 text-xs text-ink-subtle">
        Das Bild wird auf 128×128 verkleinert und in deinem Konto gespeichert.
      </p>

      <div className="mt-6 rounded-card border border-hairline bg-surface shadow-card p-4">
        <h2 className="mb-1 text-sm font-medium text-ink-muted">
          Anmeldung per Fingerabdruck (Passkey)
        </h2>
        <p className="mb-3 text-xs text-ink-muted">
          Richte auf diesem Gerät einen Passkey ein, um dich künftig per Fingerabdruck oder
          Face ID anzumelden.
        </p>
        <button
          type="button"
          onClick={addPasskey}
          disabled={pkPending}
          className={buttonClasses("primary", "md")}
        >
          {pkPending ? "…" : "Passkey einrichten"}
        </button>
        {pkMsg && <p className="mt-2 text-sm text-ink-muted">{pkMsg}</p>}
      </div>
    </div>
  );
}
