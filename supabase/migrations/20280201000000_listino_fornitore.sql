-- Listino fornitore: i prezzi d'acquisto che il fornitore fa A TE.
--
-- Fin qui il fornitore aveva anagrafica, ordini e scadenze ma nessun
-- listino: "il fornitore X mi fa questi prezzi" viveva su carta o in una
-- chat. Ora e' una tabella per fornitore, con sconto per voce, e quando
-- aggiungi una riga a un ordine d'acquisto il prezzo viene SUGGERITO dal
-- listino — suggerito, mai scritto da solo: la conferma resta a chi ordina.

create table if not exists public.listini_fornitore (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  nome text not null default 'Listino',
  valido_dal date,
  valido_al date,
  -- Sconto proposto alle voci nuove in interfaccia. NON si compone con lo
  -- sconto della singola voce: il netto e' sempre prezzo × (1 − sconto voce).
  sconto_default_pct numeric not null default 0
    check (sconto_default_pct >= 0 and sconto_default_pct <= 100),
  attivo boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists listini_fornitore_company_idx on public.listini_fornitore(company_id);
create index if not exists listini_fornitore_supplier_idx on public.listini_fornitore(supplier_id);

create table if not exists public.listino_fornitore_voci (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  listino_id uuid not null references public.listini_fornitore(id) on delete cascade,
  codice text,
  descrizione text not null,
  unita text,
  prezzo numeric not null default 0 check (prezzo >= 0),
  sconto_pct numeric not null default 0 check (sconto_pct >= 0 and sconto_pct <= 100),
  note text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists listino_fornitore_voci_listino_idx on public.listino_fornitore_voci(listino_id);
create index if not exists listino_fornitore_voci_company_idx on public.listino_fornitore_voci(company_id);

alter table public.listini_fornitore enable row level security;
alter table public.listino_fornitore_voci enable row level security;

drop policy if exists lf_company on public.listini_fornitore;
create policy lf_company on public.listini_fornitore
  for all using (company_id = get_my_company_id())
  with check (company_id = get_my_company_id());
drop policy if exists lf_super_admin on public.listini_fornitore;
create policy lf_super_admin on public.listini_fornitore
  for all using (has_role((select auth.uid()), 'super_admin'::app_role));

drop policy if exists lfv_company on public.listino_fornitore_voci;
create policy lfv_company on public.listino_fornitore_voci
  for all using (company_id = get_my_company_id())
  with check (company_id = get_my_company_id());
drop policy if exists lfv_super_admin on public.listino_fornitore_voci;
create policy lfv_super_admin on public.listino_fornitore_voci
  for all using (has_role((select auth.uid()), 'super_admin'::app_role));
