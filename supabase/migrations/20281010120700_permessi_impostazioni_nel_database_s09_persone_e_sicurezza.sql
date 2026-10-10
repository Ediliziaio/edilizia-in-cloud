-- Permessi delle Impostazioni nel database — persone e sicurezza
-- Applicata il 10/10/2026 con apply_migration, registro riallineato al nome del file (CLAUDE.md). Si può rilanciare senza effetti (DROP … IF EXISTS prima di ogni CREATE).
--
-- 9a. Regole provvigioni (commission_rules) e beneficiari dei compensi (compensation_beneficiaries): li cambia chi ha «Persone»
--     in modifica (can_edit_settings_people), non più la casella aggregata can_edit_settings.
-- 9b. Sessioni e tentativi di accesso dei colleghi: user_sessions la legge l'amministratore, chi ha «Utenti» o «Sicurezza» e ognuno
--     le proprie; login_attempts l'amministratore, chi ha «Sicurezza» e ognuno i propri (l'app passa da get-security-report, service role).
-- 9c. preventivo_impostazioni: con «Integrazioni» (e senza «Listino e prezzi») si cambiano solo firma_digitale_abilitata e
--     firma_richiede_nome (SettingsFirmaElettronica.tsx); il resto lo cambia chi ha «Listino e prezzi», l'amministratore, il super admin.

set local lock_timeout = '3s';

-- 9a. provvigioni e beneficiari dei compensi
drop policy if exists "Staff can manage commission rules if permitted" on public.commission_rules;
create policy "Staff can manage commission rules if permitted" on public.commission_rules
  for all
  using (public.has_permission((select auth.uid()), 'can_edit_settings_people')
         and company_id = public.get_user_company_id((select auth.uid())))
  with check (public.has_permission((select auth.uid()), 'can_edit_settings_people')
         and company_id = public.get_user_company_id((select auth.uid())));

drop policy if exists "Company staff can manage compensation beneficiaries" on public.compensation_beneficiaries;
create policy "Company staff can manage compensation beneficiaries" on public.compensation_beneficiaries
  for all
  using (public.has_permission((select auth.uid()), 'can_edit_settings_people')
         and company_id = public.get_user_company_id((select auth.uid())))
  with check (public.has_permission((select auth.uid()), 'can_edit_settings_people')
         and company_id = public.get_user_company_id((select auth.uid())));

-- 9b. sessioni e tentativi di accesso
drop policy if exists user_sessions_select_admin on public.user_sessions;
drop policy if exists user_sessions_lettura on public.user_sessions;
create policy user_sessions_lettura on public.user_sessions
  for select to authenticated
  using (not (select public.utente_e_cliente_esterno())
         and ((select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
              or user_id = (select auth.uid())
              or (company_id = (select public.get_my_company_id())
                  and company_id in (select unnest(public.aziende_con_uno_dei_permessi(array[
                        'can_view_users', 'can_view_settings_security']))))));

drop policy if exists login_attempts_select_admin on public.login_attempts;
drop policy if exists login_attempts_lettura on public.login_attempts;
create policy login_attempts_lettura on public.login_attempts
  for select to authenticated
  using (not (select public.utente_e_cliente_esterno())
         and ((select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
              or user_id = (select auth.uid())
              or (user_id in (select p.id from public.profiles p where p.company_id = (select public.get_my_company_id()))
                  and (select public.get_my_company_id()) in (select unnest(public.aziende_con_permesso('can_view_settings_security'))))));

-- 9c. impostazioni dei preventivi: con «Integrazioni» solo la firma
create or replace function public.preventivo_impostazioni_colonne_firma()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $f$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if public.has_role(auth.uid(), 'super_admin'::public.app_role) then
    return new;
  end if;
  if new.company_id = any (public.aziende_con_permesso('can_edit_settings_pricing')) then
    return new;
  end if;
  if (to_jsonb(new) - 'firma_digitale_abilitata' - 'firma_richiede_nome')
     is distinct from (to_jsonb(old) - 'firma_digitale_abilitata' - 'firma_richiede_nome') then
    raise exception 'Margini, numerazione e opzioni del PDF li cambia chi ha «Listino e prezzi» in modifica: con «Integrazioni» si cambia solo la firma.'
      using errcode = '42501';
  end if;
  return new;
end
$f$;

drop trigger if exists trg_preventivo_impostazioni_colonne_firma on public.preventivo_impostazioni;
create trigger trg_preventivo_impostazioni_colonne_firma
  before update on public.preventivo_impostazioni
  for each row execute function public.preventivo_impostazioni_colonne_firma();
