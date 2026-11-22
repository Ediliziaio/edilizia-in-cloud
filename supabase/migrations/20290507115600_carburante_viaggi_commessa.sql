set local lock_timeout = '3s';
set local statement_timeout = '60s';

create table if not exists private.carburante_prezzi (
  company_id uuid not null references public.companies(id) on delete cascade,
  tipo text not null check (tipo in ('gasolio','benzina')),
  dal date not null check (isfinite(dal)),
  euro_litro numeric(7,4) not null check (euro_litro > 0 and euro_litro <= 20),
  aggiornato_da uuid not null,
  aggiornato_il timestamptz not null default now(),
  primary key (company_id,tipo,dal)
);
create table if not exists private.mezzi_carburante_consumi (
  mezzo_id uuid not null references public.mezzi(id) on delete cascade,
  dal date not null check (isfinite(dal)),
  tipo text not null check (tipo in ('gasolio','benzina','nessuno')),
  litri_100 numeric(6,3),
  aggiornato_da uuid not null,
  aggiornato_il timestamptz not null default now(),
  check ((tipo='nessuno' and litri_100 is null) or (tipo<>'nessuno' and litri_100 is not null and litri_100 > 0 and litri_100 <= 150)),
  primary key (mezzo_id,dal)
);
revoke all on private.carburante_prezzi,private.mezzi_carburante_consumi from public,anon,authenticated;

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
  ));
end
$$;

create or replace function public.mezzo_carburante_salva(
  p_company uuid,p_mezzo uuid,p_dal date,p_tipo text,p_litri_100 numeric,p_euro_litro numeric default null
) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.mezzo_carburante_config(p_company,p_mezzo,p_dal);
  if public.utente_sola_lettura(p_company) or public.has_permission_for_company(auth.uid(),'can_edit_mezzi',p_company) is not true then
    raise insufficient_privilege using message='La modifica del carburante richiede il permesso di modificare i mezzi';
  end if;
  if p_dal is null or not isfinite(p_dal) or p_tipo is null or p_tipo not in ('gasolio','benzina','nessuno')
    or (p_tipo='nessuno' and (p_litri_100 is not null or p_euro_litro is not null))
    or (p_tipo<>'nessuno' and (p_litri_100 is null or round(p_litri_100,3) not between 0.001 and 150))
    or (p_euro_litro is not null and round(p_euro_litro,4) not between 0.0001 and 20) then
    raise invalid_parameter_value using message='Controlla decorrenza, consumo e prezzo al litro';
  end if;
  insert into private.mezzi_carburante_consumi(mezzo_id,dal,tipo,litri_100,aggiornato_da)
    values(p_mezzo,p_dal,p_tipo,p_litri_100,auth.uid())
  on conflict (mezzo_id,dal) do update set tipo=excluded.tipo,litri_100=excluded.litri_100,
    aggiornato_da=excluded.aggiornato_da,aggiornato_il=now();
  if p_euro_litro is not null then
    insert into private.carburante_prezzi(company_id,tipo,dal,euro_litro,aggiornato_da)
      values(p_company,p_tipo,p_dal,p_euro_litro,auth.uid())
    on conflict (company_id,tipo,dal) do update set euro_litro=excluded.euro_litro,aggiornato_da=excluded.aggiornato_da,aggiornato_il=now();
  end if;
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
    select v.*,c.tipo,c.litri_100,p.euro_litro
    from viaggi v
    left join lateral (select m.tipo,m.litri_100 from private.mezzi_carburante_consumi m
      where m.mezzo_id=v.mezzo_id and m.dal<=v.giorno order by m.dal desc limit 1) c on vede_costi and v.tariffa_km is null
    left join lateral (select x.euro_litro from private.carburante_prezzi x where x.company_id=p_company
      and x.tipo=c.tipo and x.dal<=v.giorno order by x.dal desc limit 1) p on vede_costi and c.litri_100 is not null
  ), tratte as (
    select v.mezzo_id,v.id,v.stato,t->>'fonte' fonte,
      case when jsonb_typeof(t->'km')='number' then (t->>'km')::numeric end km,
      v.litri_100 / 100 consumo,v.euro_litro,v.tariffa_km,v.tipo
    from tariffe v cross join lateral jsonb_array_elements(v.tratte) t
    where p_ordine is null or (t->>'destinazione'='commessa' and t->>'order_id'=p_ordine::text)
  ), per_mezzo as (
    select t.mezzo_id,m.nome,m.targa,count(distinct t.id) viaggi,count(*) filter(where t.km is null) tratte_senza_km,
      coalesce(sum(t.km) filter(where t.stato='verificato'),0) km_verificati,
      coalesce(sum(t.km) filter(where t.stato='inviato' and t.fonte='dichiarati'),0) km_dichiarati,
      coalesce(sum(t.km) filter(where t.stato='inviato' and t.fonte='stimati'),0) km_stimati,
      case when vede_costi then sum(t.km*t.consumo) end litri,
      case when vede_costi then sum(t.km*t.consumo*t.euro_litro) end costo_carburante,
      case when vede_costi then sum(t.km*t.tariffa_km) end costo_tariffa,
      case when vede_costi then coalesce(sum(t.km) filter(where t.tariffa_km is null and t.tipo is distinct from 'nessuno'
        and (t.consumo is null or t.euro_litro is null)),0) end km_senza_parametri
    from tratte t join public.mezzi m on m.id=t.mezzo_id and m.company_id=p_company
    group by t.mezzo_id,m.nome,m.targa
  )
  select jsonb_build_object('mezzi',coalesce(jsonb_agg(to_jsonb(per_mezzo) order by nome,mezzo_id),'[]'::jsonb),
    'totali',jsonb_build_object('viaggi',coalesce(sum(viaggi),0),'tratte_senza_km',coalesce(sum(tratte_senza_km),0),
      'km_verificati',coalesce(sum(km_verificati),0),'km_dichiarati',coalesce(sum(km_dichiarati),0),'km_stimati',coalesce(sum(km_stimati),0),
      'litri',sum(litri),'costo_carburante',round(sum(costo_carburante),2),'costo_tariffa',round(sum(costo_tariffa),2),
      'km_senza_parametri',sum(km_senza_parametri)))
  from per_mezzo);
end
$$;

revoke all on function public.mezzo_carburante_config(uuid,uuid,date),public.mezzo_carburante_salva(uuid,uuid,date,text,numeric,numeric),
  public.mezzi_quadro_percorrenze(uuid,uuid,uuid,date,date) from public,anon;
grant execute on function public.mezzo_carburante_config(uuid,uuid,date),public.mezzo_carburante_salva(uuid,uuid,date,text,numeric,numeric),
  public.mezzi_quadro_percorrenze(uuid,uuid,uuid,date,date) to authenticated;
