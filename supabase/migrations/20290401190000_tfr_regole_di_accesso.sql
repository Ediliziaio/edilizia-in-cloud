-- Fondo TFR: le regole di accesso di cg_tfr_movimenti e cg_tfr_destinazioni (15/11/2026)
--
-- Il 20290401180000 creava le regole solo se la tabella non ne aveva. Ma un
-- trigger del database aggiunge da sé «blocco_utente_bloccato» a ogni tabella
-- nuova: la tabella ne aveva già una, e le altre non sono nate. Senza la
-- regola di inserimento nessuno poteva registrare liquidazioni o
-- destinazioni (accesso negato), e nessuno le vedeva. Adesso ogni regola si
-- crea se manca, controllata per nome.

do $p$
declare
  t text;
  aree constant text := '{can_view_controllo_gestione,can_view_cruscotto,can_view_billing,can_view_costs,can_view_financial_reports,can_view_prima_nota,can_view_tesoreria,can_view_scadenzario,can_manage_payments,can_view_forecast}';
begin
  foreach t in array array['cg_tfr_movimenti', 'cg_tfr_destinazioni'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'blocco_utente_bloccato') then
      execute format($q$create policy blocco_utente_bloccato on public.%I as restrictive for all to authenticated
        using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()))$q$, t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'permessi_finanza') then
      execute format($q$create policy permessi_finanza on public.%I as restrictive for all to authenticated
        using ((select public.utente_super_admin()) or company_id = any ((select public.aziende_area(%L::text[]))::uuid[]))
        with check ((select public.utente_super_admin()) or company_id = any ((select public.aziende_area(%L::text[]))::uuid[]))$q$, t, aree, aree);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'tfr_select') then
      execute format($q$create policy tfr_select on public.%I for select to authenticated
        using (company_id = public.get_my_company_id() and not public.utente_e_cliente_esterno())$q$, t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'tfr_insert') then
      execute format($q$create policy tfr_insert on public.%I for insert to authenticated
        with check (company_id = public.get_my_company_id() and not public.utente_e_cliente_esterno())$q$, t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'tfr_update') then
      execute format($q$create policy tfr_update on public.%I for update to authenticated
        using (company_id = public.get_my_company_id() and not public.utente_e_cliente_esterno())
        with check (company_id = public.get_my_company_id() and not public.utente_e_cliente_esterno())$q$, t);
    end if;
  end loop;
end $p$;
