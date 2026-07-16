import type { Metadata } from "next";

import { getLuggageByToken } from "@/lib/services/luggageService";
import { LuggageFinder } from "@/components/LuggageFinder";
import { Logo } from "@/components/Logo";

export const metadata: Metadata = { title: "Koffer gefunden? – Clover Japan" };

// Öffentliche Finder-Seite (kein Login). Zeigt nur den vom Besitzer gewählten
// Namen/Bezeichnung – niemals die hinterlegte Benachrichtigungs-E-Mail.
export default async function KofferFinderPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const tag = await getLuggageByToken(token);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6 py-12 text-center">
      <Logo height={72} />
      {!tag ? (
        <p className="text-slate-600 dark:text-slate-300">
          Dieser Kofferanhänger ist unbekannt oder wurde entfernt.
        </p>
      ) : (
        <>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Danke, dass du hilfst! 🙏
            </h1>
            <p className="text-slate-700 dark:text-slate-200">
              Dieser Koffer gehört <strong>{tag.ownerName}</strong>.
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400">🧳 „{tag.label}"</p>
            <p className="pt-2 text-sm text-slate-500 dark:text-slate-400">
              Wenn du magst, teile kurz deinen Standort – {tag.ownerName} bekommt ihn sofort und
              kann den Koffer zurückholen.
            </p>
          </div>
          <LuggageFinder
            token={tag.token}
            label={tag.label}
            ownerName={tag.ownerName}
            whatsapp={tag.whatsapp}
          />
        </>
      )}
    </main>
  );
}
