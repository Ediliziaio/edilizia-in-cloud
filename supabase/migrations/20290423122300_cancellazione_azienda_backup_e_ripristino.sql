-- Il formato del percorso distingue le copie di catalogo dalle vecchie copie parziali.
CREATE OR REPLACE FUNCTION private.backup_pre_cancellazione_presente(p_company_id uuid, p_percorso text)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT coalesce(p_percorso ~ (
    '^' || p_company_id::text ||
    '/[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}-pre-delete[.]json$'
  ), false)
  AND EXISTS (
    SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'company-exports' AND o.name = p_percorso
  );
$$;
REVOKE ALL ON FUNCTION private.backup_pre_cancellazione_presente(uuid,text) FROM PUBLIC, anon, authenticated;

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
  FROM public.companies WHERE id = p_company_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Azienda non trovata');
  END IF;
  IF v_company.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'Azienda già cancellata il ' || v_company.deleted_at::date);
  END IF;

  IF NOT private.backup_pre_cancellazione_presente(p_company_id, p_export_path) THEN
    RETURN jsonb_build_object('error', 'Serve un export ripristinabile prima della cancellazione.');
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
  FROM public.companies WHERE id = p_company_id FOR UPDATE;

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

-- Un'azienda in fase di ripristino viene saltata. Una copia legacy o assente
-- mantiene l'azienda recuperabile, anche dopo la scadenza nominale.
CREATE OR REPLACE FUNCTION public.purge_deleted_companies()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_row RECORD;
  v_count integer := 0;
BEGIN
  FOR v_row IN
    SELECT id, name, deleted_by, deletion_export_path
      FROM public.companies
     WHERE deleted_at IS NOT NULL
       AND deleted_at < now() - interval '30 days'
       AND private.backup_pre_cancellazione_presente(id, deletion_export_path)
     FOR UPDATE SKIP LOCKED
  LOOP
    DELETE FROM public.companies WHERE id = v_row.id;
    IF NOT FOUND THEN CONTINUE; END IF;

    INSERT INTO public.admin_audit_log (user_id, action, target_type, target_id, details)
    VALUES (COALESCE(v_row.deleted_by, '00000000-0000-0000-0000-000000000000'::uuid),
            'company_purged', 'company', v_row.id::text,
            jsonb_build_object('company_name', v_row.name,
                               'export_path', v_row.deletion_export_path,
                               'purged_at', now()));
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
