-- 5) Replace generic warehouse trigger with stock_below_minimum support
DROP TRIGGER IF EXISTS trg_internal_auto_stock_updated ON warehouse_stock;
