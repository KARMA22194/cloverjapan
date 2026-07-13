# CLAUDE.md — Clover Japan

Projektanweisungen für Claude Code (Ordner `Timetracker`, App heißt **Clover Japan**).
Ergänzt die übergeordnete `../CLAUDE.md` (Sprache: **immer Deutsch**; MCP: Context7).

## Projekt

**Kollaborativer Reiseplaner für eine Japan-Reise.** Nutzer melden sich an (oder
registrieren sich selbst / per Einladung), gehören einer geteilten **Reise (`Trip`)**
an und planen gemeinsam:

- **Reiseplaner** — Orte auf einer Karte, beste Route, Zugverbindungen (Deep-Link zu Google Maps)
- **Flüge** — per Flugnummer abrufen oder manuell; Preis fließt in die Ausgaben
- **Ausgaben** — Yen→Euro, Kategorien, Budget
- **Zollrechner** — Einfuhrabgaben für Waren aus Japan (dt. Reisezoll)
- **Tagesplaner** — Aufgaben je Tag (Ort per Knopfdruck in den Reiseplaner übernehmbar)
- **Checkliste** · **Mitglieder** (einladen, gemeinsam bearbeiten)

Rollen: `EMPLOYEE` / `MANAGER` / `ADMIN`. `ADMIN` hat zusätzlich eine **Nutzerverwaltung**
(`/admin`). (Die ursprüngliche Zeiterfassung wurde vollständig entfernt.)

## Tech-Stack

- **Next.js 15** (App Router; REST-API via Route Handlers, Reads via Server Components)
  + **TypeScript** (strict)
- **Prisma** + **PostgreSQL 16**
- **Auth.js (NextAuth v5)** — Credentials-Provider + **bcryptjs**, JWT-Sessions (self-hosted);
  zusätzlich **Passkeys/WebAuthn** (`@simplewebauthn`, Provider-id `passkey`,
  `Credential`-Tabelle; Challenge im httpOnly-Cookie; Config in `src/lib/webauthn.ts`,
  ENV `WEBAUTHN_RP_ID/ORIGIN/RP_NAME` — Prod braucht HTTPS)
- **E-Mail:** `nodemailer` über SMTP (Einladungen, E-Mail-Verifikation, Passwort-Reset;
  `src/lib/mailer.ts`, ENV `SMTP_*`). Ohne `SMTP_HOST` kein Versand (Flows haben Fallbacks).
- **Tailwind CSS v4**, **Zod**, **date-fns / date-fns-tz**
- **OpenAPI/Swagger:** `@asteasolutions/zod-to-openapi` (Spec aus Zod) +
  `swagger-ui-dist` (self-hosted UI unter `/api-docs`)
- **Karten (Reiseplaner):** `leaflet` + OSM/CARTO-Tiles; Geocoding **Nominatim**,
  Routing **OSRM** (server-seitig, keyfrei)
- **Flüge:** **AeroDataBox** über RapidAPI (optional, `AERODATABOX_API_KEY`)
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
  MITMt (self-signed cert in chain). Node-`https`-Downloads (z. B. Prisma-Engines)
  scheitern sonst. **Lösung (sauber, keine Prüfungs-Deaktivierung):** Proxy-Root-CA
  in `certs/proxy-ca.pem`, via `NODE_EXTRA_CA_CERTS=/app/certs/proxy-ca.pem`
  (in `docker-compose.yml`) getrusted. `Dockerfile.dev` installiert `openssl`.

### ⚠️ Dev-Server-Fallen (kosten sonst lange Fehlersuche)

1. **Nach `npm run build` immer `docker compose restart app`.** Der Prod-Build
   überschreibt den **geteilten `.next`-Ordner** des laufenden `next dev` → danach
   404 auf `/_next/static/chunks/*.js` (als `text/plain`), **keine Hydration**
   (Buttons/Menüs tot). Neustart regeneriert den Dev-Build.
2. **CSP erlaubt `eval` nur in der Entwicklung.** `next dev` braucht `'unsafe-eval'`
   (React Fast Refresh/HMR) + `ws:`. In `next.config.ts` env-abhängig gelöst; Prod
   bleibt streng. Fehlt es im Dev → EvalError, kein Client-JS.
3. **Nach `prisma migrate`/`generate` den Dev-Server neu starten** (sonst alter
   Prisma-Client im Speicher → neue Modelle `undefined`).
4. **Diagnose** am schnellsten per **headless Playwright** im Container
   (`page.on('console'/'pageerror')`): zeigt CSP-EvalError bzw. 404/`text/plain`-Chunks.

## Setup & Befehle (alles über Docker)

```bash
docker compose up -d db                                   # Postgres starten
docker compose run --rm app npm install                   # Deps (in Volume)
docker compose run --rm app npx prisma migrate dev --name init   # Schema + Client
docker compose run --rm app npx prisma db seed            # Demo-Nutzer
docker compose up -d app                                  # App → http://localhost:3000

docker compose logs -f app                                # Logs
docker compose run --rm app npm run build                 # Prod-Build / Typecheck (→ danach restart!)
docker compose down                                       # Stoppen (Daten bleiben)
docker compose down -v                                    # Stoppen + Daten löschen
```

Neue npm-Pakete **im Container** installieren (`docker compose run --rm app npm install <pkg>`).

**Migrationen:** `prisma migrate dev` bricht **non-interaktiv** ab, sobald eine
Warnung/ein Datenverlust ansteht (z. B. Unique-Constraint, DROP). Dann die
`migration.sql` **manuell** unter `prisma/migrations/<ts>_<name>/` schreiben und mit
`prisma migrate deploy` anwenden (danach `prisma generate` + `restart app`).

## Mobile (PWA) & E2E-Tests

- **PWA:** installierbar via `public/manifest.webmanifest` + Service-Worker
  `public/sw.js`. **Wichtig:** der SW wird **nur in Produktion** registriert
  (`src/components/PwaRegister.tsx`); in der Entwicklung wird ein alter SW samt Cache
  aktiv entfernt (sonst veraltetes Bundle). SW cacht nur statische Assets, nie
  Navigations-/API-Responses. `start_url=/start`, `display=standalone`.
- **Playwright** (im Container): einmalig
  `docker compose exec app npx playwright install --with-deps chromium`, dann
  `docker compose exec app npx playwright test` bzw. eigene `node e2e/<script>.mjs`.
  Config `playwright.config.ts` (`--no-sandbox`, da root).
- **Native Store-App (Capacitor):** WebView auf die gehostete App
  (`capacitor.config.ts`, `server.url`). **Fingerabdruck-Lock**
  `src/components/BiometricLock.tsx` (nur nativ, sonst No-Op), im `(app)`-Layout.
  Native Builds laufen **auf dem Host** — siehe `CAPACITOR.md`. `ios/`/`android/` gitignored.

## Architektur

**REST-API als kanonische Schnittstelle.** Das Frontend spricht für **Mutationen
ausschließlich** über die REST-API (`/api/v1/*`), nie über Server Actions für Daten.
Reads bleiben **SSR** — aber über *dieselbe* Service-Schicht. Genau **ein** kanonischer
Ort für Datenlogik: `src/lib/services/*` (→ Prisma).

- **API-Kern** (`src/lib/api/`):
  - `http.ts` — `ApiError` + `handle()`-Wrapper (fängt ApiError/Zod/Prisma-Fehler,
    einheitliche Hülle `{ error: { message, details? } }`; P2002→409, P2025→404).
  - `session.ts` — `requireUser()`/`requireAdmin()`. **`requireUser` liest bei jeder
    Anfrage `active`/`role`/`emailVerified` frisch aus der DB** (Session-Revocation:
    deaktivierte/unbestätigte Konten werden sofort abgewiesen, nicht erst nach Token-Ablauf).
  - `schemas.ts` — **Zod = Single Source of Truth** für Request-Validierung UND OpenAPI.
  - `dto.ts` — Prisma → schlanke Response-DTOs (nie rohes Prisma; **kein** `passwordHash`).
  - `openapi.ts` — OpenAPI-3.1-Dokument (nur Session + Users registriert).
  - `client.ts` — **Browser**-Fetch-Helper (`api.get/post/patch/delete`). Nach Writes:
    **`router.refresh()`** rendert die SSR-Seite neu.
- **Route-Handler:** `src/app/api/v1/**/route.ts` — dünn: `requireUser/Admin` →
  Zod-`parse` → Service → DTO → `ok()`. **Ownership** via `updateMany`/`deleteMany`
  mit `where { id, userId }` bzw. `{ id, tripId }`.
- **Auth Split-Config** (Edge-Kompatibilität):
  - `src/auth.config.ts` — **edge-safe** (keine Prisma/bcrypt!), `authorized`/`jwt`/
    `session`-Callbacks + `session.maxAge` (12 h). Öffentliche Routen: `/login`,
    `/register`, `/verify`, `/forgot`, `/reset`.
  - `src/auth.ts` — volle Instanz (Credentials + Passkey; Prisma + bcrypt; Node-Runtime).
    Login prüft `active` **und** `emailVerified`; Brute-Force-Rate-Limit pro E-Mail.
  - `src/middleware.ts` — eigene NextAuth-Instanz aus `authConfig` für Route-Schutz.
- **Login/Logout** bleiben NextAuth-Server-Actions (`src/app/actions/auth.ts`).
  `/api/auth/*` ist der NextAuth-Flow.
- **Rollen-Gating doppelt:** Middleware (Seiten) **und** in jeder Page/jedem Handler.
- **API-Docs:** `/api/v1/openapi` (JSON) + Swagger UI unter `/api-docs` (self-hosted,
  dynamischer Client-Import). Middleware schützt `/api*` **nicht** — Auth pro Handler.

### Sicherheit (nach Audit umgesetzt)

- **Rate-Limiting** (`src/lib/rate.ts` + `RateLimit`-Modell, Postgres-basiert,
  serverless-tauglich): Registrierung (5/h/IP), Login (10/15 min/E-Mail), Einladungen
  (20/h), Passwort-forgot (5/h), Flug-Lookup (30/h), Geocode-Übernahme (30/min).
- **Security-Header** (`next.config.ts`): CSP, HSTS, X-Frame-Options, nosniff,
  Referrer-/Permissions-Policy. `script-src` bekommt `'unsafe-eval'`/`ws:` **nur im Dev**.
- **SSRF-Schutz** (`src/lib/net.ts`, `safeFetch`): nutzergesteuerte Fetches
  (Maps-Links in `geo/resolve`) blocken private/loopback/metadata-Ziele + folgen
  Redirects manuell.
- **XSS:** Leaflet-Popups/Tooltips als DOM-Element (`textContent`), nie HTML-String.
- **Einmal-Token** (`Token`-Modell, `src/lib/services/tokens.ts`) für E-Mail-Verifikation
  und Passwort-Reset (atomar entwertet).
- **WebAuthn Fail-Fast** in Produktion (`assertWebauthnConfig()`), zur Laufzeit (nicht
  beim Build).

### Datenmodell (`prisma/schema.prisma`)

`User` · `Credential` · `Token` · `RateLimit` · `Trip` · `TripMember` · `TripInvitation`
· `TripStop` · `Expense` · `Flight` · `PlannerTask` · `ChecklistItem`. Kern:
- `User.emailVerified` (`DateTime?`) — null = unbestätigt → **Login gesperrt**. Nur offene
  Selbst-Registrierung startet unbestätigt; Einladung/Admin/Seed gelten als bestätigt.
- **Geteilte Reise:** alle Japan-Tools gehören einem **`Trip`**; Nutzer über **`TripMember`**
  (`userId @unique` → genau eine aktive Reise). `getActiveTripId(userId)` legt beim ersten
  Zugriff eine Solo-Reise an (P2002-Race abgefangen). Routen lösen die Reise serverseitig
  auf → Komponenten bleiben tenant-agnostisch.
- `Expense.yen` als **Int** (Yen); `Expense.flightId` (unique, `onDelete: Cascade`) koppelt
  optional einen Flugpreis als Ausgabe (Kategorie „TRANSPORT").
- `Flight` — Details + `priceYen`; Zeiten als **UTC-naive Wall-Clock** gespeichert und
  immer in UTC formatiert (kein Zeitzonen-Verschieben).
- `TripInvitation` — Token-Link, 14 Tage gültig; `createInvitation`/`acceptInvitation`
  atomar; bestehende Konten werden **nicht** zwangsverschoben (Zustimmung nötig, s. u.).
- Datums-Felder (`@db.Date`) in **UTC**; `src/lib/time.ts` (`parseDateParam`/`toDateParam`/
  `todayParam`) — vom Tagesplaner genutzt.

### Views / Routen

Auth (öffentlich): `/login` · `/register` (offene Selbst-Registrierung + Invite-Modus
mit `?token=`) · `/verify?token=` (E-Mail bestätigen) · `/forgot` · `/reset?token=`.

App (`(app)`-Layout, TopNav-Gruppen **Japan** + **Mehr**):
- `/start` — kategorisierte Kachel-Übersicht; `/` → Redirect hierhin
- `/reiseplaner` — Karte, Route, Zugverbindungen (s. u.)
- `/fluege` — Flüge (Auto-Abruf/manuell), Preis → Ausgaben
- `/ausgaben` — Ausgabenrechner Yen→Euro
- `/zoll` — Zollrechner (dt. Reisezoll)
- `/tagesplaner` · `/checkliste` · `/mitglieder`
- `/profil` — Profilbild (client-seitig auf 128×128, Data-URL in `User.image`, `PATCH /api/v1/me`)
- `/admin` — **Nutzerverwaltung** (nur ADMIN)
- `/api-docs` — Swagger UI

**API-Endpunkte:** `me`, `users` (+`[id]`), `register`, `password/forgot`,
`password/reset`, `invite/[token]`, `trip/members` (+`[userId]`),
`trip/invitations/[id]` (+`/accept`), `trip-stops` (PUT, +`from-text`), `expenses`,
`flights` (+`[id]`, +`lookup`), `planner-tasks` (+`[id]`), `checklist`, `geo/*`,
`fx/rate`, `openapi`. (Trip-basierte Endpunkte sind nicht in OpenAPI registriert.)

### Auth-Flows

- **Offene Selbst-Registrierung** (`POST /api/v1/register`) → Konto **unbestätigt** +
  eigene Solo-Reise; Verify-Mail mit Token. Ohne SMTP: Verify-Link in der Antwort
  (Dev-Fallback). Login erst nach `/verify`.
- **Passwort-Reset:** `/forgot` (generische Antwort, keine Enumeration) → Reset-Token →
  `/reset`.
- **Einladung (`/mitglieder`):** Person **ohne** Konto → Registrierungs-Link (14 Tage);
  Person **mit** Konto → **ausstehende Einladung**, die sie unter „Einladungen an dich"
  selbst **annimmt/ablehnt** (kein Force-Move). Ausstehende Einladungen sind dort
  sichtbar (Restlaufzeit) und widerrufbar.

### Reiseplaner (`/reiseplaner`)

`TripPlanner.tsx` (Client, dynamischer Leaflet-Import → kein SSR-`window`). Externe
Dienste server-seitig über die API (Proxy-CA, sauberer User-Agent); nur Tiles lädt der Browser.
- `GET /api/v1/geo/search?q=` — Geocoding via **Nominatim** (Japan, romanisiert).
- `GET /api/v1/geo/route?points=` — beste Route via **OSRM-Trip**.
- `GET /api/v1/geo/resolve?q=` — Maps-Link/Text → Koordinaten (SSRF-geschützt).
- `GET /api/v1/geo/transit?from=&to=&mode=` — mit `GOOGLE_MAPS_API_KEY` echte
  Zugverbindung (Google Directions), sonst distanzbasierte **Schätzung**.
- **Google-Maps-Deep-Link je Etappe** (`travelmode=transit`, keyfrei) — öffnet die volle
  ÖPNV-Timeline in Google Maps.
- Stopps in der **DB** pro Reise (`TripStop`, PUT-Replace; `from-text` hängt einen
  einzelnen geocodeten Ort an).

### Flüge (`/fluege`)

`FlightPlanner.tsx`. Auto-Abruf `GET /api/v1/flights/lookup?number=&date=` via
**AeroDataBox** (nur mit `AERODATABOX_API_KEY`, sonst 422 → manuell). Es wird die
Instanz mit **passendem Abflugdatum** gewählt (AeroDataBox liefert für ein Datum oft
zwei). Preis (€/¥, clientseitig nach Yen) → verknüpfte **Ausgabe** (Kategorie TRANSPORT),
Update/Delete synchron (Cascade).

### Ausgaben & Zoll

- **Ausgabenrechner** (`ExpenseCalculator.tsx`): Yen→Euro live via `GET /api/v1/fx/rate`
  (open.er-api.com, keyfrei). Kategorien + Budget + Donut. Ausgaben in der **DB** pro Reise.
- **Zollrechner** (`/zoll`, `CustomsCalculator.tsx`): dt. Reisezoll — Freimenge 430 €/Person,
  Pauschalsatz 17,5 % bis 700 €, sonst Zoll + 19 % EUSt. Rein rechnerisch (keine DB),
  optional Warenwert aus den Ausgaben übernehmen.

### Tagesplaner → Reiseplaner

Aufgabentext per Knopf zu einem Ort auflösen (`POST /api/v1/trip-stops/from-text` →
`geocodeJapan`, Nominatim/Japan) und als Stopp anhängen. „teamLab Planets" → Ort;
Freitext ohne Ort → 422.

### Branding (Clover Japan)

Eigenes Corporate Design, alle Assets **self-hosted** (kein CDN-Runtime-Fetch):
- **Fonts:** Viga (Headings) + PT Sans (Body) als `@font-face` in `globals.css`, `public/fonts/`.
- **Farben:** Tailwind-v4-`@theme`-Tokens → `brand` (`#009BC9`), `brand-dark` (`#0A314C`),
  `brand-tint` (`#B9E7F7`), `accent` (`#F87805`), `danger` (`#E2001A`).
- **Logo/Favicon:** Kleeblatt (`public/brand/clover*.png`, `src/components/Logo.tsx` via CSS-Maske).
- **Dark-Mode:** klassenbasiert (`@custom-variant dark …`), Umschalter `ThemeToggle.tsx`;
  Inline-Script im Root-Layout setzt `.dark` vor dem ersten Paint (kein FOUC).
  Neue farbige UI immer mit `dark:`-Variante.

Feste App-Zeitzone (MVP): `Europe/Berlin` (`APP_TIMEZONE`).

## Demo-Daten & Zugänge

Seed (`prisma/seed.ts`) legt nur die 6 Demo-Nutzer an (bestätigt). Passwort: `password123`.

| Rolle    | E-Mail                |
|----------|-----------------------|
| Admin    | admin@clover.japan    |
| Manager  | manager@clover.japan  |
| Employee | employee@clover.japan |
| Employee | anna@clover.japan     |
| Employee | ben@clover.japan      |
| Employee | clara@clover.japan    |

## Arbeitsweise (projektspezifisch)

- **Best Practices, keine Workarounds** (siehe globale Anweisung). Ursachen beheben.
- Nach nicht-trivialen Änderungen: `npm run build` im Container grün halten, **danach
  `restart app`**, und den betroffenen Flow real durchspielen (gern headless per Playwright).

## Offen / Ideen

CSV/Export · Charts · Alkohol/Tabak-Mengengrenzen im Zollrechner · Ort-Vorschlag beim
Tippen im Tagesplaner · getrennte Preview-/Prod-DB bei Vercel.
