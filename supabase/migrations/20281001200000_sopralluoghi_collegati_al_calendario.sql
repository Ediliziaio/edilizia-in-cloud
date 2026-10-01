-- Sopralluoghi collegati al calendario (01/10/2026).
-- Pianificare un sopralluogo crea l'appuntamento nel calendario del tecnico: qui il
-- collegamento (surveys.appointment_id) e la data che segue l'appuntamento quando
-- lo si sposta in calendario (solo finché il sopralluogo non è fatto).
-- Colonna nullable e FK NOT VALID: istantanei. Il trigger su appointments si crea con
-- lock_timeout corto: se la tabella è occupata fallisce invece di bloccare la produzione.
alter table public.surveys add column if not exists appointment_id uuid;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'surveys_appointment_id_fkey') then
    alter table public.surveys
      add constraint surveys_appointment_id_fkey foreign key (appointment_id)
      references public.appointments(id) on delete set null not valid;
  end if;
end $$;

create index if not exists surveys_appointment_id_idx
  on public.surveys (appointment_id) where appointment_id is not null;

create or replace function public.survey_segue_appuntamento()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  -- Spostato in calendario: la data del sopralluogo (se non è ancora fatto) lo segue.
  if new.appointment_date is distinct from old.appointment_date
     or new.appointment_time is distinct from old.appointment_time then
    update public.surveys s
       set scheduled_at = ((new.appointment_date::text || ' ' || coalesce(new.appointment_time::text, '09:00:00'))::timestamp at time zone 'Europe/Rome'),
           updated_at = now()
     where s.appointment_id = new.id
       and s.status in ('draft', 'in_progress');
  end if;
  return new;
end
$function$;

-- Funzione di trigger: non serve alcun EXECUTE (il privilegio non si controlla allo scatto).
revoke all on function public.survey_segue_appuntamento() from public, anon, authenticated;

set lock_timeout = '4s';
drop trigger if exists trg_survey_segue_appuntamento on public.appointments;
create trigger trg_survey_segue_appuntamento
  after update of appointment_date, appointment_time on public.appointments
  for each row execute function public.survey_segue_appuntamento();
reset lock_timeout;
