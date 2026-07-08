import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { TopNav } from "@/components/TopNav";
import { todayParam } from "@/lib/time";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const today = todayParam();
  const [year, month] = today.split("-");
  // Bereich „Zeiterfassung"
  const links = [
    { href: `/day/${today}`, label: "Tag", match: "/day" },
    { href: `/month/${year}/${Number(month)}`, label: "Monat", match: "/month" },
    { href: `/year/${year}`, label: "Jahr", match: "/year" },
    { href: `/calendar/${year}/${Number(month)}`, label: "Kalender", match: "/calendar" },
  ];

  // Bereich „Reiseplaner"
  const secondaryLinks = [
    { href: "/reiseplaner", label: "Reiseplaner", match: "/reiseplaner" },
    { href: "/ausgaben", label: "Ausgaben", match: "/ausgaben" },
  ];

  return (
    <div className="min-h-full">
      <TopNav
        links={links}
        secondaryLinks={secondaryLinks}
        userName={session.user.name ?? session.user.email ?? "Nutzer"}
        isAdmin={session.user.role === "ADMIN"}
      />
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
