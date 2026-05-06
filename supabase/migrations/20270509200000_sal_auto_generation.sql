-- MP-OPS-04 — SAL Automatico da Rapportini
-- ════════════════════════════════════════════════════════════════════════════
-- Composizione SAL automatica aggregando rapportini, foto, DDT, computi.
-- Defensive: tabella `sal` può non esistere → la creiamo se manca con schema
-- minimo compatibile, oppure estendiamo se esiste.
--
-- sal_auto_generation_runs traccia gli ultimi run per company/cantiere.
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1) Crea sal table se manca (schema base)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sal (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id        uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,

  numero_progressivo int,
  data_sal        date NOT NULL DEFAULT CURRENT_DATE,
  importo         numeric(12,2),
  pct_avanzamento numeric(5,2),

  status          text NOT NULL DEFAULT 'bozza' CHECK (status IN (
    'bozza','draft_ai','approvato','firmato','inviato','contestato','pagato','annullato'
  )),

  pdf_storage_path text,
  ai_narrative    text,

  approved_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at     timestamptz,
  signed_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  signed_at       timestamptz,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sal_company_order
  ON public.sal(company_id, order_id, data_sal DESC);
CREATE INDEX IF NOT EXISTS idx_sal_status
  ON public.sal(status, created_at DESC) WHERE status NOT IN ('pagato','annullato');

ALTER TABLE public.sal ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sal_company_read ON public.sal;
CREATE POLICY sal_company_read ON public.sal FOR SELECT
  USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS sal_admin ON public.sal;
CREATE POLICY sal_admin ON public.sal FOR ALL
  USING (
    company_id = public.get_my_company_id()
    AND public.has_role(auth.uid(), 'company_admin'::public.app_role)
  );

DROP POLICY IF EXISTS sal_super_admin ON public.sal;
CREATE POLICY sal_super_admin ON public.sal FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- ────────────────────────────────────────────────────────────────────────────
-- 2) Estensione sal con AI metadata
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.sal
  ADD COLUMN IF NOT EXISTS generation_method text NOT NULL DEFAULT 'manual'
    CHECK (generation_method IN ('manual','auto_ai','imported')),
  ADD COLUMN IF NOT EXISTS ai_persona_used text,
  ADD COLUMN IF NOT EXISTS ai_cost_billed_eur numeric(10,4),
  ADD COLUMN IF NOT EXISTS ai_confidence numeric(3,2),

  -- Triggering
  ADD COLUMN IF NOT EXISTS trigger_type text CHECK (trigger_type IN (
    'manual','schedule_15days','milestone_phase_end','threshold_pct'
  )),

  -- Aggregati origine
  ADD COLUMN IF NOT EXISTS source_rapportini_ids uuid[],
  ADD COLUMN IF NOT EXISTS source_ddt_ids uuid[],
  ADD COLUMN IF NOT EXISTS source_subappaltatori_sal_ids uuid[],
  ADD COLUMN IF NOT EXISTS source_period_start date,
  ADD COLUMN IF NOT EXISTS source_period_end date,

  -- Calcoli (legge 296/2006 ritenuta 0.5%)
  ADD COLUMN IF NOT EXISTS importo_lordo numeric(12,2),
  ADD COLUMN IF NOT EXISTS ritenute_garanzia numeric(12,2),
  ADD COLUMN IF NOT EXISTS ritenuta_legge_296 numeric(12,2),
  ADD COLUMN IF NOT EXISTS detrazione_anticipi numeric(12,2),
  ADD COLUMN IF NOT EXISTS detrazione_sal_precedenti numeric(12,2),
  ADD COLUMN IF NOT EXISTS importo_netto numeric(12,2),
  ADD COLUMN IF NOT EXISTS pct_avanzamento_totale numeric(5,2),

  -- Validazione AI
  ADD COLUMN IF NOT EXISTS ai_validation_warnings jsonb,
  ADD COLUMN IF NOT EXISTS ai_validation_blocking boolean NOT NULL DEFAULT false;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.tg_sal_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_sal_updated_at ON public.sal;
CREATE TRIGGER trg_sal_updated_at
  BEFORE UPDATE ON public.sal
  FOR EACH ROW EXECUTE FUNCTION public.tg_sal_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- 3) sal_auto_generation_runs — audit/retry
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sal_auto_generation_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id        uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  trigger_type    text NOT NULL,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending','aggregating','composing','validating','draft_ready','failed','superseded'
  )),
  sal_generated_id uuid REFERENCES public.sal(id) ON DELETE SET NULL,
  ai_cost_eur     numeric(10,4),
  error_message   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sal_runs_pending
  ON public.sal_auto_generation_runs(status, created_at)
  WHERE status NOT IN ('draft_ready','failed','superseded');
CREATE INDEX IF NOT EXISTS idx_sal_runs_order
  ON public.sal_auto_generation_runs(order_id, created_at DESC);

ALTER TABLE public.sal_auto_generation_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sal_runs_company ON public.sal_auto_generation_runs;
CREATE POLICY sal_runs_company ON public.sal_auto_generation_runs FOR SELECT
  USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS sal_runs_admin ON public.sal_auto_generation_runs;
CREATE POLICY sal_runs_admin ON public.sal_auto_generation_runs FOR ALL
  USING (
    company_id = public.get_my_company_id()
    AND public.has_role(auth.uid(), 'company_admin'::public.app_role)
  );

DROP POLICY IF EXISTS sal_runs_super_admin ON public.sal_auto_generation_runs;
CREATE POLICY sal_runs_super_admin ON public.sal_auto_generation_runs FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- Settings company
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS sal_auto_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sal_auto_frequency_days int NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS sal_auto_threshold_pct numeric(5,2) NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS sal_ritenute_garanzia_pct numeric(5,2) NOT NULL DEFAULT 0.5;

-- ────────────────────────────────────────────────────────────────────────────
-- 4) RPC: silvio_tool_compone_sal_da_rapportini
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_compone_sal_da_rapportini(
  p_company_id uuid,
  p_user_id uuid,
  p_order_id uuid,
  p_period_start date DEFAULT NULL,
  p_period_end date DEFAULT NULL,
  p_force_regenerate boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_run_id uuid;
  v_period_start date;
  v_period_end date;
  v_last_sal_date date;
BEGIN
  SELECT id, order_code, company_id, total_amount INTO v_order
    FROM public.orders WHERE id = p_order_id;

  IF v_order IS NULL OR v_order.company_id <> p_company_id THEN
    RETURN jsonb_build_object('error', 'Cantiere non trovato per questa azienda');
  END IF;

  -- Determina periodo: dal giorno dopo l'ultimo SAL approvato (o data inizio se primo)
  SELECT MAX(data_sal) INTO v_last_sal_date
    FROM public.sal
   WHERE order_id = p_order_id AND status IN ('approvato','firmato','inviato','pagato');

  v_period_start := COALESCE(p_period_start, v_last_sal_date + 1, CURRENT_DATE - 30);
  v_period_end := COALESCE(p_period_end, CURRENT_DATE);

  IF v_period_end < v_period_start THEN
    RETURN jsonb_build_object('error', 'Periodo non valido (fine < inizio)');
  END IF;

  -- Crea run pending
  INSERT INTO public.sal_auto_generation_runs (
    company_id, order_id, trigger_type, status
  ) VALUES (
    p_company_id, p_order_id, 'manual', 'pending'
  )
  RETURNING id INTO v_run_id;

  RETURN jsonb_build_object(
    'success', true,
    'run_id', v_run_id,
    'pending', true,
    'order_code', v_order.order_code,
    'period_start', v_period_start,
    'period_end', v_period_end,
    'message', format('Generazione SAL per cantiere %s (%s → %s) avviata', v_order.order_code, v_period_start, v_period_end)
  );
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_compone_sal_da_rapportini(uuid, uuid, uuid, date, date, boolean)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_compone_sal_da_rapportini(uuid, uuid, uuid, date, date, boolean)
  TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 5) RPC: silvio_tool_lista_sal_in_attesa
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_lista_sal_in_attesa(
  p_company_id uuid,
  p_user_id uuid
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
    'sal', COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'order_id', s.order_id,
        'order_code', o.order_code,
        'data_sal', s.data_sal,
        'numero_progressivo', s.numero_progressivo,
        'importo', s.importo,
        'importo_netto', s.importo_netto,
        'pct_avanzamento', s.pct_avanzamento,
        'status', s.status,
        'generation_method', s.generation_method,
        'has_warnings', s.ai_validation_blocking OR (s.ai_validation_warnings IS NOT NULL AND jsonb_array_length(s.ai_validation_warnings) > 0)
      ) ORDER BY s.created_at DESC
    ) FILTER (WHERE s.id IS NOT NULL), '[]'::jsonb)
  ) INTO v_result
  FROM public.sal s
  JOIN public.orders o ON o.id = s.order_id
  WHERE s.company_id = p_company_id
    AND s.status IN ('bozza','draft_ai');

  RETURN COALESCE(v_result, jsonb_build_object('count', 0, 'sal', '[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_lista_sal_in_attesa(uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_lista_sal_in_attesa(uuid, uuid) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 6) RPC: silvio_tool_approva_sal (yellow → HITL)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_approva_sal(
  p_company_id uuid,
  p_user_id uuid,
  p_sal_id uuid,
  p_observations text DEFAULT NULL,
  p_force_proceed_with_warnings boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sal RECORD;
BEGIN
  SELECT id, company_id, status, ai_validation_blocking, ai_validation_warnings
    INTO v_sal
    FROM public.sal WHERE id = p_sal_id;

  IF v_sal IS NULL OR v_sal.company_id <> p_company_id THEN
    RETURN jsonb_build_object('error', 'SAL non trovato');
  END IF;

  IF v_sal.status NOT IN ('bozza','draft_ai') THEN
    RETURN jsonb_build_object('error', format('SAL già in stato "%s"', v_sal.status));
  END IF;

  IF v_sal.ai_validation_blocking AND NOT p_force_proceed_with_warnings THEN
    RETURN jsonb_build_object(
      'error', 'SAL ha warning bloccanti. Risolvili o usa force_proceed_with_warnings=true',
      'warnings', v_sal.ai_validation_warnings
    );
  END IF;

  UPDATE public.sal
     SET status = 'approvato',
         approved_by = p_user_id,
         approved_at = NOW(),
         updated_at = NOW()
   WHERE id = p_sal_id;

  RETURN jsonb_build_object(
    'success', true,
    'sal_id', p_sal_id,
    'message', 'SAL approvato. Pronto per firma e invio.',
    'observations', p_observations
  );
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_approva_sal(uuid, uuid, uuid, text, boolean)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_approva_sal(uuid, uuid, uuid, text, boolean)
  TO service_role;
