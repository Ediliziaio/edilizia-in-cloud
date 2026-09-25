-- Numeri WhatsApp: token e PIN fuori dal browser, modifiche solo a chi amministra (25/09/2026).
--
-- Verificato il 24/09 su public.ai_whatsapp_numbers, e riprovato il 25/09 con
-- utenti veri di Green Energy in una transazione annullata:
-- · la policy wa_company_isolation era FOR ALL con il solo company_id: un
--   operatore leggeva, modificava, toglieva, cancellava e creava i numeri;
-- · cloud_api_pin teneva in chiaro il PIN a 6 cifre della verifica in due
--   passaggi del numero su Meta (una riga, Green Energy) e, come
--   access_token_encrypted (cifrato «aes:» su tutte e tre le righe), era
--   leggibile da authenticated;
-- · il dettaglio del numero nel browser faceva select("*"): PIN e token
--   arrivavano al browser;
-- · un amministratore poteva riscrivere phone_number_id, waba_id, token e PIN.
--
-- Dopo:
-- 1. puo_gestire_whatsapp(azienda): super admin, amministratore dell'azienda del
--    profilo, amministratore con accesso multi-azienda attivo e non scaduto. È la
--    regola di assertMetaCompanyAdminAccess (whatsapp-connect, whatsapp-profilo) e
--    del ramo amministratori di has_permission_for_company.
-- 2. Il PIN sta nel Vault, «ai_whatsapp_numbers.cloud_api_pin.<id>»: un trigger lo
--    sposta a ogni scrittura (whatsapp-connect resta com'è) e nella colonna resta
--    NULL. Lo legge solo il service role, con pin_numero_whatsapp(id). Chi cancella
--    la riga cancella anche il PIN.
-- 3. authenticated legge tutte le colonne tranne access_token_encrypted e
--    cloud_api_pin (GRANT per colonna): un select("*") dal browser fallisce, e una
--    colonna nuova resta invisibile finché non la si aggiunge qui e in
--    WA_NUMBER_COLUMNS (src/hooks/whatsapp/useWhatsAppNumbers.ts).
--    Scrive solo le colonne che l'app cambia: nome, messaggi, orari, impostazioni
--    operative, budget, agente, stato e cancellazione. Numero, identificativi Meta,
--    token, PIN, azienda e webhook li scrive solo il server. Niente INSERT dal
--    browser: i numeri li crea whatsapp-connect, dopo le verifiche su Meta e
--    sull'add-on.
-- 4. Policy: lettura a chi lavora nell'azienda (Conversazioni, composer, broadcast,
--    modelli, automazioni), mai al cliente esterno; modifica e cancellazione a chi
--    amministra. Restano wa_numbers_super_admin_read e la RESTRICTIVE
--    blocco_utente_bloccato.
-- Il service role non cambia: tutti i privilegi, e le policy non lo riguardano.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- 1. Chi amministra l'azienda -----------------------------------------------------------
create or replace function public.puo_gestire_whatsapp(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce(
    p_company_id is not null
    and (select auth.uid()) is not null
    and not public.utente_bloccato()
    and (
      public.has_role((select auth.uid()), 'super_admin'::public.app_role)
      or (
        public.has_role((select auth.uid()), 'company_admin'::public.app_role)
        and exists (
          select 1 from public.profiles p
           where p.id = (select auth.uid()) and p.company_id = p_company_id
        )
      )
      or exists (
        select 1 from public.multi_company_access m
         where m.user_id = (select auth.uid())
           and m.company_id = p_company_id
           and m.status = 'active'
           and (m.expires_at is null or m.expires_at > now())
           and m.access_role = 'company_admin'
      )
    ),
    false
  );
$$;

revoke all on function public.puo_gestire_whatsapp(uuid) from public, anon;
grant execute on function public.puo_gestire_whatsapp(uuid) to authenticated, service_role;

-- 2. Il PIN nel Vault ---------------------------------------------------------------------
create or replace function public.whatsapp_pin_nel_vault()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_nome text := 'ai_whatsapp_numbers.cloud_api_pin.' || new.id;
  v_id uuid;
begin
  if coalesce(btrim(new.cloud_api_pin), '') <> '' then
    select s.id into v_id from vault.secrets s where s.name = v_nome;
    if v_id is null then
      perform vault.create_secret(btrim(new.cloud_api_pin), v_nome,
        'PIN della verifica in due passaggi del numero WhatsApp ' || new.id);
    else
      perform vault.update_secret(v_id, btrim(new.cloud_api_pin));
    end if;
  end if;
  new.cloud_api_pin := null;
  return new;
end;
$$;

create or replace function public.whatsapp_pin_via_dal_vault()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  delete from vault.secrets where name = 'ai_whatsapp_numbers.cloud_api_pin.' || old.id;
  return old;
end;
$$;

-- Funzioni di trigger: nessuno le chiama, e allo scatto il privilegio non si controlla.
revoke all on function public.whatsapp_pin_nel_vault() from public, anon, authenticated;
revoke all on function public.whatsapp_pin_via_dal_vault() from public, anon, authenticated;

drop trigger if exists whatsapp_pin_nel_vault on public.ai_whatsapp_numbers;
create trigger whatsapp_pin_nel_vault
  before insert or update of cloud_api_pin on public.ai_whatsapp_numbers
  for each row execute function public.whatsapp_pin_nel_vault();

drop trigger if exists whatsapp_pin_via_dal_vault on public.ai_whatsapp_numbers;
create trigger whatsapp_pin_via_dal_vault
  after delete on public.ai_whatsapp_numbers
  for each row execute function public.whatsapp_pin_via_dal_vault();

-- Il PIN lo legge solo il server.
create or replace function public.pin_numero_whatsapp(p_numero_id uuid)
returns text
language sql
stable
security definer
set search_path to ''
as $$
  select s.decrypted_secret
    from vault.decrypted_secrets s
   where s.name = 'ai_whatsapp_numbers.cloud_api_pin.' || p_numero_id
   limit 1;
$$;

revoke all on function public.pin_numero_whatsapp(uuid) from public, anon, authenticated;
grant execute on function public.pin_numero_whatsapp(uuid) to service_role;

-- I PIN di oggi: il trigger li porta nel Vault. Si controlla che il Vault abbia lo
-- stesso valore e che nella tabella non resti niente; i messaggi non li stampano.
do $$
declare
  v_pin jsonb;
  v_attesi int;
  v_giusti int;
begin
  select coalesce(jsonb_object_agg(id::text, btrim(cloud_api_pin)), '{}'::jsonb)
    into v_pin
    from public.ai_whatsapp_numbers
   where coalesce(btrim(cloud_api_pin), '') <> '';
  select count(*) into v_attesi from jsonb_object_keys(v_pin);

  update public.ai_whatsapp_numbers
     set cloud_api_pin = cloud_api_pin
   where cloud_api_pin is not null;

  select count(*) into v_giusti
    from jsonb_each_text(v_pin) e
    join vault.decrypted_secrets s on s.name = 'ai_whatsapp_numbers.cloud_api_pin.' || e.key
   where s.decrypted_secret = e.value;

  if v_giusti <> v_attesi then
    raise exception 'Il Vault ha % PIN WhatsApp giusti su %', v_giusti, v_attesi;
  end if;
  if exists (select 1 from public.ai_whatsapp_numbers where cloud_api_pin is not null) then
    raise exception 'Resta un PIN WhatsApp in chiaro in ai_whatsapp_numbers';
  end if;
end;
$$;

comment on column public.ai_whatsapp_numbers.cloud_api_pin is
  'Sempre NULL: il PIN della verifica in due passaggi sta nel Vault (ai_whatsapp_numbers.cloud_api_pin.<id>), lo sposta il trigger whatsapp_pin_nel_vault e lo legge pin_numero_whatsapp(id), solo il service role.';
comment on column public.ai_whatsapp_numbers.access_token_encrypted is
  'Token Meta cifrato («aes:», chiave nelle edge function). Non leggibile da authenticated: lo usano solo le edge function col service role.';

-- 3. Cosa legge e cosa scrive il browser ------------------------------------------------------
revoke all on table public.ai_whatsapp_numbers from public, anon, authenticated;

grant select (
  id, company_id, numero, nome_account, waba_id, phone_number_id, stato, creato_il,
  provider, webhook_verified, agent_id, messaggio_benvenuto, messaggio_fuori_orario,
  orario_attivo, updated_at, purpose, display_name, daily_budget_eur,
  current_day_spend_eur, day_counter_reset_at, deleted_at, operational_settings,
  quality_rating, messaging_limit_tier
) on public.ai_whatsapp_numbers to authenticated;

grant update (
  display_name, messaggio_benvenuto, messaggio_fuori_orario, orario_attivo,
  operational_settings, daily_budget_eur, agent_id, stato, deleted_at
) on public.ai_whatsapp_numbers to authenticated;

grant delete on public.ai_whatsapp_numbers to authenticated;

-- 4. Chi legge, chi modifica, chi cancella ----------------------------------------------------
drop policy if exists wa_company_isolation on public.ai_whatsapp_numbers;

drop policy if exists wa_numeri_lettura_azienda on public.ai_whatsapp_numbers;
create policy wa_numeri_lettura_azienda on public.ai_whatsapp_numbers
  as permissive for select to authenticated
  using (
    company_id = (select public.get_my_company_id())
    and not (select public.utente_e_cliente_esterno())
  );

drop policy if exists wa_numeri_modifica_amministratori on public.ai_whatsapp_numbers;
create policy wa_numeri_modifica_amministratori on public.ai_whatsapp_numbers
  as permissive for update to authenticated
  using (public.puo_gestire_whatsapp(company_id))
  with check (public.puo_gestire_whatsapp(company_id));

drop policy if exists wa_numeri_cancellazione_amministratori on public.ai_whatsapp_numbers;
create policy wa_numeri_cancellazione_amministratori on public.ai_whatsapp_numbers
  as permissive for delete to authenticated
  using (public.puo_gestire_whatsapp(company_id));

-- 5. Se qualcosa non torna, la migrazione si ferma ---------------------------------------------
do $$
begin
  if has_column_privilege('authenticated', 'public.ai_whatsapp_numbers', 'cloud_api_pin', 'select')
     or has_column_privilege('authenticated', 'public.ai_whatsapp_numbers', 'access_token_encrypted', 'select')
     or has_table_privilege('authenticated', 'public.ai_whatsapp_numbers', 'insert')
     or has_table_privilege('anon', 'public.ai_whatsapp_numbers', 'select') then
    raise exception 'ai_whatsapp_numbers: il browser legge ancora token o PIN, o crea numeri';
  end if;
  if not (has_table_privilege('service_role', 'public.ai_whatsapp_numbers', 'select')
      and has_table_privilege('service_role', 'public.ai_whatsapp_numbers', 'insert')
      and has_table_privilege('service_role', 'public.ai_whatsapp_numbers', 'update')
      and has_table_privilege('service_role', 'public.ai_whatsapp_numbers', 'delete')) then
    raise exception 'ai_whatsapp_numbers: il service role ha perso dei privilegi';
  end if;
end;
$$;
