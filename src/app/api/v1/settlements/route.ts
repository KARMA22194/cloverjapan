import type { NextRequest } from "next/server";
import { z } from "zod";

import { badRequest, handle, ok, readJson } from "@/lib/api/http";
import { requireTripUser } from "@/lib/api/session";
import { clientIdSchema } from "@/lib/api/schemas";
import { areTripMembers } from "@/lib/services/trip";
import { createSettlement, listSettlements } from "@/lib/services/settlements";

const settlementBody = z.object({
  id: clientIdSchema,
  fromId: z.string().min(1).max(40),
  toId: z.string().min(1).max(40),
  fromName: z.string().max(100).optional().default(""),
  toName: z.string().max(100).optional().default(""),
  yen: z.number().int().positive().max(100_000_000),
});

const toSettlementDto = (s: {
  id: string;
  fromId: string;
  toId: string;
  fromName: string;
  toName: string;
  yen: number;
  createdAt: Date;
}) => ({
  id: s.id,
  fromId: s.fromId,
  toId: s.toId,
  fromName: s.fromName,
  toName: s.toName,
  yen: s.yen,
  createdAt: s.createdAt.toISOString(),
});

/** GET /api/v1/settlements — verbuchte Ausgleichszahlungen der Reise. */
export function GET() {
  return handle(async () => {
    const { tripId } = await requireTripUser();
    return ok((await listSettlements(tripId)).map(toSettlementDto));
  });
}

/** POST /api/v1/settlements — Zahlung verbuchen (Betrag als bezahlt markieren). */
export function POST(req: NextRequest) {
  return handle(async () => {
    const { user, tripId } = await requireTripUser();
    const body = settlementBody.parse(await readJson(req));
    // `fromId`/`toId` haben im Schema keinen Fremdschlüssel — ohne diese Prüfung
    // ließen sich beliebige Ids verbuchen und die Abrechnung verfälschen.
    if (!(await areTripMembers(tripId, [body.fromId, body.toId]))) {
      throw badRequest("Zahler und Empfänger müssen Mitglieder dieser Reise sein.");
    }
    return ok(toSettlementDto(await createSettlement(tripId, body, user.name)), 201);
  });
}
