-- Bonifico parlante dalla banca: l'accredito netto salda la fattura al lordo e registra la ritenuta
-- (lotto 2 di docs/piano-costi-commessa.md, 01/11/2026).
--
-- Prima: riconciliando un bonifico parlante (bonus edilizi) la banca accredita il lordo meno la ritenuta
-- d'acconto (11%, 8% prima del 01/03/2024, su lordo/1,22). riconcilia_bonifico_fattura registrava come
-- incasso il netto: la fattura restava pagata in parte per sempre, la rata della commessa da incassare, e
-- la ritenuta subita (credito d'imposta) non si registrava. registra_bonifico_parlante faceva la cosa
-- giusta, ma solo a mano dal Registro incassi, e senza collegare il movimento della banca.
--
-- Ora riconcilia_bonifico_parlante(movimento, fattura): controlla che l'accredito sia il residuo della
-- fattura meno la ritenuta prevista (meno al più qualche euro di commissioni), chiama
-- registra_bonifico_parlante (incasso LORDO sulla fattura, netto in prima nota, riga in
-- ritenute_bonifici) e collega il movimento della banca come riconcilia_bonifico_fattura. Idempotente: la
-- richiesta prende l'id del movimento, rifatta due volte restituisce lo stesso incasso.
-- Solo chi può fare scritture fiscali (amministratori): lo controlla registra_bonifico_parlante.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.riconcilia_bonifico_parlante(p_transaction_id uuid, p_documento_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record; d record;
  v_residuo numeric; v_aliquota numeric; v_ritenuta numeric; v_netto_atteso numeric; v_commissioni numeric;
  v_banca text; v_rif text; v_richiesta uuid; v_rit uuid; v_mov uuid; v_scad uuid;
begin
  select bt.id, bt.company_id, bt.amount, bt.transaction_type, bt.booking_date, bt.description, bt.reference,
         bt.linked_invoice_id, bt.linked_installment_id, bt.linked_scadenza_id, bt.linked_cost_id,
         coalesce(nullif(btrim(ba.display_name), ''), nullif(btrim(ba.account_name), ''), 'Banca') as banca
    into t
    from public.bank_transactions bt
    left join public.bank_accounts ba on ba.id = bt.account_id
   where bt.id = p_transaction_id
   for update of bt;
  if not found then raise exception 'Movimento bancario non trovato' using errcode = 'P0002'; end if;
  if auth.uid() is not null and (public.user_can_access_company(t.company_id) is not true
                                 or not public.puo_incassare_fatture(t.company_id)) then
    raise exception 'Accesso negato' using errcode = '42501';
  end if;
  if t.transaction_type <> 'credit' or t.amount <= 0 then
    raise exception 'Un bonifico parlante è un accredito.' using errcode = '22023';
  end if;
  if t.linked_invoice_id is not null or t.linked_installment_id is not null
     or t.linked_scadenza_id is not null or t.linked_cost_id is not null
     or exists (select 1 from public.bank_reconciliations r where r.transaction_id = t.id and r.unmatched_at is null) then
    raise exception 'Questo movimento bancario è già abbinato.' using errcode = '23505';
  end if;

  select id, company_id, numero, stato, totale_da_pagare, importo_pagato into d
    from public.documenti_fiscali where id = p_documento_id and deleted_at is null;
  if not found or d.company_id <> t.company_id then raise exception 'Fattura non trovata' using errcode = 'P0002'; end if;

  v_residuo := round(coalesce(d.totale_da_pagare, 0) - coalesce(d.importo_pagato, 0)
                     - public.documento_stornato_totale(d.id), 2);
  if v_residuo <= 0 then raise exception 'La fattura n. % è già pagata.', d.numero using errcode = '22023'; end if;
  v_aliquota := case when t.booking_date < date '2024-03-01' then 8 else 11 end;
  v_ritenuta := round(v_residuo / 1.22 * v_aliquota / 100, 2);
  v_netto_atteso := v_residuo - v_ritenuta;
  v_commissioni := round(v_netto_atteso - t.amount, 2);
  -- Qualche euro di commissioni bancarie sì; un importo diverso no: non è il bonifico parlante di questa fattura.
  if v_commissioni < 0 or v_commissioni > greatest(10, round(v_residuo * 0.005, 2)) then
    raise exception 'L''accredito (% €) non è il residuo della fattura n. % meno la ritenuta del % per cento (% €).',
      t.amount, d.numero, v_aliquota, v_netto_atteso using errcode = '22023';
  end if;

  v_banca := left(t.banca, 160);
  v_rif := left(coalesce(nullif(btrim(t.reference), ''), nullif(btrim(t.description), ''), 'Movimento ' || t.id::text), 200);
  if length(v_rif) < 5 then v_rif := 'Movimento ' || t.id::text; end if;
  v_richiesta := md5('bonifico-parlante:' || t.id::text)::uuid;

  v_rit := public.registra_bonifico_parlante(t.company_id, d.id, v_residuo, v_ritenuta, v_commissioni, t.amount,
                                             t.booking_date, v_banca, v_rif, v_richiesta, true);
  select movimento_id into v_mov from public.ritenute_bonifici where id = v_rit;

  update public.prima_nota_entries set bank_transaction_id = t.id where movimento_id = v_mov;
  select id into v_scad from public.scadenze
   where company_id = d.company_id and notes like '%[DOC:' || d.id::text || ']%' and status <> 'annullata' limit 1;
  update public.bank_transactions
     set linked_scadenza_id = v_scad, reconciliation_status = 'reconciled', reconciled_at = now()
   where id = t.id;
  if not exists (select 1 from public.bank_reconciliations r where r.transaction_id = t.id and r.unmatched_at is null) then
    insert into public.bank_reconciliations (company_id, transaction_id, scadenza_id, movimento_id, matched_amount,
                                             match_type, matched_at, matched_by, notes)
    values (d.company_id, t.id, v_scad, v_mov, t.amount, 'bonifico_parlante', now(), auth.uid(),
            'Fattura n. ' || d.numero || ' · lordo ' || v_residuo || ' · ritenuta ' || v_ritenuta || ' (' || v_aliquota || '%)');
  end if;
  return v_mov;
end $$;
revoke all on function public.riconcilia_bonifico_parlante(uuid, uuid) from public, anon;
grant execute on function public.riconcilia_bonifico_parlante(uuid, uuid) to authenticated, service_role;
