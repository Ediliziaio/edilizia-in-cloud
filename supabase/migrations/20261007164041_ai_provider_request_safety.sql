-- Apply BEFORE deploying guarded callers. No wallet updates and no historical
-- balance reconstruction. Service-only, invoker RPCs; callers authenticate and
-- authorize the user/company before entering the AI router.
create table public.ai_provider_requests (
  request_key text primary key check (request_key ~ '^[a-f0-9]{64}$'),
  company_id uuid not null,
  user_id uuid not null,
  task_key text not null,
  source_request_key text not null,
  input_hash text not null check (input_hash ~ '^[a-f0-9]{64}$'),
  owner_token uuid not null,
  provider_key text not null check (provider_key ~ '^[a-f0-9]{64}$'),
  state text not null default 'running' check (state in ('running', 'completed', 'uncertain')),
  result jsonb,
  attempts jsonb not null default '[]'::jsonb check (jsonb_typeof(attempts) = 'array'),
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  result_expires_at timestamptz
);
create index ai_provider_requests_company_created_idx on public.ai_provider_requests(company_id, created_at desc);
create index ai_provider_requests_expiry_idx on public.ai_provider_requests(result_expires_at) where result is not null;
alter table public.ai_provider_requests enable row level security;
revoke all on public.ai_provider_requests from public, anon, authenticated;
grant select, insert, update on public.ai_provider_requests to service_role;

create table public.ai_provider_cooldowns (
  provider_key text primary key check (provider_key ~ '^[a-f0-9]{64}$'),
  blocked_until timestamptz not null
);
alter table public.ai_provider_cooldowns enable row level security;
revoke all on public.ai_provider_cooldowns from public, anon, authenticated;
grant select, insert, update on public.ai_provider_cooldowns to service_role;

create function public.ai_provider_request_claim(
  p_key text, p_company uuid, p_user uuid, p_task text, p_input_hash text,
  p_owner uuid, p_provider_key text, p_legacy_key text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r public.ai_provider_requests; inserted_count integer;
begin
  -- Old ledger entries must not be replayed as new paid provider requests.
  if exists (select 1 from public.ai_call_ledger l where l.idempotency_key = p_legacy_key
    and l.company_id = p_company and l.user_id = p_user and l.task_key = p_task) then
    return jsonb_build_object('state', 'legacy_reconciliation_required');
  end if;
  -- Read existing results before cooldown: a replay does not call the provider.
  select * into r from public.ai_provider_requests where request_key = p_key;
  if not found then
    if exists (select 1 from public.ai_provider_cooldowns where provider_key = p_provider_key and blocked_until > now()) then
      return jsonb_build_object('state', 'provider_cooldown');
    end if;
    insert into public.ai_provider_requests(request_key, company_id, user_id, task_key, source_request_key, input_hash, owner_token, provider_key)
      values (p_key, p_company, p_user, p_task, p_legacy_key, p_input_hash, p_owner, p_provider_key)
      on conflict (request_key) do nothing;
    get diagnostics inserted_count = row_count;
    if inserted_count = 1 then return jsonb_build_object('state', 'claimed'); end if;
    select * into r from public.ai_provider_requests where request_key = p_key;
  end if;
  if r.company_id is distinct from p_company or r.user_id is distinct from p_user
    or r.task_key is distinct from p_task or r.input_hash is distinct from p_input_hash then
    return jsonb_build_object('state', 'request_conflict');
  end if;
  if r.state = 'completed' and r.result is not null and r.result_expires_at > now() then
    return jsonb_build_object('state', 'completed', 'result', r.result);
  end if;
  -- No expiry takeover: running may mean the provider billed before a crash.
  return jsonb_build_object('state', case when r.state = 'running' and r.updated_at > now() - interval '5 minutes'
    then 'in_progress' else 'reconciliation_required' end);
end;
$$;

create function public.ai_provider_request_checkpoint(p_key text, p_owner uuid, p_attempt jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if jsonb_typeof(p_attempt) is distinct from 'object' or octet_length(p_attempt::text) > 4096 then
    raise exception 'invalid attempt';
  end if;
  update public.ai_provider_requests set attempts = attempts || jsonb_build_array(p_attempt), updated_at = now()
    where request_key = p_key and owner_token = p_owner and state = 'running';
  return found;
end;
$$;

create function public.ai_provider_request_finish(
  p_key text, p_owner uuid, p_result jsonb, p_failure text, p_provider_blocked boolean
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare provider_id text;
begin
  if p_failure is null and (p_result is null or jsonb_typeof(p_result) <> 'object') then
    raise exception 'result required';
  end if;
  update public.ai_provider_requests set
    state = case when p_failure is null then 'completed' else 'uncertain' end,
    result = case when p_failure is null then p_result else null end,
    result_expires_at = case when p_failure is null then now() + interval '7 days' else null end,
    failure_code = left(p_failure, 80), updated_at = now()
    where request_key = p_key and owner_token = p_owner and state = 'running'
    returning provider_key into provider_id;
  if not found then return false; end if;
  if p_provider_blocked then
    insert into public.ai_provider_cooldowns(provider_key, blocked_until)
      values (provider_id, now() + interval '15 minutes')
      on conflict (provider_key) do update set blocked_until = greatest(public.ai_provider_cooldowns.blocked_until, excluded.blocked_until);
  end if;
  return true;
end;
$$;

revoke all on function public.ai_provider_request_claim(text, uuid, uuid, text, text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.ai_provider_request_checkpoint(text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.ai_provider_request_finish(text, uuid, jsonb, text, boolean) from public, anon, authenticated;
grant execute on function public.ai_provider_request_claim(text, uuid, uuid, text, text, uuid, text, text) to service_role;
grant execute on function public.ai_provider_request_checkpoint(text, uuid, jsonb) to service_role;
grant execute on function public.ai_provider_request_finish(text, uuid, jsonb, text, boolean) to service_role;

-- Drop cached response bodies after TTL without deleting the dedup tombstones.
-- Safe to schedule later; no cron/service activation in this migration.
create function public.ai_provider_request_redact_expired() returns bigint
language plpgsql security invoker set search_path = '' as $$
declare changed bigint;
begin
  update public.ai_provider_requests set result = null where result is not null and result_expires_at <= now();
  get diagnostics changed = row_count;
  return changed;
end;
$$;
revoke all on function public.ai_provider_request_redact_expired() from public, anon, authenticated;
grant execute on function public.ai_provider_request_redact_expired() to service_role;
