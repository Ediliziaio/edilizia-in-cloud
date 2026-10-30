-- ════════════════════════════════════════════════════════════════════════════
-- Commesse generali, modulo «Documenti»: la checklist dei documenti richiesti
-- ════════════════════════════════════════════════════════════════════════════
-- Piano: docs/superpowers/plans/2026-10-30-commesse-generali-appalti-sviluppi.md
-- (tappa 6).
--
-- I file restano dove sono già: nell'archivio della commessa (order_attachments,
-- con le cartelle di order_document_folders), della generale o di una figlia.
-- Qui ci sono soltanto due cose:
--
--   · commesse_generali_documenti_voci  le scelte dell'azienda sull'elenco di
--     partenza, per tipo di generale: una voce tolta, resa facoltativa, spostata
--     sulle unità, oppure una voce nuova sua (chiave «az-…»). L'elenco di
--     partenza (contratto firmato, polizza CAR, DURC, fideiussione 122/2005…)
--     sta nel codice: src/lib/orders/generali/documenti.ts. Un campo vuoto vuol
--     dire «come l'elenco di partenza».
--   · commesse_generali_documenti        quale file dell'archivio soddisfa quale
--     voce su quale commessa, con la scadenza; oppure «non è questo» (un file
--     riconosciuto dal nome che non c'entra) o «non serve» (la voce non vale per
--     quella commessa). Un file tolto dall'archivio porta via la sua riga.
--
-- Entrambe hanno company_id: entrano da sole nel backup delle aziende.
-- Nessun dato esistente viene toccato. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ── 1. Le scelte dell'azienda sull'elenco ───────────────────────────────────
create table if not exists public.commesse_generali_documenti_voci (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  modello text not null check (modello in ('appalto', 'sviluppo', 'compravendita')),
  -- La voce di partenza che si cambia (es. «durc») o una voce dell'azienda («az-…»).
  chiave text not null check (chiave ~ '^[a-z0-9_-]{1,60}$'),
  nome text check (nome is null or length(btrim(nome)) between 1 and 120),
  ambito text check (ambito is null or ambito in ('generale', 'figlia')),
  obbligatoria boolean,
  con_scadenza boolean,
  tolta boolean not null default false,
  posizione integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint commesse_generali_documenti_voci_uniq unique (company_id, modello, chiave),
  -- Una voce dell'azienda non ha un elenco di partenza da cui prendere nome e posto.
  constraint commesse_generali_documenti_voci_personale
    check (chiave not like 'az-%' or (nome is not null and ambito is not null))
);

comment on table public.commesse_generali_documenti_voci is
  'Documenti richiesti nelle commesse generali: le voci che l''azienda cambia, toglie o aggiunge all''elenco di partenza (nel codice). Null = come l''elenco di partenza.';

-- ── 2. Quale file soddisfa quale voce ───────────────────────────────────────
create table if not exists public.commesse_generali_documenti (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  -- La generale (voci «sulla generale») o una sua figlia (voci «su ogni unità / ordine di lavoro»).
  order_id uuid not null references public.orders(id) on delete cascade,
  voce text not null check (voce ~ '^[a-z0-9_-]{1,60}$'),
  -- documento = il file soddisfa la voce; escluso = «non è questo»; non_serve = la voce non vale qui.
  tipo text not null check (tipo in ('documento', 'escluso', 'non_serve')),
  attachment_id uuid references public.order_attachments(id) on delete cascade,
  scadenza date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint commesse_generali_documenti_forma check ((tipo = 'non_serve') = (attachment_id is null)),
  constraint commesse_generali_documenti_scadenza check (tipo = 'documento' or scadenza is null)
);

comment on table public.commesse_generali_documenti is
  'Checklist dei documenti delle commesse generali: quale file di order_attachments soddisfa quale voce, con la scadenza.';

create unique index if not exists commesse_generali_documenti_file_uniq
  on public.commesse_generali_documenti (order_id, voce, attachment_id) where attachment_id is not null;
create unique index if not exists commesse_generali_documenti_non_serve_uniq
  on public.commesse_generali_documenti (order_id, voce) where tipo = 'non_serve';
create index if not exists commesse_generali_documenti_order_idx
  on public.commesse_generali_documenti (order_id);
create index if not exists commesse_generali_documenti_attachment_idx
  on public.commesse_generali_documenti (attachment_id) where attachment_id is not null;
create index if not exists commesse_generali_documenti_company_idx
  on public.commesse_generali_documenti (company_id);

-- L'azienda è sempre quella della commessa (chi scrive non la sceglie); il file
-- deve essere della stessa commessa; la commessa deve essere una generale o una
-- sua figlia.
create or replace function public.commesse_generali_documenti_coerente()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_azienda uuid;
begin
  select o.company_id into v_azienda
    from public.orders o
   where o.id = new.order_id
     and (o.workflow_kind = 'generale' or o.commessa_generale_id is not null);
  if v_azienda is null then
    raise exception 'Questa commessa non fa parte di una commessa generale' using errcode = '22023';
  end if;
  new.company_id := v_azienda;

  if new.attachment_id is not null and not exists (
    select 1 from public.order_attachments a
     where a.id = new.attachment_id and a.order_id = new.order_id
  ) then
    raise exception 'Il documento non è nell''archivio di questa commessa' using errcode = '22023';
  end if;

  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;
revoke all on function public.commesse_generali_documenti_coerente() from public, anon, authenticated;

drop trigger if exists trg_commesse_generali_documenti_coerente on public.commesse_generali_documenti;
create trigger trg_commesse_generali_documenti_coerente
  before insert or update on public.commesse_generali_documenti
  for each row execute function public.commesse_generali_documenti_coerente();

create or replace function public.commesse_generali_documenti_voci_aggiornata()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.commesse_generali_documenti_voci_aggiornata() from public, anon, authenticated;

drop trigger if exists trg_commesse_generali_documenti_voci_aggiornata on public.commesse_generali_documenti_voci;
create trigger trg_commesse_generali_documenti_voci_aggiornata
  before update on public.commesse_generali_documenti_voci
  for each row execute function public.commesse_generali_documenti_voci_aggiornata();

-- ── 3. Chi legge e chi scrive ───────────────────────────────────────────────
-- Le voci come le cartelle dei documenti: le legge chi vede le commesse o le
-- impostazioni, le cambia «Configurazione Ordini». La checklist come i documenti
-- della commessa: la legge chi vede le commesse, la cambia chi le modifica.
-- Il permesso si chiede nell'azienda della riga (has_permission_for_company).
alter table public.commesse_generali_documenti_voci enable row level security;
alter table public.commesse_generali_documenti enable row level security;

revoke all on public.commesse_generali_documenti_voci, public.commesse_generali_documenti from anon, authenticated;
grant select, insert, update, delete on public.commesse_generali_documenti_voci, public.commesse_generali_documenti to authenticated;

drop policy if exists commesse_generali_documenti_voci_lettura on public.commesse_generali_documenti_voci;
create policy commesse_generali_documenti_voci_lettura on public.commesse_generali_documenti_voci
  for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_orders', company_id)
      or public.has_permission_for_company((select auth.uid()), 'can_view_settings_orders', company_id));

drop policy if exists commesse_generali_documenti_voci_gestione on public.commesse_generali_documenti_voci;
create policy commesse_generali_documenti_voci_gestione on public.commesse_generali_documenti_voci
  for all to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_edit_settings_orders', company_id))
  with check (public.has_permission_for_company((select auth.uid()), 'can_edit_settings_orders', company_id));

drop policy if exists commesse_generali_documenti_lettura on public.commesse_generali_documenti;
create policy commesse_generali_documenti_lettura on public.commesse_generali_documenti
  for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_orders', company_id));

drop policy if exists commesse_generali_documenti_gestione on public.commesse_generali_documenti;
create policy commesse_generali_documenti_gestione on public.commesse_generali_documenti
  for all to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_edit_orders', company_id))
  with check (public.has_permission_for_company((select auth.uid()), 'can_edit_orders', company_id));
