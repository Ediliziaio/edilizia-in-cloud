set local lock_timeout='3s';set local statement_timeout='60s';
alter table public.subappaltatori_dpi_consegne add column if not exists evidenza_impronta text;

create or replace function public.sicurezza_impronta_verbale_dpi(e public.sicurezza_fascicolo) returns text language sql stable security invoker set search_path=public set timezone='UTC' as $$select encode(sha256(convert_to(to_jsonb(e)::text,'UTF8')),'hex');$$;
revoke all on function public.sicurezza_impronta_verbale_dpi(public.sicurezza_fascicolo) from public,anon,authenticated;

create or replace function public.sicurezza_valida_consegna_dpi(d jsonb,esterno boolean default false) returns void language plpgsql immutable security invoker set search_path=public as $$declare k text;v text;begin
 if jsonb_typeof(d) is distinct from 'object' or length(d::text)>16000 then raise exception 'Richiesta DPI non valida';end if;
 for k in select jsonb_object_keys(d) loop
  if k not in ('tipo','marca','taglia','matricola','consegnato_il','scade_il','stato','restituito_il','note','annullata','motivo') and not (esterno and k in ('evidenza_id','evidenza_attesa','evidenza_impronta')) then raise exception 'Campo DPI non consentito: %',k;end if;
  if k<>'annullata' and jsonb_typeof(d->k) not in ('string','null') then raise exception 'Campo DPI non testuale: %',k;end if;
 end loop;
 if jsonb_typeof(d->'annullata') is distinct from 'boolean' then raise exception 'Indica se la registrazione è annullata';end if;
 if length(trim(coalesce(d->>'motivo','')))<3 or length(d->>'motivo')>2000 then raise exception 'Indica il motivo della registrazione o rettifica (3–2000 caratteri)';end if;
 if coalesce(d->>'tipo','') not in ('casco','scarpe_antinfortunistiche','imbragatura','occhiali','guanti','mascherina_ffp','tappi_auricolari','giubbino_alta_visibilita','tuta_chimica','elmetto_arrampicata') then raise exception 'Scegli il tipo DPI';end if;
 if coalesce(d->>'stato','') not in ('in_use','damaged','lost','returned','expired') then raise exception 'Scegli lo stato del DPI';end if;
 if nullif(d->>'consegnato_il','') is null then raise exception 'Indica la data di consegna';end if;
 foreach k in array array['consegnato_il','scade_il','restituito_il'] loop
  v:=nullif(d->>k,'');if v is not null then
   if v !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Usa date nel formato AAAA-MM-GG';end if;
   perform v::date;
  end if;
 end loop;
 if d->>'stato'='returned' and nullif(d->>'restituito_il','') is null then raise exception 'Indica la data di restituzione';end if;
 if length(coalesce(d->>'note',''))>2000 then raise exception 'Testo del registro DPI troppo lungo';end if;
 if exists(select 1 from jsonb_each_text(d)x where x.key in ('marca','taglia','matricola') and length(x.value)>200) then raise exception 'Marca, taglia o matricola troppo lunghe';end if;
end$$;
revoke all on function public.sicurezza_valida_consegna_dpi(jsonb,boolean) from public,anon,authenticated;


create or replace function public.sicurezza_snapshot_verbale_dpi(e public.sicurezza_fascicolo) returns jsonb language sql stable security invoker set search_path=public as $$
 select jsonb_build_object('impronta',public.sicurezza_impronta_verbale_dpi(e),'id',e.id,'operaio_id',e.operaio_id,'titolo',e.titolo,'file_name',e.file_name,'catalogo_id',e.catalogo_id,'catalogo_versione',e.catalogo_versione,'order_id',e.order_id,'fase_id',e.fase_id,'applicabile_dal',e.applicabile_dal,'applicabile_al',e.applicabile_al,'stato',e.stato,'data_rilascio',e.data_rilascio,'data_scadenza',e.data_scadenza,'updated_at',e.updated_at);
$$;
revoke all on function public.sicurezza_snapshot_verbale_dpi(public.sicurezza_fascicolo) from public,anon,authenticated;

create or replace function public.sicurezza_dpi_esterno_json(d public.subappaltatori_dpi_consegne) returns jsonb language sql stable security invoker set search_path=public as $$
 select jsonb_build_object('id',d.id,'tipo',d.tipo,'marca',d.marca,'taglia',d.taglia,'matricola',d.matricola,'consegnato_il',d.consegnato_il,'scade_il',d.scade_il,'stato',d.stato,'restituito_il',d.restituito_il,'note',d.note,'annullata',d.annullata,'annullamento_motivo',d.annullamento_motivo,'versione',d.versione,'aggiornato_il',d.aggiornato_il,'modulo_registrato',d.evidenza_id is not null,'evidenza_impronta',d.evidenza_impronta,'evidenza_id',d.evidenza_id,'evidenza_attesa',d.evidenza_updated_at,'evidenza_snapshot',d.evidenza_snapshot);
$$;
revoke all on function public.sicurezza_dpi_esterno_json(public.subappaltatori_dpi_consegne) from public,anon,authenticated;


create or replace function public.sicurezza_sub_dpi_guardia() returns trigger language plpgsql security definer set search_path=public as $$declare e public.sicurezza_fascicolo;azienda uuid;mantieni boolean:=false;begin
 azienda:=case when tg_op='DELETE' then old.company_id else new.company_id end;
 if auth.uid() is not null and (not public.has_permission_for_company(auth.uid(),'can_view_sicurezza_cantiere',azienda) or public.utente_sola_lettura(azienda)) then raise exception 'Non puoi modificare le dotazioni esterne' using errcode='42501';end if;
 if tg_op='DELETE' then return old;end if;
 if tg_op='UPDATE' then
  if (new.id,new.company_id,new.subappaltatore_id,new.operaio_id) is distinct from (old.id,old.company_id,old.subappaltatore_id,old.operaio_id) then raise exception 'La consegna esterna non si trasferisce a un altro titolare o impresa';end if;
  mantieni:=new.annullata and new.evidenza_id is not null and new.evidenza_id=old.evidenza_id;
 end if;
 if new.scade_il<new.consegnato_il or new.restituito_il<new.consegnato_il then raise exception 'Le date DPI precedono la consegna';end if;
 if new.annullata and length(trim(coalesce(new.annullamento_motivo,'')))<3 then raise exception 'Motiva l’annullamento della consegna';end if;
 if length(new.note)>2000 or length(coalesce(new.annullamento_motivo,''))>2000 or greatest(length(new.marca),length(new.taglia),length(new.matricola))>200 then raise exception 'Testo del registro DPI troppo lungo';end if;
 if not new.annullata then new.annullamento_motivo:=null;end if;
 if new.evidenza_id is not null then
  select * into e from public.sicurezza_fascicolo where id=new.evidenza_id for share;
  if not found or e.company_id<>new.company_id or e.subappaltatore_id is distinct from new.subappaltatore_id or e.operaio_id is distinct from new.operaio_id or e.incarico_id is not null or e.tipo<>'dpi' or e.catalogo_id is distinct from 'consegna_dpi' then raise exception 'Il verbale DPI non appartiene allo stesso operaio e impresa o non è classificato correttamente';end if;
  if mantieni then new.evidenza_snapshot:=old.evidenza_snapshot;new.evidenza_updated_at:=old.evidenza_updated_at;new.evidenza_impronta:=old.evidenza_impronta;
  else
   if e.file_path is null or e.file_name is null or e.stato='superato' then raise exception 'Scegli un verbale DPI con file disponibile e non superato';end if;
   if new.evidenza_updated_at is distinct from e.updated_at or new.evidenza_impronta is distinct from public.sicurezza_impronta_verbale_dpi(e) then raise exception 'Il verbale è cambiato: rileggi il fascicolo prima di collegarlo' using errcode='40001';end if;
   new.evidenza_snapshot:=public.sicurezza_snapshot_verbale_dpi(e);
  end if;
 else new.evidenza_snapshot:=null;new.evidenza_updated_at:=null;new.evidenza_impronta:=null;end if;
 new.versione:=case when tg_op='INSERT' then 1 else old.versione+1 end;
 new.created_at:=case when tg_op='INSERT' then clock_timestamp() else old.created_at end;new.aggiornato_il:=clock_timestamp();return new;
end$$;
revoke all on function public.sicurezza_sub_dpi_guardia() from public,anon,authenticated;
drop trigger if exists sicurezza_sub_dpi_guardia on public.subappaltatori_dpi_consegne;
create trigger sicurezza_sub_dpi_guardia before insert or update or delete on public.subappaltatori_dpi_consegne for each row execute function public.sicurezza_sub_dpi_guardia();

create or replace function public.sub_dpi_quadro(_company uuid,_sub uuid,_ordine uuid default null,_data date default ((now() at time zone 'Europe/Rome')::date),_fase uuid default null,_operaio uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$declare risultato jsonb;begin
 if auth.uid() is null or not public.has_permission_for_company(auth.uid(),'can_view_sicurezza_cantiere',_company) then raise exception 'Permesso Sicurezza cantiere necessario' using errcode='42501';end if;
 if not exists(select 1 from public.subappaltatori_sicurezza where id=_sub and company_id=_company) then raise exception 'Impresa non disponibile';end if;
 if _data is null or _ordine is null and _fase is not null then raise exception 'Indica data e contesto della fase';end if;
 if _ordine is not null then perform public.sicurezza_itp_contesto(_company,_ordine,_sub,_fase);end if;
 if _operaio is not null and not exists(select 1 from public.subappaltatori_operai where id=_operaio and company_id=_company and subappaltatore_id=_sub) then raise exception 'Operaio non appartenente all’impresa';end if;
 with addetti as (
 select o.* from public.subappaltatori_operai o where o.company_id=_company and o.subappaltatore_id=_sub and (_operaio is null or o.id=_operaio)
 and (_ordine is null or exists(select 1 from public.subappaltatori_assegnazioni a where a.company_id=_company and a.subappaltatore_id=_sub and a.operaio_id=o.id and a.order_id=_ordine and a.dal<=_data and (a.al is null or a.al>=_data) and (_fase is null or a.fase_id is null or a.fase_id=_fase)))
 ), documenti as (
 select e.* from public.sicurezza_fascicolo e join addetti a on a.id=e.operaio_id where e.company_id=_company and e.subappaltatore_id=_sub and e.incarico_id is null and e.tipo='dpi' and e.catalogo_id='consegna_dpi'
 )
 select jsonb_build_object('company_id',_company,'sub_id',_sub,'order_id',_ordine,'data',_data,'fase_id',_fase,
 'addetti',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'nome',a.nome,'cognome',a.cognome,'qualifica',a.mansione,'attivo',a.attivo,'assegnazioni','[]'::jsonb,
 'consegne',coalesce((select jsonb_agg(public.sicurezza_dpi_esterno_json(d)||jsonb_build_object(
 'verbale_cambiato',d.evidenza_id is not null and (d.evidenza_updated_at is distinct from e.updated_at or d.evidenza_impronta is distinct from public.sicurezza_impronta_verbale_dpi(e)),
 'verbale_pertinente',e.id is not null and e.file_path is not null and e.stato<>'superato' and (_ordine is null or (e.order_id is null or e.order_id=_ordine) and (e.fase_id is null or e.fase_id=_fase) and (e.applicabile_dal is null or e.applicabile_dal<=_data) and (e.applicabile_al is null or e.applicabile_al>=_data)),
 'verbale_corrente',case when e.id is not null then public.sicurezza_snapshot_verbale_dpi(e) end) order by d.consegnato_il desc,d.id)
 from public.subappaltatori_dpi_consegne d left join documenti e on e.id=d.evidenza_id where d.company_id=_company and d.subappaltatore_id=_sub and d.operaio_id=a.id),'[]'::jsonb)) order by a.cognome,a.nome,a.id) from addetti a),'[]'::jsonb),
 'evidenze',coalesce((select jsonb_agg(public.sicurezza_snapshot_verbale_dpi(e) order by e.titolo,e.id) from documenti e where e.file_path is not null and e.file_name is not null and e.stato<>'superato' and (_ordine is null or (e.order_id is null or e.order_id=_ordine) and (e.fase_id is null or e.fase_id=_fase) and (e.applicabile_dal is null or e.applicabile_dal<=_data) and (e.applicabile_al is null or e.applicabile_al>=_data))),'[]'::jsonb)) into risultato;
 return risultato;
end$$;
revoke all on function public.sub_dpi_quadro(uuid,uuid,uuid,date,uuid,uuid) from public,anon;
grant execute on function public.sub_dpi_quadro(uuid,uuid,uuid,date,uuid,uuid) to authenticated;


create or replace function public.sub_dpi_salva(_id uuid,_company uuid,_sub uuid,_operaio uuid,_ordine uuid,_data date,_fase uuid,_versione integer,_request uuid,_dati jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$declare r public.subappaltatori_dpi_consegne;evento public.subappaltatori_dpi_eventi;quadro jsonb;richiesta jsonb;crea boolean;eid uuid;e public.sicurezza_fascicolo;mantieni boolean:=false;begin
 if auth.uid() is null or not public.has_permission_for_company(auth.uid(),'can_view_sicurezza_cantiere',_company) or public.utente_sola_lettura(_company) then raise exception 'Non puoi modificare le dotazioni esterne' using errcode='42501';end if;
 perform set_config('lock_timeout','3s',true);
 if _id is null or _request is null or _operaio is null then raise exception 'Richiesta DPI non valida';end if;
 perform public.sicurezza_valida_consegna_dpi(_dati,true);
 quadro:=public.sub_dpi_quadro(_company,_sub,_ordine,_data,_fase,_operaio);
 if jsonb_array_length(quadro->'addetti')<>1 then raise exception 'L’operaio non è assegnato al contesto selezionato' using errcode='40001';end if;
 richiesta:=jsonb_build_object('id',_id,'company',_company,'sub',_sub,'operaio',_operaio,'ordine',_ordine,'data',_data,'fase',_fase,'versione',_versione,'dati',_dati);
 perform pg_advisory_xact_lock(hashtextextended('sub_dpi_richiesta:'||_request::text,0));
 select * into evento from public.subappaltatori_dpi_eventi where richiesta_id=_request;
 if found then
  if evento.company_id=_company and evento.registrato_da=auth.uid() and evento.richiesta=richiesta then return evento.dopo;end if;
  raise exception 'Identificativo della richiesta già usato per altri dati' using errcode='40001';
 end if;
 select * into r from public.subappaltatori_dpi_consegne where id=_id and company_id=_company and subappaltatore_id=_sub and operaio_id=_operaio for update;
 crea:=not found;
 if crea then
  if _versione is not null or exists(select 1 from public.subappaltatori_dpi_eventi where consegna_id=_id) then raise exception 'Consegna non più disponibile: rileggi il registro' using errcode='40001';end if;
  if not exists(select 1 from public.subappaltatori_operai where id=_operaio and company_id=_company and subappaltatore_id=_sub and attivo) then raise exception 'Per una nuova consegna scegli un addetto attivo';end if;
 elsif _versione is distinct from r.versione then raise exception 'La consegna è cambiata: rileggi il registro prima di rettificarla' using errcode='40001';end if;
 eid:=nullif(_dati->>'evidenza_id','')::uuid;
 mantieni:=not crea and (_dati->>'annullata')::boolean and eid is not null and eid=r.evidenza_id;
 if eid is not null and not mantieni then
  select * into e from public.sicurezza_fascicolo where id=eid for share;
  if not found or e.company_id<>_company or e.subappaltatore_id is distinct from _sub or e.operaio_id is distinct from _operaio then raise exception 'Verbale non appartenente al titolare';end if;
  if nullif(_dati->>'evidenza_attesa','') is null or e.updated_at is distinct from (_dati->>'evidenza_attesa')::timestamptz or (_dati->>'evidenza_impronta') is distinct from public.sicurezza_impronta_verbale_dpi(e) then raise exception 'Il verbale è cambiato: rileggi il fascicolo prima di collegarlo' using errcode='40001';end if;
  if _ordine is not null and (e.order_id is not null and e.order_id<>_ordine or e.fase_id is not null and e.fase_id is distinct from _fase or e.applicabile_dal>_data or e.applicabile_al<_data) then raise exception 'Il verbale non è pertinente alla commessa, fase o periodo selezionati';end if;
 end if;
 perform set_config('sicurezza.sub_dpi_operazione',jsonb_build_object('id',_request,'richiesta',richiesta,'motivo',trim(_dati->>'motivo'))::text,true);
 if crea then
  insert into public.subappaltatori_dpi_consegne(id,company_id,subappaltatore_id,operaio_id,tipo,marca,taglia,matricola,consegnato_il,scade_il,stato,restituito_il,note,annullata,annullamento_motivo,evidenza_id,evidenza_updated_at,evidenza_impronta)
  values(_id,_company,_sub,_operaio,_dati->>'tipo',nullif(trim(_dati->>'marca'),''),nullif(trim(_dati->>'taglia'),''),nullif(trim(_dati->>'matricola'),''),(_dati->>'consegnato_il')::date,nullif(_dati->>'scade_il','')::date,_dati->>'stato',nullif(_dati->>'restituito_il','')::date,coalesce(_dati->>'note',''),(_dati->>'annullata')::boolean,case when (_dati->>'annullata')::boolean then trim(_dati->>'motivo') end,eid,nullif(_dati->>'evidenza_attesa','')::timestamptz,_dati->>'evidenza_impronta') returning * into r;
 else
  update public.subappaltatori_dpi_consegne set tipo=_dati->>'tipo',marca=nullif(trim(_dati->>'marca'),''),taglia=nullif(trim(_dati->>'taglia'),''),matricola=nullif(trim(_dati->>'matricola'),''),consegnato_il=(_dati->>'consegnato_il')::date,scade_il=nullif(_dati->>'scade_il','')::date,stato=_dati->>'stato',restituito_il=nullif(_dati->>'restituito_il','')::date,note=coalesce(_dati->>'note',''),annullata=(_dati->>'annullata')::boolean,annullamento_motivo=case when (_dati->>'annullata')::boolean then trim(_dati->>'motivo') end,evidenza_id=eid,evidenza_updated_at=nullif(_dati->>'evidenza_attesa','')::timestamptz,evidenza_impronta=_dati->>'evidenza_impronta' where id=_id returning * into r;
 end if;
 perform set_config('sicurezza.sub_dpi_operazione','',true);return public.sicurezza_dpi_esterno_json(r);
end$$;
revoke all on function public.sub_dpi_salva(uuid,uuid,uuid,uuid,uuid,date,uuid,integer,uuid,jsonb) from public,anon;
grant execute on function public.sub_dpi_salva(uuid,uuid,uuid,uuid,uuid,date,uuid,integer,uuid,jsonb) to authenticated;

create or replace function public.sub_dpi_apri_verbale(_company uuid,_sub uuid,_operaio uuid,_evidenza uuid,_ordine uuid,_data date,_fase uuid,_impronta text)
returns text language plpgsql security definer set search_path=public as $$declare q jsonb;e public.sicurezza_fascicolo;begin
 q:=public.sub_dpi_quadro(_company,_sub,_ordine,_data,_fase,_operaio);
 if not exists(select 1 from jsonb_array_elements(q->'evidenze')v where v->>'id'=_evidenza::text and v->>'impronta'=_impronta) then raise exception 'Verbale cambiato o non pertinente: aggiorna il fascicolo';end if;
 select * into e from public.sicurezza_fascicolo where id=_evidenza and company_id=_company and subappaltatore_id=_sub and operaio_id=_operaio for share;
 if not found or e.file_path is null or public.sicurezza_impronta_verbale_dpi(e) is distinct from _impronta then raise exception 'Il verbale è cambiato: rileggi il fascicolo prima di aprirlo' using errcode='40001';end if;
 return e.file_path;
end$$;
revoke all on function public.sub_dpi_apri_verbale(uuid,uuid,uuid,uuid,uuid,date,uuid,text) from public,anon;
grant execute on function public.sub_dpi_apri_verbale(uuid,uuid,uuid,uuid,uuid,date,uuid,text) to authenticated;

