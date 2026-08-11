-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- ── Saldo unico ("pot"): un solo balance per azienda da cui scaleranno i servizi ──
create table if not exists public.company_credit_pool (
  company_id uuid primary key references public.companies(id) on delete cascade,
  balance_eur numeric not null default 0,
  total_recharged_eur numeric not null default 0,
  total_spent_eur numeric not null default 0,
  low_balance_blocked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.company_credit_pool enable row level security;
drop policy if exists ccp_read on public.company_credit_pool;
create policy ccp_read on public.company_credit_pool for select
  using (company_id = public.get_effective_company_id());

-- Registro movimenti (per il grafico "Come stai usando i crediti", per-servizio)
create table if not exists public.company_credit_pool_ledger (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  service text not null,           -- email | ai | whatsapp | render | topup | adjust
  direction text not null check (direction in ('in','out')),
  amount_eur numeric not null,
  balance_after numeric,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_ccp_ledger_company_time on public.company_credit_pool_ledger(company_id, created_at desc);
alter table public.company_credit_pool_ledger enable row level security;
drop policy if exists ccpl_read on public.company_credit_pool_ledger;
create policy ccpl_read on public.company_credit_pool_ledger for select
  using (company_id = public.get_effective_company_id());

-- ── RPC: ricarica il pot (SOLO server-side: webhook pagamento / admin) ──
create or replace function public.topup_pool(p_company_id uuid, p_amount numeric, p_type text default 'manual', p_metadata jsonb default '{}'::jsonb)
returns numeric
language plpgsql security definer set search_path=public as $$
declare v_new numeric;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'importo non valido'; end if;
  insert into public.company_credit_pool (company_id, balance_eur, total_recharged_eur)
  values (p_company_id, p_amount, p_amount)
  on conflict (company_id) do update set
    balance_eur = round((public.company_credit_pool.balance_eur + p_amount)::numeric, 4),
    total_recharged_eur = round((public.company_credit_pool.total_recharged_eur + p_amount)::numeric, 4),
    low_balance_blocked = false,
    updated_at = now()
  returning balance_eur into v_new;
  insert into public.company_credit_pool_ledger (company_id, service, direction, amount_eur, balance_after, description, metadata)
  values (p_company_id, coalesce(nullif(p_type,''),'topup'), 'in', p_amount, v_new, coalesce(p_metadata->>'description','Ricarica portafoglio'), p_metadata);
  return v_new;
end; $$;

-- ── RPC: scala dal pot (chiamata dai wrapper di servizio, mai dagli utenti) ──
create or replace function public.spend_from_pool(p_company_id uuid, p_service text, p_amount numeric, p_description text default null, p_metadata jsonb default '{}'::jsonb)
returns table(ok boolean, new_balance numeric)
language plpgsql security definer set search_path=public as $$
declare v_bal numeric; v_new numeric;
begin
  if p_amount is null or p_amount < 0 then raise exception 'importo non valido'; end if;
  if p_amount = 0 then
    select balance_eur into v_bal from public.company_credit_pool where company_id=p_company_id;
    return query select true, coalesce(v_bal,0::numeric); return;
  end if;
  select balance_eur into v_bal from public.company_credit_pool where company_id=p_company_id for update;
  if v_bal is null then
    insert into public.company_credit_pool(company_id) values (p_company_id) on conflict do nothing;
    return query select false, 0::numeric; return;
  end if;
  if v_bal < p_amount then
    return query select false, v_bal; return;
  end if;
  update public.company_credit_pool set
    balance_eur = round((balance_eur - p_amount)::numeric,4),
    total_spent_eur = round((total_spent_eur + p_amount)::numeric,4),
    updated_at = now()
  where company_id=p_company_id returning balance_eur into v_new;
  insert into public.company_credit_pool_ledger (company_id, service, direction, amount_eur, balance_after, description, metadata)
  values (p_company_id, p_service, 'out', p_amount, v_new, p_description, p_metadata);
  return query select true, v_new;
end; $$;

-- Blindatura: nessun utente normale può auto-accreditarsi o scalare a mano.
revoke execute on function public.topup_pool(uuid,numeric,text,jsonb) from public;
revoke execute on function public.spend_from_pool(uuid,text,numeric,text,jsonb) from public;
grant execute on function public.topup_pool(uuid,numeric,text,jsonb) to service_role;
grant execute on function public.spend_from_pool(uuid,text,numeric,text,jsonb) to service_role;
