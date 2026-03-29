-- order_external_teams.order_id — usato nelle JOIN di useMarginData
-- e useCashFlowData per recuperare i costi squadre esterne per ordine
CREATE INDEX IF NOT EXISTS idx_order_external_teams_order_id
  ON public.order_external_teams(order_id);
