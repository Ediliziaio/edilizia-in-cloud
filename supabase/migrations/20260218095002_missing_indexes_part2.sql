-- warehouse_stock.company_id — ogni apertura della pagina magazzino
-- filtra per company_id; senza indice legge TUTTA la tabella
CREATE INDEX IF NOT EXISTS idx_warehouse_stock_company_id
  ON public.warehouse_stock(company_id);
