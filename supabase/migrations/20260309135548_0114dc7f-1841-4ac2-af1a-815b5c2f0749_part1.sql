-- 2) Replace generic triggers with specific ones for order status
DROP TRIGGER IF EXISTS trg_internal_auto_order_updated ON orders;
