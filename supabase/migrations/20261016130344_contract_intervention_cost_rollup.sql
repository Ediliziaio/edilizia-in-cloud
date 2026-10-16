-- Read-only rollup: do not change the additive order ledger used by company
-- reports, nor copy children costs onto the parent. One JSON snapshot avoids
-- pagination truncation and inconsistent reads across interventions.
create function public.contract_cost_snapshot(p_company_id uuid, p_contract_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_result jsonb; v_revenue boolean;
begin
  if auth.uid() is null
    or public.has_permission_for_company(auth.uid(), 'can_view_orders', p_company_id) is not true
    or public.has_permission_for_company(auth.uid(), 'can_view_costs', p_company_id) is not true then
    raise exception 'Non hai il permesso di leggere i costi di questo contratto.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.orders
    where id = p_contract_id and company_id = p_company_id
      and workflow_kind = 'contratto' and deleted_at is null
  ) then
    raise exception 'Contratto non disponibile in questa azienda.' using errcode = '42501';
  end if;
  v_revenue := public.has_permission_for_company(auth.uid(), 'can_view_order_amounts', p_company_id) is true
    and public.has_permission_for_company(auth.uid(), 'can_view_margins', p_company_id) is true;
  select jsonb_build_object(
    'company_id', p_company_id, 'contract_id', p_contract_id,
    'calculated_at', statement_timestamp(),
    'lines', coalesce(jsonb_agg(jsonb_build_object(
      'id', o.id, 'order_code', o.order_code, 'description', o.description,
      'intervention_reference', o.intervention_reference,
      'is_contract', o.id = p_contract_id,
      'economics', case when e.id is null then null else jsonb_build_object(
        'preventivo_totale', case when v_revenue and o.id = p_contract_id then e.preventivo_totale else null end,
        'consuntivo', e.consuntivo,
        'costo_acquisti', e.costo_acquisti,
        'costo_materiali_magazzino', e.costo_materiali_magazzino,
        'movimenti_magazzino_senza_costo', e.movimenti_magazzino_senza_costo,
        'costo_manodopera', e.costo_manodopera,
        'costo_provvigioni', e.costo_provvigioni,
        'costo_rimborsi_km', e.costo_rimborsi_km,
        'numero_rimborsi_km_da_approvare', e.numero_rimborsi_km_da_approvare,
        'costo_errori', e.costo_errori, 'costo_diretto', e.costo_diretto
      ) end
    ) order by (o.id = p_contract_id) desc, o.created_at, o.id), '[]'::jsonb)
  ) into v_result
  from public.orders o
  left join public.v_ordine_marginalita e on e.id = o.id and e.company_id = p_company_id
  where o.company_id = p_company_id and o.deleted_at is null
    and (o.id = p_contract_id or (o.parent_contract_id = p_contract_id and o.workflow_kind = 'intervento'));
  return v_result;
end;
$$;
revoke all on function public.contract_cost_snapshot(uuid, uuid) from public, anon;
grant execute on function public.contract_cost_snapshot(uuid, uuid) to authenticated;
comment on function public.contract_cost_snapshot(uuid, uuid) is
  'Non-additive contract cost presentation. Caller RLS and cost permission apply. Never writes cost entries; company reports continue to sum original order costs once.';
