-- ─────────────────────────────────────────────────────────────────────────────
-- order_items: codice articolo + link opzionale al catalogo warehouse_stock
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Requirement utente: il "codice articolo" (presente in DDT e fatture) deve
-- vivere anche sulle righe commessa per facilitare ricerca/match con stock.
-- Es. quando arriva DDT con SKU "SPR-P7-500-BLK" si può fare match automatico
-- con la riga commessa che ha lo stesso product_code.
--
-- Inoltre stock_item_id opzionale link al catalogo magazzino: se presente,
-- il sistema sa che la riga è materialmente tracciata (tracking_mode dal
-- warehouse_stock collegato → seriale/lotto).
--
-- Additive nullable: backward compat 100%. Tutte le righe esistenti continuano
-- a funzionare anche senza codice o link.

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS product_code TEXT;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS stock_item_id UUID
    REFERENCES public.warehouse_stock(id) ON DELETE SET NULL;

-- Index per search-by-code rapido (UI cerca articolo digitando codice).
CREATE INDEX IF NOT EXISTS order_items_product_code_idx
  ON public.order_items (product_code)
  WHERE product_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS order_items_stock_item_idx
  ON public.order_items (stock_item_id)
  WHERE stock_item_id IS NOT NULL;

COMMENT ON COLUMN public.order_items.product_code IS
  'Codice articolo (alias di catalogo, SKU fornitore, codice interno). Tipicamente combacia con warehouse_stock.internal_code o purchase_order_items.sku. Usato per ricerca e match con DDT.';
COMMENT ON COLUMN public.order_items.stock_item_id IS
  'Link opzionale al catalogo magazzino. Se presente, abilita auto-detect tracking_mode (serialized/fungible) e tracciamento per seriale via stock_units.';
