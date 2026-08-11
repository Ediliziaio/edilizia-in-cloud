-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- PIN 2-step verification del Cloud API, impostato al momento della
-- registrazione del numero (POST /{phone-number-id}/register). Serve per
-- eventuali re-registrazioni future. Nullable (numeri già registrati o senza).
ALTER TABLE public.ai_whatsapp_numbers
  ADD COLUMN IF NOT EXISTS cloud_api_pin text;

COMMENT ON COLUMN public.ai_whatsapp_numbers.cloud_api_pin IS
  'PIN 2FA Cloud API impostato in fase di register del numero (Embedded Signup). Per re-registrazioni.';
