-- Sottofasi della commessa: i passi di una fase, che ne determinano l'avanzamento (07/10/2026).
--
-- Oggi l'avanzamento di una fase è una percentuale dichiarata (uno slider a passi
-- di 5 nel rapportino, valido all'approvazione dell'ufficio) e il 92% delle fasi
-- reali è 0 oppure 100. Una fase come «Impianto elettrico» si fa in più passi
-- (tracce, cavi, frutti, quadro, collaudo): con le sottofasi la percentuale la
-- calcola il database, da quanti passi sono fatti, ciascuno col suo peso.
--
-- Cosa fa.
--   · order_work_subphases: una riga per sottofase. NON ha company_id né order_id:
--     azienda e commessa sono quelle della fase, e seguirla è automatico anche
--     se la fase cambia commessa (nessuna copia che diventi stantia).
--   · fase_avanzamento_derivato: l'UNICO posto dove si calcola percentuale e stato
--     di una fase dalle sue sottofasi.
--   · fase_deriva_da_sottofasi (BEFORE UPDATE su order_work_phases): per una fase
--     con sottofasi riscrive percentuale, stato e chiusura dal calcolo, QUALUNQUE
--     cosa il client abbia scritto (un'app vecchia, l'approvazione di un rapportino
--     scritto prima, una chiamata diretta): il database è la fonte, non la schermata.
--     Una fase senza sottofasi non cambia di una virgola.
--   · ricalcola_fase_da_sottofasi + trg_sottofasi_ricalcola (AFTER sulle sottofasi):
--     dopo ogni spunta, inserimento o cancellazione la fase si riallinea.
--   · trg_sottofasi_guardia (BEFORE INSERT/UPDATE, INVOKER: guarda current_user):
--     per chi non ha «Ordini e Commesse» nell'azienda della commessa, cioè
--     l'operaio o la ditta assegnati, si cambia solo se la sottofase è fatta; ora e
--     persona le scrive il database.
--   · RLS: le sottofasi seguono la loro FASE, e quindi la commessa (regola del
--     25/09, 20280926023000): le vede chi vede la fase, le modifica chi può
--     modificare le fasi e ha la commessa tra le sue (can_see_order); chi è
--     assegnato al cantiere può solo aggiornarle (spuntarle).
--
-- Tutto gira come proprietario (SECURITY DEFINER) dove deve scrivere la fase, quindi
-- passa da trg_fase_campi_protetti (20281006150000), che lascia passare chi non è
-- authenticated/anon. Nessuna colonna di order_work_phases cambia e nessun dato
-- viene toccato: una fase senza sottofasi si comporta esattamente come prima.

set local lock_timeout = '3s';

create table if not exists public.order_work_subphases (
  id uuid primary key default gen_random_uuid(),
  phase_id uuid not null references public.order_work_phases(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 160),
  position integer not null default 0,
  peso integer not null default 1 check (peso between 1 and 100),
  fatta boolean not null default false,
  fatta_il timestamptz,
  fatta_da uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_work_subphases_fatta_coerente check (fatta or (fatta_il is null and fatta_da is null))
);

create index if not exists order_work_subphases_fase_idx on public.order_work_subphases (phase_id, position);

-- ---------------------------------------------------------------------------
-- Il calcolo: percentuale e stato di una fase dalle sue sottofasi
--   · senza sottofasi: derivata = false, il resto non conta
--   · con sottofasi: % = parte di peso fatto; 100 → completata; >0 → in corso;
--     a 0% l'ufficio sceglie tra da_iniziare e in_corso, e una fase che era
--     completata si riapre in_corso
-- ---------------------------------------------------------------------------
create or replace function public.fase_avanzamento_derivato(p_phase_id uuid, p_status_proposto text, p_status_precedente text)
returns table (derivata boolean, percentuale integer, stato text)
language sql
stable
security definer
set search_path = public
as $$
  with t as (
    select coalesce(sum(peso), 0)::integer as tot, coalesce(sum(peso) filter (where fatta), 0)::integer as fatto
      from public.order_work_subphases
     where phase_id = p_phase_id
  ), p as (
    select tot, case when tot > 0 then round(100.0 * fatto / tot)::integer end as pct from t
  )
  select p.tot > 0,
         p.pct,
         case when p.tot = 0 then null
              when p.pct >= 100 then 'completata'
              when p.pct > 0 then 'in_corso'
              when p_status_proposto in ('da_iniziare', 'in_corso') then p_status_proposto
              when p_status_precedente = 'completata' then 'in_corso'
              else p_status_precedente end
    from p;
$$;

-- ---------------------------------------------------------------------------
-- BEFORE UPDATE sulla fase: con sottofasi, percentuale e stato sono quelli del calcolo
-- ---------------------------------------------------------------------------
create or replace function public.fase_deriva_da_sottofasi()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  d record;
begin
  select * into d from public.fase_avanzamento_derivato(new.id, new.status, old.status);
  if not d.derivata then
    return new;
  end if;
  new.percentuale := d.percentuale;
  new.status := d.stato;
  if d.stato = 'completata' then
    new.completata_il := coalesce(new.completata_il, old.completata_il, now());
    new.completata_da := coalesce(new.completata_da, old.completata_da, (select auth.uid()));
  else
    new.completata_il := null;
    new.completata_da := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fase_deriva_da_sottofasi on public.order_work_phases;
create trigger trg_fase_deriva_da_sottofasi
  before update on public.order_work_phases
  for each row execute function public.fase_deriva_da_sottofasi();

-- ---------------------------------------------------------------------------
-- Dopo una spunta, un inserimento o una cancellazione: la fase si riallinea
-- ---------------------------------------------------------------------------
create or replace function public.ricalcola_fase_da_sottofasi(p_phase_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  f public.order_work_phases%rowtype;
  d record;
begin
  select * into f from public.order_work_phases where id = p_phase_id for update;
  if not found then
    return;   -- la fase non c'è più (si sta cancellando)
  end if;
  select * into d from public.fase_avanzamento_derivato(p_phase_id, f.status, f.status);
  if not d.derivata then
    return;   -- senza sottofasi la fase resta com'è: percentuale dichiarata
  end if;
  if f.percentuale is not distinct from d.percentuale
     and f.status is not distinct from d.stato
     and ((d.stato = 'completata') = (f.completata_il is not null)) then
    return;   -- già allineata: niente scritture inutili
  end if;
  -- L'UPDATE fa scattare fase_deriva_da_sottofasi, che scrive percentuale, stato e chiusura.
  update public.order_work_phases
     set percentuale = d.percentuale, status = d.stato, updated_at = now()
   where id = p_phase_id;
end;
$$;

create or replace function public.trg_sottofasi_ricalcola()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ricalcola_fase_da_sottofasi(coalesce(new.phase_id, old.phase_id));
  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------------
-- Guardia: ora e persona dal database, cantiere limitato a «spuntare»
-- ---------------------------------------------------------------------------
create or replace function public.sottofase_guardia()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_utente uuid := (select auth.uid());
  -- Le colonne che cambia il cantiere: spuntare una sottofase.
  v_cantiere constant text[] := array['fatta', 'fatta_il', 'fatta_da', 'updated_at'];
  v_azienda uuid;
begin
  -- L'azienda è quella della fase.
  select f.company_id into v_azienda
    from public.order_work_phases f
   where f.id = new.phase_id;
  if v_azienda is null then
    raise exception 'La fase non esiste.' using errcode = '23503';
  end if;
  if tg_op = 'UPDATE' and new.phase_id is distinct from old.phase_id then
    raise exception 'Una sottofase non cambia fase.' using errcode = '42501';
  end if;

  -- Chi l'ha segnata e quando: lo scrive il database, non il client.
  if tg_op = 'INSERT' or new.fatta is distinct from old.fatta then
    new.fatta_il := case when new.fatta then now() end;
    new.fatta_da := case when new.fatta then v_utente end;
  end if;
  new.updated_at := now();

  -- Solo le richieste degli utenti. Le funzioni SECURITY DEFINER, il service
  -- role, i cron e le migrazioni passano.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if public.has_permission_for_company(v_utente, 'can_edit_orders', v_azienda) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'Le sottofasi le crea chi ha il permesso «Ordini e Commesse».'
      using errcode = '42501';
  end if;

  -- Dal cantiere cambia solo se la sottofase è fatta.
  if (to_jsonb(new) - v_cantiere) = (to_jsonb(old) - v_cantiere) then
    return new;
  end if;

  raise exception 'Dal cantiere si segna solo se una sottofase è fatta: il resto lo cambia chi ha il permesso «Ordini e Commesse».'
    using errcode = '42501';
end;
$$;

drop trigger if exists trg_sottofasi_guardia on public.order_work_subphases;
create trigger trg_sottofasi_guardia
  before insert or update on public.order_work_subphases
  for each row execute function public.sottofase_guardia();

drop trigger if exists trg_sottofasi_ricalcola on public.order_work_subphases;
create trigger trg_sottofasi_ricalcola
  after insert or delete or update of fatta, peso on public.order_work_subphases
  for each row execute function public.trg_sottofasi_ricalcola();

revoke all on function public.fase_avanzamento_derivato(uuid, text, text) from public, anon, authenticated;
revoke all on function public.fase_deriva_da_sottofasi() from public, anon, authenticated;
revoke all on function public.ricalcola_fase_da_sottofasi(uuid) from public, anon, authenticated;
revoke all on function public.trg_sottofasi_ricalcola() from public, anon, authenticated;
revoke all on function public.sottofase_guardia() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS: le sottofasi seguono la loro fase (e quindi la commessa)
-- ---------------------------------------------------------------------------
alter table public.order_work_subphases enable row level security;
revoke all on public.order_work_subphases from anon;

-- Legge chi legge la fase: la sottoquery applica a chi legge la RLS di order_work_phases.
drop policy if exists sottofasi_lettura on public.order_work_subphases;
create policy sottofasi_lettura on public.order_work_subphases
  for select to authenticated
  using (exists (select 1 from public.order_work_phases f where f.id = order_work_subphases.phase_id));

-- Scrive l'ufficio, come per le fasi: «Ordini e Commesse» e la commessa tra le proprie (can_see_order).
drop policy if exists sottofasi_ufficio on public.order_work_subphases;
create policy sottofasi_ufficio on public.order_work_subphases
  for all to authenticated
  using (
    (select public.has_permission((select auth.uid()), 'can_edit_orders'))
    and exists (select 1 from public.order_work_phases f
                  join public.orders o on o.id = f.order_id
                 where f.id = order_work_subphases.phase_id
                   and public.get_order_company_id(f.order_id) = (select public.get_user_company_id((select auth.uid())))
                   and public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id))
  )
  with check (
    (select public.has_permission((select auth.uid()), 'can_edit_orders'))
    and exists (select 1 from public.order_work_phases f
                  join public.orders o on o.id = f.order_id
                 where f.id = order_work_subphases.phase_id
                   and public.get_order_company_id(f.order_id) = (select public.get_user_company_id((select auth.uid())))
                   and public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id))
  );

-- Il cantiere aggiorna (spunta): chi è assegnato alla commessa. Le colonne le limita trg_sottofasi_guardia.
drop policy if exists sottofasi_segna_cantiere on public.order_work_subphases;
create policy sottofasi_segna_cantiere on public.order_work_subphases
  for update to authenticated
  using (
    exists (select 1 from public.order_work_phases f
             where f.id = order_work_subphases.phase_id
               and (exists (select 1 from public.order_campo_assignments oca
                             where oca.order_id = f.order_id and oca.user_id = (select auth.uid()))
                    or public.order_has_employee_for_user(f.order_id, (select auth.uid()))))
  )
  with check (
    exists (select 1 from public.order_work_phases f
             where f.id = order_work_subphases.phase_id
               and (exists (select 1 from public.order_campo_assignments oca
                             where oca.order_id = f.order_id and oca.user_id = (select auth.uid()))
                    or public.order_has_employee_for_user(f.order_id, (select auth.uid()))))
  );

drop policy if exists blocco_utente_bloccato on public.order_work_subphases;
create policy blocco_utente_bloccato on public.order_work_subphases
  as restrictive for all to authenticated
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));
