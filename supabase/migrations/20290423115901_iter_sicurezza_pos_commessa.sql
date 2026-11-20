set local lock_timeout = '3s';
set local statement_timeout = '60s';

create schema if not exists sicurezza_privata;

create table if not exists public.sicurezza_avvio_commessa (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  order_id uuid not null,
  stato text not null check (stato in ('da_valutare', 'previsto', 'non_previsto')),
  motivazione text check (length(motivazione) <= 2000),
  psc jsonb,
  versione uuid not null default gen_random_uuid(),
  autore uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  unique (company_id, order_id),
  foreign key (order_id, company_id) references public.orders(id, company_id),
  check (psc is null or stato = 'previsto'),
  check (stato <> 'non_previsto' or coalesce(length(trim(motivazione)), 0) > 0)
);

create table if not exists public.sicurezza_ruoli_commessa (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  order_id uuid not null,
  subappaltatore_id uuid not null,
  ruolo text not null check (ruolo in ('da_valutare', 'esecutrice', 'autonomo', 'fornitura')),
  unique (company_id, order_id, subappaltatore_id),
  foreign key (order_id, company_id) references public.orders(id, company_id),
  foreign key (subappaltatore_id, company_id) references public.subappaltatori_sicurezza(id, company_id)
);

create table if not exists public.sicurezza_consegne_pos (
  id uuid primary key references public.sicurezza_fascicolo(id),
  company_id uuid not null,
  order_id uuid not null,
  subappaltatore_id uuid not null,
  nome_commessa text not null,
  stato text not null check (stato in ('richiesto','ricevuto','integrazione','congruo','inoltrato','positivo','negativo')),
  corrente boolean not null default true,
  revisione text,
  file_path text,
  file_name text,
  ricevuto_il date,
  inoltrato_il date,
  cse_ricevuto_il date,
  esito_il date,
  psc_comunicato jsonb,
  psc_comunicato_il date,
  psc_alla_ricezione jsonb,
  versione_avvio uuid,
  pos_affidataria_id uuid references public.pos_documents(id),
  pos_affidataria_revisione integer,
  nota text check (length(nota) <= 2000),
  updated_at timestamptz not null default now(),
  foreign key (order_id, company_id) references public.orders(id, company_id),
  foreign key (subappaltatore_id, company_id) references public.subappaltatori_sicurezza(id, company_id)
);
create unique index if not exists sicurezza_consegne_pos_corrente
  on public.sicurezza_consegne_pos(company_id, order_id, subappaltatore_id) where corrente;
create index if not exists sicurezza_consegne_pos_ditta on public.sicurezza_consegne_pos(subappaltatore_id, company_id);

create or replace function sicurezza_privata.scrive(_company uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select auth.uid() is not null
     and coalesce(public.has_permission_for_company(auth.uid(), 'can_view_sicurezza_cantiere', _company), false)
     and not coalesce(public.utente_sola_lettura(_company), true)
$$;

create or replace function sicurezza_privata.impresa_in_commessa(_company uuid, _ordine uuid, _sub uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.subappaltatori_sicurezza s
    where s.id = _sub and s.company_id = _company and (
      s.order_id = _ordine
      or exists (select 1 from public.contratti_subappalto c
                 where c.company_id = _company and c.order_id = _ordine and c.subappaltatore_id = _sub
                   and c.stato not in ('annullato','risolto'))
      or exists (select 1 from public.subappaltatori_assegnazioni a
                 where a.company_id = _company and a.order_id = _ordine and a.subappaltatore_id = _sub)
    )
  )
$$;

-- Soltanto il login Campo della ditta collegata e i documenti della commessa richiesta.
create or replace function sicurezza_privata.login_ditta(_company uuid, _ordine uuid, _sub uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
     and sicurezza_privata.impresa_in_commessa(_company, _ordine, _sub)
     and exists (
       select 1 from public.subappaltatori_sicurezza ss
       join public.subappaltatori s on s.id = ss.campo_subappaltatore_id and s.company_id = ss.company_id
       join public.orders o on o.id = _ordine and o.company_id = ss.company_id and o.deleted_at is null
       where ss.company_id = _company and ss.id = _sub and s.user_id = auth.uid()
         and coalesce(s.is_active, true)
     )
$$;
revoke all on function sicurezza_privata.scrive(uuid), sicurezza_privata.impresa_in_commessa(uuid,uuid,uuid),
  sicurezza_privata.login_ditta(uuid,uuid,uuid) from public, anon, authenticated;
grant usage on schema sicurezza_privata to authenticated;
grant execute on function sicurezza_privata.login_ditta(uuid,uuid,uuid) to authenticated;

do $$
declare t text;
begin
  foreach t in array array['sicurezza_avvio_commessa','sicurezza_ruoli_commessa','sicurezza_consegne_pos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated, service_role', t);
    execute format('drop policy if exists lettura_ufficio on public.%I', t);
    execute format('create policy lettura_ufficio on public.%I for select to authenticated using (public.has_permission_for_company((select auth.uid()),''can_view_sicurezza_cantiere'',company_id))', t);
    execute format('drop trigger if exists registra_evento_fascicolo on public.%I', t);
    execute format('create trigger registra_evento_fascicolo after insert or update on public.%I for each row execute function public.registra_evento_fascicolo()', t);
  end loop;
end $$;
drop policy if exists lettura_ditta on public.sicurezza_consegne_pos;
create policy lettura_ditta on public.sicurezza_consegne_pos for select to authenticated
using (sicurezza_privata.login_ditta(company_id, order_id, subappaltatore_id));

create or replace function sicurezza_privata.psc_utilizzabile(_company uuid, _ordine uuid, _psc jsonb)
returns boolean language plpgsql stable security invoker set search_path = '' as $$
declare fonte jsonb; contenitore text; dimensione text;
begin
  if jsonb_typeof(_psc) is distinct from 'object'
    or _psc->>'company_id' is distinct from _company::text or _psc->>'order_id' is distinct from _ordine::text
    or coalesce(_psc->>'id', '') !~ '^[a-f0-9-]{36}$'
    or coalesce(_psc->>'sha256', '') !~ '^[a-f0-9]{64}$'
    or coalesce(length(trim(_psc->>'revisione')), 0) not between 1 and 120
  then return false; end if;

  if _psc->>'archivio' = 'sicurezza_fascicolo' then
    select to_jsonb(f) into fonte from public.sicurezza_fascicolo f
    where f.id::text = _psc->>'id' and f.company_id = _company and f.order_id = _ordine and f.tipo = 'psc'
      and f.subappaltatore_id is null and f.operaio_id is null and f.stato not in ('superato','non_applicabile');
    contenitore := 'fascicoli-cantiere';
  elsif _psc->>'archivio' = 'sicurezza_documenti' then
    select to_jsonb(f) into fonte from public.sicurezza_documenti f
    where f.id::text = _psc->>'id' and f.company_id = _company and f.order_id = _ordine and f.tipo = 'psc'
      and f.subappaltatore_id is null;
    contenitore := 'sicurezza-documenti';
  end if;
  if fonte is null or _psc->>'file_path' is distinct from fonte->>'file_path'
     or _psc->>'file_name' is distinct from trim(coalesce(fonte->>'file_name', ''))
     or _psc->>'titolo' is distinct from trim(fonte->>'titolo')
     or _psc->>'data_documento' is distinct from coalesce(fonte->>'data_rilascio',fonte->>'data_documento','')
     or (nullif(trim(fonte->>'revisione'),'') is not null and _psc->>'revisione' is distinct from trim(fonte->>'revisione'))
     or split_part(coalesce(_psc->>'file_path',''), '/', 1) <> _company::text
  then return false; end if;
  select o.metadata->>'size' into dimensione from storage.objects o
    where o.bucket_id = contenitore and o.name = _psc->>'file_path';
  return case when coalesce(dimensione,'') ~ '^[0-9]{1,12}$' then dimensione::bigint between 1 and 20971520 else false end;
end $$;
revoke all on function sicurezza_privata.psc_utilizzabile(uuid,uuid,jsonb) from public, anon, authenticated;

create or replace function public.sicurezza_salva_avvio_pos(
  _company uuid, _ordine uuid, _atteso timestamptz, _stato text, _motivazione text, _psc jsonb
) returns public.sicurezza_avvio_commessa
language plpgsql security definer set search_path = '' as $$
declare decisione public.sicurezza_avvio_commessa;
begin
  if not sicurezza_privata.scrive(_company) then raise exception 'Operazione riservata all’ufficio sicurezza' using errcode = '42501'; end if;
  perform 1 from public.orders where id = _ordine and company_id = _company and deleted_at is null for update;
  if not found then raise exception 'Commessa non disponibile'; end if;
  select * into decisione from public.sicurezza_avvio_commessa where company_id = _company and order_id = _ordine for update;
  if decisione.updated_at is distinct from _atteso then raise exception 'L’avvio sicurezza è cambiato. Ricarica e riprova.' using errcode = '40001'; end if;
  if _psc is not null and not sicurezza_privata.psc_utilizzabile(_company, _ordine, _psc)
  then raise exception 'Collega un originale PSC disponibile di questa commessa, fino a 20 MB.'; end if;
  if decisione.id is not null and (decisione.stato,decisione.motivazione,decisione.psc) is not distinct from (_stato,nullif(trim(_motivazione),''),_psc)
  then return decisione; end if;
  insert into public.sicurezza_avvio_commessa as a(company_id,order_id,stato,motivazione,psc,autore)
  values (_company,_ordine,_stato,nullif(trim(_motivazione),''),_psc,auth.uid())
  on conflict (company_id,order_id) do update set
    stato = excluded.stato, motivazione = excluded.motivazione, psc = excluded.psc, autore = excluded.autore, updated_at = now(),
    versione = case when (a.stato,a.psc) is distinct from (excluded.stato,excluded.psc) then gen_random_uuid() else a.versione end
  returning * into decisione;
  return decisione;
end $$;

create or replace function public.sicurezza_salva_ruolo_pos(_company uuid, _ordine uuid, _sub uuid, _ruolo text)
returns void language plpgsql security definer set search_path = '' as $$
declare precedente text;
begin
  if not sicurezza_privata.scrive(_company) or not sicurezza_privata.impresa_in_commessa(_company,_ordine,_sub)
     or not exists (select 1 from public.orders where id = _ordine and company_id = _company and deleted_at is null)
  then raise exception 'Impresa o commessa non disponibile' using errcode = '42501'; end if;
  perform 1 from public.orders where id = _ordine and company_id = _company for update;
  select ruolo into precedente from public.sicurezza_ruoli_commessa
    where company_id = _company and order_id = _ordine and subappaltatore_id = _sub;
  insert into public.sicurezza_ruoli_commessa(company_id,order_id,subappaltatore_id,ruolo)
  values (_company,_ordine,_sub,_ruolo)
  on conflict (company_id,order_id,subappaltatore_id) do update set ruolo = excluded.ruolo;
  if _ruolo = 'esecutrice' and precedente is distinct from _ruolo then
    update public.sicurezza_avvio_commessa set stato='da_valutare', versione=gen_random_uuid(), autore=auth.uid(),updated_at=now()
    where company_id=_company and order_id=_ordine and stato='non_previsto';
  end if;
end $$;

-- Le emissioni archiviate restano leggibili. Una nuova emissione usa la scelta corrente della commessa.
create or replace function sicurezza_privata.guardia_avvio_pos()
returns trigger language plpgsql security definer set search_path = '' as $$
declare decisione public.sicurezza_avvio_commessa; ref jsonb;
begin
  if coalesce(new.document_type,'pos') <> 'pos' or new.status <> 'approvato'
    or (tg_op = 'UPDATE' and old.status = 'approvato') then return new; end if;
  select * into decisione from public.sicurezza_avvio_commessa where company_id = new.company_id and order_id = new.order_id for share;
  if decisione.id is null or decisione.stato = 'da_valutare'
  then raise exception 'Conferma l’applicabilità del PSC in Avvio sicurezza prima di approvare il POS'; end if;
  ref := new.contenuto->'procedure_psc'->'documento';
  if decisione.stato = 'previsto' and decisione.psc->>'archivio' = 'sicurezza_fascicolo' then
    perform 1 from public.sicurezza_fascicolo
      where id::text=decisione.psc->>'id' and company_id=new.company_id and order_id=new.order_id
        and stato not in ('superato','non_applicabile') for share;
    if not found then raise exception 'Il PSC scelto è superato o non più disponibile'; end if;
  end if;
  if decisione.stato = 'previsto' and (
    not sicurezza_privata.psc_utilizzabile(new.company_id,new.order_id,decisione.psc)
    or new.contenuto->'versione_psc' is distinct from '1'::jsonb
    or new.contenuto->'procedure_psc'->'psc_presente' is distinct from 'true'::jsonb
    or ref is distinct from decisione.psc
  ) then raise exception 'Collega la revisione vigente del PSC e riesamina il POS prima di approvarlo'; end if;
  if decisione.stato = 'non_previsto' and new.contenuto->'procedure_psc'->'psc_presente' is distinct from 'false'::jsonb
  then raise exception 'Allinea il POS alla decisione PSC registrata in Avvio sicurezza'; end if;
  return new;
end $$;
revoke all on function sicurezza_privata.guardia_avvio_pos() from public, anon, authenticated;
drop trigger if exists pos_avvio_guardia on public.pos_documents;
create trigger pos_avvio_guardia before insert or update of status on public.pos_documents
for each row execute function sicurezza_privata.guardia_avvio_pos();

revoke all on function public.sicurezza_salva_avvio_pos(uuid,uuid,timestamptz,text,text,jsonb),
  public.sicurezza_salva_ruolo_pos(uuid,uuid,uuid,text) from public, anon;
grant execute on function public.sicurezza_salva_avvio_pos(uuid,uuid,timestamptz,text,text,jsonb),
  public.sicurezza_salva_ruolo_pos(uuid,uuid,uuid,text) to authenticated;

-- Crea la richiesta oppure prende in carico un POS già ricevuto, riusando l'evidenza.
create or replace function public.sicurezza_richiesta_pos(
  _company uuid, _ordine uuid, _sub uuid, _fonte uuid default null, _ricevuto date default null
) returns public.sicurezza_consegne_pos
language plpgsql security definer set search_path = '' as $$
declare c public.sicurezza_consegne_pos; f public.sicurezza_fascicolo; attiva public.sicurezza_consegne_pos; nome text;
begin
  if not sicurezza_privata.scrive(_company) or not sicurezza_privata.impresa_in_commessa(_company,_ordine,_sub)
  then raise exception 'Impresa o commessa non disponibile' using errcode = '42501'; end if;
  select coalesce(nullif(concat_ws(' · ', o.order_code, o.description), ''), 'Commessa') into nome
  from public.orders o where o.id = _ordine and o.company_id = _company and o.deleted_at is null for update;
  if not found then raise exception 'Commessa non disponibile'; end if;
  if not exists (select 1 from public.sicurezza_ruoli_commessa
    where company_id = _company and order_id = _ordine and subappaltatore_id = _sub and ruolo = 'esecutrice')
  then raise exception 'Conferma il ruolo di impresa esecutrice in Avvio sicurezza'; end if;

  select * into attiva from public.sicurezza_consegne_pos
  where company_id = _company and order_id = _ordine and subappaltatore_id = _sub and corrente for update;
  if (attiva.stato = 'richiesto' and _fonte is null) or attiva.id = _fonte then return attiva; end if;

  if _fonte is not null then
    select * into f from public.sicurezza_fascicolo
      where id = _fonte and company_id = _company and order_id = _ordine and subappaltatore_id = _sub
        and operaio_id is null and tipo = 'pos' and file_path is not null and stato not in ('superato','non_applicabile') for update;
    if not found then raise exception 'Scegli il POS di questa ditta e di questa commessa'; end if;
    if nullif(trim(f.revisione),'') is null then raise exception 'Indica la revisione nella scheda del documento'; end if;
    if _ricevuto is null or _ricevuto > (now() at time zone 'Europe/Rome')::date
    then raise exception 'Indica la data effettiva di ricezione'; end if;
    if exists(select 1 from public.sicurezza_consegne_pos where id = _fonte)
    then raise exception 'Questa copia è già nello storico. Per integrare, carica una nuova revisione.'; end if;
  else
    insert into public.sicurezza_fascicolo(company_id,order_id,subappaltatore_id,tipo,titolo,stato)
    values (_company,_ordine,_sub,'pos','POS della ditta per il cantiere','richiesto') returning * into f;
  end if;

  if attiva.id is not null then
    update public.sicurezza_consegne_pos set corrente = false, updated_at = now() where id = attiva.id;
    update public.sicurezza_fascicolo set stato = 'superato' where id = attiva.id;
  end if;
  insert into public.sicurezza_consegne_pos(id,company_id,order_id,subappaltatore_id,nome_commessa,stato,
    revisione,file_path,file_name,ricevuto_il,psc_comunicato,psc_comunicato_il)
  values (f.id,_company,_ordine,_sub,nome,case when _fonte is null then 'richiesto' else 'ricevuto' end,
    f.revisione,f.file_path,f.file_name,_ricevuto,attiva.psc_comunicato,attiva.psc_comunicato_il)
  returning * into c;
  return c;
end $$;

create or replace function public.sicurezza_avanza_pos_esterno(
  _id uuid, _atteso timestamptz, _azione text, _data date default null, _nota text default null,
  _path text default null, _nome text default null, _revisione text default null
) returns public.sicurezza_consegne_pos
language plpgsql security definer set search_path = '' as $$
declare c public.sicurezza_consegne_pos; a public.sicurezza_avvio_commessa; f public.sicurezza_fascicolo;
  affidataria public.pos_documents;
  ufficio boolean; oggi date := (now() at time zone 'Europe/Rome')::date; passo text; dimensione text;
begin
  select * into c from public.sicurezza_consegne_pos where id = _id;
  if not found then raise exception 'Richiesta POS non disponibile' using errcode = '42501'; end if;
  ufficio := sicurezza_privata.scrive(c.company_id);
  if not ufficio and (_azione is distinct from 'ricevi' or not sicurezza_privata.login_ditta(c.company_id,c.order_id,c.subappaltatore_id))
  then raise exception 'Richiesta POS non disponibile' using errcode = '42501'; end if;
  perform 1 from public.orders where id = c.order_id and company_id = c.company_id and deleted_at is null for share;
  if not found or not sicurezza_privata.impresa_in_commessa(c.company_id,c.order_id,c.subappaltatore_id)
  then raise exception 'Impresa o commessa non più collegata'; end if;
  select * into a from public.sicurezza_avvio_commessa where company_id = c.company_id and order_id = c.order_id for share;
  select * into c from public.sicurezza_consegne_pos where id = _id for update;
  if not c.corrente then raise exception 'C’è una richiesta o revisione più recente'; end if;
  if _azione = 'ricevi' and c.file_path = _path and c.revisione = trim(_revisione) then return c; end if;
  if c.updated_at is distinct from _atteso then raise exception 'Il POS è cambiato. Ricarica e riprova.' using errcode = '40001'; end if;
  if not exists (select 1 from public.sicurezza_ruoli_commessa
    where company_id = c.company_id and order_id = c.order_id and subappaltatore_id = c.subappaltatore_id and ruolo = 'esecutrice')
  then raise exception 'La ditta non è classificata come esecutrice in questa commessa'; end if;
  select * into f from public.sicurezza_fascicolo where id = c.id and company_id = c.company_id and order_id = c.order_id
    and subappaltatore_id = c.subappaltatore_id and operaio_id is null and tipo = 'pos'
    and stato not in ('superato','non_applicabile') and file_path is not distinct from c.file_path for update;
  if not found then raise exception 'L’evidenza del POS è cambiata nel fascicolo'; end if;
  if coalesce(length(_nota),0) > 2000 or _data > oggi then raise exception 'Controlla data e nota'; end if;

  if _azione = 'ricevi' and c.stato = 'richiesto' then
    if _path is null or _path !~ ('^' || c.company_id::text || '/' || c.id::text || '/[a-f0-9-]{36}\.pdf$')
      or coalesce(length(trim(_revisione)),0) not between 1 and 120 or coalesce(length(trim(_nome)),0) not between 1 and 220
      or (ufficio and _data is null)
    then raise exception 'Indica revisione, PDF e data di ricezione'; end if;
    select o.metadata->>'size' into dimensione from storage.objects o
      where o.bucket_id = 'fascicoli-cantiere' and o.name = _path and o.metadata->>'mimetype' = 'application/pdf';
    if not (case when coalesce(dimensione,'') ~ '^[0-9]{1,12}$' then dimensione::bigint between 1 and 15728640 else false end)
    then raise exception 'PDF originale non disponibile o oltre 15 MB'; end if;
    update public.sicurezza_fascicolo set stato='ricevuto', file_path=_path,file_name=trim(_nome),revisione=trim(_revisione) where id=c.id;
    update public.sicurezza_consegne_pos set stato='ricevuto',file_path=_path,file_name=trim(_nome),revisione=trim(_revisione),
      psc_alla_ricezione=c.psc_comunicato,
      ricevuto_il=case when ufficio then _data else oggi end, nota=null, updated_at=now() where id=c.id returning * into c;
    return c;
  end if;

  if _azione = 'comunica_psc' then
    if not ufficio or _data is null or a.stato is distinct from 'previsto'
      or not sicurezza_privata.psc_utilizzabile(c.company_id,c.order_id,a.psc)
    then raise exception 'Collega il PSC vigente e indica la data di trasmissione'; end if;
    update public.sicurezza_consegne_pos set psc_comunicato=a.psc,psc_comunicato_il=_data,updated_at=now() where id=c.id returning * into c;
    return c;
  end if;

  if not ufficio or c.file_path is null or c.ricevuto_il is null
  then raise exception 'Acquisisci il POS prima della verifica'; end if;
  select * into affidataria from public.pos_documents where company_id=c.company_id and order_id=c.order_id
    and superseded_by is null and coalesce(document_type,'pos')='pos'
    and contenuto->'impresa'->>'ruolo' in ('affidataria','affidataria_esecutrice')
    order by created_at desc, id limit 1 for share;
  if affidataria.status is distinct from 'approvato' or not coalesce(
    case when a.stato='previsto' then affidataria.contenuto->'procedure_psc'->'documento'=a.psc
         when a.stato='non_previsto' then affidataria.contenuto->'procedure_psc'->>'psc_presente'='false' else false end
  ,false) then affidataria := null; end if;
  if _azione = 'integrazione' and c.stato in ('ricevuto','congruo','inoltrato','negativo') then
    passo := 'integrazione';
  elsif _azione = 'congruo' and (c.stato = 'ricevuto' or (c.stato in ('congruo','inoltrato','positivo') and
    (c.versione_avvio,c.pos_affidataria_id,c.pos_affidataria_revisione) is distinct from (a.versione,affidataria.id,affidataria.revisione))) then
    if a.id is null or a.stato = 'da_valutare' or (a.stato = 'previsto' and (
      not sicurezza_privata.psc_utilizzabile(c.company_id,c.order_id,a.psc)
      or c.psc_comunicato is distinct from a.psc or c.psc_comunicato_il is null))
    then raise exception 'Conferma l’avvio sicurezza e registra la trasmissione del PSC vigente'; end if;
    if affidataria.id is null then raise exception 'Approva il POS corrente dell’impresa affidataria prima della congruenza'; end if;
    passo := 'congruo';
  elsif _azione = 'inoltrato' and c.stato = 'congruo' and c.versione_avvio = a.versione and a.stato = 'previsto'
    and (c.pos_affidataria_id,c.pos_affidataria_revisione) = (affidataria.id,affidataria.revisione)
    and sicurezza_privata.psc_utilizzabile(c.company_id,c.order_id,a.psc)
    and _data >= c.ricevuto_il then
    passo := 'inoltrato';
  elsif _azione = 'ricezione_cse' and c.stato = 'inoltrato' and c.versione_avvio = a.versione
    and (c.pos_affidataria_id,c.pos_affidataria_revisione) = (affidataria.id,affidataria.revisione)
    and _data >= c.inoltrato_il then
    update public.sicurezza_consegne_pos set cse_ricevuto_il=_data,updated_at=now() where id=c.id returning * into c;
    return c;
  elsif _azione in ('positivo','negativo') and c.stato = 'inoltrato' and c.versione_avvio = a.versione
    and (c.pos_affidataria_id,c.pos_affidataria_revisione) = (affidataria.id,affidataria.revisione)
    and sicurezza_privata.psc_utilizzabile(c.company_id,c.order_id,a.psc)
    and _data >= c.cse_ricevuto_il then
    passo := _azione;
  else
    raise exception 'Passaggio non disponibile: verifica stato, revisione del PSC e date di ricezione';
  end if;
  if length(trim(coalesce(_nota,''))) = 0 then raise exception 'Registra il riferimento o il riscontro della verifica'; end if;
  update public.sicurezza_consegne_pos set stato=passo,nota=trim(_nota),
    versione_avvio=case when passo='congruo' then a.versione else versione_avvio end,
    pos_affidataria_id=case when passo='congruo' then affidataria.id else pos_affidataria_id end,
    pos_affidataria_revisione=case when passo='congruo' then affidataria.revisione else pos_affidataria_revisione end,
    inoltrato_il=case when passo='inoltrato' then _data when passo='congruo' then null else inoltrato_il end,
    cse_ricevuto_il=case when passo in ('congruo','inoltrato') then null else cse_ricevuto_il end,
    esito_il=case when passo in ('positivo','negativo') then _data when passo='congruo' then null else esito_il end,
    updated_at=now()
  where id=c.id returning * into c;
  update public.sicurezza_fascicolo set stato=case when passo='integrazione' then 'integrazione' else 'verificato' end
    where id=c.id;
  return c;
end $$;

-- Le policy del portale leggono la richiesta già filtrata dalla RLS della tabella.
drop policy if exists pos_portale_file_insert on storage.objects;
create policy pos_portale_file_insert on storage.objects for insert to authenticated with check (
  bucket_id='fascicoli-cantiere' and exists (
    select 1 from public.sicurezza_consegne_pos c
    where c.corrente and c.stato='richiesto' and c.file_path is null
      and name ~ ('^' || c.company_id::text || '/' || c.id::text || '/[a-f0-9-]{36}\.pdf$')
      and sicurezza_privata.login_ditta(c.company_id,c.order_id,c.subappaltatore_id)
  )
);
drop policy if exists pos_portale_file_select on storage.objects;
create policy pos_portale_file_select on storage.objects for select to authenticated using (
  bucket_id in ('fascicoli-cantiere','sicurezza-documenti') and exists (
    select 1 from public.sicurezza_consegne_pos c
    where sicurezza_privata.login_ditta(c.company_id,c.order_id,c.subappaltatore_id)
      and ((bucket_id='fascicoli-cantiere' and c.file_path=name)
        or (c.psc_comunicato_il is not null and c.psc_comunicato->>'file_path'=name
            and bucket_id=case when c.psc_comunicato->>'archivio'='sicurezza_fascicolo' then 'fascicoli-cantiere' else 'sicurezza-documenti' end))
  )
);

revoke all on function public.sicurezza_richiesta_pos(uuid,uuid,uuid,uuid,date),
  public.sicurezza_avanza_pos_esterno(uuid,timestamptz,text,date,text,text,text,text) from public, anon;
grant execute on function public.sicurezza_richiesta_pos(uuid,uuid,uuid,uuid,date),
  public.sicurezza_avanza_pos_esterno(uuid,timestamptz,text,date,text,text,text,text) to authenticated;

-- Il portale vede solamente gli ID dei propri POS da riesaminare.
create or replace function public.sicurezza_pos_riesami_portale(_company uuid)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select c.id
  from public.sicurezza_consegne_pos c
  left join public.sicurezza_avvio_commessa a on a.company_id=c.company_id and a.order_id=c.order_id
  left join lateral (
    select p.id,p.revisione,p.status from public.pos_documents p
    where p.company_id=c.company_id and p.order_id=c.order_id and p.superseded_by is null
      and coalesce(p.document_type,'pos')='pos' and p.contenuto->'impresa'->>'ruolo' in ('affidataria','affidataria_esecutrice')
    order by p.created_at desc,p.id limit 1
  ) p on true
  where c.company_id=_company and c.corrente
    and sicurezza_privata.login_ditta(c.company_id,c.order_id,c.subappaltatore_id)
    and (
      (c.file_path is not null and c.versione_avvio is distinct from a.versione
        and coalesce(c.psc_alla_ricezione,c.psc_comunicato) is not null
        and (a.stato is distinct from 'previsto' or coalesce(c.psc_alla_ricezione,c.psc_comunicato) is distinct from a.psc))
      or (c.versione_avvio is not null and (
        c.versione_avvio is distinct from a.versione
        or (c.pos_affidataria_id,c.pos_affidataria_revisione) is distinct from (p.id,p.revisione)
        or p.status is distinct from 'approvato'
        or (a.stato='previsto' and not sicurezza_privata.psc_utilizzabile(c.company_id,c.order_id,a.psc))
      ))
    )
$$;
revoke all on function public.sicurezza_pos_riesami_portale(uuid) from public,anon;
grant execute on function public.sicurezza_pos_riesami_portale(uuid) to authenticated;

-- Le verifiche nominative utilizzano anche i periodi inseriti dalla scheda operaio.
create or replace function public.sicurezza_addetti_fotografia_autore(_company uuid,_ordine uuid,_dal date,_al date,_fase uuid,_autore uuid) returns jsonb language plpgsql security invoker set search_path=public set timezone='UTC' as $$
declare o jsonb;f jsonb;r jsonb;finale jsonb;persona jsonb;q record;foto_originale jsonb;qualifiche jsonb:='[]';corrente boolean;begin
 if _autore is null or not coalesce(public.has_permission_for_company(_autore,'can_view_sicurezza_cantiere',_company),false) then raise exception 'Permesso Sicurezza cantiere necessario' using errcode='42501';end if;
 if _dal is null or _al is null or _al<_dal then raise exception 'Indica un periodo completo e coerente';end if;
 select jsonb_build_object('id',id,'codice',order_code,'inizio_previsto',work_start_date,'fine_prevista',work_end_date,'consegna_prevista',expected_date,'descrizione_lavori',work_description,'descrizione',description,'tipo_lavoro',tipo_lavoro,'indirizzo',coalesce(nullif(work_address,''),indirizzo_lavori)) into o from public.orders where id=_ordine and company_id=_company and deleted_at is null;
 if o is null then raise exception 'Commessa non presente in questa azienda' using errcode='42501';end if;
 if _fase is not null then
  select jsonb_build_object('id',x.id,'nome',x.name,'dal',x.start_date,'al',x.end_date,'descrizione',to_jsonb(x)->'description','posizione',x.position) into f from public.order_work_phases x where x.id=_fase and x.order_id=_ordine and x.company_id=_company;
  if f is null then raise exception 'Fase non pertinente alla commessa';end if;
  if nullif(f->>'dal','')::date>_dal or nullif(f->>'al','')::date<_al then raise exception 'Il periodo supera le date pianificate della fase: controlla date e pianificazione';end if;
 end if;
 if exists(select 1 from public.order_employees oe join public.employees e on e.id=oe.employee_id and e.company_id=_company where oe.order_id=_ordine and oe.phase_id is not null and not exists(select 1 from public.order_work_phases f where f.id=oe.phase_id and f.order_id=_ordine and f.company_id=_company)) then raise exception 'Assegnazione interna con fase non pertinente: correggi la pianificazione';end if;
 if exists(select 1 from public.order_campo_assignments a where a.company_id=_company and a.order_id=_ordine and a.role_type='employee' and a.data_inizio is not null and a.data_fine_prevista is not null and a.data_fine_prevista<a.data_inizio) then raise exception 'Accesso Campo con periodo non valido: correggi la pianificazione prima del riesame';end if;
 with sorgenti as (
  select 'employee:'||e.id::text chiave,'commessa' fonte,oe.id fonte_id,e.id employee_id,e.user_id,e.first_name nome,e.last_name cognome,oe.phase_id fase_id,_dal dal,_al al,true senza_date,e.role_type='subappaltatore' esterno_legacy,e.qualifica qualifica_fonte,e.role_type ruolo_app,false capocantiere,
   (select array_agg(h.id order by h.id) from public.hr_profili h where e.role_type<>'subappaltatore' and h.company_id=_company and (h.employee_id=e.id or e.user_id is not null and h.user_id=e.user_id and not exists(select 1 from public.hr_profili z where z.company_id=_company and z.employee_id=e.id))) hr_ids
  from public.order_employees oe join public.employees e on e.id=oe.employee_id and e.company_id=_company where oe.order_id=_ordine and (_fase is null or oe.phase_id is null or oe.phase_id=_fase)
  union all
  select 'pianificazione:'||a.id::text,'pianificazione',a.id,e.id,e.user_id,e.first_name,e.last_name,null::uuid,
   greatest(_dal,a.start_date),least(_al,a.end_date),false,e.role_type='subappaltatore',e.qualifica,e.role_type,false,
   (select array_agg(h.id order by h.id) from public.hr_profili h where e.role_type<>'subappaltatore' and h.company_id=_company and
      (h.employee_id=e.id or e.user_id is not null and h.user_id=e.user_id and not exists(select 1 from public.hr_profili z where z.company_id=_company and z.employee_id=e.id)))
  from public.cantiere_allocations a join public.employees e on e.id=a.employee_id and e.company_id=_company
  where a.company_id=_company and a.cantiere_id=_ordine and a.resource_type='employee' and a.status<>'cancelled'
    and a.start_date<=_al and a.end_date>=_dal and a.start_date<=a.end_date
  union all
  select 'campo:'||a.id::text,'campo',a.id,null::uuid,a.user_id,null::text,null::text,null::uuid,greatest(_dal,a.data_inizio),least(_al,a.data_fine_prevista),a.data_inizio is null,exists(select 1 from public.employees z where z.company_id=_company and z.user_id=a.user_id and z.role_type='subappaltatore'),null::text,a.role_type,coalesce(a.is_capocantiere,false),
   (select array_agg(distinct h.id order by h.id) from public.hr_profili h where not exists(select 1 from public.employees z where z.company_id=_company and z.user_id=a.user_id and z.role_type='subappaltatore') and h.company_id=_company and (h.user_id=a.user_id or exists(select 1 from public.employees e where e.company_id=_company and e.user_id=a.user_id and h.employee_id=e.id)))
  from public.order_campo_assignments a where a.company_id=_company and a.order_id=_ordine and a.role_type in('employee','operaio','capocantiere') and (a.data_inizio is null or a.data_inizio<=_al) and (a.data_fine_prevista is null or a.data_fine_prevista>=_dal)
 ), collegate as (
  select hr_ids[1] persona_id,jsonb_build_object('fonte',fonte,'fonte_id',fonte_id,'fase_id',fase_id,'dal',dal,'al',al,'senza_date',senza_date,'qualifica_fonte',qualifica_fonte,'ruolo_app',ruolo_app,'capocantiere',capocantiere) periodo from sorgenti where cardinality(hr_ids)=1
 ), interni as (
  select jsonb_build_object('tipo','hr','id',h.id,'nome',h.nome,'cognome',h.cognome,'mansione',h.mansione,'attivo',h.attivo,'periodi',(select jsonb_agg(z.periodo order by z.periodo::text)from(select distinct c.periodo from collegate c where c.persona_id=h.id)z)) p
  from public.hr_profili h where h.company_id=_company and exists(select 1 from collegate c where c.persona_id=h.id)
 ), esterni as (
  select jsonb_build_object('tipo','esterno','id',w.id,'nome',w.nome,'cognome',w.cognome,'mansione',w.mansione,'attivo',w.attivo,'subappaltatore_id',w.subappaltatore_id,'impresa',s.ragione_sociale,'periodi',(select jsonb_agg(jsonb_build_object('fonte','subappalto','fonte_id',a.id,'fase_id',a.fase_id,'dal',greatest(_dal,a.dal),'al',least(_al,a.al),'senza_date',false,'attivita',a.attivita,'area',a.area)order by a.id)from public.subappaltatori_assegnazioni a where a.company_id=_company and a.order_id=_ordine and a.subappaltatore_id=w.subappaltatore_id and a.operaio_id=w.id and a.dal<=_al and(a.al is null or a.al>=_dal) and(_fase is null or a.fase_id is null or a.fase_id=_fase)))p
  from public.subappaltatori_operai w join public.subappaltatori_sicurezza s on s.id=w.subappaltatore_id and s.company_id=_company where w.company_id=_company and exists(select 1 from public.subappaltatori_assegnazioni a where a.company_id=_company and a.order_id=_ordine and a.subappaltatore_id=w.subappaltatore_id and a.operaio_id=w.id and a.dal<=_al and(a.al is null or a.al>=_dal) and(_fase is null or a.fase_id is null or a.fase_id=_fase))
 )select jsonb_build_object('persone',coalesce((select jsonb_agg(p order by p->>'tipo',p->>'id') from(select p from interni union all select p from esterni)t),'[]'),'da_collegare',coalesce((select jsonb_agg(jsonb_build_object('chiave',chiave,'fonte',fonte,'fonte_id',fonte_id,'nome',nome,'cognome',cognome,'motivo',case when esterno_legacy then 'Anagrafica esterna legacy: riconciliare nel fascicolo del subappaltatore' when coalesce(cardinality(hr_ids),0)=0 then 'Profilo HR non collegato' else 'Collegamento HR ambiguo' end)order by chiave,fonte_id)from sorgenti where coalesce(cardinality(hr_ids),0)<>1),'[]')) into r;
 -- A foreign/missing employee reference is an unresolved local assignment, never silently omitted.
 r:=jsonb_set(r,'{da_collegare}',(r->'da_collegare')||coalesce((select jsonb_agg(jsonb_build_object('chiave','assegnazione:'||oe.id::text,'fonte','commessa','fonte_id',oe.id,'nome',null,'cognome',null,'motivo','Persona assegnata non presente in questa azienda: verifica la riga di assegnazione')order by oe.id)from public.order_employees oe where oe.order_id=_ordine and not exists(select 1 from public.employees e where e.id=oe.employee_id and e.company_id=_company)),'[]'::jsonb));
 if jsonb_array_length(r->'persone')>100 or jsonb_array_length(r->'da_collegare')>100 then raise exception 'Organico esteso: restringi periodo e fase prima di continuare';end if;
 for persona in select value from jsonb_array_elements(r->'persone') loop
  for q in select distinct on(famiglia_id) * from public.sicurezza_qualifiche_addetti where company_id=_company and persona_tipo=persona->>'tipo' and persona_id=(persona->>'id')::uuid order by famiglia_id,versione desc loop
   if jsonb_array_length(qualifiche)>=500 then raise exception 'Più di 500 qualifiche: serve un filtro prima di continuare';end if;
   corrente:=false;begin foto_originale:=public.sicurezza_qualifica_fonte_autore(_company,persona->>'tipo',(persona->>'id')::uuid,q.fonte_id,_autore);corrente:=foto_originale->'foto'->>'impronta'=q.fonte_impronta;exception when raise_exception then corrente:=false;end;
   qualifiche:=qualifiche||jsonb_build_array(jsonb_build_object('id',q.id,'famiglia_id',q.famiglia_id,'versione',q.versione,'persona_tipo',q.persona_tipo,'persona_id',q.persona_id,'stato',q.stato,'dati',q.dati,'fonte_id',q.fonte_id,'fonte_impronta',q.fonte_impronta,'fonte_corrente',corrente,'contesto_originale',jsonb_build_object('order_id',q.fonte_snapshot->'order_id','fase_id',q.fonte_snapshot->'fase_id','dal',q.fonte_snapshot->'applicabile_dal','al',q.fonte_snapshot->'applicabile_al'),'registrato_il',q.registrato_il));
  end loop;
 end loop;
 finale:=r||jsonb_build_object('company_id',_company,'order_id',_ordine,'dal',_dal,'al',_al,'fase_id',_fase,'commessa',o,'fase',f,'qualifiche',qualifiche);
 return finale||jsonb_build_object('impronta',public.sicurezza_sds_impronta(finale));
end$$;

revoke all on function public.sicurezza_addetti_fotografia_autore(uuid,uuid,date,date,uuid,uuid) from public,anon,authenticated,service_role;
notify pgrst, 'reload schema';
