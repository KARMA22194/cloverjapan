import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { TopNav } from "@/components/TopNav";
import { BiometricLock } from "@/components/BiometricLock";
import { todayParam } from "@/lib/time";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const today = todayParam();
  const [year, month] = today.split("-");
  const isAdmin = session.user.role === "ADMIN";

  // Ausklappbare Kategorien in der oberen Leiste.
  const groups = [
    {
      label: "Timetracker",
      items: [
        { href: `/day/${today}`, label: "Tag", match: "/day" },
        { href: `/month/${year}/${Number(month)}`, label: "Monat", match: "/month" },
        { href: `/year/${year}`, label: "Jahr", match: "/year" },
        { href: `/calendar/${year}/${Number(month)}`, label: "Kalender", match: "/calendar" },
        ...(isAdmin ? [{ href: "/admin", label: "Admin", match: "/admin" }] : []),
      ],
    },
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
