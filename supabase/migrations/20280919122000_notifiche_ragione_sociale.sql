-- Email degli appuntamenti: nel piè di pagina la ragione sociale, non il marchio.
--
-- Il Bagno Group (19/09/2026): la P.IVA 11721620968 è di «Il Bagno Group
-- S.r.l.» (VIES). Accanto alla P.IVA va il nome della società che la
-- possiede, non quello commerciale: «Il Bagno Group S.r.l. — P.IVA …».
-- Stessa funzione di 20280919121000, con `ragione_sociale` in `azienda`.

create or replace function public.appuntamento_da_notificare(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  with a as (
    select ap.*,
           public.consulente_appuntamento(ap.assigned_to, ap.created_by, ap.calendar_id) as consulente_id
    from appointments ap
    where ap.id = p_id
  )
  select jsonb_build_object(
    'id',            a.id,
    'company_id',    a.company_id,
    'data',          a.appointment_date,
    'ora',           to_char(a.appointment_time, 'HH24:MI'),
    'ora_fine',      to_char(a.appointment_end_time, 'HH24:MI'),
    'inizio',        (a.appointment_date + coalesce(a.appointment_time, time '00:00')) at time zone 'Europe/Rome',
    'tipo',          a.appointment_type,
    'stato',         a.status,
    'bloccato',      a.is_blocked_slot,
    'pubblico',      a.booking_email is not null,
    'creato_il',     a.created_at,
    'titolo',        a.title,
    'descrizione',   nullif(btrim(a.description), ''),
    'note_interne',  nullif(btrim(a.internal_notes), ''),
    'link_video',    nullif(btrim(a.meeting_url), ''),
    'fuori_sede',    public.appuntamento_fuori_sede(a.appointment_type),
    'indirizzo_via',   nullif(btrim(a.address_line), ''),
    'indirizzo_citta', nullif(btrim(a.address_city), ''),
    -- L'indirizzo scritto nell'appuntamento: quello di Google Places se c'è,
    -- altrimenti ricomposto dai pezzi.
    'indirizzo', coalesce(
      nullif(btrim(a.formatted_address), ''),
      nullif(btrim(concat_ws(', ',
        nullif(btrim(a.address_line), ''),
        nullif(btrim(concat_ws(' ',
          nullif(btrim(a.address_postal_code), ''),
          nullif(btrim(a.address_city), ''),
          '(' || nullif(btrim(a.address_province), '') || ')')), ''))), '')),
    'azienda', (
      select jsonb_build_object(
        'nome', c.name, 'ragione_sociale', nullif(btrim(c.business_name), ''),
        'piva', nullif(btrim(c.vat_number), ''),
        'email', nullif(btrim(c.email), ''), 'telefono', nullif(btrim(c.phone), ''),
        'notifiche_dal', c.appuntamenti_notifiche_dal)
      from companies c where c.id = a.company_id),
    'consulente', (
      select jsonb_build_object(
        'id', p.id, 'nome', nullif(btrim(p.first_name), ''), 'cognome', nullif(btrim(p.last_name), ''),
        'email', nullif(btrim(p.email), ''), 'telefono', nullif(btrim(p.phone), ''))
      from profiles p where p.id = a.consulente_id),
    -- Lo showroom del consulente. Rilievi, consegne, assistenza si fanno dal
    -- cliente: niente showroom, vale l'indirizzo.
    'sede', (
      select jsonb_build_object(
        'nome', s.nome, 'via', nullif(btrim(s.indirizzo), ''), 'cap', nullif(btrim(s.cap), ''),
        'citta', nullif(btrim(s.citta), ''), 'prov', nullif(btrim(s.provincia), ''))
      from company_sedi_utenti u
      join company_sedi s on s.id = u.sede_id
      where u.company_id = a.company_id
        and u.user_id = a.consulente_id
        and s.attiva
        and not public.appuntamento_fuori_sede(a.appointment_type)),
    'cliente', (
      select jsonb_build_object(
        'id', mc.id,
        'nome', nullif(btrim(mc.first_name), ''), 'cognome', nullif(btrim(mc.last_name), ''),
        'email', nullif(btrim(mc.email), ''), 'telefono', nullif(btrim(mc.phone), ''),
        'indirizzo', nullif(btrim(concat_ws(', ',
          nullif(btrim(mc.address), ''),
          nullif(btrim(concat_ws(' ',
            nullif(btrim(mc.postal_code), ''),
            nullif(btrim(mc.city), ''),
            '(' || nullif(btrim(mc.province), '') || ')')), ''))), ''))
      from marketing_contacts mc where mc.id = a.contact_id),
    'creato_da', (
      select nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), '')
      from profiles p where p.id = a.created_by)
  )
  from a
$$;

revoke all on function public.appuntamento_da_notificare(uuid) from public, anon, authenticated;
grant execute on function public.appuntamento_da_notificare(uuid) to service_role;
