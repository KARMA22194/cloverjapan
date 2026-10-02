# Self-Hosting auf dem eigenen Homeserver (CasaOS)

Anleitung, um **Clover Japan** auf einem CasaOS-Homeserver zu betreiben — mit
lokaler Postgres-Datenbank und **Cloudflare Tunnel** für HTTPS (kein
Port-Forwarding nötig).

Der Stack besteht aus fünf Containern (`docker-compose.prod.yml`):

| Container    | Zweck                                                          |
|--------------|----------------------------------------------------------------|
| `db`         | PostgreSQL 18, Daten im Volume `db-data`                       |
| `migrate`    | One-Shot: wendet DB-Migrationen an, beendet sich danach         |
| `app`        | Next.js-Produktions-Server (Standalone, Port 3000, intern)     |
| `cron`       | ruft Flugstatus (15 min) und Aufräum-Job (täglich) auf          |
| `cloudflared`| Cloudflare Tunnel → verbindet deine Domain mit `app:3000`       |

> **Die Postgres-Version muss zur Entwicklung passen** (`docker-compose.yml`,
> dort ebenfalls 18). Hier stand lange 16, während Entwicklung und Neon schon
> auf 18 liefen — genau die Art Abweichung, die erst beim Deploy auffällt.
> Wer eine Seite anhebt, hebt die andere mit.

> **Warum HTTPS Pflicht ist:** Passkeys/WebAuthn, die PWA (Offline/Installation),
> Web-Push **und die Standortabfrage** (Konbini-Radar, Eki-Stamps, Kofferfinder)
> funktionieren **nur** über HTTPS. Ohne wäre über die Hälfte der App tot. Der
> Cloudflare Tunnel liefert es automatisch.

> ⚠️ **Mit der neuen Domain werden bestehende Passkeys ungültig.** Ein Passkey
> ist fest an die RP-ID gebunden, mit der er erzeugt wurde; ein auf der alten
> Adresse registrierter wird vom Browser auf der neuen gar nicht erst angeboten.
> Das ist der eingebaute Phishing-Schutz, keine Fehlkonfiguration — es gibt
> keine Einstellung, die das aufhebt. Nach dem Umzug einmal neu registrieren
> (Passwort-Login funktioniert unverändert).

---

## 1. Voraussetzungen

- Ein **Cloudflare-Konto** (kostenlos) und eine **Domain**, deren Nameserver auf
  Cloudflare zeigen (eine Subdomain wie `clover.deine-domain.de` genügt).
- Docker + Docker Compose (bei CasaOS vorhanden).
- Das Repository auf dem Server, z. B.:
  ```bash
  git clone <REPO-URL> clover-japan && cd clover-japan
  ```

## 2. Cloudflare Tunnel anlegen

1. Cloudflare-Dashboard → **Zero Trust** → **Networks → Tunnels** → **Create a tunnel**.
2. Typ **Cloudflared** wählen, Namen vergeben (z. B. `clover`).
3. Im Schritt „Install connector" die **Docker**-Variante wählen und den
   **Token** kopieren (die lange Zeichenkette hinter `--token`). → kommt gleich
   als `TUNNEL_TOKEN` in die `.env.prod`.
4. Reiter **Public Hostnames** → **Add a public hostname**:
   - **Subdomain/Domain:** z. B. `clover` / `deine-domain.de`
   - **Service:** Type `HTTP`, URL `app:3000`
   - Speichern.

Damit leitet Cloudflare `https://clover.deine-domain.de` verschlüsselt an den
internen App-Container weiter.

## 3. Umgebung konfigurieren

```bash
cp .env.prod.example .env.prod
```

`.env.prod` ausfüllen — mindestens:

```bash
# starkes DB-Passwort (dreimal identisch: POSTGRES_PASSWORD + in beiden URLs)
POSTGRES_PASSWORD="…"
DATABASE_URL="postgresql://clover:…@db:5432/clover?schema=public"
DIRECT_URL="postgresql://clover:…@db:5432/clover?schema=public"

# Auth-Secret erzeugen:
#   openssl rand -base64 32
AUTH_SECRET="…"

# deine öffentliche Adresse (überall gleich)
APP_URL="https://clover.deine-domain.de"
WEBAUTHN_RP_ID="clover.deine-domain.de"     # nur Hostname, ohne https://
WEBAUTHN_ORIGIN="https://clover.deine-domain.de"

# Cloudflare-Tunnel-Token aus Schritt 2
TUNNEL_TOKEN="…"

# Web-Push-Schlüssel erzeugen:
#   docker run --rm node:22-bookworm-slim npx --yes web-push generate-vapid-keys
VAPID_PUBLIC_KEY="…"
VAPID_PRIVATE_KEY="…"
VAPID_SUBJECT="mailto:du@deine-domain.de"
```

Dazu **`CRON_SECRET`** (`openssl rand -base64 32`): es schützt beide
Cron-Endpunkte. Ohne das Secret sind sie gesperrt — dann wachsen die
RateLimit-/Token-/Challenge-Zeilen unbegrenzt weiter, und es gibt keine
Push-Meldung bei Gate- oder Verspätungsänderung.

Optionale Keys (SMTP, AeroDataBox, Google Vision, Google Maps, Discord) nur bei
Bedarf — ohne sie greifen saubere Fallbacks, nichts stürzt ab. Alle stehen mit
Erklärung in `.env.prod.example`.

## 4. Starten

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

Ablauf: `db` startet → `migrate` legt das Schema an → `app` startet →
`cron` und `cloudflared` verbinden sich. Nach ~1–2 Minuten ist
`https://clover.deine-domain.de` erreichbar.

Logs verfolgen:
```bash
docker compose -f docker-compose.prod.yml logs -f app cron cloudflared
```

Der `cron`-Container protokolliert jeden Aufruf mit Antwortcode, z. B.:

```
2026-10-02 05:23:51 /api/v1/cron/flight-status -> 200 {"candidates":0,"checked":0,…}
2026-10-02 05:23:53 /api/v1/cron/cleanup       -> 200 {"rateLimits":29,"tokens":0,…}
```

Steht dort `401`, passt `CRON_SECRET` nicht; `nicht erreichbar` heißt, dass
`app` noch nicht läuft (das regelt sich beim nächsten Durchlauf von selbst).

## 5. Erste Anmeldung / Nutzer anlegen

Es gibt **keinen** automatischen Demo-Seed in Produktion. Zwei Wege:

- **Selbst registrieren:** `https://clover.deine-domain.de/register`. Ohne
  konfiguriertes SMTP erscheint der Verify-Link direkt in der Server-Antwort
  (Dev-Fallback) — alternativ SMTP setzen, dann kommt die Mail.
- **Admin direkt setzen** (nach der Registrierung), damit du die Nutzerverwaltung
  unter `/admin` siehst:
  ```bash
  docker compose -f docker-compose.prod.yml exec db \
    psql -U clover -d clover \
    -c "UPDATE \"User\" SET role='ADMIN', \"emailVerified\"=now() WHERE email='du@deine-domain.de';"
  ```

## 6. Updates einspielen

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

Neue Migrationen laufen dabei automatisch über den `migrate`-Container.

## 7. Backup der Datenbank

```bash
docker compose -f docker-compose.prod.yml exec -T db \
  pg_dump -U clover -d clover --format=custom --no-owner --no-acl \
  > clover-backup-$(date +%F).dump
```

⚠️ Die drei Schalter sind nicht schmückend:
- **`--format=custom`** erlaubt es, einzelne Tabellen zurückzuholen statt nur
  alles oder nichts.
- **`--no-owner --no-acl`** lassen Rollennamen und GRANTs weg. Ohne sie bricht
  das Zurückspielen in eine andere Datenbank an jedem GRANT ab — und genau
  dorthin (in die lokale Entwicklungs-Datenbank) geht eine Sicherung im
  Ernstfall zuerst.
- **`exec -T`** verhindert, dass Docker ein TTY dazwischenschiebt und den Dump
  mit CRLF unbrauchbar macht.

Zurückspielen:
```bash
docker compose -f docker-compose.prod.yml exec -T db \
  pg_restore -U clover -d clover --clean --if-exists < clover-backup-JJJJ-MM-TT.dump
```

---

### CasaOS-spezifisch

CasaOS kann diese `docker-compose.prod.yml` direkt importieren:
**App Store → Custom Install (Import)** → Inhalt der Compose-Datei einfügen.
Die `.env.prod` muss dann im Projektverzeichnis liegen bzw. die Variablen im
CasaOS-Import mitgegeben werden. Alternativ (empfohlen, weil einfacher zu
aktualisieren): das Repo per SSH klonen und die `up`-Befehle aus Schritt 4/6
direkt im Terminal ausführen.

### Fehlersuche

- **502 / „not reachable" über die Domain:** prüfen, dass der Public-Hostname
  im Tunnel auf `app:3000` (nicht `localhost`) zeigt und `cloudflared` läuft.
- **Passkeys/Push tun nichts:** `WEBAUTHN_RP_ID`/`_ORIGIN` und `APP_URL` müssen
  exakt zur aufgerufenen Domain passen; VAPID-Keys gesetzt.
- **`migrate` schlägt fehl:** `DATABASE_URL`/`DIRECT_URL` und
  `POSTGRES_PASSWORD` müssen zusammenpassen; Logs: `... logs migrate`.
- **`db` startet endlos neu, `exec` sagt nur „is restarting":** fast immer der
  Mount-Pfad. Ab Postgres 18 liegt PGDATA in `…/18/docker`, nicht in `…/data` —
  der Mount muss `db-data:/var/lib/postgresql` lauten (eine Ebene höher). Die
  eigentliche Meldung steht **nur** in `... logs db`.
- **Kein Flugstatus-Push:** erst `... logs cron` ansehen. `401` = `CRON_SECRET`
  passt nicht; `200` mit `"skipped"` = `AERODATABOX_API_KEY` oder die
  VAPID-Schlüssel fehlen; `200` mit `"candidates":0` ist **in Ordnung**, solange
  kein Flug in den nächsten ~30 Stunden liegt.
- **Umstieg von einer älteren Installation mit Postgres 16:** das
  Datenverzeichnis ist zwischen Hauptversionen **nicht** weiterverwendbar.
  Vorher sichern (Schritt 7), dann `docker compose -f docker-compose.prod.yml
  down`, `docker volume rm <projekt>_db-data`, neu starten und den Dump
  zurückspielen. Ein blosses Anheben der Image-Version verliert die Daten
  bzw. startet gar nicht.
