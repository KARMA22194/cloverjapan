"use server";

import type { ReactNode } from "react";

import { AblaufTimeline } from "@/components/AblaufTimeline";

/**
 * Lädt die Reiseablauf-Timeline **auf Anforderung** nach.
 *
 * Warum überhaupt: Die Timeline ist eine Server-Komponente und wurde als Prop in
 * die Tab-Leiste gereicht — damit lief sie bei **jedem** Aufruf von `/programm`,
 * auch bei `?tab=buchungen`, und kostete vier Queries umsonst.
 *
 * Warum nicht einfach echte Navigation pro Tab: dann verlöre jeder Tab-Wechsel den
 * Client-Zustand der übrigen Tabs (getippte Eingaben, geladene Listen) — genau das,
 * was `TabPanel` vermeidet. Eine Server Action darf JSX zurückgeben; so kommt der
 * fertig gerenderte Server-Knoten nach, ohne die Seite neu zu laden.
 */
export async function loadAblauf(): Promise<ReactNode> {
  return <AblaufTimeline />;
}
