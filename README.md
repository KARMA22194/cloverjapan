# Time Tracker

Zeiterfassung für Mitarbeiter: Login, Buchung von Stunden auf Projekte,
Auswertung als **Tages-, Monats- und Jahresansicht**. Rollen: `EMPLOYEE`,
`MANAGER`, `ADMIN`.

## Tech-Stack

- **Next.js 15** (App Router — REST-API via Route Handlers) + **TypeScript**
- **Prisma** + **PostgreSQL**
- **Auth.js (NextAuth v5)**, Credentials-Provider + bcrypt (self-hosted, JWT-Sessions)
- **Tailwind CSS v4**, **Zod**, **date-fns**
- **OpenAPI 3.1 + Swagger UI** (`@asteasolutions/zod-to-openapi`, `swagger-ui-dist`)
- UI im **etikett.de-Branding** (self-hosted Fonts/Logo/Farben)
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

App: http://localhost:3000 · **API-Docs (Swagger UI):** http://localhost:3000/api-docs

## Demo-Zugänge (Passwort: `password123`)

| Rolle    | E-Mail                 |
|----------|------------------------|
| Admin    | admin@clover.japan       |
| Manager  | manager@clover.japan     |
| Employee | employee@clover.japan    |

## Architektur

- **REST-API (`/api/v1/*`)** als kanonische Schnittstelle: das Frontend führt
  **alle Mutationen** über die API aus (`lib/api/client.ts` → fetch → `router.refresh()`).
- **Reads** bleiben SSR (Server Components → `lib/services/*` → Prisma) — dieselbe
  Service-Schicht, die auch die API nutzt (eine Quelle für Datenlogik).
- **API-Docs:** OpenAPI 3.1 unter `/api/v1/openapi` (aus Zod-Schemas generiert),
  interaktive **Swagger UI** unter `/api-docs`.
- Login/Logout laufen weiter über den **NextAuth-Flow** (`/api/auth/*`).
- Route-/Rollen-Schutz doppelt: Middleware (`middleware.ts`, edge-safe Split-Config
  in `auth.config.ts`) **und** in jeder Page bzw. jedem API-Handler
  (`requireUser`/`requireAdmin`).
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
