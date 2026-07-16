import { randomBytes } from "crypto";

import { db } from "@/lib/db";
import { sendLuggageFoundEmail } from "@/lib/mailer";

export interface LuggageInput {
  label: string;
  ownerName: string;
  notifyEmail?: string;
  whatsapp?: string;
}

const newToken = () => randomBytes(9).toString("base64url"); // ~12 Zeichen, URL-sicher

export async function createLuggageTag(tripId: string, input: LuggageInput, byName: string) {
  return db.luggageTag.create({
    data: {
      tripId,
      token: newToken(),
      label: input.label.trim(),
      ownerName: input.ownerName.trim(),
      notifyEmail: input.notifyEmail?.trim() ?? "",
      whatsapp: input.whatsapp?.trim().replace(/[^\d+]/g, "") ?? "",
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

/** Owner benachrichtigen: E-Mail (falls Ziel/SMTP da) + Discord-Webhook (falls ENV gesetzt). */
export async function notifyLuggageFound(
  tag: { label: string; ownerName: string; notifyEmail: string },
  lat: number,
  lng: number,
): Promise<{ email: boolean; discord: boolean }> {
  const maps = `https://www.google.com/maps?q=${lat},${lng}`;
  let email = false;
  if (tag.notifyEmail) {
    email = await sendLuggageFoundEmail(tag.notifyEmail, tag.label, lat, lng);
  }

  let discord = false;
  const hook = process.env.DISCORD_WEBHOOK_URL;
  if (hook) {
    try {
      const res = await fetch(hook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: `🧳 **Koffer gefunden!** „${tag.label}" (${tag.ownerName})\nStandort: ${maps}`,
        }),
      });
      discord = res.ok;
    } catch {
      /* Webhook nicht erreichbar – unkritisch */
    }
  }
  return { email, discord };
}
