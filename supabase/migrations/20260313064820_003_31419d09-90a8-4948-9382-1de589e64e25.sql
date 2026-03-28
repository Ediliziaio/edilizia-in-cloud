-- Partial index for fast joins
CREATE INDEX IF NOT EXISTS idx_anagrafiche_native_cliente_id
  ON anagrafiche_native(cliente_id)
  WHERE cliente_id IS NOT NULL;
