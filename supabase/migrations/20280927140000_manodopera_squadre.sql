-- Manodopera e Mezzi: le squadre degli operai (26/09/2026, richiesta di Florin).
--
-- «Posso creare delle squadre, dargli un nome e assegnare dei responsabili;
-- il responsabile può essere uno della squadra oppure un'altra persona», e la
-- squadra «poi la trovo nelle commesse».
--
-- La squadra resta UNA cosa in tutto il programma: una riga di external_teams
-- con kind = 'interna' (la stessa del calendario lavori). Si aggiungono:
--   · external_teams.responsabile_hr_profilo_id — il responsabile, una persona
--     qualsiasi del Personale (della squadra o no); leader_user_id, che nessuno
--     leggeva, segue il suo account;
--   · squadre_componenti — chi è nella squadra: un operaio sta in UNA squadra
--     per volta (spostarlo lo toglie dalla precedente);
--   · squadre_commesse — la squadra messa su una commessa, dal–al, e se il
--     responsabile fa da capocantiere;
--   · order_campo_assignments.da_squadra_id — l'accesso al cantiere dato dalla
--     squadra. squadra_allinea_accessi() lo tiene in pari: chi entra nella
--     squadra si trova il cantiere nell'app, chi esce lo perde; gli accessi dati
--     a mano non si toccano mai.
-- Le tabelle nuove si leggono con il permesso Operai o Commesse e si scrivono
-- solo dalle funzioni manodopera_* (che controllano i permessi).
--
-- La Giornata ora dice anche la squadra, il cantiere previsto per la squadra e
-- il giorno di riposo (fuori dai giorni lavorativi della persona o festivo):
-- il sabato non sono più tutti «Non ha timbrato».
--
-- Chi fa lavoro d'ufficio non è un operaio: il riempimento della fase 0 aveva
-- messo fra gli operai due «Francesco Barbieri» delle demo (Amministratore
-- Delegato, Amministrativo), perché nella scheda del costo risultavano da
-- cantiere. La regola ora guarda anche la mansione.
--
-- Idempotente. Scrive al più qualche riga di hr_profili: lock e tempi stretti.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ── 0. Chi fa lavoro d'ufficio non è operaio ────────────────────────────────
create or replace function public.mansione_da_ufficio(p_testo text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(lower(p_testo), '') ~ '(amministrat|delegat|titolare|direttor|impiegat|segreter|ufficio|commercial|contabil|venditor|marketing)'
$$;
revoke all on function public.mansione_da_ufficio(text) from public, anon;
grant execute on function public.mansione_da_ufficio(text) to authenticated, service_role;

create or replace function public.dipendente_da_cantiere(p_role_type text, p_qualifica text, p_area text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(p_area, 'cantiere') = 'cantiere'
     and coalesce(lower(p_role_type), '') not in ('staff_interno', 'subappaltatore', 'impiegato', 'venditore', 'commerciale', 'amministrazione', 'amministrativo')
     and not public.mansione_da_ufficio(p_role_type)
     and not public.mansione_da_ufficio(p_qualifica)
     and (public.mansione_da_cantiere(p_role_type) or public.mansione_da_cantiere(p_qualifica))
$$;

update public.hr_profili
   set lavora_in_cantiere = false, updated_at = now()
 where lavora_in_cantiere and public.mansione_da_ufficio(mansione);

-- ── 1. Responsabile della squadra ───────────────────────────────────────────
alter table public.external_teams
  add column if not exists responsabile_hr_profilo_id uuid references public.hr_profili(id) on delete set null;
comment on column public.external_teams.responsabile_hr_profilo_id is
  'Responsabile della squadra: una persona del Personale, della squadra o no. leader_user_id segue il suo account.';

-- ── 2. Chi è nella squadra ──────────────────────────────────────────────────
create table if not exists public.squadre_componenti (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  squadra_id uuid not null references public.external_teams(id) on delete cascade,
  hr_profilo_id uuid not null references public.hr_profili(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  constraint squadre_componenti_una_per_operaio unique (hr_profilo_id)
);
comment on table public.squadre_componenti is
  'Operai nelle squadre interne (external_teams kind interna): uno per squadra. Si scrive solo da manodopera_salva_squadra.';
create index if not exists idx_squadre_componenti_squadra on public.squadre_componenti (squadra_id);
create index if not exists idx_squadre_componenti_company on public.squadre_componenti (company_id);

alter table public.squadre_componenti enable row level security;
drop policy if exists squadre_componenti_lettura on public.squadre_componenti;
create policy squadre_componenti_lettura on public.squadre_componenti for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_operai', company_id)
         or public.has_permission_for_company((select auth.uid()), 'can_view_orders', company_id));
drop policy if exists blocco_utente_bloccato on public.squadre_componenti;
create policy blocco_utente_bloccato on public.squadre_componenti as restrictive for all to authenticated
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));

-- ── 3. La squadra sulle commesse ────────────────────────────────────────────
create table if not exists public.squadre_commesse (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  squadra_id uuid not null references public.external_teams(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  dal date,
  al date,
  capocantiere boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  constraint squadre_commesse_una_volta unique (squadra_id, order_id),
  constraint squadre_commesse_date check (al is null or dal is null or al >= dal)
);
comment on table public.squadre_commesse is
  'Squadra interna messa su una commessa, dal–al. capocantiere: il responsabile della squadra fa da capocantiere. Si scrive solo dalle funzioni manodopera_*.';
create index if not exists idx_squadre_commesse_order on public.squadre_commesse (order_id);
create index if not exists idx_squadre_commesse_squadra on public.squadre_commesse (squadra_id);

alter table public.squadre_commesse enable row level security;
drop policy if exists squadre_commesse_lettura on public.squadre_commesse;
create policy squadre_commesse_lettura on public.squadre_commesse for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_orders', company_id)
         or public.has_permission_for_company((select auth.uid()), 'can_view_operai', company_id));
drop policy if exists blocco_utente_bloccato on public.squadre_commesse;
create policy blocco_utente_bloccato on public.squadre_commesse as restrictive for all to authenticated
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));

-- ── 4. L'accesso al cantiere dato dalla squadra ─────────────────────────────
alter table public.order_campo_assignments
  add column if not exists da_squadra_id uuid references public.external_teams(id) on delete set null;
comment on column public.order_campo_assignments.da_squadra_id is
  'Accesso dato dalla squadra (squadre_commesse): lo aggiunge e lo toglie squadra_allinea_accessi. Null = dato a mano, non si tocca.';
create index if not exists idx_oca_da_squadra on public.order_campo_assignments (da_squadra_id) where da_squadra_id is not null;

-- Chi dovrebbe avere l'accesso per la squadra: ogni persona (componente o
-- responsabile) con l'app, su ogni commessa della squadra.
create or replace function public.squadra_accessi_voluti(p_squadra_id uuid)
returns table (order_id uuid, user_id uuid, company_id uuid, dal date, al date, responsabile boolean, capocantiere boolean)
language sql
stable
security definer
set search_path = public
as $$
  select sc.order_id, h.user_id, sc.company_id, sc.dal, sc.al,
         (h.id = t.responsabile_hr_profilo_id), sc.capocantiere
    from public.squadre_commesse sc
    join public.external_teams t on t.id = sc.squadra_id and t.is_active
    join public.hr_profili h
      on h.company_id = sc.company_id
     and h.user_id is not null
     and coalesce(h.attivo, true)
     and (h.id = t.responsabile_hr_profilo_id
          or exists (select 1 from public.squadre_componenti c where c.squadra_id = t.id and c.hr_profilo_id = h.id))
   where sc.squadra_id = p_squadra_id
$$;
revoke all on function public.squadra_accessi_voluti(uuid) from public, anon, authenticated;

create or replace function public.squadra_allinea_accessi(p_squadra_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_oggi date := (now() at time zone 'Europe/Rome')::date;
begin
  if p_squadra_id is null then
    return;
  end if;

  -- Via gli accessi della squadra che non servono più.
  delete from public.order_campo_assignments a
   where a.da_squadra_id = p_squadra_id
     and not exists (select 1 from public.squadra_accessi_voluti(p_squadra_id) v
                      where v.order_id = a.order_id and v.user_id = a.user_id);

  -- Le date seguono quelle della squadra sulla commessa.
  update public.order_campo_assignments a
     set data_inizio = v.dal, data_fine_prevista = v.al
    from public.squadra_accessi_voluti(p_squadra_id) v
   where a.da_squadra_id = p_squadra_id
     and a.order_id = v.order_id and a.user_id = v.user_id
     and (a.data_inizio is distinct from v.dal or a.data_fine_prevista is distinct from v.al);

  -- Dentro chi manca, solo sulle commesse non ancora finite. Un accesso già
  -- dato a mano alla stessa persona resta com'è.
  insert into public.order_campo_assignments
    (company_id, order_id, user_id, role_type, assigned_by, data_inizio, data_fine_prevista,
     is_capocantiere, note, da_squadra_id)
  select v.company_id, v.order_id, v.user_id, 'employee', auth.uid(), v.dal, v.al,
         (v.responsabile and v.capocantiere
          and not exists (select 1 from public.order_campo_assignments x
                           where x.order_id = v.order_id and x.is_capocantiere)),
         'Con la squadra', p_squadra_id
    from public.squadra_accessi_voluti(p_squadra_id) v
   where v.al is null or v.al >= v_oggi
  on conflict (order_id, user_id) do nothing;
end;
$$;
revoke all on function public.squadra_allinea_accessi(uuid) from public, anon, authenticated;

-- ── 5. Le squadre dell'azienda ──────────────────────────────────────────────
create or replace function public.manodopera_squadre(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_oggi date := (now() at time zone 'Europe/Rome')::date;
begin
  if not (public.has_permission_for_company(v_uid, 'can_view_operai', p_company_id)
          or public.has_permission_for_company(v_uid, 'can_view_orders', p_company_id)) then
    raise exception using errcode = '42501', message = 'Non hai il permesso di vedere le squadre di questa azienda.';
  end if;

  return coalesce((
    select jsonb_agg(s.riga order by lower(s.nome))
      from (
        select t.name as nome,
               jsonb_build_object(
                 'id', t.id,
                 'nome', t.name,
                 'colore', t.color,
                 'responsabile', (
                   select jsonb_build_object(
                            'id', r.id, 'nome', r.nome, 'cognome', r.cognome,
                            'mansione', r.mansione, 'colore_avatar', r.colore_avatar,
                            'e_componente', exists (select 1 from public.squadre_componenti c2
                                                     where c2.squadra_id = t.id and c2.hr_profilo_id = r.id))
                     from public.hr_profili r where r.id = t.responsabile_hr_profilo_id),
                 'componenti', coalesce((
                   select jsonb_agg(jsonb_build_object(
                            'id', h.id, 'nome', h.nome, 'cognome', h.cognome,
                            'mansione', coalesce(nullif(h.mansione, ''), nullif(e.qualifica, '')),
                            'colore_avatar', h.colore_avatar,
                            'ha_accesso_app', h.user_id is not null)
                          order by h.cognome, h.nome)
                     from public.squadre_componenti c
                     join public.hr_profili h on h.id = c.hr_profilo_id
                     left join public.employees e on e.id = h.employee_id
                    where c.squadra_id = t.id and coalesce(h.attivo, true)), '[]'::jsonb),
                 'commesse', coalesce((
                   select jsonb_agg(jsonb_build_object(
                            'order_id', sc.order_id, 'codice', o.order_code, 'cliente', o.client_name,
                            'dal', sc.dal, 'al', sc.al,
                            'oggi', (sc.dal is null or sc.dal <= v_oggi) and (sc.al is null or sc.al >= v_oggi))
                          order by sc.dal nulls first, o.order_code)
                     from public.squadre_commesse sc
                     join public.orders o on o.id = sc.order_id and o.deleted_at is null
                    where sc.squadra_id = t.id and (sc.al is null or sc.al >= v_oggi)), '[]'::jsonb)
               ) as riga
          from public.external_teams t
         where t.company_id = p_company_id and t.kind = 'interna' and t.is_active
      ) s), '[]'::jsonb);
end;
$$;
revoke all on function public.manodopera_squadre(uuid) from public, anon;
grant execute on function public.manodopera_squadre(uuid) to authenticated;

-- ── 6. Crea o modifica una squadra ──────────────────────────────────────────
-- p_dati: nome, colore, responsabile_id (una persona del Personale, anche non
-- operaio), componenti (elenco di schede operaio). Si cambiano solo le chiavi
-- presenti. Un operaio messo qui esce dalla sua squadra di prima.
create or replace function public.manodopera_salva_squadra(
  p_company_id uuid,
  p_squadra_id uuid,
  p_dati jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid := p_squadra_id;
  v_nome text := nullif(trim(coalesce(p_dati->>'nome', '')), '');
  v_colore text := nullif(trim(coalesce(p_dati->>'colore', '')), '');
  v_resp uuid;
  v_resp_user uuid;
  v_comp uuid[];
  v_altre uuid[];
  v_s uuid;
begin
  if not public.has_permission_for_company(v_uid, 'can_edit_operai', p_company_id) then
    raise exception using errcode = '42501', message = 'Non hai il permesso di modificare le squadre.';
  end if;

  if (v_id is null or p_dati ? 'nome') and v_nome is null then
    raise exception using errcode = '22023', message = 'Dai un nome alla squadra.';
  end if;
  if v_nome is not null and exists (
       select 1 from public.external_teams t
        where t.company_id = p_company_id and t.kind = 'interna' and t.is_active
          and lower(t.name) = lower(v_nome) and t.id is distinct from v_id) then
    raise exception using errcode = '22023', message = 'C''è già una squadra con questo nome: scegline un altro.';
  end if;

  if p_dati ? 'responsabile_id' then
    v_resp := nullif(p_dati->>'responsabile_id', '')::uuid;
    if v_resp is not null then
      select h.user_id into v_resp_user
        from public.hr_profili h
       where h.id = v_resp and h.company_id = p_company_id and coalesce(h.attivo, true);
      if not found then
        raise exception using errcode = '22023', message = 'Il responsabile scelto non è fra le persone di questa azienda.';
      end if;
    end if;
  end if;

  if p_dati ? 'componenti' then
    select coalesce(array_agg(distinct x::uuid), '{}') into v_comp
      from jsonb_array_elements_text(coalesce(p_dati->'componenti', '[]'::jsonb)) x;
    if exists (select 1 from unnest(v_comp) c
                where not exists (select 1 from public.hr_profili h
                                   where h.id = c and h.company_id = p_company_id and h.lavora_in_cantiere)) then
      raise exception using errcode = '22023', message = 'Uno degli operai scelti non è fra gli operai di questa azienda.';
    end if;
  end if;

  if v_id is null then
    insert into public.external_teams (company_id, name, color, kind, is_active, responsabile_hr_profilo_id, leader_user_id)
    values (p_company_id, v_nome, v_colore, 'interna', true, v_resp, v_resp_user)
    returning id into v_id;
  else
    perform 1 from public.external_teams t
     where t.id = v_id and t.company_id = p_company_id and t.kind = 'interna';
    if not found then
      raise exception using errcode = '42501', message = 'Questa squadra non c''è o non puoi modificarla.';
    end if;
    update public.external_teams
       set name = coalesce(v_nome, name),
           color = case when p_dati ? 'colore' then v_colore else color end,
           responsabile_hr_profilo_id = case when p_dati ? 'responsabile_id' then v_resp else responsabile_hr_profilo_id end,
           leader_user_id = case when p_dati ? 'responsabile_id' then v_resp_user else leader_user_id end,
           is_active = true
     where id = v_id;
  end if;

  if v_comp is not null then
    select coalesce(array_agg(distinct c.squadra_id), '{}') into v_altre
      from public.squadre_componenti c
     where c.hr_profilo_id = any (v_comp) and c.squadra_id <> v_id;

    delete from public.squadre_componenti where squadra_id = v_id and hr_profilo_id <> all (v_comp);
    delete from public.squadre_componenti where hr_profilo_id = any (v_comp) and squadra_id <> v_id;
    insert into public.squadre_componenti (company_id, squadra_id, hr_profilo_id, created_by)
    select p_company_id, v_id, c, v_uid from unnest(v_comp) c
    on conflict (hr_profilo_id) do nothing;

    foreach v_s in array v_altre loop
      perform public.squadra_allinea_accessi(v_s);
    end loop;
  end if;

  perform public.squadra_allinea_accessi(v_id);
  return v_id;
end;
$$;
revoke all on function public.manodopera_salva_squadra(uuid, uuid, jsonb) from public, anon;
grant execute on function public.manodopera_salva_squadra(uuid, uuid, jsonb) to authenticated;

-- ── 7. Sciogli una squadra ──────────────────────────────────────────────────
-- La squadra si spegne (resta nello storico delle commesse), gli operai sono
-- liberi e gli accessi ai cantieri dati dalla squadra se ne vanno.
create or replace function public.manodopera_sciogli_squadra(p_squadra_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_company uuid;
begin
  select company_id into v_company from public.external_teams where id = p_squadra_id and kind = 'interna';
  if v_company is null or not public.has_permission_for_company(auth.uid(), 'can_edit_operai', v_company) then
    raise exception using errcode = '42501', message = 'Questa squadra non c''è o non puoi modificarla.';
  end if;
  update public.external_teams set is_active = false where id = p_squadra_id;
  delete from public.squadre_componenti where squadra_id = p_squadra_id;
  perform public.squadra_allinea_accessi(p_squadra_id);
end;
$$;
revoke all on function public.manodopera_sciogli_squadra(uuid) from public, anon;
grant execute on function public.manodopera_sciogli_squadra(uuid) to authenticated;

-- ── 8. La squadra sulla commessa ────────────────────────────────────────────
create or replace function public.manodopera_squadra_su_commessa(
  p_order_id uuid,
  p_squadra_id uuid,
  p_dal date default null,
  p_al date default null,
  p_capocantiere boolean default false
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
begin
  select company_id into v_company from public.orders where id = p_order_id and deleted_at is null;
  if v_company is null
     or not (public.has_permission_for_company(v_uid, 'can_edit_orders', v_company)
             or public.has_permission_for_company(v_uid, 'can_edit_operai', v_company)) then
    raise exception using errcode = '42501', message = 'Non puoi modificare chi lavora su questa commessa.';
  end if;
  perform 1 from public.external_teams t
   where t.id = p_squadra_id and t.company_id = v_company and t.kind = 'interna' and t.is_active;
  if not found then
    raise exception using errcode = '22023', message = 'Questa squadra non c''è più: scegline un''altra.';
  end if;
  if p_dal is not null and p_al is not null and p_al < p_dal then
    raise exception using errcode = '22023', message = 'La fine viene prima dell''inizio: controlla le date.';
  end if;

  insert into public.squadre_commesse (company_id, squadra_id, order_id, dal, al, capocantiere, created_by)
  values (v_company, p_squadra_id, p_order_id, p_dal, p_al, coalesce(p_capocantiere, false), v_uid)
  on conflict (squadra_id, order_id) do update
    set dal = excluded.dal, al = excluded.al, capocantiere = excluded.capocantiere;

  perform public.squadra_allinea_accessi(p_squadra_id);
end;
$$;
revoke all on function public.manodopera_squadra_su_commessa(uuid, uuid, date, date, boolean) from public, anon;
grant execute on function public.manodopera_squadra_su_commessa(uuid, uuid, date, date, boolean) to authenticated;

create or replace function public.manodopera_togli_squadra_da_commessa(p_order_id uuid, p_squadra_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
begin
  select company_id into v_company from public.orders where id = p_order_id;
  if v_company is null
     or not (public.has_permission_for_company(v_uid, 'can_edit_orders', v_company)
             or public.has_permission_for_company(v_uid, 'can_edit_operai', v_company)) then
    raise exception using errcode = '42501', message = 'Non puoi modificare chi lavora su questa commessa.';
  end if;
  delete from public.squadre_commesse where order_id = p_order_id and squadra_id = p_squadra_id;
  perform public.squadra_allinea_accessi(p_squadra_id);
end;
$$;
revoke all on function public.manodopera_togli_squadra_da_commessa(uuid, uuid) from public, anon;
grant execute on function public.manodopera_togli_squadra_da_commessa(uuid, uuid) to authenticated;

-- Le squadre di una commessa, con chi c'è dentro.
create or replace function public.manodopera_squadre_commessa(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
  v_oggi date := (now() at time zone 'Europe/Rome')::date;
begin
  select company_id into v_company from public.orders where id = p_order_id;
  if v_company is null
     or not (public.has_permission_for_company(v_uid, 'can_view_orders', v_company)
             or public.has_permission_for_company(v_uid, 'can_view_operai', v_company)) then
    raise exception using errcode = '42501', message = 'Non puoi vedere questa commessa.';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'squadra_id', t.id,
             'nome', t.name,
             'colore', t.color,
             'attiva', t.is_active,
             'dal', sc.dal,
             'al', sc.al,
             'capocantiere', sc.capocantiere,
             'finita', sc.al is not null and sc.al < v_oggi,
             'responsabile', (select jsonb_build_object('id', r.id, 'nome', r.nome, 'cognome', r.cognome,
                                                       'colore_avatar', r.colore_avatar)
                                from public.hr_profili r where r.id = t.responsabile_hr_profilo_id),
             'componenti', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'id', h.id, 'nome', h.nome, 'cognome', h.cognome,
                        'mansione', coalesce(nullif(h.mansione, ''), nullif(e.qualifica, '')),
                        'colore_avatar', h.colore_avatar, 'ha_accesso_app', h.user_id is not null)
                      order by h.cognome, h.nome)
                 from public.squadre_componenti c
                 join public.hr_profili h on h.id = c.hr_profilo_id
                 left join public.employees e on e.id = h.employee_id
                where c.squadra_id = t.id and coalesce(h.attivo, true)), '[]'::jsonb))
           order by (sc.al is not null and sc.al < v_oggi), sc.dal nulls first, t.name)
      from public.squadre_commesse sc
      join public.external_teams t on t.id = sc.squadra_id
     where sc.order_id = p_order_id), '[]'::jsonb);
end;
$$;
revoke all on function public.manodopera_squadre_commessa(uuid) from public, anon;
grant execute on function public.manodopera_squadre_commessa(uuid) to authenticated;

-- ── 9. Il giorno di riposo ──────────────────────────────────────────────────
-- Fuori dai giorni lavorativi della persona (di serie Lun–Ven) o festivo per
-- l'azienda (anche le festività che si ripetono ogni anno).
create or replace function public.manodopera_giorno_di_riposo(p_profilo_id uuid, p_giorno date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    not ((array['Lun','Mar','Mer','Gio','Ven','Sab','Dom'])[extract(isodow from p_giorno)::int]
         = any (coalesce(h.giorni_lavorativi, array['Lun','Mar','Mer','Gio','Ven'])))
    or exists (select 1 from public.hr_festivita f
                where f.company_id = h.company_id
                  and (f.data = p_giorno
                       or (coalesce(f.ricorrente, false) and to_char(f.data, 'MM-DD') = to_char(p_giorno, 'MM-DD'))))
  from public.hr_profili h
  where h.id = p_profilo_id
$$;
revoke all on function public.manodopera_giorno_di_riposo(uuid, date) from public, anon, authenticated;

-- ── 10. Elenco operai, con la squadra ───────────────────────────────────────
drop function if exists public.manodopera_operai(uuid);
create function public.manodopera_operai(p_company_id uuid)
returns table (
  id uuid,
  nome text,
  cognome text,
  mansione text,
  telefono text,
  email text,
  colore_avatar text,
  foto_url text,
  attivo boolean,
  data_assunzione date,
  tipo_contratto text,
  employee_id uuid,
  ha_accesso_app boolean,
  costo_orario numeric,
  costo_orario_scritto boolean,
  documenti_scaduti integer,
  documenti_in_scadenza integer,
  prossima_scadenza date,
  mezzi text,
  cantieri_attivi integer,
  squadra_id uuid,
  squadra text,
  squadra_colore text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
#variable_conflict use_column
declare
  v_oggi date := (now() at time zone 'Europe/Rome')::date;
begin
  if not public.has_permission_for_company(auth.uid(), 'can_view_operai', p_company_id) then
    raise exception using errcode = '42501', message = 'Non hai il permesso di vedere gli operai di questa azienda.';
  end if;

  return query
  select h.id,
         h.nome,
         h.cognome,
         coalesce(nullif(h.mansione, ''), nullif(e.qualifica, '')),
         coalesce(nullif(h.telefono, ''), nullif(e.phone, '')),
         coalesce(nullif(h.email, ''), nullif(e.email, '')),
         h.colore_avatar,
         h.foto_url,
         coalesce(h.attivo, true),
         coalesce(h.data_assunzione, e.data_assunzione),
         h.tipo_contratto,
         h.employee_id,
         h.user_id is not null,
         public.manodopera_costo_orario(h.employee_id),
         coalesce(e.costo_orario, 0) > 0,
         (select count(*)::int from public.hr_documenti d
           where d.hr_profilo_id = h.id and d.data_scadenza < v_oggi),
         (select count(*)::int from public.hr_documenti d
           where d.hr_profilo_id = h.id and d.data_scadenza >= v_oggi
             and d.data_scadenza <= v_oggi + coalesce(d.alert_giorni_prima, 30)),
         (select min(d.data_scadenza) from public.hr_documenti d
           where d.hr_profilo_id = h.id and d.data_scadenza >= v_oggi),
         (select string_agg(m.nome, ', ' order by m.nome) from public.mezzi m
           where m.assegnato_hr_profilo_id = h.id and m.deleted_at is null),
         (select count(distinct x.order_id)::int from (
            select a.order_id from public.order_campo_assignments a
             where h.user_id is not null and a.user_id = h.user_id and a.company_id = h.company_id
               and (a.data_fine_prevista is null or a.data_fine_prevista >= v_oggi)
            union
            select sc.order_id from public.squadre_commesse sc
             where sc.squadra_id = t.id and (sc.al is null or sc.al >= v_oggi)
          ) x),
         t.id,
         t.name,
         t.color
    from public.hr_profili h
    left join public.employees e on e.id = h.employee_id
    left join public.squadre_componenti sq on sq.hr_profilo_id = h.id
    left join public.external_teams t on t.id = sq.squadra_id and t.is_active
   where h.company_id = p_company_id
     and h.lavora_in_cantiere
   order by coalesce(h.attivo, true) desc, h.cognome, h.nome;
end;
$$;
revoke all on function public.manodopera_operai(uuid) from public, anon;
grant execute on function public.manodopera_operai(uuid) to authenticated;

-- ── 11. La giornata, con squadra, cantiere della squadra e riposo ───────────
drop function if exists public.manodopera_oggi(uuid, date);
create function public.manodopera_oggi(p_company_id uuid, p_giorno date default null)
returns table (
  profilo_id uuid,
  nome text,
  cognome text,
  mansione text,
  colore_avatar text,
  stato text,
  assenza text,
  prima_entrata time,
  ultima_uscita time,
  ultimo_tipo text,
  ultima_ora time,
  ore_lavorate numeric,
  fuori_zona boolean,
  cantiere_id uuid,
  cantiere text,
  previsto_id uuid,
  previsto text,
  squadra_id uuid,
  squadra text,
  squadra_colore text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
#variable_conflict use_column
declare
  v_oggi date := (now() at time zone 'Europe/Rome')::date;
  v_giorno date := coalesce(p_giorno, (now() at time zone 'Europe/Rome')::date);
begin
  if not public.has_permission_for_company(auth.uid(), 'can_view_operai', p_company_id) then
    raise exception using errcode = '42501', message = 'Non hai il permesso di vedere gli operai di questa azienda.';
  end if;

  return query
  with operai as (
    select h.id, h.nome, h.cognome, h.user_id, h.colore_avatar,
           coalesce(nullif(h.mansione, ''), nullif(e.qualifica, '')) as mansione,
           t.id as squadra_id, t.name as squadra, t.color as squadra_colore
      from public.hr_profili h
      left join public.employees e on e.id = h.employee_id
      left join public.squadre_componenti sq on sq.hr_profilo_id = h.id
      left join public.external_teams t on t.id = sq.squadra_id and t.is_active
     where h.company_id = p_company_id and h.lavora_in_cantiere and coalesce(h.attivo, true)
  ),
  timbri as (
    select t.profilo_id, t.tipo, t.timestamp, t.ora_evento, t.posizione_esito, t.order_id
      from public.hr_timbrature t
     where t.company_id = p_company_id and t.data_evento = v_giorno
       and t.profilo_id in (select o.id from operai o)
  ),
  ultimo as (
    select distinct on (t.profilo_id) t.profilo_id, t.tipo, t.ora_evento
      from timbri t
     order by t.profilo_id, t.timestamp desc
  ),
  riepilogo as (
    select t.profilo_id,
           min(t.ora_evento) filter (where t.tipo = 'entrata') as prima_entrata,
           max(t.ora_evento) filter (where t.tipo = 'uscita') as ultima_uscita,
           bool_or(t.posizione_esito = 'fuori') as fuori_zona
      from timbri t
     group by t.profilo_id
  ),
  cantiere_timbrato as (
    select distinct on (x.profilo_id) x.profilo_id, x.order_id
      from (
        select t.profilo_id, t.order_id, t.timestamp as quando
          from timbri t where t.order_id is not null
        union all
        select o.id, c.order_id, c.timestamp_evento
          from public.campo_timbrature c
          join operai o on o.user_id = c.user_id
         where c.company_id = p_company_id and c.order_id is not null
           and (c.timestamp_evento at time zone 'Europe/Rome')::date = v_giorno
      ) x
     order by x.profilo_id, x.quando desc
  ),
  previsto as (
    select distinct on (x.profilo_id) x.profilo_id, x.order_id
      from (
        -- Assegnato alla persona (a mano o con la squadra)…
        select o.id as profilo_id, a.order_id, 1 as peso, a.is_capocantiere as capo, a.data_inizio as dal
          from operai o
          join public.order_campo_assignments a
            on a.user_id = o.user_id and a.company_id = p_company_id
         where (a.data_inizio is null or a.data_inizio <= v_giorno)
           and (a.data_fine_prevista is null or a.data_fine_prevista >= v_giorno)
        union all
        -- …o la sua squadra è su quella commessa (vale anche per chi non ha l'app).
        select o.id, sc.order_id, 2, false, sc.dal
          from operai o
          join public.squadre_commesse sc on sc.squadra_id = o.squadra_id
         where (sc.dal is null or sc.dal <= v_giorno)
           and (sc.al is null or sc.al >= v_giorno)
      ) x
      join public.orders ord on ord.id = x.order_id and ord.deleted_at is null
     order by x.profilo_id, x.capo desc, x.peso, x.dal desc nulls last
  ),
  assente as (
    select distinct on (x.profilo_id) x.profilo_id, x.motivo
      from (
        select r.profilo_id, r.tipo as motivo, 1 as peso
          from public.hr_richieste r
         where r.company_id = p_company_id and r.stato = 'approvata'
           and r.tipo not in ('straordinario', 'cambio_turno', 'rimborso')
           and r.data_inizio <= v_giorno and coalesce(r.data_fine, r.data_inizio) >= v_giorno
        union all
        select a.hr_profilo_id, a.tipo, 2
          from public.hr_assenze_eventi a
         where a.company_id = p_company_id
           and a.data_inizio <= v_giorno and coalesce(a.data_fine, a.data_inizio) >= v_giorno
        union all
        select g.profilo_id, g.stato, 3
          from public.hr_giornate g
         where g.company_id = p_company_id and g.data = v_giorno
           and g.stato is not null and g.stato not in ('presente', 'smart_working', 'trasferta')
      ) x
     order by x.profilo_id, x.peso
  ),
  commesse as (
    select ord.id,
           concat_ws(' · ', nullif(ord.order_code, ''), nullif(ord.client_name, ''),
                     nullif(coalesce(nullif(ord.indirizzo_lavori, ''), ord.work_address), '')) as etichetta
      from public.orders ord
     where ord.id in (select ct.order_id from cantiere_timbrato ct union select pv.order_id from previsto pv)
  )
  select o.id,
         o.nome,
         o.cognome,
         o.mansione,
         o.colore_avatar,
         case
           when u.tipo in ('entrata', 'pausa_fine') and v_giorno < v_oggi then 'uscita_mancante'
           when u.tipo in ('entrata', 'pausa_fine') then 'al_lavoro'
           when u.tipo = 'pausa_inizio' then 'in_pausa'
           when u.tipo = 'uscita' then 'uscito'
           when ass.motivo is not null then 'assente'
           when public.manodopera_giorno_di_riposo(o.id, v_giorno) then 'riposo'
           else 'non_timbrato'
         end,
         ass.motivo,
         r.prima_entrata,
         r.ultima_uscita,
         u.tipo,
         u.ora_evento,
         case when v_giorno = v_oggi or g.ore_lavorate is null
              then coalesce(public.manodopera_ore_timbrate(o.id, v_giorno), g.ore_lavorate)
              else g.ore_lavorate end,
         coalesce(r.fuori_zona, false),
         ct.order_id,
         cc.etichetta,
         pv.order_id,
         cp.etichetta,
         o.squadra_id,
         o.squadra,
         o.squadra_colore
    from operai o
    left join ultimo u on u.profilo_id = o.id
    left join riepilogo r on r.profilo_id = o.id
    left join assente ass on ass.profilo_id = o.id
    left join public.hr_giornate g on g.profilo_id = o.id and g.data = v_giorno
    left join cantiere_timbrato ct on ct.profilo_id = o.id
    left join commesse cc on cc.id = ct.order_id
    left join previsto pv on pv.profilo_id = o.id
    left join commesse cp on cp.id = pv.order_id
   order by o.squadra nulls last, o.cognome, o.nome;
end;
$$;
revoke all on function public.manodopera_oggi(uuid, date) from public, anon;
grant execute on function public.manodopera_oggi(uuid, date) to authenticated;

-- ── 12. Scheda operaio, con la squadra e i cantieri della squadra ──────────
create or replace function public.manodopera_operaio(p_profilo_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_h public.hr_profili;
  v_e public.employees;
  v_oggi date := (now() at time zone 'Europe/Rome')::date;
  v_modifica boolean;
begin
  select * into v_h from public.hr_profili where id = p_profilo_id;
  if not found
     or not public.has_permission_for_company(v_uid, 'can_view_operai', v_h.company_id)
     or (not v_h.lavora_in_cantiere
         and not public.has_permission_for_company(v_uid, 'can_view_persone', v_h.company_id)) then
    raise exception using errcode = '42501', message = 'Questo operaio non c''è o non puoi vederlo.';
  end if;

  v_modifica := public.has_permission_for_company(v_uid, 'can_edit_operai', v_h.company_id);
  select * into v_e from public.employees where id = v_h.employee_id;

  return jsonb_build_object(
    'scheda', jsonb_build_object(
      'id', v_h.id,
      'company_id', v_h.company_id,
      'employee_id', v_h.employee_id,
      'nome', v_h.nome,
      'cognome', v_h.cognome,
      'mansione', coalesce(nullif(v_h.mansione, ''), nullif(v_e.qualifica, '')),
      'telefono', coalesce(nullif(v_h.telefono, ''), nullif(v_e.phone, '')),
      'email', coalesce(nullif(v_h.email, ''), nullif(v_e.email, '')),
      'colore_avatar', v_h.colore_avatar,
      'foto_url', v_h.foto_url,
      'attivo', coalesce(v_h.attivo, true),
      'lavora_in_cantiere', v_h.lavora_in_cantiere,
      'data_assunzione', coalesce(v_h.data_assunzione, v_e.data_assunzione),
      'data_cessazione', v_h.data_cessazione,
      'tipo_contratto', v_h.tipo_contratto,
      'matricola', v_h.matricola,
      'ha_accesso_app', v_h.user_id is not null
    ),
    'puo_modificare', v_modifica,
    'squadra', (
      select jsonb_build_object(
               'id', t.id, 'nome', t.name, 'colore', t.color,
               'responsabile', (select jsonb_build_object('id', r.id, 'nome', r.nome, 'cognome', r.cognome)
                                  from public.hr_profili r where r.id = t.responsabile_hr_profilo_id),
               'compagni', coalesce((
                 select jsonb_agg(jsonb_build_object('id', h2.id, 'nome', h2.nome, 'cognome', h2.cognome,
                                                     'colore_avatar', h2.colore_avatar)
                        order by h2.cognome, h2.nome)
                   from public.squadre_componenti c2
                   join public.hr_profili h2 on h2.id = c2.hr_profilo_id
                  where c2.squadra_id = t.id and h2.id <> v_h.id and coalesce(h2.attivo, true)), '[]'::jsonb))
        from public.squadre_componenti c
        join public.external_teams t on t.id = c.squadra_id and t.is_active
       where c.hr_profilo_id = v_h.id),
    'costo', jsonb_build_object(
      'costo_orario', public.manodopera_costo_orario(v_h.employee_id),
      'costo_orario_scritto', case when coalesce(v_e.costo_orario, 0) > 0 then v_e.costo_orario end,
      'stipendio_lordo', case when v_modifica then v_e.gross_salary end,
      'ore_mese', case when v_modifica then v_e.monthly_hours end,
      'contributi_percento', case when v_modifica then coalesce(v_e.inps_rate, 28) end
    ),
    'documenti', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', d.id, 'categoria', d.categoria, 'titolo', d.titolo, 'ente', d.ente,
               'data_rilascio', d.data_rilascio, 'data_scadenza', d.data_scadenza,
               'stato', case
                          when d.data_scadenza is null then 'senza_scadenza'
                          when d.data_scadenza < v_oggi then 'scaduto'
                          when d.data_scadenza <= v_oggi + coalesce(d.alert_giorni_prima, 30) then 'in_scadenza'
                          else 'valido'
                        end)
             order by d.data_scadenza nulls last, d.titolo)
        from public.hr_documenti d where d.hr_profilo_id = v_h.id), '[]'::jsonb),
    -- Gli ultimi 31 giorni: la giornata calcolata se c'è, altrimenti le
    -- timbrature di quel giorno (la giornata può mancare o essere indietro).
    'giornate', coalesce((
      select jsonb_agg(jsonb_build_object(
               'data', x.data,
               'stato', coalesce(g.stato, 'presente'),
               'ore_lavorate', case when x.data = v_oggi or g.ore_lavorate is null
                                    then coalesce(public.manodopera_ore_timbrate(v_h.id, x.data), g.ore_lavorate)
                                    else g.ore_lavorate end,
               'ore_straordinario', g.ore_straordinario,
               'prima_entrata', coalesce(g.prima_entrata, tt.prima),
               'ultima_uscita', coalesce(g.ultima_uscita, tt.ultima),
               'anomalia', coalesce(g.anomalia, false),
               'anomalia_motivo', g.anomalia_motivo)
             order by x.data desc)
        from (
          select g0.data from public.hr_giornate g0
           where g0.profilo_id = v_h.id and g0.data > v_oggi - 31 and g0.data <= v_oggi
          union
          select t0.data_evento from public.hr_timbrature t0
           where t0.profilo_id = v_h.id and t0.data_evento > v_oggi - 31 and t0.data_evento <= v_oggi
        ) x
        left join public.hr_giornate g on g.profilo_id = v_h.id and g.data = x.data
        left join lateral (
          select min(t1.ora_evento) filter (where t1.tipo = 'entrata') as prima,
                 max(t1.ora_evento) filter (where t1.tipo = 'uscita') as ultima
            from public.hr_timbrature t1
           where t1.profilo_id = v_h.id and t1.data_evento = x.data
        ) tt on true), '[]'::jsonb),
    -- Le commesse della persona (con l'app) e quelle della sua squadra (vale
    -- anche per chi l'app non ce l'ha).
    'cantieri', coalesce((
      select jsonb_agg(jsonb_build_object(
               'order_id', x.order_id, 'codice', ord.order_code, 'cliente', ord.client_name,
               'indirizzo', coalesce(nullif(ord.indirizzo_lavori, ''), ord.work_address),
               'dal', x.dal, 'al', x.al,
               'capocantiere', x.capo,
               'con_la_squadra', x.con_squadra,
               'in_corso', (x.al is null or x.al >= v_oggi))
             order by (x.al is null or x.al >= v_oggi) desc, x.dal desc nulls last)
        from (
          select distinct on (y.order_id) y.*
            from (
              select a.order_id, a.data_inizio as dal, a.data_fine_prevista as al,
                     coalesce(a.is_capocantiere, false) as capo, a.da_squadra_id is not null as con_squadra, 1 as peso
                from public.order_campo_assignments a
               where v_h.user_id is not null and a.user_id = v_h.user_id and a.company_id = v_h.company_id
              union all
              select sc.order_id, sc.dal, sc.al, false, true, 2
                from public.squadre_componenti c
                join public.squadre_commesse sc on sc.squadra_id = c.squadra_id
               where c.hr_profilo_id = v_h.id
            ) y
           order by y.order_id, y.peso
        ) x
        join public.orders ord on ord.id = x.order_id and ord.deleted_at is null), '[]'::jsonb),
    'mezzi', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'nome', m.nome, 'tipo', m.tipo, 'targa', m.targa)
             order by m.nome)
        from public.mezzi m
       where m.assegnato_hr_profilo_id = v_h.id and m.deleted_at is null), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.manodopera_operaio(uuid) from public, anon;
grant execute on function public.manodopera_operaio(uuid) to authenticated;
