"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { hoursToMinutes } from "@/lib/time";
import { timeEntryCreateSchema, timeEntryUpdateSchema } from "@/lib/validation";
import {
  createTimeEntry,
  updateTimeEntryOwned,
  deleteTimeEntryOwned,
} from "@/lib/services/timeEntries";

export interface ActionState {
  ok: boolean;
  error?: string;
}

function firstError(flatten: { formErrors: string[]; fieldErrors: Record<string, string[] | undefined> }): string {
  const field = Object.values(flatten.fieldErrors).find((v) => v && v.length > 0);
  return field?.[0] ?? flatten.formErrors[0] ?? "Ungültige Eingabe.";
}

function revalidateFor(dateParam: string) {
  const [year, month] = dateParam.split("-");
  revalidatePath(`/day/${dateParam}`);
  revalidatePath(`/month/${year}/${Number(month)}`);
  revalidatePath(`/year/${year}`);
}

export async function createTimeEntryAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Nicht angemeldet." };

  const parsed = timeEntryCreateSchema.safeParse({
    date: formData.get("date"),
    projectId: formData.get("projectId"),
    hours: formData.get("hours"),
    note: formData.get("note"),
  });
  if (!parsed.success) return { ok: false, error: firstError(parsed.error.flatten()) };

  const { date, projectId, hours, note } = parsed.data;
  await createTimeEntry({
    userId: session.user.id,
    projectId,
    dateParam: date,
    minutes: hoursToMinutes(hours),
    note: note || null,
  });

  revalidateFor(date);
  return { ok: true };
}

export async function updateTimeEntryAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Nicht angemeldet." };

  const dateParam = String(formData.get("date") ?? "");
  const parsed = timeEntryUpdateSchema.safeParse({
    id: formData.get("id"),
    projectId: formData.get("projectId"),
    hours: formData.get("hours"),
    note: formData.get("note"),
  });
  if (!parsed.success) return { ok: false, error: firstError(parsed.error.flatten()) };

  const { id, projectId, hours, note } = parsed.data;
  const count = await updateTimeEntryOwned({
    id,
    userId: session.user.id,
    projectId,
    minutes: hoursToMinutes(hours),
    note: note || null,
  });
  if (count === 0) return { ok: false, error: "Eintrag nicht gefunden." };

  if (dateParam) revalidateFor(dateParam);
  return { ok: true };
}

export async function deleteTimeEntryAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user) return;

  const id = String(formData.get("id") ?? "");
  const dateParam = String(formData.get("date") ?? "");
  if (!id) return;

  await deleteTimeEntryOwned(id, session.user.id);
  if (dateParam) revalidateFor(dateParam);
}
