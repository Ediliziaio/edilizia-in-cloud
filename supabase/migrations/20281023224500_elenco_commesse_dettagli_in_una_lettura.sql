-- L'elenco commesse: i dettagli della pagina in una lettura sola (23/10/2026).
--
-- Dopo ogni pagina dell'elenco partivano cinque richieste sulle commesse
-- mostrate (materiali, personale, squadre esterne, venditori, poi i
-- fornitori), ognuna a ripreparare le regole di accesso della sua tabella.
-- Ora una: stesse tabelle, stesse colonne, con i permessi di chi guarda
-- (SECURITY INVOKER) e il piano preparato una volta per connessione, come
-- scheda_cliente.

create or replace function public.elenco_commesse_dettagli(p_order_ids uuid[])
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
set plan_cache_mode = force_generic_plan
as $$
declare
  v_materiali jsonb;
begin
  if p_order_ids is null or cardinality(p_order_ids) = 0 then
    return jsonb_build_object('materiali', '[]'::jsonb, 'personale', '[]'::jsonb, 'squadre', '[]'::jsonb,
                              'venditori', '[]'::jsonb, 'fornitori', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'order_id', i.order_id, 'purchase_price', i.purchase_price, 'quantity', i.quantity,
           'vat_rate', i.vat_rate, 'supplier_id', i.supplier_id)), '[]'::jsonb)
    into v_materiali
    from public.order_items i
   where i.order_id = any (p_order_ids);

  return jsonb_build_object(
    'materiali', v_materiali,
    'personale', coalesce((
      select jsonb_agg(jsonb_build_object(
               'order_id', oe.order_id, 'total_cost', oe.total_cost, 'employee_id', oe.employee_id,
               'employee', case when e.id is null then null else jsonb_build_object('id', e.id, 'first_name', e.first_name, 'last_name', e.last_name) end))
        from public.order_employees oe
        left join public.employees e on e.id = oe.employee_id
       where oe.order_id = any (p_order_ids)), '[]'::jsonb),
    'squadre', coalesce((
      select jsonb_agg(jsonb_build_object(
               'order_id', ot.order_id, 'total_cost', ot.total_cost, 'vat_rate', ot.vat_rate,
               'external_team_id', ot.external_team_id,
               'external_team', case when t.id is null then null else jsonb_build_object('id', t.id, 'name', t.name) end))
        from public.order_external_teams ot
        left join public.external_teams t on t.id = ot.external_team_id
       where ot.order_id = any (p_order_ids)), '[]'::jsonb),
    'venditori', coalesce((
      select jsonb_agg(jsonb_build_object(
               'order_id', os.order_id, 'commission_amount', os.commission_amount,
               'deduction_amount', os.deduction_amount, 'salesperson_id', os.salesperson_id,
               'salesperson', case when s.id is null then null else jsonb_build_object('id', s.id, 'first_name', s.first_name, 'last_name', s.last_name) end))
        from public.order_salespeople os
        left join public.salespeople s on s.id = os.salesperson_id
       where os.order_id = any (p_order_ids)), '[]'::jsonb),
    'fornitori', coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name))
        from public.suppliers f
       where f.id in (select (m ->> 'supplier_id')::uuid from jsonb_array_elements(v_materiali) m
                       where m ->> 'supplier_id' is not null)), '[]'::jsonb)
  );
end
$$;

revoke all on function public.elenco_commesse_dettagli(uuid[]) from public, anon;
grant execute on function public.elenco_commesse_dettagli(uuid[]) to authenticated;
