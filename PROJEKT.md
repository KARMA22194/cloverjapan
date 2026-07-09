# CloverJapanPlaner — Gesamtübersicht

Alles Wichtige zum Projekt in einer Datei. Ergänzende Detail-Dokus:
`README.md` (Kurz-Start), `CLAUDE.md` (Architektur/Konventionen),
`CAPACITOR.md` (native App), `PLAYSTORE.md` (Play-Store-Schritte).

- **App-Name:** CloverJapanPlaner · **Homescreen-Name:** Clover Japan
- **Logo/Icon:** Kleeblatt (Silhouette als CSS-Maske, themenabhängig eingefärbt)

---

## 1. Was ist das?
Eine Web-App mit zwei Bereichen, mobil installierbar (PWA) und als native
Android-App (Capacitor) vorbereitet:

1. **Timetracker** — Arbeitszeiterfassung (Login, Buchen auf Projekte, Auswertung
   Tag/Monat/Jahr/Kalender).
2. **Japan** — gemeinsamer Reise-Workspace (Reiseplaner mit Karte, Ausgabenrechner,
   Tagesplaner, Checkliste), den mehrere eingeladene Mitglieder zusammen bearbeiten.

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

### Timetracker
- **Login** (Passwort oder **Fingerabdruck/Passkey**).
- **Tagesansicht** `/day/[date]`: Zeiten erfassen/bearbeiten/löschen, Tagessumme,
  **Live-Timer** (Start/Stop → bucht die Dauer), **Notizen** (Google-Keep-Stil).
- **Monat** `/month`, **Jahr** `/year`: Matrix Tag/Monat × Projekt mit Summen,
  **CSV-Export**.
- **Kalender** `/calendar`: Monatsraster, Tagessumme als Heatmap, Notiztage in
  Kategorie-Farbe + Vorschau, **Farb-Legende**; Klick → Tagesansicht.
- **Notizen** mit **Kategorien** (Arbeit/Schule/Urlaub/Wochenende) — Kategorie färbt
  die Karte; **automatisch nach Wochentag** (Sa/So→Wochenende, Mo→Schule, Di in
  gerader KW→Schule, sonst Arbeit).
- **Admin** `/admin` (nur ADMIN): Projekte + Mitarbeiter verwalten.

### Japan (gemeinsamer Reise-Workspace)
- **Reiseplaner** `/reiseplaner`:
  - Ort eingeben → **Geocoding** (Japan) → Marker auf **Leaflet-Karte** (romanisierte
    Labels; Marker tragen deutsch bevorzugten Namen).
  - **Beste Route** (OSRM-Trip, optimale Reihenfolge) als Linie + Distanz/Dauer.
  - **Zugverbindungen** je Etappe (mit Umstieg-Umschalter): echte Daten mit
    `GOOGLE_MAPS_API_KEY`, sonst **distanzbasierte Schätzung**; Button „In Rechner".
  - **Wetter** je Stopp (Open-Meteo, keyfrei).
  - **Ort aus Link/Text** einfügen (Google-Maps-Link → exakte Koordinaten; Text/Caption
    → Geocoding). *Instagram-Videos liefern keinen auslesbaren Standort.*
- **Ausgaben** `/ausgaben`: Beträge in **¥**, live nach **€**; Kategorien mit Summen;
  **Budget-Bar** + **Donut**-Auswertung; Zugfahrten landen als „Transport" hier.
- **Tagesplaner** `/tagesplaner`: Aufgaben je Tag (Uhrzeit + Text), abhaken;
  **Erinnerung 1 h vorher** (nativ auch bei geschlossener App; Web solange offen).
- **Checkliste** `/checkliste`: eigene Punkte, abhaken, „Erledigte löschen".
- **Mitglieder** `/mitglieder`: Leute **per E-Mail einladen** (bestehendes Konto);
  alle bearbeiten die Japan-Tools gemeinsam. Jeder Eintrag zeigt **„von <Name>"**.

### App-weit
- **Übersicht/Start** `/start`: kategorisierte Kachel-Hub (Home = `/`).
- **Profil** `/profil`: **Profilbild** (Upload → 128×128) oder Initialen-Avatar;
  **Passkey einrichten**.
- **Dark/Light-Mode** (Umschalter, kein FOUC), **Kleeblatt-Branding**.
- **Obere Leiste**: Kategorien als Dropdowns (Timetracker/Japan); aktiver Link
  hervorgehoben.

---

## 4. REST-API & Swagger
- Frontend-**Mutationen ausschließlich** über `/api/v1/*`; **Reads** SSR über dieselbe
  Service-Schicht.
- Dokumentierte Ressourcen (OpenAPI): `me`, `time-entries`, `projects`, `users`,
  `reports/month|year`, `notes`. **Swagger UI:** `/api-docs`, Spec `/api/v1/openapi`.
- Weitere (utility, nicht in OpenAPI): `geo/search|route|transit|weather|resolve`,
  `fx/rate`, `trip-stops`, `expenses`, `planner-tasks`, `checklist`, `trip/members`,
  `passkey/*`.
- Auth: NextAuth-Session-Cookie; Rollen-/Ownership-Checks in jedem Handler.

---

## 5. Datenmodell (Prisma)
`User` · `Project` · `Assignment` · `TimeEntry` · `Note` · `Credential` (Passkeys) ·
`Trip` · `TripMember` · `TripStop` · `Expense` · `PlannerTask` · `ChecklistItem`.
- Zeiten: `minutes` als Int, `date` als `@db.Date` (zeitzonenfeste Aggregation).
- Japan-Tools hängen an einer **`Trip`**; Nutzer sind über `TripMember`
  (userId @unique) Mitglied genau einer Reise; Einträge tragen `createdByName`.

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
| `SMTP_HOST/PORT/SECURE/USER/PASS/FROM`, `APP_URL` | optional: Einladungs-E-Mails |
| `CAP_SERVER_URL` | Capacitor: URL der gehosteten App |

---

## 9. Tests (Playwright)
- Einmalig: `docker compose exec app npx playwright install --with-deps chromium`.
- `docker compose exec app npx playwright test` → prüft mobil: Login-Render (kein
  Overflow), Manifest+Icons (installierbar), Service-Worker, Login+Navigation.

---

## 10. Demo-Zugänge (Passwort `password123`)
| Rolle | E-Mail | aktiv |
|---|---|---|
| Admin | admin@etikett.de | ja |
| Employee | employee@etikett.de | ja |
| Employee | clara@etikett.de | ja |
| (Employee/Manager) | anna@/ben@/manager@etikett.de | **inaktiv** |

---

## 11. Ehrliche Grenzen / offene Punkte
- **Native Build/Store-Upload** (Android Studio/Xcode), **Fingerabdruck-Prompt** und
  **Installations-Dialog** laufen nur auf deinem Gerät — nicht in dieser Umgebung
  testbar.
- **Produktion braucht HTTPS-Hosting** (für Passkeys, PWA und die Capacitor-URL).
- **Einladen** nur für Personen mit **bestehendem Konto** (keine Selbstregistrierung).
- **E-Mail-Versand** nur mit konfiguriertem SMTP (ungetestet ohne echten Server).
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
- Einladungs-**Selbstregistrierung** (Link + Signup), falls neue Leute ohne Konto
  eingeladen werden sollen.
- Trip-Endpunkte in **OpenAPI/Swagger** aufnehmen.
- App-Icon/Splash via `@capacitor/assets` aus `public/icon-512.png`.
