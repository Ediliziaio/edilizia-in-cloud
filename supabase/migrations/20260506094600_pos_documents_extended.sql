-- MP-OPS-08 — Sicurezza & POS Automatici
-- ════════════════════════════════════════════════════════════════════════════
-- Estende pos_documents esistente con sezioni AI generate + sign-off workflow.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.pos_documents
  ADD COLUMN IF NOT EXISTS document_type text,
  ADD COLUMN IF NOT EXISTS identificazione_cantiere jsonb,
  ADD COLUMN IF NOT EXISTS organizzazione_cantiere jsonb,
  ADD COLUMN IF NOT EXISTS individuazione_rischi jsonb,
  ADD COLUMN IF NOT EXISTS misure_prevenzione jsonb,
  ADD COLUMN IF NOT EXISTS dpi_required jsonb,
  ADD COLUMN IF NOT EXISTS formazioni_required jsonb,
  ADD COLUMN IF NOT EXISTS cronoprogramma jsonb,
  ADD COLUMN IF NOT EXISTS riferimenti_normativi jsonb,
  ADD COLUMN IF NOT EXISTS pdf_storage_path text,
  ADD COLUMN IF NOT EXISTS pages_count int,
  ADD COLUMN IF NOT EXISTS rspp_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS rspp_user_id uuid,
  ADD COLUMN IF NOT EXISTS rls_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS datore_lavoro_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS valid_from date,
  ADD COLUMN IF NOT EXISTS valid_until date,
  ADD COLUMN IF NOT EXISTS superseded_by uuid,
  ADD COLUMN IF NOT EXISTS ai_persona_used text DEFAULT 'compliance',
  ADD COLUMN IF NOT EXISTS ai_cost_billed_eur numeric(10,4) DEFAULT 0;

-- Default document_type a 'pos' se NULL
UPDATE public.pos_documents SET document_type = 'pos' WHERE document_type IS NULL;

-- Note: non aggiungiamo CHECK constraint su document_type perché potrebbero
-- esistere righe legacy. Validation lato applicativo.

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: silvio_tool_genera_pos_cantiere
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.silvio_tool_genera_pos_cantiere(
  p_company_id uuid,
  p_cantiere_id uuid,
  p_force_regenerate boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_existing_id uuid;
  v_id uuid;
BEGIN
  SELECT id INTO v_existing_id
  FROM public.pos_documents
  WHERE company_id = p_company_id
    AND order_id = p_cantiere_id
    AND COALESCE(document_type, 'pos') = 'pos'
    AND superseded_by IS NULL
  ORDER BY version DESC LIMIT 1;

  IF v_existing_id IS NOT NULL AND NOT p_force_regenerate THEN
    RETURN jsonb_build_object('ok', true, 'already_exists', true, 'pos_id', v_existing_id);
  END IF;

  INSERT INTO public.pos_documents(company_id, order_id, document_type, status, version, valid_from)
  VALUES (p_company_id, p_cantiere_id, 'pos', 'draft', 1, current_date)
  RETURNING id INTO v_id;

  IF v_existing_id IS NOT NULL AND p_force_regenerate THEN
    UPDATE public.pos_documents SET superseded_by = v_id WHERE id = v_existing_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'pos_id', v_id, 'next_step', 'edge:ai-genera-pos-duvri');
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_genera_pos_cantiere(uuid, uuid, boolean) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: silvio_tool_genera_duvri_cantiere
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.silvio_tool_genera_duvri_cantiere(
  p_company_id uuid,
  p_cantiere_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.pos_documents(company_id, order_id, document_type, status, version, valid_from)
  VALUES (p_company_id, p_cantiere_id, 'duvri', 'draft', 1, current_date)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'duvri_id', v_id, 'next_step', 'edge:ai-genera-pos-duvri');
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_genera_duvri_cantiere(uuid, uuid) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: silvio_tool_valida_dpi_operai_cantiere
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.silvio_tool_valida_dpi_operai_cantiere(
  p_company_id uuid,
  p_cantiere_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_results jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'employee_id', a.employee_id,
    'casco_ok', s.casco_ok,
    'scarpe_ok', s.scarpe_ok,
    'compliant', (s.casco_ok AND s.scarpe_ok)
  )), '[]'::jsonb)
    INTO v_results
  FROM public.cantiere_allocations a
  LEFT JOIN public.employee_safety_status s ON s.employee_id = a.employee_id
  WHERE a.company_id = p_company_id AND a.cantiere_id = p_cantiere_id
    AND a.employee_id IS NOT NULL;

  RETURN jsonb_build_object('ok', true, 'cantiere_id', p_cantiere_id, 'operai', v_results);
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_valida_dpi_operai_cantiere(uuid, uuid) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: silvio_tool_verifica_formazioni_operai
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.silvio_tool_verifica_formazioni_operai(
  p_company_id uuid,
  p_cantiere_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_results jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'employee_id', a.employee_id,
    'form_generale_ok', s.form_generale_ok,
    'form_specifica_ok', s.form_specifica_ok,
    'visita_ok', s.visita_ok,
    'compliant', (s.form_generale_ok AND s.form_specifica_ok AND s.visita_ok)
  )), '[]'::jsonb)
    INTO v_results
  FROM public.cantiere_allocations a
  LEFT JOIN public.employee_safety_status s ON s.employee_id = a.employee_id
  WHERE a.company_id = p_company_id AND a.cantiere_id = p_cantiere_id
    AND a.employee_id IS NOT NULL;

  RETURN jsonb_build_object('ok', true, 'cantiere_id', p_cantiere_id, 'operai', v_results);
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_verifica_formazioni_operai(uuid, uuid) TO authenticated;

DO $$ BEGIN RAISE NOTICE 'MP-OPS-08 deployed: pos_documents extended + 4 RPC'; END $$;
