-- Permessi delle Impostazioni nel database — Finanziamenti (eic_*): li legge ogni persona interna, li cambia chi ha il permesso
-- Applicata il 10/10/2026 con apply_migration, registro riallineato al nome del file (CLAUDE.md). Si può rilanciare senza effetti (DROP … IF EXISTS prima di ogni CREATE).
--
-- Scrive chi ha «Finanziamenti» o «Listino e prezzi» in modifica (la regola della pagina: usePermissions.ts, canEditSettingsFinanziamenti),
-- l'amministratore e il super admin. I preventivi leggono queste tabelle; le importazioni usano il service role.

set local lock_timeout = '3s';

drop policy if exists co_eic_finanziarie_all on public.eic_finanziarie;
drop policy if exists eic_finanziarie_lettura on public.eic_finanziarie;
create policy eic_finanziarie_lettura on public.eic_finanziarie
  for select to authenticated
  using (company_id = (select public.get_effective_company_id()) and not (select public.utente_e_cliente_esterno()));
drop policy if exists eic_finanziarie_scrittura on public.eic_finanziarie;
create policy eic_finanziarie_scrittura on public.eic_finanziarie
  for all to authenticated
  using (company_id = (select public.get_effective_company_id()) and not (select public.utente_e_cliente_esterno())
         and (company_id in (select unnest(public.aziende_con_uno_dei_permessi(array[
                'can_edit_settings_finanziamenti', 'can_edit_settings_pricing'])))
              or (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))))
  with check (company_id = (select public.get_effective_company_id()) and not (select public.utente_e_cliente_esterno())
         and (company_id in (select unnest(public.aziende_con_uno_dei_permessi(array[
                'can_edit_settings_finanziamenti', 'can_edit_settings_pricing'])))
              or (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))));

drop policy if exists co_eic_tabelle_all on public.eic_tabelle_finanziamento;
drop policy if exists eic_tabelle_lettura on public.eic_tabelle_finanziamento;
create policy eic_tabelle_lettura on public.eic_tabelle_finanziamento
  for select to authenticated
  using (company_id = (select public.get_effective_company_id()) and not (select public.utente_e_cliente_esterno()));
drop policy if exists eic_tabelle_scrittura on public.eic_tabelle_finanziamento;
create policy eic_tabelle_scrittura on public.eic_tabelle_finanziamento
  for all to authenticated
  using (company_id = (select public.get_effective_company_id()) and not (select public.utente_e_cliente_esterno())
         and (company_id in (select unnest(public.aziende_con_uno_dei_permessi(array[
                'can_edit_settings_finanziamenti', 'can_edit_settings_pricing'])))
              or (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))))
  with check (company_id = (select public.get_effective_company_id()) and not (select public.utente_e_cliente_esterno())
         and (company_id in (select unnest(public.aziende_con_uno_dei_permessi(array[
                'can_edit_settings_finanziamenti', 'can_edit_settings_pricing'])))
              or (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))));

drop policy if exists co_eic_righe_all on public.eic_tabelle_finanziamento_righe;
drop policy if exists eic_righe_lettura on public.eic_tabelle_finanziamento_righe;
create policy eic_righe_lettura on public.eic_tabelle_finanziamento_righe
  for select to authenticated
  using (company_id = (select public.get_effective_company_id()) and not (select public.utente_e_cliente_esterno()));
drop policy if exists eic_righe_scrittura on public.eic_tabelle_finanziamento_righe;
create policy eic_righe_scrittura on public.eic_tabelle_finanziamento_righe
  for all to authenticated
  using (company_id = (select public.get_effective_company_id()) and not (select public.utente_e_cliente_esterno())
         and (company_id in (select unnest(public.aziende_con_uno_dei_permessi(array[
                'can_edit_settings_finanziamenti', 'can_edit_settings_pricing'])))
              or (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))))
  with check (company_id = (select public.get_effective_company_id()) and not (select public.utente_e_cliente_esterno())
         and exists (select 1 from public.eic_tabelle_finanziamento t
                      where t.id = eic_tabelle_finanziamento_righe.tabella_id
                        and t.company_id = (select public.get_effective_company_id()))
         and (company_id in (select unnest(public.aziende_con_uno_dei_permessi(array[
                'can_edit_settings_finanziamenti', 'can_edit_settings_pricing'])))
              or (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))));
