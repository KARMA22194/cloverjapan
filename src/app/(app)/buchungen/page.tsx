import { redirect } from "next/navigation";

// In den gemeinsamen "Programm"-Bereich verschoben (Tab-Ansicht).
export default function Page() {
  redirect("/programm?tab=buchungen");
}
