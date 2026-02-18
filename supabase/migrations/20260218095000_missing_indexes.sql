-- =============================================================
-- Performance: indici DB mancanti
--
-- Senza questi indici, le query critiche eseguono full table scan.
-- Con 100 aziende × 1000 ordini × 10.000 costi il degrado è
-- esponenziale — ogni WHERE/JOIN su queste colonne scansiona l'intera
-- tabella invece di usare un B-tree.
-- =============================================================

-- order_items.order_id — critico per tutte le query .in(order_ids)
-- (useMarginData, useCashFlowData, useCompanyCostsData fanno tutte
--  una .in("order_id", [...]) su questa tabella)
CREATE INDEX IF NOT EXISTS idx_order_items_order_id
  ON public.order_items(order_id);

-- order_items.stock_item_id — usato in ogni UPDATE magazzino che
-- scarica un articolo (JOIN tra order_items e warehouse_stock)
CREATE INDEX IF NOT EXISTS idx_order_items_stock_item_id
  ON public.order_items(stock_item_id);

-- warehouse_stock.company_id — ogni apertura della pagina magazzino
-- filtra per company_id; senza indice legge TUTTA la tabella
CREATE INDEX IF NOT EXISTS idx_warehouse_stock_company_id
  ON public.warehouse_stock(company_id);

-- warehouse_movements.stock_item_id — usato nello storico movimenti
-- di ogni articolo; con molti movimenti diventa il collo di bottiglia
CREATE INDEX IF NOT EXISTS idx_warehouse_movements_stock_item_id
  ON public.warehouse_movements(stock_item_id);

-- company_costs(company_id, due_date) — indice composto per i filtri
-- più comuni: "dammi i costi di questa azienda per questo periodo"
-- (useCompanyCostsData ordina per due_date, useCashFlowData filtra
--  per company_id + due_date range)
CREATE INDEX IF NOT EXISTS idx_company_costs_company_due_date
  ON public.company_costs(company_id, due_date);

-- order_external_teams.order_id — usato nelle JOIN di useMarginData
-- e useCashFlowData per recuperare i costi squadre esterne per ordine
CREATE INDEX IF NOT EXISTS idx_order_external_teams_order_id
  ON public.order_external_teams(order_id);
