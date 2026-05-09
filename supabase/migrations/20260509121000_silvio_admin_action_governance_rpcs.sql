-- Silvio Superadmin action governance hardening.
-- Sposta approve/reject/retry/cancel in RPC transazionali con audit, evitando
-- scritture client-side parziali tra approval card e action queue.

CREATE OR REPLACE FUNCTION public.silvio_admin_resolve_approval(
  p_approval_id uuid,
  p_status text,
  p_modified_payload jsonb DEFAULT NULL,
  p_resolution_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action_id uuid;
  v_action_type text;
  v_payload jsonb;
  v_final_status text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Solo super_admin' USING ERRCODE = '42501';
  END IF;

  IF p_status NOT IN ('approved', 'modified', 'rejected') THEN
    RAISE EXCEPTION 'status non valido: %', p_status USING ERRCODE = '22023';
  END IF;

  SELECT a.action_id, q.action_type, q.payload
    INTO v_action_id, v_action_type, v_payload
  FROM public.silvio_pending_approvals a
  JOIN public.silvio_action_queue q ON q.id = a.action_id
  WHERE a.id = p_approval_id
    AND a.status = 'awaiting'
  FOR UPDATE OF a, q;

  IF v_action_id IS NULL THEN
    RAISE EXCEPTION 'Approval non trovata o gia risolta' USING ERRCODE = 'P0002';
  END IF;

  v_final_status := CASE
    WHEN p_status = 'rejected' THEN 'rejected'
    WHEN p_modified_payload IS NOT NULL THEN 'modified'
    ELSE 'approved'
  END;

  UPDATE public.silvio_pending_approvals
     SET status = v_final_status,
         resolved_by = auth.uid(),
         resolved_at = now(),
         resolution_note = NULLIF(p_resolution_note, ''),
         modified_payload = CASE
           WHEN v_final_status = 'modified' THEN p_modified_payload
           ELSE modified_payload
         END
   WHERE id = p_approval_id;

  UPDATE public.silvio_action_queue
     SET status = CASE WHEN v_final_status IN ('approved', 'modified') THEN 'queued' ELSE 'cancelled' END,
         scheduled_for = CASE WHEN v_final_status IN ('approved', 'modified') THEN now() ELSE scheduled_for END,
         approved_by = CASE WHEN v_final_status IN ('approved', 'modified') THEN auth.uid() ELSE approved_by END,
         approved_at = CASE WHEN v_final_status IN ('approved', 'modified') THEN now() ELSE approved_at END,
         payload = CASE WHEN v_final_status = 'modified' THEN p_modified_payload ELSE payload END
   WHERE id = v_action_id;

  INSERT INTO public.silvio_action_log (
    action_id,
    action_type,
    payload,
    result,
    initiated_by,
    policy_mode,
    ok
  )
  VALUES (
    v_action_id,
    v_action_type,
    COALESCE(p_modified_payload, v_payload),
    jsonb_build_object(
      'event', 'approval_resolved',
      'approval_id', p_approval_id,
      'status', v_final_status,
      'resolution_note', p_resolution_note,
      'resolved_by', auth.uid()
    ),
    'florin',
    'approval_required',
    true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.silvio_admin_update_queue_action(
  p_action_id uuid,
  p_operation text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action_type text;
  v_status text;
  v_payload jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Solo super_admin' USING ERRCODE = '42501';
  END IF;

  IF p_operation NOT IN ('cancel', 'retry') THEN
    RAISE EXCEPTION 'operazione non valida: %', p_operation USING ERRCODE = '22023';
  END IF;

  SELECT action_type, status, payload
    INTO v_action_type, v_status, v_payload
  FROM public.silvio_action_queue
  WHERE id = p_action_id
  FOR UPDATE;

  IF v_action_type IS NULL THEN
    RAISE EXCEPTION 'Azione non trovata' USING ERRCODE = 'P0002';
  END IF;

  IF p_operation = 'cancel' THEN
    IF v_status NOT IN ('queued', 'awaiting_approval', 'failed') THEN
      RAISE EXCEPTION 'Non puoi cancellare azioni in stato %', v_status USING ERRCODE = '22023';
    END IF;

    UPDATE public.silvio_action_queue
       SET status = 'cancelled'
     WHERE id = p_action_id;
  ELSE
    IF v_status <> 'failed' THEN
      RAISE EXCEPTION 'Retry consentito solo su azioni failed, stato attuale %', v_status USING ERRCODE = '22023';
    END IF;

    UPDATE public.silvio_action_queue
       SET status = 'queued',
           scheduled_for = now(),
           attempts = 0,
           last_error = NULL
     WHERE id = p_action_id;
  END IF;

  INSERT INTO public.silvio_action_log (
    action_id,
    action_type,
    payload,
    result,
    initiated_by,
    policy_mode,
    ok
  )
  VALUES (
    p_action_id,
    v_action_type,
    v_payload,
    jsonb_build_object('event', p_operation, 'previous_status', v_status, 'by', auth.uid()),
    'florin',
    'manual',
    true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.silvio_admin_resolve_approval(uuid, text, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.silvio_admin_update_queue_action(uuid, text) TO authenticated, service_role;
