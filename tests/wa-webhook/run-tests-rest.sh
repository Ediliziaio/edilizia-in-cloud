#!/usr/bin/env bash
# MP01 — Test runner via Supabase REST API (no psql richiesto)
# Usa SERVICE_ROLE_KEY + REST per seed + db_check.
set -euo pipefail

SUPABASE_URL="${SUPABASE_URL:?missing}"
SRK="${SUPABASE_SERVICE_ROLE_KEY:?missing}"
META_APP_SECRET="${META_APP_SECRET:?missing}"
WEBHOOK_URL="${SUPABASE_URL}/functions/v1/whatsapp-webhook"

FIX_DIR="$(cd "$(dirname "$0")/../fixtures/wa-webhook" && pwd)"
COMPANY_ID="11111111-1111-1111-1111-111111111111"

req_rest() {
  curl -s -w "\nHTTP %{http_code}" \
    -H "apikey: $SRK" \
    -H "Authorization: Bearer $SRK" \
    -H "Content-Type: application/json" \
    "$@"
}

echo "=== SEED ==="
# Company test
req_rest -X POST "${SUPABASE_URL}/rest/v1/companies" \
  -H "Prefer: resolution=merge-duplicates,return=minimal" \
  -d "{\"id\":\"$COMPANY_ID\",\"name\":\"Rossi Costruzioni Srl TEST\",\"email\":\"test@mp01.local\"}" \
  | tail -1

# ai_whatsapp_numbers (4 numeri)
SEED_NUMBERS='[
  {"id":"aaaaaaaa-0001-0001-0001-000000000001","company_id":"'$COMPANY_ID'","purpose":"bot_operativo","numero":"+390299990001","phone_number_id":"TEST_PHONE_ID_BOT_OPERATIVO_001","waba_id":"WABA_ID_TEST_001","stato":"active","webhook_verified":true,"display_name":"Bot Operativo Test"},
  {"id":"aaaaaaaa-0002-0002-0002-000000000002","company_id":"'$COMPANY_ID'","purpose":"assistenza","numero":"+390299990002","phone_number_id":"TEST_PHONE_ID_ASSISTENZA_001","waba_id":"WABA_ID_TEST_001","stato":"active","webhook_verified":true,"display_name":"Assistenza Test"},
  {"id":"aaaaaaaa-0003-0003-0003-000000000003","company_id":"'$COMPANY_ID'","purpose":"lead","numero":"+390299990003","phone_number_id":"TEST_PHONE_ID_LEAD_001","waba_id":"WABA_ID_TEST_001","stato":"active","webhook_verified":true,"display_name":"Lead Test"},
  {"id":"aaaaaaaa-0004-0004-0004-000000000004","company_id":"'$COMPANY_ID'","purpose":"marketing","numero":"+390299990004","phone_number_id":"TEST_PHONE_ID_DISABLED_001","waba_id":"WABA_ID_TEST_001","stato":"suspended","webhook_verified":true,"display_name":"Marketing Test Disabled"}
]'
req_rest -X POST "${SUPABASE_URL}/rest/v1/ai_whatsapp_numbers" \
  -H "Prefer: resolution=merge-duplicates,return=minimal" \
  -d "$SEED_NUMBERS" | tail -1
echo ""

PASSED=0
FAILED=0

for fixture in "${FIX_DIR}"/*.json; do
  NAME=$(basename "$fixture" .json)
  EXPECTED="${FIX_DIR}/${NAME}.expected"
  [ -f "$EXPECTED" ] || continue

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
    if [ -n "${EXPECTED_DB:-}" ]; then
      # Converti db_check SQL in query REST PostgREST.
      TABLE=$(echo "$EXPECTED_DB" | awk '{print $1}')
      FILTER=$(echo "$EXPECTED_DB" | sed -E 's/^[a-z_]+ WHERE //i')
      # Heuristic: sostituisci '=' con '=eq.'
      REST_FILTER=$(echo "$FILTER" \
        | sed -E "s/ AND /\&/g" \
        | sed -E "s/([a-z_]+)='([^']*)'/\1=eq.\2/g" \
        | sed -E "s/([a-z_]+) IN \(([^)]+)\)/\1=in.(\2)/g" \
        | tr -d "'")
      # Le IN trasformate hanno "in.(a,b)" con virgole — ok per PostgREST
      RESP=$(curl -s "${SUPABASE_URL}/rest/v1/${TABLE}?${REST_FILTER}&select=count" \
        -H "apikey: $SRK" -H "Authorization: Bearer $SRK" -H "Prefer: count=exact")
      COUNT=$(echo "$RESP" | grep -oE '\[?[0-9]+' | head -1 | tr -d '[')
      # Alternative: Content-Range header. Use a simpler approach with just the rows.
      ROWS=$(curl -s "${SUPABASE_URL}/rest/v1/${TABLE}?${REST_FILTER}&select=id&limit=5" \
        -H "apikey: $SRK" -H "Authorization: Bearer $SRK")
      ROW_COUNT=$(echo "$ROWS" | grep -oE '"id"' | wc -l | tr -d ' ')
      if [[ "$ROW_COUNT" -ge 1 ]]; then
        PASSED=$((PASSED + 1))
        echo "PASS: $NAME (status=$STATUS, rows=$ROW_COUNT)"
      else
        FAILED=$((FAILED + 1))
        echo "FAIL: $NAME — status=$STATUS OK ma db_check=0 righe ($REST_FILTER)"
        echo "       raw: $ROWS"
      fi
    else
      PASSED=$((PASSED + 1))
      echo "PASS: $NAME (status only)"
    fi
  else
    FAILED=$((FAILED + 1))
    echo "FAIL: $NAME — status=$STATUS atteso=$EXPECTED_STATUS"
    head -c 150 "/tmp/resp_${NAME}.json"; echo
  fi
done

echo ""
echo "========================================"
echo "PASSED: $PASSED / FAILED: $FAILED"
echo "========================================"
[ "$FAILED" -eq 0 ]
