# Native Store-App (Capacitor) + Fingerabdruck-Lock

Die App ist eine **Server-App** (SSR, Server Actions, Prisma) — sie lässt sich
**nicht** statisch exportieren. Die native App ist deshalb ein **WebView auf die
gehostete Next-App** (`server.url` in `capacitor.config.ts`) plus native Plugins.
Der **Fingerabdruck-/Face-ID-Lock** (`src/components/BiometricLock.tsx`) greift
**nur nativ**; im Browser/PWA ist er ein No-Op (dort dienen Passkeys).

> ⚠️ Der native Build passiert **nicht** im Docker-Container, sondern auf deinem
> Rechner mit den nativen Toolchains. Dafür brauchst du **Node auf dem Host**
> (der Container-Node reicht nicht, weil Xcode/Android Studio host-seitig laufen).

## Voraussetzungen
- **iOS:** macOS + **Xcode** + **CocoaPods** (`sudo gem install cocoapods`).
- **Android:** **Android Studio** + Android SDK + JDK 17.
- **Node** auf dem Host (für die Capacitor-CLI) — einmalig `npm install` im Projekt.

## 1. App hosten & server.url setzen
Die native App lädt die Web-App über HTTPS. Optionen:
- **Produktion:** App unter einer **HTTPS-Domain** deployen (Passkeys/WebAuthn
  brauchen ohnehin HTTPS). Dann in `capacitor.config.ts` `server.url` auf die
  Domain setzen — oder per Env: `CAP_SERVER_URL=https://deine-domain npx cap sync`.
- **Lokaler Test:** Dev-Server läuft (`docker compose up -d app`). `server.url` auf
  die **LAN-IP deines Macs** zeigen lassen (NICHT `localhost` — das wäre das
  Handy selbst), z. B. `http://192.168.x.y:3000` (`cleartext: true` ist gesetzt).
  Handy und Mac im selben WLAN.

## 2. Plattformen hinzufügen (auf dem Host)
```bash
npm install                 # Deps auf dem Host
npx cap add ios             # bzw.
npx cap add android
npx cap sync                # kopiert Config/Plugins in die Native-Projekte
```
(Die Ordner `ios/` und `android/` sind bewusst per `.gitignore` ausgeschlossen —
sie werden lokal erzeugt.)

## 3. Biometrie-Berechtigungen setzen
- **iOS** – `ios/App/App/Info.plist`:
  ```xml
  <key>NSFaceIDUsageDescription</key>
  <string>App per Face ID entsperren</string>
  ```
- **Android** – `android/app/src/main/AndroidManifest.xml` (falls nicht schon vom
  Plugin ergänzt):
  ```xml
  <uses-permission android:name="android.permission.USE_BIOMETRIC" />
  ```

## 4. Öffnen & auf dem Gerät starten
```bash
npx cap open ios        # → Xcode: auf echtem Gerät starten (Signing einrichten)
npx cap open android    # → Android Studio: Run auf Gerät/Emulator
```
Beim App-Start und nach jedem Resume erscheint der **Fingerabdruck-Lock**.

## Store-Veröffentlichung (Kurz)
- **iOS:** App in Xcode archivieren → App Store Connect → TestFlight/Review.
- **Android:** signiertes **AAB** in Android Studio bauen → Google Play Console.
- App-Icon/Splash: aus `public/icon-512.png` (Kleeblatt) generieren, z. B. mit
  `@capacitor/assets`.

## Hinweise
- `server.url` muss vom Gerät erreichbar sein (Produktion: HTTPS-Domain).
- Der Lock ist eine **App-Sperre** (UI-Gate), keine Server-Anmeldung — die
  Session läuft weiterhin über NextAuth (Cookie im WebView).
