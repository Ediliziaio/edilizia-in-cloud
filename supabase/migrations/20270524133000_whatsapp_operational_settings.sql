-- WhatsApp operativo cantieri: playbook configurabile per AI, DDT, rapportini e media.

BEGIN;

ALTER TABLE public.ai_whatsapp_numbers
  ADD COLUMN IF NOT EXISTS operational_settings JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.ai_whatsapp_numbers.operational_settings IS
  'Configurazione per il numero WhatsApp: modalita AI, reminder rapportini, conferme DDT, media cantiere, escalation e handoff.';

COMMIT;
