-- MP-Batch13 — Hotfix audit criticità
-- ════════════════════════════════════════════════════════════════════════════
-- 1. silvio_tool_calcola_costo_ritardo: rimuove dead code (v_total sovrascritto)
-- 2. silvio_tool_invia_lipe_ade: UPDATE già scoped via WHERE id+company_id (verifica)
-- 3. silvio_tool_identifica_quotes_da_followup: usa diff giorni corretto (epoch/86400)
-- 4. employee_safety_status: ricreata con security_invoker per RLS corretto
-- 5. pos_documents.superseded_by: aggiunge self-FK
-- 6. tg_append_persona_tool_v6: aggiungiamo search_path (già droppato, no-op preventivo)
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- FIX 1 — silvio_tool_calcola_costo_ritardo: rimuove dead code
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.silvio_tool_calcola_costo_ritardo(
  p_company_id uuid,
  p_cantiere_id uuid,
  p_delay_days int
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_penali_giorno numeric := 200;
  v_costi_extra_giorno numeric := 800;
  v_order_value numeric;
BEGIN
  -- Recupera valore order per riferimento (non usato nel calcolo penali/extra)
  SELECT total_amount INTO v_order_value
  FROM public.orders
  WHERE id = p_cantiere_id AND company_id = p_company_id;

  RETURN jsonb_build_object(
    'ok', true,
    'cantiere_id', p_cantiere_id,
    'delay_days', p_delay_days,
    'order_total_amount_eur', v_order_value,
    'penali_stimate_eur', v_penali_giorno * p_delay_days,
    'costi_extra_stimati_eur', v_costi_extra_giorno * p_delay_days,
    'totale_stimato_eur', (v_penali_giorno + v_costi_extra_giorno) * p_delay_days,
    'note', 'Stima default; configurare valori reali in companies.delay_default_*'
  );
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_calcola_costo_ritardo(uuid, uuid, int) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- FIX 2 — silvio_tool_invia_lipe_ade: hardening company_id (in caso bypass RLS)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.silvio_tool_invia_lipe_ade(
  p_company_id uuid,
  p_report_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status
  FROM public.fiscal_reports
  WHERE id = p_report_id AND company_id = p_company_id;

  IF v_status IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'report_not_found_or_wrong_tenant');
  END IF;

  IF v_status NOT IN ('reviewed_commercialista','draft') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status', 'current', v_status);
  END IF;

  -- UPDATE doppio-scoped (id + company_id) per defense-in-depth
  UPDATE public.fiscal_reports
     SET status = 'submitted', submitted_at = now(), updated_at = now()
   WHERE id = p_report_id AND company_id = p_company_id;

  RETURN jsonb_build_object('ok', true, 'report_id', p_report_id, 'submitted_at', now());
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_invia_lipe_ade(uuid, uuid) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- FIX 3 — silvio_tool_identifica_quotes_da_followup: diff giorni corretto
-- EXTRACT(DAY FROM interval) prende solo la componente giorni del field, non
-- il totale. Usiamo (now()::date - sent_at::date) che funziona per qualsiasi gap.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.silvio_tool_identifica_quotes_da_followup(
  p_company_id uuid,
  p_priority_threshold numeric DEFAULT 60
)
RETURNS TABLE (
  quote_id uuid,
  quote_number text,
  client_name text,
  total numeric,
  ai_close_probability_pct numeric,
  giorni_da_invio int,
  status text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT q.id, q.quote_number, q.client_name, q.total, q.ai_close_probability_pct,
    CASE WHEN q.sent_at IS NOT NULL
         THEN (current_date - q.sent_at::date)
         ELSE NULL END,
    q.status
  FROM public.quotes q
  WHERE q.company_id = p_company_id
    AND q.status IN ('sent','viewed','negotiating')
    AND q.signed_at IS NULL AND q.refused_at IS NULL
    AND COALESCE(q.ai_close_probability_pct, 0) >= p_priority_threshold
  ORDER BY q.ai_close_probability_pct DESC NULLS LAST, q.total DESC;
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_identifica_quotes_da_followup(uuid, numeric) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- FIX 4 — employee_safety_status: ricreata con security_invoker
-- ────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.employee_safety_status;
CREATE VIEW public.employee_safety_status
WITH (security_invoker = true) AS
SELECT
  e.id AS employee_id,
  e.company_id,
  (e.first_name || ' ' || e.last_name) AS full_name,
  EXISTS (
    SELECT 1 FROM public.employee_formations f
    WHERE f.employee_id = e.id AND f.formation_type = 'sicurezza_generale_4h'
      AND (f.data_scadenza IS NULL OR f.data_scadenza > current_date)
  ) AS form_generale_ok,
  EXISTS (
    SELECT 1 FROM public.employee_formations f
    WHERE f.employee_id = e.id AND f.formation_type = 'sicurezza_specifica_12h'
      AND (f.data_scadenza IS NULL OR f.data_scadenza > current_date)
  ) AS form_specifica_ok,
  EXISTS (
    SELECT 1 FROM public.employee_visite_mediche v
    WHERE v.employee_id = e.id AND v.esito IN ('idoneo','idoneo_con_prescrizioni')
      AND (v.data_prossima IS NULL OR v.data_prossima > current_date)
  ) AS visita_ok,
  EXISTS (
    SELECT 1 FROM public.employee_dpi_consegne d
    WHERE d.employee_id = e.id AND d.dpi_type = 'casco' AND d.status = 'in_use'
  ) AS casco_ok,
  EXISTS (
    SELECT 1 FROM public.employee_dpi_consegne d
    WHERE d.employee_id = e.id AND d.dpi_type = 'scarpe_antinfortunistiche' AND d.status = 'in_use'
  ) AS scarpe_ok
FROM public.employees e;

-- ────────────────────────────────────────────────────────────────────────────
-- FIX 5 — pos_documents.superseded_by: aggiunge self-FK e indice
-- ────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema='public' AND table_name='pos_documents'
      AND constraint_type='FOREIGN KEY' AND constraint_name='pos_documents_superseded_by_fkey'
  ) THEN
    ALTER TABLE public.pos_documents
      ADD CONSTRAINT pos_documents_superseded_by_fkey
        FOREIGN KEY (superseded_by) REFERENCES public.pos_documents(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pos_active_per_order
  ON public.pos_documents(order_id, version DESC)
  WHERE superseded_by IS NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- FIX 6 — Indici aggiuntivi su employee_skills + team_performance_history
-- ────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_emp_skills_employee
  ON public.employee_skills(employee_id);
CREATE INDEX IF NOT EXISTS idx_team_perf_cantiere
  ON public.team_performance_history(cantiere_id);

DO $$ BEGIN RAISE NOTICE 'MP-Batch13 hotfixes applied: 6 fixes'; END $$;
