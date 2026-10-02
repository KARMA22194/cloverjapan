#!/bin/bash
#
# Sicherung der selbst gehosteten Datenbank (Clover Japan auf dem Homeserver).
#
# WARUM ES DAS BRAUCHT: Beim Self-Hosting gibt es kein Rückspul-Fenster wie bei
# Neon — stirbt die Platte oder löscht jemand ein Volume, ist alles weg. Drin
# stecken die Ausgaben mit den eingefrorenen Wechselkursen, die Belege, die
# Abrechnung, die Stempel und der ganze Reiseablauf; rekonstruieren lässt sich
# davon nichts.
#
# AUFRUF
#   scripts/backup-local.sh                  # ins Standardziel
#   CLOVER_BACKUP_DIR=/mnt/usb/clover scripts/backup-local.sh
#
# VORAUSSETZUNG: im Projektverzeichnis ausführen, der Stack muss laufen.
#
# ⚠️ **Die Markierungsdatei ist der wichtigste Teil dieses Skripts.** Ist eine
# externe Platte nicht eingehängt, existiert ihr Einhängepunkt trotzdem — als
# leeres Verzeichnis auf der Systemplatte. Ohne Prüfung schriebe die Sicherung
# monatelang dorthin, meldete jedes Mal Erfolg, und im Ernstfall stünde man vor
# einer leeren Platte. Deshalb muss im Zielverzeichnis eine Datei namens
# `.clover-backup-target` liegen; die legt man einmal von Hand an, wenn die
# Platte eingehängt ist. Verschwindet sie, ist die Platte weg — und das Skript
# bricht ab, statt ins Leere zu sichern.

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${CLOVER_BACKUP_DIR:-$PROJECT_ROOT/backups}"
KEEP="${CLOVER_BACKUP_KEEP:-14}"
MARKER=".clover-backup-target"
# ⚠️ Überschreibbar, damit sich das Skript gegen die Entwicklungsumgebung prüfen
# lässt. Ein Sicherungsskript, das man nicht ausprobieren kann, ohne die echte
# Produktion anzufassen, probiert niemand aus — und fällt dann im Ernstfall auf.
COMPOSE_FILE_PATH="${CLOVER_COMPOSE_FILE:-$PROJECT_ROOT/docker-compose.prod.yml}"
ENV_FILE_PATH="${CLOVER_ENV_FILE:-$PROJECT_ROOT/.env.prod}"
COMPOSE=(docker compose -f "$COMPOSE_FILE_PATH" --env-file "$ENV_FILE_PATH")

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
die() { log "FEHLER: $*" >&2; exit 1; }

# Cron startet mit sehr kurzem PATH; Docker liegt nicht darin.
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

command -v docker >/dev/null || die "docker nicht gefunden."
[ -f "$ENV_FILE_PATH" ] || die "Umgebungsdatei nicht gefunden: $ENV_FILE_PATH"

# ── Ziel prüfen ───────────────────────────────────────────────────────────
[ -d "$BACKUP_DIR" ] || die "Zielverzeichnis fehlt: $BACKUP_DIR"
if [ ! -e "$BACKUP_DIR/$MARKER" ]; then
  die "Im Ziel fehlt die Markierungsdatei $MARKER — die externe Platte ist vermutlich nicht eingehängt.
       Wenn sie eingehängt ist, einmalig anlegen:  touch \"$BACKUP_DIR/$MARKER\"
       Ohne diese Prüfung landete die Sicherung unbemerkt auf der Systemplatte."
fi
[ -w "$BACKUP_DIR" ] || die "Keine Schreibrechte in $BACKUP_DIR"

# ── Zugangsdaten aus der .env.prod (nie ausgeben) ─────────────────────────
envval() { grep -E "^$1=" "$ENV_FILE_PATH" | head -1 | cut -d= -f2- | tr -d '"'"'"' \r'; }
PGUSER="${CLOVER_PGUSER:-$(envval POSTGRES_USER)}"; PGUSER="${PGUSER:-clover}"
PGDB="${CLOVER_PGDB:-$(envval POSTGRES_DB)}";       PGDB="${PGDB:-clover}"

# ── Läuft die Datenbank? ──────────────────────────────────────────────────
"${COMPOSE[@]}" ps --status running --services 2>/dev/null | grep -qx db \
  || die "Der db-Container läuft nicht. Erst den Stack starten."

# ── Sichern ───────────────────────────────────────────────────────────────
STAMP="$(date '+%Y-%m-%d_%H%M')"
TARGET="$BACKUP_DIR/cloverjapan_$STAMP.dump"
TMP="$TARGET.partial"

# --format=custom: komprimiert, und `pg_restore` kann daraus einzelne Tabellen
# zurückholen statt nur alles.
# --no-owner/--no-acl: ohne sie bricht ein Rückspielen in eine andere Datenbank
# an jedem GRANT ab — und genau dorthin (lokale Entwicklung) geht eine Sicherung
# im Ernstfall zuerst.
# ⚠️ `exec -T`: ohne das schiebt Docker ein TTY dazwischen und ersetzt
# Zeilenenden — der Dump wäre unbrauchbar, und zwar erst beim Zurückspielen
# erkennbar.
log "pg_dump läuft (Datenbank $PGDB als $PGUSER) …"
"${COMPOSE[@]}" exec -T db \
  pg_dump -U "$PGUSER" -d "$PGDB" --format=custom --no-owner --no-acl > "$TMP" \
  || { rm -f "$TMP"; die "pg_dump fehlgeschlagen."; }

# ⚠️ Erst prüfen, dann umbenennen. Eine abgebrochene Sicherung darf nicht als
# gültige dastehen und beim Aufräumen eine echte verdrängen.
SIZE=$(stat -c%s "$TMP" 2>/dev/null || stat -f%z "$TMP")
[ "$SIZE" -gt 10000 ] || { rm -f "$TMP"; die "Sicherung verdächtig klein ($SIZE Bytes)."; }

# ⚠️ Inhaltlich prüfen, nicht nur die Größe: `pg_restore --list` liest das
# Inhaltsverzeichnis. Eine Datei, die zwar groß ist, aber kein gültiges Archiv,
# fiele sonst erst im Ernstfall auf.
"${COMPOSE[@]}" exec -T db pg_restore --list < "$TMP" >/dev/null 2>&1 \
  || { rm -f "$TMP"; die "Die Datei ist kein lesbares pg_dump-Archiv."; }

mv "$TMP" "$TARGET"
log "Gesichert: $TARGET ($((SIZE / 1024)) KB)"

# ── Aufräumen ─────────────────────────────────────────────────────────────
cd "$BACKUP_DIR"
COUNT=$(ls -1 cloverjapan_*.dump 2>/dev/null | wc -l | tr -d ' ')
if [ "$COUNT" -gt "$KEEP" ]; then
  ls -t cloverjapan_*.dump | tail -n "+$((KEEP + 1))" | while read -r old; do
    rm -f -- "$old"
    log "Entfernt (älter als die letzten $KEEP): $old"
  done
fi
log "Fertig. $(ls -1 cloverjapan_*.dump | wc -l | tr -d ' ') Sicherungen in $BACKUP_DIR"
