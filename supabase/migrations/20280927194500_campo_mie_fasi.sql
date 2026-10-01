-- App di cantiere: le fasi della commessa con le date, e quali sono le mie
-- (26/09/2026, richiesta del founder: «chi lavora vede le date»).
--
-- Nella pagina del cantiere l'operaio vedeva le fasi con l'avanzamento, ma non
-- quando si fanno né quali toccano a lui. campo_mie_fasi() le restituisce con
-- le date e con due segni:
--   · tu      → ci sei tu (persona o ditta messa sulla fase);
--   · squadra → il nome della tua squadra, se la fa la tua squadra.
-- La vede chi lavora sulla commessa (accesso nell'app o riga di lavoro) e
-- l'ufficio; agli altri una lista vuota.

create or replace function public.campo_mie_fasi(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
begin
  select company_id into v_company from public.orders where id = p_order_id;
  if v_uid is null or v_company is null then
    return '[]'::jsonb;
  end if;
  if not (
    public.user_assigned_to_order(p_order_id)
    or exists (select 1 from public.order_employees oe
                 join public.employees e on e.id = oe.employee_id
                where oe.order_id = p_order_id and e.user_id = v_uid)
    or public.has_permission_for_company(v_uid, 'can_view_orders', v_company)
  ) then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', f.id,
             'nome', f.name,
             'dal', f.start_date,
             'al', f.end_date,
             'tu', exists (select 1 from public.order_employees oe
                             join public.employees e on e.id = oe.employee_id
                            where oe.phase_id = f.id and e.user_id = v_uid)
                   or exists (select 1 from public.order_external_teams ot
                                join public.external_teams t on t.id = ot.external_team_id
                                left join public.subappaltatori s on s.id = t.subappaltatore_id
                               where ot.phase_id = f.id and v_uid in (t.leader_user_id, s.user_id)),
             'squadra', (select t.name
                           from public.squadre_commesse sc
                           join public.external_teams t on t.id = sc.squadra_id and t.is_active
                           join public.hr_profili h on h.user_id = v_uid and h.company_id = sc.company_id
                          where sc.phase_id = f.id
                            and (h.id = t.responsabile_hr_profilo_id
                                 or exists (select 1 from public.squadre_componenti c
                                             where c.squadra_id = t.id and c.hr_profilo_id = h.id))
                          order by t.name
                          limit 1))
           order by f.position, f.created_at)
      from public.order_work_phases f
     where f.order_id = p_order_id), '[]'::jsonb);
end;
$$;
revoke all on function public.campo_mie_fasi(uuid) from public, anon;
grant execute on function public.campo_mie_fasi(uuid) to authenticated;
