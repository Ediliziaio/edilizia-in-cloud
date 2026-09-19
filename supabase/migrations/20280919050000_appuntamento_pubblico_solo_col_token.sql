-- La pagina «gestisci appuntamento» legge un appuntamento solo col suo codice.
--
-- Trovato nell'audit del 19/09/2026: la vista public_appointment_manage era
-- leggibile da chiunque (anon) e senza alcun filtro obbligatorio. Bastava la
-- chiave pubblica del sito — quella che sta nel JavaScript — per scaricare,
-- di tutte le prenotazioni fatte dalle pagine /prenota: email del cliente,
-- titolo (con nome e cognome) e manage_token, cioè il codice che permette di
-- disdire o spostare l'appuntamento. La pagina filtrava per token, ma il
-- filtro lo metteva il browser: chiunque poteva toglierlo.
--
-- Ora: una funzione che restituisce UNA riga e solo per un codice esatto
-- (almeno 16 caratteri, quelli veri sono casuali), e la vista non è più
-- leggibile da anon né da authenticated. Resta per service_role.

create or replace function public.appuntamento_pubblico_da_token(p_token text)
returns table (
  manage_token         text,
  id                   uuid,
  appointment_date     date,
  appointment_time     time,
  appointment_end_time time,
  status               text,
  title                text,
  booking_email        text,
  calendar_id          uuid,
  calendar_name        text,
  calendar_description text,
  duration_minutes     integer,
  booking_slug         text,
  min_notice_minutes   integer
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select a.manage_token, a.id, a.appointment_date, a.appointment_time, a.appointment_end_time,
         a.status, a.title, a.booking_email, a.calendar_id,
         c.name, c.description, c.duration_minutes, c.booking_slug, c.min_notice_minutes
  from appointments a
  join marketing_calendars c on c.id = a.calendar_id
  where length(coalesce(p_token, '')) >= 16
    and a.manage_token = p_token
    and c.booking_slug is not null
    and c.is_active = true
  limit 1
$$;

revoke all on function public.appuntamento_pubblico_da_token(text) from public;
grant execute on function public.appuntamento_pubblico_da_token(text) to anon, authenticated, service_role;

insert into public.funzioni_pubbliche_di_proposito (nome, motivo)
select 'appuntamento_pubblico_da_token',
       'Pagina «gestisci appuntamento» del cliente: restituisce un solo appuntamento, e solo a chi ha il suo codice'
where not exists (select 1 from public.funzioni_pubbliche_di_proposito where nome = 'appuntamento_pubblico_da_token');

revoke select on public.public_appointment_manage from anon, authenticated;
