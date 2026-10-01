-- Registro dei consensi OAuth per il connettore AI (server MCP platform-mcp).
--
-- Con OAuth un CLIENT (Claude, ChatGPT) accede per conto di un UTENTE del
-- gestionale. Il token lo emette Supabase (OAuth 2.1 server) e identifica utente
-- + client; qui memorizziamo, per ogni (client, utente, azienda), il LIVELLO
-- scelto sulla pagina di consenso. Il server MCP, ricevuto il token, cerca il
-- grant e costruisce lo stesso KeyCtx delle chiavi API: da lì tutto è identico
-- (strumenti, scope, log, limiti, tetto invii).
--
-- Gli scope NON si salvano qui: si ricavano da (livello, invii) nel server, così
-- un client non può iniettare scope arbitrari.

create table if not exists public.mcp_oauth_grants (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,              -- id del client OAuth (registrazione Claude/ChatGPT su Supabase)
  client_name text,                     -- nome mostrato in «gestisci connessioni»
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  livello text not null default 'consulente' check (livello in ('consulente','operativo')),
  invii boolean not null default false, -- invii reali / strumenti a costo AI (solo con «operativo»)
  rate_limit_per_minute integer not null default 60,
  rate_limit_per_day integer not null default 5000,
  sensitive_actions_per_day integer not null default 100,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, user_id, company_id)
);

comment on table public.mcp_oauth_grants is
  'Consensi OAuth del connettore AI: per (client, utente, azienda) il livello concesso. Il server MCP mappa livello→scope. L''ambito d''azienda è qui, non nel token.';

create index if not exists idx_mcp_oauth_grants_lookup
  on public.mcp_oauth_grants (client_id, user_id) where revoked_at is null;
create index if not exists idx_mcp_oauth_grants_company on public.mcp_oauth_grants (company_id);
create index if not exists idx_mcp_oauth_grants_user on public.mcp_oauth_grants (user_id);

-- updated_at
create or replace function public.mcp_oauth_grants_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists trg_mcp_oauth_grants_touch on public.mcp_oauth_grants;
create trigger trg_mcp_oauth_grants_touch before update on public.mcp_oauth_grants
  for each row execute function public.mcp_oauth_grants_touch();

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.mcp_oauth_grants enable row level security;

-- Il proprietario del grant vede e revoca i propri collegamenti.
drop policy if exists mcp_oauth_grants_owner_select on public.mcp_oauth_grants;
create policy mcp_oauth_grants_owner_select on public.mcp_oauth_grants
  for select to authenticated using (user_id = auth.uid());

drop policy if exists mcp_oauth_grants_owner_update on public.mcp_oauth_grants;
create policy mcp_oauth_grants_owner_update on public.mcp_oauth_grants
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Gli amministratori d'azienda vedono e revocano i collegamenti della loro azienda.
drop policy if exists mcp_oauth_grants_admin_select on public.mcp_oauth_grants;
create policy mcp_oauth_grants_admin_select on public.mcp_oauth_grants
  for select to authenticated using (public.has_permission_for_company(auth.uid(), 'can_edit_settings_integrations', company_id));

drop policy if exists mcp_oauth_grants_admin_update on public.mcp_oauth_grants;
create policy mcp_oauth_grants_admin_update on public.mcp_oauth_grants
  for update to authenticated using (public.has_permission_for_company(auth.uid(), 'can_edit_settings_integrations', company_id))
  with check (public.has_permission_for_company(auth.uid(), 'can_edit_settings_integrations', company_id));

-- Niente INSERT/DELETE diretti: si passa dalla RPC (che verifica l'azienda).
revoke all on public.mcp_oauth_grants from anon;
grant select, update on public.mcp_oauth_grants to authenticated;

-- ── RPC di consenso: crea/aggiorna il grant per l'utente corrente ───────────
-- Chiamata dalla pagina di consenso. SECURITY DEFINER ma verifica che l'utente
-- appartenga all'azienda: non ci si può dare accesso a un'azienda altrui.
create or replace function public.mcp_oauth_upsert_grant(
  p_client_id text,
  p_company_id uuid,
  p_livello text default 'consulente',
  p_invii boolean default false,
  p_client_name text default null
) returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); v_id uuid;
begin
  if v_uid is null then raise exception 'Non autenticato' using errcode = '42501'; end if;
  if p_client_id is null or btrim(p_client_id) = '' then raise exception 'client_id mancante'; end if;
  if p_livello not in ('consulente','operativo') then raise exception 'livello non valido'; end if;
  -- Stesso permesso delle chiavi API: gli strumenti girano col ruolo service_role
  -- e non controllano i permessi in-app del singolo, quindi autorizzare un
  -- assistente = dargli accesso a tutta l'azienda. Solo chi gestisce le
  -- integrazioni (admin) può concederlo, per non aggirare i ruoli interni.
  if not public.has_permission_for_company(v_uid, 'can_edit_settings_integrations', p_company_id) then
    raise exception 'Solo un amministratore dell''azienda può collegare un assistente AI' using errcode = '42501';
  end if;

  insert into public.mcp_oauth_grants (client_id, client_name, user_id, company_id, livello, invii, revoked_at)
  values (btrim(p_client_id), nullif(btrim(p_client_name), ''), v_uid, p_company_id, p_livello,
          p_invii and p_livello = 'operativo', null)
  on conflict (client_id, user_id, company_id) do update
    set livello = excluded.livello,
        invii = excluded.invii,
        client_name = coalesce(excluded.client_name, public.mcp_oauth_grants.client_name),
        revoked_at = null,
        updated_at = now()
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.mcp_oauth_upsert_grant(text, uuid, text, boolean, text) from public, anon;
grant execute on function public.mcp_oauth_upsert_grant(text, uuid, text, boolean, text) to authenticated;

-- ── api_usage_log: registra anche le chiamate OAuth ─────────────────────────
-- Finora ogni riga aveva api_key_id (chiave API). Con OAuth non c'è una chiave:
-- api_key_id diventa opzionale e si aggiunge grant_id. Log e rate-limit del
-- server MCP puntano alla colonna giusta a seconda di come ci si è autenticati.
alter table public.api_usage_log alter column api_key_id drop not null;
alter table public.api_usage_log add column if not exists grant_id uuid
  references public.mcp_oauth_grants(id) on delete set null;
create index if not exists idx_api_usage_log_grant_created
  on public.api_usage_log (grant_id, created_at) where grant_id is not null;
