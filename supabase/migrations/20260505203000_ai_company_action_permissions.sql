-- ════════════════════════════════════════════════════════════════════════════
-- AI COMPANY ACTION PERMISSIONS — matrice permessi per azienda
-- Local-only migration until explicitly deployed.
-- ════════════════════════════════════════════════════════════════════════════
-- Obiettivo:
--   - togliere le azioni AI dal solo hardcode edge;
--   - consentire override per azienda: disabled / propose / confirmation /
--     strong confirmation / auto_execute;
--   - tracciare la decisione umana in silvio_decision_log quando una proposta
--     viene eseguita o fallisce.

BEGIN;

CREATE TABLE IF NOT EXISTS public.ai_company_action_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  risk_level text NOT NULL DEFAULT 'yellow'
    CHECK (risk_level IN ('green', 'yellow', 'red')),
  mode text NOT NULL DEFAULT 'require_confirmation'
    CHECK (mode IN ('disabled', 'propose', 'require_confirmation', 'require_strong_confirmation', 'auto_execute')),
  allowed_roles text[] NOT NULL DEFAULT ARRAY['company_admin']::text[],
  requires_company_admin boolean NOT NULL DEFAULT false,
  max_daily_executions int CHECK (max_daily_executions IS NULL OR max_daily_executions >= 0),
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, action_type)
);

CREATE INDEX IF NOT EXISTS idx_ai_company_action_permissions_company
  ON public.ai_company_action_permissions(company_id);
CREATE INDEX IF NOT EXISTS idx_ai_company_action_permissions_action
  ON public.ai_company_action_permissions(action_type);

DROP TRIGGER IF EXISTS update_ai_company_action_permissions_updated_at
  ON public.ai_company_action_permissions;
CREATE TRIGGER update_ai_company_action_permissions_updated_at
  BEFORE UPDATE ON public.ai_company_action_permissions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.ai_company_action_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_company_action_permissions_read" ON public.ai_company_action_permissions;
CREATE POLICY "ai_company_action_permissions_read"
  ON public.ai_company_action_permissions
  FOR SELECT
  USING (
    public.ai_is_service_role()
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.multi_company_access mca
      WHERE mca.user_id = auth.uid()
        AND mca.company_id = ai_company_action_permissions.company_id
    )
  );

DROP POLICY IF EXISTS "ai_company_action_permissions_admin_write" ON public.ai_company_action_permissions;
CREATE POLICY "ai_company_action_permissions_admin_write"
  ON public.ai_company_action_permissions
  FOR ALL
  USING (
    public.ai_is_service_role()
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR (
      company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
      AND public.has_role(auth.uid(), 'company_admin'::public.app_role)
      AND mode <> 'auto_execute'
      AND risk_level <> 'red'
    )
  )
  WITH CHECK (
    public.ai_is_service_role()
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR (
      company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
      AND public.has_role(auth.uid(), 'company_admin'::public.app_role)
      AND mode <> 'auto_execute'
      AND risk_level <> 'red'
    )
  );

CREATE OR REPLACE FUNCTION public.ai_default_action_policy(p_action_type text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE p_action_type
    WHEN 'mark_payment_received' THEN jsonb_build_object(
      'risk_level', 'red',
      'mode', 'require_strong_confirmation',
      'allowed_roles', jsonb_build_array('super_admin', 'company_admin'),
      'requires_company_admin', true,
      'max_daily_executions', null
    )
    WHEN 'generic_email' THEN jsonb_build_object(
      'risk_level', 'red',
      'mode', 'require_strong_confirmation',
      'allowed_roles', jsonb_build_array('super_admin', 'company_admin'),
      'requires_company_admin', true,
      'max_daily_executions', null
    )
    WHEN 'send_overdue_reminder' THEN jsonb_build_object(
      'risk_level', 'yellow',
      'mode', 'require_confirmation',
      'allowed_roles', jsonb_build_array('super_admin', 'company_admin', 'company_staff'),
      'requires_company_admin', false,
      'max_daily_executions', 50
    )
    WHEN 'send_quote_followup' THEN jsonb_build_object(
      'risk_level', 'yellow',
      'mode', 'require_confirmation',
      'allowed_roles', jsonb_build_array('super_admin', 'company_admin', 'company_staff', 'salesperson'),
      'requires_company_admin', false,
      'max_daily_executions', 50
    )
    WHEN 'create_purchase_order' THEN jsonb_build_object(
      'risk_level', 'yellow',
      'mode', 'require_confirmation',
      'allowed_roles', jsonb_build_array('super_admin', 'company_admin', 'company_staff'),
      'requires_company_admin', false,
      'max_daily_executions', 25
    )
    ELSE jsonb_build_object(
      'risk_level', 'yellow',
      'mode', 'propose',
      'allowed_roles', jsonb_build_array('super_admin', 'company_admin'),
      'requires_company_admin', false,
      'max_daily_executions', 10
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.get_ai_action_permission(
  p_company_id uuid,
  p_action_type text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_default jsonb;
  v_override public.ai_company_action_permissions%ROWTYPE;
  v_daily_executions int := 0;
  v_mode text;
  v_max_daily int;
BEGIN
  PERFORM public.ai_assert_company_access(p_company_id);

  IF p_action_type IS NULL OR trim(p_action_type) = '' THEN
    RAISE EXCEPTION 'action_type required' USING ERRCODE = '22023';
  END IF;

  v_default := public.ai_default_action_policy(p_action_type);

  SELECT *
    INTO v_override
  FROM public.ai_company_action_permissions
  WHERE company_id = p_company_id
    AND action_type = p_action_type;

  v_mode := COALESCE(v_override.mode, v_default->>'mode');
  v_max_daily := COALESCE(v_override.max_daily_executions, (v_default->>'max_daily_executions')::int);

  SELECT count(*)::int
    INTO v_daily_executions
  FROM public.ai_action_proposals
  WHERE company_id = p_company_id
    AND action_type = p_action_type
    AND status = 'applied'
    AND applied_at >= date_trunc('day', now());

  RETURN jsonb_build_object(
    'company_id', p_company_id,
    'action_type', p_action_type,
    'source', CASE WHEN v_override.id IS NULL THEN 'default' ELSE 'company_override' END,
    'risk_level', COALESCE(v_override.risk_level, v_default->>'risk_level'),
    'mode', v_mode,
    'allowed_roles', COALESCE(to_jsonb(v_override.allowed_roles), v_default->'allowed_roles'),
    'requires_company_admin', COALESCE(v_override.requires_company_admin, (v_default->>'requires_company_admin')::boolean),
    'requires_strong_confirmation', v_mode = 'require_strong_confirmation',
    'max_daily_executions', v_max_daily,
    'daily_executions', v_daily_executions,
    'daily_limit_reached', v_max_daily IS NOT NULL AND v_daily_executions >= v_max_daily,
    'notes', v_override.notes
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_ai_action_permission(
  p_company_id uuid,
  p_action_type text,
  p_mode text,
  p_risk_level text DEFAULT 'yellow',
  p_allowed_roles text[] DEFAULT NULL,
  p_requires_company_admin boolean DEFAULT false,
  p_max_daily_executions int DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed text[];
BEGIN
  PERFORM public.ai_assert_company_admin_access(p_company_id);

  IF p_mode NOT IN ('disabled', 'propose', 'require_confirmation', 'require_strong_confirmation', 'auto_execute') THEN
    RAISE EXCEPTION 'invalid AI action mode: %', p_mode USING ERRCODE = '22023';
  END IF;
  IF p_risk_level NOT IN ('green', 'yellow', 'red') THEN
    RAISE EXCEPTION 'invalid AI risk level: %', p_risk_level USING ERRCODE = '22023';
  END IF;
  IF p_max_daily_executions IS NOT NULL AND p_max_daily_executions < 0 THEN
    RAISE EXCEPTION 'max_daily_executions cannot be negative' USING ERRCODE = '22023';
  END IF;
  IF NOT (public.ai_is_service_role() OR public.has_role(auth.uid(), 'super_admin'::public.app_role)) THEN
    IF p_mode = 'auto_execute' THEN
      RAISE EXCEPTION 'auto_execute can be enabled only by super_admin' USING ERRCODE = '42501';
    END IF;
    IF p_risk_level = 'red' THEN
      RAISE EXCEPTION 'red risk actions can be configured only by super_admin' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_allowed := COALESCE(p_allowed_roles, ARRAY['company_admin']::text[]);

  INSERT INTO public.ai_company_action_permissions (
    company_id,
    action_type,
    mode,
    risk_level,
    allowed_roles,
    requires_company_admin,
    max_daily_executions,
    notes,
    created_by,
    updated_by
  ) VALUES (
    p_company_id,
    p_action_type,
    p_mode,
    p_risk_level,
    v_allowed,
    p_requires_company_admin,
    p_max_daily_executions,
    p_notes,
    auth.uid(),
    auth.uid()
  )
  ON CONFLICT (company_id, action_type) DO UPDATE SET
    mode = excluded.mode,
    risk_level = excluded.risk_level,
    allowed_roles = excluded.allowed_roles,
    requires_company_admin = excluded.requires_company_admin,
    max_daily_executions = excluded.max_daily_executions,
    notes = excluded.notes,
    updated_by = auth.uid(),
    updated_at = now();

  RETURN public.get_ai_action_permission(p_company_id, p_action_type);
END;
$$;

CREATE OR REPLACE FUNCTION public.silvio_decision_log_decide_by_action(
  p_action_proposal_id uuid,
  p_chosen_option_id text DEFAULT 'approved_action',
  p_user_modifications jsonb DEFAULT '{}'::jsonb,
  p_user_rationale text DEFAULT NULL,
  p_execution_result jsonb DEFAULT '{}'::jsonb,
  p_executed boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proposal public.ai_action_proposals%ROWTYPE;
  v_decision_id uuid;
  v_status text := CASE WHEN p_executed THEN 'executed' ELSE 'decided_pending_exec' END;
BEGIN
  SELECT *
    INTO v_proposal
  FROM public.ai_action_proposals
  WHERE id = p_action_proposal_id;

  IF v_proposal.id IS NULL THEN
    RAISE EXCEPTION 'ai_action_proposal not found' USING ERRCODE = '02000';
  END IF;

  PERFORM public.ai_assert_company_access(v_proposal.company_id);

  UPDATE public.silvio_decision_log
  SET
    user_chosen_option_id = COALESCE(p_chosen_option_id, user_chosen_option_id),
    user_modifications = COALESCE(p_user_modifications, '{}'::jsonb),
    user_rationale = p_user_rationale,
    user_decided_by = COALESCE(auth.uid(), v_proposal.user_id),
    decided_at = COALESCE(decided_at, now()),
    executed_action_id = v_proposal.id,
    executed_at = CASE WHEN p_executed THEN COALESCE(executed_at, now()) ELSE executed_at END,
    status = v_status,
    trigger_metadata = COALESCE(trigger_metadata, '{}'::jsonb)
      || jsonb_build_object('execution_result', COALESCE(p_execution_result, '{}'::jsonb))
  WHERE executed_action_id = v_proposal.id
     OR (trigger_source_type = 'ai_action_proposals' AND trigger_source_id = v_proposal.id)
  RETURNING id INTO v_decision_id;

  IF v_decision_id IS NULL THEN
    INSERT INTO public.silvio_decision_log (
      company_id,
      user_id,
      persona_key,
      trigger_type,
      trigger_source_type,
      trigger_source_id,
      trigger_metadata,
      situation_description,
      ai_options_proposed,
      ai_recommended_option_id,
      user_chosen_option_id,
      user_modifications,
      user_rationale,
      user_decided_by,
      decided_at,
      executed_action_id,
      status,
      executed_at,
      is_critical,
      tags
    ) VALUES (
      v_proposal.company_id,
      v_proposal.user_id,
      'silvio',
      'tool_propose_action',
      'ai_action_proposals',
      v_proposal.id,
      jsonb_build_object('execution_result', COALESCE(p_execution_result, '{}'::jsonb)),
      COALESCE(v_proposal.summary, v_proposal.action_type),
      jsonb_build_array(jsonb_build_object(
        'id', v_proposal.action_type,
        'summary', v_proposal.summary,
        'risk_level', v_proposal.risk_level
      )),
      v_proposal.action_type,
      p_chosen_option_id,
      COALESCE(p_user_modifications, '{}'::jsonb),
      p_user_rationale,
      COALESCE(auth.uid(), v_proposal.user_id),
      now(),
      v_proposal.id,
      v_status,
      CASE WHEN p_executed THEN now() ELSE NULL END,
      v_proposal.risk_level = 'red',
      ARRAY[v_proposal.action_type]
    )
    RETURNING id INTO v_decision_id;
  END IF;

  RETURN v_decision_id;
END;
$$;

REVOKE ALL ON TABLE public.ai_company_action_permissions FROM public, anon;
GRANT SELECT ON TABLE public.ai_company_action_permissions TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON TABLE public.ai_company_action_permissions TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.ai_default_action_policy(text) FROM public, anon;
REVOKE ALL ON FUNCTION public.get_ai_action_permission(uuid, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.set_ai_action_permission(uuid, text, text, text, text[], boolean, int, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.silvio_decision_log_decide_by_action(uuid, text, jsonb, text, jsonb, boolean) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.ai_default_action_policy(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_ai_action_permission(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_ai_action_permission(uuid, text, text, text, text[], boolean, int, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.silvio_decision_log_decide_by_action(uuid, text, jsonb, text, jsonb, boolean) TO authenticated, service_role;

COMMIT;
