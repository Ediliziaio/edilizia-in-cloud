-- Gare e appalti, pilota aziendale in modalità bozza.
-- Schema e regole di revisione del laboratorio, senza dati del laboratorio.
set local lock_timeout = '3s';
set local statement_timeout = '90s';

-- gare manual baseline
create schema if not exists gare_private;
revoke all on schema gare_private from public;
grant usage on schema gare_private to anon, authenticated;

create table public.gare_companies (
 id uuid primary key references public.companies(id), name text not null,
 profile jsonb not null default '{}', updated_at timestamptz not null default now()
);
create table gare_private.pilot (
 company_id uuid primary key references public.gare_companies(id),
 enabled boolean not null default false,
 constraint single_pilot_company check (company_id = 'd2000000-0000-4000-a000-000000000002')
);
revoke all on gare_private.pilot from public, anon, authenticated, service_role;

create function gare_private.role_for_member(cid uuid, uid uuid)
returns text language sql stable security definer set search_path = '' as $$
 select case
   when exists (
     select 1 from public.user_roles where user_id = uid and role = 'company_admin'
   ) then 'admin'
   when exists (
     select 1 from public.user_roles where user_id = uid and role = 'company_staff'
   ) and exists (
     select 1 from public.staff_permissions
     where user_id = uid and company_id = cid and can_manage_purchasing
   ) then 'editor'
 end
 from gare_private.pilot gate
 join public.companies c on c.id = gate.company_id
 join public.profiles p on p.company_id = c.id and p.id = uid
 where gate.company_id = cid and gate.enabled and c.status = 'active'
   and not coalesce(p.is_blocked, false) and p.deleted_at is null
$$;
revoke all on function gare_private.role_for_member(uuid, uuid) from public, anon, authenticated, service_role;

create function gare_private.role_for(cid uuid)
returns text language sql stable security definer set search_path = '' as $$
 select case when coalesce((select auth.jwt())->>'is_anonymous', 'false') = 'false'
   then gare_private.role_for_member(cid, (select auth.uid())) end
$$;
revoke all on function gare_private.role_for(uuid) from public, anon, authenticated, service_role;
grant execute on function gare_private.role_for(uuid) to anon, authenticated;

create function public.gare_pilot_role(cid uuid)
returns text language sql stable security invoker set search_path = '' as $$
 select gare_private.role_for(cid)
$$;
revoke all on function public.gare_pilot_role(uuid) from public, anon, authenticated, service_role;
grant execute on function public.gare_pilot_role(uuid) to authenticated;

-- Users eligible for an assignment inside the active pilot.
create function gare_private.pilot_members(cid uuid)
returns table (id uuid, role text, name text)
language sql stable security definer set search_path = '' as $$
 select p.id, access.role, coalesce(nullif(concat_ws(' ', p.first_name, p.last_name), ''), 'Utente aziendale') as name
 from public.profiles p
 cross join lateral (select gare_private.role_for_member(cid, p.id) as role) access
 where p.company_id = cid and gare_private.role_for(cid) is not null and access.role is not null
 order by name, p.id
$$;
revoke all on function gare_private.pilot_members(uuid) from public, anon, authenticated, service_role;
grant execute on function gare_private.pilot_members(uuid) to authenticated;

create function public.gare_pilot_members(cid uuid)
returns table (id uuid, role text, name text)
language sql stable security invoker set search_path = '' as $$
 select * from gare_private.pilot_members(cid)
$$;
revoke all on function public.gare_pilot_members(uuid) from public, anon, authenticated, service_role;
grant execute on function public.gare_pilot_members(uuid) to authenticated;

create table public.gare_tenders (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.gare_companies,
 title text not null check(length(trim(title)) between 3 and 500), authority text not null,
 territory text not null, base_amount numeric(16,2) not null default 0 check(base_amount>=0),
 official_id text, official_url text check(official_url is null or official_url ~ '^https?://'),
 kind text not null default 'gara_aperta' check(kind in ('gara_aperta','manifestazione','albo','invito','esito')),
 deadline_date date, deadline_time time, timezone text not null default 'Europe/Rome',
 description text not null default '', source text not null default 'Importazione manuale',
 revision int not null default 1, created_at timestamptz not null default now(), unique(company_id,id)
);
create unique index gare_tender_identifier on public.gare_tenders(company_id,official_id) where official_id is not null;
create table public.gare_lots (
 id uuid primary key default gen_random_uuid(), company_id uuid not null,
 tender_id uuid not null, code text not null, title text not null, amount numeric(16,2) not null check(amount>=0),
 unique(company_id,id), unique(tender_id,code),
 foreign key(company_id,tender_id) references public.gare_tenders(company_id,id)
);
create table public.gare_evidence (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.gare_companies,
 title text not null check(length(trim(title))>2), kind text not null, value text not null default '',
 source text not null, verified_on date not null default current_date, expires_on date,
 status text not null default 'in_verifica' check(status in ('valido','in_verifica','scaduto','non_presente','non_applicabile')),
 responsible text not null, revision int not null default 1, unique(company_id,id)
);
create table public.gare_participations (
 id uuid primary key default gen_random_uuid(), company_id uuid not null, tender_id uuid not null,
 stage text not null default 'in_valutazione' check(stage in ('in_valutazione','in_preparazione','in_revisione','pronta','presentata','non_partecipare','ritirata','esito')),
 decision text not null default 'approfondisci' check(decision in ('approfondisci','partecipa','non_partecipare')),
 decision_reason text not null default '', responsible text not null, outcome text not null default '',
 revision int not null default 1, created_at timestamptz not null default now(),
 unique(company_id,id), unique(company_id,tender_id),
 foreign key(company_id,tender_id) references public.gare_tenders(company_id,id)
);
create table public.gare_participation_lots (
 company_id uuid not null, participation_id uuid not null, lot_id uuid not null,
 primary key(participation_id,lot_id),
 foreign key(company_id,participation_id) references public.gare_participations(company_id,id),
 foreign key(company_id,lot_id) references public.gare_lots(company_id,id)
);
create table public.gare_documents (
 id uuid primary key default gen_random_uuid(), company_id uuid not null, tender_id uuid not null,
 participation_id uuid, lot_id uuid, name text not null, storage_path text not null unique,
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'), size_bytes bigint not null check(size_bytes between 1 and 20971520),
 category text not null check(category in ('fonte','amministrativa','tecnica','economica','ricevuta')),
 document_kind text not null default 'allegato', version int not null default 1, previous_id uuid,
 mandatory boolean not null default false, signature_required boolean not null default false,
 signature_declared boolean not null default false,
 status text not null default 'bozza' check(status in ('bozza','in_verifica','approvato')),
 approved_by uuid, approved_at timestamptz, created_at timestamptz not null default now(),
 unique(company_id,id),
 foreign key(company_id,tender_id) references public.gare_tenders(company_id,id),
 foreign key(company_id,participation_id) references public.gare_participations(company_id,id),
 foreign key(company_id,lot_id) references public.gare_lots(company_id,id),
 foreign key(company_id,previous_id) references public.gare_documents(company_id,id)
);
create table public.gare_requirements (
 id uuid primary key default gen_random_uuid(), company_id uuid not null, participation_id uuid not null,
 description text not null check(length(trim(description))>2), mandatory boolean not null default true,
 status text not null default 'evidenza_mancante' check(status in ('compatibile','evidenza_mancante','incompatibilita','da_verificare','non_applicabile')),
 evidence_id uuid, source_document_id uuid, source_page int check(source_page>0),
 source_section text not null default '', note text not null default '', reviewed_by uuid,
 revision int not null default 1, unique(company_id,id),
 foreign key(company_id,participation_id) references public.gare_participations(company_id,id),
 foreign key(company_id,evidence_id) references public.gare_evidence(company_id,id),
 foreign key(company_id,source_document_id) references public.gare_documents(company_id,id)
);
create unique index gare_one_next_version on public.gare_documents(previous_id) where previous_id is not null;
create unique index gare_same_file_once on public.gare_documents(company_id,tender_id,sha256,category,version,coalesce(lot_id,'00000000-0000-0000-0000-000000000000'::uuid));
create table public.gare_tasks (
 id uuid primary key default gen_random_uuid(), company_id uuid not null, participation_id uuid not null,
 title text not null check(length(trim(title))>2), kind text not null default 'interna' check(kind in ('interna','chiarimenti','sopralluogo','presentazione')),
 due_date date not null, due_time time, responsible text not null,
 completed boolean not null default false, mandatory boolean not null default true,
 revision int not null default 1, unique(company_id,id),
 foreign key(company_id,participation_id) references public.gare_participations(company_id,id)
);
create table public.gare_exports (
 id uuid primary key default gen_random_uuid(), company_id uuid not null, participation_id uuid not null,
 draft boolean not null default true, manifest jsonb not null default '{}', created_by uuid not null default auth.uid(),
 created_at timestamptz not null default now(), unique(company_id,id),
 foreign key(company_id,participation_id) references public.gare_participations(company_id,id)
);
create table public.gare_submissions (
 id uuid primary key default gen_random_uuid(), company_id uuid not null, participation_id uuid not null,
 export_id uuid not null, receipt_id uuid, submitted_at timestamptz not null, protocol text not null default '',
 created_at timestamptz not null default now(), created_by uuid not null default auth.uid(),
 foreign key(company_id,participation_id) references public.gare_participations(company_id,id),
 foreign key(company_id,export_id) references public.gare_exports(company_id,id),
 foreign key(company_id,receipt_id) references public.gare_documents(company_id,id)
);
create table public.gare_audit (
 id bigint generated always as identity primary key, company_id uuid not null, actor uuid,
 entity_type text not null, entity_id text not null, action text not null, details jsonb not null default '{}', created_at timestamptz not null default now()
);

-- Membership helper checks the authenticated UID; no client-controlled role claims.
alter table public.gare_companies enable row level security;
create policy company_read on public.gare_companies for select to authenticated using(gare_private.role_for(id) is not null);
create policy company_update on public.gare_companies for update to authenticated
 using(gare_private.role_for(id) in ('admin','editor')) with check(gare_private.role_for(id) in ('admin','editor'));

do $$ declare tab text; begin
 foreach tab in array array['gare_tenders','gare_lots','gare_evidence','gare_participations','gare_participation_lots','gare_documents','gare_requirements','gare_tasks','gare_exports','gare_submissions','gare_audit'] loop
  execute format('alter table public.%I enable row level security',tab);
  execute format('create policy tenant_read on public.%I for select to authenticated using(gare_private.role_for(company_id) is not null)',tab);
  if tab not in ('gare_audit') then
   execute format('create policy tenant_insert on public.%I for insert to authenticated with check(gare_private.role_for(company_id) in (''admin'',''editor''))',tab);
  end if;
  if tab not in ('gare_audit','gare_exports','gare_submissions') then
   execute format('create policy tenant_update on public.%I for update to authenticated using(gare_private.role_for(company_id) in (''admin'',''editor'')) with check(gare_private.role_for(company_id) in (''admin'',''editor''))',tab);
  end if;
 end loop;
end $$;
create policy reviewer_document on public.gare_documents for update to authenticated
 using(gare_private.role_for(company_id)='reviewer') with check(gare_private.role_for(company_id)='reviewer');
grant select on public.gare_companies, public.gare_tenders, public.gare_lots,
 public.gare_evidence, public.gare_participations, public.gare_participation_lots,
 public.gare_documents, public.gare_requirements, public.gare_tasks,
 public.gare_exports, public.gare_submissions, public.gare_audit to authenticated;
grant update on public.gare_companies to authenticated;
grant insert,update on public.gare_tenders,public.gare_lots,public.gare_evidence,public.gare_participations,
 public.gare_participation_lots,public.gare_documents,public.gare_requirements,public.gare_tasks to authenticated;
grant insert on public.gare_exports,public.gare_submissions to authenticated;
revoke all on public.gare_audit from anon;

create function public.gare_blockers(pid uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(msg),'[]'::jsonb) from (
  select 'Confermare la decisione di partecipare e la motivazione' msg from public.gare_participations p where p.id=pid and (p.decision<>'partecipa' or length(trim(p.decision_reason))<3)
  union all select 'Selezionare almeno un lotto' where not exists(select 1 from public.gare_participation_lots where participation_id=pid)
  union all select 'Acquisire il disciplinare' from public.gare_participations p where p.id=pid and not exists(select 1 from public.gare_documents d where d.tender_id=p.tender_id and d.category='fonte' and d.document_kind='disciplinare')
  union all select 'Registrare e revisionare i requisiti della gara' where not exists(select 1 from public.gare_requirements r where r.participation_id=pid)
  union all select 'Requisito da risolvere: '||r.description from public.gare_requirements r
   join public.gare_participations p on p.id=r.participation_id join public.gare_tenders t on t.id=p.tender_id
   left join public.gare_evidence e on e.id=r.evidence_id
   where r.participation_id=pid and r.mandatory and (
    r.status not in ('compatibile','non_applicabile') or r.reviewed_by is null or r.source_document_id is null
    or (r.status='non_applicabile' and length(trim(r.note))<3)
    or (r.status='compatibile' and (e.id is null or e.status<>'valido' or e.verified_on>coalesce(t.deadline_date,current_date) or e.expires_on<coalesce(t.deadline_date,current_date))))
  union all select 'Documento da completare: '||d.name from public.gare_documents d
   where d.participation_id=pid and d.category in ('amministrativa','tecnica','economica')
   and not exists(select 1 from public.gare_documents newer where newer.previous_id=d.id)
   and (d.status<>'approvato' or (d.signature_required and not d.signature_declared))
  union all select 'Caricare almeno un documento di offerta' where not exists(select 1 from public.gare_documents where participation_id=pid and category in ('amministrativa','tecnica','economica'))
  union all select 'Attività obbligatoria aperta: '||title from public.gare_tasks where participation_id=pid and mandatory and not completed
  union all select 'Verificare data e ora ufficiali di presentazione' from public.gare_tenders t join public.gare_participations p on p.tender_id=t.id where p.id=pid and (t.deadline_date is null or t.deadline_time is null)
  union all select 'Il termine di presentazione è scaduto' from public.gare_tenders t join public.gare_participations p on p.tender_id=t.id where p.id=pid and (t.deadline_date+t.deadline_time) at time zone t.timezone < now()
 ) checks
$$;
revoke all on function public.gare_blockers(uuid) from public;
grant execute on function public.gare_blockers(uuid) to authenticated;

create function gare_private.guard_rows() returns trigger language plpgsql set search_path='' as $$
declare parent_tender uuid; msgs jsonb;
begin
 if TG_OP='UPDATE' and to_jsonb(new)->>'company_id' is distinct from to_jsonb(old)->>'company_id' then raise exception 'Azienda immutabile'; end if;
 if TG_TABLE_NAME='gare_participations' then
  if TG_OP='UPDATE' and new.tender_id<>old.tender_id then raise exception 'Procedura immutabile'; end if;
  if new.stage='pronta' then
   msgs:=public.gare_blockers(new.id);
   if jsonb_array_length(msgs)>0 then raise exception 'Pronto bloccato: %',msgs; end if;
  end if;
  if new.stage='presentata' and not exists(select 1 from public.gare_submissions where participation_id=new.id) then raise exception 'Registrare prima la presentazione'; end if;
 end if;
 if TG_TABLE_NAME='gare_participation_lots' then
  if (select tender_id from public.gare_participations where id=new.participation_id) is distinct from (select tender_id from public.gare_lots where id=new.lot_id) then raise exception 'Il lotto appartiene a un’altra procedura'; end if;
 end if;
 if TG_TABLE_NAME='gare_documents' then
  if TG_OP='UPDATE' then
   if (new.sha256,new.storage_path,new.size_bytes,new.name,new.tender_id,new.participation_id,new.lot_id,new.version,new.previous_id) is distinct from (old.sha256,old.storage_path,old.size_bytes,old.name,old.tender_id,old.participation_id,old.lot_id,old.version,old.previous_id) then raise exception 'Originale immutabile: caricare una nuova versione'; end if;
   if gare_private.role_for(new.company_id)='reviewer' and (to_jsonb(new)-array['status','approved_by','approved_at']) is distinct from (to_jsonb(old)-array['status','approved_by','approved_at']) then raise exception 'Il revisore può solo approvare'; end if;
  end if;
  if new.participation_id is not null and new.tender_id is distinct from (select tender_id from public.gare_participations where id=new.participation_id) then raise exception 'Partecipazione non coerente'; end if;
  if new.lot_id is not null and new.tender_id is distinct from (select tender_id from public.gare_lots where id=new.lot_id) then raise exception 'Lotto non coerente'; end if;
  if split_part(new.storage_path,'/',1)<>new.company_id::text then raise exception 'Percorso file non autorizzato'; end if;
  if TG_OP='INSERT' and not exists(select 1 from storage.objects where bucket_id='gare-private' and name=new.storage_path) then raise exception 'Caricare il file originale prima dei metadati'; end if;
  if new.previous_id is not null and not exists(select 1 from public.gare_documents d where d.id=new.previous_id and d.tender_id=new.tender_id and d.category=new.category and d.version+1=new.version) then raise exception 'Versione precedente non coerente'; end if;
  if new.status='approvato' then
   if gare_private.role_for(new.company_id) not in ('admin','reviewer') then raise exception 'Permesso di approvazione richiesto'; end if;
   new.approved_by:=auth.uid(); new.approved_at:=now();
  else new.approved_by:=null; new.approved_at:=null; end if;
 end if;
 if TG_TABLE_NAME='gare_requirements' then
  if new.source_document_id is not null and (select tender_id from public.gare_documents where id=new.source_document_id) is distinct from (select tender_id from public.gare_participations where id=new.participation_id) then raise exception 'Fonte di un’altra procedura'; end if;
  new.reviewed_by:=case when new.status in ('compatibile','non_applicabile') then auth.uid() else null end;
 end if;
 if TG_OP='UPDATE' and TG_TABLE_NAME in ('gare_tenders','gare_evidence','gare_participations','gare_requirements','gare_tasks') then new.revision:=old.revision+1; end if;
 return new;
end $$;
do $$ declare tab text; begin
 foreach tab in array array['gare_tenders','gare_evidence','gare_participations','gare_participation_lots','gare_documents','gare_requirements','gare_tasks'] loop
  execute format('create trigger guard_rows before insert or update on public.%I for each row execute function gare_private.guard_rows()',tab);
 end loop;
end $$;

create function gare_private.invalidate_ready() returns trigger language plpgsql security definer set search_path='' as $$
declare cid uuid; pid uuid; tid uuid;
begin
 cid:=new.company_id;
 if TG_TABLE_NAME in ('gare_requirements','gare_tasks','gare_documents','gare_participation_lots') then pid:=new.participation_id; end if;
 if TG_TABLE_NAME in ('gare_tenders') then tid:=new.id; end if;
 if TG_TABLE_NAME='gare_evidence' then
  update public.gare_participations set stage='in_revisione' where company_id=cid and stage='pronta' and id in(select participation_id from public.gare_requirements where evidence_id=new.id);
  update public.gare_documents set status='bozza' where company_id=cid and status='approvato' and participation_id in(select participation_id from public.gare_requirements where evidence_id=new.id);
 else
  update public.gare_participations set stage='in_revisione' where company_id=cid and stage='pronta' and (id=pid or tender_id=tid or (TG_TABLE_NAME='gare_documents' and tender_id=(to_jsonb(new)->>'tender_id')::uuid));
  if TG_TABLE_NAME in ('gare_requirements','gare_tenders','gare_participation_lots') then
   update public.gare_documents set status='bozza' where company_id=cid and status='approvato' and category in ('amministrativa','tecnica','economica') and (participation_id=pid or tender_id=tid);
  end if;
  if TG_TABLE_NAME='gare_documents' and TG_OP='INSERT' and (to_jsonb(new)->>'category')='fonte' and ((to_jsonb(new)->>'document_kind')='rettifica' or (to_jsonb(new)->>'previous_id') is not null) then
   update public.gare_requirements set status='da_verificare' where company_id=cid and participation_id in(select id from public.gare_participations where tender_id=(to_jsonb(new)->>'tender_id')::uuid);
  end if;
 end if;
 return new;
end $$;
do $$ declare tab text; begin
 foreach tab in array array['gare_tenders','gare_evidence','gare_requirements','gare_tasks','gare_documents','gare_participation_lots'] loop
  execute format('create trigger invalidate_ready after insert or update on public.%I for each row execute function gare_private.invalidate_ready()',tab);
 end loop;
end $$;

create function gare_private.export_snapshot() returns trigger language plpgsql set search_path='' as $$
declare p public.gare_participations; t public.gare_tenders;
begin
 select * into p from public.gare_participations where id=new.participation_id and company_id=new.company_id for update;
 if not found then raise exception 'Partecipazione non accessibile'; end if;
 if not new.draft and (p.stage<>'pronta' or jsonb_array_length(public.gare_blockers(p.id))>0) then raise exception 'Il pacchetto finale richiede una partecipazione pronta'; end if;
 select * into t from public.gare_tenders where id=p.tender_id;
 new.created_by:=auth.uid();
 new.manifest:=jsonb_build_object('schema_version',1,'draft',new.draft,'participation',to_jsonb(p),'tender',to_jsonb(t),
 'documents',coalesce((select jsonb_agg(to_jsonb(d) order by d.category,d.name) from public.gare_documents d where d.company_id=new.company_id and (d.participation_id=p.id or (d.tender_id=t.id and d.category='fonte')) and d.category<>'ricevuta' and not exists(select 1 from public.gare_documents newer where newer.previous_id=d.id)),'[]'::jsonb),
 'requirements',coalesce((select jsonb_agg(to_jsonb(r)) from public.gare_requirements r where r.participation_id=p.id),'[]'::jsonb),
 'lots',coalesce((select jsonb_agg(to_jsonb(l)) from public.gare_lots l join public.gare_participation_lots pl on pl.lot_id=l.id where pl.participation_id=p.id),'[]'::jsonb),
 'evidence',coalesce((select jsonb_agg(to_jsonb(e)) from public.gare_evidence e where e.id in(select evidence_id from public.gare_requirements where participation_id=p.id)),'[]'::jsonb));
 return new;
end $$;
create trigger export_snapshot before insert on public.gare_exports for each row execute function gare_private.export_snapshot();

create function gare_private.submission_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if not exists(select 1 from public.gare_exports where id=new.export_id and participation_id=new.participation_id and not draft) then raise exception 'Selezionare un pacchetto finale della stessa partecipazione'; end if;
 if new.receipt_id is not null and not exists(select 1 from public.gare_documents where id=new.receipt_id and participation_id=new.participation_id and category='ricevuta') then raise exception 'Ricevuta non valida per questa partecipazione'; end if;
 new.created_by:=auth.uid(); return new;
end $$;
create trigger submission_guard before insert on public.gare_submissions for each row execute function gare_private.submission_guard();

create function public.gare_start_participation(tender uuid,lot_ids uuid[],owner_name text,reason text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare p uuid; l uuid;
begin
 if coalesce(array_length(lot_ids,1),0)=0 or length(trim(owner_name))<2 then raise exception 'Indicare responsabile e almeno un lotto'; end if;
 if not exists(select 1 from public.gare_tenders where id=tender and kind<>'esito') then raise exception 'Procedura non disponibile per la partecipazione'; end if;
 insert into public.gare_participations(company_id,tender_id,responsible,decision_reason)
 select company_id,id,owner_name,reason from public.gare_tenders where id=tender returning id into p;
 foreach l in array lot_ids loop
  insert into public.gare_participation_lots(company_id,participation_id,lot_id)
  select company_id,p,l from public.gare_participations where id=p;
 end loop;
 return p;
end $$;
create function public.gare_create_tender(payload jsonb,lots jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare t uuid; l jsonb;
begin
 if jsonb_array_length(lots)<1 then raise exception 'Inserire almeno un lotto'; end if;
 insert into public.gare_tenders(company_id,title,authority,territory,base_amount,official_id,official_url,kind,deadline_date,deadline_time,description)
 values((payload->>'company_id')::uuid,payload->>'title',payload->>'authority',payload->>'territory',
 (payload->>'base_amount')::numeric,nullif(payload->>'official_id',''),nullif(payload->>'official_url',''),
 coalesce(payload->>'kind','gara_aperta'),nullif(payload->>'deadline_date','')::date,nullif(payload->>'deadline_time','')::time,coalesce(payload->>'description','')) returning id into t;
 for l in select * from jsonb_array_elements(lots) loop
  insert into public.gare_lots(company_id,tender_id,code,title,amount)
  values((payload->>'company_id')::uuid,t,l->>'code',l->>'title',(l->>'amount')::numeric);
 end loop;
 return t;
end $$;
revoke all on function public.gare_start_participation(uuid,uuid[],text,text),public.gare_create_tender(jsonb,jsonb) from public;
grant execute on function public.gare_start_participation(uuid,uuid[],text,text),public.gare_create_tender(jsonb,jsonb) to authenticated;

create function gare_private.audit_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.gare_audit(company_id,actor,entity_type,entity_id,action,details)
 values(new.company_id,auth.uid(),TG_TABLE_NAME,coalesce(to_jsonb(new)->>'id',to_jsonb(new)->>'participation_id'),TG_OP,
 jsonb_build_object('before',case when TG_OP='UPDATE' then to_jsonb(old) else null end,'after',to_jsonb(new)));
 return new;
end $$;
do $$ declare tab text; begin
 foreach tab in array array['gare_tenders','gare_lots','gare_evidence','gare_participations','gare_documents','gare_requirements','gare_tasks','gare_exports','gare_submissions'] loop
  execute format('create trigger audit_change after insert or update on public.%I for each row execute function gare_private.audit_change()',tab);
 end loop;
end $$;

insert into storage.buckets(id,name,public,file_size_limit) values('gare-private','gare-private',false,20971520);
create policy gare_storage_read on storage.objects for select to authenticated using(bucket_id='gare-private' and gare_private.role_for((case when (storage.foldername(name))[1] = 'd2000000-0000-4000-a000-000000000002' then 'd2000000-0000-4000-a000-000000000002'::uuid end)) is not null);
create policy gare_storage_insert on storage.objects for insert to authenticated with check(bucket_id='gare-private' and gare_private.role_for((case when (storage.foldername(name))[1] = 'd2000000-0000-4000-a000-000000000002' then 'd2000000-0000-4000-a000-000000000002'::uuid end)) in ('admin','editor'));
-- No overwrite or delete policy: originals are immutable.

-- Restrictive policy also applies if another feature allows generic object access.
create policy gare_pilot_storage_boundary on storage.objects as restrictive
 for all to anon, authenticated
 using (bucket_id <> 'gare-private' or (
   (storage.foldername(name))[1] = 'd2000000-0000-4000-a000-000000000002'
   and gare_private.role_for('d2000000-0000-4000-a000-000000000002') is not null
 ))
 with check (bucket_id <> 'gare-private' or (
   (storage.foldername(name))[1] = 'd2000000-0000-4000-a000-000000000002'
   and gare_private.role_for('d2000000-0000-4000-a000-000000000002') in ('admin', 'editor')
 ));

-- manual integrity
-- Atomic submission and cross-record consistency for the local manual workflow.
create function public.gare_record_submission(pid uuid,package_id uuid,receipt uuid,submitted timestamptz,reference text,expected_revision int)
returns uuid language plpgsql security invoker set search_path='' as $$
declare p public.gare_participations; sid uuid;
begin
 select * into p from public.gare_participations where id=pid for update;
 if not found or p.revision<>expected_revision then raise exception 'Fascicolo modificato: ricaricare prima di registrare la presentazione'; end if;
 insert into public.gare_submissions(company_id,participation_id,export_id,receipt_id,submitted_at,protocol)
 values(p.company_id,pid,package_id,receipt,submitted,reference) returning id into sid;
 update public.gare_participations set stage='presentata' where id=pid;
 return sid;
end $$;
revoke all on function public.gare_record_submission(uuid,uuid,uuid,timestamptz,text,int) from public;
grant execute on function public.gare_record_submission(uuid,uuid,uuid,timestamptz,text,int) to authenticated;

create function gare_private.check_document_scope() returns trigger language plpgsql set search_path='' as $$
begin
 if new.category<>'fonte' and new.participation_id is null then raise exception 'Documento di partecipazione senza fascicolo'; end if;
 if new.category<>'fonte' and new.lot_id is not null and not exists(select 1 from public.gare_participation_lots where participation_id=new.participation_id and lot_id=new.lot_id) then raise exception 'Il lotto non è selezionato nella partecipazione'; end if;
 return new;
end $$;
create trigger check_document_scope before insert or update on public.gare_documents for each row execute function gare_private.check_document_scope();

create function gare_private.check_requirement_source() returns trigger language plpgsql set search_path='' as $$
declare deadline date;
begin
 if new.source_document_id is null or not exists(select 1 from public.gare_documents where id=new.source_document_id and category='fonte') then raise exception 'Collegare un documento sorgente'; end if;
 if new.source_page is null and length(trim(new.source_section))=0 then raise exception 'Indicare pagina o sezione della fonte'; end if;
 select t.deadline_date into deadline from public.gare_tenders t join public.gare_participations p on p.tender_id=t.id where p.id=new.participation_id;
 if new.status='compatibile' and not exists(select 1 from public.gare_evidence where id=new.evidence_id and status='valido' and verified_on<=coalesce(deadline,current_date) and (expires_on is null or expires_on>=coalesce(deadline,current_date))) then raise exception 'Evidenza assente o non valida al termine della gara'; end if;
 return new;
end $$;
create trigger check_requirement_source before insert or update on public.gare_requirements for each row execute function gare_private.check_requirement_source();

create function gare_private.reopen_evidence_checks() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.gare_requirements set status='da_verificare' where company_id=new.company_id and evidence_id=new.id and status='compatibile';
 return new;
end $$;
create trigger reopen_evidence_checks after update on public.gare_evidence for each row execute function gare_private.reopen_evidence_checks();

-- ai workspace
create table public.gare_document_texts (
 company_id uuid not null,document_id uuid primary key,sha256 text not null,pages jsonb not null,warnings jsonb not null default '[]',coverage jsonb not null,
 foreign key(company_id,document_id) references public.gare_documents(company_id,id)
);
alter table public.gare_document_texts enable row level security;
create policy text_read on public.gare_document_texts for select to authenticated using(gare_private.role_for(company_id) is not null);
revoke all on public.gare_document_texts from anon,authenticated;
grant select on public.gare_document_texts to authenticated;
create table public.gare_ai_jobs (
 id uuid primary key default gen_random_uuid(), company_id uuid not null, participation_id uuid not null,
 created_by uuid not null references auth.users, action text not null check(action in ('analizza','rispondi','bozza','confronta')),
 model text not null, status text not null default 'queued' check(status in ('queued','running','done','error','cancelled','interrupted')),
 progress int not null default 0 check(progress between 0 and 100), message text not null default '',
 input jsonb not null, request_hash text not null, source_snapshot jsonb not null default '[]',
 result jsonb, error text, usage jsonb not null default '{}',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(company_id,id), foreign key(company_id,participation_id) references public.gare_participations(company_id,id)
);
create unique index gare_ai_one_active on public.gare_ai_jobs(company_id,request_hash) where status in ('queued','running');
alter table public.gare_ai_jobs enable row level security;
create policy ai_read on public.gare_ai_jobs for select to authenticated using(gare_private.role_for(company_id) is not null);
revoke all on public.gare_ai_jobs from anon,authenticated;
grant select on public.gare_ai_jobs to authenticated;

create table public.gare_ai_drafts (
 id uuid primary key default gen_random_uuid(),company_id uuid not null,participation_id uuid not null,
 job_id uuid not null unique,title text not null,category text not null check(category in ('amministrativa','tecnica','economica')),
 body text not null,source_snapshot jsonb not null default '[]',missing_fields jsonb not null default '[]',
 revision int not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(company_id,id),foreign key(company_id,participation_id) references public.gare_participations(company_id,id),
 foreign key(company_id,job_id) references public.gare_ai_jobs(company_id,id)
);
create table public.gare_ai_draft_versions (
 id uuid primary key default gen_random_uuid(),company_id uuid not null,draft_id uuid not null,revision int not null,
 title text not null,body text not null,changed_by uuid,created_at timestamptz not null default now(),
 unique(draft_id,revision), foreign key(company_id,draft_id) references public.gare_ai_drafts(company_id,id)
);
alter table public.gare_ai_drafts enable row level security;
alter table public.gare_ai_draft_versions enable row level security;
create policy draft_read on public.gare_ai_drafts for select to authenticated using(gare_private.role_for(company_id) is not null);
create policy draft_update on public.gare_ai_drafts for update to authenticated using(gare_private.role_for(company_id) in ('admin','editor')) with check(gare_private.role_for(company_id) in ('admin','editor'));
create policy version_read on public.gare_ai_draft_versions for select to authenticated using(gare_private.role_for(company_id) is not null);
revoke all on public.gare_ai_drafts,public.gare_ai_draft_versions from anon,authenticated;
grant select,update on public.gare_ai_drafts to authenticated;
grant select on public.gare_ai_draft_versions to authenticated;
create function gare_private.draft_version() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='UPDATE' then
  if (new.company_id,new.participation_id,new.job_id,new.source_snapshot) is distinct from (old.company_id,old.participation_id,old.job_id,old.source_snapshot) then raise exception 'Origine della bozza immutabile'; end if;
  new.revision:=old.revision+1;
 end if;
 new.updated_at:=now();
 insert into public.gare_ai_draft_versions(company_id,draft_id,revision,title,body,changed_by) values(new.company_id,new.id,new.revision,new.title,new.body,auth.uid());
 return new;
end $$;
-- AFTER INSERT for the initial snapshot; BEFORE UPDATE for optimistic revisions.
create function gare_private.draft_initial_version() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.gare_ai_draft_versions(company_id,draft_id,revision,title,body,changed_by) values(new.company_id,new.id,new.revision,new.title,new.body,auth.uid());return new;
end $$;
create trigger draft_initial after insert on public.gare_ai_drafts for each row execute function gare_private.draft_initial_version();
create trigger draft_revision before update on public.gare_ai_drafts for each row execute function gare_private.draft_version();

alter table public.gare_documents add column ai_job_id uuid,add column ai_draft_id uuid,add column unresolved_fields int not null default 0 check(unresolved_fields>=0);
alter table public.gare_documents add foreign key(company_id,ai_job_id) references public.gare_ai_jobs(company_id,id),add foreign key(company_id,ai_draft_id) references public.gare_ai_drafts(company_id,id);
alter table public.gare_requirements add column source_quote text not null default '',add column ai_job_id uuid,add column ai_candidate_id text;
alter table public.gare_requirements add foreign key(company_id,ai_job_id) references public.gare_ai_jobs(company_id,id);
create unique index gare_ai_requirement_once on public.gare_requirements(ai_job_id,ai_candidate_id) where ai_job_id is not null;

create table public.gare_document_requests (
 id uuid primary key default gen_random_uuid(),company_id uuid not null,participation_id uuid not null,
 title text not null,category text not null check(category in ('amministrativa','tecnica','economica')),
 mandatory boolean not null default true,signature_required boolean not null default false,
 source_document_id uuid,source_page int,source_section text not null default '',source_quote text not null default '',
 fulfilled_by uuid,ai_job_id uuid,ai_candidate_id text,revision int not null default 1,
 unique(company_id,id),foreign key(company_id,participation_id) references public.gare_participations(company_id,id),
 foreign key(company_id,source_document_id) references public.gare_documents(company_id,id),
 foreign key(company_id,fulfilled_by) references public.gare_documents(company_id,id),
 foreign key(company_id,ai_job_id) references public.gare_ai_jobs(company_id,id)
);
create unique index gare_ai_document_once on public.gare_document_requests(ai_job_id,ai_candidate_id) where ai_job_id is not null;
alter table public.gare_document_requests enable row level security;
create policy document_request_read on public.gare_document_requests for select to authenticated using(gare_private.role_for(company_id) is not null);
create policy document_request_insert on public.gare_document_requests for insert to authenticated with check(gare_private.role_for(company_id) in ('admin','editor'));
create policy document_request_update on public.gare_document_requests for update to authenticated using(gare_private.role_for(company_id) in ('admin','editor')) with check(gare_private.role_for(company_id) in ('admin','editor'));
grant select,insert,update on public.gare_document_requests to authenticated;
create function gare_private.document_request_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='UPDATE' then if new.company_id<>old.company_id or new.participation_id<>old.participation_id then raise exception 'Ambito immutabile'; end if;new.revision:=old.revision+1;end if;
 if new.fulfilled_by is not null and not exists(select 1 from public.gare_documents where id=new.fulfilled_by and participation_id=new.participation_id and category=new.category) then raise exception 'Documento non coerente con la richiesta'; end if;
 return new;
end $$;
create trigger document_request_guard before insert or update on public.gare_document_requests for each row execute function gare_private.document_request_guard();
create function gare_private.request_invalidate() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.gare_participations set stage='in_revisione' where company_id=new.company_id and id=new.participation_id and stage='pronta';return new;
end $$;
create trigger document_request_invalidate after insert or update on public.gare_document_requests for each row execute function gare_private.request_invalidate();
create trigger document_request_audit after insert or update on public.gare_document_requests for each row execute function gare_private.audit_change();

alter function public.gare_blockers(uuid) rename to gare_manual_blockers;
create function public.gare_blockers(pid uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select public.gare_manual_blockers(pid)||coalesce((select jsonb_agg(msg) from (
  select 'Documento richiesto mancante o non approvato: '||r.title msg from public.gare_document_requests r
  left join public.gare_documents d on d.id=r.fulfilled_by where r.participation_id=pid and r.mandatory
  and (d.id is null or d.status<>'approvato' or d.unresolved_fields>0 or (r.signature_required and not d.signature_declared) or exists(select 1 from public.gare_documents newer where newer.previous_id=d.id))
  union all select 'Definire la checklist dei documenti richiesti dalla gara' where not exists(select 1 from public.gare_document_requests where participation_id=pid)
  union all select 'Dati obbligatori da completare nella bozza: '||name from public.gare_documents d where d.participation_id=pid and d.unresolved_fields>0 and not exists(select 1 from public.gare_documents newer where newer.previous_id=d.id)
 ) checks),'[]'::jsonb)
$$;
revoke all on function public.gare_blockers(uuid) from public;
grant execute on function public.gare_blockers(uuid) to authenticated;
create function gare_private.incomplete_document_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if new.status='approvato' and new.unresolved_fields>0 then raise exception 'Completare i dati mancanti prima di approvare'; end if;
 if TG_OP='UPDATE' and (new.ai_job_id,new.ai_draft_id,new.unresolved_fields) is distinct from (old.ai_job_id,old.ai_draft_id,old.unresolved_fields) then raise exception 'Caricare una nuova versione per modificare i dati della bozza'; end if;
 return new;
end $$;
create trigger incomplete_document_guard before insert or update on public.gare_documents for each row execute function gare_private.incomplete_document_guard();

create function public.gare_apply_ai_proposals(jid uuid,requirement_ids text[],document_ids text[]) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare j public.gare_ai_jobs;r jsonb;cit jsonb;added_r int:=0;added_d int:=0;
begin
 select * into j from public.gare_ai_jobs where id=jid and status='done' and action='analizza';
 if not found then raise exception 'Analisi completata non disponibile';end if;
 if gare_private.role_for(j.company_id) not in ('admin','editor') then raise exception 'Permesso di compilazione richiesto';end if;
 for r in select * from jsonb_array_elements(coalesce(j.result->'requirements','[]')) loop
  if r->>'id'=any(requirement_ids) then
   cit:=r->'citation';
   if not coalesce((cit->>'grounded')::boolean,false) or not exists(select 1 from public.gare_documents d where d.id=(cit->>'document_id')::uuid and d.sha256=cit->>'sha256' and not exists(select 1 from public.gare_documents n where n.previous_id=d.id)) then raise exception 'Fonte non verificata o aggiornata: ripetere l’analisi';end if;
   insert into public.gare_requirements(company_id,participation_id,description,mandatory,status,evidence_id,source_document_id,source_page,source_section,source_quote,note,ai_job_id,ai_candidate_id)
   values(j.company_id,j.participation_id,r->>'description',coalesce((r->>'mandatory')::boolean,true),'da_verificare',nullif(r->>'evidence_id','')::uuid,(cit->>'document_id')::uuid,nullif(cit->>'page','')::int,coalesce(cit->>'section','Testo estratto'),cit->>'quote','Proposta AI locale da revisionare. '||coalesce(r->>'note',''),j.id,r->>'id') on conflict(ai_job_id,ai_candidate_id) where ai_job_id is not null do nothing;
   if found then added_r:=added_r+1;end if;
  end if;
 end loop;
 for r in select * from jsonb_array_elements(coalesce(j.result->'required_documents','[]')) loop
  if r->>'id'=any(document_ids) then
   cit:=r->'citation';
   if not coalesce((cit->>'grounded')::boolean,false) or not exists(select 1 from public.gare_documents d where d.id=(cit->>'document_id')::uuid and d.sha256=cit->>'sha256' and not exists(select 1 from public.gare_documents n where n.previous_id=d.id)) then raise exception 'Fonte non verificata o aggiornata';end if;
   insert into public.gare_document_requests(company_id,participation_id,title,category,mandatory,signature_required,source_document_id,source_page,source_section,source_quote,ai_job_id,ai_candidate_id)
   values(j.company_id,j.participation_id,r->>'title',r->>'category',coalesce((r->>'mandatory')::boolean,true),coalesce((r->>'signature_required')::boolean,false),(cit->>'document_id')::uuid,nullif(cit->>'page','')::int,coalesce(cit->>'section','Testo estratto'),cit->>'quote',j.id,r->>'id') on conflict(ai_job_id,ai_candidate_id) where ai_job_id is not null do nothing;
   if found then added_d:=added_d+1;end if;
  end if;
 end loop;
 return jsonb_build_object('requirements',added_r,'documents',added_d);
end $$;
revoke all on function public.gare_apply_ai_proposals(uuid,text[],text[]) from public;
grant execute on function public.gare_apply_ai_proposals(uuid,text[],text[]) to authenticated;
update public.gare_participations set stage='in_revisione' where stage='pronta';

-- manual completion
create table public.gare_saved_searches (
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.gare_companies,
 user_id uuid not null default auth.uid(),name text not null,filters jsonb not null,created_at timestamptz not null default now()
);
create table public.gare_tender_preferences (
 id uuid primary key default gen_random_uuid(),company_id uuid not null,user_id uuid not null default auth.uid(),tender_id uuid not null,
 state text not null check(state in ('saved','not_relevant','neutral')),reason text not null default '',
 unique(user_id,tender_id),foreign key(company_id,tender_id) references public.gare_tenders(company_id,id)
);
do $$ declare tab text;begin
 foreach tab in array array['gare_saved_searches','gare_tender_preferences'] loop
 execute format('alter table public.%I enable row level security',tab);
 execute format('create policy own_read on public.%I for select to authenticated using(user_id=auth.uid() and gare_private.role_for(company_id) is not null)',tab);
 execute format('create policy own_insert on public.%I for insert to authenticated with check(user_id=auth.uid() and gare_private.role_for(company_id) is not null)',tab);
 execute format('create policy own_update on public.%I for update to authenticated using(user_id=auth.uid() and gare_private.role_for(company_id) is not null) with check(user_id=auth.uid() and gare_private.role_for(company_id) is not null)',tab);
 execute format('grant select,insert,update on public.%I to authenticated',tab);
 end loop;
end $$;
create table public.gare_economic_scenarios (
 id uuid primary key default gen_random_uuid(),company_id uuid not null,participation_id uuid not null,
 title text not null,input jsonb not null,revision int not null default 1,created_by uuid not null default auth.uid(),updated_at timestamptz not null default now(),
 unique(company_id,id),foreign key(company_id,participation_id) references public.gare_participations(company_id,id)
);
alter table public.gare_economic_scenarios enable row level security;
create policy economic_read on public.gare_economic_scenarios for select to authenticated using(gare_private.role_for(company_id) is not null);
create policy economic_insert on public.gare_economic_scenarios for insert to authenticated with check(gare_private.role_for(company_id) in ('admin','editor'));
create policy economic_update on public.gare_economic_scenarios for update to authenticated using(gare_private.role_for(company_id) in ('admin','editor')) with check(gare_private.role_for(company_id) in ('admin','editor'));
grant select,insert,update on public.gare_economic_scenarios to authenticated;
create trigger economic_audit after insert or update on public.gare_economic_scenarios for each row execute function gare_private.audit_change();
create trigger economic_invalidate after insert or update on public.gare_economic_scenarios for each row execute function gare_private.request_invalidate();
create function gare_private.economic_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='UPDATE' then if (new.company_id,new.participation_id) is distinct from (old.company_id,old.participation_id) then raise exception 'Ambito immutabile';end if;new.revision:=old.revision+1;end if;
 if jsonb_typeof(new.input->'items')<>'array' or jsonb_array_length(new.input->'items')<1 or new.input->>'rule_source'='' then raise exception 'Scenario economico incompleto';end if;
 new.updated_at:=now();return new;
end $$;
create trigger economic_guard before insert or update on public.gare_economic_scenarios for each row execute function gare_private.economic_guard();
create function gare_private.economic_snapshot() returns trigger language plpgsql set search_path='' as $$
begin
 new.manifest:=new.manifest||jsonb_build_object('economic_scenarios',coalesce((select jsonb_agg(to_jsonb(s)) from public.gare_economic_scenarios s where s.participation_id=new.participation_id),'[]'::jsonb));return new;
end $$;
create trigger zz_economic_snapshot before insert on public.gare_exports for each row execute function gare_private.economic_snapshot();

grant delete on public.gare_participation_lots to authenticated;
create policy lots_delete on public.gare_participation_lots for delete to authenticated using(gare_private.role_for(company_id) in ('admin','editor'));
create function public.gare_select_lots(pid uuid,lot_ids uuid[],expected_revision int) returns void language plpgsql security invoker set search_path='' as $$
declare p public.gare_participations;l uuid;
begin
 select * into p from public.gare_participations where id=pid for update;
 if not found or p.revision<>expected_revision then raise exception 'Partecipazione modificata: ricaricare';end if;
 if p.stage='presentata' then raise exception 'Conservare i lotti del pacchetto presentato; registrare prima un ritiro o una revisione';end if;
 if coalesce(array_length(lot_ids,1),0)=0 then raise exception 'Selezionare almeno un lotto';end if;
 if exists(select 1 from public.gare_documents where participation_id=pid and lot_id is not null and not(lot_id=any(lot_ids))) then raise exception 'Sono presenti documenti riferiti a un lotto da rimuovere: revisionare prima le assegnazioni';end if;
 update public.gare_participations set stage='in_revisione' where id=pid;
 delete from public.gare_participation_lots where participation_id=pid;
 foreach l in array lot_ids loop insert into public.gare_participation_lots(company_id,participation_id,lot_id) values(p.company_id,pid,l);end loop;
end $$;
revoke all on function public.gare_select_lots(uuid,uuid[],int) from public;
grant execute on function public.gare_select_lots(uuid,uuid[],int) to authenticated;

-- sources and templates
create table public.gare_sources (
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.gare_companies,
 key text not null,name text not null,owner text not null,url text not null,access_mode text not null,
 coverage text not null,license_note text not null,frequency text not null default 'manuale',enabled boolean not null default false,
 last_attempt timestamptz,last_success timestamptz,last_error text,unique(company_id,key),unique(company_id,id)
);
create table public.gare_ingestion_runs (
 id uuid primary key default gen_random_uuid(),company_id uuid not null,source_id uuid not null,query jsonb not null,
 status text not null check(status in ('running','done','partial','error')),count int not null default 0,error text,
 started_at timestamptz not null default now(),finished_at timestamptz,
 foreign key(company_id,source_id) references public.gare_sources(company_id,id)
);
create table public.gare_notice_versions (
 id uuid primary key default gen_random_uuid(),company_id uuid not null,source_id uuid not null,publication_number text not null,
 procedure_identifier text,sha256 text not null,raw jsonb not null,normalized jsonb not null,fetched_at timestamptz not null default now(),
 unique(company_id,id),unique(company_id,source_id,publication_number,sha256),foreign key(company_id,source_id) references public.gare_sources(company_id,id)
);
alter table public.gare_tenders add column notice_version_id uuid;
alter table public.gare_tenders add foreign key(company_id,notice_version_id) references public.gare_notice_versions(company_id,id);
create table public.gare_source_changes (
 id uuid primary key default gen_random_uuid(),company_id uuid not null,tender_id uuid not null,notice_version_id uuid not null,
 status text not null default 'pending' check(status in ('pending','reviewed')),review_note text not null default '',reviewed_by uuid,
 created_at timestamptz not null default now(),unique(tender_id,notice_version_id),
 foreign key(company_id,tender_id) references public.gare_tenders(company_id,id),
 foreign key(company_id,notice_version_id) references public.gare_notice_versions(company_id,id)
);
do $$ declare tab text;begin
 foreach tab in array array['gare_sources','gare_ingestion_runs','gare_notice_versions','gare_source_changes'] loop
 execute format('alter table public.%I enable row level security',tab);
 execute format('create policy source_read on public.%I for select to authenticated using(gare_private.role_for(company_id) is not null)',tab);
 execute format('revoke all on public.%I from anon,authenticated',tab);
 execute format('grant select on public.%I to authenticated',tab);
 end loop;
end $$;
grant update(enabled) on public.gare_sources to authenticated;
create policy source_admin on public.gare_sources for update to authenticated using(gare_private.role_for(company_id)='admin') with check(gare_private.role_for(company_id)='admin');
grant update on public.gare_source_changes to authenticated;
create policy source_change_review on public.gare_source_changes for update to authenticated using(gare_private.role_for(company_id) in ('admin','editor')) with check(gare_private.role_for(company_id) in ('admin','editor'));
create function gare_private.source_change_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if (new.company_id,new.tender_id,new.notice_version_id,new.created_at) is distinct from (old.company_id,old.tender_id,old.notice_version_id,old.created_at) then raise exception 'Avviso originale immutabile';end if;
 if new.status='reviewed' and length(trim(new.review_note))<5 then raise exception 'Motivare la verifica dell’aggiornamento';end if;
 new.reviewed_by:=case when new.status='reviewed' then auth.uid() else null end;return new;
end $$;
create trigger source_change_guard before update on public.gare_source_changes for each row execute function gare_private.source_change_guard();
create trigger source_change_audit after update on public.gare_source_changes for each row execute function gare_private.audit_change();

create table public.gare_document_contracts (
 id uuid primary key default gen_random_uuid(),company_id uuid not null,participation_id uuid not null,source_document_id uuid not null,
 source_sha256 text not null,format text not null check(format in ('docx_tokens','pdf_acroform')),name text not null,fields jsonb not null,constraints jsonb not null,
 mapping jsonb not null default '{}',confirmed_by uuid,revision int not null default 1,created_at timestamptz not null default now(),
 unique(company_id,id),foreign key(company_id,participation_id) references public.gare_participations(company_id,id),foreign key(company_id,source_document_id) references public.gare_documents(company_id,id)
);
alter table public.gare_document_contracts enable row level security;
create policy contract_read on public.gare_document_contracts for select to authenticated using(gare_private.role_for(company_id) is not null);
revoke all on public.gare_document_contracts from anon,authenticated;
grant select on public.gare_document_contracts to authenticated;
alter table public.gare_documents add column template_contract_id uuid;
alter table public.gare_documents add foreign key(company_id,template_contract_id) references public.gare_document_contracts(company_id,id);

create or replace function public.gare_blockers(pid uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select public.gare_manual_blockers(pid)||coalesce((select jsonb_agg(msg) from (
  select 'Documento richiesto mancante o non approvato: '||r.title msg from public.gare_document_requests r
  left join public.gare_documents d on d.id=r.fulfilled_by where r.participation_id=pid and r.mandatory
  and (d.id is null or d.status<>'approvato' or d.unresolved_fields>0 or (r.signature_required and not d.signature_declared) or exists(select 1 from public.gare_documents newer where newer.previous_id=d.id))
  union all select 'Definire la checklist dei documenti richiesti dalla gara' where not exists(select 1 from public.gare_document_requests where participation_id=pid)
  union all select 'Dati obbligatori da completare nella bozza: '||name from public.gare_documents d where d.participation_id=pid and d.unresolved_fields>0 and not exists(select 1 from public.gare_documents newer where newer.previous_id=d.id)
  union all select 'Nuovo avviso da verificare presso la fonte ufficiale' from public.gare_source_changes c join public.gare_participations p on p.tender_id=c.tender_id where p.id=pid and c.status='pending'
 ) checks),'[]'::jsonb)
$$;
create function public.gare_create_from_notice(notice uuid,payload jsonb,lots jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare n public.gare_notice_versions;tid uuid;
begin
 select * into n from public.gare_notice_versions where id=notice;if not found then raise exception 'Avviso non disponibile';end if;
 tid:=public.gare_create_tender(payload||jsonb_build_object('company_id',n.company_id,'official_id','TED:'||n.publication_number,'official_url',n.normalized->>'url'),lots);
 update public.gare_tenders set source='TED · dati confermati dall’impresa',notice_version_id=n.id where id=tid;return tid;
end $$;
revoke all on function public.gare_create_from_notice(uuid,jsonb,jsonb) from public;
grant execute on function public.gare_create_from_notice(uuid,jsonb,jsonb) to authenticated;

-- document lifecycle
alter table public.gare_documents add column preview_path text,add column preview_sha256 text,add column generation_snapshot jsonb not null default '{}',add column archived boolean not null default false,add column archive_reason text not null default '';
create function gare_private.document_lifecycle_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='UPDATE' then
  if (new.preview_path,new.preview_sha256,new.generation_snapshot,new.template_contract_id) is distinct from (old.preview_path,old.preview_sha256,old.generation_snapshot,old.template_contract_id) then raise exception 'Generazione immutabile: creare una nuova versione';end if;
  if new.archived is distinct from old.archived then
   if gare_private.role_for(new.company_id) not in ('admin','editor') then raise exception 'Permesso di compilazione richiesto';end if;
   if new.category not in ('amministrativa','tecnica','economica') then raise exception 'Originali e ricevute non archiviabili';end if;
   if length(trim(new.archive_reason))<5 then raise exception 'Motivare esclusione o ripristino del documento';end if;
   new.status:='bozza';new.approved_at:=null;new.approved_by:=null;
  end if;
 end if;
 if new.archived and new.status='approvato' then raise exception 'Documento escluso dal fascicolo attivo';end if;
 if new.preview_path is not null and (split_part(new.preview_path,'/',1)<>new.company_id::text or not exists(select 1 from storage.objects where bucket_id='gare-private' and name=new.preview_path)) then raise exception 'Anteprima privata non disponibile';end if;
 return new;
end $$;
create trigger archive_document_guard before insert or update on public.gare_documents for each row execute function gare_private.document_lifecycle_guard();
create or replace function public.gare_manual_blockers(pid uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(msg),'[]'::jsonb) from (
  select 'Confermare la decisione di partecipare e la motivazione' msg from public.gare_participations p where p.id=pid and (p.decision<>'partecipa' or length(trim(p.decision_reason))<3)
  union all select 'Selezionare almeno un lotto' where not exists(select 1 from public.gare_participation_lots where participation_id=pid)
  union all select 'Acquisire il disciplinare' from public.gare_participations p where p.id=pid and not exists(select 1 from public.gare_documents d where d.tender_id=p.tender_id and d.category='fonte' and d.document_kind='disciplinare')
  union all select 'Registrare e revisionare i requisiti della gara' where not exists(select 1 from public.gare_requirements r where r.participation_id=pid)
  union all select 'Requisito da risolvere: '||r.description from public.gare_requirements r
   join public.gare_participations p on p.id=r.participation_id join public.gare_tenders t on t.id=p.tender_id
   left join public.gare_evidence e on e.id=r.evidence_id
   where r.participation_id=pid and r.mandatory and (
    r.status not in ('compatibile','non_applicabile') or r.reviewed_by is null or r.source_document_id is null
    or (r.status='non_applicabile' and length(trim(r.note))<3)
    or (r.status='compatibile' and (e.id is null or e.status<>'valido' or e.verified_on>coalesce(t.deadline_date,current_date) or e.expires_on<coalesce(t.deadline_date,current_date))))
  union all select 'Documento da completare: '||d.name from public.gare_documents d
   where d.participation_id=pid and not d.archived and d.category in ('amministrativa','tecnica','economica')
   and not exists(select 1 from public.gare_documents newer where newer.previous_id=d.id)
   and (d.status<>'approvato' or (d.signature_required and not d.signature_declared))
  union all select 'Caricare almeno un documento di offerta' where not exists(select 1 from public.gare_documents where participation_id=pid and not archived and category in ('amministrativa','tecnica','economica'))
  union all select 'Attività obbligatoria aperta: '||title from public.gare_tasks where participation_id=pid and mandatory and not completed
  union all select 'Verificare data e ora ufficiali di presentazione' from public.gare_tenders t join public.gare_participations p on p.tender_id=t.id where p.id=pid and (t.deadline_date is null or t.deadline_time is null)
  union all select 'Il termine di presentazione è scaduto' from public.gare_tenders t join public.gare_participations p on p.tender_id=t.id where p.id=pid and (t.deadline_date+t.deadline_time) at time zone t.timezone < now()
 ) checks
$$;
create or replace function public.gare_blockers(pid uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select public.gare_manual_blockers(pid)||coalesce((select jsonb_agg(msg) from (
  select 'Documento richiesto mancante o non approvato: '||r.title msg from public.gare_document_requests r
  left join public.gare_documents d on d.id=r.fulfilled_by where r.participation_id=pid and r.mandatory
  and (d.id is null or d.archived or d.status<>'approvato' or d.unresolved_fields>0 or (r.signature_required and not d.signature_declared) or exists(select 1 from public.gare_documents newer where newer.previous_id=d.id))
  union all select 'Definire la checklist dei documenti richiesti dalla gara' where not exists(select 1 from public.gare_document_requests where participation_id=pid)
  union all select 'Dati obbligatori da completare nella bozza: '||name from public.gare_documents d where d.participation_id=pid and not d.archived and d.unresolved_fields>0 and not exists(select 1 from public.gare_documents newer where newer.previous_id=d.id)
  union all select 'Nuovo avviso da verificare presso la fonte ufficiale' from public.gare_source_changes c join public.gare_participations p on p.tender_id=c.tender_id where p.id=pid and c.status='pending'
 ) checks),'[]'::jsonb)
$$;
create or replace function gare_private.export_snapshot() returns trigger language plpgsql set search_path='' as $$
declare p public.gare_participations; t public.gare_tenders;
begin
 select * into p from public.gare_participations where id=new.participation_id and company_id=new.company_id for update;
 if not found then raise exception 'Partecipazione non accessibile'; end if;
 if not new.draft and (p.stage<>'pronta' or jsonb_array_length(public.gare_blockers(p.id))>0) then raise exception 'Il pacchetto finale richiede una partecipazione pronta'; end if;
 select * into t from public.gare_tenders where id=p.tender_id;
 new.created_by:=auth.uid();
 new.manifest:=jsonb_build_object('schema_version',1,'draft',new.draft,'participation',to_jsonb(p),'tender',to_jsonb(t),
 'documents',coalesce((select jsonb_agg(to_jsonb(d) order by d.category,d.name) from public.gare_documents d where d.company_id=new.company_id and (d.participation_id=p.id or (d.tender_id=t.id and d.category='fonte')) and not d.archived and d.category<>'ricevuta' and not exists(select 1 from public.gare_documents newer where newer.previous_id=d.id)),'[]'::jsonb),
 'requirements',coalesce((select jsonb_agg(to_jsonb(r)) from public.gare_requirements r where r.participation_id=p.id),'[]'::jsonb),
 'lots',coalesce((select jsonb_agg(to_jsonb(l)) from public.gare_lots l join public.gare_participation_lots pl on pl.lot_id=l.id where pl.participation_id=p.id),'[]'::jsonb),
 'evidence',coalesce((select jsonb_agg(to_jsonb(e)) from public.gare_evidence e where e.id in(select evidence_id from public.gare_requirements where participation_id=p.id)),'[]'::jsonb));
 return new;
end $$;

-- technical and evidence
create table public.gare_technical_criteria (
 id uuid primary key default gen_random_uuid(),company_id uuid not null,participation_id uuid not null,parent_id uuid,
 code text not null,title text not null,max_points numeric(9,3) check(max_points>=0),source_document_id uuid not null,source_locator text not null check(length(trim(source_locator))>0),source_quote text not null default '',
 proposal text not null default '',evidence_id uuid,commitments text not null default '',limits text not null default '',
 mandatory boolean not null default true,status text not null default 'bozza' check(status in ('bozza','in_verifica','approvato')),review_note text not null default '',reviewed_by uuid,revision int not null default 1,
 unique(company_id,id),unique(company_id,participation_id,id),unique(participation_id,code),
 foreign key(company_id,participation_id) references public.gare_participations(company_id,id),foreign key(company_id,participation_id,parent_id) references public.gare_technical_criteria(company_id,participation_id,id),
 foreign key(company_id,source_document_id) references public.gare_documents(company_id,id),foreign key(company_id,evidence_id) references public.gare_evidence(company_id,id)
);
create table public.gare_evidence_files (
 id uuid primary key default gen_random_uuid(),company_id uuid not null,evidence_id uuid not null,name text not null,storage_path text not null,sha256 text not null,size_bytes int not null check(size_bytes>0 and size_bytes<=20971520),version int not null default 1,previous_id uuid,created_at timestamptz not null default now(),
 unique(company_id,id),foreign key(company_id,evidence_id) references public.gare_evidence(company_id,id),foreign key(company_id,previous_id) references public.gare_evidence_files(company_id,id)
);
create unique index gare_evidence_next on public.gare_evidence_files(previous_id) where previous_id is not null;
alter table public.gare_participations add column technical_review_note text not null default '';
do $$ declare tab text;begin
 foreach tab in array array['gare_technical_criteria','gare_evidence_files'] loop
 execute format('alter table public.%I enable row level security',tab);
 execute format('create policy read_company on public.%I for select to authenticated using(gare_private.role_for(company_id) is not null)',tab);
 execute format('create policy write_company on public.%I for insert to authenticated with check(gare_private.role_for(company_id) in (''admin'',''editor''))',tab);
 execute format('grant select,insert on public.%I to authenticated',tab);
 execute format('create trigger audit_change after insert or update on public.%I for each row execute function gare_private.audit_change()',tab);
 end loop;
end $$;
grant update on public.gare_technical_criteria to authenticated;
create policy update_criteria on public.gare_technical_criteria for update to authenticated using(gare_private.role_for(company_id) in ('admin','editor','reviewer')) with check(gare_private.role_for(company_id) in ('admin','editor','reviewer'));
create function gare_private.criteria_guard() returns trigger language plpgsql set search_path='' as $$
declare p public.gare_participations;
begin
 select * into p from public.gare_participations where id=new.participation_id;
 if not exists(select 1 from public.gare_documents where id=new.source_document_id and tender_id=p.tender_id and category='fonte') then raise exception 'Fonte non coerente con il criterio';end if;
 if new.parent_id=new.id or exists(with recursive ancestors as (select id,parent_id from public.gare_technical_criteria where id=new.parent_id union all select c.id,c.parent_id from public.gare_technical_criteria c join ancestors a on c.id=a.parent_id) select 1 from ancestors where id=new.id) then raise exception 'Gerarchia dei criteri ciclica';end if;
 if TG_OP='UPDATE' then
  if (new.company_id,new.participation_id) is distinct from (old.company_id,old.participation_id) then raise exception 'Contesto del criterio immutabile';end if;
  if gare_private.role_for(new.company_id)='reviewer' and (to_jsonb(new)-array['status','review_note','reviewed_by','revision']) is distinct from (to_jsonb(old)-array['status','review_note','reviewed_by','revision']) then raise exception 'Il revisore può revisionare e approvare';end if;
  if (to_jsonb(new)-array['status','review_note','reviewed_by','revision']) is distinct from (to_jsonb(old)-array['status','review_note','reviewed_by','revision']) then new.status:='bozza';end if;
  new.revision:=old.revision+1;
 end if;
 if new.status='approvato' then
  if gare_private.role_for(new.company_id) not in ('admin','reviewer') then raise exception 'Permesso di approvazione richiesto';end if;
  if length(trim(new.proposal))<10 or length(trim(new.review_note))<5 then raise exception 'Completare proposta e motivazione della revisione';end if;
  if exists(select 1 from public.gare_documents where previous_id=new.source_document_id) then raise exception 'Fonte superata: rivedere il criterio';end if;
  if new.evidence_id is not null and not exists(select 1 from public.gare_evidence e join public.gare_tenders t on t.id=p.tender_id where e.id=new.evidence_id and e.status='valido' and e.verified_on<=coalesce(t.deadline_date,current_date) and (e.expires_on is null or e.expires_on>=coalesce(t.deadline_date,current_date))) then raise exception 'Prova tecnica non valida alla scadenza';end if;
  new.reviewed_by:=auth.uid();
 else new.reviewed_by:=null;end if;
 return new;
end $$;
create trigger criteria_guard before insert or update on public.gare_technical_criteria for each row execute function gare_private.criteria_guard();
create function gare_private.criteria_impact() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.gare_participations set stage='in_revisione' where id=new.participation_id and stage='pronta';
 update public.gare_documents set status='bozza' where participation_id=new.participation_id and category='tecnica' and status='approvato';return new;
end $$;
create trigger criteria_impact after insert or update on public.gare_technical_criteria for each row execute function gare_private.criteria_impact();
create function gare_private.evidence_file_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if split_part(new.storage_path,'/',1)<>new.company_id::text or not exists(select 1 from storage.objects where bucket_id='gare-private' and name=new.storage_path) then raise exception 'File privato non disponibile';end if;
 if new.previous_id is null and new.version<>1 then raise exception 'Prima versione non coerente';end if;
 if new.previous_id is not null and not exists(select 1 from public.gare_evidence_files where id=new.previous_id and evidence_id=new.evidence_id and version+1=new.version) then raise exception 'Versione prova non coerente';end if;return new;
end $$;
create trigger evidence_file_guard before insert on public.gare_evidence_files for each row execute function gare_private.evidence_file_guard();
create function gare_private.reopen_technical_checks() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_TABLE_NAME='gare_evidence_files' then update public.gare_evidence set source=source where id=new.evidence_id;return new;end if;
 if TG_TABLE_NAME='gare_evidence' then update public.gare_technical_criteria set status='in_verifica' where evidence_id=new.id and status='approvato';end if;
 if TG_TABLE_NAME='gare_documents' and new.category='fonte' and (new.previous_id is not null or new.document_kind='rettifica') then update public.gare_technical_criteria set status='in_verifica' where participation_id in(select id from public.gare_participations where tender_id=new.tender_id);end if;
 return new;
end $$;
create trigger reopen_technical after insert on public.gare_documents for each row execute function gare_private.reopen_technical_checks();
create trigger reopen_technical after update on public.gare_evidence for each row execute function gare_private.reopen_technical_checks();
create trigger reopen_technical after insert on public.gare_evidence_files for each row execute function gare_private.reopen_technical_checks();
create function public.gare_preparation_blockers(pid uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(msg),'[]'::jsonb) from (
 select 'Critero tecnico da revisionare: '||code||' '||title msg from public.gare_technical_criteria where participation_id=pid and mandatory and (status<>'approvato' or reviewed_by is null)
 union all select 'Confermare completezza dei criteri tecnici e dei sottocriteri' from public.gare_participations p where p.id=pid and length(trim(p.technical_review_note))<5 and (exists(select 1 from public.gare_document_requests where participation_id=pid and category='tecnica') or exists(select 1 from public.gare_documents where participation_id=pid and category='tecnica' and not archived))
 ) checks
$$;
revoke all on function public.gare_preparation_blockers(uuid) from public;grant execute on function public.gare_preparation_blockers(uuid) to authenticated;
create or replace function public.gare_blockers(pid uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select public.gare_manual_blockers(pid)||public.gare_preparation_blockers(pid)||coalesce((select jsonb_agg(msg) from (
  select 'Documento richiesto mancante o non approvato: '||r.title msg from public.gare_document_requests r
  left join public.gare_documents d on d.id=r.fulfilled_by where r.participation_id=pid and r.mandatory
  and (d.id is null or d.archived or d.status<>'approvato' or d.unresolved_fields>0 or (r.signature_required and not d.signature_declared) or exists(select 1 from public.gare_documents newer where newer.previous_id=d.id))
  union all select 'Definire la checklist dei documenti richiesti dalla gara' where not exists(select 1 from public.gare_document_requests where participation_id=pid)
  union all select 'Dati obbligatori da completare nella bozza: '||name from public.gare_documents d where d.participation_id=pid and not d.archived and d.unresolved_fields>0 and not exists(select 1 from public.gare_documents newer where newer.previous_id=d.id)
  union all select 'Nuovo avviso da verificare presso la fonte ufficiale' from public.gare_source_changes c join public.gare_participations p on p.tender_id=c.tender_id where p.id=pid and c.status='pending'
 ) checks),'[]'::jsonb)
$$;
create or replace function gare_private.export_snapshot() returns trigger language plpgsql set search_path='' as $$
declare p public.gare_participations; t public.gare_tenders;
begin
 select * into p from public.gare_participations where id=new.participation_id and company_id=new.company_id for update;
 if not found then raise exception 'Partecipazione non accessibile'; end if;
 if not new.draft and (p.stage<>'pronta' or jsonb_array_length(public.gare_blockers(p.id))>0) then raise exception 'Il pacchetto finale richiede una partecipazione pronta'; end if;
 select * into t from public.gare_tenders where id=p.tender_id;
 new.created_by:=auth.uid();
 new.manifest:=jsonb_build_object('schema_version',1,'draft',new.draft,'participation',to_jsonb(p),'tender',to_jsonb(t),
 'documents',coalesce((select jsonb_agg(to_jsonb(d) order by d.category,d.name) from public.gare_documents d where d.company_id=new.company_id and (d.participation_id=p.id or (d.tender_id=t.id and d.category='fonte')) and not d.archived and d.category<>'ricevuta' and not exists(select 1 from public.gare_documents newer where newer.previous_id=d.id)),'[]'::jsonb),
 'requirements',coalesce((select jsonb_agg(to_jsonb(r)) from public.gare_requirements r where r.participation_id=p.id),'[]'::jsonb),
 'lots',coalesce((select jsonb_agg(to_jsonb(l)) from public.gare_lots l join public.gare_participation_lots pl on pl.lot_id=l.id where pl.participation_id=p.id),'[]'::jsonb),
 'technical_criteria',coalesce((select jsonb_agg(to_jsonb(c)) from public.gare_technical_criteria c where c.participation_id=p.id),'[]'::jsonb),
 'evidence_files',coalesce((select jsonb_agg(to_jsonb(f)) from public.gare_evidence_files f where f.evidence_id in(select evidence_id from public.gare_requirements where participation_id=p.id union select evidence_id from public.gare_technical_criteria where participation_id=p.id) and not exists(select 1 from public.gare_evidence_files n where n.previous_id=f.id)),'[]'::jsonb),
 'evidence',coalesce((select jsonb_agg(to_jsonb(e)) from public.gare_evidence e where e.id in(select evidence_id from public.gare_requirements where participation_id=p.id)),'[]'::jsonb));
 return new;
end $$;

-- technical trigger fix
create or replace function gare_private.reopen_technical_checks() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_TABLE_NAME='gare_evidence_files' then update public.gare_evidence set source=source where id=new.evidence_id;return new;end if;
 if TG_TABLE_NAME='gare_evidence' then update public.gare_technical_criteria set status='in_verifica' where evidence_id=new.id and status='approvato';end if;
 if TG_TABLE_NAME='gare_documents' and to_jsonb(new)->>'category'='fonte' and (to_jsonb(new)->>'previous_id' is not null or to_jsonb(new)->>'document_kind'='rettifica') then update public.gare_technical_criteria set status='in_verifica' where participation_id in(select id from public.gare_participations where tender_id=new.tender_id);end if;
 return new;
end $$;

create trigger source_configuration_audit after update on public.gare_sources for each row execute function gare_private.audit_change();
create or replace function public.gare_create_from_notice(notice uuid,payload jsonb,lots jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare n public.gare_notice_versions;tid uuid;
begin
 select * into n from public.gare_notice_versions where id=notice;if not found then raise exception 'Avviso non disponibile';end if;
 tid:=public.gare_create_tender(payload||jsonb_build_object('company_id',n.company_id,'official_id','TED:'||n.publication_number,'official_url',n.normalized->>'url'),lots);
 update public.gare_tenders set source=case when n.normalized->>'demo'='true' then 'DEMO · campione storico TED' else 'TED · dati confermati dall’impresa' end,notice_version_id=n.id where id=tid;return tid;
end $$;

-- deadline integrity
alter table public.gare_tenders add column deadline_utc_offset smallint check(deadline_utc_offset between -840 and 840);
create function gare_private.deadline_guard() returns trigger language plpgsql set search_path='' as $$
declare local_stamp timestamp;utc_stamp timestamptz;
begin
 if new.deadline_time is not null and new.deadline_date is null then raise exception 'Un orario richiede la data ufficiale';end if;
 if new.deadline_date is null or new.deadline_time is null then new.deadline_utc_offset:=null;return new;end if;
 local_stamp:=new.deadline_date+new.deadline_time;
 utc_stamp:=local_stamp at time zone new.timezone;
 if utc_stamp at time zone new.timezone<>local_stamp then raise exception 'Orario inesistente nel fuso per il cambio ora legale: verificare la fonte';end if;
 if new.deadline_utc_offset is not null then
  utc_stamp:=(local_stamp-make_interval(mins=>new.deadline_utc_offset)) at time zone 'UTC';
  if utc_stamp at time zone new.timezone<>local_stamp then raise exception 'Scostamento UTC non coerente con data e fuso';end if;
 elsif (utc_stamp-interval '1 hour') at time zone new.timezone=local_stamp or (utc_stamp+interval '1 hour') at time zone new.timezone=local_stamp or (utc_stamp-interval '30 minutes') at time zone new.timezone=local_stamp or (utc_stamp+interval '30 minutes') at time zone new.timezone=local_stamp then
  raise exception 'Orario ambiguo al cambio ora: confermare lo scostamento UTC indicato dalla fonte';
 end if;return new;
end $$;
create trigger deadline_guard before insert or update on public.gare_tenders for each row execute function gare_private.deadline_guard();
create or replace function public.gare_manual_blockers(pid uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(msg),'[]'::jsonb) from (
  select 'Confermare la decisione di partecipare e la motivazione' msg from public.gare_participations p where p.id=pid and (p.decision<>'partecipa' or length(trim(p.decision_reason))<3)
  union all select 'Selezionare almeno un lotto' where not exists(select 1 from public.gare_participation_lots where participation_id=pid)
  union all select 'Acquisire il disciplinare' from public.gare_participations p where p.id=pid and not exists(select 1 from public.gare_documents d where d.tender_id=p.tender_id and d.category='fonte' and d.document_kind='disciplinare')
  union all select 'Registrare e revisionare i requisiti della gara' where not exists(select 1 from public.gare_requirements r where r.participation_id=pid)
  union all select 'Requisito da risolvere: '||r.description from public.gare_requirements r
   join public.gare_participations p on p.id=r.participation_id join public.gare_tenders t on t.id=p.tender_id
   left join public.gare_evidence e on e.id=r.evidence_id
   where r.participation_id=pid and r.mandatory and (
    r.status not in ('compatibile','non_applicabile') or r.reviewed_by is null or r.source_document_id is null
    or (r.status='non_applicabile' and length(trim(r.note))<3)
    or (r.status='compatibile' and (e.id is null or e.status<>'valido' or e.verified_on>coalesce(t.deadline_date,current_date) or e.expires_on<coalesce(t.deadline_date,current_date))))
  union all select 'Documento da completare: '||d.name from public.gare_documents d
   where d.participation_id=pid and not d.archived and d.category in ('amministrativa','tecnica','economica')
   and not exists(select 1 from public.gare_documents newer where newer.previous_id=d.id)
   and (d.status<>'approvato' or (d.signature_required and not d.signature_declared))
  union all select 'Caricare almeno un documento di offerta' where not exists(select 1 from public.gare_documents where participation_id=pid and not archived and category in ('amministrativa','tecnica','economica'))
  union all select 'Attività obbligatoria aperta: '||title from public.gare_tasks where participation_id=pid and mandatory and not completed
  union all select 'Verificare data e ora ufficiali di presentazione' from public.gare_tenders t join public.gare_participations p on p.tender_id=t.id where p.id=pid and (t.deadline_date is null or t.deadline_time is null)
  union all select 'Il termine di presentazione è scaduto' from public.gare_tenders t join public.gare_participations p on p.tender_id=t.id where p.id=pid and case when t.deadline_utc_offset is null then (t.deadline_date+t.deadline_time) at time zone t.timezone else ((t.deadline_date+t.deadline_time)-make_interval(mins=>t.deadline_utc_offset)) at time zone 'UTC' end < now()
 ) checks
$$;
create or replace function public.gare_create_tender(payload jsonb,lots jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare t uuid; l jsonb;
begin
 if jsonb_array_length(lots)<1 then raise exception 'Inserire almeno un lotto'; end if;
 insert into public.gare_tenders(company_id,title,authority,territory,base_amount,official_id,official_url,kind,deadline_date,deadline_time,description,deadline_utc_offset)
 values((payload->>'company_id')::uuid,payload->>'title',payload->>'authority',payload->>'territory',
 (payload->>'base_amount')::numeric,nullif(payload->>'official_id',''),nullif(payload->>'official_url',''),
 coalesce(payload->>'kind','gara_aperta'),nullif(payload->>'deadline_date','')::date,nullif(payload->>'deadline_time','')::time,coalesce(payload->>'description',''),nullif(payload->>'deadline_utc_offset','')::smallint) returning id into t;
 for l in select * from jsonb_array_elements(lots) loop
  insert into public.gare_lots(company_id,tender_id,code,title,amount)
  values((payload->>'company_id')::uuid,t,l->>'code',l->>'title',(l->>'amount')::numeric);
 end loop;
 return t;
end $$;

-- requirement details and lots
alter table public.gare_requirements add column lot_id uuid,add column kind text not null default 'da_classificare',add column applicability text not null default '',add column threshold text not null default '',add column unit text not null default '',add column reference_period text not null default '',add column expected_proof text not null default '';
alter table public.gare_tasks add column lot_id uuid;
alter table public.gare_document_requests add column lot_id uuid,add column responsible text not null default '',add column due_date date;
do $$ declare tab text;begin
 foreach tab in array array['gare_requirements','gare_tasks','gare_document_requests'] loop
 execute format('alter table public.%I add foreign key(company_id,lot_id) references public.gare_lots(company_id,id)',tab);
 end loop;
end $$;
create function gare_private.lot_assignment_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if new.lot_id is not null and not exists(select 1 from public.gare_participation_lots where company_id=new.company_id and participation_id=new.participation_id and lot_id=new.lot_id) then raise exception 'Selezionare un lotto della partecipazione';end if;
 if TG_TABLE_NAME='gare_document_requests' and to_jsonb(new)->>'fulfilled_by' is not null and new.lot_id is not null and exists(select 1 from public.gare_documents where id=(to_jsonb(new)->>'fulfilled_by')::uuid and lot_id is not null and lot_id<>new.lot_id) then raise exception 'Documento riferito a un altro lotto';end if;
 return new;
end $$;
do $$ declare tab text;begin
 foreach tab in array array['gare_requirements','gare_tasks','gare_document_requests'] loop
 execute format('create trigger lot_assignment_guard before insert or update on public.%I for each row execute function gare_private.lot_assignment_guard()',tab);
 end loop;
end $$;
create or replace function public.gare_select_lots(pid uuid,lot_ids uuid[],expected_revision int) returns void language plpgsql security invoker set search_path='' as $$
declare p public.gare_participations;l uuid;
begin
 select * into p from public.gare_participations where id=pid for update;
 if not found or p.revision<>expected_revision then raise exception 'Partecipazione modificata: ricaricare';end if;
 if p.stage='presentata' then raise exception 'Conservare i lotti del pacchetto presentato; registrare prima un ritiro o una revisione';end if;
 if coalesce(array_length(lot_ids,1),0)=0 then raise exception 'Selezionare almeno un lotto';end if;
 if exists(select 1 from public.gare_documents where participation_id=pid and lot_id is not null and not(lot_id=any(lot_ids))) or exists(select 1 from public.gare_requirements where participation_id=pid and lot_id is not null and not(lot_id=any(lot_ids))) or exists(select 1 from public.gare_tasks where participation_id=pid and lot_id is not null and not(lot_id=any(lot_ids))) or exists(select 1 from public.gare_document_requests where participation_id=pid and lot_id is not null and not(lot_id=any(lot_ids))) then raise exception 'Sono presenti documenti o verifiche riferiti a un lotto da rimuovere: revisionare prima le assegnazioni';end if;
 update public.gare_participations set stage='in_revisione' where id=pid;
 delete from public.gare_participation_lots where participation_id=pid;
 foreach l in array lot_ids loop insert into public.gare_participation_lots(company_id,participation_id,lot_id) values(p.company_id,pid,l);end loop;
end $$;

-- structured requirement import
create or replace function public.gare_apply_ai_proposals(jid uuid,requirement_ids text[],document_ids text[]) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare j public.gare_ai_jobs;r jsonb;cit jsonb;added_r int:=0;added_d int:=0;
begin
 select * into j from public.gare_ai_jobs where id=jid and status='done' and action='analizza';
 if not found then raise exception 'Analisi completata non disponibile';end if;
 if gare_private.role_for(j.company_id) not in ('admin','editor') then raise exception 'Permesso di compilazione richiesto';end if;
 for r in select * from jsonb_array_elements(coalesce(j.result->'requirements','[]')) loop
  if r->>'id'=any(requirement_ids) then
   cit:=r->'citation';
   if not coalesce((cit->>'grounded')::boolean,false) or not exists(select 1 from public.gare_documents d where d.id=(cit->>'document_id')::uuid and d.sha256=cit->>'sha256' and not exists(select 1 from public.gare_documents n where n.previous_id=d.id)) then raise exception 'Fonte non verificata o aggiornata: ripetere l’analisi';end if;
   insert into public.gare_requirements(company_id,participation_id,description,mandatory,status,evidence_id,source_document_id,source_page,source_section,source_quote,note,kind,applicability,threshold,unit,reference_period,expected_proof,ai_job_id,ai_candidate_id)
   values(j.company_id,j.participation_id,r->>'description',coalesce((r->>'mandatory')::boolean,true),'da_verificare',nullif(r->>'evidence_id','')::uuid,(cit->>'document_id')::uuid,nullif(cit->>'page','')::int,coalesce(cit->>'section','Testo estratto'),cit->>'quote','Proposta AI locale da revisionare. '||coalesce(r->>'note',''),coalesce(r->>'kind','da_classificare'),coalesce(r->>'applicability',''),coalesce(r->>'threshold',''),coalesce(r->>'unit',''),coalesce(r->>'reference_period',''),coalesce(r->>'expected_proof',''),j.id,r->>'id') on conflict(ai_job_id,ai_candidate_id) where ai_job_id is not null do nothing;
   if found then added_r:=added_r+1;end if;
  end if;
 end loop;
 for r in select * from jsonb_array_elements(coalesce(j.result->'required_documents','[]')) loop
  if r->>'id'=any(document_ids) then
   cit:=r->'citation';
   if not coalesce((cit->>'grounded')::boolean,false) or not exists(select 1 from public.gare_documents d where d.id=(cit->>'document_id')::uuid and d.sha256=cit->>'sha256' and not exists(select 1 from public.gare_documents n where n.previous_id=d.id)) then raise exception 'Fonte non verificata o aggiornata';end if;
   insert into public.gare_document_requests(company_id,participation_id,title,category,mandatory,signature_required,source_document_id,source_page,source_section,source_quote,ai_job_id,ai_candidate_id)
   values(j.company_id,j.participation_id,r->>'title',r->>'category',coalesce((r->>'mandatory')::boolean,true),coalesce((r->>'signature_required')::boolean,false),(cit->>'document_id')::uuid,nullif(cit->>'page','')::int,coalesce(cit->>'section','Testo estratto'),cit->>'quote',j.id,r->>'id') on conflict(ai_job_id,ai_candidate_id) where ai_job_id is not null do nothing;
   if found then added_d:=added_d+1;end if;
  end if;
 end loop;
 return jsonb_build_object('requirements',added_r,'documents',added_d);
end $$;

-- lot removal integrity
create function gare_private.lot_removal_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if exists(select 1 from public.gare_participations where id=old.participation_id and stage='presentata') then raise exception 'Conservare i lotti del pacchetto presentato';end if;
 if exists(select 1 from public.gare_documents d where participation_id=old.participation_id and lot_id=old.lot_id and not archived and not exists(select 1 from public.gare_documents n where n.previous_id=d.id)) or exists(select 1 from public.gare_requirements where participation_id=old.participation_id and lot_id=old.lot_id) or exists(select 1 from public.gare_tasks where participation_id=old.participation_id and lot_id=old.lot_id) or exists(select 1 from public.gare_document_requests where participation_id=old.participation_id and lot_id=old.lot_id) then raise exception 'Lotto usato da documenti o verifiche: rivedere prima gli ambiti';end if;return old;
end $$;
create trigger lot_removal_guard before delete on public.gare_participation_lots for each row execute function gare_private.lot_removal_guard();
create function gare_private.lot_removed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.gare_participations set stage='in_revisione' where id=old.participation_id and stage='pronta';return old;
end $$;
create trigger lot_removed after delete on public.gare_participation_lots for each row execute function gare_private.lot_removed();
create or replace function public.gare_select_lots(pid uuid,lot_ids uuid[],expected_revision int) returns void language plpgsql security invoker set search_path='' as $$
declare p public.gare_participations;l uuid;
begin
 select * into p from public.gare_participations where id=pid for update;
 if not found or p.revision<>expected_revision then raise exception 'Partecipazione modificata: ricaricare';end if;
 if p.stage='presentata' then raise exception 'Conservare i lotti del pacchetto presentato; registrare prima un ritiro o una revisione';end if;
 if coalesce(array_length(lot_ids,1),0)=0 then raise exception 'Selezionare almeno un lotto';end if;
 update public.gare_participations set stage='in_revisione' where id=pid;
 delete from public.gare_participation_lots where participation_id=pid and not(lot_id=any(lot_ids));
 foreach l in array lot_ids loop insert into public.gare_participation_lots(company_id,participation_id,lot_id) values(p.company_id,pid,l) on conflict do nothing;end loop;
end $$;

-- generation dependency guard
create function gare_private.document_source_guard() returns trigger language plpgsql set search_path='' as $$
declare snapshot jsonb;
begin
 if new.status<>'approvato' then return new;end if;
 if new.template_contract_id is not null then
  if not exists(select 1 from public.gare_document_contracts c join public.gare_documents d on d.id=c.source_document_id where c.id=new.template_contract_id and d.sha256=c.source_sha256 and not exists(select 1 from public.gare_documents n where n.previous_id=d.id)) then raise exception 'Modello sorgente aggiornato: rigenerare e revisionare il documento';end if;
 end if;
 if new.ai_draft_id is not null then
  select source_snapshot into snapshot from public.gare_ai_drafts where id=new.ai_draft_id;
  if exists(select 1 from jsonb_array_elements(coalesce(snapshot,'[]')) s where not exists(select 1 from public.gare_documents d where d.id=(s->>'id')::uuid and d.sha256=s->>'sha256' and not exists(select 1 from public.gare_documents n where n.previous_id=d.id))) then raise exception 'Fonti AI aggiornate: rigenerare o caricare una versione revisionata manualmente';end if;
 end if;return new;
end $$;
create trigger document_source_guard before insert or update on public.gare_documents for each row execute function gare_private.document_source_guard();

-- fact snapshots
alter table public.gare_ai_drafts add column fact_snapshot jsonb not null default '{}';
create function gare_private.draft_facts_immutable() returns trigger language plpgsql set search_path='' as $$
begin
 if new.fact_snapshot is distinct from old.fact_snapshot then raise exception 'Snapshot dei dati aziendali immutabile: generare una nuova bozza';end if;return new;
end $$;
create trigger draft_facts_immutable before update on public.gare_ai_drafts for each row execute function gare_private.draft_facts_immutable();
create function public.gare_ai_facts_current(did uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select coalesce((select d.fact_snapshot->'impresa'=c.profile and d.fact_snapshot->'gara'->>'revision'=t.revision::text and not exists(select 1 from jsonb_array_elements(coalesce(d.fact_snapshot->'evidenze','[]')) e where not exists(select 1 from public.gare_evidence v where v.id=(e->>'id')::uuid and v.revision::text=e->>'revision')) from public.gare_ai_drafts d join public.gare_participations p on p.id=d.participation_id join public.gare_tenders t on t.id=p.tender_id join public.gare_companies c on c.id=d.company_id where d.id=did),false)
$$;
revoke all on function public.gare_ai_facts_current(uuid) from public;grant execute on function public.gare_ai_facts_current(uuid) to authenticated;
create function gare_private.company_profile_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if new.id<>old.id then raise exception 'Identità impresa immutabile';end if;new.updated_at:=clock_timestamp();return new;
end $$;
create trigger company_profile_guard before update on public.gare_companies for each row execute function gare_private.company_profile_guard();
create function gare_private.company_profile_impact() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.profile is distinct from old.profile then
  update public.gare_documents set status='bozza' where company_id=new.id and category in ('amministrativa','tecnica','economica') and status='approvato';
  update public.gare_participations set stage='in_revisione' where company_id=new.id and stage='pronta';
  insert into public.gare_audit(company_id,actor,entity_type,entity_id,action,details) values(new.id,auth.uid(),'gare_companies',new.id,'UPDATE',jsonb_build_object('before',to_jsonb(old),'after',to_jsonb(new)));
 end if;return new;
end $$;
create trigger company_profile_impact after update on public.gare_companies for each row execute function gare_private.company_profile_impact();
create or replace function gare_private.document_source_guard() returns trigger language plpgsql set search_path='' as $$
declare snapshot jsonb;
begin
 if new.status<>'approvato' then return new;end if;
 if new.template_contract_id is not null then
  if not exists(select 1 from public.gare_document_contracts c join public.gare_documents d on d.id=c.source_document_id where c.id=new.template_contract_id and d.sha256=c.source_sha256 and not exists(select 1 from public.gare_documents n where n.previous_id=d.id)) then raise exception 'Modello sorgente aggiornato: rigenerare e revisionare il documento';end if;
 end if;
 if new.ai_draft_id is not null then
  if not public.gare_ai_facts_current(new.ai_draft_id) then raise exception 'Dati aziendali o di gara aggiornati: rigenerare o revisionare manualmente il file';end if;
  select source_snapshot into snapshot from public.gare_ai_drafts where id=new.ai_draft_id;
  if exists(select 1 from jsonb_array_elements(coalesce(snapshot,'[]')) s where not exists(select 1 from public.gare_documents d where d.id=(s->>'id')::uuid and d.sha256=s->>'sha256' and not exists(select 1 from public.gare_documents n where n.previous_id=d.id))) then raise exception 'Fonti AI aggiornate: rigenerare o caricare una versione revisionata manualmente';end if;
 end if;return new;
end $$;
create or replace function gare_private.export_snapshot() returns trigger language plpgsql set search_path='' as $$
declare p public.gare_participations; t public.gare_tenders;
begin
 select * into p from public.gare_participations where id=new.participation_id and company_id=new.company_id for update;
 if not found then raise exception 'Partecipazione non accessibile'; end if;
 if not new.draft and (p.stage<>'pronta' or jsonb_array_length(public.gare_blockers(p.id))>0) then raise exception 'Il pacchetto finale richiede una partecipazione pronta'; end if;
 select * into t from public.gare_tenders where id=p.tender_id;
 new.created_by:=auth.uid();
 new.manifest:=jsonb_build_object('schema_version',1,'draft',new.draft,'participation',to_jsonb(p),'tender',to_jsonb(t),
 'company_profile',(select to_jsonb(c) from public.gare_companies c where c.id=new.company_id),
 'economic_scenarios',coalesce((select jsonb_agg(to_jsonb(s)) from public.gare_economic_scenarios s where s.participation_id=p.id),'[]'::jsonb),
 'documents',coalesce((select jsonb_agg(to_jsonb(d) order by d.category,d.name) from public.gare_documents d where d.company_id=new.company_id and (d.participation_id=p.id or (d.tender_id=t.id and d.category='fonte')) and not d.archived and d.category<>'ricevuta' and not exists(select 1 from public.gare_documents newer where newer.previous_id=d.id)),'[]'::jsonb),
 'requirements',coalesce((select jsonb_agg(to_jsonb(r)) from public.gare_requirements r where r.participation_id=p.id),'[]'::jsonb),
 'lots',coalesce((select jsonb_agg(to_jsonb(l)) from public.gare_lots l join public.gare_participation_lots pl on pl.lot_id=l.id where pl.participation_id=p.id),'[]'::jsonb),
 'technical_criteria',coalesce((select jsonb_agg(to_jsonb(c)) from public.gare_technical_criteria c where c.participation_id=p.id),'[]'::jsonb),
 'evidence_files',coalesce((select jsonb_agg(to_jsonb(f)) from public.gare_evidence_files f where f.evidence_id in(select evidence_id from public.gare_requirements where participation_id=p.id union select evidence_id from public.gare_technical_criteria where participation_id=p.id) and not exists(select 1 from public.gare_evidence_files n where n.previous_id=f.id)),'[]'::jsonb),
 'evidence',coalesce((select jsonb_agg(to_jsonb(e)) from public.gare_evidence e where e.id in(select evidence_id from public.gare_requirements where participation_id=p.id)),'[]'::jsonb));
 return new;
end $$;

-- fact dependency coverage
create or replace function public.gare_ai_facts_current(did uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select coalesce((select d.fact_snapshot->'impresa'=c.profile and d.fact_snapshot->'gara'->>'revision'=t.revision::text and not exists(select 1 from jsonb_array_elements(coalesce(d.fact_snapshot->'evidenze','[]')) e where not exists(select 1 from public.gare_evidence v where v.id=(e->>'id')::uuid and v.revision::text=e->>'revision')) and not exists(select 1 from jsonb_array_elements(coalesce(d.fact_snapshot->'criteri_tecnici_registrati','[]')) e where not exists(select 1 from public.gare_technical_criteria v where v.id=(e->>'id')::uuid and v.revision::text=e->>'revision')) and not exists(select 1 from jsonb_array_elements(coalesce(d.fact_snapshot->'scenari_economici_da_verificare','[]')) e where not exists(select 1 from public.gare_economic_scenarios v where v.id=(e->>'id')::uuid and v.revision::text=e->>'revision')) from public.gare_ai_drafts d join public.gare_participations p on p.id=d.participation_id join public.gare_tenders t on t.id=p.tender_id join public.gare_companies c on c.id=d.company_id where d.id=did),false)
$$;

-- guided journey
-- Local pilot only. Existing participations keep the legacy readiness rules until
-- their editor explicitly activates the guided journey.
create table public.gare_journeys (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.gare_companies(id),
 participation_id uuid not null unique references public.gare_participations(id),
 configuration jsonb not null default '{}', confirmations jsonb not null default '{}',
 selected_document_ids uuid[] not null default '{}', extras jsonb not null default '[]',
 revision int not null default 1, created_by uuid references auth.users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.gare_company_facts (
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.gare_companies(id),
 key text not null, label text not null,value text not null,source text not null,
 verified_on date not null,expires_on date,status text not null default 'in_verifica' check(status in('in_verifica','confermato','non_applicabile')),
 revision int not null default 1,created_by uuid references auth.users(id),updated_at timestamptz not null default now(),
 unique(company_id,key),check(length(key) between 1 and 120),check(length(source)>=3)
);
create table public.gare_communications (
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.gare_companies(id),
 participation_id uuid not null references public.gare_participations(id),lot_id uuid references public.gare_lots(id),
 kind text not null check(kind in('chiarimento','rettifica','integrazione','comunicazione','esito','ritiro')),
 title text not null,body text not null default '',source_document_id uuid references public.gare_documents(id),
 due_date date,due_time time,responsible text not null,status text not null default 'aperta' check(status in('aperta','in_attesa','chiusa')),
 blocking boolean not null default false,reply text not null default '',revision int not null default 1,
 created_by uuid references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.gare_technical_library (
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.gare_companies(id),
 title text not null,tags text not null default '',body text not null,evidence_ids uuid[] not null default '{}',
 status text not null default 'bozza' check(status in('bozza','approvato')),review_note text not null default '',
 reviewed_by uuid references auth.users(id),revision int not null default 1,created_by uuid references auth.users(id),updated_at timestamptz not null default now()
);
create table public.gare_submission_lots (
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.gare_companies(id),
 participation_id uuid not null references public.gare_participations(id),submission_id uuid not null references public.gare_submissions(id),
 lot_id uuid not null references public.gare_lots(id),phase text not null check(phase in('interesse','offerta','iscrizione')),
 state text not null default 'dichiarata' check(state in('dichiarata','con_ricevuta','ritirata','sostituita')),
 reason text not null default '',revision int not null default 1,created_by uuid references auth.users(id),updated_at timestamptz not null default now(),
 unique(submission_id,lot_id)
);
create index gare_journeys_company on public.gare_journeys(company_id);
create index gare_facts_company on public.gare_company_facts(company_id);
create index gare_comms_participation on public.gare_communications(company_id,participation_id);
create index gare_library_company on public.gare_technical_library(company_id);
create index gare_submission_lots_participation on public.gare_submission_lots(company_id,participation_id,lot_id);
create index gare_submission_lots_submission on public.gare_submission_lots(submission_id);
create index gare_submission_lots_lot on public.gare_submission_lots(lot_id);
create index gare_comms_document on public.gare_communications(source_document_id);
create index gare_comms_lot on public.gare_communications(lot_id);

do $$ declare tab text;begin
 foreach tab in array array['gare_journeys','gare_company_facts','gare_communications','gare_technical_library','gare_submission_lots'] loop
  execute format('alter table public.%I enable row level security',tab);
  execute format('create policy member_read on public.%I for select to authenticated using (gare_private.role_for(company_id) is not null)',tab);
  execute format('create policy editor_insert on public.%I for insert to authenticated with check (gare_private.role_for(company_id) in (''admin'',''editor''))',tab);
  execute format('create policy editor_update on public.%I for update to authenticated using (gare_private.role_for(company_id) in (''admin'',''editor'')) with check (gare_private.role_for(company_id) in (''admin'',''editor''))',tab);
  execute format('grant select,insert,update on public.%I to authenticated',tab);
 end loop;
end $$;
create policy reviewer_library on public.gare_technical_library for update to authenticated using(gare_private.role_for(company_id)='reviewer') with check(gare_private.role_for(company_id)='reviewer');

create function gare_private.guided_guard() returns trigger language plpgsql set search_path='' as $$
declare pid uuid;tid uuid;ref uuid; config jsonb;
begin
 if TG_OP='UPDATE' then
  if new.company_id<>old.company_id or new.id<>old.id then raise exception 'Azienda e identità immutabili';end if;
  new.revision:=old.revision+1;
 else new.created_by:=auth.uid();new.revision:=1;end if;
 new.updated_at:=clock_timestamp();
 if TG_TABLE_NAME in('gare_journeys','gare_communications','gare_submission_lots') then
  pid:=new.participation_id;
  if TG_OP='UPDATE' and new.participation_id<>old.participation_id then raise exception 'Fascicolo immutabile';end if;
  select tender_id into tid from public.gare_participations where id=pid and company_id=new.company_id;
  if not found then raise exception 'Fascicolo non accessibile';end if;
 end if;
 if TG_TABLE_NAME='gare_journeys' then
  if jsonb_typeof(new.configuration)<>'object' or jsonb_typeof(new.confirmations)<>'object' or jsonb_typeof(new.extras)<>'array' or octet_length(new.configuration::text||new.confirmations::text||new.extras::text)>400000 then raise exception 'Piano non valido o troppo esteso';end if;
  config:=new.configuration;
  if coalesce(config->>'kind','') not in('gara_aperta','invito','manifestazione','albo') or coalesce(config->>'platform','') not in('da_verificare','acquistinrete','sintel','sater','altro') or coalesce(config->>'form','') not in('singola','rti','consorzio','avvalimento','subappalto') then raise exception 'Confermare tipo, piattaforma e forma della partecipazione';end if;
  if coalesce(config->>'phase','') not in('interesse','offerta','iscrizione') then raise exception 'Fase non valida';end if;
  foreach ref in array new.selected_document_ids loop
   if not exists(select 1 from public.gare_documents d where d.id=ref and d.company_id=new.company_id and d.participation_id=pid and d.category in('amministrativa','tecnica','economica')) then raise exception 'Documento di consegna di un altro fascicolo';end if;
  end loop;
 end if;
 if TG_TABLE_NAME='gare_company_facts' then
  if length(trim(new.label))<2 or length(trim(new.value))<1 then raise exception 'Indicare etichetta e valore del dato';end if;
  if new.status='confermato' and new.verified_on>(now() at time zone 'Europe/Rome')::date then raise exception 'Data di conferma futura';end if;
 end if;
 if TG_TABLE_NAME='gare_communications' then
  if length(trim(new.title))<3 or length(trim(new.responsible))<2 then raise exception 'Indicare oggetto e responsabile';end if;
  if new.lot_id is not null and not exists(select 1 from public.gare_participation_lots where participation_id=pid and lot_id=new.lot_id) then raise exception 'Lotto non selezionato';end if;
  if new.source_document_id is not null and not exists(select 1 from public.gare_documents where id=new.source_document_id and company_id=new.company_id and tender_id=tid) then raise exception 'Allegato di un’altra gara';end if;
  if new.status='chiusa' and length(trim(new.reply))<5 then raise exception 'Registrare la risposta o la motivazione di chiusura';end if;
 end if;
 if TG_TABLE_NAME='gare_technical_library' then
  foreach ref in array new.evidence_ids loop
   if not exists(select 1 from public.gare_evidence where id=ref and company_id=new.company_id) then raise exception 'Evidenza di un’altra impresa';end if;
  end loop;
  if TG_OP='UPDATE' then
   if gare_private.role_for(new.company_id)='reviewer' and (to_jsonb(new)-array['status','review_note','reviewed_by','revision','updated_at']) is distinct from (to_jsonb(old)-array['status','review_note','reviewed_by','revision','updated_at']) then raise exception 'Il revisore può solo revisionare la sezione';end if;
   if (new.title,new.tags,new.body,new.evidence_ids) is distinct from (old.title,old.tags,old.body,old.evidence_ids) then new.status:='bozza';end if;
  end if;
  if new.status='approvato' then
   if gare_private.role_for(new.company_id) not in('admin','reviewer') or length(trim(new.review_note))<5 then raise exception 'Revisione motivata richiesta';end if;
   new.reviewed_by:=auth.uid();
  else new.reviewed_by:=null;end if;
 end if;
 if TG_TABLE_NAME='gare_submission_lots' then
  if not exists(select 1 from public.gare_submissions where id=new.submission_id and participation_id=pid and company_id=new.company_id) or not exists(select 1 from public.gare_participation_lots where participation_id=pid and lot_id=new.lot_id) then raise exception 'Presentazione o lotto non coerente';end if;
  if TG_OP='UPDATE' and (new.submission_id,new.lot_id,new.phase) is distinct from(old.submission_id,old.lot_id,old.phase) then raise exception 'Ambito della presentazione immutabile';end if;
  if new.state in('ritirata','sostituita') and length(trim(new.reason))<5 then raise exception 'Motivare il ritiro o la sostituzione';end if;
 end if;
 return new;
end $$;
do $$ declare tab text;begin
 foreach tab in array array['gare_journeys','gare_company_facts','gare_communications','gare_technical_library','gare_submission_lots'] loop
  execute format('create trigger guided_guard before insert or update on public.%I for each row execute function gare_private.guided_guard()',tab);
  execute format('create trigger audit after insert or update on public.%I for each row execute function gare_private.audit_change()',tab);
 end loop;
end $$;

alter function public.gare_blockers(uuid) rename to gare_legacy_blockers;
create function public.gare_blockers(pid uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare j public.gare_journeys;result jsonb:='[]'::jsonb;msg text;doc record;extra jsonb;kind text;source jsonb;
begin
 select * into j from public.gare_journeys where participation_id=pid;
 if not found then return public.gare_legacy_blockers(pid);end if;
 kind:=j.configuration->>'kind';
 for msg in select jsonb_array_elements_text(public.gare_legacy_blockers(pid)) loop
  if msg like 'Documento da completare:%' or msg like 'Dati obbligatori da completare nella bozza:%' or msg='Caricare almeno un documento di offerta' then continue;end if;
  if kind in('manifestazione','albo') and msg in('Acquisire il disciplinare','Registrare e revisionare i requisiti della gara','Definire la checklist dei documenti richiesti dalla gara') then continue;end if;
  if kind='albo' and coalesce((j.configuration->>'rolling')::boolean,false) and msg='Verificare data e ora ufficiali di presentazione' then continue;end if;
  result:=result||jsonb_build_array(msg);
 end loop;
 if not coalesce((j.configuration->>'plan_confirmed')::boolean,false) then result:=result||jsonb_build_array('Confermare il piano e le istruzioni della procedura');end if;
 if length(trim(coalesce(j.configuration->>'review_note','')))<5 then result:=result||jsonb_build_array('Motivare la verifica delle istruzioni e del perimetro del piano');end if;
 if not exists(select 1 from public.gare_documents d join public.gare_participations p on p.tender_id=d.tender_id where p.id=pid and d.category='fonte' and not d.archived) then result:=result||jsonb_build_array('Acquisire gli originali della procedura');end if;
 for source in select * from jsonb_array_elements(coalesce(j.configuration->'source_snapshot','[]')) loop
  if not exists(select 1 from public.gare_documents d where d.id=(source->>'id')::uuid and d.sha256=source->>'sha256' and not exists(select 1 from public.gare_documents n where n.previous_id=d.id)) then result:=result||jsonb_build_array('Fonti cambiate: riconfermare il piano sulle versioni correnti');exit;end if;
 end loop;
 if cardinality(j.selected_document_ids)=0 then result:=result||jsonb_build_array('Scegliere almeno un documento definitivo da consegnare');end if;
 for doc in select * from public.gare_documents where id=any(j.selected_document_ids) loop
  if doc.archived or doc.status<>'approvato' or doc.unresolved_fields>0 or (doc.signature_required and not doc.signature_declared) or exists(select 1 from public.gare_documents n where n.previous_id=doc.id) then result:=result||jsonb_build_array('Documento scelto da completare o sostituire: '||doc.name);end if;
 end loop;
 for doc in select * from public.gare_document_requests where participation_id=pid and mandatory loop
  if doc.fulfilled_by is null or not(doc.fulfilled_by=any(j.selected_document_ids)) then result:=result||jsonb_build_array('Scegliere per la consegna il documento richiesto: '||doc.title);end if;
 end loop;
 for extra in select * from jsonb_array_elements(j.extras) loop
  if coalesce((extra->>'mandatory')::boolean,true) and coalesce(extra->>'stage','preparazione') not in('portale','esito') and coalesce(j.confirmations->(extra->>'id')->>'status','todo') not in('done','na') then result:=result||jsonb_build_array('Passaggio del piano aperto: '||(extra->>'title'));end if;
 end loop;
 for doc in select * from public.gare_communications where participation_id=pid and blocking and status<>'chiusa' loop result:=result||jsonb_build_array('Comunicazione da gestire: '||doc.title);end loop;
 return result;
end $$;
revoke all on function public.gare_blockers(uuid) from public;grant execute on function public.gare_blockers(uuid) to authenticated;

create function gare_private.reopen_guided() returns trigger language plpgsql set search_path='' as $$
begin
 if jsonb_array_length(public.gare_blockers(new.participation_id))>0 then update public.gare_participations set stage='in_revisione' where id=new.participation_id and stage='pronta';end if;
 return new;
end $$;
create trigger reopen_guided after insert or update on public.gare_journeys for each row execute function gare_private.reopen_guided();
create trigger reopen_guided after insert or update on public.gare_communications for each row execute function gare_private.reopen_guided();

-- Export only selected deliverables for explicitly guided participations. Legacy
-- manifests and all previously exported snapshots remain untouched.
create function gare_private.guided_export() returns trigger language plpgsql set search_path='' as $$
declare j public.gare_journeys;
begin
 select * into j from public.gare_journeys where participation_id=new.participation_id;
 if found then
  new.manifest:=jsonb_set(new.manifest,'{documents}',coalesce((select jsonb_agg(d.value) from jsonb_array_elements(new.manifest->'documents') d(value) where d.value->>'category'='fonte' or (d.value->>'id')::uuid=any(j.selected_document_ids)),'[]'));
  new.manifest:=new.manifest||jsonb_build_object('guided_journey',to_jsonb(j));
 end if;return new;
end $$;
create trigger zz_guided_export before insert on public.gare_exports for each row execute function gare_private.guided_export();

create function public.gare_record_guided_submission(pid uuid,package_id uuid,lot_ids uuid[],receipt uuid,submitted timestamptz,reference text,expected_revision int) returns uuid language plpgsql security invoker set search_path='' as $$
declare p public.gare_participations;j public.gare_journeys;sid uuid;lot uuid;extra jsonb;phase_name text;
begin
 select * into p from public.gare_participations where id=pid for update;
 if not found or p.revision<>expected_revision then raise exception 'Fascicolo cambiato: ricaricare i dati';end if;
 select * into j from public.gare_journeys where participation_id=pid for update;
 if not found or coalesce(cardinality(lot_ids),0)=0 then raise exception 'Confermare la guida e almeno un lotto';end if;
 if jsonb_array_length(public.gare_blockers(pid))>0 then raise exception 'Completare i controlli del fascicolo';end if;
 if j.configuration->>'platform'='da_verificare' or not coalesce((j.confirmations->'portal_access'->>'status')='done',false) then raise exception 'Confermare accesso e istruzioni del portale';end if;
 for extra in select * from jsonb_array_elements(j.extras) loop
  if extra->>'stage'='portale' and coalesce((extra->>'mandatory')::boolean,true) and coalesce(j.confirmations->(extra->>'id')->>'status','todo') not in('done','na') then raise exception 'Completare il passaggio sul portale: %',extra->>'title';end if;
 end loop;
 if not exists(select 1 from public.gare_exports e where e.id=package_id and e.participation_id=pid and not e.draft and e.manifest->'guided_journey'->'selected_document_ids'=to_jsonb(j.selected_document_ids)) then raise exception 'Scegliere un pacchetto finale coerente con i documenti di consegna';end if;
 foreach lot in array lot_ids loop if not exists(select 1 from public.gare_participation_lots where participation_id=pid and lot_id=lot) then raise exception 'Lotto non selezionato';end if;end loop;
 insert into public.gare_submissions(company_id,participation_id,export_id,receipt_id,submitted_at,protocol) values(p.company_id,pid,package_id,receipt,submitted,reference) returning id into sid;
 phase_name:=j.configuration->>'phase';
 foreach lot in array lot_ids loop
  update public.gare_submission_lots set state='sostituita',reason='Nuova presentazione dichiarata: '||sid::text where participation_id=pid and lot_id=lot and gare_submission_lots.phase=phase_name and state in('dichiarata','con_ricevuta');
  insert into public.gare_submission_lots(company_id,participation_id,submission_id,lot_id,phase,state) values(p.company_id,pid,sid,lot,phase_name,case when receipt is null then 'dichiarata' else 'con_ricevuta' end);
 end loop;
 if not exists(select 1 from public.gare_participation_lots l where l.participation_id=pid and not exists(select 1 from public.gare_submission_lots s where s.participation_id=pid and s.lot_id=l.lot_id and s.phase=phase_name and s.state in('dichiarata','con_ricevuta'))) then update public.gare_participations set stage='presentata' where id=pid;end if;
 return sid;
end $$;
revoke all on function public.gare_record_guided_submission(uuid,uuid,uuid[],uuid,timestamptz,text,int) from public;
grant execute on function public.gare_record_guided_submission(uuid,uuid,uuid[],uuid,timestamptz,text,int) to authenticated;

-- guided journey integrity
-- Scope, dependencies and readiness are enforced in Postgres as well as the UI.
alter table public.gare_submission_lots add column receipt_id uuid references public.gare_documents(id);
create index gare_submission_lots_receipt on public.gare_submission_lots(receipt_id);

create function gare_private.guided_item_done(j public.gare_journeys,item_id text,depth int default 0) returns boolean language plpgsql stable set search_path='' as $$
declare answer jsonb;extra jsonb;dependency text;doc uuid;
begin
 if depth>30 then return false;end if;
 if item_id='plan' then return coalesce((j.configuration->>'plan_confirmed')::boolean,false);end if;
 if item_id='decision' then return exists(select 1 from public.gare_participations where id=j.participation_id and decision='partecipa');end if;
 if item_id='delivery' then return cardinality(j.selected_document_ids)>0;end if;
 if item_id='sources' then return exists(select 1 from public.gare_documents d join public.gare_participations p on p.tender_id=d.tender_id where p.id=j.participation_id and d.category='fonte' and not d.archived);end if;
 if item_id like 'task:%' then return exists(select 1 from public.gare_tasks where id=substring(item_id,6)::uuid and participation_id=j.participation_id and completed);end if;
 if item_id like 'requirement:%' then return exists(select 1 from public.gare_requirements where id=substring(item_id,13)::uuid and participation_id=j.participation_id and status in('compatibile','non_applicabile') and reviewed_by is not null);end if;
 if item_id like 'request:%' then return exists(select 1 from public.gare_document_requests r join public.gare_documents d on d.id=r.fulfilled_by where r.id=substring(item_id,9)::uuid and r.participation_id=j.participation_id and d.id=any(j.selected_document_ids) and d.status='approvato' and not d.archived);end if;
 if item_id like 'party:%' then return exists(select 1 from jsonb_array_elements(j.configuration->'parties') p where p->>'id'=substring(item_id,7) and p->>'confirmed'='true' and length(trim(p->>'signer'))>0 and length(trim(p->>'power_source'))>0);end if;
 answer:=j.confirmations->item_id;
 if coalesce(answer->>'status','todo') not in('done','na') or length(trim(coalesce(answer->>'note','')))<5 then return false;end if;
 if answer->>'status'='na' then return true;end if;
 select value into extra from jsonb_array_elements(j.extras) where value->>'id'=item_id;
 if extra is not null then
  for dependency in select jsonb_array_elements_text(coalesce(extra->'depends_on','[]')) loop
   if not gare_private.guided_item_done(j,dependency,depth+1) then return false;end if;
  end loop;
  if extra->>'kind'='document' then
   doc:=nullif(answer->>'document_id','')::uuid;
   if doc is null or not(doc=any(j.selected_document_ids)) or not exists(select 1 from public.gare_documents where id=doc and participation_id=j.participation_id and status='approvato' and not archived and unresolved_fields=0 and (not signature_required or signature_declared) and not exists(select 1 from public.gare_documents n where n.previous_id=doc)) then return false;end if;
  end if;
 end if;
 return true;
end $$;

create function gare_private.guided_scope_guard() returns trigger language plpgsql set search_path='' as $$
declare v jsonb;party jsonb;ref text;tid uuid;ids text[]:='{}';
begin
 if TG_TABLE_NAME='gare_journeys' then
  select tender_id into tid from public.gare_participations where id=new.participation_id;
  if jsonb_typeof(new.configuration->'parties') is distinct from 'array' or jsonb_array_length(new.configuration->'parties') not between 1 and 50 or jsonb_array_length(new.extras)>200 or jsonb_typeof(new.configuration->'source_snapshot') is distinct from 'array' then raise exception 'Soggetti o numero di passaggi non validi';end if;
  if new.configuration->>'portal_url'<>'' and new.configuration->>'portal_url'!~'^https?://' then raise exception 'Indirizzo del portale non valido';end if;
  for party in select jsonb_array_elements(new.configuration->'parties') loop
   if length(trim(coalesce(party->>'id','')))=0 or (party->>'id')=any(ids) then raise exception 'Identità dei soggetti non valida';end if;ids:=array_append(ids,party->>'id');
   for ref in select jsonb_array_elements_text(coalesce(party->'lot_ids','[]')) loop
    if not exists(select 1 from public.gare_participation_lots where participation_id=new.participation_id and lot_id=ref::uuid) then raise exception 'Ambito del soggetto: lotto non selezionato';end if;
   end loop;
  end loop;
  ids:='{}';
  for v in select jsonb_array_elements(new.extras) loop
   if length(trim(coalesce(v->>'id','')))=0 or (v->>'id')=any(ids) or v->>'id' in('plan','decision','delivery','sources','portal_access') or v->>'id' like '%:%' then raise exception 'Identità del passaggio non valida';end if;ids:=array_append(ids,v->>'id');
   if v->>'stage' not in('valutazione','preparazione','portale','esito') or v->>'kind' not in('manual','document') or length(trim(coalesce(v->>'title','')))<3 then raise exception 'Passaggio incompleto';end if;
   if nullif(v->>'lot_id','') is not null and not exists(select 1 from public.gare_participation_lots where participation_id=new.participation_id and lot_id=(v->>'lot_id')::uuid) then raise exception 'Passaggio su lotto non selezionato';end if;
   if nullif(v->>'party_id','') is not null and not exists(select 1 from jsonb_array_elements(new.configuration->'parties') p where p->>'id'=v->>'party_id') then raise exception 'Soggetto del passaggio non presente';end if;
   if nullif(v->>'source_document_id','') is not null and not exists(select 1 from public.gare_documents where id=(v->>'source_document_id')::uuid and tender_id=tid and company_id=new.company_id) then raise exception 'Fonte di un’altra gara';end if;
  end loop;
  for ref,v in select * from jsonb_each(new.confirmations) loop
   if coalesce(v->>'status','') not in('todo','waiting','done','na') then raise exception 'Stato della verifica non valido';end if;
   if nullif(v->>'document_id','') is not null and not exists(select 1 from public.gare_documents where id=(v->>'document_id')::uuid and participation_id=new.participation_id and company_id=new.company_id) then raise exception 'Prova di un altro fascicolo';end if;
  end loop;
 end if;
 if TG_TABLE_NAME='gare_submission_lots' then
  if new.receipt_id is not null and not exists(select 1 from public.gare_documents where id=new.receipt_id and participation_id=new.participation_id and category='ricevuta') then raise exception 'Ricevuta di un altro fascicolo';end if;
  if new.state='con_ricevuta' and new.receipt_id is null and not exists(select 1 from public.gare_submissions where id=new.submission_id and receipt_id is not null) then raise exception 'Acquisire una ricevuta';end if;
  if TG_OP='UPDATE' and old.state in('ritirata','sostituita') and new.state<>old.state then raise exception 'Tentativo chiuso: registrare una nuova presentazione';end if;
 end if;
 return new;
end $$;
create trigger scope_guard before insert or update on public.gare_journeys for each row execute function gare_private.guided_scope_guard();
create trigger scope_guard before insert or update on public.gare_submission_lots for each row execute function gare_private.guided_scope_guard();

alter function public.gare_blockers(uuid) rename to gare_guided_base_blockers;
create function public.gare_blockers(pid uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare j public.gare_journeys;result jsonb;v jsonb;tid uuid;
begin
 select * into j from public.gare_journeys where participation_id=pid;
 result:=public.gare_guided_base_blockers(pid);if not found then return result;end if;
 select tender_id into tid from public.gare_participations where id=pid;
 if exists(select 1 from public.gare_documents d where d.tender_id=tid and d.category='fonte' and not d.archived and not exists(select 1 from public.gare_documents n where n.previous_id=d.id) and not exists(select 1 from jsonb_array_elements(j.configuration->'source_snapshot') s where s->>'id'=d.id::text and s->>'sha256'=d.sha256)) then result:=result||jsonb_build_array('Inventario delle fonti cambiato: rivedere e riconfermare il piano');end if;
 if jsonb_array_length(j.configuration->'parties')=0 then result:=result||jsonb_build_array('Definire i soggetti della partecipazione');end if;
 if j.configuration->>'form' in('rti','avvalimento') and jsonb_array_length(j.configuration->'parties')<2 then result:=result||jsonb_build_array('Completare i soggetti e gli adempimenti della forma aggregata');end if;
 for v in select jsonb_array_elements(j.configuration->'parties') loop
  if not gare_private.guided_item_done(j,'party:'||(v->>'id')) or length(trim(coalesce(v->>'tax_id','')))=0 then result:=result||jsonb_build_array('Verificare dati, firmatario e poteri del soggetto: '||(v->>'name'));end if;
 end loop;
 for v in select jsonb_array_elements(j.extras) loop
  if v->>'stage' in('valutazione','preparazione') and coalesce((v->>'mandatory')::boolean,true) and not gare_private.guided_item_done(j,v->>'id') then result:=result||jsonb_build_array('Completare passaggio, dipendenze e prova: '||(v->>'title'));end if;
 end loop;
 -- Deduplicate messages without losing their order.
 return coalesce((select jsonb_agg(to_jsonb(msg) order by ord) from(select msg,min(ord) ord from jsonb_array_elements_text(result) with ordinality a(msg,ord) group by msg) a),'[]');
end $$;
revoke all on function public.gare_blockers(uuid) from public;grant execute on function public.gare_blockers(uuid) to authenticated;

create function gare_private.guided_submission_guard() returns trigger language plpgsql set search_path='' as $$
declare j public.gare_journeys;v jsonb;
begin
 select * into j from public.gare_journeys where participation_id=new.participation_id;
 if found then
  if jsonb_array_length(public.gare_blockers(new.participation_id))>0 or j.configuration->>'platform'='da_verificare' or not gare_private.guided_item_done(j,'portal_access') or j.confirmations->'portal_access'->>'status'<>'done' then raise exception 'Completare preparazione e verifiche del portale';end if;
  for v in select jsonb_array_elements(j.extras) loop
   if v->>'stage'='portale' and coalesce((v->>'mandatory')::boolean,true) and not gare_private.guided_item_done(j,v->>'id') then raise exception 'Passaggio del portale incompleto: %',v->>'title';end if;
  end loop;
  if not exists(select 1 from public.gare_exports e where e.id=new.export_id and not e.draft and e.manifest->'guided_journey'->'selected_document_ids'=to_jsonb(j.selected_document_ids) and e.manifest->'guided_journey'->'configuration'=j.configuration) then raise exception 'Il piano o i documenti sono cambiati: esportare un nuovo pacchetto finale';end if;
 end if;
 return new;
end $$;
create trigger guided_submission_guard before insert on public.gare_submissions for each row execute function gare_private.guided_submission_guard();

alter function public.gare_record_submission(uuid,uuid,uuid,timestamptz,text,int) rename to gare_record_legacy_submission;
create function public.gare_record_submission(pid uuid,package_id uuid,receipt uuid,submitted timestamptz,reference text,expected_revision int) returns uuid language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from public.gare_journeys where participation_id=pid) then raise exception 'Per il percorso guidato selezionare i lotti della presentazione';end if;
 return public.gare_record_legacy_submission(pid,package_id,receipt,submitted,reference,expected_revision);
end $$;
revoke all on function public.gare_record_submission(uuid,uuid,uuid,timestamptz,text,int) from public;grant execute on function public.gare_record_submission(uuid,uuid,uuid,timestamptz,text,int) to authenticated;

create function gare_private.guided_participation_guard() returns trigger language plpgsql set search_path='' as $$
declare j public.gare_journeys;
begin
 select * into j from public.gare_journeys where participation_id=new.id;
 if found and new.stage='presentata' and exists(select 1 from public.gare_participation_lots l where l.participation_id=new.id and not exists(select 1 from public.gare_submission_lots s where s.participation_id=new.id and s.lot_id=l.lot_id and s.phase=j.configuration->>'phase' and s.state in('dichiarata','con_ricevuta'))) then raise exception 'La presentazione non copre tutti i lotti selezionati nella fase corrente';end if;
 if found and new.stage='esito' and (exists(select 1 from public.gare_communications where participation_id=new.id and blocking and status<>'chiusa') or exists(select 1 from jsonb_array_elements(j.extras) e where e->>'stage'='esito' and coalesce((e->>'mandatory')::boolean,true) and not gare_private.guided_item_done(j,e->>'id'))) then raise exception 'Completare richieste e adempimenti prima della chiusura';end if;
 return new;
end $$;
create trigger guided_participation_guard before update on public.gare_participations for each row execute function gare_private.guided_participation_guard();
create function gare_private.guided_withdrawal() returns trigger language plpgsql set search_path='' as $$
begin
 if new.state in('ritirata','sostituita') and old.state not in('ritirata','sostituita') then update public.gare_participations set stage='in_revisione' where id=new.participation_id and stage='presentata';end if;
 return new;
end $$;
create trigger withdrawal after update on public.gare_submission_lots for each row execute function gare_private.guided_withdrawal();

-- guided generation dependencies
-- New facts affect only drafts that actually reused them. Commercial preferences
-- are not legal/company declarations and do not invalidate approved documents.
create or replace function gare_private.company_profile_impact() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.profile is distinct from old.profile then
  if (new.profile-array['gare_worktags','gare_territories','gare_amount_min','gare_amount_max','gare_qualifications']) is distinct from (old.profile-array['gare_worktags','gare_territories','gare_amount_min','gare_amount_max','gare_qualifications']) then
   update public.gare_documents set status='bozza' where company_id=new.id and category in('amministrativa','tecnica','economica') and status='approvato';
   update public.gare_participations set stage='in_revisione' where company_id=new.id and stage='pronta';
  end if;
  insert into public.gare_audit(company_id,actor,entity_type,entity_id,action,details) values(new.id,auth.uid(),'gare_companies',new.id,'UPDATE',jsonb_build_object('before',to_jsonb(old),'after',to_jsonb(new)));
 end if;return new;
end $$;
create or replace function public.gare_ai_facts_current(did uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select coalesce((select
 ((d.fact_snapshot->'impresa')-array['gare_worktags','gare_territories','gare_amount_min','gare_amount_max','gare_qualifications'])=(c.profile-array['gare_worktags','gare_territories','gare_amount_min','gare_amount_max','gare_qualifications'])
 and d.fact_snapshot->'gara'->>'revision'=t.revision::text
 and not exists(select 1 from jsonb_array_elements(coalesce(d.fact_snapshot->'evidenze','[]')) e where not exists(select 1 from public.gare_evidence v where v.id=(e->>'id')::uuid and v.revision::text=e->>'revision'))
 and not exists(select 1 from jsonb_array_elements(coalesce(d.fact_snapshot->'criteri_tecnici_registrati','[]')) e where not exists(select 1 from public.gare_technical_criteria v where v.id=(e->>'id')::uuid and v.revision::text=e->>'revision'))
 and not exists(select 1 from jsonb_array_elements(coalesce(d.fact_snapshot->'scenari_economici_da_verificare','[]')) e where not exists(select 1 from public.gare_economic_scenarios v where v.id=(e->>'id')::uuid and v.revision::text=e->>'revision'))
 and not exists(select 1 from jsonb_array_elements(coalesce(d.fact_snapshot->'dati_riutilizzabili','[]')) f where not exists(select 1 from public.gare_company_facts v where v.id=(f->>'id')::uuid and v.revision::text=f->>'revision' and v.status='confermato' and v.verified_on<=(now() at time zone 'Europe/Rome')::date and(v.expires_on is null or v.expires_on>=(now() at time zone 'Europe/Rome')::date)))
 and (coalesce(d.fact_snapshot->'perimetro','null')='null'::jsonb or exists(select 1 from public.gare_journeys j where j.participation_id=p.id and d.fact_snapshot->'perimetro'=jsonb_build_object('kind',j.configuration->'kind','phase',j.configuration->'phase','form',j.configuration->'form','parties',j.configuration->'parties')))
 from public.gare_ai_drafts d join public.gare_participations p on p.id=d.participation_id join public.gare_tenders t on t.id=p.tender_id join public.gare_companies c on c.id=d.company_id where d.id=did),false)
$$;
create function gare_private.reused_facts_current(snapshot jsonb) returns boolean language sql stable set search_path='' as $$
 select not exists(select 1 from jsonb_array_elements(coalesce(snapshot->'reusable_facts','[]')) f where not exists(select 1 from public.gare_company_facts v where v.id=(f->>'id')::uuid and v.revision::text=f->>'revision' and v.status='confermato' and v.verified_on<=(now() at time zone 'Europe/Rome')::date and (v.expires_on is null or v.expires_on>=(now() at time zone 'Europe/Rome')::date)))
$$;
create function gare_private.reused_facts_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if new.status='approvato' and not gare_private.reused_facts_current(new.generation_snapshot) then raise exception 'Dato riutilizzato cambiato o scaduto: rigenerare o caricare una versione revisionata';end if;return new;
end $$;
create trigger reused_facts_guard before insert or update on public.gare_documents for each row execute function gare_private.reused_facts_guard();
create function gare_private.reused_fact_impact() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.gare_documents d set status='bozza' where d.company_id=new.company_id and d.status='approvato' and(exists(select 1 from jsonb_array_elements(coalesce(d.generation_snapshot->'reusable_facts','[]')) f where f->>'id'=new.id::text) or exists(select 1 from public.gare_ai_drafts a,jsonb_array_elements(coalesce(a.fact_snapshot->'dati_riutilizzabili','[]')) f where a.id=d.ai_draft_id and f->>'id'=new.id::text));
 return new;
end $$;
create trigger reused_fact_impact after update on public.gare_company_facts for each row execute function gare_private.reused_fact_impact();
-- Readiness checks expiry at read time too (there may be no update at midnight).
create function gare_private.guided_fact_export_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if not new.draft and exists(select 1 from jsonb_array_elements(new.manifest->'documents') d where not gare_private.reused_facts_current(d->'generation_snapshot')) then raise exception 'Dati riutilizzati scaduti o cambiati: rivedere la consegna';end if;return new;
end $$;
create trigger zzz_guided_fact_export_guard before insert on public.gare_exports for each row execute function gare_private.guided_fact_export_guard();
-- Preserve the lots referenced in the guided plan and submission history.
create function gare_private.guided_lot_removal_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if exists(select 1 from public.gare_submission_lots where participation_id=old.participation_id and lot_id=old.lot_id) or exists(select 1 from public.gare_communications where participation_id=old.participation_id and lot_id=old.lot_id) or exists(select 1 from public.gare_journeys j,jsonb_array_elements(j.extras) e where j.participation_id=old.participation_id and e->>'lot_id'=old.lot_id::text) or exists(select 1 from public.gare_journeys j,jsonb_array_elements(j.configuration->'parties') p,jsonb_array_elements_text(p->'lot_ids') l where j.participation_id=old.participation_id and l=old.lot_id::text) then raise exception 'Lotto usato dal piano o dalle presentazioni: conservarne lo storico o rivedere gli ambiti';end if;return old;
end $$;
create trigger guided_lot_removal_guard before delete on public.gare_participation_lots for each row execute function gare_private.guided_lot_removal_guard();
-- The isolated local service performs fixture cleanup and authenticated worker
-- operations; it already has BYPASSRLS but needs schema lookup for trigger calls.
grant usage on schema gare_private to service_role;
create function gare_private.ai_negative_obligation_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if new.ai_job_id is not null and new.source_quote ~* '(non[[:space:]]+(è|e|sono|sarà|saranno)[[:space:]]+(richiest[oaie]|previst[oaie]|necessari[oaie]|obbligatori[oaie])|non[[:space:]]+si[[:space:]]+(richied|preved)|nessun(a)?[[:space:]]+(offerta|documentazione|obbligo))' then raise exception 'Citazione con esclusione o non obbligatorietà: rivedere manualmente la condizione nella fonte';end if;return new;
end $$;
create trigger ai_negative_obligation_guard before insert on public.gare_requirements for each row execute function gare_private.ai_negative_obligation_guard();
create trigger ai_negative_obligation_guard before insert on public.gare_document_requests for each row execute function gare_private.ai_negative_obligation_guard();
create function gare_private.guided_scope_impact() returns trigger language plpgsql set search_path='' as $$
begin
 if (new.configuration->'kind',new.configuration->'phase',new.configuration->'form',new.configuration->'parties') is distinct from (old.configuration->'kind',old.configuration->'phase',old.configuration->'form',old.configuration->'parties') then
  update public.gare_participations set stage='in_revisione' where id=new.participation_id and stage='presentata';
  update public.gare_documents d set status='bozza' where d.participation_id=new.participation_id and d.status='approvato' and exists(select 1 from public.gare_ai_drafts a where a.id=d.ai_draft_id and a.fact_snapshot->'perimetro'<>'null'::jsonb);
 end if;return new;
end $$;
create trigger guided_scope_impact after update on public.gare_journeys for each row execute function gare_private.guided_scope_impact();

-- guided outcome
-- Close an enrolled journey with a documented, attributed outcome atomically.
create function public.gare_close_guided_journey(pid uuid,source_id uuid,note text,expected_revision int) returns void language plpgsql security invoker set search_path='' as $$
declare p public.gare_participations;
begin
 select * into p from public.gare_participations where id=pid for update;
 if not found or p.revision<>expected_revision then raise exception 'Fascicolo cambiato: aggiornare prima di registrare l’esito';end if;
 if not exists(select 1 from public.gare_journeys where participation_id=pid) then raise exception 'Percorso guidato non attivato';end if;
 if length(trim(note))<5 or not exists(select 1 from public.gare_documents where id=source_id and tender_id=p.tender_id and company_id=p.company_id and category='fonte' and not archived) then raise exception 'Indicare una fonte ufficiale acquisita e descrivere l’esito';end if;
 insert into public.gare_communications(company_id,participation_id,kind,title,body,source_document_id,responsible,status,reply,blocking) values(p.company_id,pid,'esito','Esito e chiusura della partecipazione',note,source_id,p.responsible,'chiusa',note,false);
 update public.gare_participations set stage='esito',outcome=note where id=pid;
end $$;
revoke all on function public.gare_close_guided_journey(uuid,uuid,text,int) from public;grant execute on function public.gare_close_guided_journey(uuid,uuid,text,int) to authenticated;
create function gare_private.guided_outcome_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if new.stage='esito' and old.stage<>'esito' and exists(select 1 from public.gare_journeys where participation_id=new.id) and not exists(select 1 from public.gare_communications where participation_id=new.id and kind='esito' and status='chiusa' and source_document_id is not null) then raise exception 'Registrare l’esito e collegare la sua fonte dal percorso guidato';end if;return new;
end $$;
create trigger guided_outcome_guard before update on public.gare_participations for each row execute function gare_private.guided_outcome_guard();

create function gare_private.guided_generated_source_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if new.status='approvato' and new.generation_snapshot->>'source_id' is not null and not exists(select 1 from public.gare_documents d where d.id=(new.generation_snapshot->>'source_id')::uuid and d.company_id=new.company_id and d.tender_id=new.tender_id and d.sha256=new.generation_snapshot->>'source_sha256' and not d.archived and not exists(select 1 from public.gare_documents n where n.previous_id=d.id)) then raise exception 'Originale della generazione cambiato: rigenerare o caricare una versione revisionata';end if;return new;
end $$;
create trigger guided_generated_source_guard before insert or update on public.gare_documents for each row execute function gare_private.guided_generated_source_guard();

-- Exact repeated proposals from another analysis preserve human edits.
create or replace function public.gare_apply_ai_proposals(jid uuid,requirement_ids text[],document_ids text[]) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare j public.gare_ai_jobs;r jsonb;cit jsonb;added_r int:=0;added_d int:=0;
begin
 select * into j from public.gare_ai_jobs where id=jid and status='done' and action='analizza';
 if not found then raise exception 'Analisi completata non disponibile';end if;
 if gare_private.role_for(j.company_id) not in ('admin','editor') then raise exception 'Permesso di compilazione richiesto';end if;
 for r in select * from jsonb_array_elements(coalesce(j.result->'requirements','[]')) loop
  if r->>'id'=any(requirement_ids) then
   cit:=r->'citation';
   if not coalesce((cit->>'grounded')::boolean,false) or not exists(select 1 from public.gare_documents d where d.id=(cit->>'document_id')::uuid and d.sha256=cit->>'sha256' and not exists(select 1 from public.gare_documents n where n.previous_id=d.id)) then raise exception 'Fonte non verificata o aggiornata: ripetere l’analisi';end if;
   if exists(select 1 from public.gare_requirements existing where existing.participation_id=j.participation_id and existing.source_document_id=(cit->>'document_id')::uuid and existing.source_quote=cit->>'quote' and existing.description=r->>'description') then continue;end if;
   insert into public.gare_requirements(company_id,participation_id,description,mandatory,status,evidence_id,source_document_id,source_page,source_section,source_quote,note,kind,applicability,threshold,unit,reference_period,expected_proof,ai_job_id,ai_candidate_id)
   values(j.company_id,j.participation_id,r->>'description',coalesce((r->>'mandatory')::boolean,true),'da_verificare',nullif(r->>'evidence_id','')::uuid,(cit->>'document_id')::uuid,nullif(cit->>'page','')::int,coalesce(cit->>'section','Testo estratto'),cit->>'quote','Proposta AI locale da revisionare. '||coalesce(r->>'note',''),coalesce(r->>'kind','da_classificare'),coalesce(r->>'applicability',''),coalesce(r->>'threshold',''),coalesce(r->>'unit',''),coalesce(r->>'reference_period',''),coalesce(r->>'expected_proof',''),j.id,r->>'id') on conflict(ai_job_id,ai_candidate_id) where ai_job_id is not null do nothing;
   if found then added_r:=added_r+1;end if;
  end if;
 end loop;
 for r in select * from jsonb_array_elements(coalesce(j.result->'required_documents','[]')) loop
  if r->>'id'=any(document_ids) then
   cit:=r->'citation';
   if not coalesce((cit->>'grounded')::boolean,false) or not exists(select 1 from public.gare_documents d where d.id=(cit->>'document_id')::uuid and d.sha256=cit->>'sha256' and not exists(select 1 from public.gare_documents n where n.previous_id=d.id)) then raise exception 'Fonte non verificata o aggiornata';end if;
   if exists(select 1 from public.gare_document_requests existing where existing.participation_id=j.participation_id and existing.source_document_id=(cit->>'document_id')::uuid and existing.source_quote=cit->>'quote' and existing.title=r->>'title') then continue;end if;
   insert into public.gare_document_requests(company_id,participation_id,title,category,mandatory,signature_required,source_document_id,source_page,source_section,source_quote,ai_job_id,ai_candidate_id)
   values(j.company_id,j.participation_id,r->>'title',r->>'category',coalesce((r->>'mandatory')::boolean,true),coalesce((r->>'signature_required')::boolean,false),(cit->>'document_id')::uuid,nullif(cit->>'page','')::int,coalesce(cit->>'section','Testo estratto'),cit->>'quote',j.id,r->>'id') on conflict(ai_job_id,ai_candidate_id) where ai_job_id is not null do nothing;
   if found then added_d:=added_d+1;end if;
  end if;
 end loop;
 return jsonb_build_object('requirements',added_r,'documents',added_d);
end $$;

-- company dossier and preparation
-- Isolated Gare pilot: structured company knowledge and resumable preparation.
create table public.gare_company_assets(
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.gare_companies(id),
 kind text not null check(kind in('qualification','experience','person','equipment','authority','economic')),
 title text not null,entity_name text not null default '',entity_tax_id text not null default '',data jsonb not null default '{}',
 evidence_id uuid references public.gare_evidence(id),source_file_id uuid references public.gare_evidence_files(id),source_sha256 text,
 source_locator text not null default '',source_quote text not null default '',
 status text not null default 'in_verifica' check(status in('in_verifica','confermato','archiviato')),
 verified_on date,expires_on date,review_note text not null default '',reviewed_by uuid references auth.users(id),
 revision int not null default 1,created_by uuid references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(company_id,id),check(jsonb_typeof(data)='object' and octet_length(data::text)<40000),check(length(trim(title)) between 3 and 500)
);
create index gare_assets_company_kind on public.gare_company_assets(company_id,kind,status);
create index gare_assets_evidence on public.gare_company_assets(evidence_id);
create index gare_assets_file on public.gare_company_assets(source_file_id);
alter table public.gare_company_assets enable row level security;
create policy assets_read on public.gare_company_assets for select to authenticated using(gare_private.role_for(company_id) is not null);
create policy assets_insert on public.gare_company_assets for insert to authenticated with check(gare_private.role_for(company_id) in('admin','editor'));
create policy assets_update on public.gare_company_assets for update to authenticated using(gare_private.role_for(company_id) in('admin','editor','reviewer')) with check(gare_private.role_for(company_id) in('admin','editor','reviewer'));
revoke all on public.gare_company_assets from anon,authenticated;grant select,insert,update on public.gare_company_assets to authenticated;
create function gare_private.company_asset_guard() returns trigger language plpgsql set search_path='' as $$
declare f public.gare_evidence_files;today date:=(now() at time zone 'Europe/Rome')::date;
begin
 if exists(select 1 from jsonb_each(new.data) e where jsonb_typeof(e.value)<>'string' or length(e.value#>>'{}')>2000 or e.key!~'^[a-z_]{2,50}$') then raise exception 'Dati della scheda: chiavi strutturate e valori testuali fino a 2000 caratteri';end if;
 if TG_OP='UPDATE' then
  if(new.id,new.company_id,new.created_by,new.created_at) is distinct from(old.id,old.company_id,old.created_by,old.created_at) then raise exception 'Identità e origine della scheda immutabili';end if;
  if gare_private.role_for(new.company_id)='reviewer' and(to_jsonb(new)-array['status','review_note','verified_on','reviewed_by','updated_at','revision']) is distinct from(to_jsonb(old)-array['status','review_note','verified_on','reviewed_by','updated_at','revision']) then raise exception 'Il revisore può confermare i dati, non riscriverli';end if;
  if(new.kind,new.title,new.entity_name,new.entity_tax_id,new.data,new.evidence_id,new.source_file_id,new.source_locator,new.source_quote,new.expires_on) is distinct from(old.kind,old.title,old.entity_name,old.entity_tax_id,old.data,old.evidence_id,old.source_file_id,old.source_locator,old.source_quote,old.expires_on) then new.status:='in_verifica';end if;
  new.revision:=old.revision+1;
 else new.created_by:=auth.uid();new.revision:=1;end if;
 if new.evidence_id is not null and not exists(select 1 from public.gare_evidence where id=new.evidence_id and company_id=new.company_id) then raise exception 'Prova di un’altra impresa';end if;
 if new.source_file_id is not null then
  select * into f from public.gare_evidence_files where id=new.source_file_id and company_id=new.company_id;
  if not found or(new.evidence_id is not null and new.evidence_id<>f.evidence_id) then raise exception 'Allegato di origine non coerente';end if;
  new.evidence_id:=f.evidence_id;new.source_sha256:=f.sha256;
 else new.source_sha256:=null;end if;
 if new.status='confermato' then
  if gare_private.role_for(new.company_id) not in('admin','reviewer') then raise exception 'La conferma richiede un revisore o amministratore';end if;
  if new.verified_on is null or new.verified_on>today or length(trim(new.review_note))<5 or length(trim(new.source_locator))<3 or length(trim(new.entity_name))<2 then raise exception 'Confermare soggetto, fonte, data e motivazione della verifica';end if;
  if new.source_file_id is not null and exists(select 1 from public.gare_evidence_files where previous_id=new.source_file_id) then raise exception 'La prova è stata aggiornata: collegare la versione corrente';end if;
  if new.kind='qualification' and (coalesce(new.data->>'scheme','')='' or coalesce(new.data->>'category','')='') then raise exception 'Indicare schema e categoria della qualificazione';end if;
  if new.kind='experience' and (coalesce(new.data->>'client','')='' or coalesce(new.data->>'description','')='' or coalesce(new.data->>'period','')='') then raise exception 'Indicare cliente, lavorazioni e periodo dell’esperienza';end if;
  if new.kind='person' and(coalesce(new.data->>'name','')='' or coalesce(new.data->>'role','')='') then raise exception 'Indicare persona e ruolo';end if;
  if new.kind='equipment' and(coalesce(new.data->>'description','')='' or coalesce(new.data->>'availability','')='') then raise exception 'Indicare mezzo e disponibilità da verificare';end if;
  if new.kind='authority' and(coalesce(new.data->>'signer','')='' or coalesce(new.data->>'powers','')='') then raise exception 'Indicare firmatario e poteri riscontrati';end if;
  if new.kind='economic' and(coalesce(new.data->>'metric','')='' or coalesce(new.data->>'period','')='' or coalesce(new.data->>'amount','')='') then raise exception 'Indicare metrica, periodo e importo';end if;
  new.reviewed_by:=auth.uid();
 else new.reviewed_by:=null;end if;
 new.updated_at:=clock_timestamp();return new;
end $$;
create trigger asset_guard before insert or update on public.gare_company_assets for each row execute function gare_private.company_asset_guard();
create trigger audit after insert or update on public.gare_company_assets for each row execute function gare_private.audit_change();

create table public.gare_company_document_texts(
 company_id uuid not null references public.gare_companies(id),document_id uuid primary key references public.gare_evidence_files(id),sha256 text not null,pages jsonb not null,warnings jsonb not null default '[]',coverage jsonb not null
);
alter table public.gare_company_document_texts enable row level security;
create policy company_text_read on public.gare_company_document_texts for select to authenticated using(gare_private.role_for(company_id) is not null);
revoke all on public.gare_company_document_texts from anon,authenticated;grant select on public.gare_company_document_texts to authenticated;
create index gare_company_text_company on public.gare_company_document_texts(company_id);

create table public.gare_preparation_runs(
 id uuid primary key default gen_random_uuid(),company_id uuid not null,participation_id uuid not null,
 created_by uuid not null references auth.users(id),request_hash text not null,
 status text not null default 'queued' check(status in('queued','running','waiting_review','done','error','interrupted','cancelled')),
 progress int not null default 0 check(progress between 0 and 100),message text not null default '',
 snapshot jsonb not null,steps jsonb not null default '{}',result jsonb not null default '{}',error text,
 revision int not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(company_id,participation_id) references public.gare_participations(company_id,id),unique(company_id,id)
);
create unique index gare_preparation_active on public.gare_preparation_runs(company_id,request_hash) where status in('queued','running');
create index gare_preparation_participation on public.gare_preparation_runs(company_id,participation_id,created_at desc);
alter table public.gare_preparation_runs enable row level security;
create policy preparation_read on public.gare_preparation_runs for select to authenticated using(gare_private.role_for(company_id) is not null);
revoke all on public.gare_preparation_runs from anon,authenticated;grant select on public.gare_preparation_runs to authenticated;

create function gare_private.assets_current(snapshot jsonb) returns boolean language sql stable set search_path='' as $$
 select not exists(select 1 from jsonb_array_elements(coalesce(snapshot->'reusable_assets','[]')) a where not exists(select 1 from public.gare_company_assets v where v.id=(a->>'id')::uuid and v.revision::text=a->>'revision' and v.status='confermato' and v.verified_on<=(now() at time zone 'Europe/Rome')::date and(v.expires_on is null or v.expires_on>=(now() at time zone 'Europe/Rome')::date) and(v.source_file_id is null or not exists(select 1 from public.gare_evidence_files n where n.previous_id=v.source_file_id))))
$$;
alter function public.gare_ai_facts_current(uuid) rename to gare_ai_facts_before_assets;
create function public.gare_ai_facts_current(did uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select public.gare_ai_facts_before_assets(did) and coalesce((select gare_private.assets_current(d.fact_snapshot) from public.gare_ai_drafts d where d.id=did),false)
$$;
revoke all on function public.gare_ai_facts_current(uuid) from public;grant execute on function public.gare_ai_facts_current(uuid) to authenticated;
create function gare_private.asset_document_guard() returns trigger language plpgsql set search_path='' as $$
begin if new.status='approvato' and not gare_private.assets_current(new.generation_snapshot) then raise exception 'Dato strutturato cambiato o scaduto: rigenerare e revisionare la bozza';end if;return new;end $$;
create trigger asset_document_guard before insert or update on public.gare_documents for each row execute function gare_private.asset_document_guard();
create function gare_private.asset_impact() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.gare_documents d set status='bozza' where d.company_id=new.company_id and d.status='approvato' and(exists(select 1 from jsonb_array_elements(coalesce(d.generation_snapshot->'reusable_assets','[]')) a where a->>'id'=new.id::text) or exists(select 1 from public.gare_ai_drafts f,jsonb_array_elements(coalesce(f.fact_snapshot->'reusable_assets','[]')) a where f.id=d.ai_draft_id and a->>'id'=new.id::text));return new;
end $$;
create trigger asset_impact after update on public.gare_company_assets for each row execute function gare_private.asset_impact();
create function gare_private.asset_file_impact() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.gare_company_assets set status='in_verifica',review_note='Nuova versione della prova: rivedere i dati estratti' where company_id=new.company_id and evidence_id=new.evidence_id and source_file_id is not null and source_file_id<>new.id and status='confermato';return new;
end $$;
create trigger asset_file_impact after insert on public.gare_evidence_files for each row execute function gare_private.asset_file_impact();

alter table public.gare_document_contracts drop constraint gare_document_contracts_format_check;
alter table public.gare_document_contracts add constraint gare_document_contracts_format_check check(format in('docx_tokens','pdf_acroform','docx_structured','pdf_mapped'));

-- dossier extraction and mapping guards
-- Persist extracted proposals separately from reviewed company knowledge.
create table public.gare_asset_extractions(
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.gare_companies(id),source_file_id uuid not null references public.gare_evidence_files(id),source_sha256 text not null,created_by uuid not null references auth.users(id),request_hash text not null,
 status text not null check(status in('running','done','error','interrupted')),result jsonb not null default '{}',error text,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index gare_extractions_company on public.gare_asset_extractions(company_id,request_hash,created_at desc);
alter table public.gare_asset_extractions enable row level security;
create policy extracted_read on public.gare_asset_extractions for select to authenticated using(gare_private.role_for(company_id) is not null);
revoke all on public.gare_asset_extractions from anon,authenticated;grant select on public.gare_asset_extractions to authenticated;
create function gare_private.company_source_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_TABLE_NAME='gare_company_document_texts' then
  if not exists(select 1 from public.gare_evidence_files f where f.id=new.document_id and f.company_id=new.company_id and f.sha256=new.sha256) then raise exception 'Fonte aziendale non coerente';end if;
 else
  if not exists(select 1 from public.gare_evidence_files f where f.id=new.source_file_id and f.company_id=new.company_id and f.sha256=new.source_sha256) then raise exception 'Fonte aziendale non coerente';end if;
 end if;return new;
end $$;
create trigger company_source before insert or update on public.gare_company_document_texts for each row execute function gare_private.company_source_guard();
create trigger extraction_source before insert or update on public.gare_asset_extractions for each row execute function gare_private.company_source_guard();
create function gare_private.mapped_document_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if new.status='approvato' and new.template_contract_id is not null and exists(select 1 from public.gare_document_contracts c where c.id=new.template_contract_id and c.format='pdf_mapped' and(c.fields is distinct from new.generation_snapshot->'fields' or c.constraints->>'mapping_confirmed' is distinct from 'true')) then raise exception 'Mappatura PDF cambiata: rigenerare la bozza sul modello corrente';end if;
 return new;
end $$;
create trigger mapped_document before insert or update on public.gare_documents for each row execute function gare_private.mapped_document_guard();
create function gare_private.asset_export_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if not new.draft and exists(select 1 from jsonb_array_elements(new.manifest->'documents') d where not gare_private.assets_current(d->'generation_snapshot')) then raise exception 'Dati aziendali riutilizzati cambiati: rivedere il pacchetto';end if;return new;
end $$;
create trigger assets_export before insert on public.gare_exports for each row execute function gare_private.asset_export_guard();

-- preparation reviews
create table public.gare_preparation_reviews(
 id uuid primary key default gen_random_uuid(),company_id uuid not null,participation_id uuid not null,draft_id uuid not null references public.gare_ai_drafts(id),draft_revision int not null,created_by uuid not null references auth.users(id),source_snapshot jsonb not null,result jsonb not null,created_at timestamptz not null default now(),
 foreign key(company_id,participation_id) references public.gare_participations(company_id,id)
);
create index gare_reviews_draft on public.gare_preparation_reviews(company_id,draft_id,created_at desc);
alter table public.gare_preparation_reviews enable row level security;
create policy reviews_read on public.gare_preparation_reviews for select to authenticated using(gare_private.role_for(company_id) is not null);
revoke all on public.gare_preparation_reviews from anon,authenticated;grant select on public.gare_preparation_reviews to authenticated;
create function gare_private.preparation_review_guard() returns trigger language plpgsql set search_path='' as $$
begin if not exists(select 1 from public.gare_ai_drafts d where d.id=new.draft_id and d.company_id=new.company_id and d.participation_id=new.participation_id and d.revision=new.draft_revision) then raise exception 'Bozza da revisionare non coerente';end if;return new;end $$;
create trigger review_guard before insert on public.gare_preparation_reviews for each row execute function gare_private.preparation_review_guard();

-- preparation knowledge dependencies
-- Dependencies apply to generated files, AI drafts and immutable final manifests.
create or replace function gare_private.assets_current(snapshot jsonb) returns boolean language sql stable set search_path='' as $$
 select not exists(select 1 from jsonb_array_elements(coalesce(snapshot->'reusable_assets',snapshot->'facts'->'reusable_assets','[]')) a where not exists(select 1 from public.gare_company_assets v where v.id=(a->>'id')::uuid and v.revision::text=a->>'revision' and v.status='confermato' and v.reviewed_by is not null and v.verified_on<=(now() at time zone 'Europe/Rome')::date and(v.expires_on is null or v.expires_on>=(now() at time zone 'Europe/Rome')::date) and(v.source_file_id is null or not exists(select 1 from public.gare_evidence_files n where n.previous_id=v.source_file_id))))
 and not exists(select 1 from jsonb_array_elements(coalesce(snapshot->'reusable_library',snapshot->'facts'->'reusable_library','[]')) a where not exists(select 1 from public.gare_technical_library v where v.id=(a->>'id')::uuid and v.revision::text=a->>'revision' and v.status='approvato' and v.reviewed_by is not null and not exists(select 1 from unnest(v.evidence_ids) eid where not exists(select 1 from public.gare_evidence e where e.id=eid and e.company_id=v.company_id and e.status='valido' and e.verified_on<=(now() at time zone 'Europe/Rome')::date and(e.expires_on is null or e.expires_on>=(now() at time zone 'Europe/Rome')::date)))))
$$;
create function gare_private.library_impact() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.gare_documents d set status='bozza' where d.company_id=new.company_id and d.status='approvato' and exists(select 1 from public.gare_ai_drafts f,jsonb_array_elements(coalesce(f.fact_snapshot->'reusable_library','[]')) a where f.id=d.ai_draft_id and a->>'id'=new.id::text);return new;
end $$;
create trigger library_impact after update on public.gare_technical_library for each row execute function gare_private.library_impact();

-- local office insights
alter table public.gare_tasks add column assignee_id uuid;
alter table public.gare_tasks add foreign key(assignee_id) references auth.users(id);
create index gare_task_assignee on public.gare_tasks(company_id,assignee_id) where assignee_id is not null;
create table public.gare_market_records(
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.gare_companies(id),external_key text not null,tender_name text not null,authority text not null,territory text not null default '',category text not null default '',award_date date not null,
 base_amount numeric(16,2) check(base_amount>=0),discount numeric(7,4) check(discount>=0 and discount<100),award_amount numeric(16,2) check(award_amount>=0),operator text not null default '',source text not null,source_url text not null default '',notes text not null default '',
 status text not null default 'in_verifica' check(status in('in_verifica','confermato','archiviato')),verified_on date,review_note text not null default '',reviewed_by uuid references auth.users(id),revision int not null default 1,created_by uuid references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(company_id,external_key),check(length(trim(tender_name))>=3 and length(trim(source))>=3 and length(trim(external_key))>=3),check(source_url='' or source_url~'^https?://')
);
create index gare_market_company_date on public.gare_market_records(company_id,award_date desc);
alter table public.gare_market_records enable row level security;
create policy market_read on public.gare_market_records for select to authenticated using(gare_private.role_for(company_id) is not null);
create policy market_add on public.gare_market_records for insert to authenticated with check(gare_private.role_for(company_id) in('admin','editor'));
create policy market_edit on public.gare_market_records for update to authenticated using(gare_private.role_for(company_id) in('admin','editor','reviewer')) with check(gare_private.role_for(company_id) in('admin','editor','reviewer'));
revoke all on public.gare_market_records from anon,authenticated;grant select,insert,update on public.gare_market_records to authenticated;
create function gare_private.market_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='INSERT' then new.created_by:=auth.uid();new.status:='in_verifica';new.reviewed_by:=null;new.revision:=1;
 else
  if(new.id,new.company_id,new.created_by,new.created_at) is distinct from(old.id,old.company_id,old.created_by,old.created_at) then raise exception 'Origine immutabile';end if;
  if gare_private.role_for(new.company_id)='reviewer' and(to_jsonb(new)-array['status','review_note','verified_on','reviewed_by','revision','updated_at']) is distinct from(to_jsonb(old)-array['status','review_note','verified_on','reviewed_by','revision','updated_at']) then raise exception 'Il revisore non modifica il dato di mercato';end if;
  if(to_jsonb(new)-array['status','review_note','verified_on','reviewed_by','revision','updated_at']) is distinct from(to_jsonb(old)-array['status','review_note','verified_on','reviewed_by','revision','updated_at']) then new.status:='in_verifica';end if;
  new.revision:=old.revision+1;
 end if;
 if new.status='confermato' then
  if gare_private.role_for(new.company_id) not in('admin','reviewer') or new.verified_on is null or new.verified_on>(now() at time zone 'Europe/Rome')::date or length(trim(new.review_note))<5 then raise exception 'Confermare il dato con revisore, fonte, data e motivazione';end if;new.reviewed_by:=auth.uid();
 else new.reviewed_by:=null;end if;new.updated_at:=clock_timestamp();return new;
end $$;
create trigger market_guard before insert or update on public.gare_market_records for each row execute function gare_private.market_guard();
create trigger audit after insert or update on public.gare_market_records for each row execute function gare_private.audit_change();
create table public.gare_work_feedback(
 id uuid primary key default gen_random_uuid(),company_id uuid not null,participation_id uuid not null,phase text not null check(phase in('ricerca','lettura','requisiti','moduli','tecnica','economica','revisione','presentazione')),manual_minutes int not null check(manual_minutes between 0 and 100000),actual_minutes int not null check(actual_minutes between 0 and 100000),quality text not null check(quality in('utile','da_correggere','non_utile')),notes text not null check(length(trim(notes))>=5),voided boolean not null default false,created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),foreign key(company_id,participation_id) references public.gare_participations(company_id,id)
);
create index gare_feedback_company_part on public.gare_work_feedback(company_id,participation_id);
alter table public.gare_work_feedback enable row level security;
create policy feedback_read on public.gare_work_feedback for select to authenticated using(gare_private.role_for(company_id) is not null);
create policy feedback_add on public.gare_work_feedback for insert to authenticated with check(gare_private.role_for(company_id) in('admin','editor') and created_by=auth.uid());
create policy feedback_void on public.gare_work_feedback for update to authenticated using(gare_private.role_for(company_id)='admin' or created_by=auth.uid()) with check(gare_private.role_for(company_id)='admin' or created_by=auth.uid());
revoke all on public.gare_work_feedback from anon,authenticated;grant select,insert on public.gare_work_feedback to authenticated;grant update(voided) on public.gare_work_feedback to authenticated;
create trigger audit after insert or update on public.gare_work_feedback for each row execute function gare_private.audit_change();
alter table public.gare_saved_searches add column last_checked_at timestamptz,add column matched_ids uuid[] not null default '{}';
create function gare_private.watch_guard() returns trigger language plpgsql set search_path='' as $$
begin if exists(select 1 from unnest(new.matched_ids) mid where not exists(select 1 from public.gare_tenders t where t.id=mid and t.company_id=new.company_id)) then raise exception 'Risultato della ricerca di un’altra impresa';end if;return new;end $$;
create trigger watch_guard before insert or update on public.gare_saved_searches for each row execute function gare_private.watch_guard();

create function gare_private.task_assignee_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 if new.assignee_id is not null
    and gare_private.role_for_member(new.company_id, new.assignee_id) is null then
   raise exception 'Il responsabile deve appartenere all’ufficio gare';
 end if;
 return new;
end $$;
create trigger gare_task_assignee before insert or update of company_id, assignee_id
on public.gare_tasks for each row execute function gare_private.task_assignee_guard();

-- source intake
-- Local Gare module only. Keep original archives and immutable byte provenance.
alter table public.gare_documents drop constraint gare_documents_size_bytes_check;
alter table public.gare_documents add constraint gare_documents_size_bytes_check check(size_bytes between 1 and case when category='fonte' then 52428800 else 20971520 end);
update storage.buckets set file_size_limit=52428800 where id='gare-private';
alter table public.gare_documents add column source_parent_id uuid,
 add column source_parent_sha256 text check(source_parent_sha256 is null or source_parent_sha256 ~ '^[a-f0-9]{64}$'),
 add column source_entry text;
alter table public.gare_documents add constraint gare_source_parent_fk foreign key(company_id,source_parent_id) references public.gare_documents(company_id,id),
 add constraint gare_source_parent_complete check((source_parent_id is null and source_parent_sha256 is null and source_entry is null) or (source_parent_id is not null and source_parent_sha256 is not null and length(source_entry) between 1 and 1000 and category='fonte' and participation_id is null));
create unique index gare_source_entry_unique on public.gare_documents(company_id,source_parent_id,source_entry) where source_parent_id is not null;
create function public.gare_source_current(did uuid) returns boolean language sql stable security invoker set search_path='' as $$
 with recursive lineage as (
  select d.id,d.source_parent_id,d.source_parent_sha256,d.sha256,d.archived,1 as depth from public.gare_documents d where d.id=did
  union all select p.id,p.source_parent_id,p.source_parent_sha256,p.sha256,p.archived,l.depth+1 from lineage l join public.gare_documents p on p.id=l.source_parent_id where l.depth<32
 ) select exists(select 1 from lineage) and not exists(select 1 from lineage l where l.archived or exists(select 1 from public.gare_documents n where n.previous_id=l.id) or (l.source_parent_id is not null and not exists(select 1 from public.gare_documents p where p.id=l.source_parent_id and p.sha256=l.source_parent_sha256)) or l.depth>=32)
$$;
grant execute on function public.gare_source_current(uuid) to authenticated;
create function gare_private.source_intake_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='UPDATE' and (new.source_parent_id,new.source_parent_sha256,new.source_entry) is distinct from (old.source_parent_id,old.source_parent_sha256,old.source_entry) then raise exception 'Provenienza degli allegati immutabile';end if;
 if new.source_parent_id is not null and not exists(select 1 from public.gare_documents p where p.id=new.source_parent_id and p.company_id=new.company_id and p.tender_id=new.tender_id and p.category='fonte' and lower(p.name) like '%.zip' and p.sha256=new.source_parent_sha256 and p.id<>new.id) then raise exception 'Archivio originale non coerente';end if;
 if TG_OP='INSERT' and new.source_parent_id is not null and not public.gare_source_current(new.source_parent_id) then raise exception 'Archivio aggiornato: acquisire gli allegati della versione corrente';end if;
 if new.status='approvato' and (
  (new.generation_snapshot ? 'source_id' and not public.gare_source_current((new.generation_snapshot->>'source_id')::uuid)) or
  exists(select 1 from public.gare_document_contracts c where c.id=new.template_contract_id and not public.gare_source_current(c.source_document_id)) or
  exists(select 1 from public.gare_ai_drafts a cross join lateral jsonb_array_elements(a.source_snapshot) s where a.id=new.ai_draft_id and not public.gare_source_current((s->>'id')::uuid))
 ) then raise exception 'Fonti o archivio aggiornati: rigenerare e revisionare la bozza';end if;
 return new;
end $$;
create trigger source_intake_guard before insert or update on public.gare_documents for each row execute function gare_private.source_intake_guard();
create function gare_private.source_reference_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if new.source_document_id is not null and not public.gare_source_current(new.source_document_id) and (TG_OP='INSERT' or TG_TABLE_NAME='gare_document_requests' or new.status in ('compatibile','non_applicabile')) then raise exception 'Fonte o archivio aggiornato: collegare la fonte corrente';end if;return new;
end $$;
create trigger source_reference_guard before insert or update on public.gare_requirements for each row execute function gare_private.source_reference_guard();
create trigger source_reference_guard before insert or update on public.gare_document_requests for each row execute function gare_private.source_reference_guard();
alter function public.gare_ai_facts_current(uuid) rename to gare_ai_facts_before_intake;
create function public.gare_ai_facts_current(did uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select public.gare_ai_facts_before_intake(did) and not exists(select 1 from public.gare_ai_drafts a cross join lateral jsonb_array_elements(a.source_snapshot) s where a.id=did and not public.gare_source_current((s->>'id')::uuid))
$$;
grant execute on function public.gare_ai_facts_current(uuid) to authenticated;
alter function public.gare_blockers(uuid) rename to gare_blockers_before_intake;
create function public.gare_blockers(pid uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 result:=public.gare_blockers_before_intake(pid);
 if exists(select 1 from public.gare_requirements r where r.participation_id=pid and r.source_document_id is not null and not public.gare_source_current(r.source_document_id)) or exists(select 1 from public.gare_document_requests r where r.participation_id=pid and r.source_document_id is not null and not public.gare_source_current(r.source_document_id)) or exists(select 1 from public.gare_documents d where d.participation_id=pid and not d.archived and not exists(select 1 from public.gare_documents n where n.previous_id=d.id) and ((d.generation_snapshot ? 'source_id' and not public.gare_source_current((d.generation_snapshot->>'source_id')::uuid)) or exists(select 1 from public.gare_document_contracts c where c.id=d.template_contract_id and not public.gare_source_current(c.source_document_id)))) then result:=result||jsonb_build_array('Fonti o archivio aggiornati: riallineare requisiti, richieste e modelli alla versione corrente');end if;
 return result;
end $$;
grant execute on function public.gare_blockers(uuid) to authenticated;
create function gare_private.export_current_sources() returns trigger language plpgsql set search_path='' as $$
begin
 new.manifest:=jsonb_set(new.manifest,'{documents}',coalesce((select jsonb_agg(d) from jsonb_array_elements(new.manifest->'documents') d where d->>'category'<>'fonte' or public.gare_source_current((d->>'id')::uuid)),'[]'::jsonb));return new;
end $$;
create trigger zz_export_current_sources before insert on public.gare_exports for each row execute function gare_private.export_current_sources();

-- source reference guard fix
-- Requirements and requests share this trigger; requests have no status column.
create or replace function gare_private.source_reference_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if new.source_document_id is not null and not public.gare_source_current(new.source_document_id) and (TG_OP='INSERT' or TG_TABLE_NAME='gare_document_requests' or to_jsonb(new)->>'status' in ('compatibile','non_applicabile')) then raise exception 'Fonte o archivio aggiornato: collegare la fonte corrente';end if;return new;
end $$;

-- source member versions
-- A manually uploaded newer revision of a ZIP member keeps its origin. The
-- original member and the container are still retained without modification.
drop index public.gare_source_entry_unique;
create unique index gare_source_entry_unique on public.gare_documents(company_id,source_parent_id,source_entry,version) where source_parent_id is not null;
create function gare_private.inherit_source_provenance() returns trigger language plpgsql set search_path='' as $$
declare previous public.gare_documents;
begin
 if new.previous_id is not null then
  select * into previous from public.gare_documents where id=new.previous_id and company_id=new.company_id;
  if previous.source_parent_id is not null then
   if new.source_parent_id is not null and (new.source_parent_id,new.source_parent_sha256,new.source_entry) is distinct from (previous.source_parent_id,previous.source_parent_sha256,previous.source_entry) then raise exception 'La nuova revisione deve mantenere la provenienza della fonte';end if;
   new.source_parent_id:=previous.source_parent_id;new.source_parent_sha256:=previous.source_parent_sha256;new.source_entry:=previous.source_entry;
  end if;
 end if;return new;
end $$;
create trigger aa_inherit_source_provenance before insert on public.gare_documents for each row execute function gare_private.inherit_source_provenance();

-- source duplicate provenance
-- Byte identity is not identity of provenance: two ZIP paths or two model
-- contracts may legitimately yield the same bytes. Keep upload deduplication
-- for manually acquired root files; generated models use snapshot idempotency.
drop index public.gare_same_file_once;
create unique index gare_same_file_once on public.gare_documents(company_id,tender_id,sha256,category,version,coalesce(lot_id,'00000000-0000-0000-0000-000000000000'::uuid)) where source_parent_id is null and template_contract_id is null and ai_draft_id is null;

-- trusted source import
-- Provenance of the first extracted member is minted only after the local
-- server checked archive CRC, member path and bytes. Normal editors may still
-- create a newer manual revision; it inherits the original provenance.
create function gare_private.trusted_source_import() returns trigger language plpgsql set search_path='' as $$
begin
 if new.source_parent_id is not null and new.previous_id is null and coalesce(auth.role(),'')<>'service_role' then raise exception 'Acquisire gli allegati dal pannello ZIP: provenienza verificata dal servizio locale richiesta';end if;return new;
end $$;
create trigger trusted_source_import before insert on public.gare_documents for each row execute function gare_private.trusted_source_import();

-- source text review
-- Human checks of extracted text. They never approve an offer or rewrite OCR.
create table public.gare_source_reviews (
 id uuid primary key default gen_random_uuid(),company_id uuid not null,document_id uuid not null,
 source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),unit_key text not null check(length(unit_key) between 1 and 40),
 extracted_sha256 text not null check(extracted_sha256 ~ '^[a-f0-9]{64}$'),
 status text not null check(status in ('controllato','problema')),note text not null default '' check(length(note)<=2000),
 reviewed_by uuid not null references auth.users(id),reviewed_at timestamptz not null default now(),revision integer not null default 1 check(revision>0),
 unique(company_id,document_id,source_sha256,unit_key,extracted_sha256),
 foreign key(company_id,document_id) references public.gare_documents(company_id,id) on delete cascade,
 check(status<>'problema' or length(trim(note))>=5)
);
alter table public.gare_source_reviews enable row level security;
revoke all on public.gare_source_reviews from anon,authenticated;
grant select on public.gare_source_reviews to authenticated;
grant all on public.gare_source_reviews to service_role;
create policy source_reviews_read on public.gare_source_reviews for select to authenticated using(gare_private.role_for(company_id) is not null);
create function gare_private.source_review_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if gare_private.role_for_member(new.company_id, new.reviewed_by) is null then raise exception 'Permesso di controllo del testo richiesto';end if;
 if not exists(select 1 from public.gare_documents d where d.id=new.document_id and d.company_id=new.company_id and d.category='fonte' and d.sha256=new.source_sha256 and public.gare_source_current(d.id)) then raise exception 'Fonte aggiornata: riaprire il testo corrente';end if;
 if TG_OP='UPDATE' then
  if (new.company_id,new.document_id,new.source_sha256,new.unit_key,new.extracted_sha256) is distinct from (old.company_id,old.document_id,old.source_sha256,old.unit_key,old.extracted_sha256) then raise exception 'Riferimento del controllo immutabile';end if;
  new.revision:=old.revision+1;
 end if;new.reviewed_at:=now();return new;
end $$;
create trigger source_review_guard before insert or update on public.gare_source_reviews for each row execute function gare_private.source_review_guard();

-- dgue and form source dependencies
create function public.gare_reading_fingerprint(did uuid) returns text language sql stable security invoker set search_path='' as $$
 select pg_catalog.md5(t.pages::text) from public.gare_document_texts t where t.document_id=did
$$;
grant execute on function public.gare_reading_fingerprint(uuid) to authenticated;
-- Local Gare only: extracted source values stay bound to the exact cached reading.
create function gare_private.form_sources_current(snapshot jsonb) returns boolean language sql stable security invoker set search_path='' as $$
 select not exists(select 1 from jsonb_array_elements(coalesce(snapshot->'form_sources','[]')) s where not exists(
  select 1 from public.gare_documents d join public.gare_document_texts t on t.document_id=d.id and t.company_id=d.company_id and t.sha256=d.sha256
  where d.id=(s->>'document_id')::uuid and d.sha256=s->>'sha256' and public.gare_source_current(d.id) and pg_catalog.md5(t.pages::text)=s->>'reading_fingerprint' and (t.coverage->>'reader_revision')::int=2
 ))
$$;
create function gare_private.form_sources_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.status='approvato' and not gare_private.form_sources_current(new.generation_snapshot) then raise exception 'Fonte o testo dei campi cambiato: riconfermare i valori e rigenerare il modulo';end if;
 return new;
end $$;
create trigger form_sources_guard before insert or update on public.gare_documents for each row execute function gare_private.form_sources_guard();
create function gare_private.form_sources_export_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if not new.draft and exists(select 1 from jsonb_array_elements(new.manifest->'documents') d where not gare_private.form_sources_current(d->'generation_snapshot')) then raise exception 'Fonti dei moduli aggiornate: rivedere il pacchetto';end if;
 return new;
end $$;
create trigger form_sources_export before insert on public.gare_exports for each row execute function gare_private.form_sources_export_guard();
alter function public.gare_blockers(uuid) rename to gare_blockers_before_form_sources;
create function public.gare_blockers(pid uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 result:=public.gare_blockers_before_form_sources(pid);
 if exists(select 1 from public.gare_documents d where d.participation_id=pid and not d.archived and not exists(select 1 from public.gare_documents n where n.previous_id=d.id) and not gare_private.form_sources_current(d.generation_snapshot)) then result:=result||jsonb_build_array('Fonti dei campi cambiate: riconfermare e rigenerare i moduli interessati');end if;
 return result;
end $$;
grant execute on function public.gare_blockers(uuid) to authenticated;

-- review handoffs and validation
alter table public.gare_documents add column revision int not null default 1;
create function gare_private.document_revision() returns trigger language plpgsql security invoker set search_path='' as $$
begin new.revision:=old.revision+1;return new;end $$;
-- Advance the internal revision after the role guard has checked user changes.
create trigger zz_document_revision before update on public.gare_documents for each row execute function gare_private.document_revision();
-- Local Gare module: immutable technical checks and explicit human handoff.
create table public.gare_review_checks(
 id uuid primary key default gen_random_uuid(),company_id uuid not null,document_id uuid not null,document_sha256 text not null,
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),purpose text not null check(purpose in('validation','handoff')),
 validator_revision int not null,status text not null check(status in('passed','attention','blocked')),reviewable boolean not null default false,
 dependency_snapshot jsonb not null,request_hash text not null,report jsonb not null,
 preview_confirmed boolean not null default false,declarations_confirmed boolean not null default false,scope_ack boolean not null default false,note text not null default '',
 foreign key(company_id,document_id) references public.gare_documents(company_id,id) on delete cascade,
 check(purpose<>'handoff' or (preview_confirmed and declarations_confirmed and length(trim(note))>=10))
);
create index gare_review_checks_document on public.gare_review_checks(company_id,document_id,created_at desc);
alter table public.gare_review_checks enable row level security;
create policy tenant_read on public.gare_review_checks for select to authenticated using(gare_private.role_for(company_id) is not null);
revoke all on public.gare_review_checks from anon,authenticated;
grant select on public.gare_review_checks to authenticated;
create function gare_private.review_snapshot_current(did uuid,dep jsonb) returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.gare_documents d join public.gare_companies co on co.id=d.company_id where d.id=did and d.sha256=dep->>'document_sha256'
 and not d.archived and public.gare_source_current(d.id)
 and d.category=dep->>'category' and d.signature_required=(dep->>'signature_required')::boolean
 and gare_private.reused_facts_current(d.generation_snapshot) and gare_private.assets_current(d.generation_snapshot) and gare_private.form_sources_current(d.generation_snapshot)
 and (not(d.generation_snapshot ? 'source_id') or exists(select 1 from public.gare_documents s where s.id=(d.generation_snapshot->>'source_id')::uuid and s.company_id=d.company_id and s.sha256=d.generation_snapshot->>'source_sha256' and public.gare_source_current(s.id)))
 and (dep->'request_source' is null or dep->'request_source'='null'::jsonb or exists(select 1 from public.gare_documents rq where rq.id=(dep->'request_source'->>'id')::uuid and rq.company_id=d.company_id and rq.tender_id=d.tender_id and rq.sha256=dep->'request_source'->>'sha256' and public.gare_source_current(rq.id)))
 and (d.template_contract_id is null or exists(select 1 from public.gare_document_contracts c where c.id=d.template_contract_id and c.company_id=d.company_id and c.fields=dep->'contract_fields'))
 and not exists(select 1 from jsonb_each_text(coalesce(dep->'profile_values','{}')) v where co.profile->>v.key is distinct from v.value)
 )
$$;
create function public.gare_review_current(did uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.gare_review_checks c where c.document_id=did and c.purpose='handoff' and c.validator_revision=1 and c.reviewable and c.preview_confirmed and c.declarations_confirmed and c.status<>'blocked' and (c.status='passed' or c.scope_ack) and gare_private.review_snapshot_current(did,c.dependency_snapshot))
$$;
grant execute on function public.gare_review_current(uuid) to authenticated;
create function gare_private.review_handoff_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if coalesce((new.generation_snapshot->>'review_flow_version')::int,0)>=1 and new.status in('in_verifica','approvato') and not public.gare_review_current(new.id) then raise exception 'Inviare la bozza alla revisione dopo i controlli aggiornati';end if;
 if coalesce((new.generation_snapshot->>'review_flow_version')::int,0)>=1 and new.status in('in_verifica','approvato') and TG_OP='UPDATE' and (new.category,new.signature_required) is distinct from (old.category,old.signature_required) then raise exception 'Metadati cambiati: salvare in bozza e ricontrollare prima della revisione';end if;
 if new.status='approvato' and coalesce((new.generation_snapshot->>'compiler_revision')::int,0)>=3 and lower(new.name) like '%.xml' and coalesce((new.generation_snapshot->'validation'->'official'->>'european_rules_passed')::boolean,false)=false then raise exception 'Validazione specifica DGUE aperta: acquisire la versione verificata sul servizio della procedura prima dell’approvazione';end if;
 if new.status='approvato' and coalesce((new.generation_snapshot->>'review_flow_version')::int,0)>=1 and TG_OP='UPDATE' and old.status not in('in_verifica','approvato') then raise exception 'Prima inviare il documento alla revisione';end if;
 return new;
end $$;
create trigger review_handoff_guard before insert or update on public.gare_documents for each row execute function gare_private.review_handoff_guard();

create function public.gare_review_check_current(cid uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.gare_review_checks c where c.id=cid and c.validator_revision=1 and gare_private.review_snapshot_current(c.document_id,c.dependency_snapshot))
$$;
grant execute on function public.gare_review_check_current(uuid) to authenticated;

-- complete local office
-- Isolated local Gare module. Existing company records are not rewritten.
create table public.gare_company_subjects(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.gare_companies(id),
 kind text not null check(kind in('impresa','partner','consorzio','consorziata','ausiliaria','subappaltatore')),
 name text not null check(length(trim(name)) between 2 and 300),tax_id text not null check(length(trim(tax_id)) between 2 and 100),
 profile jsonb not null default '{}',source_file_id uuid,source_locator text not null default '',
 status text not null default 'in_verifica' check(status in('in_verifica','confermato','archiviato')),
 verified_on date,expires_on date,review_note text not null default '',reviewed_by uuid references auth.users(id),
 revision int not null default 1,created_by uuid references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(company_id,id),unique(company_id,tax_id),foreign key(source_file_id) references public.gare_evidence_files(id),check(jsonb_typeof(profile)='object' and octet_length(profile::text)<20000)
);
create unique index gare_subject_primary on public.gare_company_subjects(company_id) where kind='impresa' and status<>'archiviato';
create index gare_subject_proof on public.gare_company_subjects(source_file_id);
alter table public.gare_company_subjects enable row level security;
create policy subject_read on public.gare_company_subjects for select to authenticated using(gare_private.role_for(company_id) is not null);
create policy subject_insert on public.gare_company_subjects for insert to authenticated with check(gare_private.role_for(company_id) in('admin','editor'));
create policy subject_update on public.gare_company_subjects for update to authenticated using(gare_private.role_for(company_id) in('admin','editor','reviewer')) with check(gare_private.role_for(company_id) in('admin','editor','reviewer'));
revoke all on public.gare_company_subjects from anon,authenticated;grant select,insert,update on public.gare_company_subjects to authenticated;
create function gare_private.subject_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from jsonb_each(new.profile) v where jsonb_typeof(v.value)<>'string' or length(v.value#>>'{}')>2000) then raise exception 'I dati del soggetto devono essere testi fino a 2000 caratteri';end if;
 if TG_OP='UPDATE' then
  if(new.id,new.company_id,new.created_by,new.created_at) is distinct from(old.id,old.company_id,old.created_by,old.created_at) then raise exception 'Identità interna del soggetto immutabile';end if;
  if gare_private.role_for(new.company_id)='reviewer' and(to_jsonb(new)-array['status','review_note','verified_on','reviewed_by','updated_at','revision']) is distinct from(to_jsonb(old)-array['status','review_note','verified_on','reviewed_by','updated_at','revision']) then raise exception 'Il revisore conferma il soggetto senza riscriverne i dati';end if;
  if(new.kind,new.name,new.tax_id,new.profile,new.source_file_id,new.source_locator,new.expires_on) is distinct from(old.kind,old.name,old.tax_id,old.profile,old.source_file_id,old.source_locator,old.expires_on) then new.status:='in_verifica';end if;
  new.revision:=old.revision+1;
 else new.created_by:=auth.uid();new.revision:=1;end if;
 if new.source_file_id is not null and not exists(select 1 from public.gare_evidence_files f where f.id=new.source_file_id and f.company_id=new.company_id) then raise exception 'Prova del soggetto appartenente a un’altra azienda';end if;
 if new.status='confermato' then
  if gare_private.role_for(new.company_id) not in('admin','reviewer') then raise exception 'La conferma del soggetto richiede un revisore';end if;
  if new.verified_on is null or new.verified_on>(now() at time zone 'Europe/Rome')::date or length(trim(new.review_note))<10 or length(trim(new.source_locator))<3 or new.source_file_id is null then raise exception 'Confermare il soggetto con prova allegata, riferimento, data e nota';end if;
  if exists(select 1 from public.gare_evidence_files f where f.previous_id=new.source_file_id) then raise exception 'Prova del soggetto sostituita: collegare la versione corrente';end if;
  new.reviewed_by:=auth.uid();
 else new.reviewed_by:=null;end if;
 new.updated_at:=clock_timestamp();return new;
end $$;
create trigger subject_guard before insert or update on public.gare_company_subjects for each row execute function gare_private.subject_guard();
create trigger subject_audit after insert or update on public.gare_company_subjects for each row execute function gare_private.audit_change();

alter table public.gare_company_assets add column subject_id uuid;
alter table public.gare_company_assets add constraint gare_asset_subject foreign key(company_id,subject_id) references public.gare_company_subjects(company_id,id);
create index gare_asset_subject on public.gare_company_assets(company_id,subject_id);
alter table public.gare_company_assets drop constraint gare_company_assets_kind_check;
alter table public.gare_company_assets add constraint gare_company_assets_kind_check check(kind in('qualification','experience','person','equipment','authority','economic','registration','certification','cel','insurance'));
create function gare_private.structured_asset_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare s public.gare_company_subjects;
begin
 if new.subject_id is not null then
  select * into s from public.gare_company_subjects where id=new.subject_id and company_id=new.company_id;
  if not found or s.status='archiviato' or lower(trim(s.tax_id))<>lower(trim(new.entity_tax_id)) then raise exception 'Titolare e identificativo della scheda non coincidono';end if;
  if TG_OP='UPDATE' and new.subject_id is distinct from old.subject_id then new.status:='in_verifica';new.reviewed_by:=null;end if;
 end if;
 if new.status='confermato' and new.kind in('registration','certification','cel','insurance') then
  if new.source_file_id is null or length(trim(new.entity_tax_id))<2 then raise exception 'Collegare prova originale e identificativo del titolare';end if;
  if new.kind='registration' and (coalesce(new.data->>'register','')='' or coalesce(new.data->>'number','')='') then raise exception 'Indicare registro e numero di iscrizione';end if;
  if new.kind='certification' and (coalesce(new.data->>'scheme','')='' or coalesce(new.data->>'issuer','')='' or coalesce(new.data->>'number','')='') then raise exception 'Indicare certificazione, emittente e numero';end if;
  if new.kind='insurance' and (coalesce(new.data->>'issuer','')='' or coalesce(new.data->>'number','')='' or coalesce(new.data->>'scope','')='') then raise exception 'Indicare assicuratore, polizza e ambito';end if;
  if new.kind='cel' then
   if coalesce(new.data->>'client','')='' or coalesce(new.data->>'number','')='' or coalesce(new.data->>'category','')='' or coalesce(new.data->>'period','')='' or coalesce(new.data->>'amount','')='' or coalesce(new.data->>'share','')='' then raise exception 'CEL: committente, numero, categoria, periodo, importo e quota dell’impresa obbligatori';end if;
   if new.data->>'share'!~'^([0-9]{1,2}([.,][0-9]{1,4})?|100([.,]0{1,4})?)$' then raise exception 'Quota CEL: percentuale numerica da 0 a 100, come nella prova';end if;
  end if;
 end if;return new;
end $$;
create trigger zz_structured_asset_guard before insert or update on public.gare_company_assets for each row execute function gare_private.structured_asset_guard();

create table public.gare_dgue_cases(
 id uuid primary key default gen_random_uuid(),company_id uuid not null,participation_id uuid not null,source_id uuid not null,source_sha256 text not null,
 subject_id uuid not null,subject_revision int not null,role text not null check(role in('SC','SCLE','LE','GM','OERON','OENRON')),group_name text not null default '' check(length(group_name)<=300),
 required boolean not null default true,scope_note text not null check(length(trim(scope_note))>=10),
 identity jsonb not null,answers jsonb not null default '{}',repetitions jsonb not null default '{}',lot_ids jsonb not null default '[]',
 generated_document_id uuid,revision int not null default 1,created_by uuid references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(company_id,participation_id) references public.gare_participations(company_id,id),
 foreign key(company_id,source_id) references public.gare_documents(company_id,id),foreign key(company_id,subject_id) references public.gare_company_subjects(company_id,id),
 foreign key(company_id,generated_document_id) references public.gare_documents(company_id,id),
 unique(company_id,participation_id,source_id,subject_id),unique(company_id,id),
 check(jsonb_typeof(identity)='object' and jsonb_typeof(answers)='object' and jsonb_typeof(repetitions)='object' and jsonb_typeof(lot_ids)='array' and octet_length(answers::text)+octet_length(repetitions::text)<2000000)
);
create index gare_dgue_cases_source on public.gare_dgue_cases(company_id,source_id);
create index gare_dgue_cases_subject on public.gare_dgue_cases(company_id,subject_id);
create index gare_dgue_cases_generated on public.gare_dgue_cases(company_id,generated_document_id);
alter table public.gare_dgue_cases enable row level security;
create policy dgue_cases_read on public.gare_dgue_cases for select to authenticated using(gare_private.role_for(company_id) is not null);
create policy dgue_cases_insert on public.gare_dgue_cases for insert to authenticated with check(gare_private.role_for(company_id) in('admin','editor'));
create policy dgue_cases_update on public.gare_dgue_cases for update to authenticated using(gare_private.role_for(company_id) in('admin','editor')) with check(gare_private.role_for(company_id) in('admin','editor'));
revoke all on public.gare_dgue_cases from anon,authenticated;grant select,insert,update on public.gare_dgue_cases to authenticated;
create function gare_private.dgue_case_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.gare_documents d join public.gare_participations p on p.tender_id=d.tender_id and p.id=new.participation_id where d.id=new.source_id and d.company_id=new.company_id and d.category='fonte' and d.sha256=new.source_sha256 and lower(d.name) like '%.xml') then raise exception 'Request non appartenente alla partecipazione';end if;
 if not public.gare_source_current(new.source_id) then raise exception 'Request storica: creare un fascicolo sulla fonte corrente';end if;
 if TG_OP='UPDATE' then
  if(new.id,new.company_id,new.participation_id,new.source_id,new.source_sha256,new.subject_id,new.created_by,new.created_at) is distinct from(old.id,old.company_id,old.participation_id,old.source_id,old.source_sha256,old.subject_id,old.created_by,old.created_at) then raise exception 'Soggetto e Request del fascicolo DGUE immutabili';end if;
  if(new.subject_revision,new.role,new.group_name,new.required,new.scope_note,new.identity,new.answers,new.repetitions,new.lot_ids) is distinct from(old.subject_revision,old.role,old.group_name,old.required,old.scope_note,old.identity,old.answers,old.repetitions,old.lot_ids) then new.revision:=old.revision+1;new.generated_document_id:=null;else new.revision:=old.revision;end if;
 else new.created_by:=auth.uid();new.revision:=1;end if;
 if new.generated_document_id is not null and not exists(select 1 from public.gare_documents d where d.id=new.generated_document_id and d.company_id=new.company_id and d.participation_id=new.participation_id and d.generation_snapshot->>'dgue_case_id'=new.id::text) then raise exception 'Documento generato non appartenente al fascicolo DGUE';end if;
 new.updated_at:=clock_timestamp();return new;
end $$;
create trigger dgue_case_guard before insert or update on public.gare_dgue_cases for each row execute function gare_private.dgue_case_guard();
create trigger dgue_case_audit after insert or update on public.gare_dgue_cases for each row execute function gare_private.audit_change();

create function gare_private.subject_current(snapshot jsonb) returns boolean language sql stable security invoker set search_path='' as $$
 select snapshot->'subject_snapshot' is null or snapshot->'subject_snapshot'='null'::jsonb or exists(select 1 from public.gare_company_subjects s where s.id=(snapshot->'subject_snapshot'->>'id')::uuid and s.revision=(snapshot->'subject_snapshot'->>'revision')::int and s.status='confermato' and s.reviewed_by is not null and s.verified_on<=(now() at time zone 'Europe/Rome')::date and(s.expires_on is null or s.expires_on>=(now() at time zone 'Europe/Rome')::date) and not exists(select 1 from public.gare_evidence_files f where f.previous_id=s.source_file_id))
$$;
create function public.gare_subject_current(did uuid) returns boolean language sql stable security invoker set search_path='' as $$select coalesce((select gare_private.subject_current(d.generation_snapshot) from public.gare_documents d where d.id=did),false)$$;
grant execute on function public.gare_subject_current(uuid) to authenticated;
create function gare_private.subject_document_guard() returns trigger language plpgsql security invoker set search_path='' as $$begin if new.status in('in_verifica','approvato') and not gare_private.subject_current(new.generation_snapshot) then raise exception 'Dati del soggetto cambiati o non verificati: rigenerare e revisionare';end if;return new;end $$;
create trigger subject_document_guard before insert or update on public.gare_documents for each row execute function gare_private.subject_document_guard();
alter function public.gare_review_current(uuid) rename to gare_review_before_subjects;
create function public.gare_review_current(did uuid) returns boolean language sql stable security invoker set search_path='' as $$select public.gare_review_before_subjects(did) and public.gare_subject_current(did)$$;
grant execute on function public.gare_review_current(uuid) to authenticated;
alter function public.gare_review_check_current(uuid) rename to gare_review_check_before_subjects;
create function public.gare_review_check_current(cid uuid) returns boolean language sql stable security invoker set search_path='' as $$select public.gare_review_check_before_subjects(cid) and exists(select 1 from public.gare_review_checks c where c.id=cid and public.gare_subject_current(c.document_id))$$;
grant execute on function public.gare_review_check_current(uuid) to authenticated;
alter function public.gare_blockers(uuid) rename to gare_blockers_before_office;
create function public.gare_blockers(pid uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin result:=public.gare_blockers_before_office(pid);
 if exists(select 1 from public.gare_documents d where d.participation_id=pid and not d.archived and public.gare_source_current(d.id) and not gare_private.subject_current(d.generation_snapshot)) then result:=result||jsonb_build_array('Dati del soggetto cambiati: rigenerare i documenti interessati');end if;
 if exists(select 1 from public.gare_dgue_cases c where c.participation_id=pid and c.required and(not public.gare_source_current(c.source_id) or not exists(select 1 from public.gare_documents d where d.id=c.generated_document_id and d.status='approvato' and not d.archived and public.gare_source_current(d.id) and d.generation_snapshot->>'case_revision'=c.revision::text))) then result:=result||jsonb_build_array('DGUE per operatore richiesto: completare e revisionare ciascun fascicolo del pacchetto');end if;
 return result;end $$;
grant execute on function public.gare_blockers(uuid) to authenticated;
create function gare_private.subject_export_guard() returns trigger language plpgsql security invoker set search_path='' as $$begin if not new.draft and exists(select 1 from jsonb_array_elements(new.manifest->'documents') d where not gare_private.subject_current(d->'generation_snapshot')) then raise exception 'Soggetto cambiato: rivedere i documenti del pacchetto';end if;return new;end $$;
create trigger subject_export_guard before insert on public.gare_exports for each row execute function gare_private.subject_export_guard();

create table public.gare_flow_measurements(
 id uuid primary key default gen_random_uuid(),company_id uuid not null,participation_id uuid not null,created_by uuid not null references auth.users(id),
 scenario text not null check(scenario in('singola','multilotto','raggruppamento')),started_at timestamptz not null default now(),ended_at timestamptz,
 manual_minutes numeric check(manual_minutes>0 and manual_minutes<=100000),note text not null default '',
 foreign key(company_id,participation_id) references public.gare_participations(company_id,id)
);
create index gare_measurements_participation on public.gare_flow_measurements(company_id,participation_id,started_at desc);
alter table public.gare_flow_measurements enable row level security;
create policy measurements_read on public.gare_flow_measurements for select to authenticated using(gare_private.role_for(company_id) is not null);
revoke all on public.gare_flow_measurements from anon,authenticated;grant select on public.gare_flow_measurements to authenticated;

create function gare_private.case_current(snapshot jsonb) returns boolean language sql stable security invoker set search_path='' as $$
 select snapshot->>'dgue_case_id' is null or exists(select 1 from public.gare_dgue_cases c where c.id=(snapshot->>'dgue_case_id')::uuid and c.revision=(snapshot->>'case_revision')::int and c.subject_revision=(snapshot->'subject_snapshot'->>'revision')::int and c.source_sha256=snapshot->>'source_sha256' and public.gare_source_current(c.source_id))
$$;
create or replace function public.gare_subject_current(did uuid) returns boolean language sql stable security invoker set search_path='' as $$select coalesce((select gare_private.subject_current(d.generation_snapshot) and gare_private.case_current(d.generation_snapshot) from public.gare_documents d where d.id=did),false)$$;
create or replace function gare_private.subject_document_guard() returns trigger language plpgsql security invoker set search_path='' as $$begin if new.status in('in_verifica','approvato') and(not gare_private.subject_current(new.generation_snapshot) or not gare_private.case_current(new.generation_snapshot)) then raise exception 'Soggetto o fascicolo DGUE cambiati: rigenerare e revisionare';end if;return new;end $$;
create or replace function gare_private.subject_export_guard() returns trigger language plpgsql security invoker set search_path='' as $$begin if not new.draft and exists(select 1 from jsonb_array_elements(new.manifest->'documents') d where not gare_private.subject_current(d->'generation_snapshot') or not gare_private.case_current(d->'generation_snapshot')) then raise exception 'Soggetto o fascicolo DGUE cambiati: rivedere il pacchetto';end if;return new;end $$;

create unique index gare_measurement_active on public.gare_flow_measurements(company_id,participation_id,created_by) where ended_at is null;

-- gare catalog provenance
create function public.gare_create_catalog_tender(payload jsonb, lots jsonb, source_key text)
returns uuid
language plpgsql security invoker set search_path = '' as $$
declare tender_id uuid; label text;
begin
 label := case source_key
  when 'ANAC_DATA' then 'ANAC · CSV verificato dall’impresa'
  when 'ANAC_PVL' then 'ANAC · Pubblicità a valore legale'
  when 'SINTEL' then 'Sintel · acquisizione manuale'
  when 'ACQUISTI' then 'Acquisti in Rete · acquisizione manuale'
  when 'SATER' then 'SATER · acquisizione manuale'
 end;
 if label is null then raise exception 'Fonte non riconosciuta'; end if;
 tender_id := public.gare_create_tender(payload, lots);
 update public.gare_tenders set source = label where id = tender_id;
 return tender_id;
end;
$$;
revoke all on function public.gare_create_catalog_tender(jsonb, jsonb, text) from public;
grant execute on function public.gare_create_catalog_tender(jsonb, jsonb, text) to authenticated;

-- gare lot delivery
create function public.gare_record_lot_submission(
 pid uuid, package_id uuid, lot_ids uuid[], receipt uuid,
 submitted timestamptz, reference text, expected_revision int
) returns uuid language plpgsql security invoker set search_path='' as $$
declare
 p public.gare_participations;
 sid uuid;
 phase_name text;
 procedure_kind text;
begin
 select * into p from public.gare_participations where id=pid for update;
 if not found or p.revision<>expected_revision then
  raise exception 'Fascicolo modificato: ricaricare prima di registrare la presentazione';
 end if;

 if coalesce(cardinality(lot_ids),0)=0
  or cardinality(lot_ids)<>(select count(distinct l.id) from unnest(lot_ids) l(id))
  or exists(
   select 1 from unnest(lot_ids) l(id) where not exists(
    select 1 from public.gare_participation_lots pl where pl.participation_id=pid and pl.lot_id=l.id
   )
  ) then raise exception 'Selezionare i lotti effettivamente presentati'; end if;

 if not exists(
  select 1 from public.gare_exports e
  where e.id=package_id and e.participation_id=pid and not e.draft
   and not exists (
    select 1 from unnest(lot_ids) l(id) where not exists(
     select 1 from jsonb_array_elements(e.manifest->'lots') m where m->>'id'=l.id::text
    )
   )
 ) then raise exception 'Scegliere un pacchetto finale che includa i lotti selezionati'; end if;

 if receipt is not null and not exists(
  select 1 from public.gare_documents d where d.id=receipt and d.participation_id=pid and d.category='ricevuta'
   and (d.lot_id is null or (cardinality(lot_ids)=1 and d.lot_id=lot_ids[1]))
 ) then raise exception 'Selezionare una ricevuta del lotto o comune ai lotti presentati'; end if;

 if exists(select 1 from public.gare_journeys j where j.participation_id=pid) then
  return public.gare_record_guided_submission(pid,package_id,lot_ids,receipt,submitted,reference,expected_revision);
 end if;

 -- The manual path records an event that already happened using a final snapshot.
 -- Current preparation checks can change after actual delivery, including the deadline.
 select kind into procedure_kind from public.gare_tenders where id=p.tender_id;
 phase_name:=case procedure_kind when 'manifestazione' then 'interesse' when 'albo' then 'iscrizione' else 'offerta' end;

 select s.id into sid from public.gare_submissions s
 where s.participation_id=pid and s.export_id=package_id and s.submitted_at=submitted
  and s.protocol=reference and s.receipt_id is not distinct from receipt
  and lot_ids @> array(
   select l.lot_id from public.gare_submission_lots l where l.submission_id=s.id and l.phase=phase_name
  )
  and lot_ids <@ array(
   select l.lot_id from public.gare_submission_lots l where l.submission_id=s.id and l.phase=phase_name and l.state in ('dichiarata','con_ricevuta')
  )
 limit 1;
 if found then return sid; end if;

 insert into public.gare_submissions(company_id,participation_id,export_id,receipt_id,submitted_at,protocol)
 values(p.company_id,pid,package_id,receipt,submitted,reference) returning id into sid;

 update public.gare_submission_lots l
 set state='sostituita',reason='Nuova presentazione dichiarata '||sid::text
 where l.participation_id=pid and l.lot_id=any(lot_ids) and l.phase=phase_name and l.state in ('dichiarata','con_ricevuta');

 insert into public.gare_submission_lots(company_id,participation_id,submission_id,lot_id,phase,state)
 select p.company_id,pid,sid,l.id,phase_name,case when receipt is null then 'dichiarata' else 'con_ricevuta' end
 from unnest(lot_ids) l(id);

 if not exists(
  select 1 from public.gare_participation_lots pl where pl.participation_id=pid and not exists(
   select 1 from public.gare_submission_lots l where l.participation_id=pid and l.lot_id=pl.lot_id
    and l.phase=phase_name and l.state in ('dichiarata','con_ricevuta')
  )
 ) then
  update public.gare_participations set stage='presentata' where id=pid and stage<>'presentata';
 end if;
 return sid;
end $$;

revoke all on function public.gare_record_lot_submission(uuid,uuid,uuid[],uuid,timestamptz,text,int) from public;
grant execute on function public.gare_record_lot_submission(uuid,uuid,uuid[],uuid,timestamptz,text,int) to authenticated;

create function gare_private.delivery_lot_receipt_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if new.receipt_id is not null and not exists(
  select 1 from public.gare_documents d where d.id=new.receipt_id and d.participation_id=new.participation_id
   and d.category='ricevuta' and (d.lot_id is null or d.lot_id=new.lot_id)
 ) then raise exception 'Selezionare una ricevuta del lotto o comune ai lotti'; end if;
 return new;
end $$;
create trigger delivery_lot_receipt_guard before insert or update of receipt_id on public.gare_submission_lots
 for each row execute function gare_private.delivery_lot_receipt_guard();

-- Draft restrictions are enforced on all writes including the worker.
alter table public.gare_participations add constraint gare_pilot_draft_stage
 check (stage in ('in_valutazione','in_preparazione','in_revisione','non_partecipare') and outcome = '');
alter table public.gare_documents add constraint gare_pilot_draft_document
 check (status in ('bozza','in_verifica') and category <> 'ricevuta');
alter table public.gare_exports add constraint gare_pilot_draft_export check (draft);
alter table public.gare_submissions add constraint gare_pilot_no_submission check (false);
alter table public.gare_submission_lots add constraint gare_pilot_no_lot_submission check (false);
revoke insert, update, delete on public.gare_submissions, public.gare_submission_lots from anon, authenticated;
revoke execute on function public.gare_record_submission(uuid,uuid,uuid,timestamptz,text,int),
 public.gare_record_guided_submission(uuid,uuid,uuid[],uuid,timestamptz,text,int),
 public.gare_record_lot_submission(uuid,uuid,uuid[],uuid,timestamptz,text,int)
 from public, anon, authenticated, service_role;

-- Scope default privileges on new Gare objects and keep the gate off at deploy.
do $$
declare item record;
begin
 for item in
  select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'gare\_%'
 loop
  if not item.relrowsecurity then raise exception 'RLS assente su %', item.relname; end if;
  execute format('revoke all on public.%I from public, anon', item.relname);
  execute format('revoke truncate, references, trigger on public.%I from authenticated', item.relname);
  execute format('grant select, insert, update, delete on public.%I to service_role', item.relname);
 end loop;
 for item in
  select p.oid::regprocedure as fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'gare\_%'
 loop
  execute format('revoke execute on function %s from public, anon', item.fn);
 end loop;
end $$;

insert into public.gare_companies (id, name)
 select id, name from public.companies where id = 'd2000000-0000-4000-a000-000000000002';
insert into gare_private.pilot (company_id) select id from public.gare_companies;
