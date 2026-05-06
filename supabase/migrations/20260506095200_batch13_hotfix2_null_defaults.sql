-- MP-Batch13 — Hotfix2: NULL handling per RPC con DEFAULT non-NULL
-- ════════════════════════════════════════════════════════════════════════════
-- Quando il client TS passa null esplicitamente per parametri con DEFAULT,
-- PostgREST sovrascrive il default con NULL. Aggiungiamo COALESCE interno.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.silvio_tool_aggiorna_skill_da_rapportini(
  p_company_id uuid,
  p_employee_id uuid,
  p_period_start date DEFAULT NULL,
  p_period_end date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_start date := COALESCE(p_period_start, (current_date - interval '90 days')::date);
  v_end date := COALESCE(p_period_end, current_date);
BEGIN
  RETURN jsonb_build_object(
    'ok', true,
    'employee_id', p_employee_id,
    'period', jsonb_build_object('start', v_start, 'end', v_end),
    'next_step', 'edge:ai-team-recommender aggiorna scores'
  );
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_aggiorna_skill_da_rapportini(uuid, uuid, date, date) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.silvio_tool_prenota_formazione_operaio(
  p_company_id uuid,
  p_employee_id uuid,
  p_formation_type text,
  p_ente_erogante text DEFAULT NULL,
  p_data_completamento date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_data date := COALESCE(p_data_completamento, current_date);
BEGIN
  INSERT INTO public.employee_formations(
    company_id, employee_id, formation_type, ente_erogante, data_completamento, status
  )
  VALUES (p_company_id, p_employee_id, p_formation_type, p_ente_erogante, v_data, 'valid')
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'formation_id', v_id);
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_prenota_formazione_operaio(uuid, uuid, text, text, date) TO authenticated;

DO $$ BEGIN RAISE NOTICE 'MP-Batch13 hotfix2: NULL handling RPC corrected'; END $$;
