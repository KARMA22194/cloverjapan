import { redirect } from "next/navigation";

// In den gemeinsamen "Info"-Bereich verschoben (Tab-Ansicht).
export default function Page() {
  redirect("/info?tab=uebersicht");
}
