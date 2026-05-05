-- ════════════════════════════════════════════════════════════════════════════
-- FIX BUG — can_user_use_persona ritornava errore 42703 column "company_id"
-- ════════════════════════════════════════════════════════════════════════════
-- La RPC originale faceva MAX(company_id) su user_roles, ma user_roles ha solo
-- (id, user_id, role). Il company_id va letto da profiles.
--
-- Sintomo: tutte le chat con Silvio (e con le 18 personas) ricevevano canned
-- response "🚫 Mi dispiace, non posso accedere a queste informazioni per il
-- tuo ruolo." perche silvio-chat (e ai-orchestrator) catturavano l'eccezione
-- come RBAC denied.
--
-- Fix: spezzato in 2 SELECT separate, una su user_roles per i ruoli, una su
-- profiles per il company_id.
--
-- Track 1 Cervello Supremo dependency: necessario per consentire alle personas
-- aggiornate di rispondere correttamente.
-- ════════════════════════════════════════════════════════════════════════════

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
BEGIN
  -- 1) Carica persona
  SELECT persona_key, allowed_roles, enabled, is_system INTO v_persona
    FROM public.ai_personas WHERE persona_key = p_persona_key;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'persona_not_found');
  END IF;
  IF NOT v_persona.enabled THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'persona_disabled');
  END IF;

  IF v_persona.is_system THEN
    IF public.has_role(p_user_id, 'super_admin'::public.app_role) THEN
      RETURN jsonb_build_object('allowed', true, 'reason', 'system_persona_super_admin');
    END IF;
    RETURN jsonb_build_object('allowed', false, 'reason', 'persona_is_system');
  END IF;

  -- 2) FIX: estrai roles da user_roles (no company_id qui!), company_id da profiles
  SELECT array_agg(DISTINCT role::text) INTO v_user_roles
    FROM public.user_roles WHERE user_id = p_user_id;

  SELECT company_id INTO v_company_id
    FROM public.profiles WHERE id = p_user_id LIMIT 1;

  -- 3) Check override esplicito
  SELECT * INTO v_explicit_perm
    FROM public.ai_persona_permissions
   WHERE persona_key = p_persona_key
     AND (company_id IS NULL OR company_id = v_company_id)
     AND ((user_id = p_user_id) OR (user_id IS NULL AND app_role = ANY (v_user_roles)))
     AND (expires_at IS NULL OR expires_at > now())
   ORDER BY allowed ASC, user_id NULLS LAST LIMIT 1;

  IF FOUND THEN
    IF NOT v_explicit_perm.allowed THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'explicit_deny', 'override_id', v_explicit_perm.id);
    END IF;
    RETURN jsonb_build_object('allowed', true, 'reason', 'explicit_allow', 'override_id', v_explicit_perm.id);
  END IF;

  -- 4) Default: check allowed_roles della persona
  IF v_user_roles IS NULL OR array_length(v_user_roles, 1) IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'no_roles');
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(v_persona.allowed_roles) ar
    WHERE ar.value = ANY (v_user_roles)
  ) THEN
    RETURN jsonb_build_object('allowed', true, 'reason', 'role_match');
  END IF;

  IF 'super_admin' = ANY (v_user_roles) THEN
    RETURN jsonb_build_object('allowed', true, 'reason', 'super_admin_bypass');
  END IF;

  RETURN jsonb_build_object('allowed', false, 'reason', 'not_in_allowed_roles', 'user_roles', to_jsonb(v_user_roles));
END;
$function$;
