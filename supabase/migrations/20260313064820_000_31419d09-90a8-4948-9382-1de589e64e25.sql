-- Add optional link from anagrafiche_native to profiles (clienti cantieri)
ALTER TABLE anagrafiche_native
  ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
