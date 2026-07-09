import type { NextRequest } from "next/server";
import { z } from "zod";

import { handle, ok, readJson } from "@/lib/api/http";
import { requireUser } from "@/lib/api/session";
import { getActiveTripId } from "@/lib/services/trip";
import { getChecklist, replaceChecklist } from "@/lib/services/checklist";

const itemSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1).max(300),
  done: z.boolean(),
});
const putBody = z.object({ items: z.array(itemSchema).max(500) });

const toDto = (i: { id: string; text: string; done: boolean }) => ({
  id: i.id,
  text: i.text,
  done: i.done,
});

/** GET /api/v1/checklist — Checkliste des aktuellen Nutzers. */
export function GET() {
  return handle(async () => {
    const user = await requireUser();
    const tripId = await getActiveTripId(user.id);
    return ok((await getChecklist(tripId)).map(toDto));
  });
}

/** PUT /api/v1/checklist — komplette Checkliste ersetzen. */
export function PUT(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const tripId = await getActiveTripId(user.id);
    const { items } = putBody.parse(await readJson(req));
    return ok((await replaceChecklist(tripId, items)).map(toDto));
  });
}
