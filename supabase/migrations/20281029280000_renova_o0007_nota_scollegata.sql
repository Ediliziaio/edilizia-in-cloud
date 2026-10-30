-- ════════════════════════════════════════════════════════════════════════════
-- renova O-0007: la nota di credito che storna fatture precedenti esce dalla commessa
-- ════════════════════════════════════════════════════════════════════════════
-- Seguito di 20281029275000_renova_commesse_senza_iva. Deciso da Florin il
-- 29/10/2026 («scollega la nota»).
--
-- O-0007 («porta battente e accessori precedenti», cliente FABIO VETTORI)
-- valeva −19.616,54 €: le erano collegate la fattura FPR 17/26 (2.363 €
-- imponibile, IVA 22%) e la nota di credito FPR 11/26 (20.454 € imponibile),
-- che storna fatture precedenti non presenti su nessuna commessa. Una
-- commessa non vale meno di zero.
--
-- 1. La nota FPR 11/26 perde il collegamento alla commessa (resta in
--    fatturazione, con la sua scadenza; nessun pagamento la tocca). Nella nota
--    resta scritto perché.
-- 2. O-0007 vale l'imponibile della sua fattura: 2.363 € al 22% (lordo
--    2.882,86 €, come la fattura).
-- Solo se i dati sono ancora quelli del 29/10/2026. Nessuna rata su O-0007:
-- il trigger delle date delle rate non ha niente da spostare. Rilanciabile.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '60s';

do $$
declare
  v_az    uuid;
  v_ord   uuid;
  v_nota  integer;
  v_comm  integer;
begin
  select id into v_az from public.companies where name = 'renova solution srl';
  select id into v_ord from public.orders where company_id = v_az and order_code = 'O-0007' and deleted_at is null;
  if v_ord is null then
    raise notice 'O-0007 di renova non c''è: niente da fare';
    return;
  end if;

  update public.invoices
     set order_id = null,
         order_match_origine = null,
         notes = coalesce(notes || E'\n', '') || 'Scollegata dalla commessa O-0007 il 29/10/2026: storna fatture precedenti, non quella commessa.'
   where company_id = v_az
     and order_id = v_ord
     and invoice_number = 'FPR 11/26'
     and document_type = 'credit_note';
  get diagnostics v_nota = row_count;

  update public.orders
     set total_amount = 2363.00, vat_rate = 22
   where id = v_ord
     and total_amount = -19616.54
     and not exists (select 1 from public.invoices i
                      where i.order_id = v_ord and i.document_type = 'credit_note' and i.deleted_at is null);
  get diagnostics v_comm = row_count;

  raise notice 'O-0007: nota scollegata %, importo corretto %', v_nota, v_comm;

  if (select total_amount from public.orders where id = v_ord) < 0 then
    raise exception 'O-0007 ha ancora un importo negativo';
  end if;
end $$;
