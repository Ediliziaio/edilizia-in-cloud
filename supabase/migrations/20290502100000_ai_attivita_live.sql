SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE IF NOT EXISTS public.ai_attivita_live (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  attore text CHECK (length(attore) <= 120),
  assistente text CHECK (length(assistente) <= 120),
  flusso text NOT NULL CHECK (flusso IN ('whatsapp', 'ddt', 'silvio', 'assistente', 'preventivo', 'riconciliazione')),
  stato text NOT NULL CHECK (stato IN ('in_corso', 'in_attesa', 'completata', 'errore')),
  fase text NOT NULL CHECK (fase ~ '^[a-z_]{1,40}$'),
  modello text CHECK (modello ~ '^[A-Za-z0-9_./:+-]{1,120}$'),
  passaggi jsonb NOT NULL CHECK (jsonb_typeof(passaggi) = 'array' AND jsonb_array_length(passaggi) BETWEEN 1 AND 16),
  started_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  finished_at timestamptz,
  CHECK (updated_at >= started_at),
  CHECK ((stato = 'in_corso') = (finished_at IS NULL))
);

ALTER TABLE public.ai_attivita_live ADD COLUMN IF NOT EXISTS bolla_id uuid;
ALTER TABLE public.ai_attivita_live
  ADD COLUMN IF NOT EXISTS richiesta jsonb,
  ADD COLUMN IF NOT EXISTS lotti jsonb;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS ai_richiesta_id uuid,
  ADD COLUMN IF NOT EXISTS ai_richiesta_salvata_il timestamptz;
CREATE INDEX IF NOT EXISTS quotes_ai_richiesta
  ON public.quotes (company_id, ai_richiesta_id) WHERE ai_richiesta_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.quotes_data_richiesta_ai()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.ai_richiesta_id IS NULL THEN
    NEW.ai_richiesta_salvata_il := NULL;
  ELSIF TG_OP = 'INSERT' OR NEW.ai_richiesta_id IS DISTINCT FROM OLD.ai_richiesta_id THEN
    NEW.ai_richiesta_salvata_il := statement_timestamp();
  ELSE
    NEW.ai_richiesta_salvata_il := OLD.ai_richiesta_salvata_il;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.quotes_data_richiesta_ai() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS quotes_data_richiesta_ai ON public.quotes;
CREATE TRIGGER quotes_data_richiesta_ai
  BEFORE INSERT OR UPDATE OF ai_richiesta_id, ai_richiesta_salvata_il ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.quotes_data_richiesta_ai();

COMMENT ON TABLE public.ai_attivita_live IS
  'Fasi operative recenti degli assistenti. Contiene metadati e orari, senza messaggi, allegati o dati contabili.';

CREATE INDEX IF NOT EXISTS ai_attivita_live_azienda_aggiornata
  ON public.ai_attivita_live (company_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS ai_attivita_live_scadenza
  ON public.ai_attivita_live (updated_at);

ALTER TABLE public.ai_attivita_live ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_attivita_live FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ai_attivita_live TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_attivita_live TO service_role;

DROP POLICY IF EXISTS ai_attivita_live_lettura ON public.ai_attivita_live;
CREATE POLICY ai_attivita_live_lettura ON public.ai_attivita_live
  FOR SELECT TO authenticated
  USING (
    public.user_can_access_company(company_id)
    AND NOT (SELECT public.utente_bloccato())
    AND public.has_permission_for_company((SELECT auth.uid()), 'can_view_settings_customization', company_id)
    AND (
      actor_user_id = (SELECT auth.uid())
      OR public.e_amministratore_di(company_id)
      OR (
        company_id = (SELECT public.get_effective_company_id())
        AND (SELECT public.has_role(auth.uid(), 'super_admin'::public.app_role))
      )
    )
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
    AND NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'ai_attivita_live'
    )
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_attivita_live;
  END IF;
  IF to_regprocedure('cron.schedule(text,text,text)') IS NOT NULL THEN
    PERFORM cron.schedule(
      'ai-attivita-live-scadenza', '21 2 * * *',
      'DELETE FROM public.ai_attivita_live WHERE updated_at < now() - interval ''7 days'''
    );
  END IF;
END $$;
