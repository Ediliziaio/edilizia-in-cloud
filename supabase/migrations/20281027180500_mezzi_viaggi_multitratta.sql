-- Ricostruita dal registro Supabase: già applicata in produzione da un altro terminale.
-- Copia dello SQL eseguito, per allineare lo storico del repository senza rieseguirlo.

-- Registro operativo. Nessuna scrittura in costi, rimborsi, presenze o contatore del mezzo.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create table if not exists public.mezzi_viaggi (
 id uuid primary key,
 company_id uuid not null references public.companies(id) on delete cascade,
 mezzo_id uuid not null references public.mezzi(id) on delete restrict,
 created_by uuid not null references public.profiles(id) on delete restrict,
 conducente_hr_id uuid references public.hr_profili(id) on delete set null,
 partenza timestamptz not null, arrivo timestamptz not null,
 contatore_inizio numeric, contatore_fine numeric,
 tratte jsonb not null, note text not null default '', tariffa_km numeric,
 stato text not null default 'bozza' check(stato in ('bozza','inviato','verificato','annullato')),
 versione integer not null default 1,
 ultimo_token uuid not null, ultima_richiesta jsonb not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(arrivo > partenza and arrivo <= partenza + interval '48 hours'),
 check(jsonb_typeof(tratte)='array' and jsonb_array_length(tratte) between 1 and 30),
 check((contatore_inizio is null and contatore_fine is null) or (contatore_inizio >= 0 and contatore_fine >= contatore_inizio and contatore_fine <= 100000000)),
 check((contatore_inizio is null)=(contatore_fine is null)),
 check(tariffa_km is null or tariffa_km between 0 and 1000), check(length(note)<=2000)
);
create index if not exists mezzi_viaggi_mezzo_periodo on public.mezzi_viaggi(company_id,mezzo_id,partenza desc);
create index if not exists mezzi_viaggi_autore on public.mezzi_viaggi(created_by,partenza desc);
create index if not exists mezzi_viaggi_tratte on public.mezzi_viaggi using gin(tratte jsonb_path_ops);
create table if not exists public.mezzi_viaggi_eventi (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 viaggio_id uuid not null references public.mezzi_viaggi(id) on delete cascade,
 actor uuid not null references public.profiles(id) on delete restrict,
 versione integer not null, azione text not null, motivo text not null default '',
 fotografia jsonb not null, created_at timestamptz not null default now(), unique(viaggio_id,versione)
);
create index if not exists mezzi_viaggi_eventi_company on public.mezzi_viaggi_eventi(company_id,viaggio_id);
alter table public.mezzi_viaggi enable row level security;
alter table public.mezzi_viaggi_eventi enable row level security;
revoke all on public.mezzi_viaggi,public.mezzi_viaggi_eventi from public,anon,authenticated;
-- All access through checked RPCs: workers never see rates or other drivers' itineraries.

create or replace function public.mezzi_viaggi_contesto(p_mezzo uuid,p_q text default '',p_order uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public,pg_temp as $$
declare m public.mezzi; ufficio boolean; elenco jsonb; n integer;
begin
 if auth.uid() is null or public.utente_bloccato() or public.chiamante_anonimo() then raise insufficient_privilege using message='Accesso non consentito'; end if;
 select * into m from public.mezzi where id=p_mezzo and deleted_at is null;
 if not found then raise insufficient_privilege using message='Mezzo non disponibile'; end if;
 ufficio:=public.has_permission_for_company(auth.uid(),'can_view_mezzi',m.company_id);
 if not ufficio and not exists(select 1 from public.miei_hr_profili() p where p=m.assegnato_hr_profilo_id) then raise insufficient_privilege using message='Il mezzo non è in carico a te'; end if;
 if m.contatore_unita<>'km' or m.tipo not in ('autovettura','furgone','autocarro','altro') then raise exception 'Questo registro è per mezzi stradali con contatore in km'; end if;
 select coalesce(jsonb_agg(x.r),'[]'::jsonb),count(*) into elenco,n from (
  select jsonb_build_object('id',o.id,'label',concat_ws(' · ',o.order_code,coalesce(o.work_address,o.indirizzo_lavori)),
   'indirizzo',coalesce(o.work_address,o.indirizzo_lavori),'lat',o.work_lat,'lng',o.work_lng) r
  from public.orders o where o.company_id=m.company_id and o.deleted_at is null
   and ((ufficio and public.has_permission_for_company(auth.uid(),'can_view_orders',m.company_id)) or public.campo_lavoro_su_commessa(o.id))
   and (o.id=p_order or coalesce(p_q,'')='' or o.order_code ilike '%'||left(p_q,100)||'%' or coalesce(o.work_address,o.indirizzo_lavori,'') ilike '%'||left(p_q,100)||'%')
  order by (o.id=p_order) desc nulls last,o.created_at desc,o.id limit 51
 ) x;
 return jsonb_build_object('mezzo',jsonb_build_object('id',m.id,'nome',m.nome,'contatore',m.contatore,'contatore_unita',m.contatore_unita,'conducente_hr_id',m.assegnato_hr_profilo_id,
  'conducente',(select concat_ws(' ',nome,cognome) from public.hr_profili where id=m.assegnato_hr_profilo_id and company_id=m.company_id)),
  'cantieri',case when n>50 then elenco-50 else elenco end,'altri_cantieri',n>50,
  'conducenti',(select coalesce(jsonb_agg(jsonb_build_object('id',hp.id,'label',concat_ws(' ',hp.nome,hp.cognome))),'[]'::jsonb) from
    (select hp.* from public.hr_profili hp where hp.company_id=m.company_id and ((ufficio and public.has_permission_for_company(auth.uid(),'can_edit_mezzi',m.company_id)) or hp.id=m.assegnato_hr_profilo_id)
      and (coalesce(p_q,'')='' or concat_ws(' ',hp.nome,hp.cognome) ilike '%'||left(p_q,100)||'%' or hp.id=m.assegnato_hr_profilo_id)
      order by (hp.id=m.assegnato_hr_profilo_id) desc nulls last,hp.cognome,hp.nome,hp.id limit 200) hp),
  'sede',(select jsonb_build_object('label','Sede','lat',operational_lat,'lng',operational_lng) from public.companies where id=m.company_id),
  'puo_verificare',public.has_permission_for_company(auth.uid(),'can_edit_mezzi',m.company_id) and not public.utente_sola_lettura(m.company_id),
  'vede_costi',public.has_permission_for_company(auth.uid(),'can_view_costs',m.company_id),
  'puo_scrivere',not public.utente_sola_lettura(m.company_id) and (public.has_permission_for_company(auth.uid(),'can_edit_mezzi',m.company_id)
    or exists(select 1 from public.miei_hr_profili() p where p=m.assegnato_hr_profilo_id)));
end $$;

create or replace function public.mezzi_viaggi_salva(p_mezzo uuid,p_id uuid,p_versione integer,p_token uuid,p_azione text,p_dati jsonb,p_motivo text default '') returns jsonb
language plpgsql security definer set search_path = public,pg_temp as $$
declare m public.mezzi; v public.mezzi_viaggi; nuovo boolean; ufficio boolean; l jsonb; oid uuid;
 inizio timestamptz; fine timestamptz; ci numeric; cf numeric; km numeric; minuti numeric; totale numeric:=0;
 tutte_note boolean:=true; tutte_confermate boolean:=true; tutte_attribuite boolean:=true; stato_nuovo text; tariffa numeric;
 ids text[]:='{}'; richiesta jsonb; conducente uuid; minuti_totali numeric:=0; precedente text; tappe_continue boolean:=true;
begin
 if auth.uid() is null or public.utente_bloccato() or public.chiamante_anonimo() then raise insufficient_privilege using message='Accesso non consentito'; end if;
 if p_id is null or p_token is null or p_versione is null or p_versione<0 or p_azione is null or p_azione not in ('salva','invia','verifica','annulla') or p_dati is null or jsonb_typeof(p_dati)<>'object' or octet_length(p_dati::text)>64000 then raise exception 'Richiesta non valida'; end if;
 select * into m from public.mezzi where id=p_mezzo and deleted_at is null for update;
 if not found then raise insufficient_privilege using message='Mezzo non disponibile'; end if;
 if public.utente_sola_lettura(m.company_id) then raise insufficient_privilege using message='Profilo in sola lettura'; end if;
 ufficio:=public.has_permission_for_company(auth.uid(),'can_edit_mezzi',m.company_id);
 if not ufficio and not exists(select 1 from public.miei_hr_profili() p where p=m.assegnato_hr_profilo_id) then raise insufficient_privilege using message='Il mezzo non è più in carico a te'; end if;
 if m.contatore_unita<>'km' or m.tipo not in ('autovettura','furgone','autocarro','altro') then raise exception 'Registro ammesso solo per mezzi stradali'; end if;
 select * into v from public.mezzi_viaggi where id=p_id for update; nuovo:=not found;
 if not nuovo and (v.company_id<>m.company_id or v.mezzo_id<>m.id or (not ufficio and v.created_by<>auth.uid())) then raise insufficient_privilege using message='Viaggio non modificabile'; end if;
 richiesta:=jsonb_build_object('azione',p_azione,'dati',p_dati,'motivo',coalesce(p_motivo,''));
 if not nuovo and v.ultimo_token=p_token then
  if v.ultima_richiesta<>richiesta then raise exception 'Richiesta riutilizzata con dati diversi'; end if;
  return jsonb_build_object('id',v.id,'versione',v.versione);
 end if;
 if (nuovo and p_versione<>0) or (not nuovo and v.versione<>p_versione) then raise serialization_failure using message='Viaggio aggiornato da un altro dispositivo. Ricarica prima di modificare'; end if;
 if p_azione in ('verifica','annulla') and not ufficio then raise insufficient_privilege using message='Serve la verifica dell’ufficio'; end if;
 if not nuovo and v.stato in ('verificato','annullato') then
  if not ufficio or length(trim(coalesce(p_motivo,'')))<5 then raise exception 'Per rettificare o riaprire serve un motivo (almeno 5 caratteri)'; end if;
 end if;
 if p_azione='annulla' and (nuovo or length(trim(coalesce(p_motivo,'')))<5) then raise exception 'Indica il motivo dell’annullamento'; end if;
 if length(coalesce(p_motivo,''))>1000 or length(coalesce(p_dati->>'note',''))>2000 then raise exception 'Note troppo lunghe'; end if;
 inizio:=(p_dati->>'partenza')::timestamptz; fine:=(p_dati->>'arrivo')::timestamptz;
 if inizio is null or fine is null or fine<=inizio or fine>inizio+interval '48 hours' or fine>now()+interval '5 minutes' then raise exception 'Orari non validi: registra viaggi effettuati, entro 48 ore'; end if;
 conducente:=case when p_dati ? 'conducente_hr_id' then (p_dati->>'conducente_hr_id')::uuid when nuovo then m.assegnato_hr_profilo_id else v.conducente_hr_id end;
 if not ufficio and conducente is distinct from m.assegnato_hr_profilo_id then raise insufficient_privilege using message='Puoi dichiarare solo viaggi guidati da te'; end if;
 if conducente is not null and not exists(select 1 from public.hr_profili hp where hp.id=conducente and hp.company_id=m.company_id) then raise insufficient_privilege using message='Conducente di altra azienda'; end if;
 ci:=(p_dati->>'contatore_inizio')::numeric; cf:=(p_dati->>'contatore_fine')::numeric;
 if (ci is null)<>(cf is null) or (ci is not null and (ci<0 or cf<ci or cf>100000000 or ci::text in ('NaN','Infinity','-Infinity') or cf::text in ('NaN','Infinity','-Infinity'))) then raise exception 'Contachilometri non valido'; end if;
 tariffa:=(p_dati->>'tariffa_km')::numeric;
 if tariffa is not null and (not ufficio or not public.has_permission_for_company(auth.uid(),'can_view_costs',m.company_id)) then raise insufficient_privilege using message='Tariffe riservate all’ufficio autorizzato'; end if;
 if tariffa is not null and (tariffa<0 or tariffa>1000 or tariffa::text in ('NaN','Infinity','-Infinity')) then raise exception 'Tariffa non valida'; end if;
 if jsonb_typeof(p_dati->'tratte') is distinct from 'array' or jsonb_array_length(p_dati->'tratte') not between 1 and 30 then raise exception 'Servono da 1 a 30 tratte'; end if;
 for l in select value from jsonb_array_elements(p_dati->'tratte') loop
  if jsonb_typeof(l)<>'object' or length(trim(coalesce(l->>'da',''))) not between 1 and 250 or length(trim(coalesce(l->>'a',''))) not between 1 and 250 then raise exception 'Partenza e destinazione obbligatorie'; end if;
  if nullif(l->>'id','') is null or length(l->>'id')>64 or (l->>'id')=any(ids) then raise exception 'Tratta duplicata o senza identificativo'; end if; ids:=array_append(ids,l->>'id');
  if (l->>'fonte') is null or (l->>'fonte') not in ('stimati','dichiarati') or (l->>'destinazione') is null or (l->>'destinazione') not in ('commessa','generale','da_attribuire') then raise exception 'Fonte o attribuzione non valida'; end if;
  km:=(l->>'km')::numeric; minuti:=(l->>'minuti')::numeric; oid:=(l->>'order_id')::uuid;
  if km is not null and (km<0 or km>10000 or km::text in ('NaN','Infinity','-Infinity')) then raise exception 'Km non validi'; end if;
  if minuti is not null and (minuti<0 or minuti>2880 or minuti::text in ('NaN','Infinity','-Infinity')) then raise exception 'Minuti non validi'; end if;
  minuti_totali:=minuti_totali+coalesce(minuti,0);
  if precedente is not null and lower(trim(precedente))<>lower(trim(l->>'da')) then tappe_continue:=false; end if;
  precedente:=l->>'a';
  if (l->>'destinazione'='commessa')<>(oid is not null) then raise exception 'Attribuzione della tratta incoerente'; end if;
  if oid is not null and not exists(select 1 from public.orders o where o.id=oid and o.company_id=m.company_id and o.deleted_at is null
    and ((ufficio and public.has_permission_for_company(auth.uid(),'can_view_orders',m.company_id)) or public.campo_lavoro_su_commessa(o.id))) then raise insufficient_privilege using message='Commessa non accessibile o di altra azienda'; end if;
  totale:=totale+coalesce(km,0); tutte_note:=tutte_note and km is not null;
  tutte_confermate:=tutte_confermate and l->>'fonte'='dichiarati'; tutte_attribuite:=tutte_attribuite and l->>'destinazione'<>'da_attribuire';
 end loop;
 stato_nuovo:=case p_azione when 'salva' then 'bozza' when 'invia' then 'inviato' when 'verifica' then 'verificato' else 'annullato' end;
 if stato_nuovo='verificato' and (conducente is null or not tappe_continue or minuti_totali>extract(epoch from (fine-inizio))/60+1 or not tutte_note or not tutte_confermate or not tutte_attribuite or (ci is not null and abs(cf-ci-totale)>0.1)) then raise exception 'Prima della verifica completa conducente, km, tappe, tempi, attribuzioni e riconcilia il contatore'; end if;
 if stato_nuovo in ('inviato','verificato') then
  if exists(select 1 from public.mezzi_viaggi x where x.mezzo_id=m.id and x.id<>p_id and x.stato in ('inviato','verificato') and tstzrange(x.partenza,x.arrivo,'[)') && tstzrange(inizio,fine,'[)')) then raise exception 'Il mezzo ha già un viaggio in questo intervallo. Controlla i doppioni'; end if;
  if ci is not null and exists(select 1 from public.mezzi_viaggi x where x.mezzo_id=m.id and x.id<>p_id and x.stato in ('inviato','verificato') and ((x.arrivo<=inizio and x.contatore_fine>ci) or (x.partenza>=fine and x.contatore_inizio<cf))) then raise exception 'Contachilometri incoerente con un altro viaggio'; end if;
 end if;
 if nuovo then
  insert into public.mezzi_viaggi(id,company_id,mezzo_id,created_by,conducente_hr_id,partenza,arrivo,contatore_inizio,contatore_fine,tratte,note,tariffa_km,stato,ultimo_token,ultima_richiesta)
  values(p_id,m.company_id,m.id,auth.uid(),conducente,inizio,fine,ci,cf,p_dati->'tratte',coalesce(p_dati->>'note',''),tariffa,stato_nuovo,p_token,richiesta) returning * into v;
 else
  update public.mezzi_viaggi set partenza=inizio,arrivo=fine,contatore_inizio=ci,contatore_fine=cf,tratte=p_dati->'tratte',note=coalesce(p_dati->>'note',''),conducente_hr_id=conducente,
   tariffa_km=case when ufficio and public.has_permission_for_company(auth.uid(),'can_view_costs',m.company_id) then tariffa else tariffa_km end,
   stato=stato_nuovo,versione=versione+1,ultimo_token=p_token,ultima_richiesta=richiesta,updated_at=now() where id=p_id returning * into v;
 end if;
 insert into public.mezzi_viaggi_eventi(company_id,viaggio_id,actor,versione,azione,motivo,fotografia)
 values(v.company_id,v.id,auth.uid(),v.versione,p_azione,coalesce(p_motivo,''),to_jsonb(v)-'ultima_richiesta'-'ultimo_token');
 return jsonb_build_object('id',v.id,'versione',v.versione);
end $$;

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
    and v.partenza<((p_al+1)::timestamp at time zone 'Europe/Rome') and v.arrivo>(p_dal::timestamp at time zone 'Europe/Rome')
  order by v.partenza desc,v.id limit 51 offset p_offset
 ) x;
 return jsonb_build_object('items',case when n>50 then risultati-50 else risultati end,'has_more',n>50);
end $$;

create or replace function public.mezzi_viaggi_storico(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v public.mezzi_viaggi;
begin
 select * into v from public.mezzi_viaggi where id=p_id;
 if not found or auth.uid() is null or public.utente_bloccato() or public.chiamante_anonimo() or not public.has_permission_for_company(auth.uid(),'can_view_mezzi',v.company_id) then raise insufficient_privilege using message='Storico riservato all’ufficio'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('versione',e.versione,'azione',e.azione,'motivo',e.motivo,'created_at',e.created_at) order by e.versione desc),'[]'::jsonb) from public.mezzi_viaggi_eventi e where e.viaggio_id=p_id);
end $$;
revoke all on function public.mezzi_viaggi_contesto(uuid,text,uuid),public.mezzi_viaggi_salva(uuid,uuid,integer,uuid,text,jsonb,text),public.mezzi_viaggi_elenco(uuid,uuid,uuid,date,date,integer),public.mezzi_viaggi_storico(uuid) from public,anon;
grant execute on function public.mezzi_viaggi_contesto(uuid,text,uuid),public.mezzi_viaggi_salva(uuid,uuid,integer,uuid,text,jsonb,text),public.mezzi_viaggi_elenco(uuid,uuid,uuid,date,date,integer),public.mezzi_viaggi_storico(uuid) to authenticated;
