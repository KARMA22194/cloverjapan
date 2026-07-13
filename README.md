# Clover Japan

Kollaborativer **Reiseplaner für eine Japan-Reise**: Login/Registrierung, gemeinsame
Reise (Trip) mit eingeladenen Mitgliedern und Tools für Reiseplaner (Karte), Flüge,
Ausgaben (Yen→Euro), Zollrechner, Tagesplaner, Checkliste, Wetter und eine druckbare
Reiseübersicht. Rollen: `EMPLOYEE`, `MANAGER`, `ADMIN` (Admin = Nutzerverwaltung).

## Tech-Stack

- **Next.js 15** (App Router — REST-API via Route Handlers) + **TypeScript**
- **Prisma** + **PostgreSQL**
- **Auth.js (NextAuth v5)**, Credentials + bcrypt (JWT-Sessions), **Passkeys/WebAuthn**
- **E-Mail** via SMTP (Einladungen, Verifikation, Passwort-Reset)
- **Tailwind CSS v4**, **Zod**, **date-fns**
- **OpenAPI 3.1 + Swagger UI** (`@asteasolutions/zod-to-openapi`, `swagger-ui-dist`)
- **Karten:** Leaflet + OSM/CARTO, Nominatim, OSRM (keyfrei); **Wetter:** Open-Meteo;
  **Flüge:** AeroDataBox (optional); **Kurs:** open.er-api.com
- Läuft vollständig in **Docker** (kein Node auf dem Host nötig)

## Start (Docker)

```bash
docker compose up -d db                                 # 1. Datenbank
docker compose run --rm app npm install                 # 2. Deps (Container-Volume)
docker compose run --rm app npx prisma migrate dev       # 3. Schema + Client
docker compose run --rm app npx prisma db seed          # 4. Demo-Nutzer
docker compose up -d app                                # 5. App
```

App: http://localhost:3000 · **API-Docs:** http://localhost:3000/api-docs

> Nach `npm run build` den Dev-Server neu starten (`docker compose restart app`) —
> der Prod-Build überschreibt sonst den `.next`-Ordner des laufenden Dev-Servers.

## Demo-Zugänge (Passwort: `password123`)

| Rolle    | E-Mail                |
|----------|-----------------------|
| Admin    | admin@clover.japan    |
| Manager  | manager@clover.japan  |
| Employee | employee@clover.japan |

## Architektur

- **REST-API (`/api/v1/*`)** als kanonische Schnittstelle: alle Mutationen über die
  API (`lib/api/client.ts` → fetch → `router.refresh()`).
- **Reads** bleiben SSR (Server Components → `lib/services/*` → Prisma) — dieselbe
  Service-Schicht wie die API (eine Quelle für Datenlogik).
- **Geteilte Reise:** alle Japan-Tools gehören einem `Trip`; Nutzer sind über
  `TripMember` (genau eine aktive Reise) Mitglied.
- **Auth:** NextAuth-Flow (`/api/auth/*`) + offene Selbst-Registrierung mit
  E-Mail-Verifikation, Passwort-Reset, Einladungen (mit Zustimmung). Route-/Rollen-
  Schutz doppelt (Middleware + je Page/Handler, `requireUser`/`requireAdmin`).
- **Sicherheit:** Rate-Limiting (Postgres), Security-Header/CSP, SSRF-Schutz,
  Einmal-Token. Details: `CLAUDE.md`.

## Nützliche Befehle

```bash
docker compose logs -f app                    # Logs
docker compose run --rm app npm run build     # Produktions-Build prüfen (danach restart)
docker compose down                           # Stoppen (Daten bleiben)
docker compose down -v                        # Stoppen + Daten löschen
```
