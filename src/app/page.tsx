import { redirect } from "next/navigation";

// Einstieg → kategorisierte Übersicht.
export default function Home() {
  redirect("/start");
}
