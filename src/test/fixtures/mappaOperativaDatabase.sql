-- Schema ridotto con gli stessi contratti delle tabelle lette dalla migrazione.
-- I permessi fixture rendono espliciti gli utenti abilitati a ciascuna azione.
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create schema private;
grant usage on schema auth to authenticated,anon;
create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('mappa.uid',true),'')::uuid
$$;
create table companies(id uuid primary key);
alter table companies add column operational_lat float8, add column operational_lng float8;
create table profiles(id uuid primary key,company_id uuid,first_name text,last_name text,is_blocked boolean,deleted_at timestamptz);
create table fixture_perms(uid uuid,company uuid,permesso text);
create function public.get_effective_company_id() returns uuid language sql stable security definer as $$
 select company_id from public.profiles where id=auth.uid()
$$;
create function public.has_permission_for_company(uuid,text,uuid) returns boolean language sql stable security definer as $$
 select exists(select 1 from public.fixture_perms where uid=$1 and company=$3 and permesso in ($2,'*'))
$$;
create function public.utente_bloccato() returns boolean language sql stable security definer as $$
 select coalesce((select is_blocked from public.profiles where id=auth.uid()),false)
$$;
create function public.utente_e_cliente_esterno() returns boolean language sql stable as $$
 select coalesce(public.has_permission_for_company(auth.uid(),'esterno',public.get_effective_company_id()),false)
$$;
create function public.chiamante_anonimo() returns boolean language sql stable as $$ select false $$;
create function public.utente_sola_lettura(uuid) returns boolean language sql stable as $$
 select public.has_permission_for_company(auth.uid(),'sola_lettura',$1)
$$;
create function public.e_amministratore_di(uuid) returns boolean language sql stable as $$
 select public.has_permission_for_company(auth.uid(),'amministratore',$1)
$$;
create function public.check_staff_visibility(uuid,uuid) returns boolean language sql stable as $$
 select $2=$1 or not public.has_permission_for_company($1,'only_assigned',public.get_effective_company_id())
$$;
create table orders(id uuid primary key,company_id uuid,deleted_at timestamptz,
 indirizzo_lavori text,work_address text,work_lat float8,work_lng float8,work_start_date date,work_end_date date,work_start_time time,work_end_time time);
alter table orders add column description text, add column order_code text, add column workflow_kind text default 'ordinaria',
 add column status text, add column fulfillment_status text, add column current_status_id uuid, add column assigned_to uuid, add column capomastro_user_id uuid;
create table order_statuses(id uuid primary key,company_id uuid,position int,is_support_phase boolean);
create table order_status_history(id uuid primary key default gen_random_uuid(),order_id uuid,status_id uuid,changed_at timestamptz);
alter table order_statuses enable row level security;
alter table order_status_history enable row level security;
create policy fixture_workflow on order_statuses for select to authenticated using (company_id=public.get_effective_company_id());
create policy fixture_history on order_status_history for select to authenticated using (exists (select 1 from orders o where o.id=order_id));
grant select on order_statuses,order_status_history to authenticated;
create table order_campo_assignments(company_id uuid,order_id uuid,user_id uuid,data_inizio date,data_fine_prevista date,da_squadra_id uuid);
create function public.campo_lavoro_su_commessa(uuid) returns boolean language sql stable security definer as $$
 select exists(select 1 from public.order_campo_assignments where order_id=$1 and user_id=auth.uid())
$$;
create function public.ufficio_vede_commessa(uuid) returns boolean language sql stable security definer as $$
 select exists(select 1 from public.orders where id=$1 and company_id=public.get_effective_company_id()
   and public.has_permission_for_company(auth.uid(),'can_view_orders',company_id))
$$;
create table appointments(
 id uuid primary key,company_id uuid,calendar_id uuid,assigned_to uuid,order_id uuid,appointment_date date,appointment_time time,appointment_end_time time,
 status text not null default 'confirmed',cancelled_at timestamptz,formatted_address text,address_line text,address_postal_code text,address_city text,
 address_province text,address_country text,lat double precision,lng double precision,place_id text,meeting_provider text default 'none',meeting_url text
);
create table campo_timbrature(id uuid default gen_random_uuid(),company_id uuid,order_id uuid,user_id uuid,timestamp_evento timestamptz,
 tipo text,fonte text,hr_timbratura_id uuid,gps_lat float8,gps_lng float8,gps_accuracy float8,sede_id uuid,posizione_esito text);
create table mezzi(id uuid primary key,company_id uuid,nome text,contatore_unita text,assegnato_hr_profilo_id uuid,assegnato_order_id uuid,deleted_at timestamptz);
alter table mezzi add column targa text, add column tipo text default 'furgone', add column gestione text default 'singola',
 add column contatore float8, add column contatore_aggiornato_il timestamptz, add column created_at timestamptz default '2020-01-01Z';
create table mezzi_assegnazioni(id uuid primary key default gen_random_uuid(),company_id uuid,mezzo_id uuid,hr_profilo_id uuid,order_id uuid,dal timestamptz,al timestamptz);
create table mezzi_piani_cantiere(
 id uuid primary key default gen_random_uuid(),company_id uuid,mezzo_id uuid,order_id uuid,responsabile_hr_id uuid,dal date,al date,annullato boolean default false,rientrato_il timestamptz
);
create table mezzi_viaggi(id uuid primary key,company_id uuid,mezzo_id uuid,created_by uuid,partenza timestamptz,arrivo timestamptz,
 contatore_inizio numeric,contatore_fine numeric,stato text,updated_at timestamptz default now(),tratte jsonb default '[]',tariffa_km numeric);
create table marketing_calendars(id uuid primary key,company_id uuid,owner_id uuid,calendar_type text,is_active boolean,
 base_lat double precision,base_lng double precision,base_place_id text,buffer_before_min int default 0,buffer_after_min int default 0);
create table marketing_calendar_availability(calendar_id uuid,day_of_week int,specific_date date,is_enabled boolean,start_time time,end_time time);
create function public.calendar_window_available(uuid,date,time,time,boolean) returns boolean language sql stable as $$
 select exists(select 1 from public.marketing_calendar_availability where calendar_id=$1 and is_enabled and day_of_week=extract(dow from $2) and start_time<=$3 and end_time>=$4)
$$;
create table hr_profili(id uuid primary key,user_id uuid,company_id uuid,nome text,cognome text,sede_id uuid,mansione text,
 orario_inizio time,orario_fine time,giorni_lavorativi text[],data_assunzione date,data_cessazione date,attivo boolean,
 lavora_in_cantiere boolean,employee_id uuid);
create table employees(id uuid primary key,company_id uuid,user_id uuid,is_active boolean,qualifica text);
create table hr_sedi(id uuid primary key,company_id uuid,lat double precision,lng double precision,attiva boolean,nome text);
create table hr_timbrature(id uuid primary key,company_id uuid,profilo_id uuid,order_id uuid,sede_id uuid,tipo text,fonte text,
 "timestamp" timestamptz,lat float8,lng float8,posizione_esito text);
create table squadre_componenti(hr_profilo_id uuid,company_id uuid,squadra_id uuid);
create table external_teams(id uuid primary key,company_id uuid,is_active boolean,kind text,name text);
create table hr_richieste(company_id uuid,user_id uuid,profilo_id uuid,stato text,data_inizio date,data_fine date);
create table impegni_interni_persona(company_id uuid,user_id uuid,start_at timestamptz,end_at timestamptz,fonte text);
create table google_calendar_busy_slots(company_id uuid,user_id uuid,start_at timestamptz,end_at timestamptz);
create table apple_calendar_busy_slots(like google_calendar_busy_slots);
create table outlook_calendar_busy_slots(like google_calendar_busy_slots);

grant select on profiles,orders,appointments,order_campo_assignments,employees,campo_timbrature,mezzi,hr_profili to authenticated;
alter table orders enable row level security;
create policy fixture_orders on orders for select to authenticated using (
 company_id=public.get_effective_company_id() and (public.ufficio_vede_commessa(id) or public.campo_lavoro_su_commessa(id)));
alter table appointments enable row level security;
create policy fixture_appointments on appointments for select to authenticated using (
 company_id=public.get_effective_company_id() and public.check_staff_visibility(auth.uid(),assigned_to));
alter table campo_timbrature enable row level security;
create policy fixture_timbrature on campo_timbrature for select to authenticated using (
 company_id=public.get_effective_company_id() and (user_id=auth.uid() or public.has_permission_for_company(auth.uid(),'can_view_persone',company_id)));

grant select on hr_sedi,hr_timbrature to authenticated;
alter table hr_timbrature enable row level security;
create policy fixture_hr_timbrature on hr_timbrature for select to authenticated using (
 company_id=public.get_effective_company_id() and (
  public.e_amministratore_di(company_id) or exists (
    select 1 from public.hr_profili p where p.id=profilo_id and p.company_id=hr_timbrature.company_id and p.user_id=auth.uid()
  )
 ));
