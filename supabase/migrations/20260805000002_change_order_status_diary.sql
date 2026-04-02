-- Aggiorna change_order_status per loggare automaticamente stato_cambiato in order_events
CREATE OR REPLACE FUNCTION public.change_order_status(
  p_order_id     uuid,
  p_new_status_id uuid,
  p_changed_by   uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id  UUID;
  v_old_name    TEXT;
  v_new_name    TEXT;
  v_old_id      UUID;
  v_actor_name  TEXT;
BEGIN
  -- Legge company_id e stato attuale
  SELECT o.company_id, os.name, o.current_status_id
    INTO v_company_id, v_old_name, v_old_id
    FROM public.orders o
    LEFT JOIN public.order_statuses os ON os.id = o.current_status_id
   WHERE o.id = p_order_id;

  -- Legge nome nuovo stato
  SELECT name INTO v_new_name
    FROM public.order_statuses
   WHERE id = p_new_status_id;

  -- Legge nome attore
  SELECT TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
    INTO v_actor_name
    FROM public.profiles
   WHERE id = p_changed_by;

  -- Aggiorna stato ordine
  UPDATE public.orders
     SET current_status_id = p_new_status_id,
         updated_at = now()
   WHERE id = p_order_id;

  -- Storico
  INSERT INTO public.order_status_history (order_id, status_id, changed_by)
  VALUES (p_order_id, p_new_status_id, p_changed_by)
  ON CONFLICT DO NOTHING;

  -- Log nel diario
  INSERT INTO public.order_events(order_id, company_id, event_type, payload, actor_id, actor_name)
  VALUES (
    p_order_id,
    v_company_id,
    'stato_cambiato',
    jsonb_build_object(
      'from_status',    v_old_name,
      'to_status',      v_new_name,
      'from_status_id', v_old_id,
      'to_status_id',   p_new_status_id
    ),
    p_changed_by,
    v_actor_name
  );
END;
$$;
