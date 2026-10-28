-- File ricostruito il 27/10/2026 dal registro del database (supabase_migrations.schema_migrations).
-- La migrazione era già applicata in produzione con questa versione, ma il file non era mai stato salvato nel repository:
-- il controllo «Supabase Preview» segnalava «Remote migration versions not found in local migrations directory».
-- Sotto c'è l'SQL esattamente come applicato.

set local lock_timeout='3s';set local statement_timeout='60s';
-- Metadata only. Original paths are resolved by the service, not accepted from POS JSON.
create or replace function public.pos_documento_mezzo_foto(_d public.mezzi_documenti) returns jsonb language plpgsql stable security invoker set search_path=public set timezone='UTC' as $$
declare b jsonb;oggetto jsonb;valido boolean;begin
 if _d.categoria not in('revisione','verifica_periodica','libretto','taratura','manuale_ce','pimus','autorizzazione_ministeriale') or not exists(select 1 from public.mezzi m where m.id=_d.mezzo_id and m.company_id=_d.company_id and m.deleted_at is null) then return null;end if;
 valido:=_d.file_path is not null and left(_d.file_path,length(_d.company_id::text||'/'||_d.mezzo_id::text||'/'))=_d.company_id::text||'/'||_d.mezzo_id::text||'/' and _d.file_path !~ '(^|/)(\.|\.\.|)(/|$)' and position(E'\\' in _d.file_path)=0 and array_length(string_to_array(_d.file_path,'/'),1)=3;
 if valido then select jsonb_build_object('id',x.id,'versione',x.version,'aggiornato_il',x.updated_at,'etag',x.metadata->>'eTag','dimensione',x.metadata->'size') into oggetto from storage.objects x where x.bucket_id='mezzi-documenti' and x.name=_d.file_path;end if;
 b:=jsonb_build_object('id',_d.id,'mezzo_id',_d.mezzo_id,'categoria',_d.categoria,'titolo',coalesce(_d.titolo,''),'ente',_d.ente,'data_inizio',_d.data_inizio,'data_scadenza',_d.data_scadenza,'file_name',coalesce(_d.file_name,''),'disponibile',oggetto is not null);
 return b||jsonb_build_object('impronta',public.sicurezza_sds_impronta(b||jsonb_build_object('oggetto',oggetto,'fonte_aggiornata',_d.updated_at)),'confermata',false,'revisione_dichiarata','');
end$$;
revoke all on function public.pos_documento_mezzo_foto(public.mezzi_documenti) from public,anon,authenticated;

create or replace function public.pos_controlli_mezzo_foto(_company uuid,_mezzo uuid) returns jsonb language plpgsql stable security invoker set search_path=public set timezone='UTC' as $$
declare m jsonb;s jsonb;agg_m jsonb;agg_s jsonb;doc jsonb;b jsonb;begin
 if not exists(select 1 from public.mezzi where id=_mezzo and company_id=_company and deleted_at is null) then raise exception 'Attrezzatura non disponibile' using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'tipo',x.tipo,'data',x.data,'contatore',x.contatore::text,'prossima_data',x.prossima_data,'prossimo_contatore',x.prossimo_contatore::text) order by x.data,x.id),'[]'),coalesce(jsonb_agg(jsonb_build_array(x.id,x.updated_at) order by x.data,x.id),'[]') into m,agg_m from(select * from public.mezzi_manutenzioni where company_id=_company and mezzo_id=_mezzo order by data,id limit 201)x;
 select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'tipo',x.tipo,'stato',x.stato,'creata_il',x.created_at,'chiusa_il',x.chiusa_at) order by x.created_at,x.id),'[]'),coalesce(jsonb_agg(jsonb_build_array(x.id,x.updated_at) order by x.created_at,x.id),'[]') into s,agg_s from(select * from public.mezzi_segnalazioni where company_id=_company and mezzo_id=_mezzo order by created_at,id limit 201)x;
 if jsonb_array_length(m)>200 or jsonb_array_length(s)>200 then raise exception 'Troppi controlli per questa attrezzatura: il quadro non viene troncato';end if;
 select coalesce(jsonb_agg(jsonb_build_array(docs.id,public.pos_documento_mezzo_foto(docs::public.mezzi_documenti)->>'impronta') order by docs.id),'[]') into doc from (select * from public.mezzi_documenti where company_id=_company and mezzo_id=_mezzo and categoria in('revisione','verifica_periodica','libretto','taratura','manuale_ce','pimus','autorizzazione_ministeriale') order by id limit 201)docs;
 if jsonb_array_length(doc)>200 then raise exception 'Troppi documenti per i controlli: il quadro non viene troncato';end if;
 b:=jsonb_build_object('mezzo_id',_mezzo,'manutenzioni',m,'segnalazioni',s);
 return b||jsonb_build_object('impronta',public.sicurezza_sds_impronta(b||jsonb_build_object('aggiornamenti_m',agg_m,'aggiornamenti_s',agg_s,'versioni_documenti',doc)));
end$$;
revoke all on function public.pos_controlli_mezzo_foto(uuid,uuid) from public,anon,authenticated;

create or replace function public.pos_documenti_mezzo_quadro(_company uuid,_ordine uuid,_mezzo uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare q jsonb;d public.mezzi_documenti;foto jsonb;ris jsonb:='[]';n integer:=0;begin
 -- The existing read RPC checks the authenticated safety permission and case ownership.
 q:=public.pos_mezzi_quadro(_company,_ordine);
 if not exists(select 1 from jsonb_array_elements(q->'fonti')x where x->>'mezzo_id'=_mezzo::text) then raise exception 'Attrezzatura non pertinente alla commessa' using errcode='42501';end if;
 for d in select * from public.mezzi_documenti where company_id=_company and mezzo_id=_mezzo and categoria in('revisione','verifica_periodica','libretto','taratura','manuale_ce','pimus','autorizzazione_ministeriale') order by id limit 201 loop
  n:=n+1;if n>200 then raise exception 'Troppi documenti per questa attrezzatura: il quadro non viene troncato';end if;
  foto:=public.pos_documento_mezzo_foto(d);if foto is not null then ris:=ris||jsonb_build_array(foto);end if;
 end loop;
 return jsonb_build_object('company_id',_company,'order_id',_ordine,'mezzo_id',_mezzo,'documenti',ris,'controlli',public.pos_controlli_mezzo_foto(_company,_mezzo));
end$$;
revoke all on function public.pos_documenti_mezzo_quadro(uuid,uuid,uuid) from public,anon;grant execute on function public.pos_documenti_mezzo_quadro(uuid,uuid,uuid) to authenticated;

create or replace function public.pos_mezzo_del_caso(_company uuid,_ordine uuid,_mezzo uuid) returns boolean language plpgsql stable security invoker set search_path=public as $$declare r record;begin
 for r in select 'assegnazione'::text tipo,a.id from public.mezzi_assegnazioni a where a.company_id=_company and a.order_id=_ordine and a.mezzo_id=_mezzo
 union all select 'allocazione',a.id from public.mezzi_allocazioni a where a.company_id=_company and a.order_id=_ordine and a.mezzo_id=_mezzo
 union all select 'corrente',_mezzo union all select 'su_mezzo_corrente',_mezzo loop
  if public.pos_mezzo_fotografia(_company,_ordine,_mezzo,r.tipo,r.id) is not null then return true;end if;
 end loop;return false;
end$$;
revoke all on function public.pos_mezzo_del_caso(uuid,uuid,uuid) from public,anon,authenticated;

-- Only the authenticated Edge action can sign the canonical original for a safety viewer.
-- This keeps general inventory Storage policies unchanged.
create or replace function public.pos_documento_mezzo_per_autore(_company uuid,_ordine uuid,_mezzo uuid,_documento uuid,_impronta text,_autore uuid) returns text language plpgsql security invoker set search_path=public as $$
declare d public.mezzi_documenti;f jsonb;begin
 if _autore is null or not coalesce(public.has_permission_for_company(_autore,'can_view_sicurezza_cantiere',_company),false) or not exists(select 1 from public.orders where id=_ordine and company_id=_company and deleted_at is null) or not public.pos_mezzo_del_caso(_company,_ordine,_mezzo) then raise exception 'Documento attrezzatura non disponibile' using errcode='42501';end if;
 select * into d from public.mezzi_documenti where id=_documento and company_id=_company and mezzo_id=_mezzo;
 if not found then raise exception 'Documento non disponibile' using errcode='42501';end if;
 f:=public.pos_documento_mezzo_foto(d);
 if f is null or f->'disponibile' is distinct from 'true'::jsonb then raise exception 'Originale non disponibile' using errcode='42501';end if;
 if f->>'impronta' is distinct from _impronta then raise exception 'Il documento è cambiato: rileggi la fonte' using errcode='40001';end if;
 return d.file_path;
end$$;
revoke all on function public.pos_documento_mezzo_per_autore(uuid,uuid,uuid,uuid,text,uuid) from public,anon,authenticated;grant execute on function public.pos_documento_mezzo_per_autore(uuid,uuid,uuid,uuid,text,uuid) to service_role;

-- Writers and finalization share the asset lock: newly inserted maintenance/report rows
-- cannot silently escape a previously reviewed control-set. Row-lock conflicts may require retry.
create or replace function public.pos_documenti_mezzo_blocca() returns trigger language plpgsql security invoker set search_path=public as $$declare chiavi text[];k text;begin
 if tg_op='INSERT' then chiavi:=array[new.company_id::text||':'||new.mezzo_id::text];
 elsif tg_op='DELETE' then chiavi:=array[old.company_id::text||':'||old.mezzo_id::text];
 else chiavi:=array[old.company_id::text||':'||old.mezzo_id::text,new.company_id::text||':'||new.mezzo_id::text];end if;
 for k in select distinct x from unnest(chiavi)x order by x loop perform pg_advisory_xact_lock(hashtextextended('pos-documenti-mezzo:'||k,0));end loop;
 if tg_op='DELETE' then return old;end if;return new;
end$$;
revoke all on function public.pos_documenti_mezzo_blocca() from public,anon,authenticated;
drop trigger if exists pos_documenti_mezzo_blocca on public.mezzi_documenti;
create trigger pos_documenti_mezzo_blocca before insert or update or delete on public.mezzi_documenti for each row execute function public.pos_documenti_mezzo_blocca();
drop trigger if exists pos_manutenzioni_mezzo_blocca on public.mezzi_manutenzioni;
create trigger pos_manutenzioni_mezzo_blocca before insert or update or delete on public.mezzi_manutenzioni for each row execute function public.pos_documenti_mezzo_blocca();
drop trigger if exists pos_segnalazioni_mezzo_blocca on public.mezzi_segnalazioni;
create trigger pos_segnalazioni_mezzo_blocca before insert or update or delete on public.mezzi_segnalazioni for each row execute function public.pos_documenti_mezzo_blocca();

create or replace function public.pos_documenti_mezzi_verifica(_company uuid,_ordine uuid,_contenuto jsonb) returns jsonb language plpgsql security invoker set search_path=public set timezone='UTC' as $$
declare l jsonb;a jsonb;v jsonb;x jsonb;e public.mezzi_documenti;foto jsonb;quadro jsonb;mezzo uuid;k uuid;dal date;al date;collegamenti jsonb:='[]';allegati jsonb:='[]';ids uuid[]:=array[]::uuid[];locali uuid[];indice integer:=0;n integer:=0;begin
 if _contenuto->'versione_documenti_mezzi' is distinct from '1'::jsonb then return jsonb_build_object('versione',0,'collegamenti','[]'::jsonb,'allegati','[]'::jsonb);end if;
 if _contenuto->'versione_mezzi' is distinct from '1'::jsonb then raise exception 'Collega prima le identità delle attrezzature';end if;
 perform public.pos_mezzi_verifica(_company,_ordine,_contenuto);
 perform set_config('lock_timeout','3s',true);
 for k in select distinct nullif(t.a->'anagrafica'->'fonte'->>'mezzo_id','')::uuid from jsonb_array_elements(_contenuto->'lavorazioni') ll(lavoro) cross join lateral jsonb_array_elements(ll.lavoro->'tecnica'->'attrezzature')t(a) where t.a->'anagrafica'->>'modalita'='inventario' order by 1 loop
  perform pg_advisory_xact_lock(hashtextextended('pos-documenti-mezzo:'||_company::text||':'||k::text,0));
 end loop;
 for l in select * from jsonb_array_elements(_contenuto->'lavorazioni') loop
  indice:=indice+1;
  for a in select * from jsonb_array_elements(l->'tecnica'->'attrezzature') loop
   n:=n+1;if n>500 then raise exception 'Il POS supera 500 associazioni di documentazione attrezzatura';end if;
   mezzo:=case when a->'anagrafica'->>'modalita'='inventario' then (a->'anagrafica'->'fonte'->>'mezzo_id')::uuid else null end;
   dal:=(a->'anagrafica'->>'utilizzo_dal')::date;al:=(a->'anagrafica'->>'utilizzo_al')::date;
   v:=a->'documentazione';
   if jsonb_typeof(v) is distinct from 'object' or v->'confermata' is distinct from 'true'::jsonb or jsonb_typeof(v->'documenti') is distinct from 'array' or jsonb_typeof(v->'riesame_controlli') is distinct from 'string' or length(trim(v->>'riesame_controlli'))=0 then raise exception 'Riesamina documenti, controlli e criticità dell’attrezzatura';end if;
   if mezzo is not null then
    -- Freeze metadata of the existing technical originals while checking the reviewed set.
    -- File contents are separately copied and hashed by the emission service.
    perform 1 from storage.objects so join public.mezzi_documenti md on md.file_path=so.name and md.company_id=_company and md.mezzo_id=mezzo where so.bucket_id='mezzi-documenti' and md.categoria in('revisione','verifica_periodica','libretto','taratura','manuale_ce','pimus','autorizzazione_ministeriale') and left(so.name,length(_company::text||'/'||mezzo::text||'/'))=_company::text||'/'||mezzo::text||'/' order by so.name for share of so;
    quadro:=public.pos_controlli_mezzo_foto(_company,mezzo);
    if v->'controlli' is distinct from quadro then raise exception 'Controlli o documenti dell’attrezzatura cambiati: rileggi il quadro' using errcode='40001';end if;
   elsif coalesce(v->'controlli','null'::jsonb)<>'null'::jsonb then raise exception 'Attrezzatura non censita con controlli di un’altra anagrafica';end if;
   if v->>'modalita'='documenti' then
    if mezzo is null or jsonb_array_length(v->'documenti') not between 1 and 20 then raise exception 'Collega da 1 a 20 documenti della specifica attrezzatura';end if;
    locali:=array[]::uuid[];
    for x in select * from jsonb_array_elements(v->'documenti') loop
     select * into e from public.mezzi_documenti where id=(x->>'id')::uuid and company_id=_company and mezzo_id=mezzo for share;
     if not found then raise exception 'Documento non pertinente alla specifica attrezzatura';end if;
     if e.id=any(locali) then raise exception 'Documento attrezzatura duplicato';end if;locali:=array_append(locali,e.id);
     if e.file_path is not null then perform 1 from storage.objects where bucket_id='mezzi-documenti' and name=e.file_path for share;end if;
     foto:=public.pos_documento_mezzo_foto(e);
     if foto is null or foto->'disponibile' is distinct from 'true'::jsonb or nullif(trim(e.file_name),'') is null then raise exception 'Originale tecnico dell’attrezzatura non disponibile';end if;
     if (x-'confermata'-'revisione_dichiarata') is distinct from (foto-'confermata'-'revisione_dichiarata') then raise exception 'Documento o originale dell’attrezzatura cambiato: rileggi la fonte' using errcode='40001';end if;
     if x->'confermata' is distinct from 'true'::jsonb or jsonb_typeof(x->'revisione_dichiarata') is distinct from 'string' or length(trim(x->>'revisione_dichiarata'))=0 then raise exception 'Indica la revisione letta nel documento e conferma la pertinenza';end if;
     if coalesce(e.data_inizio,'-infinity'::date)>dal or coalesce(e.data_scadenza,'infinity'::date)<al then raise exception 'Documento attrezzatura non valido per tutto l’uso dichiarato';end if;
     if not e.id=any(ids) then
      ids:=array_append(ids,e.id);if array_length(ids,1)>80 then raise exception 'Troppi documenti attrezzatura da conservare';end if;
      allegati:=allegati||jsonb_build_array(jsonb_build_object('evidenza_id',e.id,'mezzo_id',mezzo,'bucket','mezzi-documenti','path',e.file_path,'nome',e.file_name,'impronta',foto->>'impronta'));
     end if;
    end loop;
   elsif v->>'modalita'='altra_gestione' then
    if jsonb_array_length(v->'documenti')<>0 or jsonb_typeof(v->'motivazione') is distinct from 'string' or length(trim(v->>'motivazione'))=0 then raise exception 'Motiva l’altra gestione documentale senza nascondere documenti collegati';end if;
   else raise exception 'Scegli la gestione documentale dell’attrezzatura';end if;
   collegamenti:=collegamenti||jsonb_build_array(jsonb_build_object('lavorazione',indice,'lavorazione_id',l->>'id','scheda_id',a->>'id','documentazione',v));
  end loop;
 end loop;
 return jsonb_build_object('versione',1,'collegamenti',collegamenti,'allegati',allegati);
end$$;
revoke all on function public.pos_documenti_mezzi_verifica(uuid,uuid,jsonb) from public,anon,authenticated;grant execute on function public.pos_documenti_mezzi_verifica(uuid,uuid,jsonb) to service_role;

create or replace function public.pos_documenti_mezzi_fonti_emissione(_pos_id uuid,_autore uuid) returns jsonb language plpgsql security invoker set search_path=public as $$declare p public.pos_documents;begin
 select * into p from public.pos_documents where id=_pos_id;
 if not found or p.status<>'bozza' or not public.pos_puo_emettere(_autore,p.company_id) then raise exception 'Fonti documentali attrezzatura non disponibili' using errcode='42501';end if;
 return public.pos_documenti_mezzi_verifica(p.company_id,p.order_id,p.contenuto);
end$$;
revoke all on function public.pos_documenti_mezzi_fonti_emissione(uuid,uuid) from public,anon,authenticated;grant execute on function public.pos_documenti_mezzi_fonti_emissione(uuid,uuid) to service_role;

create or replace function public.pos_documenti_mezzi_guardia() returns trigger language plpgsql security invoker set search_path=public as $$begin
 if coalesce(new.document_type,'pos')<>'pos' then return new;end if;
 if tg_op='UPDATE' and old.contenuto->'versione_documenti_mezzi'='1'::jsonb and new.contenuto->'versione_documenti_mezzi' is distinct from '1'::jsonb then raise exception 'Questo POS richiede l’editor dei documenti attrezzatura: ricarica prima di salvare' using errcode='40001';end if;
 if new.contenuto ? 'versione_documenti_mezzi' and new.contenuto->'versione_documenti_mezzi' is distinct from '1'::jsonb then raise exception 'Versione documenti attrezzatura non supportata';end if;
 if new.contenuto->'versione_documenti_mezzi'='1'::jsonb and new.contenuto->'versione_mezzi' is distinct from '1'::jsonb then raise exception 'Attiva prima le identità delle attrezzature';end if;
 if new.contenuto->'versione_documenti_mezzi'='1'::jsonb and new.status='approvato' and (tg_op='INSERT' or old.status<>'approvato') then perform public.pos_documenti_mezzi_verifica(new.company_id,new.order_id,new.contenuto);end if;
 return new;
end$$;
revoke all on function public.pos_documenti_mezzi_guardia() from public,anon,authenticated;
drop trigger if exists pos_documenti_mezzi_guardia on public.pos_documents;
create trigger pos_documenti_mezzi_guardia before insert or update of contenuto,status on public.pos_documents for each row execute function public.pos_documenti_mezzi_guardia();

-- Baseline U finalizer MD5 c4f0e5f65aafd36ef328bac4ce534d13 verified against live.
do $$declare v text;begin select md5(prosrc) into v from pg_proc where pronamespace='public'::regnamespace and proname='pos_completa_emissione';if v not in('c4f0e5f65aafd36ef328bac4ce534d13','ff3b5b2d516ad788e39fe7e742384a96') or v is null then raise exception 'Finalizzatore POS cambiato: riesamina prima di applicare la migrazione';end if;end$$;
create or replace function public.pos_completa_emissione(_id uuid,_token uuid,_autore uuid,_nome_autore text,_manifest jsonb,_manifest_sha256 text,_zip_sha256 text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare e public.pos_emissioni;p public.pos_documents; prefisso text; a_id uuid; f jsonb; prova_prodotti jsonb; a_sds jsonb; prova_tecnica jsonb; prova_mezzi jsonb; prova_documenti_mezzi jsonb;
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
  if p.contenuto->'versione_documenti_mezzi'='1'::jsonb then
   prova_documenti_mezzi:=public.pos_documenti_mezzi_verifica(p.company_id,p.order_id,p.contenuto);
   if _manifest->'documenti_mezzi' is distinct from jsonb_build_object('versione',1,'collegamenti',prova_documenti_mezzi->'collegamenti') then raise exception 'Il pacchetto non conserva documenti e controlli attrezzatura riesaminati';end if;
   for a_sds in select * from jsonb_array_elements(prova_documenti_mezzi->'allegati') loop
    if not exists(select 1 from jsonb_array_elements(_manifest->'file') mf where mf->>'ruolo'='allegato' and mf->>'tipo'='documento_attrezzatura' and mf->>'evidenza_id'=a_sds->>'evidenza_id' and mf->>'mezzo_id'=a_sds->>'mezzo_id' and mf->>'impronta_metadati'=a_sds->>'impronta' and mf->'fonte'->>'bucket'=a_sds->>'bucket' and mf->'fonte'->>'path'=a_sds->>'path') then raise exception 'Originale della specifica attrezzatura non conservato nel pacchetto';end if;
   end loop;
  end if;
  if p.contenuto->'versione_mezzi'='1'::jsonb then
   prova_mezzi:=public.pos_mezzi_verifica(p.company_id,p.order_id,p.contenuto);
   if _manifest->'mezzi_pos' is distinct from prova_mezzi then raise exception 'Il pacchetto non conserva identità e assegnazioni attrezzatura riesaminate';end if;
  end if;
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


notify pgrst,'reload schema';
