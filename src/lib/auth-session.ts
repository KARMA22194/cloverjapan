import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";

import { auth } from "@/auth";
import { db } from "@/lib/db";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: Role;
}

/**
 * Session-Nutzer für **Server Components** (SSR-Reads) mit frischem DB-Check.
 *
 * Anders als der reine `auth()`-Cookie-Check greift hier die Session-Revocation
 * sofort: `active`/`emailVerified`/`role` werden bei jedem Request frisch aus der DB
 * gelesen (analog `requireUser()` im API-Pfad). Deaktiviert/degradiert ein Admin einen
 * Nutzer, verliert dieser den Zugriff sofort — nicht erst nach Ablauf des 12-h-JWT.
 *
 * Bei fehlender/entzogener Berechtigung → Redirect auf `/login`.
 */
export async function requireSessionUser(): Promise<SessionUser> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) redirect("/login");
  const sessionVersion = session!.user.sessionVersion;

  const fresh = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      role: true,
      active: true,
      emailVerified: true,
      sessionVersion: true,
    },
  });
  // Passwort-Reset (sessionVersion++) invalidiert alte SSR-Sessions ebenso (M2).
  if (!fresh || !fresh.active || !fresh.emailVerified || fresh.sessionVersion !== sessionVersion) {
    redirect("/login");
  }

  return {
    id: fresh.id,
    name: fresh.name,
    email: fresh.email,
    image: fresh.image,
    role: fresh.role,
  };
}
