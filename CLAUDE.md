# CLAUDE.md — Time Tracker

Projektanweisungen für Claude Code im Unterprojekt `Timetracker`.
Ergänzt die übergeordnete `../CLAUDE.md` (Sprache: **immer Deutsch**; MCP: Context7).

## Projekt

Zeiterfassung für Mitarbeiter: Login, Buchung von Stunden auf Projekte,
Auswertung als **Tages-, Monats- und Jahresansicht**. Rollen: `EMPLOYEE`,
`MANAGER`, `ADMIN`.

## Tech-Stack

- **Next.js 15** (App Router, Server Actions) + **TypeScript** (strict)
- **Prisma** + **PostgreSQL 16**
- **Auth.js (NextAuth v5)** — Credentials-Provider + **bcryptjs**, JWT-Sessions (self-hosted)
- **Tailwind CSS v4**, **Zod**, **date-fns / date-fns-tz**
- Läuft **vollständig in Docker** (kein Node auf dem Host)

Wichtige Versionen: `next` ^15.5.x (nicht auf 15.1.6 zurück — **CVE-2025-66478**),
`tailwindcss` + `@tailwindcss/postcss` müssen **dieselbe** 4.x-Version haben
(sonst Build-Fehler „Missing field `negated` on ScannerOptions.sources").

## Umgebung — wichtige Besonderheiten

- **Docker-only:** Auf dem Host ist **kein Node/npm** installiert. Alle
  npm-/prisma-/next-Befehle laufen im `app`-Container.
- `node_modules` liegt in einem **Container-Volume** (nicht im Bind-Mount) →
  linux-Binaries für `next-swc` und `prisma`-Engine. Quellcode per Bind-Mount.
- **Corporate-Proxy „Cato Networks" mit TLS-Interception:** ausgehendes TLS wird
  MITMt (self-signed cert in chain). Node-`https`-Downloads (z. B. Prisma-Engines
  von `binaries.prisma.sh`) scheitern sonst. **Lösung (sauber, keine
  Prüfungs-Deaktivierung):** Proxy-Root-CA liegt in `certs/proxy-ca.pem` und wird
  via `NODE_EXTRA_CA_CERTS=/app/certs/proxy-ca.pem` (in `docker-compose.yml`)
  getrusted. `Dockerfile.dev` installiert zusätzlich `openssl` (von Prisma benötigt).

## Setup & Befehle (alles über Docker)

```bash
docker compose up -d db                                   # Postgres starten
docker compose run --rm app npm install                   # Deps (in Volume)
docker compose run --rm app npx prisma migrate dev --name init   # Schema + Client
docker compose run --rm app npx prisma db seed            # Demo-Daten
docker compose up -d app                                  # App → http://localhost:3000

docker compose logs -f app                                # Logs
docker compose run --rm app npm run build                 # Prod-Build / Typecheck
docker compose down                                       # Stoppen (Daten bleiben)
docker compose down -v                                    # Stoppen + Daten löschen
```

Neue npm-Pakete: **im Container** installieren
(`docker compose run --rm app npm install <pkg>`), nicht auf dem Host.

## Architektur

- **Reads:** direkt in Server Components → `src/lib/services/*` → Prisma
  (kein separater REST-Layer).
- **Writes:** über **Server Actions** (`src/app/actions/*`) mit **Zod**-Validierung
  und Rollen-/Ownership-Checks. Ownership via `updateMany`/`deleteMany` mit
  `where: { id, userId }` (verhindert Fremdzugriff auf DB-Ebene).
- **Auth Split-Config** (Edge-Kompatibilität):
  - `src/auth.config.ts` — **edge-safe** (keine Prisma-/bcrypt-Importe!), enthält
    `authorized`/`jwt`/`session`-Callbacks. Von der Middleware genutzt.
  - `src/auth.ts` — volle Instanz mit Credentials-Provider (Prisma + bcrypt),
    nur Node-Runtime.
  - `src/middleware.ts` — eigene NextAuth-Instanz aus `authConfig` für den Route-Schutz.
- **Rollen-Gating doppelt:** Middleware (Route-Ebene) **und** in jeder Page/Action
  (`session.user.role`), nie nur im UI.
- Rolle/ID sind im JWT und in der Session (Typ-Augmentation in
  `src/types/next-auth.d.ts`). Im `session`-Callback nötiger Cast, da der Callback
  den nicht-augmentierten `@auth/core/jwt`-Typ nutzt.

### Datenmodell (`prisma/schema.prisma`)

`User` · `Project` · `Assignment` · `TimeEntry`. Kern-Entscheidungen:
- `TimeEntry.minutes` als **Int** (nicht Float-Stunden) → keine Rundungsfehler.
  UI zeigt Stunden, speichert Minuten (`src/lib/time.ts`: `hoursToMinutes`/`minutesToHours`).
- `TimeEntry.date` als **`@db.Date`** (ohne Uhrzeit) → tagesbasiert,
  zeitzonenfeste Aggregation. Datumsarithmetik in **UTC**.
- Index `@@index([userId, date])` trägt Daily/Monthly/Yearly-Queries.
- `Assignment` = welche Projekte ein User buchen darf. Leer = alle aktiven Projekte
  (`getBookableProjects`).
- Aggregation: Monat via Prisma `groupBy`, Jahr via `$queryRaw` (`EXTRACT(MONTH …)`).
  Siehe `src/lib/services/reports.ts`.

### Views / Routen

- `/login` — Credentials-Login (Client, `useActionState`)
- `/day/[date]` — Tagesansicht, Erfassen/Bearbeiten/Löschen, Tagessumme
- `/month/[year]/[month]` — Matrix Tag × Projekt mit Summen
- `/year/[year]` — Matrix Monat × Projekt mit Summen
- `/admin` — Projekte- + Nutzer-Verwaltung (**nur ADMIN**)
- `/` → Redirect auf heutige Tagesansicht

Feste App-Zeitzone (MVP): `Europe/Berlin` (`APP_TIMEZONE`).

## Demo-Daten & Zugänge

Seed (`prisma/seed.ts`) ist **deterministisch** (mulberry32-PRNG) → reproduzierbar.
Erzeugt 5 buchende Mitarbeiter + Admin, 5 Projekte (WEB, TOOLS, SUPPORT, MOBILE,
DESIGN), Werktags-Buchungen vom Jahresanfang bis **heute** (keine Zukunftszeiten).

Alle Passwörter: `password123`

| Rolle    | E-Mail               |
|----------|----------------------|
| Admin    | admin@etikett.de     |
| Manager  | manager@etikett.de   |
| Employee | employee@etikett.de  |
| Employee | anna@etikett.de      |
| Employee | ben@etikett.de       |
| Employee | clara@etikett.de     |

## Arbeitsweise (projektspezifisch)

- **Best Practices, keine Workarounds** (siehe globale Anweisung). Ursachen beheben
  — z. B. Proxy-CA vertrauen statt TLS-Prüfung abschalten.
- Nach nicht-trivialen Änderungen: `npm run build` im Container grün halten und den
  betroffenen Flow real durchspielen (Login → View → Erfassen).

## Offen / Phase 2

CSV/Excel-Export · Charts-Dashboard (Recharts) · projektübergreifende
Manager-Auswertung · Genehmigungs-Workflow (`status: pending/approved`).
