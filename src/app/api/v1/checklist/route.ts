import type { NextRequest } from "next/server";
import { z } from "zod";

import { handle, ok, readJson } from "@/lib/api/http";
import { requireTripUser } from "@/lib/api/session";
import { enforceRateLimit } from "@/lib/rate";
import { getChecklist, replaceChecklist } from "@/lib/services/checklist";

const itemSchema = z.object({
  id: z.string().min(1).max(100),
  text: z.string().min(1).max(300),
  done: z.boolean(),
  assigneeName: z.string().max(100).optional().default(""),
  completedByName: z.string().max(100).optional().default(""),
});
const putBody = z.object({ items: z.array(itemSchema).max(500) });

const toDto = (i: {
  clientId: string;
  text: string;
  done: boolean;
  createdByName: string;
  assigneeName: string;
  completedByName: string;
}) => ({
  // Stabile Client-Kennung als `id` (server-seitiger PK bleibt intern).
  id: i.clientId,
  text: i.text,
  done: i.done,
  by: i.createdByName,
  assignee: i.assigneeName,
  completedBy: i.completedByName,
});

/** GET /api/v1/checklist — Checkliste des aktuellen Nutzers. */
export function GET() {
  return handle(async () => {
    const { tripId } = await requireTripUser();
    return ok((await getChecklist(tripId)).map(toDto));
  });
}

/** PUT /api/v1/checklist — komplette Checkliste ersetzen. */
export function PUT(req: NextRequest) {
  return handle(async () => {
    const { user, tripId } = await requireTripUser();
    // Voll-Replace mit bis zu 500 Einträgen — analog trip-stops drosseln.
    await enforceRateLimit(`checklist-put:${user.id}`, 120, 60 * 60 * 1000);
    const { items } = putBody.parse(await readJson(req));
    return ok((await replaceChecklist(tripId, items, user.name)).map(toDto));
  });
}
