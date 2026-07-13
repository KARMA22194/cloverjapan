import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { TopNav } from "@/components/TopNav";
import { BiometricLock } from "@/components/BiometricLock";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const isAdmin = session.user.role === "ADMIN";

  // Ausklappbare Kategorien in der oberen Leiste (nur noch Japan-Bereich + Verwaltung).
  const groups = [
    {
      label: "Japan",
      items: [
        { href: "/reiseplaner", label: "Reiseplaner", match: "/reiseplaner" },
        { href: "/fluege", label: "Flüge", match: "/fluege" },
        { href: "/ausgaben", label: "Ausgaben", match: "/ausgaben" },
        { href: "/zoll", label: "Zollrechner", match: "/zoll" },
        { href: "/tagesplaner", label: "Tagesplaner", match: "/tagesplaner" },
        { href: "/checkliste", label: "Checkliste", match: "/checkliste" },
        { href: "/mitglieder", label: "Mitglieder", match: "/mitglieder" },
      ],
    },
    {
      label: "Mehr",
      items: [
        ...(isAdmin ? [{ href: "/admin", label: "Admin", match: "/admin" }] : []),
        { href: "/api-docs", label: "API-Doku", match: "/api-docs" },
      ],
    },
  ];

  return (
    <BiometricLock>
      <div className="min-h-full">
        <TopNav
          groups={groups}
          userName={session.user.name ?? session.user.email ?? "Nutzer"}
        />
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </div>
    </BiometricLock>
  );
}
