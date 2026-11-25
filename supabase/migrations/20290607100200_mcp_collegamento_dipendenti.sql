-- L'assistente AI collegato da un dipendente (25/11/2026).
--
-- Finora solo un amministratore poteva collegare Claude o ChatGPT, e il
-- collegamento valeva per tutta l'azienda. Qui:
-- - l'azienda può permettere ai dipendenti di collegare il PROPRIO assistente
--   (companies.ai_connettore_dipendenti, spento di serie);
-- - il collegamento di un dipendente non manda mai invii reali;
-- - cosa vede e fa lo decide il server MCP per ogni strumento, dai permessi
--   dell'app dell'utente (platform-mcp/permessiStrumenti.ts), a ogni chiamata.
--
-- Idempotente. La colonna nuova ha un default costante: nessuna riscrittura.

set local lock_timeout = '3s';

alter table public.companies add column if not exists ai_connettore_dipendenti boolean not null default false;
comment on column public.companies.ai_connettore_dipendenti is
  'I dipendenti possono collegare il proprio Claude/ChatGPT; l''assistente fa solo ciò che il dipendente può fare nell''app.';

-- ── Amministratore dell'azienda (la regola che c'era, in un posto solo) ────
create or replace function public.mcp_e_admin_azienda(p_user uuid, p_company uuid)
returns boolean
language sql stable security definer set search_path to '' as $$
  select p_user is not null and p_company is not null and (
    public.has_role(p_user, 'super_admin'::public.app_role)
    or (
      public.has_permission_for_company(p_user, 'can_edit_settings_integrations', p_company)
      and (
        (public.has_role(p_user, 'company_admin'::public.app_role) and public.get_user_company_id(p_user) = p_company)
        or exists (select 1 from public.multi_company_access m where m.user_id = p_user
          and m.company_id = p_company and m.status = 'active' and m.access_role::text = 'company_admin'
          and (m.expires_at is null or m.expires_at > now()))
      )
    )
  );
$$;
revoke all on function public.mcp_e_admin_azienda(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mcp_e_admin_azienda(uuid, uuid) to service_role;

-- Dipendente che può collegare il proprio assistente.
create or replace function public.mcp_dipendente_collegabile(p_user uuid, p_company uuid)
returns boolean
language sql stable security definer set search_path to '' as $$
  select p_user is not null and p_company is not null
    and exists (select 1 from public.companies c where c.id = p_company and c.ai_connettore_dipendenti and c.deleted_at is null)
    and exists (select 1 from public.user_roles r where r.user_id = p_user
                and r.role::text in ('company_staff', 'salesperson', 'call_center', 'employee', 'subcontractor'))
    and not exists (select 1 from public.user_roles r where r.user_id = p_user and r.role::text in ('customer', 'worker'))
    and (
      public.get_user_company_id(p_user) = p_company
      or exists (select 1 from public.multi_company_access m where m.user_id = p_user
        and m.company_id = p_company and m.status = 'active'
        and (m.expires_at is null or m.expires_at > now()))
    );
$$;
revoke all on function public.mcp_dipendente_collegabile(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mcp_dipendente_collegabile(uuid, uuid) to service_role;

-- ── Chi è autorizzato, a ogni chiamata ─────────────────────────────────────
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
  if public.mcp_e_admin_azienda(v_actor, v_company) then return true; end if;
  -- Il dipendente, solo col proprio consenso OAuth (mai con una chiave API).
  return p_kind = 'oauth' and public.mcp_dipendente_collegabile(v_actor, v_company);
end $$;

-- ── Consenso d'azienda: il dipendente non ottiene gli invii reali ──────────
create or replace function public.mcp_oauth_upsert_grant(p_client_id text, p_company_id uuid, p_livello text default 'consulente', p_invii boolean default false, p_client_name text default null)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_actor uuid := auth.uid(); v_id uuid; v_invii boolean;
begin
  if v_actor is null then raise exception 'Non autenticato' using errcode = '42501'; end if;
  if p_client_id is null or btrim(p_client_id) = '' or p_company_id is null
    or p_livello not in ('consulente','operativo') or p_livello is null then
    raise exception 'Dati del consenso non validi';
  end if;
  v_invii := coalesce(p_invii, false) and p_livello = 'operativo' and public.mcp_e_admin_azienda(v_actor, p_company_id);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mcp-consent:' || v_actor::text || ':' || btrim(p_client_id), 0));
  insert into public.mcp_oauth_grants (client_id, client_name, user_id, company_id, livello, invii, revoked_at)
    values (btrim(p_client_id), nullif(btrim(p_client_name), ''), v_actor, p_company_id, p_livello, v_invii, null)
    on conflict (client_id, user_id, company_id) do update
      set livello = excluded.livello, invii = excluded.invii,
          client_name = coalesce(excluded.client_name, public.mcp_oauth_grants.client_name), revoked_at = null
    returning id into v_id;
  if not public.mcp_authorize_principal('oauth', v_id) then
    raise exception 'Non puoi collegare un assistente AI a questa azienda: chiedi all''amministratore di permetterlo ai dipendenti' using errcode = '42501';
  end if;
  update public.mcp_oauth_grants set revoked_at = now()
    where user_id = v_actor and client_id = btrim(p_client_id) and id <> v_id and revoked_at is null;
  return v_id;
end $function$;

-- ── Revoca: il proprio collegamento, o quelli dell'azienda per l'amministratore
create or replace function public.mcp_revoca_collegamento(p_id uuid)
returns boolean
language plpgsql security definer set search_path to '' as $$
declare v_uid uuid := auth.uid(); v_owner uuid; v_company uuid;
begin
  if v_uid is null then raise exception 'Non autenticato' using errcode = '42501'; end if;
  select user_id, company_id into v_owner, v_company from public.mcp_oauth_grants where id = p_id and revoked_at is null;
  if not found then return false; end if;
  if v_owner <> v_uid and not public.mcp_e_admin_azienda(v_uid, v_company) then
    raise exception 'Non puoi revocare questo collegamento' using errcode = '42501';
  end if;
  update public.mcp_oauth_grants set revoked_at = now() where id = p_id;
  return true;
end $$;
revoke all on function public.mcp_revoca_collegamento(uuid) from public, anon;
grant execute on function public.mcp_revoca_collegamento(uuid) to authenticated;

-- ── L'interruttore dell'azienda ─────────────────────────────────────────────
create or replace function public.azienda_ai_connettore_dipendenti(p_company_id uuid, p_attivo boolean)
returns boolean
language plpgsql security definer set search_path to '' as $$
declare v_uid uuid := auth.uid();
begin
  if not public.mcp_e_admin_azienda(v_uid, p_company_id) then
    raise exception 'Solo un amministratore dell''azienda' using errcode = '42501';
  end if;
  update public.companies set ai_connettore_dipendenti = coalesce(p_attivo, false) where id = p_company_id;
  -- Spento: i collegamenti dei dipendenti si chiudono subito.
  if not coalesce(p_attivo, false) then
    update public.mcp_oauth_grants g set revoked_at = now()
     where g.company_id = p_company_id and g.revoked_at is null
       and not public.mcp_e_admin_azienda(g.user_id, p_company_id);
  end if;
  return coalesce(p_attivo, false);
end $$;
revoke all on function public.azienda_ai_connettore_dipendenti(uuid, boolean) from public, anon;
grant execute on function public.azienda_ai_connettore_dipendenti(uuid, boolean) to authenticated;

-- ── Prenotazione: gli invii reali solo agli amministratori ─────────────────
create or replace function public.mcp_reserve_tool_call(p_kind text, p_id uuid, p_request_id uuid, p_fingerprint text, p_sensitive boolean, p_scope text default null, p_company_id uuid default null, p_actor_id uuid default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_min integer; v_day integer; v_sensitive integer; v_existing public.mcp_tool_requests%rowtype; v_receipt uuid;
  v_scopes text[]; v_level text; v_sends boolean; v_company uuid; v_actor uuid; v_ambito text;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_kind || ':' || p_id::text, 0));
  if not public.mcp_authorize_principal(p_kind, p_id) then
    return jsonb_build_object('ok', false, 'error', 'Collegamento revocato o amministratore non più autorizzato');
  end if;
  if p_kind = 'api_key' then
    select scopes, company_id, created_by into v_scopes, v_company, v_actor from public.api_keys where id = p_id;
  else
    select livello, invii, company_id, user_id, ambito into v_level, v_sends, v_company, v_actor, v_ambito
      from public.mcp_oauth_grants where id = p_id;
    v_sends := v_sends and (v_ambito = 'piattaforma' or public.mcp_e_admin_azienda(v_actor, v_company));
    v_scopes := array['contacts:read','opportunities:read','tasks:read','orders:read','products:read',
      'quotes:read','warehouse:read','hr:read','safety:read','email:read','appointments:read','stats:read'];
    if v_ambito = 'piattaforma' then v_scopes := v_scopes || array['platform:read']; end if;
    if v_level = 'operativo' then
      v_scopes := v_scopes || array['contacts:write','opportunities:write','tasks:write','orders:write',
        'products:write','quotes:write','warehouse:write','hr:write','appointments:write'];
      if v_ambito = 'piattaforma' then v_scopes := v_scopes || array['platform:write']; end if;
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
end $function$;
