#!/bin/bash
# =============================================================
# WorkLearn — Automated Database Backup
# Schedule: 0 2 * * * /opt/worklearn/scripts/backup.sh
# Backs up PostgreSQL to Cloudflare R2 or local
# =============================================================
set -euo pipefail

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="worklearn_backup_${TIMESTAMP}.sql.gz"
BACKUP_DIR="/tmp/worklearn_backups"
RETAIN_DAYS=30

# Load env
[ -f /opt/worklearn/.env ] && source /opt/worklearn/.env || true
POSTGRES_USER="${POSTGRES_USER:-worklearn}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"
POSTGRES_DB="${POSTGRES_DB:-worklearn}"

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting backup: $BACKUP_FILE"

# ── Dump database ──────────────────────────────────────────
PGPASSWORD="$POSTGRES_PASSWORD" docker exec worklearn_postgres \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" \
  --no-owner --no-acl --clean --if-exists \
  | gzip > "${BACKUP_DIR}/${BACKUP_FILE}"

SIZE=$(du -sh "${BACKUP_DIR}/${BACKUP_FILE}" | cut -f1)
echo "[$(date)] Backup size: $SIZE"

# ── Upload to Cloudflare R2 (if configured) ───────────────
if [ -n "${R2_ACCESS_KEY:-}" ]; then
  echo "[$(date)] Uploading to Cloudflare R2..."
  AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY" \
  AWS_SECRET_ACCESS_KEY="$R2_SECRET_KEY" \
  aws s3 cp "${BACKUP_DIR}/${BACKUP_FILE}" \
    "s3://worklearn-backups/daily/${BACKUP_FILE}" \
    --endpoint-url "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \
    --no-progress
  echo "[$(date)] ✅ Uploaded to R2: daily/$BACKUP_FILE"

# ── Fallback: upload to MinIO ──────────────────────────────
elif docker ps | grep -q worklearn_minio; then
  echo "[$(date)] Uploading to MinIO..."
  docker exec worklearn_minio sh -c \
    "mc alias set local http://localhost:9000 ${MINIO_ROOT_USER:-minioadmin} ${MINIO_ROOT_PASSWORD:-} 2>/dev/null; \
     mc cp /dev/stdin local/worklearn-backups/${BACKUP_FILE}" \
    < "${BACKUP_DIR}/${BACKUP_FILE}" 2>/dev/null || true
  echo "[$(date)] ✅ Uploaded to MinIO"

else
  echo "[$(date)] ⚠️  No remote storage configured — backup kept locally only"
fi

# ── Verify backup integrity ────────────────────────────────
if gzip -t "${BACKUP_DIR}/${BACKUP_FILE}"; then
  echo "[$(date)] ✅ Backup integrity verified"
else
  echo "[$(date)] ❌ Backup file corrupted!" && exit 1
fi

# ── Cleanup old local backups ──────────────────────────────
find "$BACKUP_DIR" -name "*.sql.gz" -mtime "+${RETAIN_DAYS}" -delete
echo "[$(date)] Cleaned backups older than ${RETAIN_DAYS} days"

echo "[$(date)] ✅ Backup complete: ${BACKUP_DIR}/${BACKUP_FILE}"
