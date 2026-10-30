-- Le fatture che nascono dalle commesse generali (sessione cg-fatture, 30/10/2026).
--
-- Due strade, una sola regola: la fattura è sempre una BOZZA di documenti_fiscali,
-- creata con documento_crea (la stessa funzione dell'editor: numero all'emissione,
-- permesso «Fatturazione»), e resta legata a ciò da cui è nata.
--   · SAL di contratto (generale_sal / sal_records sulla generale) → fattura al
--     committente della generale, documento.ordine_id = generale.
--   · Caparra, acconto o saldo di un'unità (unita_movimenti) → fattura
--     all'acquirente, documento.ordine_id = commessa figlia dell'unità.
-- Il legame sta in generale_fatture. Una fattura cancellata o annullata non
-- conta più: il SAL o il pagamento si possono rifatturare. Una viva invece
-- blocca la seconda (stesso lucchetto, stessa riga di legame).
--
-- L'emissione verso lo SDI resta l'azione esplicita dell'editor.

set local lock_timeout = '3s';

-- 1. Il legame ------------------------------------------------------------------
create table if not exists public.generale_fatture (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  generale_id  uuid not null references public.commesse_generali(order_id) on delete cascade,
  documento_id uuid not null references public.documenti_fiscali(id) on delete cascade,
  sal_id       uuid references public.sal_records(id) on delete cascade,
  movimento_id uuid references public.unita_movimenti(id) on delete cascade,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint generale_fatture_una_origine check ((sal_id is null) <> (movimento_id is null))
);
comment on table public.generale_fatture is
  'Da quale SAL di contratto o pagamento di un''unità è nata una fattura (documenti_fiscali). Si scrive solo con generale_fattura_crea.';

create unique index if not exists generale_fatture_documento_uq on public.generale_fatture (documento_id);
create unique index if not exists generale_fatture_sal_uq on public.generale_fatture (sal_id) where sal_id is not null;
create unique index if not exists generale_fatture_movimento_uq on public.generale_fatture (movimento_id) where movimento_id is not null;
create index if not exists generale_fatture_generale_idx on public.generale_fatture (generale_id);
create index if not exists generale_fatture_company_idx on public.generale_fatture (company_id);

alter table public.generale_fatture enable row level security;

drop policy if exists generale_fatture_lettura on public.generale_fatture;
create policy generale_fatture_lettura on public.generale_fatture
  for select to authenticated
  using (
    company_id = (select public.get_my_company_id())
    and not (select public.utente_e_cliente_esterno())
    and public.puo_vedere_commessa(generale_id)
    and company_id in (select unnest(public.aziende_con_permesso('can_view_order_amounts')))
  );

drop policy if exists blocco_utente_bloccato on public.generale_fatture;
create policy blocco_utente_bloccato on public.generale_fatture as restrictive for all to authenticated
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));

revoke all on public.generale_fatture from anon, authenticated;
grant select on public.generale_fatture to authenticated;
grant all on public.generale_fatture to service_role;

-- 2. Le fatture vive della generale (vive = non cancellate né annullate) -------------
-- Chi vede la generale e i suoi importi. «puo_fatturare» dice se mostrare «Crea fattura».
create or replace function public.generale_fatture_elenco(p_generale_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_azienda uuid;
  v_out jsonb;
begin
  select g.company_id into v_azienda from public.commesse_generali g where g.order_id = p_generale_id;
  if auth.uid() is null or v_azienda is null or public.utente_bloccato()
     or not public.puo_vedere_commessa(p_generale_id)
     or not public.has_permission_for_company(auth.uid(), 'can_view_order_amounts', v_azienda) then
    raise exception 'Non hai il permesso di vedere le fatture di questa commessa.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'sal_id', l.sal_id,
           'movimento_id', l.movimento_id,
           'documento_id', d.id,
           'numero', d.numero,
           'stato', d.stato,
           'data', d.data_emissione,
           'totale', d.totale_documento,
           'da_pagare', d.totale_da_pagare,
           'pagato', d.importo_pagato
         ) order by d.created_at), '[]'::jsonb)
    into v_out
    from public.generale_fatture l
    join public.documenti_fiscali d on d.id = l.documento_id
   where l.generale_id = p_generale_id
     and d.deleted_at is null and d.stato <> 'annullata';

  return jsonb_build_object(
    'fatture', v_out,
    'puo_fatturare', public.puo_gestire_documento_fiscale(v_azienda, 'fattura'));
end;
$fn$;
revoke all on function public.generale_fatture_elenco(uuid) from public, anon;
grant execute on function public.generale_fatture_elenco(uuid) to authenticated, service_role;

-- 3. Il cliente: anagrafica di fatturazione se c'è, altrimenti il profilo --------
create or replace function public.generale_fattura_cliente(p_company_id uuid, p_profilo uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $fn$
declare
  p record;
  a record;
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
    return jsonb_build_object(
      'anagrafica_id', a.id, 'profilo_id', p_profilo,
      'tipo_cliente', a.tipo_cliente,
      'ragione_sociale', a.ragione_sociale, 'nome', a.nome, 'cognome', a.cognome,
      'partita_iva', a.partita_iva, 'codice_fiscale', a.codice_fiscale,
      'codice_sdi', a.codice_sdi, 'pec', a.pec, 'email', coalesce(a.email_fatture, a.email),
      'indirizzo_via', a.indirizzo_via, 'indirizzo_cap', a.indirizzo_cap,
      'indirizzo_comune', a.indirizzo_comune, 'indirizzo_provincia', a.indirizzo_provincia,
      'indirizzo_nazione', a.indirizzo_nazione);
  end if;
  return jsonb_build_object(
    'anagrafica_id', null, 'profilo_id', p_profilo,
    'tipo_cliente', case when nullif(btrim(p.vat_number), '') is not null then 'B2B' else 'B2C' end,
    'ragione_sociale', nullif(btrim(p.business_name), ''), 'nome', p.first_name, 'cognome', p.last_name,
    'partita_iva', nullif(btrim(p.vat_number), ''), 'codice_fiscale', upper(nullif(btrim(p.fiscal_code), '')),
    'codice_sdi', null, 'pec', null, 'email', p.email,
    'indirizzo_via', p.address, 'indirizzo_cap', p.postal_code,
    'indirizzo_comune', p.city, 'indirizzo_provincia', p.province, 'indirizzo_nazione', 'IT');
end;
$fn$;
revoke all on function public.generale_fattura_cliente(uuid, uuid) from public, anon, authenticated;
grant execute on function public.generale_fattura_cliente(uuid, uuid) to service_role;

-- 4. Da dove nasce la fattura: azienda, generale, documento, cliente -------------
-- p_origine = 'sal' (id di sal_records) | 'movimento' (id di unita_movimenti).
-- Rifiuta ciò che non si fattura: SAL in bozza o fatto a mano, permuta.
create or replace function public.generale_fattura_origine(p_origine text, p_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $fn$
declare
  s record;
  m record;
begin
  if p_origine = 'sal' then
    select r.id, r.company_id, r.order_id, r.numero_sal, r.stato, r.data_emissione,
           gs.generale_id, gs.periodo_dal, gs.periodo_al, gs.lordo, gs.ritenuta_pct, gs.ritenuta,
           gs.recupero_pct, gs.recupero_anticipazione, gs.netto, gs.riferimento_contratto,
           gs.cig, gs.cup, gs.split_payment, gs.reverse_charge,
           o.customer_id, o.order_code, o.description
      into s
      from public.sal_records r
      join public.generale_sal gs on gs.sal_id = r.id
      join public.orders o on o.id = gs.generale_id
     where r.id = p_id;
    if not found then
      raise exception 'Questo SAL non è un SAL di contratto della commessa generale.' using errcode = '22023';
    end if;
    if s.stato not in ('emesso', 'approvato', 'firmato') then
      raise exception 'Si fattura un SAL emesso: prima emetti il SAL n. %.', s.numero_sal using errcode = '22023';
    end if;
    return jsonb_build_object(
      'company_id', s.company_id, 'generale_id', s.generale_id, 'ordine_id', s.generale_id,
      'cliente_profilo', s.customer_id,
      'sal', jsonb_build_object(
        'id', s.id, 'numero', s.numero_sal, 'stato', s.stato, 'data', s.data_emissione,
        'dal', s.periodo_dal, 'al', s.periodo_al, 'lordo', s.lordo,
        'ritenuta_pct', s.ritenuta_pct, 'ritenuta', s.ritenuta,
        'recupero_pct', s.recupero_pct, 'recupero', s.recupero_anticipazione, 'netto', s.netto,
        'riferimento_contratto', s.riferimento_contratto, 'cig', s.cig, 'cup', s.cup,
        'split_payment', s.split_payment, 'reverse_charge', s.reverse_charge,
        'generale_codice', s.order_code, 'generale_nome', s.description));
  elsif p_origine = 'movimento' then
    select mv.id, mv.company_id, mv.tipo, mv.importo, mv.data, mv.descrizione,
           u.id as unita_id, u.order_id, u.sigla, u.edificio, u.piano, u.tipologia, u.mq_commerciali,
           u.acquirente_id, u.stato_vendita,
           o.customer_id, o.commessa_generale_id, o.order_code,
           g.order_code as generale_codice, g.description as generale_nome,
           coalesce(g.work_address, g.indirizzo_lavori) as indirizzo
      into m
      from public.unita_movimenti mv
      join public.unita_immobiliari u on u.id = mv.unita_id
      join public.orders o on o.id = u.order_id
      left join public.orders g on g.id = o.commessa_generale_id
     where mv.id = p_id;
    if not found or m.commessa_generale_id is null then
      raise exception 'Questo pagamento non è di un''unità di una commessa generale.' using errcode = '22023';
    end if;
    if m.tipo not in ('caparra', 'acconto', 'saldo') then
      raise exception 'La permuta non è un incasso: non si fattura da qui.' using errcode = '22023';
    end if;
    return jsonb_build_object(
      'company_id', m.company_id, 'generale_id', m.commessa_generale_id, 'ordine_id', m.order_id,
      'cliente_profilo', coalesce(m.acquirente_id, m.customer_id),
      'movimento', jsonb_build_object(
        'id', m.id, 'tipo', m.tipo, 'importo', m.importo, 'data', m.data, 'descrizione', m.descrizione,
        'unita_sigla', m.sigla, 'edificio', m.edificio, 'piano', m.piano, 'tipologia', m.tipologia,
        'mq', m.mq_commerciali, 'stato_vendita', m.stato_vendita,
        'generale_codice', m.generale_codice, 'generale_nome', m.generale_nome, 'indirizzo', m.indirizzo));
  end if;
  raise exception 'Origine della fattura sconosciuta: %.', p_origine using errcode = '22023';
end;
$fn$;
revoke all on function public.generale_fattura_origine(text, uuid) from public, anon, authenticated;
grant execute on function public.generale_fattura_origine(text, uuid) to service_role;

-- La fattura viva già legata a un'origine, se c'è.
create or replace function public.generale_fattura_esistente(p_origine text, p_id uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $fn$
  select jsonb_build_object('id', d.id, 'numero', d.numero, 'stato', d.stato)
    from public.generale_fatture l
    join public.documenti_fiscali d on d.id = l.documento_id
   where (case when p_origine = 'sal' then l.sal_id else l.movimento_id end) = p_id
     and d.deleted_at is null and d.stato <> 'annullata'
   limit 1;
$fn$;
revoke all on function public.generale_fattura_esistente(text, uuid) from public, anon, authenticated;
grant execute on function public.generale_fattura_esistente(text, uuid) to service_role;

-- 5. I dati per preparare la bozza (sola lettura) --------------------------------
create or replace function public.generale_fattura_dati(p_origine text, p_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v jsonb;
  v_azienda uuid;
begin
  v := public.generale_fattura_origine(p_origine, p_id);
  v_azienda := (v->>'company_id')::uuid;
  if auth.uid() is null or public.utente_bloccato()
     or not public.puo_vedere_commessa((v->>'generale_id')::uuid)
     or not public.puo_gestire_documento_fiscale(v_azienda, 'fattura') then
    raise exception 'Per preparare una fattura serve il permesso «Fatturazione».' using errcode = '42501';
  end if;
  return v
    || jsonb_build_object(
         'cliente', public.generale_fattura_cliente(v_azienda, (v->>'cliente_profilo')::uuid),
         'esistente', public.generale_fattura_esistente(p_origine, p_id));
end;
$fn$;
revoke all on function public.generale_fattura_dati(text, uuid) from public, anon;
grant execute on function public.generale_fattura_dati(text, uuid) to authenticated, service_role;

-- 6. Crea la bozza e la lega (o restituisce quella che c'è già) -------------------
-- p_dati: i campi della bozza preparati dal browser (righe, riepilogo IVA, causale…).
-- Qui si decidono tipo, commessa, anagrafica e legame: non si fidano del browser.
create or replace function public.generale_fattura_crea(p_origine text, p_id uuid, p_dati jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  v jsonb;
  v_azienda uuid;
  v_cliente jsonb;
  v_anagrafica uuid;
  v_esistente jsonb;
  v_tipo text;
  v_creato jsonb;
begin
  v := public.generale_fattura_origine(p_origine, p_id);
  v_azienda := (v->>'company_id')::uuid;
  if auth.uid() is null or public.utente_bloccato()
     or public.user_can_access_company(v_azienda) is not true
     or not public.puo_vedere_commessa((v->>'generale_id')::uuid)
     or not public.puo_gestire_documento_fiscale(v_azienda, 'fattura') then
    raise exception 'Per preparare una fattura serve il permesso «Fatturazione».' using errcode = '42501';
  end if;
  if jsonb_typeof(p_dati) is distinct from 'object' or jsonb_typeof(p_dati->'righe') is distinct from 'array'
     or jsonb_array_length(p_dati->'righe') = 0 then
    raise exception 'La bozza deve avere almeno una riga.' using errcode = '22023';
  end if;

  -- Un SAL o un pagamento alla volta: due clic, una sola fattura.
  perform pg_advisory_xact_lock(hashtextextended('generale_fattura:' || p_origine || ':' || p_id::text, 0));

  v_esistente := public.generale_fattura_esistente(p_origine, p_id);
  if v_esistente is not null then
    return v_esistente || jsonb_build_object('esistente', true);
  end if;
  -- Il legame di una fattura cancellata o annullata non tiene più fermo niente.
  delete from public.generale_fatture l
   where (case when p_origine = 'sal' then l.sal_id else l.movimento_id end) = p_id;

  -- Il cliente entra in anagrafica, come fa l'editor con un cliente nuovo.
  v_cliente := public.generale_fattura_cliente(v_azienda, (v->>'cliente_profilo')::uuid);
  v_anagrafica := (v_cliente->>'anagrafica_id')::uuid;
  if v_anagrafica is null and v_cliente is not null then
    insert into public.anagrafiche_native (
      company_id, tipo, tipo_cliente, ragione_sociale, nome, cognome, partita_iva, codice_fiscale,
      email, indirizzo_via, indirizzo_cap, indirizzo_comune, indirizzo_provincia, indirizzo_nazione,
      cliente_id, attivo)
    values (
      v_azienda, 'cliente', v_cliente->>'tipo_cliente',
      coalesce(v_cliente->>'ragione_sociale',
               nullif(btrim(concat_ws(' ', v_cliente->>'nome', v_cliente->>'cognome')), ''), 'Cliente'),
      v_cliente->>'nome', v_cliente->>'cognome', v_cliente->>'partita_iva', v_cliente->>'codice_fiscale',
      v_cliente->>'email', v_cliente->>'indirizzo_via', v_cliente->>'indirizzo_cap', v_cliente->>'indirizzo_comune',
      left(v_cliente->>'indirizzo_provincia', 2), 'IT', (v->>'cliente_profilo')::uuid, true)
    returning id into v_anagrafica;
  end if;

  v_tipo := case when p_dati->>'tipo' = 'fattura_pa' then 'fattura_pa' else 'fattura' end;
  v_creato := public.documento_crea(
    v_azienda,
    (p_dati - 'id' - 'tipo' - 'stato' - 'numero' - 'numero_progressivo' - 'company_id' - 'ordine_id'
            - 'anagrafica_id' - 'importo_pagato' - 'pagato_at' - 'sdi_id_trasmissione' - 'sdi_stato')
      || jsonb_build_object('tipo', v_tipo, 'ordine_id', v->>'ordine_id')
      || case when v_anagrafica is not null then jsonb_build_object('anagrafica_id', v_anagrafica) else '{}'::jsonb end);

  insert into public.generale_fatture (company_id, generale_id, documento_id, sal_id, movimento_id, created_by)
  values (v_azienda, (v->>'generale_id')::uuid, (v_creato->>'id')::uuid,
          case when p_origine = 'sal' then p_id end,
          case when p_origine = 'movimento' then p_id end,
          auth.uid());

  return jsonb_build_object('id', v_creato->>'id', 'numero', v_creato->>'numero', 'stato', 'bozza', 'esistente', false);
end;
$fn$;
revoke all on function public.generale_fattura_crea(text, uuid, jsonb) from public, anon;
grant execute on function public.generale_fattura_crea(text, uuid, jsonb) to authenticated, service_role;

-- 7. Un pagamento fatturato non si toglie (prima si annulla la fattura) ----------
create or replace function public.unita_movimento_fatturato_non_si_toglie()
returns trigger
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_numero text;
begin
  select d.numero into v_numero
    from public.generale_fatture l
    join public.documenti_fiscali d on d.id = l.documento_id
   where l.movimento_id = old.id and d.deleted_at is null and d.stato <> 'annullata'
   limit 1;
  if found then
    raise exception 'Questo pagamento ha la fattura %: prima cancella la bozza o annulla la fattura.', v_numero
      using errcode = '22023';  -- come gli altri rifiuti del modulo unità (messaggioGenerale lo mostra)
  end if;
  return old;
end;
$fn$;
revoke all on function public.unita_movimento_fatturato_non_si_toglie() from public, anon, authenticated;

drop trigger if exists unita_movimento_fatturato on public.unita_movimenti;
create trigger unita_movimento_fatturato
  before delete on public.unita_movimenti
  for each row execute function public.unita_movimento_fatturato_non_si_toglie();
