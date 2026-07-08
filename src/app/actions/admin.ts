"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

import { auth } from "@/auth";
import { projectCreateSchema, userCreateSchema } from "@/lib/validation";
import { createProject, setProjectArchived } from "@/lib/services/projects";
import { createUser, setUserActive } from "@/lib/services/users";

export interface ActionState {
  ok: boolean;
  error?: string;
}

async function requireAdmin(): Promise<string | null> {
  const session = await auth();
  if (!session?.user) return "Nicht angemeldet.";
  if (session.user.role !== "ADMIN") return "Keine Berechtigung.";
  return null;
}

function firstError(flatten: { formErrors: string[]; fieldErrors: Record<string, string[] | undefined> }): string {
  const field = Object.values(flatten.fieldErrors).find((v) => v && v.length > 0);
  return field?.[0] ?? flatten.formErrors[0] ?? "Ungültige Eingabe.";
}

export async function createProjectAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const denied = await requireAdmin();
  if (denied) return { ok: false, error: denied };

  const parsed = projectCreateSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code"),
    color: formData.get("color") || undefined,
  });
  if (!parsed.success) return { ok: false, error: firstError(parsed.error.flatten()) };

  try {
    await createProject(parsed.data);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: "Projekt-Kürzel bereits vergeben." };
    }
    throw e;
  }

  revalidatePath("/admin");
  return { ok: true };
}

export async function toggleProjectArchivedAction(formData: FormData): Promise<void> {
  if (await requireAdmin()) return;
  const id = String(formData.get("id") ?? "");
  const archived = String(formData.get("archived") ?? "") === "true";
  if (!id) return;
  await setProjectArchived(id, archived);
  revalidatePath("/admin");
}

export async function createUserAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const denied = await requireAdmin();
  if (denied) return { ok: false, error: denied };

  const parsed = userCreateSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { ok: false, error: firstError(parsed.error.flatten()) };

  try {
    await createUser(parsed.data);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: "E-Mail-Adresse bereits vergeben." };
    }
    throw e;
  }

  revalidatePath("/admin");
  return { ok: true };
}

export async function toggleUserActiveAction(formData: FormData): Promise<void> {
  if (await requireAdmin()) return;
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  if (!id) return;
  await setUserActive(id, active);
  revalidatePath("/admin");
}
