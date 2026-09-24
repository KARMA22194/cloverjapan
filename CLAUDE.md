# CLAUDE.md — Clover Japan

Projektanweisungen für Claude Code (Ordner `Timetracker`, App heißt **Clover Japan**).
Ergänzt die übergeordnete `../CLAUDE.md` (Sprache: **immer Deutsch**; MCP: Context7).

## Projekt

**Kollaborativer Reiseplaner für eine Japan-Reise.** Nutzer melden sich an (oder
registrieren sich selbst / per Einladung), gehören einer geteilten **Reise (`Trip`)**
an und planen gemeinsam:

- **Reiseplaner** — Orte auf einer Karte, beste Route, Zugverbindungen (Deep-Link zu Google
  Maps), **Konbini-Radar** (7-Eleven/Lawson/… entlang Route oder um den eigenen Standort),
  **Regenradar-Overlay** (RainViewer)
- **Flüge** — per Flugnummer abrufen oder manuell; **Live-Status** (Gate/Terminal/Check-in/
  Kofferband), **Sitzplätze**; Preis fließt in die Ausgaben
- **Geld** (Tab-Bereich) — **Ausgaben** (Yen→Euro, **Beleg-Scan per KI**), **Abrechnung**
  (wer-schuldet-wem), **Zollrechner**, **Wunschliste**
- **Programm** (Tab-Bereich) — **Reiseablauf** (Timeline), **Tagesplaner**, **Buchungen/Tickets**,
  **Checkliste**
- **Info** (Tab-Bereich) — **Reiseübersicht**, **Wetter**, **Eki-Stamp-Album** (GPS-Sammelalbum),
  **Kofferanhänger** (QR-Finder), **Notfall & Basics**
- **Mitglieder** (einladen, gemeinsam bearbeiten) · **Start-Dashboard** (Countdown, „Als
  Nächstes", Live-Flug am Reisetag, Aktivitäts-Feed, Japan-Uhr)

Rollen: **`USER` / `ADMIN`**. `ADMIN` hat zusätzlich eine **Nutzerverwaltung**
(`/admin`), in der Rechte vergeben werden.
⚠️ `EMPLOYEE`/`MANAGER` gab es früher — `MANAGER` wurde jedoch **nirgends** abgefragt.
Eine Rolle, die nichts bewirkt, ist schlimmer als keine: sie sieht nach Berechtigung aus.
Feingranulares steckt deshalb in den **`can*`-Rechten am `User`**, nicht in der Rolle —
die stehen quer zur Rangfolge (ein `USER` darf vielleicht scannen, ein `ADMIN` gerade nicht;
als Rollen ausgedrückt bräuchte jede Kombination eine eigene). (Die ursprüngliche Zeiterfassung wurde vollständig entfernt.)

> **Hinweis zur Navigation:** Zusammengehörige Tools sind in Tab-Bereiche gebündelt
> (`/geld`, `/programm`, `/info`). Die alten Einzelrouten (`/ausgaben`, `/zoll`,
> `/wunschliste`, `/abrechnung`, `/tagesplaner`, `/buchungen`, `/ablauf`, `/checkliste`,
> `/wetter`, `/uebersicht`) leiten per `redirect` auf den passenden Tab (`?tab=`).

## Tech-Stack

- **Next.js 15** (App Router; REST-API via Route Handlers, Reads via Server Components)
  + **TypeScript** (strict)
- **Prisma** + **PostgreSQL 16**
- **Auth.js (NextAuth v5)** — Credentials-Provider + **bcryptjs**, JWT-Sessions (self-hosted);
  zusätzlich **Passkeys/WebAuthn** (`@simplewebauthn`, Provider-id `passkey`, `Credential`-Tabelle;
  Config in `src/lib/webauthn.ts`, ENV `WEBAUTHN_RP_ID/ORIGIN/RP_NAME` — Prod braucht HTTPS).
  Challenge liegt im httpOnly-Cookie (**getrennt** für Registrierung und Login) **und** in der
  Tabelle `WebauthnChallenge`, wo sie beim Einlösen atomar entwertet wird (Einmal-Verwendung).
  Registrierung verlangt `residentKey`/`userVerification: "required"` — passend zum Login, der mit
  `allowCredentials: []` arbeitet.
- **E-Mail:** `nodemailer` über SMTP (Einladungen, E-Mail-Verifikation, Passwort-Reset;
  `src/lib/mailer.ts`, ENV `SMTP_*`). Ohne `SMTP_HOST` kein Versand (Flows haben Fallbacks).
- **Tailwind CSS v4**, **Zod**, **date-fns / date-fns-tz**
- **Karten (Reiseplaner):** `leaflet` + OSM/CARTO-Tiles; Geocoding **Nominatim**,
  Routing **OSRM** (server-seitig, keyfrei)
- **Konbini-Radar:** **Overpass API / OpenStreetMap** (`shop=convenience`, keyfrei,
  Spiegel-Fallback)
- **Regenradar:** **RainViewer** (keyfrei, Kachel-Overlay)
- **Flüge:** **AeroDataBox** über RapidAPI (optional, `AERODATABOX_API_KEY`) — Auto-Abruf
  **und** Live-Status
- **Beleg-Scan:** **Google Cloud Vision** (OCR, `GOOGLE_VISION_API_KEY`, gratis bis
  1.000 Bilder/Monat) mit eigener Betragszuordnung in `src/lib/receipt.ts`. Ohne Key
  oder ohne lesbaren Betrag: 422, Betrag wird manuell eingetragen.
  ⚠️ Es gab eine **zweite Stufe** über Claude Vision (Anthropic Messages API), die
  einsprang, wenn Vision keinen Betrag fand. Sie ist entfernt: ohne Key lief sie nie,
  und der Rückfall war **still** — `readWithVision` gibt bei jedem Fehler `null`
  zurück, auch bei aufgebrauchtem Kontingent, und die Schleife wechselte dann
  unbemerkt auf die kostenpflichtige API. Ein Erkenner, ein Kostenpfad.
- **QR-Codes** (Kofferanhänger): `qrcode` (clientseitig als Data-URL)
- Läuft **vollständig in Docker** (kein Node auf dem Host)
- **Deployment:** Vercel + Neon (Postgres). `vercel.json` `buildCommand`:
  `prisma generate && prisma migrate deploy && next build` — **Migrationen laufen
  automatisch beim Deploy** (braucht `DIRECT_URL` = Neon-Direct-URL, sonst schlägt der
  Deploy fehl und nichts Neues geht live).

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
   (React Fast Refresh/HMR) + `ws:`. In **`src/lib/csp.ts`** env-abhängig gelöst
   (erzeugt von `src/middleware.ts`); Prod bleibt streng (Nonce + `strict-dynamic`).
   Fehlt es im Dev → EvalError, kein Client-JS.
3. **Nach `prisma migrate`/`generate` den Dev-Server neu starten** (sonst alter
   Prisma-Client im Speicher → neue Modelle `undefined`).
4. **In Playwright auf Hydration warten, nicht auf das Element.** `waitForSelector`
   belegt nur, dass das server-gerenderte HTML da ist — React kann noch nicht
   hydriert sein. Wird dann per `setInputFiles`/`filechooser` eine Datei gesetzt,
   feuert das native `change`-Event ins Leere (der `onChange` hängt noch nicht),
   und der Test scheitert, obwohl das Feature funktioniert. Auf ein
   Client-Effekt-Signal warten (z. B. verschwundenes „Wechselkurs wird geladen…"),
   dann handeln. Kostete beim Beleg-Scan-Test eine ganze Fehlersuche.
5. **Diagnose** am schnellsten per **headless Playwright** im Container
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
  aktiv entfernt (sonst veraltetes Bundle). `start_url=/start`, `display=standalone`.
- **Offline-Lesezugriff:** SW cacht **network-first** — statische Assets in `STATIC_CACHE`,
  Navigationen **und** `GET /api/*` in `DATA_CACHE` (online immer frisch, offline aus Cache).
  **Cross-User-Schutz:** `DATA_CACHE` ist per Marker `/__owner` an einen Nutzer gebunden;
  `PwaRegister` meldet die Session (`/api/v1/me`), TopNav den Logout → bei Nutzerwechsel/
  Logout wird der Daten-Cache geleert. `OfflineBanner` zeigt den Offline-Zustand.
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
  - `session.ts` — `requireUser()`/`requireAdmin()`/**`requireTripUser()`**.
    **`requireUser` liest bei jeder Anfrage `active`/`role`/`emailVerified`/`sessionVersion`
    frisch aus der DB** (Session-Revocation: deaktivierte/unbestätigte Konten und per
    Passwort-Reset entwertete Sitzungen werden sofort abgewiesen, nicht erst nach Token-Ablauf).
    **`requireTripUser()` ist der Standard-Einstieg der Trip-Endpunkte** — es holt Nutzer und
    `tripId` **parallel** (`Promise.all`) statt in zwei sequenziellen Neon-Roundtrips; im
    SSR-Pfad macht `src/lib/auth-session.ts#requireSessionUser()` dasselbe für Server Components.
  - `schemas.ts` — **Zod = Single Source of Truth** für die Request-Validierung.
  - `dto.ts` — Prisma → schlanke Response-DTOs (nie rohes Prisma; **kein** `passwordHash`).
  - `client.ts` — **Browser**-Fetch-Helper (`api.get/post/patch/delete`). GETs auf dieselbe
    URL werden zusammengefasst, **solange sie laufen** (kein Zeit-Cache — sonst bekäme ein
    Reload direkt nach einem Write die alte Antwort). Nach Writes:
    **`router.refresh()`** rendert die SSR-Seite neu. Parst Antworten **tolerant** (nicht-JSON
    wie Vercels „An error occurred…"-Fehlerseite → verständliche Meldung statt `JSON.parse`-
    Crash). Fehlgeschlagene **Mutationen** lösen automatisch einen **Toast** aus (`@/lib/toast`
    + `<Toaster>` global im Root-Layout); GET bleibt stumm.
- **Route-Handler:** `src/app/api/v1/**/route.ts` — dünn: `requireUser/Admin` →
  Zod-`parse` → Service → DTO → `ok()`. **Ownership** via `updateMany`/`deleteMany`
  mit `where { id, userId }` bzw. `{ id, tripId }`.
- **Auth Split-Config** (Edge-Kompatibilität):
  - `src/auth.config.ts` — **edge-safe** (keine Prisma/bcrypt!), `authorized`/`jwt`/
    `session`-Callbacks + `session.maxAge` (12 h). Öffentliche Routen: `/login`,
    `/register`, `/verify`, `/forgot`, `/reset`, **`/k/`** (öffentliche Kofferfinder-Seite).
  - `src/auth.ts` — volle Instanz (Credentials + Passkey; Prisma + bcrypt; Node-Runtime).
    Login prüft `active` **und** `emailVerified`; Brute-Force-Rate-Limit pro E-Mail.
  - `src/middleware.ts` — eigene NextAuth-Instanz aus `authConfig` für Route-Schutz.
- **Login/Logout** bleiben NextAuth-Server-Actions (`src/app/actions/auth.ts`).
  `/api/auth/*` ist der NextAuth-Flow.
- **Rollen-Gating doppelt:** Middleware (Seiten) **und** in jeder Page/jedem Handler.
- **Keine API-Doku mehr.** OpenAPI-Spec, Swagger UI (`/api-docs`) und die drei Pakete
  (`swagger-ui-dist`, `@asteasolutions/zod-to-openapi`, `@types/…`) sind entfernt: die Spec
  beschrieb nur `me` + `users` — 4 von 56 Routen — und verschwieg den kompletten Japan-Teil.
  Eine Doku, die 52 Endpunkte auslässt, führt in die Irre. Die REST-API ist ohnehin
  ausschließlich für das eigene Frontend, nicht für Dritte.
  Middleware schützt `/api/*` **nicht** — Auth pro Handler. Der Nav-Eintrag „Mehr" ist
  komplett Admin-only (leere Gruppen werden ausgeblendet).

### Sicherheit (nach Audit umgesetzt)

- **Rate-Limiting** (`src/lib/rate.ts` + `RateLimit`-Modell, Postgres-basiert,
  serverless-tauglich): Registrierung (5/h/IP), Login (**10/15 min/E-Mail UND 30/15 min/IP**
  — IP-Limit fängt E-Mail-Spraying ab), Einladungen (20/h), Passwort-forgot (5/h),
  Flug-Lookup/-Live (30–60/h), Geocode-Übernahme (30/min), Geo-Suche (60/min), Routing (30/min),
  **Zugverbindung/Google Directions (60/h — einziger wirklich abgerechneter Call)**,
  Konbini (20/h), Beleg-Scan (30/h pro Nutzer **und** 40/Tag pro Reise — Letzteres
  schützt das Monatskontingent von Vision vor sechs gleichzeitig scannenden
  Mitgliedern), **Vision-Monatskontingent** (950 Scans/Kalendermonat, **global** —
  s. u.), Koffer-Fund (5/10 min pro Token & IP **plus** 20/h pro Token
  ohne IP-Anteil). Der Zähler ist **atomar** (ein `INSERT … ON CONFLICT … RETURNING`), sonst
  rutschten gleichzeitige Requests alle mit `count = 0` durch. `clientIp()` nimmt die IP nur aus
  vertrauenswürdiger Quelle (Vercel-Header / `cf-connecting-ip` / `TRUSTED_PROXY_HOPS` von rechts) —
  **nie** den ersten `X-Forwarded-For`-Eintrag, der ist frei fälschbar.
- **Security-Header** (`next.config.ts`): HSTS, X-Frame-Options, nosniff,
  Referrer-/Permissions-Policy.
  **`Permissions-Policy: geolocation=(self)`** — Standort ist freigegeben (Konbini „in meiner
  Nähe", Eki-Stamps, Koffer-Fund). ⚠️ War früher `geolocation=()` → hätte alle Standort-
  Features geblockt.
- **CSP: nonce-basiert** — Regeln in `src/lib/csp.ts`, erzeugt pro Request in
  `src/middleware.ts` (**nicht** in `next.config.ts`; ein statischer Header dort würde den
  dynamischen überschreiben). Der Nonce geht in den *Request*-Header (dann hängt Next ihn
  automatisch an seine RSC-Inline-Scripts) **und** in `x-nonce` fürs Theme-Script im
  Root-Layout. `script-src 'self' 'nonce-…' 'strict-dynamic'`; `'unsafe-inline'`/`'unsafe-eval'`
  und `ws:` **nur im Dev** (HMR). `img-src`/`connect-src` nennen nur die real vom Browser
  kontaktierten Hosts (cartocdn, rainviewer) — nicht mehr pauschal `https:`.
  `style-src 'unsafe-inline'` bleibt (Leaflet/Swagger setzen Styles per Attribut).
  ⚠️ Der Middleware-Matcher schließt `api/` **mit Schrägstrich** aus — ohne ihn griffe der
  Ausschluss auf jeden Pfad, der mit „api" beginnt, und eine solche Seite bekäme keine CSP.
  ⚠️ Das Theme-Script im Root-Layout braucht **`suppressHydrationWarning`**: der Browser
  leert das `nonce`-Attribut im DOM, sobald die CSP angewendet ist (HTML-Spec — der Wert
  lebt nur im internen `[[CryptographicNonce]]`-Slot, damit er nicht per Attributselektor
  auslesbar ist). Server-`nonce="…"` gegen DOM-`nonce=""` kann nie übereinstimmen, React
  meldete das als Hydration-Fehler. Das `suppressHydrationWarning` am `<html>` reicht
  dafür **nicht** — es gilt nur eine Ebene tief.
- **SSRF-Schutz** (`src/lib/net.ts`, `safeFetch`): nutzergesteuerte Fetches
  (Maps-Links in `geo/resolve`) blocken private/loopback/metadata-Ziele (inkl. IPv4-in-IPv6
  in **Hex**-Schreibweise/NAT64) + nur Ports 80/443 + folgen Redirects manuell.
  Bodys **immer** über `readTextLimited()` lesen — `(await res.text()).slice(…)` puffert erst
  die ganze Antwort und lässt sich mit einem Endlos-Stream in den OOM treiben.
  Restrisiko DNS-Rebinding bleibt (bräuchte IP-Pinning per undici-Dispatcher).
- **XSS:** Leaflet-Popups/Tooltips als DOM-Element (`textContent`), nie HTML-String.
- **Einmal-Token** (`Token`-Modell, `src/lib/services/tokens.ts`) für E-Mail-Verifikation
  und Passwort-Reset (atomar entwertet).
- **WebAuthn Fail-Fast** in Produktion (`assertWebauthnConfig()`), zur Laufzeit (nicht
  beim Build).

### Datenmodell (`prisma/schema.prisma`)

`User` · `UserSectionIcon` · `Credential` · `Token` · `RateLimit` · `WebauthnChallenge` · `PushSubscription` · `Trip` · `TripMember` · `TripInvitation`
· `TripStop` · `TripHotel` · `Expense` · `Flight` · `PlannerTask` · `ChecklistItem` ·
`Settlement` · `Booking` · `WishlistItem` · `Activity` · `CollectedStamp` · `LuggageTag` · `ExpenseReceipt` · `MemberCategoryBudget`. Kern:
- `User.emailVerified` (`DateTime?`) — null = unbestätigt → **Login gesperrt**. Nur offene
  Selbst-Registrierung startet unbestätigt; Einladung/Admin/Seed gelten als bestätigt.
- **`User.canAiScan` / `User.canReceiptPhoto`** (Bool) — die zwei **getrennten**
  Beleg-Rechte, vom ADMIN in `/admin` vergeben (`PATCH /api/v1/users/{id}`).
  Getrennt, weil sie Verschiedenes kosten: der Scan ruft Cloud Vision auf und
  verbraucht Monatskontingent (Default **aus**), das Anhängen eines Fotos kostet
  nichts (Default **an**, damit sich für bestehende Konten nichts ändert).
  ⚠️ Hier ausnahmsweise **Spalten am `User`** — im Gegensatz zu `UserSectionIcon`.
  Der Grund ist derselbe, nur andersherum: `requireUser()` liest diese Zeile bei
  **jedem** Request, und genau dort wird das Recht gebraucht. Ein Bool kostet dabei
  nichts, ein Bild hätte jede Antwort aufgebläht.
  ⚠️ **Das Ausblenden der Knöpfe ist keine Sperre.** Die Prüfung, die zählt, ist
  `requirePermission()` (`api/session.ts`) in den Handlern `expenses/scan` (`canAiScan`)
  und `expenses/[id]` PATCH (`canReceiptPhoto`, **nur** im `receipt`-Zweig — ein
  Kategorie-Wechsel bleibt erlaubt). Ohne die Handler-Prüfung genügte ein direkter
  Aufruf der same-origin-API.
  ⚠️ Die Rechteprüfung steht im Scan **vor** dem Rate-Limit: sonst könnte ein
  Unberechtigter mit abgewiesenen Aufrufen das Tagesbudget der Berechtigten leeren.
  ⚠️ Die Seite `/geld` holt die Rechte über `requireSessionUser()` **frisch aus der DB**
  und reicht sie als Props durch (`GeldTabs` → `ExpenseCalculator`). Aus dem JWT gelesen
  hinge der Scan-Knopf noch bis zu 12 h im Bild, nachdem das Recht entzogen wurde; per
  Client-Fetch erschiene er kurz und verschwände wieder. Test: `e2e/permissions.mjs`.
- `User.lastSeenAt` (`DateTime?`) — Presence: Heartbeat der offenen App (`POST /api/v1/presence`,
  `PresenceHeartbeat` im `(app)`-Layout, alle **2 min** bei sichtbarem/online Tab; **eine** Query
  pro Ping, die Prüfungen stecken im `where` statt in einem zusätzlichen `requireUser`-SELECT).
  ⚠️ Takt und Online-Schwelle gehören zusammen: Mitgliederliste zeigt „online" (< 5 min) /
  „zuletzt vor X" (grüner/grauer Punkt, Live-Polling 30 s über den schlanken
  `GET /api/v1/trip/presence` ohne Profilbilder). Kürzerer Takt hielte Neon dauerhaft wach.
  Zusätzlich `ConnectionStatus` in der TopNav = eigener Online/Offline-Indikator (`navigator.onLine`).
- **`UserSectionIcon`** (`@@id([userId, section])`) + **`User.customIcons`** (Bool) — eigene
  **Bereichs-Symbole**. Standard sind die Emoji aus `src/lib/sectionIcons.ts`; jedes Mitglied
  kann jedes Symbol im Profil durch ein eigenes Bild ersetzen. **Persönlich**, nicht pro Reise —
  andere sehen weiter ihre eigenen. Eigene Tabelle statt Spalte/JSON am `User`: die User-Zeile
  wird bei **jedem** Request gelesen (Revocation), die Bilder nur beim Seitenaufbau — dasselbe
  Argument wie bei `ExpenseReceipt`. `customIcons` ist das Spiegel-Flag (wie `Expense.hasReceipt`):
  steht es auf `false`, fragt `getSectionIcons` die Tabelle **nicht** ab → der Normalfall
  „alles Standard" kostet keine zusätzliche Query pro Seitenaufruf.
  Ein **ADMIN** kann die Symbole fremder Konten setzen (`/api/v1/users/{id}/icons/…`);
  `SectionIconSettings` nimmt dafür ein optionales `userId` und schaltet nur den Endpunkt um.
  ⚠️ Das **Logo** ist bewusst **kein** Bereichs-Symbol (Markenzeichen, `src/components/Logo.tsx`).
  ⚠️ Uploads laufen über **`prepareSectionIcon`** (`src/lib/image.ts`), **nicht** über
  `resizeImage`. Bloßes Verkleinern nimmt den leeren Rand mit: gemessen an einem
  512×512-PNG mit 64×64-Motiv blieb das Motiv **8×8 px** groß (Füllgrad 13 %) — auf einer
  26-px-Kachel unter 3 px, also unkenntlich. `prepareSectionIcon` **stellt vorher frei**
  (Alpha-Bounding-Box bei transparenten Bildern, Vollton-Rand über die vier Ecken bei
  JPEG/Weiß) und skaliert dann die längere Kante auf `ICON_PIXEL_SIZE`. Nach dem Fix:
  94–100 % Füllgrad. Messskript: `e2e/icon-quality.mjs`.
  ⚠️ Format automatisch: **PNG** bei Transparenz (freigestelltes Motiv soll sie behalten —
  JPEG hat keinen Alphakanal und färbte den Hintergrund schwarz), sonst **JPEG** (bei Fotos
  um ein Vielfaches kleiner, hält die Data-URL unter `ICON_MAX_BYTES`).
  ⚠️ **Nicht** quadratisch beschneiden — das schnitte hohe/breite Motive an. Stattdessen
  bleibt das Seitenverhältnis, und `SectionIcon` rendert mit fester Höhe und freier Breite
  bis **1,6×**. Diese Grenze ist die Breite der 44-px-Kachelfläche: darüber weitet sich die
  Fläche und drückt den Beschreibungstext in zusätzliche Zeilen.
- **`TripMember.budgetYen`** + **`MemberCategoryBudget`** — das **persönliche**
  Reise-Budget (gesamt und je Kategorie), über `GET/PUT /api/v1/budget`.
  Am `TripMember`, weil der genau das Paar (Nutzer, Reise) ist — eine eigene
  Budget-Tabelle hätte dieselbe Beziehung ein zweites Mal modelliert; die
  Teilbudgets hängen daran und verschwinden per Cascade mit der Mitgliedschaft.
  Persönlich, nicht geteilt: niemand sieht die Zahlen der anderen. Eine neue Reise
  fängt mit leerem Budget an.
  ⚠️ **`requireTripUser()`, nicht `requireUser()`.** Die Mitgliedschaft entsteht
  **lazy** beim ersten Trip-Zugriff (`getActiveTripId`). Mit `requireUser()` fand
  der Service bei einem frischen Konto keine Zeile, verwarf das Budget still und
  meldete trotzdem 200 — der Client konnte den Unterschied nicht sehen. Genau so
  passiert; aufgefallen erst, weil die Zahl nach dem Neuladen wieder weg war.
  ⚠️ PUT **ersetzt**, es führt nicht zusammen: die Oberfläche schickt immer den
  vollen Stand, und ein gelöschtes Teilbudget muss auch verschwinden.
  ⚠️ Vorher lag beides im `localStorage` — pro Gerät, pro Browser, beim Leeren weg.
  Ein dort vorhandener Stand wird beim ersten Laden **einmalig übernommen** und
  danach lokal gelöscht. Das Speichern ist um 800 ms gebündelt (sonst ein PUT je
  Tastendruck), und ein `budgetLoaded`-Ref verhindert, dass der leere
  Anfangszustand den geladenen überschreibt. Test: `e2e/budget.mjs`.
  ⚠️ Die Budget-Karte rendert nur bei `items.length > 0` — Tests, die das Feld
  anfassen, brauchen vorher eine Ausgabe.
- **Geteilte Reise:** alle Japan-Tools gehören einem **`Trip`**; Nutzer über **`TripMember`**
  (`userId @unique` → genau eine aktive Reise). `getActiveTripId(userId)` legt beim ersten
  Zugriff eine Solo-Reise an (P2002-Race abgefangen). Routen lösen die Reise serverseitig
  auf → Komponenten bleiben tenant-agnostisch.
- `Expense.yen` als **Int** (Yen); `Expense.flightId`/`bookingId` (unique, `onDelete: Cascade`)
  koppeln optional Flug-/Buchungspreis als Ausgabe. `Expense.paidById` (FK User, SetNull) =
  Zahler für die Abrechnung; `Expense.shared` (Bool) = auf alle aufteilen.
  **`Expense.category` ist ein Prisma-`enum`** (`ExpenseCategory`: `ESSEN` · `FIGUREN` ·
  `KLEIDUNG` · `KOSMETIK` · `ELEKTRONIK` · `SIGHTSEEING` · `TRANSPORT` · `UNTERKUNFT` ·
  `SONSTIGES`), ebenso `Booking.kind` (`BookingKind`) — Zod validiert per `z.nativeEnum`,
  und `src/lib/expenses.ts` ist über einen **type-only**-Import daran gebunden (kein Prisma
  im Client-Bundle).
  ⚠️ Die Kategorien stehen dort als **`Record<ExpenseCategory, …>`**, nicht als Array mit
  `satisfies`. Der Unterschied ist der entscheidende: `satisfies readonly {value:
  ExpenseCategory}[]` prüft nur „jeder Eintrag ist eine gültige Kategorie" — eine **neu ins
  Schema aufgenommene** Kategorie fehlte still in Auswahl, Pillen, Donut und Zollrechner,
  ohne dass der Build etwas merkte (die frühere Zusage an dieser Stelle war schlicht falsch).
  Der Record erzwingt die Gegenrichtung. Die **Reihenfolge der Schlüssel ist die
  Anzeigereihenfolge** (`Object.keys` = Einfügereihenfolge).
  ⚠️ Enum-Werte ergänzt man mit einer **handgeschriebenen** Migration
  (`ALTER TYPE … ADD VALUE … BEFORE …`); `BEFORE` hält die Reihenfolge deckungsgleich zum
  Schema, sonst meldet `prisma migrate diff` Drift. Im selben Transaktionsblock darf der
  neue Wert **nicht benutzt** werden — also kein `UPDATE` in derselben Datei.
- **`ExpenseReceipt`** (eigene Tabelle, `expenseId @id`, Cascade) — das Beleg-Foto liegt **nicht**
  als Spalte in `Expense`: so kann der Blob nicht versehentlich mitgeladen werden. `Expense.hasReceipt`
  (Bool) spiegelt „Beleg vorhanden?", damit die Liste ohne Join auskommt. Zugriff nur über
  `getExpenseReceipt`/`setExpenseReceipt` (Letzteres schreibt Beleg + Flag in einer Transaktion).
- **Datumsfelder sind `DateTime @db.Date`** (`TripStop.date`, `TripHotel.checkIn/checkOut`,
  `Booking.date`, `PlannerTask.date`) — die API liefert weiterhin `YYYY-MM-DD`: DTOs wandeln über
  `toDateParam`, Services parsen mit `parseDateParam`. ⚠️ Beim Anlegen neuer Datumsfelder dieses
  Muster beibehalten, sonst leaken `Date`-Objekte in die JSON-Antwort. `Booking.time` bleibt `String`
  (`HH:MM`, optional `""` — nicht nach `time` castbar, sortiert lexikografisch korrekt).
- `Flight` — Details + `priceYen` + **`seats`** (Sitzplätze, z. B. „32A, 32B"); Zeiten als
  **UTC-naive Wall-Clock** gespeichert und immer in UTC formatiert (kein Zeitzonen-Verschieben).
- `TripHotel` — Unterkunft (eigenes Modell, fließt **nicht** in die Routenoptimierung);
  `Settlement` — beglichene Beträge der Abrechnung; `Booking` — Ticket/Reservierung
  (Preis → gekoppelte Ausgabe); `WishlistItem` — Einkaufs-/Souvenir-Wunschliste (Summe →
  Zollrechner). `PlannerTask`/`ChecklistItem` haben `assigneeName` (Zuweisung).
- **`Activity`** — Aktivitäts-Feed (pro Reise, FK→Trip Cascade): `action` (Maschinen-Key,
  z. B. `booking.create`) + `summary`; `logActivity()` best-effort (bricht die Mutation nie ab).
- **`CollectedStamp`** — gesammelte Eki-Stamps (`@@unique([tripId, stampKey])`); Katalog liegt
  im Code (`src/lib/ekiStamps.ts`), nicht in der DB.
- **`LuggageTag`** — digitaler Kofferanhänger: `token` (unique, im QR), `ownerName`/`label`
  (dem Finder sichtbar), `notifyEmail` (privat, **nie** an den Finder), `whatsapp`+`contact`
  (optional, dem Finder sichtbar).
- `TripInvitation` — Token-Link, 14 Tage gültig; `createInvitation`/`acceptInvitation`
  atomar; bestehende Konten werden **nicht** zwangsverschoben (Zustimmung nötig, s. u.).
- Datums-Felder (`@db.Date`) in **UTC**; `src/lib/time.ts` (`parseDateParam`/`toDateParam`/
  `todayParam`) — vom Tagesplaner genutzt.

### Views / Routen

Auth (öffentlich): `/login` · `/register` (offene Selbst-Registrierung + Invite-Modus
mit `?token=`) · `/verify?token=` (E-Mail bestätigen) · `/forgot` · `/reset?token=`.

App (`(app)`-Layout, TopNav-Gruppe **Japan** + **Mehr**). Japan-Nav ist bewusst
konsolidiert (6 Einträge): **Reiseplaner · Flüge · Programm · Geld · Info · Mitglieder**.
- `/start` — Dashboard (Countdown, „Als Nächstes", Live-Flug am Reisetag, Ausgaben, Checkliste,
  Aktivitäts-Feed, Japan-Uhr) + Kachel-Übersicht; `/` → Redirect hierhin
- `/reiseplaner` — Karte, Route, Zugverbindungen, Konbini-Radar, Regenradar (s. u.)
- `/fluege` — Flüge (Auto-Abruf/manuell, Live-Status, Sitzplätze), Preis → Ausgaben
- `/geld` — Tab-Bereich: `ausgaben` · `abrechnung` · `zoll` · `wunschliste` (`GeldTabs.tsx`,
  Deep-Link via `?tab=`). Alle drei Tab-Bereiche nutzen **`TabPanel.tsx`**: ein Tab wird erst
  beim ersten Öffnen gemountet und bleibt danach gemountet (inaktiv nur `hidden`) — sonst gingen
  getippte Eingaben beim Umschalten verloren und jeder Wechsel lüde alle Daten neu.
- `/programm` — Tab-Bereich: `ablauf` · `tagesplaner` · `buchungen` · `checkliste`
  (`ProgrammTabs.tsx`). **Ablauf** ist SSR: der Server-Node wird nur mitgeliefert, wenn dieser Tab
  beim Aufruf aktiv ist (`!tab || tab === "ablauf"`) — sonst blieben bei jedem `/programm`-Aufruf
  vier Timeline-Queries umsonst. Wechselt man später dorthin, holt die Server Action `loadAblauf`
  (`src/app/actions/ablauf.tsx`) den Knoten nach; der Zustand der übrigen Tabs bleibt erhalten.
- `/info` — Tab-Bereich: `uebersicht` · `wetter` · `stempel` · `koffer` · `notfall`
  (`InfoTabs.tsx`)
- `/k/[token]` — **öffentliche** Kofferfinder-Seite (kein Login), dreisprachig (DE/EN/日本語)
- `/mitglieder` · `/profil` (Profilbild 128×128 Data-URL, `PATCH /api/v1/me`; Passkey;
  **eigene Bereichs-Symbole** via `SectionIconSettings.tsx`) · `/admin` (nur
  ADMIN)
- **Redirect-Altrouten:** `/ausgaben`,`/zoll`,`/wunschliste`,`/abrechnung` → `/geld?tab=…`;
  `/ablauf`,`/tagesplaner`,`/buchungen`,`/checkliste` → `/programm?tab=…`;
  `/wetter`,`/uebersicht` → `/info?tab=…`.

**API-Endpunkte:** `me` (+`icons`, +`icons/[section]` PUT/DELETE, +**DELETE** = Konto löschen),
`users` (+`[id]` PATCH/**DELETE**, +`[id]/icons` (+`[section]`) — Admin setzt fremde Symbole),
`register`, `password/forgot`,
`password/reset`, `invite/[token]`, `trip/members` (+`[userId]`),
`trip/invitations/[id]` (+`/accept`), `trip-stops` (PUT, +`from-text`), `trip-hotels`,
`budget` (GET/PUT), `expenses` (+`[id]`, +**`scan`**), `flights` (+`[id]`, +`lookup`, +**`live`**),
`bookings` (+`[id]`), `wishlist` (+`[id]`), `settlements` (+`[id]`), `planner-tasks` (+`[id]`),
`checklist`, `activity`, `stamps` (+`collect`), `luggage` (+`[id]`, +`found/[token]` — **public**),
`presence` (POST — Heartbeat), `geo/*` (search, route, resolve, transit, **konbini**,
**place-link**), `fx/rate`, `weather`.

### Auth-Flows

- **Offene Selbst-Registrierung** (`POST /api/v1/register`) → Konto **unbestätigt** +
  eigene Solo-Reise; Verify-Mail mit Token. Login erst nach `/verify`.
  ⚠️ Die Antwort ist **enumerationsfrei**: bei bereits vergebener Adresse gibt es dieselbe 201 wie
  bei einer echten Neuanmeldung (plus „Konto existiert"-Mail an den Inhaber) — **kein** 409.
  Der Verify-Link erscheint nur in der Entwicklung in der Antwort; in Produktion ohne Mailversand → 503.
- **`/verify` löst den Token per Server Action (POST) ein**, nicht beim Seitenaufruf — Link-Scanner in
  Mail-Gateways verbrauchten den Einmal-Token sonst vor dem Nutzer. Ausweg bei verfallenem Token:
  `POST /api/v1/verify/resend` (generisch, ratenlimitiert).
- **Passwort-Reset:** `/forgot` (generische Antwort, keine Enumeration) → Reset-Token →
  `/reset`.
- **Einladung (`/mitglieder`):** Person **ohne** Konto → Registrierungs-Link (14 Tage);
  Person **mit** Konto → **ausstehende Einladung**, die sie unter „Einladungen an dich"
  selbst **annimmt/ablehnt** (kein Force-Move). Ausstehende Einladungen sind dort
  sichtbar (Restlaufzeit) und widerrufbar.

### Konto löschen

Zwei Wege, beide **unwiderruflich** — wer nur den Zugang sperren will, nutzt weiter
`PATCH /api/v1/users/{id} {active:false}` (Daten bleiben unberührt):
- **selbst:** `DELETE /api/v1/me` mit `{ password }` im Body. Das Passwort wird
  server-seitig geprüft — ein Cookie allein genügte nicht, sonst reichte ein
  untergeschobener Request, um ein Konto samt Reisedaten zu vernichten. UI:
  `AccountDelete.tsx` im Profil (eingeklappt + Passwort).
- **als Admin:** `DELETE /api/v1/users/{id}`. Das eigene Konto ist dort gesperrt
  (geht nur über `/me` mit Passwort). UI: `UserDeleteButton` — verlangt, dass die
  **E-Mail abgetippt** wird; ein `confirm()`-„OK" ist in einer Liste gleich
  aussehender Zeilen zu wenig.

⚠️ **`deleteUserAccount()` (`services/users.ts`) räumt die Reise mit auf.** Ein reines
`user.delete()` genügt **nicht**: `TripMember` hängt am User mit `Cascade`, `Trip`
selbst aber nicht (`Trip.ownerId` ist bewusst kein harter FK). Zurück blieben Reisen
**ohne Mitglieder**, die weiterhin Stopps, Ausgaben, Buchungen und die öffentlich
erreichbaren Kofferanhänger (`/k/[token]`) enthalten — über die UI unerreichbar, aber
vorhanden. Deshalb: leere Reise → löschen (cascadet alles); Mitglieder übrig und die
Person war Owner → Eigentum an den ersten Verwalter bzw. das dienstälteste Mitglied
weitergeben, sonst kann niemand mehr Mitglieder verwalten.

⚠️ **`wouldLeaveNoAdmin()`** verhindert beide Wege, wenn danach kein aktiver ADMIN
übrig bliebe — sonst sperrt sich die Installation aus (`/admin` für niemanden
erreichbar, kein UI-Weg zurück).

**Was bleibt:** die Namens-Schnappschüsse (`createdByName`, `assigneeName`,
`Activity.userName` — Strings, keine FKs). Absicht: die übrigen Mitglieder brauchen
für die Abrechnung weiterhin „wer hat was bezahlt". `Expense.paidById` wird per
`SetNull` zu „Unbekannt".

### Reiseplaner (`/reiseplaner`)

`TripPlanner.tsx` (Client, dynamischer Leaflet-Import → kein SSR-`window`). Externe
Dienste server-seitig über die API (Proxy-CA, sauberer User-Agent); nur Tiles lädt der Browser.
- **Zwei interne Tabs** (`view`-State, kein eigener Route/`?tab=`): „🗺️ Karte & Route"
  (Ort-Eingabe, Karte, Route/Konbini/Regen/Zug) und „📋 Orte-Liste" (Listen-Import, Hotels,
  Stopp-Liste). Die Leaflet-Karte bleibt **immer gemountet** (im Listen-Tab nur `hidden`);
  beim Zurückwechseln `map.invalidateSize()` (sonst grauer Kartenbereich).
- `GET /api/v1/geo/search?q=` — Geocoding via **Nominatim** (Japan, romanisiert).
- `GET /api/v1/geo/route?points=` — beste Route via **OSRM-Trip**.
- `GET /api/v1/geo/resolve?q=` — Maps-Link/Text → Koordinaten (SSRF-geschützt).
- `GET /api/v1/geo/transit?from=&to=&mode=` — mit `GOOGLE_MAPS_API_KEY` echte
  Zugverbindung (Google Directions), sonst distanzbasierte **Schätzung**.
- **Google-Maps-Deep-Link je Etappe** (`travelmode=transit`, keyfrei) — öffnet die volle
  ÖPNV-Timeline in Google Maps.
- **Transit-Schätzung distanzbasiert:** ohne Google-Key wird das Verkehrsmittel nach Distanz
  gewählt (< 40 km Nahverkehr, < 120 km Regional, darüber Shinkansen) — **kein** Shinkansen
  mehr für kurze Stadtstrecken.
- `GET /api/v1/geo/konbini?points=&radius=` — **Konbini-Radar**: Convenience-Stores via
  **Overpass/OSM** entlang der Route (Polylinie, ~120 m) oder um den Standort (~400 m).
  Serverless-gehärtet: `maxDuration=30`, 12-s-Abbruch-Timeout, **Spiegel-Fallback**
  (overpass-api.de → kumi.systems → private.coffee). Frontend: Modus aus/Route/Standort +
  anklickbarer Marken-Filter (eigener Marker-Layer; Popups XSS-sicher). Popup zeigt
  Marke/Filialname + Adresse (aus OSM-`addr:*`) + „In Google Maps öffnen" → Route
  `geo/place-link`: mit `GOOGLE_MAPS_API_KEY` exakte Filiale (Places-API „Text Search",
  **nur** `places.id` = kostenlose IDs-only-SKU → `query_place_id`). Wichtig:
  `rankPreference=DISTANCE` (nächstgelegener Ort zu den Koordinaten, **nicht** der
  prominenteste) + optionaler `type` (whitelisted: `convenience_store` → keine Lawson-Bank-
  ATMs; `lodging` → Hotels). Ohne Key/ohne Treffer keyfreier, koordinaten-zentrierter
  Fallback. Leitet immer per Redirect weiter, nie JSON-Fehler. **Dieselbe Route nutzen auch
  die Hotel- (`type=lodging`) und Stopp-Links (ohne Typ) im Reiseplaner** (`placeLinkUrl`),
  damit auch sie genau den gemeinten Ort statt einer Namensliste öffnen.
- **Regenradar-Overlay** (Schalter): jüngstes RainViewer-Radarbild als halbtransparente
  Kachel-Ebene über der Karte (keyfrei, eigener `TileLayer`).
- Stopps + Unterkünfte in der **DB** pro Reise (`TripStop`/`TripHotel`, PUT-Replace;
  `from-text` hängt einen einzelnen geocodeten Ort an).
- **`TripStop.active`** (Bool, Default true): Häkchen „in Route" pro Stopp. Nur aktive
  Stopps werden nummeriert, auf der Karte gezeigt, geroutet und in die Zugverbindungen
  einbezogen; abgewählte bleiben gespeichert (z. B. teamLab für später), erscheinen
  abgeblendet in der Liste. `computeRoute` sortiert nur die aktiven, hängt inaktive hinten an.
- **Listen-Import** (eigener Tab „📋 Import") mit **Vorschau-Workflow**: Textfeld (eine Zeile
  = ein Ort/Maps-Link) → „Auflösen" löst jede Zeile per `geo/resolve` auf (sequenziell, schont
  Nominatim) und legt Treffer in eine **Vorschau-Liste** (`importCandidates`, noch NICHT in den
  Stopps); nicht erkannte Zeilen bleiben zur Korrektur im Feld. In der Vorschau kann man Orte
  einzeln entfernen, dann **„→ In die Stopps übernehmen"** (`commitCandidates`, Limit 200,
  wechselt danach zur Karte). Ein einzelner Google-Maps-**Listen**-Link lässt sich mangels API
  nicht aufklappen — nur die Einzel-Orte/-Links.
- **Datei-Import** (`parsePlacesFile`, rein clientseitig): **CSV** (Google-Takeout
  „Gespeicherte Orte" → Name/Link → ins Textfeld zum Auflösen), **GeoJSON** (Takeout), **KML**
  (Google My Maps) und **GPX**. Formate mit Koordinaten (GeoJSON/KML/GPX) landen **direkt in
  der Vorschau-Liste** (kein Geocoding). Format-Erkennung aus Endung bzw. Inhalt (`{`/`<`).
  KMZ (gezippt) wird nicht unterstützt.

### Flüge (`/fluege`)

`FlightPlanner.tsx`. Auto-Abruf `GET /api/v1/flights/lookup?number=&date=` via
**AeroDataBox** (nur mit `AERODATABOX_API_KEY`, sonst 422 → manuell). Es wird die
Instanz mit **passendem Abflugdatum** gewählt (AeroDataBox liefert für ein Datum oft
zwei). Preis (€/¥, clientseitig nach Yen) → verknüpfte **Ausgabe** (Kategorie TRANSPORT),
Update/Delete synchron (Cascade). **Sitzplätze** (`Flight.seats`) werden fett aufs
Dashboard gespiegelt.
- **Live-Status** `GET /api/v1/flights/live?number=&date=` (AeroDataBox, 120 s gecacht,
  60/h): Status/Verspätung, Abflug-Terminal/Check-in/Gate, Ankunft-Terminal/Gate/**Kofferband**.
  `FlightLiveStatus.tsx` (Auto-Refresh 90 s), pro Flug im Modul aufklappbar (am Abreisetag
  automatisch offen); `FlightDayStatus.tsx` zeigt „Heute unterwegs" auf dem Dashboard nur
  zwischen Ab- und Ankunftstag.
- ⚠️ Gate/Check-in/Kofferband werden von AeroDataBox erst **wenige Stunden vor Abflug** belegt.

### Geld-Bereich (`/geld`, Tabs)

- **Ausgabenrechner** (`ExpenseCalculator.tsx`): Yen→Euro live via `GET /api/v1/fx/rate`
  (open.er-api.com, keyfrei). Kategorien (`src/lib/expenses.ts`) + Budget + Donut + Zahler +
  „auf alle aufteilen" + Beleg-Foto.
  ⚠️ **„Auf alle aufteilen" ist standardmäßig AUS** und wird nach jedem Eintrag
  zurückgesetzt (`setShared(false)` in `addItem`) — der Haken muss aktiv gesetzt
  werden. Bliebe er stehen, ginge die nächste, persönliche Ausgabe still an alle;
  das fällt erst in der Abrechnung auf. Ein Klick zu viel ist der billigere Fehler.
  Der Prisma-Default `Expense.shared = true` bleibt davon unberührt — er gilt für
  Zeilen **ohne** das Feld, also die gekoppelten Flug- und Buchungsausgaben.
  ⚠️ Der Block „Bezahlt von" + „Auf alle aufteilen" rendert nur bei
  `members.length > 1`. Tests, die ihn anfassen, brauchen ein zweites `TripMember`. **Beleg-Scan** „📸 Beleg scannen" → `POST /api/v1/expenses/scan`
  (Cloud Vision) liest ¥-Betrag/Kategorie/Label (auch japanische Belege) → Formular-Prefill,
  Foto beim Speichern automatisch angehängt. Ohne Key → 422 → manuell.
  ⚠️ **Das Monatskontingent ist die einzige Kostenbremse in der App.** Die Grenzen
  30/h pro Nutzer und 40/Tag pro Reise sind *lokal* — sie bremsen Einzelne, nicht die
  Summe. Das Gratis-Kontingent hängt aber am **Google-Projekt**: alle Reisen zahlen auf
  denselben Zähler ein, und schon eine einzige Reise dürfte rechnerisch 1.200
  Bilder/Monat verbrauchen. Über 1.000 hört Google nicht auf, sondern **rechnet ab**
  (Cloud Vision setzt ein aktives Rechnungskonto voraus); die Quota-Einstellung in der
  Cloud begrenzt nur Aufrufe pro **Minute**. Deshalb `VISION_MONTHLY_LIMIT`
  (Default 950), gezählt unter dem Schlüssel `vision-quota:YYYY-MM`.
  ⚠️ Der Schlüssel trägt den **Kalendermonat**, kein rollierendes 30-Tage-Fenster:
  liefe das Fenster Mitte des Monats ab, ließe es im selben Kalendermonat fast das
  Doppelte durch — und Google rechnet pro Kalendermonat ab.
  ⚠️ Gezählt wird **unmittelbar vor** dem Vision-Aufruf, nicht am Anfang des Handlers:
  falsches Format oder zu großes Bild kostet nichts und darf das Kontingent nicht
  schmälern. Umgekehrt steht die **Rechteprüfung ganz vorn**, damit ein Unberechtigter
  nicht mit abgewiesenen Aufrufen fremdes Budget leert.
  ⚠️ Zweite, von der App unabhängige Bremse: ein **Budget-Alarm in der Google Cloud**.
  Der greift auch, wenn hier etwas schiefgeht. Test: `e2e/scan-quota.mjs`.
  **„📷 Nur Foto"** neben dem Scan-Knopf hängt den Beleg an, **ohne** Vision
  aufzurufen (`attachPhotoOnly` → `pendingReceipt`, derselbe Weg wie beim Scan).
  Zwei Gründe: wer den Betrag ohnehin vor sich hat, spart ein Bild vom
  Monatskontingent — und wer `canAiScan` nicht hat, kann seinen Beleg trotzdem
  dokumentieren. Sichtbar mit `canReceiptPhoto`, also ohne Scan-Recht **an Stelle**
  des Scan-Knopfes.
  ⚠️ Schlägt der Scan fehl (Kontingent, kein Key, unlesbar), behält das Formular das
  **Foto** und hängt es beim Speichern an. Es nach der Fehlermeldung ein zweites Mal
  zu verlangen wäre die eigentliche Zumutung.
  ⚠️ **Die Antwort ist ein Vorschlag, keine Wahrheit.** `source` (`total` |
  `taxIncluded` | `subtotal` | `guess`) sagt, wie belastbar der Betrag ist; bei
  `subtotal`/`guess` bzw. `yen = 0` zeigt das Formular einen Prüfhinweis
  (`scanNoteFor`). `category` bleibt **weg**, wenn nichts sicher passt — eine
  falsch überschriebene Kategorie fällt erst in der Auswertung auf.

  **Betragszuordnung (`src/lib/receipt.ts`, reine Funktionen):** Vision liefert nur *Text* —
  welche Zahl die Summe ist, entscheidet dieses Modul. Zentrale Falle japanischer Belege:
  der **größte** Betrag ist meist **お預り** (hingelegtes Geld), darunter steht **お釣り**
  (Wechselgeld) — „größte Zahl gewinnt" greift also systematisch den Schein ab. Deshalb
  Gewichtung nach Schlüsselwörtern (合計/総計/お支払 → `total`, 税込 → `taxIncluded`,
  小計/計 → `subtotal`, sonst Rateschritt) und harter Ausschluss jeder Zeile mit 預/釣/
  ポイント/残高/TEL.
  ⚠️ **Zeilen kommen aus den Wortkoordinaten** (`rowsFromWords`), nicht aus
  `fullTextAnnotation.text`: bei zweispaltigen Belegen liefert die OCR gern erst alle
  Beschriftungen und dann alle Werte — „合計" stünde ohne Zahl da und der Rateschritt
  griffe das hingelegte Geld. Messbar in `e2e/receipt-parse.ts` (Leserichtung ¥2.000 vs.
  Koordinaten ¥1.274).
  ⚠️ **OCR-Leerzeichen tilgen** (`tightenJapanese`): Vision zerlegt japanischen Text in
  Wörter, beim Zusammensetzen entsteht „セブン - イレブン". Japanisch setzt keine
  Wortabstände — ohne diesen Schritt greift **kein** Markenmuster (real aufgetreten).
  **Kategorie automatisch (drei Stufen, `categoryFrom` sagt welche):**
  Vokabular deckt **neun** Kategorien ab; `KOSMETIK` (Drogerie: マツモトキヨシ/ツルハ/
  薬局, 化粧水, 日焼け止め…), `ELEKTRONIK` (ヨドバシ/ビックカメラ/家電, イヤホン,
  充電器…) und `UNTERKUNFT` (ホテル/旅館/宿泊, HOTEL/RYOKAN/INN) kamen später dazu.
  ⚠️ ヨドバシ/ビックカメラ standen vorher als **Gemischtwarenladen mit Gewicht 1** in der
  Liste und verloren damit gegen jeden beliebigen Artikelbegriff — es sind
  Elektronik-Fachmärkte und gehören auf Gewicht 3.
  1. `keywords` — Punktesystem in `guessMeta` über **Marken *und* Artikelbegriffe**
     (Gewicht: Fachgeschäft 3 > Artikel 2 > Gemischtwarenladen 1). Die Gewichte sind
     inhaltlich begründet: ein T-Shirt-Beleg von Don Quijote ist Kleidung, nicht
     „Sonstiges" — mit gleichem Gewicht gäbe es Gleichstand und damit **keine**
     Kategorie. Artikelbegriffe sind der wichtigere Teil: der Ladenname steht einmal
     auf dem Zettel, die Artikel zeilenweise. Punkte statt `find()`, weil Letzteres
     an der **Reihenfolge** der Liste hing — ein eingefügtes Muster verschob unbemerkt
     Ergebnisse.
  2. `history` — greift nur, wenn 1. nichts findet: `categoryForLabel()`
     (`services/expensesService.ts`) sucht in der Reise nach derselben Bezeichnung und
     übernimmt die **häufigste** dort vergebene Kategorie (nicht die erste — eine alte
     Fehlzuordnung soll nicht alle künftigen Scans verderben). Der Abgleich läuft über
     den Namen, weil der beim Scan aus demselben OCR-Pfad kommt wie beim ersten Mal;
     verglichen wird ohne Leerzeichen/Groß-Kleinschreibung. **Damit lernt der Scan
     unbekannte Läden ab dem zweiten Beleg — ohne API, ohne Kosten.**
  ⚠️ **Teilwort-Kollisionen sind hier die Hauptfehlerquelle** — sie sind im Code nicht
  zu sehen, nur im Ergebnis. Real aufgetreten: `パン` (Brot) steckt in „ジャ**パン**"
  → jeder JAPAN RAIL PASS wurde „Essen"; `水` (Wasser) ist die Abkürzung für
  **Mittwoch** und steht in „2026年8月19日**(水)**" auf jedem an einem Mittwoch
  gedruckten Beleg; `TEL` traf „HO**TEL**" im Namens-Rauschfilter und verwarf
  ausgerechnet die Zeile mit dem Ladennamen. Daraus zwei Regeln:
  **(a)** japanische Begriffe unter drei Zeichen nur mit eindeutiger Variante
  (`食パン` statt `パン`) oder Negativ-Lookahead (`バス(?!タオル|ケット…)`);
  **(b)** lateinische Muster tragen `\b` und werden über `on: "text"` gegen den Text
  **mit** Leerzeichen geprüft — auf dem lückenlosen `compact` gibt es keine Wortgrenzen.
  ⚠️ **Kollisionen gibt es auch *zwischen* Kategorien — und dort erzeugen sie keinen
  falschen Treffer, sondern einen Gleichstand, also gar keine Kategorie.** Beim Einbau von
  KOSMETIK trat das sofort auf: `入浴` (Baden → Sightseeing) steckt in `入浴剤`
  (Badezusatz aus der Drogerie), 2:2 → „Sonstiges". Der Sightseeing-Begriff heißt deshalb
  jetzt `入浴料` (Badegebühr). Neue Begriffe also gegen **alle** Listen prüfen, nicht nur
  gegen die eigene.
  ⚠️ Tourismus-Belege sind oft **englisch** (JR-Pass-Voucher, Museum, Hotel). Das
  Vokabular deckt beide Sprachen ab; wer nur japanisch ergänzt, lässt die Hälfte liegen.
  3. `fallback` — **`SONSTIGES`**, wenn 1. und 2. nichts ergeben (auch bei
     Gleichstand). ⚠️ Das ist wichtiger, als es aussieht: das Formular ist auf
     **`ESSEN`** voreingestellt (`ExpenseCalculator.tsx`), „Feld nicht überschreiben"
     hieß in der Praxis also „bleibt Essen" — ein unbekannter Beleg wurde still zu
     Essen. `SONSTIGES` benennt das Nichtwissen, statt es zu verstecken, und das
     Formular zeigt dazu „Kategorie unklar" (`scanNoteFor`).
  ⚠️ Die Entscheidung sitzt in der **Route** (`withCategory`), nicht in `guessMeta`:
  das Modul bleibt bei „unbekannt = `undefined`" und damit ohne Netz prüfbar; welche
  Kategorie ein unbekannter Beleg bekommt, ist eine Produktfrage und gehört an **eine**
  Stelle. Die Parser-Tests erwarten deshalb weiter `undefined`.
  Prüfskripte: `e2e/receipt-parse.ts` (Parser ohne Netz, via
  `node --experimental-strip-types`) und `e2e/receipt-scan.mjs` (Ende-zu-Ende mit
  gerendertem Beleg gegen die echte Vision-API, 1 Bild pro Lauf).
  **Kategorie nachträglich änderbar:** die farbige Pille in der Liste öffnet eine
  Auswahl (`PATCH /api/v1/expenses/{id}` mit `{ category }`) — optimistisch mit
  **Rücknahme** im Fehlerfall, weil Donut, Summen und Zollrechner auf der Liste
  aufbauen und nicht etwas anderes zeigen dürfen als die DB hält.
  ⚠️ **Das `<select>` liegt unsichtbar (`opacity-0`, `absolute inset-0`) über der Pille,
  die den Text selbst trägt.** Ein sichtbares `<select>` ist immer so breit wie seine
  **längste** Option — damit waren alle Pillen auf „Sightseeing"-Breite (81 px) und
  „Essen" hatte eine große Leerstelle. So folgt die Breite dem gewählten Text
  (Essen 52 px), und nativer Auswahldialog, Tastatur und Screenreader bleiben erhalten;
  den Fokus zeichnet `focus-within` auf der Pille nach. Messung in
  `e2e/expense-category.mjs`.
  ⚠️ Im PATCH-Rumpf ist `receipt` `nullable` **und** `optional`, und der Unterschied
  trägt Bedeutung: `null` = Beleg entfernen, fehlend = Beleg nicht anfassen. Ohne die
  Trennung löschte ein reiner Kategorie-Wechsel das Beleg-Foto mit. Test dafür:
  `e2e/expense-category.mjs`.
  ⚠️ Das Rate-Limit (`expense-receipt`, 120/h) greift **nur**, wenn `receipt` im Rumpf
  steht — sonst verbrauchte das Umsortieren der Liste das Budget für Beleg-Uploads.
  ⚠️ Gekoppelte Ausgaben: bei **Flügen** bleibt eine manuell gesetzte Kategorie
  erhalten (der `update`-Zweig in `flightsService.ts` schreibt sie nicht), bei
  **Buchungen** wird sie beim nächsten Bearbeiten der Buchung auf die aus `kind`
  abgeleitete zurückgesetzt (`bookingsService.ts:64`).
- **Abrechnung** (`Abrechnung.tsx`): wer-schuldet-wem (Gleichteilung, greedy), „Bezahlt"
  markieren (`Settlement`).
- **Zollrechner** (`CustomsCalculator.tsx`): dt. Reisezoll — Freimenge 430 €/Person,
  Pauschalsatz 17,5 % **nur bis 700 € Warenwert/Person** (nicht nach Abzug der Freimenge!),
  darüber zwingend reguläre Verzollung (Zoll je Warenart + 19 % EUSt). „Aus Ausgaben
  übernehmen" gruppiert die Waren je Kategorie (Figuren 0 % / Kleidung 12 % / Sonstiges ≈4 %)
  und verzollt **pro Warenart**; die Freimenge wird zugunsten des Reisenden zuerst auf die
  höchstverzollten Waren angerechnet. Rein rechnerisch (keine DB).
  ⚠️ **`GOODS_DUTY` entscheidet, was überhaupt zollrelevant ist** — wer dort fehlt, ist für
  den Zoll unsichtbar, wer zu Unrecht drinsteht, wird verzollt. Beides sieht man im Ergebnis
  nicht, weil nur die Summe dasteht. Drin: Figuren 0 % · **Elektronik 0 %** ·
  **Kosmetik/Drogerie 0 %** (Kapitel 30/33 sind zollfrei, EUSt fällt trotzdem an) ·
  Kleidung 12 % · Sonstiges ≈4 %. Draußen: Essen, Sightseeing, Transport und
  **Unterkunft**. Genau dafür gibt es `UNTERKUNFT`: Hotelrechnungen landeten vorher in
  „Sonstiges" und wurden als Ware zu ≈4 % verzollt — bei zwei Wochen Japan der größte
  Einzelposten. Test: `e2e/expense-categories-zoll.mjs`.
- **Wunschliste** (`Wunschliste.tsx`): Einkaufs-/Souvenirliste (¥, gekauft-Haken); Summe → Zoll.

### Tagesplaner → Reiseplaner

Aufgabentext per Knopf zu einem Ort auflösen (`POST /api/v1/trip-stops/from-text` →
`geocodeJapan`, Nominatim/Japan) und als Stopp anhängen. „teamLab Planets" → Ort;
Freitext ohne Ort → 422. (Tagesplaner liegt im **Programm**-Tab-Bereich.)

### Programm-Bereich (`/programm`, Tabs)

`ProgrammTabs.tsx`: **Reiseablauf** (SSR-Timeline `AblaufTimeline.tsx` — führt Flüge/Stopps/
Aufgaben/Buchungen tag-für-tag zusammen, wird als Server-Node in den Client-Tab gereicht) ·
**Tagesplaner** · **Buchungen/Tickets** (`BookingPlanner.tsx`; Preis → Ausgabe, Zeitkonflikt-
Warnung) · **Checkliste** (Japan-Vorlage, Zuweisung).

### Info-Bereich (`/info`, Tabs)

`InfoTabs.tsx`: **Übersicht** · **Wetter** (Open-Meteo, `GET /api/v1/weather`) · **Stempel** ·
**Koffer** · **Notfall & Basics**.
- **Eki-Stamp-Album** (`EkiStampAlbum.tsx`): 16 Orte (Katalog `src/lib/ekiStamps.ts`).
  „Stempel hier sammeln" → Browser-Geolocation → `POST /api/v1/stamps/collect` schaltet frei,
  wenn man im Umkreis eines Katalog-Orts steht (sonst 422 mit Distanz). Gesammelt = Hanko-Rot,
  pro Reise geteilt, taucht im Aktivitäts-Feed auf.
- **Notfall & Basics** (`NotfallInfo.tsx`): statisch — Notrufe (110/119, JNTO), dt.
  Vertretungen (`tel:`), Tax-Free/Strom/Bargeld/kein-Trinkgeld, wichtige Sätze (JA + Umschrift).

### Kofferretter (QR) — `/info?tab=koffer` + öffentliche Seite `/k/[token]`

`KofferManager.tsx`: pro Koffer ein `LuggageTag` mit QR-Code (`qrcode`, herunterladbar). Findet
jemand den Koffer & scannt, landet er auf `/k/[token]` (`LuggageFinder.tsx`, **öffentlich**,
dreisprachig DE/EN/日本語 nach Browser-Sprache + Umschalter). **Vor** dem „Standort teilen"-
Button steht optional der Direktkontakt (WhatsApp-`wa.me` + `contact` als mailto/tel), falls man
den Standort nicht teilen möchte. Standort teilen → `POST /api/v1/luggage/found/[token]`
(public, ratenlimitiert) benachrichtigt den Owner per **E-Mail** (SMTP) + **Discord**
(`DISCORD_WEBHOOK_URL`). Der Finder sieht **nie** die `notifyEmail`.

### Start-Dashboard

`TripDashboard.tsx` (Countdown/Als-Nächstes/Ausgaben/Checkliste), `ActivityFeed.tsx` („Zuletzt
im Team", `GET /api/v1/activity`), `FlightDayStatus.tsx` (Live-Flug am Reisetag), `JapanClock.tsx`
(Live-Uhr 🇯🇵 Japan + 🇩🇪 Deutschland mit Zeitdifferenz; kompakt in der TopNav, volle Karte auf
`/start`).

### Branding (Clover Japan)

Eigenes Corporate Design, alle Assets **self-hosted** (kein CDN-Runtime-Fetch):
- **Fonts:** Viga (Headings) + PT Sans (Body) als `@font-face` in `globals.css`, `public/fonts/`.
- **Farben:** Tailwind-v4-`@theme`-Tokens → `brand` (`#009BC9`), `brand-lift` (`#00B0E2`,
  obere Kante von CTA-Verläufen), `brand-dark` (`#0A314C`), `brand-tint` (`#B9E7F7`),
  `accent` (`#F87805`), `danger` (`#E2001A`).

#### Design-System: semantische Tokens + UI-Primitives

Oberflächen werden **nicht** mehr pro Komponente als Klassen-String gebaut (vorher 51-mal
`rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 …`).
Zwei Ebenen, beide kanonisch:

1. **Semantische Tokens** (`src/app/globals.css`): `page` · `surface` · `surface-2` ·
   `hairline` · `ink` · `ink-muted` · `ink-subtle`, dazu `rounded-card`/`rounded-field` und
   `shadow-card`/`shadow-card-hover`/`shadow-pop`. Im `@theme` stehen die **Light**-Werte,
   ein **unlayered** `:root:where(.dark)`-Block überschreibt dieselben Variablen.
   → Neue UI braucht für Flächen/Linien/Text **keine `dark:`-Zwillinge** mehr; nur farbige
   Bedeutungsträger (Status-Chips) bleiben explizit.
   ⚠️ `--color-x: var(--y)` im `@theme` funktioniert **nicht** zum Umschalten: Custom
   Properties werden am deklarierenden Element ersetzt, `.dark` käme zu spät. Deshalb sind
   beide Themes eigene Deklarationen.
2. **Bereichs-Symbole** (`src/lib/sectionIcons.ts` + `ui/SectionIcon.tsx`): die 24 Symbole
   von Start-Kacheln, den vier Tab-Leisten und dem Mobile-Menü stehen **an einer** Stelle
   (vorher als Emoji-Literale in sechs Dateien verteilt). `<SectionIcon id="geld" />` rendert
   das eigene Bild des Nutzers, sonst das Emoji. `TabBar`-Items tragen deshalb `icon: SectionId`,
   kein Emoji. Der `SectionIconProvider` steckt im `(app)`-Layout — weil er eine Client-
   Komponente ist, können auch Server Components (Start-Kacheln) `SectionIcon` verwenden.
3. **Primitives** (`src/components/ui/`): `Card`/`CardLink`/`CardLabel` · `Button`
   (+`buttonClasses`) · `Input`/`Textarea`/`Select`/`Label` (+`fieldClasses`) · `Chip` ·
   `TabBar`. Alle nehmen `className` als Escape-Hatch.
   Für bestehende `<button>`/`<input>`-Elemente, die ihre eigenen Props/ARIA behalten
   sollen, gibt es die **Rezepturen** `buttonClasses(variant, size, extra)` und
   `fieldClasses` — dieselbe Quelle, ohne die Elemente austauschen zu müssen.
   Knöpfe gibt es nur noch in **zwei** Größen (`sm`/`md`); vorher waren sechs
   Padding-Varianten im Umlauf.

⚠️ **`cn()` (`src/lib/cn.ts`) muss `tailwind-merge` benutzen** — nicht bloß Strings
verketten. Bei reiner Verkettung entscheidet die Reihenfolge im *generierten Stylesheet*,
nicht die im Attribut: `cn(FIELD, "w-24")` ließ `w-full` aus der Basis gewinnen (Feld auf
Vollbreite), `py-1.5` gegen die `py-2`-Basis blieb wirkungslos. Solche Fehler sind nur im
Bild zu sehen, nicht im Code.

**Stand:** vollständig umgestellt — alle Ansichten, Auth-Seiten und die öffentliche
Kofferfinder-Seite. Alle vier Tab-Leisten (`/geld`, `/programm`, `/info` **und** der interne
Umschalter im Reiseplaner) nutzen `TabBar`; `slate-*` kommt im Code nicht mehr vor.

⚠️ **Vier Stellen behalten bewusst harte Farben** — dort liegt ein fester heller Grund
darunter, ein `ink`-Token wäre im Dark-Mode hell auf hell:
- `ExpenseCalculator`: Kategorie-Chips (Hintergrund per `style={{backgroundColor}}`) und
  das Overlay über dem Beleg-Foto (`bg-white/90`),
- `TripPlanner`: der Adress-Text im Leaflet-Popup (Leaflet bringt eigenes Weiß mit),
- `KofferManager`: `bg-white` hinter dem QR-Bild — die helle Ruhezone ist nötig, sonst
  scannen Kameras den Code im Dark-Mode nicht,
- `BiometricLock`: der Sperrbildschirm ist absichtlich immer dunkel.

⚠️ Beim Nachziehen weiterer UI **nie** `` className={`extra ${recipe}`} `` schreiben —
Verkettung umgeht `twMerge`, dann entscheidet die Stylesheet-Reihenfolge. Immer
`cn(recipe, "extra")` bzw. `buttonClasses(v, s, "extra")`.
⚠️ **`fieldClasses` enthält `w-full`.** Steht ein Feld in einer Flex-Zeile neben Text,
muss die Aufrufstelle `w-auto` (oder eine feste Breite) mitgeben — `shrink-0` allein
hebt `w-full` **nicht** auf, `twMerge` sieht darin keinen Konflikt. Passiert war das
den Zuweisungs-Auswahlen in Checkliste und Tagesplaner: die Auswahl forderte die
ganze Zeile und konnte nicht nachgeben, der Textblock wurde auf wenige Pixel
gequetscht und brach nach jedem Wort um (nur auf schmalen Bildschirmen sichtbar).
Prüfskript für solche Fälle: `e2e/mobile-check.mjs` (Überlauf + gequetschte Spalten
über alle Hauptansichten in 390 px Breite).
⚠️ **`1fr` in einem Grid heißt `minmax(auto, 1fr)`, und dieses `auto` ist die
min-content-Breite des Inhalts** — die Spur schrumpft nie unter ihren breitesten Inhalt,
egal wie viel `truncate`/`min-w-0` *innerhalb* steht. Im Ausgabenrechner zog die längste
Bezeichnung einer Zeile die einspaltige Handy-Ansicht auf 426 px und schob die Seite 54 px
über den Rand. Fix: **`min-w-0` an den Rasterfeldern selbst** (bzw. `minmax(0,1fr)`).
⚠️ Dazu die Lücke im Prüfskript: `e2e/mobile-check.mjs` meldet das **nicht**, weil es mit
einem frischen Konto und damit **leeren Listen** misst. Überlauf entsteht aber gerade an
echten Daten. Wer eine Liste ändert, prüft sie **gefüllt** — so wie
`e2e/expense-categories-zoll.mjs` es tut.
⚠️ Die sticky TopNav braucht ein hohes `z-index` (`z-[1100]`): Leaflet setzt im Reiseplaner
interne Panes bis `z-index` 800 — bei `z-40` scrollte die Karte über die Leiste. Wer eine
eigene sticky Seitenleiste baut, rechnet die Leistenhöhe ein (`top-[4.75rem]`).
- **Logo/Favicon:** goldenes Japan-Motiv (Torii/Fuji/Kirschblüte/Shinkansen).
  `public/brand/japan-mark.png` (transparent, Header — `src/components/Logo.tsx` rendert es als
  `<img>`, **keine** CSS-Maske mehr) + `public/brand/japan-tile.png` (dunkle Kachel). Tab-/App-/
  PWA-Icons daraus: `src/app/{favicon.ico,icon.png,apple-icon.png}` + `public/icon-192/512.png`
  (via `sharp`). Icons kommen aus den **Datei-Konventionen** (kein `metadata.icons`).
- **Dark-Mode:** klassenbasiert (`@custom-variant dark …`), Umschalter `ThemeToggle.tsx`;
  Inline-Script im Root-Layout setzt `.dark` vor dem ersten Paint (kein FOUC).
  Neue farbige UI immer mit `dark:`-Variante.

Feste App-Zeitzone (MVP): `Europe/Berlin` (`APP_TIMEZONE`).

## Umgebungs-Variablen & Deployment (Vercel/Neon)

Der Vercel-Build wendet **Migrationen automatisch an** (`vercel.json`). Nach Code-Push
deployt Vercel neu; **Env-Änderungen greifen erst nach einem Redeploy** und müssen für die
**Production**-Umgebung gesetzt sein.

| Variable | Zweck | Pflicht? |
|---|---|---|
| `DATABASE_URL` / `DIRECT_URL` | Neon Pooled- / Direct-URL (Direct nur für `migrate deploy`) | **ja** (sonst Deploy-Fehler → nichts Neues live) |
| `AUTH_SECRET`, `AUTH_TRUST_HOST` | NextAuth | ja |
| `APP_URL`, `APP_TIMEZONE` | Basis-URL / Zeitzone | ja |
| `WEBAUTHN_RP_ID/ORIGIN/RP_NAME` | Passkeys (Prod = HTTPS) | für Passkeys |
| `SMTP_*` | E-Mail (Einladung/Verify/Reset, **Koffer-Fund**) | für Mailversand |
| `AERODATABOX_API_KEY` | Flüge Auto-Abruf **und** Live-Status | für Flug-Features |
| `GOOGLE_VISION_API_KEY` | **Beleg-Scan** (Cloud Vision OCR; gratis bis 1.000 Bilder/Monat, darüber kostenpflichtig). Eigener Key, **nicht** der Maps-Key | für Beleg-Scan |
| `VISION_MONTHLY_LIMIT` | Scans pro **Kalendermonat** über alle Nutzer (Default 950) | optional |
| `DISCORD_WEBHOOK_URL` | Discord-Push bei Koffer-Fund | optional |
| `CRON_SECRET` | schützt den täglichen Aufräum-Job `/api/v1/cron/cleanup` (Vercel-Cron); ohne Secret ist der Endpunkt gesperrt und alte RateLimit-/Token-/Challenge-Zeilen bleiben liegen | empfohlen |
| `GOOGLE_MAPS_API_KEY` | echte Zugverbindung statt Schätzung (**kostet**) + exakte Konbini-Filiale in Maps (Places-API IDs-only = **kostenlos**) | optional |

**Konbini/Overpass, Regenradar/RainViewer, Geocoding/Routing, Eki-Stamps, Wetter** sind
**keyfrei** — laufen ohne Env. Fehlt ein optionaler Key, gibt es einen sauberen Fallback
(422 „nicht konfiguriert" bzw. Schätzung), **kein** Crash.

## Demo-Daten & Zugänge

Seed (`prisma/seed.ts`) legt nur die 6 Demo-Nutzer an (bestätigt). Passwort: `password123`.

| Rolle    | E-Mail                |
|----------|-----------------------|
| Admin    | admin@clover.japan    |
| User     | manager@clover.japan  |
| User     | employee@clover.japan |
| User     | anna@clover.japan     |
| User     | ben@clover.japan      |
| User     | clara@clover.japan    |

## Arbeitsweise (projektspezifisch)

- **Best Practices, keine Workarounds** (siehe globale Anweisung). Ursachen beheben.
- Nach nicht-trivialen Änderungen: `npm run build` im Container grün halten, **danach
  `restart app`**, und den betroffenen Flow real durchspielen (gern headless per Playwright).

## Offen / Ideen

CSV/Export · Charts · Alkohol/Tabak-Mengengrenzen im Zollrechner · Ort-Vorschlag beim
Tippen im Tagesplaner · getrennte Preview-/Prod-DB bei Vercel · Nonce-basierte CSP (statt
`'unsafe-inline'`) · Beleg-Fotos in Object-Store (Vercel Blob) statt Data-URL.

**Verworfen:** Gepäck-Tracker via **Web Bluetooth** — im Web/iOS nicht umsetzbar (Safari
unterstützt Web Bluetooth nicht; billige Tracker verschlüsseln ihre IDs). Stattdessen der
**QR-Kofferretter** (s. o.).
