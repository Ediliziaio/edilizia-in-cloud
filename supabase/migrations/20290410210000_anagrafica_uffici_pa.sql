-- Lotto 2 del piano «Clienti privati, aziende e PA» (docs/piano-clienti-pa-commessa-fattura.md).
--
-- 1. anagrafica_uffici_pa: gli uffici di un ente, ognuno col suo Codice Univoco
--    Ufficio (6 caratteri), uno solo predefinito per ente.
--    anagrafiche_native.codice_sdi di una PA = codice del predefinito attivo
--    (lo tiene allineato il trigger): XML e controlli di oggi continuano a
--    leggere lì finché i lotti 3-4 non scelgono l'ufficio sulla commessa/fattura.
-- 2. RLS per azienda come anagrafiche_native. Nel backup entra da sola
--    (company_id + FK verso anagrafiche_native): admin_backup_tabelle_scoperte()
--    deve restare vuota.
-- 3. Travaso: per gli enti già segnati PA con un codice di 6 caratteri, l'ufficio
--    predefinito da quel codice. Prudente: lock_timeout, statement_timeout.
-- 4. salva_anagrafica_cliente(cliente, dati): crea o aggiorna l'anagrafica del
--    cliente e la tiene collegata (cliente_id). Usata da creazione e modifica.
-- 5. generale_fattura_cliente: restituisce anche split_payment, codice_ipa e
--    l'ufficio predefinito; il tipo viene dall'anagrafica quando c'è.
--
-- Idempotente.

-- 1. Tabella -------------------------------------------------------------------
create table if not exists public.anagrafica_uffici_pa (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  anagrafica_id uuid not null references public.anagrafiche_native(id) on delete cascade,
  descrizione text not null default '',
  codice_univoco_ufficio text not null,
  predefinito boolean not null default false,
  attivo boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint anagrafica_uffici_pa_codice_check check (codice_univoco_ufficio ~ '^[A-Z0-9]{6}$'),
  constraint anagrafica_uffici_pa_predefinito_attivo check (not predefinito or attivo)
);

comment on table public.anagrafica_uffici_pa is
  'Uffici di fatturazione di un cliente PA: Codice Univoco Ufficio (6 caratteri, IPA) e predefinito. Il codice IPA dell''ente sta in anagrafiche_native.codice_ipa.';

create unique index if not exists anagrafica_uffici_pa_un_predefinito
  on public.anagrafica_uffici_pa (anagrafica_id) where predefinito;
create unique index if not exists anagrafica_uffici_pa_codice_unico
  on public.anagrafica_uffici_pa (anagrafica_id, codice_univoco_ufficio);
create index if not exists anagrafica_uffici_pa_company
  on public.anagrafica_uffici_pa (company_id);

-- Prima di scrivere: azienda presa dall'anagrafica, codice pulito, un solo predefinito.
create or replace function public.anagrafica_ufficio_pa_prima()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  az uuid;
begin
  select a.company_id into az from public.anagrafiche_native a where a.id = new.anagrafica_id;
  if az is null then
    raise exception 'Anagrafica inesistente' using errcode = '23503';
  end if;
  -- L'azienda è sempre quella dell'anagrafica: la regola d'accesso fa il resto.
  new.company_id := az;
  new.codice_univoco_ufficio := upper(regexp_replace(coalesce(new.codice_univoco_ufficio, ''), '\s', '', 'g'));
  new.descrizione := btrim(coalesce(new.descrizione, ''));
  new.updated_at := now();
  if not new.attivo then
    new.predefinito := false;
  end if;
  -- Il primo ufficio attivo di un ente è il predefinito.
  if tg_op = 'INSERT' and new.attivo and not new.predefinito and not exists (
       select 1 from public.anagrafica_uffici_pa u
        where u.anagrafica_id = new.anagrafica_id and u.predefinito and u.id <> new.id) then
    new.predefinito := true;
  end if;
  -- Gli altri smettono di esserlo (il loro trigger, con predefinito = false, non risale qui).
  if new.predefinito then
    update public.anagrafica_uffici_pa u set predefinito = false, updated_at = now()
     where u.anagrafica_id = new.anagrafica_id and u.predefinito and u.id <> new.id;
  end if;
  return new;
end;
$fn$;
revoke all on function public.anagrafica_ufficio_pa_prima() from public, anon, authenticated;

drop trigger if exists trg_anagrafica_ufficio_pa_prima on public.anagrafica_uffici_pa;
create trigger trg_anagrafica_ufficio_pa_prima
  before insert or update on public.anagrafica_uffici_pa
  for each row execute function public.anagrafica_ufficio_pa_prima();

-- Dopo: codice_sdi della PA = codice del predefinito attivo.
create or replace function public.anagrafica_ufficio_pa_allinea()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  ana uuid;
  cod text;
begin
  ana := coalesce(new.anagrafica_id, old.anagrafica_id);
  select u.codice_univoco_ufficio into cod
    from public.anagrafica_uffici_pa u
   where u.anagrafica_id = ana and u.predefinito and u.attivo
   limit 1;
  update public.anagrafiche_native a
     set codice_sdi = cod, updated_at = now()
   where a.id = ana and a.tipo_cliente = 'PA'
     and a.codice_sdi is distinct from cod;
  return null;
end;
$fn$;
revoke all on function public.anagrafica_ufficio_pa_allinea() from public, anon, authenticated;

drop trigger if exists trg_anagrafica_ufficio_pa_allinea on public.anagrafica_uffici_pa;
create trigger trg_anagrafica_ufficio_pa_allinea
  after insert or update or delete on public.anagrafica_uffici_pa
  for each row execute function public.anagrafica_ufficio_pa_allinea();

-- 2. Regole d'accesso, come anagrafiche_native ---------------------------------
alter table public.anagrafica_uffici_pa enable row level security;

drop policy if exists company_isolation on public.anagrafica_uffici_pa;
create policy company_isolation on public.anagrafica_uffici_pa
  for all to authenticated
  using (company_id = (select public.get_my_company_id()) and not public.utente_e_cliente_esterno())
  with check (company_id = (select public.get_my_company_id()) and not public.utente_e_cliente_esterno()
              and not public.utente_sola_lettura(company_id));

drop policy if exists blocco_utente_bloccato on public.anagrafica_uffici_pa;
create policy blocco_utente_bloccato on public.anagrafica_uffici_pa as restrictive
  for all to authenticated
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));

drop policy if exists permessi_solo_ufficio on public.anagrafica_uffici_pa;
create policy permessi_solo_ufficio on public.anagrafica_uffici_pa as restrictive
  for all to authenticated
  using (not (select public.e_solo_campo())) with check (not (select public.e_solo_campo()));

revoke all on public.anagrafica_uffici_pa from anon;
grant select, insert, update, delete on public.anagrafica_uffici_pa to authenticated;
grant all on public.anagrafica_uffici_pa to service_role;

-- 3. Travaso dai codici di oggi ------------------------------------------------
do $travaso$
begin
  set local lock_timeout = '3s';
  set local statement_timeout = '60s';
  insert into public.anagrafica_uffici_pa (company_id, anagrafica_id, descrizione, codice_univoco_ufficio, predefinito, note)
  select a.company_id, a.id, 'Ufficio di fatturazione', upper(btrim(a.codice_sdi)), true,
         'Creato dal codice dell''anagrafica il 15/11/2026'
    from public.anagrafiche_native a
   where a.tipo_cliente = 'PA'
     and upper(btrim(a.codice_sdi)) ~ '^[A-Z0-9]{6}$'
     and upper(btrim(a.codice_sdi)) <> '000000'
     and not exists (select 1 from public.anagrafica_uffici_pa u where u.anagrafica_id = a.id);
end
$travaso$;

-- 4. Salvataggio del cliente fiscale -------------------------------------------
-- p_dati: solo le chiavi presenti vengono scritte (stringa vuota = svuota).
-- Chiavi: tipo_cliente, ragione_sociale, nome, cognome, partita_iva,
-- codice_fiscale, codice_sdi, pec, email, email_fatture, telefono,
-- referente_amministrativo, indirizzo_via, indirizzo_cap, indirizzo_comune,
-- indirizzo_provincia, indirizzo_nazione, codice_ipa, split_payment (bool|null),
-- note; più ufficio_codice / ufficio_descrizione per il primo ufficio di una PA.
create or replace function public.salva_anagrafica_cliente(p_cliente_id uuid, p_dati jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  az uuid;
  me uuid := auth.uid();
  ana public.anagrafiche_native%rowtype;
  trovata boolean := false;
  piva text := nullif(upper(regexp_replace(coalesce(p_dati->>'partita_iva', ''), '\s', '', 'g')), '');
  cf text := nullif(upper(regexp_replace(coalesce(p_dati->>'codice_fiscale', ''), '\s', '', 'g')), '');
  v_tipo text := nullif(p_dati->>'tipo_cliente', '');
  uff text := nullif(upper(regexp_replace(coalesce(p_dati->>'ufficio_codice', ''), '\s', '', 'g')), '');
  altro text;
begin
  if p_dati is null or jsonb_typeof(p_dati) <> 'object' then
    raise exception 'Dati mancanti' using errcode = '22023';
  end if;
  if v_tipo is not null and v_tipo not in ('B2B', 'B2C', 'PA', 'Estero') then
    raise exception 'Tipo cliente non valido: %', v_tipo using errcode = '22023';
  end if;
  if uff is not null and uff !~ '^[A-Z0-9]{6}$' then
    raise exception 'Il codice univoco ufficio ha 6 caratteri, lettere maiuscole o cifre' using errcode = '22023';
  end if;

  select p.company_id into az from public.profiles p where p.id = p_cliente_id;
  if az is null then
    raise exception 'Cliente non trovato' using errcode = 'P0002';
  end if;
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    if me is null or public.utente_bloccato() or public.utente_sola_lettura(az)
       or not (public.has_permission_for_company(me, 'can_edit_customers', az)
               or public.has_permission_for_company(me, 'can_view_billing', az)) then
      raise exception 'Non hai il permesso di modificare i dati fiscali di questo cliente' using errcode = '42501';
    end if;
  end if;
  if not public.profilo_solo_cliente(p_cliente_id) then
    raise exception 'Questo profilo non è un cliente' using errcode = '22023';
  end if;

  -- Quale anagrafica: quella collegata; se no una libera con la stessa P.IVA o CF.
  select * into ana from public.anagrafiche_native a
   where a.company_id = az and a.cliente_id = p_cliente_id
   order by a.attivo desc nulls last, a.updated_at desc nulls last limit 1;
  trovata := found;
  if not trovata and (piva is not null or cf is not null) then
    select * into ana from public.anagrafiche_native a
     where a.company_id = az and a.tipo in ('cliente', 'entrambi')
       and ((piva is not null and a.partita_iva = piva) or (cf is not null and upper(a.codice_fiscale) = cf))
     order by (a.cliente_id is null) desc, a.attivo desc nulls last limit 1;
    trovata := found;
    if trovata and ana.cliente_id is not null and ana.cliente_id <> p_cliente_id then
      select coalesce(nullif(btrim(pr.business_name), ''), btrim(concat_ws(' ', pr.first_name, pr.last_name)))
        into altro from public.profiles pr where pr.id = ana.cliente_id;
      raise exception 'Questa partita IVA o codice fiscale è già di un altro cliente: %', coalesce(altro, '—')
        using errcode = '23505';
    end if;
  end if;
  -- Una P.IVA già usata da un'altra anagrafica dell'azienda: lo si dice in chiaro.
  if piva is not null and exists (
       select 1 from public.anagrafiche_native a
        where a.company_id = az and a.partita_iva = piva and (not trovata or a.id <> ana.id)) then
    raise exception 'La partita IVA % è già in un''altra anagrafica di questa azienda', piva using errcode = '23505';
  end if;

  perform set_config('eic.salva_anagrafica_cliente', 'on', true);

  if not trovata then
    insert into public.anagrafiche_native (company_id, tipo, tipo_cliente, cliente_id, sync_from_cliente, attivo)
    values (az, 'cliente', coalesce(v_tipo, case when piva is not null then 'B2B' else 'B2C' end), p_cliente_id, false, true)
    returning * into ana;
  end if;

  update public.anagrafiche_native a set
    cliente_id      = p_cliente_id,
    tipo            = case when a.tipo = 'fornitore' then 'entrambi' else a.tipo end,
    sync_from_cliente = false,
    attivo          = true,
    tipo_cliente    = coalesce(v_tipo, a.tipo_cliente),
    tipo_confermato_at = case when v_tipo is not null then now() else a.tipo_confermato_at end,
    ragione_sociale = case when p_dati ? 'ragione_sociale' then nullif(btrim(p_dati->>'ragione_sociale'), '') else a.ragione_sociale end,
    nome            = case when p_dati ? 'nome' then nullif(btrim(p_dati->>'nome'), '') else a.nome end,
    cognome         = case when p_dati ? 'cognome' then nullif(btrim(p_dati->>'cognome'), '') else a.cognome end,
    partita_iva     = case when p_dati ? 'partita_iva' then piva else a.partita_iva end,
    codice_fiscale  = case when p_dati ? 'codice_fiscale' then cf else a.codice_fiscale end,
    codice_sdi      = case when p_dati ? 'codice_sdi' then nullif(upper(regexp_replace(p_dati->>'codice_sdi', '\s', '', 'g')), '') else a.codice_sdi end,
    pec             = case when p_dati ? 'pec' then nullif(lower(btrim(p_dati->>'pec')), '') else a.pec end,
    email           = case when p_dati ? 'email' then nullif(lower(btrim(p_dati->>'email')), '') else a.email end,
    email_fatture   = case when p_dati ? 'email_fatture' then nullif(lower(btrim(p_dati->>'email_fatture')), '') else a.email_fatture end,
    telefono        = case when p_dati ? 'telefono' then nullif(btrim(p_dati->>'telefono'), '') else a.telefono end,
    referente_amministrativo = case when p_dati ? 'referente_amministrativo' then nullif(btrim(p_dati->>'referente_amministrativo'), '') else a.referente_amministrativo end,
    indirizzo_via   = case when p_dati ? 'indirizzo_via' then nullif(btrim(p_dati->>'indirizzo_via'), '') else a.indirizzo_via end,
    indirizzo_cap   = case when p_dati ? 'indirizzo_cap' then nullif(btrim(p_dati->>'indirizzo_cap'), '') else a.indirizzo_cap end,
    indirizzo_comune = case when p_dati ? 'indirizzo_comune' then nullif(btrim(p_dati->>'indirizzo_comune'), '') else a.indirizzo_comune end,
    indirizzo_provincia = case when p_dati ? 'indirizzo_provincia' then nullif(upper(btrim(p_dati->>'indirizzo_provincia')), '') else a.indirizzo_provincia end,
    indirizzo_nazione = case when p_dati ? 'indirizzo_nazione' then coalesce(nullif(upper(btrim(p_dati->>'indirizzo_nazione')), ''), 'IT') else a.indirizzo_nazione end,
    codice_ipa      = case when p_dati ? 'codice_ipa' then nullif(btrim(p_dati->>'codice_ipa'), '') else a.codice_ipa end,
    split_payment   = case when p_dati ? 'split_payment' then (p_dati->>'split_payment')::boolean else a.split_payment end,
    note            = case when p_dati ? 'note' then nullif(btrim(p_dati->>'note'), '') else a.note end,
    updated_at      = now()
  where a.id = ana.id
  returning * into ana;

  -- Una PA senza uffici: il primo dal codice scritto ora, o da quello che c'era.
  if ana.tipo_cliente = 'PA' and not exists (select 1 from public.anagrafica_uffici_pa u where u.anagrafica_id = ana.id) then
    uff := coalesce(uff, case when upper(btrim(ana.codice_sdi)) ~ '^[A-Z0-9]{6}$' and upper(btrim(ana.codice_sdi)) <> '000000'
                              then upper(btrim(ana.codice_sdi)) end);
    if uff is not null then
      insert into public.anagrafica_uffici_pa (company_id, anagrafica_id, descrizione, codice_univoco_ufficio, predefinito)
      values (az, ana.id, coalesce(nullif(btrim(p_dati->>'ufficio_descrizione'), ''), 'Ufficio di fatturazione'), uff, true);
    end if;
  end if;

  perform set_config('eic.salva_anagrafica_cliente', 'off', true);
  return ana.id;
end;
$fn$;
revoke all on function public.salva_anagrafica_cliente(uuid, jsonb) from public, anon;
grant execute on function public.salva_anagrafica_cliente(uuid, jsonb) to authenticated, service_role;

-- 5. Il cliente della fattura generale: il tipo dall'anagrafica ------------------
create or replace function public.generale_fattura_cliente(p_company_id uuid, p_profilo uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  p record;
  a record;
  u record;
begin
  if p_profilo is null then
    return null;
  end if;
  select pr.id, pr.business_name, pr.first_name, pr.last_name, pr.vat_number, pr.fiscal_code,
         pr.address, pr.city, pr.postal_code, pr.province, pr.email
    into p from public.profiles pr where pr.id = p_profilo;
  if not found then
    return null;
  end if;
  select an.* into a
    from public.anagrafiche_native an
   where an.company_id = p_company_id
     and (an.cliente_id = p_profilo
          or (nullif(btrim(p.vat_number), '') is not null and an.partita_iva = btrim(p.vat_number))
          or (nullif(btrim(p.fiscal_code), '') is not null and an.codice_fiscale = upper(btrim(p.fiscal_code))))
   -- Anche una disattivata: la partita IVA è unica per azienda, crearne un'altra fallirebbe.
   order by an.attivo desc, (an.cliente_id = p_profilo) desc, an.updated_at desc nulls last
   limit 1;
  if found then
    select uf.id, uf.codice_univoco_ufficio, uf.descrizione into u
      from public.anagrafica_uffici_pa uf
     where uf.anagrafica_id = a.id and uf.predefinito and uf.attivo
     limit 1;
    return jsonb_build_object(
      'anagrafica_id', a.id, 'profilo_id', p_profilo,
      -- Il tipo è quello dell'anagrafica (PA compresa), mai indovinato dalla P.IVA.
      'tipo_cliente', coalesce(a.tipo_cliente, case a.tipo_soggetto when 'pa' then 'PA' when 'estero' then 'Estero'
                                                  when 'fisico' then 'B2C' else 'B2B' end),
      'ragione_sociale', a.ragione_sociale, 'nome', a.nome, 'cognome', a.cognome,
      'partita_iva', a.partita_iva, 'codice_fiscale', a.codice_fiscale,
      'codice_sdi', coalesce(u.codice_univoco_ufficio, a.codice_sdi), 'pec', a.pec, 'email', coalesce(a.email_fatture, a.email),
      'indirizzo_via', a.indirizzo_via, 'indirizzo_cap', a.indirizzo_cap,
      'indirizzo_comune', a.indirizzo_comune, 'indirizzo_provincia', a.indirizzo_provincia,
      'indirizzo_nazione', a.indirizzo_nazione,
      'split_payment', a.split_payment, 'codice_ipa', a.codice_ipa,
      'ufficio_pa_id', u.id, 'ufficio_pa_descrizione', u.descrizione);
  end if;
  -- Nessuna anagrafica: il profilo non conosce la PA, si indovina tra azienda e privato.
  return jsonb_build_object(
    'anagrafica_id', null, 'profilo_id', p_profilo,
    'tipo_cliente', case when nullif(btrim(p.vat_number), '') is not null then 'B2B' else 'B2C' end,
    'ragione_sociale', nullif(btrim(p.business_name), ''), 'nome', p.first_name, 'cognome', p.last_name,
    'partita_iva', nullif(btrim(p.vat_number), ''), 'codice_fiscale', upper(nullif(btrim(p.fiscal_code), '')),
    'codice_sdi', null, 'pec', null, 'email', p.email,
    'indirizzo_via', p.address, 'indirizzo_cap', p.postal_code,
    'indirizzo_comune', p.city, 'indirizzo_provincia', p.province, 'indirizzo_nazione', 'IT',
    'split_payment', null, 'codice_ipa', null, 'ufficio_pa_id', null, 'ufficio_pa_descrizione', null);
end;
$function$;
revoke all on function public.generale_fattura_cliente(uuid, uuid) from public, anon, authenticated;
grant execute on function public.generale_fattura_cliente(uuid, uuid) to service_role;
