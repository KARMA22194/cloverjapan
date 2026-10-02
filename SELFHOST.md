# Self-Hosting auf dem eigenen Homeserver (CasaOS)

Anleitung, um **Clover Japan** auf einem CasaOS-Homeserver zu betreiben — mit
lokaler Postgres-Datenbank und einem **ausgehenden Tunnel** für HTTPS (kein
Port-Forwarding nötig, funktioniert auch hinter CGNAT).

Für den Tunnel gibt es zwei Wege; du wählst ihn beim Start über ein
Compose-Profil:

| | **Tailscale Funnel** (`--profile tailscale`) | **Cloudflare Tunnel** (`--profile cloudflare`) |
|---|---|---|
| Kosten | 0 € (Personal-Plan) | ~5–10 €/Jahr für die Domain |
| Adresse | `clover.taileXXXX.ts.net` | `clover.deine-domain.de` |
| Eigene Domain nötig | nein | **ja**, im Cloudflare-Konto |
| Portabel | nein, hängt an Tailscale | ja, die Domain gehört dir |

> ⚠️ **Die Adresse muss stabil sein — sie ist nicht bloß Kosmetik.** Sie steckt
> in `WEBAUTHN_RP_ID`: ändert sie sich, sind alle Passkeys ungültig und alle
> Push-Abos tot. Aus demselben Grund taugt Cloudflares *Quick Tunnel*
> (`trycloudflare.com`) hier **nicht** — der vergibt bei jedem Neustart eine
> neue Zufalls-URL.

Der Stack besteht aus fünf Containern (`docker-compose.prod.yml`):

| Container    | Zweck                                                          |
|--------------|----------------------------------------------------------------|
| `db`         | PostgreSQL 18, Daten im Volume `db-data`                       |
| `migrate`    | One-Shot: wendet DB-Migrationen an, beendet sich danach         |
| `app`        | Next.js-Produktions-Server (Standalone, Port 3000, intern)     |
| `cron`       | ruft Flugstatus (15 min) und Aufräum-Job (täglich) auf          |
| `tailscale`  | *(Profil `tailscale`)* Funnel → veröffentlicht `app:3000`        |
| `cloudflared`| *(Profil `cloudflare`)* Tunnel → verbindet deine Domain mit `app:3000` |

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

- Je nach Weg:
  - **Tailscale:** ein kostenloses Tailscale-Konto. Sonst nichts.
  - **Cloudflare:** ein Cloudflare-Konto **und** eine Domain, deren Nameserver
    auf Cloudflare zeigen (eine Subdomain wie `clover.deine-domain.de` genügt).
- Docker + Docker Compose (bei CasaOS vorhanden).
- Das Repository auf dem Server, z. B.:
  ```bash
  git clone <REPO-URL> clover-japan && cd clover-japan
  ```

## 2a. Weg A — Tailscale Funnel

**Drei Dinge in der Tailscale-Admin-Konsole**, alle einmalig:

1. **HTTPS einschalten:** → **DNS** → Abschnitt *HTTPS Certificates* →
   **Enable HTTPS**. Ohne das gibt es kein Zertifikat und der Funnel bleibt tot.

2. **Funnel erlauben** — meist schon erledigt. In der Standard-Policy neuer
   Tailnets steht der Block bereits drin. → **Access controls** und nachsehen,
   ob dort Folgendes steht (die Zeilen mit `//` davor sind nur Erklärtext):

   ```json
   "nodeAttrs": [
     { "target": ["autogroup:member"], "attr": ["funnel"] },
   ]
   ```

   Nur falls er fehlt, ergänzen — und dann **in ein vorhandenes `nodeAttrs`
   hinein**, nicht als zweiter Block gleichen Namens. Die Datei ist **HuJSON**:
   Kommentare und ein Komma hinter dem letzten Eintrag sind erlaubt.

   ⚠️ Fehlt das Attribut, startet trotzdem alles ohne Fehlermeldung — nur
   erreichbar ist von außen nichts. Es gibt **keinen Funnel-Schalter** in der
   Oberfläche; wer danach sucht, sucht vergeblich.

3. **Auth-Key erzeugen:** → **Settings → Keys** → *Generate auth key*.
   ⚠️ **„Ephemeral" NICHT ankreuzen.** Ein ephemerer Knoten verschwindet beim
   Stoppen des Containers; beim nächsten Start entstünde ein neuer mit
   angehängtem Zähler (`clover-1`) — also eine **andere Adresse**, und damit
   sind alle Passkeys ungültig. Der Key wandert als `TS_AUTHKEY` in die
   `.env.prod`.

Deine Adresse lautet danach `https://<TS_HOSTNAME>.<dein-tailnet>.ts.net`, also
z. B. `https://clover.taile1234.ts.net`. Den Tailnet-Namen zeigt die
Admin-Konsole oben an; nach dem ersten Start steht die vollständige Adresse
auch im Log des `tailscale`-Containers.

---

## 2b. Weg B — Cloudflare Tunnel

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

# deine öffentliche Adresse (überall gleich, und sie muss STABIL bleiben)
#   Weg A:  https://clover.taile1234.ts.net
#   Weg B:  https://clover.deine-domain.de
APP_URL="https://clover.taile1234.ts.net"
WEBAUTHN_RP_ID="clover.taile1234.ts.net"      # nur Hostname, ohne https://
WEBAUTHN_ORIGIN="https://clover.taile1234.ts.net"

# Nur den Block des gewählten Weges ausfüllen, der andere bleibt leer:
TS_AUTHKEY="…"          # Weg A — Auth-Key aus Schritt 2a, NICHT ephemeral
TS_HOSTNAME="clover"    # Weg A — ergibt clover.<tailnet>.ts.net
TUNNEL_TOKEN=""         # Weg B — Token aus Schritt 2b

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

**Das Profil muss mit angegeben werden** — ohne eines läuft der Stack nur im
lokalen Netz, nach außen führt dann nichts.

```bash
# Weg A — Tailscale
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  --profile tailscale up -d --build

# Weg B — Cloudflare
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  --profile cloudflare up -d --build
```

Ablauf: `db` startet → `migrate` legt das Schema an → `app` startet → `cron`
und der Tunnel verbinden sich. Nach ~1–2 Minuten ist die Adresse erreichbar.

⚠️ **Dasselbe Profil bei jedem weiteren Befehl mitgeben** (`logs`, `down`,
`up`). Ohne es sieht Compose den Tunnel-Container nicht und lässt ihn beim
`down` stehen bzw. beim `up` aus.

Logs verfolgen (Weg A; für Weg B `tailscale` durch `cloudflared` ersetzen):
```bash
docker compose -f docker-compose.prod.yml --profile tailscale logs -f app cron tailscale
```

Beim ersten Start meldet der `tailscale`-Container die vollständige Adresse —
daran prüfst du, ob `APP_URL`/`WEBAUTHN_RP_ID` wirklich passen:
```
Success. ... is now available at https://clover.taile1234.ts.net/
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

- **Tailscale: Adresse nicht erreichbar, Container läuft aber.** Fast immer
  einer der beiden Schalter aus Schritt 2a: *HTTPS Certificates* nicht
  aktiviert, oder das `funnel`-Attribut fehlt in der Policy. Beides erzeugt
  keinen Fehler beim Start — es passiert einfach nichts.
- **Tailscale: die Adresse hat plötzlich eine Ziffer am Ende** (`clover-1`).
  Dann war der Auth-Key ephemeral oder das Volume `tailscale-state` ist weg,
  und der Knoten hat sich neu registriert. Den alten Knoten in der Admin-
  Konsole löschen, Container neu starten — und beachten, dass zwischenzeitlich
  registrierte Passkeys auf der neuen Adresse nicht mehr gelten.
- **502 / „not reachable" über die Domain (Cloudflare):** prüfen, dass der
  Public-Hostname im Tunnel auf `app:3000` (nicht `localhost`) zeigt und
  `cloudflared` läuft.
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
