-- AI tool RPC lockdown
--
-- `silvio_tool_*` functions are implementation details of the AI/tool layer.
-- Several of them are SECURITY DEFINER and accept company/order ids as input.
-- They must be executed through edge functions with service-role context,
-- router policy, audit logging and HITL checks, not directly from the browser.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT
      n.nspname,
      p.proname,
      pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname LIKE 'silvio_tool_%'
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC',
      r.nspname,
      r.proname,
      r.args
    );

    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM anon',
      r.nspname,
      r.proname,
      r.args
    );

    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM authenticated',
      r.nspname,
      r.proname,
      r.args
    );

    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %I.%I(%s) TO service_role',
      r.nspname,
      r.proname,
      r.args
    );
  END LOOP;
END $$;

-- These RPCs are the user-facing HITL proposal controls. They remain callable
-- by authenticated users, but are hardened in 20260506104500 with owner/company
-- checks and constrained status transitions.
GRANT EXECUTE ON FUNCTION public.silvio_tool_reject_proposal(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.silvio_tool_approve_proposal_with_edits(uuid, uuid, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.silvio_tool_batch_approve_proposals(uuid, uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.silvio_tool_undo_executed_action(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.silvio_tool_get_proposal_audit_log(uuid, uuid) TO authenticated, service_role;
