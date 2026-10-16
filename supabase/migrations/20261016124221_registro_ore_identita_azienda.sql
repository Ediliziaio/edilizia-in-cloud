-- Identifica anche le risposte vuote: il client verifica l’azienda prima di mostrarle.
set local lock_timeout='3s';
-- Stessi ruoli/permessi dell'ufficio; nessuna policy RLS o permesso di piano modificato.
-- La lettura diretta legacy dei rapportini non riconosce il superadmin in azienda.
create or replace function public.ufficio_leggi_ore(p_order_id uuid default null,p_da date default null,p_a date default null,p_solo_riepilogo boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c uuid:=public.get_effective_company_id(); assigned uuid; records jsonb; pending integer; costs boolean;
begin
 if auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno() then raise exception 'Sessione non autorizzata.' using errcode='42501';end if;
 perform public.assert_company_access(c);
 if c is null or public.campo_e_ufficio(c) is not true
  or public.has_permission_for_company(auth.uid(),'can_view_orders',c) is not true
  or public.has_permission_for_company(auth.uid(),'can_view_giornale_lavori',c) is not true
  or (p_solo_riepilogo is not true and public.has_permission_for_company(auth.uid(),'can_view_employees',c) is not true) then
  raise exception 'Non hai il permesso di leggere queste ore.' using errcode='42501';end if;
 if p_order_id is not null then
  select assigned_to into assigned from public.orders where id=p_order_id and company_id=c and deleted_at is null;
  if not found or public.check_staff_visibility(auth.uid(),assigned) is not true then raise exception 'Commessa non disponibile in questa azienda.' using errcode='42501';end if;
 end if;
 select count(*) into pending from public.campo_rapportini cr join public.orders o on o.id=cr.order_id
  where cr.company_id=c and o.company_id=c and o.deleted_at is null and (p_order_id is null or cr.order_id=p_order_id)
   and public.check_staff_visibility(auth.uid(),o.assigned_to) is true and cr.stato='inviato';
 if p_solo_riepilogo then return jsonb_build_object('company_id',c,'pending',pending,'records','[]'::jsonb);end if;
 if p_da is null or p_a is null or p_a<p_da or p_a-p_da>366 then raise exception 'Seleziona un periodo valido, massimo un anno.';end if;
 costs:=public.has_permission_for_company(auth.uid(),'can_view_costs',c) is true;
 select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) into records from (
  select cr.id,cr.order_id,cr.user_id,cr.ore_lavorate,cr.ore_straordinario,cr.data_lavoro,cr.stato,cr.updated_at,
   cr.ufficio_employee_id,cr.presenze,cr.costo_registrato_at,cr.note,
   case when costs then cr.presenze_registrate else
    (select coalesce(jsonb_agg(jsonb_build_object('employee_id',p->>'employee_id','ore',p->'ore')),'[]'::jsonb)
     from jsonb_array_elements(case when jsonb_typeof(cr.presenze_registrate)='array' then cr.presenze_registrate else '[]'::jsonb end) p) end as presenze_registrate
  from public.campo_rapportini cr join public.orders o on o.id=cr.order_id
  where cr.company_id=c and o.company_id=c and o.deleted_at is null and (p_order_id is null or cr.order_id=p_order_id)
   and public.check_staff_visibility(auth.uid(),o.assigned_to) is true and cr.stato in ('inviato','approvato')
   and cr.data_lavoro between p_da and p_a order by cr.data_lavoro desc,cr.id limit 1001
 ) r;
 if jsonb_array_length(records)>1000 then raise exception 'Troppi risultati: restringi il periodo o apri la singola commessa.';end if;
 return jsonb_build_object('company_id',c,'pending',pending,'records',records);
end $$;
revoke all on function public.ufficio_leggi_ore(uuid,date,date,boolean) from public,anon;
grant execute on function public.ufficio_leggi_ore(uuid,date,date,boolean) to authenticated;
