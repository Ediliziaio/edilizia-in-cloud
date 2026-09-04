-- F0-03 (2/2) — Cancellazione logica, ripristino e purge definitivo.

CREATE OR REPLACE FUNCTION public.soft_delete_company(
  p_company_id uuid, p_actor_id uuid,
  p_reason text DEFAULT NULL, p_export_path text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_company RECORD;
  v_utenti  integer;
BEGIN
  SELECT id, name, status, deleted_at INTO v_company
  FROM public.companies WHERE id = p_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Azienda non trovata');
  END IF;
  IF v_company.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'Azienda già cancellata il ' || v_company.deleted_at::date);
  END IF;

  UPDATE public.companies
     SET deleted_at = now(), deleted_by = p_actor_id, deletion_reason = p_reason,
         status_before_delete = status, deletion_export_path = p_export_path
   WHERE id = p_company_id;

  -- Gli utenti non devono più poter entrare, ma restano ripristinabili
  -- insieme all'azienda.
  UPDATE public.profiles
     SET is_blocked = true, blocked_at = now(), blocked_by = p_actor_id,
         block_reason = 'Azienda cancellata'
   WHERE company_id = p_company_id AND COALESCE(is_blocked, false) = false;
  GET DIAGNOSTICS v_utenti = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'company_name', v_company.name,
    'utenti_bloccati', v_utenti, 'recuperabile_fino_al', (now() + interval '30 days')::date);
END;
$function$;

CREATE OR REPLACE FUNCTION public.restore_company(p_company_id uuid, p_actor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_company RECORD;
  v_utenti  integer;
BEGIN
  SELECT id, name, deleted_at, status_before_delete INTO v_company
  FROM public.companies WHERE id = p_company_id;

  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Azienda non trovata'); END IF;
  IF v_company.deleted_at IS NULL THEN RETURN jsonb_build_object('error', 'Azienda non cancellata'); END IF;

  UPDATE public.companies
     SET status = COALESCE(v_company.status_before_delete, 'suspended'),
         deleted_at = NULL, deleted_by = NULL, deletion_reason = NULL,
         status_before_delete = NULL
   WHERE id = p_company_id;

  UPDATE public.profiles
     SET is_blocked = false, blocked_at = NULL, blocked_by = NULL, block_reason = NULL
   WHERE company_id = p_company_id AND block_reason = 'Azienda cancellata';
  GET DIAGNOSTICS v_utenti = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'company_name', v_company.name, 'utenti_sbloccati', v_utenti);
END;
$function$;

-- L'unico punto in cui la vecchia DELETE distruttiva sopravvive, e agisce solo
-- su righe rimaste invisibili per un mese intero.
CREATE OR REPLACE FUNCTION public.purge_deleted_companies()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_row RECORD;
  v_count integer := 0;
BEGIN
  FOR v_row IN
    SELECT id, name, deleted_by, deletion_export_path FROM public.companies
     WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '30 days'
  LOOP
    INSERT INTO public.admin_audit_log (user_id, action, target_type, target_id, details)
    VALUES (v_row.deleted_by, 'company_purged', 'company', v_row.id::text,
            jsonb_build_object('company_name', v_row.name,
                               'export_path', v_row.deletion_export_path,
                               'purged_at', now()));
    DELETE FROM public.companies WHERE id = v_row.id;
    v_count := v_count + 1;
  END LOOP;

  IF v_count > 0 THEN
    RAISE LOG 'purge aziende: rimosse definitivamente % aziende', v_count;
  END IF;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.soft_delete_company(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.restore_company(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_deleted_companies() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_company(uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.restore_company(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_deleted_companies() TO service_role;
