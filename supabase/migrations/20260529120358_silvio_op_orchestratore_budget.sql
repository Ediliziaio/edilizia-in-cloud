-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- ════════════════════════════════════════════════════════════════════════════
-- MP-SILVIO-02 · Orchestratore + governo costi (data layer, per-azienda)
-- Il modello produce un PIANO (azioni del registro); il codice lo esegue.
-- Budget token/mese con modalità conservativa al superamento.
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.silvio_esecuzioni (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  utente_id     uuid REFERENCES auth.users(id),
  origine       text NOT NULL DEFAULT 'richiesta' CHECK (origine IN ('richiesta','trigger','playbook')),
  origine_id    uuid,
  intento       text,
  piano         jsonb NOT NULL DEFAULT '{}'::jsonb,
  gradino_max   int NOT NULL DEFAULT 0 CHECK (gradino_max BETWEEN 0 AND 3),
  stato         text NOT NULL DEFAULT 'pianificata'
                  CHECK (stato IN ('pianificata','in_attesa_conferma','eseguita','parziale','rifiutata','errore')),
  token_input   int NOT NULL DEFAULT 0,
  token_output  int NOT NULL DEFAULT 0,
  costo_stimato numeric NOT NULL DEFAULT 0,
  esito         jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_silvio_esec_company ON public.silvio_esecuzioni (company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.silvio_budget (
  company_id        uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  tetto_token_mese  bigint NOT NULL DEFAULT 2000000,
  token_usati_mese  bigint NOT NULL DEFAULT 0,
  mese_corrente     date NOT NULL DEFAULT date_trunc('month', now())::date,
  modalita          text NOT NULL DEFAULT 'normale' CHECK (modalita IN ('normale','conservativa')),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Consuma budget (reset automatico a cambio mese) → ritorna la modalità risultante.
CREATE OR REPLACE FUNCTION public.silvio_budget_consuma(p_company uuid, p_token_in int, p_token_out int)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.silvio_budget; v_mese date := date_trunc('month', now())::date; v_tot bigint;
BEGIN
  INSERT INTO public.silvio_budget (company_id) VALUES (p_company) ON CONFLICT (company_id) DO NOTHING;
  SELECT * INTO b FROM public.silvio_budget WHERE company_id = p_company FOR UPDATE;
  IF b.mese_corrente < v_mese THEN
    UPDATE public.silvio_budget SET token_usati_mese = 0, mese_corrente = v_mese, modalita = 'normale', updated_at = now()
      WHERE company_id = p_company;
    b.token_usati_mese := 0;
  END IF;
  v_tot := b.token_usati_mese + coalesce(p_token_in,0) + coalesce(p_token_out,0);
  UPDATE public.silvio_budget
     SET token_usati_mese = v_tot,
         modalita = CASE WHEN v_tot >= tetto_token_mese THEN 'conservativa' ELSE 'normale' END,
         updated_at = now()
   WHERE company_id = p_company
   RETURNING modalita INTO b.modalita;
  RETURN b.modalita;
END $$;

ALTER TABLE public.silvio_esecuzioni ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.silvio_budget     ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS silvio_esec_staff ON public.silvio_esecuzioni;
CREATE POLICY silvio_esec_staff ON public.silvio_esecuzioni FOR ALL TO authenticated
  USING (company_id = public.get_effective_company_id() AND public.is_email_staff_interno())
  WITH CHECK (company_id = public.get_effective_company_id() AND public.is_email_staff_interno());
DROP POLICY IF EXISTS silvio_esec_service ON public.silvio_esecuzioni;
CREATE POLICY silvio_esec_service ON public.silvio_esecuzioni FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS silvio_esec_super ON public.silvio_esecuzioni;
CREATE POLICY silvio_esec_super ON public.silvio_esecuzioni FOR ALL TO authenticated USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS silvio_budget_staff ON public.silvio_budget;
CREATE POLICY silvio_budget_staff ON public.silvio_budget FOR SELECT TO authenticated
  USING (company_id = public.get_effective_company_id() AND public.is_email_staff_interno());
DROP POLICY IF EXISTS silvio_budget_service ON public.silvio_budget;
CREATE POLICY silvio_budget_service ON public.silvio_budget FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS silvio_budget_super ON public.silvio_budget;
CREATE POLICY silvio_budget_super ON public.silvio_budget FOR ALL TO authenticated USING (public.is_super_admin(auth.uid()));

REVOKE EXECUTE ON FUNCTION public.silvio_budget_consuma(uuid, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.silvio_budget_consuma(uuid, int, int) TO service_role;

COMMENT ON TABLE public.silvio_esecuzioni IS 'MP-SILVIO-02: piani intento→azioni eseguiti dall''orchestratore (per-azienda). Il modello produce il piano, il codice lo esegue.';
COMMENT ON TABLE public.silvio_budget IS 'MP-SILVIO-02: budget token/mese per azienda; oltre il tetto → modalità conservativa.';
