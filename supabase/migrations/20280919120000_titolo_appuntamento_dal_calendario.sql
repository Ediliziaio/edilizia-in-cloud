-- Titolo automatico degli appuntamenti: il consulente è quello del calendario.
--
-- Il Bagno Group (19/09/2026): «quando una fissa un appuntamento nel
-- calendario del commerciale X compare quel titolo». Il trigger guardava solo
-- `assigned_to`, che dalla scheda opportunità e dal calendario resta vuoto
-- quando fissa chi vede tutto (Christian, Giusy, William): lo showroom spariva
-- dal titolo. Con «Solo i propri», invece, `assigned_to` viene messo d'ufficio
-- a chi crea, e Katia che fissa nel calendario di Camilla sarebbe diventata la
-- consulente.
--
-- Regola, una sola per titolo e notifiche (`consulente_appuntamento`):
--   * se qualcuno ha scelto un'altra persona (assegnato diverso da chi crea),
--     vale la sua scelta;
--   * altrimenti conta di chi è il calendario;
--   * senza calendario con proprietario, l'assegnato.
-- Il rilievo tecnico si fa a casa del cliente: nel titolo va l'indirizzo
-- dell'appuntamento, mai lo showroom.

create or replace function public.consulente_appuntamento(
  p_assegnato  uuid,
  p_creato_da  uuid,
  p_calendario uuid
)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    when p_assegnato is not null and p_assegnato is distinct from p_creato_da then p_assegnato
    else coalesce(
      (select mc.owner_id from marketing_calendars mc where mc.id = p_calendario),
      p_assegnato)
  end
$$;

revoke all on function public.consulente_appuntamento(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.consulente_appuntamento(uuid, uuid, uuid) to service_role;

-- Nessuno chiama la versione a sei argomenti fuori da questo trigger.
drop function if exists public.titolo_appuntamento(uuid, text, uuid, uuid, text, text);

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
      and coalesce(p_tipo, '') <> 'rilievo_tecnico'
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

create or replace function public.componi_titolo_appuntamento()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_attivo    boolean;
  v_etichetta text;
  v_nuovo     text;
  v_vecchio   text;
begin
  select c.appuntamenti_titolo_auto, c.name
    into v_attivo, v_etichetta
  from companies c
  where c.id = new.company_id;

  if not coalesce(v_attivo, false) then
    return new;
  end if;

  v_nuovo := public.titolo_appuntamento(
    new.company_id, v_etichetta, new.contact_id,
    public.consulente_appuntamento(new.assigned_to, new.created_by, new.calendar_id),
    new.appointment_type, new.address_line, new.address_city);
  if v_nuovo is null then
    return new; -- niente contatto collegato: si tiene il titolo di chi ha scritto
  end if;

  if tg_op = 'INSERT' then
    new.title := v_nuovo;
    return new;
  end if;

  -- In modifica si rifà il titolo solo se nessuno l'aveva riscritto a mano:
  -- se quello vecchio è esattamente quello che avremmo generato noi, è nostro.
  v_vecchio := public.titolo_appuntamento(
    old.company_id, v_etichetta, old.contact_id,
    public.consulente_appuntamento(old.assigned_to, old.created_by, old.calendar_id),
    old.appointment_type, old.address_line, old.address_city);
  if old.title is not distinct from v_vecchio then
    new.title := v_nuovo;
  end if;
  return new;
end
$$;

revoke all on function public.componi_titolo_appuntamento() from public, anon, authenticated;

-- Fuori da «update of» resta apposta `title`: se il trigger scattasse anche
-- quando si riscrive il titolo, riscriverebbe sopra la modifica fatta a mano.
drop trigger if exists trg_titolo_appuntamento on public.appointments;
create trigger trg_titolo_appuntamento
  before insert or update of assigned_to, calendar_id, contact_id, appointment_type, address_line, address_city
  on public.appointments
  for each row execute function public.componi_titolo_appuntamento();
