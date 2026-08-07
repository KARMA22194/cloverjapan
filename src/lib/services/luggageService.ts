import { randomBytes } from "crypto";

import { db } from "@/lib/db";
import { sendLuggageFoundEmail } from "@/lib/mailer";

export interface LuggageInput {
  label: string;
  ownerName: string;
  notifyEmail?: string;
  whatsapp?: string;
  contact?: string;
}

const newToken = () => randomBytes(9).toString("base64url"); // ~12 Zeichen, URL-sicher

/**
 * Freitext, der später in E-Mail-Betreff/-Body und den Discord-Webhook wandert.
 * Steuerzeichen (inkl. CR/LF) entfernen — sonst ließen sich über das Label
 * Mail-Header oder zusätzliche Zeilen in die Benachrichtigung schmuggeln.
 */
export function sanitizeNotifyText(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

/** Discord-Markdown entschärfen, damit Labels keine Formatierung/Links erzeugen. */
const escapeDiscord = (value: string) => value.replace(/([\\*_~`|>])/g, "\\$1");

export async function createLuggageTag(tripId: string, input: LuggageInput, byName: string) {
  return db.luggageTag.create({
    data: {
      tripId,
      token: newToken(),
      label: sanitizeNotifyText(input.label).slice(0, 80),
      ownerName: sanitizeNotifyText(input.ownerName).slice(0, 80),
      notifyEmail: input.notifyEmail?.trim() ?? "",
      whatsapp: input.whatsapp?.trim().replace(/[^\d+]/g, "") ?? "",
      contact: input.contact?.trim() ?? "",
      createdByName: byName,
    },
  });
}

export function listLuggageTags(tripId: string) {
  return db.luggageTag.findMany({ where: { tripId }, orderBy: { createdAt: "asc" } });
}

export async function deleteLuggageTagOwned(id: string, tripId: string) {
  const res = await db.luggageTag.deleteMany({ where: { id, tripId } });
  return res.count;
}

/** Öffentlicher Lookup für die Finder-Seite (nur unkritische Felder). */
export async function getLuggageByToken(token: string) {
  return db.luggageTag.findUnique({ where: { token } });
}

/**
 * Ist `email` die Adresse eines Mitglieds dieser Reise?
 *
 * Der Fund-Endpunkt `/api/v1/luggage/found/[token]` ist **öffentlich** — ohne diese
 * Schranke könnte ein Mitglied einen Anhänger mit beliebiger `notifyEmail` und
 * frei gewähltem Label anlegen und den Versand danach anonym auslösen: die App
 * würde zum offenen SMTP-Relay mit angreiferkontrolliertem Betreff/Inhalt.
 */
export async function isTripMemberEmail(tripId: string, email: string): Promise<boolean> {
  const found = await db.tripMember.findFirst({
    where: { tripId, user: { email: email.trim().toLowerCase() } },
    select: { userId: true },
  });
  return Boolean(found);
}

/** Owner benachrichtigen: E-Mail (falls Ziel/SMTP da) + Discord-Webhook (falls ENV gesetzt). */
export async function notifyLuggageFound(
  tag: { label: string; ownerName: string; notifyEmail: string },
  lat: number,
  lng: number,
): Promise<{ email: boolean; discord: boolean }> {
  const maps = `https://www.google.com/maps?q=${lat},${lng}`;
  const label = sanitizeNotifyText(tag.label);
  const ownerName = sanitizeNotifyText(tag.ownerName);

  let email = false;
  if (tag.notifyEmail) {
    email = await sendLuggageFoundEmail(tag.notifyEmail, label, lat, lng);
  }

  let discord = false;
  const hook = process.env.DISCORD_WEBHOOK_URL;
  if (hook) {
    try {
      const res = await fetch(hook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: `🧳 **Koffer gefunden!** „${escapeDiscord(label)}" (${escapeDiscord(ownerName)})\nStandort: ${maps}`,
          // Ohne dies könnte ein Label „@everyone" den ganzen Server anpingen —
          // ausgelöst durch einen anonymen QR-Scan.
          allowed_mentions: { parse: [] },
        }),
      });
      discord = res.ok;
    } catch {
      /* Webhook nicht erreichbar – unkritisch */
    }
  }
  return { email, discord };
}
