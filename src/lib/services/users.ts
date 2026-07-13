import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";

export function listUsers() {
  return db.user.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      createdAt: true,
    },
  });
}

export async function createUser(input: {
  name: string;
  email: string;
  password: string;
  role: Role;
}) {
  const passwordHash = await bcrypt.hash(input.password, 10);
  return db.user.create({
    data: {
      name: input.name,
      email: input.email.toLowerCase(),
      passwordHash,
      role: input.role,
      // Admin-angelegte Konten gelten als bestätigt (keine Selbst-Registrierung).
      emailVerified: new Date(),
    },
  });
}

/** Findet einen Nutzer per E-Mail (für den Passwort-Reset-Flow). */
export function findUserByEmail(email: string) {
  return db.user.findUnique({ where: { email: email.toLowerCase() } });
}

/** Markiert die E-Mail als bestätigt (Double-Opt-in abgeschlossen). */
export function markEmailVerified(userId: string) {
  return db.user.update({ where: { id: userId }, data: { emailVerified: new Date() } });
}

/** Setzt ein neues Passwort (Passwort-Reset). */
export async function setUserPassword(userId: string, password: string) {
  const passwordHash = await bcrypt.hash(password, 10);
  return db.user.update({ where: { id: userId }, data: { passwordHash } });
}

export function setUserActive(id: string, active: boolean) {
  return db.user.update({ where: { id }, data: { active } });
}

export async function getUserImage(userId: string): Promise<string | null> {
  const u = await db.user.findUnique({ where: { id: userId }, select: { image: true } });
  return u?.image ?? null;
}

export function setUserImage(userId: string, image: string | null) {
  return db.user.update({ where: { id: userId }, data: { image } });
}
