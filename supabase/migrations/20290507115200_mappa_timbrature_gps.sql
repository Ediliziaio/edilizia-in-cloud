set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- Espone soltanto le rilevazioni esistenti, con lo scope delle fonti originali.
create or replace function public.mappa_timbrature_gps(p_company uuid,p_giorno date,p_personale boolean)
returns table(
  id uuid,order_id uuid,persona_id uuid,nome text,tipo text,ora timestamptz,fonte text,
  lat double precision,lng double precision,precisione double precision,sede text,esito text
)
language sql stable security invoker set search_path = '' as $$
  with accesso as (
    select public.mappa_calendario_accesso(p_company,'lavori') as ufficio,
           public.mappa_calendario_accesso(p_company,'campo') as campo,
           public.has_permission_for_company(auth.uid(),'can_view_persone',p_company)
             and public.has_permission_for_company(auth.uid(),'can_view_all_team_calendar',p_company)
             and p_personale is false as squadra
  ), campo as (
    select coalesce(t.hr_timbratura_id,t.id) as id,t.order_id,t.user_id as persona_id,
      nullif(btrim(concat_ws(' ',p.first_name,p.last_name)),'') as nome,t.tipo,t.timestamp_evento as ora,t.fonte,
      t.gps_lat::double precision as lat,t.gps_lng::double precision as lng,
      case when t.gps_accuracy >= 0 and t.gps_accuracy < 'Infinity'::double precision
        then t.gps_accuracy::double precision end as precisione,t.sede_id,t.posizione_esito as esito,1 as priorita
    from public.campo_timbrature t cross join accesso a
    left join public.profiles p on p.id=t.user_id and p.company_id=p_company
    where t.company_id=p_company and (a.ufficio or a.campo)
      and (t.user_id=auth.uid() or (a.ufficio and a.squadra and public.check_staff_visibility(auth.uid(),t.user_id)
        and (t.order_id is null or public.mappa_record_visibile(p_company,'cantiere',t.order_id))))
      and t.timestamp_evento >= p_giorno::timestamp at time zone 'Europe/Rome'
      and t.timestamp_evento < (p_giorno+1)::timestamp at time zone 'Europe/Rome'
      and t.gps_lat between -90 and 90 and t.gps_lng between -180 and 180
      and (t.gps_lat <> 0 or t.gps_lng <> 0)
  ), personale as (
    select t.id,t.order_id,coalesce(p.user_id,p.id) as persona_id,
      nullif(btrim(concat_ws(' ',p.nome,p.cognome)),'') as nome,t.tipo,t."timestamp" as ora,t.fonte,
      t.lat::double precision,t.lng::double precision,null::double precision as precisione,t.sede_id,t.posizione_esito as esito,2 as priorita
    from public.hr_timbrature t cross join accesso a
    join public.hr_profili p on p.id=t.profilo_id and p.company_id=p_company
    where t.company_id=p_company and (a.ufficio or a.campo)
      and (p.user_id=auth.uid() or (a.ufficio and a.squadra and public.check_staff_visibility(auth.uid(),p.user_id)
        and (t.order_id is null or public.mappa_record_visibile(p_company,'cantiere',t.order_id))))
      and t."timestamp" >= p_giorno::timestamp at time zone 'Europe/Rome'
      and t."timestamp" < (p_giorno+1)::timestamp at time zone 'Europe/Rome'
      and t.lat between -90 and 90 and t.lng between -180 and 180
      and (t.lat <> 0 or t.lng <> 0)
  ), eventi as (
    select distinct on (e.id) e.*
    from (select * from campo union all select * from personale) e
    where e.tipo in ('entrata','uscita','pausa_inizio','pausa_fine','inizio_pausa','fine_pausa')
    order by e.id,e.priorita,e.ora
  )
  select e.id,e.order_id,e.persona_id,e.nome,e.tipo,e.ora,
    case e.fonte when 'app' then 'App operaio' when 'kiosk' then 'Chiosco' when 'ufficio' then 'Ufficio'
       when 'manuale' then 'Registrazione manuale' else coalesce(e.fonte,'Timbratura') end,
    e.lat,e.lng,e.precisione,s.nome,e.esito
  from eventi e left join public.hr_sedi s on s.id=e.sede_id and s.company_id=p_company
  order by e.ora,e.id
  limit 501
$$;

revoke all on function public.mappa_timbrature_gps(uuid,date,boolean) from public,anon;
grant execute on function public.mappa_timbrature_gps(uuid,date,boolean) to authenticated;
