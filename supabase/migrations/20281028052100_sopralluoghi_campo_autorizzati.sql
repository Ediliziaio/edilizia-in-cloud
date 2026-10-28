-- Approved and applied 2026-10-28 after isolated PostgreSQL and UI tests.
-- No existing assignment is enabled by this migration.
set local lock_timeout = '3s';
set local statement_timeout = '60s';
create schema if not exists survey_private;
revoke all on schema survey_private from public, anon;
grant usage on schema survey_private to authenticated, service_role;
alter table public.survey_assignees add column if not exists field_authorized boolean not null default false;
alter table public.surveys add column if not exists field_review_note text;

create or replace function survey_private.field_actor() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.user_roles r where r.user_id=(select auth.uid())
      and r.role::text in ('employee','subcontractor'));
$$;
create or replace function survey_private.office_allowed(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and not survey_private.field_actor()
    and not public.utente_bloccato() and not public.utente_e_cliente_esterno()
    and c=public.get_my_company_id()
    and c=any(public.aziende_con_permesso('can_view_sopralluoghi'))
    and not public.utente_sola_lettura(c);
$$;
-- Definer only for non-recursive, current-user policy lookups, never arbitrary user IDs.
create or replace function survey_private.field_allowed(sid uuid, writing boolean default false) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and survey_private.field_actor()
    and not public.utente_bloccato() and not public.utente_e_cliente_esterno()
    and exists (select 1 from public.surveys s
      join public.survey_assignees a on a.survey_id=s.id and a.user_id=(select auth.uid())
      join public.profiles p on p.id=a.user_id and p.company_id=s.company_id
      where s.id=sid and s.company_id=public.get_my_company_id() and s.deleted_at is null
        and a.field_authorized and s.status<>'cancelled'
        and (not writing or (a.role<>'observer' and s.status in ('draft','in_progress')
          and not public.utente_sola_lettura(s.company_id)
          and s.client_signature_at is null)));
$$;
create or replace function survey_private.storage_allowed(path text, writing boolean) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare parts text[] := string_to_array(path,'/');
begin
  if auth.uid() is null or array_length(parts,1)<3
    or parts[1] is distinct from public.get_my_company_id()::text
    or parts[2] !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then return false; end if;
  return survey_private.field_allowed(parts[2]::uuid,writing);
end;
$$;
revoke all on all functions in schema survey_private from public, anon;
grant execute on all functions in schema survey_private to authenticated, service_role;

-- Restrictive policies compose with existing office policies instead of replacing them.
drop policy if exists survey_field_read on public.surveys;
create policy survey_field_read on public.surveys as restrictive for select to authenticated
using (not (select survey_private.field_actor()) or survey_private.field_allowed(id,false));
drop policy if exists survey_field_update on public.surveys;
create policy survey_field_update on public.surveys as restrictive for update to authenticated
using (not (select survey_private.field_actor()) or survey_private.field_allowed(id,true))
with check (not (select survey_private.field_actor()) or survey_private.field_allowed(id,false));
drop policy if exists survey_field_create on public.surveys;
create policy survey_field_create on public.surveys as restrictive for insert to authenticated
with check (not (select survey_private.field_actor()));

-- Legacy listing must not bypass the assignment + authorization policies.
alter function public.surveys_assigned_to_me() security invoker;

-- Creating a quote/project is an office action, never a field-survey privilege.
create or replace function public.sr_create_progetto_da_sopralluogo(p_sopralluogo_id uuid,p_cliente_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_survey record; v_progetto_id uuid; begin
  if auth.uid() is null or survey_private.field_actor() then raise exception 'Creazione preventivo riservata all’ufficio'; end if;
  select * into v_survey from public.surveys where id=p_sopralluogo_id;
  if not found or not survey_private.office_allowed(v_survey.company_id) then raise exception 'Sopralluogo non accessibile dall’ufficio'; end if;
  insert into public.sr_progetti(company_id,sopralluogo_id,sopralluogo_eseguito_il,
    cliente_id,cantiere_indirizzo,cantiere_citta,cantiere_cap,cantiere_provincia,tipo_intervento,created_by)
  values(v_survey.company_id,p_sopralluogo_id,coalesce(v_survey.completed_at::date,current_date),
    coalesce(p_cliente_id,v_survey.client_id),v_survey.address,v_survey.city,v_survey.zip,v_survey.province,'sostituzione',auth.uid()) returning id into v_progetto_id;
  insert into public.sr_progetti_audit(progetto_id,company_id,user_id,event_type,event_data)
    values(v_progetto_id,v_survey.company_id,auth.uid(),'created_from_sopralluogo',jsonb_build_object('sopralluogo_id',p_sopralluogo_id));
  return v_progetto_id;
end $$;
revoke all on function public.sr_create_progetto_da_sopralluogo(uuid,uuid) from public,anon;
grant execute on function public.sr_create_progetto_da_sopralluogo(uuid,uuid) to authenticated;
drop policy if exists survey_field_delete on public.surveys;
create policy survey_field_delete on public.surveys as restrictive for delete to authenticated
using (not (select survey_private.field_actor()));

do $$ declare t text; begin
  foreach t in array array['survey_areas','survey_elements','survey_media'] loop
    execute format('drop policy if exists field_read on public.%I',t);
    execute format('create policy field_read on public.%I as restrictive for select to authenticated using (not (select survey_private.field_actor()) or survey_private.field_allowed(survey_id,false))',t);
    execute format('drop policy if exists field_insert on public.%I',t);
    execute format('create policy field_insert on public.%I as restrictive for insert to authenticated with check (not (select survey_private.field_actor()) or survey_private.field_allowed(survey_id,true))',t);
    execute format('drop policy if exists field_update on public.%I',t);
    execute format('create policy field_update on public.%I as restrictive for update to authenticated using (not (select survey_private.field_actor()) or survey_private.field_allowed(survey_id,true)) with check (not (select survey_private.field_actor()) or survey_private.field_allowed(survey_id,true))',t);
    execute format('drop policy if exists field_delete on public.%I',t);
    execute format('create policy field_delete on public.%I as restrictive for delete to authenticated using (not (select survey_private.field_actor()) or survey_private.field_allowed(survey_id,true))',t);
  end loop;
end $$;
drop policy if exists field_assignees_read on public.survey_assignees;
create policy field_assignees_read on public.survey_assignees as restrictive for select to authenticated
using (not (select survey_private.field_actor()) or (user_id=(select auth.uid()) and survey_private.field_allowed(survey_id,false)));
do $$ declare cmd text; begin
 foreach cmd in array array['insert','update','delete'] loop
   execute format('drop policy if exists field_assignees_%s on public.survey_assignees',cmd);
   execute format('create policy field_assignees_%s on public.survey_assignees as restrictive for %s to authenticated %s',cmd,cmd,
     case when cmd='insert' then 'with check (false or not (select survey_private.field_actor()))'
       when cmd='delete' then 'using (not (select survey_private.field_actor()))'
       else 'using (not (select survey_private.field_actor())) with check (not (select survey_private.field_actor()))' end);
 end loop;
end $$;
do $storage$ declare cmd text; begin
 foreach cmd in array array['select','insert','update','delete'] loop
   execute format('drop policy if exists field_surveys_%s on storage.objects',cmd);
   execute format('create policy field_surveys_%s on storage.objects as restrictive for %s to authenticated %s',cmd,cmd,
     case when cmd='insert' then $$with check (bucket_id<>'surveys' or not (select survey_private.field_actor()) or survey_private.storage_allowed(name,true))$$
       when cmd='select' then $$using (bucket_id<>'surveys' or not (select survey_private.field_actor()) or survey_private.storage_allowed(name,false))$$
       when cmd='delete' then $$using (bucket_id<>'surveys' or not (select survey_private.field_actor()) or survey_private.storage_allowed(name,true))$$
       else $$using (bucket_id<>'surveys' or not (select survey_private.field_actor()) or survey_private.storage_allowed(name,true)) with check (bucket_id<>'surveys' or not (select survey_private.field_actor()) or survey_private.storage_allowed(name,true))$$ end);
 end loop;
end $storage$;

create or replace function survey_private.guard_assignment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c uuid; begin
  select company_id into c from public.surveys where id=coalesce(new.survey_id,old.survey_id);
  if auth.uid() is not null and not survey_private.office_allowed(c) then raise exception 'Assegnazione riservata all’ufficio autorizzato'; end if;
  if tg_op<>'DELETE' and not exists (select 1 from public.profiles p where p.id=new.user_id and p.company_id=c) then raise exception 'Utente esterno all’azienda'; end if;
  if tg_op='UPDATE' and (new.survey_id<>old.survey_id or new.user_id<>old.user_id) then raise exception 'Collegamento assegnazione immutabile'; end if;
  if tg_op<>'DELETE' then new.assigned_by=coalesce(auth.uid(),new.assigned_by); end if;
  insert into public.survey_activity_log(survey_id,user_id,event_type,event_data)
    values(coalesce(new.survey_id,old.survey_id),auth.uid(),'field_assignment:'||lower(tg_op),
      jsonb_build_object('user_id',coalesce(new.user_id,old.user_id),'authorized',case when tg_op='DELETE' then false else new.field_authorized end));
  return coalesce(new,old);
end $$;
drop trigger if exists survey_field_assignment_guard on public.survey_assignees;
create trigger survey_field_assignment_guard before insert or update or delete on public.survey_assignees
for each row execute function survey_private.guard_assignment();

create or replace function survey_private.guard_header() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and new.status is distinct from old.status
    and (new.status='reviewed' or (old.status='completed' and new.status='in_progress'))
    and (not survey_private.office_allowed(old.company_id) or length(trim(coalesce(new.field_review_note,'')))<5) then
    raise exception 'Revisione dell’ufficio e motivazione obbligatorie';
  end if;
  if survey_private.field_actor() then
    if not survey_private.field_allowed(old.id,true) then raise exception 'Rilievo non modificabile o accesso revocato'; end if;
    if (to_jsonb(new)-array['header_data','notes','general_audio_url','general_audio_transcription','status','started_at','completed_at','updated_at'])
      is distinct from (to_jsonb(old)-array['header_data','notes','general_audio_url','general_audio_transcription','status','started_at','completed_at','updated_at']) then
      raise exception 'L’operatore può modificare solo dati tecnici e note';
    end if;
    if new.status<>old.status and not ((old.status='draft' and new.status='in_progress')
      or (old.status in ('draft','in_progress') and new.status='completed')) then raise exception 'Stato riservato alla revisione dell’ufficio'; end if;
    if new.status='completed' and old.status<>'completed' then
      if not exists(select 1 from public.survey_elements where survey_id=old.id) then raise exception 'Aggiungi almeno un elemento prima della consegna'; end if;
      new.completed_at=now();
    end if;
  end if;
  if new.status is distinct from old.status then
    insert into public.survey_activity_log(survey_id,user_id,event_type,event_data)
      values(old.id,auth.uid(),'review_transition',jsonb_build_object('from',old.status,'to',new.status,'note',new.field_review_note));
  end if;
  return new;
end $$;
drop trigger if exists survey_field_header_guard on public.surveys;
create trigger survey_field_header_guard before update on public.surveys for each row execute function survey_private.guard_header();

create or replace function survey_private.guard_child() returns trigger
language plpgsql security definer set search_path = '' as $$
declare sid uuid:=coalesce(new.survey_id,old.survey_id); parent_status text; signature_at timestamptz; begin
  if not survey_private.field_actor() then return coalesce(new,old); end if;
  -- Parent lock serializes uploads/edits and hand-off: no write can race past submission.
  select status,client_signature_at into parent_status,signature_at from public.surveys where id=sid for update;
  if parent_status not in ('draft','in_progress') or signature_at is not null or not survey_private.field_allowed(sid,true) then raise exception 'Rilievo in revisione o non autorizzato'; end if;
  if tg_op='UPDATE' and new.survey_id<>old.survey_id then raise exception 'Sopralluogo immutabile'; end if;
  if tg_op<>'DELETE' and tg_table_name in ('survey_elements','survey_media') then
    if (to_jsonb(new)->>'area_id') is not null and not exists(select 1 from public.survey_areas a where a.id=(to_jsonb(new)->>'area_id')::uuid and a.survey_id=sid) then raise exception 'Area estranea al rilievo'; end if;
    if tg_table_name='survey_media' and (to_jsonb(new)->>'element_id') is not null and not exists(select 1 from public.survey_elements e where e.id=(to_jsonb(new)->>'element_id')::uuid and e.survey_id=sid and e.area_id is not distinct from (to_jsonb(new)->>'area_id')::uuid) then raise exception 'Elemento estraneo al rilievo'; end if;
    if tg_table_name='survey_media' then
      if new.type='signature' then raise exception 'Firma riservata all’ufficio'; end if;
      if new.storage_path is null or not survey_private.storage_allowed(new.storage_path,true) then raise exception 'Percorso foto non autorizzato'; end if;
      new.created_by=auth.uid();
    end if;
  end if;
  return coalesce(new,old);
end $$;
do $$ declare t text; begin
 foreach t in array array['survey_areas','survey_elements','survey_media'] loop
   execute format('drop trigger if exists survey_field_child_guard on public.%I',t);
   execute format('create trigger survey_field_child_guard before insert or update or delete on public.%I for each row execute function survey_private.guard_child()',t);
 end loop;
end $$;
revoke all on all functions in schema survey_private from public, anon;

create or replace function public.survey_field_access(p_survey_id uuid default null) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('can_view',case when p_survey_id is null then exists(select 1 from public.surveys s where survey_private.field_allowed(s.id,false)) else survey_private.field_allowed(p_survey_id,false) end,
    'can_edit',coalesce(survey_private.field_allowed(p_survey_id,true),false));
$$;
create or replace function public.survey_submit_for_review(p_survey_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.surveys where id=p_survey_id for update;
  if not survey_private.field_allowed(p_survey_id,true) then raise exception 'Consegna non autorizzata'; end if;
  update public.surveys set status='completed',completed_at=now() where id=p_survey_id;
end $$;
create or replace function public.survey_office_review(p_survey_id uuid,p_accept boolean,p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.surveys; begin
  select * into s from public.surveys where id=p_survey_id for update;
  if not found or not survey_private.office_allowed(s.company_id) then raise exception 'Revisione non autorizzata'; end if;
  if s.status<>'completed' then raise exception 'Il rilievo non è in attesa di revisione'; end if;
  if length(trim(coalesce(p_note,'')))<5 then raise exception 'Indica l’esito o il motivo della restituzione'; end if;
  update public.surveys set status=case when p_accept then 'reviewed' else 'in_progress' end,
    reviewed_at=case when p_accept then now() else null end,field_review_note=trim(p_note) where id=s.id;
end $$;
revoke all on function public.survey_field_access(uuid),public.survey_submit_for_review(uuid),public.survey_office_review(uuid,boolean,text) from public,anon;
grant execute on function public.survey_field_access(uuid),public.survey_submit_for_review(uuid),public.survey_office_review(uuid,boolean,text) to authenticated;

drop policy if exists field_activity_read on public.survey_activity_log;
create policy field_activity_read on public.survey_activity_log as restrictive for select to authenticated
using (not (select survey_private.field_actor()) or survey_private.field_allowed(survey_id,false));
drop policy if exists field_activity_insert on public.survey_activity_log;
create policy field_activity_insert on public.survey_activity_log as restrictive for insert to authenticated
with check (not (select survey_private.field_actor()));
