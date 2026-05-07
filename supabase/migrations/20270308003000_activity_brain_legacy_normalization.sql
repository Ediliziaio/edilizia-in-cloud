-- Fix MP-06: normalizza gli eventi legacy di company_activity_log.
-- Il vecchio trigger log_company_activity popolava solo action/target_type/details,
-- lasciando category/description/source_function null. Questo rendeva fragile
-- il tool query_activity e la futura indicizzazione nel brain.

CREATE OR REPLACE FUNCTION public.activity_category_for_event(
  p_event_type text,
  p_target_table text
) RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN coalesce(p_event_type, '') ILIKE '%alert%' THEN 'alert'
    WHEN coalesce(p_target_table, '') IN ('auth', 'auth.users') THEN 'auth_event'
    WHEN coalesce(p_event_type, '') ILIKE '%integration%' THEN 'integration_event'
    WHEN coalesce(p_event_type, '') ILIKE '%system%' THEN 'system_event'
    WHEN coalesce(p_event_type, '') ILIKE '%chat%' THEN 'chat_message'
    ELSE 'modification'
  END
$$;

UPDATE public.company_activity_log
SET
  event_type = COALESCE(event_type, action),
  target_table = COALESCE(target_table, target_type),
  category = COALESCE(category, public.activity_category_for_event(COALESCE(event_type, action), COALESCE(target_table, target_type))),
  target_label = COALESCE(
    target_label,
    details->>'order_code',
    details->>'name',
    details->>'description',
    target_id
  ),
  description = COALESCE(
    description,
    concat_ws(
      ' ',
      COALESCE(event_type, action, 'evento'),
      'su',
      COALESCE(target_table, target_type, 'record'),
      COALESCE(details->>'order_code', details->>'name', target_id)
    )
  ),
  importance = COALESCE(importance, 'normal'),
  source_function = COALESCE(source_function, 'legacy:log_company_activity'),
  metadata = COALESCE(metadata, '{}'::jsonb)
    || jsonb_build_object('legacy_normalized', true)
WHERE category IS NULL
   OR event_type IS NULL
   OR target_table IS NULL
   OR description IS NULL
   OR target_label IS NULL
   OR source_function IS NULL
   OR metadata IS NULL;

CREATE OR REPLACE FUNCTION public.log_company_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _company_id uuid;
  _user_id uuid;
  _actor_user_id uuid;
  _action text;
  _target_type text;
  _target_id text;
  _details jsonb;
  _target_label text;
  _description text;
BEGIN
  -- orders/employees hanno già trigger MP-06 dedicati. Evita doppio logging.
  IF TG_TABLE_NAME IN ('orders', 'employees') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  _user_id := COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
  _actor_user_id := NULLIF(_user_id, '00000000-0000-0000-0000-000000000000'::uuid);

  CASE TG_TABLE_NAME
    WHEN 'order_status_history' THEN
      _target_type := 'orders';
      _action := 'order.status_updated';
      _target_id := NEW.order_id::text;
      SELECT o.company_id INTO _company_id FROM public.orders o WHERE o.id = NEW.order_id;
      _details := jsonb_build_object('status_id', NEW.status_id::text);

    WHEN 'suppliers' THEN
      _target_type := 'suppliers';
      IF TG_OP = 'INSERT' THEN
        _company_id := NEW.company_id;
        _action := 'supplier.created';
        _target_id := NEW.id::text;
        _details := jsonb_build_object('name', NEW.name);
      ELSIF TG_OP = 'UPDATE' THEN
        _company_id := NEW.company_id;
        _action := 'supplier.updated';
        _target_id := NEW.id::text;
        _details := jsonb_build_object('name', NEW.name);
      ELSIF TG_OP = 'DELETE' THEN
        _company_id := OLD.company_id;
        _action := 'supplier.deleted';
        _target_id := OLD.id::text;
        _details := jsonb_build_object('name', OLD.name);
      END IF;

    WHEN 'profiles' THEN
      _target_type := 'customers';
      _company_id := COALESCE(
        CASE WHEN TG_OP = 'DELETE' THEN OLD.company_id ELSE NEW.company_id END,
        NULL
      );
      IF _company_id IS NULL THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
      END IF;
      IF TG_OP = 'INSERT' THEN
        _action := 'customer.created';
        _target_id := NEW.id::text;
        _details := jsonb_build_object('name', trim(coalesce(NEW.first_name, '') || ' ' || coalesce(NEW.last_name, '')));
      ELSIF TG_OP = 'UPDATE' THEN
        _action := 'customer.updated';
        _target_id := NEW.id::text;
        _details := jsonb_build_object('name', trim(coalesce(NEW.first_name, '') || ' ' || coalesce(NEW.last_name, '')));
      ELSIF TG_OP = 'DELETE' THEN
        _action := 'customer.deleted';
        _target_id := OLD.id::text;
        _details := jsonb_build_object('name', trim(coalesce(OLD.first_name, '') || ' ' || coalesce(OLD.last_name, '')));
      END IF;

    ELSE
      IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END CASE;

  _target_label := COALESCE(_details->>'order_code', _details->>'name', _details->>'description', _target_id);
  _description := concat_ws(' ', _action, 'su', _target_type, _target_label);

  IF _company_id IS NOT NULL THEN
    INSERT INTO public.company_activity_log (
      company_id, user_id, action, target_type, target_id, details,
      category, event_type, actor_user_id, target_table, target_label,
      description, importance, metadata, source_function
    )
    VALUES (
      _company_id, _user_id, _action, _target_type, _target_id, COALESCE(_details, '{}'::jsonb),
      public.activity_category_for_event(_action, _target_type),
      _action,
      _actor_user_id,
      _target_type,
      _target_label,
      _description,
      'normal',
      COALESCE(_details, '{}'::jsonb) || jsonb_build_object('legacy_function', true),
      'trigger:log_company_activity'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_activity_on_orders() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_changes jsonb := '{}'::jsonb;
  v_description text;
  v_importance text := 'normal';
  v_target_label text;
  v_actor uuid;
  v_old_total numeric;
  v_new_total numeric;
BEGIN
  v_target_label := coalesce(NEW.id::text, OLD.id::text);
  v_actor := nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;

  IF TG_OP = 'INSERT' THEN
    v_description := format('Nuova commessa creata: %s', v_target_label);
    PERFORM public.log_activity(
      NEW.company_id, 'modification', 'order.created',
      v_actor, 'orders', NEW.id::text, v_target_label, v_description,
      NULL, NULL, to_jsonb(NEW), 'normal', '{}'::jsonb, 'trigger:tg_activity_on_orders'
    );
  ELSIF TG_OP = 'UPDATE' THEN
    SELECT jsonb_object_agg(key, jsonb_build_object('old', o.value, 'new', n.value))
    INTO v_changes
    FROM jsonb_each(to_jsonb(OLD)) o
    JOIN jsonb_each(to_jsonb(NEW)) n USING (key)
    WHERE o.value IS DISTINCT FROM n.value
      AND key NOT IN ('updated_at');

    IF v_changes IS NULL OR v_changes = '{}'::jsonb THEN
      RETURN NEW;
    END IF;

    v_old_total := NULLIF(to_jsonb(OLD)->>'total_amount', '')::numeric;
    v_new_total := NULLIF(to_jsonb(NEW)->>'total_amount', '')::numeric;
    IF v_old_total IS NOT NULL AND v_new_total IS NOT NULL AND abs(v_new_total - v_old_total) > 5000 THEN
      v_importance := 'high';
    END IF;

    v_description := format('Commessa %s modificata. Campi: %s',
      v_target_label,
      (SELECT string_agg(k, ', ') FROM jsonb_object_keys(v_changes) k));
    PERFORM public.log_activity(
      NEW.company_id, 'modification', 'order.updated',
      v_actor, 'orders', NEW.id::text, v_target_label, v_description,
      v_changes, to_jsonb(OLD), to_jsonb(NEW), v_importance, '{}'::jsonb, 'trigger:tg_activity_on_orders'
    );
  ELSIF TG_OP = 'DELETE' THEN
    v_description := format('Commessa %s eliminata', v_target_label);
    PERFORM public.log_activity(
      OLD.company_id, 'modification', 'order.deleted',
      v_actor, 'orders', OLD.id::text, v_target_label, v_description,
      NULL, to_jsonb(OLD), NULL, 'high', '{}'::jsonb, 'trigger:tg_activity_on_orders'
    );
  END IF;

  RETURN coalesce(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'tg_activity_on_orders failed: %', SQLERRM;
  RETURN coalesce(NEW, OLD);
END;
$$;

GRANT EXECUTE ON FUNCTION public.activity_category_for_event(text, text) TO authenticated, service_role;
