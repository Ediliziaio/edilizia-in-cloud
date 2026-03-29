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
