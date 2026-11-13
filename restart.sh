#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/sdu-qingdao-electricity-monitor}"
COMPOSE_FILE="${COMPOSE_FILE:-$APP_DIR/compose.prod.yml}"
COMPOSE=(docker compose -f "$COMPOSE_FILE")

if [ ! -d "$APP_DIR" ]; then
  echo "Project directory not found: $APP_DIR"
  exit 1
fi
cd "$APP_DIR"
if [ ! -f "$COMPOSE_FILE" ]; then
  echo "Production Compose file not found: $COMPOSE_FILE"
  exit 1
fi
if [ ! -f "$APP_DIR/backend/.env.docker" ]; then
  echo "Docker backend environment file not found: $APP_DIR/backend/.env.docker"
  exit 1
fi
db_password="${POSTGRES_PASSWORD:-}"
if [ -z "$db_password" ] && [ -f "$APP_DIR/.env" ]; then
  db_password="$(awk -F= '$1 == "POSTGRES_PASSWORD" { print substr($0, index($0, "=") + 1); exit }' "$APP_DIR/.env")"
fi
case "$db_password" in
  ""|changeme|change-me|your_password|your-password|set_password|set-password)
    echo "Set a real POSTGRES_PASSWORD in the environment or $APP_DIR/.env."
    exit 1
    ;;
esac
if [ -n "${POSTGRES_PASSWORD:-}" ]; then
  export POSTGRES_PASSWORD
fi

echo "[1/6] Validating Compose configuration"
"${COMPOSE[@]}" config -q

echo "[2/6] Building production images"
"${COMPOSE[@]}" build

echo "[3/6] Starting PostgreSQL"
"${COMPOSE[@]}" up -d postgres

echo "[4/6] Applying database schema updates"
if ! "${COMPOSE[@]}" run --rm migrate; then
  echo "Database migration failed; application services were not started."
  exit 1
fi

echo "[5/6] Starting application containers"
"${COMPOSE[@]}" up -d --build api worker web

echo "[6/6] Checking containers and public web health"
running_services="$("${COMPOSE[@]}" ps --status running --services)"
for service in postgres api worker web; do
  if ! printf '%s\n' "$running_services" | awk -v target="$service" '$0 == target { found=1 } END { exit !found }'; then
    echo "Container is not running: $service"
    "${COMPOSE[@]}" ps
    exit 1
  fi
done

for attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8080/health; then
    echo
    echo "Docker web health check passed."
    exit 0
  fi
  if [ "$attempt" -eq 30 ]; then
    echo
    echo "Docker web health check failed after 30 seconds."
    "${COMPOSE[@]}" ps
    "${COMPOSE[@]}" logs --tail=80 api web
    exit 1
  fi
  sleep 1
done
