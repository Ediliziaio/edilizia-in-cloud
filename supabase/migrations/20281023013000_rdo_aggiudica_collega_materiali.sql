-- ════════════════════════════════════════════════════════════════════════════
-- Aggiudicazione di una richiesta d'offerta: le righe dell'ordine si collegano
-- ai materiali della commessa
-- ════════════════════════════════════════════════════════════════════════════
-- I materiali della commessa chiesti in offerta da «Acquisti da fare» o dalla
-- scheda materiali portano order_items.supplier_rfq_item_id (20281023011000).
-- rdo_aggiudica (20281022223000) crea l'ordine e le sue righe ma non riempiva
-- purchase_order_items.order_item_id: la commessa non vedeva quei materiali
-- come ordinati né, poi, consegnati.
--
-- Qui si cambia soltanto l'inserimento delle righe dell'ordine, che prende
-- l'order_item_id dal materiale legato alla riga della richiesta. Il resto
-- della funzione resta com'è: si sostituisce il testo esatto dentro la sua
-- definizione, e se il testo non c'è più la migrazione si ferma senza toccare
-- niente. Idempotente: alla seconda esecuzione il collegamento c'è già.
-- ════════════════════════════════════════════════════════════════════════════

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

DO $$
DECLARE
  def text := pg_get_functiondef('public.rdo_aggiudica(uuid, text)'::regprocedure);
  vecchio_campi text := 'purchase_order_id, company_id, description, quantity, unit_of_measure,
    unit_price, discount_percent, vat_rate, sku
  )
  select v_po_id, v_rfq.company_id, i.descrizione, i.quantita, coalesce(i.unita_misura, ''pz''),
         q.prezzo_unitario, coalesce(q.sconto_percentuale, 0),
         coalesce(q.aliquota_iva, 22), i.sku
    from public.supplier_rfq_items i
    join public.supplier_rfq_quotes q
      on q.rfq_item_id = i.id and q.rfq_supplier_id = v_fornitore.id';
  nuovo_campi text := 'purchase_order_id, company_id, description, quantity, unit_of_measure,
    unit_price, discount_percent, vat_rate, sku, order_item_id
  )
  select v_po_id, v_rfq.company_id, i.descrizione, i.quantita, coalesce(i.unita_misura, ''pz''),
         q.prezzo_unitario, coalesce(q.sconto_percentuale, 0),
         coalesce(q.aliquota_iva, 22), i.sku,
         (select oi.id from public.order_items oi
           where oi.supplier_rfq_item_id = i.id and oi.company_id = v_rfq.company_id
           limit 1)
    from public.supplier_rfq_items i
    join public.supplier_rfq_quotes q
      on q.rfq_item_id = i.id and q.rfq_supplier_id = v_fornitore.id';
BEGIN
  IF position('oi.supplier_rfq_item_id = i.id' in def) > 0 THEN
    RAISE NOTICE 'rdo_aggiudica collega già i materiali: niente da fare';
    RETURN;
  END IF;
  IF position(vecchio_campi in def) = 0 THEN
    RAISE EXCEPTION 'rdo_aggiudica è cambiata: testo da sostituire non trovato, migrazione da rivedere';
  END IF;
  EXECUTE replace(def, vecchio_campi, nuovo_campi);
END $$;
