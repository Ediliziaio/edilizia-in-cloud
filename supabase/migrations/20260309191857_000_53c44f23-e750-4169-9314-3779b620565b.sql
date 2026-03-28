-- =============================================
-- FASE 1: Migrazione DB Correttiva
-- =============================================

-- 1. ALTER TABLE scadenze - campi mancanti
ALTER TABLE public.scadenze 
  ADD COLUMN IF NOT EXISTS order_item_id UUID REFERENCES public.order_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS prima_nota_entry_id UUID REFERENCES public.prima_nota_entries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS alert_days_before INT DEFAULT 7,
  ADD COLUMN IF NOT EXISTS alert_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_auto_generated BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_source TEXT;
