import { redirect } from "next/navigation";

// In den gemeinsamen "Geld"-Bereich verschoben (Tab-Ansicht).
export default function Page() {
  redirect("/geld?tab=zoll");
}
