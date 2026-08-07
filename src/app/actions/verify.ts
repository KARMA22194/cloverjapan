"use server";

import { redirect } from "next/navigation";

import { consumeToken } from "@/lib/services/tokens";
import { markEmailVerified } from "@/lib/services/users";

/**
 * Löst den E-Mail-Bestätigungstoken ein — bewusst als **POST**-Server-Action.
 *
 * Zuvor geschah das direkt beim Aufruf der Seite (GET). Link-Scanner in
 * Mail-Gateways (Outlook SafeLinks & Co.), Prefetcher und Virenscanner öffnen
 * solche Links automatisch und verbrauchten den Einmal-Token, bevor der Mensch
 * geklickt hatte — das Konto war dann ohne Ausweg gesperrt.
 */
export async function verifyEmailAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  if (!token) redirect("/verify?status=fail");

  const userId = await consumeToken(token, "EMAIL_VERIFY");
  if (!userId) redirect("/verify?status=fail");

  await markEmailVerified(userId);
  redirect("/verify?status=ok");
}
