import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

/**
 * Knopf-Primitive mit den vier Rollen, die in der App vorkommen.
 *
 * `primary` bekommt einen sehr flachen Verlauf (eine Stufe heller oben) statt
 * einer Volltonfläche — das ist der Unterschied zwischen „blauer Block" und
 * „Knopf mit Licht von oben", ohne in Skeuomorphismus zu kippen.
 */

const VARIANT = {
  primary:
    "bg-gradient-to-b from-brand-lift to-brand text-white shadow-[0_1px_2px_rgb(15_23_42/0.14)] hover:brightness-[1.06] active:brightness-95",
  secondary: "bg-surface text-ink ring-1 ring-hairline hover:bg-surface-2 hover:ring-brand/40",
  ghost: "text-ink-muted hover:bg-surface-2 hover:text-ink",
  danger:
    "bg-gradient-to-b from-[#f0303f] to-danger text-white shadow-[0_1px_2px_rgb(15_23_42/0.14)] hover:brightness-[1.06]",
} as const;

const SIZE = {
  sm: "h-8 gap-1 px-3 text-xs",
  md: "h-10 gap-1.5 px-4 text-sm",
} as const;

export type ButtonVariant = keyof typeof VARIANT;
export type ButtonSize = keyof typeof SIZE;

const BASE =
  "inline-flex shrink-0 items-center justify-center rounded-field font-semibold transition duration-150 disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none";

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...rest
}: { variant?: ButtonVariant; size?: ButtonSize } & ComponentProps<"button">) {
  return (
    <button type={type} className={cn(BASE, VARIANT[variant], SIZE[size], className)} {...rest} />
  );
}

/** Dieselbe Optik für Formular-`<input type="submit">`-freie Links/Anker. */
export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className?: string,
): string {
  return cn(BASE, VARIANT[variant], SIZE[size], className);
}
