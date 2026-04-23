-- MP-FINAL — Aggiunge colonne mancanti a whatsapp_broadcasts per UI MP04
-- Necessarie per wizard broadcast create:
--   - wa_number_id (FK ai_whatsapp_numbers)
--   - scheduled_at (timestamp schedulazione)
--   - started_at / cancelled_at (tracking lifecycle)
--   - template_variables (mapping jsonb)
--   - window_start / window_end (finestra oraria HH:MM)
--   - nome (label utente)
--   - replied_count (da broadcast_recipients replied)

BEGIN;

ALTER TABLE public.whatsapp_broadcasts
  ADD COLUMN IF NOT EXISTS wa_number_id UUID REFERENCES public.ai_whatsapp_numbers(id) ON DELETE SET NULL;

ALTER TABLE public.whatsapp_broadcasts
  ADD COLUMN IF NOT EXISTS nome TEXT;

ALTER TABLE public.whatsapp_broadcasts
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

ALTER TABLE public.whatsapp_broadcasts
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

ALTER TABLE public.whatsapp_broadcasts
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

ALTER TABLE public.whatsapp_broadcasts
  ADD COLUMN IF NOT EXISTS template_variables JSONB DEFAULT '{}'::jsonb;

ALTER TABLE public.whatsapp_broadcasts
  ADD COLUMN IF NOT EXISTS window_start TEXT;

ALTER TABLE public.whatsapp_broadcasts
  ADD COLUMN IF NOT EXISTS window_end TEXT;

ALTER TABLE public.whatsapp_broadcasts
  ADD COLUMN IF NOT EXISTS replied_count INT DEFAULT 0;

-- Indice scheduling
CREATE INDEX IF NOT EXISTS ix_whatsapp_broadcasts_scheduled
  ON public.whatsapp_broadcasts(scheduled_at)
  WHERE status IN ('scheduled', 'sending');

COMMIT;
