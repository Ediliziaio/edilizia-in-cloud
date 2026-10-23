-- Lab only. No quotes, customers, invoices or binary storage are touched.
-- Applicata il 21/10/2026; file ricostruito dal registro delle migrazioni.
create table if not exists public.quote_demo_memory (
  owner_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null default 'd2000000-0000-4000-a000-000000000002'::uuid
    check (company_id = 'd2000000-0000-4000-a000-000000000002'::uuid),
  scope_key text not null check (length(scope_key) <= 120 and scope_key ~ '^(plan|real)(:flow:(classico|bagni:[a-z0-9_-]+)|:scenario:[a-z0-9_-]+)?$'),
  version bigint not null check (version > 0),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object' and octet_length(snapshot::text) <= 650000),
  updated_at timestamptz not null default now(),
  primary key (owner_id, scope_key)
);
alter table public.quote_demo_memory enable row level security;
-- Access only through the authenticated, tenant-checked Demo2 edge endpoint.
revoke all on public.quote_demo_memory from public, anon, authenticated;
grant select, insert, update on public.quote_demo_memory to service_role;
create or replace function public.save_quote_demo_memory(p_owner uuid, p_scope text, p_expected bigint, p_snapshot jsonb)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare saved bigint;
begin
  if p_expected < 0 or p_expected is null then raise exception 'Invalid revision'; end if;
  if p_expected = 0 then
    insert into public.quote_demo_memory(owner_id, scope_key, version, snapshot)
      values(p_owner, p_scope, 1, p_snapshot)
      on conflict (owner_id, scope_key) do nothing returning version into saved;
  else
    update public.quote_demo_memory set snapshot = p_snapshot, version = version + 1, updated_at = now()
      where owner_id = p_owner and scope_key = p_scope and version = p_expected returning version into saved;
  end if;
  return saved;
end;
$$;
revoke all on function public.save_quote_demo_memory(uuid, text, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.save_quote_demo_memory(uuid, text, bigint, jsonb) to service_role;
