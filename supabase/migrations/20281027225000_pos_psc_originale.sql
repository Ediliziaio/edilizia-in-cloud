-- PSC original references: versioned editor, exact case source and package consistency.
set local lock_timeout='3s';
set local statement_timeout='60s';
create or replace function public.pos_psc_verifica(_company uuid,_ordine uuid,_contenuto jsonb,_autore uuid)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare r jsonb;d jsonb;bucket text;obj storage.objects;begin
 if _contenuto->'versione_psc' is distinct from '1'::jsonb then return null;end if;
 if _autore is null or not coalesce(public.pos_puo_emettere(_autore,_company),false) or not exists(select 1 from public.orders where id=_ordine and company_id=_company and deleted_at is null) then raise exception 'Riferimento PSC non accessibile' using errcode='42501';end if;
 if _contenuto->'procedure_psc'->'psc_presente' is distinct from 'true'::jsonb then return null;end if;
 r:=_contenuto->'procedure_psc'->'documento';
 if jsonb_typeof(r) is distinct from 'object' or (r-array['archivio','id','company_id','order_id','titolo','file_name','file_path','data_documento','revisione','sha256'])<>'{}'::jsonb or r->>'company_id' is distinct from _company::text or r->>'order_id' is distinct from _ordine::text or coalesce(r->>'id','')!~'^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' or coalesce(r->>'sha256','')!~'^[a-f0-9]{64}$' or length(trim(coalesce(r->>'revisione','')))=0 then raise exception 'Collega originale PSC e revisione di questa commessa';end if;
 if r->>'archivio'='sicurezza_documenti' then
  select to_jsonb(x) into d from public.sicurezza_documenti x where id=(r->>'id')::uuid and company_id=_company and order_id=_ordine and tipo='psc' and subappaltatore_id is null for share;
  bucket:='sicurezza-documenti';
 elsif r->>'archivio'='sicurezza_fascicolo' then
  select to_jsonb(x) into d from public.sicurezza_fascicolo x where id=(r->>'id')::uuid and company_id=_company and order_id=_ordine and tipo='psc' and subappaltatore_id is null and stato<>'non_applicabile' for share;
  bucket:='fascicoli-cantiere';
 else raise exception 'Archivio PSC non supportato';end if;
 if d is null or r->>'titolo' is distinct from d->>'titolo' or r->>'file_name' is distinct from coalesce(d->>'file_name','') or r->>'file_path' is distinct from d->>'file_path' or r->>'data_documento' is distinct from coalesce(case when bucket='sicurezza-documenti' then d->>'data_documento' else d->>'data_rilascio' end,'') or (length(coalesce(d->>'revisione',''))>0 and r->>'revisione' is distinct from d->>'revisione') then raise exception 'La fonte PSC è cambiata o non appartiene alla commessa: riesamina il riferimento' using errcode='40001';end if;
 if left(r->>'file_path',length(_company::text)+1)<>_company::text||'/' or r->>'file_path'~'[\\%?#]' or exists(select 1 from unnest(string_to_array(r->>'file_path','/'))p where p in('','.','..')) then raise exception 'Percorso PSC non valido';end if;
 select * into obj from storage.objects where bucket_id=bucket and name=r->>'file_path' for share;
 if not found or coalesce((obj.metadata->>'size')::bigint,0) not between 1 and 20971520 then raise exception 'Originale PSC assente, vuoto o superiore a 20 MB';end if;
 return r;
end$$;
revoke all on function public.pos_psc_verifica(uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.pos_psc_verifica(uuid,uuid,jsonb,uuid) to service_role;
create or replace function public.pos_psc_guardia() returns trigger language plpgsql security invoker set search_path=public as $$begin
 if coalesce(new.document_type,'pos')<>'pos' then return new;end if;
 if tg_op='UPDATE' and old.contenuto->'versione_psc'='1'::jsonb and new.contenuto->'versione_psc' is distinct from '1'::jsonb then raise exception 'Questo POS richiede il riferimento PSC: ricarica l’editor' using errcode='40001';end if;
 if new.contenuto ? 'versione_psc' and new.contenuto->'versione_psc' is distinct from '1'::jsonb then raise exception 'Versione PSC non supportata';end if;
 if new.contenuto->'procedure_psc' ? 'documento' and new.contenuto->'versione_psc' is distinct from '1'::jsonb then raise exception 'Attiva il protocollo PSC prima di salvare il riferimento';end if;
 if new.contenuto->'versione_psc'='1'::jsonb and new.status='approvato' and(tg_op='INSERT' or old.status<>'approvato') then perform public.pos_psc_verifica(new.company_id,new.order_id,new.contenuto,coalesce(auth.uid(),new.approvato_da));end if;
 return new;
end$$;
revoke all on function public.pos_psc_guardia() from public,anon,authenticated;
drop trigger if exists pos_psc_guardia on public.pos_documents;
create trigger pos_psc_guardia before insert or update of contenuto,status on public.pos_documents for each row execute function public.pos_psc_guardia();
create or replace function public.pos_psc_pacchetto_guardia() returns trigger language plpgsql security invoker set search_path=public as $$
declare p public.pos_documents;r jsonb;bucket text;begin
 if new.stato<>'completa' or(tg_op='UPDATE' and old.stato='completa') then return new;end if;
 select * into p from public.pos_documents where id=new.pos_id;
 if new.origine<>'approvazione_corrente' then
  if exists(select 1 from public.pos_contenuti_archiviati s where s.id=new.snapshot_id and s.snapshot->'contenuto'->'versione_psc'='1'::jsonb) then raise exception 'Il PSC storico richiede il pacchetto originale conservato';end if;return new;
 end if;
 if p.contenuto->'versione_psc' is distinct from '1'::jsonb then return new;end if;
 r:=public.pos_psc_verifica(p.company_id,p.order_id,p.contenuto,new.emessa_da);
 if r is null then
  if new.manifest ? 'psc' or exists(select 1 from jsonb_array_elements(new.manifest->'file')x where x->>'tipo'='psc') then raise exception 'PSC non previsto nel contenuto da emettere';end if;return new;
 end if;
 if new.manifest->'psc' is distinct from r then raise exception 'Il pacchetto non conserva il riferimento PSC scelto';end if;
 bucket:=case when r->>'archivio'='sicurezza_documenti' then 'sicurezza-documenti' else 'fascicoli-cantiere' end;
 if(select count(*) from jsonb_array_elements(new.manifest->'file')x where x->>'tipo'='psc')<>1 or(select count(*) from jsonb_array_elements(new.manifest->'file')x where x->>'tipo'='psc' and x->>'ruolo'='allegato' and x->>'evidenza_id'=r->>'id' and x->>'sha256'=r->>'sha256' and x->'fonte'->>'bucket'=bucket and x->'fonte'->>'path'=r->>'file_path')<>1 then raise exception 'Originale PSC non conservato con l’impronta scelta';end if;
 return new;
end$$;
revoke all on function public.pos_psc_pacchetto_guardia() from public,anon,authenticated;
drop trigger if exists pos_psc_pacchetto_guardia on public.pos_emissioni;
create trigger pos_psc_pacchetto_guardia before insert or update on public.pos_emissioni for each row execute function public.pos_psc_pacchetto_guardia();
notify pgrst,'reload schema';
