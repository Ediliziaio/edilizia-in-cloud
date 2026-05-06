#!/bin/bash
# IMPROVEMENT #17 — CASCADE FK audit script
# ============================================================================
# Lista tutte le FK con ON DELETE CASCADE su tabelle "storiche" del business
# (orders, quotes, customers, marketing_*, invoices, fatture_*) e flagga
# quelle pericolose. Da eseguire periodicamente o pre-deploy.
#
# Usage:
#   bash scripts/audit-cascade-fk.sh
# ============================================================================
set -euo pipefail

PROJ="${SUPABASE_PROJECT_REF:-rsbrguhkodgnqfomrevo}"
PAT="${SUPABASE_PAT:-}"

if [ -z "$PAT" ]; then
  echo "ERROR: SUPABASE_PAT environment variable required."
  echo "Usage: SUPABASE_PAT=sbp_xxx bash scripts/audit-cascade-fk.sh"
  exit 1
fi

# Tabelle storiche (delete in queste è disastro)
HISTORICAL_TABLES=(
  "orders" "quotes" "marketing_contacts" "marketing_opportunities"
  "invoices" "invoice_payments" "fatture_ricevute" "fattura_ordine"
  "warehouse_movements" "warehouse_stock" "ddt_ricezione"
  "customer_documents" "customer_messages" "campaign_events"
  "ai_action_proposals" "action_proposals_audit_log"
)

SQL=$(cat <<EOF
SELECT
  c.conname AS constraint_name,
  s.relname AS source_table,
  t.relname AS target_table,
  pg_catalog.pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
JOIN pg_class s ON s.oid = c.conrelid
JOIN pg_class t ON t.oid = c.confrelid
JOIN pg_namespace ns ON ns.oid = s.relnamespace
WHERE c.contype = 'f'
  AND ns.nspname = 'public'
  AND c.confdeltype = 'c'
  AND (
    s.relname IN ($(printf "'%s'," "${HISTORICAL_TABLES[@]}" | sed 's/,$//'))
    OR t.relname IN ($(printf "'%s'," "${HISTORICAL_TABLES[@]}" | sed 's/,$//'))
  )
ORDER BY t.relname, s.relname;
EOF
)

PAYLOAD=$(jq -n --arg q "$SQL" '{query:$q}')
echo "▸ Auditing CASCADE FK su tabelle storiche…"
echo

RESP=$(curl -sS -X POST "https://api.supabase.com/v1/projects/${PROJ}/database/query" \
  -H "Authorization: Bearer ${PAT}" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

COUNT=$(echo "$RESP" | jq 'length')
echo "Trovate ${COUNT} CASCADE FK su tabelle storiche:"
echo

echo "$RESP" | jq -r '.[] | "  ⚠ \(.source_table) → \(.target_table)\n    constraint: \(.constraint_name)\n    def: \(.definition)\n"'

if [ "$COUNT" -gt 0 ]; then
  echo "─────────────────────────────────────────────────────────────────"
  echo "RACCOMANDAZIONE:"
  echo "  Per le FK con CASCADE su tabelle dove la cancellazione del padre"
  echo "  distruggerebbe storico legale/commerciale (es. quote → proposal),"
  echo "  considerare ON DELETE SET NULL invece di CASCADE."
  echo "  Esempio:"
  echo "    ALTER TABLE child_table DROP CONSTRAINT <name>;"
  echo "    ALTER TABLE child_table ADD CONSTRAINT <name>"
  echo "      FOREIGN KEY (parent_id) REFERENCES parent_table(id)"
  echo "      ON DELETE SET NULL;"
fi
