-- Programmazione della giornata (26/11/2026, richiesta di Florin).
--
-- «La sera prima preparo il cantiere del giorno dopo»: chi va dove, a che
-- ora, con quali mezzi, su quale lavorazione. L'unità è l'INTERVENTO
-- (commessa, sopralluogo, assistenza o altro): la stessa persona può stare
-- in più interventi dello stesso giorno (geometra, manutentore, pose in fila).
--
-- Applicata il 26/11/2026 con apply_migration, col via di Florin, e
-- riallineata a questa versione (vedi CLAUDE.md, «Come applicare una migrazione»).
--
-- Tabelle (tutte con company_id: entrano da sole nel backup aziendale):
--   · programmazione_giornate    — una per azienda e giorno; bozza o pubblicata;
--                                  `versione` per non pestarsi in due;
--   · programmazione_interventi  — gli interventi del giorno;
--   · programmazione_persone     — chi va (hr_profili);
--   · programmazione_mezzi       — con cosa;
--   · programmazione_avvisi      — cosa è già stato detto a ciascuno, per
--                                  avvisare dopo una modifica solo chi è toccato.
-- Nessuna regola per riga: nessuno legge o scrive le tabelle direttamente,
-- passa tutto dalle funzioni qui sotto, che controllano i permessi Commesse.
--
-- Funzioni:
--   · programmazione_leggi(azienda, giorno)              — Vedere commesse
--   · programmazione_salva(azienda, giorno, interventi, versione) — Modificare commesse
--   · programmazione_pubblica(azienda, giorno, versione)  — Modificare commesse:
--       dà l'accesso al cantiere nell'app (order_campo_assignments, da_programmazione)
--       e manda la notifica solo a chi è nuovo o ha avuto un cambio;
--   · campo_mio_programma(giorno)                        — l'operaio vede il suo giorno.
--
-- Solo tabelle nuove e una colonna con valore fisso: nessuna riga esistente
-- viene riscritta. Idempotente.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ── Tabelle ─────────────────────────────────────────────────────────────────
create table if not exists public.programmazione_giornate (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  giorno date not null,
  stato text not null default 'bozza' check (stato in ('bozza', 'pubblicata')),
  versione integer not null default 0,
  pubblicata_at timestamptz,
  pubblicata_da uuid references public.profiles(id) on delete set null,
  -- Cambiata dopo l'ultima pubblicazione: gli operai non sono ancora stati avvisati.
  modificata_dopo boolean not null default false,
  -- false = preparata solo in parte da un altro giorno («fisso fino a fine
  -- lavori», «porta a domani»): l'app la completa con la proposta del giorno.
  completa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  constraint programmazione_giornate_una_al_giorno unique (company_id, giorno)
);

create table if not exists public.programmazione_interventi (
  id uuid primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  giornata_id uuid not null references public.programmazione_giornate(id) on delete cascade,
  posizione integer not null default 0,
  -- commissione = ritirare merce in magazzino, comprare qualcosa, portare un attrezzo.
  tipo text not null default 'commessa' check (tipo in ('commessa', 'sopralluogo', 'manutenzione', 'commissione', 'altro')),
  order_id uuid references public.orders(id) on delete set null,
  fase_id uuid references public.order_work_phases(id) on delete set null,
  -- Sopralluogo (surveys.id) o assistenza (tickets.id) da cui nasce.
  fonte_id uuid,
  titolo text not null,
  codice text,
  indirizzo text,
  lat double precision,
  lng double precision,
  inizio time,
  fine time,
  -- Senza orario: «prima» o «dopo» il cantiere (passare in magazzino stasera).
  momento text check (momento is null or momento in ('prima', 'dopo')),
  servono smallint check (servono is null or servono between 1 and 99),
  capo_hr_profilo_id uuid references public.hr_profili(id) on delete set null,
  note text,
  -- Abilitazioni che servono (gru, ple, ponteggi…): chiavi decise dall'app.
  richiede text[] not null default '{}'
);
create index if not exists programmazione_interventi_giornata_idx on public.programmazione_interventi (giornata_id, posizione);
create index if not exists programmazione_interventi_order_idx on public.programmazione_interventi (order_id) where order_id is not null;

create table if not exists public.programmazione_persone (
  intervento_id uuid not null references public.programmazione_interventi(id) on delete cascade,
  hr_profilo_id uuid not null references public.hr_profili(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  posizione smallint not null default 0,
  primary key (intervento_id, hr_profilo_id)
);
create index if not exists programmazione_persone_profilo_idx on public.programmazione_persone (hr_profilo_id);

create table if not exists public.programmazione_mezzi (
  intervento_id uuid not null references public.programmazione_interventi(id) on delete cascade,
  mezzo_id uuid not null references public.mezzi(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  primary key (intervento_id, mezzo_id)
);
create index if not exists programmazione_mezzi_mezzo_idx on public.programmazione_mezzi (mezzo_id);

create table if not exists public.programmazione_esterni (
  intervento_id uuid not null references public.programmazione_interventi(id) on delete cascade,
  external_team_id uuid not null references public.external_teams(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  primary key (intervento_id, external_team_id)
);

create table if not exists public.programmazione_avvisi (
  giornata_id uuid not null references public.programmazione_giornate(id) on delete cascade,
  hr_profilo_id uuid not null references public.hr_profili(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  -- Il programma della persona come gliel'abbiamo detto l'ultima volta.
  firma text not null,
  avvisato_at timestamptz not null default now(),
  -- L'operaio ha toccato «Ok, visto» nell'app (si azzera a ogni nuovo avviso).
  visto_at timestamptz,
  primary key (giornata_id, hr_profilo_id)
);

comment on table public.programmazione_giornate is 'Programmazione della giornata (Commesse → Programmazione). Si legge e scrive solo con programmazione_leggi/salva/pubblica.';

alter table public.programmazione_giornate enable row level security;
alter table public.programmazione_interventi enable row level security;
alter table public.programmazione_persone enable row level security;
alter table public.programmazione_mezzi enable row level security;
alter table public.programmazione_avvisi enable row level security;
alter table public.programmazione_esterni enable row level security;
revoke all on public.programmazione_giornate, public.programmazione_interventi, public.programmazione_persone,
  public.programmazione_mezzi, public.programmazione_avvisi, public.programmazione_esterni from anon, authenticated;

-- L'accesso al cantiere dato dalla programmazione (come da_squadra_id per le squadre).
alter table public.order_campo_assignments
  add column if not exists da_programmazione boolean not null default false;

-- ── Leggere ─────────────────────────────────────────────────────────────────
create or replace function public.programmazione_leggi(p_company_id uuid, p_giorno date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_g public.programmazione_giornate;
begin
  if not public.has_permission_for_company(auth.uid(), 'can_view_orders', p_company_id) then
    raise exception using errcode = '42501', message = 'Non hai il permesso di vedere la programmazione.';
  end if;

  select * into v_g from public.programmazione_giornate g where g.company_id = p_company_id and g.giorno = p_giorno;

  return jsonb_build_object(
    'esiste', v_g.id is not null,
    'stato', coalesce(v_g.stato, 'bozza'),
    'versione', coalesce(v_g.versione, 0),
    'pubblicata_at', v_g.pubblicata_at,
    'modificata_dopo', coalesce(v_g.modificata_dopo, false),
    'completa', coalesce(v_g.completa, true),
    'interventi', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', i.id, 'tipo', i.tipo, 'orderId', i.order_id, 'faseId', i.fase_id, 'fonteId', i.fonte_id,
               'titolo', i.titolo, 'codice', i.codice, 'indirizzo', i.indirizzo,
               'punto', case when i.lat is not null and i.lng is not null then jsonb_build_object('lat', i.lat, 'lng', i.lng) end,
               'inizio', to_char(i.inizio, 'HH24:MI'), 'fine', to_char(i.fine, 'HH24:MI'), 'momento', i.momento,
               'servono', i.servono, 'capoId', i.capo_hr_profilo_id, 'note', i.note,
               'persone', coalesce((select jsonb_agg(p.hr_profilo_id order by p.posizione, p.hr_profilo_id)
                                      from public.programmazione_persone p where p.intervento_id = i.id), '[]'::jsonb),
               'mezzi', coalesce((select jsonb_agg(m.mezzo_id order by m.mezzo_id)
                                    from public.programmazione_mezzi m where m.intervento_id = i.id), '[]'::jsonb),
               'esterni', coalesce((select jsonb_agg(x.external_team_id order by x.external_team_id)
                                      from public.programmazione_esterni x where x.intervento_id = i.id), '[]'::jsonb),
               'richiede', to_jsonb(i.richiede)
             ) order by i.posizione)
        from public.programmazione_interventi i
       where i.giornata_id = v_g.id), '[]'::jsonb),
    -- Chi ha letto il programma nell'app («Ok, visto»).
    'visti', coalesce((
      select jsonb_object_agg(a.hr_profilo_id, a.visto_at)
        from public.programmazione_avvisi a
       where a.giornata_id = v_g.id and a.visto_at is not null), '{}'::jsonb),
    -- Persona ↔ account: serve ad abbinare chi ha un sopralluogo o un'assistenza.
    -- Solo gli id, niente dati del Personale.
    'utenti', coalesce((
      select jsonb_object_agg(h.id, h.user_id)
        from public.hr_profili h
       where h.company_id = p_company_id and h.user_id is not null and coalesce(h.attivo, true)), '{}'::jsonb)
  );
end;
$$;
revoke all on function public.programmazione_leggi(uuid, date) from public, anon;
grant execute on function public.programmazione_leggi(uuid, date) to authenticated;

-- ── Salvare ─────────────────────────────────────────────────────────────────
-- Sostituisce gli interventi del giorno con quelli mandati. Gli id che non
-- appartengono all'azienda (commessa, fase, persone, mezzi) vengono scartati
-- in silenzio: il browser non decide di chi è cosa.
create or replace function public.programmazione_salva(p_company_id uuid, p_giorno date, p_interventi jsonb, p_versione integer, p_completa boolean default true)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_g public.programmazione_giornate;
  v_x jsonb;
  v_ord bigint;
  v_id uuid;
  v_order uuid;
  v_ora constant text := '^([01][0-9]|2[0-3]):[0-5][0-9]$';
  v_uuid constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
  if not public.has_permission_for_company(auth.uid(), 'can_edit_orders', p_company_id) then
    raise exception using errcode = '42501', message = 'Non hai il permesso di modificare la programmazione.';
  end if;
  if p_interventi is null or jsonb_typeof(p_interventi) <> 'array' or jsonb_array_length(p_interventi) > 300 then
    raise exception using errcode = '22023', message = 'Giornata non valida.';
  end if;

  insert into public.programmazione_giornate (company_id, giorno, updated_by)
  values (p_company_id, p_giorno, auth.uid())
  on conflict (company_id, giorno) do nothing;

  select * into v_g from public.programmazione_giornate g
   where g.company_id = p_company_id and g.giorno = p_giorno
   for update;

  if p_versione is not null and v_g.versione <> p_versione then
    raise exception using errcode = '40001',
      message = 'Qualcun altro ha cambiato questa giornata: ricarica per vedere le sue modifiche.';
  end if;

  delete from public.programmazione_interventi i where i.giornata_id = v_g.id;

  for v_x, v_ord in select e.value, e.ordinality from jsonb_array_elements(p_interventi) with ordinality e loop
    v_id := case when v_x->>'id' ~ v_uuid then (v_x->>'id')::uuid else gen_random_uuid() end;
    -- Lo stesso id due volte nella stessa giornata: il secondo ne prende uno nuovo.
    if exists (select 1 from public.programmazione_interventi i where i.id = v_id) then
      v_id := gen_random_uuid();
    end if;
    select o.id into v_order from public.orders o
     where v_x->>'orderId' ~ v_uuid and o.id = (v_x->>'orderId')::uuid and o.company_id = p_company_id;

    insert into public.programmazione_interventi
      (id, company_id, giornata_id, posizione, tipo, order_id, fase_id, fonte_id, titolo, codice, indirizzo,
       lat, lng, inizio, fine, momento, servono, capo_hr_profilo_id, note, richiede)
    values (
      v_id, p_company_id, v_g.id, v_ord::integer,
      case when v_x->>'tipo' in ('commessa', 'sopralluogo', 'manutenzione', 'commissione', 'altro') then v_x->>'tipo' else 'altro' end,
      v_order,
      (select f.id from public.order_work_phases f
        where v_order is not null and v_x->>'faseId' ~ v_uuid and f.id = (v_x->>'faseId')::uuid and f.order_id = v_order),
      case when v_x->>'fonteId' ~ v_uuid then (v_x->>'fonteId')::uuid end,
      left(coalesce(nullif(btrim(v_x->>'titolo'), ''), 'Intervento'), 300),
      left(nullif(btrim(v_x->>'codice'), ''), 80),
      left(nullif(btrim(v_x->>'indirizzo'), ''), 300),
      case when jsonb_typeof(v_x->'punto'->'lat') = 'number' then (v_x->'punto'->>'lat')::double precision end,
      case when jsonb_typeof(v_x->'punto'->'lng') = 'number' then (v_x->'punto'->>'lng')::double precision end,
      case when v_x->>'inizio' ~ v_ora then (v_x->>'inizio')::time end,
      case when v_x->>'fine' ~ v_ora then (v_x->>'fine')::time end,
      case when v_x->>'inizio' ~ v_ora then null when v_x->>'momento' in ('prima', 'dopo') then v_x->>'momento' end,
      case when v_x->>'servono' ~ '^[0-9]{1,2}$' and (v_x->>'servono')::integer between 1 and 99 then (v_x->>'servono')::smallint end,
      (select h.id from public.hr_profili h
        where v_x->>'capoId' ~ v_uuid and h.id = (v_x->>'capoId')::uuid and h.company_id = p_company_id),
      left(nullif(btrim(v_x->>'note'), ''), 1000),
      coalesce((select array_agg(distinct r.valore)
                  from jsonb_array_elements_text(case when jsonb_typeof(v_x->'richiede') = 'array' then v_x->'richiede' else '[]'::jsonb end) r(valore)
                 where r.valore ~ '^[a-z_]{2,30}$'), '{}')
    );

    insert into public.programmazione_persone (intervento_id, hr_profilo_id, company_id, posizione)
    select v_id, h.id, p_company_id, min(p.ordinality)::smallint
      from jsonb_array_elements_text(case when jsonb_typeof(v_x->'persone') = 'array' then v_x->'persone' else '[]'::jsonb end)
           with ordinality p(valore, ordinality)
      join public.hr_profili h on p.valore ~ v_uuid and h.id = p.valore::uuid and h.company_id = p_company_id
     group by h.id;

    insert into public.programmazione_mezzi (intervento_id, mezzo_id, company_id)
    select distinct v_id, m.id, p_company_id
      from jsonb_array_elements_text(case when jsonb_typeof(v_x->'mezzi') = 'array' then v_x->'mezzi' else '[]'::jsonb end) x(valore)
      join public.mezzi m on x.valore ~ v_uuid and m.id = x.valore::uuid and m.company_id = p_company_id and m.deleted_at is null;

    insert into public.programmazione_esterni (intervento_id, external_team_id, company_id)
    select distinct v_id, t.id, p_company_id
      from jsonb_array_elements_text(case when jsonb_typeof(v_x->'esterni') = 'array' then v_x->'esterni' else '[]'::jsonb end) x(valore)
      join public.external_teams t on x.valore ~ v_uuid and t.id = x.valore::uuid and t.company_id = p_company_id;
  end loop;

  update public.programmazione_giornate g
     set versione = g.versione + 1,
         updated_at = now(),
         updated_by = auth.uid(),
         modificata_dopo = (g.stato = 'pubblicata'),
         completa = coalesce(p_completa, true)
   where g.id = v_g.id;

  return v_g.versione + 1;
end;
$$;
revoke all on function public.programmazione_salva(uuid, date, jsonb, integer, boolean) from public, anon;
grant execute on function public.programmazione_salva(uuid, date, jsonb, integer, boolean) to authenticated;

-- ── Pubblicare ──────────────────────────────────────────────────────────────
-- Dà l'accesso ai cantieri nell'app a chi ci va e avvisa con una notifica
-- solo chi è nuovo, ha avuto un cambio o è stato tolto. Gli accessi dati a
-- mano o dalle squadre non si toccano; quelli dati dalla programmazione si
-- allungano fino al giorno pubblicato.
create or replace function public.programmazione_pubblica(p_company_id uuid, p_giorno date, p_versione integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_g public.programmazione_giornate;
  v_oggi date := (now() at time zone 'Europe/Rome')::date;
  v_quando text;
  v_accessi integer := 0;
  v_avvisati integer := 0;
  v_tolti integer := 0;
  v_senza_app integer := 0;
  v_programma jsonb;
begin
  if not public.has_permission_for_company(auth.uid(), 'can_edit_orders', p_company_id) then
    raise exception using errcode = '42501', message = 'Non hai il permesso di pubblicare la programmazione.';
  end if;

  select * into v_g from public.programmazione_giornate g
   where g.company_id = p_company_id and g.giorno = p_giorno
   for update;
  if v_g.id is null then
    raise exception using errcode = 'P0002', message = 'Prima salva la giornata.';
  end if;
  if p_versione is not null and v_g.versione <> p_versione then
    raise exception using errcode = '40001',
      message = 'Qualcun altro ha cambiato questa giornata: ricarica per vedere le sue modifiche.';
  end if;

  v_quando := case when p_giorno = v_oggi then 'Oggi'
                   when p_giorno = v_oggi + 1 then 'Domani'
                   else 'Il ' || to_char(p_giorno, 'DD/MM') end;

  -- 1. Accesso al cantiere nell'app.
  with voluti as (
    select distinct on (i.order_id, h.user_id)
           i.order_id, h.user_id, (i.capo_hr_profilo_id = h.id) as capo
      from public.programmazione_interventi i
      join public.programmazione_persone p on p.intervento_id = i.id
      join public.hr_profili h on h.id = p.hr_profilo_id and h.user_id is not null
     where i.giornata_id = v_g.id and i.order_id is not null
     order by i.order_id, h.user_id, (i.capo_hr_profilo_id = h.id) desc
  ), scritti as (
    insert into public.order_campo_assignments
      (company_id, order_id, user_id, role_type, assigned_by, data_inizio, data_fine_prevista, is_capocantiere, note, da_programmazione)
    select p_company_id, v.order_id, v.user_id, 'employee', auth.uid(), p_giorno, p_giorno, v.capo,
           'Dalla programmazione del ' || to_char(p_giorno, 'DD/MM'), true
      from voluti v
    on conflict (order_id, user_id) do update
       set data_fine_prevista = greatest(coalesce(order_campo_assignments.data_fine_prevista, excluded.data_fine_prevista), excluded.data_fine_prevista),
           data_inizio = least(coalesce(order_campo_assignments.data_inizio, excluded.data_inizio), excluded.data_inizio)
     where order_campo_assignments.da_programmazione
    returning 1
  )
  select count(*) into v_accessi from scritti;

  -- 2. Il programma di ciascuno, come testo: se cambia, lo si avvisa.
  select coalesce(jsonb_agg(jsonb_build_object('hr_profilo_id', q.hr_profilo_id, 'user_id', q.user_id, 'firma', q.firma,
                                               'titolo', q.titolo, 'righe', q.righe, 'n', q.n)), '[]'::jsonb)
    into v_programma
    from (
      select h.id as hr_profilo_id, h.user_id,
             string_agg(concat_ws('|', i.id, to_char(i.inizio, 'HH24:MI'), to_char(i.fine, 'HH24:MI'), i.momento, i.titolo, i.indirizzo, i.capo_hr_profilo_id = h.id),
                        '§' order by case i.momento when 'prima' then 0 when 'dopo' then 3 else case when i.inizio is null then 2 else 1 end end, i.inizio, i.posizione) as firma,
             (array_agg(i.titolo order by case i.momento when 'prima' then 0 when 'dopo' then 3 else case when i.inizio is null then 2 else 1 end end, i.inizio, i.posizione))[1] as titolo,
             string_agg(concat_ws(' · ', coalesce(to_char(i.inizio, 'HH24:MI'), case i.momento when 'prima' then 'Prima del cantiere' when 'dopo' then 'Dopo il cantiere' else 'In giornata' end), i.titolo, i.indirizzo),
                        E'\n' order by case i.momento when 'prima' then 0 when 'dopo' then 3 else case when i.inizio is null then 2 else 1 end end, i.inizio, i.posizione) as righe,
             count(*)::integer as n
        from public.programmazione_interventi i
        join public.programmazione_persone p on p.intervento_id = i.id
        join public.hr_profili h on h.id = p.hr_profilo_id
       where i.giornata_id = v_g.id
       group by h.id, h.user_id
    ) q;

  select count(*) into v_senza_app from jsonb_to_recordset(v_programma) as x(user_id uuid) where x.user_id is null;

  insert into public.notifications (company_id, user_id, type, title, body, entity_type, entity_id, action_url)
  select p_company_id, x.user_id, 'programmazione',
         left(case when a.firma is null then v_quando || ' sei a ' || x.titolo
                   else 'Cambio di programma: ' || lower(v_quando) || ' sei a ' || x.titolo end
              || case when x.n > 1 then ' (+' || (x.n - 1) || ')' else '' end, 200),
         left(x.righe, 600), 'programmazione', v_g.id, '/campo?programma=' || p_giorno
    from jsonb_to_recordset(v_programma) as x(hr_profilo_id uuid, user_id uuid, firma text, titolo text, righe text, n integer)
    left join public.programmazione_avvisi a on a.giornata_id = v_g.id and a.hr_profilo_id = x.hr_profilo_id
   where x.user_id is not null and a.firma is distinct from x.firma;
  get diagnostics v_avvisati = row_count;

  -- Chi era in programma e adesso non c'è più.
  insert into public.notifications (company_id, user_id, type, title, body, entity_type, entity_id, action_url)
  select p_company_id, h.user_id, 'programmazione',
         'Cambio di programma: ' || lower(v_quando) || ' non sei più in programma',
         'Chiedi all''ufficio dove andare.', 'programmazione', v_g.id, '/campo?programma=' || p_giorno
    from public.programmazione_avvisi a
    join public.hr_profili h on h.id = a.hr_profilo_id and h.user_id is not null
   where a.giornata_id = v_g.id and not exists (select 1 from jsonb_to_recordset(v_programma) as x(hr_profilo_id uuid, user_id uuid, firma text, titolo text, righe text, n integer) where x.hr_profilo_id = a.hr_profilo_id);
  get diagnostics v_tolti = row_count;

  delete from public.programmazione_avvisi a
   where a.giornata_id = v_g.id and not exists (select 1 from jsonb_to_recordset(v_programma) as x(hr_profilo_id uuid, user_id uuid, firma text, titolo text, righe text, n integer) where x.hr_profilo_id = a.hr_profilo_id);
  insert into public.programmazione_avvisi (giornata_id, hr_profilo_id, company_id, firma)
  select v_g.id, x.hr_profilo_id, p_company_id, x.firma from jsonb_to_recordset(v_programma) as x(hr_profilo_id uuid, user_id uuid, firma text, titolo text, righe text, n integer)
  on conflict (giornata_id, hr_profilo_id) do update set firma = excluded.firma, avvisato_at = now(), visto_at = null
   where programmazione_avvisi.firma is distinct from excluded.firma;

  update public.programmazione_giornate g
     set stato = 'pubblicata', pubblicata_at = now(), pubblicata_da = auth.uid(), modificata_dopo = false
   where g.id = v_g.id;

  return jsonb_build_object('accessi', v_accessi, 'avvisati', v_avvisati, 'tolti', v_tolti, 'senza_app', v_senza_app,
                            'persone', jsonb_array_length(v_programma));
end;
$$;
revoke all on function public.programmazione_pubblica(uuid, date, integer) from public, anon;
grant execute on function public.programmazione_pubblica(uuid, date, integer) to authenticated;

-- ── L'operaio vede il suo giorno ────────────────────────────────────────────
-- Solo giornate pubblicate, solo i suoi interventi, con i compagni e i mezzi.
create or replace function public.campo_mio_programma(p_giorno date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id, 'giorno', g.giorno, 'tipo', i.tipo, 'orderId', i.order_id, 'titolo', i.titolo, 'codice', i.codice,
           'indirizzo', i.indirizzo, 'inizio', to_char(i.inizio, 'HH24:MI'), 'fine', to_char(i.fine, 'HH24:MI'), 'momento', i.momento,
           'capo', i.capo_hr_profilo_id = h.id, 'note', i.note,
           'visto', exists (select 1 from public.programmazione_avvisi a
                             where a.giornata_id = g.id and a.hr_profilo_id = h.id and a.visto_at is not null),
           'fase', (select f.name from public.order_work_phases f where f.id = i.fase_id),
           'faseId', i.fase_id,
           'compagni', coalesce((select jsonb_agg(concat_ws(' ', h2.nome, h2.cognome) order by p2.posizione)
                                   from public.programmazione_persone p2
                                   join public.hr_profili h2 on h2.id = p2.hr_profilo_id
                                  where p2.intervento_id = i.id and p2.hr_profilo_id <> h.id), '[]'::jsonb),
           'mezzi', coalesce((select jsonb_agg(concat_ws(' ', m.nome, m.targa) order by m.nome)
                                from public.programmazione_mezzi pm
                                join public.mezzi m on m.id = pm.mezzo_id
                               where pm.intervento_id = i.id), '[]'::jsonb)
         ) order by case i.momento when 'prima' then 0 when 'dopo' then 3 else case when i.inizio is null then 2 else 1 end end, i.inizio, i.posizione), '[]'::jsonb)
    from public.hr_profili h
    join public.programmazione_persone p on p.hr_profilo_id = h.id
    join public.programmazione_interventi i on i.id = p.intervento_id
    join public.programmazione_giornate g on g.id = i.giornata_id and g.stato = 'pubblicata'
   where h.user_id = auth.uid() and g.giorno = p_giorno and g.company_id = h.company_id
$$;
revoke all on function public.campo_mio_programma(date) from public, anon;
grant execute on function public.campo_mio_programma(date) to authenticated;

-- ── «Ok, visto» dall'app ────────────────────────────────────────────────────
create or replace function public.campo_programma_visto(p_giorno date)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  update public.programmazione_avvisi a
     set visto_at = now()
    from public.hr_profili h, public.programmazione_giornate g
   where h.user_id = auth.uid() and a.hr_profilo_id = h.id
     and g.id = a.giornata_id and g.giorno = p_giorno and g.stato = 'pubblicata' and g.company_id = h.company_id
     and a.visto_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.campo_programma_visto(date) from public, anon;
grant execute on function public.campo_programma_visto(date) to authenticated;

-- ── Abilitazioni, app e costo orario delle persone ──────────────────────────
-- I titoli dei corsi di sicurezza validi (l'app ne ricava gru, PLE, ponteggi…),
-- se ha l'app, il telefono. Il costo orario solo a chi ha il permesso «Costi».
-- Niente altro del Personale.
create or replace function public.programmazione_persone_extra(p_company_id uuid)
returns table (hr_profilo_id uuid, titoli text[], ha_app boolean, telefono text, costo_orario numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_costi boolean := public.has_permission_for_company(auth.uid(), 'can_view_costs', p_company_id);
  v_oggi date := (now() at time zone 'Europe/Rome')::date;
begin
  if not public.has_permission_for_company(auth.uid(), 'can_view_orders', p_company_id) then
    raise exception using errcode = '42501', message = 'Non hai il permesso di vedere la programmazione.';
  end if;
  return query
  select h.id,
         coalesce((select array_agg(distinct d.titolo)
                     from public.hr_documenti d
                    where d.hr_profilo_id = h.id and d.categoria = 'corso_sicurezza'
                      and (d.data_scadenza is null or d.data_scadenza >= v_oggi)), '{}'),
         h.user_id is not null,
         nullif(btrim(h.telefono), ''),
         case when v_costi and h.employee_id is not null then public.costo_orario_dipendente(h.employee_id) end
    from public.hr_profili h
   where h.company_id = p_company_id and coalesce(h.attivo, true);
end;
$$;
revoke all on function public.programmazione_persone_extra(uuid) from public, anon;
grant execute on function public.programmazione_persone_extra(uuid) to authenticated;
