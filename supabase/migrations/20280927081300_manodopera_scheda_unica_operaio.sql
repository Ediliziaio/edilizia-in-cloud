-- Manodopera e Mezzi, fase 0: una scheda sola per ogni operaio (26/09/2026).
--
-- Un operaio oggi vive in due schede che nessuno tiene allineate:
--   · hr_profili  — il Personale: timbrature, presenze, ferie, documenti, mezzi;
--   · employees   — i costi: costo orario, righe di manodopera sulle commesse.
-- Nessuna delle tre vie di creazione compila entrambe (Impostazioni → Dipendenti
-- e Utenti creano solo employees; Personale → Nuovo profilo solo hr_profili), e
-- l'effetto si vede: «timbrature senza profilo HR», ore che non arrivano alle
-- presenze, costi che non arrivano alle commesse.
--
-- Da qui:
--   1. hr_profili.lavora_in_cantiere distingue gli operai dagli impiegati: la
--      pagina Manodopera mostra solo loro;
--   2. ogni dipendente ha la sua scheda del Personale (creata o collegata da
--      sola), e ogni scheda di chi lavora in cantiere ha il suo dipendente;
--   3. l'account dell'app passa dal dipendente alla scheda;
--   4. le presenze del giorno si ricalcolano anche quando una timbratura viene
--      corretta o cancellata (prima solo all'inserimento), e le correzioni fatte
--      sulle timbrature dell'app di cantiere arrivano al registro del Personale.
--
-- Nessun cliente vero usa ancora gli operai: il riallineamento tocca le due
-- aziende demo. Idempotente.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ─── 1. Chi lavora in cantiere ──────────────────────────────────────────────

alter table public.hr_profili
  add column if not exists lavora_in_cantiere boolean not null default false;

comment on column public.hr_profili.lavora_in_cantiere is
  'Operaio o capocantiere: compare in Manodopera e Mezzi, si assegna alle commesse. Gli impiegati restano solo nel Personale.';

-- Una mansione o un ruolo da cantiere (muratore, posatore, capocantiere…).
create or replace function public.mansione_da_cantiere(p_testo text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(lower(p_testo), '') ~ '(operai|murator|carpentier|elettricist|idraulic|manoval|piastrell|posator|capopos|capocantier|caposquadr|serramentist|pittor|imbianchin|cartongess|lattoner|gruist|escavator|ponteggi|termoidraul|impiantist|fabbro|saldator|geometra di cantiere|autista)'
$$;

-- Il dipendente è da cantiere? employees.area vale «cantiere» di default anche
-- per chi non l'ha mai scelta, quindi da sola non basta: decidono ruolo e mansione.
create or replace function public.dipendente_da_cantiere(p_role_type text, p_qualifica text, p_area text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(p_area, 'cantiere') = 'cantiere'
     and coalesce(lower(p_role_type), '') not in ('staff_interno', 'subappaltatore', 'impiegato', 'venditore', 'commerciale', 'amministrazione', 'amministrativo')
     and (public.mansione_da_cantiere(p_role_type) or public.mansione_da_cantiere(p_qualifica))
$$;

revoke all on function public.mansione_da_cantiere(text) from public, anon;
revoke all on function public.dipendente_da_cantiere(text, text, text) from public, anon;
grant execute on function public.mansione_da_cantiere(text) to authenticated, service_role;
grant execute on function public.dipendente_da_cantiere(text, text, text) to authenticated, service_role;

-- ─── 2. Dal dipendente alla scheda del Personale ────────────────────────────

create or replace function public.scheda_hr_da_dipendente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scheda uuid;
begin
  -- Il dipendente l'ha appena creato la scheda stessa (vedi dipendente_da_scheda).
  if coalesce(current_setting('manodopera.crea_da_scheda', true), '') = 'on' then
    return new;
  end if;
  -- Le ditte in subappalto hanno la loro anagrafica.
  if coalesce(new.role_type, '') = 'subappaltatore' then
    return new;
  end if;
  if exists (select 1 from hr_profili h where h.employee_id = new.id) then
    return new;
  end if;

  -- Una scheda già esistente della stessa persona (stesso account o stessa
  -- email) si collega invece di duplicarla.
  select h.id into v_scheda
    from hr_profili h
   where h.company_id = new.company_id
     and h.employee_id is null
     and ((new.user_id is not null and h.user_id = new.user_id)
          or (nullif(trim(new.email), '') is not null and lower(h.email) = lower(trim(new.email))))
   order by h.created_at
   limit 1;

  if v_scheda is not null then
    update hr_profili
       set employee_id = new.id,
           user_id = coalesce(user_id, new.user_id),
           lavora_in_cantiere = lavora_in_cantiere or public.dipendente_da_cantiere(new.role_type, new.qualifica, new.area),
           updated_at = now()
     where id = v_scheda;
    return new;
  end if;

  insert into hr_profili (company_id, employee_id, user_id, nome, cognome, email, telefono,
                          mansione, data_assunzione, attivo, lavora_in_cantiere)
  values (new.company_id, new.id, new.user_id,
          coalesce(nullif(trim(new.first_name), ''), '—'), coalesce(nullif(trim(new.last_name), ''), '—'),
          nullif(trim(new.email), ''), new.phone,
          coalesce(nullif(trim(new.qualifica), ''), nullif(new.role_type, 'operaio'), case when new.role_type = 'operaio' then 'Operaio' end),
          new.data_assunzione, coalesce(new.is_active, true),
          public.dipendente_da_cantiere(new.role_type, new.qualifica, new.area));
  return new;
end $$;

drop trigger if exists trg_scheda_hr_da_dipendente on public.employees;
create trigger trg_scheda_hr_da_dipendente
  after insert on public.employees
  for each row execute function public.scheda_hr_da_dipendente();

-- L'account dell'app, quando arriva sul dipendente (invito, collegamento per
-- email), arriva anche sulla scheda: è da lì che timbrature, ferie e mezzi
-- riconoscono l'operaio.
create or replace function public.account_dipendente_verso_scheda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is not null and new.user_id is distinct from old.user_id then
    update hr_profili h
       set user_id = new.user_id, updated_at = now()
     where h.employee_id = new.id
       and h.user_id is null
       and not exists (select 1 from hr_profili x
                        where x.company_id = h.company_id and x.user_id = new.user_id and x.id <> h.id);
  end if;
  return new;
end $$;

drop trigger if exists trg_account_dipendente_verso_scheda on public.employees;
create trigger trg_account_dipendente_verso_scheda
  after update of user_id on public.employees
  for each row execute function public.account_dipendente_verso_scheda();

-- ─── 3. Dalla scheda di chi lavora in cantiere al dipendente ────────────────

create or replace function public.dipendente_da_scheda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dip uuid;
begin
  if not new.lavora_in_cantiere or new.employee_id is not null then
    return new;
  end if;

  -- Un dipendente della stessa persona senza scheda: si collega.
  select e.id into v_dip
    from employees e
   where e.company_id = new.company_id
     and not exists (select 1 from hr_profili h where h.employee_id = e.id and h.id <> new.id)
     and ((new.user_id is not null and e.user_id = new.user_id)
          or (nullif(trim(new.email), '') is not null and lower(e.email) = lower(trim(new.email))))
   order by e.created_at
   limit 1;

  if v_dip is null then
    perform set_config('manodopera.crea_da_scheda', 'on', true);
    insert into employees (company_id, first_name, last_name, email, phone, user_id, is_active,
                           role_type, area, data_assunzione, qualifica)
    values (new.company_id, new.nome, new.cognome, nullif(trim(new.email), ''), new.telefono,
            -- lo stesso account non può stare su due dipendenti dell'azienda
            case when new.user_id is not null
                      and not exists (select 1 from employees x where x.company_id = new.company_id and x.user_id = new.user_id)
                 then new.user_id end,
            coalesce(new.attivo, true), 'operaio', 'cantiere', new.data_assunzione, new.mansione)
    returning id into v_dip;
    perform set_config('manodopera.crea_da_scheda', '', true);
  end if;

  new.employee_id := v_dip;
  return new;
end $$;

drop trigger if exists trg_dipendente_da_scheda on public.hr_profili;
create trigger trg_dipendente_da_scheda
  before insert or update of lavora_in_cantiere on public.hr_profili
  for each row execute function public.dipendente_da_scheda();

revoke all on function public.scheda_hr_da_dipendente() from public, anon;
revoke all on function public.account_dipendente_verso_scheda() from public, anon;
revoke all on function public.dipendente_da_scheda() from public, anon;

-- ─── 4. Presenze ricalcolate anche dopo correzioni e cancellazioni ──────────

create or replace function public.ricalcola_giornata_hr(p_profilo uuid, p_data date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_ore_previste numeric(4,2);
  v_prima time;
  v_ultima time;
  v_lavorate numeric;
  v_pausa numeric := 0;
  v_inizio record;
  v_fine time;
begin
  if p_profilo is null or p_data is null then
    return;
  end if;
  -- Un giorno chiuso (per le paghe) non si tocca più.
  if exists (select 1 from hr_giornate g where g.profilo_id = p_profilo and g.data = p_data and g.bloccata) then
    return;
  end if;

  select company_id, coalesce(ore_giornaliere, 8) into v_company, v_ore_previste
    from hr_profili where id = p_profilo;
  if v_company is null then
    return;
  end if;

  select min(ora_evento) filter (where tipo = 'entrata'),
         max(ora_evento) filter (where tipo = 'uscita')
    into v_prima, v_ultima
    from hr_timbrature
   where profilo_id = p_profilo and data_evento = p_data;

  -- Nessuna timbratura rimasta (cancellate tutte): la giornata si azzera, se c'era.
  if v_prima is null and v_ultima is null
     and not exists (select 1 from hr_timbrature where profilo_id = p_profilo and data_evento = p_data) then
    update hr_giornate
       set ore_lavorate = 0, ore_pausa = 0, ore_straordinario = 0,
           prima_entrata = null, ultima_uscita = null, updated_at = now()
     where profilo_id = p_profilo and data = p_data;
    return;
  end if;

  v_lavorate := case when v_prima is not null and v_ultima is not null
                     then extract(epoch from (v_ultima - v_prima)) / 3600.0 else 0 end;

  for v_inizio in
    select ora_evento from hr_timbrature
     where profilo_id = p_profilo and data_evento = p_data and tipo = 'pausa_inizio'
     order by ora_evento
  loop
    select ora_evento into v_fine from hr_timbrature
     where profilo_id = p_profilo and data_evento = p_data and tipo = 'pausa_fine'
       and ora_evento > v_inizio.ora_evento
     order by ora_evento limit 1;
    if v_fine is not null then
      v_pausa := v_pausa + extract(epoch from (v_fine - v_inizio.ora_evento)) / 3600.0;
    end if;
  end loop;

  v_lavorate := greatest(0, v_lavorate - v_pausa);

  insert into hr_giornate (company_id, profilo_id, data, ore_previste, ore_lavorate, ore_pausa,
                           ore_straordinario, prima_entrata, ultima_uscita)
  values (v_company, p_profilo, p_data, v_ore_previste,
          round(v_lavorate::numeric, 2), round(v_pausa::numeric, 2),
          round(greatest(0, v_lavorate - v_ore_previste)::numeric, 2), v_prima, v_ultima)
  on conflict (profilo_id, data) do update set
    ore_lavorate = excluded.ore_lavorate,
    ore_pausa = excluded.ore_pausa,
    ore_straordinario = excluded.ore_straordinario,
    prima_entrata = excluded.prima_entrata,
    ultima_uscita = excluded.ultima_uscita,
    updated_at = now();
end $$;

create or replace function public.calcola_giornata_hr()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.ricalcola_giornata_hr(new.profilo_id, new.data_evento);
  end if;
  -- Spostata su un altro giorno o persona, o cancellata: si ricalcola anche il giorno di prima.
  if tg_op = 'DELETE'
     or (tg_op = 'UPDATE' and (old.profilo_id is distinct from new.profilo_id or old.data_evento is distinct from new.data_evento)) then
    perform public.ricalcola_giornata_hr(old.profilo_id, old.data_evento);
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_calcola_giornata_hr on public.hr_timbrature;
create trigger trg_calcola_giornata_hr
  after insert or update or delete on public.hr_timbrature
  for each row execute function public.calcola_giornata_hr();

-- Le correzioni dell'ufficio sulle timbrature dell'app di cantiere arrivano al
-- registro del Personale (prima la copia avveniva solo all'inserimento).
create or replace function public.propaga_correzione_campo_timbratura()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.hr_timbratura_id is not null then
      delete from hr_timbrature where id = old.hr_timbratura_id;
    end if;
    return old;
  end if;
  if new.hr_timbratura_id is not null
     and (new.tipo is distinct from old.tipo
          or new.timestamp_evento is distinct from old.timestamp_evento
          or new.order_id is distinct from old.order_id
          or new.gps_lat is distinct from old.gps_lat
          or new.gps_lng is distinct from old.gps_lng
          or new.note is distinct from old.note) then
    update hr_timbrature
       set tipo = new.tipo,
           "timestamp" = new.timestamp_evento,
           order_id = new.order_id,
           lat = new.gps_lat,
           lng = new.gps_lng,
           note = new.note
     where id = new.hr_timbratura_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_propaga_correzione_campo_timbratura on public.campo_timbrature;
create trigger trg_propaga_correzione_campo_timbratura
  after update or delete on public.campo_timbrature
  for each row execute function public.propaga_correzione_campo_timbratura();

revoke all on function public.ricalcola_giornata_hr(uuid, date) from public, anon, authenticated;
revoke all on function public.calcola_giornata_hr() from public, anon;
revoke all on function public.propaga_correzione_campo_timbratura() from public, anon;

-- ─── 5. Riallineamento dei dati esistenti ───────────────────────────────────

-- a) Schede senza dipendente e dipendenti senza scheda della stessa persona
--    (stesso account o stessa email): si collegano. Una scheda va a un solo
--    dipendente e viceversa.
with coppie as (
  select distinct on (e.id) e.id as dipendente, h.id as scheda
    from public.employees e
    join public.hr_profili h
      on h.company_id = e.company_id
     and h.employee_id is null
     and ((e.user_id is not null and h.user_id = e.user_id)
          or (nullif(trim(e.email), '') is not null and lower(h.email) = lower(trim(e.email))))
   where coalesce(e.role_type, '') <> 'subappaltatore'
     and not exists (select 1 from public.hr_profili x where x.employee_id = e.id)
   order by e.id, h.created_at
)
update public.hr_profili h
   set employee_id = c.dipendente, updated_at = now()
  from coppie c
 where h.id = c.scheda
   and not exists (select 1 from coppie c2 where c2.scheda = c.scheda and c2.dipendente < c.dipendente);

-- b) Chi lavora in cantiere, dalle mansioni e dai ruoli già scritti.
update public.hr_profili h
   set lavora_in_cantiere = true
 where not h.lavora_in_cantiere
   and (public.mansione_da_cantiere(h.mansione)
        or exists (select 1 from public.employees e
                    where e.id = h.employee_id
                      and public.dipendente_da_cantiere(e.role_type, e.qualifica, e.area)));

-- c) L'account del dipendente sulla scheda che non ce l'ha.
update public.hr_profili h
   set user_id = e.user_id, updated_at = now()
  from public.employees e
 where h.employee_id = e.id
   and h.user_id is null
   and e.user_id is not null
   and not exists (select 1 from public.hr_profili x
                    where x.company_id = h.company_id and x.user_id = e.user_id and x.id <> h.id);

-- d) I dipendenti ancora senza scheda la ricevono, con la stessa regola dei nuovi.
insert into public.hr_profili (company_id, employee_id, user_id, nome, cognome, email, telefono,
                               mansione, data_assunzione, attivo, lavora_in_cantiere)
select e.company_id, e.id,
       case when e.user_id is not null
                 and not exists (select 1 from public.hr_profili x where x.company_id = e.company_id and x.user_id = e.user_id)
            then e.user_id end,
       coalesce(nullif(trim(e.first_name), ''), '—'), coalesce(nullif(trim(e.last_name), ''), '—'),
       nullif(trim(e.email), ''), e.phone,
       coalesce(nullif(trim(e.qualifica), ''), nullif(e.role_type, 'operaio'), case when e.role_type = 'operaio' then 'Operaio' end),
       e.data_assunzione, coalesce(e.is_active, true),
       public.dipendente_da_cantiere(e.role_type, e.qualifica, e.area)
  from public.employees e
 where coalesce(e.role_type, '') <> 'subappaltatore'
   and not exists (select 1 from public.hr_profili h where h.employee_id = e.id);

-- e) Le schede di chi lavora in cantiere senza dipendente lo ricevono
--    (scatta trg_dipendente_da_scheda, che collega o crea).
update public.hr_profili
   set lavora_in_cantiere = true
 where lavora_in_cantiere
   and employee_id is null;
