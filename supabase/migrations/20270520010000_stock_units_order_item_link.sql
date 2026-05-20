-- ─────────────────────────────────────────────────────────────────────────────
-- stock_units: link diretto a RIGA commessa (non solo a commessa)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Caso d'uso fotovoltaico: una commessa può avere 2 righe articoli con stesso
-- tipo (es. "12 pannelli SunPower per tetto Nord" + "8 pannelli SunPower per
-- tetto Sud"). Oggi `stock_units.reserved_order_id` punta solo alla commessa,
-- non distingue quale RIGA articolo → impossibile sapere quale seriale va su
-- quale parte del cantiere.
--
-- Fix additivo:
-- - `reserved_order_item_id`: FK opzionale a `order_items.id` per riserva
-- - `delivered_order_item_id`: FK opzionale a `order_items.id` per consegna
-- - Index su entrambi per join veloce (drill-down "seriali assegnati a riga X")
--
-- Backward compat: colonne nullable, codice esistente continua a funzionare
-- guardando solo `reserved_order_id`. Il link order_item è SOPRA-set di
-- granularità: chi vuole può usarlo, chi no resta sul comportamento attuale.
-- Idempotente (IF NOT EXISTS).

ALTER TABLE public.stock_units
  ADD COLUMN IF NOT EXISTS reserved_order_item_id UUID
    REFERENCES public.order_items(id) ON DELETE SET NULL;

ALTER TABLE public.stock_units
  ADD COLUMN IF NOT EXISTS delivered_order_item_id UUID
    REFERENCES public.order_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS stock_units_reserved_order_item_idx
  ON public.stock_units (reserved_order_item_id)
  WHERE reserved_order_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS stock_units_delivered_order_item_idx
  ON public.stock_units (delivered_order_item_id)
  WHERE delivered_order_item_id IS NOT NULL;

COMMENT ON COLUMN public.stock_units.reserved_order_item_id IS
  'FK opzionale alla riga commessa specifica a cui questo seriale è riservato. Più granulare di reserved_order_id quando una commessa ha più righe con stesso articolo tipo.';
COMMENT ON COLUMN public.stock_units.delivered_order_item_id IS
  'FK opzionale alla riga commessa specifica a cui questo seriale è stato consegnato/installato.';
