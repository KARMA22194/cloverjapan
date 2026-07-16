export type ToastKind = "error" | "success" | "info";

export interface ToastDetail {
  message: string;
  kind: ToastKind;
}

/**
 * Löst eine Toast-Meldung aus (via Window-Event; der <Toaster> rendert sie).
 * Funktioniert von überall im Client – auch aus Nicht-Komponenten-Code wie dem
 * API-Client. Auf dem Server ein No-Op.
 */
export function toast(message: string, kind: ToastKind = "error"): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastDetail>("app-toast", { detail: { message, kind } }));
}
