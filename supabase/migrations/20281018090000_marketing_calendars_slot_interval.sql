-- marketing_calendars.slot_interval_min: il «passo» con cui si offrono gli orari,
-- indipendente dalla durata. NULL = usa duration_minutes (comportamento di sempre).
-- Esempio: durata 45 + passo 60 => 09:00, 10:00, 11:00... invece di 09:00, 09:45, 10:30.
-- Additiva e retro-compatibile: nessun calendario cambia finche' non si valorizza.
set local lock_timeout = '3s';

alter table marketing_calendars
  add column if not exists slot_interval_min integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'marketing_calendars_slot_interval_min_check'
  ) then
    alter table marketing_calendars
      add constraint marketing_calendars_slot_interval_min_check
      check (slot_interval_min is null or slot_interval_min between 5 and 240);
  end if;
end $$;

comment on column marketing_calendars.slot_interval_min is
  'Ogni quanti minuti si offre un orario di prenotazione. NULL = usa duration_minutes.';

-- La vista pubblica deve esporre la colonna nuova alla pagina /prenota.
create or replace view public_booking_calendars as
  select id, company_id, owner_id, name, description, booking_slug,
         duration_minutes, default_meeting_provider, default_meeting_enabled,
         buffer_before_min, buffer_after_min, min_notice_minutes, max_per_day,
         slot_interval_min
  from marketing_calendars
  where booking_slug is not null and is_active = true;
