-- Un modo di creare una commessa: l'invariante nello schema, non solo nelle RPC.
--
-- Cosa si poteva fare prima: `20290313220000_commessa_cliente_spegnibile`
-- tiene l'invariante («non si può restare senza alcun modo di creare una
-- commessa») solo dentro le due RPC. Sulla tabella non c'è alcun vincolo:
-- chiunque scriva la riga per un'altra strada può lasciare un'azienda con
-- commessa_cliente_attiva = false e modelli_attivi = '{}'. In quello stato
-- `OrdersList` mostra «niente da creare» e `companyRoutes` rimanda all'elenco:
-- l'azienda non può più aprire nessuna commessa, e nessun avviso lo dice.
--
-- Provato il 12/11/2026 su un'azienda demo, in transazione annullata:
--   · le due RPC, nei due ordini, rifiutano lo stato morto (23514), anche
--     quando la riga non esiste ancora;
--   · service_role, che sulla tabella ha tutti i privilegi, ci arriva con un
--     `update` in un colpo e nessuno lo ferma -> modelli={} cliente=f.
--     È la strada di ogni edge function, di `admin_ripristina_backup` e di
--     qualunque RPC futura; `service_role` non può nemmeno chiamare le due RPC
--     (auth.uid() nullo -> 42501), quindi chi scrive dalla edge DEVE passare
--     dalla tabella.
--   · `authenticated` non ha UPDATE sulla tabella (42501): dal browser il buco
--     non si raggiunge. È un buco per il codice del server, non per l'utente.
--
-- Chi deve continuare a funzionare (provato prima/dopo):
--   · amministratore dell'azienda: spegne la commessa cliente con almeno un
--     tipo di generale acceso, e spegne i generali con la cliente accesa;
--   · super admin;
--   · le funzioni del server (DEFINER) e service_role, per ogni scrittura che
--     NON è lo stato morto;
--   · la lettura: chi ha can_view_orders o can_view_settings_orders vede la
--     riga, gli altri no.
--
-- Il vincolo è il fondo; il messaggio leggibile resta quello delle RPC, che
-- ora controllano PRIMA di scrivere, con la riga bloccata (`for update`): così
-- l'utente non vede mai il testo del vincolo e due chiamate in parallelo si
-- mettono in fila sulla stessa riga.
--
-- Idempotente. Le righe già in tabella sono tutte valide.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ── 1. L'invariante nello schema ────────────────────────────────────────────
-- array_length('{}', 1) è NULL, non 0: senza il coalesce il vincolo passerebbe
-- proprio nel caso che deve fermare.
alter table public.company_commesse_generali_settings
  drop constraint if exists company_commesse_generali_un_modo_di_creare;
alter table public.company_commesse_generali_settings
  add constraint company_commesse_generali_un_modo_di_creare
  check (commessa_cliente_attiva or coalesce(array_length(modelli_attivi, 1), 0) > 0) not valid;
alter table public.company_commesse_generali_settings
  validate constraint company_commesse_generali_un_modo_di_creare;

comment on constraint company_commesse_generali_un_modo_di_creare
  on public.company_commesse_generali_settings is
  'Un''azienda non può restare senza alcun modo di creare una commessa: spenta la commessa cliente, serve almeno un tipo di commessa generale.';

-- ── 2. Le RPC controllano prima di scrivere ─────────────────────────────────
-- Prima controllavano dopo l'insert: col vincolo in piedi l'errore arriverebbe
-- dal vincolo, con il suo testo tecnico. Ora il controllo precede la scrittura
-- e blocca la riga, quindi il messaggio è sempre quello scritto qui.
create or replace function public.commesse_generali_commessa_cliente_salva(
  p_company_id uuid,
  p_attiva boolean
) returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_modelli text[];
begin
  if auth.uid() is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_settings_orders', p_company_id) then
    raise exception 'Non hai il permesso di cambiare queste impostazioni.' using errcode = '42501';
  end if;
  if p_attiva is null then
    raise exception 'Scelta non valida.' using errcode = '22023';
  end if;

  -- Riga bloccata: chi arriva dopo aspetta e legge il valore già scritto.
  -- Riga assente = nessun modello acceso.
  select modelli_attivi into v_modelli
    from public.company_commesse_generali_settings
   where company_id = p_company_id
     for update;

  if not p_attiva and coalesce(array_length(v_modelli, 1), 0) = 0 then
    raise exception 'Prima accendi un tipo di commessa generale: senza la commessa cliente non resterebbe nessun modo di creare una commessa.'
      using errcode = '23514';
  end if;

  -- `modelli_attivi` deve portare il valore di adesso, non '{}': su
  -- INSERT ... ON CONFLICT il vincolo CHECK è controllato sulla riga proposta
  -- PRIMA che Postgres scopra il conflitto, quindi un '{}' di comodo farebbe
  -- fallire anche lo spegnimento legittimo (provato: 23514 su un caso che
  -- deve passare).
  insert into public.company_commesse_generali_settings
    (company_id, modelli_attivi, commessa_cliente_attiva, updated_by, updated_at)
  values (p_company_id, coalesce(v_modelli, '{}'), p_attiva, auth.uid(), now())
  on conflict (company_id) do update
    set commessa_cliente_attiva = excluded.commessa_cliente_attiva,
        updated_by = excluded.updated_by,
        updated_at = now();

  return p_attiva;
end;
$$;

revoke all on function public.commesse_generali_commessa_cliente_salva(uuid, boolean) from public;
revoke all on function public.commesse_generali_commessa_cliente_salva(uuid, boolean) from anon;
grant execute on function public.commesse_generali_commessa_cliente_salva(uuid, boolean) to authenticated;

create or replace function public.commesse_generali_impostazioni_salva(p_company_id uuid, p_modelli text[])
 returns text[]
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_ammessi constant text[] := array['appalto', 'sviluppo', 'compravendita'];
  v_modelli text[];
  v_cliente boolean;
begin
  if auth.uid() is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_settings_orders', p_company_id) then
    raise exception 'Non hai il permesso di cambiare queste impostazioni.' using errcode = '42501';
  end if;
  if exists (select 1 from unnest(coalesce(p_modelli, '{}')) m where m <> all (v_ammessi)) then
    raise exception 'Scelta non valida.' using errcode = '22023';
  end if;
  select coalesce(array_agg(m order by array_position(v_ammessi, m)), '{}')
    into v_modelli
    from (select distinct m from unnest(coalesce(p_modelli, '{}')) m) s;

  -- Riga assente = commessa cliente accesa (è il valore di default).
  select commessa_cliente_attiva into v_cliente
    from public.company_commesse_generali_settings
   where company_id = p_company_id
     for update;

  if coalesce(array_length(v_modelli, 1), 0) = 0 and not coalesce(v_cliente, true) then
    raise exception 'Prima riaccendi la commessa cliente: spegnendo anche l''ultimo tipo di commessa generale non resterebbe nessun modo di creare una commessa.'
      using errcode = '23514';
  end if;

  -- Come sopra: la riga proposta deve essere valida da sola.
  insert into public.company_commesse_generali_settings
    (company_id, modelli_attivi, commessa_cliente_attiva, updated_by, updated_at)
  values (p_company_id, v_modelli, coalesce(v_cliente, true), auth.uid(), now())
  on conflict (company_id) do update
    set modelli_attivi = excluded.modelli_attivi, updated_by = excluded.updated_by, updated_at = now();

  return v_modelli;
end;
$function$;

revoke all on function public.commesse_generali_impostazioni_salva(uuid, text[]) from public;
revoke all on function public.commesse_generali_impostazioni_salva(uuid, text[]) from anon;
grant execute on function public.commesse_generali_impostazioni_salva(uuid, text[]) to authenticated;
