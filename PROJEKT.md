# CloverJapanPlaner — Gesamtübersicht

Alles Wichtige zum Projekt in einer Datei. Ergänzende Detail-Dokus:
`README.md` (Kurz-Start), `CLAUDE.md` (Architektur/Konventionen),
`CAPACITOR.md` (native App), `PLAYSTORE.md` (Play-Store-Schritte).

- **App-Name:** CloverJapanPlaner · **Homescreen-Name:** Clover Japan
- **Logo/Icon:** Kleeblatt (Silhouette als CSS-Maske, themenabhängig eingefärbt)

---

## 1. Was ist das?
Eine Web-App für die **gemeinsame Japan-Reise**, mobil installierbar (PWA) und als
native Android-App (Capacitor) vorbereitet. Mehrere eingeladene Mitglieder bearbeiten
eine gemeinsame Reise (Trip): Reiseplaner mit Karte, Flüge, Ausgaben (¥→€),
Zollrechner, Tagesplaner, Checkliste, Wetter und eine druckbare Reiseübersicht.
(Die ursprüngliche Arbeitszeiterfassung wurde entfernt; `ADMIN` verwaltet nur noch Nutzer.)

---

## 2. Tech-Stack
- **Next.js 15** (App Router; REST-API via Route Handlers, SSR-Reads) + **TypeScript** (strict)
- **Prisma** + **PostgreSQL 16**
- **Auth.js (NextAuth v5)**: Credentials + bcrypt (JWT-Sessions) **und Passkeys/WebAuthn**
- **Tailwind CSS v4**, **Zod**, **date-fns/date-fns-tz**
- **OpenAPI 3.1 + Swagger UI** (`@asteasolutions/zod-to-openapi`, `swagger-ui-dist`)
- **Karten:** Leaflet + OSM/Wikimedia-Tiles; Geocoding **Nominatim**, Routing **OSRM** (keyfrei)
- **Mobile:** PWA (Manifest + Service-Worker) und **Capacitor 6** (native Hülle) mit
  Fingerabdruck-Lock + Local Notifications
- **E-Mail:** nodemailer (SMTP, optional)
- **Tests:** Playwright (E2E, mobil)
- Läuft **vollständig in Docker** (kein Node auf dem Host nötig)

---

## 3. Funktionen (vollständig)

### Anmeldung & Konten
- **Login** (Passwort oder **Fingerabdruck/Passkey**).
- **Offene Selbst-Registrierung** (`/register`) mit **E-Mail-Verifikation** (`/verify`);
  **Passwort-Reset** (`/forgot` → `/reset`).
- **Admin** `/admin` (nur ADMIN): **Nutzerverwaltung** (anlegen, aktiv/inaktiv).

### Japan (gemeinsamer Reise-Workspace)
- **Reiseplaner** `/reiseplaner`:
  - Ort eingeben → **Geocoding** (Japan) → Marker auf **Leaflet-Karte** (romanisierte
    Labels; Marker tragen deutsch bevorzugten Namen).
  - **Beste Route** (OSRM-Trip, optimale Reihenfolge) als Linie + Distanz/Dauer.
  - **Zugverbindungen** je Etappe: echte Daten mit `GOOGLE_MAPS_API_KEY`, sonst
    **distanzbasierte Schätzung**; zusätzlich **„In Google Maps öffnen (ÖPNV)"**-Link
    (keyfrei, zeigt die volle Verbindung in Google Maps).
  - **Wetter** je Stopp; **Reisetag** je Stopp zuweisbar (erscheint im Tagesplaner).
  - **Ort aus Link/Text** einfügen (Google-Maps-Link → exakte Koordinaten; SSRF-geschützt).
- **Flüge** `/fluege`: per **Flugnummer** abrufen (AeroDataBox, optional) oder manuell;
  Flugdauer, Hin-/Rückflug-Erkennung, Preis fließt als Ausgabe (Transport) in den Rechner.
- **Ausgaben** `/ausgaben`: Beträge in **¥**, live nach **€**; Kategorien, **Budget-Bar**
  + **Donut**.
- **Zollrechner** `/zoll`: dt. Reisezoll (Freimenge, Pauschalsatz, EUSt).
- **Tagesplaner** `/tagesplaner`: Aufgaben je Tag, abhaken; **Erinnerung 1 h vorher**;
  Ort per Knopf in den Reiseplaner übernehmen; zeigt „Orte an diesem Tag".
- **Checkliste** `/checkliste` · **Wetter** `/wetter` (mehrere Städte + Vorhersage) ·
  **Reiseübersicht** `/uebersicht` (druckbar / als PDF).
- **Mitglieder** `/mitglieder`: **per E-Mail einladen** (14 Tage gültig). Konto-lose
  Person → Registrierungs-Link; **bestehendes Konto → muss die Einladung selbst
  bestätigen** („Einladungen an dich"). Jeder Eintrag zeigt **„von <Name>"**.

### App-weit
- **Übersicht/Start** `/start`: kategorisierte Kachel-Hub (Home = `/`).
- **Profil** `/profil`: **Profilbild** oder Initialen-Avatar; **Passkey einrichten**.
- **Dark/Light-Mode**, **Kleeblatt-Branding**, **Tokio-Wetter-Seitenleiste** (Desktop).
- **Obere Leiste**: Dropdowns **Japan** + **Mehr** (Admin/API-Doku).

---

## 4. REST-API & Swagger
- Frontend-**Mutationen ausschließlich** über `/api/v1/*`; **Reads** SSR über dieselbe
  Service-Schicht.
- Dokumentierte Ressourcen (OpenAPI): `me`, `users`. **Swagger UI:** `/api-docs`,
  Spec `/api/v1/openapi`.
- Weitere (utility, nicht in OpenAPI): `register`, `verify`, `password/forgot|reset`,
  `invite/[token]`, `geo/search|route|transit|weather|resolve`, `fx/rate`,
  `trip-stops` (+`from-text`), `expenses`, `flights` (+`[id]`, `lookup`),
  `planner-tasks`, `checklist`, `trip/members` (+`invitations`), `passkey/*`.
- Auth: NextAuth-Session-Cookie; Rollen-/Ownership-Checks in jedem Handler.

---

## 5. Datenmodell (Prisma)
`User` · `Credential` (Passkeys) · `Token` (Verify/Reset) · `RateLimit` ·
`Trip` · `TripMember` · `TripInvitation` · `TripStop` · `Expense` · `Flight` ·
`PlannerTask` · `ChecklistItem`.
- Japan-Tools hängen an einer **`Trip`**; Nutzer sind über `TripMember`
  (userId @unique) Mitglied genau einer Reise; Einträge tragen `createdByName`.
- `User.emailVerified` (null = Login gesperrt); `Expense.flightId` koppelt einen
  Flugpreis; `TripStop.date` = optionaler Reisetag; Flug-/Stopp-Zeiten UTC-naiv.

---

## 6. Mobile
- **PWA:** installierbar (`public/manifest.webmanifest`, Service-Worker `public/sw.js`,
  Kleeblatt-Icons). „Zum Homescreen hinzufügen" → App „Clover Japan".
- **Native Store-App (Capacitor):** WebView auf die gehostete App
  (`capacitor.config.ts` → `server.url`), da Server-App (kein statischer Export).
  - **Fingerabdruck-Lock** (`src/components/BiometricLock.tsx`): sperrt nativ beim
    Start/Resume; auf Web No-Op.
  - **Erinnerungen** als native OS-Benachrichtigungen.
  - Build **auf dem Host** in Android Studio/Xcode — siehe `CAPACITOR.md` / `PLAYSTORE.md`.

---

## 7. Setup & Befehle (Docker)
```bash
docker compose up -d db                                 # Postgres
docker compose run --rm app npm install                 # Deps (Container-Volume)
docker compose run --rm app npx prisma migrate dev       # Schema + Client
docker compose run --rm app npx prisma db seed           # Demo-Daten
docker compose up -d app                                 # → http://localhost:3000

docker compose logs -f app
docker compose run --rm app npm run build                # Prod-Build/Typecheck
docker compose exec app npx playwright test              # E2E (mobil)
```
**Wichtig:** Nach `prisma migrate/generate` den Dev-Server **neu starten**
(`docker compose restart app`) — sonst alter Prisma-Client im Speicher.

---

## 8. Umgebungsvariablen (`.env`)
| Variable | Zweck |
|---|---|
| `DATABASE_URL` | Postgres-Verbindung |
| `AUTH_SECRET`, `AUTH_TRUST_HOST` | NextAuth (Prod: `openssl rand -base64 32`) |
| `APP_TIMEZONE` | App-Zeitzone (Europe/Berlin) |
| `WEBAUTHN_RP_ID/ORIGIN/RP_NAME` | Passkeys (Prod = HTTPS-Domain) |
| `GOOGLE_MAPS_API_KEY` | optional: echte Zugverbindungen |
| `AERODATABOX_API_KEY` | optional: automatischer Flug-Abruf per Flugnummer |
| `SMTP_HOST/PORT/SECURE/USER/PASS/FROM`, `APP_URL` | E-Mails (Einladung/Verifikation/Reset) |
| `CAP_SERVER_URL` | Capacitor: URL der gehosteten App |

---

## 9. Tests (Playwright)
- Einmalig: `docker compose exec app npx playwright install --with-deps chromium`.
- `docker compose exec app npx playwright test` → prüft mobil: Login-Render (kein
  Overflow), Manifest+Icons (installierbar), Service-Worker, Login+Navigation.

---

## 10. Demo-Zugänge (Passwort `password123`)
Seed legt 6 bestätigte, aktive Nutzer an: `admin@`, `manager@`, `employee@`,
`anna@`, `ben@`, `clara@clover.japan`.

---

## 11. Ehrliche Grenzen / offene Punkte
- **Native Build/Store-Upload** (Android Studio/Xcode), **Fingerabdruck-Prompt** und
  **Installations-Dialog** laufen nur auf deinem Gerät — nicht in dieser Umgebung
  testbar.
- **Produktion braucht HTTPS-Hosting** (für Passkeys, PWA und die Capacitor-URL).
- **Selbst-Registrierung** ist offen (jeder mit der URL) — mit E-Mail-Verifikation;
  Einladungen sind **14 Tage** gültig, bestehende Konten bestätigen selbst.
- **E-Mail-Versand** nur mit konfiguriertem SMTP — ohne SMTP wird der Registrierungs-/
  Verify-Link in der App/Antwort angezeigt (kopieren & selbst teilen).
- **Flug-Auto-Abruf** nur mit `AERODATABOX_API_KEY` (sonst manuelle Eingabe).
- **Web-Erinnerungen** feuern nur bei offener App; „auch geschlossen" nur nativ.
- Karten-Tile-Labels für Japan sind **romanisiert** (kein vollständiges Deutsch —
  fehlende `name:de`-Daten).
- Trip-Tools/geo/fx/weather-Endpunkte sind **nicht in Swagger** registriert.
- `createdByName` ist ein **Namens-Schnappschuss** (aktualisiert sich nicht bei
  Umbenennung).

---

## 12. Nächste sinnvolle Schritte (Vorschläge)
- **Prod-Deployment** (Dockerfile prod + Caddy/nginx mit HTTPS) → dann läuft die
  Store-App und die `server.url` steht.
- Trip-Endpunkte in **OpenAPI/Swagger** aufnehmen.
- App-Icon/Splash via `@capacitor/assets` aus `public/icon-512.png`.
