set local lock_timeout='3s';
set local statement_timeout='60s';

-- Read-only technical projection: never return payroll, health, contact data or storage paths.
-- SECURITY DEFINER is needed because Safety access does not grant general HR access.
create or replace function public.sicurezza_dpi_commessa(_company uuid,_ordine uuid,_data date,_fase uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare risultato jsonb;
begin
 if auth.uid() is null or not public.has_permission_for_company(auth.uid(),'can_view_sicurezza_cantiere',_company) then
  raise exception 'Non puoi consultare i DPI di questa azienda' using errcode='42501';
 end if;
 if _data is null then raise exception 'Indica la data di riferimento';end if;
 if not exists(select 1 from public.orders o where o.id=_ordine and o.company_id=_company and o.deleted_at is null) then
  raise exception 'Commessa non disponibile in questa azienda' using errcode='42501';
 end if;
 if _fase is not null and not exists(select 1 from public.order_work_phases f where f.id=_fase and f.order_id=_ordine and f.company_id=_company) then
  raise exception 'La fase non appartiene alla commessa';
 end if;
 with assegnazioni as (
  select e.id employee_id,jsonb_build_object('fonte','commessa','dal',null,'al',null,'fase_id',oe.phase_id) dati
  from public.order_employees oe join public.employees e on e.id=oe.employee_id and e.company_id=_company
  where oe.order_id=_ordine and (_fase is null or oe.phase_id is null or oe.phase_id=_fase)
  union all
  select e.id,jsonb_build_object('fonte','campo','dal',a.data_inizio,'al',a.data_fine_prevista,'fase_id',null)
  from public.order_campo_assignments a join public.employees e on e.user_id=a.user_id and e.company_id=_company
  where a.company_id=_company and a.order_id=_ordine and a.role_type in ('employee','operaio','capocantiere')
   and (a.data_inizio is null or a.data_inizio<=_data) and (a.data_fine_prevista is null or a.data_fine_prevista>=_data)
 ), addetti as (
  select employee_id,jsonb_agg(distinct dati) assegnazioni from assegnazioni group by employee_id
 )
 select jsonb_build_object('data',_data,'fase_id',_fase,'addetti',coalesce((
  select jsonb_agg(jsonb_build_object('id',e.id,'nome',e.first_name,'cognome',e.last_name,'qualifica',e.qualifica,'attivo',e.is_active,'assegnazioni',a.assegnazioni,
   'consegne',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'tipo',d.dpi_type,'marca',d.dpi_brand,'matricola',d.dpi_serial,'consegnato_il',d.consegna_date,'scade_il',d.expiry_date,'stato',d.status,'restituito_il',d.return_date,'modulo_registrato',nullif(trim(d.modulo_consegna_path),'') is not null) order by d.consegna_date desc,d.id)
    from public.employee_dpi_consegne d where d.company_id=_company and d.employee_id=e.id),'[]'::jsonb)) order by e.last_name,e.first_name,e.id)
  from addetti a join public.employees e on e.id=a.employee_id and e.company_id=_company),'[]'::jsonb),
 'campo_senza_dipendente',(select count(distinct a.user_id) from public.order_campo_assignments a
  where a.company_id=_company and a.order_id=_ordine and a.role_type in ('employee','operaio','capocantiere')
   and (a.data_inizio is null or a.data_inizio<=_data) and (a.data_fine_prevista is null or a.data_fine_prevista>=_data)
   and not exists(select 1 from public.employees e where e.user_id=a.user_id and e.company_id=_company))) into risultato;
 return risultato;
end$$;
revoke all on function public.sicurezza_dpi_commessa(uuid,uuid,date,uuid) from public,anon;
grant execute on function public.sicurezza_dpi_commessa(uuid,uuid,date,uuid) to authenticated;
