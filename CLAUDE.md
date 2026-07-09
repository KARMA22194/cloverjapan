# CLAUDE.md — Time Tracker

Projektanweisungen für Claude Code im Unterprojekt `Timetracker`.
Ergänzt die übergeordnete `../CLAUDE.md` (Sprache: **immer Deutsch**; MCP: Context7).

## Projekt

Zeiterfassung für Mitarbeiter: Login, Buchung von Stunden auf Projekte,
Auswertung als **Tages-, Monats- und Jahresansicht**. Rollen: `EMPLOYEE`,
`MANAGER`, `ADMIN`.

## Tech-Stack

- **Next.js 15** (App Router; REST-API via Route Handlers, Reads via Server Components)
  + **TypeScript** (strict)
- **Prisma** + **PostgreSQL 16**
- **Auth.js (NextAuth v5)** — Credentials-Provider + **bcryptjs**, JWT-Sessions (self-hosted);
  zusätzlich **Passkeys/WebAuthn** (`@simplewebauthn`, Provider-id `passkey`,
  `Credential`-Tabelle; Challenge im httpOnly-Cookie; Config in `src/lib/webauthn.ts`,
  ENV `WEBAUTHN_RP_ID/ORIGIN/RP_NAME` — Prod braucht HTTPS)
- **Tailwind CSS v4**, **Zod**, **date-fns / date-fns-tz**
- **OpenAPI/Swagger:** `@asteasolutions/zod-to-openapi` (Spec aus Zod) +
  `swagger-ui-dist` (self-hosted UI unter `/api-docs`)
- **Karten (Reiseplaner):** `leaflet` + OSM/Wikimedia-Tiles; Geocoding
  **Nominatim**, Routing **OSRM** (server-seitig, keyfrei)
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

**REST-API als kanonische Schnittstelle.** Das Frontend spricht für **Mutationen
ausschließlich** über die REST-API (`/api/v1/*`), nie mehr über Server Actions für
Daten. Reads bleiben aus Performance-Gründen **SSR** — aber über *dieselbe*
Service-Schicht, die auch die API nutzt. Es gibt also genau **einen** kanonischen
Ort für Datenlogik: `src/lib/services/*` (→ Prisma).

- **API-Kern** (`src/lib/api/`):
  - `http.ts` — `ApiError` + `handle()`-Wrapper (fängt ApiError/Zod/Prisma-Fehler,
    einheitliche Fehlerhülle `{ error: { message, details? } }`; mappt P2002→409,
    P2025→404). Route-Handler behalten native Next-Signatur (kein Signatur-Wrapper).
  - `session.ts` — `requireUser()`/`requireAdmin()` (NextAuth-Session-Cookie → 401/403).
  - `schemas.ts` — **Zod = Single Source of Truth** für Request-Validierung UND
    OpenAPI (via `@asteasolutions/zod-to-openapi`, `extendZodWithOpenApi`).
  - `dto.ts` — Prisma-Objekte → schlanke Response-DTOs (nie rohes Prisma zurückgeben,
    z. B. **kein** `passwordHash`!).
  - `openapi.ts` — baut das OpenAPI-3.1-Dokument (Pfade + Komponenten aus schemas.ts).
  - `client.ts` — **Browser**-Fetch-Helper (`api.get/post/patch/delete`); von den
    Client-Components exklusiv genutzt. Nach Writes: **`router.refresh()`** rendert
    die SSR-Seite mit frischen Daten neu (ersetzt `revalidatePath`).
- **Route-Handler:** `src/app/api/v1/**/route.ts` — dünn: `requireUser/Admin` →
  Zod-`parse` → Service → DTO → `ok()`. **Ownership** weiterhin via
  `updateMany`/`deleteMany` mit `where: { id, userId }` (Fremdzugriff auf DB-Ebene
  verhindert). Endpunkte: `me`, `time-entries` (+`[id]`), `projects` (+`[id]`),
  `users` (+`[id]`), `reports/month`, `reports/year`, `notes` (+`[id]`), `openapi`.
- **API-Docs:** OpenAPI-JSON unter `/api/v1/openapi`, interaktive **Swagger UI**
  unter **`/api-docs`** (self-hosted `swagger-ui-dist`, dynamischer Client-Import →
  kein SSR-`window`-Problem; `withCredentials` sendet das Session-Cookie bei
  „Try it out“). Middleware schützt `/api*` **nicht** — Auth passiert in jedem
  Handler (Docs & Spec sind bewusst öffentlich).
- **Login/Logout bleiben NextAuth-Server-Actions** (`src/app/actions/auth.ts`):
  Authentifizierung ist ein Framework-Belang (Cookie-Handling), **kein** Teil der
  REST-Ressourcen-API. `/api/auth/*` ist der NextAuth-Flow.
- **Auth Split-Config** (Edge-Kompatibilität):
  - `src/auth.config.ts` — **edge-safe** (keine Prisma-/bcrypt-Importe!), enthält
    `authorized`/`jwt`/`session`-Callbacks. Von der Middleware genutzt.
  - `src/auth.ts` — volle Instanz mit Credentials-Provider (Prisma + bcrypt),
    nur Node-Runtime.
  - `src/middleware.ts` — eigene NextAuth-Instanz aus `authConfig` für den Route-Schutz.
- **Rollen-Gating doppelt:** Middleware (Seiten-Routen) **und** in jeder Page bzw.
  jedem API-Handler (`session.user.role` / `requireAdmin`), nie nur im UI.
- Rolle/ID sind im JWT und in der Session (Typ-Augmentation in
  `src/types/next-auth.d.ts`). Im `session`-Callback nötiger Cast, da der Callback
  den nicht-augmentierten `@auth/core/jwt`-Typ nutzt.

### Datenmodell (`prisma/schema.prisma`)

`User` · `Project` · `Assignment` · `TimeEntry` · `Note` · `Trip` · `TripMember`
· `TripStop` · `Expense` · `PlannerTask` · `ChecklistItem`. Kern-Entscheidungen:
- `TimeEntry.minutes` als **Int** (nicht Float-Stunden) → keine Rundungsfehler.
  UI zeigt Stunden, speichert Minuten (`src/lib/time.ts`: `hoursToMinutes`/`minutesToHours`).
- `TimeEntry.date` als **`@db.Date`** (ohne Uhrzeit) → tagesbasiert,
  zeitzonenfeste Aggregation. Datumsarithmetik in **UTC**.
- Index `@@index([userId, date])` trägt Daily/Monthly/Yearly-Queries.
- `Assignment` = welche Projekte ein User buchen darf. Leer = alle aktiven Projekte
  (`getBookableProjects`).
- Aggregation: Monat via Prisma `groupBy`, Jahr via `$queryRaw` (`EXTRACT(MONTH …)`).
  Siehe `src/lib/services/reports.ts`.
- `Note` = Freitext-Notizen im Google-Keep-Stil, tagesbezogen (`@db.Date`). Enum
  `NoteCategory` (ARBEIT/SCHULE/URLAUB/WOCHENENDE) — Kategorie **färbt die Karte**
  (Farb-/Label-Mapping zentral in `src/lib/notes.ts`, von UI + API genutzt).
  Ownership wie TimeEntry (`updateMany`/`deleteMany where { id, userId }`).

### Views / Routen

- `/login` — Credentials-Login (Client, `useActionState`)
- `/day/[date]` — Tagesansicht: Zeiten erfassen/bearbeiten/löschen, Tagessumme
  **+ Notizen** (Keep-Karten mit Kategorien, `src/components/DayNotes.tsx`)
- `/calendar/[year]/[month]` — Monatskalender (Raster Mo–So), Tagessumme als
  Heatmap, Klick → Tagesansicht (SSR via `getMonthReport.perDay`)
- `/month/[year]/[month]` — Matrix Tag × Projekt mit Summen
- `/year/[year]` — Matrix Monat × Projekt mit Summen
- `/admin` — Projekte- + Nutzer-Verwaltung (**nur ADMIN**)
- `/reiseplaner` — **Japan-Reiseplaner** mit Karte (eigener Nav-Bereich)
- `/ausgaben` — **Ausgabenrechner** Yen→Euro mit Kategorien (Reiseplaner-Bereich)
- `/tagesplaner` · `/checkliste` · `/mitglieder` — **Japan**-Bereich (Tagesaufgaben,
  Checkliste, Mitglieder/Einladen)
- `/api-docs` — interaktive **Swagger UI** (Spec: `/api/v1/openapi`)
- `/profil` — **Profilbild** setzen (Upload → client-seitig auf 128×128 verkleinert,
  als Data-URL in `User.image`; `PATCH /api/v1/me`). Fallback: Initialen-Avatar
  (`src/components/Avatar.tsx`). Avatare in TopNav, Mitgliederliste.
- `/start` — **kategorisierte Übersicht** (Kacheln je Bereich); Logo verlinkt hierhin
- `/` → Redirect auf `/start`

Die Nav ist in zwei Bereiche getrennt (`TopNav`: `links` = **Zeiterfassung**,
`secondaryLinks` = **Reiseplaner**).

### Reiseplaner (`/reiseplaner`)

Notiz-artige Oberfläche: Ort eingeben → Marker auf **Leaflet/OSM-Karte**, beste
Route zwischen allen Orten. Externe Dienste laufen **server-seitig** über die API
(Container hat Proxy-CA + kann sauberen User-Agent setzen), nur die Karten-Tiles
lädt der Browser:
- `GET /api/v1/geo/search?q=` — Geocoding via **Nominatim** (auf Japan begrenzt,
  romanisierte Labels via `accept-language`).
- `GET /api/v1/geo/route?points=` — beste Route via **OSRM-Trip** (optimiert die
  Besuchsreihenfolge).
- Karte: `TripPlanner.tsx` (Client, dynamischer Leaflet-Import → kein SSR-`window`).
  Tiles **Wikimedia „osm-intl"** (internationale/lateinische Beschriftung).
- Stopps in der **DB** pro Reise (`TripStop`, PUT-Replace-Endpoint `/api/v1/trip-stops`).
- **Zugverbindungen**: `GET /api/v1/geo/transit?from=&to=&mode=direct|any`.
  Mit `GOOGLE_MAPS_API_KEY` (.env) → echte Verbindung via **Google Directions**
  (Transit); ohne Key (oder wenn Google scheitert) → **distanzbasierte Schätzung**
  (`estimated=true`, Shinkansen-Modell). UI zeigt je Etappe Dauer/Umstiege/Linien/
  Preis; Preis für JP über Google oft nicht verfügbar.
- **Karten-Labels:** Tiles romanisiert (Wikimedia); zusätzlich tragen die Marker
  ein **dauerhaftes Tooltip** mit dem deutsch bevorzugten Ortsnamen (Nominatim
  `accept-language=de`). Vollständig deutsche Tile-Beschriftung gibt es für Japan
  nicht (fehlende `name:de`-Daten).
- **Ort aus Link/Text** (`GET /api/v1/geo/resolve?q=`): Google-/Apple-Maps-Links
  (auch Kurzlinks, folgt Redirect) → exakte Koordinaten (`@lat,lng` / `!3d!4d` /
  `q=`/`ll=`); sonst Text/Caption → Nominatim (Japan). Instagram liefert **keinen**
  Standort (kein öffentliches API, JS-Hülle) → klare 422-Meldung.

**Ausgabenrechner** (`/ausgaben`, `ExpenseCalculator.tsx`): Yen→Euro live via
`GET /api/v1/fx/rate` (open.er-api.com, keyfrei, server-seitig; Fallback-Rate).
Kategorien mit Summen + Auswertung (Budget-Bar + Donut). Ausgaben liegen in der
**DB** pro Reise (`/api/v1/expenses`); nur das Budget bleibt lokal.

**Geteilte Reise (Kollaboration, Japan-only):** Alle Japan-Tools (Stopps, Ausgaben,
Tagesplaner, Checkliste) gehören einem **`Trip`**; Nutzer sind über **`TripMember`**
(userId @unique → genau eine Reise) Mitglied. `getActiveTripId(userId)` legt beim
ersten Zugriff eine Solo-Reise an. Routen lösen die Reise serverseitig auf →
Komponenten bleiben tenant-agnostisch. Einladen per E-Mail unter `/mitglieder`
(`/api/v1/trip/members`); Eingeladene **wechseln** in die Reise (ihre alte bleibt
bestehen). Endpunkte trip-basiert: `trip-stops` (PUT), `expenses`, `planner-tasks`,
`checklist`, `trip/members` — nicht in OpenAPI registriert (wie geo/fx/weather).
Jeder Eintrag trägt `createdByName` (Anzeige „von X"); bei PUT-Replace
(Stopps/Checkliste) bleibt der ursprüngliche Ersteller je id erhalten.

Feste App-Zeitzone (MVP): `Europe/Berlin` (`APP_TIMEZONE`).

### Branding (etikett.de)

UI übernimmt das Corporate Design von **https://etikett.de/** — alle Assets
**self-hosted** (kein Google-Fonts-/CDN-Runtime-Fetch, passt zum Docker/Proxy-Setup):
- **Fonts:** Viga (Headings) + PT Sans (Body) als `@font-face` in `globals.css`,
  Dateien in `public/fonts/`.
- **Farben:** als Tailwind-v4-`@theme`-Tokens in `globals.css` → Utilities
  `brand` (`#009BC9`), `brand-dark` (`#0A314C`), `brand-tint` (`#B9E7F7`),
  `accent` (`#F87805`), `danger` (`#E2001A`). Primär-Akzent statt Tailwind-`blue-*`.
- **Logo:** Kleeblatt-Silhouette `public/brand/clover.png` — via CSS-Maske in
  `src/components/Logo.tsx` themenabhängig eingefärbt (dunkel/hell). (Altes
  `logo-etikett.png` bleibt ungenutzt liegen.)
- **Favicon:** `src/app/icon.png` = Kleeblatt auf Schwarz (`public/brand/clover-icon.png`).
- **Dark-Mode:** klassenbasiert via Tailwind-v4 `@custom-variant dark (&:where(.dark,
  .dark *))` in `globals.css`. Umschalter `src/components/ThemeToggle.tsx` (Persistenz
  in `localStorage`, in TopNav + Login). Ein **Inline-Script** im Root-Layout setzt
  `.dark` am `<html>` **vor** dem ersten Paint (kein FOUC); `<html suppressHydrationWarning>`.
  Neue farbige UI daher immer mit `dark:`-Variante gestalten.

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
