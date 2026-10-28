set local lock_timeout='3s';set local statement_timeout='60s';
-- Safe photograph shared with the POS model. Never return a storage path here.
create or replace function public.pos_prodotto_fotografia(p public.sicurezza_prodotti_impieghi) returns jsonb language sql stable security invoker set search_path=public as $$
 select jsonb_build_object('impiego_id',p.id,'versione',p.versione,'nome',p.nome,'produttore',p.produttore,'codice',p.codice,'impiego',p.impiego,'area',p.area,'fase_id',p.fase_id,'subappaltatore_id',p.subappaltatore_id,'dal',p.dal,'al',p.al,'sds_necessaria',p.sds_necessaria,'motivo_non_necessaria',p.motivo_non_necessaria,'materiale_id',p.materiale_id,'materiale_impronta',p.materiale_impronta,'evidenza_id',p.evidenza_id,'evidenza_impronta',p.evidenza_impronta,'sds_revisione',p.evidenza_snapshot->>'revisione','sds_data',p.evidenza_snapshot->>'data_rilascio','sds_stato',p.evidenza_snapshot->>'stato','sds_file_name',p.evidenza_snapshot->>'file_name','corrispondenza_confermata',p.corrispondenza_confermata,'verificato',true);
$$;
revoke all on function public.pos_prodotto_fotografia(public.sicurezza_prodotti_impieghi) from public,anon,authenticated;

create or replace function public.pos_prodotti_verifica(_company uuid,_ordine uuid,_contenuto jsonb) returns jsonb
language plpgsql security invoker set search_path=public set timezone='UTC' as $$
declare l jsonb;x jsonb;foto jsonb;p public.sicurezza_prodotti_impieghi;e public.sicurezza_fascicolo;m public.order_items;
 inizio date;fine date;dal date;al date;ids uuid[]:=array[]::uuid[];locali uuid[];docs uuid[]:=array[]::uuid[];prodotti jsonb:='[]';allegati jsonb:='[]';fase uuid;scelti integer:=0;
begin
 if _contenuto->>'versione_prodotti' is distinct from '1' then return jsonb_build_object('versione',0,'prodotti','[]'::jsonb,'allegati','[]'::jsonb);end if;
 if length(_contenuto::text)>1000000 or jsonb_typeof(_contenuto->'lavorazioni') is distinct from 'array' then raise exception 'Contenuto prodotti POS non valido';end if;
 if coalesce(_contenuto->'opera'->>'data_inizio','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or nullif(_contenuto->'opera'->>'data_fine','') is not null and (_contenuto->'opera'->>'data_fine') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Indica il periodo del POS per riesaminare i prodotti';end if;
 inizio:=(_contenuto->'opera'->>'data_inizio')::date;fine:=coalesce(nullif(_contenuto->'opera'->>'data_fine','')::date,'infinity'::date);
 if fine<inizio then raise exception 'Periodo POS incoerente';end if;
 perform set_config('lock_timeout','3s',true);
 perform pg_advisory_xact_lock(hashtextextended('sicurezza_prodotti_pos:'||_company::text||':'||_ordine::text,0));
 if not exists(select 1 from public.orders where id=_ordine and company_id=_company and deleted_at is null) then raise exception 'Commessa non disponibile';end if;
 perform 1 from public.sicurezza_prodotti_impieghi where company_id=_company and order_id=_ordine for share;
 for l in select * from jsonb_array_elements(_contenuto->'lavorazioni') loop
  if l->'prodotti_riesaminati' is distinct from 'true'::jsonb then raise exception 'Riesamina i prodotti della lavorazione %',coalesce(l->>'titolo','senza titolo');end if;
  if jsonb_typeof(l->'prodotti') is distinct from 'array' or jsonb_array_length(l->'prodotti')>100 then raise exception 'Elenco prodotti della lavorazione non valido';end if;
  fase:=nullif(l->>'fase_id','')::uuid;
  if fase is not null and not exists(select 1 from public.order_work_phases where id=fase and company_id=_company and order_id=_ordine) then raise exception 'Fase della lavorazione non pertinente';end if;
  locali:=array[]::uuid[];
  for x in select * from jsonb_array_elements(l->'prodotti') loop
   scelti:=scelti+1;if scelti>500 then raise exception 'Il POS supera il limite di 500 associazioni prodotto';end if;
   select * into p from public.sicurezza_prodotti_impieghi where id=(x->>'impiego_id')::uuid and company_id=_company and order_id=_ordine for share;
   if not found or p.annullato or p.subappaltatore_id is not null then raise exception 'Prodotto non disponibile per il POS della propria impresa';end if;
   if p.id=any(locali) then raise exception 'Prodotto duplicato nella stessa lavorazione';end if;locali:=array_append(locali,p.id);
   foto:=public.pos_prodotto_fotografia(p);
   if foto is distinct from x then raise exception 'Prodotto % cambiato o non confermato: rileggi la fotografia nel POS',p.nome using errcode='40001';end if;
   if p.fase_id is not null and p.fase_id is distinct from fase then raise exception 'Fase dell’impiego diversa dalla lavorazione: %',p.nome;end if;
   dal:=greatest(p.dal,inizio);al:=least(coalesce(p.al,'infinity'::date),fine);
   if al<dal then raise exception 'Prodotto fuori dal periodo del POS: %',p.nome;end if;
   if p.sds_necessaria='da_valutare' or p.sds_necessaria='no' and length(trim(coalesce(p.motivo_non_necessaria,'')))<3 then raise exception 'Necessità SDS da riesaminare: %',p.nome;end if;
   if p.materiale_id is not null then
    select * into m from public.order_items where id=p.materiale_id and order_id=_ordine and coalesce(natura_riga,'materiale')='materiale' for share;
    if not found or public.sicurezza_sds_impronta(public.sicurezza_sds_materiale(m)) is distinct from p.materiale_impronta then raise exception 'Materiale di origine cambiato o rimosso: %',p.nome using errcode='40001';end if;
   end if;
   if p.sds_necessaria='si' and (p.evidenza_id is null or not p.corrispondenza_confermata) then raise exception 'SDS specifica mancante o corrispondenza non confermata: %',p.nome;end if;
   if p.evidenza_id is not null then
    select * into e from public.sicurezza_fascicolo where id=p.evidenza_id for share;
    if not found or e.company_id<>_company or e.tipo<>'sds' or e.subappaltatore_id is not null or e.operaio_id is not null or e.incarico_id is not null or (e.order_id is not null and e.order_id<>_ordine) or (e.fase_id is not null and e.fase_id is distinct from p.fase_id) then raise exception 'SDS non pertinente: %',p.nome;end if;
    if public.sicurezza_sds_documento(e)->>'impronta' is distinct from p.evidenza_impronta then raise exception 'SDS cambiata: %',p.nome using errcode='40001';end if;
    if nullif(trim(e.file_path),'') is null or nullif(trim(e.file_name),'') is null or e.stato in ('superato','non_applicabile') or e.applicabile_dal>dal or e.applicabile_al<al or e.data_scadenza<al then raise exception 'SDS non disponibile per l’intero periodo di impiego: %',p.nome;end if;
    if p.sds_necessaria='si' and (e.stato<>'verificato' or nullif(trim(e.revisione),'') is null or e.data_rilascio is null) then raise exception 'Verifica, revisione o data della SDS da completare: %',p.nome;end if;
    if not e.id=any(docs) then
     docs:=array_append(docs,e.id);allegati:=allegati||jsonb_build_array(jsonb_build_object('evidenza_id',e.id,'bucket','fascicoli-cantiere','path',e.file_path,'nome',e.file_name,'impronta',p.evidenza_impronta));
    end if;
   end if;
   if not p.id=any(ids) then ids:=array_append(ids,p.id);prodotti:=prodotti||jsonb_build_array(foto);end if;
  end loop;
 end loop;
 select p0.nome into p.nome from public.sicurezza_prodotti_impieghi p0 where p0.company_id=_company and p0.order_id=_ordine and not p0.annullato and p0.subappaltatore_id is null and p0.dal<=fine and (p0.al is null or p0.al>=inizio) and not p0.id=any(ids) order by p0.id limit 1;
 if found then raise exception 'Impiego proprio nel periodo non collegato alle lavorazioni POS: %',p.nome;end if;
 return jsonb_build_object('versione',1,'prodotti',(select coalesce(jsonb_agg(v order by v->>'impiego_id'),'[]') from jsonb_array_elements(prodotti)v),'allegati',(select coalesce(jsonb_agg(v order by v->>'evidenza_id'),'[]') from jsonb_array_elements(allegati)v));
end$$;
revoke all on function public.pos_prodotti_verifica(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pos_prodotti_verifica(uuid,uuid,jsonb) to service_role;

create or replace function public.pos_prodotti_fonti_emissione(_pos_id uuid,_autore uuid) returns jsonb language plpgsql security invoker set search_path=public as $$declare p public.pos_documents;begin
 select * into p from public.pos_documents where id=_pos_id;
 if not found or not public.pos_puo_emettere(_autore,p.company_id) then raise exception 'POS non disponibile' using errcode='42501';end if;
 if p.status<>'bozza' then raise exception 'Riesamina i prodotti in una bozza';end if;
 return public.pos_prodotti_verifica(p.company_id,p.order_id,p.contenuto);
end$$;
revoke all on function public.pos_prodotti_fonti_emissione(uuid,uuid) from public,anon,authenticated;
grant execute on function public.pos_prodotti_fonti_emissione(uuid,uuid) to service_role;

create or replace function public.pos_prodotti_editor_guardia() returns trigger language plpgsql security invoker set search_path=public as $$begin
 if old.contenuto->>'versione_prodotti'='1' and new.contenuto->>'versione_prodotti' is distinct from '1' then raise exception 'Questo POS richiede l’editor aggiornato dei prodotti: ricarica prima di salvare' using errcode='40001';end if;
 return new;
end$$;
revoke all on function public.pos_prodotti_editor_guardia() from public,anon,authenticated;
drop trigger if exists pos_prodotti_editor_guardia on public.pos_documents;
create trigger pos_prodotti_editor_guardia before update of contenuto on public.pos_documents for each row execute function public.pos_prodotti_editor_guardia();

-- Registration and final approval share the order lock to protect the coverage set.
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
 perform pg_advisory_xact_lock(hashtextextended('sicurezza_prodotti_pos:'||_company::text||':'||_ordine::text,0));
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


-- Revalidate sources and package provenance inside atomic approval.
create or replace function public.pos_completa_emissione(_id uuid,_token uuid,_autore uuid,_nome_autore text,_manifest jsonb,_manifest_sha256 text,_zip_sha256 text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare e public.pos_emissioni;p public.pos_documents; prefisso text; a_id uuid; f jsonb; prova_prodotti jsonb; a_sds jsonb;
begin
 select * into e from public.pos_emissioni where id=_id;
 if not found then raise exception 'Emissione non disponibile' using errcode='42501';end if;
 -- All reservation/finalization paths lock the POS before the emission to avoid lock inversion.
 select * into p from public.pos_documents where id=e.pos_id for update;
 if not found then raise exception 'POS non disponibile' using errcode='42501';end if;
 select * into e from public.pos_emissioni where id=_id for update;
 if not found or not public.pos_puo_emettere(_autore,e.company_id) then raise exception 'Emissione non disponibile' using errcode='42501';end if;
 if e.stato='completa' then return to_jsonb(e);end if;
 if e.token<>_token or e.stato<>'preparazione' or e.riservata_fino<clock_timestamp() then raise exception 'Preparazione scaduta: riprova' using errcode='40001';end if;
 if _manifest->>'emissioneId' is distinct from e.id::text or _manifest->>'companyId' is distinct from e.company_id::text or _manifest->>'posId' is distinct from e.pos_id::text or (_manifest->>'revisione')::integer is distinct from e.revisione or _manifest->>'origine' is distinct from e.origine or jsonb_typeof(_manifest->'file') is distinct from 'array' or jsonb_array_length(_manifest->'file')<3 then raise exception 'Manifest non pertinente all’emissione';end if;
 prefisso:=e.company_id::text||'/'||e.id::text||'/'||e.token::text||'/';
 for f in select * from jsonb_array_elements(_manifest->'file') loop
  if left(f->>'path',length(prefisso)) is distinct from prefisso or coalesce(f->>'sha256','') !~ '^[0-9a-f]{64}$' or not exists(select 1 from storage.objects where bucket_id='pos-emissioni' and name=f->>'path') then raise exception 'Il pacchetto non contiene tutti i file dichiarati';end if;
 end loop;
 if not exists(select 1 from storage.objects where bucket_id='pos-emissioni' and name=prefisso||'POS.pdf') or not exists(select 1 from storage.objects where bucket_id='pos-emissioni' and name=prefisso||'manifest.json') or not exists(select 1 from storage.objects where bucket_id='pos-emissioni' and name=prefisso||'fascicolo.zip') then raise exception 'PDF, manifest o pacchetto mancanti';end if;
 if e.origine='approvazione_corrente' then
  select * into p from public.pos_documents where id=e.pos_id for update;
  if p.status<>'bozza' or p.updated_at is distinct from e.sorgente_updated_at or coalesce(p.revisione,0)<>e.revisione then raise exception 'Il POS è cambiato durante la preparazione: ricaricalo' using errcode='40001';end if;
  if p.contenuto->>'versione_prodotti'='1' then
   prova_prodotti:=public.pos_prodotti_verifica(p.company_id,p.order_id,p.contenuto);
   if _manifest->'prodotti_sds' is distinct from jsonb_build_object('versione',1,'prodotti',prova_prodotti->'prodotti') then raise exception 'Il pacchetto non conserva le fotografie prodotto riesaminate';end if;
   for a_sds in select * from jsonb_array_elements(prova_prodotti->'allegati') loop
    if not exists(select 1 from jsonb_array_elements(_manifest->'file') mf where mf->>'ruolo'='allegato' and mf->>'tipo'='scheda_sicurezza' and mf->>'evidenza_id'=a_sds->>'evidenza_id' and mf->>'impronta_metadati'=a_sds->>'impronta' and mf->'fonte'->>'bucket'=a_sds->>'bucket' and mf->'fonte'->>'path'=a_sds->>'path') then raise exception 'SDS specifica non conservata nel pacchetto';end if;
   end loop;
  end if;
  update public.pos_documents set status='approvato',approvato_da=_autore,approvato_da_nome=_nome_autore,approvato_il=clock_timestamp(),emissione_id=e.id,updated_at=clock_timestamp() where id=p.id;
  select id into a_id from public.pos_contenuti_archiviati where pos_id=p.id and revisione=e.revisione;
 else a_id:=e.snapshot_id;end if;
 if a_id is null then raise exception 'Copia del contenuto approvato non conservata';end if;
 update public.pos_emissioni set stato='completa',snapshot_id=a_id,manifest=_manifest,manifest_sha256=_manifest_sha256,zip_sha256=_zip_sha256,emessa_da=_autore,errore=null,updated_at=clock_timestamp() where id=e.id returning * into e;
 return to_jsonb(e);
end $$;
revoke all on function public.pos_completa_emissione(uuid,uuid,uuid,text,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.pos_completa_emissione(uuid,uuid,uuid,text,jsonb,text,text) to service_role;

