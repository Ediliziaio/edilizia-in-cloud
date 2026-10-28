-- Product usages refer to canonical order materials and original dossier files.
-- No chemical classification or technical suitability is inferred by this API.
set local lock_timeout='3s';
set local statement_timeout='60s';

create table if not exists public.sicurezza_prodotti_impieghi (
 id uuid primary key,
 company_id uuid not null references public.companies(id),
 order_id uuid not null,
 subappaltatore_id uuid references public.subappaltatori_sicurezza(id),
 materiale_id uuid,
 fase_id uuid references public.order_work_phases(id),
 nome text not null, produttore text, codice text,
 impiego text not null, area text, dal date not null, al date,
 sds_necessaria text not null check(sds_necessaria in ('da_valutare','si','no')),
 motivo_non_necessaria text,
 evidenza_id uuid references public.sicurezza_fascicolo(id),
 evidenza_impronta text, evidenza_snapshot jsonb,
 materiale_impronta text, materiale_snapshot jsonb,
 corrispondenza_confermata boolean not null default false,
 note text, annullato boolean not null default false,
 versione integer not null check(versione>0),
 aggiornato_il timestamptz not null default clock_timestamp(),
 creato_il timestamptz not null default clock_timestamp(),
 foreign key(order_id,company_id) references public.orders(id,company_id),
 check(al is null or al>=dal)
);
create index if not exists prodotti_impieghi_commessa on public.sicurezza_prodotti_impieghi(company_id,order_id,dal,id);
create index if not exists prodotti_impieghi_impresa on public.sicurezza_prodotti_impieghi(subappaltatore_id) where subappaltatore_id is not null;
create index if not exists prodotti_impieghi_fase on public.sicurezza_prodotti_impieghi(fase_id) where fase_id is not null;
create index if not exists prodotti_impieghi_evidenza on public.sicurezza_prodotti_impieghi(evidenza_id) where evidenza_id is not null;
create index if not exists prodotti_impieghi_materiale on public.sicurezza_prodotti_impieghi(materiale_id) where materiale_id is not null;
comment on column public.sicurezza_prodotti_impieghi.materiale_id is 'Stable order_items ID. No FK: removed procurement rows leave a visible missing-source condition and the original snapshot, without blocking the procurement workflow.';

create table if not exists public.sicurezza_prodotti_eventi (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 order_id uuid not null, impiego_id uuid not null,
 versione integer not null, prima jsonb, dopo jsonb not null,
 motivo text not null, registrato_da uuid not null references auth.users(id),
 registrato_il timestamptz not null default clock_timestamp(),
 richiesta_id uuid not null, richiesta jsonb not null,
 foreign key(order_id,company_id) references public.orders(id,company_id),
 unique(company_id,impiego_id,versione), unique(company_id,richiesta_id)
);
create index if not exists prodotti_eventi_commessa on public.sicurezza_prodotti_eventi(company_id,order_id,impiego_id,versione desc);
create index if not exists prodotti_eventi_autore on public.sicurezza_prodotti_eventi(registrato_da);
alter table public.sicurezza_prodotti_impieghi enable row level security;
alter table public.sicurezza_prodotti_eventi enable row level security;
revoke all on public.sicurezza_prodotti_impieghi,public.sicurezza_prodotti_eventi from public,anon,authenticated,service_role;
grant select on public.sicurezza_prodotti_impieghi,public.sicurezza_prodotti_eventi to authenticated,service_role;
drop policy if exists prodotti_impieghi_lettura on public.sicurezza_prodotti_impieghi;
create policy prodotti_impieghi_lettura on public.sicurezza_prodotti_impieghi for select to authenticated using(public.has_permission_for_company((select auth.uid()),'can_view_sicurezza_cantiere',company_id));
drop policy if exists prodotti_eventi_lettura on public.sicurezza_prodotti_eventi;
create policy prodotti_eventi_lettura on public.sicurezza_prodotti_eventi for select to authenticated using(public.has_permission_for_company((select auth.uid()),'can_view_sicurezza_cantiere',company_id));
create or replace function public.sicurezza_prodotti_evento_immutabile() returns trigger language plpgsql security invoker set search_path=public as $$begin raise exception 'Gli eventi dei prodotti non si modificano o eliminano';end$$;
revoke all on function public.sicurezza_prodotti_evento_immutabile() from public,anon,authenticated;
drop trigger if exists prodotti_evento_immutabile on public.sicurezza_prodotti_eventi;
create trigger prodotti_evento_immutabile before update or delete on public.sicurezza_prodotti_eventi for each row execute function public.sicurezza_prodotti_evento_immutabile();

create or replace function public.sicurezza_sds_contesto(_company uuid,_ordine uuid,_fase uuid default null) returns void
language plpgsql security definer set search_path=public as $$begin
 if auth.uid() is null or not public.has_permission_for_company(auth.uid(),'can_view_sicurezza_cantiere',_company) then raise exception 'Permesso Sicurezza cantiere necessario' using errcode='42501';end if;
 if not exists(select 1 from public.orders where id=_ordine and company_id=_company and deleted_at is null) then raise exception 'Commessa non disponibile';end if;
 if _fase is not null and not exists(select 1 from public.order_work_phases where id=_fase and company_id=_company and order_id=_ordine) then raise exception 'Fase non pertinente';end if;
end$$;
revoke all on function public.sicurezza_sds_contesto(uuid,uuid,uuid) from public,anon,authenticated;

create or replace function public.sicurezza_sds_materiale(m public.order_items) returns jsonb language sql stable security invoker set search_path=public as $$
 select jsonb_build_object('id',m.id,'order_id',m.order_id,'nome',m.name,'codice',m.product_code,'stock_item_id',m.stock_item_id,'fase_id',m.phase_id,'natura_riga',m.natura_riga);
$$;
revoke all on function public.sicurezza_sds_materiale(public.order_items) from public,anon,authenticated;
create or replace function public.sicurezza_sds_impronta(d jsonb) returns text language sql immutable security invoker set search_path=public as $$select encode(sha256(convert_to(d::text,'UTF8')),'hex');$$;
revoke all on function public.sicurezza_sds_impronta(jsonb) from public,anon,authenticated;
create or replace function public.sicurezza_sds_documento(e public.sicurezza_fascicolo) returns jsonb language sql stable security invoker set search_path=public set timezone='UTC' as $$
 select jsonb_build_object('id',e.id,'subappaltatore_id',e.subappaltatore_id,'order_id',e.order_id,'fase_id',e.fase_id,'titolo',e.titolo,'file_name',e.file_name,'revisione',e.revisione,'data_rilascio',e.data_rilascio,'data_scadenza',e.data_scadenza,'stato',e.stato,'applicabile_dal',e.applicabile_dal,'applicabile_al',e.applicabile_al,'updated_at',e.updated_at,'disponibile',nullif(trim(e.file_path),'') is not null and nullif(trim(e.file_name),'') is not null,'impronta',public.sicurezza_sds_impronta(to_jsonb(e)));
$$;
revoke all on function public.sicurezza_sds_documento(public.sicurezza_fascicolo) from public,anon,authenticated;

create or replace function public.sicurezza_prodotti_quadro(_company uuid,_ordine uuid,_data date,_fase uuid default null) returns jsonb
language plpgsql security definer set search_path=public as $$declare r jsonb;begin
 perform public.sicurezza_sds_contesto(_company,_ordine,_fase);
 if _data is null then raise exception 'Indica la data di riferimento';end if;
 with imprese as (
 select s.id,s.ragione_sociale from public.subappaltatori_sicurezza s where s.company_id=_company and (s.order_id=_ordine or exists(select 1 from public.contratti_subappalto c where c.company_id=_company and c.order_id=_ordine and c.subappaltatore_id=s.id) or exists(select 1 from public.subappaltatori_assegnazioni a where a.company_id=_company and a.order_id=_ordine and a.subappaltatore_id=s.id))
 ), materiali as (
 select m.id,public.sicurezza_sds_materiale(m) dati from public.order_items m where m.order_id=_ordine and coalesce(m.natura_riga,'materiale')='materiale'
 ), documenti as (
 select e.id,e.file_path,public.sicurezza_sds_documento(e) dati from public.sicurezza_fascicolo e where e.company_id=_company and e.tipo='sds' and e.operaio_id is null and e.incarico_id is null and (e.order_id is null or e.order_id=_ordine) and (e.subappaltatore_id is null or exists(select 1 from imprese s where s.id=e.subappaltatore_id))
 ), righe as (
 select p.id,to_jsonb(p)||jsonb_build_object('materiale_corrente',m.dati,'materiale_cambiato',p.materiale_id is not null and (m.id is null or p.materiale_impronta is distinct from public.sicurezza_sds_impronta(m.dati)),
 'documento_corrente',d.dati,'documento_cambiato',p.evidenza_id is not null and (d.id is null or p.evidenza_impronta is distinct from d.dati->>'impronta'),
 'pertinente',p.dal<=_data and (p.al is null or p.al>=_data) and (_fase is null or p.fase_id is null or p.fase_id=_fase),
 'documento_pertinente',d.id is not null and (d.dati->>'disponibile')::boolean and d.dati->>'stato' not in ('superato','non_applicabile') and (d.dati->>'subappaltatore_id')::uuid is not distinct from p.subappaltatore_id and ((d.dati->>'fase_id') is null or (d.dati->>'fase_id')::uuid=p.fase_id) and ((d.dati->>'applicabile_dal') is null or (d.dati->>'applicabile_dal')::date<=_data) and ((d.dati->>'applicabile_al') is null or (d.dati->>'applicabile_al')::date>=_data)) dati
 from public.sicurezza_prodotti_impieghi p left join materiali m on m.id=p.materiale_id left join documenti d on d.id=p.evidenza_id where p.company_id=_company and p.order_id=_ordine
 )
 select jsonb_build_object('company_id',_company,'order_id',_ordine,'data',_data,'fase_id',_fase,'materiali',coalesce((select jsonb_agg(dati||jsonb_build_object('impronta',public.sicurezza_sds_impronta(dati)) order by dati->>'nome',id) from materiali),'[]'::jsonb),'imprese',coalesce((select jsonb_agg(to_jsonb(s) order by ragione_sociale,id) from imprese s),'[]'::jsonb),'documenti',coalesce((select jsonb_agg(dati order by dati->>'titolo',id) from documenti),'[]'::jsonb),'impieghi',coalesce((select jsonb_agg(dati order by dati->>'nome',id) from righe),'[]'::jsonb)) into r;
 return r;
end$$;
revoke all on function public.sicurezza_prodotti_quadro(uuid,uuid,date,uuid) from public,anon;
grant execute on function public.sicurezza_prodotti_quadro(uuid,uuid,date,uuid) to authenticated;

create or replace function public.sicurezza_prodotto_salva(_id uuid,_company uuid,_ordine uuid,_versione integer,_request uuid,_data date,_dati jsonb) returns jsonb
language plpgsql security definer set search_path=public set timezone='UTC' as $$
declare precedente public.sicurezza_prodotti_impieghi;r public.sicurezza_prodotti_impieghi;evento public.sicurezza_prodotti_eventi;richiesta jsonb;d jsonb:=_dati;k text;m public.order_items;e public.sicurezza_fascicolo;s jsonb;annulla boolean;mantieni boolean;begin
 perform public.sicurezza_sds_contesto(_company,_ordine,null);
 if public.utente_sola_lettura(_company) then raise exception 'Non puoi modificare i prodotti' using errcode='42501';end if;
 perform set_config('lock_timeout','3s',true);
 if _id is null or _request is null or _data is null or jsonb_typeof(d) is distinct from 'object' or length(d::text)>16000 then raise exception 'Richiesta prodotto non valida';end if;
 for k in select jsonb_object_keys(d) loop
  if k not in ('materiale_id','materiale_impronta','subappaltatore_id','fase_id','nome','produttore','codice','impiego','area','dal','al','sds_necessaria','motivo_non_necessaria','evidenza_id','evidenza_impronta','corrispondenza_confermata','note','annullato','motivo') then raise exception 'Campo prodotto non consentito: %',k;end if;
  if k not in ('annullato','corrispondenza_confermata') and jsonb_typeof(d->k) not in ('string','null') then raise exception 'Campo prodotto non testuale: %',k;end if;
 end loop;
 if jsonb_typeof(d->'annullato') is distinct from 'boolean' or jsonb_typeof(d->'corrispondenza_confermata') is distinct from 'boolean' then raise exception 'Conferma stato e corrispondenza del prodotto';end if;
 if length(trim(coalesce(d->>'nome','')))<1 or length(d->>'nome')>250 or length(trim(coalesce(d->>'impiego','')))<3 or length(d->>'impiego')>2000 or length(trim(coalesce(d->>'motivo','')))<3 or length(d->>'motivo')>2000 then raise exception 'Indica prodotto, impiego e motivo (3–2000 caratteri)';end if;
 if greatest(length(d->>'produttore'),length(d->>'codice'),length(d->>'area'))>250 or greatest(length(d->>'note'),length(d->>'motivo_non_necessaria'))>2000 then raise exception 'Testo del prodotto troppo lungo';end if;
 foreach k in array array['dal','al'] loop
  if k='dal' or nullif(d->>k,'') is not null then
   if coalesce(d->>k,'')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Indica date ISO valide';end if;
   perform (d->>k)::date;
  end if;
 end loop;
 if nullif(d->>'al','')::date<(d->>'dal')::date then raise exception 'La fine non può precedere l’inizio';end if;
 if coalesce(d->>'sds_necessaria','') not in ('da_valutare','si','no') then raise exception 'Valuta la necessità della SDS';end if;
 if d->>'sds_necessaria'='no' and length(trim(coalesce(d->>'motivo_non_necessaria','')))<3 then raise exception 'Motiva perché la SDS non è necessaria';end if;
 richiesta:=jsonb_build_object('id',_id,'company',_company,'ordine',_ordine,'versione',_versione,'data',_data,'dati',d);
 perform pg_advisory_xact_lock(hashtextextended('sicurezza_prodotto_richiesta:'||_request::text,0));
 select * into evento from public.sicurezza_prodotti_eventi where company_id=_company and richiesta_id=_request;
 if found then
  if evento.registrato_da=auth.uid() and evento.richiesta=richiesta then return evento.dopo;end if;
  raise exception 'Richiesta già usata per altri dati' using errcode='40001';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('sicurezza_prodotto:'||_id::text,0));
 select * into precedente from public.sicurezza_prodotti_impieghi where id=_id for update;
 if found then
  if precedente.company_id<>_company or precedente.order_id<>_ordine then raise exception 'Prodotto di altra commessa' using errcode='42501';end if;
  if precedente.versione is distinct from _versione then raise exception 'Prodotto cambiato: rileggi la registrazione prima di rettificarla' using errcode='40001';end if;
 else
  if _versione is not null then raise exception 'Registrazione prodotto non disponibile' using errcode='40001';end if;
 end if;
 r.id:=_id;r.company_id:=_company;r.order_id:=_ordine;r.subappaltatore_id:=nullif(d->>'subappaltatore_id','')::uuid;r.materiale_id:=nullif(d->>'materiale_id','')::uuid;r.fase_id:=nullif(d->>'fase_id','')::uuid;
 if precedente.id is not null and (r.materiale_id,r.subappaltatore_id) is distinct from (precedente.materiale_id,precedente.subappaltatore_id) then raise exception 'Per cambiare origine o impresa registra un altro impiego';end if;
 perform public.sicurezza_sds_contesto(_company,_ordine,r.fase_id);
 if r.subappaltatore_id is not null then perform public.sicurezza_itp_contesto(_company,_ordine,r.subappaltatore_id,r.fase_id);end if;
 annulla:=(d->>'annullato')::boolean;
 if r.materiale_id is not null then
  select * into m from public.order_items where id=r.materiale_id and order_id=_ordine and coalesce(natura_riga,'materiale')='materiale' for share;
  if annulla and precedente.materiale_id=r.materiale_id then r.materiale_snapshot:=precedente.materiale_snapshot;r.materiale_impronta:=precedente.materiale_impronta;
  else
   if not found then raise exception 'Materiale non disponibile nella commessa';end if;
   s:=public.sicurezza_sds_materiale(m);
   if public.sicurezza_sds_impronta(s) is distinct from d->>'materiale_impronta' then raise exception 'Materiale cambiato: rileggi la fonte prima di registrarlo' using errcode='40001';end if;
   r.materiale_snapshot:=s;r.materiale_impronta:=public.sicurezza_sds_impronta(s);
  end if;
 end if;
 r.evidenza_id:=nullif(d->>'evidenza_id','')::uuid;
 mantieni:=annulla and precedente.id is not null and r.evidenza_id=precedente.evidenza_id;
 if r.evidenza_id is not null then
  if mantieni then r.evidenza_snapshot:=precedente.evidenza_snapshot;r.evidenza_impronta:=precedente.evidenza_impronta;
  else
   select * into e from public.sicurezza_fascicolo where id=r.evidenza_id for share;
   if not found or e.company_id<>_company or e.tipo<>'sds' or e.operaio_id is not null or e.incarico_id is not null or e.subappaltatore_id is distinct from r.subappaltatore_id or (e.order_id is not null and e.order_id<>_ordine) or (e.fase_id is not null and e.fase_id is distinct from r.fase_id) then raise exception 'SDS non pertinente al prodotto, impresa o fase';end if;
   s:=public.sicurezza_sds_documento(e);
   if not (s->>'disponibile')::boolean or e.stato in ('superato','non_applicabile') or e.applicabile_dal>_data or e.applicabile_al<_data then raise exception 'SDS non disponibile nella data selezionata';end if;
   if s->>'impronta' is distinct from d->>'evidenza_impronta' then raise exception 'SDS cambiata: rileggi il fascicolo prima di collegarla' using errcode='40001';end if;
   r.evidenza_snapshot:=s;r.evidenza_impronta:=s->>'impronta';
  end if;
 elsif (d->>'corrispondenza_confermata')::boolean then raise exception 'Collega la SDS prima di confermarne la corrispondenza';end if;
 r.nome:=trim(d->>'nome');r.produttore:=nullif(trim(d->>'produttore'),'');r.codice:=nullif(trim(d->>'codice'),'');r.impiego:=trim(d->>'impiego');r.area:=nullif(trim(d->>'area'),'');r.dal:=(d->>'dal')::date;r.al:=nullif(d->>'al','')::date;r.sds_necessaria:=d->>'sds_necessaria';r.motivo_non_necessaria:=case when r.sds_necessaria='no' then trim(d->>'motivo_non_necessaria') else null end;r.corrispondenza_confermata:=(d->>'corrispondenza_confermata')::boolean;r.note:=nullif(trim(d->>'note'),'');r.annullato:=annulla;r.versione:=coalesce(precedente.versione,0)+1;r.creato_il:=coalesce(precedente.creato_il,clock_timestamp());r.aggiornato_il:=clock_timestamp();
 insert into public.sicurezza_prodotti_impieghi select r.* on conflict(id) do update set fase_id=excluded.fase_id,nome=excluded.nome,produttore=excluded.produttore,codice=excluded.codice,impiego=excluded.impiego,area=excluded.area,dal=excluded.dal,al=excluded.al,sds_necessaria=excluded.sds_necessaria,motivo_non_necessaria=excluded.motivo_non_necessaria,evidenza_id=excluded.evidenza_id,evidenza_impronta=excluded.evidenza_impronta,evidenza_snapshot=excluded.evidenza_snapshot,materiale_impronta=excluded.materiale_impronta,materiale_snapshot=excluded.materiale_snapshot,corrispondenza_confermata=excluded.corrispondenza_confermata,note=excluded.note,annullato=excluded.annullato,versione=excluded.versione,aggiornato_il=excluded.aggiornato_il;
 insert into public.sicurezza_prodotti_eventi(company_id,order_id,impiego_id,versione,prima,dopo,motivo,registrato_da,richiesta_id,richiesta) values(_company,_ordine,_id,r.versione,case when precedente.id is null then null else to_jsonb(precedente) end,to_jsonb(r),trim(d->>'motivo'),auth.uid(),_request,richiesta);
 return to_jsonb(r);
end$$;
revoke all on function public.sicurezza_prodotto_salva(uuid,uuid,uuid,integer,uuid,date,jsonb) from public,anon;
grant execute on function public.sicurezza_prodotto_salva(uuid,uuid,uuid,integer,uuid,date,jsonb) to authenticated;

create or replace function public.sicurezza_sds_apri(_company uuid,_ordine uuid,_impiego uuid,_data date,_impronta text) returns text
language plpgsql security definer set search_path=public set timezone='UTC' as $$declare p public.sicurezza_prodotti_impieghi;e public.sicurezza_fascicolo;q jsonb;begin
 perform public.sicurezza_sds_contesto(_company,_ordine,null);
 select * into p from public.sicurezza_prodotti_impieghi where id=_impiego and company_id=_company and order_id=_ordine;
 if not found then raise exception 'Impiego non disponibile';end if;
 q:=public.sicurezza_prodotti_quadro(_company,_ordine,_data,p.fase_id);
 if not exists(select 1 from jsonb_array_elements(q->'impieghi') x where x->>'id'=_impiego::text and (x->>'documento_pertinente')::boolean and x->'documento_corrente'->>'impronta'=_impronta) then raise exception 'SDS cambiata o non pertinente: rileggi i prodotti';end if;
 select * into e from public.sicurezza_fascicolo where id=p.evidenza_id for share;
 if not found or public.sicurezza_sds_documento(e)->>'impronta' is distinct from _impronta then raise exception 'SDS cambiata: rileggi i prodotti';end if;
 return e.file_path;
end$$;
revoke all on function public.sicurezza_sds_apri(uuid,uuid,uuid,date,text) from public,anon;
grant execute on function public.sicurezza_sds_apri(uuid,uuid,uuid,date,text) to authenticated;

create or replace function public.sicurezza_prodotti_fase_identita() returns trigger language plpgsql security definer set search_path=public as $$begin
 if (new.company_id,new.order_id) is distinct from (old.company_id,old.order_id) and exists(select 1 from public.sicurezza_prodotti_impieghi where fase_id=old.id) then raise exception 'La fase è referenziata da impieghi di prodotti: conserva la commessa';end if;
 return new;
end$$;
revoke all on function public.sicurezza_prodotti_fase_identita() from public,anon,authenticated;
drop trigger if exists prodotti_fase_identita on public.order_work_phases;
create trigger prodotti_fase_identita before update on public.order_work_phases for each row execute function public.sicurezza_prodotti_fase_identita();
