import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

/**
 * Pill für Status/Metadaten (Rolle, „online", Flug-Status, Sitzplatz …).
 *
 * Farbige Töne stehen hier bewusst **mit** `dark:`-Varianten: sie sind
 * Bedeutungsträger und lassen sich nicht über die neutralen Flächen-Tokens
 * ausdrücken.
 */
const TONE = {
  neutral: "bg-surface-2 text-ink-muted ring-1 ring-hairline",
  brand: "bg-brand/12 text-brand-dark ring-1 ring-brand/25 dark:bg-brand/20 dark:text-brand-tint",
  accent:
    "bg-accent/14 text-[#9a4a00] ring-1 ring-accent/30 dark:bg-accent/20 dark:text-[#ffc48a]",
  success:
    "bg-emerald-500/12 text-emerald-700 ring-1 ring-emerald-500/25 dark:bg-emerald-500/20 dark:text-emerald-300",
  danger:
    "bg-danger/12 text-danger ring-1 ring-danger/25 dark:bg-danger/20 dark:text-[#ff9aa4]",
} as const;

export type ChipTone = keyof typeof TONE;

export function Chip({
  tone = "neutral",
  className,
  ...rest
}: { tone?: ChipTone } & ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        TONE[tone],
        className,
      )}
      {...rest}
    />
  );
}
