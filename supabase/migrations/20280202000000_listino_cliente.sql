-- Listino cliente: lo sconto concordato con un cliente, scritto una volta.
--
-- "Al cliente Rossi faccio il 12%" viveva nella testa del titolare e ogni
-- preventivo ripartiva da zero. Ora sta sulla scheda del contatto CRM — i
-- preventivi agganciano marketing_contacts, quindi la chiave e' quella — e
-- il preventivatore lo PROPONE quando selezioni quel cliente: un clic e lo
-- sconto globale del preventivo si allinea. Proposto, mai applicato da solo.
--
-- Niente tabella di override per voce, per ora: una tabella senza interfaccia
-- che la usi e' una promessa su carta (lezione di listino_override_cliente,
-- nata per il portale manutenzione e rimasta vuota).

create table if not exists public.listini_cliente (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_id uuid not null references public.marketing_contacts(id) on delete cascade,
  sconto_globale_pct numeric not null default 0
    check (sconto_globale_pct >= 0 and sconto_globale_pct <= 100),
  attivo boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contact_id)
);

create index if not exists listini_cliente_company_idx on public.listini_cliente(company_id);

alter table public.listini_cliente enable row level security;

drop policy if exists lc_company on public.listini_cliente;
create policy lc_company on public.listini_cliente
  for all using (company_id = get_my_company_id())
  with check (company_id = get_my_company_id());
drop policy if exists lc_super_admin on public.listini_cliente;
create policy lc_super_admin on public.listini_cliente
  for all using (has_role((select auth.uid()), 'super_admin'::app_role));
