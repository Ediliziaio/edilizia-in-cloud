-- AI Action Proposals security patch
-- ============================================================================
-- Fixes:
-- 1) ai_action_proposals owner policy was FOR ALL: users could mutate pending
--    proposal payload/status directly from the client. Keep direct SELECT and
--    allow only a narrow owner-side reject transition; execution stays in the
--    silvio-execute-action edge function.
-- 2) action_proposals_audit_log was FOR ALL for the whole company. Audit logs
--    must not be client-mutable.
-- 3) Advanced SECURITY DEFINER RPCs lacked explicit tenant/owner assertions.
-- 4) The default permission matrix did not know the registered draft tools,
--    so routed yellow proposals could be created but not executed.

BEGIN;

-- ----------------------------------------------------------------------------
-- Default policy matrix for executable AI actions
-- ----------------------------------------------------------------------------
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
    WHEN 'create_quote_draft' THEN jsonb_build_object(
      'risk_level', 'yellow',
      'mode', 'require_confirmation',
      'allowed_roles', jsonb_build_array('super_admin', 'company_admin', 'company_staff', 'salesperson'),
      'requires_company_admin', false,
      'max_daily_executions', 50
    )
    WHEN 'create_invoice_draft' THEN jsonb_build_object(
      'risk_level', 'yellow',
      'mode', 'require_confirmation',
      'allowed_roles', jsonb_build_array('super_admin', 'company_admin', 'company_staff'),
      'requires_company_admin', false,
      'max_daily_executions', 50
    )
    WHEN 'invia_proposal_cliente' THEN jsonb_build_object(
      'risk_level', 'yellow',
      'mode', 'require_confirmation',
      'allowed_roles', jsonb_build_array('super_admin', 'company_admin', 'salesperson'),
      'requires_company_admin', false,
      'max_daily_executions', 50
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

REVOKE ALL ON FUNCTION public.ai_default_action_policy(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_default_action_policy(text) TO authenticated, service_role;

-- The advanced proposal workflow introduced status='undone' but the original
-- table CHECK allowed only pending/confirmed/rejected/expired/applied/failed.
ALTER TABLE public.ai_action_proposals
  DROP CONSTRAINT IF EXISTS ai_action_proposals_status_check;
ALTER TABLE public.ai_action_proposals
  ADD CONSTRAINT ai_action_proposals_status_check
  CHECK (status IN ('pending', 'confirmed', 'rejected', 'expired', 'applied', 'failed', 'undone'));

-- ----------------------------------------------------------------------------
-- ai_action_proposals RLS hardening
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS ai_action_proposals_owner ON public.ai_action_proposals;
DROP POLICY IF EXISTS ai_action_proposals_owner_select ON public.ai_action_proposals;
DROP POLICY IF EXISTS ai_action_proposals_owner_reject ON public.ai_action_proposals;
DROP POLICY IF EXISTS ai_action_proposals_service_all ON public.ai_action_proposals;

CREATE POLICY ai_action_proposals_owner_select
  ON public.ai_action_proposals
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR (
      public.has_role(auth.uid(), 'company_admin'::public.app_role)
      AND (
        company_id = public.get_my_company_id()
        OR EXISTS (
          SELECT 1
          FROM public.multi_company_access mca
          WHERE mca.user_id = auth.uid()
            AND mca.company_id = ai_action_proposals.company_id
        )
      )
    )
  );

-- No direct client-side UPDATE: even a "reject only" RLS policy can still allow
-- collateral payload mutations in the same UPDATE. Rejection goes through the
-- hardened RPC below so status transition and audit stay server-controlled.

CREATE POLICY ai_action_proposals_service_all
  ON public.ai_action_proposals
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- action_proposals_audit_log RLS hardening
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS audit_log_company ON public.action_proposals_audit_log;
DROP POLICY IF EXISTS audit_log_company_read ON public.action_proposals_audit_log;
DROP POLICY IF EXISTS audit_log_service_all ON public.action_proposals_audit_log;

CREATE POLICY audit_log_company_read
  ON public.action_proposals_audit_log
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.ai_action_proposals p
      WHERE p.id = action_proposals_audit_log.proposal_id
        AND p.user_id = auth.uid()
    )
    OR (
      public.has_role(auth.uid(), 'company_admin'::public.app_role)
      AND (
        company_id = public.get_my_company_id()
        OR EXISTS (
          SELECT 1
          FROM public.multi_company_access mca
          WHERE mca.user_id = auth.uid()
            AND mca.company_id = action_proposals_audit_log.company_id
        )
      )
    )
  );

CREATE POLICY audit_log_service_all
  ON public.action_proposals_audit_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- Harden SECURITY DEFINER proposal RPCs
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.silvio_tool_reject_proposal(
  p_company_id uuid,
  p_proposal_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_status text;
BEGIN
  PERFORM public.ai_assert_company_access(p_company_id);

  SELECT user_id, status
    INTO v_user_id, v_status
  FROM public.ai_action_proposals
  WHERE id = p_proposal_id AND company_id = p_company_id;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'proposal_not_found');
  END IF;

  IF v_status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'proposal_not_pending', 'status', v_status);
  END IF;

  IF NOT (
    public.ai_is_service_role()
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'company_admin'::public.app_role)
    OR v_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not allowed to reject this proposal' USING ERRCODE = '42501';
  END IF;

  UPDATE public.ai_action_proposals
     SET status = 'rejected',
         resolved_at = now(),
         resolved_by = auth.uid()
   WHERE id = p_proposal_id
     AND company_id = p_company_id
     AND status = 'pending';

  INSERT INTO public.action_proposals_audit_log(proposal_id, company_id, event_type, event_data, user_id)
  VALUES (p_proposal_id, p_company_id, 'rejected', jsonb_build_object('reason', p_reason), auth.uid());

  RETURN jsonb_build_object('ok', true, 'proposal_id', p_proposal_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.silvio_tool_approve_proposal_with_edits(
  p_company_id uuid,
  p_proposal_id uuid,
  p_user_edited_payload jsonb,
  p_edit_reasoning text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orig jsonb;
  v_diff jsonb;
  v_user_id uuid;
  v_status text;
BEGIN
  PERFORM public.ai_assert_company_access(p_company_id);

  SELECT payload, user_id, status
    INTO v_orig, v_user_id, v_status
  FROM public.ai_action_proposals
  WHERE id = p_proposal_id AND company_id = p_company_id;

  IF v_orig IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'proposal_not_found');
  END IF;

  IF v_status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'proposal_not_pending');
  END IF;

  IF NOT (
    public.ai_is_service_role()
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'company_admin'::public.app_role)
    OR v_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not allowed to edit this proposal' USING ERRCODE = '42501';
  END IF;

  v_diff := jsonb_build_object(
    'original', v_orig,
    'edited', COALESCE(p_user_edited_payload, '{}'::jsonb),
    'reasoning', p_edit_reasoning
  );

  UPDATE public.ai_action_proposals
     SET user_edited_payload = COALESCE(p_user_edited_payload, '{}'::jsonb),
         user_edit_diff = v_diff,
         user_edited_at = now(),
         user_edited_by = auth.uid()
   WHERE id = p_proposal_id AND company_id = p_company_id AND status = 'pending';

  INSERT INTO public.action_proposals_audit_log(proposal_id, company_id, event_type, event_data, user_id)
  VALUES (p_proposal_id, p_company_id, 'edited', v_diff, auth.uid());

  RETURN jsonb_build_object('ok', true, 'proposal_id', p_proposal_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.silvio_tool_batch_approve_proposals(
  p_company_id uuid,
  p_proposal_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_id uuid := gen_random_uuid();
  v_count int;
  v_can_manage_company boolean;
BEGIN
  PERFORM public.ai_assert_company_access(p_company_id);
  v_can_manage_company :=
    public.ai_is_service_role()
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'company_admin'::public.app_role);

  WITH upd AS (
    UPDATE public.ai_action_proposals
       SET batch_id = v_batch_id,
           batch_position = array_position(p_proposal_ids, id)
     WHERE company_id = p_company_id
       AND id = ANY(p_proposal_ids)
       AND status = 'pending'
       AND (v_can_manage_company OR user_id = auth.uid())
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM upd;

  INSERT INTO public.action_proposals_audit_log(proposal_id, company_id, event_type, event_data, user_id)
  SELECT proposal_id, p_company_id, 'batch_created', jsonb_build_object('batch_id', v_batch_id, 'count', v_count), auth.uid()
  FROM unnest(p_proposal_ids) AS proposal_ids(proposal_id)
  WHERE EXISTS (
    SELECT 1
    FROM public.ai_action_proposals p
    WHERE p.id = proposal_id
      AND p.company_id = p_company_id
      AND (v_can_manage_company OR p.user_id = auth.uid())
  );

  RETURN jsonb_build_object('ok', true, 'batch_id', v_batch_id, 'selected', array_length(p_proposal_ids, 1), 'prepared', v_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.silvio_tool_undo_executed_action(
  p_company_id uuid,
  p_proposal_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_applied_at timestamptz;
  v_undo_window int;
  v_reversible boolean;
  v_user_id uuid;
BEGIN
  PERFORM public.ai_assert_company_access(p_company_id);

  SELECT applied_at, undo_window_seconds, is_reversible, user_id
    INTO v_applied_at, v_undo_window, v_reversible, v_user_id
  FROM public.ai_action_proposals
  WHERE id = p_proposal_id AND company_id = p_company_id;

  IF v_applied_at IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_executed');
  END IF;

  IF NOT (
    public.ai_is_service_role()
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'company_admin'::public.app_role)
    OR v_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not allowed to undo this proposal' USING ERRCODE = '42501';
  END IF;

  IF NOT COALESCE(v_reversible, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_reversible');
  END IF;

  IF (now() - v_applied_at) > make_interval(secs => COALESCE(v_undo_window, 300)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'undo_window_expired');
  END IF;

  UPDATE public.ai_action_proposals
     SET undone_at = now(),
         undone_by = auth.uid(),
         undo_reason = p_reason,
         status = 'undone'
   WHERE id = p_proposal_id AND company_id = p_company_id;

  INSERT INTO public.action_proposals_audit_log(proposal_id, company_id, event_type, event_data, user_id)
  VALUES (p_proposal_id, p_company_id, 'undone', jsonb_build_object('reason', p_reason), auth.uid());

  RETURN jsonb_build_object('ok', true, 'proposal_id', p_proposal_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.silvio_tool_get_proposal_audit_log(
  p_company_id uuid,
  p_proposal_id uuid
)
RETURNS TABLE (
  event_type text,
  event_data jsonb,
  user_id uuid,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ai_assert_company_access(p_company_id);

  RETURN QUERY
  SELECT a.event_type, a.event_data, a.user_id, a.created_at
  FROM public.action_proposals_audit_log a
  WHERE a.company_id = p_company_id AND a.proposal_id = p_proposal_id
  ORDER BY a.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_reject_proposal(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.silvio_tool_approve_proposal_with_edits(uuid, uuid, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.silvio_tool_batch_approve_proposals(uuid, uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.silvio_tool_undo_executed_action(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.silvio_tool_get_proposal_audit_log(uuid, uuid) TO authenticated, service_role;

COMMIT;
