#!/bin/sh
# Auslöser für die beiden Cron-Endpunkte beim Self-Hosting.
#
# Auf Vercel übernimmt das `vercel.json` — dort allerdings nur für den
# Aufräum-Job: der Hobby-Tarif erlaubt **einen** Lauf pro Tag, und ein Flugstatus,
# der einmal nachts geprüft wird, ist wertlos. Hier gibt es diese Grenze nicht.
#
# ⚠️ Bewusst eine Schleife statt `crond`. Busybox-`crond` startet seine Jobs mit
# einer minimalen Umgebung — `CRON_SECRET` wäre dort schlicht nicht gesetzt, und
# der Job liefe still in 401 (der Endpunkt antwortet ja korrekt). Den Umweg über
# eine Datei, die die Umgebung nachlädt, spart diese Schleife ein; den Neustart
# nach einem Absturz übernimmt `restart: unless-stopped`.
#
# ⚠️ Der genaue Takt ist unkritisch: `isCheckDue` im Endpunkt entscheidet selbst,
# ob ein Flug abgefragt wird. Der Aufrufer darf beliebig oft klopfen — deshalb
# ist auch ein Drift der Schleife (Laufzeit + sleep) ohne Belang.
set -eu

: "${CRON_SECRET:?CRON_SECRET fehlt — ohne Secret sind die Endpunkte gesperrt.}"
BASE="${CRON_BASE_URL:-http://app:3000}"
INTERVAL="${CRON_INTERVAL_SECONDS:-900}"
CLEANUP_HOUR="${CRON_CLEANUP_HOUR:-4}"

log() { echo "$(date -u '+%Y-%m-%d %H:%M:%S') $*"; }

call() {
  # Fehler dürfen die Schleife nie beenden: ein Netzaussetzer ist kein Grund,
  # den Flugstatus für den Rest der Reise einzustellen.
  code=$(curl -sS -o /tmp/cron-out -w '%{http_code}' -m 60 \
    -H "Authorization: Bearer $CRON_SECRET" "$BASE$1" 2>/tmp/cron-err || echo "000")
  if [ "$code" = "000" ]; then
    log "$1 -> nicht erreichbar: $(head -c 200 /tmp/cron-err 2>/dev/null)"
  else
    log "$1 -> $code $(head -c 300 /tmp/cron-out 2>/dev/null)"
  fi
}

log "Start — Ziel $BASE, Takt ${INTERVAL}s, Aufräumen ab ${CLEANUP_HOUR}:00 UTC"
last_cleanup=""

while true; do
  call /api/v1/cron/flight-status

  # Aufräumen einmal je Kalendertag (UTC), frühestens zur eingestellten Stunde.
  today=$(date -u +%Y-%m-%d)
  hour=$(date -u +%H)
  hour=${hour#0}            # „08" ist in manchen Shells oktal — Null entfernen,
  hour=${hour:-0}           # „00" wird dabei leer.
  if [ "$today" != "$last_cleanup" ] && [ "$hour" -ge "$CLEANUP_HOUR" ]; then
    call /api/v1/cron/cleanup
    last_cleanup="$today"
  fi

  sleep "$INTERVAL"
done
