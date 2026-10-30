-- ════════════════════════════════════════════════════════════════════════════
-- Le rate dei fornitori: ogni RiBa (e ogni rata) diventa una riga a sé
-- ════════════════════════════════════════════════════════════════════════════
-- Approvato da Florin il 29/10/2026: «costruisci la tabella delle rate come
-- proposto, con gli stati delle RiBa e il pagamento sulla singola rata».
-- Vedi docs/flussi-acquisti-pagamenti.md, «Proposta per gli stati che vanno
-- registrati».
--
-- PERCHÉ. Una fattura Centrufficio sono quattro RiBa, quattro addebiti in
-- quattro mesi. Finora era UN costo: «pagata» valeva per tutte e quattro
-- insieme, e gli stati che una RiBa attraversa davvero — la banca l'avvisa,
-- la si blocca, va insoluta — non avevano dove stare.
--
-- IL MODELLO. Quattro fatti, quattro posti:
--   ODA                    l'impegno
--   fattura ricevuta       il debito
--   company_costs          il costo di competenza (margine): UNO per fattura,
--                          come prima. Non si spezza, perché note di credito,
--                          SAL e riepiloghi contano sul legame unico
--                          `fatture_ricevute.company_cost_id`.
--   rate_fornitori  (qui)  quando e come si paga: N righe per (costo, fattura).
-- La rata appartiene alla coppia costo + fattura, non al solo costo: in Demo 2
-- ci sono costi confermati da due o tre fatture (acconto e saldo, consegne
-- diverse), e ognuna porta le sue rate.
--
-- GLI STATI. da_pagare → avvisata (la banca ha mandato l'avviso RiBa) →
-- pagata; oppure da_bloccare → richiamata; oppure insoluta. «Passata»,
-- «in arrivo», «futura» non si scrivono: si calcolano dalla data, nella vista.
-- Lo stato registrato lo scrive una persona, e resta chi e quando.
--
-- COSTO E RATE NEI DUE SENSI, senza rincorrersi:
--   · tutte le rate di un costo pagate → il costo è pagato (alla data
--     dell'ultima); una rata che torna indietro → il costo non è più pagato;
--   · il costo segnato pagato dalla pagina Costi (o dalla banca) → le sue rate
--     ancora aperte diventano pagate; segnato NON pagato → tornano da pagare.
-- Un segnale di transazione (`rate_fornitori.da_rata`) impedisce che il
-- secondo giro annulli il primo: togliere il pagamento a UNA RiBa non deve
-- riaprire le altre tre.
--
-- ACCESSI. Le rate non hanno regole loro: le ereditano dal costo. Chi vede il
-- costo vede le sue rate (la lettura passa da `company_costs` con le sue 12
-- regole: amministratori, permesso costi, previsioni, super admin,
-- commercialista). Chi può modificare il costo può cambiare stato, data e
-- nota di una rata — e solo quelle colonne: importo e appartenenza vengono dal
-- documento. Le rate le crea il sistema, non il browser.
--
-- Questa migrazione è solo struttura e regole, apposta: su questo progetto
-- CREATE POLICY blocca l'accesso al login finché la transazione non finisce
-- (vedi memoria «CREATE POLICY blocca auth»). Il riempimento delle rate dei
-- costi già esistenti sta nella migrazione successiva, senza regole.
--
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ── 1. La tabella ───────────────────────────────────────────────────────────

create table if not exists public.rate_fornitori (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies(id) on delete cascade,
  company_cost_id     uuid not null references public.company_costs(id) on delete cascade,
  -- La fattura che ha portato la rata. Se la fattura sparisce, sparisce il
  -- documento del debito e le sue rate con lei.
  fattura_ricevuta_id uuid references public.fatture_ricevute(id) on delete cascade,
  numero              integer not null check (numero >= 1),
  -- NULL = la data non la dice nessuno (né l'XML né il costo).
  scadenza            date,
  -- LORDO: è quello che esce dal conto (e che la banca addebita, per una RiBa).
  importo             numeric(14,2) check (importo is null or importo >= 0),
  metodo              text check (metodo is null or metodo in
                        ('bonifico', 'contanti', 'carta', 'riba', 'rid', 'assegno', 'altro')),
  iban                text,
  stato               text not null default 'da_pagare' check (stato in
                        ('da_pagare', 'avvisata', 'da_bloccare', 'richiamata', 'pagata', 'insoluta')),
  -- Può restare NULL anche su una rata pagata: un costo segnato pagato senza
  -- data non diventa pagato «oggi» per finta.
  pagata_il           date,
  -- Da dove viene: le rate dell'XML, la fattura intera, o il costo da solo.
  origine             text not null check (origine in ('xml', 'fattura', 'costo')),
  nota                text,
  stato_cambiato_da   uuid,
  stato_cambiato_il   timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.rate_fornitori is
  'Quando e come si paga un debito verso un fornitore: N rate per (costo, fattura). Ogni RiBa è una riga, col suo stato registrato (da_pagare | avvisata | da_bloccare | richiamata | pagata | insoluta). Il costo di competenza resta uno solo in company_costs.';
comment on column public.rate_fornitori.importo is
  'Lordo: quello che esce dal conto. Per una RiBa, quello che la banca addebita.';
comment on column public.rate_fornitori.stato is
  'Lo stato REGISTRATO da una persona. «In arrivo», «passata», «futura» non si scrivono: si calcolano dalla data in v_riba_fornitori.';

-- La stessa rata della stessa fattura sullo stesso costo una volta sola.
create unique index if not exists rate_fornitori_una_per_numero
  on public.rate_fornitori (company_cost_id,
                            coalesce(fattura_ricevuta_id, '00000000-0000-0000-0000-000000000000'::uuid),
                            numero);
create index if not exists rate_fornitori_scadenza_idx
  on public.rate_fornitori (company_id, scadenza) where stato <> 'pagata';
create index if not exists rate_fornitori_riba_idx
  on public.rate_fornitori (company_id, scadenza) where metodo = 'riba';
create index if not exists rate_fornitori_fattura_idx
  on public.rate_fornitori (fattura_ricevuta_id) where fattura_ricevuta_id is not null;

-- ── 2. Il metodo di pagamento da un codice FatturaPA, scritto una volta ─────

create or replace function public.metodo_da_codice_mp(p_mp text)
returns text language sql immutable set search_path = '' as $fn$
  -- Solo i codici che company_costs_payment_method_check ammette, e solo
  -- quando la corrispondenza è esatta: un vaglia (MP06) o un bollettino (MP07)
  -- non sono bonifici, e restano senza metodo piuttosto che con quello sbagliato.
  select case
           when p_mp in ('MP01', 'MP04')         then 'contanti'
           when p_mp in ('MP02', 'MP03')         then 'assegno'
           when p_mp = 'MP05'                    then 'bonifico'
           when p_mp = 'MP08'                    then 'carta'
           when p_mp = 'MP12'                    then 'riba'
           when p_mp in ('MP19', 'MP20', 'MP21') then 'rid'
           else null
         end
$fn$;
revoke all on function public.metodo_da_codice_mp(text) from public, anon;
grant execute on function public.metodo_da_codice_mp(text) to authenticated, service_role;

-- ── 3. Le rate di una fattura, create dal sistema ───────────────────────────

create or replace function public.crea_rate_fornitore(p_cost uuid, p_fattura uuid)
returns integer
language plpgsql security definer set search_path = '' as $fn$
declare
  c        public.company_costs%rowtype;
  f        public.fatture_ricevute%rowtype;
  v_rate   jsonb := '[]'::jsonb;
  v_r      record;
  v_creati integer := 0;
  v_pagata boolean;
begin
  select * into c from public.company_costs where id = p_cost;
  if not found then return 0; end if;
  if p_fattura is not null then
    select * into f from public.fatture_ricevute where id = p_fattura;
    if not found then return 0; end if;
    -- Una nota di credito non porta rate: riduce un debito, non ne crea.
    if coalesce(f.tipo_documento, '') in ('TD04', 'passive_credit_note') then
      return 0;
    end if;
  end if;

  -- Idempotente: le rate di questa fattura su questo costo si creano una volta.
  if exists (
    select 1 from public.rate_fornitori r
     where r.company_cost_id = p_cost
       and r.fattura_ricevuta_id is not distinct from p_fattura
  ) then
    return 0;
  end if;

  v_pagata := coalesce(c.is_paid, false);

  if p_fattura is not null and f.xml_raw is not null then
    v_rate := public.rate_pagamento_da_xml(f.xml_raw, f.indice_corpo);
  end if;

  if jsonb_array_length(v_rate) > 0 then
    for v_r in
      select e, ordinale::int as n
        from jsonb_array_elements(v_rate) with ordinality as x(e, ordinale)
    loop
      insert into public.rate_fornitori
        (company_id, company_cost_id, fattura_ricevuta_id, numero, scadenza, importo,
         metodo, iban, stato, pagata_il, origine)
      values
        (c.company_id, p_cost, p_fattura, v_r.n,
         (v_r.e->>'scadenza')::date,
         -- una rata sola senza importo nell'XML: è il totale della fattura
         coalesce((v_r.e->>'importo')::numeric,
                  case when jsonb_array_length(v_rate) = 1 then f.totale_documento end),
         coalesce(public.metodo_da_codice_mp(v_r.e->>'modalita'), c.payment_method),
         v_r.e->>'iban',
         case when v_pagata then 'pagata' else 'da_pagare' end,
         case when v_pagata then c.paid_date end,
         'xml');
      v_creati := v_creati + 1;
    end loop;
  else
    -- Niente rate nell'XML (o niente XML): una rata, quella del documento.
    insert into public.rate_fornitori
      (company_id, company_cost_id, fattura_ricevuta_id, numero, scadenza, importo,
       metodo, stato, pagata_il, origine)
    values
      (c.company_id, p_cost, p_fattura, 1,
       nullif(c.due_date, date '9999-12-31'),
       coalesce(case when p_fattura is not null then f.totale_documento end,
                round(c.amount * (1 + coalesce(c.vat_rate, 0) / 100.0), 2)),
       c.payment_method,
       case when v_pagata then 'pagata' else 'da_pagare' end,
       case when v_pagata then c.paid_date end,
       case when p_fattura is not null then 'fattura' else 'costo' end);
    v_creati := 1;
  end if;

  return v_creati;
end
$fn$;

comment on function public.crea_rate_fornitore(uuid, uuid) is
  'Crea le rate di una fattura su un costo: dall''XML (una per DettaglioPagamento) o, se non ci sono, una rata col totale del documento. Idempotente. Se il costo è già pagato le rate nascono pagate.';
revoke all on function public.crea_rate_fornitore(uuid, uuid) from public, anon, authenticated;
grant execute on function public.crea_rate_fornitore(uuid, uuid) to service_role;

-- ── 4. Quando una fattura diventa (o smette di essere) un costo ─────────────

create or replace function public.rate_fornitori_da_fattura()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  if tg_op = 'UPDATE' and old.company_cost_id is not null
     and old.company_cost_id is distinct from new.company_cost_id then
    if new.company_cost_id is null then
      -- La fattura non è più quel costo: le sue rate non hanno più senso lì.
      delete from public.rate_fornitori
       where fattura_ricevuta_id = new.id and company_cost_id = old.company_cost_id;
    else
      -- Spostata su un altro costo: le rate la seguono, coi loro stati.
      update public.rate_fornitori
         set company_cost_id = new.company_cost_id, updated_at = now()
       where fattura_ricevuta_id = new.id and company_cost_id = old.company_cost_id;
    end if;
  end if;

  if new.company_cost_id is not null then
    perform public.crea_rate_fornitore(new.company_cost_id, new.id);
  end if;
  return new;
end
$fn$;
revoke all on function public.rate_fornitori_da_fattura() from public, anon, authenticated;

drop trigger if exists trg_rate_fornitori_da_fattura on public.fatture_ricevute;
create trigger trg_rate_fornitori_da_fattura
  after insert or update of company_cost_id on public.fatture_ricevute
  for each row execute function public.rate_fornitori_da_fattura();

-- ── 5. Chi e quando, su ogni cambio di stato ────────────────────────────────

create or replace function public.rate_fornitori_prima_di_salvare()
returns trigger language plpgsql set search_path = '' as $fn$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and new.stato is distinct from old.stato then
    new.stato_cambiato_da := auth.uid();
    new.stato_cambiato_il := now();
    if new.stato = 'pagata' and new.pagata_il is null then
      -- segnata pagata ora da una persona: se non dice quando, è oggi
      new.pagata_il := (now() at time zone 'Europe/Rome')::date;
    elsif new.stato <> 'pagata' then
      new.pagata_il := null;
    end if;
  end if;
  return new;
end
$fn$;
revoke all on function public.rate_fornitori_prima_di_salvare() from public, anon, authenticated;

drop trigger if exists trg_rate_fornitori_prima_di_salvare on public.rate_fornitori;
create trigger trg_rate_fornitori_prima_di_salvare
  before insert or update on public.rate_fornitori
  for each row execute function public.rate_fornitori_prima_di_salvare();

-- ── 6. Rate → costo: tutte pagate vuol dire costo pagato ────────────────────

create or replace function public.rate_fornitori_allinea_costo()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare
  v_cost       uuid := coalesce(new.company_cost_id, old.company_cost_id);
  v_aperte     integer;
  v_totali     integer;
  v_ultima     date;
  v_is_paid    boolean;
begin
  select count(*) filter (where stato <> 'pagata'), count(*), max(pagata_il)
    into v_aperte, v_totali, v_ultima
    from public.rate_fornitori where company_cost_id = v_cost;
  if v_totali = 0 then
    return null;
  end if;

  select is_paid into v_is_paid from public.company_costs where id = v_cost;

  -- Il segnale dice al trigger dei costi che il cambio viene da qui, e non
  -- deve ripercuotersi sulle altre rate.
  perform set_config('rate_fornitori.da_rata', 'on', true);
  if v_aperte = 0 and not coalesce(v_is_paid, false) then
    update public.company_costs
       set is_paid = true, paid_date = v_ultima, updated_at = now()
     where id = v_cost;
  elsif v_aperte > 0 and coalesce(v_is_paid, false) then
    update public.company_costs
       set is_paid = false, paid_date = null, updated_at = now()
     where id = v_cost;
  end if;
  perform set_config('rate_fornitori.da_rata', 'off', true);
  return null;
end
$fn$;
revoke all on function public.rate_fornitori_allinea_costo() from public, anon, authenticated;

drop trigger if exists trg_rate_fornitori_allinea_costo on public.rate_fornitori;
create trigger trg_rate_fornitori_allinea_costo
  after insert or update of stato, pagata_il or delete on public.rate_fornitori
  for each row execute function public.rate_fornitori_allinea_costo();

-- ── 7. Costo → rate: segnato pagato dalla pagina Costi o dalla banca ────────

create or replace function public.costo_allinea_rate_fornitori()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  -- Il cambio viene da una rata: le altre rate restano come sono.
  if current_setting('rate_fornitori.da_rata', true) = 'on' then
    return null;
  end if;
  if new.is_paid is not distinct from old.is_paid then
    return null;
  end if;

  if coalesce(new.is_paid, false) then
    update public.rate_fornitori
       set stato = 'pagata', pagata_il = coalesce(new.paid_date, pagata_il)
     where company_cost_id = new.id and stato <> 'pagata';
  else
    update public.rate_fornitori
       set stato = 'da_pagare', pagata_il = null
     where company_cost_id = new.id and stato = 'pagata';
  end if;
  return null;
end
$fn$;
revoke all on function public.costo_allinea_rate_fornitori() from public, anon, authenticated;

drop trigger if exists trg_costo_allinea_rate_fornitori on public.company_costs;
create trigger trg_costo_allinea_rate_fornitori
  after update of is_paid on public.company_costs
  for each row execute function public.costo_allinea_rate_fornitori();

-- ── 8. Accessi: le regole del costo, ereditate ──────────────────────────────

-- Chi può MODIFICARE un costo: le regole di scrittura di company_costs, scritte
-- una volta. La LETTURA invece non si ricopia: passa da company_costs stessa.
create or replace function public.puo_modificare_costo(p_cost uuid)
returns boolean language sql stable security definer set search_path = '' as $fn$
  select exists (
    select 1 from public.company_costs c
     where c.id = p_cost
       and (
            public.has_role((select auth.uid()), 'super_admin'::public.app_role)
         or (public.has_role((select auth.uid()), 'company_admin'::public.app_role)
             and c.company_id = public.get_user_company_id((select auth.uid())))
         or (c.company_id in (select unnest(public.aziende_con_permesso('can_view_costs')))
             and not public.utente_sola_lettura(c.company_id))
         or public.user_can_write_accountant_company(c.company_id)
       )
  )
$fn$;
comment on function public.puo_modificare_costo(uuid) is
  'Le regole di scrittura di company_costs (super admin, amministratore, permesso costi non in sola lettura, commercialista con scrittura), scritte una volta per le tabelle che dipendono da un costo.';
revoke all on function public.puo_modificare_costo(uuid) from public, anon;
grant execute on function public.puo_modificare_costo(uuid) to authenticated, service_role;

alter table public.rate_fornitori enable row level security;

revoke all on public.rate_fornitori from public, anon, authenticated;
grant select on public.rate_fornitori to authenticated;
-- Dal browser si cambiano solo stato, data del pagamento, scadenza e nota.
grant update (stato, pagata_il, scadenza, nota) on public.rate_fornitori to authenticated;
grant all on public.rate_fornitori to service_role;

-- Stesso nome di quella che l'evento `check_rls_on_create_table` aggiunge da
-- solo alle tabelle nuove: così non nascono due regole uguali.
drop policy if exists rate_fornitori_blocco_utente_bloccato on public.rate_fornitori;
drop policy if exists blocco_utente_bloccato on public.rate_fornitori;
create policy blocco_utente_bloccato on public.rate_fornitori
  as restrictive for all to authenticated
  using (not (select public.utente_bloccato()))
  with check (not (select public.utente_bloccato()));

drop policy if exists rate_fornitori_lettura on public.rate_fornitori;
create policy rate_fornitori_lettura on public.rate_fornitori for select to authenticated
  using (exists (select 1 from public.company_costs c where c.id = rate_fornitori.company_cost_id));

drop policy if exists rate_fornitori_modifica on public.rate_fornitori;
create policy rate_fornitori_modifica on public.rate_fornitori for update to authenticated
  using (public.puo_modificare_costo(company_cost_id))
  with check (public.puo_modificare_costo(company_cost_id));

-- Il registro delle azioni degli utenti, come sulle altre tabelle.
drop trigger if exists trg_registra_azione_utente on public.rate_fornitori;
create trigger trg_registra_azione_utente
  after insert or update or delete on public.rate_fornitori
  for each row execute function public.registra_azione_utente();
