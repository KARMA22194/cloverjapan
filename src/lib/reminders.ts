// Erinnerungen „1 Stunde vor einer Aktivität" (Tagesplaner).
//  - Nativ (Capacitor): OS-Benachrichtigung, feuert auch bei geschlossener App.
//  - Web/PWA: Notification-API, solange die App offen ist (Fallback).

import { todayParam } from "@/lib/time";

export interface ReminderTask {
  id: string;
  time: string; // "HH:MM"
  text: string;
  done: boolean;
}

async function isNative(): Promise<boolean> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export async function hasReminderPermission(): Promise<boolean> {
  if (await isNative()) {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    return (await LocalNotifications.checkPermissions()).display === "granted";
  }
  if (typeof Notification === "undefined") return false;
  return Notification.permission === "granted";
}

export async function requestReminderPermission(): Promise<boolean> {
  if (await isNative()) {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    return (await LocalNotifications.requestPermissions()).display === "granted";
  }
  if (typeof Notification === "undefined") return false;
  return (await Notification.requestPermission()) === "granted";
}

function stableId(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return (h % 2_000_000_000) + 1;
}

/**
 * Plant Erinnerungen für die (heutigen) Aufgaben mit Uhrzeit, jeweils 1 h vorher.
 * Gibt eine Cleanup-Funktion zurück (räumt Web-Timer auf).
 */
export async function scheduleReminders(
  tasks: ReminderTask[],
  dateISO: string,
): Promise<() => void> {
  const noop = () => {};
  // App-Zeitzone, nicht UTC — sonst gelten nach Mitternacht alle Aufgaben als „nicht heute".
  const todayISO = todayParam();
  if (dateISO !== todayISO) return noop; // nur für heute sinnvoll
  if (!(await hasReminderPermission())) return noop;

  const now = Date.now();
  const items = tasks
    .filter((t) => t.time && !t.done)
    .map((t) => {
      const [h, m] = t.time.split(":").map(Number);
      const at = new Date();
      at.setHours(h, m, 0, 0);
      return { t, remindAt: at.getTime() - 60 * 60 * 1000 };
    })
    .filter((r) => r.remindAt > now);

  if (await isNative()) {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length) {
      await LocalNotifications.cancel({
        notifications: pending.notifications.map((n) => ({ id: n.id })),
      });
    }
    if (items.length) {
      await LocalNotifications.schedule({
        notifications: items.map((r) => ({
          id: stableId(r.t.id),
          title: "Erinnerung",
          body: `In 1 Stunde: ${r.t.text} um ${r.t.time}`,
          schedule: { at: new Date(r.remindAt) },
        })),
      });
    }
    return noop; // OS-Benachrichtigungen bleiben bestehen
  }

  // Web-Fallback: Timer, solange die App offen ist.
  const timers = items.map((r) =>
    window.setTimeout(() => {
      try {
        new Notification("Erinnerung", {
          body: `In 1 Stunde: ${r.t.text} um ${r.t.time}`,
          icon: "/icon-192.png",
        });
      } catch {
        /* ignore */
      }
    }, r.remindAt - now),
  );
  return () => timers.forEach((id) => window.clearTimeout(id));
}
