-- ─────────────────────────────────────────────────────────────────────────────
-- stock_lotti: campi mancanti per form "Nuovo Lotto" completo
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Il dialog WarehouseLottiTab → Nuovo Lotto è incompleto: chiede solo testo
-- libero per articolo/fornitore senza link al catalogo. Conseguenza: i lotti
-- creati lì NON sono associabili a stock_units serializzati (filtro lotto in
-- inventario li ignora).
--
-- Inoltre c'era una seconda tabella warehouse_lotti (legacy) per gli stessi
-- dati con schema diverso. Unifichiamo tutto su stock_lotti aggiungendo i
-- campi che mancano + FK opzionali:
--   articolo:      TEXT (nome libero, retrocompat con warehouse_lotti.articolo)
--   stock_item_id: FK → warehouse_stock (auto-link al catalogo per drill-down)
--   supplier_id:   FK → suppliers (per filtri/report fornitore)
--   warehouse_id:  FK → warehouses (magazzino destinazione)
--
-- Tutti additive nullable: zero breaking change. Codice legacy che usa solo
-- `fornitore` TEXT continua a funzionare; codice nuovo userà gli FK.

ALTER TABLE public.stock_lotti
  ADD COLUMN IF NOT EXISTS articolo TEXT;

ALTER TABLE public.stock_lotti
  ADD COLUMN IF NOT EXISTS stock_item_id UUID
    REFERENCES public.warehouse_stock(id) ON DELETE SET NULL;

ALTER TABLE public.stock_lotti
  ADD COLUMN IF NOT EXISTS supplier_id UUID
    REFERENCES public.suppliers(id) ON DELETE SET NULL;

ALTER TABLE public.stock_lotti
  ADD COLUMN IF NOT EXISTS warehouse_id UUID
    REFERENCES public.warehouses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS stock_lotti_stock_item_idx
  ON public.stock_lotti (stock_item_id)
  WHERE stock_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS stock_lotti_supplier_idx
  ON public.stock_lotti (supplier_id)
  WHERE supplier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS stock_lotti_warehouse_idx
  ON public.stock_lotti (warehouse_id)
  WHERE warehouse_id IS NOT NULL;

COMMENT ON COLUMN public.stock_lotti.articolo IS
  'Nome articolo (testo libero per retrocompat warehouse_lotti). Preferire stock_item_id quando disponibile.';
COMMENT ON COLUMN public.stock_lotti.stock_item_id IS
  'Link opzionale al catalogo warehouse_stock. Quando presente abilita drill-down + auto-detect tracking_mode (fungible/serialized).';
