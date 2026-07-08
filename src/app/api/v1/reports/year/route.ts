import type { NextRequest } from "next/server";
import { z } from "zod";

import { handle, ok } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";
import { getYearReport } from "@/lib/services/reports";

const querySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
});

/** GET /api/v1/reports/year?year= — Jahresmatrix (Monat × Projekt) des aktuellen Nutzers. */
export function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const { year } = querySchema.parse({ year: req.nextUrl.searchParams.get("year") });
    const report = await getYearReport(user.id, year);
    return ok(report);
  });
}
