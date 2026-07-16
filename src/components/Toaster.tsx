"use client";

import { useEffect, useState } from "react";

import type { ToastDetail, ToastKind } from "@/lib/toast";

interface Item extends ToastDetail {
  id: number;
}

const STYLE: Record<ToastKind, string> = {
  error: "bg-danger text-white",
  success: "bg-emerald-600 text-white",
  info: "bg-brand-dark text-white",
};

/** Zeigt kurzlebige Toast-Meldungen (siehe `toast()` in @/lib/toast). */
export function Toaster() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    let seq = 0;
    function onToast(e: Event) {
      const detail = (e as CustomEvent<ToastDetail>).detail;
      if (!detail?.message) return;
      const id = ++seq;
      setItems((prev) => [...prev, { id, ...detail }]);
      // Auto-Ausblenden nach 4 s.
      setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 4000);
    }
    window.addEventListener("app-toast", onToast);
    return () => window.removeEventListener("app-toast", onToast);
  }, []);

  if (items.length === 0) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 print:hidden"
      aria-live="polite"
      role="status"
    >
      {items.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
          className={`pointer-events-auto max-w-md rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg transition ${STYLE[t.kind]}`}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}
