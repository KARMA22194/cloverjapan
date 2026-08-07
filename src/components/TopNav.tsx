"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/actions/auth";
import { Logo } from "@/components/Logo";
import { Avatar } from "@/components/Avatar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { JapanClock } from "@/components/JapanClock";
import { ConnectionStatus } from "@/components/ConnectionStatus";
import { FxPill } from "@/components/FxPill";
import { SectionIcon } from "@/components/ui/SectionIcon";
import { clearUserScopedStorage } from "@/lib/userStorage";

interface NavLink {
  href: string;
  label: string;
  match: string;
}

interface NavGroup {
  label: string;
  items: NavLink[];
}

// Eigener Schlüssel für das Profil-Dropdown (teilt sich die openMenu-Logik mit
// den Kategorie-Menüs, kollidiert dank Präfix nicht mit Gruppen-Labels).
const PROFILE_MENU = "__profile__";

/** Ausklapp-Panel (Kategorien + Profil) — eine Definition für beide Menüs. */
const MENU_PANEL =
  "absolute top-full z-50 mt-2 min-w-48 rounded-card bg-surface p-1.5 ring-1 ring-hairline shadow-pop";

/** Eintrag in einem Ausklapp-Panel bzw. im Mobile-Menü. */
function menuItem(active: boolean): string {
  return `block rounded-[0.5rem] px-3 py-1.5 text-sm transition ${
    active
      ? "bg-brand/12 font-semibold text-brand-dark dark:text-brand-tint"
      : "text-ink-muted hover:bg-surface-2 hover:text-ink"
  }`;
}

/** Waagerechte Trennlinie im Menü. */
function MenuDivider() {
  return <div className="my-1.5 h-px bg-hairline" aria-hidden />;
}

/**
 * Abmelden-Formular (Desktop + Mobile geteilt): leert beim Logout den
 * personenbezogenen Offline-Cache (Cross-User-Schutz).
 *
 * Bewusst auf Modul-Ebene: als im Render-Body definierte Funktion wäre der
 * Komponententyp bei jedem Render ein neuer → React verwirft das <form>-DOM
 * und baut es jedes Mal neu auf.
 */
function LogoutForm({ className }: { className: string }) {
  return (
    <form
      action={logoutAction}
      onSubmit={() => {
        try {
          navigator.serviceWorker?.controller?.postMessage({ type: "logout" });
          clearUserScopedStorage();
        } catch {
          /* SW evtl. nicht aktiv – unkritisch */
        }
      }}
    >
      <button type="submit" className={className}>
        Abmelden
      </button>
    </form>
  );
}

export function TopNav({
  groups,
  adminItems = [],
  userName,
  userImage = null,
}: {
  groups: NavGroup[];
  adminItems?: NavLink[];
  userName: string;
  /**
   * Profilbild als Data-URL — kommt aus dem Server-Layout, das die Daten ohnehin
   * schon geladen hat. Früher holte die Leiste sie bei **jeder** Navigation per
   * `GET /api/v1/me` nach (Effekt-Dep `pathname`): zwei DB-Queries und bis zu
   * 300 KB Base64 pro Seitenwechsel, für Werte, die sich praktisch nie ändern.
   * Nach dem Speichern im Profil aktualisiert `router.refresh()` das Layout und
   * damit auch diese Props.
   */
  userImage?: string | null;
}) {
  const pathname = usePathname();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  // Offenes Desktop-Dropdown bei Klick außerhalb der Navigation schließen.
  useEffect(() => {
    if (!openMenu) return;
    function onDown(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpenMenu(null);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [openMenu]);

  // Nach Navigation beide Menüs schließen.
  useEffect(() => {
    setOpenMenu(null);
    setMobileOpen(false);
  }, [pathname]);

  // Tab-Button (Desktop): aktive Kategorie nur dezent (fett), KEIN blauer Block —
  // blau markiert wird ausschließlich der aktuelle Link im Dropdown.
  const buttonClass = (active: boolean) =>
    `inline-flex items-center gap-1 rounded-field px-3 py-1.5 text-sm transition hover:bg-surface-2 ${
      active ? "font-bold text-ink" : "font-semibold text-ink-muted hover:text-ink"
    }`;

  const startActive = pathname === "/start" || pathname === "/";

  return (
    // `sticky` mit hohem z-index: die Leaflet-Karte im Reiseplaner setzt intern
    // Panes bis z-index 800 — bei z-40 würde die Karte über die Leiste scrollen.
    <header
      ref={navRef}
      className="sticky top-0 z-[1100] border-b border-hairline bg-surface/85 backdrop-blur-xl print:hidden"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2.5">
        <div className="flex items-center gap-4">
          <Link href="/start" className="flex items-center gap-2.5" aria-label="Zur Übersicht">
            <Logo height={26} priority />
          </Link>

          {/* Desktop-Navigation: Kategorien als ausklappbare Dropdown-Menüs. */}
          <nav className="hidden items-center gap-1 md:flex">
            {groups.map((group, gi) => {
              const active = group.items.some((l) => pathname.startsWith(l.match));
              const open = openMenu === group.label;
              return (
                <div key={group.label} className="flex items-center gap-1">
                  {gi > 0 && (
                    <span className="mx-1 h-5 w-px self-center bg-hairline" aria-hidden />
                  )}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setOpenMenu(open ? null : group.label)}
                      aria-haspopup="menu"
                      aria-expanded={open}
                      className={buttonClass(active)}
                    >
                      {group.label}
                      <span
                        className={`text-[10px] transition-transform duration-200 ${open ? "rotate-180" : ""}`}
                        aria-hidden
                      >
                        ▾
                      </span>
                    </button>
                    {open && (
                      <div role="menu" className={`left-0 ${MENU_PANEL}`}>
                        {group.items.map((item) => {
                          const itemActive = pathname.startsWith(item.match);
                          return (
                            <Link
                              key={item.href}
                              href={item.href}
                              role="menuitem"
                              className={menuItem(itemActive)}
                            >
                              {item.label}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </nav>
        </div>

        {/* Desktop-Werkzeuge rechts. */}
        <div className="hidden items-center gap-3 md:flex">
          <ConnectionStatus />
          <FxPill />
          <JapanClock compact />
          <ThemeToggle />
          {/* Profil als ausklappbares Menü (Profil + Abmelden). */}
          <div className="relative">
            <button
              type="button"
              onClick={() =>
                setOpenMenu(openMenu === PROFILE_MENU ? null : PROFILE_MENU)
              }
              aria-haspopup="menu"
              aria-expanded={openMenu === PROFILE_MENU}
              className="flex items-center gap-2 rounded-full p-0.5 pr-2 ring-1 ring-transparent transition hover:bg-surface-2 hover:ring-hairline"
              title="Profil"
            >
              <Avatar name={userName} image={userImage} size={28} />
              <span className="hidden text-sm font-semibold text-ink-muted sm:inline">
                {userName}
              </span>
              <span
                className={`text-[10px] transition-transform duration-200 ${openMenu === PROFILE_MENU ? "rotate-180" : ""}`}
                aria-hidden
              >
                ▾
              </span>
            </button>
            {openMenu === PROFILE_MENU && (
              <div role="menu" className={`right-0 ${MENU_PANEL}`}>
                <Link href="/profil" role="menuitem" className={menuItem(false)}>
                  Profil
                </Link>
                {adminItems.length > 0 && (
                  <>
                    <MenuDivider />
                    {adminItems.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        role="menuitem"
                        className={menuItem(pathname.startsWith(item.match))}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </>
                )}
                <MenuDivider />
                <LogoutForm className="block w-full rounded-[0.5rem] px-3 py-1.5 text-left text-sm font-semibold text-danger transition hover:bg-danger/10" />
              </div>
            )}
          </div>
        </div>

        {/* Mobile: nur Theme-Umschalter + Hamburger. */}
        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? "Menü schließen" : "Menü öffnen"}
            aria-expanded={mobileOpen}
            className="inline-flex h-9 w-9 items-center justify-center rounded-field text-lg text-ink-muted ring-1 ring-hairline transition hover:bg-surface-2 hover:text-ink"
          >
            {mobileOpen ? "✕" : "☰"}
          </button>
        </div>
      </div>

      {/* Mobile-Menü: volle Navigation inkl. explizitem „Start". */}
      {mobileOpen && (
        <div className="border-t border-hairline bg-surface/95 md:hidden">
          <nav className="mx-auto max-w-6xl space-y-4 px-4 py-4">
            <Link
              href="/start"
              className={`${menuItem(startActive)} flex items-center gap-2 py-2`}
            >
              <SectionIcon id="start" size={20} /> Start / Übersicht
            </Link>

            {[...groups, ...(adminItems.length > 0 ? [{ label: "Verwaltung", items: adminItems }] : [])].map(
              (group) => (
                <div key={group.label}>
                  <p className="px-1 pb-1.5 text-[11px] font-bold uppercase tracking-[0.09em] text-ink-subtle">
                    {group.label}
                  </p>
                  <div className="grid grid-cols-2 gap-1">
                    {group.items.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`${menuItem(pathname.startsWith(item.match))} py-2`}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </div>
              ),
            )}

            <div className="flex items-center justify-between border-t border-hairline pt-3">
              <Link
                href="/profil"
                className="flex items-center gap-2 rounded-full p-0.5 pr-2 transition hover:bg-surface-2"
                title="Profil"
              >
                <Avatar name={userName} image={userImage} size={28} />
                <span className="text-sm font-semibold text-ink-muted">{userName}</span>
              </Link>
              <LogoutForm className="rounded-field px-3 py-1.5 text-sm font-semibold text-danger ring-1 ring-hairline transition hover:bg-danger/10" />
            </div>

            <div className="flex items-center gap-3">
              <ConnectionStatus />
              <FxPill />
              <JapanClock compact />
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
