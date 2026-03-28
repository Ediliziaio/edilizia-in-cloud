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
