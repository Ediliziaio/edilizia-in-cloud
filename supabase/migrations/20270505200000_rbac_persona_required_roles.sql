-- FIX 11 (A4) Sprint AI Hardening 1
-- Migliora can_user_use_persona aggiungendo:
--   - required_roles: ruoli necessari per usare la persona
--   - current_roles: ruoli attuali dell'utente (debug)
--   - persona_label: nome leggibile della persona
--
-- Motivazione: il messaggio "🚫 Mi dispiace, non posso accedere..." era
-- generico e privo di context. Con questi metadati silvio-chat può fornire
-- un messaggio actionable: "Per usare Silvio serve ruolo 'admin' o 'manager'.
-- Tu hai 'collaboratore'. Chiedi all'admin di estendere i permessi."

CREATE OR REPLACE FUNCTION public.can_user_use_persona(p_user_id uuid, p_persona_key text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_persona  record;
  v_user_roles text[];
  v_company_id uuid;
  v_explicit_perm record;
  v_required_roles jsonb;
BEGIN
  -- 1) Carica persona (incluso allowed_roles per esposizione errore)
  SELECT persona_key, allowed_roles, enabled, is_system,
         COALESCE(display_name, short_label, persona_key) AS label
    INTO v_persona
    FROM public.ai_personas WHERE persona_key = p_persona_key;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'persona_not_found',
      'persona_key', p_persona_key
    );
  END IF;
  IF NOT v_persona.enabled THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'persona_disabled',
      'persona_key', p_persona_key,
      'persona_label', v_persona.label
    );
  END IF;

  v_required_roles := COALESCE(v_persona.allowed_roles, '[]'::jsonb);

  IF v_persona.is_system THEN
    IF public.has_role(p_user_id, 'super_admin'::public.app_role) THEN
      RETURN jsonb_build_object(
        'allowed', true,
        'reason', 'system_persona_super_admin',
        'persona_label', v_persona.label
      );
    END IF;
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'persona_is_system',
      'persona_label', v_persona.label,
      'required_roles', jsonb_build_array('super_admin')
    );
  END IF;

  -- 2) Estrai roles + company
  SELECT array_agg(DISTINCT role::text) INTO v_user_roles
    FROM public.user_roles WHERE user_id = p_user_id;

  SELECT company_id INTO v_company_id
    FROM public.profiles WHERE id = p_user_id LIMIT 1;

  -- 3) Override esplicito
  SELECT * INTO v_explicit_perm
    FROM public.ai_persona_permissions
   WHERE persona_key = p_persona_key
     AND (company_id IS NULL OR company_id = v_company_id)
     AND ((user_id = p_user_id) OR (user_id IS NULL AND app_role = ANY (v_user_roles)))
     AND (expires_at IS NULL OR expires_at > now())
   ORDER BY allowed ASC, user_id NULLS LAST LIMIT 1;

  IF FOUND THEN
    IF NOT v_explicit_perm.allowed THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'reason', 'explicit_deny',
        'override_id', v_explicit_perm.id,
        'persona_label', v_persona.label,
        'required_roles', v_required_roles,
        'current_roles', to_jsonb(COALESCE(v_user_roles, ARRAY[]::text[]))
      );
    END IF;
    RETURN jsonb_build_object(
      'allowed', true,
      'reason', 'explicit_allow',
      'override_id', v_explicit_perm.id,
      'persona_label', v_persona.label
    );
  END IF;

  -- 4) Default: check allowed_roles della persona
  IF v_user_roles IS NULL OR array_length(v_user_roles, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'no_roles',
      'persona_label', v_persona.label,
      'required_roles', v_required_roles,
      'current_roles', '[]'::jsonb
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(v_persona.allowed_roles) ar
    WHERE ar.value = ANY (v_user_roles)
  ) THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'reason', 'role_match',
      'persona_label', v_persona.label
    );
  END IF;

  IF 'super_admin' = ANY (v_user_roles) THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'reason', 'super_admin_bypass',
      'persona_label', v_persona.label
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', false,
    'reason', 'not_in_allowed_roles',
    'persona_label', v_persona.label,
    'required_roles', v_required_roles,
    'current_roles', to_jsonb(v_user_roles)
  );
END;
$function$;

COMMENT ON FUNCTION public.can_user_use_persona(uuid, text) IS
  'FIX 11 (A4): RBAC persona check con required_roles + current_roles + persona_label per messaggi actionable.';
