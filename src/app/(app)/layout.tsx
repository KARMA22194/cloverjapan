import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { TopNav } from "@/components/TopNav";
import { BiometricLock } from "@/components/BiometricLock";
import { WeatherWidget } from "@/components/WeatherWidget";
import { OfflineBanner } from "@/components/OfflineBanner";
import { PresenceHeartbeat } from "@/components/PresenceHeartbeat";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const isAdmin = session.user.role === "ADMIN";

  // Ausklappbare Kategorien in der oberen Leiste (nur noch Japan-Bereich + Verwaltung).
  // „Mehr" ist rein administrativ (Admin-Verwaltung + API-Doku) → nur für ADMIN;
  // leere Gruppen werden ausgeblendet, damit kein leeres Dropdown erscheint.
  const groups = [
    {
      label: "Japan",
      items: [
        { href: "/reiseplaner", label: "Reiseplaner", match: "/reiseplaner" },
        { href: "/fluege", label: "Flüge", match: "/fluege" },
        { href: "/programm", label: "Programm", match: "/programm" },
        { href: "/geld", label: "Geld", match: "/geld" },
        { href: "/info", label: "Info", match: "/info" },
        { href: "/mitglieder", label: "Mitglieder", match: "/mitglieder" },
      ],
    },
    {
      label: "Mehr",
      items: isAdmin
        ? [
            { href: "/admin", label: "Admin", match: "/admin" },
            { href: "/api-docs", label: "API-Doku", match: "/api-docs" },
          ]
        : [],
    },
  ].filter((g) => g.items.length > 0);

  return (
    <BiometricLock>
      <div className="min-h-full">
        <PresenceHeartbeat />
        <OfflineBanner />
        <TopNav
          groups={groups}
          userName={session.user.name ?? session.user.email ?? "Nutzer"}
        />
        <main className="mx-auto max-w-6xl px-4 py-6">
          <div className="lg:flex lg:items-start lg:gap-6">
            <div className="min-w-0 flex-1">{children}</div>
            {/* Tokio-Wetter: nur auf Laptop/PC (auf dem Handy gibt es den Info-Bereich). */}
            <aside className="hidden w-64 shrink-0 lg:block print:hidden">
              <div className="sticky top-6">
                <WeatherWidget />
              </div>
            </aside>
          </div>
        </main>
      </div>
    </BiometricLock>
  );
}
