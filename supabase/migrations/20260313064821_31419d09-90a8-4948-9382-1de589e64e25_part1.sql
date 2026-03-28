ALTER TABLE anagrafiche_native
  ADD COLUMN IF NOT EXISTS sync_from_cliente BOOLEAN NOT NULL DEFAULT false;
