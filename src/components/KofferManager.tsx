"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/api/client";

interface Tag {
  id: string;
  token: string;
  label: string;
  ownerName: string;
  notifyEmail: string;
  whatsapp: string;
  contact: string;
  by?: string;
}

const inputClass =
  "w-full rounded-md border border-slate-300 dark:border-slate-600 bg-transparent px-3 py-2 text-sm outline-none focus:border-brand";

export function KofferManager() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [qr, setQr] = useState<Record<string, string>>({});
  const [label, setLabel] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [notifyEmail, setNotifyEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [contact, setContact] = useState("");
  const [saving, setSaving] = useState(false);

  function load() {
    api.get<Tag[]>("/api/v1/luggage").then(setTags).catch(() => {});
  }
  useEffect(() => {
    load();
  }, []);

  // QR-Codes clientseitig erzeugen (qrcode dynamisch importiert).
  // Nur die **fehlenden** rendern und ins vorhandene Ergebnis mergen: sonst wurden
  // beim Anlegen des n-ten Anhängers alle n Codes neu erzeugt und die bereits
  // sichtbaren Bilder fielen kurz auf den Lade-Platzhalter zurück.
  useEffect(() => {
    const missing = tags.filter((t) => !qr[t.id]);
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const QRCode = (await import("qrcode")).default;
      const origin = window.location.origin;
      const entries = await Promise.all(
        missing.map(
          async (t) =>
            [t.id, await QRCode.toDataURL(`${origin}/k/${t.token}`, { width: 512, margin: 1 })] as const,
        ),
      );
      if (!cancelled) setQr((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    })();
    return () => {
      cancelled = true;
    };
  }, [tags, qr]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || !ownerName.trim()) return;
    setSaving(true);
    try {
      const created = await api.post<Tag>("/api/v1/luggage", {
        label: label.trim(),
        ownerName: ownerName.trim(),
        notifyEmail: notifyEmail.trim() || undefined,
        whatsapp: whatsapp.trim() || undefined,
        contact: contact.trim() || undefined,
      });
      setTags((prev) => [...prev, created]);
      setLabel("");
      setOwnerName("");
      setNotifyEmail("");
      setWhatsapp("");
      setContact("");
    } catch {
      /* Fehler kommt als Toast */
    } finally {
      setSaving(false);
    }
  }

  function remove(id: string) {
    const snapshot = tags;
    setTags((prev) => prev.filter((t) => t.id !== id));
    api.delete(`/api/v1/luggage/${id}`).catch(() => setTags(snapshot));
  }

  function copyLink(token: string) {
    const url = `${window.location.origin}/k/${token}`;
    navigator.clipboard?.writeText(url).catch(() => {});
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(260px,1fr)_1.4fr]">
      <form
        onSubmit={add}
        className="space-y-2 self-start rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3"
      >
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          🧳 Neuer Kofferanhänger
        </p>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
            Bezeichnung
          </label>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="z. B. Papas Koffer" className={inputClass} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
            Name (für den Finder sichtbar)
          </label>
          <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="z. B. Steve" className={inputClass} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
            Benachrichtigungs-E-Mail (optional)
          </label>
          <input value={notifyEmail} onChange={(e) => setNotifyEmail(e.target.value)} placeholder="leer = deine Konto-E-Mail" className={inputClass} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
            WhatsApp-Nummer (optional, für Finder-Knopf)
          </label>
          <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="+49170…" className={inputClass} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
            Direktkontakt für den Finder (optional, sichtbar)
          </label>
          <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="E-Mail, Telefon oder Hotel" className={inputClass} />
        </div>
        <button
          type="submit"
          disabled={saving || !label.trim() || !ownerName.trim()}
          className="w-full rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "…" : "QR-Anhänger erstellen"}
        </button>
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          QR ausdrucken, laminieren, an den Koffer hängen. Wird er gefunden &amp; gescannt, teilt der
          Finder seinen Standort – du wirst per E-Mail/Discord benachrichtigt.
        </p>
      </form>

      <div className="space-y-3">
        {tags.length === 0 ? (
          <p className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-500">
            Noch keine Kofferanhänger. Lege links einen an.
          </p>
        ) : (
          tags.map((t) => (
            <div
              key={t.id}
              className="flex items-start gap-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3"
            >
              {qr[t.id] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr[t.id]} alt={`QR ${t.label}`} className="h-24 w-24 shrink-0 rounded bg-white p-1" />
              ) : (
                <div className="h-24 w-24 shrink-0 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">🧳 {t.label}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Besitzer: {t.ownerName}</p>
                {t.whatsapp && (
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">WhatsApp: {t.whatsapp}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {qr[t.id] && (
                    <a
                      href={qr[t.id]}
                      download={`koffer-${t.label.replace(/\s+/g, "-").toLowerCase()}.png`}
                      className="rounded border border-brand px-2 py-1 text-xs font-medium text-brand transition hover:bg-brand hover:text-white"
                    >
                      QR herunterladen
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => copyLink(t.token)}
                    className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Link kopieren
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(t.id)}
                    className="rounded px-2 py-1 text-xs text-red-600 transition hover:bg-red-500/10 dark:text-red-400"
                  >
                    Löschen
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
