import { z } from "zod";

import { dateStr } from "@/lib/api/dates";
import { clientIdSchema } from "@/lib/api/schemas";
import { toDateParam } from "@/lib/time";

// Geteilte Validierung/DTO für die Trip-Hotel-Endpunkte. Bewusst NICHT in route.ts:
// Next.js erlaubt in Route-Dateien ausschließlich Handler-Exporte.

export const hotelBody = z.object({
  id: clientIdSchema,
  // Nominatim-Labels können lang sein → nicht hart ablehnen, sondern auf 300 kürzen.
  label: z
    .string()
    .trim()
    .min(1)
    .max(5000)
    .transform((s) => s.slice(0, 300)),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  checkIn: dateStr,
  checkOut: dateStr,
});

export const hotelPatch = z
  .object({ checkIn: dateStr, checkOut: dateStr })
  .refine((v) => v.checkIn !== undefined || v.checkOut !== undefined, {
    message: "Kein Feld zum Aktualisieren angegeben.",
  });

export const toHotelDto = (h: {
  id: string;
  label: string;
  lat: number;
  lng: number;
  checkIn: Date | null;
  checkOut: Date | null;
  createdByName: string;
}) => ({
  id: h.id,
  label: h.label,
  lat: h.lat,
  lng: h.lng,
  // DB hält echte Dates; nach außen bleibt es YYYY-MM-DD.
  checkIn: h.checkIn ? toDateParam(h.checkIn) : null,
  checkOut: h.checkOut ? toDateParam(h.checkOut) : null,
  by: h.createdByName,
});
