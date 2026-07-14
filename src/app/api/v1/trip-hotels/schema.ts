import { z } from "zod";

import { dateStr } from "@/lib/api/dates";

// Geteilte Validierung/DTO für die Trip-Hotel-Endpunkte. Bewusst NICHT in route.ts:
// Next.js erlaubt in Route-Dateien ausschließlich Handler-Exporte.

export const hotelBody = z.object({
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
  checkIn: string | null;
  checkOut: string | null;
  createdByName: string;
}) => ({
  id: h.id,
  label: h.label,
  lat: h.lat,
  lng: h.lng,
  checkIn: h.checkIn,
  checkOut: h.checkOut,
  by: h.createdByName,
});
