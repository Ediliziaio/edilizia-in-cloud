-- Release order: apply this migration, then deploy platform-mcp and the UI.
-- Refresh the tools in Claude/ChatGPT: writes now require request_id; sends
-- also require confirmed=true and follow-ups require reviewed subject/body.
-- Strict OAuth resource audience is a separate Auth configuration step:
-- augment the existing access-token hook for OAuth client_id tokens, set aud
-- to the canonical MCP resource, then set MCP_OAUTH_AUDIENCE to that URL.
-- Do not replace an existing hook or enable strict mode before testing issuance.
-- Keep unfinished write receipts for reconciliation; never clear/retry them
-- automatically. confirmed is a client assertion, NOT a server-verified human signature.
-- MCP runs with service_role: verify the actual owner on every request.
create or replace function public.mcp_oauth_grants_touch()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

-- Until tools support row-level staff restrictions, full-company connectors
-- are restricted to active administrators (integration permission alone is insufficient).
create or replace function public.mcp_authorize_principal(p_kind text, p_id uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid; v_company uuid;
begin
  if p_kind = 'api_key' then
    select k.created_by, k.company_id into v_actor, v_company from public.api_keys k
    where k.id = p_id and k.is_active and (k.expires_at is null or k.expires_at > now());
  elsif p_kind = 'oauth' then
    select g.user_id, g.company_id into v_actor, v_company from public.mcp_oauth_grants g
    where g.id = p_id and g.revoked_at is null;
  else return false;
  end if;
  if v_actor is null or not exists (
    select 1 from auth.users u where u.id = v_actor and u.deleted_at is null
    and (u.banned_until is null or u.banned_until <= now())
  ) or not exists (
    select 1 from public.profiles p where p.id = v_actor
    and not coalesce(p.is_blocked, false) and p.deleted_at is null
  ) then return false; end if;
  if public.has_role(v_actor, 'super_admin'::public.app_role) then return true; end if;
  if v_company is null then return false; end if;
  return public.has_permission_for_company(v_actor, 'can_edit_settings_integrations', v_company)
    and (
      (public.has_role(v_actor, 'company_admin'::public.app_role)
        and public.get_user_company_id(v_actor) = v_company)
      or exists (select 1 from public.multi_company_access m where m.user_id = v_actor
        and m.company_id = v_company and m.status = 'active' and m.access_role::text = 'company_admin'
        and (m.expires_at is null or m.expires_at > now()))
    );
end $$;
revoke all on function public.mcp_authorize_principal(text, uuid) from public, anon, authenticated;
grant execute on function public.mcp_authorize_principal(text, uuid) to service_role;

-- One OAuth client token has no tenant selector. The consent page explicitly
-- selects one company; switching company revokes the previous application grant.
create or replace function public.mcp_oauth_upsert_grant(
  p_client_id text, p_company_id uuid, p_livello text default 'consulente',
  p_invii boolean default false, p_client_name text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_id uuid;
begin
  if v_actor is null then raise exception 'Non autenticato' using errcode = '42501'; end if;
  if p_client_id is null or btrim(p_client_id) = '' or p_company_id is null
    or p_livello not in ('consulente','operativo') or p_livello is null then
    raise exception 'Dati del consenso non validi';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mcp-consent:' || v_actor::text || ':' || btrim(p_client_id), 0));
  insert into public.mcp_oauth_grants (client_id, client_name, user_id, company_id, livello, invii, revoked_at)
    values (btrim(p_client_id), nullif(btrim(p_client_name), ''), v_actor, p_company_id, p_livello,
      coalesce(p_invii, false) and p_livello = 'operativo', null)
    on conflict (client_id, user_id, company_id) do update
      set livello = excluded.livello, invii = excluded.invii,
          client_name = coalesce(excluded.client_name, public.mcp_oauth_grants.client_name), revoked_at = null
    returning id into v_id;
  if not public.mcp_authorize_principal('oauth', v_id) then
    raise exception 'Solo un amministratore attivo può collegare un assistente AI all''azienda' using errcode = '42501';
  end if;
  update public.mcp_oauth_grants set revoked_at = now()
    where user_id = v_actor and client_id = btrim(p_client_id) and id <> v_id and revoked_at is null;
  return v_id;
end $$;
revoke all on function public.mcp_oauth_upsert_grant(text, uuid, text, boolean, text) from public, anon;
grant execute on function public.mcp_oauth_upsert_grant(text, uuid, text, boolean, text) to authenticated;

-- Atomic reservations count in-flight calls as well as finished calls, closing
-- the count-then-execute race. Durable request IDs make write retries safe.
create table public.mcp_tool_requests (
  kind text not null check (kind in ('api_key', 'oauth')),
  principal_id uuid not null,
  request_id uuid not null,
  fingerprint text not null check (length(fingerprint) = 64),
  sensitive boolean not null,
  receipt uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  response jsonb,
  primary key (kind, principal_id, request_id)
);
create index mcp_tool_requests_quota on public.mcp_tool_requests (kind, principal_id, created_at);
create unique index mcp_tool_requests_receipt on public.mcp_tool_requests (receipt);
alter table public.mcp_tool_requests enable row level security;
revoke all on public.mcp_tool_requests from public, anon, authenticated;
grant select, insert, update on public.mcp_tool_requests to service_role;
comment on table public.mcp_tool_requests is 'Private MCP receipts. An unfinished write must be reconciled, never automatically repeated. Cached results are accessible only to service_role.';

create or replace function public.mcp_reserve_tool_call(
  p_kind text, p_id uuid, p_request_id uuid, p_fingerprint text, p_sensitive boolean, p_scope text default null,
  p_company_id uuid default null, p_actor_id uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_min integer; v_day integer; v_sensitive integer; v_existing public.mcp_tool_requests%rowtype; v_receipt uuid;
  v_scopes text[]; v_level text; v_sends boolean; v_company uuid; v_actor uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_kind || ':' || p_id::text, 0));
  if not public.mcp_authorize_principal(p_kind, p_id) then
    return jsonb_build_object('ok', false, 'error', 'Collegamento revocato o amministratore non più autorizzato');
  end if;
  -- Recheck scopes under the same reservation lock: cached writes must not be
  -- accessible after the connector has been downgraded to read-only.
  if p_kind = 'api_key' then
    select scopes, company_id, created_by into v_scopes, v_company, v_actor from public.api_keys where id = p_id;
  else
    select livello, invii, company_id, user_id into v_level, v_sends, v_company, v_actor from public.mcp_oauth_grants where id = p_id;
    v_scopes := array['contacts:read','opportunities:read','tasks:read','orders:read','products:read',
      'quotes:read','warehouse:read','hr:read','safety:read','email:read','appointments:read','stats:read'];
    if v_level = 'operativo' then
      v_scopes := v_scopes || array['contacts:write','opportunities:write','tasks:write','orders:write',
        'products:write','warehouse:write','hr:write','appointments:write'];
      if v_sends then v_scopes := v_scopes || array['actions:sensitive','email:send']; end if;
    end if;
  end if;
  if v_company is distinct from p_company_id or v_actor is distinct from p_actor_id then
    return jsonb_build_object('ok', false, 'error', 'Ambito o titolare del collegamento cambiati. Ricollega l''assistente.');
  end if;
  if p_scope is not null and not coalesce('*' = any(v_scopes) or p_scope = any(v_scopes)
    or (right(p_scope, 5) = ':read' and replace(p_scope, ':read', ':write') = any(v_scopes)), false) then
    return jsonb_build_object('ok', false, 'error', 'Scope non più autorizzato per questo collegamento');
  end if;
  select * into v_existing from public.mcp_tool_requests
    where kind = p_kind and principal_id = p_id and request_id = p_request_id;
  if found then
    if v_existing.fingerprint <> p_fingerprint then
      return jsonb_build_object('ok', false, 'error', 'request_id già usato con parametri diversi');
    end if;
    if v_existing.completed_at is null then
      return jsonb_build_object('ok', false, 'error', 'Richiesta in corso o esito da verificare. Non ripetere con un nuovo request_id.');
    end if;
    return jsonb_build_object('ok', true, 'cached', true, 'response', v_existing.response);
  end if;
  if p_kind = 'api_key' then
    select rate_limit_per_minute, rate_limit_per_day, sensitive_actions_per_day into v_min, v_day, v_sensitive
      from public.api_keys where id = p_id;
  else
    select rate_limit_per_minute, rate_limit_per_day, sensitive_actions_per_day into v_min, v_day, v_sensitive
      from public.mcp_oauth_grants where id = p_id;
  end if;
  if (select count(*) from public.mcp_tool_requests where kind = p_kind and principal_id = p_id
        and created_at > now() - interval '1 minute') >= coalesce(v_min, 60)
    or (select count(*) from public.mcp_tool_requests where kind = p_kind and principal_id = p_id
        and created_at > now() - interval '24 hours') >= coalesce(v_day, 5000)
    or (p_sensitive and (select count(*) from public.mcp_tool_requests where kind = p_kind and principal_id = p_id
        and sensitive and created_at > now() - interval '24 hours') >= coalesce(v_sensitive, 100)) then
    return jsonb_build_object('ok', false, 'error', 'Limite di chiamate raggiunto. Riprova più tardi.');
  end if;
  insert into public.mcp_tool_requests (kind, principal_id, request_id, fingerprint, sensitive)
    values (p_kind, p_id, p_request_id, p_fingerprint, p_sensitive) returning receipt into v_receipt;
  return jsonb_build_object('ok', true, 'cached', false, 'receipt', v_receipt);
end $$;

create or replace function public.mcp_complete_tool_call(p_receipt uuid, p_response jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.mcp_tool_requests set response = p_response, completed_at = now()
    where receipt = p_receipt and completed_at is null;
  return found;
end $$;
revoke all on function public.mcp_reserve_tool_call(text, uuid, uuid, text, boolean, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.mcp_complete_tool_call(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.mcp_reserve_tool_call(text, uuid, uuid, text, boolean, text, uuid, uuid) to service_role;
grant execute on function public.mcp_complete_tool_call(uuid, jsonb) to service_role;
