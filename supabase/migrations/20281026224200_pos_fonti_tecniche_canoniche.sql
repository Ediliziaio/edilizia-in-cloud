set local lock_timeout='3s';set local statement_timeout='60s';
-- Only technical site evidence belonging to the POS issuer. No HR/payroll/personal or subcontractor files.
create or replace function public.pos_documento_tecnico_ammesso(e public.sicurezza_fascicolo) returns boolean language sql stable security invoker set search_path=public as $$
 select e.subappaltatore_id is null and e.operaio_id is null and e.incarico_id is null and e.order_id is not null and
 (e.tipo in ('dvr','psc','pimus','attrezzatura') or e.tipo='altro' and e.catalogo_id='analisi_rischi' and e.catalogo_versione=1) and
 (e.catalogo_id is null or exists(select 1 from public.sicurezza_catalogo_documenti c where c.id=e.catalogo_id and c.versione=e.catalogo_versione and c.destinazione='sicurezza' and c.ambito in ('impresa','commessa')));
$$;
revoke all on function public.pos_documento_tecnico_ammesso(public.sicurezza_fascicolo) from public,anon,authenticated;
create or replace function public.pos_documento_tecnico_foto(e public.sicurezza_fascicolo) returns jsonb language sql stable security invoker set search_path=public set timezone='UTC' as $$
 select jsonb_build_object('id',e.id,'order_id',e.order_id,'fase_id',e.fase_id,'tipo',e.tipo,'catalogo_id',e.catalogo_id,'catalogo_versione',e.catalogo_versione,'titolo',e.titolo,'file_name',e.file_name,'revisione',e.revisione,'data_rilascio',e.data_rilascio,'data_scadenza',e.data_scadenza,'applicabile_dal',e.applicabile_dal,'applicabile_al',e.applicabile_al,'stato',e.stato,'disponibile',nullif(trim(e.file_path),'') is not null and nullif(trim(e.file_name),'') is not null,'impronta',public.sicurezza_sds_impronta(to_jsonb(e)),'confermata',true);
$$;
revoke all on function public.pos_documento_tecnico_foto(public.sicurezza_fascicolo) from public,anon,authenticated;
create or replace function public.pos_documenti_tecnici_quadro(_company uuid,_ordine uuid) returns jsonb language plpgsql security definer set search_path=public as $$begin
 if auth.uid() is null or not public.has_permission_for_company(auth.uid(),'can_view_sicurezza_cantiere',_company) or not exists(select 1 from public.orders where id=_ordine and company_id=_company and deleted_at is null) then raise exception 'Documenti tecnici non disponibili per questa commessa' using errcode='42501';end if;
 if (select count(*) from public.sicurezza_fascicolo e where e.company_id=_company and e.order_id=_ordine and public.pos_documento_tecnico_ammesso(e))>500 then raise exception 'Troppi documenti tecnici: restringi il fascicolo prima di selezionare le fonti';end if;
 return jsonb_build_object('company_id',_company,'order_id',_ordine,'documenti',coalesce((select jsonb_agg(public.pos_documento_tecnico_foto(e)||jsonb_build_object('confermata',false) order by e.titolo,e.id) from public.sicurezza_fascicolo e where e.company_id=_company and e.order_id=_ordine and public.pos_documento_tecnico_ammesso(e)),'[]'::jsonb));
end$$;
revoke all on function public.pos_documenti_tecnici_quadro(uuid,uuid) from public,anon;grant execute on function public.pos_documenti_tecnici_quadro(uuid,uuid) to authenticated;
create or replace function public.pos_documento_tecnico_apri(_company uuid,_ordine uuid,_documento uuid,_impronta text) returns text language plpgsql security definer set search_path=public as $$declare e public.sicurezza_fascicolo;begin
 if auth.uid() is null or not public.has_permission_for_company(auth.uid(),'can_view_sicurezza_cantiere',_company) or not exists(select 1 from public.orders where id=_ordine and company_id=_company and deleted_at is null) then raise exception 'Documento non disponibile' using errcode='42501';end if;
 select * into e from public.sicurezza_fascicolo where id=_documento and company_id=_company and order_id=_ordine;
 if not found or not public.pos_documento_tecnico_ammesso(e) or e.file_path is null then raise exception 'Documento non disponibile' using errcode='42501';end if;
 if public.pos_documento_tecnico_foto(e)->>'impronta' is distinct from _impronta then raise exception 'Il documento è cambiato: rileggi le fonti' using errcode='40001';end if;
 return e.file_path;
end$$;
revoke all on function public.pos_documento_tecnico_apri(uuid,uuid,uuid,text) from public,anon;grant execute on function public.pos_documento_tecnico_apri(uuid,uuid,uuid,text) to authenticated;

create or replace function public.pos_fonti_tecniche_verifica(_company uuid,_ordine uuid,_contenuto jsonb) returns jsonb language plpgsql security invoker set search_path=public set timezone='UTC' as $$
declare l jsonb;r jsonb;f jsonb;x jsonb;e public.sicurezza_fascicolo;foto jsonb;tipo text;fase uuid;inizio date;fine date;docs uuid[]:=array[]::uuid[];locali uuid[];collegamenti jsonb:='[]';allegati jsonb:='[]';n integer:=0;indice integer:=0;begin
 if _contenuto->'versione_fonti_tecniche' is distinct from '1'::jsonb then return jsonb_build_object('versione',0,'collegamenti','[]'::jsonb,'allegati','[]'::jsonb);end if;
 if _contenuto->'versione_tecnica' is distinct from '1'::jsonb or length(_contenuto::text)>1000000 or jsonb_typeof(_contenuto->'lavorazioni') is distinct from 'array' then raise exception 'Contenuto delle fonti tecniche non valido';end if;
 if not exists(select 1 from public.orders where id=_ordine and company_id=_company and deleted_at is null) then raise exception 'Commessa non disponibile';end if;
 if coalesce(_contenuto->'opera'->>'data_inizio','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Indica il periodo del POS per verificare le fonti';end if;
 inizio:=(_contenuto->'opera'->>'data_inizio')::date;fine:=coalesce(nullif(_contenuto->'opera'->>'data_fine','')::date,'infinity'::date);if fine<inizio then raise exception 'Periodo POS incoerente';end if;
 perform set_config('lock_timeout','3s',true);
 for l in select * from jsonb_array_elements(_contenuto->'lavorazioni') loop
  indice:=indice+1;fase:=nullif(l->>'fase_id','')::uuid;
  if fase is not null and not exists(select 1 from public.order_work_phases where id=fase and company_id=_company and order_id=_ordine) then raise exception 'Fase della lavorazione non pertinente';end if;
  foreach tipo in array array['rischi','attrezzature'] loop
   if jsonb_typeof(l->'tecnica'->tipo) is distinct from 'array' then raise exception 'Scheda tecnica non disponibile per le fonti';end if;
   for r in select * from jsonb_array_elements(l->'tecnica'->tipo) loop
    n:=n+1;if n>500 then raise exception 'Il POS supera 500 associazioni di fonti tecniche';end if;
    f:=r->'fonti';
    if jsonb_typeof(f) is distinct from 'object' or jsonb_typeof(f->'documenti') is distinct from 'array' then raise exception 'Scegli le fonti tecniche di ogni scheda';end if;
    if f->>'modalita'='documenti' then
     if jsonb_array_length(f->'documenti') not between 1 and 20 then raise exception 'Collega da 1 a 20 documenti per scheda tecnica';end if;
     locali:=array[]::uuid[];
     for x in select * from jsonb_array_elements(f->'documenti') loop
      select * into e from public.sicurezza_fascicolo where id=(x->>'id')::uuid and company_id=_company and order_id=_ordine for share;
      if not found or not public.pos_documento_tecnico_ammesso(e) then raise exception 'Documento tecnico non pertinente all’impresa o al cantiere';end if;
      if e.id=any(locali) then raise exception 'Documento duplicato nella scheda';end if;locali:=array_append(locali,e.id);
      foto:=public.pos_documento_tecnico_foto(e);
      if foto is distinct from x then raise exception 'Documento tecnico cambiato o non confermato: rileggi la fonte' using errcode='40001';end if;
      if e.stato<>'verificato' or nullif(trim(e.revisione),'') is null or e.data_rilascio is null or e.file_path is null or nullif(trim(e.file_name),'') is null then raise exception 'Documento tecnico da verificare, data/revisione o file mancanti';end if;
      if e.fase_id is not null and e.fase_id is distinct from fase or e.data_rilascio>inizio or coalesce(e.applicabile_dal,'-infinity'::date)>inizio or coalesce(e.applicabile_al,'infinity'::date)<fine or coalesce(e.data_scadenza,'infinity'::date)<fine then raise exception 'Documento tecnico non applicabile all’intero periodo o alla fase del POS';end if;
      if not e.id=any(docs) then
       docs:=array_append(docs,e.id);if array_length(docs,1)>80 then raise exception 'Troppi documenti tecnici da conservare';end if;
       allegati:=allegati||jsonb_build_array(jsonb_build_object('evidenza_id',e.id,'bucket','fascicoli-cantiere','path',e.file_path,'nome',e.file_name,'impronta',foto->>'impronta'));
      end if;
     end loop;
    elsif (tipo='rischi' and f->>'modalita'='testo_pos') or (tipo='attrezzature' and f->>'modalita'='non_applicabile') then
     if jsonb_typeof(f->'motivazione') is distinct from 'string' or length(trim(f->>'motivazione'))=0 or jsonb_array_length(f->'documenti')<>0 then raise exception 'Motiva la fonte dichiarativa senza nascondere documenti collegati';end if;
    else raise exception 'Modalità della fonte tecnica non pertinente alla scheda';end if;
    collegamenti:=collegamenti||jsonb_build_array(jsonb_build_object('lavorazione',indice,'lavorazione_id',l->>'id','tipo',tipo,'scheda_id',r->>'id','fonti',f));
   end loop;
  end loop;
 end loop;
 return jsonb_build_object('versione',1,'collegamenti',collegamenti,'allegati',allegati);
end$$;
revoke all on function public.pos_fonti_tecniche_verifica(uuid,uuid,jsonb) from public,anon,authenticated;grant execute on function public.pos_fonti_tecniche_verifica(uuid,uuid,jsonb) to service_role;
create or replace function public.pos_fonti_tecniche_emissione(_pos_id uuid,_autore uuid) returns jsonb language plpgsql security invoker set search_path=public as $$declare p public.pos_documents;begin
 select * into p from public.pos_documents where id=_pos_id;if not found or not public.pos_puo_emettere(_autore,p.company_id) or p.status<>'bozza' then raise exception 'Fonti tecniche non disponibili' using errcode='42501';end if;
 return public.pos_fonti_tecniche_verifica(p.company_id,p.order_id,p.contenuto);
end$$;
revoke all on function public.pos_fonti_tecniche_emissione(uuid,uuid) from public,anon,authenticated;grant execute on function public.pos_fonti_tecniche_emissione(uuid,uuid) to service_role;
create or replace function public.pos_fonti_tecniche_guardia() returns trigger language plpgsql security invoker set search_path=public as $$begin
 if coalesce(new.document_type,'pos')<>'pos' then return new;end if;
 if tg_op='UPDATE' and old.contenuto->'versione_fonti_tecniche'='1'::jsonb and new.contenuto->'versione_fonti_tecniche' is distinct from '1'::jsonb then raise exception 'Questo POS richiede l’editor delle fonti tecniche: ricarica prima di salvare' using errcode='40001';end if;
 if new.contenuto ? 'versione_fonti_tecniche' and new.contenuto->'versione_fonti_tecniche' is distinct from '1'::jsonb then raise exception 'Versione delle fonti tecniche non supportata';end if;
 if new.contenuto->'versione_fonti_tecniche'='1'::jsonb and new.status='approvato' and (tg_op='INSERT' or old.status<>'approvato') then perform public.pos_fonti_tecniche_verifica(new.company_id,new.order_id,new.contenuto);end if;
 return new;
end$$;
revoke all on function public.pos_fonti_tecniche_guardia() from public,anon,authenticated;
create trigger pos_fonti_tecniche_guardia before insert or update of contenuto,status on public.pos_documents for each row execute function public.pos_fonti_tecniche_guardia();
notify pgrst,'reload schema';

-- Revalidate sources and their original-file provenance inside atomic finalization.
create or replace function public.pos_completa_emissione(_id uuid,_token uuid,_autore uuid,_nome_autore text,_manifest jsonb,_manifest_sha256 text,_zip_sha256 text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare e public.pos_emissioni;p public.pos_documents; prefisso text; a_id uuid; f jsonb; prova_prodotti jsonb; a_sds jsonb; prova_tecnica jsonb;
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
  if p.contenuto->'versione_fonti_tecniche'='1'::jsonb then
   prova_tecnica:=public.pos_fonti_tecniche_verifica(p.company_id,p.order_id,p.contenuto);
   if _manifest->'fonti_tecniche' is distinct from jsonb_build_object('versione',1,'collegamenti',prova_tecnica->'collegamenti') then raise exception 'Il pacchetto non conserva le fonti tecniche riesaminate';end if;
   for a_sds in select * from jsonb_array_elements(prova_tecnica->'allegati') loop
    if not exists(select 1 from jsonb_array_elements(_manifest->'file') mf where mf->>'ruolo'='allegato' and mf->>'tipo'='evidenza_tecnica' and mf->>'evidenza_id'=a_sds->>'evidenza_id' and mf->>'impronta_metadati'=a_sds->>'impronta' and mf->'fonte'->>'bucket'=a_sds->>'bucket' and mf->'fonte'->>'path'=a_sds->>'path') then raise exception 'Documento tecnico specifico non conservato nel pacchetto';end if;
   end loop;
  end if;
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

