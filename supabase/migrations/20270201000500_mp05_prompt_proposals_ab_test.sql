-- ════════════════════════════════════════════════════════════════════════════
-- MP-05 — Self-improving prompts: chiusura loop (A/B test + proposals)
-- ════════════════════════════════════════════════════════════════════════════
-- Foundation `ai_prompt_feedback_aggregates` + RPC `silvio_tool_compute_prompt_feedback`
-- esistono già da migration 20260506240000_self_improving_prompts.sql.
--
-- Questa migration aggiunge:
--   1. ai_persona_prompt_proposals (drafts AI-generated)
--   2. ai_persona_prompt_ab_test (test runtime con traffic split)
--   3. RPC ai_get_prompt_variant() — assegnazione deterministica session→variant
--   4. RPC ai_ab_test_increment() — counter atomic durante chat
--   5. RPC ai_top_persona_pain_points() — input per ai-prompt-evolution-weekly
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Proposte di prompt rivisti (AI-generated, super_admin review)
CREATE TABLE IF NOT EXISTS public.ai_persona_prompt_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_key text NOT NULL REFERENCES public.ai_personas(persona_key) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,  -- NULL = tenant-agnostic

  current_prompt text NOT NULL,
  current_version int NOT NULL,
  proposed_prompt text NOT NULL,
  proposed_diff_summary text,

  rationale text,
  example_rejections jsonb,

  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'approved_for_test', 'in_test', 'promoted', 'rejected', 'expired'
  )),

  generated_by_model text,
  generated_at timestamptz NOT NULL DEFAULT now(),

  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_notes text,

  test_started_at timestamptz,
  test_ended_at timestamptz,
  test_traffic_pct int DEFAULT 10 CHECK (test_traffic_pct BETWEEN 1 AND 50),
  test_results jsonb,

  promoted_at timestamptz,
  rolled_back_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposals_status ON public.ai_persona_prompt_proposals (status, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposals_persona ON public.ai_persona_prompt_proposals (persona_key, status);

ALTER TABLE public.ai_persona_prompt_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS proposals_super_admin ON public.ai_persona_prompt_proposals;
CREATE POLICY proposals_super_admin ON public.ai_persona_prompt_proposals
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

GRANT SELECT, INSERT, UPDATE ON public.ai_persona_prompt_proposals TO service_role;

-- 2) A/B test runtime
CREATE TABLE IF NOT EXISTS public.ai_persona_prompt_ab_test (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_key text NOT NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,  -- NULL = global

  control_prompt text NOT NULL,
  variant_prompt text NOT NULL,
  variant_proposal_id uuid REFERENCES public.ai_persona_prompt_proposals(id) ON DELETE SET NULL,

  traffic_pct_variant int NOT NULL CHECK (traffic_pct_variant BETWEEN 1 AND 50),

  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  active boolean NOT NULL DEFAULT true,

  -- Counters atomic (aggiornati da ai_ab_test_increment)
  control_count int NOT NULL DEFAULT 0,
  variant_count int NOT NULL DEFAULT 0,
  control_rejections int NOT NULL DEFAULT 0,
  variant_rejections int NOT NULL DEFAULT 0,
  control_csat_sum numeric DEFAULT 0,
  variant_csat_sum numeric DEFAULT 0,
  control_csat_n int DEFAULT 0,
  variant_csat_n int DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ab_test_active
  ON public.ai_persona_prompt_ab_test (persona_key, active)
  WHERE active = true;

ALTER TABLE public.ai_persona_prompt_ab_test ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ab_test_super_admin ON public.ai_persona_prompt_ab_test;
CREATE POLICY ab_test_super_admin ON public.ai_persona_prompt_ab_test
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

GRANT SELECT, INSERT, UPDATE ON public.ai_persona_prompt_ab_test TO service_role;

-- 3) RPC: assegnazione variante deterministica (session → bucket 0-99)
CREATE OR REPLACE FUNCTION public.ai_get_prompt_variant(
  p_persona_key text,
  p_company_id uuid,
  p_user_id uuid,
  p_session_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_test record;
  v_bucket int;
  v_use_variant boolean;
BEGIN
  -- Cerca test attivo per questa persona (preferenza: company-specific > global)
  SELECT * INTO v_test
  FROM public.ai_persona_prompt_ab_test
  WHERE persona_key = p_persona_key
    AND active = true
    AND ends_at > now()
    AND (company_id IS NULL OR company_id = p_company_id)
  ORDER BY company_id NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('variant', false, 'prompt', NULL, 'test_id', NULL);
  END IF;

  -- Hash deterministico session → 0-99
  v_bucket := abs(hashtext(coalesce(p_session_id::text, p_user_id::text))) % 100;
  v_use_variant := v_bucket < v_test.traffic_pct_variant;

  RETURN jsonb_build_object(
    'variant', v_use_variant,
    'prompt', CASE WHEN v_use_variant THEN v_test.variant_prompt ELSE v_test.control_prompt END,
    'test_id', v_test.id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ai_get_prompt_variant(text, uuid, uuid, uuid) TO service_role, authenticated;

-- 4) RPC: increment counters atomic (chiamato dopo ogni chat che usa A/B test)
CREATE OR REPLACE FUNCTION public.ai_ab_test_increment(
  p_test_id uuid,
  p_is_variant boolean,
  p_was_rejected boolean DEFAULT false,
  p_csat_score numeric DEFAULT NULL  -- 0-5 se l'utente ha votato
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_is_variant THEN
    UPDATE public.ai_persona_prompt_ab_test
    SET variant_count = variant_count + 1,
        variant_rejections = variant_rejections + (CASE WHEN p_was_rejected THEN 1 ELSE 0 END),
        variant_csat_sum = variant_csat_sum + coalesce(p_csat_score, 0),
        variant_csat_n = variant_csat_n + (CASE WHEN p_csat_score IS NOT NULL THEN 1 ELSE 0 END)
    WHERE id = p_test_id;
  ELSE
    UPDATE public.ai_persona_prompt_ab_test
    SET control_count = control_count + 1,
        control_rejections = control_rejections + (CASE WHEN p_was_rejected THEN 1 ELSE 0 END),
        control_csat_sum = control_csat_sum + coalesce(p_csat_score, 0),
        control_csat_n = control_csat_n + (CASE WHEN p_csat_score IS NOT NULL THEN 1 ELSE 0 END)
    WHERE id = p_test_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ai_ab_test_increment(uuid, boolean, boolean, numeric) TO service_role, authenticated;

-- 5) RPC: top pain points (input per evolution weekly worker)
-- Usa ai_prompt_feedback_aggregates esistente (non ricreata).
CREATE OR REPLACE FUNCTION public.ai_top_persona_pain_points(
  p_min_rejections int DEFAULT 10,
  p_min_rate numeric DEFAULT 0.30,
  p_limit int DEFAULT 10
) RETURNS TABLE (
  persona_key text,
  rejection_category text,
  total_rejections bigint,
  total_messages bigint,
  rejection_rate numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    persona_key,
    rejection_category,
    sum(rejection_count)::bigint AS total_rejections,
    (sum(approval_count) + sum(rejection_count))::bigint AS total_messages,
    (sum(rejection_count)::numeric / NULLIF(sum(approval_count) + sum(rejection_count), 0))::numeric AS rejection_rate
  FROM public.ai_prompt_feedback_aggregates
  WHERE period_start >= (current_date - interval '30 days')::date
    AND rejection_category IS NOT NULL
  GROUP BY 1, 2
  HAVING sum(rejection_count) >= p_min_rejections
     AND (sum(rejection_count)::numeric / NULLIF(sum(approval_count) + sum(rejection_count), 0)) >= p_min_rate
  ORDER BY total_rejections DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.ai_top_persona_pain_points(int, numeric, int) TO service_role, authenticated;

COMMENT ON FUNCTION public.ai_top_persona_pain_points IS
  'MP-05: ritorna i top pain points (persona × categoria rejection) negli ultimi 30 giorni. Input per il worker ai-prompt-evolution-weekly che genera proposte di prompt rivisti.';
