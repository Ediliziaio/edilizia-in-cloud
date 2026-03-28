-- Add missing columns to warehouse_stock
ALTER TABLE warehouse_stock
  ADD COLUMN IF NOT EXISTS last_delivery_date DATE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_lot_number TEXT DEFAULT NULL;
