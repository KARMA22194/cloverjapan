import type { Metadata } from "next";

import { getLuggageByToken } from "@/lib/services/luggageService";
import { LuggageFinder } from "@/components/LuggageFinder";
import { Logo } from "@/components/Logo";

export const metadata: Metadata = {
  title: "Koffer gefunden? – Clover Japan",
  // Nicht indexieren: teilt ein Finder den Link (Chat, Social), landete die
  // Token-URL sonst im Suchindex — und damit Name und Bezeichnung des Koffers
  // samt der Möglichkeit, dem Besitzer Falschmeldungen zu schicken.
  robots: { index: false, follow: false, nocache: true },
};

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
        <div className="space-y-1 text-ink-muted">
          <p>Dieser Kofferanhänger ist unbekannt oder wurde entfernt.</p>
          <p>This luggage tag is unknown or has been removed.</p>
          <p>この荷物タグは無効か、削除されています。</p>
        </div>
      ) : (
        <LuggageFinder
          token={tag.token}
          label={tag.label}
          ownerName={tag.ownerName}
          whatsapp={tag.whatsapp}
          contact={tag.contact}
        />
      )}
    </main>
  );
}
