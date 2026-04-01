-- ============================================================
-- Migration 04: Data migration — crea magazzino default per
--   ogni company e assegna i record orfani
-- Sprint 1 Multi-Magazzino — Edilizia in Cloud
-- ============================================================

-- 1. Crea magazzino principale (is_default=true) per ogni company
--    che non ne ha ancora uno
INSERT INTO public.warehouses (company_id, name, type, is_default, is_active, position)
SELECT
  c.id,
  'Magazzino Principale',
  'main',
  true,
  true,
  0
FROM public.companies c
WHERE NOT EXISTS (
  SELECT 1 FROM public.warehouses w
  WHERE w.company_id = c.id AND w.is_default = true
);

-- 2. Assegna warehouse_stock orfano al magazzino default della stessa company
UPDATE public.warehouse_stock ws
SET warehouse_id = (
  SELECT w.id FROM public.warehouses w
  WHERE w.company_id = ws.company_id AND w.is_default = true
  LIMIT 1
)
WHERE ws.warehouse_id IS NULL;

-- 3. Assegna warehouse_movements orfani al magazzino del loro stock_item
UPDATE public.warehouse_movements wm
SET warehouse_id = (
  SELECT ws.warehouse_id
  FROM public.warehouse_stock ws
  WHERE ws.id = wm.stock_item_id
  LIMIT 1
)
WHERE wm.warehouse_id IS NULL;

-- 4. Assegna warehouse_sections orfane al magazzino default della stessa company
UPDATE public.warehouse_sections ws
SET warehouse_id = (
  SELECT w.id FROM public.warehouses w
  WHERE w.company_id = ws.company_id AND w.is_default = true
  LIMIT 1
)
WHERE ws.warehouse_id IS NULL;
