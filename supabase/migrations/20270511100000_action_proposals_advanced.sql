-- MP-AIE-03 — Action Proposals UI Avanzata
-- ════════════════════════════════════════════════════════════════════════════
-- Estende ai_action_proposals con: edit pre-apply, batch ops, undo, rejection feedback.
-- Crea action_proposals_audit_log per tracking dettagliato.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.ai_action_proposals
  ADD COLUMN IF NOT EXISTS user_edited_payload jsonb,
  ADD COLUMN IF NOT EXISTS user_edit_diff jsonb,
  ADD COLUMN IF NOT EXISTS user_edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS user_edited_by uuid,
  ADD COLUMN IF NOT EXISTS batch_id uuid,
  ADD COLUMN IF NOT EXISTS batch_position int,
  ADD COLUMN IF NOT EXISTS is_reversible boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS undo_window_seconds int DEFAULT 300,
  ADD COLUMN IF NOT EXISTS undone_at timestamptz,
  ADD COLUMN IF NOT EXISTS undone_by uuid,
  ADD COLUMN IF NOT EXISTS undo_reason text,
  ADD COLUMN IF NOT EXISTS rejection_reason_category text,
  ADD COLUMN IF NOT EXISTS rejection_feedback_text text;

CREATE INDEX IF NOT EXISTS idx_apc_batch ON public.ai_action_proposals(batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_apc_undone ON public.ai_action_proposals(undone_at) WHERE undone_at IS NOT NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- Audit log
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.action_proposals_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.ai_action_proposals(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'created','viewed','edited','approved','rejected','executed',
    'execution_failed','undone','expired','batch_created'
  )),
  event_data jsonb DEFAULT '{}'::jsonb,
  user_id uuid,
  ip_address inet,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_proposal ON public.action_proposals_audit_log(proposal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user ON public.action_proposals_audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_company ON public.action_proposals_audit_log(company_id, created_at DESC);

ALTER TABLE public.action_proposals_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_log_company ON public.action_proposals_audit_log;
CREATE POLICY audit_log_company ON public.action_proposals_audit_log
  FOR ALL USING (company_id = public.get_my_company_id());

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: silvio_tool_approve_proposal_with_edits
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.silvio_tool_approve_proposal_with_edits(
  p_company_id uuid,
  p_proposal_id uuid,
  p_user_edited_payload jsonb,
  p_edit_reasoning text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_orig jsonb;
  v_diff jsonb;
BEGIN
  SELECT payload INTO v_orig
  FROM public.ai_action_proposals
  WHERE id = p_proposal_id AND company_id = p_company_id;

  IF v_orig IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'proposal_not_found');
  END IF;

  v_diff := jsonb_build_object(
    'original', v_orig,
    'edited', p_user_edited_payload,
    'reasoning', p_edit_reasoning
  );

  UPDATE public.ai_action_proposals
     SET user_edited_payload = p_user_edited_payload,
         user_edit_diff = v_diff,
         user_edited_at = now(),
         user_edited_by = auth.uid(),
         status = 'approved'
   WHERE id = p_proposal_id AND company_id = p_company_id;

  INSERT INTO public.action_proposals_audit_log(proposal_id, company_id, event_type, event_data, user_id)
  VALUES (p_proposal_id, p_company_id, 'edited', v_diff, auth.uid());

  RETURN jsonb_build_object('ok', true, 'proposal_id', p_proposal_id);
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_approve_proposal_with_edits(uuid, uuid, jsonb, text) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: silvio_tool_batch_approve_proposals
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.silvio_tool_batch_approve_proposals(
  p_company_id uuid,
  p_proposal_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_batch_id uuid := gen_random_uuid();
  v_count int;
BEGIN
  WITH upd AS (
    UPDATE public.ai_action_proposals
       SET batch_id = v_batch_id,
           batch_position = array_position(p_proposal_ids, id),
           status = 'approved'
     WHERE company_id = p_company_id
       AND id = ANY(p_proposal_ids)
       AND status = 'pending'
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM upd;

  INSERT INTO public.action_proposals_audit_log(proposal_id, company_id, event_type, event_data, user_id)
  SELECT id, p_company_id, 'batch_created', jsonb_build_object('batch_id', v_batch_id, 'count', v_count), auth.uid()
  FROM unnest(p_proposal_ids) AS id;

  RETURN jsonb_build_object('ok', true, 'batch_id', v_batch_id, 'approved', v_count);
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_batch_approve_proposals(uuid, uuid[]) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: silvio_tool_undo_executed_action
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.silvio_tool_undo_executed_action(
  p_company_id uuid,
  p_proposal_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_applied_at timestamptz;
  v_undo_window int;
  v_reversible boolean;
BEGIN
  SELECT applied_at, undo_window_seconds, is_reversible
    INTO v_applied_at, v_undo_window, v_reversible
  FROM public.ai_action_proposals
  WHERE id = p_proposal_id AND company_id = p_company_id;

  IF v_applied_at IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_executed');
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
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_undo_executed_action(uuid, uuid, text) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: silvio_tool_get_proposal_audit_log
-- ════════════════════════════════════════════════════════════════════════════
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
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT a.event_type, a.event_data, a.user_id, a.created_at
  FROM public.action_proposals_audit_log a
  WHERE a.company_id = p_company_id AND a.proposal_id = p_proposal_id
  ORDER BY a.created_at DESC;
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_get_proposal_audit_log(uuid, uuid) TO authenticated;

DO $$ BEGIN RAISE NOTICE 'MP-AIE-03 deployed: ai_action_proposals extended + audit log + 4 RPC'; END $$;
