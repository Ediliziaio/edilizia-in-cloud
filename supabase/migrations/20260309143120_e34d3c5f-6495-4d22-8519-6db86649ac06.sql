-- ═══════════════════════════════════════════════════════
-- Drop ALL conflicting triggers from previous migrations
-- ═══════════════════════════════════════════════════════

-- From migration 1 (trg_internal_auto_*)
DROP TRIGGER IF EXISTS trg_internal_auto_order_created ON public.orders;
