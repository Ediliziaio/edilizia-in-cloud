-- Richieste d'offerta ai fornitori (RDO).
--
-- Prima di ordinare, spesso il prezzo non si sa: si manda lo stesso elenco a
-- tre fornitori e si aspetta. Finora l'unico posto dove metterlo era un
-- ordine d'acquisto con i prezzi a zero — che pero' entra in "Impegnato"
-- come se non costasse niente, falsando il totale verso i fornitori.
--
-- Una richiesta d'offerta e' un'altra cosa da un ordine: ha piu' fornitori,
-- non ha prezzi finche' non rispondono, e finisce con un'aggiudicazione che
-- genera UN ordine al fornitore scelto. Tenerle separate lascia pulite
-- entrambe: gli impegni restano impegni, le trattative restano trattative.
--
-- Quattro tabelle:
--   supplier_rfqs           la richiesta (cosa serve, per quando, per quale commessa)
--   supplier_rfq_items      le righe di fabbisogno — descrizione e quantita', SENZA prezzo
--   supplier_rfq_suppliers  a chi e' stata chiesta e com'e' andata
--   supplier_rfq_quotes     il prezzo di UNA riga da UN fornitore (la griglia di confronto)

-- ── La richiesta ────────────────────────────────────────────────────────────
create table if not exists public.supplier_rfqs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  rfq_number text not null,
  titolo text not null,
  descrizione text,
  -- Commessa per cui serve il materiale: opzionale, si chiedono offerte anche
  -- per il magazzino.
  order_id uuid references public.orders(id) on delete set null,
  -- Entro quando serve la merce in cantiere: e' il vincolo vero, non la data
  -- in cui si vuole la risposta.
  data_fabbisogno date,
  -- Entro quando si accettano offerte.
  scadenza_offerte date,
  status text not null default 'bozza',
  -- Fornitore che ha vinto e ordine generato dall'aggiudicazione.
  supplier_id_aggiudicato uuid references public.suppliers(id) on delete set null,
  purchase_order_id uuid references public.purchase_orders(id) on delete set null,
  aggiudicata_at timestamptz,
  motivazione_scelta text,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_rfqs_status_check
    check (status in ('bozza', 'inviata', 'in_valutazione', 'aggiudicata', 'chiusa', 'annullata')),
  constraint supplier_rfqs_numero_univoco unique (company_id, rfq_number)
);

-- ── Cosa si chiede ──────────────────────────────────────────────────────────
create table if not exists public.supplier_rfq_items (
  id uuid primary key default gen_random_uuid(),
  rfq_id uuid not null references public.supplier_rfqs(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  descrizione text not null,
  quantita numeric(14,3) not null default 1,
  unita_misura text default 'pz',
  sku text,
  article_template_id uuid,
  note text,
  posizione integer not null default 0,
  created_at timestamptz not null default now()
);

-- ── A chi si chiede ─────────────────────────────────────────────────────────
create table if not exists public.supplier_rfq_suppliers (
  id uuid primary key default gen_random_uuid(),
  rfq_id uuid not null references public.supplier_rfqs(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  status text not null default 'da_inviare',
  inviata_at timestamptz,
  risposta_at timestamptz,
  -- Totale offerto: si tiene a parte perche' un fornitore puo' rispondere con
  -- un totale a corpo senza dettagliare riga per riga.
  totale_offerto numeric(14,2),
  giorni_consegna integer,
  validita_offerta date,
  condizioni_pagamento text,
  note text,
  -- Il preventivo del fornitore come l'ha mandato (PDF, foto del fax, email).
  allegato_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_rfq_suppliers_status_check
    check (status in ('da_inviare', 'inviata', 'risposta', 'rifiutata', 'scaduta')),
  constraint supplier_rfq_suppliers_univoco unique (rfq_id, supplier_id)
);

-- ── I prezzi, riga per riga e fornitore per fornitore ───────────────────────
create table if not exists public.supplier_rfq_quotes (
  id uuid primary key default gen_random_uuid(),
  rfq_supplier_id uuid not null references public.supplier_rfq_suppliers(id) on delete cascade,
  rfq_item_id uuid not null references public.supplier_rfq_items(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  prezzo_unitario numeric(14,4),
  sconto_percentuale numeric(5,2) not null default 0,
  aliquota_iva numeric(5,2) not null default 22,
  -- Il fornitore puo' rispondere "questo non ce l'ho": e' un'informazione,
  -- non un prezzo mancante.
  disponibile boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_rfq_quotes_univoco unique (rfq_supplier_id, rfq_item_id)
);

-- ── Indici ──────────────────────────────────────────────────────────────────
create index if not exists idx_rfqs_company_status on public.supplier_rfqs(company_id, status);
create index if not exists idx_rfqs_order on public.supplier_rfqs(order_id) where order_id is not null;
create index if not exists idx_rfq_items_rfq on public.supplier_rfq_items(rfq_id, posizione);
create index if not exists idx_rfq_suppliers_rfq on public.supplier_rfq_suppliers(rfq_id);
create index if not exists idx_rfq_suppliers_supplier on public.supplier_rfq_suppliers(supplier_id);
create index if not exists idx_rfq_quotes_supplier on public.supplier_rfq_quotes(rfq_supplier_id);
create index if not exists idx_rfq_quotes_item on public.supplier_rfq_quotes(rfq_item_id);

-- ── RLS: stessa forma di purchase_orders ────────────────────────────────────
alter table public.supplier_rfqs enable row level security;
alter table public.supplier_rfq_items enable row level security;
alter table public.supplier_rfq_suppliers enable row level security;
alter table public.supplier_rfq_quotes enable row level security;

do $$
declare
  t text;
  prefissi text[] := array['rfq', 'rfqi', 'rfqs', 'rfqq'];
  tabelle text[] := array['supplier_rfqs', 'supplier_rfq_items', 'supplier_rfq_suppliers', 'supplier_rfq_quotes'];
  i int;
begin
  for i in 1 .. array_length(tabelle, 1) loop
    t := tabelle[i];
    execute format(
      'drop policy if exists %I on public.%I', prefissi[i] || '_super_admin', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (has_role((select auth.uid()), ''super_admin''::app_role))',
      prefissi[i] || '_super_admin', t);

    execute format('drop policy if exists %I on public.%I', prefissi[i] || '_tenant_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (company_id = get_my_company_id())',
      prefissi[i] || '_tenant_select', t);

    execute format('drop policy if exists %I on public.%I', prefissi[i] || '_tenant_insert', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (company_id = get_my_company_id())',
      prefissi[i] || '_tenant_insert', t);

    execute format('drop policy if exists %I on public.%I', prefissi[i] || '_tenant_update', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (company_id = get_my_company_id())',
      prefissi[i] || '_tenant_update', t);

    execute format('drop policy if exists %I on public.%I', prefissi[i] || '_tenant_delete', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (company_id = get_my_company_id())',
      prefissi[i] || '_tenant_delete', t);
  end loop;
end $$;

-- ── Numerazione progressiva per azienda ─────────────────────────────────────
-- MAX del suffisso, non COUNT(*): cancellando una richiesta il conteggio
-- regredisce e il numero "nuovo" collide con uno gia' usato.
create or replace function public.generate_rfq_number(p_company_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_year text;
  v_next integer;
begin
  v_year := extract(year from current_date)::text;
  select coalesce(max(substring(rfq_number from '^RDO-' || v_year || '-(\d+)$')::integer), 0) + 1
    into v_next
  from supplier_rfqs
  where company_id = p_company_id
    and rfq_number ~ ('^RDO-' || v_year || '-\d+$');
  return 'RDO-' || v_year || '-' || lpad(v_next::text, 4, '0');
end $$;

create or replace function public.auto_assign_rfq_number()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.rfq_number is null or new.rfq_number = '' then
    new.rfq_number := public.generate_rfq_number(new.company_id);
  end if;
  return new;
end $$;

drop trigger if exists trg_auto_rfq_number on public.supplier_rfqs;
create trigger trg_auto_rfq_number
  before insert on public.supplier_rfqs
  for each row execute function public.auto_assign_rfq_number();

drop trigger if exists trg_rfq_updated_at on public.supplier_rfqs;
create trigger trg_rfq_updated_at
  before update on public.supplier_rfqs
  for each row execute function public.trigger_set_updated_at();

drop trigger if exists trg_rfq_suppliers_updated_at on public.supplier_rfq_suppliers;
create trigger trg_rfq_suppliers_updated_at
  before update on public.supplier_rfq_suppliers
  for each row execute function public.trigger_set_updated_at();

drop trigger if exists trg_rfq_quotes_updated_at on public.supplier_rfq_quotes;
create trigger trg_rfq_quotes_updated_at
  before update on public.supplier_rfq_quotes
  for each row execute function public.trigger_set_updated_at();

comment on table public.supplier_rfqs is
  'Richiesta d''offerta a piu'' fornitori. Non e'' un impegno: i prezzi non ci sono finche'' non rispondono, quindi non entra nel valore ordinato ai fornitori.';
comment on table public.supplier_rfq_quotes is
  'Prezzo di una riga offerto da un fornitore. E'' la griglia di confronto: righe in verticale, fornitori in orizzontale.';
