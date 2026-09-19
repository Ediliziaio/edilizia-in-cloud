-- Orari degli eventi importati da Google Calendar riportati all'ora italiana.
--
-- Fino al commit 662e5a364 (pubblicato il 19/09/2026 alle 11:52:55 UTC) il
-- parser di google-calendar-sync leggeva l'ora con getHours() su un server in
-- UTC: ogni evento importato o aggiornato da Google è entrato 2 ore prima
-- d'estate e 1 d'inverno, e fra mezzanotte e le due al giorno prima. Il
-- «VENDITE training meeting» delle 10:00 risultava alle 08:00 il 2 ottobre e
-- alle 09:00 il 6 novembre. Colpiti: Il Bagno Group (256 eventi importati e
-- 2 appuntamenti nati in EiC e riscritti da Google) e Suntech (19).
--
-- Si corregge solo dove l'orario l'ha scritto per ultimo quel parser: la mappa
-- dice che l'ultimo a scrivere è stato Google, prima della versione corretta,
-- e nessuno ha toccato l'appuntamento dopo. Gli eventi di un giorno intero non
-- hanno ora e restano come sono. Ogni riga corretta finisce in
-- `appuntamenti_orari_riallineati` con l'orario di prima: rilanciare la
-- migrazione non sposta niente due volte, e tornare indietro è possibile.

set local lock_timeout = '3s';
set local statement_timeout = '60s';
-- Niente trigger: l'orario giusto è già quello su Google (non va rimandato),
-- e un aggiornamento di massa non deve far partire automazioni né email.
set local session_replication_role = replica;

do $$
begin
  if current_setting('session_replication_role') <> 'replica' then
    raise exception 'Trigger ancora accesi: la correzione degli orari si ferma qui';
  end if;
end $$;

create table if not exists public.appuntamenti_orari_riallineati (
  appointment_id uuid primary key references public.appointments(id) on delete cascade,
  company_id     uuid not null references public.companies(id) on delete cascade,
  data_prima     date not null,
  ora_prima      time not null,
  fine_prima     time,
  data_dopo      date not null,
  ora_dopo       time not null,
  fine_dopo      time,
  riallineato_il timestamptz not null default now()
);

alter table public.appuntamenti_orari_riallineati enable row level security;
revoke all on public.appuntamenti_orari_riallineati from anon, authenticated;

with da_correggere as (
  select a.id,
         a.company_id,
         a.appointment_date,
         a.appointment_time,
         a.appointment_end_time,
         ((a.appointment_date + a.appointment_time) at time zone 'UTC') at time zone 'Europe/Rome' as inizio_roma,
         case when a.appointment_end_time is not null
              then (((a.appointment_date + a.appointment_end_time) at time zone 'UTC') at time zone 'Europe/Rome')::time
         end as fine_roma
  from public.appointments a
  join public.google_calendar_event_map g on g.appointment_id = a.id
  where g.last_updated_by = 'google'
    and g.last_synced_at < timestamptz '2026-09-19 11:52:55.808+00'
    and a.updated_at <= g.last_synced_at + interval '2 seconds'
    and a.appointment_time is not null
    and not exists (select 1 from public.appuntamenti_orari_riallineati r where r.appointment_id = a.id)
),
registrate as (
  insert into public.appuntamenti_orari_riallineati
    (appointment_id, company_id, data_prima, ora_prima, fine_prima, data_dopo, ora_dopo, fine_dopo)
  select id, company_id, appointment_date, appointment_time, appointment_end_time,
         inizio_roma::date, inizio_roma::time, fine_roma
  from da_correggere
  returning appointment_id, data_dopo, ora_dopo, fine_dopo
)
update public.appointments a
   set appointment_date     = r.data_dopo,
       appointment_time     = r.ora_dopo,
       appointment_end_time = r.fine_dopo
  from registrate r
 where a.id = r.appointment_id;
