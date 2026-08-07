"use client";

import { createContext, useContext, type ReactNode } from "react";

import { SECTION_ICONS, type SectionId } from "@/lib/sectionIcons";

/**
 * Eigene Symbole des angemeldeten Nutzers (Bereich → Data-URL).
 *
 * Der Provider ist eine **Client**-Komponente im `(app)`-Layout; die Werte kommen
 * vom Server. Dadurch können auch Server Components (z. B. die Start-Kacheln)
 * `<SectionIcon>` verwenden: der Kontext wird von einem Client-Vorfahren
 * bereitgestellt, das funktioniert über Server-Komponenten hinweg.
 */
const SectionIconContext = createContext<Partial<Record<SectionId, string>>>({});

export function SectionIconProvider({
  icons,
  children,
}: {
  icons: Partial<Record<SectionId, string>>;
  children: ReactNode;
}) {
  return <SectionIconContext.Provider value={icons}>{children}</SectionIconContext.Provider>;
}

/**
 * Bereichs-Symbol: eigenes Bild, sonst das Standard-Emoji.
 *
 * Dekorativ (`aria-hidden`) — daneben steht immer der Bereichsname als Text, ein
 * zusätzliches Label würde Screenreader nur doppelt vorlesen lassen.
 */
export function SectionIcon({
  id,
  size = 20,
  className = "",
}: {
  id: SectionId;
  /** Kantenlänge in px. Das eigene Bild wird quadratisch eingepasst. */
  size?: number;
  className?: string;
}) {
  const custom = useContext(SectionIconContext)[id];
  const def = SECTION_ICONS[id];

  if (custom) {
    return (
      // Höhe fest, Breite frei (bis 1,6×): ein breites Logo in ein Quadrat zu
      // zwingen macht es flach und unleserlich — es würde auf die kürzere Kante
      // heruntergerechnet. So bleibt die Höhe wie beim Emoji, und ein Wortmarken-
      // Motiv darf sich seitlich ausdehnen, statt zu schrumpfen.
      // 1,6× ist die Grenze, die noch in die 44-px-Fläche der Start-Kachel passt —
      // darüber weitete sie sich und drückte den Beschreibungstext in mehr Zeilen.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={custom}
        alt=""
        aria-hidden
        style={{ height: size, width: "auto", maxWidth: size * 1.6 }}
        className={`inline-block shrink-0 object-contain align-[-0.2em] ${className}`}
      />
    );
  }
  return (
    <span
      aria-hidden
      // Emoji über `fontSize` skalieren, damit ein eigenes Bild derselben `size`
      // optisch gleich groß wirkt.
      style={{ fontSize: size, lineHeight: 1 }}
      className={`inline-block shrink-0 ${className}`}
    >
      {def.emoji}
    </span>
  );
}
