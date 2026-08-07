"use client";

import { useEffect, useState } from "react";

import { Logo } from "@/components/Logo";
import { buttonClasses } from "@/components/ui/Button";

/**
 * Sperrt die App in der nativen Capacitor-Hülle beim Start und nach dem Resume
 * per Fingerabdruck/Face ID. Auf Web/PWA passiert nichts (kein nativer Sensor;
 * dort dienen Passkeys als biometrische Anmeldung).
 */
export function BiometricLock({ children }: { children: React.ReactNode }) {
  const [locked, setLocked] = useState(false);
  const [checking, setChecking] = useState(false);

  async function unlock() {
    setChecking(true);
    try {
      const { BiometricAuth } = await import("@aparajita/capacitor-biometric-auth");
      await BiometricAuth.authenticate({
        reason: "App entsperren",
        cancelTitle: "Abbrechen",
      });
      setLocked(false);
    } catch {
      setLocked(true); // fehlgeschlagen/abgebrochen → gesperrt, Button zum erneuten Versuch
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    (async () => {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) return; // Web/PWA: kein Lock

      setLocked(true);
      await unlock();

      const { App } = await import("@capacitor/app");
      const sub = await App.addListener("resume", () => {
        setLocked(true);
        void unlock();
      });
      cleanup = () => void sub.remove();
    })();
    return () => cleanup?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {children}
      {locked && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-6 bg-slate-950 px-6 text-center text-white">
          <Logo height={64} className="!bg-white" />
          <p className="text-lg font-medium">App gesperrt</p>
          <button
            type="button"
            onClick={unlock}
            disabled={checking}
            className={buttonClasses("primary", "md", "h-11 px-5")}
          >
            {checking ? "…" : "🔒 Entsperren"}
          </button>
        </div>
      )}
    </>
  );
}
