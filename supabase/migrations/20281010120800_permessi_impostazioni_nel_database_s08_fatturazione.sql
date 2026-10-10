-- Permessi delle Impostazioni nel database — fatturazione: funzione d'appoggio per billing-connect e scheda fiscale dell'azienda
-- Applicata il 10/10/2026 con apply_migration, registro riallineato al nome del file (CLAUDE.md). Si può rilanciare senza effetti (DROP … IF EXISTS prima di ogni CREATE).
--
-- 8a. utente_e_amministratore_di(utente, azienda): chiusa a tutti tranne il service role, serve alle edge function che riservano
--     un'azione all'amministratore dell'azienda (billing-connect).
-- 8b. anagrafica_azienda (ragione sociale, P.IVA, IBAN, codice SDI, numeratori): legge ogni persona interna; cambia e cancella chi
--     ha «Fatturazione» e il super admin; crea anche chi emette un DDT (magazzino, commesse), perché useCreateDocumento crea la
--     scheda al primo documento. I numeratori li scrivono le funzioni del database (documento_crea, documento_numero_nella_serie, …)
--     e invia-sdi (service role).

set local lock_timeout = '3s';

create or replace function public.utente_e_amministratore_di(p_user uuid, p_azienda uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $f$
  select p_user is not null and p_azienda is not null and (
    exists (select 1 from public.user_roles r where r.user_id = p_user and r.role = 'super_admin'::public.app_role)
    or exists (select 1
                 from public.profiles p
                where p.id = p_user and not coalesce(p.is_blocked, false) and p.company_id = p_azienda
                  and exists (select 1 from public.user_roles r
                               where r.user_id = p.id and r.role = 'company_admin'::public.app_role))
    or exists (select 1
                 from public.multi_company_access m
                 join public.profiles p on p.id = m.user_id and not coalesce(p.is_blocked, false)
                where m.user_id = p_user and m.company_id = p_azienda
                  and m.access_role = 'company_admin' and m.status = 'active'
                  and (m.expires_at is null or m.expires_at > now()))
  );
$f$;
revoke all on function public.utente_e_amministratore_di(uuid, uuid) from public, anon, authenticated;
grant execute on function public.utente_e_amministratore_di(uuid, uuid) to service_role;

-- 8b. scheda fiscale dell'azienda
drop policy if exists company_isolation on public.anagrafica_azienda;
drop policy if exists anagrafica_azienda_lettura on public.anagrafica_azienda;
create policy anagrafica_azienda_lettura on public.anagrafica_azienda
  for select to authenticated
  using (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno()));
drop policy if exists anagrafica_azienda_inserimento on public.anagrafica_azienda;
create policy anagrafica_azienda_inserimento on public.anagrafica_azienda
  for insert to authenticated
  with check (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno())
         and (company_id in (select unnest(public.aziende_con_uno_dei_permessi(array[
                'can_view_billing', 'can_view_warehouse', 'can_edit_orders'])))
              or (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))));
drop policy if exists anagrafica_azienda_modifica on public.anagrafica_azienda;
create policy anagrafica_azienda_modifica on public.anagrafica_azienda
  for update to authenticated
  using (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno())
         and (company_id in (select unnest(public.aziende_con_permesso('can_view_billing')))
              or (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))))
  with check (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno())
         and (company_id in (select unnest(public.aziende_con_permesso('can_view_billing')))
              or (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))));
drop policy if exists anagrafica_azienda_cancellazione on public.anagrafica_azienda;
create policy anagrafica_azienda_cancellazione on public.anagrafica_azienda
  for delete to authenticated
  using (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno())
         and (company_id in (select unnest(public.aziende_con_permesso('can_view_billing')))
              or (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))));
