set local lock_timeout='3s';set local statement_timeout='60s';
alter table public.marketing_calendars add column if not exists team_calendar_ids uuid[] not null default '{}';
alter table public.marketing_calendars add column if not exists team_member_priorities jsonb not null default '{}';
alter table public.marketing_calendars add column if not exists team_assignment_strategy text not null default 'round_robin';
alter table public.marketing_calendars drop constraint if exists calendar_team_strategy;
alter table public.marketing_calendars add constraint calendar_team_strategy check(team_assignment_strategy in ('round_robin','priority') and cardinality(team_calendar_ids)<=20);
alter table public.appointments add column if not exists booking_reminders_handled boolean not null default false;
alter table public.appointments add column if not exists booking_member_calendar_id uuid references public.marketing_calendars(id) on delete set null;
create schema if not exists private;
create table if not exists private.calendar_team_turns(calendar_id uuid not null references public.marketing_calendars(id) on delete cascade,user_id uuid not null,last_assigned_at timestamptz not null default now(),primary key(calendar_id,user_id));
alter table private.calendar_team_turns enable row level security;
revoke all on private.calendar_team_turns from public,anon,authenticated;
grant usage on schema private to service_role;
grant all on private.calendar_team_turns to service_role;
-- Event identifiers remain server-only; browser clients cannot forge provider links.
create table if not exists public.appointment_outlook_links(appointment_id uuid primary key references public.appointments(id) on delete cascade,company_id uuid not null references public.companies(id),connection_id uuid not null references public.outlook_calendar_connections(id) on delete cascade,user_id uuid not null,calendar_id text not null,event_id text not null);
create index if not exists outlook_booking_company on public.appointment_outlook_links(company_id);
create index if not exists outlook_booking_connection on public.appointment_outlook_links(connection_id);
alter table public.appointment_outlook_links enable row level security;
revoke all on public.appointment_outlook_links from public,anon,authenticated;
grant all on public.appointment_outlook_links to service_role;
create or replace function public.validate_calendar_team() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare members integer; owners integer;
begin
 if jsonb_typeof(new.team_member_priorities)<>'object' then raise exception 'Priorità squadra non valide'; end if;
 if exists(select 1 from jsonb_each(new.team_member_priorities) e where not (e.key=any(new.team_calendar_ids::text[])) or e.value not in ('1'::jsonb,'2'::jsonb,'3'::jsonb)) then raise exception 'Priorità squadra non valide'; end if;
 if cardinality(new.team_calendar_ids)>0 then
  if new.calendar_type<>'team' then raise exception 'Solo un calendario di squadra può avere partecipanti'; end if;
  select count(*),count(distinct c.owner_id) into members,owners from public.marketing_calendars c
   where c.id=any(new.team_calendar_ids) and c.company_id=new.company_id and c.id<>new.id and c.calendar_type='personal' and c.is_active and c.owner_id is not null
   and public.has_permission_for_company(c.owner_id,'can_view_calendar',new.company_id);
  if members<>cardinality(new.team_calendar_ids) or owners<>members then raise exception 'Scegli calendari personali attivi della stessa azienda, uno per persona'; end if;
 end if;
 return new;
end $$;
revoke all on function public.validate_calendar_team() from public,anon,authenticated;
drop trigger if exists validate_calendar_team on public.marketing_calendars;
create trigger validate_calendar_team before insert or update of team_calendar_ids,team_member_priorities,calendar_type,company_id on public.marketing_calendars for each row execute function public.validate_calendar_team();

create or replace function public.calendar_window_available(p_calendar uuid,p_date date,p_start time,p_end time,p_grid boolean default false) returns boolean
language sql stable security invoker set search_path=public,pg_temp as $$
 select exists(select 1 from public.marketing_calendar_availability a join public.marketing_calendars c on c.id=a.calendar_id
 where a.calendar_id=p_calendar and a.is_enabled and a.start_time<=p_start and a.end_time>=p_end
 and case when exists(select 1 from public.marketing_calendar_availability d where d.calendar_id=p_calendar and d.specific_date=p_date) then a.specific_date=p_date else a.specific_date is null and a.day_of_week=extract(dow from p_date)::int end
 and (not p_grid or mod(extract(epoch from (p_start-a.start_time))::int,60*greatest(5,coalesce(nullif(c.slot_interval_min,0),c.duration_minutes,30)))=0))
$$;
revoke all on function public.calendar_window_available(uuid,date,time,time,boolean) from public,anon,authenticated;
grant execute on function public.calendar_window_available(uuid,date,time,time,boolean) to service_role;

create or replace function public.calendar_booking_candidates(p_calendar uuid,p_date date,p_start time,p_exclude uuid default null)
returns table(user_id uuid,member_calendar_id uuid) language sql stable security invoker set search_path=public,private,pg_temp as $$
 with pool as(select *,p_date+p_start as local_start,p_date+p_start+make_interval(mins=>duration_minutes) as local_end from public.marketing_calendars where id=p_calendar and is_active),
 members as(select p.*,m.id as member_id,m.owner_id as member_owner,m.min_notice_minutes as member_notice,m.max_per_day as member_max,
 greatest(coalesce(p.buffer_before_min,0),coalesce(m.buffer_before_min,0)) as before_min,
 greatest(coalesce(p.buffer_after_min,0),coalesce(m.buffer_after_min,0)) as after_min, ids.ord
 from pool p cross join lateral unnest(case when p.calendar_type='team' and cardinality(p.team_calendar_ids)>0 then p.team_calendar_ids else array[p.id] end) with ordinality ids(id,ord)
 join public.marketing_calendars m on m.id=ids.id and m.company_id=p.company_id and m.is_active and (m.id=p.id or m.calendar_type='personal'))
 select m.member_owner,m.member_id from members m left join private.calendar_team_turns t on t.calendar_id=m.id and t.user_id=m.member_owner
 where (m.member_id=m.id or public.has_permission_for_company(m.member_owner,'can_view_calendar',m.company_id)) and m.local_end::date<=p_date+1 and m.local_end<=p_date+time '24:00'
 and ((m.local_start at time zone 'Europe/Rome') at time zone 'Europe/Rome')=m.local_start and ((m.local_end at time zone 'Europe/Rome') at time zone 'Europe/Rome')=m.local_end
 and p_date<=current_date+365 and (m.local_start at time zone 'Europe/Rome')>=now()+make_interval(mins=>greatest(coalesce(m.min_notice_minutes,0),coalesce(m.member_notice,0)))
 and (p_exclude is null or exists(select 1 from public.appointments a where a.id=p_exclude and a.calendar_id=m.id and a.company_id=m.company_id and a.assigned_to=m.member_owner))
 and public.calendar_window_available(m.id,p_date,p_start,(case when m.local_end::date>p_date then time '24:00' else m.local_end::time end),true)
 and public.calendar_window_available(m.member_id,p_date,p_start,(case when m.local_end::date>p_date then time '24:00' else m.local_end::time end),false)
 and (m.max_per_day is null or m.max_per_day<=0 or (select count(*) from public.appointments a where a.calendar_id=m.id and a.appointment_date=p_date and a.id is distinct from p_exclude and not coalesce(a.is_blocked_slot,false) and coalesce(a.status,'') not in ('annullato','cancellato','cancelled','disdetto'))<m.max_per_day)
 and (m.member_max is null or m.member_max<=0 or (select count(*) from public.appointments a where a.assigned_to=m.member_owner and a.company_id=m.company_id and a.appointment_date=p_date and a.id is distinct from p_exclude and not coalesce(a.is_blocked_slot,false) and coalesce(a.status,'') not in ('annullato','cancellato','cancelled','disdetto'))<m.member_max)
 and not exists(select 1 from public.appointments a where a.company_id=m.company_id and a.appointment_date=p_date and a.id is distinct from p_exclude and (a.assigned_to=m.member_owner or (a.calendar_id=m.id and a.assigned_to is null)) and coalesce(a.status,'') not in ('annullato','cancellato','cancelled','disdetto')
 and m.local_start-make_interval(mins=>m.before_min)<p_date+coalesce(a.appointment_end_time,a.appointment_time+make_interval(mins=>m.duration_minutes))+make_interval(mins=>m.after_min)
 and m.local_end+make_interval(mins=>m.after_min)>p_date+a.appointment_time-make_interval(mins=>m.before_min))
 and not exists(select 1 from public.impegni_interni_persona b where b.user_id=m.member_owner and (p_exclude is null or b.appointment_id is distinct from p_exclude)
 and (m.local_start at time zone 'Europe/Rome')-make_interval(mins=>m.before_min)<b.end_at and (m.local_end at time zone 'Europe/Rome')+make_interval(mins=>m.after_min)>b.start_at)
 and (exists(select 1 from public.user_calendar_preferences u where u.user_id=m.member_owner and u.block_busy_slots=false) or not exists(select 1 from public.unified_calendar_busy_slots b where b.user_id=m.member_owner
 and not exists(select 1 from public.google_calendar_event_map g where b.provider='google' and g.appointment_id=p_exclude and g.company_id=m.company_id and g.google_event_id=b.external_id)
 and not exists(select 1 from public.apple_calendar_event_map g where b.provider='apple' and g.appointment_id=p_exclude and g.company_id=m.company_id and g.caldav_uid=b.external_id)
 and not exists(select 1 from public.appointment_outlook_links g where b.provider='outlook' and g.appointment_id=p_exclude and g.company_id=m.company_id and g.event_id=b.external_id)
 and (m.local_start at time zone 'Europe/Rome')-make_interval(mins=>m.before_min)<b.end_at and (m.local_end at time zone 'Europe/Rome')+make_interval(mins=>m.after_min)>b.start_at))
 order by case when m.team_assignment_strategy='priority' then coalesce((m.team_member_priorities->>m.member_id::text)::int,m.ord) end, t.last_assigned_at nulls first,m.ord,m.member_owner
$$;
revoke all on function public.calendar_booking_candidates(uuid,date,time,uuid) from public,anon,authenticated;
grant execute on function public.calendar_booking_candidates(uuid,date,time,uuid) to service_role;
create or replace function public.calendar_booking_slots(p_calendar uuid,p_date date,p_exclude uuid default null) returns text[]
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(array_agg(distinct to_char(s,'HH24:MI') order by to_char(s,'HH24:MI')),'{}') from public.marketing_calendars c
 join public.marketing_calendar_availability a on a.calendar_id=c.id and a.is_enabled
 cross join lateral generate_series(p_date+a.start_time,p_date+a.end_time-make_interval(mins=>c.duration_minutes),make_interval(mins=>greatest(5,coalesce(nullif(c.slot_interval_min,0),c.duration_minutes,30)))) s
 where c.id=p_calendar and exists(select 1 from public.calendar_booking_candidates(c.id,p_date,s::time,p_exclude))
$$;
revoke all on function public.calendar_booking_slots(uuid,date,uuid) from public,anon,authenticated;
grant execute on function public.calendar_booking_slots(uuid,date,uuid) to service_role;

create table if not exists private.calendar_booking_requests(calendar_id uuid not null references public.marketing_calendars(id) on delete cascade,request_key text not null,appointment_id uuid not null references public.appointments(id) on delete cascade,primary key(calendar_id,request_key));
alter table private.calendar_booking_requests enable row level security;
revoke all on private.calendar_booking_requests from public,anon,authenticated;
grant all on private.calendar_booking_requests to service_role;
create or replace function public.reserve_calendar_booking(p_calendar_id uuid,p_company_id uuid,p_data date,p_inizio time,p_fine time,p_buffer_prima integer,p_buffer_dopo integer,p_durata_min integer,p_riga jsonb) returns jsonb
language plpgsql security invoker set search_path=public,private,pg_temp as $$
declare c public.marketing_calendars; chosen uuid; member_id uuid; who uuid; existing uuid:=nullif(p_riga->>'appointment_id','')::uuid; result uuid; v_request_key text:=nullif(p_riga->>'request_key','');
begin
 select * into c from public.marketing_calendars where id=p_calendar_id and company_id=p_company_id and is_active for update;
 if not found then raise exception 'Calendario non disponibile per questa azienda'; end if;
 if v_request_key is not null then
  if length(v_request_key)>160 then raise exception 'Identificatore richiesta non valido'; end if;
  select r.appointment_id into result from private.calendar_booking_requests r join public.appointments a on a.id=r.appointment_id where r.calendar_id=c.id and r.request_key=v_request_key and coalesce(a.status,'') not in ('annullato','cancellato','cancelled','disdetto');
  if found then return jsonb_build_object('id',result,'duplicate',true); end if;
  delete from private.calendar_booking_requests r where r.calendar_id=c.id and r.request_key=v_request_key;
 end if;
 if extract(epoch from (p_fine-p_inizio))<>c.duration_minutes*60 or p_inizio>=p_fine then raise exception 'Durata non valida'; end if;
 -- A shared person/day lock also serializes personal-vs-team and different teams.
 -- Always lock users in UUID order, independently from rotation order.
 for who in select distinct m.owner_id from public.marketing_calendars m where m.company_id=c.company_id and m.owner_id is not null and m.id=any(case when c.calendar_type='team' and cardinality(c.team_calendar_ids)>0 then c.team_calendar_ids else array[c.id] end) order by m.owner_id loop
  perform pg_advisory_xact_lock(hashtextextended(who::text||'|'||p_data::text,0));
 end loop;
 if existing is not null then
  perform 1 from public.appointments where id=existing and calendar_id=c.id and company_id=c.company_id and status not in ('annullato','cancellato','cancelled','disdetto','completato') for update;
  if not found then raise exception 'Appuntamento non modificabile'; end if;
 end if;
 select user_id,member_calendar_id into chosen,member_id from public.calendar_booking_candidates(c.id,p_data,p_inizio,existing) limit 1;
 if not found then return null; end if;
 if existing is not null then
  update public.appointments set appointment_date=p_data,appointment_time=p_inizio,appointment_end_time=p_fine,status='confermato',reminder_24h_at=case when booking_reminders_handled then now() else null end,reminder_1h_at=case when booking_reminders_handled then now() else null end,reminder_5m_at=case when booking_reminders_handled then now() else null end,conferma_inviata_at=now() where id=existing returning id into result;
 else
  if nullif(p_riga->>'contact_id','') is not null and not exists(select 1 from public.marketing_contacts where id=(p_riga->>'contact_id')::uuid and company_id=c.company_id) then raise exception 'Contatto non valido'; end if;
  if nullif(p_riga->>'opportunity_id','') is not null and not exists(select 1 from public.marketing_opportunities where id=(p_riga->>'opportunity_id')::uuid and company_id=c.company_id) then raise exception 'Opportunità non valida'; end if;
  insert into public.appointments(calendar_id,company_id,contact_id,opportunity_id,appointment_date,appointment_time,appointment_end_time,title,description,appointment_type,status,assigned_to,created_by,manage_token,conferma_inviata_at,booking_email,meeting_provider,meeting_status,meeting_url,booking_member_calendar_id,booking_reminders_handled,reminder_24h_at,reminder_1h_at,reminder_5m_at)
  values(c.id,c.company_id,nullif(p_riga->>'contact_id','')::uuid,nullif(p_riga->>'opportunity_id','')::uuid,p_data,p_inizio,p_fine,p_riga->>'title',p_riga->>'description',coalesce(p_riga->>'appointment_type','agente_ai'),'confermato',chosen,coalesce(nullif(p_riga->>'created_by','')::uuid,'00000000-0000-0000-0000-000000000000'::uuid),p_riga->>'manage_token',now(),p_riga->>'booking_email',coalesce(p_riga->>'meeting_provider','none'),coalesce(p_riga->>'meeting_status','none'),p_riga->>'meeting_url',member_id,coalesce((p_riga->>'reminders_handled')::boolean,false),case when p_riga->>'reminders_handled'='true' then now() end,case when p_riga->>'reminders_handled'='true' then now() end,case when p_riga->>'reminders_handled'='true' then now() end) returning id into result;
  if chosen is not null then
  insert into private.calendar_team_turns(calendar_id,user_id,last_assigned_at) values(c.id,chosen,clock_timestamp()) on conflict(calendar_id,user_id) do update set last_assigned_at=excluded.last_assigned_at;
  end if;
 end if;
 if v_request_key is not null then insert into private.calendar_booking_requests(calendar_id,request_key,appointment_id) values(c.id,v_request_key,result); end if;
 return jsonb_build_object('id',result,'duplicate',false);
end $$;
revoke all on function public.reserve_calendar_booking(uuid,uuid,date,time,time,integer,integer,integer,jsonb) from public,anon,authenticated;
grant execute on function public.reserve_calendar_booking(uuid,uuid,date,time,time,integer,integer,integer,jsonb) to service_role;

-- Backward-compatible signature for callers that expect a UUID.
create or replace function public.prenota_su_calendario_con_blocco(p_calendar_id uuid,p_company_id uuid,p_data date,p_inizio time,p_fine time,p_buffer_prima integer,p_buffer_dopo integer,p_durata_min integer,p_riga jsonb) returns uuid language sql security invoker set search_path=public,pg_temp as $$
 select (public.reserve_calendar_booking(p_calendar_id,p_company_id,p_data,p_inizio,p_fine,p_buffer_prima,p_buffer_dopo,p_durata_min,p_riga)->>'id')::uuid
$$;
revoke all on function public.prenota_su_calendario_con_blocco(uuid,uuid,date,time,time,integer,integer,integer,jsonb) from public,anon,authenticated;
grant execute on function public.prenota_su_calendario_con_blocco(uuid,uuid,date,time,time,integer,integer,integer,jsonb) to service_role;

-- Compatibility alias; the same authoritative rules apply to personal and team calendars.
create or replace function public.calendar_team_slots(p_calendar uuid,p_date date,p_exclude uuid default null) returns text[] language sql stable security invoker set search_path=public,pg_temp as $$select public.calendar_booking_slots(p_calendar,p_date,p_exclude)$$;
revoke all on function public.calendar_team_slots(uuid,date,uuid) from public,anon,authenticated;
grant execute on function public.calendar_team_slots(uuid,date,uuid) to service_role;
