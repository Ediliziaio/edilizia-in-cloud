set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.mezzi_storico_percorsi(
  p_company uuid, p_mezzo uuid, p_dal date, p_al date, p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_company is distinct from public.get_effective_company_id()
    or public.utente_bloccato() or public.chiamante_anonimo() or public.utente_e_cliente_esterno()
    or public.has_permission_for_company(auth.uid(),'can_view_mezzi',p_company) is not true then
    raise insufficient_privilege using message='Storico mezzi non accessibile';
  end if;
  if not exists (select 1 from public.mezzi m where m.id=p_mezzo and m.company_id=p_company
    and m.deleted_at is null and m.contatore_unita='km' and m.tipo in ('autovettura','furgone','autocarro','altro')) then
    raise insufficient_privilege using message='Mezzo non disponibile';
  end if;
  if p_dal is null or p_al is null or not isfinite(p_dal) or not isfinite(p_al)
    or p_al<p_dal or p_al-p_dal>365 or p_offset is null or p_offset not between 0 and 100000 then
    raise invalid_parameter_value using message='Scegli un periodo valido, al massimo 366 giorni';
  end if;

  return (with viaggi as materialized (
    select v.id,v.partenza,v.arrivo,v.tratte,v.stato,
      case when v.contatore_fine>=v.contatore_inizio then 'contatore'
           when calcolo.complete then case when calcolo.stime then 'stimati' else 'dichiarati' end end fonte,
      case when v.contatore_fine>=v.contatore_inizio then v.contatore_fine-v.contatore_inizio
           when calcolo.complete then calcolo.km end km
    from public.mezzi_viaggi v
    cross join lateral (
      select bool_and(coalesce(jsonb_typeof(t->'km')='number'
        and (case when jsonb_typeof(t->'km')='number' then (t->>'km')::numeric end)>=0,false)) complete,
        bool_or(t->>'fonte'='stimati') stime,
        sum(case when jsonb_typeof(t->'km')='number' then (t->>'km')::numeric end) km
      from jsonb_array_elements(v.tratte) t
    ) calcolo
    where v.company_id=p_company and v.mezzo_id=p_mezzo and v.stato in ('inviato','verificato')
      and v.partenza >= (p_dal::timestamp at time zone 'Europe/Rome')
      and v.partenza < ((p_al+1)::timestamp at time zone 'Europe/Rome')
  ), totali as (
    select count(*) viaggi, count(*) filter (where fonte is null) senza_km,
      sum(km) filter (where fonte in ('contatore','dichiarati')) registrati,
      sum(km) filter (where fonte='stimati') stimati from viaggi
  ), pagina as materialized (
    select * from viaggi order by partenza desc,id limit 20 offset p_offset
  ), tratte as (
    select v.id viaggio,t.ord,t.valore,
      case when t.valore->>'order_id' ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
        then (t.valore->>'order_id')::uuid end ordine
    from pagina v cross join lateral jsonb_array_elements(v.tratte) with ordinality t(valore,ord)
  ), ordini_delle_tappe as materialized (
    select o.id,o.order_code,o.work_address,o.indirizzo_lavori,
      coalesce(pin.lat,o.work_lat) lat,coalesce(pin.lng,o.work_lng) lng
    from public.orders o
    left join public.mappa_posizioni pin on pin.company_id=p_company and pin.tipo='cantiere' and pin.record_id=o.id
    where o.company_id=p_company and o.deleted_at is null
      and public.has_permission_for_company(auth.uid(),'can_view_orders',p_company)
      and (o.id in (select ordine from tratte)
        or o.order_code in (select split_part(valore->>'da',' · ',1) from tratte
                            union select split_part(valore->>'a',' · ',1) from tratte))
      and public.ufficio_vede_commessa(o.id)
      and coalesce(pin.lat,o.work_lat) between -85 and 85
      and coalesce(pin.lng,o.work_lng) between -180 and 180
  ), punti as (
    select t.viaggio,t.ord,lato.campo,
      case when lower(btrim(lato.nome)) in ('sede','sede operativa')
        then jsonb_build_object('lat',s.operational_lat,'lng',s.operational_lng,'fonte','Sede operativa configurata')
        else localita.punto end punto
    from tratte t
    join public.companies s on s.id=p_company
    cross join lateral (values ('da',t.valore->>'da'),('a',t.valore->>'a')) lato(campo,nome)
    left join lateral (
      select case when count(*)=1 then (array_agg(punto))[1] end punto from (
        select distinct jsonb_build_object('lat',o.lat,'lng',o.lng,'fonte','Posizione del cantiere') punto
        from ordini_delle_tappe o
        where (o.order_code=split_part(lato.nome,' · ',1) or exists (
            select 1 from tratte collegata where collegata.viaggio=t.viaggio and collegata.ordine=o.id))
          and lower(btrim(lato.nome)) in (
            lower(btrim(o.work_address)),lower(btrim(o.indirizzo_lavori)),
            lower(btrim(concat_ws(' · ',o.order_code,coalesce(o.work_address,o.indirizzo_lavori)))))
      ) esatte
    ) localita on lower(btrim(lato.nome)) not in ('sede','sede operativa')
  ), righe as (
    select t.viaggio,jsonb_agg(jsonb_build_object('da',t.valore->>'da','a',t.valore->>'a',
      'partenza',po.punto,'arrivo',pd.punto) order by t.ord) tratte
    from tratte t
    join punti po on po.viaggio=t.viaggio and po.ord=t.ord and po.campo='da'
    join punti pd on pd.viaggio=t.viaggio and pd.ord=t.ord and pd.campo='a'
    group by t.viaggio
  )
  select jsonb_build_object('totali',to_jsonb(totali),'items',coalesce((
    select jsonb_agg(jsonb_build_object('id',v.id,'partenza',v.partenza,'arrivo',v.arrivo,'stato',v.stato,
      'fonte',v.fonte,'km',v.km,'tratte',coalesce(r.tratte,'[]'::jsonb)) order by v.partenza desc,v.id)
    from pagina v left join righe r on r.viaggio=v.id
  ),'[]'::jsonb)) from totali);
end
$$;

revoke all on function public.mezzi_storico_percorsi(uuid,uuid,date,date,integer) from public,anon;
grant execute on function public.mezzi_storico_percorsi(uuid,uuid,date,date,integer) to authenticated;
