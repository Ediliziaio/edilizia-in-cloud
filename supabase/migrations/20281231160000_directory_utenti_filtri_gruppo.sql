-- Directory di account reali, filtri azienda/accessi condivisi e gruppo.
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';
CREATE OR REPLACE FUNCTION public.admin_search_directory_users(p_search text DEFAULT NULL::text, p_role text DEFAULT NULL::text, p_company_id uuid DEFAULT NULL::uuid, p_stato text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_group text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, email text, nome text, telefono text, azienda_id uuid, azienda_nome text, ruoli text[], bloccato boolean, motivo_blocco text, bloccato_fino timestamp with time zone, tentativi_falliti integer, ultimo_accesso timestamp with time zone, sessioni_attive bigint, creato_il timestamp with time zone, totale bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) AND NOT public.is_platform_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Accesso riservato allo staff di piattaforma' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      p.id, p.email,
      NULLIF(btrim(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,'')), '') AS nome_,
      p.phone, p.company_id, c.name AS azienda_nome_,
      (SELECT array_agg(ur.role::text ORDER BY ur.role::text)
         FROM public.user_roles ur WHERE ur.user_id = p.id) AS ruoli_,
      COALESCE(p.is_blocked, false) AS bloccato_,
      p.block_reason, p.locked_until, COALESCE(p.failed_login_count, 0) AS tentativi_,
      GREATEST(account_login.last_sign_in_at, (SELECT max(us.last_active_at) FROM public.user_sessions us WHERE us.user_id = p.id)) AS ultimo_,
      (SELECT count(*) FROM public.user_sessions us
        WHERE us.user_id = p.id AND us.is_active
          AND us.last_active_at > now() - interval '24 hours') AS sessioni_,
      p.created_at
    FROM public.profiles p JOIN auth.users account_login ON account_login.id = p.id
    LEFT JOIN public.companies c ON c.id = p.company_id
    WHERE (p_company_id IS NULL
      OR (p_company_id = '00000000-0000-0000-0000-000000000000'::uuid AND p.company_id IS NULL)
      OR p.company_id = p_company_id
      OR EXISTS (SELECT 1 FROM public.multi_company_access m WHERE m.user_id=p.id AND m.company_id=p_company_id AND m.status='active' AND (m.expires_at IS NULL OR m.expires_at>now())))
      AND (p_group IS NULL OR EXISTS (
        SELECT 1 FROM public.company_tags t WHERE t.tag = 'Gruppo: ' || p_group
          AND (t.company_id=p.company_id OR EXISTS (
            SELECT 1 FROM public.multi_company_access m WHERE m.user_id=p.id AND m.company_id=t.company_id
              AND m.status='active' AND (m.expires_at IS NULL OR m.expires_at>now())))))
      AND (p_search IS NULL OR p_search = '' OR
           (COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,'') || ' ' ||
            COALESCE(p.email,'') || ' ' || COALESCE(p.phone,'')) ILIKE '%' || p_search || '%'
           OR p.id::text = p_search)
      AND (p_role IS NULL OR EXISTS (
            SELECT 1 FROM public.user_roles ur
             WHERE ur.user_id = p.id AND ur.role::text = p_role))
  ), filtrato AS (
    SELECT * FROM base b
     WHERE p_stato IS NULL
        OR (p_stato = 'bloccati'    AND (b.bloccato_ OR (b.locked_until IS NOT NULL AND b.locked_until > now())))
        OR (p_stato = 'mai_entrati' AND b.ultimo_ IS NULL)
        OR (p_stato = 'attivi'      AND NOT b.bloccato_ AND b.ultimo_ IS NOT NULL)
  ), conteggio AS (SELECT count(*) AS n FROM filtrato)
  SELECT f.id, f.email, f.nome_, f.phone, f.company_id, f.azienda_nome_, f.ruoli_,
         f.bloccato_, f.block_reason, f.locked_until, f.tentativi_, f.ultimo_,
         f.sessioni_, f.created_at, cc.n
  FROM filtrato f CROSS JOIN conteggio cc
  ORDER BY f.ultimo_ DESC NULLS LAST, f.created_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 200)) OFFSET GREATEST(0, p_offset);
END;
$function$
;
REVOKE ALL ON FUNCTION public.admin_search_directory_users(text,text,uuid,text,integer,integer,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_search_directory_users(text,text,uuid,text,integer,integer,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_accounts_overview()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF NOT public.is_super_admin(auth.uid()) AND NOT public.is_platform_staff(auth.uid()) THEN
   RAISE EXCEPTION 'Accesso riservato allo staff di piattaforma' USING ERRCODE='42501';
 END IF;
 RETURN jsonb_build_object(
   'accounts', (SELECT count(*) FROM auth.users),
   'with_profile', (SELECT count(*) FROM auth.users a JOIN public.profiles p ON p.id=a.id),
   'without_profile', (SELECT count(*) FROM auth.users a LEFT JOIN public.profiles p ON p.id=a.id WHERE p.id IS NULL),
   'portal', (SELECT count(*) FROM auth.users a WHERE EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=a.id AND r.role::text='customer')
      AND NOT EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=a.id AND r.role::text<>'customer')),
   'roles', (SELECT coalesce(jsonb_agg(role ORDER BY role), '[]'::jsonb) FROM (SELECT DISTINCT r.role::text role FROM public.user_roles r JOIN auth.users a ON a.id=r.user_id) roles),
   'companies', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.accounts DESC,x.name), '[]'::jsonb) FROM (
     SELECT c.id, c.name, count(a.id) accounts,
       count(a.id) FILTER(WHERE EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=a.id AND r.role::text='customer')
         AND NOT EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=a.id AND r.role::text<>'customer')) portal
     FROM public.companies c LEFT JOIN public.profiles p ON p.company_id=c.id LEFT JOIN auth.users a ON a.id=p.id
     GROUP BY c.id,c.name
     UNION ALL
     SELECT NULL::uuid, 'Senza azienda', count(a.id),
       count(a.id) FILTER(WHERE EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=a.id AND r.role::text='customer')
         AND NOT EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=a.id AND r.role::text<>'customer'))
     FROM auth.users a LEFT JOIN public.profiles p ON p.id=a.id WHERE p.company_id IS NULL
   ) x)
 );
END $$;
REVOKE ALL ON FUNCTION public.admin_accounts_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_accounts_overview() TO authenticated;

-- La scrittura passa dalle policy company_tags esistenti (SECURITY INVOKER).
-- Un gruppo organizza le aziende: nessuna modifica a ruoli, accessi o fatturazione.
CREATE OR REPLACE FUNCTION public.admin_set_company_group(p_company_ids uuid[], p_group text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE company uuid; group_name text := btrim(coalesce(p_group,''));
BEGIN
 IF public.is_super_admin(auth.uid()) IS NOT TRUE THEN
   RAISE EXCEPTION 'Operazione riservata al superadmin' USING ERRCODE='42501';
 END IF;
 IF coalesce(cardinality(p_company_ids),0) NOT BETWEEN 1 AND 200 OR length(group_name)>80 THEN
   RAISE EXCEPTION 'Selezionare da 1 a 200 aziende; nome gruppo massimo 80 caratteri';
 END IF;
 FOR company IN SELECT DISTINCT x FROM unnest(p_company_ids) x ORDER BY x LOOP
   PERFORM pg_advisory_xact_lock(hashtextextended(company::text, 712));
   DELETE FROM public.company_tags WHERE company_id=company AND tag LIKE 'Gruppo: %';
   IF group_name<>'' THEN
     INSERT INTO public.company_tags(company_id,tag,color) VALUES(company,'Gruppo: '||group_name,'#6366f1');
   END IF;
 END LOOP;
 INSERT INTO public.admin_audit_log(user_id,action,target_type,details)
 VALUES(auth.uid(),'set_company_group','company',jsonb_build_object('company_ids',p_company_ids,'group',nullif(group_name,'')));
END $$;
REVOKE ALL ON FUNCTION public.admin_set_company_group(uuid[],text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_company_group(uuid[],text) TO authenticated;

