-- ════════════════════════════════════════════════════════════════════════════
-- MP-AIE-16 — AI Contratto d'Appalto Generator (FASE B.1)
-- ════════════════════════════════════════════════════════════════════════════
-- Tabella per archiviare contratti d'appalto generati da AI a partire da
-- ordini, con versioning, status, contenuto markdown editabile e PDF.
-- Conforme art. 1655 c.c. (contratto di appalto) + D.Lgs 50/2016 dove rilevante.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Tabella contratti_documents
CREATE TABLE IF NOT EXISTS public.contratti_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  numero_contratto text,
  versione int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'bozza' CHECK (status IN ('bozza','revisione','firmato','annullato')),

  -- Parti
  committente_nome text,
  committente_cf text,
  committente_pi text,
  committente_indirizzo text,
  appaltatore_nome text,
  appaltatore_pi text,
  appaltatore_indirizzo text,

  -- Oggetto
  oggetto_lavori text,
  ubicazione_cantiere text,
  importo_totale_eur numeric(15,2),
  modalita_pagamento text,
  data_inizio_lavori date,
  data_fine_prevista date,
  durata_giorni int,
  penale_ritardo_eur_giorno numeric(10,2),
  garanzia_anni int DEFAULT 2,

  -- Contenuto
  contenuto_md text,                     -- markdown completo editabile
  contenuto_html text,                   -- HTML pronto per stampa
  ai_generated_raw jsonb,                -- output AI raw
  pdf_url text,
  pdf_storage_path text,

  -- Metadata
  generated_by text DEFAULT 'ai',        -- 'ai' | 'manual'
  ai_model_used text,
  created_by uuid REFERENCES public.profiles(id),
  approved_by uuid REFERENCES public.profiles(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contratti_company ON public.contratti_documents(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contratti_order ON public.contratti_documents(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contratti_status ON public.contratti_documents(company_id, status);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.contratti_documents_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_contratti_documents_updated ON public.contratti_documents;
CREATE TRIGGER trg_contratti_documents_updated
  BEFORE UPDATE ON public.contratti_documents
  FOR EACH ROW EXECUTE FUNCTION public.contratti_documents_set_updated_at();

-- 2) RLS
ALTER TABLE public.contratti_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contratti_select_company" ON public.contratti_documents;
CREATE POLICY "contratti_select_company" ON public.contratti_documents
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  );

DROP POLICY IF EXISTS "contratti_insert_admin" ON public.contratti_documents;
CREATE POLICY "contratti_insert_admin" ON public.contratti_documents
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('super_admin','company_admin')
    )
  );

DROP POLICY IF EXISTS "contratti_update_admin" ON public.contratti_documents;
CREATE POLICY "contratti_update_admin" ON public.contratti_documents
  FOR UPDATE USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('super_admin','company_admin')
    )
  );

DROP POLICY IF EXISTS "contratti_delete_admin" ON public.contratti_documents;
CREATE POLICY "contratti_delete_admin" ON public.contratti_documents
  FOR DELETE USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('super_admin','company_admin')
    )
  );

-- 3) AI Router config: documento_contratto + documento_pos (migrazione futura)
INSERT INTO public.ai_router_config (task_key, task_label, task_description, primary_model, fallback_models, default_params, tier_key, category, enabled)
VALUES
  (
    'documento_contratto',
    'Contratto d''Appalto AI',
    'Genera contratto d''appalto in markdown conforme art. 1655 c.c.',
    'anthropic/claude-haiku-4.5',
    '["anthropic/claude-sonnet-4.5","openai/gpt-4o-mini"]'::jsonb,
    '{"temperature":0.2,"max_tokens":4000}'::jsonb,
    't3_balanced',
    'document',
    true
  ),
  (
    'documento_pos',
    'POS D.Lgs 81/08',
    'Genera Piano Operativo Sicurezza conforme D.Lgs 81/08 art. 89',
    'anthropic/claude-haiku-4.5',
    '["openai/gpt-4o-mini"]'::jsonb,
    '{"temperature":0.2,"max_tokens":3500}'::jsonb,
    't3_balanced',
    'document',
    true
  )
ON CONFLICT (task_key) DO UPDATE
  SET task_label = EXCLUDED.task_label,
      task_description = EXCLUDED.task_description,
      primary_model = EXCLUDED.primary_model,
      fallback_models = EXCLUDED.fallback_models,
      default_params = EXCLUDED.default_params,
      tier_key = EXCLUDED.tier_key,
      category = EXCLUDED.category;

-- 4) Numerazione progressiva contratti per company
CREATE OR REPLACE FUNCTION public.next_contratto_numero(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year int := EXTRACT(YEAR FROM CURRENT_DATE)::int;
  v_count int;
BEGIN
  SELECT COUNT(*) + 1 INTO v_count
  FROM public.contratti_documents
  WHERE company_id = p_company_id
    AND EXTRACT(YEAR FROM created_at) = v_year;
  RETURN format('CON-%s-%s', v_year, lpad(v_count::text, 4, '0'));
END;
$$;

REVOKE ALL ON FUNCTION public.next_contratto_numero(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.next_contratto_numero(uuid) TO authenticated, service_role;

-- 5) Verifica
DO $$
DECLARE v_cnt int;
BEGIN
  SELECT count(*) INTO v_cnt FROM public.ai_router_config WHERE task_key IN ('documento_contratto','documento_pos');
  RAISE NOTICE 'AI Router contratto config: % task registrati (atteso 2)', v_cnt;
END $$;
