-- Additive beta: no deletion, reassignment or reactivation of legacy bank data.
set local lock_timeout = '3s';
set local statement_timeout = '60s';
alter table public.bank_connections
  add column if not exists provider_connection_id text,
  add column if not exists saltedge_customer_id text,
  add column if not exists next_refresh_possible_at timestamptz;
create unique index if not exists bank_saltedge_remote_connection
  on public.bank_connections(provider_connection_id) where provider_slug = 'saltedge';

create table if not exists public.bank_saltedge_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  customer_id text not null unique check (customer_id ~ '^[0-9]{1,30}$'),
  created_at timestamptz not null default now()
);
create table if not exists public.bank_saltedge_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id text not null,
  state_hash text not null unique,
  connection_id text,
  expires_at timestamptz not null default now() + interval '15 minutes',
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists bank_saltedge_sessions_company on public.bank_saltedge_sessions(company_id);
create table if not exists public.bank_saltedge_locks (
  key text primary key,
  token uuid not null default gen_random_uuid(),
  expires_at timestamptz not null default now() + interval '5 minutes'
);
alter table public.bank_saltedge_customers enable row level security;
alter table public.bank_saltedge_sessions enable row level security;
alter table public.bank_saltedge_locks enable row level security;
revoke all on public.bank_saltedge_customers, public.bank_saltedge_sessions, public.bank_saltedge_locks from public, anon, authenticated;
grant all on public.bank_saltedge_customers, public.bank_saltedge_sessions, public.bank_saltedge_locks to service_role;

create or replace function public.claim_saltedge_lock(p_key text) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare result uuid;
begin
  if length(p_key) not between 1 and 256 then raise exception 'Invalid lock'; end if;
  insert into public.bank_saltedge_locks as l(key) values (p_key)
  on conflict (key) do update set token = gen_random_uuid(), expires_at = now() + interval '5 minutes'
    where l.expires_at < now()
  returning token into result;
  return result;
end;
$$;
revoke all on function public.claim_saltedge_lock(text) from public, anon, authenticated;
grant execute on function public.claim_saltedge_lock(text) to service_role;

create or replace function public.saltedge_account_conflict(p_company uuid, p_connection uuid, p_iban text) returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists(select 1 from public.bank_accounts
    where company_id=p_company and connection_id<>p_connection and is_active
      and upper(regexp_replace(iban, '\s', '', 'g'))=upper(regexp_replace(p_iban, '\s', '', 'g')));
$$;
revoke all on function public.saltedge_account_conflict(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.saltedge_account_conflict(uuid,uuid,text) to service_role;
