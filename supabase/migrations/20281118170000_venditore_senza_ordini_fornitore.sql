-- Il venditore non vede gli ordini ai fornitori (decisione del 03/11/2026).
-- Glieli apriva solo il permesso Preventivi: le pagine dei preventivi non li usano, li citano per un
-- import in comune. Stessa regola sulle righe d'ordine, che portano i prezzi: prima bastava non essere
-- in cantiere. Chi ha anche Commesse, Magazzino o un altro permesso dell'elenco continua a vederli.
do $mig$
declare
  v_regola text := '(select public.utente_super_admin()) or company_id = any ((select public.aziende_area(array[''can_view_orders'',''can_edit_orders'',''can_view_warehouse'',''can_edit_warehouse'',''can_manage_suppliers'',''can_manage_purchasing'',''can_validate_bom'',''can_view_costs'',''can_view_billing'',''can_view_financial_reports'',''can_view_scadenzario'',''can_view_tickets'',''can_edit_tickets'',''can_view_dashboard'',''can_view_cruscotto'',''can_view_settings_suppliers'',''can_view_forecast'',''can_view_tesoreria'',''can_view_calendar'',''can_view_subappaltatori'']::text[]))::uuid[])';
  v_tabella text;
begin
  foreach v_tabella in array array['purchase_orders', 'purchase_order_items'] loop
    if exists (select 1 from pg_policy where polrelid = ('public.' || v_tabella)::regclass and polname = 'permessi_area') then
      execute format('alter policy permessi_area on public.%I using (%s) with check (%s)', v_tabella, v_regola, v_regola);
    else
      execute format('create policy permessi_area on public.%I as restrictive for all to authenticated using (%s) with check (%s)', v_tabella, v_regola, v_regola);
    end if;
  end loop;
end $mig$;
