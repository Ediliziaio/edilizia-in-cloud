-- Dependencies are installed here before later policy-optimization migrations.
CREATE OR REPLACE FUNCTION public.aziende_con_permesso(_permission text)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _out uuid[] := '{}';
  _staff uuid[] := '{}';
BEGIN
  IF _uid IS NULL THEN RETURN '{}'; END IF;

  -- Amministratore della propria azienda.
  IF has_role(_uid, 'company_admin'::app_role) THEN
    _out := _out || ARRAY(SELECT p.company_id FROM public.profiles p WHERE p.id = _uid AND p.company_id IS NOT NULL);
  END IF;

  -- Accessi multi-azienda con grado amministratore.
  _out := _out || ARRAY(
    SELECT mca.company_id FROM public.multi_company_access mca
    WHERE mca.user_id = _uid
      AND mca.status = 'active'
      AND (mca.expires_at IS NULL OR mca.expires_at > now())
      AND mca.access_role::text = 'company_admin'
  );

  -- Permesso esplicito, una riga per azienda. La colonna è dinamica: si
  -- verifica che esista (UNA volta per chiamata, non per riga).
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'staff_permissions' AND column_name = _permission
  ) THEN
    BEGIN
      EXECUTE format(
        'SELECT COALESCE(array_agg(company_id), ''{}'') FROM public.staff_permissions WHERE user_id = $1 AND %I = true',
        _permission
      ) INTO _staff USING _uid;
    EXCEPTION WHEN OTHERS THEN
      _staff := '{}';
    END;
    _out := _out || COALESCE(_staff, '{}');
  END IF;

  RETURN _out;
END;
$function$;

COMMENT ON FUNCTION public.aziende_con_permesso(text) IS
  'Le aziende in cui l''utente corrente ha il permesso dato (stessa semantica di has_permission_for_company, ma UNA chiamata per query invece che una per riga). Super admin esclusi: hanno la loro policy.';


REVOKE ALL ON FUNCTION public.aziende_con_permesso(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.aziende_con_permesso(text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.e_amministratore_di(p_azienda uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  -- La regola di aziende_amministrate() per un'azienda sola, in un solo
  -- EXISTS (~30 µs contro ~200 µs di has_role): si può chiamare anche dentro
  -- le funzioni che le policy valutano riga per riga.
  SELECT p_azienda IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.profiles p
     WHERE p.id = auth.uid()
       AND NOT coalesce(p.is_blocked, false)
       AND (
         (p.company_id = p_azienda
          AND EXISTS (SELECT 1 FROM public.user_roles r
                       WHERE r.user_id = p.id AND r.role = 'company_admin'::public.app_role))
         OR EXISTS (SELECT 1 FROM public.multi_company_access m
                     WHERE m.user_id = p.id
                       AND m.company_id = p_azienda
                       AND m.access_role = 'company_admin'
                       AND m.status = 'active'
                       AND (m.expires_at IS NULL OR m.expires_at > now()))
       )
  );
$$;
REVOKE ALL ON FUNCTION public.e_amministratore_di(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.e_amministratore_di(uuid) TO authenticated,service_role;

-- Same write authority as quotes: impersonating an existing company does not
-- change a superadmin's home company. Never bypass RLS in the save RPC.
-- Require the item's company to match its parent quote for EVERY role.
set local lock_timeout = '3s';

drop policy if exists qi_sel on public.quote_items;
create policy qi_sel on public.quote_items for select to authenticated
using (
  not (select public.utente_e_cliente_esterno())
  and ((select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
       or company_id = (select public.get_my_company_id()))
  and exists (select 1 from public.quotes q
    where q.id = quote_items.quote_id and q.company_id = quote_items.company_id)
);

drop policy if exists qi_ins on public.quote_items;
create policy qi_ins on public.quote_items for insert to authenticated
with check (
  not (select public.utente_e_cliente_esterno())
  and ((select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
       or company_id = (select public.get_my_company_id()))
  and exists (select 1 from public.quotes q
    where q.id = quote_items.quote_id and q.company_id = quote_items.company_id
      and ((select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
           or q.company_id in (select unnest(public.aziende_con_permesso('can_edit_preventivi'))))
      and public.check_staff_visibility((select auth.uid()), q.assigned_to))
);

drop policy if exists qi_upd on public.quote_items;
create policy qi_upd on public.quote_items for update to authenticated
using (
  not (select public.utente_e_cliente_esterno())
  and ((select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
       or company_id = (select public.get_my_company_id()))
  and exists (select 1 from public.quotes q
    where q.id = quote_items.quote_id and q.company_id = quote_items.company_id
      and ((select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
           or q.company_id in (select unnest(public.aziende_con_permesso('can_edit_preventivi'))))
      and public.check_staff_visibility((select auth.uid()), q.assigned_to))
)
with check (
  not (select public.utente_e_cliente_esterno())
  and ((select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
       or company_id = (select public.get_my_company_id()))
  and exists (select 1 from public.quotes q
    where q.id = quote_items.quote_id and q.company_id = quote_items.company_id
      and ((select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
           or q.company_id in (select unnest(public.aziende_con_permesso('can_edit_preventivi'))))
      and public.check_staff_visibility((select auth.uid()), q.assigned_to))
);

drop policy if exists qi_del on public.quote_items;
create policy qi_del on public.quote_items for delete to authenticated
using (
  not (select public.utente_e_cliente_esterno())
  and ((select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
       or company_id = (select public.get_my_company_id()))
  and exists (select 1 from public.quotes q
    where q.id = quote_items.quote_id and q.company_id = quote_items.company_id
      and ((select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
           or q.company_id in (select unnest(public.aziende_con_permesso('can_edit_preventivi'))))
      and public.check_staff_visibility((select auth.uid()), q.assigned_to))
);

-- Failed new-quote saves must be compensatable for the same superadmin that
-- could create the header; normal company admins retain their existing scope.
drop policy if exists q_del on public.quotes;
create policy q_del on public.quotes for delete to authenticated
using (
  (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
  or (company_id = (select public.get_my_company_id())
      and (select public.e_amministratore_di(public.get_my_company_id())))
);
