-- Add quantity_available GENERATED column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'warehouse_stock' AND column_name = 'quantity_available'
  ) THEN
    ALTER TABLE warehouse_stock
      ADD COLUMN IF NOT EXISTS quantity_available INTEGER GENERATED ALWAYS AS (GREATEST(0, quantity - quantity_reserved)) STORED;
  END IF;
END $$;
