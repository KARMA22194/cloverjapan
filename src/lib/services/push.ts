import type WebPush from "web-push";

import { db } from "@/lib/db";

/**
 * `web-push` wird **lazy** geladen (siehe `loadWebPush`).
 *
 * Als statischer Import hing die Bibliothek samt ihrer Crypto-/ASN.1-Abhängigkeiten
 * in **jeder** Mutations-Route — dieses Modul erreicht über `activityService` alle
 * Create-Endpunkte. Größeres Bundle heißt serverlos längerer Cold Start, und zwar
 * auch dann, wenn Push gar nicht konfiguriert ist.
 */
let webpushModule: typeof WebPush | null = null;

async function loadWebPush(): Promise<typeof WebPush | null> {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;

  if (!webpushModule) {
    const mod = (await import("web-push")).default;
    mod.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:admin@clover.japan",
      publicKey,
      privateKey,
    );
    webpushModule = mod;
  }
  return webpushModule;
}

/** Ist Web-Push serverseitig einsatzbereit (VAPID-Keys vorhanden)? */
export function pushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export interface WebPushSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/**
 * Abo eines Geräts speichern (idempotent über den unique endpoint).
 *
 * Der Endpoint identifiziert ein **Gerät**, nicht den Nutzer: gehört er bereits einem
 * anderen Konto, wird er neu zugeordnet (Gerätewechsel/Nutzerwechsel am selben Browser)
 * — aber nur, indem der alte Datensatz gelöscht und ein neuer angelegt wird, damit
 * keine fremden Schlüssel stehen bleiben. Ein blindes `update` mit fremdem `userId`
 * ließe sich sonst dazu missbrauchen, ein fremdes Gerät auf das eigene Konto umzubiegen
 * und dessen Benachrichtigungen mitzulesen — deshalb zuerst die Besitzverhältnisse prüfen.
 */
export async function savePushSubscription(userId: string, sub: WebPushSub): Promise<void> {
  const existing = await db.pushSubscription.findUnique({
    where: { endpoint: sub.endpoint },
    select: { userId: true },
  });

  if (existing && existing.userId !== userId) {
    // Fremdes Abo: alten Datensatz verwerfen statt ihn zu übernehmen.
    await db.pushSubscription.delete({ where: { endpoint: sub.endpoint } }).catch(() => {});
  }

  await db.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: { userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    update: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
  });
}

/**
 * Abo eines Geräts löschen (beim Abmelden der Benachrichtigungen).
 * **Nur eigene** Abos — sonst könnte jeder eingeloggte Nutzer mit einem bekannten
 * Endpoint fremde Geräte stummschalten.
 */
export async function deletePushSubscription(userId: string, endpoint: string): Promise<void> {
  await db.pushSubscription.deleteMany({ where: { endpoint, userId } });
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

/**
 * Push an alle Geräte der Reise-Mitglieder senden — außer dem Auslöser selbst.
 * Best-effort: Fehler werden geschluckt; abgelaufene Abos (404/410) werden entfernt.
 */
export async function sendPushToTrip(
  tripId: string,
  exceptUserId: string | null,
  payload: PushPayload,
): Promise<void> {
  const webpush = await loadWebPush();
  if (!webpush) return;

  const members = await db.tripMember.findMany({ where: { tripId }, select: { userId: true } });
  const userIds = members.map((m) => m.userId).filter((id) => id !== exceptUserId);
  if (userIds.length === 0) return;

  const subs = await db.pushSubscription.findMany({ where: { userId: { in: userIds } } });
  if (subs.length === 0) return;

  const data = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          data,
        );
      } catch (err) {
        // Abgelaufenes/ungültiges Abo → aufräumen, damit es nicht ewig scheitert.
        const code = (err as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) {
          await db.pushSubscription.deleteMany({ where: { endpoint: s.endpoint } }).catch(() => {});
        }
      }
    }),
  );
}
