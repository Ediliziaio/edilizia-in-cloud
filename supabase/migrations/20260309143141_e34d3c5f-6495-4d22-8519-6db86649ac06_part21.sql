-- ═══════════════════════════════════════════════════════
-- CREATE definitive triggers with unique names (ia_ prefix)
-- ═══════════════════════════════════════════════════════

-- Orders
DROP TRIGGER IF EXISTS ia_order_created ON public.orders;
CREATE TRIGGER ia_order_created
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_internal_automations('order_created', 'order');
