-- Arricchimento storico centralino: operatore + contatto (denormalizzati per
-- visualizzazione senza join/RLS), session id Telnyx (per agganciare le
-- registrazioni) e url registrazione.
ALTER TABLE public.human_call_logs
  ADD COLUMN IF NOT EXISTS user_name text,
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS telnyx_session_id text,
  ADD COLUMN IF NOT EXISTS recording_url text;

CREATE INDEX IF NOT EXISTS idx_human_call_logs_session
  ON public.human_call_logs (telnyx_session_id)
  WHERE telnyx_session_id IS NOT NULL;
