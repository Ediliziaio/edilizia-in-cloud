-- Email automatiche degli appuntamenti fissati dall'azienda.
--
-- Il Bagno Group (18/09/2026): quando si fissa un appuntamento devono
-- ricevere un avviso il consulente e il cliente, in italiano (con GoHighLevel
-- arrivava tutto in inglese), e al cliente non vanno le note. Fino a oggi
-- l'unica email partiva dalla prenotazione sulla pagina pubblica: chi fissava
-- dal calendario, dalla scheda contatto o dall'opportunità non avvisava
-- nessuno.
--
-- Al cliente: conferma, avviso se cambia giorno/ora/luogo/consulente, avviso
-- se viene annullato, promemoria il giorno prima. Al consulente: un avviso
-- quando un altro fissa, sposta o annulla un appuntamento suo.
-- Le email le compone e le manda la edge function `appuntamenti-notifiche`;
-- qui ci sono l'interruttore, il registro e chi la sveglia.
--
-- Interruttore per azienda: `appuntamenti_notifiche_dal`. NULL = spente. Gli
-- appuntamenti creati prima di quella data non ricevono niente, così
-- accenderle non manda conferme arretrate a chi aveva già fissato.

alter table public.companies
  add column if not exists appuntamenti_notifiche_dal timestamptz;

comment on column public.companies.appuntamenti_notifiche_dal is
  'Da quando partono le email automatiche degli appuntamenti (conferma e promemoria al cliente, avviso al consulente). NULL = spente. Gli appuntamenti creati prima non ricevono niente.';

-- ── Dove si svolge: showroom o dal cliente ───────────────────────────────
-- Rilievi, misure, consegne, assistenza e lavori si fanno dal cliente o in
-- cantiere, mai nello showroom: nel titolo e nelle email va l'indirizzo
-- dell'appuntamento. Resta fuori «sopralluogo_preventivo»: è il tipo che la
-- scheda opportunità propone d'ufficio, e Il Bagno Group lo usa per gli
-- appuntamenti in showroom.
create or replace function public.appuntamento_fuori_sede(p_tipo text)
returns boolean
language sql
immutable
set search_path to 'public'
as $$
  select coalesce(p_tipo, '') in (
    'rilievo_tecnico', 'misurazione', 'verifica_cantiere', 'inizio_lavori', 'fine_lavori',
    'posa_prova', 'consegna', 'collaudo', 'assistenza', 'manutenzione', 'ispezione', 'sopralluogo')
$$;

revoke all on function public.appuntamento_fuori_sede(text) from public, anon, authenticated;
grant execute on function public.appuntamento_fuori_sede(text) to service_role;

-- Il titolo automatico segue la stessa regola (prima valeva solo per il rilievo).
create or replace function public.titolo_appuntamento(
  p_company    uuid,
  p_etichetta  text,
  p_contatto   uuid,
  p_consulente uuid,
  p_tipo       text,
  p_indirizzo  text,
  p_citta      text
)
returns text
language sql
stable
set search_path to 'public'
as $$
  with contatto as (
    select btrim(concat_ws(' ',
             nullif(btrim(c.last_name), ''),
             nullif(btrim(c.first_name), ''))) as nome
    from marketing_contacts c
    where c.id = p_contatto
  ),
  sede as (
    -- La forma che usano già su Google Calendar:
    -- «Show-room Lissone - Via Nuova Valassina 27».
    select btrim(concat_ws(' - ',
             'Show-room ' || btrim(s.nome),
             nullif(btrim(s.indirizzo), ''))) as dove
    from company_sedi_utenti u
    join company_sedi s on s.id = u.sede_id
    where u.company_id = p_company
      and u.user_id = p_consulente
      and s.attiva
      and not public.appuntamento_fuori_sede(p_tipo)
  )
  select case
    when coalesce((select nome from contatto), '') = '' then null
    else btrim(concat_ws(' ',
      (select nome from contatto) || ' | ' || nullif(btrim(coalesce(p_etichetta, '')), ''),
      coalesce(
        nullif((select dove from sede), ''),
        nullif(btrim(concat_ws(', ', nullif(btrim(coalesce(p_indirizzo, '')), ''), nullif(btrim(coalesce(p_citta, '')), ''))), '')
      )))
  end
$$;

revoke all on function public.titolo_appuntamento(uuid, text, uuid, uuid, text, text, text) from public, anon, authenticated;

-- ── Registro degli invii ─────────────────────────────────────────────────
-- Una riga per email. La chiave fotografa ciò che è stato detto (giorno, ora,
-- consulente, luogo): la stessa email non parte due volte, nemmeno con due
-- chiamate nello stesso istante, e un cambio vero si riconosce confrontando
-- la chiave dell'ultima conferma con quella di adesso.
create table if not exists public.appuntamenti_notifiche (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  tipo           text not null check (tipo in (
                   'cliente_conferma', 'cliente_spostamento', 'cliente_annullamento', 'cliente_promemoria',
                   'consulente_nuovo', 'consulente_spostamento', 'consulente_annullamento')),
  chiave         text not null,
  destinatario   text,
  esito          text not null default 'in_corso' check (esito in ('in_corso', 'inviata', 'errore')),
  dettaglio      text,
  tentativi      integer not null default 1,
  creato_il      timestamptz not null default now(),
  aggiornato_il  timestamptz not null default now(),
  unique (appointment_id, tipo, chiave)
);

create index if not exists appuntamenti_notifiche_azienda
  on public.appuntamenti_notifiche (company_id, creato_il desc);

alter table public.appuntamenti_notifiche enable row level security;

-- Chi lavora nell'azienda può vedere cosa è partito (per rispondere a «il
-- cliente ha ricevuto la conferma?»). Scrive solo la funzione.
drop policy if exists "Azienda legge le notifiche dei suoi appuntamenti" on public.appuntamenti_notifiche;
create policy "Azienda legge le notifiche dei suoi appuntamenti"
  on public.appuntamenti_notifiche
  for select
  to authenticated
  using (public.user_can_access_company(company_id));

revoke all on public.appuntamenti_notifiche from anon;
revoke insert, update, delete on public.appuntamenti_notifiche from authenticated;

-- ── Tutto quello che serve per scrivere le email, in una chiamata ────────
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
        'nome', c.name, 'piva', nullif(btrim(c.vat_number), ''),
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

-- ── Prenotare un invio (e riprovarlo se era fallito) ─────────────────────
-- Restituisce l'id della riga se tocca a chi chiama mandare l'email, NULL se
-- è già partita, se la sta mandando un altro o se ha già fallito tre volte.
-- Una riga «in corso» da più di dieci minuti è di una chiamata morta a metà.
create or replace function public.appuntamento_notifica_prenota(
  p_appointment  uuid,
  p_company      uuid,
  p_tipo         text,
  p_chiave       text,
  p_destinatario text
)
returns uuid
language sql
security definer
set search_path to 'public'
as $$
  insert into appuntamenti_notifiche as n (company_id, appointment_id, tipo, chiave, destinatario)
  values (p_company, p_appointment, p_tipo, p_chiave, p_destinatario)
  on conflict (appointment_id, tipo, chiave) do update
     set esito = 'in_corso',
         tentativi = n.tentativi + 1,
         destinatario = excluded.destinatario,
         aggiornato_il = now()
   where (n.esito = 'errore' and n.tentativi < 3)
      or (n.esito = 'in_corso' and n.aggiornato_il < now() - interval '10 minutes')
  returning n.id
$$;

revoke all on function public.appuntamento_notifica_prenota(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.appuntamento_notifica_prenota(uuid, uuid, text, text, text) to service_role;

-- ── Il giro dei 15 minuti: promemoria e conferme rimaste indietro ────────
-- Promemoria: appuntamenti confermati che iniziano fra 23 e 25 ore, il cui
-- cliente ha ricevuto una conferma. Conferme indietro: appuntamenti nati da
-- più di cinque minuti, col cliente che ha un'email, per cui non risulta
-- nessuna email al cliente (la chiamata del trigger si è persa, o l'invio è
-- fallito e va ritentato).
create or replace function public.appuntamenti_notifiche_giro()
returns table (appointment_id uuid, motivo text)
language sql
stable
security definer
set search_path to 'public'
as $$
  with candidati as (
    select a.id, a.created_at,
           (a.appointment_date + coalesce(a.appointment_time, time '00:00')) at time zone 'Europe/Rome' as inizio
    from appointments a
    join companies c on c.id = a.company_id
    join marketing_contacts mc on mc.id = a.contact_id
    where c.appuntamenti_notifiche_dal is not null
      and a.created_at >= c.appuntamenti_notifiche_dal
      and a.status = 'confermato'
      and a.booking_email is null
      and not a.is_blocked_slot
      and nullif(btrim(mc.email), '') is not null
      and a.appointment_date between (now() at time zone 'Europe/Rome')::date - 1
                                 and (now() at time zone 'Europe/Rome')::date + 60
  )
  select k.id, 'promemoria'
  from candidati k
  where k.inizio > now() + interval '23 hours'
    and k.inizio <= now() + interval '25 hours'
    and exists (select 1 from appuntamenti_notifiche n
                where n.appointment_id = k.id
                  and n.tipo in ('cliente_conferma', 'cliente_spostamento')
                  and n.esito = 'inviata')
  union all
  select k.id, 'conferma'
  from candidati k
  where k.inizio > now()
    and k.created_at < now() - interval '5 minutes'
    and k.created_at > now() - interval '3 days'
    and not exists (select 1 from appuntamenti_notifiche n
                    where n.appointment_id = k.id
                      and n.tipo like 'cliente\_%'
                      and (n.esito = 'inviata' or n.tentativi >= 3))
  limit 200
$$;

revoke all on function public.appuntamenti_notifiche_giro() from public, anon, authenticated;
grant execute on function public.appuntamenti_notifiche_giro() to service_role;

-- ── Chi sveglia la funzione ──────────────────────────────────────────────
-- Scatta a ogni appuntamento creato o cambiato in qualcosa che il cliente o
-- il consulente devono sapere. Non decide niente: passa l'appuntamento, chi
-- ha fatto il cambio (auth.uid(): NULL per sincronizzazioni e automazioni) e
-- cosa è cambiato. Non deve mai impedire di salvare un appuntamento: ogni
-- errore qui dentro viene ingoiato.
create or replace function public.appuntamento_notifiche_sveglia()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_dal    timestamptz;
  v_chiave text;
  v_cambi  text[] := '{}';
  v_prima  jsonb;
begin
  if tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      v_cambi := v_cambi || 'stato'::text;
    end if;
    if new.appointment_date is distinct from old.appointment_date
       or new.appointment_time is distinct from old.appointment_time then
      v_cambi := v_cambi || 'quando'::text;
    end if;
    if new.assigned_to is distinct from old.assigned_to
       or new.calendar_id is distinct from old.calendar_id then
      v_cambi := v_cambi || 'consulente'::text;
    end if;
    if new.contact_id is distinct from old.contact_id then
      v_cambi := v_cambi || 'cliente'::text;
    end if;
    -- Non `formatted_address`: la sincronizzazione con Google la riscrive col
    -- testo del suo campo luogo anche quando il posto non cambia.
    if new.address_line is distinct from old.address_line
       or new.address_city is distinct from old.address_city
       or new.appointment_type is distinct from old.appointment_type then
      v_cambi := v_cambi || 'luogo'::text;
    end if;
    if cardinality(v_cambi) = 0 then
      return null;
    end if;
    v_prima := jsonb_build_object(
      'data', old.appointment_date,
      'ora', to_char(old.appointment_time, 'HH24:MI'),
      'stato', old.status);
  end if;

  if new.is_blocked_slot or new.booking_email is not null then
    return null;
  end if;

  select c.appuntamenti_notifiche_dal into v_dal
  from companies c where c.id = new.company_id;
  if v_dal is null or new.created_at < v_dal then
    return null;
  end if;

  begin
    v_chiave := (select decrypted_secret from vault.decrypted_secrets
                 where name = 'silvio_internal_cron_secret' limit 1);
    if v_chiave is null then
      return null;
    end if;
    perform net.http_post(
      url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/appuntamenti-notifiche',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_chiave),
      body := jsonb_build_object(
        'appointment_id', new.id,
        'evento', lower(tg_op),
        'autore', auth.uid(),
        'cambi', to_jsonb(v_cambi),
        'prima', v_prima),
      timeout_milliseconds := 30000);
  exception when others then
    -- Il giro dei 15 minuti recupera la conferma al cliente.
    return null;
  end;
  return null;
end
$$;

revoke all on function public.appuntamento_notifiche_sveglia() from public, anon, authenticated;

drop trigger if exists trg_appuntamento_notifiche on public.appointments;
create trigger trg_appuntamento_notifiche
  after insert or update on public.appointments
  for each row execute function public.appuntamento_notifiche_sveglia();

-- ── Il giro ogni 15 minuti ───────────────────────────────────────────────
select cron.unschedule(jobid) from cron.job where jobname = 'appuntamenti-notifiche-giro';

select cron.schedule(
  'appuntamenti-notifiche-giro',
  '5-59/15 * * * *',
  $cmd$
  SELECT net.http_post(
    url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/appuntamenti-notifiche',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets
                        WHERE name = 'silvio_internal_cron_secret' LIMIT 1)),
    body := '{"modo": "giro"}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cmd$
);
