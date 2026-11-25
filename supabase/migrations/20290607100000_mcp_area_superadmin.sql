-- Claude e ChatGPT nell'area del superadmin (25/11/2026).
--
-- Finora un consenso OAuth del connettore AI (mcp_oauth_grants) era legato a
-- UNA azienda: il superadmin poteva collegare Claude.ai o ChatGPT solo a
-- un'azienda, mai alla propria area (statistiche, aziende, piani, CRM della
-- piattaforma). ChatGPT accetta solo OAuth, quindi non c'era altra strada.
--
-- Qui nasce l'ambito «piattaforma»: un consenso senza azienda, che solo un
-- super admin può dare. Il server MCP (platform-mcp) ne ricava gli scope
-- platform:read / platform:write in più a quelli delle aziende, e per ogni
-- strumento di piattaforma ricontrolla il ruolo e la lista delle email ammesse.
--
-- Idempotente.

-- ── 1. Il consenso può non avere un'azienda ────────────────────────────────
alter table public.mcp_oauth_grants alter column company_id drop not null;
alter table public.mcp_oauth_grants add column if not exists ambito text not null default 'azienda';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'mcp_oauth_grants_ambito_check'
                 and conrelid = 'public.mcp_oauth_grants'::regclass) then
    alter table public.mcp_oauth_grants add constraint mcp_oauth_grants_ambito_check check (
      (ambito = 'azienda' and company_id is not null) or (ambito = 'piattaforma' and company_id is null)
    );
  end if;
end $$;

-- Un solo consenso di piattaforma per (client, utente): l'unico esistente non
-- vale con company_id NULL (due NULL non collidono).
create unique index if not exists mcp_oauth_grants_piattaforma_uq
  on public.mcp_oauth_grants (client_id, user_id) where ambito = 'piattaforma';

comment on column public.mcp_oauth_grants.ambito is
  'azienda = l''assistente lavora sui dati di company_id; piattaforma = area superadmin (company_id NULL), solo per super admin.';

-- ── 2. Revoca del proprio consenso di piattaforma ──────────────────────────
-- La regola di aggiornamento chiedeva di essere amministratore dell'azienda
-- risultante: con company_id NULL non passava, e il superadmin non poteva
-- revocare il proprio collegamento. Per l'ambito piattaforma basta essere
-- super admin; spostare una riga d'azienda in piattaforma resta impossibile
-- a chi non lo è.
drop policy if exists mcp_oauth_grants_owner_update on public.mcp_oauth_grants;
create policy mcp_oauth_grants_owner_update on public.mcp_oauth_grants
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (
      (ambito = 'piattaforma' and company_id is null and public.has_role(auth.uid(), 'super_admin'::public.app_role))
      or (ambito = 'azienda' and public.has_permission_for_company(auth.uid(), 'can_edit_settings_integrations', company_id))
    )
  );

-- ── 3. Consenso di piattaforma, dalla pagina /oauth/consent ────────────────
create or replace function public.mcp_oauth_upsert_grant_piattaforma(
  p_client_id text,
  p_livello text default 'consulente',
  p_invii boolean default false,
  p_client_name text default null
) returns uuid
language plpgsql security definer set search_path to '' as $$
declare v_actor uuid := auth.uid(); v_id uuid;
begin
  if v_actor is null then raise exception 'Non autenticato' using errcode = '42501'; end if;
  if p_client_id is null or btrim(p_client_id) = '' or p_livello is null
    or p_livello not in ('consulente', 'operativo') then
    raise exception 'Dati del consenso non validi';
  end if;
  if not public.has_role(v_actor, 'super_admin'::public.app_role) then
    raise exception 'Solo il super admin può collegare un assistente all''area superadmin' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mcp-consent:' || v_actor::text || ':' || btrim(p_client_id), 0));

  update public.mcp_oauth_grants
     set livello = p_livello,
         invii = coalesce(p_invii, false) and p_livello = 'operativo',
         client_name = coalesce(nullif(btrim(p_client_name), ''), client_name),
         revoked_at = null
   where client_id = btrim(p_client_id) and user_id = v_actor and ambito = 'piattaforma'
   returning id into v_id;
  if v_id is null then
    insert into public.mcp_oauth_grants (client_id, client_name, user_id, company_id, ambito, livello, invii,
                                         rate_limit_per_minute, rate_limit_per_day, sensitive_actions_per_day)
    values (btrim(p_client_id), nullif(btrim(p_client_name), ''), v_actor, null, 'piattaforma', p_livello,
            coalesce(p_invii, false) and p_livello = 'operativo', 60, 3000, 30)
    returning id into v_id;
  end if;

  if not public.mcp_authorize_principal('oauth', v_id) then
    raise exception 'Account non autorizzato a collegare l''area superadmin' using errcode = '42501';
  end if;
  -- Un client, un consenso: quello nuovo sostituisce i precedenti (anche d'azienda).
  update public.mcp_oauth_grants set revoked_at = now()
   where user_id = v_actor and client_id = btrim(p_client_id) and id <> v_id and revoked_at is null;

  insert into public.admin_audit_log (user_id, action, target_type, target_id, details)
  values (v_actor, 'mcp_collegamento_piattaforma', 'mcp_oauth_grant', v_id::text,
          jsonb_build_object('client', coalesce(nullif(btrim(p_client_name), ''), btrim(p_client_id)),
                             'livello', p_livello, 'invii', coalesce(p_invii, false) and p_livello = 'operativo'));
  return v_id;
end $$;

revoke all on function public.mcp_oauth_upsert_grant_piattaforma(text, text, boolean, text) from public, anon;
grant execute on function public.mcp_oauth_upsert_grant_piattaforma(text, text, boolean, text) to authenticated;

-- ── 4. Scope dei consensi di piattaforma nella prenotazione delle chiamate ──
-- Rispecchia scopesPerLivello di platform-mcp/lib.ts: la prenotazione ricalcola
-- gli scope sotto lo stesso lock, così un collegamento declassato non esegue più
-- scritture neppure dalla cache.
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
    v_scopes := array['contacts:read','opportunities:read','tasks:read','orders:read','products:read',
      'quotes:read','warehouse:read','hr:read','safety:read','email:read','appointments:read','stats:read'];
    if v_ambito = 'piattaforma' then v_scopes := v_scopes || array['platform:read']; end if;
    if v_level = 'operativo' then
      v_scopes := v_scopes || array['contacts:write','opportunities:write','tasks:write','orders:write',
        'products:write','warehouse:write','hr:write','appointments:write'];
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

-- ── 5. Collegamenti del superadmin, per la pagina Integrazioni ─────────────
-- I consensi OAuth dell'utente (piattaforma e aziende) con l'uso di oggi.
create or replace function public.admin_mcp_collegamenti()
returns table (
  id uuid, client_id text, client_name text, ambito text, company_id uuid, company_name text,
  livello text, invii boolean, created_at timestamptz, last_used_at timestamptz,
  chiamate_24h bigint, errori_24h bigint
)
language sql stable security definer set search_path to '' as $$
  select g.id, g.client_id, g.client_name, g.ambito, g.company_id, c.name,
         g.livello, g.invii, g.created_at, g.last_used_at,
         (select count(*) from public.api_usage_log l where l.grant_id = g.id and l.created_at > now() - interval '24 hours'),
         (select count(*) from public.api_usage_log l where l.grant_id = g.id and l.created_at > now() - interval '24 hours' and l.status_code >= 400)
    from public.mcp_oauth_grants g
    left join public.companies c on c.id = g.company_id
   where g.user_id = auth.uid() and g.revoked_at is null
     and public.has_role(auth.uid(), 'super_admin'::public.app_role)
   order by (g.ambito = 'piattaforma') desc, g.created_at desc;
$$;

revoke all on function public.admin_mcp_collegamenti() from public, anon;
grant execute on function public.admin_mcp_collegamenti() to authenticated;

-- Le ultime azioni degli assistenti (chiavi e consensi del superadmin).
create or replace function public.admin_mcp_ultime_azioni(p_limite integer default 30)
returns table (created_at timestamptz, strumento text, esito integer, durata_ms integer, collegamento text, azienda text)
language sql stable security definer set search_path to '' as $$
  select l.created_at, replace(l.endpoint, 'mcp:', ''), l.status_code, l.response_time_ms,
         coalesce(g.client_name, k.name, 'Assistente'), c.name
    from public.api_usage_log l
    left join public.mcp_oauth_grants g on g.id = l.grant_id
    left join public.api_keys k on k.id = l.api_key_id
    left join public.companies c on c.id = l.company_id
   where l.endpoint like 'mcp:%'
     and (g.user_id = auth.uid() or k.created_by = auth.uid())
     and public.has_role(auth.uid(), 'super_admin'::public.app_role)
   order by l.created_at desc
   limit least(greatest(coalesce(p_limite, 30), 1), 200);
$$;

revoke all on function public.admin_mcp_ultime_azioni(integer) from public, anon;
grant execute on function public.admin_mcp_ultime_azioni(integer) to authenticated;
