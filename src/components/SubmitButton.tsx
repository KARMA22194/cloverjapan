"use client";

import { useFormStatus } from "react-dom";

import { buttonClasses } from "@/components/ui/Button";

export function SubmitButton({
  children,
  className = "",
  pendingLabel,
}: {
  children: React.ReactNode;
  className?: string;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      // Das `className` der Aufrufstelle geht durch `buttonClasses` (also durch
      // tailwind-merge) — bei bloßer Verkettung entschiede die Reihenfolge im
      // Stylesheet, und ein `w-full` von außen könnte wirkungslos bleiben.
      className={buttonClasses("primary", "md", className)}
    >
      {pending ? (pendingLabel ?? "…") : children}
    </button>
  );
}
