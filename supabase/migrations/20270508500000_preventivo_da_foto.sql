-- MP-SALES-02 — Preventivo da Foto/Disegno
-- ════════════════════════════════════════════════════════════════════════════
-- Cliente carica foto + sketch → AI Vision analizza → genera computo metrico
-- estimativo da listino vertical → preventivo draft (status='draft_ai').
-- Sales/PM rivede + firma + invia. Differenziatore competitivo enorme.
--
-- Schema: preventivo_da_foto_runs (orchestratore stato + audit) +
-- estensione quotes con flag is_ai_generated + ai_metadata.
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1) preventivo_da_foto_runs (state machine + audit AI)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.preventivo_da_foto_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Origine del lead (3 fonti possibili)
  source          text NOT NULL CHECK (source IN ('portal_customer','public_landing','whatsapp','telegram','email','manual_ui')),

  -- Cliente (può essere nuovo lead o esistente)
  customer_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  lead_email      text,
  lead_phone      text,
  lead_name       text,

  -- Indirizzo cantiere
  cantiere_address text,
  cantiere_comune  text,
  cantiere_provincia text,

  -- Vertical della company al momento della richiesta
  vertical_key    text,

  -- Input cliente
  description     text,
  budget_hint_eur numeric(12,2),
  urgenza         text CHECK (urgenza IN ('non_urgente','normale','urgente','molto_urgente')),

  -- Storage paths (foto + sketch)
  image_storage_paths  text[],
  sketch_storage_paths text[],

  -- Stato pipeline
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending','analyzing_images','composing_quote','draft_ready',
    'reviewed','sent_to_customer','accepted','rejected','expired','failed'
  )),

  -- AI vision results
  vision_results          jsonb,
  vision_persona_used     text DEFAULT 'tecnico',
  vision_cost_billed_eur  numeric(10,4),

  -- Computo generato (snapshot per audit; quote autoritativa è in `quotes`)
  computo_draft           jsonb,
  computo_total_eur       numeric(12,2),

  -- Quote final
  quote_id                uuid REFERENCES public.quotes(id) ON DELETE SET NULL,

  -- HITL
  reviewed_by_user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at             timestamptz,

  -- Errori
  error_step              text,
  error_message           text,

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pdf_runs_company_status
  ON public.preventivo_da_foto_runs(company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pdf_runs_customer
  ON public.preventivo_da_foto_runs(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pdf_runs_pending_review
  ON public.preventivo_da_foto_runs(created_at DESC)
  WHERE status IN ('draft_ready');

ALTER TABLE public.preventivo_da_foto_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pdf_runs_company_read ON public.preventivo_da_foto_runs;
CREATE POLICY pdf_runs_company_read ON public.preventivo_da_foto_runs FOR SELECT
  USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS pdf_runs_admin ON public.preventivo_da_foto_runs;
CREATE POLICY pdf_runs_admin ON public.preventivo_da_foto_runs FOR ALL
  USING (
    company_id = public.get_my_company_id()
    AND public.has_role(auth.uid(), 'company_admin'::public.app_role)
  );

DROP POLICY IF EXISTS pdf_runs_super_admin ON public.preventivo_da_foto_runs;
CREATE POLICY pdf_runs_super_admin ON public.preventivo_da_foto_runs FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

COMMENT ON TABLE public.preventivo_da_foto_runs IS
  'MP-SALES-02: orchestratore preventivo da foto+sketch. AI vision → computo → quote draft.';

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.tg_pdf_runs_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_pdf_runs_updated_at ON public.preventivo_da_foto_runs;
CREATE TRIGGER trg_pdf_runs_updated_at
  BEFORE UPDATE ON public.preventivo_da_foto_runs
  FOR EACH ROW EXECUTE FUNCTION public.tg_pdf_runs_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- 2) Estensione quotes con flag AI-generated
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS is_ai_generated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_pdf_run_id uuid REFERENCES public.preventivo_da_foto_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ai_persona_used text,
  ADD COLUMN IF NOT EXISTS ai_cost_billed_eur numeric(10,4);

CREATE INDEX IF NOT EXISTS idx_quotes_ai_generated
  ON public.quotes(company_id, created_at DESC) WHERE is_ai_generated = true;

-- ────────────────────────────────────────────────────────────────────────────
-- 3) RPC: silvio_tool_lista_preventivi_da_foto_draft
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_lista_preventivi_da_foto_draft(
  p_company_id uuid,
  p_user_id uuid,
  p_status_filter text DEFAULT 'draft_ready'
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'count', COUNT(*),
    'runs', COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', id,
        'source', source,
        'lead_name', lead_name,
        'lead_email', lead_email,
        'cantiere_address', cantiere_address,
        'vertical_key', vertical_key,
        'urgenza', urgenza,
        'description', LEFT(description, 200),
        'image_count', COALESCE(array_length(image_storage_paths, 1), 0),
        'sketch_count', COALESCE(array_length(sketch_storage_paths, 1), 0),
        'status', status,
        'computo_total_eur', computo_total_eur,
        'quote_id', quote_id,
        'created_at', created_at
      ) ORDER BY created_at DESC
    ) FILTER (WHERE id IS NOT NULL), '[]'::jsonb)
  ) INTO v_result
  FROM public.preventivo_da_foto_runs
  WHERE company_id = p_company_id
    AND (p_status_filter IS NULL OR status = p_status_filter);

  RETURN COALESCE(v_result, jsonb_build_object('count', 0, 'runs', '[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_lista_preventivi_da_foto_draft(uuid, uuid, text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_lista_preventivi_da_foto_draft(uuid, uuid, text)
  TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 4) RPC: silvio_tool_crea_preventivo_da_foto (placeholder + audit)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_crea_preventivo_da_foto(
  p_company_id uuid,
  p_user_id uuid,
  p_source text,
  p_customer_id uuid DEFAULT NULL,
  p_lead_name text DEFAULT NULL,
  p_lead_email text DEFAULT NULL,
  p_lead_phone text DEFAULT NULL,
  p_cantiere_address text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_image_storage_paths text[] DEFAULT NULL,
  p_sketch_storage_paths text[] DEFAULT NULL,
  p_urgenza text DEFAULT 'normale',
  p_budget_hint_eur numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id uuid;
  v_vertical_key text;
BEGIN
  IF p_image_storage_paths IS NULL OR array_length(p_image_storage_paths, 1) = 0 THEN
    RETURN jsonb_build_object('error', 'Almeno una foto è obbligatoria');
  END IF;

  -- Carica vertical della company
  SELECT vertical_key INTO v_vertical_key FROM public.companies WHERE id = p_company_id;

  INSERT INTO public.preventivo_da_foto_runs (
    company_id, source, customer_id, lead_name, lead_email, lead_phone,
    cantiere_address, vertical_key, description, urgenza, budget_hint_eur,
    image_storage_paths, sketch_storage_paths, status
  ) VALUES (
    p_company_id, p_source, p_customer_id, p_lead_name, p_lead_email, p_lead_phone,
    p_cantiere_address, v_vertical_key, p_description, p_urgenza, p_budget_hint_eur,
    p_image_storage_paths, p_sketch_storage_paths, 'pending'
  )
  RETURNING id INTO v_run_id;

  RETURN jsonb_build_object(
    'success', true,
    'run_id', v_run_id,
    'pending', true,
    'vertical_key', v_vertical_key,
    'image_count', array_length(p_image_storage_paths, 1),
    'message', 'Preventivo da foto in elaborazione (analisi vision in corso)...'
  );
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_crea_preventivo_da_foto(uuid, uuid, text, uuid, text, text, text, text, text, text[], text[], text, numeric)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_crea_preventivo_da_foto(uuid, uuid, text, uuid, text, text, text, text, text, text[], text[], text, numeric)
  TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 5) RPC: silvio_tool_aggiorna_preventivo_da_foto_results (chiamato da edge)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_aggiorna_preventivo_da_foto_results(
  p_run_id uuid,
  p_company_id uuid,
  p_vision_results jsonb,
  p_computo_draft jsonb,
  p_computo_total_eur numeric,
  p_vision_cost_billed_eur numeric,
  p_quote_id uuid DEFAULT NULL,
  p_status text DEFAULT 'draft_ready'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.preventivo_da_foto_runs
     SET vision_results = p_vision_results,
         computo_draft = p_computo_draft,
         computo_total_eur = p_computo_total_eur,
         vision_cost_billed_eur = p_vision_cost_billed_eur,
         quote_id = COALESCE(p_quote_id, quote_id),
         status = p_status,
         updated_at = NOW()
   WHERE id = p_run_id AND company_id = p_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Run non trovato');
  END IF;

  RETURN jsonb_build_object('success', true, 'run_id', p_run_id, 'status', p_status);
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_aggiorna_preventivo_da_foto_results(uuid, uuid, jsonb, jsonb, numeric, numeric, uuid, text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_aggiorna_preventivo_da_foto_results(uuid, uuid, jsonb, jsonb, numeric, numeric, uuid, text)
  TO service_role;
