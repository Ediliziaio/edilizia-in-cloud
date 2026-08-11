-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Registro chiamate "umane" della centralina (softphone WebRTC): storico per il
-- call center. Una riga per chiamata effettuata dall'operatore dal browser.
CREATE TABLE IF NOT EXISTS public.human_call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  contact_id uuid,
  direction text NOT NULL DEFAULT 'outbound',
  to_number text,
  from_number text,
  status text NOT NULL DEFAULT 'active',  -- active | completed | failed
  duration_seconds integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_human_call_logs_company_started
  ON public.human_call_logs (company_id, started_at DESC);

ALTER TABLE public.human_call_logs ENABLE ROW LEVEL SECURITY;

-- L'azienda vede/scrive il proprio storico chiamate.
CREATE POLICY human_call_logs_company ON public.human_call_logs
  FOR ALL TO authenticated
  USING (company_id = get_my_company_id())
  WITH CHECK (company_id = get_my_company_id());

COMMENT ON TABLE public.human_call_logs IS
  'Storico chiamate della centralina softphone WebRTC (operatore umano).';
