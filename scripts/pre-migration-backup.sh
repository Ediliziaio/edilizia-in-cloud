#!/usr/bin/env bash
# 2026-05-27 (perfezione iter 19): backup pre-migration.
#
# Genera uno snapshot del DB Supabase PRIMA di applicare una migration
# rischiosa. Salva in `backups/<timestamp>/` e mantiene gli ultimi 7
# automaticamente.
#
# Uso:
#   ./scripts/pre-migration-backup.sh                  # backup completo (schema + data)
#   ./scripts/pre-migration-backup.sh --schema-only    # solo schema (più veloce)
#   ./scripts/pre-migration-backup.sh --tables a,b,c   # solo tabelle specifiche
#
# Richiede:
#   - pg_dump installato (`brew install postgresql@16` su Mac)
#   - SUPABASE_DB_URL env var con la connection string del progetto
#     (recuperabile da Dashboard → Settings → Database → Connection string,
#      modalità "Session" — NON "Transaction"/"Pooler" perché pg_dump
#      richiede statement multi-query)
#
# Output: backup .sql comprimibile + manifest con hash + size.
# Restore: `psql "$SUPABASE_DB_URL" < backups/<timestamp>/dump.sql`
#
# WARNING: ⚠️  Backup tabelle GRANDI (es. email_inbox 100K+ righe) può
# pesare 500MB+. Usa --schema-only se ti basta poter rollback la DDL.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$REPO_ROOT/backups"
TS="$(date +%Y%m%d_%H%M%S)"
OUT_DIR="$BACKUP_DIR/$TS"

# ─── Parse args ──────────────────────────────────────────────────────────────
MODE="full"
TABLES=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --schema-only) MODE="schema"; shift ;;
    --tables) TABLES="$2"; shift 2 ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *) echo "❌ Unknown arg: $1" >&2; exit 1 ;;
  esac
done

# ─── Preflight ───────────────────────────────────────────────────────────────
if [ -z "${SUPABASE_DB_URL:-}" ]; then
  echo "❌ SUPABASE_DB_URL non impostata."
  echo ""
  echo "Recupera la connection string da:"
  echo "  Supabase Dashboard → Settings → Database → Connection string"
  echo "  (modalità 'Session', sostituisci [YOUR-PASSWORD])"
  echo ""
  echo "Poi:"
  echo "  export SUPABASE_DB_URL='postgresql://postgres.xxx:PASSWORD@aws-0-eu-central-1.pooler.supabase.com:5432/postgres'"
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "❌ pg_dump non trovato. Installa con: brew install postgresql@16"
  exit 1
fi

mkdir -p "$OUT_DIR"

# ─── Dump ────────────────────────────────────────────────────────────────────
DUMP_FILE="$OUT_DIR/dump.sql"
PG_DUMP_ARGS=(
  "--no-owner"
  "--no-privileges"
  "--no-acl"
  "--clean"
  "--if-exists"
  "--quote-all-identifiers"
  "--schema=public"
)

if [ "$MODE" = "schema" ]; then
  PG_DUMP_ARGS+=("--schema-only")
  echo "📋 Modalità: solo schema (DDL)"
elif [ -n "$TABLES" ]; then
  IFS=',' read -ra TABLE_ARR <<< "$TABLES"
  for t in "${TABLE_ARR[@]}"; do
    PG_DUMP_ARGS+=("--table=public.${t}")
  done
  echo "📋 Modalità: tabelle specifiche → $TABLES"
else
  echo "📋 Modalità: completo (schema + data)"
fi

echo "🔄 Dump in corso → $DUMP_FILE"
pg_dump "$SUPABASE_DB_URL" "${PG_DUMP_ARGS[@]}" > "$DUMP_FILE"

# ─── Manifest ────────────────────────────────────────────────────────────────
SIZE_HUMAN=$(du -h "$DUMP_FILE" | cut -f1)
SHA=$(shasum -a 256 "$DUMP_FILE" | cut -d' ' -f1)
GIT_HEAD=$(cd "$REPO_ROOT" && git rev-parse HEAD 2>/dev/null || echo "n/a")
LATEST_MIGRATION=$(ls -1 "$REPO_ROOT/supabase/migrations" 2>/dev/null | tail -1 || echo "n/a")

cat > "$OUT_DIR/manifest.json" <<EOF
{
  "timestamp": "$TS",
  "mode": "$MODE",
  "tables": "${TABLES:-all}",
  "size": "$SIZE_HUMAN",
  "sha256": "$SHA",
  "git_head": "$GIT_HEAD",
  "latest_migration_before_backup": "$LATEST_MIGRATION",
  "restore_command": "psql \"\$SUPABASE_DB_URL\" < $DUMP_FILE"
}
EOF

# ─── Compress (gzip) ─────────────────────────────────────────────────────────
gzip "$DUMP_FILE"
COMPRESSED="$DUMP_FILE.gz"
COMP_SIZE=$(du -h "$COMPRESSED" | cut -f1)

# ─── Cleanup vecchi backup (mantieni ultimi 7) ───────────────────────────────
cd "$BACKUP_DIR"
OLD_COUNT=$(ls -1d 2*/ 2>/dev/null | wc -l | tr -d ' ')
if [ "$OLD_COUNT" -gt 7 ]; then
  TO_DELETE=$((OLD_COUNT - 7))
  echo "🗑  Rimuovo $TO_DELETE backup più vecchi (mantengo gli ultimi 7)"
  ls -1d 2*/ | head -n "$TO_DELETE" | xargs rm -rf
fi

# ─── Done ────────────────────────────────────────────────────────────────────
echo ""
echo "✅ Backup completato"
echo "   📁 Cartella:  $OUT_DIR"
echo "   📦 Dump:      $COMPRESSED ($COMP_SIZE)"
echo "   🔐 SHA256:    ${SHA:0:16}..."
echo ""
echo "Per ripristinare:"
echo "  gunzip -c $COMPRESSED | psql \"\$SUPABASE_DB_URL\""
echo ""
echo "Per applicare ora una migration con sicurezza:"
echo "  supabase db push   # o equivalente"
echo "Se va male:"
echo "  gunzip -c $COMPRESSED | psql \"\$SUPABASE_DB_URL\""
