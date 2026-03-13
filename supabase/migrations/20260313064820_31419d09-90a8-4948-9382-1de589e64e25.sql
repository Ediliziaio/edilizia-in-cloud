
-- Add optional link from anagrafiche_native to profiles (clienti cantieri)
ALTER TABLE anagrafiche_native
  ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE anagrafiche_native
  ADD COLUMN IF NOT EXISTS sync_from_cliente BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE anagrafiche_native
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

-- Partial index for fast joins
CREATE INDEX IF NOT EXISTS idx_anagrafiche_native_cliente_id
  ON anagrafiche_native(cliente_id)
  WHERE cliente_id IS NOT NULL;

-- Audit log table for reconciliation actions
CREATE TABLE IF NOT EXISTS anagrafica_reconciliation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  anagrafica_id UUID NOT NULL REFERENCES anagrafiche_native(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  performed_by UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON anagrafica_reconciliation_log(company_id, created_at DESC);
CREATE INDEX ON anagrafica_reconciliation_log(anagrafica_id);

-- RLS on reconciliation log
ALTER TABLE anagrafica_reconciliation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_isolation_reconciliation_log"
  ON anagrafica_reconciliation_log
  FOR ALL
  TO authenticated
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- Trigger: auto-sync anagrafica when linked profile is updated
CREATE OR REPLACE FUNCTION sync_anagrafica_from_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE anagrafiche_native
  SET
    ragione_sociale = COALESCE(NEW.first_name, '') || ' ' || NEW.last_name,
    codice_fiscale  = NEW.fiscal_code,
    email           = NEW.email,
    telefono        = NEW.phone,
    indirizzo_via   = NEW.address,
    last_synced_at  = NOW()
  WHERE cliente_id = NEW.id
    AND sync_from_cliente = true;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_anagrafica_on_profile_update ON profiles;
CREATE TRIGGER trg_sync_anagrafica_on_profile_update
  AFTER UPDATE OF first_name, last_name, email, phone, fiscal_code, address
  ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION sync_anagrafica_from_profile();
