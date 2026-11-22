set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.mappa_storico_cantieri(
  p_company uuid, p_anno integer, p_personale boolean, p_dopo uuid default null
)
returns table(
  id uuid, titolo text, codice text, indirizzo text,
  lat double precision, lng double precision, data date, chiusura_registrata boolean
)
language sql stable security invoker set search_path = '' as $$
  with criteri as materialized (
    select
      case when p_anno between 1900 and 2100 then pg_catalog.make_date(p_anno,1,1) end as dal,
      case when p_anno between 1900 and 2100 then pg_catalog.make_date(p_anno+1,1,1) end as al,
      (not coalesce(p_personale,true) and public.has_permission_for_company(
        auth.uid(),'can_view_all_team_calendar',p_company)) as squadra,
      (select s.id from public.order_statuses s
        where s.company_id=p_company and not coalesce(s.is_support_phase,false)
        order by s.position desc nulls last, s.id
        limit 1) as finale
    where public.mappa_calendario_accesso(p_company,'lavori')
      and (p_anno is null or p_anno between 1900 and 2100)
  ),
  candidati as (
    select o.*, c.dal, c.al, c.finale
    from criteri c
    join public.orders o on o.company_id=p_company
    left join public.order_statuses s on s.id=o.current_status_id and s.company_id=p_company
    where o.deleted_at is null and o.workflow_kind <> 'generale'
      and (p_dopo is null or o.id > p_dopo)
      and coalesce(o.status,'') not in ('annullato','annullata','cancelled','canceled','cancellato','cancellata')
      and case when s.id is not null then s.id=c.finale
        else o.fulfillment_status='completed' or o.status='completato' end
      and (c.squadra or o.assigned_to=auth.uid() or o.capomastro_user_id=auth.uid()
        or exists (select 1 from public.order_campo_assignments a
          where a.company_id=p_company and a.order_id=o.id and a.user_id=auth.uid()))
      and ((p_anno is null and o.work_end_date is null)
        or (o.work_end_date >= c.dal and o.work_end_date < c.al)
        or exists (select 1 from public.order_status_history h
          where h.order_id=o.id and h.status_id=c.finale
            and h.changed_at >= (c.dal::timestamp at time zone 'Europe/Rome')
            and h.changed_at < (c.al::timestamp at time zone 'Europe/Rome')))
  ),
  pagina as (
    select o.*, coalesce((h.changed_at at time zone 'Europe/Rome')::date, o.work_end_date) as data_effettiva,
      h.changed_at is not null as registrata
    from candidati o
    left join lateral (
      select h.changed_at from public.order_status_history h
      where h.order_id=o.id and h.status_id=o.finale
      order by h.changed_at desc, h.id
      limit 1
    ) h on true
    where case when p_anno is null then h.changed_at is null
      else coalesce((h.changed_at at time zone 'Europe/Rome')::date, o.work_end_date) >= o.dal
       and coalesce((h.changed_at at time zone 'Europe/Rome')::date, o.work_end_date) < o.al end
    order by o.id
    limit 250
  )
  select o.id, coalesce(nullif(btrim(o.description),''),nullif(btrim(o.order_code),''),'Commessa senza nome'),
    o.order_code, coalesce(nullif(btrim(o.indirizzo_lavori),''),nullif(btrim(o.work_address),''),''),
    coalesce(p.lat,o.work_lat),coalesce(p.lng,o.work_lng),o.data_effettiva,o.registrata
  from pagina o
  left join public.mappa_posizioni p on p.company_id=p_company and p.tipo='cantiere' and p.record_id=o.id
  order by o.id
$$;

revoke all on function public.mappa_storico_cantieri(uuid,integer,boolean,uuid) from public,anon;
grant execute on function public.mappa_storico_cantieri(uuid,integer,boolean,uuid) to authenticated;
