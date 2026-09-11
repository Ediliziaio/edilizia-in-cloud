-- Fasi, pipeline, appuntamenti e preventivi: il permesso si legge una volta
-- per query, non due volte per riga.
--
-- Sette regole chiamavano has_permission_for_company(utente, permesso,
-- company_id) su ogni riga. La funzione è costosa (a ogni chiamata interroga
-- information_schema per sapere se la colonna del permesso esiste, poi esegue
-- SQL dinamico): leggere le 394 fasi costava 600-770 ms a ogni utente che non
-- fosse super admin — anche a un cliente che non ne vede nessuna — e 290-490 ms
-- i 141 appuntamenti. La bacheca Opportunità legge le fasi a ogni apertura; da
-- quando i report di Sales OS e Venditori rispettano le regole di visibilità
-- (20280915410002/003) lo pagavano anche loro, 1,4 s la pipeline pesata.
--
-- has_permission_for_company(uid, P, company_id) diventa
--   (super_admin) OR company_id IN (aziende_con_permesso(P))
-- che è la stessa cosa calcolata una volta: aziende_con_permesso restituisce
-- esattamente le aziende in cui l'utente è admin, admin in multi-azienda o ha il
-- permesso P (staff_permissions ha una riga sola per utente e azienda); il ramo
-- super admin, che aziende_con_permesso non copre, è scritto esplicitamente. Le
-- regole sulle opportunità e sulle attività usano già questa forma.
-- check_staff_visibility(uid, assigned_to), che dipende dalla riga, resta.
--
-- Prima di cambiarle, ogni regola dev'essere ancora quella letta (md5): se
-- qualcuno l'ha modificata nel frattempo, la migrazione si ferma.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

do $blocco$
declare
  v_search_path text := current_setting('search_path');
  v_cambiate    text;
begin
  perform set_config('lock_timeout', '3s', true);
  -- Testi tutti qualificati, come in pg_dump: le impronte non dipendono dal search_path.
  perform set_config('search_path', '', true);

  select string_agg(x.tabella || '.' || x.nome, ', ') into v_cambiate
    from (values
      ('appointments', 'Staff can manage appointments via marketing', 'c940f1b943ba05a0b3053e686ccc8b53'),
      ('appointments', 'Staff can view appointments via marketing', '19014b960877caeba372a18428358211'),
      ('marketing_pipeline_stages', 'Staff can view pipeline stages if permitted', 'a0fcf3a717455519a4257fc7e798204a'),
      ('marketing_pipelines', 'Staff can view pipelines if permitted', 'a0fcf3a717455519a4257fc7e798204a'),
      ('quotes', 'q_ins_preventivi', '414bb5bfff6c7a116255a707e662375b'),
      ('quotes', 'q_sel_preventivi', '17533952f5ba5f09756fc824b910640c'),
      ('quotes', 'q_upd_preventivi', 'c08ffdc13567f451fb3c48ca39c967ba')
    ) as x(tabella, nome, impronta)
   where not exists (
     select 1 from pg_catalog.pg_policy p
      where p.polrelid = pg_catalog.to_regclass('public.' || x.tabella)
        and p.polname = x.nome
        and pg_catalog.md5(coalesce(pg_catalog.pg_get_expr(p.polqual, p.polrelid), '') || '|' ||
                           coalesce(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), '')) = x.impronta);
  if v_cambiate is not null then
    raise exception 'Regole cambiate dopo la lettura, migrazione ferma: %', v_cambiate;
  end if;

  alter policy "Staff can manage appointments via marketing" on public.appointments
    using (((select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
            or company_id in (select unnest(public.aziende_con_permesso('can_view_marketing_appointments'::text))))
           and public.check_staff_visibility((select auth.uid()), assigned_to))
    with check ((select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
                or company_id in (select unnest(public.aziende_con_permesso('can_view_marketing_appointments'::text))));

  alter policy "Staff can view appointments via marketing" on public.appointments
    using (((select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
            or company_id in (select unnest(public.aziende_con_permesso('can_view_marketing_appointments'::text))))
           and public.check_staff_visibility((select auth.uid()), assigned_to));

  alter policy "Staff can view pipeline stages if permitted" on public.marketing_pipeline_stages
    using ((select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
           or company_id in (select unnest(public.aziende_con_permesso('can_view_marketing_opportunities'::text)
                                           || public.aziende_con_permesso('can_view_orders'::text))));

  alter policy "Staff can view pipelines if permitted" on public.marketing_pipelines
    using ((select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
           or company_id in (select unnest(public.aziende_con_permesso('can_view_marketing_opportunities'::text)
                                           || public.aziende_con_permesso('can_view_orders'::text))));

  alter policy q_ins_preventivi on public.quotes
    with check ((select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
                or company_id in (select unnest(public.aziende_con_permesso('can_edit_preventivi'::text))));

  alter policy q_sel_preventivi on public.quotes
    using (((select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
            or company_id in (select unnest(public.aziende_con_permesso('can_view_preventivi'::text))))
           and public.check_staff_visibility((select auth.uid()), assigned_to));

  alter policy q_upd_preventivi on public.quotes
    using (((select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
            or company_id in (select unnest(public.aziende_con_permesso('can_edit_preventivi'::text))))
           and public.check_staff_visibility((select auth.uid()), assigned_to))
    with check ((select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
                or company_id in (select unnest(public.aziende_con_permesso('can_edit_preventivi'::text))));

  perform set_config('search_path', v_search_path, true);
end $blocco$;
