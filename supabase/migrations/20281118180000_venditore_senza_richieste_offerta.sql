-- Il venditore senza permessi specifici non vede le richieste d'offerta ai fornitori (03/11/2026):
-- portano i prezzi dei fornitori. Le aprivano Preventivi, Opportunità e Sopralluoghi. Il venditore i
-- preventivi li fa lo stesso: le pagine dei preventivi non leggono queste tabelle.
do $mig$
declare
  v_regola text := '(select public.utente_super_admin()) or company_id = any ((select public.aziende_area(array[''can_view_orders'',''can_edit_orders'',''can_view_warehouse'',''can_manage_suppliers'',''can_manage_purchasing'',''can_validate_bom'',''can_view_costs'',''can_view_subappaltatori'']::text[]))::uuid[])';
  v_tabella text;
begin
  foreach v_tabella in array array['supplier_rfqs', 'supplier_rfq_items', 'supplier_rfq_quotes', 'supplier_rfq_suppliers'] loop
    execute format('alter policy permessi_area on public.%I using (%s) with check (%s)', v_tabella, v_regola, v_regola);
  end loop;
end $mig$;
