import type { NextRequest } from "next/server";
import { z } from "zod";

import { handle, ok } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";
import { getMonthReport } from "@/lib/services/reports";

const querySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

/** GET /api/v1/reports/month?year=&month= — Monatsmatrix (Tag × Projekt) des aktuellen Nutzers. */
export function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const { year, month } = querySchema.parse({
      year: req.nextUrl.searchParams.get("year"),
      month: req.nextUrl.searchParams.get("month"),
    });
    const report = await getMonthReport(user.id, year, month);
    return ok(report);
  });
}
