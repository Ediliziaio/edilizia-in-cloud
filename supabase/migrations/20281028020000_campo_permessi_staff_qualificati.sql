set local lock_timeout='3s';
set local statement_timeout='60s';
-- Collaudo ruoli Campo 28/10/2026: nessuna modifica a identità, ruoli o dati operativi.
-- Una vecchia riga staff_permissions non attribuisce il ruolo di ufficio.
-- Conserva amministratori, ruoli piattaforma e accessi multi-azienda staff attivi.
create or replace function public.has_permission_for_company(_user_id uuid, _permission text, _company_id uuid)
returns boolean language plpgsql stable security definer set search_path = ''
as $fn$
declare _has boolean;
begin
 if public.chiamante_anonimo() then return false; end if;
 if _user_id is null or _company_id is null then return false; end if;
 if exists(select 1 from public.profiles p where p.id=_user_id and coalesce(p.is_blocked,false)) then return false; end if;
 if public.has_role(_user_id,'super_admin'::public.app_role) then return true; end if;
 if public.has_role(_user_id,'company_admin'::public.app_role) and _company_id=public.get_user_company_id(_user_id) then return true; end if;
 if exists(select 1 from public.multi_company_access m where m.user_id=_user_id and m.company_id=_company_id and m.status='active' and (m.expires_at is null or m.expires_at>now()) and m.access_role::text='company_admin') then return true; end if;
 -- Stessa qualificazione del ruolo usata da has_permission, limitata all'azienda richiesta.
 if not ((public.has_role(_user_id,'company_staff'::public.app_role) and _company_id=public.get_user_company_id(_user_id))
   or public.e_ruolo_piattaforma(_user_id)
   or exists(select 1 from public.multi_company_access m where m.user_id=_user_id and m.company_id=_company_id and m.status='active' and (m.expires_at is null or m.expires_at>now()) and m.access_role::text='company_staff'))
 then return false; end if;
 if not exists(select 1 from pg_catalog.pg_attribute a where a.attrelid='public.staff_permissions'::regclass and a.attname=_permission and a.attnum>0 and not a.attisdropped) then return false; end if;
 begin
  execute pg_catalog.format('select %I from public.staff_permissions where user_id=$1 and company_id=$2 limit 1',_permission) into _has using _user_id,_company_id;
 exception when others then return false; end;
 return coalesce(_has,false);
end $fn$;

-- Contabilità riservata: sostituisce le vecchie policy ALL basate sulla sola azienda.
drop policy if exists sub_company_1 on public.contratti_subappalto;
drop policy if exists ufficio_leggi on public.contratti_subappalto;
create policy ufficio_leggi on public.contratti_subappalto for select to authenticated using (public.has_permission_for_company((select auth.uid()),'can_view_costs',company_id) and public.has_permission_for_company((select auth.uid()),'can_view_subappaltatori_amministrazione',company_id));
drop policy if exists ufficio_scrivi on public.contratti_subappalto;
create policy ufficio_scrivi on public.contratti_subappalto for all to authenticated using ((public.has_permission_for_company((select auth.uid()),'can_view_costs',company_id) and public.has_permission_for_company((select auth.uid()),'can_view_subappaltatori_amministrazione',company_id)) and not public.utente_sola_lettura(company_id) and public.has_permission_for_company((select auth.uid()),'can_edit_orders',company_id)) with check ((public.has_permission_for_company((select auth.uid()),'can_view_costs',company_id) and public.has_permission_for_company((select auth.uid()),'can_view_subappaltatori_amministrazione',company_id)) and not public.utente_sola_lettura(company_id) and public.has_permission_for_company((select auth.uid()),'can_edit_orders',company_id));
drop policy if exists sub_company_2 on public.sal_subappaltatori;
drop policy if exists ufficio_leggi on public.sal_subappaltatori;
create policy ufficio_leggi on public.sal_subappaltatori for select to authenticated using (public.has_permission_for_company((select auth.uid()),'can_view_costs',company_id) and public.has_permission_for_company((select auth.uid()),'can_view_subappaltatori_amministrazione',company_id));
drop policy if exists ufficio_scrivi on public.sal_subappaltatori;
create policy ufficio_scrivi on public.sal_subappaltatori for all to authenticated using ((public.has_permission_for_company((select auth.uid()),'can_view_costs',company_id) and public.has_permission_for_company((select auth.uid()),'can_view_subappaltatori_amministrazione',company_id)) and not public.utente_sola_lettura(company_id) and public.has_permission_for_company((select auth.uid()),'can_edit_orders',company_id)) with check ((public.has_permission_for_company((select auth.uid()),'can_view_costs',company_id) and public.has_permission_for_company((select auth.uid()),'can_view_subappaltatori_amministrazione',company_id)) and not public.utente_sola_lettura(company_id) and public.has_permission_for_company((select auth.uid()),'can_edit_orders',company_id));
drop policy if exists sub_company_3 on public.ritenute_garanzia;
drop policy if exists ufficio_leggi on public.ritenute_garanzia;
create policy ufficio_leggi on public.ritenute_garanzia for select to authenticated using (public.has_permission_for_company((select auth.uid()),'can_view_costs',company_id) and (contratto_id is null or public.has_permission_for_company((select auth.uid()),'can_view_subappaltatori_amministrazione',company_id)));
drop policy if exists ufficio_scrivi on public.ritenute_garanzia;
create policy ufficio_scrivi on public.ritenute_garanzia for all to authenticated using ((public.has_permission_for_company((select auth.uid()),'can_view_costs',company_id) and (contratto_id is null or public.has_permission_for_company((select auth.uid()),'can_view_subappaltatori_amministrazione',company_id))) and not public.utente_sola_lettura(company_id) and public.e_amministratore_di(company_id)) with check ((public.has_permission_for_company((select auth.uid()),'can_view_costs',company_id) and (contratto_id is null or public.has_permission_for_company((select auth.uid()),'can_view_subappaltatori_amministrazione',company_id))) and not public.utente_sola_lettura(company_id) and public.e_amministratore_di(company_id));

