-- ═══════════════════════════════════════════════════════
-- Now attach all 9 triggers to the actual tables
-- ═══════════════════════════════════════════════════════

-- 1) Order created
DROP TRIGGER IF EXISTS internal_auto_order_created ON public.orders;
CREATE TRIGGER internal_auto_order_created
  AFTER INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION trigger_internal_automations('order_created', 'order');
