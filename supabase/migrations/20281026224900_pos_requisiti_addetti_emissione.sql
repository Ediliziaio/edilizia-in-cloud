-- Z2b: explicit per-work reviewed own-emitter requirements and immutable originals.
set local lock_timeout='3s';set local statement_timeout='60s';
-- PostgreSQL row locks require UPDATE on at least one column. Only the immutable ID
-- is granted: the existing immutable-profile trigger rejects any ID change.
grant update(id) on public.sicurezza_profili_requisiti to service_role;
-- The trusted service calls invoker helpers with the already authenticated actor.
grant execute on function public.sicurezza_qualifiche_accesso_autore(uuid,text,uuid,uuid),public.sicurezza_qualifica_fonte_autore(uuid,text,uuid,uuid,uuid),public.sicurezza_addetti_fotografia_autore(uuid,uuid,date,date,uuid,uuid),public.pos_addetto_non_collegato_proprio(uuid,uuid,jsonb),public.pos_riesame_proprio_foto(uuid,uuid,uuid,uuid) to service_role;

create or replace function public.pos_requisiti_addetti_verifica(_company uuid,_ordine uuid,_contenuto jsonb,_autore uuid) returns jsonb language plpgsql security invoker set search_path=public set timezone='UTC' as $$
declare l jsonb;v jsonb;r jsonb;foto jsonb;q jsonb;persona jsonb;originale jsonb;ids uuid[]:=array[]::uuid[];locali uuid[];k text;dal date;al date;indice integer:=0;collegamenti jsonb:='[]';allegati jsonb:='[]';n integer:=0;
begin
 if _autore is null or not coalesce(public.has_permission_for_company(_autore,'can_view_sicurezza_cantiere',_company),false) or not exists(select 1 from public.orders where id=_ordine and company_id=_company and deleted_at is null) then raise exception 'Requisiti non disponibili per questa impresa e commessa' using errcode='42501';end if;
 if _contenuto->'versione_requisiti_addetti' is distinct from '1'::jsonb then return jsonb_build_object('versione',0,'collegamenti','[]'::jsonb,'allegati','[]'::jsonb);end if;
 perform set_config('lock_timeout','3s',true);
 perform pg_advisory_xact_lock(hashtextextended('requisiti-addetti:'||_company::text||':'||_ordine::text,0));
 -- Same canonical person locks as qualification writers; never infer identity from names.
 for k in select distinct r.p->>'id' from jsonb_array_elements(_contenuto->'lavorazioni') w(l) cross join lateral jsonb_array_elements(w.l->'requisiti_addetti'->'fonti')s(f) cross join lateral jsonb_array_elements(s.f->'fotografia'->'persone')r(p) order by 1 loop
  if coalesce(k,'')!~'^[0-9a-f-]{36}$' then raise exception 'Identità addetto non valida';end if;
  perform pg_advisory_xact_lock(hashtextextended('qualifiche:'||_company::text||':hr:'||k,0));
 end loop;
 for l in select value from jsonb_array_elements(_contenuto->'lavorazioni') loop
  indice:=indice+1;v:=l->'requisiti_addetti';
  if jsonb_typeof(v) is distinct from 'object' or (v-array['modalita','dal','al','motivazione','adattamento','fonti','confermata','contesto_lavorazione'])<>'{}'::jsonb or v->'confermata' is distinct from 'true'::jsonb or v->'contesto_lavorazione' is distinct from (l-'requisiti_addetti') or jsonb_typeof(v->'fonti') is distinct from 'array' or jsonb_typeof(v->'adattamento') is distinct from 'string' or length(trim(v->>'adattamento')) not between 1 and 4000 then raise exception 'Riesamina i requisiti nominativi dopo le modifiche alla lavorazione';end if;
  if coalesce(v->>'dal','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or coalesce(v->>'al','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Indica il periodo della lavorazione';end if;
  dal:=(v->>'dal')::date;al:=(v->>'al')::date;
  if al<dal or nullif(_contenuto->'opera'->>'data_inizio','')::date is null or nullif(_contenuto->'opera'->>'data_fine','')::date is null or dal<(_contenuto->'opera'->>'data_inizio')::date or al>(_contenuto->'opera'->>'data_fine')::date then raise exception 'Periodo della lavorazione fuori dalle date del POS';end if;
  if v->>'modalita'='altra_gestione' then
   if l->>'svolgimento' is distinct from 'subappalto' or nullif(trim(l->>'svolgimento_con'),'') is null or jsonb_array_length(v->'fonti')<>0 or jsonb_typeof(v->'motivazione') is distinct from 'string' or length(trim(v->>'motivazione')) not between 1 and 4000 then raise exception 'L’esclusione dell’organico proprio richiede una lavorazione interamente subappaltata, impresa e motivazione';end if;
  elsif v->>'modalita'='riesami' then
   if jsonb_array_length(v->'fonti') not between 1 and 10 then raise exception 'Collega da uno a dieci riesami nominativi distinti';end if;
   locali:=array[]::uuid[];
   for r in select value from jsonb_array_elements(v->'fonti') loop
    n:=n+1;if n>100 then raise exception 'Troppi collegamenti nominativi: suddividi il POS';end if;
    if jsonb_typeof(r) is distinct from 'object' or (r-array['id','impronta','fotografia'])<>'{}'::jsonb or coalesce(r->>'impronta','')!~'^[0-9a-f]{64}$' or (r->>'id')::uuid=any(locali) then raise exception 'Riferimento al riesame non valido o duplicato';end if;
    locali:=array_append(locali,(r->>'id')::uuid);
    foto:=public.pos_riesame_proprio_foto(_company,_ordine,(r->>'id')::uuid,_autore);
    if foto is distinct from r->'fotografia' or foto->>'impronta' is distinct from r->>'impronta' then raise exception 'Riesame o fonti cambiati: rileggi i dati della propria impresa' using errcode='40001';end if;
    if foto->>'fase_id' is distinct from l->>'fase_id' or (foto->>'dal')::date>dal or (foto->>'al')::date<al then raise exception 'Riesame non pertinente alla fase o all’intero periodo della lavorazione';end if;
    if foto->'attrezzatura' is not null and foto->'attrezzatura'<>'null'::jsonb and not exists(select 1 from jsonb_array_elements(l->'tecnica'->'attrezzature')a where a->'anagrafica'->>'modalita'='inventario' and a->'anagrafica'->'fonte'->>'mezzo_id'=foto->'attrezzatura'->>'mezzo_id') then raise exception 'Il riesame riguarda una macchina non collegata alla lavorazione';end if;
    for persona in select value from jsonb_array_elements(foto->'criteri') order by value->>'famiglia_id' loop
     perform pg_advisory_xact_lock(hashtextextended('profilo'||_company::text||(persona->>'famiglia_id'),0));
     perform 1 from public.sicurezza_profili_requisiti where id=(persona->>'profilo_id')::uuid and company_id=_company for share;
    end loop;
    for persona in select value from jsonb_array_elements(foto->'persone') loop
     perform 1 from public.hr_profili where id=(persona->>'id')::uuid and company_id=_company for share;
     if not exists(select 1 from jsonb_array_elements(_contenuto->'formazione')f where f->'riferimento_addetto'->>'tipo'='hr' and f->'riferimento_addetto'->>'id'=persona->>'id' and trim(f->>'nominativo')=trim(coalesce(persona->>'nome','')||' '||coalesce(persona->>'cognome',''))) then raise exception 'Allinea l’identità dell’addetto nella sezione Formazione del POS';end if;
    end loop;
    for q in select value->'qualifica' from jsonb_array_elements(foto->'riscontri') where value->>'esito'='riesaminata' loop
     perform 1 from public.hr_documenti where id=(q->>'fonte_id')::uuid and company_id=_company and hr_profilo_id=(q->>'persona_id')::uuid for share;
     originale:=public.sicurezza_qualifica_fonte_autore(_company,'hr',(q->>'persona_id')::uuid,(q->>'fonte_id')::uuid,_autore);
     perform 1 from storage.objects where bucket_id='hr-documenti' and name=originale->>'path' for share;
     originale:=public.sicurezza_qualifica_fonte_autore(_company,'hr',(q->>'persona_id')::uuid,(q->>'fonte_id')::uuid,_autore);
     if originale->'foto'->>'impronta' is distinct from q->>'fonte_impronta' then raise exception 'Originale modificato durante la verifica: rileggi il riesame' using errcode='40001';end if;
     if not (q->>'fonte_id')::uuid=any(ids) then
      ids:=array_append(ids,(q->>'fonte_id')::uuid);if array_length(ids,1)>80 then raise exception 'Troppi originali formativi da conservare';end if;
      allegati:=allegati||jsonb_build_array(jsonb_build_object('evidenza_id',q->>'fonte_id','persona_id',q->>'persona_id','bucket','hr-documenti','path',originale->>'path','nome',originale->'foto'->>'file_name','impronta',q->>'fonte_impronta'));
     end if;
    end loop;
    if public.pos_riesame_proprio_foto(_company,_ordine,(r->>'id')::uuid,_autore) is distinct from foto then raise exception 'Fonti cambiate durante la verifica nominativa' using errcode='40001';end if;
   end loop;
  else raise exception 'Definisci i requisiti nominativi della lavorazione';end if;
  collegamenti:=collegamenti||jsonb_build_array(jsonb_build_object('lavorazione',indice,'lavorazione_id',l->>'id','requisiti',v));
 end loop;
 return jsonb_build_object('versione',1,'collegamenti',collegamenti,'allegati',allegati);
end$$;
revoke all on function public.pos_requisiti_addetti_verifica(uuid,uuid,jsonb,uuid) from public,anon,authenticated;grant execute on function public.pos_requisiti_addetti_verifica(uuid,uuid,jsonb,uuid) to service_role;
create or replace function public.pos_requisiti_addetti_fonti_emissione(_pos_id uuid,_autore uuid) returns jsonb language plpgsql security invoker set search_path=public as $$declare p public.pos_documents;begin
 select * into p from public.pos_documents where id=_pos_id;
 if not found or p.status<>'bozza' or not public.pos_puo_emettere(_autore,p.company_id) then raise exception 'Fonti nominative non disponibili' using errcode='42501';end if;
 return public.pos_requisiti_addetti_verifica(p.company_id,p.order_id,p.contenuto,_autore);
end$$;
revoke all on function public.pos_requisiti_addetti_fonti_emissione(uuid,uuid) from public,anon,authenticated;grant execute on function public.pos_requisiti_addetti_fonti_emissione(uuid,uuid) to service_role;
create or replace function public.pos_requisiti_addetti_guardia() returns trigger language plpgsql security invoker set search_path=public as $$begin
 if coalesce(new.document_type,'pos')<>'pos' then return new;end if;
 if tg_op='UPDATE' and old.contenuto->'versione_requisiti_addetti'='1'::jsonb and new.contenuto->'versione_requisiti_addetti' is distinct from '1'::jsonb then raise exception 'Il POS richiede i riscontri nominativi: ricarica l’editor' using errcode='40001';end if;
 if new.contenuto ? 'versione_requisiti_addetti' and new.contenuto->'versione_requisiti_addetti' is distinct from '1'::jsonb then raise exception 'Versione requisiti addetti non supportata';end if;
 if new.contenuto->'versione_requisiti_addetti'='1'::jsonb then
  if tg_op='UPDATE' and old.status='approvato' and new.status='bozza' then
   new.contenuto:=jsonb_set(new.contenuto,'{lavorazioni}',coalesce((select jsonb_agg(case when l ? 'requisiti_addetti' then jsonb_set(jsonb_set(l,'{requisiti_addetti,confermata}','false'::jsonb),'{requisiti_addetti,contesto_lavorazione}','null'::jsonb) else l end order by n)from jsonb_array_elements(new.contenuto->'lavorazioni') with ordinality t(l,n)),'[]'::jsonb));
  end if;
  if new.contenuto->'versione_controlli' is distinct from '2'::jsonb then raise exception 'Attiva prima i controlli espliciti del POS';end if;
  if new.status='approvato' and(tg_op='INSERT' or old.status<>'approvato') then perform public.pos_requisiti_addetti_verifica(new.company_id,new.order_id,new.contenuto,coalesce(auth.uid(),new.approvato_da));end if;
 elsif exists(select 1 from jsonb_array_elements(new.contenuto->'lavorazioni')l where l ? 'requisiti_addetti') then raise exception 'Attiva il protocollo nominativo prima di salvare questi collegamenti';end if;
 return new;
end$$;
revoke all on function public.pos_requisiti_addetti_guardia() from public,anon,authenticated;
drop trigger if exists pos_requisiti_addetti_guardia on public.pos_documents;
create trigger pos_requisiti_addetti_guardia before insert or update of contenuto,status on public.pos_documents for each row execute function public.pos_requisiti_addetti_guardia();

create or replace function public.pos_requisiti_addetti_pacchetto_guardia() returns trigger language plpgsql security invoker set search_path=public as $$
declare p public.pos_documents;prova jsonb;a jsonb;f jsonb;begin
 if new.stato<>'completa' or(tg_op='UPDATE' and old.stato='completa') then return new;end if;
 select * into p from public.pos_documents where id=new.pos_id;
 if new.origine<>'approvazione_corrente' then
  if exists(select 1 from public.pos_contenuti_archiviati s where s.id=new.snapshot_id and s.snapshot->'contenuto'->'versione_requisiti_addetti'='1'::jsonb) then raise exception 'Gli originali nominativi storici richiedono il pacchetto già conservato';end if;return new;
 end if;
 if p.contenuto->'versione_requisiti_addetti' is distinct from '1'::jsonb then return new;end if;
 prova:=public.pos_requisiti_addetti_verifica(p.company_id,p.order_id,p.contenuto,new.emessa_da);
 if new.manifest->'requisiti_addetti' is distinct from jsonb_build_object('versione',1,'collegamenti',prova->'collegamenti') then raise exception 'Il pacchetto non conserva i riscontri nominativi riesaminati';end if;
 if (select count(*) from jsonb_array_elements(new.manifest->'file')x where x->>'tipo'='qualifica_addetto')<>jsonb_array_length(prova->'allegati') then raise exception 'Numero di originali formativi incoerente nel pacchetto';end if;
 for a in select value from jsonb_array_elements(prova->'allegati') loop
  if (select count(*) from jsonb_array_elements(new.manifest->'file')x where x->>'ruolo'='allegato' and x->>'tipo'='qualifica_addetto' and x->>'evidenza_id'=a->>'evidenza_id' and x->>'persona_id'=a->>'persona_id' and x->>'impronta_metadati'=a->>'impronta' and x->'fonte'->>'bucket'=a->>'bucket' and x->'fonte'->>'path'=a->>'path')<>1 then raise exception 'Originale nominativo pertinente non conservato nel pacchetto';end if;
 end loop;
 return new;
end$$;
revoke all on function public.pos_requisiti_addetti_pacchetto_guardia() from public,anon,authenticated;
drop trigger if exists pos_requisiti_addetti_pacchetto_guardia on public.pos_emissioni;
create trigger pos_requisiti_addetti_pacchetto_guardia before insert or update on public.pos_emissioni for each row execute function public.pos_requisiti_addetti_pacchetto_guardia();
notify pgrst,'reload schema';

create or replace function public.pos_originale_addetto_per_autore(_company uuid,_ordine uuid,_riesame uuid,_persona uuid,_documento uuid,_impronta text,_autore uuid) returns jsonb language plpgsql security invoker set search_path=public as $$
declare foto jsonb;q jsonb;originale jsonb;begin
 foto:=public.pos_riesame_proprio_foto(_company,_ordine,_riesame,_autore);
 select r->'qualifica' into q from jsonb_array_elements(foto->'riscontri')r where r->>'esito'='riesaminata' and r->>'persona_id'=_persona::text and r->'qualifica'->>'fonte_id'=_documento::text limit 1;
 if q is null then raise exception 'Originale non pertinente al riesame della propria impresa' using errcode='42501';end if;
 if q->>'fonte_impronta' is distinct from _impronta then raise exception 'Originale cambiato: rileggi il riesame' using errcode='40001';end if;
 originale:=public.sicurezza_qualifica_fonte_autore(_company,'hr',_persona,_documento,_autore);
 if originale->'foto'->>'impronta' is distinct from _impronta then raise exception 'Originale cambiato: rileggi il riesame' using errcode='40001';end if;
 return jsonb_build_object('bucket','hr-documenti','path',originale->>'path');
end$$;
revoke all on function public.pos_originale_addetto_per_autore(uuid,uuid,uuid,uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.pos_originale_addetto_per_autore(uuid,uuid,uuid,uuid,uuid,text,uuid) to service_role;
notify pgrst,'reload schema';
