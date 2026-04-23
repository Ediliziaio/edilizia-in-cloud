#!/bin/bash
set -e
echo "=== AUDIT PRE-MP01 — $(date -Iseconds) ==="
echo ""
echo "--- Branch ---"
git -C .. branch --show-current
echo ""
echo "--- Tabelle WhatsApp presenti (grep nelle migrations) ---"
grep -l "whatsapp\|ai_whatsapp" ../supabase/migrations/*.sql 2>/dev/null | sort -u | head -30
echo ""
echo "--- Campo purpose presente? ---"
grep -rE "purpose.*(text|PURPOSE)" ../supabase/migrations/*.sql 2>/dev/null || echo "NON ESISTE ANCORA (OK)"
echo ""
echo "--- Edge function whatsapp-* ---"
ls ../supabase/functions/ 2>/dev/null | grep ^whatsapp
echo ""
echo "--- Linee codice whatsapp-webhook ---"
wc -l ../supabase/functions/whatsapp-webhook/index.ts 2>/dev/null
echo ""
echo "--- phone_number_id in types.ts ---"
grep -c phone_number_id ../src/integrations/supabase/types.ts 2>/dev/null
echo ""
echo "--- ai_whatsapp_numbers esiste in types.ts ---"
grep -c "ai_whatsapp_numbers" ../src/integrations/supabase/types.ts 2>/dev/null
echo ""
echo "--- messaging_whatsapp_config esiste ---"
grep -c "messaging_whatsapp_config" ../src/integrations/supabase/types.ts 2>/dev/null
echo "=== FINE AUDIT ==="
