-- File ricostruito il 27/10/2026 dal registro del database (supabase_migrations.schema_migrations).
-- La migrazione era già applicata in produzione con questa versione, ma il file non era mai stato salvato nel repository:
-- il controllo «Supabase Preview» segnalava «Remote migration versions not found in local migrations directory».
-- Sotto c'è l'SQL esattamente come applicato.

set local lock_timeout='3s';
set local statement_timeout='60s';
-- Approval happens when the atomic completion commits, not when rendering starts.
create or replace function public.pos_completa_emissione(_id uuid,_token uuid,_autore uuid,_nome_autore text,_manifest jsonb,_manifest_sha256 text,_zip_sha256 text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare e public.pos_emissioni;p public.pos_documents; prefisso text; a_id uuid; f jsonb;
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
  update public.pos_documents set status='approvato',approvato_da=_autore,approvato_da_nome=_nome_autore,approvato_il=clock_timestamp(),emissione_id=e.id,updated_at=clock_timestamp() where id=p.id;
  select id into a_id from public.pos_contenuti_archiviati where pos_id=p.id and revisione=e.revisione;
 else a_id:=e.snapshot_id;end if;
 if a_id is null then raise exception 'Copia del contenuto approvato non conservata';end if;
 update public.pos_emissioni set stato='completa',snapshot_id=a_id,manifest=_manifest,manifest_sha256=_manifest_sha256,zip_sha256=_zip_sha256,emessa_da=_autore,errore=null,updated_at=clock_timestamp() where id=e.id returning * into e;
 return to_jsonb(e);
end $$;
revoke all on function public.pos_completa_emissione(uuid,uuid,uuid,text,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.pos_completa_emissione(uuid,uuid,uuid,text,jsonb,text,text) to service_role;
