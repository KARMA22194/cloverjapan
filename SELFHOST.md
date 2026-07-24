# Self-Hosting auf dem eigenen Homeserver (CasaOS)

Anleitung, um **Clover Japan** auf einem CasaOS-Homeserver zu betreiben — mit
lokaler Postgres-Datenbank und **Cloudflare Tunnel** für HTTPS (kein
Port-Forwarding nötig).

Der Stack besteht aus vier Containern (`docker-compose.prod.yml`):

| Container    | Zweck                                                          |
|--------------|----------------------------------------------------------------|
| `db`         | PostgreSQL 16, Daten im Volume `db-data`                       |
| `migrate`    | One-Shot: wendet DB-Migrationen an, beendet sich danach         |
| `app`        | Next.js-Produktions-Server (Standalone, Port 3000, intern)     |
| `cloudflared`| Cloudflare Tunnel → verbindet deine Domain mit `app:3000`       |

> **Warum HTTPS Pflicht ist:** Passkeys/WebAuthn, die PWA (Offline/Installation)
> und Web-Push funktionieren **nur** über HTTPS. Der Cloudflare Tunnel liefert
> das automatisch.

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

Optionale Keys (SMTP, AeroDataBox, Anthropic, Google Maps, Discord) nur bei
Bedarf — ohne sie greifen saubere Fallbacks, nichts stürzt ab.

## 4. Starten

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

Ablauf: `db` startet → `migrate` legt das Schema an → `app` startet →
`cloudflared` verbindet sich. Nach ~1–2 Minuten ist
`https://clover.deine-domain.de` erreichbar.

Logs verfolgen:
```bash
docker compose -f docker-compose.prod.yml logs -f app cloudflared
```

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
docker compose -f docker-compose.prod.yml exec db \
  pg_dump -U clover clover > clover-backup-$(date +%F).sql
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
