-- MP-HR-03 — Allocazione Operai Ottimale
-- ════════════════════════════════════════════════════════════════════════════
-- Tracking competenze + skill matching + analytics produttività squadre.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.employee_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,

  skill_key text NOT NULL,
  proficiency_level int NOT NULL CHECK (proficiency_level BETWEEN 1 AND 5),

  total_hours_in_skill numeric(10,2) DEFAULT 0,
  last_used_at date,
  productivity_score numeric(3,2),

  certified boolean DEFAULT false,
  certificate_path text,
  certificate_expiry date,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT uq_employee_skill UNIQUE (employee_id, skill_key)
);

CREATE INDEX IF NOT EXISTS idx_emp_skills_company_skill ON public.employee_skills(company_id, skill_key, proficiency_level DESC);

ALTER TABLE public.employee_skills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS emp_skills_company ON public.employee_skills;
CREATE POLICY emp_skills_company ON public.employee_skills
  FOR ALL USING (company_id = public.get_my_company_id());

-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.team_performance_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_ids uuid[] NOT NULL,
  cantiere_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  lavorazione_type text,

  produttivita_score numeric(3,2),
  qualita_score numeric(3,2),
  rispetto_tempi_score numeric(3,2),

  ai_team_notes text,

  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_perf_company ON public.team_performance_history(company_id, created_at DESC);

ALTER TABLE public.team_performance_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS team_perf_company ON public.team_performance_history;
CREATE POLICY team_perf_company ON public.team_performance_history
  FOR ALL USING (company_id = public.get_my_company_id());

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: silvio_tool_suggerisci_squadra_cantiere
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.silvio_tool_suggerisci_squadra_cantiere(
  p_company_id uuid,
  p_cantiere_id uuid,
  p_lavorazione text DEFAULT NULL,
  p_team_size int DEFAULT 3
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_team jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'employee_id', e.id,
    'first_name', e.first_name,
    'last_name', e.last_name,
    'productivity_score', s.productivity_score,
    'proficiency_level', s.proficiency_level,
    'total_hours_in_skill', s.total_hours_in_skill,
    'reasoning', format('Score %.2f, %s ore in skill', COALESCE(s.productivity_score, 0), COALESCE(s.total_hours_in_skill, 0))
  )), '[]'::jsonb) INTO v_team
  FROM public.employee_skills s
  JOIN public.employees e ON e.id = s.employee_id
  WHERE s.company_id = p_company_id
    AND (p_lavorazione IS NULL OR s.skill_key = p_lavorazione)
    AND e.is_active = true
  ORDER BY (s.productivity_score * s.proficiency_level) DESC NULLS LAST
  LIMIT p_team_size;

  RETURN jsonb_build_object(
    'ok', true,
    'cantiere_id', p_cantiere_id,
    'lavorazione', p_lavorazione,
    'team_suggested', v_team
  );
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_suggerisci_squadra_cantiere(uuid, uuid, text, int) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: silvio_tool_analizza_competenze_operaio
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.silvio_tool_analizza_competenze_operaio(
  p_company_id uuid,
  p_employee_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_skills jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'skill_key', skill_key,
    'proficiency_level', proficiency_level,
    'total_hours', total_hours_in_skill,
    'productivity_score', productivity_score,
    'certified', certified,
    'last_used_at', last_used_at
  )), '[]'::jsonb)
    INTO v_skills
  FROM public.employee_skills
  WHERE company_id = p_company_id AND employee_id = p_employee_id
  ORDER BY proficiency_level DESC;

  RETURN jsonb_build_object('ok', true, 'employee_id', p_employee_id, 'skills', v_skills);
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_analizza_competenze_operaio(uuid, uuid) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: silvio_tool_aggiorna_skill_da_rapportini
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.silvio_tool_aggiorna_skill_da_rapportini(
  p_company_id uuid,
  p_employee_id uuid,
  p_period_start date DEFAULT (current_date - interval '90 days')::date,
  p_period_end date DEFAULT current_date
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Placeholder: l'edge function aggrega rapportini → skill aggiornate.
  RETURN jsonb_build_object(
    'ok', true,
    'employee_id', p_employee_id,
    'period', jsonb_build_object('start', p_period_start, 'end', p_period_end),
    'next_step', 'edge:ai-team-recommender aggiorna scores'
  );
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_aggiorna_skill_da_rapportini(uuid, uuid, date, date) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: silvio_tool_top_performer_lavorazione
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.silvio_tool_top_performer_lavorazione(
  p_company_id uuid,
  p_skill_key text,
  p_top_n int DEFAULT 5
)
RETURNS TABLE (
  employee_id uuid,
  first_name text,
  last_name text,
  proficiency_level int,
  productivity_score numeric,
  total_hours numeric
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT e.id, e.first_name, e.last_name, s.proficiency_level, s.productivity_score, s.total_hours_in_skill
  FROM public.employee_skills s
  JOIN public.employees e ON e.id = s.employee_id
  WHERE s.company_id = p_company_id AND s.skill_key = p_skill_key AND e.is_active = true
  ORDER BY (COALESCE(s.productivity_score, 0) * s.proficiency_level) DESC
  LIMIT p_top_n;
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_top_performer_lavorazione(uuid, text, int) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: silvio_tool_analizza_squadra_storia
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.silvio_tool_analizza_squadra_storia(
  p_company_id uuid,
  p_employee_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_history jsonb;
  v_avg_prod numeric;
  v_avg_qual numeric;
BEGIN
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'cantiere_id', cantiere_id,
      'lavorazione_type', lavorazione_type,
      'produttivita_score', produttivita_score,
      'qualita_score', qualita_score,
      'rispetto_tempi_score', rispetto_tempi_score,
      'ai_team_notes', ai_team_notes,
      'created_at', created_at
    )), '[]'::jsonb),
    AVG(produttivita_score),
    AVG(qualita_score)
  INTO v_history, v_avg_prod, v_avg_qual
  FROM public.team_performance_history
  WHERE company_id = p_company_id
    AND employee_ids @> p_employee_ids;

  RETURN jsonb_build_object(
    'ok', true,
    'employee_ids', to_jsonb(p_employee_ids),
    'history', v_history,
    'avg_produttivita', v_avg_prod,
    'avg_qualita', v_avg_qual
  );
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_analizza_squadra_storia(uuid, uuid[]) TO authenticated;

DO $$ BEGIN RAISE NOTICE 'MP-HR-03 deployed: employee_skills + team_performance_history + 5 RPC'; END $$;
