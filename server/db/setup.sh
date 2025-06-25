#!/usr/bin/env bash
set -euo pipefail

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Prompt for MySQL credentials ────────────────────────────────────────────
read -p "MySQL username: " MYSQL_USER
read -s -p "MySQL password: " MYSQL_PWD
echo
MYSQL_HOST="localhost"     
MYSQL_PORT="3306"          

# Create temporary config file with restricted permissions
MYSQL_TMPFILE=$(mktemp)
chmod 600 "$MYSQL_TMPFILE"
cat > "$MYSQL_TMPFILE" <<EOF
[client]
user=$MYSQL_USER
password=$MYSQL_PWD
host=$MYSQL_HOST
port=$MYSQL_PORT
EOF

_mysql() {
  mysql --defaults-file="$MYSQL_TMPFILE" --batch --silent "$@"
}

# Create schemas ────────────────────────────────────────────
echo ">> Creating schemas: core, dnd5e, audio"
_mysql <<EOSQL
CREATE DATABASE IF NOT EXISTS core;
CREATE DATABASE IF NOT EXISTS dnd5e;
CREATE DATABASE IF NOT EXISTS audio;
EOSQL

#  Apply .sql files in lexicographical order ───────────────
for schema in core dnd5e audio; do
  echo ">> Applying migrations in schema '$schema'..."
  for sqlfile in "$SCRIPT_DIR/$schema"/*.sql; do
    if [[ -f "$sqlfile" ]]; then
      echo "   → Loading $sqlfile → into $schema"
      _mysql "$schema" < "$sqlfile"
    fi
  done
done

# Clean up temporary file
rm "$MYSQL_TMPFILE"

echo ">> All migrations applied."

# Create default audio folder structure ───────────────────────────────────
echo ">> Creating default audio folder structure..."
# Get server directory (one level up from script directory)
SERVER_DIR="$(dirname "$SCRIPT_DIR")"
AUDIO_DIR="$SERVER_DIR/public/audio"

# Create audio directories
mkdir -p "$AUDIO_DIR/music"
mkdir -p "$AUDIO_DIR/sfx"
mkdir -p "$AUDIO_DIR/ambience"
mkdir -p "$AUDIO_DIR/upload"

echo ">> Audio directories created at: $AUDIO_DIR"