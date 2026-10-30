-- ════════════════════════════════════════════════════════════════════════════
-- La lista della spesa del magazzino arriva a Costi e previsionale
-- ════════════════════════════════════════════════════════════════════════════
-- Richiesta di Florin del 29/10/2026: «sì, collegala» (le voci della lista
-- della spesa ai Costi e al previsionale, senza contarle due volte con gli ODA).
-- Seguito di 20281029305000_acquisti_a_mano.
--
-- La regola:
--   · una voce DA ORDINARE è un'idea: nessun costo;
--   · ORDINATA (o in arrivo, o arrivata) è un debito verso il fornitore: un
--     costo in `company_costs` (materiali, una volta, senza commessa) con le sue
--     rate in `rate_fornitori` — una sola, o acconto + saldo (50/50, 30/70) con
--     le date scritte nella lista. Le rate sono già lette dal previsionale e
--     tengono allineati «pagato» e scadenza del costo (trigger esistenti);
--   · un pagamento segnato nella lista va sulle rate; un pagamento registrato
--     nei Costi torna nella lista (acconto/saldo/pagato);
--   · tornare «da ordinare» o cancellare la voce toglie il costo, se non c'è
--     ancora niente di pagato; se qualcosa è pagato, il costo resta (sono soldi
--     usciti) e la voce perde solo il collegamento.
--
-- Doppioni con gli ODA: nessuno. Una voce della lista non è un ordine
-- d'acquisto (non ha purchase_order_id) e gli ODA non passano di qui. Resta un
-- limite: se la fattura del fornitore di una voce viene registrata, nasce un
-- secondo costo — la fattura non sa di quale voce è.
--
-- Il segnale di transazione `acquisti_a_mano.da_costo` impedisce il giro
-- lista → rate → lista. Idempotente. Nessuna regola d'accesso creata.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.acquisti_a_mano
  add column if not exists company_cost_id uuid references public.company_costs(id) on delete set null;
create unique index if not exists acquisti_a_mano_un_costo
  on public.acquisti_a_mano (company_cost_id) where company_cost_id is not null;

-- I metodi della lista (anche quelli delle commesse: 50_50, bonifico_unico…)
-- nei soli valori ammessi da company_costs e rate_fornitori.
create or replace function public.metodo_costo_da_lista(p text)
returns text language sql immutable set search_path = '' as $fn$
  select case
    when p in ('bonifico', 'bonifico_unico', '50_50', '30_70') then 'bonifico'
    when p in ('contanti', 'carta', 'riba', 'rid', 'assegno', 'altro') then p
    else null
  end
$fn$;
revoke all on function public.metodo_costo_da_lista(text) from public, anon;
grant execute on function public.metodo_costo_da_lista(text) to authenticated, service_role;

-- ── 1. Lista → costo e rate ─────────────────────────────────────────────────

create or replace function public.acquisto_a_mano_allinea_costo()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare
  v_cost     uuid := new.company_cost_id;
  v_netto    numeric := round(new.quantita * new.costo_unitario, 2);
  v_lordo    numeric := round(new.quantita * new.costo_unitario * (1 + new.aliquota_iva / 100), 2);
  v_acconto  numeric;
  v_due_rate boolean := new.termine_pagamento in ('acconto_saldo', '30_70');
  v_quota    numeric := case when new.termine_pagamento = '30_70' then 0.3 else 0.5 end;
  v_pagate   integer := 0;
  v_metodo   text := public.metodo_costo_da_lista(new.metodo_pagamento);
  v_prima    date;
begin
  if current_setting('acquisti_a_mano.da_costo', true) = 'on' then
    return null;
  end if;

  if v_cost is not null then
    select count(*) into v_pagate from public.rate_fornitori
     where company_cost_id = v_cost and stato = 'pagata';
  end if;

  -- Da ordinare, o senza importo: niente debito. Il costo se ne va se non c'è
  -- niente di pagato; altrimenti resta e la voce si scollega.
  if new.stato = 'da_ordinare' or v_netto <= 0 then
    if v_cost is not null then
      perform set_config('acquisti_a_mano.da_costo', 'on', true);
      if v_pagate = 0 then
        delete from public.company_costs where id = v_cost;
      end if;
      update public.acquisti_a_mano set company_cost_id = null where id = new.id;
      perform set_config('acquisti_a_mano.da_costo', 'off', true);
    end if;
    return null;
  end if;

  v_prima := case when v_due_rate then new.acconto_previsto_il else new.pagamento_previsto_il end;

  -- Da qui le rate cambiano per mano della lista: il loro trigger non deve
  -- riscrivere la lista (e riaccendere questo).
  perform set_config('acquisti_a_mano.da_costo', 'on', true);

  if v_cost is null then
    insert into public.company_costs (
      company_id, name, cost_type, amount, vat_rate, category, recurrence,
      due_date, is_paid, supplier_id, payment_method, notes
    ) values (
      new.company_id, 'Acquisto: ' || new.nome, 'variable', v_netto, new.aliquota_iva, 'materiali', 'once',
      coalesce(v_prima, date '9999-12-31'), false, new.supplier_id, v_metodo,
      'Dalla lista acquisti del magazzino'
    ) returning id into v_cost;
    update public.acquisti_a_mano set company_cost_id = v_cost where id = new.id;
  else
    update public.company_costs
       set name = 'Acquisto: ' || new.nome, amount = v_netto, vat_rate = new.aliquota_iva,
           supplier_id = new.supplier_id, payment_method = v_metodo, updated_at = now()
     where id = v_cost;
  end if;

  -- Le rate: una sola, o acconto + saldo. Lo stato viene dalla lista; uno
  -- stato registrato nei Costi (RiBa avvisata…) resta se la lista non dice
  -- «pagata».
  v_acconto := round(v_lordo * v_quota, 2);
  insert into public.rate_fornitori (company_id, company_cost_id, numero, scadenza, importo, metodo, stato, pagata_il, origine, nota)
  select new.company_id, v_cost, x.numero, x.scadenza, x.importo, v_metodo,
         case when x.pagata then 'pagata' else 'da_pagare' end,
         case when x.pagata then x.pagata_il end, 'costo', x.nota
    from (values
      (1, case when v_due_rate then new.acconto_previsto_il else new.pagamento_previsto_il end,
          case when v_due_rate then v_acconto else v_lordo end,
          case when v_due_rate then new.acconto_pagato else new.pagato end,
          case when v_due_rate then null else new.pagato_il end,
          case when v_due_rate then 'Acconto' end),
      (2, new.saldo_previsto_il, v_lordo - v_acconto, new.saldo_pagato, null::date, 'Saldo')
    ) as x(numero, scadenza, importo, pagata, pagata_il, nota)
   where x.numero = 1 or v_due_rate
  on conflict (company_cost_id, coalesce(fattura_ricevuta_id, '00000000-0000-0000-0000-000000000000'::uuid), numero)
  do update set
    scadenza  = excluded.scadenza,
    importo   = excluded.importo,
    metodo    = excluded.metodo,
    nota      = excluded.nota,
    stato     = case when excluded.stato = 'pagata' then 'pagata'
                     when rate_fornitori.stato = 'pagata' then 'da_pagare'
                     else rate_fornitori.stato end,
    pagata_il = case when excluded.stato = 'pagata' then coalesce(excluded.pagata_il, rate_fornitori.pagata_il) end;

  -- Passando da acconto+saldo a una rata sola, il saldo non c'è più.
  if not v_due_rate then
    delete from public.rate_fornitori where company_cost_id = v_cost and numero > 1;
  end if;

  perform set_config('acquisti_a_mano.da_costo', 'off', true);
  return null;
end
$fn$;
revoke all on function public.acquisto_a_mano_allinea_costo() from public, anon, authenticated;

drop trigger if exists trg_acquisto_a_mano_allinea_costo on public.acquisti_a_mano;
create trigger trg_acquisto_a_mano_allinea_costo
  after insert or update of stato, quantita, costo_unitario, aliquota_iva, supplier_id, metodo_pagamento,
    termine_pagamento, pagamento_previsto_il, pagato, pagato_il, acconto_pagato, acconto_previsto_il,
    saldo_pagato, saldo_previsto_il, nome
  on public.acquisti_a_mano
  for each row execute function public.acquisto_a_mano_allinea_costo();

-- ── 2. Voce cancellata: il costo se ne va se non c'è niente di pagato ────────

create or replace function public.acquisto_a_mano_via_il_costo()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  if old.company_cost_id is not null
     and not exists (select 1 from public.rate_fornitori
                      where company_cost_id = old.company_cost_id and stato = 'pagata') then
    delete from public.company_costs where id = old.company_cost_id;
  end if;
  return null;
end
$fn$;
revoke all on function public.acquisto_a_mano_via_il_costo() from public, anon, authenticated;

drop trigger if exists trg_acquisto_a_mano_via_il_costo on public.acquisti_a_mano;
create trigger trg_acquisto_a_mano_via_il_costo
  after delete on public.acquisti_a_mano
  for each row execute function public.acquisto_a_mano_via_il_costo();

-- ── 3. Rate → lista: un pagamento registrato nei Costi torna nella voce ──────

create or replace function public.rate_fornitori_allinea_acquisto_a_mano()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare
  v_voce   public.acquisti_a_mano%rowtype;
  v_r1     public.rate_fornitori%rowtype;
  v_r2     public.rate_fornitori%rowtype;
begin
  if current_setting('acquisti_a_mano.da_costo', true) = 'on' then
    return null;
  end if;
  select * into v_voce from public.acquisti_a_mano where company_cost_id = new.company_cost_id;
  if not found then
    return null;
  end if;
  select * into v_r1 from public.rate_fornitori where company_cost_id = new.company_cost_id and numero = 1;
  select * into v_r2 from public.rate_fornitori where company_cost_id = new.company_cost_id and numero = 2;

  perform set_config('acquisti_a_mano.da_costo', 'on', true);
  if v_voce.termine_pagamento in ('acconto_saldo', '30_70') then
    update public.acquisti_a_mano
       set acconto_pagato = coalesce(v_r1.stato = 'pagata', acconto_pagato),
           saldo_pagato   = coalesce(v_r2.stato = 'pagata', saldo_pagato)
     where id = v_voce.id;
  else
    update public.acquisti_a_mano
       set pagato    = coalesce(v_r1.stato = 'pagata', pagato),
           pagato_il = case when v_r1.stato = 'pagata' then coalesce(v_r1.pagata_il, pagato_il) end
     where id = v_voce.id;
  end if;
  perform set_config('acquisti_a_mano.da_costo', 'off', true);
  return null;
end
$fn$;
revoke all on function public.rate_fornitori_allinea_acquisto_a_mano() from public, anon, authenticated;

drop trigger if exists trg_rate_fornitori_allinea_acquisto_a_mano on public.rate_fornitori;
create trigger trg_rate_fornitori_allinea_acquisto_a_mano
  after update of stato, pagata_il on public.rate_fornitori
  for each row execute function public.rate_fornitori_allinea_acquisto_a_mano();

-- ── 4. Le voci che ci sono già ──────────────────────────────────────────────

update public.acquisti_a_mano set stato = stato where stato <> 'da_ordinare';

comment on column public.acquisti_a_mano.company_cost_id is
  'Il costo della voce, creato quando la voce è ordinata (acquisto_a_mano_allinea_costo). Le rate in rate_fornitori.';
