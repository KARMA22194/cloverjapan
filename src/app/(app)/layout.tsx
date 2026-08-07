import { requireSessionUser } from "@/lib/auth-session";
import { TopNav } from "@/components/TopNav";
import { BiometricLock } from "@/components/BiometricLock";
import { WeatherWidget } from "@/components/WeatherWidget";
import { OfflineBanner } from "@/components/OfflineBanner";
import { PresenceHeartbeat } from "@/components/PresenceHeartbeat";
import { StorageOwnerGuard } from "@/components/StorageOwnerGuard";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Frischer DB-Check (Revocation) statt reinem Cookie: deaktivierte/degradierte
  // Konten verlieren den SSR-Zugriff sofort. isAdmin aus der DB-Rolle, nicht dem JWT.
  const user = await requireSessionUser();
  const isAdmin = user.role === "ADMIN";

  // Ausklappbare Kategorien in der oberen Leiste (nur noch der Japan-Bereich).
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
  ];

  // Verwaltung (Admin + API-Doku) — nur für ADMIN; landet im Profil-Menü,
  // statt in einem eigenen „Mehr"-Reiter.
  const adminItems = isAdmin
    ? [
        { href: "/admin", label: "Admin", match: "/admin" },
        { href: "/api-docs", label: "API-Doku", match: "/api-docs" },
      ]
    : [];

  return (
    <BiometricLock>
      <div className="min-h-full">
        <PresenceHeartbeat />
        <StorageOwnerGuard userId={user.id} />
        <OfflineBanner />
        <TopNav
          groups={groups}
          adminItems={adminItems}
          userName={user.name || user.email || "Nutzer"}
          userImage={user.image}
        />
        <main className="mx-auto max-w-6xl px-4 py-8">
          <div className="lg:flex lg:items-start lg:gap-8">
            <div className="min-w-0 flex-1">{children}</div>
            {/* Tokio-Wetter: nur auf Laptop/PC (auf dem Handy gibt es den Info-Bereich). */}
            <aside className="hidden w-64 shrink-0 lg:block print:hidden">
              {/* Abstand von oben = Höhe der jetzt klebenden TopNav + Luft;
                  mit `top-6` würde die Seitenleiste unter die Leiste rutschen. */}
              <div className="sticky top-[4.75rem]">
                <WeatherWidget />
              </div>
            </aside>
          </div>
        </main>
      </div>
    </BiometricLock>
  );
}
