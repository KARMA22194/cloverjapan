import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { ProfileForm } from "@/components/ProfileForm";

export const metadata: Metadata = { title: "Profil – Time Tracker" };

export default async function ProfilPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div>
      <h1 className="mb-1 text-xl text-slate-900 dark:text-slate-100">Profil</h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">Lege dein Profilbild fest.</p>
      <ProfileForm />
    </div>
  );
}
