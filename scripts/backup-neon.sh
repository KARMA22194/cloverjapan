#!/bin/bash
#
# Tägliche Sicherung der Neon-Produktionsdatenbank (Clover Japan).
#
# WARUM ES DAS BRAUCHT: Neons Rückspul-Fenster steht in diesem Projekt auf
# 6 Stunden (`history_retention_seconds: 21600`). Alles, was länger als einen
# halben Tag unbemerkt bleibt, ist ohne eigene Sicherung verloren — ebenso der
# Fall, dass das Projekt selbst wegfällt. Drin stecken die Ausgaben mit den
# eingefrorenen Wechselkursen, die Belege, die Abrechnung, die Stempel und der
# ganze Reiseablauf; rekonstruieren lässt sich davon nichts.
#
# AUFRUF
#   scripts/backup-neon.sh            # einmalig von Hand
#   (täglich über ~/Library/LaunchAgents/de.cloverjapan.backup.plist)
#
# VORAUSSETZUNGEN: Docker läuft, `NEON_API_KEY` steht in der `.env`.
# `pg_dump` kommt aus dem Postgres-Image — auf dem Mac ist es nicht installiert,
# und die Version MUSS mindestens so neu sein wie der Server (Neon: 18).

set -euo pipefail

# launchd startet mit einem sehr kurzen PATH; Docker liegt nicht darin.
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${CLOVER_BACKUP_DIR:-$HOME/Documents/CloverJapan-Backups}"
KEEP="${CLOVER_BACKUP_KEEP:-14}"
PG_IMAGE="postgres:18-alpine"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
die() { log "FEHLER: $*" >&2; exit 1; }

command -v docker >/dev/null || die "docker nicht gefunden."
docker info >/dev/null 2>&1 || die "Docker läuft nicht (Docker Desktop starten)."

# ── Zugangsdaten ──────────────────────────────────────────────────────────
# ⚠️ Der Schlüssel wird aus der .env gelesen und NIE ausgegeben. Die
# Verbindungs-URL wandert weiter unten als Umgebungsvariable in den Container,
# nicht als Argument: Argumente stehen in der Prozessliste und wären damit für
# jeden auf dem Rechner lesbar.
[ -f "$PROJECT_ROOT/.env" ] || die "Keine .env unter $PROJECT_ROOT"
NEON_API_KEY="$(grep -E '^NEON_API_KEY=' "$PROJECT_ROOT/.env" | head -1 | cut -d= -f2- | tr -d '"'"'"' \r')"
[ -n "$NEON_API_KEY" ] || die "NEON_API_KEY fehlt in der .env"
export NEON_API_KEY

API="https://console.neon.tech/api/v2"

api() { curl -fsS -H "Authorization: Bearer $NEON_API_KEY" "$@"; }

# Projekt und Standard-Branch nicht fest verdrahten: wer die Reise auf ein neues
# Projekt umzieht, soll nicht wochenlang eine leere Sicherung schreiben.
PROJECT_ID="$(api "$API/projects" | python3 -c 'import json,sys; print(json.load(sys.stdin)["projects"][0]["id"])')" \
  || die "Projektliste nicht abrufbar (API-Key gültig?)"
BRANCH_JSON="$(api "$API/projects/$PROJECT_ID/branches")"
BRANCH_ID="$(printf '%s' "$BRANCH_JSON" | python3 -c '
import json,sys
b=json.load(sys.stdin)["branches"]
print(next((x for x in b if x.get("default")), b[0])["id"])')"
DB_JSON="$(api "$API/projects/$PROJECT_ID/branches/$BRANCH_ID/databases")"
read -r DB_NAME DB_OWNER <<<"$(printf '%s' "$DB_JSON" | python3 -c '
import json,sys
d=json.load(sys.stdin)["databases"][0]
print(d["name"], d["owner_name"])')"

log "Projekt $PROJECT_ID · Branch $BRANCH_ID · Datenbank $DB_NAME"

# Direkte Verbindung (kein Pooler): pg_dump braucht eine echte Sitzung.
PGURI="$(api "$API/projects/$PROJECT_ID/connection_uri?branch_id=$BRANCH_ID&database_name=$DB_NAME&role_name=$DB_OWNER&pooled=false" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["uri"])')"
[ -n "$PGURI" ] || die "Keine Verbindungs-URL erhalten."
export PGURI

# ── Erreichbarkeit prüfen ─────────────────────────────────────────────────
# ⚠️ Im Firmennetz (Cato Networks) ist Port 5432 nach außen dicht: die
# TCP-Verbindung kommt zustande, das Postgres-Handshake wird aber verworfen.
# pg_dump meldet dann nur „server closed the connection unexpectedly" — eine
# Meldung, die nach einem kaputten Server klingt und nicht nach einer Firewall.
# Deshalb vorher selbst nachsehen und es beim Namen nennen.
PGHOST_ONLY="$(printf '%s' "$PGURI" | python3 -c 'import sys,urllib.parse as u; print(u.urlsplit(sys.stdin.read().strip()).hostname)')"
if ! REACH="$(PGHOST_ONLY="$PGHOST_ONLY" python3 - <<'PYEOF'
import os, socket, struct, sys
host = os.environ["PGHOST_ONLY"]
try:
    s = socket.create_connection((host, 5432), timeout=8)
except OSError as e:
    print(f"kein TCP: {e}"); sys.exit(1)
s.settimeout(8)
s.sendall(struct.pack("!ii", 8, 80877103))   # Postgres SSLRequest
try:
    data = s.recv(1)
except OSError as e:
    print(f"keine Antwort: {e}"); sys.exit(1)
finally:
    s.close()
print("ok" if data else "blockiert")
sys.exit(0 if data else 1)
PYEOF
)"; then
  log "Postgres-Port 5432 zu $PGHOST_ONLY nicht nutzbar ($REACH)."
  die "Port 5432 ist in diesem Netz blockiert (Firmen-Proxy). Die Sicherung braucht ein Netz ohne diese Sperre — Heim-WLAN oder Mobilfunk-Hotspot. HTTPS/443 ist davon nicht betroffen, die Neon-API funktioniert also weiterhin."
fi

# ── Sichern ───────────────────────────────────────────────────────────────
mkdir -p "$BACKUP_DIR"
STAMP="$(date '+%Y-%m-%d_%H%M')"
TARGET="$BACKUP_DIR/cloverjapan_$STAMP.dump"
TMP="$TARGET.partial"

# --format=custom: komprimiert, und `pg_restore` kann daraus einzelne Tabellen
# zurückholen statt nur alles.
# --no-owner/--no-acl: die Rollennamen bei Neon gibt es anderswo nicht. Ohne das
# bricht ein Rückspielen in die lokale Docker-Datenbank an jedem GRANT ab —
# und genau dort landet eine Sicherung im Ernstfall zuerst.
log "pg_dump läuft …"
docker run --rm -e PGURI -v "$BACKUP_DIR:/backup" "$PG_IMAGE" \
  sh -c 'pg_dump --format=custom --no-owner --no-acl --file="/backup/'"$(basename "$TMP")"'" "$PGURI"' \
  || { rm -f "$TMP"; die "pg_dump fehlgeschlagen."; }

# ⚠️ Erst prüfen, dann umbenennen. Eine abgebrochene Sicherung darf nicht als
# gültige Datei dastehen und beim Aufräumen eine echte verdrängen.
SIZE=$(stat -f%z "$TMP" 2>/dev/null || stat -c%s "$TMP")
[ "$SIZE" -gt 10000 ] || { rm -f "$TMP"; die "Sicherung verdächtig klein ($SIZE Bytes)."; }
mv "$TMP" "$TARGET"
log "Gesichert: $TARGET ($((SIZE / 1024)) KB)"

# ── Aufräumen ─────────────────────────────────────────────────────────────
# Die neuesten $KEEP behalten. `ls -t` sortiert nach Änderungszeit.
cd "$BACKUP_DIR"
COUNT=$(ls -1 cloverjapan_*.dump 2>/dev/null | wc -l | tr -d ' ')
if [ "$COUNT" -gt "$KEEP" ]; then
  ls -t cloverjapan_*.dump | tail -n "+$((KEEP + 1))" | while read -r old; do
    rm -f -- "$old"
    log "Entfernt (älter als die letzten $KEEP): $old"
  done
fi
log "Fertig. $(ls -1 cloverjapan_*.dump | wc -l | tr -d ' ') Sicherungen in $BACKUP_DIR"
