import { redirect } from "next/navigation";
import { todayParam } from "@/lib/time";

// Einstieg → Tagesansicht von heute.
export default function Home() {
  redirect(`/day/${todayParam()}`);
}
