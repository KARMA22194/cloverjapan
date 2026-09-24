import { z } from "zod";

import { clientIdSchema } from "@/lib/api/schemas";

// Geteilte Validierung/DTO für die Wunschlisten-Endpunkte (nicht in route.ts).

export const createBody = z.object({
  id: clientIdSchema,
  label: z.string().trim().min(1, "Bezeichnung fehlt.").max(200),
  priceYen: z.number().int().positive().max(100_000_000).nullish(),
});

export const patchBody = z
  .object({
    label: z.string().trim().min(1).max(200).optional(),
    priceYen: z.number().int().positive().max(100_000_000).nullish(),
    bought: z.boolean().optional(),
  })
  .refine((d) => d.label !== undefined || d.priceYen !== undefined || d.bought !== undefined, {
    message: "Nichts zu ändern.",
  });

export const toWishlistDto = (w: {
  id: string;
  label: string;
  priceYen: number | null;
  bought: boolean;
  createdByName: string;
}) => ({
  id: w.id,
  label: w.label,
  priceYen: w.priceYen,
  bought: w.bought,
  by: w.createdByName,
});
