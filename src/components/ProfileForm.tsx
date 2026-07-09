"use client";

import { useEffect, useRef, useState } from "react";

import { api } from "@/lib/api/client";
import { Avatar } from "@/components/Avatar";

/** Bild einlesen, quadratisch auf 128×128 zuschneiden, als JPEG-Data-URL. */
function resize(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read"));
    reader.onload = () => {
      const img = document.createElement("img");
      img.onerror = () => reject(new Error("img"));
      img.onload = () => {
        const size = 128;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("ctx"));
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export function ProfileForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
      <div className="flex items-center gap-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <Avatar name={name || "?"} image={image} size={72} />
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-800 dark:text-slate-100">{name}</p>
          <p className="truncate text-sm text-slate-500 dark:text-slate-400">{email}</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={pending}
              className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand-dark disabled:opacity-60"
            >
              {pending ? "…" : image ? "Bild ändern" : "Bild wählen"}
            </button>
            {image && (
              <button
                type="button"
                onClick={removeImage}
                disabled={pending}
                className="rounded-md border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 transition hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-60"
              >
                Entfernen
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
          </div>
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
      <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
        Das Bild wird auf 128×128 verkleinert und in deinem Konto gespeichert.
      </p>
    </div>
  );
}
