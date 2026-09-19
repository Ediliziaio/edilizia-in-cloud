-- I segreti di platform_settings nel Vault — primo tempo (19/09/2026).
--
-- platform_settings teneva in chiaro chiavi API, token e segreti dei webhook
-- (WhatsApp Locale, Meta, email transazionale, openapi.it, render…). La RLS
-- li mostra solo ai super admin, ma un dump, un backup o una sessione super
-- admin se li porta via in chiaro. Da oggi il valore sta nel Vault, col nome
-- «platform_settings.<chiave>».
--
-- Il passaggio è in due tempi, perché le funzioni già pubblicate leggono la
-- tabella: se il valore sparisse subito, WhatsApp e le email si fermerebbero
-- finché non escono quelle nuove.
--   1. (questa migrazione) i valori si COPIANO nel Vault, qui dentro: non
--      passano da nessun file né log. Le letture passano da
--      impostazione_piattaforma(), che guarda prima il Vault e poi la tabella.
--      Un trigger copia nel Vault ogni segreto scritto nella tabella, da
--      qualunque parte arrivi (manage-super-admins, pagine admin, fe-operations).
--   2. (migrazione successiva, dopo aver pubblicato e provato le funzioni) la
--      tabella si svuota, e il trigger da lì in poi SPOSTA invece di copiare.
--
-- Quali chiavi sono segrete: per nome (…_key, …_secret, …_token, …_pass,
-- …_password, anche seguiti da un suffisso come …_api_key_resend), tranne le
-- chiavi pubbliche per costruzione (posthog_api_key, stripe_publishable_key).
-- Un elenco fisso sarebbe invecchiato: check-api-health e le pagine admin
-- conoscono già una trentina di chiavi segrete, e solo 12 hanno oggi un valore.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- Quali chiavi sono segrete ---------------------------------------------------
create or replace function public.e_segreto_piattaforma(p_chiave text)
returns boolean
language sql
immutable
set search_path to 'public'
as $$
  select coalesce(p_chiave, '') ~ '(_key|_secret|_token|_pass|_password)(_|$)'
     and p_chiave not in ('posthog_api_key', 'stripe_publishable_key');
$$;

revoke all on function public.e_segreto_piattaforma(text) from public, anon;
grant execute on function public.e_segreto_piattaforma(text) to authenticated, service_role;

-- Salvataggio nel Vault (crea o aggiorna) --------------------------------------
-- Solo per il trigger e per questa migrazione: nessun ruolo la esegue da fuori.
create or replace function public.salva_segreto_piattaforma(p_chiave text, p_valore text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_nome text := 'platform_settings.' || p_chiave;
  v_id uuid;
begin
  if not public.e_segreto_piattaforma(p_chiave) then
    raise exception 'La chiave % non è un segreto', p_chiave;
  end if;
  if coalesce(btrim(p_valore), '') = '' then
    return;
  end if;
  select s.id into v_id from vault.secrets s where s.name = v_nome;
  if v_id is null then
    perform vault.create_secret(p_valore, v_nome, 'Segreto di platform_settings: ' || p_chiave);
  else
    perform vault.update_secret(v_id, p_valore);
  end if;
end;
$$;

revoke all on function public.salva_segreto_piattaforma(text, text) from public, anon, authenticated, service_role;

-- Lettura per le edge function ----------------------------------------------------
-- Un'impostazione: per le chiavi segrete il Vault, e finché il secondo tempo
-- non la svuota la tabella; per le altre la tabella, come prima.
create or replace function public.impostazione_piattaforma(p_chiave text)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    when public.e_segreto_piattaforma(p_chiave) then coalesce(
      (select s.decrypted_secret
         from vault.decrypted_secrets s
        where s.name = 'platform_settings.' || p_chiave
        limit 1),
      (select nullif(p.value, '') from public.platform_settings p where p.key = p_chiave))
    else (select p.value from public.platform_settings p where p.key = p_chiave)
  end;
$$;

-- Più impostazioni insieme: solo quelle che hanno un valore.
create or replace function public.impostazioni_piattaforma(p_chiavi text[])
returns table (chiave text, valore text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select k, v
    from unnest(p_chiavi) as k
    cross join lateral (select public.impostazione_piattaforma(k) as v) x
   where v is not null;
$$;

-- Le chiamano solo le edge function, col service role.
revoke all on function public.impostazione_piattaforma(text) from public, anon, authenticated;
revoke all on function public.impostazioni_piattaforma(text[]) from public, anon, authenticated;
grant execute on function public.impostazione_piattaforma(text) to service_role;
grant execute on function public.impostazioni_piattaforma(text[]) to service_role;

-- Il trigger: ogni segreto scritto nella tabella finisce anche nel Vault ------------
create or replace function public.platform_settings_segreto_nel_vault()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if public.e_segreto_piattaforma(new.key) and coalesce(btrim(new.value), '') <> '' then
    perform public.salva_segreto_piattaforma(new.key, new.value);
    -- Primo tempo: il valore resta anche nella tabella, per le funzioni già
    -- pubblicate. Il secondo tempo lo toglie da qui.
  end if;
  return new;
end;
$$;

revoke all on function public.platform_settings_segreto_nel_vault() from public, anon, authenticated;

drop trigger if exists platform_settings_segreto_nel_vault on public.platform_settings;
create trigger platform_settings_segreto_nel_vault
  before insert or update of value on public.platform_settings
  for each row execute function public.platform_settings_segreto_nel_vault();

-- I valori di oggi nel Vault ----------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select p.key, p.value
      from public.platform_settings p
     where public.e_segreto_piattaforma(p.key)
       and coalesce(btrim(p.value), '') <> ''
  loop
    perform public.salva_segreto_piattaforma(r.key, r.value);
  end loop;
end $$;

-- L'avviso del battito legge la chiave email dal Vault ---------------------------------
create or replace function public.battito_invia_email(p_destinatari text[], p_oggetto text, p_html text)
returns bigint
language plpgsql
security definer
set search_path to 'public', 'net'
as $$
declare
  v_chiave text;
  v_da text;
  v_nome text;
  v_id bigint;
begin
  if p_destinatari is null or array_length(p_destinatari, 1) is null then
    return null;
  end if;

  v_chiave := public.impostazione_piattaforma('email_transactional_api_key');
  select value into v_da from public.platform_settings where key = 'email_transactional_from_address';
  select value into v_nome from public.platform_settings where key = 'email_transactional_from_name';

  if v_chiave is null or v_da is null then
    raise warning 'Battito: manca la configurazione email transazionale, avviso non inviato';
    return null;
  end if;

  select net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_chiave),
    body := jsonb_build_object(
      'from', coalesce(v_nome || ' <' || v_da || '>', v_da),
      'to', to_jsonb(p_destinatari),
      'subject', p_oggetto,
      'html', p_html),
    timeout_milliseconds := 10000
  ) into v_id;
  return v_id;
end;
$$;
