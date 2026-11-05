-- Chi poteva aggiungere persone e ditte a una fase non poteva toglierle: le policy lasciano il DELETE ai soli
-- amministratori, zero righe e nessun errore, il «togli» sembrava riuscito e non succedeva niente.
-- Ora toglie chi modifica le commesse e vede quella commessa. Chi ha già ore, costi o un preventivo lo toglie solo
-- un amministratore: sono dati che pesano sul margine, e un costo collegato alla ditta resterebbe senza riferimento.
-- Le policy non cambiano: si passa solo da qui. Idempotente.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.togli_assegnazione(p_source text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
  v_order_id uuid;
  v_ha_costi boolean;
begin
  if p_source = 'employee' then
    select order_id, coalesce(total_cost, 0) > 0 or coalesce(hours_worked, 0) > 0 or coalesce(cost_preventivo, 0) > 0
      into v_order_id, v_ha_costi
      from public.order_employees where id = p_id;
  elsif p_source = 'team' then
    select t.order_id, coalesce(t.total_cost, 0) > 0 or coalesce(t.cost_preventivo, 0) > 0
             or exists (select 1 from public.company_costs c where c.order_external_team_id = t.id)
      into v_order_id, v_ha_costi
      from public.order_external_teams t where t.id = p_id;
  else
    raise exception using errcode = '22023', message = 'Assegnazione non valida.';
  end if;
  select * into v_order from public.orders where id = v_order_id and deleted_at is null;
  if v_uid is null or v_order.id is null or public.utente_bloccato() or public.utente_e_cliente_esterno()
     or not public.can_see_order(v_order.id, v_order.assigned_to, v_order.destination_warehouse_id)
     or not public.has_permission_for_company(v_uid, 'can_edit_orders', v_order.company_id) then
    raise exception using errcode = '42501', message = 'Non puoi modificare chi lavora su questa commessa.';
  end if;
  if v_ha_costi and not (public.has_role(v_uid, 'super_admin'::public.app_role) or public.e_amministratore_di(v_order.company_id)) then
    raise exception using errcode = '42501', message = 'Ha già ore o costi registrati: può toglierla solo un amministratore.';
  end if;
  if p_source = 'employee' then
    delete from public.order_employees where id = p_id;
  else
    delete from public.order_external_teams where id = p_id;
  end if;
end;
$$;

revoke all on function public.togli_assegnazione(text, uuid) from public, anon;
grant execute on function public.togli_assegnazione(text, uuid) to authenticated, service_role;
