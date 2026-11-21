alter table public.appointments
  add column ticket_id uuid references public.tickets(id) on delete set null;

create index appointments_ticket_id_idx on public.appointments(ticket_id)
  where ticket_id is not null;

-- Recupera i collegamenti pregressi solo se oggetto, orario, commessa e
-- assegnatario identificano una singola coppia di record.
with possibili as (
  select a.id as appuntamento_id, t.id as ticket_id,
         count(*) over (partition by a.id) as numero_ticket,
         count(*) over (partition by t.id) as numero_appuntamenti
  from public.appointments a
  join public.tickets t on t.company_id = a.company_id
    and t.subject = substring(a.description from '(?:^|\n)\[Riferimento\] Assistenza: ([^\n]+)')
    and t.order_id is not distinct from a.order_id
    and t.assigned_to is not distinct from a.assigned_to
    and t.data_intervento_prevista =
      (a.appointment_date + coalesce(a.appointment_time, time '09:00')) at time zone 'UTC'
  where a.ticket_id is null
)
update public.appointments a
set ticket_id = p.ticket_id
from possibili p
where a.id = p.appuntamento_id
  and p.numero_ticket = 1
  and p.numero_appuntamenti = 1;

create function private.appuntamento_sincronizza_ticket()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.ticket_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and
    (new.ticket_id, new.company_id, new.appointment_date, new.appointment_time,
     new.appointment_end_time, new.assigned_to, new.formatted_address, new.lat, new.lng)
    is not distinct from
    (old.ticket_id, old.company_id, old.appointment_date, old.appointment_time,
     old.appointment_end_time, old.assigned_to, old.formatted_address, old.lat, old.lng)
  then
    return new;
  end if;

  update public.tickets t
  set data_intervento_prevista =
        (new.appointment_date + coalesce(new.appointment_time, time '09:00')) at time zone 'Europe/Rome',
      assigned_to = new.assigned_to,
      durata_ore = case
        when new.appointment_end_time > new.appointment_time
          then extract(epoch from new.appointment_end_time - new.appointment_time) / 3600
      end,
      indirizzo_intervento = coalesce(new.formatted_address, t.indirizzo_intervento),
      lat_intervento = coalesce(new.lat, t.lat_intervento),
      lng_intervento = coalesce(new.lng, t.lng_intervento)
  where t.id = new.ticket_id and t.company_id = new.company_id;

  if not found then
    raise exception 'Il ticket collegato non è modificabile' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger appuntamento_sincronizza_ticket
after insert or update of ticket_id, company_id, appointment_date, appointment_time,
  appointment_end_time, assigned_to, formatted_address, lat, lng
on public.appointments for each row
execute function private.appuntamento_sincronizza_ticket();
