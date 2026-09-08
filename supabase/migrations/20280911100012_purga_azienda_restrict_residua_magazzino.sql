-- Coda di …010, e vale la pena spiegare perche' non c'era gia' li'.
--
-- Portare `warehouse_stock.company_id` a CASCADE (…009) ha ALLARGATO l'insieme
-- delle tabelle che la cancellazione di un'azienda raggiunge. Dentro
-- quell'insieme piu' grande e' finita una RESTRICT che prima era innocua,
-- perche' puntava a una tabella che il cascade non toccava:
-- `warehouse_transfer_items.stock_item_id -> warehouse_stock`.
--
-- E' la lezione da tenere: ogni FK che si porta a CASCADE puo' far comparire
-- un blocco nuovo un livello piu' in la'. Dopo aver toccato le chiavi, la
-- chiusura transitiva va ricalcolata e riletta — non basta rifare la prova su
-- una sola azienda, perche' una tabella vuota per quell'azienda non si vede.
-- Qui infatti le righe sono zero: si sarebbe fatta viva al primo trasferimento
-- di magazzino di un'azienda poi cancellata.
--
-- Stessa regola di …010: da RESTRICT a NO ACTION, protezione invariata per
-- l'utente, controllo spostato a fine istruzione.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.warehouse_transfer_items DROP CONSTRAINT IF EXISTS warehouse_transfer_items_stock_item_id_fkey;
ALTER TABLE public.warehouse_transfer_items ADD  CONSTRAINT warehouse_transfer_items_stock_item_id_fkey
  FOREIGN KEY (stock_item_id) REFERENCES public.warehouse_stock(id);
