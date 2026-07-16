# CloverJapanPlaner → Google Play Store (Android)

Alles Wichtige, um die App in den **Play Store** zu bringen. Fokus: **Android**
(iOS später). Reihenfolge einhalten — die ersten beiden Punkte sind die häufigsten
Stolpersteine.

---

## 0. Was diese App technisch ist (wichtig zu verstehen)
Die App ist eine **Server-App** (Next.js mit SSR, Server Actions, Datenbank). Sie
lässt sich **nicht** als statische Dateien in die APK packen. Die Android-App ist
deshalb ein **WebView, der deine gehostete Web-App lädt** (`server.url` in
`capacitor.config.ts`) — plus der native **Fingerabdruck-Lock**.

**Konsequenz:** Die App im Store funktioniert nur, wenn deine Web-App **online
unter einer öffentlichen HTTPS-URL erreichbar** ist. Ohne Hosting läuft die
Store-App nicht (localhost gilt nur auf deinem Rechner).

---

## 1. Voraussetzungen (einmalig)
- **Node.js auf deinem Rechner** (Host) — der Docker-Container reicht **nicht**,
  weil Android Studio host-seitig läuft. (`brew install node` o. ä.)
- **Android Studio** + Android SDK + **JDK 17** (bringt Android Studio mit).
- **Google Play Developer-Konto**: einmalig **25 USD**, Registrierung unter
  <https://play.google.com/console> (Identitätsprüfung kann 1–2 Tage dauern).
- **Öffentliches HTTPS-Hosting** für die Web-App (siehe Schritt 2).
- Eine **Datenschutzerklärung als öffentliche URL** (im Play Store **Pflicht**).

---

## 2. Web-App öffentlich hosten (HTTPS) — Pflicht
Die App braucht eine erreichbare HTTPS-URL. Optionen:
- **Eigener Server / VPS** (z. B. Hetzner) mit Docker Compose (wie lokal) hinter
  einem Reverse-Proxy mit TLS (**Caddy** oder **nginx + Let's Encrypt**) und
  eigener **Domain** (z. B. `https://app.deine-domain.de`).
- **Managed** (Railway/Render/Fly.io o. ä.) — braucht eine erreichbare
  **PostgreSQL**-DB und die Env-Variablen.

**Env für Produktion** (siehe `.env.example`):
- `DATABASE_URL` (Prod-DB), `AUTH_SECRET` (`openssl rand -base64 32`), `AUTH_TRUST_HOST=true`
- `WEBAUTHN_RP_ID` = deine Domain (ohne `https://`/Port), `WEBAUTHN_ORIGIN` = `https://app.deine-domain.de`
- optional `GOOGLE_MAPS_API_KEY`
- Migrationen fahren: `npx prisma migrate deploy`, Seed nur bei Bedarf.

> HTTPS ist doppelt wichtig: **Passkeys/WebAuthn** und die **PWA-Installierbarkeit**
> funktionieren nur im sicheren Kontext.

Danach in `capacitor.config.ts`:
```ts
server: { url: "https://app.deine-domain.de" }   // cleartext dann nicht nötig
```
(Für einen schnellen lokalen Gerätetest ginge auch `http://<LAN-IP-des-Rechners>:3000`
mit `cleartext: true` — aber für den Store brauchst du die echte HTTPS-URL.)

---

## 3. Android-Projekt erzeugen (auf dem Host, nicht im Container)
```bash
cd Timetracker
npm install                     # Deps auf dem Host installieren
npx cap add android             # erzeugt den Ordner android/
npx cap sync android            # Config + Plugins übernehmen
```
`android/` ist absichtlich **gitignored** (generiert).

---

## 4. App-Name, Package-ID, Icon, Berechtigungen
- **Anzeigename** (unter dem Icon) kommt aus `appName: "Clover Japan"` →
  landet in `android/app/src/main/res/values/strings.xml` als `app_name`.
- **Package-ID / applicationId:** aktuell `app.clover.japan`
  (`android/app/build.gradle`). Muss **weltweit eindeutig** und **unveränderlich**
  sein. Empfehlung: etwas Eindeutiges wie `de.deinname.cloverjapan`.
- **Version:** in `android/app/build.gradle` → `versionCode` (Integer, bei jedem
  Upload +1) und `versionName` (z. B. `"1.0.0"`).
- **Biometrie-Berechtigung** in `android/app/src/main/AndroidManifest.xml`
  (falls nicht schon vom Plugin ergänzt):
  ```xml
  <uses-permission android:name="android.permission.USE_BIOMETRIC" />
  ```
- **App-Icon / Splash** aus dem Kleeblatt generieren:
  ```bash
  npm i -D @capacitor/assets
  # public/icon-512.png als Quelle (evtl. nach assets/ kopieren)
  npx capacitor-assets generate --android
  npx cap sync android
  ```

---

## 5. Auf einem echten Gerät testen (vor dem Store)
- Handy per USB, USB-Debugging an.
- `npx cap run android`  (oder in Android Studio „Run").
- Prüfen: App lädt die HTTPS-Web-App, **Fingerabdruck-Lock** erscheint beim Start
  und nach dem Zurückkehren in die App; Login (Passwort/Passkey) funktioniert.

---

## 6. Signiertes Release-Bundle (AAB) bauen
Play verlangt ein **AAB** (Android App Bundle), signiert.
1. **Upload-Keystore** erstellen (einmalig, sicher aufbewahren – Verlust = keine
   Updates mehr möglich):
   ```bash
   keytool -genkey -v -keystore upload-keystore.jks -keyalg RSA -keysize 2048 \
     -validity 10000 -alias upload
   ```
2. In Android Studio: **Build → Generate Signed Bundle / APK → Android App Bundle**,
   Keystore wählen, **release** bauen → `app-release.aab`.
   (Alternativ Signing in `build.gradle` konfigurieren und `./gradlew bundleRelease`.)
3. **Play App Signing** aktivieren (empfohlen) — Google verwaltet den finalen
   Signaturschlüssel, du lädst mit dem Upload-Key hoch.

---

## 7. Play Console: App anlegen & veröffentlichen
1. <https://play.google.com/console> → **App erstellen** (Name: **CloverJapanPlaner**,
   Sprache, App/kostenlos).
2. **Store-Eintrag** ausfüllen: Kurz-/Vollbeschreibung, **App-Icon** (512×512),
   **Feature-Grafik** (1024×500), **Screenshots** (Handy, mind. 2), Kategorie.
3. **Pflicht-Formulare** (ohne die keine Veröffentlichung):
   - **Datenschutzerklärung-URL** (öffentlich erreichbar).
   - **Data Safety** (Datensicherheit): welche Daten erhoben werden (Konto/E-Mail,
     ggf. Standort im Reiseplaner), wie genutzt/geteilt.
   - **Inhaltsbewertung** (Fragebogen), **Zielgruppe/Alter**, **Werbung** (nein),
     **Regierungs-App** (nein).
4. **Release**: erst **Internes Testing** → AAB hochladen, auf eigenem Gerät prüfen.
   Danach **Produktion** → Rollout. Erst-Review dauert oft **einige Tage**.

---

## 8. Wichtige Stolpersteine (kurz)
- **HTTPS-Hosting ist Pflicht** — ohne läuft die Store-App nicht.
- **Datenschutzerklärung + Data-Safety-Formular** sind Pflicht, sonst kein Release.
- **applicationId** eindeutig wählen und **nie mehr ändern** (sonst neue App).
- **Keystore sichern** (Passwort + Datei) — sonst keine App-Updates mehr.
- **Target-SDK aktuell halten** (Capacitor 6 zielt auf SDK 34; Play verlangt eine
  aktuelle Target-API — bei Ablehnung Target-SDK in `build.gradle` erhöhen).
- Nach jedem Web-Update reicht i. d. R. ein neues Deployment der Web-App — die
  native Hülle muss nur neu gebaut werden, wenn sich `capacitor.config.ts`, Plugins,
  Icon, Name, Version oder Permissions ändern.

---

## 9. Was ich (in dieser Umgebung) nicht übernehmen kann
- Den **nativen Build** (`cap add`/Gradle/Android Studio) und den **Upload** in die
  Play Console — das läuft auf deinem Rechner mit Android Studio/SDK.
- Den echten **Fingerabdruck-Dialog** und die **Installation** testen — nur am Gerät.

Was ich gemacht habe: Capacitor-Setup, Namen, Icons, den Fingerabdruck-Lock
(`src/components/BiometricLock.tsx`) und die PWA — alles web-seitig mit Playwright
verifiziert. Sag Bescheid, wenn ich beim **Hosting/HTTPS-Deployment** (Dockerfile
für Prod, Caddy/nginx-Config) helfen soll — das kann ich dir vorbereiten.
