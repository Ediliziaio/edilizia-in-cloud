-- ============================================================
-- LINK BIDIREZIONALE tra marketing_contacts e profiles
-- Sprint 2: Converti in Cliente
-- ============================================================

-- 1. marketing_contacts.customer_profile_id
-- Valorizzato quando il contatto viene convertito in cliente
ALTER TABLE marketing_contacts
  ADD COLUMN IF NOT EXISTS customer_profile_id UUID
  REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_marketing_contacts_customer_profile_id
  ON marketing_contacts(customer_profile_id);

-- 2. profiles.marketing_contact_id
-- Valorizzato al momento della creazione dell'account cliente
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS marketing_contact_id UUID
  REFERENCES marketing_contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_marketing_contact_id
  ON profiles(marketing_contact_id);

COMMENT ON COLUMN marketing_contacts.customer_profile_id IS
  'UUID del profilo cliente EiC generato da questo contatto marketing';

COMMENT ON COLUMN profiles.marketing_contact_id IS
  'UUID del contatto marketing da cui e'' stato generato questo account';
