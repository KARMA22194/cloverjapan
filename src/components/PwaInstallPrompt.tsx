"use client";

import { useEffect, useState } from "react";

const DISMISS_KEY = "pwa-install-dismissed";

// Minimaltyp des (nicht standardisierten) beforeinstallprompt-Events.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Dezentes Banner „App installieren" auf dem Start-Dashboard. Fängt das
 * `beforeinstallprompt`-Event ab (Android/Chrome/Edge) und bietet den nativen
 * Install-Dialog an; auf iOS-Safari (kein solches Event) wird der manuelle Weg
 * („Teilen → Zum Home-Bildschirm") als Hinweis gezeigt. Erscheint nicht, wenn die
 * App bereits als PWA läuft oder das Banner weggeklickt wurde (localStorage).
 *
 * Hinweis: `beforeinstallprompt` feuert nur bei erfüllten PWA-Kriterien
 * (Manifest + Service-Worker + HTTPS) → praktisch nur in Produktion (Vercel),
 * nicht im lokalen `next dev` (dort ist der SW bewusst deaktiviert).
 */
export function PwaInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Schon als PWA installiert?
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;
    if (localStorage.getItem(DISMISS_KEY)) return;

    const onPrompt = (e: Event) => {
      e.preventDefault(); // eigenen Button statt des sofortigen Browser-Dialogs
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    // iOS-Safari kennt beforeinstallprompt nicht → manuellen Hinweis anbieten.
    const ua = navigator.userAgent;
    const isIos = /iphone|ipad|ipod/i.test(ua);
    const isSafari = /safari/i.test(ua) && !/crios|fxios|android/i.test(ua);
    if (isIos && isSafari) {
      setIosHint(true);
      setVisible(true);
    }

    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!visible) return null;

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    try {
      await deferred.userChoice;
    } catch {
      /* egal – Auswahl des Nutzers */
    }
    setDeferred(null);
    setVisible(false);
  }

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* Private-Mode o. Ä. – unkritisch */
    }
    setVisible(false);
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-brand/30 bg-brand-tint/40 px-4 py-3 dark:bg-brand/10">
      <span className="text-xl" aria-hidden>
        📲
      </span>
      <div className="min-w-0 flex-1 text-sm text-slate-700 dark:text-slate-200">
        <p className="font-medium">Clover Japan als App installieren</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {iosHint
            ? "In Safari: „Teilen“ → „Zum Home-Bildschirm“ – dann Vollbild & Offline-Zugriff vor Ort."
            : "Vollbild ohne Browser-Leiste und Offline-Zugriff auf Notfall-Basics."}
        </p>
      </div>
      {!iosHint && (
        <button
          type="button"
          onClick={install}
          className="shrink-0 rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand-dark"
        >
          Installieren
        </button>
      )}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Banner schließen"
        className="shrink-0 rounded p-1 text-slate-400 transition hover:bg-slate-500/10 hover:text-slate-600 dark:hover:text-slate-300"
      >
        ✕
      </button>
    </div>
  );
}
