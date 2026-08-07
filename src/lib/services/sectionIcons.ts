import { db } from "@/lib/db";
import type { SectionId } from "@/lib/sectionIcons";

/** Zuordnung Bereich → eigenes Bild (Data-URL). Fehlt ein Eintrag, gilt das Emoji. */
export type SectionIconMap = Partial<Record<SectionId, string>>;

/**
 * Eigene Symbole eines Nutzers.
 *
 * `hasCustom` kommt aus dem Spiegel-Flag `User.customIcons`, das der Aufrufer
 * ohnehin schon geladen hat (`requireSessionUser`). Steht es auf `false`, wird die
 * Tabelle **nicht** angefasst — der Normalfall „alles Standard" kostet damit keine
 * zusätzliche Query pro Seitenaufruf.
 */
export async function getSectionIcons(userId: string, hasCustom: boolean): Promise<SectionIconMap> {
  if (!hasCustom) return {};
  const rows = await db.userSectionIcon.findMany({
    where: { userId },
    select: { section: true, data: true },
  });
  return Object.fromEntries(rows.map((r) => [r.section, r.data])) as SectionIconMap;
}

/**
 * Symbol setzen. Bild und Flag wandern in **einer** Transaktion, damit das Flag
 * nie „true" behauptet, ohne dass eine Zeile existiert (und umgekehrt) — sonst
 * würde das Layout entweder umsonst abfragen oder die Bilder gar nicht laden.
 */
export async function setSectionIcon(userId: string, section: SectionId, data: string) {
  await db.$transaction([
    db.userSectionIcon.upsert({
      where: { userId_section: { userId, section } },
      create: { userId, section, data },
      update: { data },
    }),
    db.user.update({ where: { id: userId }, data: { customIcons: true } }),
  ]);
}

/**
 * Symbol zurücksetzen (danach gilt wieder das Emoji). War es das letzte eigene
 * Bild, fällt das Flag zurück auf `false`.
 */
export async function deleteSectionIcon(userId: string, section: SectionId) {
  await db.$transaction(async (tx) => {
    await tx.userSectionIcon.deleteMany({ where: { userId, section } });
    const left = await tx.userSectionIcon.count({ where: { userId } });
    if (left === 0) await tx.user.update({ where: { id: userId }, data: { customIcons: false } });
  });
}
