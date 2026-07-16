import { z } from "zod";
import type { LuggageTag } from "@prisma/client";

// Geteilte Validierung/DTO für die Luggage-Endpunkte (Route-Dateien dürfen nur Handler exportieren).

export const luggageBody = z.object({
  label: z.string().trim().min(1, "Bezeichnung fehlt.").max(80),
  ownerName: z.string().trim().min(1, "Name fehlt.").max(80),
  notifyEmail: z.string().trim().email("Ungültige E-Mail.").max(200).optional().or(z.literal("")),
  whatsapp: z.string().trim().max(30).optional().default(""),
  contact: z.string().trim().max(120).optional().default(""),
});

export const toLuggageDto = (t: LuggageTag) => ({
  id: t.id,
  token: t.token,
  label: t.label,
  ownerName: t.ownerName,
  notifyEmail: t.notifyEmail,
  whatsapp: t.whatsapp,
  contact: t.contact,
  by: t.createdByName,
});
