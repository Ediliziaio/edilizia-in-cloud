#!/usr/bin/env bash
# MP01 — Test runner fixture webhook WhatsApp
# Esegue ogni fixture via curl contro l'endpoint whatsapp-webhook e
# confronta status + db_check con l'atteso in ./*.expected.
#
# Uso:
#   SUPABASE_URL=http://127.0.0.1:54321 \
#   META_APP_SECRET=test_secret_for_local \
#   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
#     bash tests/wa-webhook/run-tests.sh
#
# Prereq: aver eseguito seed.sql (tests/fixtures/wa-webhook/seed.sql).

set -euo pipefail

SUPABASE_URL="${SUPABASE_URL:-http://127.0.0.1:54321}"
META_APP_SECRET="${META_APP_SECRET:-test_secret_for_local}"
WEBHOOK_URL="${SUPABASE_URL}/functions/v1/whatsapp-webhook"

FIX_DIR="$(cd "$(dirname "$0")/../fixtures/wa-webhook" && pwd)"
FAILED=0
PASSED=0

for fixture in "${FIX_DIR}"/*.json; do
  NAME=$(basename "$fixture" .json)
  EXPECTED="${FIX_DIR}/${NAME}.expected"

  if [ ! -f "$EXPECTED" ]; then
    echo "SKIP: $NAME (no .expected file)"
    continue
  fi

  BODY=$(cat "$fixture")

  if [[ "$NAME" == "08_hmac_invalid" ]]; then
    SIG="sha256=deadbeef"
  else
    SIG="sha256=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$META_APP_SECRET" -hex | awk '{print $2}')"
  fi

  STATUS=$(curl -s -o "/tmp/resp_${NAME}.json" -w "%{http_code}" \
    -X POST "$WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    -H "x-hub-signature-256: $SIG" \
    --data-binary "$BODY")

  EXPECTED_STATUS=$(grep '^status:' "$EXPECTED" | awk '{print $2}')
  EXPECTED_DB=$(grep '^db_check:' "$EXPECTED" | sed 's/^db_check:[[:space:]]*//' || true)

  if [[ "$STATUS" == "$EXPECTED_STATUS" ]]; then
    if [ -n "${EXPECTED_DB:-}" ] && [ -n "${DATABASE_URL:-}" ]; then
      FOUND=$(psql "$DATABASE_URL" -At -c "SELECT COUNT(*) FROM $EXPECTED_DB" 2>/dev/null || echo 0)
      if [[ "${FOUND:-0}" -ge 1 ]]; then
        PASSED=$((PASSED + 1))
        echo "PASS: $NAME"
      else
        FAILED=$((FAILED + 1))
        echo "FAIL: $NAME — status OK ma db_check vuoto ($EXPECTED_DB)"
      fi
    else
      PASSED=$((PASSED + 1))
      echo "PASS: $NAME (status only)"
    fi
  else
    FAILED=$((FAILED + 1))
    echo "FAIL: $NAME — status=$STATUS atteso=$EXPECTED_STATUS"
    cat "/tmp/resp_${NAME}.json" | head -3
  fi
done

echo ""
echo "========================================"
echo "PASSED: $PASSED / FAILED: $FAILED"
echo "========================================"
[ "$FAILED" -eq 0 ]
