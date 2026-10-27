-- File ricostruito il 27/10/2026 dal registro del database (supabase_migrations.schema_migrations).
-- La migrazione era già applicata in produzione con questa versione, ma il file non era mai stato salvato nel repository:
-- il controllo «Supabase Preview» segnalava «Remote migration versions not found in local migrations directory».
-- Sotto c'è l'SQL esattamente come applicato.

set local lock_timeout='3s';set local statement_timeout='60s';
-- Operational photographs use canonical IDs. No costs, HR assignees, notes or private file paths.
create or replace function public.pos_mezzo_fotografia(_company uuid,_ordine uuid,_mezzo uuid,_tipo text,_fonte uuid) returns jsonb language plpgsql stable security invoker set search_path=public set timezone='UTC' as $$
declare m public.mezzi;a public.mezzi_assegnazioni;q public.mezzi_allocazioni;p public.mezzi;b jsonb;dal date;al date;quantita text:='1';supporto uuid;begin
 select * into m from public.mezzi where id=_mezzo and company_id=_company and deleted_at is null;if not found then return null;end if;
 if _tipo='assegnazione' then
  if m.gestione='quantita' then return null;end if;
  select * into a from public.mezzi_assegnazioni where id=_fonte and company_id=_company and mezzo_id=m.id and order_id=_ordine;
  if not found or a.al is null and (m.assegnato_order_id is distinct from _ordine or m.su_mezzo_id is not null) then return null;end if;
  dal:=(a.dal at time zone 'Europe/Rome')::date;al:=case when a.al is null then null else ((a.al-interval '1 microsecond') at time zone 'Europe/Rome')::date end;
 elsif _tipo='allocazione' then
  if m.gestione<>'quantita' then return null;end if;
  select * into q from public.mezzi_allocazioni where id=_fonte and company_id=_company and mezzo_id=m.id and order_id=_ordine;
  if not found or q.quantita<=0 then return null;end if;dal:=q.dal;al:=q.al;quantita:=q.quantita::text;
 elsif _tipo='corrente' then
  if _fonte is distinct from m.id or m.gestione='quantita' or m.assegnato_order_id is distinct from _ordine or m.su_mezzo_id is not null or exists(select 1 from public.mezzi_assegnazioni x where x.company_id=_company and x.mezzo_id=m.id and x.order_id=_ordine) then return null;end if;
 elsif _tipo='su_mezzo_corrente' then
  if _fonte is distinct from m.id or m.gestione='quantita' or m.su_mezzo_id is null or m.assegnato_order_id is not null then return null;end if;
  select * into p from public.mezzi where id=m.su_mezzo_id and company_id=_company and deleted_at is null and assegnato_order_id=_ordine;
  if not found or p.id=m.id then return null;end if;supporto:=p.id;
 else return null;end if;
 b:=jsonb_build_object('mezzo_id',m.id,'fonte_tipo',_tipo,'fonte_id',_fonte,'order_id',_ordine,'nome',m.nome,'codice',m.codice,'marca',m.marca,'modello',m.modello,'matricola',m.matricola,'targa',m.targa,'tipo',m.tipo,'stato',m.stato,'gestione',m.gestione,'quantita',quantita,'unita',case when _tipo='allocazione' then m.unita_misura else 'pz' end,'dal',dal,'al',al,'su_mezzo_id',supporto,'contatore',m.contatore::text,'contatore_unita',m.contatore_unita);
 return b||jsonb_build_object('impronta',public.sicurezza_sds_impronta(b));
end$$;
revoke all on function public.pos_mezzo_fotografia(uuid,uuid,uuid,text,uuid) from public,anon,authenticated;
create or replace function public.pos_mezzi_quadro(_company uuid,_ordine uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare r record;v jsonb;ris jsonb:='[]';n integer:=0;begin
 if auth.uid() is null or not public.has_permission_for_company(auth.uid(),'can_view_sicurezza_cantiere',_company) or not exists(select 1 from public.orders where id=_ordine and company_id=_company and deleted_at is null) then raise exception 'Attrezzature non disponibili per questa commessa' using errcode='42501';end if;
 for r in
  with candidati as (
   select a.mezzo_id,'assegnazione'::text tipo,a.id from public.mezzi_assegnazioni a where a.company_id=_company and a.order_id=_ordine
   union all select a.mezzo_id,'allocazione',a.id from public.mezzi_allocazioni a where a.company_id=_company and a.order_id=_ordine
   union all select m.id,'corrente',m.id from public.mezzi m where m.company_id=_company and m.assegnato_order_id=_ordine and m.deleted_at is null and m.gestione<>'quantita' and not exists(select 1 from public.mezzi_assegnazioni a where a.company_id=_company and a.mezzo_id=m.id and a.order_id=_ordine)
   union all select m.id,'su_mezzo_corrente',m.id from public.mezzi m join public.mezzi p on p.id=m.su_mezzo_id and p.company_id=_company and p.assegnato_order_id=_ordine and p.deleted_at is null where m.company_id=_company and m.deleted_at is null and m.gestione<>'quantita' and m.assegnato_order_id is null
  ) select * from candidati order by mezzo_id,tipo,id limit 501
 loop
  n:=n+1;if n>500 then raise exception 'Troppi record di assegnazione: verifica il periodo nell’inventario prima di collegare';end if;
  v:=public.pos_mezzo_fotografia(_company,_ordine,r.mezzo_id,r.tipo,r.id);if v is not null then ris:=ris||jsonb_build_array(v);end if;
 end loop;
 return jsonb_build_object('company_id',_company,'order_id',_ordine,'fonti',ris);
end$$;
revoke all on function public.pos_mezzi_quadro(uuid,uuid) from public,anon;grant execute on function public.pos_mezzi_quadro(uuid,uuid) to authenticated;
create or replace function public.pos_mezzi_verifica(_company uuid,_ordine uuid,_contenuto jsonb) returns jsonb language plpgsql security invoker set search_path=public as $$
declare l jsonb;a jsonb;s jsonb;f jsonb;foto jsonb;inizio date;fine date;dal date;al date;qty numeric;collegamenti jsonb:='[]';indice integer:=0;n integer:=0;begin
 if _contenuto->'versione_mezzi' is distinct from '1'::jsonb then return jsonb_build_object('versione',0,'collegamenti','[]'::jsonb);end if;
 if _contenuto->'versione_tecnica' is distinct from '1'::jsonb or length(_contenuto::text)>1000000 or jsonb_typeof(_contenuto->'lavorazioni') is distinct from 'array' then raise exception 'Contenuto delle attrezzature POS non valido';end if;
 if not exists(select 1 from public.orders where id=_ordine and company_id=_company and deleted_at is null) then raise exception 'Commessa non disponibile';end if;
 if coalesce(_contenuto->'opera'->>'data_inizio','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Indica il periodo POS per le attrezzature';end if;
 inizio:=(_contenuto->'opera'->>'data_inizio')::date;fine:=coalesce(nullif(_contenuto->'opera'->>'data_fine','')::date,'infinity'::date);if fine<inizio then raise exception 'Periodo POS incoerente';end if;
 perform set_config('lock_timeout','3s',true);
 for l in select * from jsonb_array_elements(_contenuto->'lavorazioni') loop
  indice:=indice+1;
  if jsonb_typeof(l->'tecnica'->'attrezzature') is distinct from 'array' then raise exception 'Descrivi le attrezzature di ogni lavorazione';end if;
  for a in select * from jsonb_array_elements(l->'tecnica'->'attrezzature') loop
   n:=n+1;if n>500 then raise exception 'Il POS supera 500 riferimenti attrezzatura';end if;
   s:=a->'anagrafica';if jsonb_typeof(s) is distinct from 'object' or s->'confermata' is distinct from 'true'::jsonb then raise exception 'Conferma identità, assegnazione e periodo dell’attrezzatura';end if;
   if coalesce(s->>'utilizzo_dal','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or coalesce(s->>'utilizzo_al','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Indica l’intervallo d’uso dell’attrezzatura';end if;
   dal:=(s->>'utilizzo_dal')::date;al:=(s->>'utilizzo_al')::date;if dal<inizio or al>fine or al<dal then raise exception 'Periodo d’uso dell’attrezzatura fuori dal POS';end if;
   if jsonb_typeof(s->'quantita_usata') is distinct from 'number' then raise exception 'Indica la quantità effettivamente usata';end if;qty:=(s->>'quantita_usata')::numeric;if qty<=0 then raise exception 'Quantità d’uso non valida';end if;
   if s->>'modalita'='inventario' then
    f:=s->'fonte';
    perform 1 from public.mezzi where id=(f->>'mezzo_id')::uuid and company_id=_company for share;
    if f->>'fonte_tipo'='assegnazione' then perform 1 from public.mezzi_assegnazioni where id=(f->>'fonte_id')::uuid and company_id=_company for share;
    elsif f->>'fonte_tipo'='allocazione' then perform 1 from public.mezzi_allocazioni where id=(f->>'fonte_id')::uuid and company_id=_company for share;
    elsif f->>'fonte_tipo'='su_mezzo_corrente' then perform 1 from public.mezzi where id=(f->>'su_mezzo_id')::uuid and company_id=_company for share;end if;
    foto:=public.pos_mezzo_fotografia(_company,_ordine,(f->>'mezzo_id')::uuid,f->>'fonte_tipo',(f->>'fonte_id')::uuid);
    if foto is null or foto is distinct from f then raise exception 'Attrezzatura o assegnazione cambiata: rileggi l’inventario' using errcode='40001';end if;
    if f->>'stato'<>'in_servizio' then raise exception 'L’attrezzatura non è in servizio';end if;
    if nullif(f->>'dal','')::date>dal or nullif(f->>'al','')::date<al then raise exception 'Assegnazione o allocazione non copre l’uso dichiarato';end if;
    if qty>(f->>'quantita')::numeric or f->>'fonte_tipo'<>'allocazione' and qty<>1 then raise exception 'Quantità d’uso oltre la fonte registrata';end if;
   elsif s->>'modalita'='non_censita' then
    if jsonb_typeof(s->'motivazione') is distinct from 'string' or length(trim(s->>'motivazione'))=0 or coalesce(s->'fonte','null'::jsonb)<>'null'::jsonb then raise exception 'Motiva l’attrezzatura non censita senza nascondere collegamenti';end if;
   else raise exception 'Identifica l’attrezzatura effettiva o motiva la mancata anagrafica';end if;
   collegamenti:=collegamenti||jsonb_build_array(jsonb_build_object('lavorazione',indice,'lavorazione_id',l->>'id','scheda_id',a->>'id','anagrafica',s));
  end loop;
 end loop;
 return jsonb_build_object('versione',1,'collegamenti',collegamenti);
end$$;
revoke all on function public.pos_mezzi_verifica(uuid,uuid,jsonb) from public,anon,authenticated;grant execute on function public.pos_mezzi_verifica(uuid,uuid,jsonb) to service_role;
create or replace function public.pos_mezzi_fonti_emissione(_pos_id uuid,_autore uuid) returns jsonb language plpgsql security invoker set search_path=public as $$declare p public.pos_documents;begin
 select * into p from public.pos_documents where id=_pos_id;if not found or p.status<>'bozza' or not public.pos_puo_emettere(_autore,p.company_id) then raise exception 'Fonti attrezzatura non disponibili' using errcode='42501';end if;
 return public.pos_mezzi_verifica(p.company_id,p.order_id,p.contenuto);
end$$;
revoke all on function public.pos_mezzi_fonti_emissione(uuid,uuid) from public,anon,authenticated;grant execute on function public.pos_mezzi_fonti_emissione(uuid,uuid) to service_role;
create or replace function public.pos_mezzi_guardia() returns trigger language plpgsql security invoker set search_path=public as $$begin
 if coalesce(new.document_type,'pos')<>'pos' then return new;end if;
 if tg_op='UPDATE' and old.contenuto->'versione_mezzi'='1'::jsonb and new.contenuto->'versione_mezzi' is distinct from '1'::jsonb then raise exception 'Questo POS richiede l’editor delle attrezzature: ricarica prima di salvare' using errcode='40001';end if;
 if new.contenuto ? 'versione_mezzi' and new.contenuto->'versione_mezzi' is distinct from '1'::jsonb then raise exception 'Versione delle attrezzature POS non supportata';end if;
 if new.contenuto->'versione_mezzi'='1'::jsonb and new.status='approvato' and (tg_op='INSERT' or old.status<>'approvato') then perform public.pos_mezzi_verifica(new.company_id,new.order_id,new.contenuto);end if;
 return new;
end$$;
revoke all on function public.pos_mezzi_guardia() from public,anon,authenticated;
drop trigger if exists pos_mezzi_guardia on public.pos_documents;
create trigger pos_mezzi_guardia before insert or update of contenuto,status on public.pos_documents for each row execute function public.pos_mezzi_guardia();
notify pgrst,'reload schema';

-- Preserve all prior atomic emission checks and revalidate canonical equipment sources.
create or replace function public.pos_completa_emissione(_id uuid,_token uuid,_autore uuid,_nome_autore text,_manifest jsonb,_manifest_sha256 text,_zip_sha256 text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare e public.pos_emissioni;p public.pos_documents; prefisso text; a_id uuid; f jsonb; prova_prodotti jsonb; a_sds jsonb; prova_tecnica jsonb; prova_mezzi jsonb;
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
