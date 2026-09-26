-- Agente WhatsApp dei lead, seconda tornata (25/09/2026), dalla revisione del codice.
--
-- 1. Un turno per contatto. Due messaggi a pochi secondi facevano partire due
--    giri dell'agente in parallelo: due risposte, o nessuna al secondo. Chi
--    risponde prende il turno (conversazioni.bot_occupato_fino) con un update
--    condizionato; gli altri escono, e chi ha il turno, prima di lasciarlo,
--    ricontrolla se sono arrivati messaggi nuovi.
-- 2. Prenotazione su calendario sotto blocco. Il controllo «è libero?» e
--    l'inserimento stanno nella stessa transazione, sotto un advisory lock per
--    calendario e giorno: due lead sullo stesso orario non passano entrambi, e
--    un appuntamento rifiutato non viene mai inserito (prima si inseriva e poi
--    si cancellava: conferme, evento Google e CAPI partivano lo stesso).
--    Chiamata solo dalle edge function (service_role).
-- 3. idx_whatsapp_messages_contatto_data (migrazione 20280925235500) era uguale
--    a idx_whatsapp_messages_contatto (20280925001100): si toglie il doppione.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.conversazioni
  add column if not exists bot_occupato_fino timestamptz;

comment on column public.conversazioni.bot_occupato_fino is
  'Turno dell''agente WhatsApp su questo contatto: fino a quest''ora risponde un solo giro alla volta.';

drop index if exists public.idx_whatsapp_messages_contatto_data;

create or replace function public.prenota_su_calendario_con_blocco(
  p_calendar_id uuid,
  p_company_id uuid,
  p_data date,
  p_inizio time,
  p_fine time,
  p_buffer_prima integer,
  p_buffer_dopo integer,
  p_durata_min integer,
  p_riga jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext(p_calendar_id::text || '|' || p_data::text));

  if exists (
    select 1
      from public.appointments a
     where a.calendar_id = p_calendar_id
       and a.appointment_date = p_data
       and coalesce(a.status, '') not in ('annullato', 'cancellato', 'cancelled', 'disdetto')
       and (p_inizio - make_interval(mins => greatest(p_buffer_prima, 0)))
             < (coalesce(a.appointment_end_time, a.appointment_time + make_interval(mins => greatest(p_durata_min, 5)))
                + make_interval(mins => greatest(p_buffer_dopo, 0)))
       and (p_fine + make_interval(mins => greatest(p_buffer_dopo, 0)))
             > (a.appointment_time - make_interval(mins => greatest(p_buffer_prima, 0)))
  ) then
    return null;
  end if;

  insert into public.appointments (
    calendar_id, company_id, contact_id, opportunity_id,
    appointment_date, appointment_time, appointment_end_time,
    title, description, appointment_type, status,
    assigned_to, created_by, manage_token, conferma_inviata_at
  ) values (
    p_calendar_id, p_company_id,
    nullif(p_riga->>'contact_id', '')::uuid,
    nullif(p_riga->>'opportunity_id', '')::uuid,
    p_data, p_inizio, p_fine,
    p_riga->>'title', p_riga->>'description',
    coalesce(nullif(p_riga->>'appointment_type', ''), 'agente_ai'),
    'confermato',
    nullif(p_riga->>'assigned_to', '')::uuid,
    coalesce(nullif(p_riga->>'created_by', '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid),
    p_riga->>'manage_token',
    now()
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.prenota_su_calendario_con_blocco(uuid, uuid, date, time, time, integer, integer, integer, jsonb) from public, anon, authenticated;
grant execute on function public.prenota_su_calendario_con_blocco(uuid, uuid, date, time, time, integer, integer, integer, jsonb) to service_role;
