import Link from "next/link";
import type { ComponentProps, ElementType, ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * Oberflächen-Primitive.
 *
 * Vorher entstand jede Karte als eigener Klassen-String
 * (`rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 …`) —
 * über 50-mal in der App. Damit war „das Design ändern" eine Suchen-und-Ersetzen-Übung
 * und die Varianten liefen auseinander (rounded-md/lg/xl, mit/ohne Schatten).
 * Hier liegt die Oberfläche **einmal**; Flächen- und Textfarben kommen aus den
 * semantischen Tokens (`surface`/`hairline`/`ink`), deshalb ohne `dark:`-Zwillinge.
 */

const PAD = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-5 sm:p-6",
} as const;

export type CardPad = keyof typeof PAD;

/** Ring statt `border`: liegt auf der Kante, verschiebt also kein Layout beim Hover-Wechsel. */
const SURFACE = "rounded-card bg-surface ring-1 ring-hairline shadow-card";

/** Anhebung für klickbare Karten — die Bewegung ist per `motion-reduce` abschaltbar. */
const LIFT =
  "transition duration-200 hover:-translate-y-0.5 hover:shadow-card-hover hover:ring-brand/40 motion-reduce:hover:translate-y-0";

export function Card<T extends ElementType = "div">({
  as,
  pad = "md",
  className,
  children,
  ...rest
}: { as?: T; pad?: CardPad; className?: string; children?: ReactNode } & Omit<
  ComponentProps<T>,
  "as" | "className" | "children"
>) {
  const Tag = (as ?? "div") as ElementType;
  return (
    <Tag className={cn(SURFACE, PAD[pad], className)} {...rest}>
      {children}
    </Tag>
  );
}

/** Karte als Navigationsziel (ganze Fläche klickbar, mit Anhebung). */
export function CardLink({
  pad = "md",
  className,
  children,
  ...rest
}: { pad?: CardPad } & ComponentProps<typeof Link>) {
  return (
    <Link className={cn(SURFACE, LIFT, "block", PAD[pad], className)} {...rest}>
      {children}
    </Link>
  );
}

/**
 * Kleines Großbuchstaben-Label über einem Wert („COUNTDOWN", „AUSGABEN").
 * War zuvor in jeder Kachel als eigener Klassen-String wiederholt.
 */
export function CardLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "text-[11px] font-bold uppercase tracking-[0.09em] text-ink-subtle",
        className,
      )}
    >
      {children}
    </p>
  );
}
