-- 3. Funzione approve_leave_request
DROP FUNCTION IF EXISTS public.approve_leave_request(uuid, boolean, text) CASCADE;
CREATE OR REPLACE FUNCTION public.approve_leave_request(
  p_request_id    uuid,
  p_approved      boolean,
  p_rejection_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.leave_requests%ROWTYPE;
  v_year    integer;
  v_user_id uuid;
BEGIN
  SELECT * INTO v_request FROM public.leave_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Richiesta non trovata'; END IF;
  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'La richiesta non è in stato pending';
  END IF;

  -- Get the employee's auth user_id for notification
  SELECT user_id INTO v_user_id FROM public.employees WHERE id = v_request.employee_id;

  v_year := EXTRACT(YEAR FROM v_request.start_date)::integer;

  IF p_approved THEN
    UPDATE public.leave_requests SET
      status = 'approved',
      approved_by = auth.uid(),
      approved_at = now(),
      updated_at = now()
    WHERE id = p_request_id;

    -- Upsert balance
    INSERT INTO public.leave_balances (company_id, employee_id, year)
    VALUES (v_request.company_id, v_request.employee_id, v_year)
    ON CONFLICT (company_id, employee_id, year) DO NOTHING;

    IF v_request.type = 'ferie' THEN
      UPDATE public.leave_balances SET
        ferie_days_used = ferie_days_used + COALESCE(v_request.total_days, 0),
        updated_at = now()
      WHERE company_id = v_request.company_id
        AND employee_id = v_request.employee_id
        AND year = v_year;
    ELSIF v_request.type = 'permesso' THEN
      UPDATE public.leave_balances SET
        permessi_hours_used = permessi_hours_used + COALESCE(v_request.total_hours, 0),
        updated_at = now()
      WHERE company_id = v_request.company_id
        AND employee_id = v_request.employee_id
        AND year = v_year;
    END IF;

    -- Notifica al dipendente
    IF v_user_id IS NOT NULL THEN
      PERFORM public.create_notification(
        v_request.company_id,
        v_user_id,
        'generic',
        'Richiesta ferie approvata',
        'La tua richiesta dal ' || v_request.start_date::text ||
        ' al ' || v_request.end_date::text || ' è stata approvata.',
        'leave_request', v_request.id, '/dipendente/ferie'
      );
    END IF;
  ELSE
    UPDATE public.leave_requests SET
      status = 'rejected',
      approved_by = auth.uid(),
      approved_at = now(),
      rejection_note = p_rejection_note,
      updated_at = now()
    WHERE id = p_request_id;

    IF v_user_id IS NOT NULL THEN
      PERFORM public.create_notification(
        v_request.company_id,
        v_user_id,
        'generic',
        'Richiesta ferie non approvata',
        COALESCE(p_rejection_note, 'La tua richiesta non è stata approvata.'),
        'leave_request', v_request.id, '/dipendente/ferie'
      );
    END IF;
  END IF;
END;
$$;
