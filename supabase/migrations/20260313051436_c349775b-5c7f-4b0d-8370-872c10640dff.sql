-- ============================================================
-- 1. Fix genera_numero_documento_native: annual reset + proforma counter
-- ============================================================
ALTER TABLE public.anagrafica_azienda 
  ADD COLUMN IF NOT EXISTS ultimo_numero_proforma INTEGER NOT NULL DEFAULT 0;
