import type { NextRequest } from "next/server";
import { z } from "zod";

import { ApiError, handle, ok, readJson } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";
import { getActiveTripId } from "@/lib/services/trip";
import { collectStamp } from "@/lib/services/stampsService";
import { logActivity } from "@/lib/services/activityService";
import { findStampAt, STAMP_CATALOG, distanceM } from "@/lib/ekiStamps";

const body = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/**
 * POST /api/v1/stamps/collect { lat, lng }
 * Schaltet den Eki-Stamp frei, wenn der Standort im Umkreis eines Katalog-Orts liegt.
 * Sonst 422 mit Hinweis auf den nächstgelegenen Ort.
 */
export function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const tripId = await getActiveTripId(user.id);
    const { lat, lng } = body.parse(await readJson(req));

    const hit = findStampAt(lat, lng);
    if (!hit) {
      // Nächstgelegenen Ort für hilfreiches Feedback ermitteln.
      let nearest = STAMP_CATALOG[0];
      let nd = Infinity;
      for (const s of STAMP_CATALOG) {
        const d = distanceM(lat, lng, s.lat, s.lng);
        if (d < nd) {
          nd = d;
          nearest = s;
        }
      }
      throw new ApiError(
        422,
        `Kein Stempel-Ort in der Nähe. Nächster: ${nearest.name} (${(nd / 1000).toFixed(1)} km entfernt).`,
      );
    }

    await collectStamp(tripId, hit.spot.key, user.name);
    logActivity({
      tripId,
      userId: user.id,
      userName: user.name,
      action: "stamp.collect",
      summary: hit.spot.name,
    });
    return ok({ stampKey: hit.spot.key, name: hit.spot.name, distM: Math.round(hit.distM) }, 201);
  });
}
