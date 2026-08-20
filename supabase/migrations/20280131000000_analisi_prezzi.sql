-- Analisi prezzi: la composizione professionale di una voce di listino.
--
-- In edilizia il prezzo di una lavorazione non si inventa: si COMPONE.
-- Manodopera + materiali + noli fanno il costo diretto; sopra ci vanno le
-- spese generali (tipicamente 15%) e l'utile d'impresa (tipicamente 10%).
-- E' lo standard professionale, obbligatorio sui lavori pubblici, ed e'
-- anche il pezzo che trasforma i prezzari regionali da archivio da
-- consultare a strumento con cui costruisci i TUOI prezzi.
--
-- Un'analisi appartiene a una voce di tariffe_aziendali (al piu' una per
-- voce). "Applica alla voce" scrive prezzo_vendita e
-- incidenza_manodopera_pct — colonna che esisteva gia' e che nessuno
-- calcolava.

create table if not exists public.analisi_prezzo (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  tariffa_id uuid references public.tariffe_aziendali(id) on delete cascade,
  spese_generali_pct numeric not null default 15
    check (spese_generali_pct >= 0 and spese_generali_pct <= 100),
  utile_pct numeric not null default 10
    check (utile_pct >= 0 and utile_pct <= 100),
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Una sola analisi per voce: e' LA scomposizione del suo prezzo.
create unique index if not exists analisi_prezzo_tariffa_unica
  on public.analisi_prezzo(tariffa_id) where tariffa_id is not null;
create index if not exists analisi_prezzo_company_idx
  on public.analisi_prezzo(company_id);

create table if not exists public.analisi_prezzo_componenti (
  id uuid primary key default gen_random_uuid(),
  -- company_id denormalizzato: le policy restano semplici e identiche a
  -- quelle delle tabelle sorelle, senza subquery sul padre.
  company_id uuid not null references public.companies(id) on delete cascade,
  analisi_id uuid not null references public.analisi_prezzo(id) on delete cascade,
  tipo text not null check (tipo in ('manodopera','materiale','nolo','altro')),
  descrizione text not null,
  unita text,
  quantita numeric not null default 1 check (quantita >= 0),
  prezzo_unitario numeric not null default 0 check (prezzo_unitario >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists analisi_prezzo_componenti_analisi_idx
  on public.analisi_prezzo_componenti(analisi_id);

alter table public.analisi_prezzo enable row level security;
alter table public.analisi_prezzo_componenti enable row level security;

-- Stesse policy di tariffe_aziendali: azienda propria + super_admin.
drop policy if exists ap_company on public.analisi_prezzo;
create policy ap_company on public.analisi_prezzo
  for all using (company_id = get_my_company_id())
  with check (company_id = get_my_company_id());
drop policy if exists ap_super_admin on public.analisi_prezzo;
create policy ap_super_admin on public.analisi_prezzo
  for all using (has_role((select auth.uid()), 'super_admin'::app_role));

drop policy if exists apc_company on public.analisi_prezzo_componenti;
create policy apc_company on public.analisi_prezzo_componenti
  for all using (company_id = get_my_company_id())
  with check (company_id = get_my_company_id());
drop policy if exists apc_super_admin on public.analisi_prezzo_componenti;
create policy apc_super_admin on public.analisi_prezzo_componenti
  for all using (has_role((select auth.uid()), 'super_admin'::app_role));
