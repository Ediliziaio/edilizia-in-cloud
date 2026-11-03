-- Correzioni dalla verifica di app di cantiere e ufficio (03/11/2026).
--
-- 1. L'app di cantiere leggeva lo stato dell'ordine da purchase_orders, ora chiusa per chi lavora
--    solo in cantiere: un ordine annullato o in bozza sarebbe sembrato merce in arrivo. Questa
--    funzione dà quantità e stato delle sole commesse che la persona vede, mai prezzi e fornitori.
-- 2. purchase_order_items contiene i prezzi: stessa chiusura di purchase_orders.
-- 3. Alcune pagine d'ufficio leggono queste tabelle con un permesso che mancava negli elenchi.

create or replace function public.campo_righe_ordine_stato(p_order_item_ids uuid[])
returns table (order_item_id uuid, quantity numeric, quantity_received numeric, status text)
language sql stable security definer set search_path = public as $$
  select poi.order_item_id, poi.quantity::numeric, poi.quantity_received::numeric, po.status::text
    from public.purchase_order_items poi
    join public.purchase_orders po on po.id = poi.purchase_order_id
    join public.order_items oi on oi.id = poi.order_item_id
   where poi.order_item_id = any (p_order_item_ids)
     and exists (select 1 from public.orders o where o.id = oi.order_id and o.company_id = public.get_my_company_id())
     and (
       public.puo_vedere_commessa(oi.order_id)
       or exists (select 1 from public.order_campo_assignments a where a.order_id = oi.order_id and a.user_id = auth.uid())
     )
$$;
revoke all on function public.campo_righe_ordine_stato(uuid[]) from public, anon;
grant execute on function public.campo_righe_ordine_stato(uuid[]) to authenticated, service_role;

drop policy if exists permessi_solo_ufficio on public.purchase_order_items;
create policy permessi_solo_ufficio on public.purchase_order_items as restrictive for all to authenticated
  using (not (select public.e_solo_campo()))
  with check (not (select public.e_solo_campo()));

do $mig$
declare
  v_voce record;
begin
  for v_voce in
    select * from (values
      ('purchase_orders', array['can_view_orders','can_edit_orders','can_view_warehouse','can_edit_warehouse','can_manage_suppliers','can_manage_purchasing','can_validate_bom','can_view_costs','can_view_billing','can_view_financial_reports','can_view_scadenzario','can_view_tickets','can_edit_tickets','can_view_dashboard','can_view_cruscotto','can_view_settings_suppliers','can_view_forecast','can_view_tesoreria','can_view_preventivi','can_edit_preventivi','can_view_calendar','can_view_subappaltatori']),
      ('supplier_rfqs', array['can_view_orders','can_edit_orders','can_view_warehouse','can_manage_suppliers','can_manage_purchasing','can_validate_bom','can_view_costs','can_view_preventivi','can_view_marketing_opportunities','can_view_subappaltatori','can_view_sopralluoghi']),
      ('supplier_rfq_items', array['can_view_orders','can_edit_orders','can_view_warehouse','can_manage_suppliers','can_manage_purchasing','can_validate_bom','can_view_costs','can_view_preventivi','can_view_marketing_opportunities','can_view_subappaltatori','can_view_sopralluoghi']),
      ('supplier_rfq_quotes', array['can_view_orders','can_edit_orders','can_view_warehouse','can_manage_suppliers','can_manage_purchasing','can_validate_bom','can_view_costs','can_view_preventivi','can_view_marketing_opportunities','can_view_subappaltatori','can_view_sopralluoghi']),
      ('supplier_rfq_suppliers', array['can_view_orders','can_edit_orders','can_view_warehouse','can_manage_suppliers','can_manage_purchasing','can_validate_bom','can_view_costs','can_view_preventivi','can_view_marketing_opportunities','can_view_subappaltatori','can_view_sopralluoghi']),
      ('whatsapp_messages', array['can_view_marketing_whatsapp','can_view_marketing','can_view_marketing_contacts','can_view_marketing_opportunities','can_view_marketing_activities','can_view_customers','can_view_settings_integrations','can_view_tickets','can_view_manutenzione','can_view_subappaltatori']),
      ('render_sessions', array['can_view_render_ai','can_view_preventivi','can_edit_preventivi','can_view_marketing_opportunities','can_view_marketing','can_view_settings_pricing']),
      ('render_bagno_sessions', array['can_view_render_ai','can_view_preventivi','can_edit_preventivi','can_view_marketing_opportunities','can_view_marketing','can_view_settings_pricing']),
      ('render_stanza_sessions', array['can_view_render_ai','can_view_preventivi','can_edit_preventivi','can_view_marketing_opportunities','can_view_marketing','can_view_settings_pricing']),
      ('render_tetto_sessions', array['can_view_render_ai','can_view_preventivi','can_edit_preventivi','can_view_marketing_opportunities','can_view_marketing','can_view_settings_pricing']),
      ('render_gallery', array['can_view_render_ai','can_view_preventivi','can_edit_preventivi','can_view_marketing_opportunities','can_view_marketing','can_view_settings_pricing'])
    ) as t(tabella, permessi)
  loop
    execute format('drop policy if exists permessi_area on public.%I', v_voce.tabella);
    execute format(
      'create policy permessi_area on public.%I as restrictive for all to authenticated
         using (public.puo_vedere_area(company_id, %L::text[]))
         with check (public.puo_vedere_area(company_id, %L::text[]))',
      v_voce.tabella, v_voce.permessi, v_voce.permessi);
  end loop;
end $mig$;
