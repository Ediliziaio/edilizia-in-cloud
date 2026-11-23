-- Il tecnico del rilievo segue la persona dell'appuntamento, come già fa la data.
-- Piano: docs/piano-sopralluoghi-vendita-tecnico.md, lotto 1.
--
-- Prima: spostare l'appuntamento in calendario a un altro tecnico lasciava il rilievo al
-- vecchio, che lo vedeva ancora nell'app, mentre il nuovo aveva l'appuntamento senza rilievo.
-- Il calendario non si deve mai fermare per il rilievo: se l'assegnazione non riesce
-- (chi sposta non ha il permesso Sopralluoghi, persona di un'altra azienda) l'appuntamento
-- si salva lo stesso e il rilievo resta com'era.

create or replace function public.survey_segue_appuntamento()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_survey uuid;
begin
  if new.appointment_date is distinct from old.appointment_date
     or new.appointment_time is distinct from old.appointment_time then
    update public.surveys s
       set scheduled_at = ((new.appointment_date::text || ' ' || coalesce(new.appointment_time::text, '09:00:00'))::timestamp at time zone 'Europe/Rome'),
           updated_at = now()
     where s.appointment_id = new.id
       and s.status in ('draft', 'in_progress');
  end if;

  if new.assigned_to is distinct from old.assigned_to and new.assigned_to is not null then
    select s.id into v_survey from public.surveys s
     where s.appointment_id = new.id and s.deleted_at is null
       and s.status in ('draft', 'in_progress')
       and s.technician_id is distinct from new.assigned_to
     limit 1;
    if v_survey is not null then
      begin
        perform public.sopralluogo_assegna_tecnico(v_survey, new.assigned_to, true);
      exception when others then
        raise warning 'Rilievo % non riassegnato: %', v_survey, sqlerrm;
      end;
    end if;
  end if;

  return new;
end
$function$;

-- Prima scattava solo su data e ora.
drop trigger if exists trg_survey_segue_appuntamento on public.appointments;
create trigger trg_survey_segue_appuntamento
  after update of appointment_date, appointment_time, assigned_to on public.appointments
  for each row execute function public.survey_segue_appuntamento();
