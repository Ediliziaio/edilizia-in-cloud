-- Portale clienti: lo accende solo EdiliziaInCloud, e spento vuol dire che
-- nessun cliente ha un accesso (24/09/2026, richiesta di Florin).
--
-- Cosa c'era prima:
--   * l'interruttore stava nelle Impostazioni dell'azienda e l'azienda poteva
--     accenderselo da sola;
--   * «Converti in cliente» creava un account ATTIVO e mandava al cliente
--     un'email con la password in chiaro, anche col portale spento (sistemato
--     nella edge function; qui la rete di sicurezza);
--   * «Sblocca utente» poteva riattivare anche un cliente;
--   * col portale spento i clienti già attivi restavano attivi (le due aziende
--     demo: 373 account).
--
-- Regole (tutte nel database, così valgono per qualunque strada, anche futura):
--   1. customer_portal_enabled lo cambia solo il super admin (o un processo
--      interno: service role, migrazioni, cron).
--   2. Un cliente (ruolo customer e nessun altro ruolo) di un'azienda col portale
--      spento è SEMPRE bloccato: is_blocked e portal_disabled a true. Il blocco
--      vero lo fa già utente_bloccato() su tutte le tabelle; qui si impedisce
--      che il cliente esca dal blocco.
--   3. Spegnendo il portale si bloccano subito tutti i clienti dell'azienda.
--      Riaccendendolo NON si sblocca nessuno: l'accesso si dà cliente per
--      cliente.
--
-- Perché non si tocca utente_bloccato(): è dentro has_role e
-- get_user_company_id, che molte policy chiamano riga per riga. Aggiungerci un
-- controllo sul ruolo e sull'azienda costerebbe su ogni riga letta da tutti.

-- ── 1. Solo il super admin decide ──────────────────────────────────────────────
create or replace function public.portale_clienti_decide_solo_super_admin()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  interno boolean := auth.uid() is null
    or coalesce(current_setting('request.jwt.claims', true)::json ->> 'role', '') = 'service_role';
begin
  if interno or public.has_role(auth.uid(), 'super_admin'::public.app_role) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.customer_portal_enabled := false;
    return new;
  end if;
  if new.customer_portal_enabled is distinct from old.customer_portal_enabled then
    raise exception 'Il portale clienti lo attiva solo EdiliziaInCloud: scrivi all''assistenza.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_portale_clienti_decide_solo_super_admin on public.companies;
create trigger trg_portale_clienti_decide_solo_super_admin
  before insert or update of customer_portal_enabled on public.companies
  for each row execute function public.portale_clienti_decide_solo_super_admin();

-- ── 2. Chi è «solo cliente» di un'azienda col portale spento ────────────────────
create or replace function public.cliente_senza_portale(p_user_id uuid, p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.user_roles r where r.user_id = p_user_id and r.role = 'customer')
     and not exists (select 1 from public.user_roles r where r.user_id = p_user_id and r.role <> 'customer')
     and not coalesce((select c.customer_portal_enabled from public.companies c where c.id = p_company_id), false);
$$;

-- Profilo: un cliente senza portale resta bloccato. Chi prova a sbloccarlo a
-- mano riceve il motivo; un processo interno viene corretto in silenzio.
create or replace function public.profilo_cliente_resta_bloccato()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  interno boolean := auth.uid() is null
    or coalesce(current_setting('request.jwt.claims', true)::json ->> 'role', '') = 'service_role';
begin
  if not public.cliente_senza_portale(new.id, new.company_id) then
    return new;
  end if;
  if tg_op = 'UPDATE' and not interno
     and coalesce(old.is_blocked, false) and not coalesce(new.is_blocked, false) then
    raise exception 'Il portale clienti di questa azienda non è attivo: il cliente non può avere un accesso.'
      using errcode = '42501';
  end if;
  new.is_blocked := true;
  new.portal_disabled := true;
  return new;
end;
$$;

drop trigger if exists trg_profilo_cliente_resta_bloccato on public.profiles;
create trigger trg_profilo_cliente_resta_bloccato
  before insert or update of is_blocked, portal_disabled, company_id on public.profiles
  for each row execute function public.profilo_cliente_resta_bloccato();

-- Ruolo: il profilo nasce prima del ruolo (create-customer, conversione,
-- import), quindi al momento del ruolo «customer» si blocca il profilo.
create or replace function public.ruolo_cliente_blocca_senza_portale()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.role = 'customer' then
    update public.profiles p
       set is_blocked = true, portal_disabled = true
     where p.id = new.user_id
       and public.cliente_senza_portale(p.id, p.company_id)
       and (not coalesce(p.is_blocked, false) or not coalesce(p.portal_disabled, false));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ruolo_cliente_blocca_senza_portale on public.user_roles;
create trigger trg_ruolo_cliente_blocca_senza_portale
  after insert or update of role on public.user_roles
  for each row execute function public.ruolo_cliente_blocca_senza_portale();

-- ── 3. Spegnendo il portale si bloccano tutti i clienti dell'azienda ────────────
create or replace function public.portale_spento_blocca_clienti()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(old.customer_portal_enabled, false) and not coalesce(new.customer_portal_enabled, false) then
    update public.profiles p
       set is_blocked = true, portal_disabled = true
     where p.company_id = new.id
       and public.cliente_senza_portale(p.id, p.company_id)
       and (not coalesce(p.is_blocked, false) or not coalesce(p.portal_disabled, false));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_portale_spento_blocca_clienti on public.companies;
create trigger trg_portale_spento_blocca_clienti
  after update of customer_portal_enabled on public.companies
  for each row execute function public.portale_spento_blocca_clienti();

-- Le funzioni di trigger non hanno bisogno di EXECUTE; quella d'aiuto non serve
-- a nessuno fuori dal database.
revoke all on function public.portale_clienti_decide_solo_super_admin() from public, anon, authenticated;
revoke all on function public.profilo_cliente_resta_bloccato() from public, anon, authenticated;
revoke all on function public.ruolo_cliente_blocca_senza_portale() from public, anon, authenticated;
revoke all on function public.portale_spento_blocca_clienti() from public, anon, authenticated;
revoke all on function public.cliente_senza_portale(uuid, uuid) from public, anon, authenticated;

-- ── Bonifica: i clienti oggi attivi in aziende col portale spento ──────────────
-- Al 24/09/2026 sono solo quelli delle due aziende demo (373). Nessuno di una
-- azienda cliente vera era attivo, e nessuno vi è mai entrato.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

update public.profiles p
   set is_blocked = true, portal_disabled = true
 where public.cliente_senza_portale(p.id, p.company_id)
   and (not coalesce(p.is_blocked, false) or not coalesce(p.portal_disabled, false));
