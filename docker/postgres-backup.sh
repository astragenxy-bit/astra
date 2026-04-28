#!/bin/sh
# PostgreSQL backup helper (runs inside postgres container)
# Called by external backup script
set -e
PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \
  -U "$POSTGRES_USER" "$POSTGRES_DB" \
  --no-owner --no-acl --clean --if-exists
