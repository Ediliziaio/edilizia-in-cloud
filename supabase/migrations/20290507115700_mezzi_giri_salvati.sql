set local lock_timeout = '3s';
set local statement_timeout = '60s';

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
    'tratte',case when p_order is null then v.tratte else (select jsonb_agg(l) from jsonb_array_elements(v.tratte) l where l->>'order_id'=p_order::text) end) r
  from public.mezzi_viaggi v join public.mezzi m on m.id=v.mezzo_id left join public.hr_profili h on h.id=v.conducente_hr_id
  where v.company_id=p_company and (ufficio or v.created_by=auth.uid()) and (p_mezzo is null or v.mezzo_id=p_mezzo)
    and (p_order is null or v.tratte @> jsonb_build_array(jsonb_build_object('order_id',p_order::text)))
    and v.partenza<((p_al+1)::timestamp at time zone 'Europe/Rome') and v.partenza>=(p_dal::timestamp at time zone 'Europe/Rome')
  order by v.partenza desc,v.id limit 51 offset p_offset
 ) x;
 return jsonb_build_object('items',case when n>50 then risultati-50 else risultati end,'has_more',n>50);
end $$;

create table if not exists private.mezzi_giri (
  id uuid primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  mezzo_id uuid not null references public.mezzi(id) on delete restrict,
  autista_id uuid references public.hr_profili(id) on delete set null,
  partenza timestamptz not null,
  arrivo timestamptz not null,
  commesse uuid[] not null,
  oda uuid[] not null default '{}',
  tratte jsonb not null,
  partenza_luogo text not null,
  rientro boolean not null,
  creato_da uuid not null,
  creato_il timestamptz not null default now(),
  annullato_il timestamptz,
  annullato_da uuid,
  viaggio_id uuid unique references public.mezzi_viaggi(id) on delete restrict
);
create index if not exists mezzi_giri_azienda_partenza on private.mezzi_giri(company_id,partenza);
alter table private.mezzi_giri enable row level security;
revoke all on private.mezzi_giri from public,anon,authenticated;

create or replace function private.mezzi_giri_accesso(p_company uuid,p_scrive boolean)
returns boolean language sql stable set search_path = '' as $$
  select auth.uid() is not null and p_company=public.get_effective_company_id()
    and not public.utente_bloccato() and not public.chiamante_anonimo() and not public.utente_e_cliente_esterno()
    and public.has_permission_for_company(auth.uid(),'can_view_mezzi',p_company)
    and public.has_permission_for_company(auth.uid(),'can_view_orders',p_company)
    and (not p_scrive or (not public.utente_sola_lettura(p_company)
      and public.has_permission_for_company(auth.uid(),'can_edit_mezzi',p_company)))
$$;
revoke all on function private.mezzi_giri_accesso(uuid,boolean) from public,anon,authenticated;

create or replace function public.mezzi_giro_contesto(p_company uuid,p_mezzo uuid,p_cantiere text,p_autista text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if private.mezzi_giri_accesso(p_company,true) is not true
    or not exists(select 1 from public.mezzi m where m.id=p_mezzo and m.company_id=p_company and m.deleted_at is null
      and m.stato='in_servizio' and m.contatore_unita='km' and m.tipo in ('autovettura','furgone','autocarro','altro')) then
    raise insufficient_privilege using message='Mezzo non disponibile per il giro';
  end if;
  p_cantiere := '%'||left(btrim(coalesce(p_cantiere,'')),100)||'%';
  p_autista := '%'||left(btrim(coalesce(p_autista,'')),100)||'%';
  return jsonb_build_object(
    'autisti',(select coalesce(jsonb_agg(x order by x.label,x.id),'[]'::jsonb) from (
      select h.id,concat_ws(' ',h.nome,h.cognome) label from public.hr_profili h
      where h.company_id=p_company and h.attivo and concat_ws(' ',h.nome,h.cognome) ilike p_autista
      order by label,h.id limit 100
    ) x),
    'cantieri',(select coalesce(jsonb_agg(x order by x.label,x.id),'[]'::jsonb) from (
      select o.id,concat_ws(' · ',o.order_code,nullif(btrim(o.description),'')) label,
        coalesce(nullif(btrim(o.work_address),''),nullif(btrim(o.indirizzo_lavori),'')) indirizzo
      from public.orders o where o.company_id=p_company and o.deleted_at is null
        and concat_ws(' ',o.order_code,o.description,o.work_address,o.indirizzo_lavori) ilike p_cantiere
        and public.ufficio_vede_commessa(o.id)
      order by o.created_at desc,o.id limit 50
    ) x));
end
$$;

create or replace function public.mezzi_giri_elenco(p_company uuid,p_order uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if private.mezzi_giri_accesso(p_company,false) is not true or public.ufficio_vede_commessa(p_order) is not true then
    raise insufficient_privilege using message='Giri non accessibili';
  end if;
  return (select coalesce(jsonb_agg(x order by x.partenza desc,x.id),'[]'::jsonb) from (
    select g.id,g.mezzo_id,m.nome mezzo,coalesce(nullif(concat_ws(' ',h.nome,h.cognome),''),'Autista da assegnare') autista,
      g.partenza,g.arrivo,g.commesse,g.oda,g.tratte,g.viaggio_id,v.stato stato_viaggio,g.annullato_il
    from private.mezzi_giri g
    join public.mezzi m on m.id=g.mezzo_id and m.company_id=g.company_id
    left join public.hr_profili h on h.id=g.autista_id and h.company_id=g.company_id
    left join public.mezzi_viaggi v on v.id=g.viaggio_id and v.company_id=g.company_id
    where g.company_id=p_company and p_order=any(g.commesse)
      and not exists(select 1 from unnest(g.commesse) c(id) where public.ufficio_vede_commessa(c.id) is not true)
    order by g.partenza desc,g.id limit 50
  ) x);
end
$$;

create or replace function public.mezzi_giro_salva(
  p_company uuid,p_id uuid,p_mezzo uuid,p_autista uuid,p_partenza timestamp,p_arrivo timestamp,
  p_commesse uuid[],p_oda uuid[],p_luogo text,p_rientro boolean
) returns uuid language plpgsql security definer set search_path = '' as $$
declare precedente private.mezzi_giri; inizio timestamptz; fine timestamptz; tappe jsonb;
begin
  if private.mezzi_giri_accesso(p_company,true) is not true then
    raise insufficient_privilege using message='Pianificazione giri non modificabile';
  end if;
  p_luogo := btrim(p_luogo);
  p_oda := coalesce(p_oda,array[]::uuid[]);
  if p_id is null or p_partenza is null or p_arrivo is null or not isfinite(p_partenza) or not isfinite(p_arrivo)
    or p_rientro is null or coalesce(length(p_luogo),0) not between 1 and 250
    or coalesce(cardinality(p_commesse),0) not between 1 and 15 or cardinality(p_oda)>30
    or cardinality(p_commesse)<>(select count(distinct id) from unnest(p_commesse) t(id))
    or cardinality(p_oda)<>(select count(distinct id) from unnest(p_oda) t(id)) then
    raise invalid_parameter_value using message='Controlla cantieri, orari e luogo di partenza';
  end if;
  inizio := p_partenza at time zone 'Europe/Rome';
  fine := p_arrivo at time zone 'Europe/Rome';
  if fine<=inizio or fine>inizio+interval '48 hours' then
    raise invalid_parameter_value using message='Indica partenza e arrivo in ordine, entro 48 ore';
  end if;
  -- Serializza anche richieste con mezzo diverso ma autista in comune.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mezzi-giri:'||p_company::text,0));
  if not exists(select 1 from public.mezzi where id=p_mezzo and company_id=p_company and deleted_at is null
      and contatore_unita='km' and tipo in ('autovettura','furgone','autocarro','altro') and stato='in_servizio')
    or not exists(select 1 from public.hr_profili where id=p_autista and company_id=p_company and attivo)
    or exists(select 1 from unnest(p_commesse) t(id) where not exists (
      select 1 from public.orders o where o.id=t.id and o.company_id=p_company and o.deleted_at is null
        and public.ufficio_vede_commessa(o.id))) then
    raise insufficient_privilege using message='Mezzo, autista o cantiere non disponibile';
  end if;
  select * into precedente from private.mezzi_giri where id=p_id and company_id=p_company;
  if found then
    if (precedente.mezzo_id,precedente.autista_id,precedente.partenza,precedente.arrivo,precedente.commesse,
        precedente.oda,precedente.partenza_luogo,precedente.rientro)
      is not distinct from (p_mezzo,p_autista,inizio,fine,p_commesse,p_oda,p_luogo,p_rientro) then return p_id; end if;
    raise invalid_parameter_value using message='Compilazione già salvata con dati diversi';
  end if;
  if cardinality(p_oda)>0 and not (
    public.has_permission_for_company(auth.uid(),'can_view_warehouse',p_company) is true
    or public.has_permission_for_company(auth.uid(),'can_manage_purchasing',p_company) is true
    or public.has_permission_for_company(auth.uid(),'can_edit_orders',p_company) is true
  ) then raise insufficient_privilege using message='Ritiri riservati ai profili con accesso agli acquisti'; end if;
  if exists(select 1 from unnest(p_oda) t(id) where not exists (
    select 1 from public.purchase_orders o join public.suppliers s on s.id=o.supplier_id and s.company_id=o.company_id
    where o.id=t.id and o.company_id=p_company and o.order_id=any(p_commesse)
      and o.status in ('inviato','confermato','parziale') and nullif(btrim(s.ritiro_indirizzo),'') is not null)) then
    raise invalid_parameter_value using message='Un ordine non è più disponibile per il ritiro';
  end if;
  if exists(select 1 from private.mezzi_giri g
    where g.company_id=p_company and (g.mezzo_id=p_mezzo or g.autista_id=p_autista)
      and tstzrange(g.partenza,g.arrivo,'[)') && tstzrange(inizio,fine,'[)')
      and g.annullato_il is null
      and not exists(select 1 from public.mezzi_viaggi v where v.id=g.viaggio_id and v.stato<>'bozza'))
    or exists(select 1 from public.mezzi_viaggi v where v.company_id=p_company and v.stato in ('inviato','verificato')
      and (v.mezzo_id=p_mezzo or v.conducente_hr_id=p_autista)
      and tstzrange(v.partenza,v.arrivo,'[)') && tstzrange(inizio,fine,'[)')) then
    raise invalid_parameter_value using message='Il mezzo o l’autista ha già un viaggio in questo orario';
  end if;

  with ritiri as (
    select min(t.n) n,left(concat_ws(' · ',s.name,concat_ws(', ',nullif(btrim(s.ritiro_indirizzo),''),nullif(btrim(s.ritiro_citta),''))),250) luogo,
      jsonb_agg(o.id order by t.n) oda
    from unnest(p_oda) with ordinality t(id,n)
    join public.purchase_orders o on o.id=t.id
    join public.suppliers s on s.id=o.supplier_id
    group by s.id,s.name,s.ritiro_indirizzo,s.ritiro_citta
  ), destinazioni as (
    select n,luogo,null::uuid commessa,oda from ritiri
    union all
    select 100+t.n,left(concat_ws(' · ',o.order_code,coalesce(nullif(btrim(o.work_address),''),nullif(btrim(o.indirizzo_lavori),''),nullif(btrim(o.description),''),'Cantiere')),250),o.id,'[]'::jsonb
    from unnest(p_commesse) with ordinality t(id,n) join public.orders o on o.id=t.id
    union all
    select 200,p_luogo,null::uuid,'[]'::jsonb where p_rientro
  ), righe as (
    select *,lag(luogo,1,p_luogo) over(order by n) da from destinazioni
  )
  select jsonb_agg(jsonb_build_object('id',gen_random_uuid(),'da',da,'a',luogo,'order_id',commessa,
    'destinazione',case when commessa is null then 'generale' else 'commessa' end,
    'fonte','dichiarati','km',null,'minuti',null,'oda',oda) order by n) into tappe from righe;
  if jsonb_array_length(tappe)>30 then
    raise invalid_parameter_value using message='Il giro può contenere al massimo 30 tratte';
  end if;
  insert into private.mezzi_giri(id,company_id,mezzo_id,autista_id,partenza,arrivo,commesse,oda,tratte,partenza_luogo,rientro,creato_da)
  values(p_id,p_company,p_mezzo,p_autista,inizio,fine,p_commesse,p_oda,tappe,p_luogo,p_rientro,auth.uid());
  return p_id;
end
$$;

create or replace function public.mezzi_giro_annulla(p_company uuid,p_giro uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare g private.mezzi_giri;
begin
  if private.mezzi_giri_accesso(p_company,true) is not true then
    raise insufficient_privilege using message='Pianificazione giri non modificabile';
  end if;
  select * into g from private.mezzi_giri where id=p_giro and company_id=p_company for update;
  if not found or exists(select 1 from unnest(g.commesse) c(id) where public.ufficio_vede_commessa(c.id) is not true) then
    raise insufficient_privilege using message='Giro non accessibile';
  end if;
  if g.viaggio_id is not null then
    raise invalid_parameter_value using message='Annulla il viaggio dal registro';
  end if;
  update private.mezzi_giri set annullato_il=now(),annullato_da=auth.uid() where id=p_giro and annullato_il is null;
end
$$;

create or replace function public.mezzi_giro_registra(p_company uuid,p_giro uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g private.mezzi_giri; v public.mezzi_viaggi; v_id uuid; codice_oda text;
begin
  if private.mezzi_giri_accesso(p_company,true) is not true then
    raise insufficient_privilege using message='Registro non modificabile';
  end if;
  select * into g from private.mezzi_giri where id=p_giro and company_id=p_company for update;
  if not found or exists(select 1 from unnest(g.commesse) c(id) where public.ufficio_vede_commessa(c.id) is not true) then
    raise insufficient_privilege using message='Giro non accessibile';
  end if;
  if g.annullato_il is not null then raise invalid_parameter_value using message='Il giro è annullato'; end if;
  v_id := g.viaggio_id;
  if v_id is null then
    if g.autista_id is null then raise invalid_parameter_value using message='Scegli un autista disponibile in un nuovo giro'; end if;
    if g.partenza>=now() then raise invalid_parameter_value using message='Apri il registro dopo la partenza prevista'; end if;
    v_id := gen_random_uuid();
    select string_agg(o.oda_number,', ' order by x.n) into codice_oda
    from unnest(g.oda) with ordinality x(id,n) join public.purchase_orders o on o.id=x.id and o.company_id=p_company;
    perform public.mezzi_viaggi_salva(g.mezzo_id,v_id,0,gen_random_uuid(),'salva',
      jsonb_build_object('partenza',g.partenza,'arrivo',least(g.arrivo,now()),'conducente_hr_id',g.autista_id,
        'tratte',g.tratte,'note',left(concat_ws(' · ','Da giro pianificato',case when codice_oda is not null then 'ODA '||codice_oda end),2000)));
    update private.mezzi_giri set viaggio_id=v_id where id=g.id and company_id=p_company;
  end if;
  select * into v from public.mezzi_viaggi where id=v_id and company_id=p_company;
  if exists(select 1 from jsonb_array_elements(v.tratte) t where t->>'order_id' is not null
    and public.ufficio_vede_commessa((t->>'order_id')::uuid) is not true) then
    raise insufficient_privilege using message='Una commessa del viaggio non è accessibile';
  end if;
  return jsonb_build_object('id',v.id,'company_id',v.company_id,'mezzo_id',v.mezzo_id,'stato',v.stato,'versione',v.versione,
    'partenza',v.partenza,'arrivo',v.arrivo,'contatore_inizio',v.contatore_inizio,'contatore_fine',v.contatore_fine,
    'tratte',v.tratte,'note',v.note,'conducente_hr_id',v.conducente_hr_id,'updated_at',v.updated_at,
    'mezzo_nome',(select m.nome from public.mezzi m where m.id=v.mezzo_id and m.company_id=p_company),
    'conducente',(select concat_ws(' ',h.nome,h.cognome) from public.hr_profili h where h.id=v.conducente_hr_id and h.company_id=p_company),
    'tariffa_km',case when public.has_permission_for_company(auth.uid(),'can_view_costs',p_company) then v.tariffa_km end);
end
$$;

revoke all on function public.mezzi_giro_contesto(uuid,uuid,text,text),public.mezzi_giri_elenco(uuid,uuid),
  public.mezzi_giro_salva(uuid,uuid,uuid,uuid,timestamp,timestamp,uuid[],uuid[],text,boolean),
  public.mezzi_giro_annulla(uuid,uuid),public.mezzi_giro_registra(uuid,uuid) from public,anon;
grant execute on function public.mezzi_giro_contesto(uuid,uuid,text,text),public.mezzi_giri_elenco(uuid,uuid),
  public.mezzi_giro_salva(uuid,uuid,uuid,uuid,timestamp,timestamp,uuid[],uuid[],text,boolean),
  public.mezzi_giro_annulla(uuid,uuid),public.mezzi_giro_registra(uuid,uuid) to authenticated;
