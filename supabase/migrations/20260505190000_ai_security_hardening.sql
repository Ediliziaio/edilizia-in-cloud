-- ════════════════════════════════════════════════════════════════════════════
-- AI SECURITY HARDENING — tenant guard, decision log guard, safe personas view
-- Local-only migration until explicitly deployed.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1) Central guards for SECURITY DEFINER RPCs
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ai_is_service_role()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(current_setting('request.jwt.claim.role', true), auth.role()::text) = 'service_role'
$$;

CREATE OR REPLACE FUNCTION public.ai_assert_company_access(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id required' USING ERRCODE = '42501';
  END IF;

  IF public.ai_is_service_role() THEN
    RETURN;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.company_id = p_company_id
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.multi_company_access mca
    WHERE mca.user_id = auth.uid()
      AND mca.company_id = p_company_id
  ) THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'tenant access denied' USING ERRCODE = '42501';
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_assert_company_admin_access(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.ai_is_service_role() THEN
    RETURN;
  END IF;

  PERFORM public.ai_assert_company_access(p_company_id);

  IF public.has_role(auth.uid(), 'super_admin'::public.app_role)
     OR public.has_role(auth.uid(), 'company_admin'::public.app_role) THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'company admin access required' USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.ai_is_service_role() FROM public, anon;
REVOKE ALL ON FUNCTION public.ai_assert_company_access(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.ai_assert_company_admin_access(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ai_is_service_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ai_assert_company_access(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ai_assert_company_admin_access(uuid) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 2) RAG: prevent direct cross-tenant access to company brain
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.match_brain(
  p_company_id uuid,
  p_query_embedding vector,
  p_match_count int DEFAULT 6,
  p_min_similarity numeric DEFAULT 0.62,
  p_source_types text[] DEFAULT NULL,
  p_include_universal boolean DEFAULT true,
  p_universal_categories text[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid, scope text, source_type text, source_id uuid,
  title text, category text, content text, metadata jsonb,
  similarity numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ai_assert_company_access(p_company_id);

  RETURN QUERY
  SELECT
    d.id, d.scope, d.source_type, d.source_id,
    d.title, d.category, d.content, d.metadata,
    (1 - (d.embedding <=> p_query_embedding))::numeric AS similarity
  FROM public.ai_brain_documents d
  WHERE d.deleted_at IS NULL
    AND (
      (p_include_universal AND d.scope = 'universal')
      OR (d.scope = 'company' AND d.company_id = p_company_id)
    )
    AND (p_source_types IS NULL OR d.source_type = ANY(p_source_types))
    AND (p_universal_categories IS NULL OR d.scope = 'company' OR d.category = ANY(p_universal_categories))
    AND (1 - (d.embedding <=> p_query_embedding)) >= p_min_similarity
  ORDER BY d.embedding <=> p_query_embedding
  LIMIT LEAST(GREATEST(COALESCE(p_match_count, 6), 1), 20);
END;
$$;

REVOKE ALL ON FUNCTION public.brain_record_hits(uuid[]) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.brain_record_hits(uuid[]) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 3) Decision log: every direct call must prove company access
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_propose_action(
  p_company_id uuid,
  p_user_id uuid,
  p_action_type text,
  p_summary text,
  p_payload jsonb,
  p_session_id uuid DEFAULT NULL,
  p_persona_key text DEFAULT 'silvio',
  p_risk_level text DEFAULT 'yellow'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_permission jsonb;
  v_mode text;
  v_effective_risk text;
BEGIN
  IF p_company_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'company_id and user_id required' USING ERRCODE = '22023';
  END IF;
  IF p_action_type IS NULL OR length(trim(p_action_type)) < 2 THEN
    RAISE EXCEPTION 'action_type obbligatorio' USING ERRCODE = '22023';
  END IF;
  IF p_summary IS NULL OR length(trim(p_summary)) < 5 THEN
    RAISE EXCEPTION 'summary obbligatorio (min 5 char)' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_risk_level, 'yellow') NOT IN ('yellow', 'red') THEN
    RAISE EXCEPTION 'risk_level invalid: %', p_risk_level USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_user_id AND company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'proposal user does not belong to company' USING ERRCODE = '42501';
  END IF;

  IF p_session_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ai_persona_sessions
    WHERE id = p_session_id
      AND user_id = p_user_id
      AND company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'proposal session does not belong to user/company' USING ERRCODE = '42501';
  END IF;

  IF to_regprocedure('public.get_ai_action_permission(uuid,text)') IS NOT NULL THEN
    v_permission := public.get_ai_action_permission(p_company_id, p_action_type);
    v_mode := COALESCE(v_permission->>'mode', 'propose');

    IF v_mode = 'disabled' THEN
      RETURN jsonb_build_object(
        'success', false,
        'action_type', p_action_type,
        'message', 'Azione AI disabilitata per questa azienda dal pannello permessi.'
      );
    END IF;

    IF COALESCE((v_permission->>'daily_limit_reached')::boolean, false) THEN
      RETURN jsonb_build_object(
        'success', false,
        'action_type', p_action_type,
        'message', format(
          'Limite giornaliero raggiunto per %s (%s/%s).',
          p_action_type,
          COALESCE(v_permission->>'daily_executions', '0'),
          COALESCE(v_permission->>'max_daily_executions', '0')
        )
      );
    END IF;

    v_effective_risk := COALESCE(v_permission->>'risk_level', p_risk_level, 'yellow');
    IF v_effective_risk = 'green' THEN
      v_effective_risk := 'yellow';
    END IF;
  ELSE
    v_effective_risk := COALESCE(p_risk_level, 'yellow');
  END IF;

  INSERT INTO public.ai_action_proposals (
    session_id, company_id, user_id, persona_key,
    action_type, summary, payload, status, risk_level
  ) VALUES (
    p_session_id, p_company_id, p_user_id, COALESCE(p_persona_key, 'silvio'),
    p_action_type, p_summary, COALESCE(p_payload, '{}'::jsonb), 'pending', COALESCE(v_effective_risk, 'yellow')
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'success', true,
    'proposal_id', v_id,
    'action_type', p_action_type,
    'risk_level', COALESCE(v_effective_risk, 'yellow'),
    'message', 'Bozza creata. L''azione richiede conferma esplicita prima di essere applicata.',
    'expires_in_hours', 24
  );
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_tool_propose_action(uuid, uuid, text, text, jsonb, uuid, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_propose_action(uuid, uuid, text, text, jsonb, uuid, text, text) TO service_role;

-- HIL hardening: users may read/reject their proposal, but cannot mark it
-- applied/failed or mutate execution payload directly via table update.
DROP POLICY IF EXISTS ai_action_proposals_owner ON public.ai_action_proposals;
DROP POLICY IF EXISTS ai_action_proposals_owner_select ON public.ai_action_proposals;
DROP POLICY IF EXISTS ai_action_proposals_owner_reject ON public.ai_action_proposals;

CREATE POLICY ai_action_proposals_owner_select ON public.ai_action_proposals
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY ai_action_proposals_owner_reject ON public.ai_action_proposals
  FOR UPDATE
  USING (user_id = auth.uid() AND status = 'pending')
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'rejected'
    AND applied_at IS NULL
    AND applied_result IS NULL
  );

CREATE OR REPLACE FUNCTION public.guard_ai_action_proposal_user_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.ai_is_service_role() OR public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL OR OLD.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'not allowed to update proposal' USING ERRCODE = '42501';
  END IF;

  IF OLD.status <> 'pending' OR NEW.status <> 'rejected' THEN
    RAISE EXCEPTION 'users can only reject pending proposals' USING ERRCODE = '42501';
  END IF;

  IF NEW.session_id IS DISTINCT FROM OLD.session_id
     OR NEW.message_id IS DISTINCT FROM OLD.message_id
     OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.persona_key IS DISTINCT FROM OLD.persona_key
     OR NEW.action_type IS DISTINCT FROM OLD.action_type
     OR NEW.summary IS DISTINCT FROM OLD.summary
     OR NEW.payload IS DISTINCT FROM OLD.payload
     OR NEW.risk_level IS DISTINCT FROM OLD.risk_level
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR NEW.applied_result IS DISTINCT FROM OLD.applied_result
     OR NEW.applied_at IS DISTINCT FROM OLD.applied_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'proposal payload is immutable from client' USING ERRCODE = '42501';
  END IF;

  NEW.resolved_by := COALESCE(NEW.resolved_by, auth.uid());
  NEW.resolved_at := COALESCE(NEW.resolved_at, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_ai_action_proposal_user_update ON public.ai_action_proposals;
CREATE TRIGGER trg_guard_ai_action_proposal_user_update
  BEFORE UPDATE ON public.ai_action_proposals
  FOR EACH ROW EXECUTE FUNCTION public.guard_ai_action_proposal_user_update();

REVOKE ALL ON FUNCTION public.guard_ai_action_proposal_user_update() FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.silvio_decision_log_propose(
  p_company_id uuid,
  p_persona_key text,
  p_trigger_type text,
  p_trigger_source_type text,
  p_trigger_source_id uuid,
  p_situation text,
  p_diagnosis text DEFAULT NULL,
  p_diagnosis_data jsonb DEFAULT '{}'::jsonb,
  p_options jsonb DEFAULT '[]'::jsonb,
  p_recommended text DEFAULT NULL,
  p_confidence text DEFAULT 'medium',
  p_kpis_to_track jsonb DEFAULT '[]'::jsonb,
  p_is_critical boolean DEFAULT false,
  p_tags text[] DEFAULT '{}',
  p_ai_model text DEFAULT NULL,
  p_ai_tokens int DEFAULT NULL,
  p_ai_cost_eur numeric DEFAULT NULL,
  p_playbook_id text DEFAULT NULL,
  p_trigger_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM public.ai_assert_company_access(p_company_id);

  INSERT INTO public.silvio_decision_log (
    company_id, persona_key,
    trigger_type, trigger_source_type, trigger_source_id, trigger_metadata,
    situation_description, ai_diagnosis, ai_diagnosis_data,
    ai_options_proposed, ai_recommended_option_id, ai_confidence_level,
    ai_model_used, ai_tokens_total, ai_cost_eur,
    outcome_kpis_tracked, is_critical, tags,
    playbook_id,
    status
  ) VALUES (
    p_company_id, p_persona_key,
    p_trigger_type, p_trigger_source_type, p_trigger_source_id, COALESCE(p_trigger_metadata, '{}'::jsonb),
    p_situation, p_diagnosis, COALESCE(p_diagnosis_data, '{}'::jsonb),
    COALESCE(p_options, '[]'::jsonb), p_recommended, COALESCE(p_confidence, 'medium'),
    p_ai_model, p_ai_tokens, p_ai_cost_eur,
    COALESCE(p_kpis_to_track, '[]'::jsonb), COALESCE(p_is_critical, false), COALESCE(p_tags, '{}'),
    p_playbook_id,
    'pending_review'
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.silvio_decision_log_decide(
  p_decision_id uuid,
  p_chosen_option_id text,
  p_user_modifications jsonb DEFAULT '{}'::jsonb,
  p_user_rationale text DEFAULT NULL,
  p_executed_action_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  SELECT company_id INTO v_company_id
  FROM public.silvio_decision_log
  WHERE id = p_decision_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'decision not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.ai_assert_company_access(v_company_id);

  UPDATE public.silvio_decision_log SET
    user_chosen_option_id = p_chosen_option_id,
    user_modifications = COALESCE(p_user_modifications, '{}'::jsonb),
    user_rationale = p_user_rationale,
    user_decided_by = COALESCE(auth.uid(), user_decided_by),
    decided_at = now(),
    executed_action_id = COALESCE(p_executed_action_id, executed_action_id),
    status = CASE
      WHEN p_chosen_option_id IS NULL OR p_chosen_option_id = 'none' THEN 'abandoned'
      ELSE 'decided_pending_exec'
    END
  WHERE id = p_decision_id
    AND company_id = v_company_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.silvio_decision_log_record_outcome(
  p_decision_id uuid,
  p_period text,
  p_outcome_data jsonb,
  p_evaluation text DEFAULT NULL,
  p_lessons text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  SELECT company_id INTO v_company_id
  FROM public.silvio_decision_log
  WHERE id = p_decision_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'decision not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.ai_assert_company_access(v_company_id);

  IF p_period = '30d' THEN
    UPDATE public.silvio_decision_log SET
      outcome_30d = p_outcome_data,
      last_outcome_check_at = now()
    WHERE id = p_decision_id AND company_id = v_company_id;
  ELSIF p_period = '60d' THEN
    UPDATE public.silvio_decision_log SET
      outcome_60d = p_outcome_data,
      last_outcome_check_at = now()
    WHERE id = p_decision_id AND company_id = v_company_id;
  ELSIF p_period = '90d' THEN
    UPDATE public.silvio_decision_log SET
      outcome_90d = p_outcome_data,
      outcome_evaluation = COALESCE(p_evaluation, outcome_evaluation),
      lessons_learned = COALESCE(p_lessons, lessons_learned),
      last_outcome_check_at = now()
    WHERE id = p_decision_id AND company_id = v_company_id;
  ELSE
    RAISE EXCEPTION 'period invalid: %, expected 30d|60d|90d', p_period;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.silvio_decision_log_audit_export(
  p_company_id uuid DEFAULT NULL,
  p_from timestamptz DEFAULT (now() - interval '90 days'),
  p_to timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF p_company_id IS NULL THEN
    IF NOT public.ai_is_service_role()
       AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
      RAISE EXCEPTION 'super_admin required for global audit export' USING ERRCODE = '42501';
    END IF;
  ELSE
    PERFORM public.ai_assert_company_admin_access(p_company_id);
  END IF;

  SELECT jsonb_build_object(
    'export_at', now(),
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'total_decisions', count(*),
    'critical_count', count(*) FILTER (WHERE is_critical),
    'decisions', COALESCE(jsonb_agg(decision_obj) FILTER (WHERE decision_obj IS NOT NULL), '[]'::jsonb)
  ) INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'id', id,
      'company_id', company_id,
      'created_at', created_at,
      'persona', persona_key,
      'situation', situation_description,
      'options_count', jsonb_array_length(ai_options_proposed),
      'chosen', user_chosen_option_id,
      'status', status,
      'evaluation', outcome_evaluation,
      'is_critical', is_critical
    ) AS decision_obj
    FROM public.silvio_decision_log
    WHERE (p_company_id IS NULL OR company_id = p_company_id)
      AND created_at BETWEEN p_from AND p_to
  ) sub;

  RETURN COALESCE(v_result, jsonb_build_object('total_decisions', 0, 'decisions', '[]'::jsonb));
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4) Data network consent and benchmarks: tenant-aware
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.data_network_set_consent(
  p_company_id uuid,
  p_consent_status text,
  p_metrics_categories text[] DEFAULT ARRAY['finanziaria','operativa','commerciale'],
  p_exclude_metrics text[] DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev_status text;
BEGIN
  PERFORM public.ai_assert_company_admin_access(p_company_id);

  IF p_consent_status NOT IN ('opt_in','opt_out','pending') THEN
    RAISE EXCEPTION 'consent_status invalid: %', p_consent_status;
  END IF;

  SELECT consent_status INTO v_prev_status
  FROM public.company_data_network_consent
  WHERE company_id = p_company_id;

  INSERT INTO public.company_data_network_consent (
    company_id, consent_status, consent_given_at, consent_given_by,
    consent_version, metrics_categories_opted, exclude_specific_metrics
  ) VALUES (
    p_company_id, p_consent_status,
    CASE WHEN p_consent_status = 'opt_in' THEN now() ELSE NULL END,
    auth.uid(),
    '1.0', p_metrics_categories, p_exclude_metrics
  )
  ON CONFLICT (company_id) DO UPDATE SET
    consent_status = EXCLUDED.consent_status,
    consent_given_at = CASE
      WHEN EXCLUDED.consent_status = 'opt_in' AND public.company_data_network_consent.consent_status != 'opt_in'
      THEN now()
      ELSE public.company_data_network_consent.consent_given_at
    END,
    consent_revoked_at = CASE
      WHEN EXCLUDED.consent_status = 'opt_out' AND public.company_data_network_consent.consent_status = 'opt_in'
      THEN now()
      ELSE public.company_data_network_consent.consent_revoked_at
    END,
    consent_revoked_by = CASE
      WHEN EXCLUDED.consent_status = 'opt_out' AND public.company_data_network_consent.consent_status = 'opt_in'
      THEN auth.uid()
      ELSE public.company_data_network_consent.consent_revoked_by
    END,
    metrics_categories_opted = EXCLUDED.metrics_categories_opted,
    exclude_specific_metrics = EXCLUDED.exclude_specific_metrics,
    updated_at = now(),
    audit_log = COALESCE(public.company_data_network_consent.audit_log, '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object(
        'action', EXCLUDED.consent_status,
        'previous', v_prev_status,
        'by', auth.uid(),
        'at', now()
      )
    );

  RETURN jsonb_build_object(
    'company_id', p_company_id,
    'consent_status', p_consent_status,
    'previous_status', v_prev_status,
    'changed_at', now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_industry_benchmark(
  p_metric_key text,
  p_company_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_segment jsonb;
  v_benchmark RECORD;
BEGIN
  PERFORM public.ai_assert_company_access(p_company_id);

  SELECT jsonb_build_object(
    'sector', COALESCE(c.sector, 'altro'),
    'area_macro', area_macro_from_region(c.region),
    'dimensione', dimensione_from_revenue_range(c.annual_revenue_range)
  ) INTO v_segment
  FROM public.companies c WHERE c.id = p_company_id;

  IF v_segment IS NULL THEN
    RETURN jsonb_build_object('available', false, 'reason', 'company_not_found');
  END IF;

  SELECT *
  INTO v_benchmark
  FROM public.kb_aggregated_benchmarks b
  WHERE b.metric_key = p_metric_key
    AND b.is_publishable = true
    AND b.sector = (v_segment->>'sector')
    AND b.area_macro = (v_segment->>'area_macro')
    AND b.dimensione_azienda = (v_segment->>'dimensione')
  ORDER BY b.period_end DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'available', false,
      'reason', 'insufficient_anonymous_sample',
      'k_min', 5,
      'segment', v_segment
    );
  END IF;

  RETURN jsonb_build_object(
    'available', true,
    'metric_key', v_benchmark.metric_key,
    'segment', v_segment,
    'sample_size', v_benchmark.sample_size,
    'median', v_benchmark.value_median,
    'p25', v_benchmark.value_p25,
    'p75', v_benchmark.value_p75,
    'period', jsonb_build_object('from', v_benchmark.period_start, 'to', v_benchmark.period_end),
    'computed_at', v_benchmark.computed_at
  );
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 5) AI literacy: completion is admin/service controlled, not arbitrary self-write
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.literacy_set_completion(
  p_user_id uuid,
  p_course_id text,
  p_score numeric DEFAULT NULL,
  p_certificate_url text DEFAULT NULL,
  p_recert_months int DEFAULT 24
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_company_id uuid;
BEGIN
  IF NOT public.ai_is_service_role() THEN
    SELECT company_id INTO v_company_id
    FROM public.profiles
    WHERE id = p_user_id;

    IF v_company_id IS NULL THEN
      RAISE EXCEPTION 'target user has no company' USING ERRCODE = '42501';
    END IF;

    PERFORM public.ai_assert_company_admin_access(v_company_id);
  END IF;

  UPDATE public.ai_literacy_training SET
    status = 'completed',
    completed_at = now(),
    score = COALESCE(p_score, score),
    certificate_url = COALESCE(p_certificate_url, certificate_url),
    next_recertification_due = now() + (p_recert_months * interval '1 month'),
    updated_at = now()
  WHERE user_id = p_user_id AND course_id = p_course_id
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'No enrollment found for user % course %', p_user_id, p_course_id;
  END IF;

  RETURN v_id;
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 6) Prompt secrecy: users get safe persona metadata, superadmin gets table
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.ai_personas_public AS
SELECT
  persona_key,
  display_name,
  short_label,
  mission,
  category,
  recommended_tier_key,
  icon,
  color,
  enabled,
  is_system,
  allowed_roles,
  sort_order
FROM public.ai_personas
WHERE enabled = true AND is_system = false;

REVOKE ALL ON public.ai_personas FROM public, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.ai_personas FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_personas TO authenticated;
GRANT ALL ON public.ai_personas TO service_role;

REVOKE ALL ON public.ai_constitutional_preamble FROM public, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.ai_constitutional_preamble FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_constitutional_preamble TO authenticated;
GRANT ALL ON public.ai_constitutional_preamble TO service_role;

REVOKE ALL ON public.ai_personas_public FROM public, anon, authenticated;
GRANT SELECT ON public.ai_personas_public TO authenticated, service_role;

DROP POLICY IF EXISTS ai_personas_authenticated_read ON public.ai_personas;
DROP POLICY IF EXISTS "preamble_read_all" ON public.ai_constitutional_preamble;

CREATE POLICY "preamble_read_super_admin" ON public.ai_constitutional_preamble
  FOR SELECT
  USING (
    public.ai_is_service_role()
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

-- Keep table grants intact: RLS now decides that only superadmin can read the
-- prompt-bearing table, while normal users read ai_personas_public.

-- ───────────────────────────────────────────────────────────────────────────
-- 7) Cron edge invocations: send an internal secret, not an anon token
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_invoke_edge(
  p_function_name text,
  p_body jsonb DEFAULT '{}'::jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_service_key text;
  v_internal_secret text;
  v_request_id bigint;
BEGIN
  v_url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/' || p_function_name;
  v_service_key := current_setting('app.settings.service_role_key', true);
  v_internal_secret := current_setting('app.settings.internal_cron_secret', true);

  IF v_service_key IS NULL OR v_service_key = '' THEN
    BEGIN
      SELECT decrypted_secret INTO v_service_key
      FROM vault.decrypted_secrets
      WHERE name IN ('supabase_service_role_key', 'service_role_key')
      LIMIT 1;
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  IF v_internal_secret IS NULL OR v_internal_secret = '' THEN
    BEGIN
      SELECT decrypted_secret INTO v_internal_secret
      FROM vault.decrypted_secrets
      WHERE name = 'internal_cron_secret'
      LIMIT 1;
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  v_internal_secret := COALESCE(NULLIF(v_internal_secret, ''), NULLIF(v_service_key, ''));
  IF v_service_key IS NULL OR v_service_key = '' OR v_internal_secret IS NULL OR v_internal_secret = '' THEN
    RAISE WARNING '[silvio_invoke_edge] missing service/internal secret for %', p_function_name;
    RETURN NULL;
  END IF;

  v_request_id := net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key,
      'x-internal-cron-secret', v_internal_secret
    ),
    body := p_body
  );
  RETURN v_request_id;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[silvio_invoke_edge] error invoking %: %', p_function_name, SQLERRM;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_invoke_edge(text, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_invoke_edge(text, jsonb) TO service_role;

COMMIT;
