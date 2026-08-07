import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { ProfileForm } from "@/components/ProfileForm";
import { PushToggle } from "@/components/PushToggle";

export const metadata: Metadata = { title: "Profil – Time Tracker" };

export default async function ProfilPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-1 text-xl text-ink">Profil</h1>
        <p className="mb-4 text-sm text-ink-muted">
          Lege dein Profilbild fest.
        </p>
        <ProfileForm />
      </div>
      <div className="max-w-md">
        <PushToggle />
      </div>
    </div>
  );
}
