-- ============================================================
-- Fix: Add missing anno_corrente_fattura column
-- The migration 20260801000001 referenced anno_corrente_fattura
-- in genera_numero_documento_native but never created the column.
-- This caused a 400 error when trying to create invoices.
-- ============================================================

-- 1. Add the missing column, defaulting from existing anno_corrente
ALTER TABLE public.anagrafica_azienda
  ADD COLUMN IF NOT EXISTS anno_corrente_fattura INTEGER;

-- 2. Backfill from the original anno_corrente column
UPDATE public.anagrafica_azienda
  SET anno_corrente_fattura = COALESCE(anno_corrente, EXTRACT(YEAR FROM NOW())::INTEGER)
  WHERE anno_corrente_fattura IS NULL;

-- 3. Set default for future rows
ALTER TABLE public.anagrafica_azienda
  ALTER COLUMN anno_corrente_fattura SET DEFAULT EXTRACT(YEAR FROM NOW())::INTEGER;

ALTER TABLE public.anagrafica_azienda
  ALTER COLUMN anno_corrente_fattura SET NOT NULL;
