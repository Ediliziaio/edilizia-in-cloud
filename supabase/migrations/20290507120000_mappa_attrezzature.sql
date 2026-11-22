set local lock_timeout = '3s';
set local statement_timeout = '60s';

create index if not exists mezzi_giornate_ubicazioni_idx
  on public.mezzi_giornate(mezzo_id,created_at desc,id) where dove<>'invariato';

-- Ubicazione documentata alla data della mappa. Per ciò che è a bordo il client
-- può accostare l'ultima posizione del mezzo, già filtrata dalla sua RPC.
create or replace function public.mappa_attrezzature_giorno(
  p_company uuid, p_giorno date, p_personale boolean, p_dopo uuid default null
)
returns table (
  id uuid, scheda_id uuid, nome text, posizione jsonb, custode text,
  a_bordo_id uuid, a_bordo_nome text, quantita double precision, unita_misura text
)
language sql stable security definer set search_path = '' as $$
  with accesso as materialized (
    select least(now(), (p_giorno + 1)::timestamp at time zone 'Europe/Rome') as fino,
      p_giorno = (now() at time zone 'Europe/Rome')::date as oggi,
      not coalesce(p_personale,true) and public.has_permission_for_company(auth.uid(),'can_view_all_team_calendar',p_company) as squadra,
      public.has_permission_for_company(auth.uid(),'can_view_persone',p_company) as vede_nomi
    where p_giorno <= (now() at time zone 'Europe/Rome')::date
      and public.mappa_calendario_accesso(p_company,'lavori')
      and public.has_permission_for_company(auth.uid(),'can_view_mezzi',p_company)
  ), deposito as materialized (
    select count(*) as sedi, min(s.nome) as nome,min(s.lat) as lat,min(s.lng) as lng
    from public.hr_sedi s cross join accesso x
    where s.company_id=p_company and s.attiva is true and s.nome ilike '%magazzino%'
      and s.created_at < x.fino
  ), attrezzi as materialized (
    select m.* from public.mezzi m cross join accesso x
    where m.company_id=p_company and (m.tipo='attrezzatura' or m.gestione='quantita')
      and m.created_at<x.fino and (m.deleted_at is null or m.deleted_at>=x.fino)
  ), singoli as (
    select m.id,m.id as scheda_id,m.nome,
      case
        when e.smarrito then jsonb_build_object('nome','Segnalato smarrito','fonte','Segnalazione QR','quando',e.quando)
        when bordo.id is not null then jsonb_build_object('nome','A bordo · ' || bordo.nome,'fonte','Assegnazione al mezzo','quando',a.dal)
        when o.id is not null then jsonb_build_object(
          'nome',coalesce(nullif(btrim(o.description),''),o.order_code,'Cantiere'),
          'fonte','Assegnazione al cantiere','order_id',o.id,'quando',a.dal,
          'lat',coalesce(pin.lat,o.work_lat),'lng',coalesce(pin.lng,o.work_lng))
        when h.id is not null then jsonb_build_object('nome','In carico a una persona','fonte','Assegnazione','quando',a.dal)
        when e.dove='magazzino' and a.dal is null and loc.order_id is null and loc.su_mezzo_id is null and loc.hr_id is null
          and not exists (select 1 from public.mezzi_assegnazioni dopo
            where dopo.company_id=p_company and dopo.mezzo_id=m.id and dopo.dal>e.quando and dopo.dal<x.fino)
          then jsonb_build_object('nome',case when d.sedi=1 then d.nome else 'Magazzino · sede da specificare' end,
            'fonte',e.fonte,'quando',e.quando,'lat',case when d.sedi=1 then d.lat end,'lng',case when d.sedi=1 then d.lng end)
        when loc.order_id is not null then jsonb_build_object('nome','Cantiere riservato','fonte','Assegnazione','quando',a.dal)
      end as posizione,
      case when not coalesce(e.smarrito,false) and (x.vede_nomi or h.user_id=auth.uid())
        then nullif(btrim(concat_ws(' ',h.nome,h.cognome)),'') end as custode,
      case when not coalesce(e.smarrito,false) then bordo.id end as a_bordo_id,
      case when not coalesce(e.smarrito,false) then bordo.nome end as a_bordo_nome,
      null::double precision as quantita,m.unita_misura
    from attrezzi m cross join accesso x cross join deposito d
    left join lateral (
      select a.* from public.mezzi_assegnazioni a
      where a.company_id=p_company and a.mezzo_id=m.id and a.dal<x.fino and (a.al is null or a.al>=x.fino)
      order by a.dal desc,a.id limit 1
    ) a on true
    cross join lateral (
      select case when a.id is not null then a.order_id when x.oggi then m.assegnato_order_id end as order_id,
        case when a.id is not null then a.su_mezzo_id when x.oggi then m.su_mezzo_id end as su_mezzo_id,
        case when a.id is not null then a.hr_profilo_id when x.oggi then m.assegnato_hr_profilo_id end as hr_id
    ) loc
    left join public.mezzi bordo on bordo.id=loc.su_mezzo_id and bordo.company_id=p_company
      and bordo.created_at<x.fino and (bordo.deleted_at is null or bordo.deleted_at>=x.fino)
    left join public.hr_profili h on h.id=loc.hr_id and h.company_id=p_company
    left join public.orders o on o.id=loc.order_id and o.company_id=p_company
      and public.mappa_record_visibile(p_company,'cantiere',o.id)
    left join public.mappa_posizioni pin on pin.company_id=p_company and pin.tipo='cantiere' and pin.record_id=o.id
    left join lateral (
      select ev.dove,ev.quando,ev.fonte,ev.dove='smarrito' and (a.dal is null or ev.quando>a.dal) as smarrito
      from (
        (select s.azione as dove,s.created_at as quando,'Scansione QR'::text as fonte
        from public.mezzi_scansioni s where s.company_id=p_company and s.mezzo_id=m.id and s.created_at<x.fino
          and s.azione in ('magazzino','prendo','cantiere','carico_su','smarrito')
        order by s.created_at desc,s.id limit 1)
        union all
        (select g.dove,g.created_at,'Rapportino'
        from public.mezzi_giornate g where g.company_id=p_company and g.mezzo_id=m.id and g.created_at<x.fino and g.dove<>'invariato'
        order by g.created_at desc,g.id limit 1)
      ) ev order by ev.quando desc,ev.fonte limit 1
    ) e on true
    where m.gestione='singola'
      and (x.squadra or h.user_id=auth.uid() or (o.id is not null and public.campo_lavoro_su_commessa(o.id)))
  ), a_quantita as (
    select a.id,m.id as scheda_id,m.nome,
      jsonb_build_object('nome',coalesce(nullif(btrim(o.description),''),o.order_code,a.luogo,'Cantiere riservato'),
        'fonte','Allocazione registrata','dal',a.dal,'order_id',o.id,'lat',coalesce(pin.lat,o.work_lat),
        'lng',coalesce(pin.lng,o.work_lng)) as posizione,
      null::text as custode,null::uuid as a_bordo_id,null::text as a_bordo_nome,
      a.quantita::double precision,m.unita_misura
    from attrezzi m cross join accesso x
    join public.mezzi_allocazioni a on a.mezzo_id=m.id and a.company_id=p_company and a.created_at<x.fino
      and a.dal<=p_giorno and (a.al is null or a.al>=p_giorno)
    left join public.orders o on o.id=a.order_id and o.company_id=p_company and public.mappa_record_visibile(p_company,'cantiere',o.id)
    left join public.mappa_posizioni pin on pin.company_id=p_company and pin.tipo='cantiere' and pin.record_id=o.id
    where m.gestione='quantita' and (x.squadra or (o.id is not null and public.campo_lavoro_su_commessa(o.id)))
    union all
    select m.id,m.id,m.nome,null,null,null,null,residuo.n,m.unita_misura
    from attrezzi m cross join accesso x cross join lateral (
      select (m.quantita_totale-coalesce(sum(a.quantita),0))::double precision as n from public.mezzi_allocazioni a
      where a.mezzo_id=m.id and a.company_id=p_company and a.created_at<x.fino and a.dal<=p_giorno and (a.al is null or a.al>=p_giorno)
    ) residuo
    where x.squadra and m.gestione='quantita' and (residuo.n is null or residuo.n>0)
  )
  select righe.* from (select * from singoli union all select * from a_quantita) righe
  where p_dopo is null or righe.id>p_dopo
  order by righe.id limit 250
$$;

revoke all on function public.mappa_attrezzature_giorno(uuid,date,boolean,uuid) from public,anon;
grant execute on function public.mappa_attrezzature_giorno(uuid,date,boolean,uuid) to authenticated;
