-- Commessa, «Lavori e squadre»: squadre sulle fasi e note per gli operai
-- (26/09/2026, richiesta di Florin: «crea delle fasi di lavoro e vedrai che il
-- flusso sia semplice; aggiungi le note in generale e nelle singole fasi, che
-- l'operaio vede nell'app: per il singolo operaio o per la squadra»).
--
-- 1. Una squadra può fare una FASE, non solo stare sulla commessa:
--    squadre_commesse.phase_id (null = tutta la commessa). Le date di una
--    squadra su una fase seguono quelle della fase (segue_fase) finché non se
--    ne scrivono di sue: cambiare le date della fase sposta la squadra e gli
--    accessi all'app. Una squadra su più fasi della stessa commessa dà UN
--    accesso per persona, dalla prima data all'ultima.
-- 2. note_cantiere: istruzioni dell'ufficio per chi lavora sulla commessa,
--    su tutta la commessa o su una fase, per tutti, per una squadra o per una
--    persona; «importante» le mette in cima. note_cantiere_letture: chi l'ha
--    vista nell'app e quando. Una nota nuova arriva come avviso nell'app.
-- 3. Ufficio: note_cantiere_elenco / note_cantiere_salva / note_cantiere_elimina
--    (permessi Commesse o Operai). App: campo_note_cantiere (solo le note per
--    me, la mia squadra o tutti, sui cantieri che vedo) e campo_nota_letta.
--
-- Idempotente. Nessuna scrittura di massa.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ── 1. Squadre sulle fasi ───────────────────────────────────────────────────
alter table public.squadre_commesse
  add column if not exists phase_id uuid references public.order_work_phases(id) on delete cascade,
  add column if not exists segue_fase boolean not null default false;
comment on column public.squadre_commesse.phase_id is
  'Fase di lavoro fatta dalla squadra; null = la squadra sta su tutta la commessa.';
comment on column public.squadre_commesse.segue_fase is
  'Le date (dal/al) seguono quelle della fase: le aggiorna il trigger su order_work_phases.';

alter table public.squadre_commesse drop constraint if exists squadre_commesse_una_volta;
create unique index if not exists squadre_commesse_una_volta
  on public.squadre_commesse (squadra_id, order_id, coalesce(phase_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists idx_squadre_commesse_phase on public.squadre_commesse (phase_id) where phase_id is not null;

-- Un accesso per persona e commessa, dalla prima data all'ultima delle righe
-- della squadra (tutta la commessa e fasi).
create or replace function public.squadra_accessi_voluti(p_squadra_id uuid)
returns table (order_id uuid, user_id uuid, company_id uuid, dal date, al date, responsabile boolean, capocantiere boolean)
language sql
stable
security definer
set search_path = public
as $$
  select sc.order_id, h.user_id, sc.company_id,
         case when bool_or(sc.dal is null) then null else min(sc.dal) end,
         case when bool_or(sc.al is null) then null else max(sc.al) end,
         bool_or(h.id = t.responsabile_hr_profilo_id),
         bool_or(sc.capocantiere)
    from public.squadre_commesse sc
    join public.external_teams t on t.id = sc.squadra_id and t.is_active
    join public.hr_profili h
      on h.company_id = sc.company_id
     and h.user_id is not null
     and coalesce(h.attivo, true)
     and (h.id = t.responsabile_hr_profilo_id
          or exists (select 1 from public.squadre_componenti c where c.squadra_id = t.id and c.hr_profilo_id = h.id))
   where sc.squadra_id = p_squadra_id
     and public.account_della_azienda(h.user_id, sc.company_id)
   group by sc.order_id, h.user_id, sc.company_id
$$;
revoke all on function public.squadra_accessi_voluti(uuid) from public, anon, authenticated;

-- Le date della fase trascinano le squadre che la seguono.
create or replace function public.fase_date_alle_squadre()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s uuid;
begin
  if new.start_date is not distinct from old.start_date and new.end_date is not distinct from old.end_date then
    return new;
  end if;
  for v_s in
    update public.squadre_commesse
       set dal = new.start_date, al = new.end_date
     where phase_id = new.id and segue_fase
    returning squadra_id
  loop
    perform public.squadra_allinea_accessi(v_s);
  end loop;
  return new;
end;
$$;
revoke all on function public.fase_date_alle_squadre() from public, anon, authenticated;
drop trigger if exists trg_fase_date_alle_squadre on public.order_work_phases;
create trigger trg_fase_date_alle_squadre
  after update of start_date, end_date on public.order_work_phases
  for each row execute function public.fase_date_alle_squadre();

-- Una fase eliminata porta via le sue righe squadra (cascade): gli accessi si
-- riallineano dopo.
create or replace function public.fase_eliminata_squadre()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s uuid;
begin
  for v_s in select distinct squadra_id from public.squadre_commesse where phase_id = old.id loop
    delete from public.squadre_commesse where phase_id = old.id and squadra_id = v_s;
    perform public.squadra_allinea_accessi(v_s);
  end loop;
  return old;
end;
$$;
revoke all on function public.fase_eliminata_squadre() from public, anon, authenticated;
drop trigger if exists trg_fase_eliminata_squadre on public.order_work_phases;
create trigger trg_fase_eliminata_squadre
  before delete on public.order_work_phases
  for each row execute function public.fase_eliminata_squadre();

drop function if exists public.manodopera_squadra_su_commessa(uuid, uuid, date, date, boolean);
create or replace function public.manodopera_squadra_su_commessa(
  p_order_id uuid,
  p_squadra_id uuid,
  p_dal date default null,
  p_al date default null,
  p_capocantiere boolean default false,
  p_phase_id uuid default null
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
  v_fase public.order_work_phases;
  v_segue boolean := false;
  v_dal date := p_dal;
  v_al date := p_al;
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
  if p_phase_id is not null then
    select * into v_fase from public.order_work_phases where id = p_phase_id and order_id = p_order_id;
    if not found then
      raise exception using errcode = '22023', message = 'Questa fase non c''è più.';
    end if;
    -- Senza date scritte, la squadra segue quelle della fase.
    if v_dal is null and v_al is null then
      v_segue := true;
      v_dal := v_fase.start_date;
      v_al := v_fase.end_date;
    end if;
  end if;
  if v_dal is not null and v_al is not null and v_al < v_dal then
    raise exception using errcode = '22023', message = 'La fine viene prima dell''inizio: controlla le date.';
  end if;

  insert into public.squadre_commesse (company_id, squadra_id, order_id, phase_id, dal, al, capocantiere, segue_fase, created_by)
  values (v_company, p_squadra_id, p_order_id, p_phase_id, v_dal, v_al, coalesce(p_capocantiere, false), v_segue, v_uid)
  on conflict (squadra_id, order_id, coalesce(phase_id, '00000000-0000-0000-0000-000000000000'::uuid)) do update
    set dal = excluded.dal, al = excluded.al, capocantiere = excluded.capocantiere, segue_fase = excluded.segue_fase;

  perform public.squadra_allinea_accessi(p_squadra_id);
end;
$$;
revoke all on function public.manodopera_squadra_su_commessa(uuid, uuid, date, date, boolean, uuid) from public, anon;
grant execute on function public.manodopera_squadra_su_commessa(uuid, uuid, date, date, boolean, uuid) to authenticated;

drop function if exists public.manodopera_togli_squadra_da_commessa(uuid, uuid);
create or replace function public.manodopera_togli_squadra_da_commessa(p_order_id uuid, p_squadra_id uuid, p_phase_id uuid default null)
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
  delete from public.squadre_commesse
   where order_id = p_order_id and squadra_id = p_squadra_id
     and phase_id is not distinct from p_phase_id;
  perform public.squadra_allinea_accessi(p_squadra_id);
end;
$$;
revoke all on function public.manodopera_togli_squadra_da_commessa(uuid, uuid, uuid) from public, anon;
grant execute on function public.manodopera_togli_squadra_da_commessa(uuid, uuid, uuid) to authenticated;

-- Le squadre di una commessa, con la fase (null = tutta la commessa).
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
             'phase_id', sc.phase_id,
             'fase', f.name,
             'segue_fase', sc.segue_fase,
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
                        'colore_avatar', h.colore_avatar,
                        'ha_accesso_app', h.user_id is not null and public.account_della_azienda(h.user_id, h.company_id))
                      order by h.cognome, h.nome)
                 from public.squadre_componenti c
                 join public.hr_profili h on h.id = c.hr_profilo_id
                 left join public.employees e on e.id = h.employee_id
                where c.squadra_id = t.id and coalesce(h.attivo, true)), '[]'::jsonb))
           order by (sc.phase_id is not null), f.position nulls first, (sc.al is not null and sc.al < v_oggi), sc.dal nulls first, t.name)
      from public.squadre_commesse sc
      join public.external_teams t on t.id = sc.squadra_id
      left join public.order_work_phases f on f.id = sc.phase_id
     where sc.order_id = p_order_id), '[]'::jsonb);
end;
$$;
revoke all on function public.manodopera_squadre_commessa(uuid) from public, anon;
grant execute on function public.manodopera_squadre_commessa(uuid) to authenticated;

-- ── 2. Note per gli operai ──────────────────────────────────────────────────
create table if not exists public.note_cantiere (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  phase_id uuid references public.order_work_phases(id) on delete cascade,
  per text not null default 'tutti',
  squadra_id uuid references public.external_teams(id) on delete cascade,
  hr_profilo_id uuid references public.hr_profili(id) on delete cascade,
  testo text not null,
  importante boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint note_cantiere_per check (per in ('tutti', 'squadra', 'persona')),
  constraint note_cantiere_squadra check ((per = 'squadra') = (squadra_id is not null)),
  constraint note_cantiere_persona check ((per = 'persona') = (hr_profilo_id is not null)),
  constraint note_cantiere_testo check (length(btrim(testo)) between 1 and 2000)
);
comment on table public.note_cantiere is
  'Istruzioni dell''ufficio per chi lavora sulla commessa (o su una fase): per tutti, per una squadra o per una persona. Le vede l''app di cantiere (campo_note_cantiere). Si scrive solo dalle funzioni note_cantiere_*.';
create index if not exists idx_note_cantiere_order on public.note_cantiere (order_id, created_at desc);
create index if not exists idx_note_cantiere_phase on public.note_cantiere (phase_id) where phase_id is not null;

create table if not exists public.note_cantiere_letture (
  nota_id uuid not null references public.note_cantiere(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  letta_at timestamptz not null default now(),
  primary key (nota_id, user_id)
);
comment on table public.note_cantiere_letture is 'Chi ha visto la nota nell''app di cantiere, e quando.';

alter table public.note_cantiere enable row level security;
alter table public.note_cantiere_letture enable row level security;
drop policy if exists note_cantiere_lettura on public.note_cantiere;
create policy note_cantiere_lettura on public.note_cantiere for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_orders', company_id)
         or public.has_permission_for_company((select auth.uid()), 'can_view_operai', company_id));
drop policy if exists blocco_utente_bloccato on public.note_cantiere;
create policy blocco_utente_bloccato on public.note_cantiere as restrictive for all to authenticated
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));
drop policy if exists note_cantiere_letture_mie on public.note_cantiere_letture;
create policy note_cantiere_letture_mie on public.note_cantiere_letture for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists blocco_utente_bloccato on public.note_cantiere_letture;
create policy blocco_utente_bloccato on public.note_cantiere_letture as restrictive for all to authenticated
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));

-- Chi riceve una nota: gli account (della stessa azienda) delle persone a cui
-- è indirizzata e che lavorano su quella commessa.
create or replace function public.note_cantiere_destinatari(p_nota_id uuid)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  with n as (select * from public.note_cantiere where id = p_nota_id),
  sul_cantiere as (
    -- chi ha l'accesso al cantiere…
    select a.user_id from public.order_campo_assignments a, n where a.order_id = n.order_id
    union
    -- …o è in una squadra che ci lavora
    select h.user_id
      from n
      join public.squadre_commesse sc on sc.order_id = n.order_id
      join public.squadre_componenti c on c.squadra_id = sc.squadra_id
      join public.hr_profili h on h.id = c.hr_profilo_id and h.user_id is not null
  )
  select distinct s.user_id
    from sul_cantiere s, n
   where s.user_id is not null
     and public.account_della_azienda(s.user_id, n.company_id)
     and (n.per = 'tutti'
          or (n.per = 'squadra' and exists (
                select 1 from public.squadre_componenti c
                  join public.hr_profili h on h.id = c.hr_profilo_id
                 where c.squadra_id = n.squadra_id and h.user_id = s.user_id))
          or (n.per = 'persona' and exists (
                select 1 from public.hr_profili h where h.id = n.hr_profilo_id and h.user_id = s.user_id)))
  union
  -- la persona a cui è scritta, anche se non ha ancora l'accesso
  select h.user_id
    from n join public.hr_profili h on h.id = n.hr_profilo_id
   where n.per = 'persona' and h.user_id is not null and public.account_della_azienda(h.user_id, n.company_id)
$$;
revoke all on function public.note_cantiere_destinatari(uuid) from public, anon, authenticated;

create or replace function public.note_cantiere_elenco(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
begin
  select company_id into v_company from public.orders where id = p_order_id;
  if v_company is null
     or not (public.has_permission_for_company(v_uid, 'can_view_orders', v_company)
             or public.has_permission_for_company(v_uid, 'can_view_operai', v_company)) then
    raise exception using errcode = '42501', message = 'Non puoi vedere questa commessa.';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', n.id,
             'phase_id', n.phase_id,
             'fase', f.name,
             'per', n.per,
             'squadra_id', n.squadra_id,
             'squadra', t.name,
             'squadra_colore', t.color,
             'hr_profilo_id', n.hr_profilo_id,
             'persona', nullif(trim(coalesce(h.nome, '') || ' ' || coalesce(h.cognome, '')), ''),
             'testo', n.testo,
             'importante', n.importante,
             'autore', nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
             'creata_il', n.created_at,
             'modificata_il', case when n.updated_at > n.created_at + interval '1 minute' then n.updated_at end,
             'destinatari', (select count(*) from public.note_cantiere_destinatari(n.id)),
             'letta_da', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'nome', coalesce(nullif(trim(coalesce(hp.nome, '') || ' ' || coalesce(hp.cognome, '')), ''),
                                         nullif(trim(coalesce(pl.first_name, '') || ' ' || coalesce(pl.last_name, '')), ''),
                                         'Operaio'),
                        'il', l.letta_at) order by l.letta_at)
                 from public.note_cantiere_letture l
                 left join public.profiles pl on pl.id = l.user_id
                 left join public.hr_profili hp on hp.user_id = l.user_id and hp.company_id = n.company_id
                where l.nota_id = n.id), '[]'::jsonb))
           order by n.importante desc, n.created_at desc)
      from public.note_cantiere n
      left join public.order_work_phases f on f.id = n.phase_id
      left join public.external_teams t on t.id = n.squadra_id
      left join public.hr_profili h on h.id = n.hr_profilo_id
      left join public.profiles p on p.id = n.created_by
     where n.order_id = p_order_id), '[]'::jsonb);
end;
$$;
revoke all on function public.note_cantiere_elenco(uuid) from public, anon;
grant execute on function public.note_cantiere_elenco(uuid) to authenticated;

-- p_dati: testo, per (tutti|squadra|persona), squadra_id, hr_profilo_id,
-- phase_id, importante. Una nota nuova arriva come avviso nell'app.
create or replace function public.note_cantiere_salva(p_order_id uuid, p_nota_id uuid, p_dati jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
  v_codice text;
  v_id uuid := p_nota_id;
  v_testo text := btrim(coalesce(p_dati->>'testo', ''));
  v_per text := coalesce(nullif(p_dati->>'per', ''), 'tutti');
  v_squadra uuid := nullif(p_dati->>'squadra_id', '')::uuid;
  v_persona uuid := nullif(p_dati->>'hr_profilo_id', '')::uuid;
  v_fase uuid := nullif(p_dati->>'phase_id', '')::uuid;
  v_importante boolean := coalesce((p_dati->>'importante')::boolean, false);
  v_nome_fase text;
  v_dest uuid;
begin
  select company_id, order_code into v_company, v_codice from public.orders where id = p_order_id and deleted_at is null;
  if v_company is null
     or not (public.has_permission_for_company(v_uid, 'can_edit_orders', v_company)
             or public.has_permission_for_company(v_uid, 'can_edit_operai', v_company)) then
    raise exception using errcode = '42501', message = 'Non puoi scrivere note su questa commessa.';
  end if;
  if v_testo = '' then
    raise exception using errcode = '22023', message = 'Scrivi il testo della nota.';
  end if;
  if length(v_testo) > 2000 then
    raise exception using errcode = '22023', message = 'La nota è troppo lunga: al massimo 2.000 caratteri.';
  end if;
  if v_per not in ('tutti', 'squadra', 'persona') then
    raise exception using errcode = '22023', message = 'Scegli per chi è la nota.';
  end if;
  if v_per <> 'squadra' then v_squadra := null; end if;
  if v_per <> 'persona' then v_persona := null; end if;
  if v_per = 'squadra' and not exists (select 1 from public.external_teams where id = v_squadra and company_id = v_company and kind = 'interna') then
    raise exception using errcode = '22023', message = 'Scegli la squadra.';
  end if;
  if v_per = 'persona' and not exists (select 1 from public.hr_profili where id = v_persona and company_id = v_company) then
    raise exception using errcode = '22023', message = 'Scegli la persona.';
  end if;
  if v_fase is not null then
    select name into v_nome_fase from public.order_work_phases where id = v_fase and order_id = p_order_id;
    if not found then
      raise exception using errcode = '22023', message = 'Questa fase non c''è più.';
    end if;
  end if;

  if v_id is null then
    insert into public.note_cantiere (company_id, order_id, phase_id, per, squadra_id, hr_profilo_id, testo, importante, created_by)
    values (v_company, p_order_id, v_fase, v_per, v_squadra, v_persona, v_testo, v_importante, v_uid)
    returning id into v_id;

    -- Avviso nell'app a chi la deve leggere.
    for v_dest in select d.user_id from public.note_cantiere_destinatari(v_id) d where d.user_id <> v_uid loop
      perform public.campo_notifica(
        v_company, v_dest, 'campo_nota',
        case when v_importante then 'Nota importante: ' else 'Nuova nota: ' end || coalesce(v_codice, 'cantiere'),
        left(concat_ws(' — ', v_nome_fase, v_testo), 160),
        -- la nota come riferimento: due note di fila sono due avvisi, non uno
        'nota_cantiere', v_id, '/campo/lavoro/' || p_order_id::text);
    end loop;
  else
    update public.note_cantiere
       set testo = v_testo, per = v_per, squadra_id = v_squadra, hr_profilo_id = v_persona,
           phase_id = v_fase, importante = v_importante, updated_at = now()
     where id = v_id and order_id = p_order_id;
    if not found then
      raise exception using errcode = '42501', message = 'Questa nota non c''è più.';
    end if;
  end if;
  return v_id;
end;
$$;
revoke all on function public.note_cantiere_salva(uuid, uuid, jsonb) from public, anon;
grant execute on function public.note_cantiere_salva(uuid, uuid, jsonb) to authenticated;

create or replace function public.note_cantiere_elimina(p_nota_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_company uuid;
begin
  select company_id into v_company from public.note_cantiere where id = p_nota_id;
  if v_company is null
     or not (public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_company)
             or public.has_permission_for_company(auth.uid(), 'can_edit_operai', v_company)) then
    raise exception using errcode = '42501', message = 'Questa nota non c''è o non puoi eliminarla.';
  end if;
  delete from public.note_cantiere where id = p_nota_id;
end;
$$;
revoke all on function public.note_cantiere_elimina(uuid) from public, anon;
grant execute on function public.note_cantiere_elimina(uuid) to authenticated;

-- ── 3. Nell'app: le note per me ─────────────────────────────────────────────
create or replace function public.campo_note_cantiere(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
  v_ufficio boolean;
begin
  select company_id into v_company from public.orders where id = p_order_id;
  if v_uid is null or v_company is null then
    return '[]'::jsonb;
  end if;
  v_ufficio := public.has_permission_for_company(v_uid, 'can_view_orders', v_company);

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', n.id,
             'testo', n.testo,
             'importante', n.importante,
             'per', n.per,
             'per_chi', case n.per when 'persona' then 'Per te'
                                   when 'squadra' then 'Per la ' || coalesce(t.name, 'squadra')
                                   else 'Per tutti' end,
             'fase', f.name,
             'autore', nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
             'creata_il', n.created_at,
             'letta', exists (select 1 from public.note_cantiere_letture l where l.nota_id = n.id and l.user_id = v_uid))
           order by n.importante desc, n.created_at desc)
      from public.note_cantiere n
      left join public.order_work_phases f on f.id = n.phase_id
      left join public.external_teams t on t.id = n.squadra_id
      left join public.profiles p on p.id = n.created_by
     where n.order_id = p_order_id
       and (
         -- l'ufficio le vede tutte
         v_ufficio
         or v_uid in (select d.user_id from public.note_cantiere_destinatari(n.id) d)
       )), '[]'::jsonb);
end;
$$;
revoke all on function public.campo_note_cantiere(uuid) from public, anon;
grant execute on function public.campo_note_cantiere(uuid) to authenticated;

create or replace function public.campo_nota_letta(p_nota_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return; end if;
  if v_uid not in (select d.user_id from public.note_cantiere_destinatari(p_nota_id) d) then
    return;
  end if;
  insert into public.note_cantiere_letture (nota_id, user_id) values (p_nota_id, v_uid)
  on conflict do nothing;
end;
$$;
revoke all on function public.campo_nota_letta(uuid) from public, anon;
grant execute on function public.campo_nota_letta(uuid) to authenticated;

-- ── «Chi c'è oggi»: una persona una volta sola anche se la squadra è su più fasi
create or replace function public.campo_squadra_oggi(p_order_id uuid)
returns table(user_id uuid, nome text, ruolo text, is_capocantiere boolean, entrata timestamp with time zone, uscita timestamp with time zone, in_cantiere boolean, ore numeric, rapportino_inviato boolean)
language plpgsql
security definer
set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_company uuid;
  v_me uuid := auth.uid();
  v_oggi date := (now() at time zone 'Europe/Rome')::date;
begin
  select o.company_id into v_company from public.orders o where o.id = p_order_id;
  if v_company is null then return; end if;
  if not (
    exists (select 1 from public.profiles p join public.user_roles ur on ur.user_id = p.id
            where p.id = v_me and p.company_id = v_company and ur.role in ('company_admin', 'company_staff', 'super_admin'))
    or exists (select 1 from public.order_campo_assignments a where a.order_id = p_order_id and a.user_id = v_me and a.is_capocantiere)
  ) then
    raise exception 'Solo il capocantiere o l''ufficio possono vedere la squadra' using errcode = '42501';
  end if;

  return query
  select x.user_id, x.nome, x.ruolo, x.is_capocantiere, x.entrata, x.uscita, x.in_cantiere, x.ore, x.rapportino_inviato
  from (
    with squadra as (
      select distinct a.user_id, bool_or(a.is_capocantiere) as capo, max(a.role_type) as role_type
      from public.order_campo_assignments a where a.order_id = p_order_id and a.user_id is not null
      group by a.user_id
    ),
    eventi as (
      select t.user_id, t.tipo, t.timestamp_evento
      from public.campo_timbrature t
      where t.company_id = v_company and (t.timestamp_evento at time zone 'Europe/Rome')::date = v_oggi
        and (t.order_id = p_order_id or t.order_id is null)
    ),
    agg as (
      select e.user_id,
             min(e.timestamp_evento) filter (where e.tipo = 'entrata') as entrata,
             max(e.timestamp_evento) filter (where e.tipo = 'uscita')  as uscita,
             (array_agg(e.tipo order by e.timestamp_evento desc))[1] = 'entrata' as dentro
      from eventi e group by e.user_id
    ),
    ore as (
      select y.user_id, round((sum(extract(epoch from (coalesce(y.fine, now()) - y.inizio))) / 3600)::numeric, 1) as ore
      from (
        select e.user_id, e.timestamp_evento as inizio,
               lead(e.timestamp_evento) over (partition by e.user_id order by e.timestamp_evento) as fine,
               e.tipo
        from eventi e
      ) y where y.tipo = 'entrata' group by y.user_id
    ),
    senza_app as (
      select distinct h.id as profilo_id, trim(coalesce(h.nome, '') || ' ' || coalesce(h.cognome, '')) as nome
      from public.squadre_commesse sc
      join public.external_teams t on t.id = sc.squadra_id and t.is_active
      join public.squadre_componenti c on c.squadra_id = sc.squadra_id
      join public.hr_profili h on h.id = c.hr_profilo_id and h.user_id is null and coalesce(h.attivo, true)
      where sc.order_id = p_order_id
        and (sc.dal is null or sc.dal <= v_oggi)
        and (sc.al is null or sc.al >= v_oggi)
    ),
    timbri_hr as (
      select s.profilo_id,
             min(ht.timestamp) filter (where ht.tipo = 'entrata') as entrata,
             max(ht.timestamp) filter (where ht.tipo = 'uscita') as uscita,
             (array_agg(ht.tipo order by ht.timestamp desc))[1] in ('entrata', 'pausa_fine') as dentro
      from senza_app s
      join public.hr_timbrature ht on ht.profilo_id = s.profilo_id and ht.data_evento = v_oggi
      group by s.profilo_id
    )
    select s.user_id,
           trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) as nome,
           case when ur.role = 'subcontractor' then 'sub' else 'dipendente' end as ruolo,
           s.capo as is_capocantiere,
           a.entrata, a.uscita, coalesce(a.dentro, false) as in_cantiere, coalesce(o.ore, 0) as ore,
           exists (select 1 from public.campo_rapportini cr where cr.user_id = s.user_id and cr.order_id = p_order_id and cr.data_lavoro = v_oggi) as rapportino_inviato
    from squadra s
    join public.profiles p on p.id = s.user_id
    left join lateral (select ur2.role from public.user_roles ur2 where ur2.user_id = s.user_id order by (ur2.role = 'subcontractor') desc limit 1) ur on true
    left join agg a on a.user_id = s.user_id
    left join ore o on o.user_id = s.user_id
    union all
    select null::uuid, s.nome, 'dipendente', false,
           th.entrata, th.uscita, coalesce(th.dentro, false),
           coalesce(round(public.manodopera_ore_timbrate(s.profilo_id, v_oggi), 1), 0),
           false
    from senza_app s
    left join timbri_hr th on th.profilo_id = s.profilo_id
  ) x
  order by x.is_capocantiere desc, x.nome;
end $function$;
