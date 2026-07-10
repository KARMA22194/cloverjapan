# Kostenlos online stellen: Vercel + Neon

Ziel: Die App dauerhaft **gratis** unter einer HTTPS-Adresse betreiben, damit du
sie am Handy als **PWA** installieren kannst (echtes App-Icon, überall nutzbar,
Fingerabdruck/Passkey funktioniert). Kein Play Store nötig.

- **Vercel** hostet die Next.js-App (kostenloser „Hobby"-Plan).
- **Neon** liefert die PostgreSQL-Datenbank (kostenlose Stufe).

Der Code ist bereits vorbereitet: `vercel.json` generiert den Prisma-Client und
fährt Migrationen bei jedem Deploy automatisch; das Schema nutzt `DATABASE_URL`
(gepoolt, Laufzeit) + `DIRECT_URL` (direkt, für Migrationen).

---

## Schritt A — Datenbank bei Neon (kostenlos)
1. <https://neon.tech> → mit Google/GitHub anmelden.
2. **Create project** → Name z. B. `cloverjapan`, Region **Europe (Frankfurt)**.
3. Nach dem Anlegen zeigt Neon **Connection strings**. Du brauchst **zwei**:
   - **Pooled** (enthält `-pooler` im Host) → wird `DATABASE_URL`.
   - **Direct / unpooled** (ohne `-pooler`) → wird `DIRECT_URL`.
   (Umschalten über den Schalter „Pooled connection" bei der Connection-Anzeige.)
   Beide enthalten schon Benutzer, Passwort und `?sslmode=require`.

Bewahre beide Strings kurz auf — sie kommen in Schritt C bei Vercel rein.

---

## Schritt B — Code zu GitHub
Vercel deployt am einfachsten aus einem GitHub-Repository.
1. <https://github.com> → Konto anlegen/anmelden → **New repository** →
   Name `cloverjapan`, **Private** → **Create**.
2. Den Projektordner pushen (GitHub zeigt die Befehle; sinngemäß):
   ```bash
   git add -A && git commit -m "Vercel-Deploy vorbereitet"
   git branch -M main
   git remote add origin https://github.com/<deinname>/cloverjapan.git
   git push -u origin main
   ```
   `.env` und `android/`/`ios/` sind per `.gitignore` ausgeschlossen — deine
   Secrets landen **nicht** auf GitHub (die trägst du direkt bei Vercel ein).

---

## Schritt C — Vercel-Projekt + Env
1. <https://vercel.com> → mit GitHub anmelden → **Add New… → Project** →
   das `cloverjapan`-Repo **Import**.
2. Framework wird als **Next.js** erkannt. **Noch nicht deployen** — zuerst unten
   **Environment Variables** eintragen (alle für „Production"):

| Variable | Wert |
|---|---|
| `DATABASE_URL` | Neon **Pooled**-String |
| `DIRECT_URL` | Neon **Direct**-String |
| `AUTH_SECRET` | zufällig: Terminal `openssl rand -base64 32` |
| `AUTH_TRUST_HOST` | `true` |
| `APP_TIMEZONE` | `Europe/Berlin` |
| `WEBAUTHN_RP_NAME` | `Clover Japan` |
| `WEBAUTHN_RP_ID` | *(nach 1. Deploy, siehe D)* — vorerst leer/`localhost` |
| `WEBAUTHN_ORIGIN` | *(nach 1. Deploy)* |
| `APP_URL` | *(nach 1. Deploy)* — für Einladungs-Links |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_SECURE` | `false` |
| `SMTP_USER` | deine Gmail-Adresse |
| `SMTP_PASS` | dein Gmail-App-Passwort |
| `SMTP_FROM` | `Clover Japan <deine@gmail.com>` |

3. **Deploy** klicken. Der erste Build legt via Migrationen alle Tabellen in Neon an.

---

## Schritt D — Nach dem ersten Deploy
Vercel gibt dir eine URL, z. B. `https://cloverjapan.vercel.app`.
1. Diese Domain in die **Environment Variables** nachtragen und **neu deployen**:
   - `WEBAUTHN_RP_ID` = `cloverjapan.vercel.app` (ohne `https://`)
   - `WEBAUTHN_ORIGIN` = `https://cloverjapan.vercel.app`
   - `APP_URL` = `https://cloverjapan.vercel.app`
2. **Login-Konto anlegen** (die DB ist noch leer). Einmalig von deinem Rechner aus
   gegen die Neon-DB seeden (erzeugt die Demo-Konten inkl. `admin@clover.japan`):
   ```bash
   docker compose run --rm \
     -e DATABASE_URL="<Neon-Pooled>" -e DIRECT_URL="<Neon-Direct>" \
     app npm run db:seed
   ```
   Danach mit `admin@clover.japan` / `password123` einloggen. **Passwörter ändern!**

---

## Schritt E — Am Handy installieren
1. `https://cloverjapan.vercel.app` im Handy-Browser öffnen, einloggen.
2. Menü → **„Zum Startbildschirm hinzufügen"** → App-Icon (Kleeblatt) erscheint.
3. Fertig — startet im Vollbild wie eine normale App, auch unterwegs.

---

## Kosten & Grenzen (ehrlich)
- Vercel Hobby + Neon Free sind **dauerhaft kostenlos** für private Nutzung.
- Neon Free pausiert die DB bei Inaktivität → der erste Aufruf nach einer Pause
  dauert 1–2 Sekunden länger. Für euch unkritisch.
- Bei viel Traffic/Speicher greifen irgendwann die Gratis-Limits — für dich und
  deine Reisegruppe weit außer Reichweite.
