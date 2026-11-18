#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/sdu-qingdao-electricity-monitor}"
COMPOSE_FILE="${COMPOSE_FILE:-$APP_DIR/compose.prod.yml}"

cd "$APP_DIR"
# Restart only existing application containers. Image builds, schema changes
# and service recreation belong to the release procedure, not a restart.
exec docker compose --env-file .env.docker -f "$COMPOSE_FILE" restart --no-deps api worker web
