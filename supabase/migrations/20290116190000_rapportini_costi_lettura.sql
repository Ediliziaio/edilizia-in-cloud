-- I costi dei rapportini si leggono da qui: con il permesso importi interi, senza solo le ore.
-- Prepara il blocco delle colonne costo_manodopera e presenze_registrate.
create or replace function public.rapportini_costi(p_da date default null, p_a date default null, p_order_id uuid default null, p_employee_id uuid default null)
returns table(id uuid, order_id uuid, data_lavoro date, stato text, costo_manodopera numeric, presenze_registrate jsonb)
language plpgsql stable security definer set search_path to '' as $$
declare
  c uuid := public.get_effective_company_id();
  v_costi boolean;
begin
  if auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno() then
    raise exception 'Sessione non autorizzata.' using errcode = '42501';
  end if;
  perform public.assert_company_access(c);
  if c is null or public.has_permission_for_company(auth.uid(), 'can_view_orders', c) is not true then
    raise exception 'Non hai il permesso di leggere questi rapportini.' using errcode = '42501';
  end if;
  v_costi := public.has_permission_for_company(auth.uid(), 'can_view_costs', c) is true
          or public.has_permission_for_company(auth.uid(), 'can_manage_purchasing', c) is true;
  return query
    select r.id, r.order_id, r.data_lavoro, r.stato,
           case when v_costi then r.costo_manodopera end,
           case when v_costi or jsonb_typeof(r.presenze_registrate) is distinct from 'array' then
                  case when v_costi then r.presenze_registrate end
                else (select coalesce(jsonb_agg(e - 'costo'), '[]'::jsonb) from jsonb_array_elements(r.presenze_registrate) e) end
      from public.campo_rapportini r
      join public.orders o on o.id = r.order_id and o.company_id = c and o.deleted_at is null
     where r.company_id = c
       and (p_da is null or r.data_lavoro >= p_da)
       and (p_a is null or r.data_lavoro <= p_a)
       and (p_order_id is null or r.order_id = p_order_id)
       and (p_employee_id is null or r.presenze_registrate @> jsonb_build_array(jsonb_build_object('employee_id', p_employee_id)))
       and public.check_staff_visibility(auth.uid(), o.assigned_to) is true;
end; $$;
revoke all on function public.rapportini_costi(date, date, uuid, uuid) from public, anon;
grant execute on function public.rapportini_costi(date, date, uuid, uuid) to authenticated;
