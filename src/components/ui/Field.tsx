import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * Eingabe-Primitives.
 *
 * `outline-none` + eigener Ring ist Absicht: der Ring folgt dem Radius des Feldes
 * (ein Browser-`outline` tut das nicht überall) und wird beim Fokus zweistufig —
 * kräftiger Rand plus weiter Marken-Halo, damit auch bei viel Formular klar ist,
 * wo man tippt. In `globals.css` liegt die Fokus-Regel im `base`-Layer, deshalb
 * gewinnen diese Utilities.
 */

const FIELD =
  "w-full rounded-field bg-surface px-3 py-2 text-sm text-ink ring-1 ring-hairline outline-none transition placeholder:text-ink-subtle focus:ring-2 focus:ring-brand focus:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-60";

export function Input({ className, ...rest }: ComponentProps<"input">) {
  return <input className={cn(FIELD, className)} {...rest} />;
}

export function Textarea({ className, ...rest }: ComponentProps<"textarea">) {
  return <textarea className={cn(FIELD, "min-h-20 resize-y", className)} {...rest} />;
}

export function Select({ className, ...rest }: ComponentProps<"select">) {
  return <select className={cn(FIELD, "cursor-pointer pr-8", className)} {...rest} />;
}

/** Beschriftung über einem Feld. */
export function Label({
  children,
  className,
  ...rest
}: { children: ReactNode } & ComponentProps<"label">) {
  return (
    <label className={cn("mb-1 block text-xs font-semibold text-ink-muted", className)} {...rest}>
      {children}
    </label>
  );
}

export { FIELD as fieldClasses };
