set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.mappa_mezzi_giorno(
  p_company uuid, p_giorno date, p_personale boolean, p_dopo uuid default null
)
returns table (
  id uuid, nome text, targa text, tipo text, stradale boolean, unita text,
  posizione jsonb, destinazione jsonb, destinazioni integer,
  metri_registrati double precision, metri_stimati double precision,
  fonti_registrate text[], contaore double precision, contaore_aggiornato timestamptz
)
language sql stable security definer set search_path = '' as $$
  with limiti as materialized (
    select p_giorno::timestamp at time zone 'Europe/Rome' as dal,
      (p_giorno+1)::timestamp at time zone 'Europe/Rome' as al,
      least(now(), (p_giorno+1)::timestamp at time zone 'Europe/Rome') as fino,
      p_giorno <= (now() at time zone 'Europe/Rome')::date as documentabile,
      not coalesce(p_personale,true) and public.has_permission_for_company(auth.uid(),'can_view_all_team_calendar',p_company) as squadra
    where p_giorno is not null and public.mappa_calendario_accesso(p_company,'lavori')
      and public.has_permission_for_company(auth.uid(),'can_view_mezzi',p_company)
  ), parco as materialized (
    select m.id,m.nome,m.targa,m.tipo,m.contatore_unita,m.contatore,m.contatore_aggiornato_il,m.assegnato_order_id,m.assegnato_hr_profilo_id,
      m.contatore_unita='km' and m.tipo in ('furgone','autovettura','autocarro','altro') as stradale
    from public.mezzi m cross join limiti l
    where m.company_id=p_company and m.gestione='singola' and m.tipo <> 'attrezzatura'
      and m.created_at < l.al and (m.deleted_at is null or m.deleted_at >= l.dal)
      and (p_dopo is null or m.id > p_dopo)
      and (l.squadra or exists (
        select 1 from public.mezzi_assegnazioni a join public.hr_profili h on h.id=a.hr_profilo_id and h.company_id=p_company
        where a.mezzo_id=m.id and a.company_id=p_company and h.user_id=auth.uid()
          and a.dal < l.fino and (a.al is null or a.al >= l.fino)
      ) or exists (
        select 1 from public.mezzi_viaggi v where v.mezzo_id=m.id and v.company_id=p_company and v.created_by=auth.uid()
          and v.partenza>=l.dal and v.partenza<l.al and v.stato in ('inviato','verificato')
      ) or exists (
        select 1 from public.mezzi_piani_cantiere p join public.hr_profili h on h.id=p.responsabile_hr_id and h.company_id=p_company
        where p.mezzo_id=m.id and p.company_id=p_company and h.user_id=auth.uid()
          and not p.annullato and p.dal<=p_giorno and (p.al is null or p.al>=p_giorno)
          and (p.rientrato_il is null or p.rientrato_il>=l.fino)
      ))
    order by m.id limit 250
  ), registrati as materialized (
    select k.* from limiti l cross join lateral public.mappa_km_effettivi(p_company,p_giorno,not l.squadra) k
  ), percorrenze as (
    select v.mezzo_id, sum(k.metri) as registrati, sum(s.metri) as stimati,
      array_agg(distinct k.fonte order by k.fonte) filter (where k.id is not null) as fonti
    from parco m cross join limiti l
    join public.mezzi_viaggi v on v.company_id=p_company and v.partenza>=l.dal and v.partenza<l.al
    left join registrati k on k.id=v.id
    left join lateral (
      select sum(case when jsonb_typeof(t->'km')='number' then (t->>'km')::numeric end)*1000 as metri
      from jsonb_array_elements(v.tratte) t
      having bool_and(coalesce(case when jsonb_typeof(t->'km')='number' then (t->>'km')::numeric>=0 end,false))
        and bool_or(t->>'fonte'='stimati')
    ) s on k.id is null
    where m.stradale and v.mezzo_id=m.id and v.stato in ('inviato','verificato') and (l.squadra or v.created_by=auth.uid())
    group by v.mezzo_id
  )
  select m.id,m.nome,m.targa,m.tipo,m.stradale,m.contatore_unita,
    case
      when viaggio.arrivo is not null and (assegnazione.dal is null or viaggio.arrivo>=assegnazione.dal) then
        jsonb_build_object('nome',case when viaggio.id_commessa is not null and arrivo.id is null then 'Località riservata' else viaggio.nome end,
          'fonte','Ultimo arrivo registrato','quando',viaggio.arrivo,'order_id',case when coincide.punto then arrivo.id end,
          'lat',case when coincide.punto then coalesce(pin_arrivo.lat,arrivo.work_lat) when viaggio.sede then sede.operational_lat end,
          'lng',case when coincide.punto then coalesce(pin_arrivo.lng,arrivo.work_lng) when viaggio.sede then sede.operational_lng end)
      when assegnato.id is not null then
        jsonb_build_object('nome',coalesce(nullif(btrim(assegnato.description),''),assegnato.order_code,'Cantiere'),
          'fonte','Assegnazione al cantiere','quando',assegnazione.dal,'order_id',assegnato.id,
          'lat',coalesce(pin_assegnato.lat,assegnato.work_lat),'lng',coalesce(pin_assegnato.lng,assegnato.work_lng))
    end,
    case when piano.totale=1 then jsonb_build_object('nome',piano.nome,'fonte','Piano mezzi','dal',piano.dal,
      'order_id',piano.id,'lat',piano.lat,'lng',piano.lng) end,
    coalesce(piano.totale,0)::integer,
    percorrenze.registrati,percorrenze.stimati,coalesce(percorrenze.fonti,array[]::text[]),
    case when m.contatore_unita='ore' and m.contatore_aggiornato_il<l.fino and l.documentabile then m.contatore::double precision end,
    case when m.contatore_unita='ore' and m.contatore_aggiornato_il<l.fino and l.documentabile then m.contatore_aggiornato_il end
  from parco m cross join limiti l
  left join percorrenze on percorrenze.mezzo_id=m.id
  left join public.companies sede on sede.id=p_company
  left join lateral (
    select a.order_id,a.dal from public.mezzi_assegnazioni a
    where l.documentabile and a.company_id=p_company and a.mezzo_id=m.id
      and a.dal<l.fino and (a.al is null or a.al>=l.fino)
      and (l.squadra or exists (select 1 from public.hr_profili h
        where h.id=a.hr_profilo_id and h.company_id=p_company and h.user_id=auth.uid()))
    order by a.dal desc,a.id limit 1
  ) assegnazione on true
  left join public.orders assegnato on assegnato.company_id=p_company
    and assegnato.id=coalesce(assegnazione.order_id,case
      when p_giorno=(now() at time zone 'Europe/Rome')::date and assegnazione.dal is null
        and not exists(select 1 from public.mezzi_assegnazioni a where a.mezzo_id=m.id and a.company_id=p_company)
        and (l.squadra or exists (select 1 from public.hr_profili h
          where h.id=m.assegnato_hr_profilo_id and h.company_id=p_company and h.user_id=auth.uid()))
      then m.assegnato_order_id end)
    and public.mappa_record_visibile(p_company,'cantiere',assegnato.id)
  left join public.mappa_posizioni pin_assegnato on pin_assegnato.company_id=p_company and pin_assegnato.tipo='cantiere' and pin_assegnato.record_id=assegnato.id
  left join lateral (
    select v.arrivo,btrim(v.tratte->(-1)->>'a') as nome,v.tratte->(-1)->>'order_id' as id_commessa,
      lower(btrim(v.tratte->(-1)->>'a')) in ('sede','sede operativa') and (v.tratte->(-1)->>'order_id') is null as sede
    from public.mezzi_viaggi v
    where m.stradale and l.documentabile and v.company_id=p_company and v.mezzo_id=m.id
      and v.partenza<l.fino and v.arrivo<=l.fino and v.stato in ('inviato','verificato')
      and (l.squadra or v.created_by=auth.uid()) and nullif(btrim(v.tratte->(-1)->>'a'),'') is not null
    order by v.arrivo desc,v.id limit 1
  ) viaggio on true
  left join public.orders arrivo on arrivo.company_id=p_company
    and arrivo.id=case when viaggio.id_commessa ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then viaggio.id_commessa::uuid end
    and public.mappa_record_visibile(p_company,'cantiere',arrivo.id)
  cross join lateral (
    select arrivo.id is not null and lower(viaggio.nome) in (
      lower(btrim(arrivo.indirizzo_lavori)),lower(btrim(arrivo.work_address)),
      lower(btrim(concat_ws(' · ',arrivo.order_code,coalesce(arrivo.work_address,arrivo.indirizzo_lavori))))
    ) as punto
  ) coincide
  left join public.mappa_posizioni pin_arrivo on pin_arrivo.company_id=p_company and pin_arrivo.tipo='cantiere' and pin_arrivo.record_id=arrivo.id
  left join lateral (
    select dest.*,count(*) over() as totale from (
      select distinct on (o.id) o.id,p.dal,coalesce(nullif(btrim(o.description),''),o.order_code,'Cantiere') nome,
        coalesce(pos.lat,o.work_lat) lat,coalesce(pos.lng,o.work_lng) lng
      from public.mezzi_piani_cantiere p
      join public.orders o on o.id=p.order_id and o.company_id=p_company and public.mappa_record_visibile(p_company,'cantiere',o.id)
      left join public.mappa_posizioni pos on pos.company_id=p_company and pos.tipo='cantiere' and pos.record_id=o.id
      where p.company_id=p_company and p.mezzo_id=m.id and not p.annullato
        and p.dal<=p_giorno and (p.al is null or p.al>=p_giorno)
        and (p.rientrato_il is null or p.rientrato_il>=l.fino)
        and (l.squadra or exists (select 1 from public.hr_profili h
          where h.id=p.responsabile_hr_id and h.company_id=p_company and h.user_id=auth.uid()))
      order by o.id,p.dal,p.id
    ) dest order by dest.dal,dest.id limit 1
  ) piano on true
  order by m.id
$$;

revoke all on function public.mappa_mezzi_giorno(uuid,date,boolean,uuid) from public,anon;
grant execute on function public.mappa_mezzi_giorno(uuid,date,boolean,uuid) to authenticated;
