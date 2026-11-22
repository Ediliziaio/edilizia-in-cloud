set local lock_timeout = '3s';
set local statement_timeout = '60s';

create table if not exists private.carburante_zone_mimit (
  zona text primary key,
  nome text not null
);
insert into private.carburante_zone_mimit values
  ('abruzzo','Abruzzo'),('basilicata','Basilicata'),('bolzano','Bolzano'),('calabria','Calabria'),('campania','Campania'),
  ('emilia-romagna','Emilia-Romagna'),('friuli-venezia-giulia','Friuli-Venezia Giulia'),('lazio','Lazio'),('liguria','Liguria'),
  ('lombardia','Lombardia'),('marche','Marche'),('molise','Molise'),('piemonte','Piemonte'),('puglia','Puglia'),('sardegna','Sardegna'),
  ('sicilia','Sicilia'),('toscana','Toscana'),('trento','Trento'),('umbria','Umbria'),('valle-d-aosta','Valle d''Aosta'),('veneto','Veneto')
on conflict (zona) do nothing;

create table if not exists private.carburante_rilevazioni_mimit (
  giorno date not null check (isfinite(giorno)),
  zona text not null references private.carburante_zone_mimit(zona),
  tipo text not null check (tipo in ('gasolio','benzina')),
  euro_litro_lordo numeric(7,4) not null check (euro_litro_lordo > 0 and euro_litro_lordo <= 20),
  acquisito_il timestamptz not null default now(),
  primary key (giorno,zona,tipo)
);
create table if not exists private.carburante_riferimenti_azienda (
  company_id uuid not null references public.companies(id) on delete cascade,
  dal date not null check (isfinite(dal)),
  zona text references private.carburante_zone_mimit(zona),
  preferisci_mimit boolean not null,
  aggiornato_da uuid not null,
  aggiornato_il timestamptz not null default now(),
  primary key (company_id,dal)
);
alter table private.carburante_zone_mimit enable row level security;
alter table private.carburante_rilevazioni_mimit enable row level security;
alter table private.carburante_riferimenti_azienda enable row level security;
revoke all on private.carburante_zone_mimit,private.carburante_rilevazioni_mimit,private.carburante_riferimenti_azienda
  from public,anon,authenticated,service_role;

create or replace function public.carburante_mimit_importa(p_giorno date,p_territori jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare inseriti integer;
begin
  if p_giorno is null or not isfinite(p_giorno) or p_giorno>(now() at time zone 'Europe/Rome')::date
    or jsonb_typeof(p_territori) is distinct from 'array' then
    raise invalid_parameter_value using message='Rilevazione MIMIT non valida';
  end if;
  if jsonb_array_length(p_territori) not between 1 and 21 then
    raise invalid_parameter_value using message='Numero di territori MIMIT non valido';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_territori) t
    where jsonb_typeof(t->'prezzi') is distinct from 'object'
      or not exists(select 1 from private.carburante_zone_mimit z where z.zona=t->>'chiave')
  ) then raise invalid_parameter_value using message='Territorio o prezzi MIMIT non validi'; end if;

  insert into private.carburante_rilevazioni_mimit(giorno,zona,tipo,euro_litro_lordo)
    select p_giorno, t->>'chiave', p.key, (p.value#>>'{}')::numeric
    from jsonb_array_elements(p_territori) t cross join lateral jsonb_each(t->'prezzi') p
    where p.key in ('gasolio','benzina') and jsonb_typeof(p.value)='number'
  on conflict (giorno,zona,tipo) do update set euro_litro_lordo=excluded.euro_litro_lordo,acquisito_il=now()
    where carburante_rilevazioni_mimit.euro_litro_lordo is distinct from excluded.euro_litro_lordo;
  get diagnostics inseriti = row_count;
  if not exists(select 1 from private.carburante_rilevazioni_mimit where giorno=p_giorno) then
    raise invalid_parameter_value using message='Rilevazione MIMIT senza prezzi utilizzabili';
  end if;
  return inseriti;
end
$$;
revoke all on function public.carburante_mimit_importa(date,jsonb) from public,anon,authenticated;
grant execute on function public.carburante_mimit_importa(date,jsonb) to service_role;

create or replace function public.carburante_mimit_giorno(p_giorno date)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when auth.uid() is not null and not public.chiamante_anonimo() and not public.utente_bloccato() then (
    select case when count(*)>0 then jsonb_build_object('giorno',p_giorno,'territori',
      jsonb_agg(jsonb_build_object('chiave',r.zona,'nome',r.nome,'prezzi',r.prezzi) order by r.nome))
    else null end
    from (
      select a.zona,z.nome,jsonb_object_agg(a.tipo,a.euro_litro_lordo) prezzi
      from private.carburante_rilevazioni_mimit a join private.carburante_zone_mimit z using(zona)
      where a.giorno=p_giorno group by a.zona,z.nome
    ) r) end
$$;
revoke all on function public.carburante_mimit_giorno(date) from public,anon;
grant execute on function public.carburante_mimit_giorno(date) to authenticated;

create or replace function private.carburante_zona_azienda(p_company uuid,p_giorno date)
returns table(zona text, zona_impostata text, preferisci_mimit boolean)
language sql stable set search_path = '' as $$
  select coalesce(r.zona,z.zona),r.zona,coalesce(r.preferisci_mimit,false)
  from public.companies c
  left join public.it_province operativa on operativa.sigla=upper(btrim(c.operational_province))
  left join public.it_province legale on legale.sigla=upper(btrim(c.legal_province))
  left join private.carburante_zone_mimit z on z.zona=case coalesce(operativa.sigla,legale.sigla)
    when 'BZ' then 'bolzano' when 'TN' then 'trento'
    else regexp_replace(lower(coalesce(operativa.regione,legale.regione,c.region)),'[^a-z0-9]+','-','g') end
  left join lateral (select x.zona,x.preferisci_mimit from private.carburante_riferimenti_azienda x
    where x.company_id=c.id and x.dal<=p_giorno order by x.dal desc limit 1) r on true
  where c.id=p_company
$$;

create or replace function private.carburante_prezzo_stimato(p_company uuid,p_giorno date,p_tipo text)
returns table(euro_litro numeric,fonte text,zona text,euro_litro_lordo numeric)
language sql stable set search_path = '' as $$
  select case when scelta.usa_mimit then m.euro_litro_lordo / 1.22 else a.euro_litro end,
    case when scelta.usa_mimit then 'mimit' when a.euro_litro is not null then 'aziendale' end,
    r.zona, case when scelta.usa_mimit then m.euro_litro_lordo end
  from private.carburante_zona_azienda(p_company,p_giorno) r
  left join private.carburante_rilevazioni_mimit m on m.zona=r.zona and m.giorno=p_giorno and m.tipo=p_tipo
  left join lateral (select x.euro_litro from private.carburante_prezzi x
    where x.company_id=p_company and x.tipo=p_tipo and x.dal<=p_giorno order by x.dal desc limit 1) a on true
  cross join lateral (select m.euro_litro_lordo is not null and (r.preferisci_mimit or a.euro_litro is null) usa_mimit) scelta
$$;

create or replace function public.mezzo_carburante_riferimento_salva(p_company uuid,p_mezzo uuid,p_dal date,p_zona text,p_preferisci_mimit boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.mezzo_carburante_config(p_company,p_mezzo,p_dal);
  if public.utente_sola_lettura(p_company) or public.has_permission_for_company(auth.uid(),'can_edit_mezzi',p_company) is not true then
    raise insufficient_privilege using message='La modifica dei riferimenti richiede il permesso di modificare i mezzi';
  end if;
  if p_dal is null or not isfinite(p_dal) or p_preferisci_mimit is null
    or (p_zona is not null and not exists (select 1 from private.carburante_zone_mimit where zona=p_zona)) then
    raise invalid_parameter_value using message='Controlla zona, decorrenza e fonte';
  end if;
  insert into private.carburante_riferimenti_azienda(company_id,dal,zona,preferisci_mimit,aggiornato_da)
    values(p_company,p_dal,p_zona,p_preferisci_mimit,auth.uid())
  on conflict (company_id,dal) do update set zona=excluded.zona,preferisci_mimit=excluded.preferisci_mimit,
    aggiornato_da=excluded.aggiornato_da,aggiornato_il=now();
end
$$;
revoke all on function public.mezzo_carburante_riferimento_salva(uuid,uuid,date,text,boolean) from public,anon;
grant execute on function public.mezzo_carburante_riferimento_salva(uuid,uuid,date,text,boolean) to authenticated;

-- Un rientro esplicito alla partenza si attribuisce da solo solo nel giro con un unico cantiere.
create or replace function private.mezzo_tratte_attribuite(p_tratte jsonb)
returns table (tratta jsonb,n bigint)
language sql immutable set search_path = '' as $$
  with unica as (
    select min(t->>'order_id') ordine
    from jsonb_array_elements(p_tratte) t where t->>'destinazione'='commessa'
    having count(distinct t->>'order_id')=1
  )
  select case when u.ordine is not null and a.n=jsonb_array_length(p_tratte) and a.n>1
    and a.t->>'destinazione'='generale' and (a.t->>'order_id') is null
    and nullif(btrim(p_tratte->0->>'da'),'') is not null
    and lower(btrim(p_tratte->0->>'da'))=lower(btrim(a.t->>'a'))
    then a.t || jsonb_build_object('order_id',u.ordine,'destinazione','commessa','rientro_attribuito',true)
    else a.t end,a.n
  from jsonb_array_elements(p_tratte) with ordinality a(t,n) left join unica u on true
$$;
revoke all on function private.carburante_zona_azienda(uuid,date),private.carburante_prezzo_stimato(uuid,date,text),
  private.mezzo_tratte_attribuite(jsonb) from public,anon,authenticated;

-- Il fuso italiano governa i tentativi, anche al cambio dell'ora.
do $$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is not null
    and to_regprocedure('public.silvio_invoke_edge(text,jsonb)') is not null then
    perform cron.schedule('carburante-mimit-giornaliero','23 * * * *',$cron$
      select public.silvio_invoke_edge('carburante-mimit-sync','{}'::jsonb)
      where extract(hour from now() at time zone 'Europe/Rome') in (9,12,16,20);
    $cron$);
  end if;
end
$$;

create or replace function public.mezzo_carburante_config(p_company uuid,p_mezzo uuid,p_giorno date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_company is distinct from public.get_effective_company_id()
    or public.utente_bloccato() or public.chiamante_anonimo() or public.utente_e_cliente_esterno()
    or public.has_permission_for_company(auth.uid(),'can_view_mezzi',p_company) is not true
    or public.has_permission_for_company(auth.uid(),'can_view_costs',p_company) is not true
    or not exists (select 1 from public.mezzi where id=p_mezzo and company_id=p_company and deleted_at is null
      and contatore_unita='km' and tipo in ('autovettura','furgone','autocarro','altro')) then
    raise insufficient_privilege using message='Configurazione carburante non accessibile';
  end if;
  return jsonb_build_object('consumo',(
    select jsonb_build_object('tipo',c.tipo,'dal',c.dal,'litri_100',c.litri_100)
    from private.mezzi_carburante_consumi c where c.mezzo_id=p_mezzo and c.dal<=p_giorno order by c.dal desc limit 1
  ),'prezzi',(
    select coalesce(jsonb_object_agg(p.tipo,jsonb_build_object('dal',p.dal,'euro_litro',p.euro_litro)),'{}'::jsonb)
    from (select distinct on (c.tipo) c.tipo,c.dal,c.euro_litro from private.carburante_prezzi c
      where c.company_id=p_company and c.dal<=p_giorno order by c.tipo,c.dal desc) p
  ),'riferimento',(
    select to_jsonb(r) from private.carburante_zona_azienda(p_company,p_giorno) r
  ),'zone',(
    select jsonb_agg(jsonb_build_object('chiave',z.zona,'nome',z.nome) order by z.nome) from private.carburante_zone_mimit z
  ),'stima',(
    select to_jsonb(p) from (
      select x.tipo from private.mezzi_carburante_consumi x
        where x.mezzo_id=p_mezzo and x.dal<=p_giorno order by x.dal desc limit 1
    ) c cross join lateral private.carburante_prezzo_stimato(p_company,p_giorno,c.tipo) p
  ));
end
$$;

create or replace function public.mezzi_quadro_percorrenze(
  p_company uuid,p_mezzo uuid default null,p_ordine uuid default null,p_dal date default null,p_al date default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare vede_costi boolean;
begin
  if auth.uid() is null or p_company is distinct from public.get_effective_company_id()
    or public.utente_bloccato() or public.chiamante_anonimo() or public.utente_e_cliente_esterno()
    or public.has_permission_for_company(auth.uid(),'can_view_mezzi',p_company) is not true
    or (p_mezzo is null)=(p_ordine is null) then
    raise insufficient_privilege using message='Percorrenze non accessibili';
  end if;
  if (p_dal is null)<>(p_al is null) or (p_dal is not null and
    (not isfinite(p_dal) or not isfinite(p_al) or p_al<p_dal or p_al-p_dal>366)) then
    raise invalid_parameter_value using message='Periodo non valido';
  end if;
  if p_mezzo is not null and not exists (
    select 1 from public.mezzi where id=p_mezzo and company_id=p_company and deleted_at is null
  ) then raise insufficient_privilege using message='Mezzo non disponibile'; end if;
  if p_ordine is not null and (public.has_permission_for_company(auth.uid(),'can_view_orders',p_company) is not true
    or not exists(select 1 from public.orders where id=p_ordine and company_id=p_company and deleted_at is null)
    or public.ufficio_vede_commessa(p_ordine) is not true) then
    raise insufficient_privilege using message='Commessa non accessibile';
  end if;
  vede_costi := coalesce(public.has_permission_for_company(auth.uid(),'can_view_costs',p_company),false);
  return (with viaggi as materialized (
    select v.id,v.mezzo_id,v.tratte,v.stato,v.tariffa_km,(v.partenza at time zone 'Europe/Rome')::date giorno
    from public.mezzi_viaggi v
    where v.company_id=p_company and v.stato in ('inviato','verificato')
      and (p_mezzo is null or v.mezzo_id=p_mezzo)
      and (p_ordine is null or v.tratte @> jsonb_build_array(jsonb_build_object('order_id',p_ordine)))
      and (p_dal is null or v.partenza >= (p_dal::timestamp at time zone 'Europe/Rome'))
      and (p_al is null or v.partenza < ((p_al+1)::timestamp at time zone 'Europe/Rome'))
  ), tariffe as materialized (
    select v.*,c.tipo,c.litri_100,p.euro_litro,p.fonte fonte_prezzo
    from viaggi v
    left join lateral (select m.tipo,m.litri_100 from private.mezzi_carburante_consumi m
      where m.mezzo_id=v.mezzo_id and m.dal<=v.giorno order by m.dal desc limit 1) c on vede_costi and v.tariffa_km is null
    left join lateral private.carburante_prezzo_stimato(p_company,v.giorno,c.tipo) p on vede_costi and c.litri_100 is not null
  ), tratte as (
    select v.mezzo_id,v.id,v.stato,t->>'fonte' fonte,
      case when jsonb_typeof(t->'km')='number' then (t->>'km')::numeric end km,
      v.litri_100 / 100 consumo,v.euro_litro,v.tariffa_km,v.tipo,v.fonte_prezzo
    from tariffe v cross join lateral private.mezzo_tratte_attribuite(v.tratte) a(t,n)
    where p_ordine is null or (t->>'destinazione'='commessa' and t->>'order_id'=p_ordine::text)
  ), per_mezzo as (
    select t.mezzo_id,m.nome,m.targa,count(distinct t.id) viaggi,count(*) filter(where t.km is null) tratte_senza_km,
      coalesce(sum(t.km) filter(where t.stato='verificato'),0) km_verificati,
      coalesce(sum(t.km) filter(where t.stato='inviato' and t.fonte='dichiarati'),0) km_dichiarati,
      coalesce(sum(t.km) filter(where t.stato='inviato' and t.fonte='stimati'),0) km_stimati,
      case when vede_costi then sum(t.km*t.consumo) end litri,
      case when vede_costi then sum(t.km*t.consumo*t.euro_litro) end costo_carburante,
      case when vede_costi then bool_or(t.fonte_prezzo='mimit' and t.km is not null) end mimit,
      case when vede_costi then sum(t.km*t.tariffa_km) end costo_tariffa,
      case when vede_costi then coalesce(sum(t.km) filter(where t.tariffa_km is null and t.tipo is distinct from 'nessuno'
        and (t.consumo is null or t.euro_litro is null)),0) end km_senza_parametri
    from tratte t join public.mezzi m on m.id=t.mezzo_id and m.company_id=p_company
    group by t.mezzo_id,m.nome,m.targa
  )
  select jsonb_build_object('mezzi',coalesce(jsonb_agg(to_jsonb(per_mezzo) order by nome,mezzo_id),'[]'::jsonb),
    'totali',jsonb_build_object('viaggi',coalesce(sum(viaggi),0),'tratte_senza_km',coalesce(sum(tratte_senza_km),0),
      'km_verificati',coalesce(sum(km_verificati),0),'km_dichiarati',coalesce(sum(km_dichiarati),0),'km_stimati',coalesce(sum(km_stimati),0),
      'mimit',coalesce(bool_or(mimit),false),'litri',sum(litri),'costo_carburante',round(sum(costo_carburante),2),'costo_tariffa',round(sum(costo_tariffa),2),
      'km_senza_parametri',sum(km_senza_parametri)))
  from per_mezzo);
end
$$;

create or replace function public.mezzi_viaggi_elenco(p_company uuid,p_mezzo uuid default null,p_order uuid default null,p_dal date default current_date-30,p_al date default current_date,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path = public,pg_temp as $$
declare ufficio boolean; vede_costi boolean; risultati jsonb; n integer;
begin
 if auth.uid() is null or public.utente_bloccato() or public.chiamante_anonimo() then raise insufficient_privilege using message='Accesso non consentito'; end if;
 if p_dal is null or p_al is null or p_al<p_dal or p_al-p_dal>366 or p_offset is null or p_offset<0 or p_offset>100000 then raise exception 'Periodo o pagina non validi (massimo 366 giorni)'; end if;
 ufficio:=public.has_permission_for_company(auth.uid(),'can_view_mezzi',p_company);
 vede_costi:=ufficio and public.has_permission_for_company(auth.uid(),'can_view_costs',p_company);
 if p_order is not null and not exists(select 1 from public.orders o where o.id=p_order and o.company_id=p_company and o.deleted_at is null
   and ((ufficio and public.has_permission_for_company(auth.uid(),'can_view_orders',p_company)) or public.campo_lavoro_su_commessa(o.id))) then raise insufficient_privilege using message='Commessa non accessibile'; end if;
 select coalesce(jsonb_agg(x.r),'[]'::jsonb),count(*) into risultati,n from (
  select jsonb_build_object('id',v.id,'company_id',v.company_id,'mezzo_id',v.mezzo_id,'mezzo_nome',m.nome,'stato',v.stato,'versione',v.versione,
    'conducente',concat_ws(' ',h.nome,h.cognome),'conducente_hr_id',v.conducente_hr_id,'partenza',v.partenza,'arrivo',v.arrivo,'updated_at',v.updated_at,
    'ambito_commessa',p_order is not null,
    'contatore_inizio',case when p_order is null then v.contatore_inizio end,'contatore_fine',case when p_order is null then v.contatore_fine end,
    'note',case when p_order is null then v.note else '' end,'tariffa_km',case when vede_costi then v.tariffa_km end,
    'tratte',case when p_order is null then v.tratte else (select jsonb_agg(a.tratta order by a.n) from private.mezzo_tratte_attribuite(v.tratte) a where a.tratta->>'order_id'=p_order::text) end) r
  from public.mezzi_viaggi v join public.mezzi m on m.id=v.mezzo_id left join public.hr_profili h on h.id=v.conducente_hr_id
  where v.company_id=p_company and (ufficio or v.created_by=auth.uid()) and (p_mezzo is null or v.mezzo_id=p_mezzo)
    and (p_order is null or v.tratte @> jsonb_build_array(jsonb_build_object('order_id',p_order::text)))
    and v.partenza<((p_al+1)::timestamp at time zone 'Europe/Rome') and v.partenza>=(p_dal::timestamp at time zone 'Europe/Rome')
  order by v.partenza desc,v.id limit 51 offset p_offset
 ) x;
 return jsonb_build_object('items',case when n>50 then risultati-50 else risultati end,'has_more',n>50);
end $$;
