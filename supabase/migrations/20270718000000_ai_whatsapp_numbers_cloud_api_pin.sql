-- PIN 2-step verification del Cloud API, impostato al momento della
-- registrazione del numero (POST /{phone-number-id}/register) nell'Embedded
-- Signup. Serve per eventuali re-registrazioni future. Nullable: numeri già
-- registrati o senza registrazione esplicita restano NULL.
ALTER TABLE public.ai_whatsapp_numbers
  ADD COLUMN IF NOT EXISTS cloud_api_pin text;

COMMENT ON COLUMN public.ai_whatsapp_numbers.cloud_api_pin IS
  'PIN 2FA Cloud API impostato in fase di register del numero (Embedded Signup). Per re-registrazioni.';
