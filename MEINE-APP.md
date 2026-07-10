# Clover Japan — mein Betriebs-Handbuch

Alles Wichtige zu meiner **live laufenden** App an einem Ort.
(Technische Details: `PROJEKT.md` · `CLAUDE.md` · Deploy-Grundlagen: `VERCEL.md`)

---

## 1. Die App im Überblick
- **Live-Adresse:** https://cloverjapan.vercel.app
- **Was es ist:** Web-App mit zwei Bereichen — **Timetracker** (Zeiterfassung) und
  **Japan** (Reiseplaner, Ausgaben, Tagesplaner, Checkliste, Mitglieder).
- **Aufs Handy:** als **PWA** installiert (kein Play Store) — Icon „Clover Japan".
- **Login:** `acexruffy12@gmail.com` + mein selbst gesetztes Passwort (Rolle **ADMIN**).
  Zusätzlich **Fingerabdruck/Passkey** pro Gerät möglich (unter *Profil*).

---

## 2. Wo alles läuft (Architektur)
| Baustein | Dienst | Zweck |
|---|---|---|
| Web-App (Hosting) | **Vercel** (Hobby, kostenlos) | serviert die Next.js-App unter der HTTPS-URL |
| Datenbank | **Neon** (Free, kostenlos) | PostgreSQL (Nutzer, Zeiten, Reise-Daten) |
| Quellcode | **GitHub** `KARMA22194/cloverjapan` (privat) | Vercel deployt automatisch bei jedem Push |
| E-Mail-Versand | **Gmail-SMTP** (`kk485790@gmail.com`) | Einladungs-Mails an neue Mitglieder |

**Grober Datenfluss:** Push zu GitHub → Vercel baut & deployt → App spricht mit Neon-DB.

---

## 3. Code ändern & neu deployen
1. Änderungen im Projekt macht Claude (oder ich lokal).
2. In **GitHub Desktop** die Änderung committen → **„Push origin"**.
3. Vercel deployt automatisch die neueste Version (~2–4 Min).

**⚠️ Wichtige Falle (Env-Variablen):** Neue Environment-Variablen bei Vercel wirken
erst nach einem **Redeploy**. Diesen Redeploy **immer auf dem NEUESTEN Commit**
auslösen — sonst wird versehentlich eine ältere Version wieder live geschaltet
(genau das ist beim Karten-Fix einmal passiert). In Vercel → *Deployments* → beim
obersten/neuesten Eintrag über **„…“ → Redeploy**.

---

## 4. Environment-Variablen (bei Vercel gesetzt)
Ort: Vercel → Projekt `cloverjapan` → **Settings → Environment Variables**.

| Variable | Wert / Zweck |
|---|---|
| `DATABASE_URL` | Neon **Pooled**-String (Host mit `-pooler`) — Laufzeit |
| `DIRECT_URL` | Neon **Direct**-String (ohne `-pooler`) — Migrationen |
| `AUTH_SECRET` | zufälliger Schlüssel für die Sessions |
| `AUTH_TRUST_HOST` | `true` |
| `APP_TIMEZONE` | `Europe/Berlin` |
| `WEBAUTHN_RP_NAME` | `Clover Japan` |
| `WEBAUTHN_RP_ID` | `cloverjapan.vercel.app` |
| `WEBAUTHN_ORIGIN` | `https://cloverjapan.vercel.app` |
| `APP_URL` | `https://cloverjapan.vercel.app` (für Einladungs-Links) |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_SECURE` | `false` |
| `SMTP_USER` | `kk485790@gmail.com` |
| `SMTP_PASS` | Gmail-**App-Passwort** (kein normales Passwort!) |
| `SMTP_FROM` | `Clover Japan <kk485790@gmail.com>` |

> Wenn sich die Live-Adresse je ändert, müssen `WEBAUTHN_RP_ID`,
> `WEBAUTHN_ORIGIN` und `APP_URL` angepasst und neu deployt werden.

---

## 5. Leute einladen
- In der App → **Mitglieder** → E-Mail eingeben → **Einladen**.
- **Hat schon ein Konto:** bekommt eine Einladung, die die Person selbst **bestätigen**
  muss (unter *Mitglieder → „Einladungen an dich" → Beitreten*). Sie wird also nicht mehr
  ungefragt in die Reise verschoben.
- **Hat noch keins:** bekommt eine **E-Mail mit Registrierungs-Link** (14 Tage gültig),
  legt sich selbst ein Konto an und ist danach dabei. Der Link wird zusätzlich in der
  App zum Kopieren angezeigt. Solange die Person noch nicht beigetreten ist, erscheint
  die Einladung unter **Mitglieder** als **„ausstehend"** (mit Restlaufzeit; dort auch
  widerrufbar).
- **Ohne Einladung:** Über den **„Registrieren"**-Link auf dem Login-Screen kann sich
  jede Person selbst ein Konto anlegen (startet mit einer eigenen, leeren Reise).

---

## 6. Aufs Handy holen (PWA)
**Android (Chrome):** Adresse öffnen → anmelden → **⋮ → „App installieren“**.
**iPhone (Safari):** Adresse öffnen → **Teilen → „Zum Home-Bildschirm“**.
Danach **Profil → „Passkey einrichten“**, um sich per Fingerabdruck anzumelden
(Passkey gilt pro Gerät — auf jedem Gerät einmal einrichten).

---

## 7. Neues Admin-/Login-Konto direkt anlegen (Sonderfall)
Nötig, wenn die DB leer ist oder ein Konto direkt gebraucht wird. Weil das
Firmen-Netz die direkte DB-Verbindung blockiert, läuft das über **Neons Web-Editor**:

1. SQL offline erzeugen (im Projektordner, im Container):
   ```bash
   docker compose run --rm \
     -e ADMIN_EMAIL="du@example.com" \
     -e ADMIN_NAME="Name" \
     -e ADMIN_PASSWORD="min-8-zeichen" \
     app node scripts/gen-admin-sql.mjs
   ```
2. Die ausgegebene `INSERT …`-Zeile in **neon.tech → SQL Editor** einfügen → **Run**.
   (Enthält nur den verschlüsselten Passwort-Hash — sicher.)

---

## 8. Problembehebung (was schon aufgetreten ist)
- **Karte bleibt leer / „Wikimedia“ unten:** alter Code ist live. Prüfen, ob der
  neueste Commit als **Production** deployt ist (siehe Falle in Abschnitt 3).
  Kacheln kommen von **CARTO Voyager** (keyfrei, erlaubt Fremd-Domains); Wikimedia
  blockiert Fremd-Domains mit 403.
- **Änderung erscheint nicht im Browser:** Service-Worker-Cache. Hart neu laden
  (`Cmd+Shift+R`) oder Inkognito-Fenster testen.
- **„Can't reach database server“ lokal:** Der Firmen-Proxy (Cato Networks)
  blockiert die verschlüsselte Postgres-Verbindung auf Port 5432. → Nicht lokal
  gegen Neon arbeiten, sondern Neons Web-SQL-Editor nutzen (Abschnitt 7).
- **Erster Aufruf langsam:** Neon-Free „schläft“ bei Inaktivität, wacht in 1–2 s auf.
- **E-Mail kommt nicht an:** `SMTP_*`-Variablen prüfen; `SMTP_PASS` muss ein
  Gmail-**App-Passwort** sein (2-Faktor-Auth erforderlich).

---

## 9. Kosten
- Vercel Hobby + Neon Free + GitHub privat: **dauerhaft kostenlos** für private Nutzung.
- (Ein echter Play-Store-Eintrag würde einmalig 25 USD kosten — für „nur aufs Handy“
  nicht nötig, die PWA reicht.)

---

## 10. Wichtige Konten & Links
- App: https://cloverjapan.vercel.app
- Vercel: https://vercel.com/dashboard (Projekt `cloverjapan`)
- Neon: https://console.neon.tech (Projekt `cloverjapan`, DB `neondb`)
- GitHub: https://github.com/KARMA22194/cloverjapan (privat)
- Geheimnisse (Passwörter, Neon-Strings, Gmail-App-Passwort) liegen **nur** bei
  Vercel (Env-Variablen) bzw. in der lokalen `.env` — **nie** auf GitHub.
