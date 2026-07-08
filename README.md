# Time Tracker

Zeiterfassung für Mitarbeiter: Login, Buchung von Stunden auf Projekte,
Auswertung als **Tages-, Monats- und Jahresansicht**. Rollen: `EMPLOYEE`,
`MANAGER`, `ADMIN`.

## Tech-Stack

- **Next.js 15** (App Router, Server Actions) + **TypeScript**
- **Prisma** + **PostgreSQL**
- **Auth.js (NextAuth v5)**, Credentials-Provider + bcrypt (self-hosted, JWT-Sessions)
- **Tailwind CSS v4**, **Zod**, **date-fns**
- Läuft vollständig in **Docker** (kein Node auf dem Host nötig)

## Start (Docker)

```bash
# 1. Datenbank starten
docker compose up -d db

# 2. Abhängigkeiten installieren (einmalig, in Container-Volume)
docker compose run --rm app npm install

# 3. Schema migrieren + Prisma-Client generieren
docker compose run --rm app npx prisma migrate dev --name init

# 4. Demo-Daten einspielen
docker compose run --rm app npx prisma db seed

# 5. App starten
docker compose up -d app
```

App: http://localhost:3000

## Demo-Zugänge (Passwort: `password123`)

| Rolle    | E-Mail                 |
|----------|------------------------|
| Admin    | admin@etikett.de       |
| Manager  | manager@etikett.de     |
| Employee | employee@etikett.de    |

## Architektur

- **Reads** direkt in Server Components → `lib/services/*` → Prisma
- **Writes** über Server Actions (`app/actions/*`) mit Zod-Validierung und
  Rollen-/Ownership-Checks
- Route-Schutz doppelt: Middleware (`middleware.ts`, edge-safe Split-Config in
  `auth.config.ts`) **und** in jeder Action/Page
- Zeiteinträge tagesbasiert (`@db.Date`), Dauer in **Minuten** (Int) →
  keine Rundungsfehler; Aggregation via Prisma `groupBy` (Monat) bzw.
  SQL `EXTRACT(MONTH …)` (Jahr)

## Nützliche Befehle

```bash
docker compose logs -f app          # Logs
docker compose run --rm app npm run build   # Produktions-Build prüfen
docker compose down                 # Stoppen (Daten bleiben im Volume)
docker compose down -v              # Stoppen + Daten löschen
```
