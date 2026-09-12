-- Obiettivi mensili dei venditori.
--
-- sales_targets c'era ma non l'ha mai usata nessuno (zero righe): due progetti
-- diversi nella stessa tabella (user_id e assigned_to, target_revenue e
-- target_amount), un vincolo che permetteva UN obiettivo per persona e tipo
-- di periodo — non uno per mese — e una policy «per tutti i membri» su tutti
-- i comandi, per cui chiunque in azienda poteva scriversi l'obiettivo che
-- voleva (le policy «solo admin» accanto, in OR, non servivano a niente).
--
-- Da qui: un obiettivo per venditore e per mese (fatturato e numero di
-- contratti, sulle stesse definizioni del report: valore delle opportunità
-- vinte nel mese). Lo vede chi vede i report o Sales OS, e il venditore il
-- proprio; lo scrive un amministratore dell'azienda.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- un obiettivo per persona e per mese, non per «tipo di periodo»
alter table public.sales_targets drop constraint if exists sales_targets_company_id_user_id_period_type_key;
drop index if exists public.sales_targets_company_id_user_id_period_type_key;
alter table public.sales_targets alter column period_type set default 'monthly';

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.sales_targets'::regclass
                    and conname = 'sales_targets_venditore_mese_key') then
    alter table public.sales_targets
      add constraint sales_targets_venditore_mese_key unique (company_id, user_id, year, month);
  end if;
end $$;

alter table public.sales_targets drop constraint if exists sales_targets_mese_valido;
alter table public.sales_targets
  add constraint sales_targets_mese_valido
  check ((month is null or month between 1 and 12) and (year is null or year between 2000 and 2100));

-- le regole: vedere chi vede i numeri, scrivere l'amministratore
drop policy if exists "sales_targets_company_isolation" on public.sales_targets;
drop policy if exists "Company members can view sales targets" on public.sales_targets;
drop policy if exists "Admins can insert sales targets" on public.sales_targets;
drop policy if exists "Admins can update sales targets" on public.sales_targets;
drop policy if exists "Admins can delete sales targets" on public.sales_targets;
drop policy if exists "obiettivi_si_leggono" on public.sales_targets;
drop policy if exists "obiettivi_li_scrive_l_admin" on public.sales_targets;

create policy "obiettivi_si_leggono" on public.sales_targets
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or company_id in (select unnest(public.aziende_con_permesso('can_view_marketing_reports')
                                    || public.aziende_con_permesso('can_view_sales_os')))
    or (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
  );

-- l'amministratore dell'azienda: quella del suo profilo se è company_admin, o
-- quelle dove ha un accesso multi-azienda da amministratore (le stesse regole
-- di aziende_con_permesso, senza i permessi da dipendente)
create policy "obiettivi_li_scrive_l_admin" on public.sales_targets
  for all to authenticated
  using (
    company_id in (
      select p.company_id
        from public.profiles p
       where p.id = (select auth.uid())
         and (select public.has_role((select auth.uid()), 'company_admin'::public.app_role))
      union
      select mca.company_id
        from public.multi_company_access mca
       where mca.user_id = (select auth.uid())
         and mca.status = 'active'
         and (mca.expires_at is null or mca.expires_at > now())
         and mca.access_role::text = 'company_admin'
    )
    or (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
  )
  with check (
    company_id in (
      select p.company_id
        from public.profiles p
       where p.id = (select auth.uid())
         and (select public.has_role((select auth.uid()), 'company_admin'::public.app_role))
      union
      select mca.company_id
        from public.multi_company_access mca
       where mca.user_id = (select auth.uid())
         and mca.status = 'active'
         and (mca.expires_at is null or mca.expires_at > now())
         and mca.access_role::text = 'company_admin'
    )
    or (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
  );
