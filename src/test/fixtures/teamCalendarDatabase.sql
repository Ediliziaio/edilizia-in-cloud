create role anon;create role authenticated;create role service_role bypassrls;
create table companies(id uuid primary key);
create table user_roles(user_id uuid,company_id uuid,role text);
create table marketing_calendars(id uuid primary key,company_id uuid,owner_id uuid,name text,calendar_type text default 'personal',is_active boolean default true,duration_minutes int default 30,buffer_before_min int default 0,buffer_after_min int default 0,min_notice_minutes int default 0,max_per_day int,slot_interval_min int);
create table marketing_calendar_availability(calendar_id uuid,day_of_week int,specific_date date,is_enabled boolean default true,start_time time,end_time time);
create table marketing_contacts(id uuid primary key,company_id uuid);
create table marketing_opportunities(id uuid primary key,company_id uuid);
create table appointments(id uuid primary key default gen_random_uuid(),calendar_id uuid,company_id uuid,contact_id uuid,opportunity_id uuid,appointment_date date,appointment_time time,appointment_end_time time,title text,description text,appointment_type text,status text,assigned_to uuid,created_by uuid,manage_token text,conferma_inviata_at timestamptz,booking_email text,meeting_provider text,meeting_status text,meeting_url text,is_blocked_slot boolean default false,reminder_24h_at timestamptz,reminder_1h_at timestamptz,reminder_5m_at timestamptz);
create table impegni_interni_persona(user_id uuid,start_at timestamptz,end_at timestamptz,appointment_id uuid);
create table unified_calendar_busy_slots(user_id uuid,start_at timestamptz,end_at timestamptz,provider text,external_id text);
create table user_calendar_preferences(user_id uuid,block_busy_slots boolean);
grant usage on schema public to service_role;grant all on all tables in schema public to service_role;

create function public.has_permission_for_company(p_user uuid,p_permission text,p_company uuid) returns boolean language sql stable as $$select exists(select 1 from public.user_roles where user_id=p_user and company_id=p_company)$$;

create table outlook_calendar_connections(id uuid primary key);
create table google_calendar_event_map(appointment_id uuid,company_id uuid,google_event_id text);
create table apple_calendar_event_map(appointment_id uuid,company_id uuid,caldav_uid text);

grant all on all tables in schema public to service_role;
