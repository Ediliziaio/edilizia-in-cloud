-- Tabella comunicazioni SuperAdmin → Azienda
CREATE TABLE IF NOT EXISTS superadmin_comunicazioni (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('email', 'sms', 'notifica_inapp')),
  oggetto TEXT,
  corpo TEXT NOT NULL,
  inviato_da UUID REFERENCES auth.users(id),
  inviato_da_nome TEXT,
  stato TEXT NOT NULL DEFAULT 'inviato' CHECK (stato IN ('inviato', 'consegnato', 'fallito', 'in_coda')),
  is_automatica BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE superadmin_comunicazioni ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SuperAdmin full access comunicazioni"
  ON superadmin_comunicazioni FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX idx_comunicazioni_company_id ON superadmin_comunicazioni(company_id, created_at DESC);
