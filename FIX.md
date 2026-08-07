# FIX.md — Audit-Befunde & Fixliste (Clover Japan)

**Stand:** 2026-08-06 · **Basis:** Commit `8987d72` (+ uncommittete Änderungen in `src/components/TripPlanner.tsx`)
**Methode:** 5 parallele Read-only-Audits — (1) Auth/Session, (2) Autorisierung/IDOR/Tenant-Isolation,
(3) externe Integrationen/SSRF/Header/Secrets, (4) DB- & Server-Performance, (5) Frontend/React.
Funde, die von zwei Audits unabhängig bestätigt wurden, sind mit **✔✔** markiert.

> ## ✅ Abgeschlossen — alle 52 Befunde behoben
>
> **K1–K5 · H1–H9 · M1–M25 · N1–N20 · P9–P15** (Commits s. Git-Log).
>
> **Migrationen** (laufen beim Deploy automatisch mit, `vercel.json` → `prisma migrate deploy`):
> `20260806120000_trip_stop_checklist_client_id` (K5) ·
> `20260806130000_expense_has_receipt` (H7) ·
> `20260806140000_user_session_version` (M2) ·
> `20260807120000_webauthn_challenge` (N3) ·
> `20260807130000_listing_indexes` (P12) ·
> `20260807140000_category_kind_enums` (P15/1) ·
> `20260807150000_expense_receipt_table` (P15/2) ·
> `20260807160000_date_columns` (P15/3)
>
> Zwei Punkte wurden **bewusst anders** gelöst als vorgeschlagen (Begründung am Befund):
> `User.image` bleibt in der User-Zeile (Auslagern wäre dort eine Verschlechterung — dafür Limit
> 300 KB → 60 KB), und `Booking.time` bleibt `String` (leerer Wert lässt sich nicht nach `time` casten).
>
> ⚠️ **Vor dem Deploy: `CRON_SECRET` setzen** — siehe letzter Abschnitt.

Legende: `[ ]` offen · `[x]` behoben · `(jetzt)` heute spürbar · `(bei Wachstum)` erst bei mehr Daten/Nutzern

---

## Inhalt

- [🔴 Kritisch — sofort](#-kritisch--sofort)
- [🟠 Hoch](#-hoch)
- [🟡 Mittel](#-mittel)
- [🟢 Niedrig / Kleinkram](#-niedrig--kleinkram)
- [✅ Was gut gelöst ist](#-was-gut-gelöst-ist)
- [Umsetzungsnotizen](#umsetzungsnotizen-wo-die-lösung-von-der-empfehlung-abweicht)
- [Verifikation](#verifikation)
- [Was noch offen ist](#was-noch-offen-ist)
- [⚠️ Vor dem nächsten Deploy](#️-vor-dem-nächsten-deploy)

---

## 🔴 Kritisch — sofort

### [x] K1 · Einladungs-Token wird an alle Mitglieder ausgeliefert → Account-Pre-Hijacking ✔✔

**Ort:** `src/app/api/v1/trip/members/route.ts:52-60` · `src/lib/services/trip.ts:212-227` (`getPendingInvitations` selektiert `token`)

`GET /api/v1/trip/members` liefert **jedem** Mitglied `inviteUrl: inviteUrl(inv.token, req)` für **alle** offenen
Einladungen. `canManage` steuert nur die UI, nicht die Antwort. Der Token ist eine Bearer-Credential:
`acceptInvitation` (`trip.ts:313-316`) legt den User mit `email: inv.email` **und** `emailVerified: new Date()` an —
der Maillink gilt als Adressbesitz-Nachweis, was beim Kopieren aus der API-Antwort nicht mehr stimmt.

**Angriff:** Mitglied M ruft `GET /api/v1/trip/members`, liest den Token der Einladung an `chef@firma.de`, öffnet
`/register?token=…` bzw. `POST /api/v1/invite/{token}` mit eigenem Passwort → **bestätigtes Konto auf fremder
E-Mail-Adresse** (Impersonation im Team, Einladungen unter fremdem Namen). Das Opfer kann sich anschließend nie
registrieren (409 „exists"). `POST /api/v1/invite/{token}` hat zusätzlich **kein Rate-Limit**.

**Fix:** `inviteUrl` nur bei `iCanManage` in die Antwort aufnehmen; `token` aus `getPendingInvitations` entfernen,
wo er nicht gebraucht wird. Rate-Limit auf `POST /api/v1/invite/[token]`.

---

### [x] K2 · Jedes Mitglied kann Fremde in die Reise einladen (fehlende `canManage`-Prüfung)

**Ort:** `src/app/api/v1/trip/members/route.ts:67-89` (POST) · `src/app/api/v1/trip/invitations/[id]/route.ts:24` (Revoke)

`inviteToTrip(tripId, email, user.name)` wird **ohne jede Berechtigungsprüfung** aufgerufen.
`canManageMembers()` (`src/lib/services/trip.ts:54-62`) existiert und wird bei `DELETE`/`PATCH` auf
`trip/members/[userId]` korrekt benutzt — hier nicht.

**Angriff:** Einfaches Mitglied → `POST /api/v1/trip/members {"email":"komplize@evil.tld"}` → Komplize registriert
sich über den Token-Link und hat Voll-Lese-/Schreibzugriff auf alle Reisedaten (Ausgaben, Belege, Flüge,
Buchungsreferenzen, Kofferanhänger-Tokens). Das Rechte-Modell ist asymmetrisch: **Hinzufügen frei, Entfernen
privilegiert** — nur der Owner kann den Komplizen wieder loswerden. Analog kann jedes Mitglied fremde
Einladungen widerrufen.

**Fix:**
```ts
if (!(await canManageMembers(tripId, user.id))) throw forbidden("Keine Berechtigung");
```
in POST und im Revoke-Zweig. Falls „jeder darf einladen" gewollt ist: `removeFromTrip` symmetrisch erlauben,
selbst Eingeladene wieder zu entfernen.

---

### [x] K3 · Verify-Link landet bei SMTP-Fehler in der HTTP-Antwort — auch in Produktion

**Ort:** `src/app/api/v1/register/route.ts:42-51` · `src/lib/mailer.ts:31-46`

`sendVerificationEmail()` liefert `false` **nicht nur** bei fehlendem `SMTP_HOST`, sondern bei **jedem** Sendefehler
(`catch { return false }`). Die Route gibt dann `verifyUrl` im Response-Body zurück — ohne `NODE_ENV`-Schranke,
und SMTP ist laut Doku optional.

**Angriff:** `POST /api/v1/register {"email":"opfer@firma.de",…}`. Scheitert der Versand (SMTP nicht konfiguriert,
Relay lehnt Empfänger ab, Timeout, temporärer 4xx), enthält die 201-Antwort `verifyUrl`. Angreifer ruft
`/verify?token=…` → voll nutzbares „bestätigtes" Konto auf fremder Adresse. Die Adresse ist danach dauerhaft
blockiert (`registerSelf` → 409).

**Fix:** `verifyUrl` nur bei `process.env.NODE_ENV !== "production"` setzen. In Produktion bei `emailSent === false`
mit **503** antworten und das gerade erzeugte Token verwerfen, statt es auszugeben.

---

### [x] K4 · SSR-Seiten kennen keine Session-Revocation

**Ort:** `src/app/(app)/layout.tsx:13-16` · `src/app/(app)/admin/page.tsx:15-18` · `src/app/api-docs/page.tsx:17-19`
· alle `(app)/*/page.tsx` (`start:23`, `geld:15`, `info:15`, `mitglieder:11`, `fluege:11`, `reiseplaner:13`,
`programm:16`, `profil:12`) · `src/components/AblaufTimeline.tsx:59`

Alle Seiten gaten ausschließlich über `await auth()`, also über das **JWT-Cookie**. `requireUser()` mit frischem
DB-Check auf `active`/`role`/`emailVerified` greift nur in `/api/v1/*` — laut Architektur sind Reads aber SSR,
genau der Pfad ohne Revocation. Auch die Middleware-Rollenprüfung (`auth.config.ts:41`) nutzt die stale Token-Rolle.

**Angriff:** Admin setzt `active:false` oder degradiert einen Admin → der Nutzer liest mit seinem Cookie **bis zu
12 h** weiter alle Reisedaten. Ein degradierter Ex-Admin behält `/admin` (komplette Nutzerliste inkl. E-Mails via
`listUsers()` direkt im Server Component) und `/api-docs` inkl. Spec.

**Fix:** Helper `requireSessionUser()` (Node-Runtime, analog `src/lib/api/session.ts`):
`auth()` + `db.user.findUnique({select:{active,role,emailVerified}})`, bei `!active`/`!emailVerified` Redirect
`/login`. In `(app)/layout.tsx:13` statt `auth()` verwenden, `isAdmin` aus dem DB-`role` ableiten;
`admin/page.tsx:16-17` und `api-docs/page.tsx:18-19` ebenso.

---

### [x] K5 · Client-vergebene Primärschlüssel → persistenter Cross-Tenant-DoS

**Ort:** `prisma/schema.prisma:162` (`TripStop.id String @id`, **kein** `@default`) ·
`src/app/api/v1/trip-stops/route.ts:11` (`id: z.string().min(1).max(100)`) ·
`src/lib/services/tripStops.ts:56-72` (`createMany` mit Client-`id`) ·
identisch: `src/app/api/v1/checklist/route.ts:10` + `src/lib/services/checklist.ts:25-40`

**Angriff:** Angreifer kennt eine Stopp-`id` aus Reise B (Ex-Mitglied, GET liefert alle ids; Screenshot/Export)
und sendet in **seiner** Reise: `PUT /api/v1/trip-stops {"stops":[{"id":"<id-aus-B>",…}]}`. Ab jetzt scheitert
**jedes** `PUT /api/v1/trip-stops` von Reise B mit P2002 → 409, weil `createMany` die global eindeutige id nicht
anlegen kann und die Transaktion zurückrollt. Reise B kann ihre Stopp-Liste **nie mehr speichern**. Gleiches
Squatting für die Checkliste. Nebeneffekt: 409-vs-200 ist ein Existenz-Oracle für fremde ids.

**Fix:** Keine Client-PKs akzeptieren. `TripStop`/`ChecklistItem` auf `@default(cuid())` umstellen, die stabile
Client-Kennung als eigenes Feld `clientId` mit `@@unique([tripId, clientId])` führen;
`replaceTripStops`/`replaceChecklist` darauf mappen. (Migration von Hand schreiben — `migrate dev` bricht
non-interaktiv ab, siehe CLAUDE.md.)

---

## 🟠 Hoch

### [x] H1 · Rate-Limits vollständig umgehbar (XFF-Spoofing) ✔✔

**Ort:** `src/lib/rate.ts:52-56` (`clientIp()`) — genutzt in `luggage/found/[token]:24`, `register:28`,
`password/forgot:21`, `src/auth.ts:37`

`clientIp()` nimmt ungeprüft den **ersten** `X-Forwarded-For`-Eintrag, also den vom Client frei setzbaren Wert.
Beim dokumentierten Self-Hosting (`docker-compose.yml:34-35` exponiert Port 3000 direkt, `SELFHOST.md`) sitzt kein
XFF-überschreibender Proxy davor. Fallback `"unknown"` wirft zudem alle Requests ohne Header in **einen** Bucket.

**Angriff:** `curl -H 'X-Forwarded-For: 1.2.3.<n>' …` mit wechselndem `n` umgeht vollständig: Registrierung 5/h,
Passwort-forgot 5/h, Login-IP 30/15 min, Koffer-Fund 5/10 min → Massen-Accounts, Mail-Flut, unbegrenzte
Fund-Benachrichtigungen mit erfundenen GPS-Koordinaten.

**Fix:** IP nur aus vertrauenswürdiger Quelle: auf Vercel `x-vercel-forwarded-for`; self-hosted den **letzten**
XFF-Eintrag bzw. konfigurierbare Proxy-Tiefe (`TRUSTED_PROXY_HOPS` → `xff.split(",").at(-1 - hops)`);
kein gemeinsamer `"unknown"`-Bucket. Zusätzlich beim Koffer-Endpunkt ein IP-**un**abhängiges Limit pro Token.

---

### [x] H2 · Rate-Limit ist check-then-act → durch Parallelität wirkungslos

**Ort:** `src/lib/rate.ts:20-36`

`findUnique` → `if (rec.count >= limit)` → `update` ist nicht atomar. 200 gleichzeitige Login-Requests lesen alle
`count = 0..1` und passieren, bevor der erste Increment sichtbar ist — der Brute-Force-Schutz (10/15 min/E-Mail)
fällt effektiv weg. Der Code-Kommentar spricht von „ein paar zu viel"; real ist es die ganze Schranke.

**Fix:** Ein atomares Statement, danach entscheiden:
```sql
INSERT INTO "RateLimit"(key,count,"resetAt") VALUES($1,1,$2)
ON CONFLICT(key) DO UPDATE SET
  count    = CASE WHEN "RateLimit"."resetAt" <= now() THEN 1  ELSE "RateLimit".count + 1 END,
  "resetAt"= CASE WHEN "RateLimit"."resetAt" <= now() THEN $2 ELSE "RateLimit"."resetAt" END
RETURNING count;
```
→ `count <= limit` prüfen. Spart zugleich einen Roundtrip (siehe P11).

---

### [x] H3 · `geo/transit` ohne Rate-Limit → Kosten-DoS auf die kostenpflichtige Google-API

**Ort:** `src/app/api/v1/geo/transit/route.ts:14-32` (Google-Call in `googleTransit`, `:67-79`)

Jeder eingeloggte Nutzer kann den Endpunkt in einer Schleife aufrufen; jeder Aufruf ist ein `cache:"no-store"`-Request
auf `maps.googleapis.com/maps/api/directions/json` mit `alternatives=true` = **ein abgerechneter Directions-Call**.
Alle anderen Kostenrouten sind limitiert (flight-lookup 30/h, flight-live 60/h, receipt-scan 30/h, place-link 120/h) —
genau die einzige *wirklich* abgerechnete nicht, und ohne `next: { revalidate }`.

**Fix:** `await enforceRateLimit(\`transit:${user.id}\`, 60, 3600_000)` analog `place-link`, plus serverseitiges
Caching pro `(from,to,mode)`-Paar.

---

### [x] H4 · Karte baut sich bei jedem Tastendruck neu auf und springt zurück (jetzt)

**Ort:** `src/components/TripPlanner.tsx:602-660` (Effekt-Deps `[stops, hotels, route, ready]`) · `:1867-1875`
(Notiz-Input → `setStopNote` → neues `stops`-Array)

**Repro:** Karten-Tab, ≥10 Stopps, in ein „📝 Notiz…"-Feld tippen. Pro Zeichen: `layer.clearLayers()`, N Marker +
N Tooltip-/Popup-DOM-Knoten neu erzeugt, danach `map.fitBounds(...)` (`:653/656`) → die Karte zoomt/verschiebt sich
**bei jedem Zeichen** auf den Gesamtausschnitt zurück, Tippen ruckelt. Zusätzlich re-rendert die ganze `<ol>` inkl.
`DndContext` und je Zeile ein `useSortable` (`:1771-1881`) — bei 100+ importierten Stopps praktisch unbenutzbar.

**Fix:** Notizen aus der Marker-Abhängigkeit lösen: Effekt auf eine Marker-Projektion triggern
(`useMemo` über `id/lat/lng/label/active` als Signatur) statt auf `stops`; `fitBounds` nur, wenn sich die
**Punktmenge** geändert hat.

---

### [x] H5 · Erinnerungs-Timer werden nie abgeräumt → n-fache Benachrichtigungen

**Ort:** `src/components/TagesPlaner.tsx:57-63` · `src/lib/reminders.ts:91-103`

`let cleanup; scheduleReminders(...).then(c => cleanup = c); return () => cleanup?.()` — `scheduleReminders` ist
async (dynamischer Capacitor-Import), beim Aufräumen ist `cleanup` daher fast immer noch `undefined`.

**Repro:** 3 Aufgaben mit Uhrzeit, Benachrichtigungen erlaubt, 5× eine Aufgabe ab-/anhaken → `tasks` ändert sich 10×,
10× neue `setTimeout`-Timer, keiner gelöscht → zur Erinnerungszeit feuern **10 identische** Notifications.

**Fix:** Cleanup synchron über ein Ref:
```ts
const alive = { v: true };
p.then(c => alive.v ? (ref.current = c) : c());
return () => { alive.v = false; ref.current?.(); };
```
und Deps von `tasks` auf `id/time/done` reduzieren.

---

### [x] H6 · Live-Flug-Polling ignoriert Tab-Sichtbarkeit → eigenes Rate-Limit reißt

**Ort:** `src/components/FlightLiveStatus.tsx:91-96` (`setInterval(load, 90_000)` ohne Gate) ·
`src/components/FlightPlanner.tsx:120-133` (klappt am Abreisetag mehrere Flüge automatisch auf)

**Repro:** `/fluege` mit Hin- und Rückflug am selben Tag, Tab in den Hintergrund → 2 × 40 Abfragen/h auf
`flights/live`; das serverseitige Limit von 60/h greift, danach zeigt der Live-Status nur noch Fehler, auch nach
Rückkehr. Kein Unmount-Guard: `setData`/`setLoading` nach dem Zuklappen.

**Fix:** `document.visibilityState`/`navigator.onLine`-Gate im Tick (`PresenceHeartbeat.tsx:18-39` macht es
vorbildlich) + Sofort-Refresh bei Rückkehr.

---

### [x] H7 · `GET /api/v1/expenses` lädt jede Beleg-Data-URL mit — für ein Boolean (jetzt)

**Ort:** `src/lib/services/expensesService.ts:4` (kein `select`) · DTO `src/app/api/v1/expenses/route.ts:37`

`db.expense.findMany({ where: { tripId } })` zieht **alle** Spalten inkl. `receipt` (Data-URL, per Zod bis 1,5 MB);
`toDto` wirft den Blob danach weg (`hasReceipt: !!e.receipt`). Die Liste wird an **5 Stellen** geholt
(`TripDashboard.tsx:64`, `ReiseUebersicht.tsx:66`, `Abrechnung.tsx`, `CustomsCalculator.tsx`,
`ExpenseCalculator.tsx`) → bei 20 Ausgaben mit je ~200 KB Foto **~4 MB Neon→Function pro Aufruf**, mehrfach pro
Seitenaufruf, plus TOAST-Detoasting in Postgres. Teuerster Einzelposten im Backend.

**Fix:** Sauber: Beleg in 1:1-Tabelle auslagern (`ExpenseReceipt { expenseId @unique, data }` — deckt auch das
notierte Object-Store-Ziel ab), Liste prüft nur `receipt: { select: { expenseId: true } }`.
Kleinere Variante: Spalte `hasReceipt Boolean @default(false)`, in `setExpenseReceipt` mitgeschrieben —
in beiden Fällen explizites `select` ohne `receipt`.

---

### [x] H8 · Mitgliederliste pollt alle 30 s inkl. aller Profilbilder (jetzt)

**Ort:** `src/lib/services/trip.ts:42` (`image: true`) · `src/components/TripMembers.tsx:122` ·
`src/app/api/v1/trip/members/route.ts:28-51`

Der Poll dient nur der Presence (`lastSeenAt`), liefert aber jedes Mal die komplette Antwort inkl. `image`
(bis 300 KB je Nutzer, `me/route.ts:21`). 5 Mitglieder ≈ 1 MB alle 30 s = **~120 MB/h pro offenem Tab**, dazu
6 DB-Queries je Poll (`requireUser`, `getActiveTripId`, members, pending, incoming, owner) → **~720 Queries/h**,
120 Function-Invocations/h.

**Fix:** Schlanker Endpunkt `GET /api/v1/trip/presence` → `[{ id, lastSeenAt }]` (1 Query, kein `image`) für den
30-s-Tick; die volle Liste nur beim Mount und nach Mutationen. Einladungs-Queries gehören nicht in den Poll.

---

### [x] H9 · Jede Create-Mutation wartet synchron auf Activity-Insert + Web-Push (jetzt)

**Ort:** `src/lib/services/activityService.ts:43` · `src/lib/services/push.ts:63,67,71` ·
Aufrufer u. a. `expenses/route.ts:58`, `bookings/route.ts:26`, `flights/route.ts:26`, `stamps/collect/route.ts:47`

VAPID ist gesetzt, der Pfad also aktiv: nach dem eigentlichen Insert folgen `activity.create` +
`tripMember.findMany` + `pushSubscription.findMany` + **N HTTPS-Calls an FCM/Mozilla** (je 100–300 ms) — alles
`await` **vor** der Antwort. Eine Ausgabe anzulegen kostet so +0,5–1 s, obwohl der Feed „best-effort" ist.

**Fix:** `import { after } from "next/server"` → `after(() => logActivity({...}))`. Zusätzlich `web-push` erst
nach `pushConfigured()` lazy importieren (siehe P10).

---

## 🟡 Mittel

### Auth / Session

- [x] **M1 · Login mit großgeschriebener E-Mail unmöglich** — `src/auth.ts:44`
  `findUnique({ where: { email } })` nutzt die Roh-Eingabe, alle Schreibpfade speichern lowercase
  (`trip.ts:246`, `users.ts:30`). Postgres vergleicht case-sensitiv → wer sich als `Max@Firma.de` registriert und
  so einloggt, bekommt „E-Mail oder Passwort ist falsch" und ist **faktisch ausgesperrt** (Reset hilft nicht,
  `/forgot` normalisiert und mailt an die lowercase-Adresse). Fix: `email: email.toLowerCase()`.
- [x] **M2 · Passwort-Reset entwertet bestehende Sessions nicht** — `password/reset/route.ts:18-22`,
  `users.ts:49-52`. JWTs tragen keine Version → nach Kontoübernahme bleibt die Angreifer-Session trotz
  Passwortwechsel bis zu 12 h gültig. Fix: `User.sessionVersion Int @default(0)`, in `auth.config.ts:48-54` ins
  Token, Vergleich in `session.ts:27-32` + neuem `requireSessionUser()`; `setUserPassword` erhöht sie mit.
- [x] **M3 · Owner-Lockout über Einladungs-Annahme** — `trip/invitations/[id]/accept/route.ts:13-23` →
  `acceptIncomingInvitation` (`trip.ts:140-169`) hängt die Mitgliedschaft ohne Owner-Prüfung um, während
  `removeFromTrip` genau das blockt (`owner_cannot_leave`, `trip.ts:362`). Folge: Reise mit `ownerId`, der nicht
  mehr Mitglied ist → für alle übrigen Mitglieder liefert `setMemberManage`/`removeFromTrip` „forbidden",
  die Reise ist **dauerhaft ohne Mitglieder-Verwaltung**; der Owner kommt wegen `TripMember.userId @unique` nicht
  zurück. Fix: gleiche Prüfung wie in `removeFromTrip`, bzw. Owner-Übertragung implementieren.

### Externe Integrationen / Netz

- [x] **M4 · `notifyEmail` frei wählbar → SMTP-Relay über den öffentlichen Fund-Endpunkt** —
  `luggage/schema.ts:9`, `luggage/route.ts:26`, `luggageService.ts:46-56`, `mailer.ts:117-120`.
  `label` (80 Zeichen, keine Whitelist) landet in Subject **und** Body → Mail mit angreiferkontrolliertem Inhalt
  von der eigenen SMTP-Domain an ein beliebiges Ziel, ausgelöst über den unauthentifizierten
  `POST /api/v1/luggage/found/<token>`. Fix: `notifyEmail` auf verifizierte Adressen der Reise-Mitglieder
  beschränken (Default `user.email`); `label` auf `\r\n`-freie, druckbare Zeichen.
- [x] **M5 · Discord-Webhook: `@everyone`-Injection** — `luggageService.ts:61-68`. `label`/`ownerName` gehen roh in
  `content`, kein `allowed_mentions`. Fix: `allowed_mentions: { parse: [] }`, Inhalt in `embeds[].fields`,
  Markdown escapen.
- [x] **M6 · Web-Push-Abos ohne Ownership-Prüfung** — `push.ts:33-43`, `push/route.ts:16-30`.
  `upsert({ where: { endpoint } })` schreibt im Update-Zweig `userId` neu → wer einen Endpoint-String kennt, biegt
  das Abo auf sein Konto um; `DELETE ?endpoint=` löscht per `deleteMany({ where: { endpoint } })` **ohne** `userId`
  → jeder eingeloggte Nutzer kann fremde Abos abschalten. Fix: `userId` in beide `where`-Klauseln.
- [x] **M7 · SSRF-Restrisiken in `safeFetch`** — `src/lib/net.ts:41,49-93`.
  (a) DNS-Rebinding: die Prüfung löst auf, `fetch` löst **erneut** auf (im Kommentar `:16-17` als offen benannt);
  (b) kein Port-Filter → Server als Port-Scanner/Relay; (c) `ipv6IsPrivate` erkennt IPv4-in-IPv6 nur in
  Punktnotation, NAT64-Hexform (`64:ff9b::7f00:1`) fällt durch. Fix: auf die geprüfte IP verbinden
  (undici-`Agent` mit eigenem `connect`/`lookup`), Ports auf 80/443, Hex-Varianten ergänzen.
- [x] **M8 · `res.text()` puffert die ganze Antwort, kürzt erst danach → OOM** —
  `geo/resolve/route.ts:141,210` (`(await res.text()).slice(0, 200000)`), obwohl `net.ts:14` ein Größenlimit an der
  Aufrufstelle verspricht. `q=https://attacker.tld/huge` (öffentliche IP, passiert die SSRF-Prüfung) streamt GB in
  den Heap. Fix: `res.body.getReader()` + Byte-Zähler + `reader.cancel()`, sinnvoll als `maxBytes`-Option in
  `safeFetch`.
- [x] **M9 · Maps-Link-Erkennung prüft die ganze URL statt den Host** — `geo/resolve/route.ts:83`.
  Das Regex läuft gegen `url`, nicht gegen den in `:79` ermittelten `host` → `https://attacker.tld/x?ref=google.com/maps`
  gilt als vertrauenswürdiger Maps-Link und geht in den Body-Auswertungspfad. Der Instagram-Check (`:94`) macht es
  richtig. Fix: gegen `host` prüfen, `/maps` separat über `new URL(url).pathname`.
- [x] **M10 · Nominatim/OSRM ohne Rate-Limit, `geo/route` ohne Punkt-Obergrenze** —
  `geo/search/route.ts:19-36`, `geo/route/route.ts:17-42`, `geo/weather/route.ts:9-26`.
  Wechselnde `q`-Werte umgehen den Cache → OSM kann die Produktions-IP sperren und legt damit **alle**
  Geo-Features lahm. `geo/route` prüft nur `points >= 2`, ohne Obergrenze (OSRM-Trip ist quadratisch).
  Fix: Limits (`geo-search` 60/min, `geo-route` 30/min), `points` auf ~25 begrenzen bzw. ausdünnen wie
  `konbini/route.ts:96-99`.
- [x] **M11 · CSP entwertet sich selbst** — `next.config.ts:15-29`. `script-src 'unsafe-inline'` gilt auch in
  Produktion → injizierte Skripte/Handler laufen; `connect-src https:` und `img-src https:` erlauben Exfiltration
  an jeden HTTPS-Host. Es bleibt nur React-Escaping als einzige Schicht. Fix: Nonce + `'strict-dynamic'`
  (Theme-Inline-Script bekommt den Nonce aus der Middleware), `connect-src`/`img-src` auf die realen Hosts
  (RainViewer, CARTO) einengen. `style-src 'unsafe-inline'` kann bleiben.

### Autorisierung / Validierung

- [x] **M12 · `paidById`/`fromId`/`toId` nicht gegen die Mitgliedschaft validiert** —
  `expenses/route.ts:14,56`, `settlements/route.ts:10-11` (im Schema ohne FK, `schema.prisma:292-293`).
  Fremde User-ID → Ausgabe wird einem Nicht-Mitglied zugeschrieben und verzerrt die Abrechnung; Müll-ID löst
  Prisma **P2003** aus, das `handle()` (`http.ts:71-77`, nur P2002/P2025) nicht mappt → **500** statt 400.
  Fix: gegen `getTripMembers(tripId)` prüfen, P2003 auf 400 abbilden.
- [x] **M13 · Kalendarisch unmögliche Daten → 500** — `src/lib/api/dates.ts:8`, `schemas.ts:15-18` prüfen nur
  `/^\d{4}-\d{2}-\d{2}$/`. `{"date":"2026-13-45"}` → `parseDateParam` (`time.ts:24-27`) wirft nackt → 500;
  bei `bookings`/`trip-stops`/`trip-hotels` (String-Spalten) wird Müll **still persistiert** und zerstört die
  Timeline-Sortierung. Fix: `.refine()` mit Round-Trip über `Date.UTC`, zentral.
- [x] **M14 · `DELETE /api/v1/expenses` löscht alle Ausgaben der Reise — ohne Recht, ohne Audit-Eintrag** —
  `expenses/route.ts:70-76` → `clearExpenses` (`expensesService.ts:47-50`). Kein `logActivity`, im Feed unsichtbar.
  Analog `PUT /trip-stops {"stops":[]}` und `PUT /checklist {"items":[]}`. Fix: destruktive Bulk-Ops auf
  Owner/`canManage`, in jedem Fall `logActivity`.

### Frontend / Performance

- [x] **M15 · localStorage nicht an den Nutzer gebunden → Cross-User-Leak** —
  `TripPlanner.tsx:101/481/507` (`reiseplaner:import` = aufgelöste Ortsliste **mit Koordinaten und Notizen**),
  `ExpenseCalculator.tsx:162-175/595`, `TripDashboard.tsx:72` (`japan-budget`, `japan-cat-budgets`).
  Der SW-`DATA_CACHE` ist per `/__owner` an den Nutzer gebunden und `TopNav.tsx:83-89` meldet den Logout —
  für localStorage passiert nichts. **Repro:** A importiert eine Liste, loggt aus; B loggt im selben Browser ein →
  A's Vorschauliste steht da und lässt sich in B's Reise übernehmen. Fix: Keys mit User-ID suffixen oder im
  `LogoutForm`-`onSubmit` löschen.
- [x] **M16 · `/api/v1/me` inkl. Base64-Bild bei jeder Navigation** — `TopNav.tsx:44-50` (`}, [pathname])`).
  Pro Seitenwechsel: 2 DB-Queries (`requireUser` **und** `getUserImage`) + bis 300 KB Data-URL, nur für Name und
  Avatar; in Prod kommt ein zweiter Call aus `PwaRegister.tsx:36` dazu (braucht nur `me.id`).
  Fix: `(app)/layout.tsx:13` hat die Session schon — dort einmalig laden und `userName`/`image`/`userId` als Props
  durchgeben.
- [x] **M17 · Zwei sequenzielle Neon-Roundtrips vor jedem Request** — `session.ts:27` + `trip.ts:16`, in
  **26 Route-Dateien** als `requireUser()` → `getActiveTripId(user.id)`. Beide brauchen nur `session.user.id`
  (aus dem JWT), sind also unabhängig. Fix: `requireTripUser()` mit `Promise.all` (Fallback auf
  `getActiveTripId`, wenn `member === null`).
- [x] **M18 · Presence-Heartbeat hält Neon dauerhaft wach** — `PresenceHeartbeat.tsx:6,26`, `presence/route.ts:13`,
  `trip.ts:70`. 80 Requests/h pro Tab × 2 Queries = 160 Queries/h/Nutzer; bei 6 Leuten ~960 Queries/h.
  Wichtiger: Neon suspendiert nach 5 min Idle — ein 45-s-Takt verhindert das, der Free-Tier (~191 h/Monat) ist
  allein dadurch aufgebraucht. Fix: eine Query (`user.updateMany({ where: { id, active: true }, … })`) statt
  `requireUser` + Update, Intervall auf 2–3 min, „online"-Schwelle anheben.
- [x] **M19 · Wetter-Sidebar = 5 Requests pro Seitenaufruf** — `WeatherWidget.tsx:19-24` (`JP_CITIES` = 5),
  `geo/weather/route.ts:26`, `fx/rate/route.ts:25`. Der externe Call ist per `revalidate` gecacht, die **Function
  läuft aber trotzdem** — 5 Invocations + 5 `requireUser`-Queries für Daten, die 15 min stabil sind.
  Fix: `?cities=all` (ein Call) + `Cache-Control: private, max-age=900` bzw. `3600` auf der Antwort.
- [x] **M20 · `/start` holt `/api/v1/flights` zweimal parallel** — `FlightDayStatus.tsx:32` +
  `TripDashboard.tsx:64`; dasselbe Muster in `ReiseUebersicht.tsx:63-67` (5 Einzelaufrufe).
  Fix: einmal im Server-Layout laden und als Prop weitergeben, oder GET-Promise-Dedupe in
  `src/lib/api/client.ts` (gleiche URL innerhalb ~5 s teilt das Promise).
- [x] **M21 · Tab-Wechsel in `/geld` und `/info` verwirft Formularzustand** — `GeldTabs.tsx:60-63`,
  `InfoTabs.tsx:65-69` (`{active === "x" && <X/>}` → Unmount). **Repro:** Betrag + Bezeichnung eintippen,
  auf „Zoll" und zurück → Formular leer, `GET /expenses` + `GET /fx/rate` laufen erneut. Der Reiseplaner löst
  genau das richtig (gemountet + `hidden`). Fix: gemountet lassen, per `hidden` umschalten.
- [x] **M22 · `loadWeather` feuert bis zu 200 Requests parallel** — `TripPlanner.tsx:958-980`
  (`Promise.all(stops.map(...))`, kein Limit, kein Abort, auch inaktive Stopps). Fix: nur aktive Stopps,
  Parallelität ~5, AbortController im Cleanup.
- [x] **M23 · `importList` läuft nach dem Verlassen der Seite weiter** — `TripPlanner.tsx:1057-1103`
  (sequenzielle Schleife mit `sleep(1100)`, kein Abbruch). **Repro:** 60 Zeilen, „Auflösen", nach 3 s wegnavigieren
  → die Schleife läuft ~63 s weiter, feuert `geo/resolve` und setzt State auf einer unmounteten Komponente; die
  Treffer landen nirgends. Fix: Abbruch-Flag im Ref, im Cleanup setzen, nach jedem `await` prüfen.
- [x] **M24 · „Heute" im Tagesplaner ist nachts der Vortag** — `TagesPlaner.tsx:22-24`, `reminders.ts:54`
  (`new Date().toISOString().slice(0,10)` = UTC). **Repro:** 01:30 Berlin (UTC+2) → Vortag wird angezeigt, „Heute"
  ändert nichts; Folgefehler: `scheduleReminders` verwirft alle Erinnerungen (`dateISO !== todayISO`).
  `TripDashboard.tsx:30-33` und `FlightPlanner.tsx:10-13` machen es korrekt, `src/lib/time.ts#todayParam`
  existiert bereits. Fix: den Helper verwenden.
- [x] **M25 · `Booking.url` ohne Schema-Prüfung** — `bookings/schema.ts:17` (`z.string().max(500)`) +
  `BookingPlanner.tsx:265-274` (`href={b.url}`). React 19 rendert `javascript:` nicht mehr (kein aktives XSS),
  aber „www.klook.com/x" wird ein **relativer** Link → `/programm/www.klook.com/x`, für alle Mitglieder kaputt.
  Fix: `^https?://` im Zod-Schema, fehlendes `https://` im Client ergänzen.

---

## 🟢 Niedrig / Kleinkram

### Auth

- [x] **N1 · Passkey-Registrierung verlangt keine User-Verification, der Login schon** —
  `passkey/register/options/route.ts:30` (`userVerification/residentKey: "preferred"`), `register/verify/route.ts:21-26`
  (kein `requireUserVerification`) vs. `auth/options/route.ts:13` + `auth.ts:93` (`required`).
  Ein ohne UV/Resident-Key registrierter Passkey wird beim Login **zwangsläufig** abgelehnt (`allowCredentials: []`
  braucht Discoverable Credentials) — der Fehler zeigt sich erst beim Login. Fix: beides auf `"required"`.
- [x] **N2 · Credential-Upsert ohne Besitzer-Bindung** — `passkey/register/verify/route.ts:37-47`.
  `upsert({ where: { id }, update: { counter } })`: existiert die Credential-ID bei einem **anderen** Nutzer, wird
  `userId` nicht gesetzt, aber `counter` überschrieben (schwächt den Klon-Schutz in `auth.ts:97`) und
  `{verified:true}` gemeldet. Fix: vorher `findUnique`, bei Fremdbesitz 409.
- [x] **N3 · Challenge-Cookie wird beim Passkey-Login nicht entwertet** — `auth.ts:78-107`, `webauthn.ts:24`.
  300 s gültig, serverseitig nicht als verbraucht markiert; bei Authenticators mit Counter 0 (Apple/Google) greift
  keine Counter-Regel → Assertion innerhalb des Fensters wiederverwendbar. Register- und Login-Flow teilen zudem
  denselben Cookie-Namen. Fix: Nonce in kurzlebiger Tabelle, atomar entwerten; getrennte Cookie-Namen.
- [x] **N4 · Account-Enumeration & gezielter Login-Lockout** — `register/route.ts:33-35` (409 „existiert bereits"
  als Orakel, während `/forgot` bewusst generisch ist), `auth.ts:41-50` (Abbruch **vor** `bcrypt.compare` →
  Timing-Unterschied; `login:<email>`-Zähler wird auch bei **korrektem** Passwort verbraucht → ein Angreifer kann
  ein Opfer mit 10 Fehlversuchen/15 min aussperren). Fix: generische 202 + „Konto existiert"-Mail; Dummy-`compare`;
  Zähler nur bei Fehlschlag erhöhen, nach Erfolg zurücksetzen.
- [x] **N5 · `/verify` verbraucht das Einmal-Token per GET im Server Component** — `verify/page.tsx:17-23`.
  Link-Scanner (Outlook SafeLinks, Mail-Gateways, Prefetch) entwerten das Token vor dem Klick → „ungültig oder
  bereits verwendet", und es gibt keinen Resend-Endpunkt. Fix: Button + POST/Server Action, plus „Mail erneut senden".
- [x] **N6 · Öffentliche Routen per `startsWith`** — `auth.config.ts:25-27`. `["/register","/verify","/forgot","/reset","/k/"]`
  macht jede Route mit diesem Präfix öffentlich (z. B. ein künftiges `/registered-users`). Latente Fußangel.
  Fix: `pathname === p || pathname.startsWith(p + "/")`.

### Integrationen / Public

- [x] **N7 · Koffer-Fund verrät den Konfigurationszustand des Owners** — `luggage/found/[token]/route.ts:24,32`.
  `{ notified: sent.email || sent.discord }` sagt dem anonymen Finder, ob überhaupt eine Benachrichtigung
  hinterlegt ist — genau das, was der Kommentar in `:31` vermeiden will. Fix: konstant `{ ok: true }` +
  `enforceRateLimit(\`luggage-found:${token}\`, 20, 3600_000)` **ohne** IP-Anteil.
- [x] **N8 · `/k/[token]` ist indexierbar** — `src/app/k/[token]/page.tsx:1-38`; weder `robots.ts` noch
  `robots`-Metadata vorhanden. Teilt ein Finder den Link, landet die Token-URL im Index → `ownerName` + Label
  lesbar, Falschmeldungen möglich (das Token selbst ist mit 72 Bit nicht erratbar). Fix:
  `metadata.robots = { index: false, follow: false }` + `X-Robots-Tag: noindex` für `/k/:token*`.
- [x] **N9 · `geo/place-link` prüft erst nach dem Fallback-Zweig die Session** — `geo/place-link/route.ts:90-116`.
  Ohne Key oder ohne `q` antwortet die Route **vor** `requireUser()` mit einem Redirect → unauthentifizierter
  Redirector (kein Open Redirect, `fallbackUrl:22-27` nagelt das Ziel fest, aber als Traffic-Relay nutzbar).
  Fix: `requireUser()` an den Anfang.
- [x] **N10 · `Infinity` passiert die Koordinatenprüfung** — `geo/konbini/route.ts:92-107`, `geo/route/route.ts:28`,
  `geo/transit/route.ts:44`. `Number("Infinity")` ist nicht `NaN` → `around:120,Infinity,Infinity` in der
  Overpass-QL; kein Injection-Vektor, aber alle drei Spiegel laufen je 12 s ins Timeout und reißen `maxDuration = 30`.
  Fix: `Number.isFinite` + Bereichsprüfung, Spiegel-Timeout auf ~8 s.
- [x] **N11 · Beleg-Scan: `media_type` ungeprüft, Limit über dem Anbieter-Limit** — `expenses/scan/route.ts:12,48-50`.
  `max(8_000_000)` erlaubt ~6 MB, Anthropic-Grenze ist 5 MB → verlässliche 502 statt verständlicher Meldung;
  `media_type` kommt roh aus der Data-URL (`image/svg+xml` möglich), Base64-Inhalt wird nie als Bild verifiziert.
  Fix: ~5 MB **Roh-Bytes**, MIME-Whitelist, Magic-Bytes prüfen.

### Frontend

- [x] **N12 · Labels ohne `htmlFor`** (systematisch, ~35 Felder) — `FlightPlanner.tsx:285,294,314-361`,
  `BookingPlanner.tsx:128-205`, `KofferManager.tsx:104-128`, `TripPlanner.tsx:1424`,
  `ExpenseCalculator.tsx:355,367,407`. Klick aufs Label fokussiert nichts, Screenreader liest ein unbenanntes Feld.
  Richtig gemacht in `TripPlanner.tsx:1642/1649`, `ExpenseCalculator.tsx:586/590`.
- [x] **N13 · „Alle löschen" ohne Rückfrage, wirkt teamweit und unwiderruflich** — `TripPlanner.tsx:1756-1762`
  → `clearAll()` (`:1176`) → `persistStops([])`; `ExpenseCalculator.tsx:467-473` → `DELETE /api/v1/expenses`.
  Sitzt direkt neben „🌦 Wetter". Fix: Bestätigung oder Undo-Toast.
- [x] **N14 · `LogoutForm` im Render-Body definiert** — `TopNav.tsx:79-96`. Elementtyp pro Render neu → React
  verwirft das `<form>`-DOM und baut es neu. Fix: auf Modul-Ebene ziehen.
- [x] **N15 · Uhr tickt doppelt, unsichtbar und im Hintergrund weiter** — `TopNav.tsx:175,340`,
  `JapanClock.tsx:24-28/37-41`. Auf Mobil läuft die per CSS versteckte Desktop-Instanz im 1-s-Takt und rechnet je
  Tick zweimal `toLocaleString`, obwohl `compact` nur HH:MM zeigt. Fix: `diffHours` memoisieren, 1 s nur bei
  Sekundenanzeige, bei `visibilityState === "hidden"` pausieren.
- [x] **N16 · Alle QR-Codes werden bei jeder Änderung neu erzeugt** — `KofferManager.tsx:39-56` (`}, [tags]`).
  6. Anhänger anlegen → alle 6 × 512 px neu, Bilder flackern auf den Pulse-Platzhalter. Fix: nur fehlende erzeugen
  und in den State mergen.
- [x] **N17 · Ein fehlgeschlagener Städte-Request blendet das ganze Wetter-Widget aus** —
  `WeatherWidget.tsx:18-31` (`Promise.all` + `.catch(() => setError(true))`), liegt im `(app)`-Layout.
  Fix: `Promise.allSettled`.
- [x] **N18 · Import-Zwischenablage wird pro Tastendruck serialisiert** — `TripPlanner.tsx:504-514`
  (`JSON.stringify` über 200 Kandidaten + Text bei jedem Zeichen). Fix: 300–500 ms entprellen.
- [x] **N19 · Irreführender Hinweistext** — `TripPlanner.tsx:2144-2146`: „Orte werden lokal in diesem Browser
  gespeichert" — sie liegen in der DB und sind mit dem **gesamten Team** geteilt. Für eine Kollaborations-App eine
  falsche Datenschutzaussage.

### Validierung / Limits

- [x] **N20 · Unbegrenzte Feldlängen ohne Rate-Limit** — `checklist/route.ts:10` (`id: z.string().min(1)`, **keine**
  Obergrenze, 500 Items pro PUT); `expenses/[id]/route.ts:15-22` (1,5 MB Data-URL, kein `enforceRateLimit`);
  `trip-stops/route.ts:11-25` (200 × (label 5000 vor `.slice(300)` + note 500) ≈ 1,1 MB Request).
  Fix: `.max(100)` auf die Checklisten-id, Rate-Limit auf die PUT-Replace-Endpunkte und `PATCH /expenses/{id}`,
  Längen **vor** dem Kürzen validieren.

### DB / Serverless (Performance)

- [x] **P9 · `/programm` rendert die Ablauf-Timeline immer** — `programm/page.tsx:25` →
  `AblaufTimeline.tsx:61-67`. Der SSR-Node wird als Prop übergeben, also auch bei `?tab=tagesplaner` berechnet:
  `getActiveTripId` + 4 parallele Queries umsonst.
  **Behoben ohne M21 zurückzudrehen:** die Seite rendert die Timeline nur, wenn ihr Tab beim Aufruf aktiv ist
  (`!tab || tab === "ablauf"`). Wechselt man später dorthin, holt die Server Action `loadAblauf`
  (`src/app/actions/ablauf.tsx`) den fertigen Server-Knoten nach — der Client-Zustand der übrigen Tabs bleibt
  erhalten, was echte Tab-Navigation zerstört hätte.
- [x] **P10 · Cold-Start: `web-push`/`nodemailer` statisch in allen Mutations-Bundles; kein Neon-Adapter**
  *(bei Wachstum)* — `push.ts:1` → über `activityService.ts:2` in **jeder** Create-Route; `schema.prisma:4` ohne
  `driverAdapters`. Fix: `const webpush = (await import("web-push")).default` erst nach `pushConfigured()`;
  mittelfristig `@prisma/adapter-neon` (HTTP/WebSocket) statt TCP+TLS pro kaltem Lambda (~100–300 ms).
- [x] **P11 · `RateLimit`- und `Token`-Zeilen werden nie aufgeräumt** *(bei Wachstum)* — `rate.ts:20-35`,
  `schema.prisma:80-86`. Der Index `@@index([resetAt])` existiert, aber nichts löscht abgelaufene Fenster;
  IP-Keys (`login-ip:*`, `register:*`, `luggage-found:<token>:<ip>`) wachsen unbegrenzt, verbrauchte `Token`-Zeilen
  bleiben liegen. Fix: Vercel-Cron (`vercel.json` → `crons`) mit `deleteMany({ where: { resetAt: { lt: new Date() } } })`
  und analog für `Token`; Zähler atomar (siehe H2) spart zusätzlich einen Roundtrip.
- [x] **P12 · Composite-Indizes für die genutzten `orderBy`-Kombinationen fehlen** *(bei Wachstum)* —
  `prisma/schema.prisma`: `Expense`/`Settlement`/`LuggageTag` hätten gern `@@index([tripId, createdAt])`,
  `Booking` `@@index([tripId, date, time])`, `Flight` `@@index([tripId, departure])`.
  **Umgesetzt** (Migration `20260807130000`): die reinen `tripId`-Indizes wurden durch die Composite-Varianten
  **ersetzt** — ein Index auf `(tripId, x)` bedient Abfragen auf `tripId` allein genauso gut (Präfix-Regel),
  es kommt also kein Index hinzu, sondern jeder wird nur passender. Damit entfällt auch der Schreib-Overhead,
  der gegen die Umsetzung gesprochen hätte.
- [x] **P13 · `position` per `count()` → Extra-Roundtrip + Race** *(bei Wachstum)* — `tripHotels.ts:18`,
  `tripStops.ts:21`, `wishlist.ts:15`. Zwei gleichzeitige Adds bekommen dieselbe `position`.
  Fix: `MAX(position)+1` in einer Transaktion, oder `position` weglassen und nach `createdAt` sortieren.
- [x] **P14 · PUT-Replace liest den Altbestand außerhalb der Transaktion** *(jetzt, Korrektheit)* —
  `tripStops.ts:51-72`, `checklist.ts:20-40`. Das `findMany` für die `createdByName`-Übernahme läuft **vor**
  `$transaction([deleteMany, createMany])` → ein paralleler PUT zwischen Read und Delete ordnet Ersteller-Namen
  falsch zu. Fix: interaktive Transaktion (`db.$transaction(async tx => {…})`) mit dem Read drin.
- [x] **P15 · Schema-Datentypen** *(bei Wachstum)* —
  Datumsfelder als `String` (`TripStop.date`, `TripHotel.checkIn/checkOut`, `Booking.date/time`) statt `@db.Date`;
  `Booking.kind`/`Expense.category` als `String` statt Prisma-`enum`; Data-URLs in `Expense.receipt`/`User.image`.
  **Umgesetzt in drei Etappen**, jede einzeln migriert und getestet:
  1. **Enums** (`20260807140000`) — `Expense.category` → `ExpenseCategory`, `Booking.kind` → `BookingKind`.
     Zod validiert per `z.nativeEnum`, die Kategorienliste im Beleg-Scan und `BOOKING_KINDS` kommen aus dem
     Enum, und `src/lib/expenses.ts` ist per `satisfies` + type-only-Import daran gebunden (Client-Bundle
     bleibt frei von Prisma). Der Compiler deckte dabei ein ungetyptes Mapping in `bookingsService` auf.
  2. **Beleg-Auslagerung** (`20260807150000`) — eigene Tabelle `ExpenseReceipt`; der Blob kann gar nicht mehr
     versehentlich mitgeladen werden, und der Weg zum Object-Store ist nur noch ein Tausch der Ablage.
  3. **Datums-Spalten** (`20260807160000`) — `TripStop.date`, `TripHotel.checkIn/checkOut`, `Booking.date`
     auf `@db.Date`. **Der API-Vertrag bleibt unverändert:** DTOs wandeln über `toDateParam`, Services parsen
     mit `parseDateParam` — kein Client musste angepasst werden.

  **Eine begründete Ausnahme:** `User.image` bleibt in der `User`-Zeile. Anders als der Beleg wird das Feld
  bei praktisch **jedem** SSR-Request gebraucht (TopNav-Avatar, siehe M16); eine eigene Tabelle bedeutete
  dort eine zusätzliche Query pro Seitenaufruf — also eine Verschlechterung. Postgres hält die Kernzeile über
  TOAST ohnehin schmal. Stattdessen wurde das Größenlimit von 300 KB auf **60 KB** gesenkt (ein 128×128-JPEG
  braucht real 5–15 KB), damit ein manipulierter Client die Antwortgröße jeder Seite nicht aufblähen kann.
  `Booking.time` bleibt ebenfalls `String`: der Wert ist optional und wird als `""` gespeichert, was sich
  nicht nach `time` casten lässt — als `HH:MM` sortiert er lexikografisch korrekt.

---

## ✅ Was gut gelöst ist

Damit beim Aufräumen nichts kaputtgeht, was bewusst so gebaut wurde:

**Autorisierung**
- **Tenant-Auflösung durchgängig serverseitig:** kein Endpunkt akzeptiert `tripId` aus Body, Query oder Pfad —
  immer `getActiveTripId(user.id)` (per grep über alle `src/app/api/v1/**` bestätigt). Kein klassischer Trip-IDOR.
- **Kein `findUnique`/`update`/`delete` ohne Tenant-Bedingung** in den Object-Services: konsequent
  `deleteMany`/`updateMany` mit `where {id, tripId}` bzw. `findFirst` in derselben Transaktion
  (`bookingsService.ts:92`, `flightsService.ts:96`, `tripHotels.ts:40`, `wishlist.ts:32`), `count === 0` → 404 →
  kein Existenz-Leak.
- **Keine Rollen-Eskalation:** `role` ist außer in `createUser` (admin-only) nirgends schreibbar; `PATCH /me`
  akzeptiert nur `image` (mit SVG-Verbot), `userUpdateBody` nur `active`. Zod strippt unbekannte Keys → kein
  Mass Assignment. Die Rollen-Hierarchie in `removeFromTrip`/`setMemberManage` (Owner unantastbar, Verwalter darf
  keine Verwalter entfernen) ist präzise.

**Auth**
- **Token-Handling:** 256-Bit CSPRNG (`randomBytes(32)`) für Verify/Reset/Invite, TTLs 24 h / 1 h / 14 d, ältere
  offene Token in derselben Transaktion verworfen, Einlösung atomar per `updateMany({where:{id, usedAt:null}})`
  → echtes Single-Use.
- **Einladungsflow ohne Force-Move**, E-Mail-Bindung geprüft, Token innerhalb der Transaktion entwertet.
- **`requireUser` liest `active`/`role`/`emailVerified` bei jedem API-Request frisch** (echte Revocation im
  API-Pfad), `session.maxAge` 12 h, Login prüft `active` **und** `emailVerified`, `/forgot` konsequent
  enumerationsfrei, Seed blockiert in Prod ohne `ALLOW_PROD_SEED`.
- **WebAuthn-Login sauber gebunden:** `expectedOrigin`/`expectedRPID` aus der Config, `requireUserVerification`,
  Counter-Fortschreibung, `assertWebauthnConfig()` verhindert stillen HTTP-Fallback in Prod.

**Integrationen**
- **LLM-Output wird strikt nachvalidiert** (`expenses/scan/route.ts:86-90`): `yen` über `Number`/`Math.max(0,…)`,
  Kategorie gegen Whitelist, Label auf 40 Zeichen — Prompt-Injection über den Kassenzettel schreibt nichts
  Beliebiges in die DB.
- **Keine Secret-Leaks zum Client:** keine einzige `NEXT_PUBLIC_*`-Variable, `process.env` in Client-Komponenten
  nur für `NODE_ENV`; `.env` gitignored und nicht im Index.
- **`notifyEmail` erreicht die öffentliche Seite nie** (`k/[token]/page.tsx:29-35` übergibt es gar nicht),
  Koffer-Tokens 72 Bit aus `randomBytes`.
- **Data-URL-Uploads eingezäunt:** SVG verboten (`me/route.ts:23`, `expenses/[id]/route.ts:20`), harte Limits,
  Beleg-Blob in der Listenantwort durch `hasReceipt` ersetzt.
- **API-Spec doppelt Admin-gegated** (`requireAdmin` + eigene Rollenprüfung in `api-docs/page.tsx`), und die
  Google-Places-Nutzung bewusst auf die kostenlose IDs-only-Feldmaske begrenzt.

**Performance**
- **Keine N+1-Queries** im Server-Code: kein `await` in Schleifen, keine Query in `map`.
- **Multi-Step-Mutationen transaktional**: `createBooking`/`createFlight` mit `syncExpense` in `$transaction`,
  P2002-Races abgefangen (`trip.ts:27`), `collectStamp` per `@@unique([tripId, stampKey])`-Upsert idempotent.
- **Externe Calls gecacht** (`revalidate` 120 s–1 h auf AeroDataBox, OSRM, Overpass, Open-Meteo, FX) plus
  `maxDuration` und Spiegel-Fallback für Overpass. `listActivity` mit hartem `take` ≤ 50 und passendem Index.

**Frontend**
- **Leaflet-XSS konsequent vermieden:** Tooltips/Popups als DOM-Knoten mit `textContent`
  (`TripPlanner.tsx:615-618, 707-756`), nie HTML-Strings; alle sieben `target="_blank"` mit
  `rel="noopener noreferrer"`.
- **`PresenceHeartbeat.tsx:18-39` ist die Referenz für Polling:** Sichtbarkeits- **und** Online-Gate,
  Sofort-Ping bei Rückkehr, vollständiges Cleanup.
- **Karten-Tab-Wechsel korrekt:** Karte bleibt gemountet, Sichtbarkeit über einen Wrapper statt über die
  className des Leaflet-Containers, `invalidateSize` + Tile-Redraw per doppeltem rAF
  (`TripPlanner.tsx:582-599, 2150-2159`) — genau die zwei Fallen an dieser Stelle.
- **Bilder werden clientseitig verkleinert** (`lib/image.ts`: Beleg max 1000 px/q0.6, Avatar 128×128).
- **API-Client mit sauberem Fehlerpfad** (`lib/api/client.ts`): tolerant gegenüber Nicht-JSON, Toast nur bei
  Mutationen.

---

## Umsetzungsnotizen (wo die Lösung von der Empfehlung abweicht)

- **M21** — statt „alle Tabs gemountet lassen" ein **lazy mount**: ein Tab wird erst beim ersten
  Öffnen gemountet und bleibt es danach (`src/components/TabPanel.tsx`). Sofortiges Mounten aller
  Tabs hätte beim Seitenaufruf die Requests jedes Bereichs ausgelöst — auch für Tabs, die niemand
  anfasst.
- **M20** — der GET-Dedupe im api-Client (`src/lib/api/client.ts`) fasst **nur laufende** Anfragen
  zusammen, ohne Zeitfenster. Ein Zeit-Cache (auch 1–2 s) hätte einer Komponente, die direkt nach
  einem Write neu lädt, die alte Antwort geliefert.
- **M15** — zusätzlich zum Logout-Cleanup ein Besitzer-Marker (`syncStorageOwner`), weil ein
  Nutzerwechsel nicht immer über „Abmelden" läuft. Gleiches Prinzip wie der `/__owner`-Marker des
  Service-Worker-Caches.
- **M18** — Heartbeat-Takt 45 s → 2 min **und** die Online-Schwelle in `TripMembers` 2 min → 5 min;
  beides gehört zusammen, sonst erschiene jeder als offline, während die App offen ist.
- **M11** — die CSP zog von `next.config.ts` in die Middleware, weil ein Nonce requestabhängig ist.
  Nebenwirkung: der Middleware-Matcher musste von `api` auf `api/` präzisiert werden, sonst wäre
  `/api-docs` aus der CSP gefallen. `style-src 'unsafe-inline'` bleibt (Leaflet/Swagger setzen
  Styles per Attribut) — ohne Code-Ausführung ist das das deutlich kleinere Übel.
- **M7** — DNS-Rebinding bleibt als Restrisiko offen; ein Pinning der geprüften IP beim Connect
  bräuchte einen eigenen undici-Dispatcher. Umgesetzt sind Port-Whitelist (80/443) und die
  NAT64-/Hex-Varianten in der IPv6-Prüfung.

---

## Verifikation

Nach jedem Batch: `npm run build` im Container grün, danach `docker compose restart app`.
Zusätzlich ein Durchlauf mit headless Chromium im Container:

- **Funktional:** Login → `/start`, dann `/reiseplaner`, `/programm`, `/info`, `/geld`, `/fluege`,
  `/mitglieder` — keine JS-Fehler; Tab-Wechsel in `/geld` behält getippte Eingaben (M21);
  `GET /api/v1/me` taucht im Netzwerk-Log gar nicht mehr auf (M16).
- **CSP gegen einen echten Prod-Build** (`next start`, `NODE_ENV=production`): **0 Verstöße**,
  Hydration läuft, Leaflet-Kacheln laden, Swagger UI und die öffentliche Kofferfinder-Seite
  funktionieren unverändert.
- `Cache-Control` auf `fx/rate` (`max-age=3600`) und `geo/weather` (`max-age=900`) per Request geprüft.

**Abschlusslauf (nach allen Batches, gegen `next start` mit `NODE_ENV=production`):**
Login, dann `/start`, `/reiseplaner`, `/programm`, `/geld`, `/info`, `/fluege`, `/mitglieder`,
`/profil`, `/admin`, `/api-docs` — alle gerendert, **0 CSP-Verstöße, 0 JS-Fehler**, Tab-Zustand bleibt.

Gezielt nachgewiesen statt nur angenommen:
- **N4**: Registrierung liefert für bekannte und unbekannte Adressen identische Antworten.
- **N5**: `/verify?token=…` übersteht zwei GETs, ohne den Token zu verbrauchen; Resend antwortet generisch.
- **N3**: Challenge lässt sich genau einmal einlösen.
- **N12**: 29/29 Labels zeigen auf ein existierendes Feld, keine doppelten IDs.
- **P11**: Cron-Endpunkt weist ohne und mit falschem Secret mit 401 ab.
- **P13**: Der erste Fix (normale Transaktion) **fiel im Test durch** — drei parallele Adds bekamen alle
  Position 0, weil READ COMMITTED das nicht verhindert. Erst die serialisierbare Transaktion mit Retry
  liefert 0/1/2.
- **Login-Regression** nach dem Umbau von `authorize`: Fehlversuch zählt hoch, korrektes Passwort meldet an
  und setzt den Zähler zurück.

---

## Was noch offen ist

Von den ursprünglichen 52 Befunden: **nichts.**

Es bleiben zwei bewusst akzeptierte Restrisiken, die keine eigenen Befunde sind:

- **DNS-Rebinding in `safeFetch`** (aus M7): ein Pinning der geprüften IP beim Connect bräuchte einen
  eigenen undici-Dispatcher. Umgesetzt sind Port-Whitelist (80/443), NAT64-/Hex-Erkennung und manuelles
  Verfolgen jedes Redirect-Hops.
- **`web-push` im Server-Bundle** (aus P10): der Import ist lazy, Webpack bündelt die Bibliothek serverseitig
  aber weiterhin mit — gespart wird die Modul-Initialisierung, nicht die Bundle-Größe. Der zweite Teil des
  Befunds, ein Prisma-Neon-Adapter (HTTP/WebSocket statt TCP+TLS pro kaltem Lambda), ist nicht umgesetzt.

---

## ⚠️ Vor dem nächsten Deploy

- **`CRON_SECRET` in Vercel setzen** (Production). Ohne das Secret antwortet `/api/v1/cron/cleanup` mit 401
  und die Tabellen `RateLimit`, `Token` und `WebauthnChallenge` werden nie aufgeräumt.
- Die vier Migrationen laufen automatisch mit (`vercel.json` → `prisma migrate deploy`). Dafür muss
  `DIRECT_URL` gesetzt sein, sonst schlägt der Build fehl.
- **Bestehende Passkeys:** N1 stellt die Registrierung auf `residentKey: "required"` um. Bereits
  registrierte Passkeys funktionieren weiter; wer bisher einen nicht-discoverable Passkey angelegt hatte
  (der beim Login ohnehin abgelehnt wurde), muss ihn neu einrichten.
- **Registrierung antwortet jetzt generisch** (N4): „E-Mail existiert bereits" erscheint nicht mehr in der
  API-Antwort, sondern nur noch als Mail an den Inhaber. Support-Anfragen entsprechend einordnen.
