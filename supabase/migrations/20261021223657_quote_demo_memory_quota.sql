-- Bounded demo storage. The per-owner lock makes the insert quota race safe.
-- Applicata il 21/10/2026; file ricostruito dal registro delle migrazioni.
create or replace function public.save_quote_demo_memory(p_owner uuid, p_scope text, p_expected bigint, p_snapshot jsonb)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare saved bigint;
begin
  if p_expected < 0 or p_expected is null then raise exception 'Invalid revision'; end if;
  if p_expected = 0 then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text, 0));
    if (select count(*) from public.quote_demo_memory where owner_id = p_owner) >= 256 then
      raise exception 'Demo memory scope quota reached';
    end if;
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
