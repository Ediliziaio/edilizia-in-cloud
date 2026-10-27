-- File ricostruito il 27/10/2026 dal registro del database (supabase_migrations.schema_migrations).
-- La migrazione era già applicata in produzione con questa versione, ma il file non era mai stato salvato nel repository:
-- il controllo «Supabase Preview» segnalava «Remote migration versions not found in local migrations directory».
-- Sotto c'è l'SQL esattamente come applicato.

set local lock_timeout='3s';
set local statement_timeout='60s';
create unique index if not exists pos_archivio_id_azienda on public.pos_contenuti_archiviati(id,company_id);
create table if not exists public.pos_emissioni (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 pos_id uuid not null,
 revisione integer not null,
 snapshot_id uuid,
 origine text not null check(origine in ('approvazione_corrente','ricostruzione_da_contenuto_archiviato')),
 stato text not null default 'preparazione' check(stato in ('preparazione','completa','errore')),
 token uuid not null default gen_random_uuid(),
 riservata_fino timestamptz not null default now()+interval '5 minutes',
 sorgente_updated_at timestamptz,
 creata_da uuid not null references auth.users(id),
 emessa_da uuid references auth.users(id),
 emesso_il timestamptz not null default clock_timestamp(),
 manifest jsonb,
 manifest_sha256 text check(manifest_sha256 is null or manifest_sha256 ~ '^[0-9a-f]{64}$'),
 zip_sha256 text check(zip_sha256 is null or zip_sha256 ~ '^[0-9a-f]{64}$'),
 errore text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(pos_id,revisione),
 foreign key(pos_id,company_id) references public.pos_documents(id,company_id) on delete cascade,
 foreign key(snapshot_id,company_id) references public.pos_contenuti_archiviati(id,company_id),
 check(stato<>'completa' or (snapshot_id is not null and manifest is not null and manifest_sha256 is not null and zip_sha256 is not null and emessa_da is not null))
);
create index if not exists pos_emissioni_azienda_pos on public.pos_emissioni(company_id,pos_id,revisione);
create index if not exists pos_emissioni_snapshot on public.pos_emissioni(snapshot_id,company_id) where snapshot_id is not null;
create index if not exists pos_emissioni_autore on public.pos_emissioni(creata_da);
create index if not exists pos_emissioni_emittente on public.pos_emissioni(emessa_da) where emessa_da is not null;
alter table public.pos_emissioni enable row level security;
revoke all on public.pos_emissioni from anon,authenticated;
grant select on public.pos_emissioni to authenticated;
grant all on public.pos_emissioni to service_role;
drop policy if exists pos_emissioni_lettura on public.pos_emissioni;
create policy pos_emissioni_lettura on public.pos_emissioni for select to authenticated using(public.has_permission_for_company((select auth.uid()),'can_view_sicurezza_cantiere',company_id));
alter table public.pos_documents add column if not exists emissione_id uuid references public.pos_emissioni(id);
create index if not exists pos_documenti_emissione on public.pos_documents(emissione_id) where emissione_id is not null;
create or replace function public.pos_emissione_immutabile()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if old.stato='completa' then raise exception 'L’emissione POS completata non si modifica o cancella';end if;
 if tg_op='DELETE' then return old;end if;
 if (new.id,new.company_id,new.pos_id,new.revisione) is distinct from (old.id,old.company_id,old.pos_id,old.revisione) then raise exception 'Identità emissione non modificabile';end if;
 return new;
end $$;
revoke all on function public.pos_emissione_immutabile() from public,anon,authenticated;
drop trigger if exists pos_emissione_immutabile on public.pos_emissioni;
create trigger pos_emissione_immutabile before update or delete on public.pos_emissioni for each row execute function public.pos_emissione_immutabile();
create or replace function public.pos_guardia_collegamento_emissione()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if old.status='approvato' and new.status='bozza' and new.revisione=old.revisione+1 then new.emissione_id:=null;end if;
 if old.status='approvato' and new.status='approvato' and new.emissione_id is distinct from old.emissione_id then raise exception 'L’emissione associata al POS approvato non cambia';end if;
 if new.emissione_id is not null and (new.status<>'approvato' or not exists(select 1 from public.pos_emissioni e where e.id=new.emissione_id and e.company_id=new.company_id and e.pos_id=new.id and e.revisione=new.revisione)) then raise exception 'Emissione non pertinente al POS';end if;
 return new;
end $$;
revoke all on function public.pos_guardia_collegamento_emissione() from public,anon,authenticated;
drop trigger if exists pos_guardia_collegamento_emissione on public.pos_documents;
create trigger pos_guardia_collegamento_emissione before update on public.pos_documents for each row execute function public.pos_guardia_collegamento_emissione();

create or replace function public.pos_puo_emettere(_autore uuid,_company uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select public.has_permission_for_company(_autore,'can_view_sicurezza_cantiere',_company)
 and (not exists(select 1 from public.staff_permissions where user_id=_autore and company_id=_company and sola_lettura)
 or public.has_permission_for_company(_autore,'__solo_amministratori__',_company));
$$;
revoke all on function public.pos_puo_emettere(uuid,uuid) from public,anon,authenticated;
grant execute on function public.pos_puo_emettere(uuid,uuid) to service_role;

create or replace function public.pos_prenota_emissione(_pos_id uuid,_autore uuid,_attesa_updated_at timestamptz,_snapshot_id uuid default null)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare p public.pos_documents; e public.pos_emissioni; a public.pos_contenuti_archiviati; r integer; fonte text;
begin
 select * into p from public.pos_documents where id=_pos_id for update;
 if not found or not public.pos_puo_emettere(_autore,p.company_id) then raise exception 'POS non disponibile o permesso insufficiente' using errcode='42501';end if;
 if _snapshot_id is null then
  if p.status<>'bozza' or coalesce(p.document_type,'pos')<>'pos' then raise exception 'Serve una bozza POS per preparare l’approvazione';end if;
  if p.updated_at is distinct from _attesa_updated_at then raise exception 'Il POS è cambiato: ricaricalo prima di approvare' using errcode='40001';end if;
  r:=coalesce(p.revisione,0); fonte:='approvazione_corrente';
 else
  select * into a from public.pos_contenuti_archiviati where id=_snapshot_id and pos_id=p.id and company_id=p.company_id;
  if not found or a.snapshot->>'status'<>'approvato' then raise exception 'Contenuto approvato non disponibile';end if;
  r:=a.revisione;fonte:='ricostruzione_da_contenuto_archiviato';
 end if;
 select * into e from public.pos_emissioni where pos_id=p.id and revisione=r for update;
 if found then
  if e.stato='completa' then return to_jsonb(e);end if;
  if e.stato='preparazione' and e.riservata_fino>clock_timestamp() then raise exception 'Un’altra preparazione POS è in corso: riprova tra poco' using errcode='55P03';end if;
  update public.pos_emissioni set token=gen_random_uuid(),stato='preparazione',origine=fonte,snapshot_id=_snapshot_id,sorgente_updated_at=_attesa_updated_at,riservata_fino=clock_timestamp()+interval '5 minutes',emesso_il=clock_timestamp(),manifest=null,manifest_sha256=null,zip_sha256=null,errore=null,updated_at=clock_timestamp() where id=e.id returning * into e;
 else
  insert into public.pos_emissioni(company_id,pos_id,revisione,snapshot_id,origine,sorgente_updated_at,creata_da) values(p.company_id,p.id,r,_snapshot_id,fonte,_attesa_updated_at,_autore) returning * into e;
 end if;
 return to_jsonb(e);
end $$;
revoke all on function public.pos_prenota_emissione(uuid,uuid,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.pos_prenota_emissione(uuid,uuid,timestamptz,uuid) to service_role;

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
  update public.pos_documents set status='approvato',approvato_da=_autore,approvato_da_nome=_nome_autore,approvato_il=e.emesso_il,emissione_id=e.id,updated_at=clock_timestamp() where id=p.id;
  select id into a_id from public.pos_contenuti_archiviati where pos_id=p.id and revisione=e.revisione;
 else a_id:=e.snapshot_id;end if;
 if a_id is null then raise exception 'Copia del contenuto approvato non conservata';end if;
 update public.pos_emissioni set stato='completa',snapshot_id=a_id,manifest=_manifest,manifest_sha256=_manifest_sha256,zip_sha256=_zip_sha256,emessa_da=_autore,errore=null,updated_at=clock_timestamp() where id=e.id returning * into e;
 return to_jsonb(e);
end $$;
revoke all on function public.pos_completa_emissione(uuid,uuid,uuid,text,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.pos_completa_emissione(uuid,uuid,uuid,text,jsonb,text,text) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('pos-emissioni','pos-emissioni',false,41943040,array['application/pdf','application/octet-stream','application/json','application/zip','text/html']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists pos_emissioni_file_lettura on storage.objects;
create policy pos_emissioni_file_lettura on storage.objects for select to authenticated using(bucket_id='pos-emissioni' and exists(select 1 from public.pos_emissioni e where e.id::text=split_part(name,'/',2) and e.company_id::text=split_part(name,'/',1) and e.token::text=split_part(name,'/',3) and e.stato='completa' and public.has_permission_for_company((select auth.uid()),'can_view_sicurezza_cantiere',e.company_id)));
drop policy if exists pos_emissioni_storage_limite_lettura on storage.objects;
create policy pos_emissioni_storage_limite_lettura on storage.objects as restrictive for select to authenticated using(bucket_id<>'pos-emissioni' or exists(select 1 from public.pos_emissioni e where e.id::text=split_part(name,'/',2) and e.company_id::text=split_part(name,'/',1) and e.token::text=split_part(name,'/',3) and e.stato='completa' and public.has_permission_for_company((select auth.uid()),'can_view_sicurezza_cantiere',e.company_id)));
drop policy if exists pos_emissioni_storage_nessun_inserimento on storage.objects;
create policy pos_emissioni_storage_nessun_inserimento on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'pos-emissioni');
drop policy if exists pos_emissioni_storage_nessuna_modifica on storage.objects;
create policy pos_emissioni_storage_nessuna_modifica on storage.objects as restrictive for update to authenticated using(bucket_id<>'pos-emissioni') with check(bucket_id<>'pos-emissioni');
drop policy if exists pos_emissioni_storage_nessuna_cancellazione on storage.objects;
create policy pos_emissioni_storage_nessuna_cancellazione on storage.objects as restrictive for delete to authenticated using(bucket_id<>'pos-emissioni');
create or replace function public.pos_file_emissione_immutabile()
returns trigger language plpgsql security definer set search_path=public,storage as $$
declare b text;n text;
begin
 if tg_op='DELETE' then b:=old.bucket_id;n:=old.name;else b:=new.bucket_id;n:=new.name;end if;
 if b='pos-emissioni' and exists(select 1 from public.pos_emissioni e where e.company_id::text=split_part(n,'/',1) and e.id::text=split_part(n,'/',2) and e.token::text=split_part(n,'/',3) and e.stato='completa') then raise exception 'I file di un’emissione completata non si modificano';end if;
 if tg_op='UPDATE' and old.bucket_id='pos-emissioni' and exists(select 1 from public.pos_emissioni e where e.company_id::text=split_part(old.name,'/',1) and e.id::text=split_part(old.name,'/',2) and e.token::text=split_part(old.name,'/',3) and e.stato='completa') then raise exception 'I file di un’emissione completata non si spostano';end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function public.pos_file_emissione_immutabile() from public,anon,authenticated;
drop trigger if exists pos_file_emissione_immutabile on storage.objects;
create trigger pos_file_emissione_immutabile before insert or update or delete on storage.objects for each row execute function public.pos_file_emissione_immutabile();
notify pgrst,'reload schema';
