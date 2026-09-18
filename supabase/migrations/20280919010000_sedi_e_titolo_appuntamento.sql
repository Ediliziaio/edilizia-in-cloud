-- Sedi (showroom) dell'azienda e titolo automatico degli appuntamenti.
--
-- Richiesta di Il Bagno Group (18/09/2026): quando si fissa un appuntamento
-- nel calendario di un consulente, il titolo dev'essere
--
--   Cognome Nome | Il Bagno Group Via Nuova Valassina 27, Lissone
--
-- cioè il cliente, il nome dell'azienda e l'indirizzo dello showroom di quel
-- consulente. Chi lavora a domicilio (Vincenzo) non ha showroom: al suo posto
-- va l'indirizzo scritto nell'appuntamento.
--
-- Il titolo lo compone un trigger, non la schermata: gli appuntamenti nascono
-- da almeno sei posti diversi (calendario, scheda contatto, opportunità,
-- automazioni, prenotazione dal sito, Silvio) e in ognuno il titolo veniva
-- costruito a mano come «Appuntamento con Mario Rossi».

-- ── Le sedi ──────────────────────────────────────────────────────────────
create table if not exists public.company_sedi (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  nome          text not null,
  indirizzo     text,
  citta         text,
  cap           text,
  provincia     text,
  attiva        boolean not null default true,
  creato_il     timestamptz not null default now(),
  aggiornato_il timestamptz not null default now()
);
create unique index if not exists company_sedi_nome_unico on public.company_sedi (company_id, lower(nome));
create index if not exists company_sedi_azienda on public.company_sedi (company_id);

-- Un utente sta in una sede sola: la chiave primaria lo impone.
create table if not exists public.company_sedi_utenti (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id    uuid not null,
  sede_id    uuid not null references public.company_sedi(id) on delete cascade,
  creato_il  timestamptz not null default now(),
  primary key (company_id, user_id)
);
create index if not exists company_sedi_utenti_sede on public.company_sedi_utenti (sede_id);

alter table public.company_sedi enable row level security;
alter table public.company_sedi_utenti enable row level security;

drop policy if exists "sedi viste da chi sta in azienda" on public.company_sedi;
create policy "sedi viste da chi sta in azienda" on public.company_sedi
  for select using (public.user_can_access_company(company_id));

drop policy if exists "sedi gestite dagli amministratori" on public.company_sedi;
create policy "sedi gestite dagli amministratori" on public.company_sedi
  for all
  using (
    (select public.has_role((select auth.uid()), 'super_admin'::app_role))
    or ((select public.has_role((select auth.uid()), 'company_admin'::app_role))
        and company_id = (select public.get_user_company_id((select auth.uid()))))
  )
  with check (
    (select public.has_role((select auth.uid()), 'super_admin'::app_role))
    or ((select public.has_role((select auth.uid()), 'company_admin'::app_role))
        and company_id = (select public.get_user_company_id((select auth.uid()))))
  );

drop policy if exists "sedi degli utenti viste da chi sta in azienda" on public.company_sedi_utenti;
create policy "sedi degli utenti viste da chi sta in azienda" on public.company_sedi_utenti
  for select using (public.user_can_access_company(company_id));

drop policy if exists "sedi degli utenti gestite dagli amministratori" on public.company_sedi_utenti;
create policy "sedi degli utenti gestite dagli amministratori" on public.company_sedi_utenti
  for all
  using (
    (select public.has_role((select auth.uid()), 'super_admin'::app_role))
    or ((select public.has_role((select auth.uid()), 'company_admin'::app_role))
        and company_id = (select public.get_user_company_id((select auth.uid()))))
  )
  with check (
    (select public.has_role((select auth.uid()), 'super_admin'::app_role))
    or ((select public.has_role((select auth.uid()), 'company_admin'::app_role))
        and company_id = (select public.get_user_company_id((select auth.uid()))))
  );

-- ── L'interruttore, per azienda ──────────────────────────────────────────
alter table public.companies
  add column if not exists appuntamenti_titolo_auto boolean not null default false;

comment on column public.companies.appuntamenti_titolo_auto is
  'Titolo degli appuntamenti composto dal sistema: «Cognome Nome | Azienda indirizzo della sede».';

-- ── Come si scrive il titolo ─────────────────────────────────────────────
-- Nessun GRANT: la chiama solo il trigger qui sotto. Da fuori non serve a
-- nessuno, e leggerebbe il nome di un contatto a partire dal suo id.
create or replace function public.titolo_appuntamento(
  p_company   uuid,
  p_etichetta text,
  p_contatto  uuid,
  p_assegnato uuid,
  p_indirizzo text,
  p_citta     text
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
    select btrim(concat_ws(', ',
             nullif(btrim(s.indirizzo), ''),
             nullif(btrim(s.citta), ''))) as dove
    from company_sedi_utenti u
    join company_sedi s on s.id = u.sede_id
    where u.company_id = p_company and u.user_id = p_assegnato and s.attiva
  )
  select case
    when coalesce((select nome from contatto), '') = '' then null
    else btrim(concat_ws(' ',
      (select nome from contatto) || ' | ' || nullif(btrim(coalesce(p_etichetta, '')), ''),
      -- Showroom del consulente; chi non ne ha (appuntamenti a casa) porta
      -- l'indirizzo scritto nell'appuntamento.
      coalesce(
        nullif((select dove from sede), ''),
        nullif(btrim(concat_ws(', ', nullif(btrim(coalesce(p_indirizzo, '')), ''), nullif(btrim(coalesce(p_citta, '')), ''))), '')
      )))
  end
$$;

revoke all on function public.titolo_appuntamento(uuid, text, uuid, uuid, text, text) from public, anon, authenticated;

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
    new.company_id, v_etichetta, new.contact_id, new.assigned_to, new.address_line, new.address_city);
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
    old.company_id, v_etichetta, old.contact_id, old.assigned_to, old.address_line, old.address_city);
  if old.title is not distinct from v_vecchio then
    new.title := v_nuovo;
  end if;
  return new;
end
$$;

-- Attenzione: fuori da «update of» ci sta apposta `title` — se il trigger
-- scattasse anche quando si riscrive il titolo, riscriverebbe sopra la
-- modifica fatta a mano.
drop trigger if exists trg_titolo_appuntamento on public.appointments;
create trigger trg_titolo_appuntamento
  before insert or update of assigned_to, contact_id, address_line, address_city
  on public.appointments
  for each row execute function public.componi_titolo_appuntamento();

-- ── Le quattro sedi di Il Bagno Group e chi ci lavora ────────────────────
do $$
declare
  v_az uuid;
begin
  select id into v_az from companies where lower(name) = 'il bagno group' limit 1;
  if v_az is null then
    raise notice 'Il Bagno Group non trovata: sedi non inserite';
    return;
  end if;

  insert into company_sedi (company_id, nome, indirizzo, citta, cap, provincia) values
    (v_az, 'Lissone',       'Via Nuova Valassina 27',   'Lissone',       '20851', 'MB'),
    (v_az, 'Fino Mornasco', 'Via Statale dei Giovi 10', 'Fino Mornasco', '22073', 'CO'),
    (v_az, 'Nova Milanese', 'Via Vittorio Veneto 2',    'Nova Milanese', '20834', 'MB'),
    (v_az, 'Inverigo',      'Via Don Gnocchi 104',      'Inverigo',      '22044', 'CO')
  on conflict do nothing;

  insert into company_sedi_utenti (company_id, user_id, sede_id)
  select v_az, p.id, s.id
  from (values
    ('camilla@ilbagnogroup.com',   'Lissone'),
    ('katia@ilbagnogroup.com',     'Lissone'),
    ('valentina@ilbagnogroup.com', 'Lissone'),
    ('alice@ilbagnogroup.com',     'Lissone'),
    ('giovanna@ilbagnogroup.com',  'Nova Milanese'),
    ('marco@ilbagnogroup.com',     'Fino Mornasco'),
    ('leonardo@ilbagnogroup.com',  'Fino Mornasco'),
    ('giuseppe@ilbagnogroup.com',  'Inverigo')
  ) as m(email, sede)
  join profiles p on lower(p.email) = m.email and p.company_id = v_az
  join company_sedi s on s.company_id = v_az and s.nome = m.sede
  on conflict (company_id, user_id) do update set sede_id = excluded.sede_id;

  -- Vincenzo va a casa dei clienti: nessuna sede, il titolo prende
  -- l'indirizzo dell'appuntamento.
  update companies set appuntamenti_titolo_auto = true where id = v_az;
end
$$;
