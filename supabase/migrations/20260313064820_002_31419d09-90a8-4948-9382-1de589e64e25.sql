ALTER TABLE anagrafiche_native
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;
