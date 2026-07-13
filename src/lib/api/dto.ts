import type { Role } from "@prisma/client";

/* Prisma-Datensätze → schlanke, stabile Response-DTOs (siehe schemas.ts).
 * Wichtig: nie das Prisma-Objekt direkt zurückgeben (z. B. User.passwordHash!),
 * sondern immer explizit die erlaubten Felder abbilden. */

interface UserInput {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: Date;
}

export function toUserDto(u: UserInput) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    active: u.active,
    createdAt: u.createdAt.toISOString(),
  };
}
