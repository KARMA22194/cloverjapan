/**
 * Kanonische Liste der **Bereichs-Symbole**.
 *
 * Vorher standen diese 24 Emoji fest verteilt in sechs Dateien (Start-Kacheln,
 * die vier Tab-Leisten, Mobile-Menü). Es gab keinen Ort, an dem „das Symbol für
 * Geld" definiert war — entsprechend ließ sich auch keines austauschen.
 *
 * Hier liegt jetzt der Standard. Ein Mitglied kann jedes einzelne Symbol im
 * Profil durch ein eigenes Bild ersetzen; wo keines hinterlegt ist, bleibt das
 * Emoji. Das **Logo** gehört bewusst NICHT dazu: es ist Markenzeichen, keine
 * Bereichs-Illustration (siehe `src/components/Logo.tsx`).
 *
 * Bewusst frei von Prisma-Importen — die Datei landet im Client-Bundle.
 */

export interface SectionIconDef {
  /** Standard-Emoji, solange kein eigenes Bild hinterlegt ist. */
  emoji: string;
  /** Klartext für die Auswahl im Profil (und als `alt`/`title`). */
  label: string;
  /** Gruppierung in der Profil-Auswahl. */
  group: "Bereiche" | "Geld" | "Programm" | "Info" | "Reiseplaner";
}

export const SECTION_ICONS = {
  // --- Hauptbereiche (Start-Kacheln, Mobile-Menü) ---
  start: { emoji: "🏠", label: "Start / Übersicht", group: "Bereiche" },
  reiseplaner: { emoji: "🗾", label: "Reiseplaner", group: "Bereiche" },
  fluege: { emoji: "✈️", label: "Flüge", group: "Bereiche" },
  programm: { emoji: "🗓️", label: "Programm", group: "Bereiche" },
  geld: { emoji: "💴", label: "Geld", group: "Bereiche" },
  info: { emoji: "🧭", label: "Info", group: "Bereiche" },
  mitglieder: { emoji: "👥", label: "Mitglieder", group: "Bereiche" },
  profil: { emoji: "🙂", label: "Profil", group: "Bereiche" },
  admin: { emoji: "⚙️", label: "Admin", group: "Bereiche" },

  // --- Tabs in /geld ---
  ausgaben: { emoji: "💴", label: "Ausgaben", group: "Geld" },
  abrechnung: { emoji: "🧮", label: "Abrechnung", group: "Geld" },
  zoll: { emoji: "🛃", label: "Zoll", group: "Geld" },
  wunschliste: { emoji: "🛍️", label: "Wunschliste", group: "Geld" },

  // --- Tabs in /programm ---
  ablauf: { emoji: "🗓️", label: "Reiseablauf", group: "Programm" },
  tagesplaner: { emoji: "📝", label: "Tagesplaner", group: "Programm" },
  buchungen: { emoji: "🎟️", label: "Buchungen", group: "Programm" },
  checkliste: { emoji: "✅", label: "Checkliste", group: "Programm" },

  // --- Tabs in /info ---
  uebersicht: { emoji: "🧭", label: "Übersicht", group: "Info" },
  wetter: { emoji: "☀️", label: "Wetter", group: "Info" },
  stempel: { emoji: "⛩️", label: "Stempel", group: "Info" },
  koffer: { emoji: "🧳", label: "Koffer", group: "Info" },
  notfall: { emoji: "🆘", label: "Notfall & Basics", group: "Info" },

  // --- Interne Tabs im Reiseplaner ---
  plannerMap: { emoji: "🗺️", label: "Karte & Route", group: "Reiseplaner" },
  plannerList: { emoji: "📋", label: "Import", group: "Reiseplaner" },
} as const satisfies Record<string, SectionIconDef>;

export type SectionId = keyof typeof SECTION_ICONS;

export const SECTION_IDS = Object.keys(SECTION_ICONS) as SectionId[];

/** Laufzeit-Prüfung für API-Eingaben (Zod nutzt das als `refine`). */
export function isSectionId(v: string): v is SectionId {
  return Object.prototype.hasOwnProperty.call(SECTION_ICONS, v);
}

/** Reihenfolge der Gruppen in der Profil-Auswahl. */
export const SECTION_GROUPS = ["Bereiche", "Geld", "Programm", "Info", "Reiseplaner"] as const;

/**
 * Zielgröße der längeren Kante. 96 px reicht für die größte Darstellung
 * (Start-Kachel, 26 px) auch auf Retina mit Reserve.
 *
 * Das Byte-Limit bleibt bewusst klein: die Bilder werden im `(app)`-Layout **pro
 * Seitenaufruf** mitgeladen, sobald jemand welche hinterlegt hat. Deckel für
 * alle 24 zusammen wäre also knapp ein halbes Megabyte — deshalb speichert
 * `prepareSectionIcon` undurchsichtige Motive als JPEG statt als PNG.
 */
export const ICON_PIXEL_SIZE = 96;
export const ICON_MAX_BYTES = 20_000;
